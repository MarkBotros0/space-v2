import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";

import { seasonHistoryResponseSchema, seasonRecordSchema } from "../../../../../packages/shared/src/index";
import { cleanupTestData, createTestSeason, createTestUser, tokenFor } from "./fixtures";
import { createAssignmentWithParts, seedEssays } from "./assignment-reads-setup";

jest.setTimeout(180000);

const app = createApp();

const SECRET_RESULT = "seeded-result-reason-ZQX";
const SECRET_DROP = "seeded-drop-reason-ZQX";
const SECRET_NOTE = "seeded-quiz-note-ZQX";

let tokens: { student: string; mentor: string; stranger: string };
const seasons = {} as Record<
  "passed" | "notPassed" | "completed" | "dropped" | "current" | "draft" | "deletedSeason",
  { id: number; code: string }
>;
let quizIds: { notTaken: number; progress: number; graded: number; submitted: number };

const get = (path: string, token: string) => request(app).get(`/api/v1${path}`).set("authorization", `Bearer ${token}`);

beforeAll(async () => {
  await cleanupTestData();
  const admin = await createTestUser("rec-admin", "ADMIN");
  const s = await createTestUser("rec-student", "STUDENT");
  const mentor = await createTestUser("rec-mentor", "MENTOR");
  const stranger = await createTestUser("rec-stranger", "STUDENT");

  const mk = (status: "ACTIVE" | "COMPLETED" | "DRAFT") => createTestSeason({ status });
  seasons.passed = await mk("COMPLETED");
  seasons.notPassed = await mk("COMPLETED");
  seasons.completed = await mk("COMPLETED");
  seasons.dropped = await mk("COMPLETED");
  seasons.current = await mk("ACTIVE");
  seasons.draft = await mk("DRAFT");
  seasons.deletedSeason = await mk("COMPLETED");
  await db.season.update({ where: { id: seasons.deletedSeason.id }, data: { deletedAt: new Date() } });

  const enrol = (key: keyof typeof seasons, data: object, who = s.id) =>
    db.seasonEnrollment.create({
      data: { seasonId: seasons[key].id, studentUserId: who, ...data } as never,
    });
  await enrol("passed", { status: "COMPLETED", result: "PASSED", resultReason: SECRET_RESULT });
  await enrol("notPassed", { status: "COMPLETED", result: "NOT_PASSED", resultReason: SECRET_RESULT });
  await enrol("completed", { status: "COMPLETED" });
  await enrol("dropped", { status: "WITHDRAWN", dropReason: SECRET_DROP, droppedAt: new Date() });
  await enrol("current", { status: "ACTIVE" });
  // An enrolment in a DRAFT season: history lists non-ACTIVE enrolments only.
  await enrol("draft", { status: "ACTIVE" });
  await enrol("deletedSeason", { status: "COMPLETED", result: "PASSED" });

  // Content in the "passed" season.
  const sid = seasons.passed.id;
  const g = await db.group.create({
    data: { seasonId: sid, name: "Rec Group", students: { create: { studentUserId: s.id } } },
  });
  await db.seasonEnrollment.update({
    where: { studentUserId_seasonId: { studentUserId: s.id, seasonId: sid } },
    data: { groupId: g.id },
  });
  // A1 has an essay and a video: the essay reviewed, the video not watched,
  // the assignment submitted all the same (seeded, not through the gate).
  const a1 = await createAssignmentWithParts(
    { seasonId: sid, title: "Rec A1", dueAt: new Date("2099-02-01T00:00:00Z") },
    [{ kind: "ESSAY" }, { kind: "VIDEO" }],
  );
  await db.assignment.update({ where: { id: a1.id }, data: { createdById: admin.id } });
  await createAssignmentWithParts({ seasonId: sid, title: "Rec A2" });
  await seedEssays([
    {
      assignmentId: a1.id,
      studentUserId: s.id,
      text: "x",
      status: "REVIEWED",
      submittedAt: new Date(),
      reviewedAt: new Date(),
      feedback: SECRET_NOTE,
    },
  ]);
  const sessionIds: number[] = [];
  for (const n of [1, 2, 3, 4]) {
    const created = await db.session.create({
      data: { seasonId: sid, title: `Rec S${n}`, startsAt: new Date(`2099-01-0${n}T10:00:00Z`) },
      select: { id: true },
    });
    sessionIds.push(created.id);
  }
  await db.attendance.createMany({
    data: [
      { sessionId: sessionIds[0]!, studentUserId: s.id, status: "PRESENT" },
      { sessionId: sessionIds[1]!, studentUserId: s.id, status: "LATE" },
      { sessionId: sessionIds[2]!, studentUserId: s.id, status: "ABSENT" },
    ],
  });
  const mkQuiz = (title: string) =>
    db.quiz.create({
      // A graded attempt shows its score with no release (spec "What students see").
      data: { seasonId: sid, title, kind: "ONLINE", maxScore: 10, publishedAt: new Date() },
      select: { id: true },
    });
  const q1 = await mkQuiz("Q not taken");
  const q2 = await mkQuiz("Q progress");
  const q3 = await mkQuiz("Q graded");
  const q4 = await mkQuiz("Q submitted");
  await db.quizAttempt.create({ data: { quizId: q2.id, studentUserId: s.id, status: "IN_PROGRESS" } });
  await db.quizAttempt.create({
    data: {
      quizId: q3.id,
      studentUserId: s.id,
      status: "GRADED",
      autoScore: 7,
      totalScore: 7,
      submittedAt: new Date(),
      gradedAt: new Date(),
    },
  });
  await db.quizAttempt.create({
    data: { quizId: q4.id, studentUserId: s.id, status: "SUBMITTED", autoScore: 5, submittedAt: new Date() },
  });
  // On an ONLINE quiz a QuizGrade row is the season admin's score (plan 4), and its note is meant
  // for the student, so the secret stays on the essay feedback only.
  await db.quizGrade.create({ data: { quizId: q3.id, studentUserId: s.id, score: 7, notes: null } });
  await db.quiz.create({ data: { seasonId: sid, title: "Q draft", kind: "ONLINE", maxScore: 10 } }); // unpublished: hidden
  quizIds = { notTaken: q1.id, progress: q2.id, graded: q3.id, submitted: q4.id };

  tokens = {
    student: await tokenFor(s.id),
    mentor: await tokenFor(mentor.id),
    stranger: await tokenFor(stranger.id),
  };
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("GET /me/season-history", () => {
  it("lists only non-ACTIVE enrolments, each with code and outcome", async () => {
    const res = await get("/me/season-history", tokens.student);
    expect(res.status).toBe(200);
    const body = seasonHistoryResponseSchema.parse(res.body.data);
    const byCode = new Map(body.seasons.map((r) => [r.code, r.outcome]));
    expect(byCode.get(seasons.passed.code)).toBe("PASSED");
    expect(byCode.get(seasons.notPassed.code)).toBe("NOT_PASSED");
    expect(byCode.get(seasons.completed.code)).toBe("COMPLETED");
    expect(byCode.get(seasons.dropped.code)).toBe("DROPPED");
    expect(byCode.has(seasons.current.code)).toBe(false);
    expect(byCode.has(seasons.draft.code)).toBe(false);
    expect(byCode.has(seasons.deletedSeason.code)).toBe(false);
    expect(JSON.stringify(res.body)).not.toContain(SECRET_RESULT);
    expect(JSON.stringify(res.body)).not.toContain(SECRET_DROP);
  });

  it("still refuses a mentor", async () => {
    expect((await get("/me/season-history", tokens.mentor)).status).toBe(403);
  });
});

describe("GET /me/seasons/:seasonId", () => {
  it("returns a strict, reason-free record", async () => {
    const res = await get(`/me/seasons/${seasons.passed.id}`, tokens.student);
    expect(res.status).toBe(200);
    const { record } = res.body.data;
    const parsed = seasonRecordSchema.parse(record);
    expect(parsed.outcome).toBe("PASSED");
    expect(parsed.season.code).toBe(seasons.passed.code);
    expect(parsed.groupName).toBe("Rec Group");
    expect(parsed.attendancePct).toBe(50); // 2 of 4 sessions
    // Each row counts its parts: the reviewed essay is done, the unwatched video is not.
    expect(parsed.assignments.map((a) => [a.title, a.status, a.partsDone, a.partsTotal]).sort()).toEqual([
      ["Rec A1", "REVIEWED", 1, 2],
      ["Rec A2", "PENDING", 0, 1],
    ]);
    expect(parsed.attendance.map((a) => a.status)).toEqual(["PRESENT", "LATE", "ABSENT", null]);
    const text = JSON.stringify(res.body);
    for (const secret of [SECRET_RESULT, SECRET_DROP, SECRET_NOTE]) expect(text).not.toContain(secret);
  });

  it("maps quiz states, with score null until graded", async () => {
    const res = await get(`/me/seasons/${seasons.passed.id}`, tokens.student);
    const quizzes = new Map<number, { status: string; score: number | null }>(
      res.body.data.record.quizzes.map((q: { id: number; status: string; score: number | null }) => [q.id, q]),
    );
    expect(quizzes.size).toBe(4); // the unpublished quiz is hidden
    expect(quizzes.get(quizIds.notTaken)).toMatchObject({ status: "NOT_TAKEN", score: null });
    expect(quizzes.get(quizIds.progress)).toMatchObject({ status: "IN_PROGRESS", score: null });
    expect(quizzes.get(quizIds.submitted)).toMatchObject({ status: "SUBMITTED", score: null });
    expect(quizzes.get(quizIds.graded)).toMatchObject({
      status: "GRADED",
      score: 7,
      adminScore: { score: 7, notes: null },
    });
    expect(quizzes.get(quizIds.submitted)).toMatchObject({ adminScore: null });
  });

  it("reads a paper grade with decimals back as a number", async () => {
    const enrolment = await db.seasonEnrollment.findFirstOrThrow({
      where: { seasonId: seasons.completed.id },
      select: { studentUserId: true },
    });
    const paper = await db.quiz.create({
      data: { seasonId: seasons.completed.id, title: "Rec paper", kind: "PAPER", maxScore: 20 },
      select: { id: true },
    });
    await db.quizGrade.create({ data: { quizId: paper.id, studentUserId: enrolment.studentUserId, score: 12.75 } });
    const res = await get(`/me/seasons/${seasons.completed.id}`, tokens.student);
    const row = res.body.data.record.quizzes.find((q: { id: number }) => q.id === paper.id);
    expect(row).toMatchObject({ status: "GRADED", score: 12.75 });
  });

  it("shows a dropped enrolment as DROPPED, a result-less one as COMPLETED", async () => {
    const a = await get(`/me/seasons/${seasons.dropped.id}`, tokens.student);
    expect(a.body.data.record.outcome).toBe("DROPPED");
    expect(JSON.stringify(a.body)).not.toContain(SECRET_DROP);
    const b = await get(`/me/seasons/${seasons.completed.id}`, tokens.student);
    expect(b.body.data.record.outcome).toBe("COMPLETED");
  });

  it("404 not_found with no enrolment, for a deleted season, an unknown id, and a still-ACTIVE enrolment", async () => {
    for (const id of [seasons.passed.id]) {
      const r = await get(`/me/seasons/${id}`, tokens.stranger);
      expect(r.status).toBe(404);
      expect(r.body.error.code).toBe("not_found");
    }
    for (const id of [seasons.deletedSeason.id, seasons.current.id, seasons.draft.id, 999999999]) {
      const r = await get(`/me/seasons/${id}`, tokens.student);
      expect(r.status).toBe(404);
      expect(r.body.error.code).toBe("not_found");
    }
  });

  it("403 for other roles, 404 for a malformed id", async () => {
    expect((await get(`/me/seasons/${seasons.passed.id}`, tokens.mentor)).status).toBe(403);
    expect((await get(`/me/seasons/abc`, tokens.student)).status).toBe(404);
  });
});
