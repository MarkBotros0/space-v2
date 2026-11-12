import { db } from "../../db/client";
import type { Prisma } from "../../generated/prisma/client";
import { ApiError } from "../api-error";
import { questionRowsFor, toAuthoringQuestion, type QuizQuestionRequest } from "./question-rows";
import { randomOrder, type Shuffle } from "./shuffle";

/** The authoring view of a question — the answer key included. */
export const AUTHORING_QUESTION_SELECT = {
  id: true,
  order: true,
  type: true,
  prompt: true,
  points: true,
  quizOptions: {
    orderBy: { position: "asc" },
    select: { id: true, position: true, label: true, isCorrect: true, side: true, matchId: true },
  },
  quizBlanks: { orderBy: { position: "asc" }, select: { id: true, position: true, expected: true } },
} as const;

/**
 * Recompute an ONLINE quiz's maxScore as the sum of its question points (R11).
 *
 * Takes the transaction client, because in v1 this ran as a separate update
 * *after* the question write with nothing tying the two together (R14) — a
 * failure between them left maxScore stale, silently changing the denominator
 * of every score the quiz had produced.
 */
async function recomputeMaxScore(tx: Prisma.TransactionClient, quizId: number): Promise<void> {
  const agg = await tx.quizQuestion.aggregate({ where: { quizId }, _sum: { points: true } });
  await tx.quiz.update({ where: { id: quizId }, data: { maxScore: agg._sum.points ?? 0 } });
}

/** The refusal when the season admin has entered a score: maxScore must not move under it. */
export const SCORED_QUIZ_MESSAGE = "A score has been entered for this quiz, so its questions can no longer change.";

/**
 * Locks the Quiz row (FOR NO KEY UPDATE, which waits for the FOR SHARE an admin's score save
 * holds, lib/quizzes/student-lock.ts) and refuses once the admin has entered a score, so a
 * question write can't drop maxScore below a stored score. The route refuses first
 * (routes/quizzes/questions.ts); this closes the race with a save landing in between.
 */
async function lockUnscoredQuiz(tx: Prisma.TransactionClient, quizId: number): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "Quiz" WHERE "id" = ${quizId} FOR NO KEY UPDATE`;
  if ((await tx.quizGrade.count({ where: { quizId, score: { not: null } } })) > 0) {
    throw new ApiError("quiz_has_attempts", SCORED_QUIZ_MESSAGE, 409);
  }
}

/**
 * Replaces a question's option and blank rows with the ones its request implies.
 * Safe because questions are frozen once attempts exist, so no answer row points at the old ones.
 *
 * Option rows go in in a random order: serial ids follow insertion, and a
 * student read sends the ids, so author order would give away the matching key
 * (right id = left id + pairs) and undo the choice shuffle. `position` keeps
 * the author's order; every reader sorts by it or by `seededOrder`.
 */
async function writeRows(
  tx: Prisma.TransactionClient,
  questionId: number,
  data: QuizQuestionRequest,
  shuffle: Shuffle,
): Promise<void> {
  await tx.quizOption.deleteMany({ where: { questionId } });
  await tx.quizBlank.deleteMany({ where: { questionId } });
  const { options, blanks } = questionRowsFor(data);
  const created = new Map<string, number>();
  for (const o of shuffle(options)) {
    const row = await tx.quizOption.create({
      data: { questionId, position: o.position, label: o.label, isCorrect: o.isCorrect, side: o.side },
      select: { id: true },
    });
    if (o.matchKey !== undefined && o.side !== null) created.set(`${o.side}:${o.matchKey}`, row.id);
  }
  // A LEFT row points at its RIGHT row; that needs both inserted first.
  for (const [key, leftId] of created) {
    const rightId = key.startsWith("LEFT:") ? created.get(`RIGHT:${key.slice(5)}`) : undefined;
    if (rightId !== undefined) await tx.quizOption.update({ where: { id: leftId }, data: { matchId: rightId } });
  }
  if (blanks.length > 0) await tx.quizBlank.createMany({ data: blanks.map((b) => ({ questionId, ...b })) });
}

/** The question row's own columns. The legacy `options` / `correctIndex` stay empty for every type. */
function questionColumns(data: QuizQuestionRequest) {
  return { type: data.type, prompt: data.prompt, points: data.points, options: [], correctIndex: null };
}

/** Adds a question at the end and recomputes maxScore, in one transaction. */
export async function addQuizQuestion(quizId: number, data: QuizQuestionRequest, shuffle: Shuffle = randomOrder) {
  return db.$transaction(async (tx) => {
    await lockUnscoredQuiz(tx, quizId);
    // R20: order is the current count. It stays that way, but a real reorder
    // endpoint exists now, and delete renumbers, so `order` is a position.
    const count = await tx.quizQuestion.count({ where: { quizId } });
    const { id } = await tx.quizQuestion.create({
      data: { quizId, order: count, ...questionColumns(data) },
      select: { id: true },
    });
    await writeRows(tx, id, data, shuffle);
    await recomputeMaxScore(tx, quizId);
    return toAuthoringQuestion(
      await tx.quizQuestion.findUniqueOrThrow({ where: { id }, select: AUTHORING_QUESTION_SELECT }),
    );
  });
}

/** Edits a question (never its `order`) and recomputes maxScore, in one transaction. */
export async function updateQuizQuestion(
  quizId: number,
  questionId: number,
  data: QuizQuestionRequest,
  shuffle: Shuffle = randomOrder,
) {
  return db.$transaction(async (tx) => {
    await lockUnscoredQuiz(tx, quizId);
    // `order` is deliberately not writable here — reordering has its own
    // endpoint, so a question edit cannot silently move a question.
    await tx.quizQuestion.update({ where: { id: questionId }, data: questionColumns(data), select: { id: true } });
    await writeRows(tx, questionId, data, shuffle);
    await recomputeMaxScore(tx, quizId);
    return toAuthoringQuestion(
      await tx.quizQuestion.findUniqueOrThrow({ where: { id: questionId }, select: AUTHORING_QUESTION_SELECT }),
    );
  });
}

/** Deletes a question, renumbers the rest and recomputes maxScore, in one transaction. */
export async function deleteQuizQuestion(quizId: number, questionId: number): Promise<void> {
  await db.$transaction(async (tx) => {
    await lockUnscoredQuiz(tx, quizId);
    await tx.quizQuestion.delete({ where: { id: questionId } });
    // R21: v1 left `order` sparse. Renumbering keeps it a position, which is
    // what the reorder endpoint and the runner's numbering both assume.
    const survivors = await tx.quizQuestion.findMany({
      where: { quizId },
      orderBy: { order: "asc" },
      select: { id: true },
    });
    for (const [index, row] of survivors.entries()) {
      await tx.quizQuestion.update({ where: { id: row.id }, data: { order: index } });
    }
    await recomputeMaxScore(tx, quizId);
  });
}

/** Writes the new positions (an exact permutation, checked by the caller) and returns the questions in order. */
export async function reorderQuizQuestions(quizId: number, questionIds: number[]) {
  return db.$transaction(async (tx) => {
    for (const [index, questionId] of questionIds.entries()) {
      await tx.quizQuestion.update({ where: { id: questionId }, data: { order: index } });
    }
    const rows = await tx.quizQuestion.findMany({
      where: { quizId },
      orderBy: { order: "asc" },
      select: AUTHORING_QUESTION_SELECT,
    });
    return rows.map(toAuthoringQuestion);
  });
}
