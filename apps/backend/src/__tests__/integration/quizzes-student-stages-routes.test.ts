import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { bearer, cleanupTestData } from "./fixtures";
import {
  buildPublishedQuizIn,
  pickOption,
  seedQuizFixtures,
  setLatestAttempt,
  type QuizFixtures,
} from "./quizzes-setup";

// The student's read of an ONLINE quiz, stage by stage, and its shuffle. The
// raw-JSON answer-key guard across every pre-release stage is in
// quizzes-attempts-routes ("never lets the answer key reach a student").
jest.setTimeout(60000);

const app = createApp();
let f: QuizFixtures;

beforeAll(async () => {
  f = await seedQuizFixtures(app);
});

afterAll(async () => {
  await cleanupTestData();
});

type Shown = { id: number };
type Question = { id: number; options?: Shown[]; left?: Shown[]; right?: Shown[] };

/** Question ids, and every list of option ids, in the order the student sees them. */
function orderOf(questions: Question[]) {
  return questions.map((q) => ({
    id: q.id,
    options: q.options?.map((o) => o.id),
    left: q.left?.map((o) => o.id),
    right: q.right?.map((o) => o.id),
  }));
}

const start = (quizId: number) => request(app).put(`/api/v1/quizzes/${quizId}/attempt`).set(bearer(f.studentToken));
const read = (quizId: number) => request(app).get(`/api/v1/quizzes/${quizId}`).set(bearer(f.studentToken));

describe("the student's quiz read: order", () => {
  it("is stable across reads of one attempt", async () => {
    const quiz = await buildPublishedQuizIn(f.seasonId, f.sessionId, {
      withEssay: true,
      withTypes: ["MULTI_CHOICE", "TRUE_FALSE", "MATCHING", "FILL_BLANK"],
    });
    const started = await start(quiz.quizId);
    expect(started.status).toBe(200);
    const first = await read(quiz.quizId);
    const second = await read(quiz.quizId);
    expect(orderOf(first.body.data.questions)).toEqual(orderOf(started.body.data.questions));
    expect(orderOf(second.body.data.questions)).toEqual(orderOf(first.body.data.questions));
  });

  it("reshuffles a retake: the reopened attempt gets its own seed", async () => {
    const quiz = await buildPublishedQuizIn(f.seasonId, f.sessionId, { withEssay: false });
    await start(quiz.quizId);
    await setLatestAttempt(quiz.quizId, f.ownStudentId, { status: "SUBMITTED" });

    const reopened = await request(app)
      .post(`/api/v1/quizzes/${quiz.quizId}/attempts/reopen`)
      .set(bearer(f.leaderToken))
      .send({ studentUserId: f.ownStudentId });
    expect(reopened.status).toBe(201);
    const retake = await start(quiz.quizId);
    expect(retake.body.data).toMatchObject({ stage: "in_progress", attemptNumber: 2 });

    const seeds = await db.quizAttempt.findMany({
      where: { quizId: quiz.quizId, studentUserId: f.ownStudentId },
      orderBy: { attemptNumber: "asc" },
      select: { shuffleSeed: true },
    });
    expect(seeds).toHaveLength(2);
    expect(seeds[0]?.shuffleSeed).not.toBe(0);
    expect(seeds[1]?.shuffleSeed).not.toBe(0);
    expect(seeds[1]?.shuffleSeed).not.toBe(seeds[0]?.shuffleSeed);
  });

  it("keeps the author's question order when shuffleQuestions is off", async () => {
    const quiz = await buildPublishedQuizIn(f.seasonId, f.sessionId, {
      withEssay: true,
      withTypes: ["MULTI_CHOICE", "TRUE_FALSE", "MATCHING", "FILL_BLANK"],
    });
    await db.quiz.update({ where: { id: quiz.quizId }, data: { shuffleQuestions: false } });
    const started = await start(quiz.quizId);
    expect(started.body.data.questions.map((q: Question) => q.id)).toEqual(quiz.questionIds);
  });
});

describe("the student's quiz read: stages", () => {
  it("carries no questions once submitted and unmarked", async () => {
    const quiz = await buildPublishedQuizIn(f.seasonId, f.sessionId, { withEssay: true, released: false });
    await start(quiz.quizId);
    await setLatestAttempt(quiz.quizId, f.ownStudentId, { status: "SUBMITTED" });
    const res = await read(quiz.quizId);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      stage: "submitted",
      status: "SUBMITTED",
      questions: [],
      totalScore: null,
      gradedAt: null,
      answersReleased: false,
    });
  });

  it("shows the score only once graded, before the answers are released", async () => {
    const quiz = await buildPublishedQuizIn(f.seasonId, f.sessionId, { withEssay: false, released: false });
    await start(quiz.quizId);
    await setLatestAttempt(quiz.quizId, f.ownStudentId, { status: "GRADED", totalScore: 2 });
    const res = await read(quiz.quizId);
    expect(res.body.data).toMatchObject({ stage: "graded", totalScore: 2, questions: [], answersReleased: false });
    expect(typeof res.body.data.gradedAt).toBe("string");
  });

  it("shows the review with the correct answers once released", async () => {
    const quiz = await buildPublishedQuizIn(f.seasonId, f.sessionId, { withEssay: false, released: true });
    await start(quiz.quizId);
    const attemptId = await setLatestAttempt(quiz.quizId, f.ownStudentId, { status: "GRADED", totalScore: 0 });
    const londonId = await pickOption(attemptId, quiz.mcqId, "London", { isCorrect: false, pointsAwarded: 0 });
    const paris = await db.quizOption.findFirstOrThrow({
      where: { questionId: quiz.mcqId, label: "Paris" },
      select: { id: true },
    });

    const res = await read(quiz.quizId);
    expect(res.body.data).toMatchObject({ stage: "answers", totalScore: 0, answersReleased: true });
    expect(res.body.data.questions).toHaveLength(1);
    expect(res.body.data.questions[0]).toMatchObject({
      id: quiz.mcqId,
      type: "SINGLE_CHOICE",
      prompt: "Capital of France?",
      answer: { optionId: londonId },
      pointsAwarded: 0,
      review: { correctOptionIds: [paris.id] },
    });
  });
});
