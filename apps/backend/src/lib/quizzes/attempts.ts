import type { ApiErrorCode, QuizAnswerInput } from "@space/shared";

import { db } from "../../db/client";
import type { Prisma } from "../../generated/prisma/client";
import { ApiError } from "../api-error";
import {
  autoMark,
  isAnswered,
  isLeaderMarked,
  MARKABLE_QUESTION_SELECT,
  toMarkable,
  type MarkableQuestion,
  type StoredAnswer,
} from "./marking";
import { sumScores } from "./score";

type Refusal = { code: ApiErrorCode; message: string };

const attemptClosed = () => new ApiError("attempt_closed", "This attempt is closed.", 409);

/**
 * Lock the attempt row and return its CURRENT status (REG-111 / R120). The
 * pre-transaction status check in resolveOpenAttempt is only a fast refusal;
 * this is the authoritative one. Both the answer save and the submit take this
 * lock first, so a save can never land between submit's read of the answers and
 * its commit, and two submits cannot both score the same attempt.
 */
async function lockAttemptStatus(tx: Prisma.TransactionClient, attemptId: number): Promise<string | null> {
  const rows = await tx.$queryRaw<{ status: string }[]>`
    SELECT "status"::text AS "status" FROM "QuizAttempt" WHERE "id" = ${attemptId} FOR UPDATE`;
  return rows[0]?.status ?? null;
}

const outOfRange: Refusal = { code: "answer_out_of_range", message: "That answer is not part of this question." };

/** Every id names an option of this question, on the side given (null = a choice option). */
function onQuestion(q: MarkableQuestion, ids: number[], side: "LEFT" | "RIGHT" | null): boolean {
  return ids.every((id) => q.options.some((o) => o.id === id && o.side === side));
}

/** One answer against its own question: membership, sides, Choose N. The shape is the schema's job. */
function refusalFor(q: MarkableQuestion, answer: QuizAnswerInput): Refusal | null {
  switch (answer.type) {
    case "SINGLE_CHOICE":
    case "TRUE_FALSE":
      return answer.optionId === null || onQuestion(q, [answer.optionId], null) ? null : outOfRange;
    case "MULTI_CHOICE": {
      if (!onQuestion(q, answer.optionIds, null)) return outOfRange;
      // Choose N: N is the number of correct options, which the student is shown.
      const choose = q.options.filter((o) => o.isCorrect).length;
      if (answer.optionIds.length > choose) return { code: "too_many_choices", message: `Choose at most ${choose}.` };
      return null;
    }
    case "MATCHING": {
      const lefts = answer.pairs.map((p) => p.leftId);
      const rights = answer.pairs.map((p) => p.rightId);
      return onQuestion(q, lefts, "LEFT") && onQuestion(q, rights, "RIGHT") ? null : outOfRange;
    }
    case "FILL_BLANK": {
      const ids = answer.blanks.map((b) => b.blankId);
      const own = ids.every((id) => q.blanks.some((b) => b.id === id));
      return own && new Set(ids).size === ids.length ? null : outOfRange;
    }
    case "ESSAY":
      return null;
  }
}

/** The first answer that doesn't fit its question, as the route's 400, or null. */
export function answerRefusal(byId: Map<number, MarkableQuestion>, answers: QuizAnswerInput[]): Refusal | null {
  for (const answer of answers) {
    const question = byId.get(answer.questionId);
    // R50 — the one cross-entity consistency check v1 did make, kept.
    if (!question) return { code: "question_not_in_quiz", message: "That question is not in this quiz." };
    // R52: an answer of one type never lands on a question of another.
    if (question.type !== answer.type) {
      return { code: "wrong_answer_type", message: "That answer does not fit this question's type." };
    }
    const refusal = refusalFor(question, answer);
    if (refusal) return refusal;
  }
  return null;
}

/** The selection rows an answer stands for; FILL_BLANK and ESSAY have none. */
function selectionsOf(answer: QuizAnswerInput): { optionId: number; matchedOptionId: number | null }[] {
  switch (answer.type) {
    case "SINGLE_CHOICE":
    case "TRUE_FALSE":
      return answer.optionId === null ? [] : [{ optionId: answer.optionId, matchedOptionId: null }];
    case "MULTI_CHOICE":
      return answer.optionIds.map((optionId) => ({ optionId, matchedOptionId: null }));
    case "MATCHING":
      return answer.pairs.map((p) => ({ optionId: p.leftId, matchedOptionId: p.rightId }));
    default:
      return [];
  }
}

