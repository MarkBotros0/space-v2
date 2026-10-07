import { db } from "../db/client";
import type { QuizKind } from "../generated/prisma/enums";

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

/**
 * How many of `studentIds` are graded on each quiz — THE definition of
 * "graded" (ruling C4, spec 12 D10), moved here from `GET /quizzes` so the
 * dashboard's quiz roll-up uses it instead of a copy (spec 19 D10).
 *
 * PAPER: a QuizGrade row with a real score. ONLINE: an attempt that reached
 * GRADED. v1's dashboards never consulted QuizAttempt, so every ONLINE quiz
 * read as permanently pending (spec 12 R114). Two groupBys, whatever the
 * number of quizzes or students.
 */
export async function countGradedByQuiz(
  quizzes: readonly { id: number; kind: QuizKind }[],
  studentIds: readonly number[],
): Promise<Map<number, number>> {
  if (quizzes.length === 0 || studentIds.length === 0) return new Map();
  const quizIds = quizzes.map((q) => q.id);
  const [paperGraded, onlineGraded] = await Promise.all([
    db.quizGrade.groupBy({
      by: ["quizId"],
      where: { quizId: { in: quizIds }, studentUserId: { in: [...studentIds] }, score: { not: null } },
      _count: { _all: true },
    }),
    db.quizAttempt.groupBy({
      by: ["quizId"],
      where: { quizId: { in: quizIds }, studentUserId: { in: [...studentIds] }, status: "GRADED" },
      _count: { _all: true },
    }),
  ]);
  const paperBy = new Map(paperGraded.map((g) => [g.quizId, g._count._all]));
  const onlineBy = new Map(onlineGraded.map((g) => [g.quizId, g._count._all]));
  return new Map(
    quizzes.map((q) => [q.id, (q.kind === "PAPER" ? paperBy.get(q.id) : onlineBy.get(q.id)) ?? 0]),
  );
}
