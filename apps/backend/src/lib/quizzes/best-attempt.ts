import type { Prisma } from "../../generated/prisma/client";
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

/** Each student's best GRADED total (as `bestGraded` picks it); a student with none graded is left out. */
export function bestScoreByStudent<
  A extends {
    studentUserId: number;
    status: string;
    totalScore: Prisma.Decimal | number | null;
    attemptNumber: number;
  },
>(attempts: A[]): Map<number, number> {
  const byStudent = new Map<number, A[]>();
  for (const a of attempts) byStudent.set(a.studentUserId, [...(byStudent.get(a.studentUserId) ?? []), a]);
  const out = new Map<number, number>();
  for (const [studentUserId, own] of byStudent) {
    const best = bestGraded(own);
    if (best) out.set(studentUserId, toScore(best.totalScore) ?? 0);
  }
  return out;
}
