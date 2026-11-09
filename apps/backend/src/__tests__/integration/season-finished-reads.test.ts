// After End every enrolment is COMPLETED. These reads list "the season's
// participants", and must not blank out: a finished season stays readable and
// correctable by Super for the rest of the product's life. Every list here is
// asserted non-empty, with the exact people, so an empty answer cannot pass.
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";

import { buildSeasonWorkbook } from "../../lib/exports/season-workbook";
import { listSeasonRoster } from "../../lib/queries/groups";
import { newPublicId } from "../../lib/public-id";
import { cleanupTestData, createTestSeason, createTestUser, reviewedOf, tokenFor } from "./fixtures";

jest.setTimeout(180000);

const app = createApp();

const get = (path: string, t: string) => request(app).get(`/api/v1${path}`).set("authorization", `Bearer ${t}`);
const post = (path: string, t: string, body: object) =>
  request(app).post(`/api/v1${path}`).set("authorization", `Bearer ${t}`).send(body);

let seasonId: number;
let groupId: number;
let sessionId: number;
let assignmentId: number;
let forumId: number;
let onlineQuizId: number;
let attemptId: number;
let paperQuizId: number;
let essayId: number;
let peter: number;
let sara: number;
let withdrawn: number;
let superT: string;
let mentorT: string;
let adminId: number;

