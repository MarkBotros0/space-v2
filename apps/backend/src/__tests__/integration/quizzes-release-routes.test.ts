import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { bearer, cleanupTestData } from "./fixtures";
import { buildPublishedQuizIn, keyOf, quizGradedCountFor, seedQuizFixtures, type QuizFixtures } from "./quizzes-setup";

jest.setTimeout(60000);

const app = createApp();
let f: QuizFixtures;

beforeAll(async () => {
  f = await seedQuizFixtures(app);
});

afterAll(async () => {
  await cleanupTestData();
});

/** The student answers the single-choice question right and hands it in: graded on the spot, answers held. */
async function takeHeldQuiz() {
  const built = await buildPublishedQuizIn(f.seasonId, f.sessionId, { withEssay: false, released: false });
  await request(app).put(`/api/v1/quizzes/${built.quizId}/attempt`).set(bearer(f.studentToken));
  await request(app)
    .patch(`/api/v1/quizzes/${built.quizId}/attempt`)
    .set(bearer(f.studentToken))
    .send({
      answers: [
        { type: "SINGLE_CHOICE", questionId: built.mcqId, optionId: (await keyOf(built.mcqId)).optionId("Paris") },
      ],
    });
  const submit = await request(app).post(`/api/v1/quizzes/${built.quizId}/attempt/submit`).set(bearer(f.studentToken));
  return { ...built, submit };
}

/** The student's own row in the results list for a quiz. */
async function listedRow(quizId: number) {
  const list = await request(app).get(`/api/v1/quizzes?seasonId=${f.seasonId}`).set(bearer(f.studentToken));
  return list.body.data.items.find((r: { quizId: number }) => r.quizId === quizId);
}

/** Adds a later attempt for the student straight in the database, as a retake would leave it. */
async function addAttempt(quizId: number, attemptNumber: number, status: "GRADED" | "SUBMITTED", totalScore: number) {
  const now = new Date();
  await db.quizAttempt.create({
    data:
      status === "GRADED"
        ? {
            quizId,
            studentUserId: f.ownStudentId,
            attemptNumber,
            status,
            autoScore: totalScore,
            manualScore: 0,
            totalScore,
            submittedAt: now,
            gradedAt: now,
          }
        : { quizId, studentUserId: f.ownStudentId, attemptNumber, status, submittedAt: now },
  });
}

describe("answers released (owner, 2026-11-07; spec 2026-11-10)", () => {
  it("student sees score once graded without release", async () => {
    const before = await quizGradedCountFor(f.ownStudentId);
    const { quizId, submit } = await takeHeldQuiz();

    expect(submit.status).toBe(200);
    // Graded, with the score visible and nothing of the questions or answers.
    expect(submit.body.data).toMatchObject({
      stage: "graded",
      status: "GRADED",
      totalScore: 2,
      answersReleased: false,
    });
    expect(submit.body.data.questions).toEqual([]);

    const row = await listedRow(quizId);
    expect(row).toMatchObject({ attemptStatus: "GRADED", score: 2, answersReleased: false });
    expect(row.gradedAt).not.toBeNull();

    // "Your score is in" went out on the grade, release or not.
    expect((await quizGradedCountFor(f.ownStudentId)) - before).toBe(1);
  });

  it("lets staff see the hold and who may lift it", async () => {
    const { quizId } = await takeHeldQuiz();
    const admin = await request(app).get(`/api/v1/quizzes/${quizId}`).set(bearer(f.adminToken));
    expect(admin.body.data).toMatchObject({ answersReleasedAt: null, canReleaseResults: true });
    const leader = await request(app).get(`/api/v1/quizzes/${quizId}`).set(bearer(f.leaderToken));
    expect(leader.body.data).toMatchObject({ answersReleasedAt: null, canReleaseResults: false });
  });

  it("is released only by the season's admin or a super", async () => {
    const { quizId } = await takeHeldQuiz();
    for (const token of [f.leaderToken, f.studentToken, f.otherAdminToken]) {
      const res = await request(app).post(`/api/v1/quizzes/${quizId}/release`).set(bearer(token));
      expect(res.status).toBe(403);
    }
    const res = await request(app).post(`/api/v1/quizzes/${quizId}/release`).set(bearer(f.superToken));
    expect(res.status).toBe(200);
    expect(typeof res.body.data.answersReleasedAt).toBe("string");
  });

  it('release sends "Answers are out" once and is one-way', async () => {
    const { quizId } = await takeHeldQuiz();
    const before = await quizGradedCountFor(f.ownStudentId);

    const first = await request(app).post(`/api/v1/quizzes/${quizId}/release`).set(bearer(f.adminToken));
    expect(first.status).toBe(200);
    const again = await request(app).post(`/api/v1/quizzes/${quizId}/release`).set(bearer(f.adminToken));
    expect(again.body.data.answersReleasedAt).toBe(first.body.data.answersReleasedAt);
    expect((await quizGradedCountFor(f.ownStudentId)) - before).toBe(1);
    const sent = await db.notification.findFirstOrThrow({
      where: { userId: f.ownStudentId, type: "QUIZ_GRADED", title: { startsWith: "Answers are out" } },
    });
    expect(sent.link).toBe("/student/quizzes");

    const detail = await request(app).get(`/api/v1/quizzes/${quizId}`).set(bearer(f.studentToken));
    expect(detail.body.data).toMatchObject({
      stage: "answers",
      status: "GRADED",
      totalScore: 2,
      answersReleased: true,
    });
    expect(detail.body.data.questions[0]).toMatchObject({ pointsAwarded: 2 });

    // One way: a release cannot be taken back, and there is no route to try.
    const stored = await db.quiz.findUniqueOrThrow({ where: { id: quizId }, select: { resultsReleasedAt: true } });
    expect(stored.resultsReleasedAt).not.toBeNull();
  });

  it("refuses an unpublished quiz", async () => {
    const quiz = await db.quiz.create({
      data: { seasonId: f.seasonId, title: "Draft quiz", kind: "ONLINE", maxScore: 0 },
      select: { id: true },
    });
    const res = await request(app).post(`/api/v1/quizzes/${quiz.id}/release`).set(bearer(f.adminToken));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("quiz_not_published");
  });

  it("paper grade visible to the student once entered", async () => {
    const quiz = await db.quiz.create({
      data: { seasonId: f.seasonId, title: "Paper no release", kind: "PAPER", maxScore: 10 },
      select: { id: true },
    });
    expect(await listedRow(quiz.id)).toBeUndefined();
    await db.quizGrade.create({ data: { quizId: quiz.id, studentUserId: f.ownStudentId, score: 7 } });
    expect(await listedRow(quiz.id)).toMatchObject({ kind: "PAPER", score: 7, answersReleased: true });
  });
});

