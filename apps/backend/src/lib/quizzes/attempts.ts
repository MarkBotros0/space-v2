import type { ApiErrorCode, QuizAnswerInput } from "@space/shared";

import { db } from "../../db/client";
import type { Prisma } from "../../generated/prisma/client";
import { ApiError } from "../api-error";
import { lockAttempt, markAndClose } from "./mark-and-close";
import type { MarkableQuestion } from "./marking";
import { isExpired, SAVE_GRACE_MS } from "./timing";

type Refusal = { code: ApiErrorCode; message: string };

const attemptClosed = () => new ApiError("attempt_closed", "This attempt is closed.", 409);

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

/**
 * Saves answers to an open attempt, under its lock. A closed attempt, or one
 * past its deadline by more than `graceMs`, is attempt_closed (409), nothing
 * written; the route has already closed an expired one, so this only catches
 * a deadline crossed between that check and the lock.
 */
export async function saveAnswers(
  attemptId: number,
  answers: QuizAnswerInput[],
  graceMs = SAVE_GRACE_MS,
): Promise<void> {
  await db.$transaction(async (tx) => {
    const row = await lockAttempt(tx, attemptId);
    if (row?.status !== "IN_PROGRESS" || isExpired(row.deadlineAt, new Date(), graceMs)) throw attemptClosed();
    for (const answer of answers) await writeAnswer(tx, attemptId, answer);
  });
}

/**
 * Submits an attempt: read, validate, mark and write inside ONE transaction
 * that holds the attempt row lock (REG-111 / R120), so the answers marked are
 * exactly the answers committed with the status change. Both refusals
 * (attempt_closed, attempt_incomplete) are thrown before any write. Marking is
 * `markAndClose`, the path every close shares.
 */
export async function submitAnswers(quizId: number, attemptId: number): Promise<{ graded: boolean }> {
  return db.$transaction(async (tx) => {
    const row = await lockAttempt(tx, attemptId);
    if (row?.status !== "IN_PROGRESS" || isExpired(row.deadlineAt, new Date(), SAVE_GRACE_MS)) throw attemptClosed();
    return markAndClose(tx, quizId, attemptId, { requireComplete: true, endReason: "SUBMITTED", endedById: null });
  });
}
