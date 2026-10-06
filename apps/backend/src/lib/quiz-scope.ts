import { db } from "../db/client";

import type { SessionUser } from "./auth/tokens";
import { staffScopeForSeason } from "./permissions";

/**
 * Which students this caller may grade in this season.
 *
 * THE ENDPOINT DERIVES THIS. It is never accepted from the client.
 *
 * v1's two grading reads took `studentUserIds` as a parameter and enforced
 * nothing (R105); the only scoping in the system was the array each page
 * computed for its own read, while saveQuizGradesAction iterated whatever array
 * the caller sent and upserted every id verbatim (R93). That is the same shape
 * as the confirmed attendance defect — a group-scoped read feeding an unscoped
 * write — and ruling C8 exists to end it.
 *
 * Ruling C9: membership is the per-season enrolment's groupId. GroupStudent is
 * unique on studentUserId across the entire database, so it answers "what group
 * is this student in *now*", which is the wrong question for any past season.
 *
 * Returns null when the caller has no staff scope in the season at all.
 */
export async function visibleStudentIdsForQuiz(
  user: SessionUser,
  seasonId: number,
): Promise<number[] | null> {
  const scope = await staffScopeForSeason(user, seasonId);
  if (scope === null) return null;

  const enrollments = await db.seasonEnrollment.findMany({
    where: {
      seasonId,
      status: "ACTIVE",
      ...(scope.kind === "groups" ? { groupId: { in: scope.groupIds } } : {}),
    },
    select: { studentUserId: true },
  });
  // Sorted so the grading list's cursor — which pages over these ids — is stable.
  return enrollments.map((e) => e.studentUserId).sort((a, b) => a - b);
}
