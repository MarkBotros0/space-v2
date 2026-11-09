// Community model, Build 2, Task 4: required program, standing, and
// GET /seasons/:id/people-candidates. The pure rules are in shared/standing.test.ts.
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { bearer, cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

jest.setTimeout(120000);

const app = createApp();
let superToken: string;
let n = 0;

type Status = "DRAFT" | "ACTIVE" | "COMPLETED" | "ARCHIVED";

const person = async (name: string, graduationYear: number | null = null) => {
  const user = await createTestUser(`pc-${++n}`, "STUDENT");
  await db.user.update({ where: { id: user.id }, data: { name, graduationYear } });
  return user;
};
const season = async (status: Status, program: string, year: number, requiredProgram: string | null = null) => {
  const row = await createTestSeason({ status });
  await db.season.update({
    where: { id: row.id },
    data: {
      title: `${program} ${year}`,
      program,
      year,
      requiredProgram,
      startDate: new Date(Date.UTC(year, 0, 1)),
      endDate: new Date(Date.UTC(year, 5, 1)),
    },
  });
  return row.id;
};
const finished = (
  seasonId: number,
  studentUserId: number,
  result: "PASSED" | "NOT_PASSED" | null,
  status: "COMPLETED" | "WITHDRAWN" = "COMPLETED",
  enrolledAt = new Date(Date.UTC(2026, 0, 1)),
) =>
  db.seasonEnrollment.create({
    data: { seasonId, studentUserId, status, result, enrolledAt, completedAt: new Date(Date.UTC(2026, 5, 1)) },
  });
const candidates = (seasonId: number, token = superToken) =>
  request(app).get(`/api/v1/seasons/${seasonId}/people-candidates`).set(bearer(token));
type Row = {
  id: number;
  name: string;
  pool: string;
  availability: string;
  reason: string | null;
  selectable: boolean;
  overridable: boolean;
  last: { seasonTitle: string; outcome: string; attendancePct: number | null } | null;
};
const rowOf = (res: request.Response, id: number) => (res.body.data.people as Row[]).find((p) => p.id === id)!;

beforeAll(async () => {
  await cleanupTestData();
  superToken = await login(app, (await createTestUser("pc-super", "SUPER")).email);
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("GET /seasons/:id/people-candidates", () => {
  it("sorts available, then already passed, then the rest, by name, and fills the contract", async () => {
    const gbv26 = await season("COMPLETED", "GBV", 2026);
    const lead26 = await season("COMPLETED", "LEAD", 2026);
    const target = await season("DRAFT", "LEAD", 2027, "GBV");

    const zed = await person("Zed Passed");
    const amy = await person("Amy Passed");
    const bob = await person("Bob Failed");
    const cat = await person("Cat Never");
    const dan = await person("Dan Passed Lead");
    const alum = await person("Alum Grad", 2020);
    for (const p of [zed, amy, dan]) await finished(gbv26, p.id, "PASSED");
    await finished(lead26, dan.id, "PASSED");
    await finished(gbv26, bob.id, "NOT_PASSED");

    const res = await candidates(target);
    expect(res.status).toBe(200);
    expect(res.body.data.season).toMatchObject({
      id: target,
      title: "LEAD 2027",
      requiredProgram: "GBV",
      isCommunityWide: false,
    });
    const mine = (res.body.data.people as Row[]).filter((p) =>
      [zed, amy, bob, cat, dan, alum].some((x) => x.id === p.id),
    );
    expect(mine.map((p) => p.name)).toEqual(["Amy Passed", "Zed Passed", "Dan Passed Lead", "Bob Failed", "Cat Never"]);

    expect(rowOf(res, amy.id)).toMatchObject({
      availability: "available",
      reason: null,
      selectable: true,
      overridable: false,
      last: { seasonTitle: "GBV 2026", outcome: "PASSED" },
    });
    expect(rowOf(res, dan.id)).toMatchObject({
      availability: "already_passed",
      reason: "Already passed LEAD 2026",
      selectable: true,
      overridable: false,
    });
    expect(rowOf(res, bob.id)).toMatchObject({
      availability: "did_not_pass",
      reason: "Did not pass GBV 2026",
      selectable: false,
      overridable: true,
      last: { outcome: "NOT_PASSED" },
    });
    expect(rowOf(res, cat.id)).toMatchObject({
      availability: "never_finished",
      reason: "Hasn't finished GBV yet",
      selectable: false,
      overridable: true,
      last: null,
    });
    expect(rowOf(res, alum.id)).toBeUndefined();
  });

  it("gives a season admin the same fields on their own season, overridable too, and 403 on another", async () => {
    const gbv26 = await season("COMPLETED", "GBV", 2026);
    const mine = await season("DRAFT", "LEAD", 2027, "GBV");
    const other = await season("DRAFT", "LEAD", 2028);
    const failed = await person("Fail Admin Test");
    await finished(gbv26, failed.id, "NOT_PASSED");
    const admin = await createTestUser("pc-admin", "ADMIN");
    await db.seasonAdmin.create({ data: { seasonId: mine, userId: admin.id } });
    const token = await login(app, admin.email);

    const asAdmin = await candidates(mine, token);
    const asSuper = await candidates(mine);
    expect(asAdmin.status).toBe(200);
    expect(rowOf(asAdmin, failed.id)).toEqual(rowOf(asSuper, failed.id));
    expect(rowOf(asSuper, failed.id).overridable).toBe(true);
    expect(rowOf(asAdmin, failed.id).selectable).toBe(false);
    expect((await candidates(other, token)).status).toBe(403);
  });

  it("marks someone dropped from this season in_season with the bring-back reason", async () => {
    const target = await season("ACTIVE", "GBV", 2027);
    const dropped = await person("Dropped Here");
    const inside = await person("Inside Here");
    await db.seasonEnrollment.create({ data: { seasonId: target, studentUserId: dropped.id, status: "WITHDRAWN" } });
    await db.seasonEnrollment.create({ data: { seasonId: target, studentUserId: inside.id, status: "ACTIVE" } });

    const res = await candidates(target);
    expect(rowOf(res, dropped.id)).toMatchObject({
      availability: "in_season",
      reason: "Dropped - only a super admin can bring them back",
      selectable: false,
      overridable: false,
    });
    expect(rowOf(res, inside.id)).toMatchObject({
      availability: "in_season",
      reason: "Already in this season",
      selectable: false,
    });
  });

  it("shows the last result but blocks nobody when no program is required", async () => {
    const gbv26 = await season("COMPLETED", "GBV", 2026);
    const target = await season("DRAFT", "GBV", 2027);
    const failed = await person("Retaker");
    const dropper = await person("Dropper");
    const fresh = await person("Fresh One");
    await finished(gbv26, failed.id, "NOT_PASSED");
    await finished(gbv26, dropper.id, null, "WITHDRAWN");

    const res = await candidates(target);
    expect(rowOf(res, failed.id)).toMatchObject({
      availability: "available",
      selectable: true,
      overridable: false,
      last: { seasonTitle: "GBV 2026", outcome: "NOT_PASSED" },
    });
    expect(rowOf(res, dropper.id)).toMatchObject({ availability: "available", last: { outcome: "DROPPED" } });
    expect(rowOf(res, fresh.id)).toMatchObject({ availability: "available", last: null });
  });

  it("labels an active role with its reason, selectable only on a draft", async () => {
    const live = await season("ACTIVE", "GBV", 2026);
    const draft = await season("DRAFT", "LEAD", 2027);
    const active = await season("ACTIVE", "LEAD", 2027);
    const busy = await person("Mina Busy");
    await db.seasonEnrollment.create({ data: { seasonId: live, studentUserId: busy.id, status: "ACTIVE" } });

    const onDraft = rowOf(await candidates(draft), busy.id);
    expect(onDraft).toMatchObject({
      availability: "in_role",
      reason: "Mina Busy is already a student in GBV 2026",
      selectable: true,
    });
    expect(rowOf(await candidates(active), busy.id)).toMatchObject({ availability: "in_role", selectable: false });
  });

  it("blocks an in-role person who is also blocked: unselectable on a draft, reason block first", async () => {
    const gbv = await season("ACTIVE", "GBV", 2026);
    const target = await season("DRAFT", "LEAD", 2027, "GBV");
    const mina = await person("Mina Both");
    await db.seasonEnrollment.create({ data: { seasonId: gbv, studentUserId: mina.id, status: "ACTIVE" } });
    const admin = await createTestUser("pc-admin3", "ADMIN");
    await db.seasonAdmin.create({ data: { seasonId: target, userId: admin.id } });

    const asSuper = rowOf(await candidates(target), mina.id);
    expect(asSuper).toMatchObject({
      availability: "never_finished",
      reason: "Hasn't finished GBV yet. Mina Both is already a student in GBV 2026",
      selectable: false,
      overridable: true,
    });
    const asAdmin = rowOf(await candidates(target, await login(app, admin.email)), mina.id);
    expect(asAdmin).toMatchObject({ availability: "never_finished", selectable: false, overridable: true });
  });

  it("keeps a blocked person unselectable while no override is on record", async () => {
    // An override lives on the person's enrolment row in this season (Task 5 writes it).
    const gbv26 = await season("COMPLETED", "GBV", 2026);
    const target = await season("DRAFT", "LEAD", 2027, "GBV");
    const failed = await person("Overridden");
    await finished(gbv26, failed.id, "NOT_PASSED");
    expect(rowOf(await candidates(target), failed.id).selectable).toBe(false);
  });

  it("works out attendance from the person's own enrolment date, in a handful of queries", async () => {
    const gbv26 = await season("COMPLETED", "GBV", 2026);
    const target = await season("DRAFT", "LEAD", 2027);
    const early = await person("Early Joiner");
    const late = await person("Late Joiner");
    const sessions = [];
    for (let i = 0; i < 4; i++) {
      sessions.push(
        await db.session.create({
          data: { seasonId: gbv26, title: `S${i}`, startsAt: new Date(Date.UTC(2026, 1, 1 + i)) },
        }),
      );
    }
    await finished(gbv26, early.id, "PASSED");
    await finished(gbv26, late.id, "PASSED", "COMPLETED", new Date(Date.UTC(2026, 1, 3))); // from S2 on: 2 sessions
    for (const s of sessions.slice(0, 3)) {
      await db.attendance.create({ data: { sessionId: s.id, studentUserId: early.id, status: "PRESENT" } });
    }
    await db.attendance.create({ data: { sessionId: sessions[3]!.id, studentUserId: early.id, status: "ABSENT" } });
    await db.attendance.create({ data: { sessionId: sessions[2]!.id, studentUserId: late.id, status: "LATE" } });
    await db.attendance.create({ data: { sessionId: sessions[0]!.id, studentUserId: late.id, status: "PRESENT" } });

    const sessionSpy = jest.spyOn(db.session, "findMany");
    const attendanceSpy = jest.spyOn(db.attendance, "findMany");
    const res = await candidates(target);
    const calls = sessionSpy.mock.calls.length + attendanceSpy.mock.calls.length;
    sessionSpy.mockRestore();
    attendanceSpy.mockRestore();

    expect(rowOf(res, early.id).last?.attendancePct).toBe(75);
    expect(rowOf(res, late.id).last?.attendancePct).toBe(50);
    expect(res.body.data.people.length).toBeGreaterThan(2);
    expect(calls).toBeLessThanOrEqual(3);
  });
});
