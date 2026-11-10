import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { cleanupTestData } from "./fixtures";
import type { QuizQuestionRequest } from "../../lib/quizzes/question-rows";
import { seedQuizFixtures } from "./quizzes-setup";

// Same reason as the submissions suite: the shared Neon staging Postgres
// autosuspends, and the first query after idling has been measured at ~18s.
jest.setTimeout(60000);

const app = createApp();

/** A valid single-choice request: "a" wrong, "b" right. */
function choice(prompt: string, points: number): QuizQuestionRequest {
  return {
    type: "SINGLE_CHOICE",
    prompt,
    points,
    options: [
      { label: "a", isCorrect: false },
      { label: "b", isCorrect: true },
    ],
  };
}

const ONE_OF_EACH: QuizQuestionRequest[] = [
  choice("Single", 1),
  {
    type: "MULTI_CHOICE",
    prompt: "Multi",
    points: 2,
    options: [
      { label: "a", isCorrect: true },
      { label: "b", isCorrect: true },
      { label: "c", isCorrect: false },
    ],
  },
  { type: "TRUE_FALSE", prompt: "Statement", points: 1, correct: false },
  {
    type: "MATCHING",
    prompt: "Match",
    points: 3,
    pairs: [
      { left: "a", right: "1" },
      { left: "b", right: "2" },
    ],
  },
  { type: "FILL_BLANK", prompt: "Fill {{blank}} in", points: 2, answers: ["x"] },
  { type: "ESSAY", prompt: "Discuss it", points: 5 },
];

let seasonId: number;
let sessionId: number;
let ownStudentId: number;
let adminToken: string;
let leaderToken: string;

beforeAll(async () => {
  ({ seasonId, sessionId, ownStudentId, adminToken, leaderToken } = await seedQuizFixtures(app));
});

afterAll(async () => {
  await cleanupTestData();
});

