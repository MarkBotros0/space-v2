import { isStudyingAlumnus as studyingRule } from "../../../../packages/shared/src/navigation";
import type { SessionUser } from "./auth/tokens";

export function isSuper(u: SessionUser): boolean {
  return u.role === "SUPER";
}

/**
 * An alumnus is a graduated student — role stays STUDENT, but graduationYear is
 * set. Alumni get read-only access instead of the active-student experience,
 * unless they are studying (`isStudyingAlumnus` below), which decides the experience.
 */
export function isAlumnus(u: SessionUser): boolean {
  return u.role === "STUDENT" && u.graduationYear != null;
}

/** Shared's rule over a token: an alumnus in a student seat gets the student experience. */
export function isStudyingAlumnus(u: SessionUser): boolean {
  return studyingRule(u);
}

/** Shared's rule over a token: the alumni experience, i.e. an alumnus who isn't studying. */
export function isAlumnusNotStudying(u: SessionUser): boolean {
  return isAlumnus(u) && !isStudyingAlumnus(u);
}

export function isMentor(u: SessionUser): boolean {
  return u.role === "MENTOR";
}

/**
 * `seasonAdminIds` and `groupLeaderIds` are the identity now: `loadScopes`
 * derives the role from these same rows, so there's no role left to pair a
 * claim with, and an admin who also leads a group in their season holds both
 * lists (Review Focus 3). This replaces ruling C7's "a stray row grants
 * nothing": the rows themselves are guarded where they're written (lib/roles,
 * Task 2). MENTOR's lists are always empty; the test is the backstop for a
 * token minted otherwise. SUPER short-circuits because it is scoped to nothing
 * in particular.
 */
export function isAdminOfSeason(u: SessionUser, seasonId: number): boolean {
  if (u.role === "SUPER") return true;
  return u.role !== "MENTOR" && u.seasonAdminIds.includes(seasonId);
}

export function isLeaderOfGroup(u: SessionUser, groupId: number): boolean {
  return u.role !== "MENTOR" && u.groupLeaderIds.includes(groupId);
}

export function canReadAllStudents(u: SessionUser): boolean {
  return u.role === "SUPER" || u.role === "MENTOR";
}

export function canManageUsers(u: SessionUser): boolean {
  return u.role === "SUPER";
}
