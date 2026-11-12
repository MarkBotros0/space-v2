import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { closeAttempt } from "../../lib/quizzes/close-attempt";
import { gradeAttempt } from "../../lib/quizzes/grading";
import { addQuizQuestion } from "../../lib/quizzes/questions";
import { toScore } from "../../lib/quizzes/score";
import { bearer, cleanupTestData } from "./fixtures";
import { buildPublishedQuizIn, keyOf, quizGradedCountFor, seedQuizFixtures, type QuizFixtures } from "./quizzes-setup";

/*
 * Marking an attempt closed with questions left empty (ruling C-a): an empty
 * blank or essay is wrong at close and never offered for leader marking; the
 * leader marks only what the student wrote. Also C-b (a row for every empty
 * blank) and C-c (two first grades at once notify once).
 */
jest.setTimeout(60000);

const app = createApp();
let f: QuizFixtures;

beforeAll(async () => {
  f = await seedQuizFixtures(app);
});

afterAll(async () => {
  await cleanupTestData();
});

type Mark = { questionId: number; blankId: number | null; correct: boolean };

/** Single choice (2), essay (5), a two-blank fill-in (4): the student opens it and saves `answers`. */
async function openWith(
  answers: (ids: { mcqId: number; essayId: number; fillId: number; blankIds: number[] }) => unknown[],
) {
  const built = await buildPublishedQuizIn(f.seasonId, f.sessionId, { withEssay: true, released: false });
  const fill = await addQuizQuestion(built.quizId, {
    type: "FILL_BLANK",
    prompt: "{{blank}} and {{blank}}.",
    points: 4,
    answers: ["Peter", "John"],
  });
  const ids = {
    mcqId: built.mcqId,
    essayId: built.essayId,
    fillId: fill.id,
    blankIds: (await keyOf(fill.id)).blankIds,
  };
  const student = bearer(f.studentToken);
  await request(app).put(`/api/v1/quizzes/${built.quizId}/attempt`).set(student);
  const body = answers(ids);
  if (body.length > 0) {
    const saved = await request(app)
      .patch(`/api/v1/quizzes/${built.quizId}/attempt`)
      .set(student)
      .send({ answers: body });
    expect(saved.status).toBe(200);
  }
  const attempt = await db.quizAttempt.findFirstOrThrow({
    where: { quizId: built.quizId, studentUserId: f.ownStudentId },
    select: { id: true },
  });
  return { quizId: built.quizId, attemptId: attempt.id, ...ids };
}

const attemptOf = (id: number) =>
  db.quizAttempt.findUniqueOrThrow({
    where: { id },
    select: { status: true, endReason: true, autoScore: true, manualScore: true, totalScore: true },
  });
const grade = (quizId: number, attemptId: number, marks: Mark[]) =>
  request(app).post(`/api/v1/quizzes/${quizId}/attempts/${attemptId}/grade`).set(bearer(f.leaderToken)).send({ marks });
const viewOf = async (quizId: number) => {
  const res = await request(app).get(`/api/v1/quizzes/${quizId}/attempts`).set(bearer(f.leaderToken));
  return res.body.data.items[0].answers as {
    type: string;
    text?: string | null;
    correct?: boolean | null;
    pointsAwarded: number | null;
    blanks?: { text: string | null; correct: boolean | null }[];
  }[];
};