beforeAll(async () => {
  await cleanupTestData();
  const season = await createTestSeason();
  seasonId = season.id;
  const [p, s, w, sup, mentor, admin, leader] = await Promise.all([
    createTestUser("fin-peter", "STUDENT"),
    createTestUser("fin-sara", "STUDENT"),
    createTestUser("fin-wd", "STUDENT"),
    createTestUser("fin-super", "SUPER"),
    createTestUser("fin-mentor", "MENTOR"),
    createTestUser("fin-admin", "ADMIN"),
    createTestUser("fin-leader", "LEADER"),
  ]);
  peter = p.id;
  sara = s.id;
  withdrawn = w.id;
  adminId = admin.id;
  await db.seasonAdmin.create({ data: { seasonId, userId: admin.id } });
  groupId = (
    await db.group.create({
      data: { seasonId, name: "Finished G", leaders: { create: { userId: leader.id } } },
      select: { id: true },
    })
  ).id;
  await db.seasonEnrollment.createMany({
    data: [
      { seasonId, studentUserId: peter, groupId, status: "ACTIVE" },
      { seasonId, studentUserId: sara, groupId, status: "ACTIVE" },
      { seasonId, studentUserId: withdrawn, groupId, status: "WITHDRAWN" },
    ],
  });
  sessionId = (
    await db.session.create({
      data: { seasonId, title: "Week 1", startsAt: new Date(Date.now() - 86_400_000), durationMinutes: 60 },
      select: { id: true },
    })
  ).id;
  await db.attendance.createMany({
    data: [peter, sara].map((studentUserId) => ({ sessionId, studentUserId, status: "PRESENT" as const })),
  });
  assignmentId = (
    await db.assignment.create({
      data: { seasonId, title: "Essay", isAllGroups: true, createdById: admin.id },
      select: { id: true },
    })
  ).id;
  forumId = (
    await db.assignment.create({
      data: { seasonId, title: "Forum", type: "FORUM", isAllGroups: true, createdById: admin.id },
      select: { id: true },
    })
  ).id;
  await db.submission.create({
    data: {
      publicId: newPublicId(),
      assignmentId: forumId,
      studentUserId: peter,
      text: "<p>post</p>",
      status: "REVIEWED",
      submittedAt: new Date(),
      reviewedAt: new Date(),
    },
  });
  const online = await db.quiz.create({
    data: {
      seasonId,
      title: "Online",
      kind: "ONLINE",
      maxScore: 5,
      publishedAt: new Date(),
      questions: { create: [{ order: 1, type: "ESSAY", prompt: "Why?", points: 5 }] },
    },
    select: { id: true, questions: { select: { id: true } } },
  });
  onlineQuizId = online.id;
  essayId = online.questions[0]!.id;
  attemptId = (
    await db.quizAttempt.create({
      data: {
        quizId: onlineQuizId,
        studentUserId: peter,
        attemptNumber: 1,
        status: "GRADED",
        autoScore: 0,
        totalScore: 1,
      },
      select: { id: true },
    })
  ).id;
  await db.quizAnswer.create({ data: { attemptId, questionId: essayId, text: "because", pointsAwarded: 1 } });
  paperQuizId = (
    await db.quiz.create({ data: { seasonId, title: "Paper", kind: "PAPER", maxScore: 10 }, select: { id: true } })
  ).id;
  await db.sessionVideoQuestion.create({
    data: { sessionId, atSeconds: 5, prompt: "Q", options: ["a", "b"], correctIndex: 0, points: 1 },
  });

  const adminT = await tokenFor(admin.id);
  const ended = await post(`/seasons/${seasonId}/end`, adminT, {
    notPassed: [{ userId: sara, reason: "Absent" }],
    reviewed: await reviewedOf(seasonId),
  });
  expect(ended.status).toBe(200);
  // Tokens from post-End scopes, the way a real refresh gets them.
  superT = await tokenFor(sup.id);
  mentorT = await tokenFor(mentor.id);
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

const rosterIds = (rows: { studentUserId?: number; userId?: number }[]) =>
  rows.map((r) => r.studentUserId ?? r.userId).sort((a, b) => Number(a) - Number(b));

describe("Super, after End", () => {
  it("reads the attendance roster, without the withdrawn student", async () => {
    const res = await get(`/sessions/${sessionId}/attendance`, superT);
    expect(res.status).toBe(200);
    expect(rosterIds(res.body.data.roster)).toEqual([peter, sara].sort((a, b) => a - b));
  });

  it("reads the assignment tracker and its expected count", async () => {
    const tracker = await get(`/assignments/${assignmentId}/tracker`, superT);
    expect(tracker.status).toBe(200);
    expect(JSON.stringify(tracker.body.data)).toContain("fin-peter");
    expect(JSON.stringify(tracker.body.data)).not.toContain("fin-wd");
    const list = await get(`/seasons/${seasonId}/assignments`, superT);
    expect(list.status).toBe(200);
    const row = list.body.data.assignments.find((a: { id: number }) => a.id === assignmentId);
    expect(row.expectedCount).toBe(2);
  });

  it("reads the season roster, group count and group impact", async () => {
    const roster = await get(`/seasons/${seasonId}/roster`, superT);
    expect(roster.status).toBe(200);
    expect(rosterIds(roster.body.data.roster)).toEqual([peter, sara].sort((a, b) => a - b));
    const groups = await get(`/seasons/${seasonId}/groups`, superT);
    expect(groups.body.data.groups[0].studentCount).toBe(2);
    const impact = await get(`/groups/${groupId}/impact`, superT);
    expect(impact.body.data.studentCount).toBe(2);
  });

  it("gets a workbook with the season's students on every sheet", async () => {
    const manifest = await get(`/seasons/${seasonId}/exports/manifest`, superT);
    expect(manifest.status).toBe(200);
    expect(manifest.body.data.sheets[0].rowCount).toBe(2);
    const built = await buildSeasonWorkbook(seasonId);
    expect(built?.rowCount).toBe(2);
  });

  it("reads the video-quiz staff rows", async () => {
    const res = await get(`/sessions/${sessionId}/video-quiz/results`, superT);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body.data)).toContain("fin-peter");
  });

  it("reads the forum's posts as staff", async () => {
    const res = await get(`/assignments/${forumId}/forum`, superT);
    expect(res.status).toBe(200);
    expect(res.body.data.posts).toHaveLength(1);
  });

  it("re-grades an attempt, reopens one and enters a paper grade", async () => {
    const graded = await post(`/quizzes/${onlineQuizId}/attempts/${attemptId}/grade`, superT, {
      awards: [{ questionId: essayId, points: 4 }],
    });
    expect(graded.status).toBe(200);
    const reopened = await post(`/quizzes/${onlineQuizId}/attempts/reopen`, superT, { studentUserId: peter });
    expect(reopened.status).toBe(201);
    const paper = await post(`/quizzes/${paperQuizId}/grades`, superT, {
      entries: [{ studentUserId: sara, score: 7, notes: null }],
    });
    expect(paper.status).toBe(200);
    const sheet = await get(`/quizzes/${paperQuizId}/grades`, superT);
    expect(JSON.stringify(sheet.body.data)).toContain("fin-peter");
  });

  it("still refuses to grade the withdrawn student", async () => {
    const res = await post(`/quizzes/${paperQuizId}/grades`, superT, {
      entries: [{ studentUserId: withdrawn, score: 7, notes: null }],
    });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("student_not_in_scope");
  });

  it("has the season in the engagement report and its cohort", async () => {
    const res = await get(`/reports/engagement/students?seasonId=${seasonId}`, superT);
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(2);
  });

  it("moves a finished student between groups, and the roster says so", async () => {
    const other = await db.group.create({ data: { seasonId, name: "Other G" }, select: { id: true } });
    const res = await request(app)
      .put(`/api/v1/seasons/${seasonId}/group-assignments`)
      .set("authorization", `Bearer ${superT}`)
      .send({ assignments: [{ studentUserId: peter, groupId: other.id }] });
    expect(res.status).toBe(200);
    expect(res.body.data.skippedStudentIds ?? []).toEqual([]);
    const row = await db.seasonEnrollment.findUniqueOrThrow({
      where: { studentUserId_seasonId: { studentUserId: peter, seasonId } },
    });
    expect(row.groupId).toBe(other.id);
    await db.seasonEnrollment.update({ where: { id: row.id }, data: { groupId } });
    await db.group.delete({ where: { id: other.id } });
  });

  it("does not lose a finished student's group when the form saves its own list", async () => {
    const res = await request(app)
      .patch(`/api/v1/groups/${groupId}`)
      .set("authorization", `Bearer ${superT}`)
      .send({ name: "Finished G", description: null, leaderIds: [], studentIds: [peter, sara] });
    expect(res.status).toBe(200);
    const detail = await get(`/groups/${groupId}`, superT);
    expect(detail.body.data.students.map((x: { id: number }) => x.id).sort((a: number, b: number) => a - b)).toEqual(
      [peter, sara].sort((a, b) => a - b),
    );
  });

  it("takes a finished student out when the form's list leaves them off", async () => {
    await request(app)
      .patch(`/api/v1/groups/${groupId}`)
      .set("authorization", `Bearer ${superT}`)
      .send({ name: "Finished G", description: null, leaderIds: [], studentIds: [peter] })
      .expect(200);
    const row = await db.seasonEnrollment.findUniqueOrThrow({
      where: { studentUserId_seasonId: { studentUserId: sara, seasonId } },
    });
    expect(row.groupId).toBeNull();
    expect(row.status).toBe("COMPLETED");
    expect(row.result).toBe("NOT_PASSED");
    await db.seasonEnrollment.update({ where: { id: row.id }, data: { groupId } });
  });
});

