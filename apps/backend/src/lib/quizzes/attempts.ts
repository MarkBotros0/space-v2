import type { ApiErrorCode } from "@space/shared";

import { db } from "../../db/client";
import type { Prisma } from "../../generated/prisma/client";
import { ApiError } from "../api-error";

type Answer = { questionId: number; selectedIndex: number | null; text: string | null };
type QuestionShape = { id: number; type: string; options: string[] };

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

/** The first answer that doesn't fit its question, as the route's 400, or null. */
export function answerRefusal(
  byId: Map<number, QuestionShape>,
  answers: Answer[],
): { code: ApiErrorCode; message: string } | null {
  for (const answer of answers) {
    const question = byId.get(answer.questionId);
    // R50 — the one cross-entity consistency check v1 did make, kept.
    if (!question) return { code: "question_not_in_quiz", message: "That question is not in this quiz." };
    if (question.type === "MCQ") {
      // R52: v1 validated neither of these. An ESSAY accepted a selectedIndex
      // and an MCQ accepted free text; only the client's good manners kept the
      // data coherent.
      if (answer.text !== null) return { code: "wrong_answer_type", message: "A multiple-choice answer has no text." };
      // R51: the real bound is THIS question's option count, not v1's constant 5.
      if (answer.selectedIndex !== null && answer.selectedIndex >= question.options.length) {
        return { code: "answer_out_of_range", message: "That option does not exist." };
      }
    } else if (answer.selectedIndex !== null) {
      return { code: "wrong_answer_type", message: "An essay answer has no option index." };
    }
  }
  return null;
}

/** Saves answers to an open attempt, under its lock. A closed attempt is attempt_closed (409), nothing written. */
export async function saveAnswers(attemptId: number, answers: Answer[]): Promise<void> {
  await db.$transaction(async (tx) => {
    if ((await lockAttemptStatus(tx, attemptId)) !== "IN_PROGRESS") throw attemptClosed();
    for (const answer of answers) {
      await tx.quizAnswer.upsert({
        where: { attemptId_questionId: { attemptId, questionId: answer.questionId } },
        create: { attemptId, questionId: answer.questionId, selectedIndex: answer.selectedIndex, text: answer.text },
        // isCorrect and pointsAwarded are untouched — saving never grades (R54).
        update: { selectedIndex: answer.selectedIndex, text: answer.text },
      });
    }
  });
}

type ScoredQuestion = { id: number; type: string; points: number; correctIndex: number | null };
type StoredAnswer = { questionId: number; selectedIndex: number | null; text: string | null };

function isAnswered(q: ScoredQuestion, a: StoredAnswer | undefined): boolean {
  return q.type === "MCQ"
    ? a?.selectedIndex !== null && a?.selectedIndex !== undefined
    : Boolean(a?.text && a.text.trim().length > 0);
}

/** R60: full points or nothing per MCQ. No partial credit, no negative marking, no per-option weighting. */
function scoreAttempt(questions: ScoredQuestion[], answerBy: Map<number, StoredAnswer>) {
  let autoScore = 0;
  const scored = questions
    .filter((q) => q.type === "MCQ")
    .map((q) => {
      const isCorrect = answerBy.get(q.id)?.selectedIndex === q.correctIndex;
      const pointsAwarded = isCorrect ? q.points : 0;
      autoScore += pointsAwarded;
      return { questionId: q.id, isCorrect, pointsAwarded };
    });
  return { scored, autoScore };
}

/**
 * Submits an attempt: read, validate, score and write all inside ONE
 * transaction that holds the attempt row lock (REG-111 / R120), so the answers
 * scored are exactly the answers committed with the status change. Both
 * refusals (attempt_closed, attempt_incomplete) are thrown before any write.
 * An MCQ-only attempt is GRADED at once; one with an essay waits SUBMITTED.
 */
export async function submitAnswers(quizId: number, attemptId: number): Promise<{ hasEssays: boolean }> {
  return db.$transaction(async (tx) => {
    if ((await lockAttemptStatus(tx, attemptId)) !== "IN_PROGRESS") throw attemptClosed();

    const [questions, answers] = await Promise.all([
      tx.quizQuestion.findMany({
        where: { quizId },
        select: { id: true, type: true, points: true, correctIndex: true },
      }),
      tx.quizAnswer.findMany({
        where: { attemptId },
        select: { questionId: true, selectedIndex: true, text: true },
      }),
    ]);
    const answerBy = new Map(answers.map((a) => [a.questionId, a]));

    // R59: one unanswered question rejects the whole submit.
    if (questions.some((q) => !isAnswered(q, answerBy.get(q.id)))) {
      throw new ApiError("attempt_incomplete", "Answer every question before submitting.", 409);
    }

    const { scored, autoScore } = scoreAttempt(questions, answerBy);
    const hasEssays = questions.some((q) => q.type === "ESSAY");
    const now = new Date();

    for (const s of scored) {
      await tx.quizAnswer.update({
        where: { attemptId_questionId: { attemptId, questionId: s.questionId } },
        data: { isCorrect: s.isCorrect, pointsAwarded: s.pointsAwarded },
      });
    }
    await tx.quizAttempt.update({
      where: { id: attemptId },
      data: hasEssays
        ? { status: "SUBMITTED", submittedAt: now, autoScore }
        : {
            status: "GRADED",
            submittedAt: now,
            autoScore,
            manualScore: 0,
            totalScore: autoScore,
            gradedAt: now,
            // gradedById stays null: nobody graded it (R64).
          },
    });
    return { hasEssays };
  });
}
