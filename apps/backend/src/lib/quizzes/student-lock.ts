import type { Prisma } from "../../generated/prisma/client";

type LockedQuiz = {
  kind: string;
  maxScore: number;
  publishedAt: Date | null;
  startsFrom: Date | null;
  startsUntil: Date | null;
  timeLimitMinutes: number | null;
};

/**
 * The one lock order for a student's place in a quiz (plan 4):
 *
 *   1. the Quiz row FOR SHARE (a settings or question edit takes it FOR UPDATE, so neither can
 *      change the limit or maxScore under this transaction);
 *   2. the student's User row FOR NO KEY UPDATE, which serialises this student's writes on the
 *      quiz (NO KEY, so the foreign key checks of their other inserts don't queue behind it);
 *   3. then their attempts and their QuizGrade row.
 *
 * The admin's score (`saveManualScore`), the first start and a reopened attempt's start
 * (`start-attempt.ts`) and a reopen (`reopen-attempt.ts`) all take it, so a start and a save
 * never interleave: whichever locks second waits, then sees the other's row. Returns null when
 * the quiz is gone.
 */
export async function lockStudentInQuiz(
  tx: Prisma.TransactionClient,
  quizId: number,
  studentUserId: number,
): Promise<LockedQuiz | null> {
  const rows = await tx.$queryRaw<LockedQuiz[]>`
    SELECT "kind"::text AS "kind", "maxScore", "publishedAt", "startsFrom", "startsUntil", "timeLimitMinutes"
    FROM "Quiz" WHERE "id" = ${quizId} FOR SHARE`;
  const quiz = rows[0];
  if (!quiz) return null;
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${studentUserId} FOR NO KEY UPDATE`;
  return quiz;
}
