import { db } from "../../db/client";
import type { Prisma } from "../../generated/prisma/client";
// Relative, not "@space/shared" — same emit trap routes/auth.ts documents.
import type { quizQuestionRequestSchema } from "../../../../../packages/shared/src/index";
import type { z } from "zod";

type QuestionData = z.infer<typeof quizQuestionRequestSchema>;

/** The authoring view of a question — the answer key included. */
const AUTHORING_QUESTION_SELECT = {
  id: true,
  order: true,
  type: true,
  prompt: true,
  points: true,
  options: true,
  correctIndex: true,
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

/** Adds a question at the end and recomputes maxScore, in one transaction. */
export async function addQuizQuestion(quizId: number, data: QuestionData) {
  return db.$transaction(async (tx) => {
    // R20: order is the current count. It stays that way, but a real reorder
    // endpoint exists now, and delete renumbers, so `order` is a position.
    const count = await tx.quizQuestion.count({ where: { quizId } });
    const question = await tx.quizQuestion.create({
      data: { quizId, order: count, ...data },
      select: AUTHORING_QUESTION_SELECT,
    });
    await recomputeMaxScore(tx, quizId);
    return question;
  });
}

/** Edits a question (never its `order`) and recomputes maxScore, in one transaction. */
export async function updateQuizQuestion(quizId: number, questionId: number, data: QuestionData) {
  return db.$transaction(async (tx) => {
    // `order` is deliberately not writable here — reordering has its own
    // endpoint, so a question edit cannot silently move a question.
    const question = await tx.quizQuestion.update({
      where: { id: questionId },
      data,
      select: AUTHORING_QUESTION_SELECT,
    });
    await recomputeMaxScore(tx, quizId);
    return question;
  });
}

/** Deletes a question, renumbers the rest and recomputes maxScore, in one transaction. */
export async function deleteQuizQuestion(quizId: number, questionId: number): Promise<void> {
  await db.$transaction(async (tx) => {
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
    return tx.quizQuestion.findMany({
      where: { quizId },
      orderBy: { order: "asc" },
      select: AUTHORING_QUESTION_SELECT,
    });
  });
}