describe("question authoring", () => {
  let quizId: number;

  beforeEach(async () => {
    const quiz = await db.quiz.create({
      data: { seasonId, sessionId, title: "Authoring", kind: "ONLINE", maxScore: 0 },
      select: { id: true },
    });
    quizId = quiz.id;
  });

  it("adds a question, orders it at the end, and recomputes maxScore (R11, R20)", async () => {
    const first = await request(app)
      .post(`/api/v1/quizzes/${quizId}/questions`)
      .set("authorization", `Bearer ${adminToken}`)
      .send(choice("Capital of France?", 2));
    expect(first.status).toBe(201);
    expect(first.body.data).toMatchObject({ type: "SINGLE_CHOICE", order: 0, points: 2 });

    const second = await request(app)
      .post(`/api/v1/quizzes/${quizId}/questions`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ type: "ESSAY", prompt: "Discuss the reading.", points: 5 });
    expect(second.status).toBe(201);
    expect(second.body.data).toMatchObject({ order: 1 });

    const quiz = await db.quiz.findUnique({ where: { id: quizId }, select: { maxScore: true } });
    expect(quiz?.maxScore).toBe(7);
  });

  it("renumbers survivors on delete instead of leaving order sparse (R21)", async () => {
    const ids: number[] = [];
    for (const prompt of ["One", "Two", "Three"]) {
      const res = await request(app)
        .post(`/api/v1/quizzes/${quizId}/questions`)
        .set("authorization", `Bearer ${adminToken}`)
        .send({ type: "ESSAY", prompt, points: 1 });
      ids.push(res.body.data.id);
    }

    const del = await request(app)
      .delete(`/api/v1/quizzes/${quizId}/questions/${ids[1]}`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(del.status).toBe(200);

    const rows = await db.quizQuestion.findMany({
      where: { quizId },
      orderBy: { order: "asc" },
      select: { prompt: true, order: true },
    });
    // v1 left gaps (0, 2, ...) because nothing renumbered; harmless for display
    // but it made `order` a label rather than a position, which a reorder
    // endpoint cannot live with.
    expect(rows.map((r) => r.order)).toEqual([0, 1]);
    expect(rows.map((r) => r.prompt)).toEqual(["One", "Three"]);
    const quiz = await db.quiz.findUnique({ where: { id: quizId }, select: { maxScore: true } });
    expect(quiz?.maxScore).toBe(2);
  });

  it("reorders by an explicit permutation and refuses anything else", async () => {
    const ids: number[] = [];
    for (const prompt of ["One", "Two", "Three"]) {
      const res = await request(app)
        .post(`/api/v1/quizzes/${quizId}/questions`)
        .set("authorization", `Bearer ${adminToken}`)
        .send({ type: "ESSAY", prompt, points: 1 });
      ids.push(res.body.data.id);
    }

    const ok = await request(app)
      .put(`/api/v1/quizzes/${quizId}/questions/order`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ questionIds: [ids[2], ids[0], ids[1]] });
    expect(ok.status).toBe(200);
    expect(ok.body.data.questions.map((q: { prompt: string }) => q.prompt)).toEqual(["Three", "One", "Two"]);

    const partial = await request(app)
      .put(`/api/v1/quizzes/${quizId}/questions/order`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ questionIds: [ids[0]] });
    expect(partial.status).toBe(400);
    expect(partial.body.error.code).toBe("invalid_order");
  });

  it("refuses every structural write once an attempt exists (spec D3)", async () => {
    const q = await request(app)
      .post(`/api/v1/quizzes/${quizId}/questions`)
      .set("authorization", `Bearer ${adminToken}`)
      .send(choice("Pick", 2));
    const questionId = q.body.data.id;

    await request(app)
      .post(`/api/v1/quizzes/${quizId}/publish`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ publish: true });
    await db.quizAttempt.create({
      data: { quizId, studentUserId: ownStudentId, attemptNumber: 1 },
    });

    const add = await request(app)
      .post(`/api/v1/quizzes/${quizId}/questions`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ type: "ESSAY", prompt: "Late addition", points: 1 });
    const edit = await request(app)
      .patch(`/api/v1/quizzes/${quizId}/questions/${questionId}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send(choice("Rewritten", 9));
    const remove = await request(app)
      .delete(`/api/v1/quizzes/${quizId}/questions/${questionId}`)
      .set("authorization", `Bearer ${adminToken}`);
    const reorder = await request(app)
      .put(`/api/v1/quizzes/${quizId}/questions/order`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ questionIds: [questionId] });

    // Three compounding v1 rules die here: R22 (edit a live quiz freely),
    // R13 (maxScore rebased under graded attempts), R23 (deleting a question
    // cascade-deletes QuizAnswer rows on GRADED attempts while their scores
    // keep the points those answers earned). Nothing versions or snapshots a
    // quiz, so refusing is the honest option: an edit would rewrite graded work.
    for (const res of [add, edit, remove, reorder]) {
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("quiz_has_attempts");
    }
  });

  it("adds each of the six types and reads them back", async () => {
    for (const body of ONE_OF_EACH) {
      const res = await request(app)
        .post(`/api/v1/quizzes/${quizId}/questions`)
        .set("authorization", `Bearer ${adminToken}`)
        .send(body);
      expect(res.status).toBe(201);
    }

    const detail = await request(app).get(`/api/v1/quizzes/${quizId}`).set("authorization", `Bearer ${adminToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.shuffleQuestions).toBe(true);
    const qs = detail.body.data.questions;
    expect(qs.map((q: { type: string }) => q.type)).toEqual([
      "SINGLE_CHOICE",
      "MULTI_CHOICE",
      "TRUE_FALSE",
      "MATCHING",
      "FILL_BLANK",
      "ESSAY",
    ]);
    const labels = (q: { options: { label: string; isCorrect: boolean }[] }) =>
      q.options.map((o) => [o.label, o.isCorrect]);
    expect(labels(qs[0])).toEqual([
      ["a", false],
      ["b", true],
    ]);
    expect(labels(qs[1])).toEqual([
      ["a", true],
      ["b", true],
      ["c", false],
    ]);
    expect(qs[2].correct).toBe(false);
    expect(qs[3].pairs.map((p: { left: string; right: string }) => [p.left, p.right])).toEqual([
      ["a", "1"],
      ["b", "2"],
    ]);
    expect(qs[4].blanks.map((b: { expected: string }) => b.expected)).toEqual(["x"]);

    // The legacy columns stay empty: the backfill rollback tells former MCQs
    // apart by SINGLE_CHOICE rows whose legacy options[] is non-empty.
    const rows = await db.quizQuestion.findMany({ where: { quizId }, select: { options: true, correctIndex: true } });
    expect(rows).toHaveLength(6);
    for (const row of rows) expect(row).toEqual({ options: [], correctIndex: null });
    const quiz = await db.quiz.findUnique({ where: { id: quizId }, select: { maxScore: true } });
    expect(quiz?.maxScore).toBe(14);
  });

  it("editing a MATCHING question replaces its pairs", async () => {
    const created = await request(app)
      .post(`/api/v1/quizzes/${quizId}/questions`)
      .set("authorization", `Bearer ${adminToken}`)
      .send(ONE_OF_EACH[3]);
    const questionId = created.body.data.id;

    const edit = await request(app)
      .patch(`/api/v1/quizzes/${quizId}/questions/${questionId}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({
        type: "MATCHING",
        prompt: "Match again",
        points: 3,
        pairs: [
          { left: "x", right: "9" },
          { left: "y", right: "8" },
          { left: "z", right: "7" },
        ],
      });
    expect(edit.status).toBe(200);
    expect(edit.body.data.pairs.map((p: { left: string; right: string }) => [p.left, p.right])).toEqual([
      ["x", "9"],
      ["y", "8"],
      ["z", "7"],
    ]);
    expect(await db.quizOption.count({ where: { questionId } })).toBe(6);
    const legacy = await db.quizQuestion.findUnique({
      where: { id: questionId },
      select: { options: true, correctIndex: true },
    });
    expect(legacy).toEqual({ options: [], correctIndex: null });
  });

  it("shuffleQuestions can be turned off before attempts and is refused after", async () => {
    const off = await request(app)
      .patch(`/api/v1/quizzes/${quizId}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ shuffleQuestions: false });
    expect(off.status).toBe(200);
    expect(
      (await db.quiz.findUnique({ where: { id: quizId }, select: { shuffleQuestions: true } }))?.shuffleQuestions,
    ).toBe(false);

    await db.quizAttempt.create({ data: { quizId, studentUserId: ownStudentId, attemptNumber: 1 } });
    const after = await request(app)
      .patch(`/api/v1/quizzes/${quizId}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ shuffleQuestions: true });
    expect(after.status).toBe(409);
    expect(after.body.error.code).toBe("quiz_has_attempts");
  });

  it("refuses a question on a PAPER quiz (R25)", async () => {
    const paper = await db.quiz.create({
      data: { seasonId, sessionId, title: "Paper", kind: "PAPER", maxScore: 10 },
      select: { id: true },
    });
    const res = await request(app)
      .post(`/api/v1/quizzes/${paper.id}/questions`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ type: "ESSAY", prompt: "Nope", points: 1 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("wrong_quiz_kind");
  });

  it("refuses a leader — authoring is admin-only (R15)", async () => {
    const res = await request(app)
      .post(`/api/v1/quizzes/${quizId}/questions`)
      .set("authorization", `Bearer ${leaderToken}`)
      .send({ type: "ESSAY", prompt: "Nope", points: 1 });
    expect(res.status).toBe(403);
  });

  it("refuses a question id from another quiz (R50 at the authoring edge)", async () => {
    const other = await db.quiz.create({
      data: { seasonId, sessionId, title: "Other", kind: "ONLINE", maxScore: 0 },
      select: { id: true },
    });
    const stray = await db.quizQuestion.create({
      data: {
        quizId: other.id,
        order: 0,
        type: "ESSAY",
        prompt: "Elsewhere",
        points: 1,
        options: [],
        correctIndex: null,
      },
      select: { id: true },
    });
    const res = await request(app)
      .patch(`/api/v1/quizzes/${quizId}/questions/${stray.id}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ type: "ESSAY", prompt: "Hijack", points: 1 });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("question_not_in_quiz");
  });
});
