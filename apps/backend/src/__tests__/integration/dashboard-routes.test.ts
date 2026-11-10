// apps/backend/src/__tests__/integration/dashboard-routes.test.ts
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { orgDayKey } from "../../lib/org-time";
import { staffSeasonDashboardSchema } from "../../../../../packages/shared/src/index";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";
import { createAssignmentWithParts, seedEssays } from "./assignment-reads-setup";

// The shared Neon staging Postgres autosuspends; the first query after idle has
// been measured around 18s.
jest.setTimeout(60000);

const app = createApp();
const at = (iso: string) => new Date(iso);

let seasonId: number;
let otherSeasonId: number;
let groupAId: number;
let s1: number;
let s2: number;
let s3: number;
let liveSessionId: number;
let aAId: number;
let m1: number;
let m2: number;
let graduatedId: number;
const tokens: Record<string, string> = {};

function get(path: string, token?: string) {
  const req = request(app).get(path);
  return token ? req.set("authorization", `Bearer ${token}`) : req;
}

beforeAll(async () => {
  await cleanupTestData();

  // ---- Season S and its neighbours -----------------------------------------
  seasonId = (await createTestSeason()).id;
  otherSeasonId = (await createTestSeason()).id;
  groupAId = (await db.group.create({ data: { seasonId, name: "Group A" }, select: { id: true } })).id;
  const groupBId = (await db.group.create({ data: { seasonId, name: "Group B" }, select: { id: true } })).id;
  const otherGroupId = (
    await db.group.create({ data: { seasonId: otherSeasonId, name: "Other group" }, select: { id: true } })
  ).id;

  // Created in this order so s1.id < s3.id (the tie-break assertion relies on it).
  s1 = (await createTestUser("dash-s1", "STUDENT")).id;
  s2 = (await createTestUser("dash-s2", "STUDENT")).id;
  s3 = (await createTestUser("dash-s3", "STUDENT")).id;
  const sW = (await createTestUser("dash-withdrawn", "STUDENT")).id;
  const studentNone = await createTestUser("dash-none", "STUDENT");
  const student = await db.user.findUniqueOrThrow({ where: { id: s1 }, select: { email: true } });
  const admin = await createTestUser("dash-admin", "ADMIN");
  const adminOther = await createTestUser("dash-admin-other", "ADMIN");
  const leader = await createTestUser("dash-leader", "LEADER");
  const leaderNone = await createTestUser("dash-leader-none", "LEADER");
  const superUser = await createTestUser("dash-super", "SUPER");
  const mentor = await createTestUser("dash-mentor", "MENTOR");
  const alumnus = await createTestUser("dash-alumnus", "STUDENT");
  await db.user.update({ where: { id: alumnus.id }, data: { graduationYear: 2020 } });

  // Claims are read at login, so every grant exists before the logins below.
  await db.seasonAdmin.create({ data: { seasonId, userId: admin.id } });
  await db.seasonAdmin.create({ data: { seasonId: otherSeasonId, userId: adminOther.id } });
  await db.groupLeader.create({ data: { groupId: groupAId, userId: leader.id } });
  await db.groupLeader.create({ data: { groupId: otherGroupId, userId: leaderNone.id } });
  await db.studentProfile.create({ data: { userId: s1 } });
  await db.studentProfile.create({ data: { userId: s3 } });

  const enrolledAt = at("2019-12-01T00:00:00.000Z");
  await db.seasonEnrollment.createMany({
    data: [
      { seasonId, studentUserId: s1, groupId: groupAId, status: "ACTIVE", enrolledAt },
      { seasonId, studentUserId: s2, groupId: groupAId, status: "ACTIVE", enrolledAt },
      { seasonId, studentUserId: s3, groupId: groupBId, status: "ACTIVE", enrolledAt },
      {
        seasonId,
        studentUserId: sW,
        groupId: groupAId,
        status: "WITHDRAWN",
        enrolledAt,
        droppedAt: at("2020-01-02T00:00:00.000Z"),
      },
    ],
  });

  const session = (title: string, startsAt: Date, youtubeUrl: string | null = null) =>
    db.session.create({ data: { seasonId, title, startsAt, durationMinutes: 90, youtubeUrl }, select: { id: true } });
  const p1 = (await session("Past one", at("2020-01-01T16:00:00.000Z"))).id;
  const p2 = (await session("Past two", at("2020-01-08T16:00:00.000Z"))).id;
  liveSessionId = (await session("Live now", new Date(Date.now() - 10 * 60_000), "https://youtu.be/live")).id;
  await session("Far future", at("2099-01-01T16:00:00.000Z"));

  await db.attendance.createMany({
    data: [
      { sessionId: p1, studentUserId: s1, status: "PRESENT" },
      { sessionId: p1, studentUserId: s2, status: "PRESENT" },
      { sessionId: p1, studentUserId: s3, status: "ABSENT" },
      { sessionId: p1, studentUserId: sW, status: "PRESENT" },
      { sessionId: p2, studentUserId: s1, status: "LATE", lateMinutes: 5 },
      { sessionId: p2, studentUserId: s2, status: "ABSENT" },
      { sessionId: p2, studentUserId: s3, status: "ABSENT" },
    ],
  });

  // An assignment is for the whole season: every student has all three.
  const aAll = await createAssignmentWithParts({
    seasonId,
    title: "For everyone",
    dueAt: at("2020-01-10T10:00:00.000Z"),
  });
  aAId = (await createAssignmentWithParts({ seasonId, title: "Group A essay", dueAt: at("2099-06-01T10:00:00.000Z") }))
    .id;
  await createAssignmentWithParts({ seasonId, title: "Group A old", dueAt: at("2020-01-05T10:00:00.000Z") });
  const aDeleted = await createAssignmentWithParts({ seasonId, title: "Deleted", deletedAt: new Date() });

  await seedEssays([
    // Late: submitted 2020-01-12, due 2020-01-10.
    {
      assignmentId: aAll.id,
      studentUserId: s1,
      status: "SUBMITTED",
      submittedAt: at("2020-01-12T10:00:00.000Z"),
    },
    { assignmentId: aAId, studentUserId: s1, status: "DRAFT" },
    {
      assignmentId: aAll.id,
      studentUserId: s2,
      status: "REVIEWED",
      submittedAt: at("2020-01-09T10:00:00.000Z"),
      reviewedAt: at("2020-01-11T10:00:00.000Z"),
    },
    {
      assignmentId: aAll.id,
      studentUserId: s3,
      status: "RETURNED",
      submittedAt: at("2020-01-09T10:00:00.000Z"),
      reviewedAt: at("2020-01-11T10:00:00.000Z"),
    },
    // On a soft-deleted assignment: must count nowhere.
    {
      assignmentId: aDeleted.id,
      studentUserId: s2,
      status: "SUBMITTED",
      submittedAt: at("2020-01-09T10:00:00.000Z"),
    },
  ]);

  const paper = await db.quiz.create({ data: { seasonId, title: "Paper", kind: "PAPER" }, select: { id: true } });
  const online = await db.quiz.create({
    data: { seasonId, title: "Online", kind: "ONLINE", publishedAt: new Date() },
    select: { id: true },
  });
  await db.quiz.create({ data: { seasonId, title: "Draft", kind: "ONLINE" } });
  await db.quizGrade.createMany({
    data: [
      { quizId: paper.id, studentUserId: s1, score: 8 },
      { quizId: paper.id, studentUserId: s2, score: 7 },
      { quizId: paper.id, studentUserId: s3, score: null },
    ],
  });
  await db.quizAttempt.createMany({
    data: [
      { quizId: online.id, studentUserId: s1, status: "GRADED", autoScore: 2, totalScore: 2 },
      { quizId: online.id, studentUserId: s2, status: "GRADED", autoScore: 1, totalScore: 1 },
      { quizId: online.id, studentUserId: s3, status: "SUBMITTED" },
    ],
  });

  // ---- The mentor feed: dated 2099 so these are the newest rows in the DB ----
  const feedSeasonId = (await createTestSeason()).id;
  const deletedSeasonId = (await createTestSeason()).id;
  await db.season.update({ where: { id: deletedSeasonId }, data: { deletedAt: new Date() } });
  const feedSession = await db.session.create({
    data: { seasonId: feedSeasonId, title: "Feed session", startsAt: at("2099-04-01T16:00:00.000Z") },
    select: { id: true },
  });
  const deletedSession = await db.session.create({
    data: { seasonId: deletedSeasonId, title: "Gone session", startsAt: at("2099-04-01T16:00:00.000Z") },
    select: { id: true },
  });
  const feedAssignment = await createAssignmentWithParts({ seasonId: feedSeasonId, title: "Feed essay" });
  m1 = (await createTestUser("dash-m1", "STUDENT")).id;
  m2 = (await createTestUser("dash-m2", "STUDENT")).id;
  const m3 = (await createTestUser("dash-m3", "STUDENT")).id;
  graduatedId = (await createTestUser("dash-graduated", "STUDENT")).id;
  await db.user.update({ where: { id: graduatedId }, data: { graduationYear: 2020 } });

  await db.attendance.createMany({
    data: [
      { sessionId: feedSession.id, studentUserId: m1, status: "PRESENT", markedAt: at("2099-05-01T09:00:00.000Z") },
      // Graduated student — excluded (D18 recommendation).
      {
        sessionId: feedSession.id,
        studentUserId: graduatedId,
        status: "PRESENT",
        markedAt: at("2099-06-02T09:00:00.000Z"),
      },
      // Soft-deleted season — excluded.
      { sessionId: deletedSession.id, studentUserId: m1, status: "PRESENT", markedAt: at("2099-06-03T09:00:00.000Z") },
    ],
  });
  await seedEssays([
    {
      assignmentId: feedAssignment.id,
      studentUserId: m1,
      status: "SUBMITTED",
      submittedAt: at("2099-05-02T09:00:00.000Z"),
    },
    {
      assignmentId: feedAssignment.id,
      studentUserId: m2,
      status: "REVIEWED",
      submittedAt: at("2099-04-01T09:00:00.000Z"),
      reviewedAt: at("2099-05-03T09:00:00.000Z"),
    },
    // DRAFT never appears (spec 08 D8), whatever its timestamps.
    {
      assignmentId: feedAssignment.id,
      studentUserId: m3,
      status: "DRAFT",
      submittedAt: at("2099-06-01T09:00:00.000Z"),
    },
  ]);

  tokens.admin = await login(app, admin.email);
  tokens.adminOther = await login(app, adminOther.email);
  tokens.leader = await login(app, leader.email);
  tokens.leaderNone = await login(app, leaderNone.email);
  tokens.super = await login(app, superUser.email);
  tokens.mentor = await login(app, mentor.email);
  tokens.alumnus = await login(app, alumnus.email);
  tokens.student = await login(app, student.email);
  tokens.studentNone = await login(app, studentNone.email);
  tokens.student3 = await login(
    app,
    (await db.user.findUniqueOrThrow({ where: { id: s3 }, select: { email: true } })).email,
  );
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("GET /api/v1/me/dashboard — gates", () => {
  it("401s without a token, and an unknown /me path is still a 404 (X5)", async () => {
    expect((await get("/api/v1/me/dashboard")).status).toBe(401);
    const unknown = await get("/api/v1/me/no-such-thing");
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe("not_found");
  });

  it("403s an alumnus — the alumni Home composes /me and /events (spec 19 §7)", async () => {
    const res = await get("/api/v1/me/dashboard", tokens.alumnus);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("forbidden");
  });

  it("400s a season-staff caller with no seasonId or a malformed one", async () => {
    for (const token of [tokens.admin, tokens.leader, tokens.super]) {
      const res = await get("/api/v1/me/dashboard", token);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("bad_request");
    }
    expect((await get("/api/v1/me/dashboard?seasonId=abc", tokens.admin)).status).toBe(400);
  });

  it("403s an admin of another season and a leader with no group in it (C7, C8)", async () => {
    expect((await get(`/api/v1/me/dashboard?seasonId=${seasonId}`, tokens.adminOther)).status).toBe(403);
    expect((await get(`/api/v1/me/dashboard?seasonId=${seasonId}`, tokens.leaderNone)).status).toBe(403);
  });

  it("404s a season that does not exist", async () => {
    const res = await get("/api/v1/me/dashboard?seasonId=2147483000", tokens.super);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });
});

describe("SEASON_STAFF", () => {
  it("gives an admin the season-wide figures, every one server-derived", async () => {
    const res = await get(`/api/v1/me/dashboard?seasonId=${seasonId}`, tokens.admin);
    expect(res.status).toBe(200);
    const d = staffSeasonDashboardSchema.parse(res.body.data);

    expect(d.scope).toBe("season");
    // The org's day, so staff screens count sessions from it rather than the device's.
    expect(d.todayOrgDay).toBe(orgDayKey(new Date()));
    expect(Object.keys(res.body.data).sort()).toEqual([
      "cohort",
      "groups",
      "nextSession",
      "progress",
      "quizzes",
      "scope",
      "season",
      "submissions",
      "todayOrgDay",
      "variant",
    ]);
    expect(d.groups).toEqual([]);
    expect(d.season).toMatchObject({ id: seasonId, status: "ACTIVE" });
    expect(d.progress).toEqual({ sessionsHeld: 3, sessionsTotal: 4, pct: 75 });
    expect(d.nextSession).toMatchObject({
      id: liveSessionId,
      isInProgress: true,
      youtubeUrl: "https://youtu.be/live",
    });
    // ACTIVE enrolments only — the withdrawn student is not on the cohort (C9, D8).
    expect(d.cohort.studentCount).toBe(3);
    expect(d.cohort.meanAttendancePct).toBe(33);
    expect(d.cohort.atRiskTotal).toBe(3);
    // Every assignment is everyone's, and a returned essay is not submitted, so
    // s3 (0 attendance, 0 of 3 submitted) now scores lowest.
    expect(d.cohort.atRisk.map((r) => r.studentUserId)).toEqual([s3, s2, s1]);
    // Pending review = essays SUBMITTED; reviewed = essays REVIEWED + RETURNED;
    // the deleted assignment's essay nowhere (D11).
    expect(d.submissions).toEqual({ pendingReview: 1, reviewed: 2 });
    // s3 is ungraded on both live quizzes; the draft is reported separately (D10).
    expect(d.quizzes).toEqual({ total: 2, pending: 2, fullyGraded: 0, drafts: 1 });
  });

  it("gives SUPER the same season-scoped figures when it names the season", async () => {
    const res = await get(`/api/v1/me/dashboard?seasonId=${seasonId}`, tokens.super);
    expect(res.status).toBe(200);
    const d = staffSeasonDashboardSchema.parse(res.body.data);
    expect(d.scope).toBe("season");
    expect(d.cohort.studentCount).toBe(3);
  });

  it("narrows a leader to their groups through SeasonEnrollment and names every group (D7, C9)", async () => {
    const res = await get(`/api/v1/me/dashboard?seasonId=${seasonId}`, tokens.leader);
    expect(res.status).toBe(200);
    const d = staffSeasonDashboardSchema.parse(res.body.data);

    expect(d.scope).toBe("groups");
    expect(d.groups).toEqual([{ id: groupAId, name: "Group A" }]);
    expect(d.cohort.studentCount).toBe(2);
    expect(d.cohort.meanAttendancePct).toBe(50);
    expect(d.cohort.atRisk.map((r) => r.studentUserId)).toEqual([s2, s1]);
    expect(d.cohort.atRiskTotal).toBe(2);
    // Their students' essays only: s1's SUBMITTED and s2's REVIEWED; s3 is group B.
    expect(d.submissions).toEqual({ pendingReview: 1, reviewed: 1 });
    // s1 and s2 are graded on both, so nothing is pending for this leader.
    expect(d.quizzes).toEqual({ total: 2, pending: 0, fullyGraded: 2, drafts: 1 });
  });
});
