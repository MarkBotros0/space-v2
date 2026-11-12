import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { loadScopes } from "../../lib/auth/scopes";

import { bearer, cleanupTestData, createTestSeason, createTestUser, endBodyOf, login, tokenFor } from "./fixtures";
import { createAssignmentWithParts, seedEssays } from "./assignment-reads-setup";

jest.setTimeout(60000);

const app = createApp();

type Tok = string;
let superToken: Tok;
let otherAdminToken: Tok;
let studentToken: Tok;
let adminId: number;
let otherAdminId: number;

/**
 * An access token from the user's current scopes, minted directly: the login
 * limiter would throttle a fixture that signs in once per season.
 */
const post = (path: string, t: Tok, body: unknown) =>
  request(app)
    .post(`/api/v1${path}`)
    .set(bearer(t))
    .send(body as object);
const patch = (path: string, t: Tok, body: unknown) =>
  request(app)
    .patch(`/api/v1${path}`)
    .set(bearer(t))
    .send(body as object);
const get = (path: string, t: Tok) => request(app).get(`/api/v1${path}`).set(bearer(t));

/** A season with admin, a leading group, Peter, Sara and a withdrawn student. */
async function setupSeason() {
  const season = await createTestSeason();
  const [peter, sara, wd, extra, admin, leader] = await Promise.all([
    createTestUser("peter", "STUDENT"),
    createTestUser("sara", "STUDENT"),
    createTestUser("wd", "STUDENT"),
    createTestUser("extra", "STUDENT"),
    createTestUser("sadmin", "ADMIN"),
    createTestUser("sleader", "LEADER"),
  ]);
  // Fresh staff per season: ending one stamps its people's sessions stale.
  await db.seasonAdmin.create({ data: { seasonId: season.id, userId: admin.id } });
  const group = await db.group.create({
    data: { seasonId: season.id, name: "G", leaders: { create: { userId: leader.id } } },
  });
  const enroll = (studentUserId: number, status: "ACTIVE" | "WITHDRAWN") =>
    db.seasonEnrollment.create({
      data: { seasonId: season.id, studentUserId, status, groupId: group.id },
    });
  await enroll(peter.id, "ACTIVE");
  await enroll(sara.id, "ACTIVE");
  await enroll(wd.id, "WITHDRAWN");
  const adminToken = await tokenFor(admin.id);
  const leaderToken = await tokenFor(leader.id);
  return {
    season,
    adminToken,
    leaderToken,
    adminId: admin.id,
    leaderId: leader.id,
    peter: peter.id,
    sara: sara.id,
    wd: wd.id,
    extra: extra.id,
  };
}

const enrolment = (seasonId: number, studentUserId: number) =>
  db.seasonEnrollment.findUniqueOrThrow({
    where: { studentUserId_seasonId: { studentUserId, seasonId } },
  });
const statusOf = async (id: number) => (await db.season.findUniqueOrThrow({ where: { id } })).status;

