import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { cleanupTestData, createTestSeason, createTestUser, testSeasonCode } from "./fixtures";
import { seedSeasonFixtures } from "./seasons-setup";

// 60s, not the Jest default: the shared Neon staging database autosuspends, so
// the first query after idle costs ~18s and this suite's beforeAll performs
// several sequential writes.
jest.setTimeout(60000);

const app = createApp();

let seasonId: number;
let superToken: string;
let adminToken: string;

beforeAll(async () => {
  ({ seasonId, superToken, adminToken } = await seedSeasonFixtures(app));
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("POST /api/v1/seasons/:id/duplicate", () => {
  it("clones structure faithfully to v1: shifted dates, remapped ids, no people, FRESH recurrence ids", async () => {
    const source = await createTestSeason();
    // Explicit start so the offset is visible: 2099-01-01 → 2100-01-04 is
    // 365 + 3 = 368 days.
    await db.season.update({
      where: { id: source.id },
      data: {
        startDate: new Date("2099-01-01T00:00:00.000Z"),
        absenceBudgetMinutes: 240,
        description: "Source description",
      },
    });

    const leader = await createTestUser("dupleader", "LEADER");
    const member = await createTestUser("dupstudent", "STUDENT");
    const group = await db.group.create({
      data: {
        seasonId: source.id,
        name: "Dup Group",
        description: "G",
        leaders: { create: { userId: leader.id } },
        students: { create: { studentUserId: member.id } },
      },
      select: { id: true },
    });

    const s1 = await db.session.create({
      data: {
        seasonId: source.id,
        title: "Series A",
        startsAt: new Date("2099-01-05T18:00:00.000Z"),
        durationMinutes: 60,
        recurrenceGroupId: "space-v2-test-rgrp",
      },
      select: { id: true },
    });
    await db.session.create({
      data: {
        seasonId: source.id,
        title: "Series A",
        startsAt: new Date("2099-01-12T18:00:00.000Z"),
        durationMinutes: 60,
        recurrenceGroupId: "space-v2-test-rgrp",
      },
    });

    await db.assignment.create({
      data: {
        seasonId: source.id,
        sessionId: s1.id,
        title: "Linked",
        isAllGroups: false,
        dueAt: new Date("2099-02-01T21:59:00.000Z"),
        targets: { create: { groupId: group.id } },
      },
    });
    await db.assignment.create({
      data: { seasonId: source.id, title: "Gone", isAllGroups: true, deletedAt: new Date() },
    });

    const code = testSeasonCode();
    const res = await request(app)
      .post(`/api/v1/seasons/${source.id}/duplicate`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ year: 2100, code, startDate: "2100-01-04T00:00:00.000Z", endDate: "2100-12-31T00:00:00.000Z" });

    expect(res.status).toBe(201);
    expect(res.body.data.code).toBe(code);
    const newId: number = res.body.data.id;

    const cloned = await db.session.findMany({
      where: { seasonId: newId },
      select: { id: true, startsAt: true, recurrenceGroupId: true },
      orderBy: { startsAt: "asc" },
    });
    expect(cloned.map((s) => s.startsAt.toISOString())).toEqual([
      "2100-01-08T18:00:00.000Z",
      "2100-01-15T18:00:00.000Z",
    ]);
    // Fresh series id: shared by the clones, different from the source's —
    // v1 copied it verbatim, which is how a series edit in one season
    // rewrote another's sessions (C10).
    expect(cloned[0]?.recurrenceGroupId).toBe(cloned[1]?.recurrenceGroupId);
    expect(cloned[0]?.recurrenceGroupId).not.toBe("space-v2-test-rgrp");
    expect(cloned[0]?.recurrenceGroupId).not.toBeNull();

    const groups = await db.group.findMany({
      where: { seasonId: newId },
      select: { id: true, name: true, description: true, _count: { select: { leaders: true, students: true } } },
    });
    // R61: no leaders, no students.
    expect(groups).toEqual([
      { id: expect.any(Number), name: "Dup Group", description: "G", _count: { leaders: 0, students: 0 } },
    ]);

    const assignments = await db.assignment.findMany({
      where: { seasonId: newId },
      select: { title: true, sessionId: true, dueAt: true, targets: { select: { groupId: true } } },
    });
    // The soft-deleted one is not copied (R59); the linked one points at the
    // CLONED session and the CLONED group, with dueAt shifted 368 days.
    expect(assignments).toEqual([
      {
        title: "Linked",
        sessionId: cloned[0]?.id,
        dueAt: new Date("2100-02-04T21:59:00.000Z"),
        targets: [{ groupId: groups[0]?.id }],
      },
    ]);

    const season = await db.season.findUnique({
      where: { id: newId },
      select: { status: true, title: true, absenceBudgetMinutes: true, description: true },
    });
    expect(season).toEqual({
      status: "DRAFT",
      title: "TEST 2100",
      absenceBudgetMinutes: 240,
      description: "Source description",
    });
  });

  it("defaults the code to slugify('<source.program> <year>') (v1 R64)", async () => {
    // A prefixed program keeps the derived code inside cleanupTestData's
    // prefix discovery; a plain "TEST" program would derive "test-2100" and
    // leak a row into the shared DB.
    const source = await createTestSeason();
    const program = testSeasonCode(); // 26 chars, prefixed
    await db.season.update({ where: { id: source.id }, data: { program } });

    const res = await request(app)
      .post(`/api/v1/seasons/${source.id}/duplicate`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ year: 2100, startDate: "2100-01-01T00:00:00.000Z", endDate: "2100-12-31T00:00:00.000Z" });

    expect(res.status).toBe(201);
    expect(res.body.data.code).toBe(`${program}-2100`);
  });

  it("refuses a code already in use with 409 code_taken", async () => {
    const source = await createTestSeason();
    const res = await request(app)
      .post(`/api/v1/seasons/${source.id}/duplicate`)
      .set("authorization", `Bearer ${superToken}`)
      .send({
        year: 2100,
        code: source.code,
        startDate: "2100-01-01T00:00:00.000Z",
        endDate: "2100-12-31T00:00:00.000Z",
      });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("code_taken");
  });

  it("refuses to duplicate a soft-deleted season (spec 02 D6)", async () => {
    const source = await createTestSeason();
    await db.season.update({ where: { id: source.id }, data: { deletedAt: new Date() } });
    const res = await request(app)
      .post(`/api/v1/seasons/${source.id}/duplicate`)
      .set("authorization", `Bearer ${superToken}`)
      .send({
        year: 2100,
        code: testSeasonCode(),
        startDate: "2100-01-01T00:00:00.000Z",
        endDate: "2100-12-31T00:00:00.000Z",
      });
    expect(res.status).toBe(404);
  });

  it("is SUPER-only", async () => {
    const res = await request(app)
      .post(`/api/v1/seasons/${seasonId}/duplicate`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({
        year: 2100,
        code: testSeasonCode(),
        startDate: "2100-01-01T00:00:00.000Z",
        endDate: "2100-12-31T00:00:00.000Z",
      });
    expect(res.status).toBe(403);
  });
});