describe("Mentor, after End", () => {
  it("reads the same season through every surface a Mentor has", async () => {
    const cohort = await get(`/reports/engagement/students?seasonId=${seasonId}`, mentorT);
    expect(cohort.status).toBe(200);
    expect(cohort.body.data.total).toBe(2);

    const groups = await get(`/seasons/${seasonId}/groups`, mentorT);
    expect(groups.status).toBe(200);
    expect(groups.body.data.groups.find((g: { id: number }) => g.id === groupId).studentCount).toBe(2);

    const assignments = await get(`/seasons/${seasonId}/assignments`, mentorT);
    expect(assignments.status).toBe(200);
    expect(assignments.body.data.assignments.find((a: { id: number }) => a.id === assignmentId).expectedCount).toBe(2);

    const forum = await get(`/assignments/${forumId}/forum`, mentorT);
    expect(forum.status).toBe(200);
    expect(forum.body.data.posts).toHaveLength(1);
  });

  it("is still refused the rosters and exports it was refused before End", async () => {
    for (const path of [
      `/sessions/${sessionId}/attendance`,
      `/assignments/${assignmentId}/tracker`,
      `/seasons/${seasonId}/roster`,
      `/seasons/${seasonId}/exports/manifest`,
      `/sessions/${sessionId}/video-quiz/results`,
    ]) {
      expect((await get(path, mentorT)).status).toBe(403);
    }
  });
});

describe("who counts, by season status", () => {
  async function seasonOf(status: "DRAFT" | "ACTIVE" | "COMPLETED" | "ARCHIVED") {
    const season = await createTestSeason({ status });
    const [active, completed, gone] = await Promise.all([
      createTestUser(`who-active-${status}`, "STUDENT"),
      createTestUser(`who-completed-${status}`, "STUDENT"),
      createTestUser(`who-wd-${status}`, "STUDENT"),
    ]);
    await db.seasonEnrollment.createMany({
      data: [
        { seasonId: season.id, studentUserId: active.id, status: "ACTIVE" },
        { seasonId: season.id, studentUserId: completed.id, status: "COMPLETED" },
        { seasonId: season.id, studentUserId: gone.id, status: "WITHDRAWN" },
      ],
    });
    const ids = (await listSeasonRoster(season.id)).map((r) => r.userId);
    return { ids, active: active.id, completed: completed.id, gone: gone.id };
  }

  it.each(["DRAFT", "ACTIVE"] as const)("a %s season lists ACTIVE only: a graduate has left it", async (status) => {
    const w = await seasonOf(status);
    expect(w.ids).toEqual([w.active]);
  });

  it.each(["COMPLETED", "ARCHIVED"] as const)(
    "a %s season lists ACTIVE and COMPLETED, not WITHDRAWN",
    async (status) => {
      const w = await seasonOf(status);
      expect(w.ids.sort((a, b) => a - b)).toEqual([w.active, w.completed].sort((a, b) => a - b));
      expect(w.ids).not.toContain(w.gone);
    },
  );
});

describe("Former staff, after End", () => {
  it("get nothing back: a former admin is refused the roster", async () => {
    const res = await get(`/seasons/${seasonId}/roster`, await tokenFor(adminId));
    expect(res.status).toBe(403);
  });
});
