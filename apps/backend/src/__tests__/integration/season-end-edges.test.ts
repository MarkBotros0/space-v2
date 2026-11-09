// End season's edges: a late joiner (M2), the stale cut-off (M4), the request's
// limits (M6) and the transaction's timeout (I5).
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { cleanupTestData, createTestSeason, createTestUser, login, reviewedOf } from "./fixtures";

jest.setTimeout(120000);

const app = createApp();
let superToken: string;

const post = (path: string, body: object) =>
  request(app).post(`/api/v1${path}`).set("authorization", `Bearer ${superToken}`).send(body);
const check = (seasonId: number) =>
  request(app).get(`/api/v1/seasons/${seasonId}/end-check`).set("authorization", `Bearer ${superToken}`);

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

beforeAll(async () => {
  await cleanupTestData();
  superToken = await login(app, (await createTestUser("edge-super", "SUPER")).email);
});
afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("a late joiner and the attendance blocker (M2)", () => {
  async function world(label: string) {
    const season = await createTestSeason();
    const [early, late] = await Promise.all([
      createTestUser(`edge-early-${label}`, "STUDENT"),
      createTestUser(`edge-late-${label}`, "STUDENT"),
    ]);
    await db.seasonEnrollment.createMany({
      data: [
        { seasonId: season.id, studentUserId: early.id, status: "ACTIVE", enrolledAt: daysAgo(30) },
        { seasonId: season.id, studentUserId: late.id, status: "ACTIVE", enrolledAt: daysAgo(5) },
      ],
    });
    const before = await db.session.create({
      data: { seasonId: season.id, title: "Before they joined", startsAt: daysAgo(10), durationMinutes: 60 },
    });
    const after = await db.session.create({
      data: { seasonId: season.id, title: "After they joined", startsAt: daysAgo(2), durationMinutes: 60 },
    });
    return { seasonId: season.id, early: early.id, late: late.id, before: before.id, after: after.id };
  }
  const mark = (sessionId: number, studentUserId: number) =>
    db.attendance.create({ data: { sessionId, studentUserId, status: "PRESENT" } });

  it("a session held before they joined doesn't block End", async () => {
    const w = await world("a");
    await mark(w.before, w.early);
    await mark(w.after, w.early);
    await mark(w.after, w.late);
    const res = await check(w.seasonId);
    expect(res.status).toBe(200);
    expect(res.body.data.blockers.attendance).toEqual([]);
    expect(
      (await post(`/seasons/${w.seasonId}/end`, { notPassed: [], reviewed: await reviewedOf(w.seasonId) })).status,
    ).toBe(200);
  });

  it("a session held after they joined still does", async () => {
    const w = await world("b");
    await mark(w.before, w.early);
    await mark(w.after, w.early);
    const res = await check(w.seasonId);
    expect(res.body.data.blockers.attendance).toEqual([expect.objectContaining({ sessionId: w.after, missing: 1 })]);
  });

  it("counts everyone who was there and unmarked, and leaves the percentage alone", async () => {
    const w = await world("c");
    await mark(w.after, w.late);
    const res = await check(w.seasonId);
    expect(res.body.data.blockers.attendance).toEqual([
      expect.objectContaining({ sessionId: w.before, missing: 1 }),
      expect.objectContaining({ sessionId: w.after, missing: 1 }),
    ]);
    const late = res.body.data.students.find((s: { userId: number }) => s.userId === w.late);
    // One of two sessions: the formula still divides by every session.
    expect(late.attendancePct).toBe(50);
  });
});

describe("the stale cut-off (M4)", () => {
  it("is stamped after the results, inside the transaction", async () => {
    const season = await createTestSeason();
    const student = await createTestUser("edge-stale", "STUDENT");
    await db.seasonEnrollment.create({ data: { seasonId: season.id, studentUserId: student.id, status: "ACTIVE" } });
    expect(
      (await post(`/seasons/${season.id}/end`, { notPassed: [], reviewed: await reviewedOf(season.id) })).status,
    ).toBe(200);
    const row = await db.seasonEnrollment.findUniqueOrThrow({
      where: { studentUserId_seasonId: { studentUserId: student.id, seasonId: season.id } },
    });
    const user = await db.user.findUniqueOrThrow({ where: { id: student.id }, select: { sessionsValidFrom: true } });
    expect(user.sessionsValidFrom!.getTime()).toBeGreaterThan(row.completedAt!.getTime());
  });
});

describe("the End transaction (I5)", () => {
  it("runs with a 30 second timeout", async () => {
    const season = await createTestSeason();
    const spy = jest.spyOn(db, "$transaction");
    expect(
      (await post(`/seasons/${season.id}/end`, { notPassed: [], reviewed: await reviewedOf(season.id) })).status,
    ).toBe(200);
    expect(spy.mock.calls.some((c) => (c[1] as { timeout?: number } | undefined)?.timeout === 30_000)).toBe(true);
    spy.mockRestore();
  });
});

describe("the request's limits (M6)", () => {
  async function world(label: string) {
    const season = await createTestSeason();
    const student = await createTestUser(`edge-limit-${label}`, "STUDENT");
    await db.seasonEnrollment.create({ data: { seasonId: season.id, studentUserId: student.id, status: "ACTIVE" } });
    return { seasonId: season.id, studentId: student.id };
  }

  it("End refuses a student listed twice with 400, and changes nothing", async () => {
    const w = await world("twice");
    const res = await post(`/seasons/${w.seasonId}/end`, {
      notPassed: [
        { userId: w.studentId, reason: "a" },
        { userId: w.studentId, reason: "b" },
      ],
      reviewed: await reviewedOf(w.seasonId),
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("bad_request");
    expect((await db.season.findUniqueOrThrow({ where: { id: w.seasonId } })).status).toBe("ACTIVE");
  });

  it("End refuses a reason over 1000 characters with 400", async () => {
    const w = await world("long");
    const res = await post(`/seasons/${w.seasonId}/end`, {
      notPassed: [{ userId: w.studentId, reason: "x".repeat(1001) }],
      reviewed: await reviewedOf(w.seasonId),
    });
    expect(res.status).toBe(400);
    expect((await db.season.findUniqueOrThrow({ where: { id: w.seasonId } })).status).toBe("ACTIVE");
  });

  it("a result correction refuses a reason over 1000 characters with 400", async () => {
    const w = await world("correct");
    expect(
      (await post(`/seasons/${w.seasonId}/end`, { notPassed: [], reviewed: await reviewedOf(w.seasonId) })).status,
    ).toBe(200);
    const res = await request(app)
      .patch(`/api/v1/seasons/${w.seasonId}/results/${w.studentId}`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ result: "NOT_PASSED", reason: "x".repeat(1001) });
    expect(res.status).toBe(400);
  });
});
