import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { cleanupTestData } from "./fixtures";
import { buildPublishedQuizIn, quizGradedCountFor, seedQuizFixtures, type QuizFixtures } from "./quizzes-setup";

jest.setTimeout(60000);

const app = createApp();
let f: QuizFixtures;

beforeAll(async () => {
  f = await seedQuizFixtures(app);
});

afterAll(async () => {
  await cleanupTestData();
});

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

/** The student answers the MCQ right and hands it in: graded on the spot, results held. */
async function takeHeldQuiz() {
  const built = await buildPublishedQuizIn(f.seasonId, f.sessionId, { withEssay: false, released: false });
  await request(app).put(`/api/v1/quizzes/${built.quizId}/attempt`).set(bearer(f.studentToken));
  await request(app)
    .patch(`/api/v1/quizzes/${built.quizId}/attempt`)
    .set(bearer(f.studentToken))
    .send({ answers: [{ questionId: built.mcqId, selectedIndex: 1, text: null }] });
  const submit = await request(app)
    .post(`/api/v1/quizzes/${built.quizId}/attempt/submit`)
    .set(bearer(f.studentToken));
  return { ...built, submit };
}

describe("held quiz results (owner, 2026-11-07)", () => {
  it("hides the marking from the student until released, and stays quiet", async () => {
    const before = await quizGradedCountFor(f.ownStudentId);
    const { quizId, submit } = await takeHeldQuiz();

    expect(submit.status).toBe(200);
    // Graded underneath, handed in on the student's side.
    expect(submit.body.data).toMatchObject({ status: "SUBMITTED", totalScore: null, gradedAt: null, resultsReleased: false });
    expect(submit.body.data.questions[0]).toMatchObject({ selectedIndex: 1, isCorrect: null, pointsAwarded: null });
    const stored = await db.quizAttempt.findFirst({ where: { quizId }, select: { status: true, totalScore: true } });
    expect(stored).toEqual({ status: "GRADED", totalScore: 2 });

    const list = await request(app)
      .get(`/api/v1/quizzes?seasonId=${f.seasonId}`)
      .set(bearer(f.studentToken));
    const row = list.body.data.items.find((r: { quizId: number }) => r.quizId === quizId);
    expect(row).toMatchObject({ attemptStatus: "SUBMITTED", score: null, gradedAt: null, resultsReleased: false });

    expect((await quizGradedCountFor(f.ownStudentId)) - before).toBe(0);
  });

  it("lets staff see the hold and who may lift it", async () => {
    const { quizId } = await takeHeldQuiz();
    const admin = await request(app).get(`/api/v1/quizzes/${quizId}`).set(bearer(f.adminToken));
    expect(admin.body.data).toMatchObject({ resultsReleasedAt: null, canReleaseResults: true });
    const leader = await request(app).get(`/api/v1/quizzes/${quizId}`).set(bearer(f.leaderToken));
    expect(leader.body.data).toMatchObject({ resultsReleasedAt: null, canReleaseResults: false });
  });

  it("is released only by the season's admin or a super", async () => {
    const { quizId } = await takeHeldQuiz();
    for (const token of [f.leaderToken, f.studentToken, f.otherAdminToken]) {
      const res = await request(app).post(`/api/v1/quizzes/${quizId}/release`).set(bearer(token));
      expect(res.status).toBe(403);
    }
    const res = await request(app).post(`/api/v1/quizzes/${quizId}/release`).set(bearer(f.superToken));
    expect(res.status).toBe(200);
    expect(typeof res.body.data.resultsReleasedAt).toBe("string");
  });

  it("shows the score once released, notifying once", async () => {
    const before = await quizGradedCountFor(f.ownStudentId);
    const { quizId } = await takeHeldQuiz();

    const first = await request(app).post(`/api/v1/quizzes/${quizId}/release`).set(bearer(f.adminToken));
    expect(first.status).toBe(200);
    const again = await request(app).post(`/api/v1/quizzes/${quizId}/release`).set(bearer(f.adminToken));
    expect(again.body.data.resultsReleasedAt).toBe(first.body.data.resultsReleasedAt);
    expect((await quizGradedCountFor(f.ownStudentId)) - before).toBe(1);

    const detail = await request(app).get(`/api/v1/quizzes/${quizId}`).set(bearer(f.studentToken));
    expect(detail.body.data).toMatchObject({ status: "GRADED", totalScore: 2, resultsReleased: true });
    expect(detail.body.data.questions[0]).toMatchObject({ isCorrect: true, pointsAwarded: 2 });
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

  it("keeps a held paper grade off the student's list", async () => {
    const quiz = await db.quiz.create({
      data: { seasonId: f.seasonId, title: "Held paper", kind: "PAPER", maxScore: 10 },
      select: { id: true },
    });
    await db.quizGrade.create({ data: { quizId: quiz.id, studentUserId: f.ownStudentId, score: 7 } });
    const listed = async () =>
      (await request(app).get(`/api/v1/quizzes?seasonId=${f.seasonId}`).set(bearer(f.studentToken))).body.data.items.find(
        (r: { quizId: number }) => r.quizId === quiz.id,
      );
    expect(await listed()).toBeUndefined();
    await request(app).post(`/api/v1/quizzes/${quiz.id}/release`).set(bearer(f.adminToken));
    expect(await listed()).toMatchObject({ score: 7, resultsReleased: true });
  });
});
