import type { Prisma } from "../../generated/prisma/client";
import type { QuizAttemptEndReason } from "../../generated/prisma/enums";
import {
  autoMark,
  hasAnswerText,
  isLeaderMarked,
  MARKABLE_QUESTION_SELECT,
  toMarkable,
  type MarkableQuestion,
  type StoredAnswer,
} from "./marking";
import { sumScores } from "./score";

export type LockedAttempt = {
  status: string;
  quizId: number;
  studentUserId: number;
  deadlineAt: Date | null;
};

/**
 * Lock the attempt row and return its CURRENT state (REG-111 / R120). Any
 * status check made before the transaction is only a fast refusal; this is the
 * authoritative one. Save, submit, close and grade all take this lock first, so
 * a save never lands between a close's read of the answers and its commit, and
 * two closes (or a close and a submit) can't both score the same attempt.
 */
export async function lockAttempt(tx: Prisma.TransactionClient, attemptId: number): Promise<LockedAttempt | null> {
  const rows = await tx.$queryRaw<LockedAttempt[]>`
    SELECT "status"::text AS "status", "quizId", "studentUserId", "deadlineAt"
    FROM "QuizAttempt" WHERE "id" = ${attemptId} FOR UPDATE`;
  return rows[0] ?? null;
}

export const STORED_ANSWER_SELECT = {
  questionId: true,
  text: true,
  isCorrect: true,
  selections: { select: { optionId: true, matchedOptionId: true } },
  blanks: { select: { blankId: true, text: true, isCorrect: true } },
} as const satisfies Prisma.QuizAnswerSelect;

const WRONG = { isCorrect: false, pointsAwarded: 0 };

/** Writes a question's mark, creating the answer row for a question the student never touched. */
async function writeMark(
  tx: Prisma.TransactionClient,
  attemptId: number,
  questionId: number,
  mark: { isCorrect: boolean; pointsAwarded: number },
): Promise<{ id: number }> {
  return tx.quizAnswer.upsert({
    where: { attemptId_questionId: { attemptId, questionId } },
    create: { attemptId, questionId, ...mark },
    update: mark,
    select: { id: true },
  });
}

/**
 * Ruling C-a: an empty essay or blank is wrong at close and never offered for
 * marking. Writes those marks (a row for every empty blank, C-b) and says
 * whether anything the student DID write is left for a leader.
 */
async function markEmptyLeaderItems(
  tx: Prisma.TransactionClient,
  attemptId: number,
  q: MarkableQuestion,
  a: StoredAnswer | undefined,
): Promise<boolean> {
  if (q.type === "ESSAY" || q.blanks.length === 0) {
    // A fill-in with no blanks has nothing to mark either: 0, like an empty essay.
    if (q.type === "ESSAY" && hasAnswerText(a?.text)) return true;
    await writeMark(tx, attemptId, q.id, WRONG);
    return false;
  }
  const empty = q.blanks.filter((b) => !hasAnswerText(a?.blanks.find((x) => x.blankId === b.id)?.text));
  if (empty.length === 0) return true;
  const allEmpty = empty.length === q.blanks.length;
  const row = allEmpty
    ? await writeMark(tx, attemptId, q.id, WRONG)
    : await tx.quizAnswer.upsert({
        where: { attemptId_questionId: { attemptId, questionId: q.id } },
        create: { attemptId, questionId: q.id },
        update: {},
        select: { id: true },
      });
  for (const b of empty) {
    await tx.quizAnswerBlank.upsert({
      where: { answerId_blankId: { answerId: row.id, blankId: b.id } },
      create: { answerId: row.id, blankId: b.id, text: "", isCorrect: false },
      update: { isCorrect: false },
    });
  }
  return !allEmpty;
}

/**
 * The one marking path for an attempt leaving IN_PROGRESS: a student's submit and every close
 * (time-out, staff End, third exit), which all mark what is saved. A submit may leave questions
 * unanswered (owner, 2026-11-13: the app warns, the student decides); they count 0, and an empty
 * blank or essay is wrong without waiting for a leader, as on a time-out. Runs inside the caller's transaction, which holds
 * `lockAttempt`. The auto types are marked here, unanswered = 0; the attempt is
 * GRADED at once unless a leader has something the student wrote to mark.
 */
export async function markAndClose(
  tx: Prisma.TransactionClient,
  quizId: number,
  attemptId: number,
  opts: { endReason: QuizAttemptEndReason; endedById: number | null },
): Promise<{ graded: boolean }> {
  // Sequential: one transaction is one connection, and pg warns on queries queued on it in parallel.
  const rows = await tx.quizQuestion.findMany({ where: { quizId }, select: MARKABLE_QUESTION_SELECT });
  const answers = await tx.quizAnswer.findMany({ where: { attemptId }, select: STORED_ANSWER_SELECT });
  const questions = rows.map(toMarkable);
  const answerBy = new Map<number, StoredAnswer>(answers.map((a) => [a.questionId, a]));

  const marked = questions
    .filter((q) => !isLeaderMarked(q.type))
    .map((q) => ({ questionId: q.id, ...autoMark(q, answerBy.get(q.id)) }));
  for (const m of marked) {
    await writeMark(tx, attemptId, m.questionId, { isCorrect: m.isCorrect, pointsAwarded: m.pointsAwarded });
  }

  let waiting = false;
  for (const q of questions.filter((x) => isLeaderMarked(x.type))) {
    if (await markEmptyLeaderItems(tx, attemptId, q, answerBy.get(q.id))) waiting = true;
  }

  // Summed from the stored (rounded) awards, so totalScore = sum of pointsAwarded exactly.
  const autoScore = sumScores(marked.map((m) => m.pointsAwarded));
  const now = new Date();
  const ended = { submittedAt: now, autoScore, endReason: opts.endReason, endedById: opts.endedById };
  await tx.quizAttempt.update({
    where: { id: attemptId },
    data: waiting
      ? { ...ended, status: "SUBMITTED" }
      : // gradedById stays null: nobody graded it (R64). Every leader item was empty, so manual is 0.
        { ...ended, status: "GRADED", manualScore: 0, totalScore: autoScore, gradedAt: now },
  });
  return { graded: !waiting };
}