describe("closing with leader-marked questions left empty (C-a, C-b)", () => {
  it("grades at close when every essay and blank is empty, and writes a wrong row for each", async () => {
    const t = await openWith(() => []);
    const before = await quizGradedCountFor(f.ownStudentId);
    expect(await closeAttempt(t.attemptId, "TIMED_OUT", null)).toEqual({ closed: true });

    const attempt = await attemptOf(t.attemptId);
    expect(attempt).toMatchObject({ status: "GRADED", endReason: "TIMED_OUT" });
    expect(toScore(attempt.totalScore)).toBe(0);
    expect(toScore(attempt.manualScore)).toBe(0);

    const essay = await db.quizAnswer.findUniqueOrThrow({
      where: { attemptId_questionId: { attemptId: t.attemptId, questionId: t.essayId } },
      select: { isCorrect: true, pointsAwarded: true },
    });
    expect(essay.isCorrect).toBe(false);
    expect(toScore(essay.pointsAwarded)).toBe(0);
    // C-b: every blank has a row once closed, wrong.
    const blanks = await db.quizAnswerBlank.findMany({
      where: { answer: { attemptId: t.attemptId, questionId: t.fillId } },
      orderBy: { blankId: "asc" },
      select: { blankId: true, text: true, isCorrect: true },
    });
    expect(blanks).toEqual(t.blankIds.map((blankId) => ({ blankId, text: "", isCorrect: false })));
    expect((await quizGradedCountFor(f.ownStudentId)) - before).toBe(1);
  });

  it("waits for the leader only on what the student wrote; an empty item shows wrong and can't be marked", async () => {
    const t = await openWith((ids) => [
      { type: "ESSAY", questionId: ids.essayId, text: "Because." },
      // Blank 1 answered, blank 2 left empty (a row with no text).
      {
        type: "FILL_BLANK",
        questionId: ids.fillId,
        blanks: [
          { blankId: ids.blankIds[0], text: "Peter" },
          { blankId: ids.blankIds[1], text: "  " },
        ],
      },
    ]);
    await closeAttempt(t.attemptId, "TIMED_OUT", null);
    expect((await attemptOf(t.attemptId)).status).toBe("SUBMITTED");

    const [, essay, fill] = await viewOf(t.quizId);
    expect(essay).toMatchObject({ type: "ESSAY", text: "Because.", correct: null });
    expect(fill?.blanks?.map((b) => b.correct)).toEqual([null, false]);

    const [blank1, blank2] = t.blankIds as [number, number];
    const onEmpty = await grade(t.quizId, t.attemptId, [
      { questionId: t.essayId, blankId: null, correct: true },
      { questionId: t.fillId, blankId: blank1, correct: true },
      { questionId: t.fillId, blankId: blank2, correct: true },
    ]);
    expect(onEmpty.status).toBe(400);
    expect(onEmpty.body.error.code).toBe("mark_out_of_range");

    const missing = await grade(t.quizId, t.attemptId, [{ questionId: t.essayId, blankId: null, correct: true }]);
    expect(missing.status).toBe(409);
    expect(missing.body.error.code).toBe("marks_incomplete");

    const ok = await grade(t.quizId, t.attemptId, [
      { questionId: t.essayId, blankId: null, correct: true },
      { questionId: t.fillId, blankId: blank1, correct: true },
    ]);
    expect(ok.status).toBe(200);
    // Essay 5 + one of two blanks of 4 = 2; the single choice was left empty: 0.
    expect(ok.body.data).toMatchObject({ status: "GRADED", autoScore: 0, manualScore: 7, totalScore: 7 });
    const fillRow = await db.quizAnswer.findUniqueOrThrow({
      where: { attemptId_questionId: { attemptId: t.attemptId, questionId: t.fillId } },
      select: {
        isCorrect: true,
        pointsAwarded: true,
        blanks: { orderBy: { blankId: "asc" }, select: { isCorrect: true } },
      },
    });
    expect(fillRow.isCorrect).toBe(false);
    expect(toScore(fillRow.pointsAwarded)).toBe(2);
    expect(fillRow.blanks.map((b) => b.isCorrect)).toEqual([true, false]);
  });

  it("an empty essay alone is wrong at close; the answered fill-in waits for its marks", async () => {
    const t = await openWith((ids) => [
      {
        type: "FILL_BLANK",
        questionId: ids.fillId,
        blanks: ids.blankIds.map((blankId) => ({ blankId, text: "Peter" })),
      },
    ]);
    await closeAttempt(t.attemptId, "TIMED_OUT", null);
    expect((await attemptOf(t.attemptId)).status).toBe("SUBMITTED");
    const [, essay] = await viewOf(t.quizId);
    expect(essay).toMatchObject({ correct: false, pointsAwarded: 0 });
    const res = await grade(
      t.quizId,
      t.attemptId,
      t.blankIds.map((blankId) => ({ questionId: t.fillId, blankId, correct: true })),
    );
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: "GRADED", manualScore: 4, totalScore: 4 });
  });
});

describe("re-saving an attempt graded at close", () => {
  // The route refuses `marks: []` (schema min 1), so this pins the service the seed script and the route share.
  it("an empty payload on an attempt with nothing to mark leaves gradedById null", async () => {
    const t = await openWith(() => []);
    await closeAttempt(t.attemptId, "TIMED_OUT", null);
    const leader = await db.user.findFirstOrThrow({ where: { name: "Test leader" }, select: { id: true } });
    expect(
      await gradeAttempt(t.quizId, t.attemptId, [], leader.id, { id: f.seasonId, mayWriteFinished: false }),
    ).toEqual({ scoreChanged: false });
    const row = await db.quizAttempt.findUniqueOrThrow({
      where: { id: t.attemptId },
      select: { status: true, gradedById: true },
    });
    expect(row).toEqual({ status: "GRADED", gradedById: null });
  });
});

describe("grading concurrency (C-c)", () => {
  it("two first grades at once tell the student once", async () => {
    const t = await openWith((ids) => [{ type: "ESSAY", questionId: ids.essayId, text: "Because." }]);
    await closeAttempt(t.attemptId, "TIMED_OUT", null);
    const before = await quizGradedCountFor(f.ownStudentId);
    const marks = [{ questionId: t.essayId, blankId: null, correct: true }];
    const results = await Promise.all([grade(t.quizId, t.attemptId, marks), grade(t.quizId, t.attemptId, marks)]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect((await attemptOf(t.attemptId)).status).toBe("GRADED");
    expect((await quizGradedCountFor(f.ownStudentId)) - before).toBe(1);
  });
});
