import type { Prisma } from "../../generated/prisma/client";
import { db } from "../../db/client";
import { toScore } from "./score";

/**
 * The attempt that counts (spec "Honest accidents"): the highest total among
 * GRADED attempts, a tie going to the later attempt. SUBMITTED and IN_PROGRESS
 * attempts never count.
 */
export function bestGraded<
  A extends { status: string; totalScore: Prisma.Decimal | number | null; attemptNumber: number },
>(attempts: A[]): A | null {
  let best: A | null = null;
  for (const a of attempts) {
    if (a.status !== "GRADED") continue;
    const score = toScore(a.totalScore) ?? 0;
    const bestScore = best ? (toScore(best.totalScore) ?? 0) : -Infinity;
    if (!best || score > bestScore || (score === bestScore && a.attemptNumber > best.attemptNumber)) best = a;
  }
  return best;
}

/**
 * Best graded score per quiz and student, in one query. Keys are
 * `${quizId}:${studentId}`; a pair with no graded attempt has no entry.
 * `studentIds` null means every student.
 */
export async function bestScoresFor(quizIds: number[], studentIds: number[] | null): Promise<Map<string, number>> {
  if (quizIds.length === 0 || (studentIds !== null && studentIds.length === 0)) return new Map();
  const rows = await db.quizAttempt.groupBy({
    by: ["quizId", "studentUserId"],
    where: {
      quizId: { in: quizIds },
      status: "GRADED",
      ...(studentIds !== null ? { studentUserId: { in: studentIds } } : {}),
    },
    _max: { totalScore: true },
  });
  const scores = new Map<string, number>();
  for (const r of rows) {
    const score = toScore(r._max.totalScore);
    if (score !== null) scores.set(`${r.quizId}:${r.studentUserId}`, score);
  }
  return scores;
}