describe("the best attempt counts (spec: honest accidents)", () => {
  it("retake with a lower score keeps the best in the student list", async () => {
    const { quizId } = await takeHeldQuiz();
    await addAttempt(quizId, 2, "GRADED", 1);
    expect(await listedRow(quizId)).toMatchObject({ score: 2 });
    const detail = await request(app).get(`/api/v1/quizzes/${quizId}`).set(bearer(f.studentToken));
    expect(detail.body.data).toMatchObject({ totalScore: 2 });
  });

  it("retake with a higher score replaces it", async () => {
    const { quizId } = await takeHeldQuiz();
    await addAttempt(quizId, 2, "GRADED", 2.5);
    expect(await listedRow(quizId)).toMatchObject({ score: 2.5 });
  });

  it("an ungraded retake does not hide the best graded score", async () => {
    const { quizId } = await takeHeldQuiz();
    await addAttempt(quizId, 2, "SUBMITTED", 0);
    expect(await listedRow(quizId)).toMatchObject({ score: 2, attemptStatus: "SUBMITTED" });
  });

  it("the answers stage shows the best graded attempt's answers, not the latest", async () => {
    const { quizId, mcqId } = await takeHeldQuiz();
    // A second attempt that picked London and scored 0 is the latest graded attempt.
    const london = (await keyOf(mcqId)).optionId("London");
    await addAttempt(quizId, 2, "GRADED", 0);
    const second = await db.quizAttempt.findFirstOrThrow({
      where: { quizId, studentUserId: f.ownStudentId, attemptNumber: 2 },
      select: { id: true },
    });
    await db.quizAnswer.create({
      data: {
        attemptId: second.id,
        questionId: mcqId,
        isCorrect: false,
        pointsAwarded: 0,
        selections: { create: { optionId: london } },
      },
    });
    await request(app).post(`/api/v1/quizzes/${quizId}/release`).set(bearer(f.adminToken));

    const detail = await request(app).get(`/api/v1/quizzes/${quizId}`).set(bearer(f.studentToken));
    expect(detail.body.data).toMatchObject({ stage: "answers", totalScore: 2 });
    // The first attempt picked Paris and earned the 2 points.
    expect(detail.body.data.questions[0]).toMatchObject({ pointsAwarded: 2 });
  });

  it("a retaken student counts once in gradedCount", async () => {
    const { quizId } = await takeHeldQuiz();
    await addAttempt(quizId, 2, "GRADED", 1);
    await addAttempt(quizId, 3, "GRADED", 2);
    const list = await request(app).get(`/api/v1/quizzes?seasonId=${f.seasonId}`).set(bearer(f.adminToken));
    const row = list.body.data.items.find((q: { id: number }) => q.id === quizId);
    expect(row.gradedCount).toBe(1);
  });
});
