import { db } from "../../db/client";
import type { SessionUser } from "../auth/tokens";
import { isAdminOfSeason, isSuper } from "../rbac";
import { staffScopeForSeason } from "./season";

/** The season a quiz belongs to, or null when it does not exist. */
async function quizSeasonId(quizId: number): Promise<number | null> {
  const quiz = await db.quiz.findUnique({ where: { id: quizId }, select: { seasonId: true } });
  return quiz?.seasonId ?? null;
}

/**
 * The authoring gate: SUPER, or an admin of the quiz's own season.
 *
 * Same rule as v1's canManageQuiz (permissions.ts:135-146). What changes is that
 * here it is the ONLY thing between a caller and a question write — there is no
 * longer a page that simply does not render the builder.
 */
export async function canManageQuiz(user: SessionUser, quizId: number): Promise<boolean> {
  if (isSuper(user)) return true;
  const seasonId = await quizSeasonId(quizId);
  if (seasonId === null) return false;
  return isAdminOfSeason(user, seasonId);
}

/**
 * The grading gate: anyone with a staff scope in the quiz's season — SUPER, the
 * season's admin, or a leader with a group in it.
 *
 * Expressed through staffScopeForSeason rather than a hand-written copy of v1's
 * isLeaderInSeason, deliberately: the same call that answers "may they grade"
 * also produces the student set they may grade over (lib/quiz-scope.ts), so the
 * gate and the scope cannot drift apart. v1 kept them in different files and the
 * write side never consulted the scope at all (R93).
 */
export async function canGradeQuiz(user: SessionUser, quizId: number): Promise<boolean> {
  const seasonId = await quizSeasonId(quizId);
  if (seasonId === null) return false;
  return (await staffScopeForSeason(user, seasonId)) !== null;
}
