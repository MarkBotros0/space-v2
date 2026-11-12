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

/**
 * The score that counts for one student on an ONLINE quiz (plan 4): the season admin's score
 * (a QuizGrade row) whenever one exists, even below an in-app attempt; otherwise the best GRADED
 * attempt. A row with no score is no admin score. Every reader of a quiz score goes through this
 * (or `bestScoreByStudent`), so no two can disagree.
 */
export function countingScore<
  A extends { status: string; totalScore: Prisma.Decimal | number | null; attemptNumber: number },
>(
  manual: { score: Prisma.Decimal | number | null } | null,
  attempts: A[],
): { score: number; source: "manual" | "attempt" } | null {
  const adminScore = manual ? toScore(manual.score) : null;
  if (adminScore !== null) return { score: adminScore, source: "manual" };
  const best = bestGraded(attempts);
  return best ? { score: toScore(best.totalScore) ?? 0, source: "attempt" } : null;
}

/**
 * Each student's counting score: their admin score from `adminScores` when they have one,
 * otherwise their best GRADED total (as `bestGraded` picks it). A student with neither is left out.
 */
export function bestScoreByStudent<
  A extends {
    studentUserId: number;
    status: string;
    totalScore: Prisma.Decimal | number | null;
    attemptNumber: number;
  },
>(attempts: A[], adminScores: ReadonlyMap<number, number> = new Map()): Map<number, number> {
  const byStudent = new Map<number, A[]>();
  for (const a of attempts) byStudent.set(a.studentUserId, [...(byStudent.get(a.studentUserId) ?? []), a]);
  const out = new Map<number, number>();
  for (const [studentUserId, own] of byStudent) {
    const best = bestGraded(own);
    if (best) out.set(studentUserId, toScore(best.totalScore) ?? 0);
  }
  for (const [studentUserId, score] of adminScores) out.set(studentUserId, score);
  return out;
}