/** Writes one answer: the row, then its selections or blanks replaced wholesale. */
async function writeAnswer(tx: Prisma.TransactionClient, attemptId: number, answer: QuizAnswerInput): Promise<void> {
  const text = answer.type === "ESSAY" ? answer.text : null;
  const row = await tx.quizAnswer.upsert({
    where: { attemptId_questionId: { attemptId, questionId: answer.questionId } },
    create: { attemptId, questionId: answer.questionId, text },
    // isCorrect and pointsAwarded are untouched — saving never marks (R54).
    update: { text },
    select: { id: true },
  });
  if (answer.type === "ESSAY") return;
  if (answer.type === "FILL_BLANK") {
    await tx.quizAnswerBlank.deleteMany({ where: { answerId: row.id } });
    if (answer.blanks.length > 0) {
      await tx.quizAnswerBlank.createMany({
        data: answer.blanks.map((b) => ({ answerId: row.id, blankId: b.blankId, text: b.text })),
      });
    }
    return;
  }
  await tx.quizAnswerSelection.deleteMany({ where: { answerId: row.id } });
  const selections = selectionsOf(answer);
  if (selections.length > 0) {
    await tx.quizAnswerSelection.createMany({ data: selections.map((s) => ({ answerId: row.id, ...s })) });
  }
}

/** Saves answers to an open attempt, under its lock. A closed attempt is attempt_closed (409), nothing written. */
export async function saveAnswers(attemptId: number, answers: QuizAnswerInput[]): Promise<void> {
  await db.$transaction(async (tx) => {
    if ((await lockAttemptStatus(tx, attemptId)) !== "IN_PROGRESS") throw attemptClosed();
    for (const answer of answers) await writeAnswer(tx, attemptId, answer);
  });
}

const STORED_ANSWER_SELECT = {
  questionId: true,
  text: true,
  isCorrect: true,
  selections: { select: { optionId: true, matchedOptionId: true } },
  blanks: { select: { blankId: true, text: true, isCorrect: true } },
} as const satisfies Prisma.QuizAnswerSelect;

/**
 * Submits an attempt: read, validate, mark and write all inside ONE
 * transaction that holds the attempt row lock (REG-111 / R120), so the answers
 * marked are exactly the answers committed with the status change. Both
 * refusals (attempt_closed, attempt_incomplete) are thrown before any write.
 * The auto types are marked here; an attempt with no leader-marked question
 * (FILL_BLANK, ESSAY) is GRADED at once, otherwise it waits SUBMITTED.
 */
export async function submitAnswers(quizId: number, attemptId: number): Promise<{ graded: boolean }> {
  return db.$transaction(async (tx) => {
    if ((await lockAttemptStatus(tx, attemptId)) !== "IN_PROGRESS") throw attemptClosed();

    const [rows, answers] = await Promise.all([
      tx.quizQuestion.findMany({ where: { quizId }, select: MARKABLE_QUESTION_SELECT }),
      tx.quizAnswer.findMany({ where: { attemptId }, select: STORED_ANSWER_SELECT }),
    ]);
    const questions = rows.map(toMarkable);
    const answerBy = new Map<number, StoredAnswer>(answers.map((a) => [a.questionId, a]));

    // R59: one unanswered question rejects the whole submit.
    if (questions.some((q) => !isAnswered(q, answerBy.get(q.id)))) {
      throw new ApiError("attempt_incomplete", "Answer every question before submitting.", 409);
    }

    const marked = questions
      .filter((q) => !isLeaderMarked(q.type))
      .map((q) => ({ questionId: q.id, ...autoMark(q, answerBy.get(q.id)) }));
    for (const m of marked) {
      await tx.quizAnswer.update({
        where: { attemptId_questionId: { attemptId, questionId: m.questionId } },
        data: { isCorrect: m.isCorrect, pointsAwarded: m.pointsAwarded },
      });
    }

    // Summed from the stored (rounded) awards, so totalScore = sum of pointsAwarded exactly.
    const autoScore = sumScores(marked.map((m) => m.pointsAwarded));
    const graded = !questions.some((q) => isLeaderMarked(q.type));
    const now = new Date();
    await tx.quizAttempt.update({
      where: { id: attemptId },
      data: graded
        ? {
            status: "GRADED",
            submittedAt: now,
            autoScore,
            manualScore: 0,
            totalScore: autoScore,
            gradedAt: now,
            // gradedById stays null: nobody graded it (R64).
          }
        : { status: "SUBMITTED", submittedAt: now, autoScore },
    });
    return { graded };
  });
}
