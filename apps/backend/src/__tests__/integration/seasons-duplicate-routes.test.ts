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
  it("clones structure: shifted dates, assignments with their parts, no people, FRESH recurrence ids", async () => {
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
    await db.group.create({
      data: {
        seasonId: source.id,
        name: "Dup Group",
        description: "G",
        leaders: { create: { userId: leader.id } },
        students: { create: { studentUserId: member.id } },
      },
      select: { id: true },
    });

    await db.session.create({
      data: {
        seasonId: source.id,
        title: "Series A",
        startsAt: new Date("2099-01-05T18:00:00.000Z"),
        durationMinutes: 60,
        recurrenceGroupId: "space-v2-test-rgrp",
      },
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
        title: "Parts",
        dueAt: new Date("2099-02-01T21:59:00.000Z"),
        reminderDays: 3,
        reminderAnchor: "DUE_DATE",
        reminderTime: "18:30",
        parts: {
          create: [
            {
              position: 0,
              kind: "VIDEO",
              title: "Watch",
              youtubeUrl: "https://youtu.be/dQw4w9WgXcQ",
              youtubeId: "dQw4w9WgXcQ",
              durationSeconds: 600,
              blockSkipping: true,
              videoQuestions: { create: { atSeconds: 30, prompt: "Who?", options: ["A", "B"], correctIndex: 1 } },
            },
            { position: 1, kind: "ESSAY", prompt: "Reflect", minWords: 50, maxWords: 300, maxFileSizeMb: 5 },
          ],
        },
      },
    });
    await db.assignment.create({
      data: { seasonId: source.id, title: "Gone", deletedAt: new Date() },
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
      select: {
        title: true,
        dueAt: true,
        reminderEnabled: true,
        reminderDays: true,
        reminderAnchor: true,
        reminderTime: true,
        parts: {
          orderBy: { position: "asc" },
          select: {
            position: true,
            kind: true,
            title: true,
            youtubeId: true,
            durationSeconds: true,
            blockSkipping: true,
            prompt: true,
            minWords: true,
            maxWords: true,
            maxFileSizeMb: true,
            videoQuestions: { select: { atSeconds: true, prompt: true, options: true, correctIndex: true } },
          },
        },
      },
    });
    // The soft-deleted one is not copied (R59); the other keeps its parts in
    // order, the video's timed questions and the reminder, with dueAt shifted 368 days.
    expect(assignments).toEqual([
      {
        title: "Parts",
        dueAt: new Date("2100-02-04T21:59:00.000Z"),
        reminderEnabled: true,
        reminderDays: 3,
        reminderAnchor: "DUE_DATE",
        reminderTime: "18:30",
        parts: [
          {
            position: 0,
            kind: "VIDEO",
            title: "Watch",
            youtubeId: "dQw4w9WgXcQ",
            durationSeconds: 600,
            blockSkipping: true,
            prompt: null,
            minWords: null,
            maxWords: null,
            maxFileSizeMb: null,
            videoQuestions: [{ atSeconds: 30, prompt: "Who?", options: ["A", "B"], correctIndex: 1 }],
          },
          {
            position: 1,
            kind: "ESSAY",
            title: null,
            youtubeId: null,
            durationSeconds: null,
            blockSkipping: false,
            prompt: "Reflect",
            minWords: 50,
            maxWords: 300,
            maxFileSizeMb: 5,
            videoQuestions: [],
          },
        ],
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

  it("resolves the copied assignments' reminders against the copied sessions and due dates", async () => {
    const source = await createTestSeason();
    await db.season.update({ where: { id: source.id }, data: { startDate: new Date("2099-01-01T00:00:00.000Z") } });
    // 18:00 Cairo on 5 Feb 2099; the copy lands 368 days later, on Mon 8 Feb 2100.
    await db.session.create({
      data: {
        seasonId: source.id,
        title: "Week 1",
        startsAt: new Date("2099-02-05T16:00:00.000Z"),
        durationMinutes: 60,
      },
    });
    await db.assignment.create({
      data: { seasonId: source.id, title: "Next session", reminderDays: 2, reminderAnchor: "NEXT_SESSION" },
    });
    await db.assignment.create({
      data: {
        seasonId: source.id,
        title: "Due date",
        dueAt: new Date("2099-02-10T21:59:00.000Z"),
        reminderDays: 1,
        reminderAnchor: "DUE_DATE",
      },
    });

    const res = await request(app)
      .post(`/api/v1/seasons/${source.id}/duplicate`)
      .set("authorization", `Bearer ${superToken}`)
      .send({
        year: 2100,
        code: testSeasonCode(),
        startDate: "2100-01-04T00:00:00.000Z",
        endDate: "2100-12-31T00:00:00.000Z",
      });
    expect(res.status).toBe(201);
    const copied = await db.assignment.findMany({
      where: { seasonId: res.body.data.id },
      orderBy: { title: "asc" },
      select: { title: true, remindAt: true },
    });
    expect(copied).toEqual([
      // Due 23:59 Cairo on 13 Feb 2100; 1 day before at 09:00 Cairo.
      { title: "Due date", remindAt: new Date("2100-02-12T07:00:00.000Z") },
      // The copied session is Mon 8 Feb 2100; 2 days before at 09:00 Cairo.
      { title: "Next session", remindAt: new Date("2100-02-06T07:00:00.000Z") },
    ]);
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
