import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { cleanupTestData } from "./fixtures";
import { quizGradedCountFor, seedQuizFixtures } from "./quizzes-setup";

// Same reason as the submissions suite: the shared Neon staging Postgres
// autosuspends, and the first query after idling has been measured at ~18s.
jest.setTimeout(60000);

const app = createApp();

let seasonId: number;
let sessionId: number;
let ownStudentId: number;
let otherGroupStudentId: number;
let adminToken: string;
let leaderToken: string;

beforeAll(async () => {
  ({ seasonId, sessionId, ownStudentId, otherGroupStudentId, adminToken, leaderToken } = await seedQuizFixtures(app));
});

afterAll(async () => {
  await cleanupTestData();
});

/** See `quizGradedCountFor` in ./quizzes-setup. */
function quizGradedCount(): Promise<number> {
  return quizGradedCountFor(ownStudentId);
}

describe("ONLINE grading", () => {
  let quizId: number;
  let mcqId: number;
  let essayId: number;
  let attemptId: number;

  beforeEach(async () => {
    const quiz = await db.quiz.create({
      data: {
        seasonId,
        sessionId,
        title: "Graded quiz",
        kind: "ONLINE",
        // Released, so a grade notifies; held results: quizzes-release-routes.
        maxScore: 7,
        publishedAt: new Date(),
        resultsReleasedAt: new Date(),
      },
      select: { id: true },
    });
    quizId = quiz.id;
    const mcq = await db.quizQuestion.create({
      data: {
        quizId,
        order: 0,
        type: "MCQ",
        prompt: "Capital of France?",
        points: 2,
        options: ["London", "Paris"],
        correctIndex: 1,
      },
      select: { id: true },
    });
    const essay = await db.quizQuestion.create({
      data: { quizId, order: 1, type: "ESSAY", prompt: "Discuss.", points: 5, options: [], correctIndex: null },
      select: { id: true },
    });
    mcqId = mcq.id;
    essayId = essay.id;

    const attempt = await db.quizAttempt.create({
      data: {
        quizId,
        studentUserId: ownStudentId,
        attemptNumber: 1,
        status: "SUBMITTED",
        autoScore: 2,
        submittedAt: new Date(),
        answers: {
          create: [
            { questionId: mcqId, selectedIndex: 1, isCorrect: true, pointsAwarded: 2 },
            { questionId: essayId, text: "Because of the river." },
          ],
        },
      },
      select: { id: true },
    });
    attemptId = attempt.id;
  });

  it("lists attempts for the caller's own students, never a client-supplied set", async () => {
    const res = await request(app)
      .get(`/api/v1/quizzes/${quizId}/attempts`)
      .set("authorization", `Bearer ${leaderToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0]).toMatchObject({
      attemptId,
      studentUserId: ownStudentId,
      status: "SUBMITTED",
      autoScore: 2,
    });
    // The grader gets the answer key — correct for this audience (R103).
    const mcqAnswer = res.body.data.items[0].answers.find((a: { questionId: number }) => a.questionId === mcqId);
    expect(mcqAnswer.correctIndex).toBe(1);
    // Leader scope = their own group only, so the other group's student is not
    // in the population at all.
    expect(res.body.data.studentCount).toBe(1);
  });

  it("shows a student whose latest attempt is still in progress instead of hiding them (R102, D5)", async () => {
    await db.quizAttempt.update({ where: { id: attemptId }, data: { status: "IN_PROGRESS" } });

    const res = await request(app)
      .get(`/api/v1/quizzes/${quizId}/attempts`)
      .set("authorization", `Bearer ${leaderToken}`);

    expect(res.status).toBe(200);
    // v1's read filtered to SUBMITTED|GRADED and took one row per student, so a
    // student with an in-progress attempt vanished from the grading list — as
    // did any student an admin had just granted a retake to, whose earlier
    // graded attempt disappeared behind the new one.
    expect(res.body.data.items).toHaveLength(0);
    expect(res.body.data.waiting).toEqual([expect.objectContaining({ studentUserId: ownStudentId })]);
    expect(res.body.data.waiting[0].startedAt).not.toBeNull();
  });

  it("lists a never-started student as waiting with a null startedAt", async () => {
    const res = await request(app)
      .get(`/api/v1/quizzes/${quizId}/attempts`)
      .set("authorization", `Bearer ${adminToken}`);
    // The admin's scope is the whole season: our student (SUBMITTED) plus the
    // other group's student, who has not started.
    expect(res.body.data.studentCount).toBe(2);
    expect(res.body.data.waiting).toEqual([
      expect.objectContaining({ studentUserId: otherGroupStudentId, startedAt: null }),
    ]);
  });

  it("grades essays, requires every essay, and rejects an over-max award", async () => {
    const before = await quizGradedCount();
    const incomplete = await request(app)
      .post(`/api/v1/quizzes/${quizId}/attempts/${attemptId}/grade`)
      .set("authorization", `Bearer ${leaderToken}`)
      .send({ awards: [{ questionId: mcqId, points: 2 }] });
    // Awards naming a non-essay question were silently skipped in v1 (R71),
    // and manualScore was recomputed from only what arrived, so a partial
    // payload quietly lowered the total (R72).
    expect(incomplete.status).toBe(400);
    expect(incomplete.body.error.code).toBe("awards_incomplete");

    const tooHigh = await request(app)
      .post(`/api/v1/quizzes/${quizId}/attempts/${attemptId}/grade`)
      .set("authorization", `Bearer ${leaderToken}`)
      .send({ awards: [{ questionId: essayId, points: 99 }] });
    // v1 clamped silently (R70); D8 says reject, so a miskey is visible.
    expect(tooHigh.status).toBe(400);
    expect(tooHigh.body.error.code).toBe("score_exceeds_max");

    const ok = await request(app)
      .post(`/api/v1/quizzes/${quizId}/attempts/${attemptId}/grade`)
      .set("authorization", `Bearer ${leaderToken}`)
      .send({ awards: [{ questionId: essayId, points: 4 }] });
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({
      status: "GRADED",
      autoScore: 2,
      manualScore: 4,
      totalScore: 6,
    });
    expect(ok.body.data.gradedByName).toBe("Test leader");

    expect((await quizGradedCount()) - before).toBe(1);

    // A re-save at the same total is a no-op for the student (D8's unified
    // rule: notify on a first grade and on a score change, silent otherwise —
    // v1's two paths disagreed, R75 vs R92).
    await request(app)
      .post(`/api/v1/quizzes/${quizId}/attempts/${attemptId}/grade`)
      .set("authorization", `Bearer ${leaderToken}`)
      .send({ awards: [{ questionId: essayId, points: 4 }] });
    expect((await quizGradedCount()) - before).toBe(1);

    // A changed total does notify again.
    await request(app)
      .post(`/api/v1/quizzes/${quizId}/attempts/${attemptId}/grade`)
      .set("authorization", `Bearer ${leaderToken}`)
      .send({ awards: [{ questionId: essayId, points: 5 }] });
    expect((await quizGradedCount()) - before).toBe(2);
  });

  it("refuses grading an attempt whose student is outside the caller's scope (R68)", async () => {
    const strangerAttempt = await db.quizAttempt.create({
      data: {
        quizId,
        studentUserId: otherGroupStudentId,
        attemptNumber: 1,
        status: "SUBMITTED",
        autoScore: 0,
        submittedAt: new Date(),
        answers: { create: [{ questionId: essayId, text: "Mine." }] },
      },
      select: { id: true },
    });

    const res = await request(app)
      .post(`/api/v1/quizzes/${quizId}/attempts/${strangerAttempt.id}/grade`)
      .set("authorization", `Bearer ${leaderToken}`)
      .send({ awards: [{ questionId: essayId, points: 1 }] });
    // v1's gate was season-wide with no group check at all, so a leader could
    // grade any student in the season, including another leader's.
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("student_not_in_scope");
  });

  it("refuses grading an attempt that is still in progress (R69)", async () => {
    await db.quizAttempt.update({ where: { id: attemptId }, data: { status: "IN_PROGRESS" } });
    const res = await request(app)
      .post(`/api/v1/quizzes/${quizId}/attempts/${attemptId}/grade`)
      .set("authorization", `Bearer ${leaderToken}`)
      .send({ awards: [{ questionId: essayId, points: 1 }] });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("attempt_not_submitted");
  });

  it("lets a LEADER reopen an attempt, and tells the student (D5)", async () => {
    await db.quizAttempt.update({
      where: { id: attemptId },
      data: { status: "GRADED", manualScore: 4, totalScore: 6, gradedAt: new Date() },
    });
    const before = await quizGradedCount();

    const res = await request(app)
      .post(`/api/v1/quizzes/${quizId}/attempts/reopen`)
      .set("authorization", `Bearer ${leaderToken}`)
      .send({ studentUserId: ownStudentId });

    // v1 gated reopen on canManageQuiz — admin only — so the leader looking at
    // the grading screen could see a stuck student and do nothing about it.
    expect(res.status).toBe(201);
    expect(res.body.data.attemptNumber).toBe(2);

    const attempts = await db.quizAttempt.findMany({
      where: { quizId, studentUserId: ownStudentId },
      orderBy: { attemptNumber: "asc" },
      select: { attemptNumber: true, status: true, totalScore: true },
    });
    // History is preserved: the graded attempt is untouched (R81).
    expect(attempts).toHaveLength(2);
    expect(attempts[0]).toMatchObject({ attemptNumber: 1, status: "GRADED", totalScore: 6 });
    expect(attempts[1]).toMatchObject({ attemptNumber: 2, status: "IN_PROGRESS" });

    // v1 sent NOTHING on reopen — the student was never told they had a retake.
    expect((await quizGradedCount()) - before).toBe(1);
  });

  it("reopens a SUBMITTED attempt, then refuses while that one is open", async () => {
    // v1's action allowed reopening a SUBMITTED (ungraded) attempt — its only
    // status check was `!== IN_PROGRESS` — while its UI offered the control
    // only for GRADED (R82). The action's rule is the real one and is kept: a
    // student who submitted and needs another go should not have to wait for
    // someone to grade the attempt first.
    const first = await request(app)
      .post(`/api/v1/quizzes/${quizId}/attempts/reopen`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ studentUserId: ownStudentId });
    expect(first.status).toBe(201);
    expect(first.body.data.attemptNumber).toBe(2);

    // Attempt 2 is now IN_PROGRESS, so a second reopen would create a third
    // live attempt for one student.
    const second = await request(app)
      .post(`/api/v1/quizzes/${quizId}/attempts/reopen`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ studentUserId: ownStudentId });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("attempt_open");
  });

  it("refuses reopening for a student outside the caller's scope", async () => {
    const res = await request(app)
      .post(`/api/v1/quizzes/${quizId}/attempts/reopen`)
      .set("authorization", `Bearer ${leaderToken}`)
      .send({ studentUserId: otherGroupStudentId });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("student_not_in_scope");
  });

  it("refuses reopening when the student has never attempted", async () => {
    const res = await request(app)
      .post(`/api/v1/quizzes/${quizId}/attempts/reopen`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ studentUserId: otherGroupStudentId });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("no_attempt");
  });
});
