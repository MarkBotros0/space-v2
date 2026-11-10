import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";
import { createAssignmentWithParts, seedEssays } from "./assignment-reads-setup";

jest.setTimeout(60000);

const app = createApp();

let seasonId: number;
let lateJoinerId: number;
let earlyStudentId: number;
let otherSeasonId: number;
let superToken: string;
let leaderToken: string;
let adminAToken: string;
let earlyStudentToken: string;
let lateJoinerToken: string;

beforeAll(async () => {
  await cleanupTestData();

  const season = await createTestSeason();
  seasonId = season.id;

  const early = await createTestUser("eng-early", "STUDENT");
  const late = await createTestUser("eng-late", "STUDENT");
  const otherGroup = await createTestUser("eng-other", "STUDENT");
  const leader = await createTestUser("eng-leader", "LEADER");
  const superUser = await createTestUser("eng-super", "SUPER");
  earlyStudentId = early.id;

  const groupA = await db.group.create({
    data: { seasonId, name: "Group A", leaders: { create: { userId: leader.id } } },
    select: { id: true },
  });
  const groupB = await db.group.create({ data: { seasonId, name: "Group B" }, select: { id: true } });

  // Four past sessions. The late joiner enrols after the first two.
  const sessionRows = await Promise.all(
    ["2020-01-01", "2020-01-08", "2020-01-15", "2020-01-22"].map((d) =>
      db.session.create({
        data: {
          seasonId,
          title: `Session ${d}`,
          startsAt: new Date(`${d}T18:00:00.000Z`),
          durationMinutes: 60,
        },
        select: { id: true },
      }),
    ),
  );

  await db.seasonEnrollment.createMany({
    data: [
      {
        seasonId,
        studentUserId: early.id,
        groupId: groupA.id,
        status: "ACTIVE",
        enrolledAt: new Date("2019-12-01T00:00:00.000Z"),
      },
      {
        seasonId,
        studentUserId: late.id,
        groupId: groupA.id,
        status: "ACTIVE",
        enrolledAt: new Date("2020-01-10T00:00:00.000Z"),
      },
      {
        seasonId,
        studentUserId: otherGroup.id,
        groupId: groupB.id,
        status: "ACTIVE",
        enrolledAt: new Date("2019-12-01T00:00:00.000Z"),
      },
    ],
  });

  // early: present at 2 of 4 → 50%. late: present at 1 of the 2 sessions that
  // ran after they enrolled → 50% under the fixed denominator, 25% under v1's.
  await db.attendance.createMany({
    data: [
      { sessionId: sessionRows[0]!.id, studentUserId: early.id, status: "PRESENT" },
      { sessionId: sessionRows[1]!.id, studentUserId: early.id, status: "LATE" },
      { sessionId: sessionRows[2]!.id, studentUserId: early.id, status: "ABSENT" },
      { sessionId: sessionRows[2]!.id, studentUserId: late.id, status: "PRESENT" },
      { sessionId: sessionRows[3]!.id, studentUserId: late.id, status: "ABSENT" },
    ],
  });

  // Two assignments, both the whole season's (no targeting): the late joiner in
  // Group B has both too.
  const first = await createAssignmentWithParts({ seasonId, title: "First" });
  const second = await createAssignmentWithParts({ seasonId, title: "Second" });

  // early submits both → 100%. late submits neither → 0%.
  await seedEssays([
    { assignmentId: first.id, studentUserId: early.id, status: "SUBMITTED" },
    { assignmentId: second.id, studentUserId: early.id, status: "REVIEWED" },
  ]);
  lateJoinerId = late.id;

  // Quizzes (owner, 2026-11-07: the student's page shows them). Given: the
  // published ONLINE quiz and the PAPER quiz someone was graded on. Not given:
  // the ONLINE draft and the PAPER quiz nobody is graded on. early took the
  // ONLINE one and has no paper grade: 1 of 2.
  const onlineQuiz = await db.quiz.create({
    data: { seasonId, title: "Online", kind: "ONLINE", publishedAt: new Date() },
    select: { id: true },
  });
  await db.quiz.create({ data: { seasonId, title: "Draft", kind: "ONLINE" } });
  const paperQuiz = await db.quiz.create({
    data: { seasonId, title: "Paper", kind: "PAPER" },
    select: { id: true },
  });
  await db.quiz.create({ data: { seasonId, title: "Paper, not given", kind: "PAPER" } });
  await db.quizAttempt.create({
    data: { quizId: onlineQuiz.id, studentUserId: early.id, status: "SUBMITTED", submittedAt: new Date() },
  });
  await db.quizGrade.create({ data: { quizId: paperQuiz.id, studentUserId: late.id, score: 7 } });

  // A second season the early student is also enrolled in, plus an admin of
  // the FIRST season only. canViewStudent admits that admin (they share
  // season A with the student), which is exactly why the score itself must be
  // gated per season (ruling C8): passing the student gate must not unlock
  // the student's numbers in a season the caller has no scope over.
  const adminA = await createTestUser("eng-admin-a", "ADMIN");
  await db.seasonAdmin.create({ data: { seasonId, userId: adminA.id } });
  const seasonB = await createTestSeason();
  otherSeasonId = seasonB.id;
  await db.seasonEnrollment.create({
    data: {
      seasonId: seasonB.id,
      studentUserId: early.id,
      status: "ACTIVE",
      // Earlier than the season-A enrolment, so the default (latest ACTIVE)
      // season for every caller below stays season A.
      enrolledAt: new Date("2019-11-01T00:00:00.000Z"),
    },
  });

  superToken = await login(app, superUser.email);
  leaderToken = await login(app, leader.email);
  adminAToken = await login(app, adminA.email);
  earlyStudentToken = await login(app, early.email);
  lateJoinerToken = await login(app, late.email);
  expect(groupB.id).not.toBe(groupA.id);
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("GET /api/v1/students/:id/engagement", () => {
  it("gives staff the full score", async () => {
    const res = await request(app)
      .get(`/api/v1/students/${earlyStudentId}/engagement`)
      .set("authorization", `Bearer ${superToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ score: 75, attendancePct: 50, atRisk: true });
  });

  it("gives staff the student's quizzes: given and taken, outside the score", async () => {
    const res = await request(app)
      .get(`/api/v1/students/${earlyStudentId}/engagement`)
      .set("authorization", `Bearer ${superToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ quizzesGiven: 2, quizzesTaken: 1, quizPct: 50, score: 75 });
  });

  it("gives a student their own components and NOT the composite (D9)", async () => {
    const res = await request(app)
      .get(`/api/v1/students/${earlyStudentId}/engagement`)
      .set("authorization", `Bearer ${earlyStudentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ attendancePct: 50, submissionPct: 100 });
    // A single "engagement: 75%" figure shown to a young person is a product
    // decision nobody has made; the components are facts they can act on.
    expect(res.body.data.score).toBeUndefined();
    expect(res.body.data.atRisk).toBeUndefined();
  });

  it("counts every assignment of the season as expected, done once submitted", async () => {
    const res = await request(app)
      .get(`/api/v1/students/${lateJoinerId}/engagement`)
      .set("authorization", `Bearer ${superToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ submissionsExpected: 2, submissionsCompleted: 0, submissionPct: 0 });
  });

  it("refuses a student another student's engagement", async () => {
    const res = await request(app)
      .get(`/api/v1/students/${earlyStudentId}/engagement`)
      .set("authorization", `Bearer ${lateJoinerToken}`);
    expect(res.status).toBe(403);
  });

  it("refuses an admin of season A who names season B — scope is per season, not per student (C8)", async () => {
    const res = await request(app)
      .get(`/api/v1/students/${earlyStudentId}/engagement?seasonId=${otherSeasonId}`)
      .set("authorization", `Bearer ${adminAToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("forbidden");
  });

  it("gives the same admin the season they DO administer", async () => {
    const res = await request(app)
      .get(`/api/v1/students/${earlyStudentId}/engagement?seasonId=${seasonId}`)
      .set("authorization", `Bearer ${adminAToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ seasonId, score: 75 });
  });

  it("refuses a leader a season in which they lead none of the student's groups", async () => {
    const res = await request(app)
      .get(`/api/v1/students/${earlyStudentId}/engagement?seasonId=${otherSeasonId}`)
      .set("authorization", `Bearer ${leaderToken}`);
    expect(res.status).toBe(403);
  });

  it("404s when the student has no enrolment to score", async () => {
    const orphan = await createTestUser("eng-orphan", "STUDENT");
    const res = await request(app)
      .get(`/api/v1/students/${orphan.id}/engagement`)
      .set("authorization", `Bearer ${superToken}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("no_season");
  });
});
