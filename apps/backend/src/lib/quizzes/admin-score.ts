import type { Prisma } from "../../generated/prisma/client";

/**
 * THE definition of the season admin's score on an ONLINE quiz (plan 4): a QuizGrade row with a
 * score. A row with no score is no admin score. Every check that asks "has the admin scored this
 * student / this quiz" filters with this, so the freeze, the refusals and the readers agree.
 */
export const ADMIN_SCORE_WHERE = { score: { not: null } } as const;

/** Whether the season admin has entered this student's score. Read under the lock in student-lock.ts. */
export async function hasAdminScore(tx: Prisma.TransactionClient, quizId: number, studentUserId: number) {
  return (await tx.quizGrade.count({ where: { quizId, studentUserId, ...ADMIN_SCORE_WHERE } })) > 0;
}

/** Whether any student has the admin's score on this quiz. */
export async function quizHasAdminScores(tx: Prisma.TransactionClient, quizId: number) {
  return (await tx.quizGrade.count({ where: { quizId, ...ADMIN_SCORE_WHERE } })) > 0;
}