beforeAll(async () => {
  await cleanupTestData();
  const sup = await createTestUser("super", "SUPER");
  const admin = await createTestUser("admin", "ADMIN");
  const other = await createTestUser("otheradmin", "ADMIN");
  const student = await createTestUser("student", "STUDENT");
  adminId = admin.id;
  otherAdminId = other.id;
  await db.seasonAdmin.create({ data: { seasonId: (await createTestSeason()).id, userId: other.id } });
  superToken = await login(app, sup.email);
  otherAdminToken = await login(app, other.email);
  studentToken = await login(app, student.email);
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("POST /seasons/:id/end", () => {
  it("ends a season in one step", async () => {
    const { season, peter, sara, wd, adminToken, adminId, leaderId } = await setupSeason();
    const res = await post(
      `/seasons/${season.id}/end`,
      adminToken,
      await endBodyOf(season.id, [{ userId: sara, reason: "Attendance" }]),
    );
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      season: { id: season.id, code: season.code, status: "COMPLETED" },
      graduated: 0,
    });
    expect(await statusOf(season.id)).toBe("COMPLETED");

    const p = await enrolment(season.id, peter);
    // Nothing to count in this season: no score, so nothing is against it; who ended it is kept.
    expect(p).toMatchObject({
      status: "COMPLETED",
      result: "PASSED",
      resultReason: null,
      passScore: null,
      resultAgainstScore: false,
      resultSetById: adminId,
    });
    expect(p.resultSetAt).not.toBeNull();
    expect(p.completedAt).not.toBeNull();
    expect(await enrolment(season.id, sara)).toMatchObject({
      status: "COMPLETED",
      result: "NOT_PASSED",
      resultReason: "Attendance",
    });
    expect(await enrolment(season.id, wd)).toMatchObject({
      status: "WITHDRAWN",
      result: null,
      resultSetAt: null,
    });

    for (const id of [peter, sara, adminId, leaderId]) {
      const u = await db.user.findUniqueOrThrow({ where: { id }, select: { sessionsValidFrom: true } });
      expect(u.sessionsValidFrom).not.toBeNull();
    }
    expect((await loadScopes(peter)).activeSeasonId).toBeNull();
    expect((await loadScopes(adminId)).seasonAdminIds).not.toContain(season.id);
    expect((await loadScopes(leaderId)).groupLeaderIds).toEqual([]);
  });

  it("lets super end any season", async () => {
    const { season } = await setupSeason();
    expect((await post(`/seasons/${season.id}/end`, superToken, await endBodyOf(season.id))).status).toBe(200);
  });

  it("refuses a leader, a student and another season's admin with 403", async () => {
    const { season, leaderToken } = await setupSeason();
    for (const t of [leaderToken, studentToken, otherAdminToken]) {
      expect((await post(`/seasons/${season.id}/end`, t, await endBodyOf(season.id))).status).toBe(403);
    }
    expect(await statusOf(season.id)).toBe("ACTIVE");
  });

  it("is 409 season_not_active unless the season is ACTIVE", async () => {
    for (const status of ["DRAFT", "COMPLETED"] as const) {
      const s = await createTestSeason({ status });
      const res = await post(`/seasons/${s.id}/end`, superToken, await endBodyOf(s.id));
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("season_not_active");
    }
  });

  it("is 400 on a malformed body and 404 on a missing season", async () => {
    const { season } = await setupSeason();
    expect((await post(`/seasons/${season.id}/end`, superToken, {})).status).toBe(400);
    expect((await post(`/seasons/${season.id}/end`, superToken, { notPassed: [] })).status).toBe(400);
    expect(
      (await post(`/seasons/${season.id}/end`, superToken, { ...(await endBodyOf(season.id)), x: 1 })).status,
    ).toBe(400);
    expect(
      (
        await post(`/seasons/2147483000/end`, superToken, {
          notPassed: [],
          weights: { attendance: 40, assignments: 30, quizzes: 30 },
          passMark: 60,
          reviewed: { graduatesOnPass: false, userIds: [], scores: [] },
        })
      ).status,
    ).toBe(404);
  });

  it("is 409 season_unfinished while work blocks, and changes nothing", async () => {
    const { season, peter, sara, adminToken } = await setupSeason();
    const assignment = await createAssignmentWithParts({ seasonId: season.id, title: "Essay" });
    // An essay handed in and waiting review.
    await seedEssays([
      { assignmentId: assignment.id, studentUserId: peter, status: "SUBMITTED", publicId: `endrt-${season.id}` },
    ]);
    const res = await post(
      `/seasons/${season.id}/end`,
      adminToken,
      await endBodyOf(season.id, [{ userId: sara, reason: null }]),
    );
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("season_unfinished");
    expect(await statusOf(season.id)).toBe("ACTIVE");
    expect(await enrolment(season.id, peter)).toMatchObject({ status: "ACTIVE", result: null });
    expect(await enrolment(season.id, sara)).toMatchObject({ status: "ACTIVE", result: null });
    const stamp = await db.user.findUniqueOrThrow({ where: { id: peter }, select: { sessionsValidFrom: true } });
    expect(stamp.sessionsValidFrom).toBeNull();
  });

  it("is 400 when notPassed names someone without an ACTIVE enrolment, and changes nothing", async () => {
    const { season, peter, sara, wd, extra, adminToken } = await setupSeason();
    for (const bad of [wd, extra]) {
      const res = await post(
        `/seasons/${season.id}/end`,
        adminToken,
        await endBodyOf(season.id, [
          { userId: sara, reason: null },
          { userId: bad, reason: null },
        ]),
      );
      expect(res.status).toBe(400);
    }
    expect(await statusOf(season.id)).toBe("ACTIVE");
    expect(await enrolment(season.id, peter)).toMatchObject({ status: "ACTIVE", result: null });
    expect(await enrolment(season.id, sara)).toMatchObject({ status: "ACTIVE", result: null });
  });

  it("a soft-deleted ACTIVE student does not block ending; their enrolment completes with no result", async () => {
    const { season, peter, extra, adminToken } = await setupSeason();
    await db.seasonEnrollment.create({ data: { seasonId: season.id, studentUserId: extra, status: "ACTIVE" } });
    await db.user.update({ where: { id: extra }, data: { deletedAt: new Date() } });
    const res = await post(`/seasons/${season.id}/end`, adminToken, await endBodyOf(season.id, []));
    expect(res.status).toBe(200);
    const gone = await enrolment(season.id, extra);
    expect(gone).toMatchObject({ status: "COMPLETED", result: null, resultSetAt: null });
    expect(gone.completedAt).not.toBeNull();
    expect(await enrolment(season.id, peter)).toMatchObject({ result: "PASSED" });
    expect(await db.seasonEnrollment.count({ where: { seasonId: season.id, status: "ACTIVE" } })).toBe(0);
  });

  it("notPassed naming a soft-deleted student stays 400", async () => {
    const { season, extra, adminToken } = await setupSeason();
    await db.seasonEnrollment.create({ data: { seasonId: season.id, studentUserId: extra, status: "ACTIVE" } });
    await db.user.update({ where: { id: extra }, data: { deletedAt: new Date() } });
    const res = await post(
      `/seasons/${season.id}/end`,
      adminToken,
      await endBodyOf(season.id, [{ userId: extra, reason: null }]),
    );
    expect(res.status).toBe(400);
    expect(await statusOf(season.id)).toBe("ACTIVE");
  });

  it("two concurrent ends: exactly one 200, the other 409, first result kept", async () => {
    const { season, sara, peter, adminToken } = await setupSeason();
    const [a, b] = await Promise.all([
      post(`/seasons/${season.id}/end`, adminToken, await endBodyOf(season.id, [{ userId: sara, reason: "First" }])),
      post(`/seasons/${season.id}/end`, superToken, await endBodyOf(season.id)),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);
    const loser = a.status === 409 ? a : b;
    expect(loser.body.error.code).toBe("season_not_active");
    const winnerSentSara = a.status === 200;
    const s = await enrolment(season.id, sara);
    expect(s.status).toBe("COMPLETED");
    if (winnerSentSara) {
      expect(s).toMatchObject({ result: "NOT_PASSED", resultReason: "First" });
    } else {
      expect(s).toMatchObject({ result: "PASSED", resultReason: null });
    }
    expect(await enrolment(season.id, peter)).toMatchObject({ result: "PASSED" });
  });
});

describe("season results", () => {
  async function ended() {
    const ctx = await setupSeason();
    const res = await post(
      `/seasons/${ctx.season.id}/end`,
      superToken,
      await endBodyOf(ctx.season.id, [{ userId: ctx.sara, reason: "Attendance" }]),
    );
    expect(res.status).toBe(200);
    return ctx;
  }

  it("GET lists each finished student's result, for a super or the season's admin", async () => {
    const { season, peter, sara, wd, adminId, leaderId } = await ended();
    // Ending stamped the staff's sessions stale: sign in again (they now hold no grant).
    const adminToken = await tokenFor(adminId);
    const leaderToken = await tokenFor(leaderId);
    const res = await get(`/seasons/${season.id}/results`, superToken);
    expect(res.status).toBe(200);
    const rows: { userId: number; result: string | null; reason: string | null; groupName: string | null }[] =
      res.body.data.results;
    expect(rows.map((r) => r.userId).sort()).toEqual([peter, sara].sort());
    expect(rows.find((r) => r.userId === sara)).toMatchObject({
      result: "NOT_PASSED",
      reason: "Attendance",
      groupName: "G",
    });
    expect(rows.find((r) => r.userId === peter)).toMatchObject({ result: "PASSED", reason: null });
    expect(rows.map((r) => r.userId)).not.toContain(wd);
    // Owner: "everything can be overridden by an admin or a super". The admin's row outlives End.
    expect((await get(`/seasons/${season.id}/results`, adminToken)).status).toBe(200);
    for (const t of [leaderToken, studentToken, otherAdminToken]) {
      expect((await get(`/seasons/${season.id}/results`, t)).status).toBe(403);
    }
  });

  it("PATCH changes NOT_PASSED to PASSED and clears the reason", async () => {
    const { season, sara } = await ended();
    const res = await patch(`/seasons/${season.id}/results/${sara}`, superToken, {
      result: "PASSED",
      reason: "ignored",
    });
    expect(res.status).toBe(200);
    expect(await enrolment(season.id, sara)).toMatchObject({ result: "PASSED", resultReason: null });
    const back = await patch(`/seasons/${season.id}/results/${sara}`, superToken, {
      result: "NOT_PASSED",
      reason: "Late",
    });
    expect(back.status).toBe(200);
    expect(await enrolment(season.id, sara)).toMatchObject({ result: "NOT_PASSED", resultReason: "Late" });
  });

  it("PATCH is 403 for another season's admin, 409 not_finished on an active season, 409 no_result on a withdrawn enrolment", async () => {
    const { season, sara, wd, adminId } = await ended();
    const adminToken = await tokenFor(adminId);
    expect(
      (await patch(`/seasons/${season.id}/results/${sara}`, otherAdminToken, { result: "PASSED", reason: null }))
        .status,
    ).toBe(403);
    expect(
      (await patch(`/seasons/${season.id}/results/${sara}`, adminToken, { result: "PASSED", reason: null })).status,
    ).toBe(200);
    const wdRes = await patch(`/seasons/${season.id}/results/${wd}`, superToken, { result: "PASSED", reason: null });
    expect(wdRes.status).toBe(409);
    expect(wdRes.body.error.code).toBe("no_result");

    const live = await setupSeason();
    const act = await patch(`/seasons/${live.season.id}/results/${live.sara}`, superToken, {
      result: "PASSED",
      reason: null,
    });
    expect(act.status).toBe(409);
    expect(act.body.error.code).toBe("not_finished");
    expect(
      (await patch(`/seasons/${season.id}/results/${sara}`, superToken, { result: "MAYBE", reason: null })).status,
    ).toBe(400);
  });
});

describe("GET /seasons/overdue", () => {
  it("lists ACTIVE seasons past their end date by role", async () => {
    const mine = await createTestSeason();
    const notMine = await createTestSeason();
    const future = await createTestSeason();
    const draft = await createTestSeason({ status: "DRAFT" });
    const past = new Date(Date.now() - 86_400_000);
    await db.season.updateMany({
      where: { id: { in: [mine.id, notMine.id, draft.id] } },
      data: { startDate: new Date(past.getTime() - 30 * 86_400_000), endDate: past },
    });
    await db.seasonAdmin.create({ data: { seasonId: mine.id, userId: adminId } });
    await db.seasonAdmin.create({ data: { seasonId: draft.id, userId: adminId } });
    await db.seasonAdmin.create({ data: { seasonId: future.id, userId: adminId } });
    await db.seasonAdmin.create({ data: { seasonId: notMine.id, userId: otherAdminId } });
    // Scopes are claims: re-login so the admin token carries the new grants.
    const fresh = await tokenFor(adminId);

    const leaderToken = await tokenFor((await createTestUser("ovleader", "LEADER")).id);
    const ids = async (t: Tok) =>
      ((await get("/seasons/overdue", t)).body.data.seasons as { id: number }[]).map((s) => s.id);
    const all = await ids(superToken);
    expect(all).toEqual(expect.arrayContaining([mine.id, notMine.id]));
    expect(all).not.toContain(future.id);
    expect(all).not.toContain(draft.id);
    const adminList = await ids(fresh);
    expect(adminList).toContain(mine.id);
    expect(adminList).not.toContain(notMine.id);
    expect(adminList).not.toContain(draft.id);
    expect(adminList).not.toContain(future.id);
    expect(await ids(leaderToken)).toEqual([]);
    expect(await ids(studentToken)).toEqual([]);
    const row = (await get("/seasons/overdue", superToken)).body.data.seasons.find(
      (s: { id: number }) => s.id === mine.id,
    );
    expect(row).toEqual({ id: mine.id, code: mine.code, title: "Test Season", endDate: past.toISOString() });
  });
});
