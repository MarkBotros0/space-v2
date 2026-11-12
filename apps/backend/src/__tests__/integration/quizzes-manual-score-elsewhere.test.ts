import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { quizParticipation } from "../../lib/queries/quiz-participation";
import { loadSeasonEndCheck } from "../../lib/queries/season-end";
import { addQuizQuestion } from "../../lib/quizzes/questions";
import { bearer, cleanupTestData } from "./fixtures";
import { buildPublishedQuizIn, seedQuizFixtures, setLatestAttempt, type QuizFixtures } from "./quizzes-setup";

jest.setTimeout(60000);

/*
 * The admin's score (plan 4) outside the score readers: season End, unpublishing, the student's
 * participation figure, the question freeze's own re-check and the grade response.
 */

const app = createApp();
let f: QuizFixtures;

beforeAll(async () => {
  f = await seedQuizFixtures(app);
});

afterAll(async () => {
  await cleanupTestData();
});

/** An ONLINE quiz out of 10 (choice 2, essay 5, multi 3), answers held. */
function onlineQuiz() {
  return buildPublishedQuizIn(f.seasonId, f.sessionId, {
    withEssay: true,
    withTypes: ["MULTI_CHOICE"],
    released: false,
  });
}

function putScore(quizId: number, studentUserId: number, score: number) {
  return request(app)
    .put(`/api/v1/quizzes/${quizId}/manual-scores/${studentUserId}`)
    .set(bearer(f.adminToken))
    .send({ score, notes: null });
}

async function submittedAttempt(quizId: number, studentUserId: number): Promise<number> {
  await db.quizAttempt.create({ data: { quizId, studentUserId, attemptNumber: 1, shuffleSeed: 1 } });
  return setLatestAttempt(quizId, studentUserId, { status: "SUBMITTED" });
}

describe("the admin's score outside the score readers", () => {
  it("a SUBMITTED attempt does not block season End once the student has an admin score", async () => {
    const { quizId } = await onlineQuiz();
    const attemptId = await submittedAttempt(quizId, f.ownStudentId);
    const blocking = async () =>
      (await loadSeasonEndCheck(f.seasonId, new Date())).blockers.quizAttempts.some((a) => a.attemptId === attemptId);

    expect(await blocking()).toBe(true);
    expect((await putScore(quizId, f.ownStudentId, 6)).status).toBe(200);
    expect(await blocking()).toBe(false);
  });

  it("unpublishing is refused once a student has an admin score", async () => {
    const { quizId } = await onlineQuiz();
    await putScore(quizId, f.ownStudentId, 6);
    const res = await request(app)
      .post(`/api/v1/quizzes/${quizId}/publish`)
      .set(bearer(f.adminToken))
      .send({ publish: false });
    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({
      code: "quiz_has_graded_attempts",
      message: "Students have scores for this quiz; unpublishing would hide them.",
    });
    expect((await db.quiz.findUniqueOrThrow({ where: { id: quizId } })).publishedAt).not.toBeNull();
  });

  it("an admin score counts as having taken the quiz", async () => {
    const before = await quizParticipation(f.seasonId, f.ownStudentId);
    const { quizId } = await onlineQuiz();
    const given = await quizParticipation(f.seasonId, f.ownStudentId);
    expect(given.quizzesGiven).toBe(before.quizzesGiven + 1);
    expect(given.quizzesTaken).toBe(before.quizzesTaken);

    await putScore(quizId, f.ownStudentId, 6);
    expect((await quizParticipation(f.seasonId, f.ownStudentId)).quizzesTaken).toBe(before.quizzesTaken + 1);
  });

  it("a question write re-checks for attempts inside its transaction", async () => {
    // The route refuses first; this is the service's own re-check, for a start landing in between.
    const { quizId } = await onlineQuiz();
    await submittedAttempt(quizId, f.ownStudentId);
    await expect(
      addQuizQuestion(quizId, { type: "TRUE_FALSE", prompt: "Late question", points: 1, correct: true }),
    ).rejects.toMatchObject({ code: "quiz_has_attempts" });
    expect(await db.quizQuestion.count({ where: { quizId } })).toBe(3);
  });

  it("the grade response carries the admin score, which bestScore follows", async () => {
    const { quizId, essayId } = await onlineQuiz();
    const attemptId = await submittedAttempt(quizId, f.ownStudentId);
    // A written essay: an empty one is already wrong and takes no mark.
    await db.quizAnswer.create({ data: { attemptId, questionId: essayId, text: "My essay." } });
    await putScore(quizId, f.ownStudentId, 4);

    const res = await request(app)
      .post(`/api/v1/quizzes/${quizId}/attempts/${attemptId}/grade`)
      .set(bearer(f.leaderToken))
      .send({ marks: [{ questionId: essayId, blankId: null, correct: true }] });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: "GRADED", bestScore: 4, adminScore: { score: 4, notes: null } });
    expect(res.body.data.adminScore.gradedByName).toBe("Test admin");
    expect(typeof res.body.data.adminScore.gradedAt).toBe("string");
  });
});
