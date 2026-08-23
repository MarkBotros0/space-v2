import type { SessionUser } from "./auth/tokens";

export function isSuper(u: SessionUser): boolean {
  return u.role === "SUPER";
}

/**
 * An alumnus is a graduated student — role stays STUDENT, but graduationYear is
 * set. Alumni get read-only access instead of the active-student experience.
 */
export function isAlumnus(u: SessionUser): boolean {
  return u.role === "STUDENT" && u.graduationYear != null;
}

export function isMentor(u: SessionUser): boolean {
  return u.role === "MENTOR";
}

/**
 * `seasonAdminIds` and `groupLeaderIds` are grants, not identity. `loadScopes`
 * reads them straight from the SeasonAdmin and GroupLeader tables with no role
 * filter, and v1 writes both join tables from unvalidated request input — its
 * group form takes `leaderIds` off the raw body, constrained only by which
 * options the picker happened to render. So a SeasonAdmin or GroupLeader row
 * naming a STUDENT is reachable, and without the role test below it would hand
 * that student staff powers over a season or a group.
 *
 * Pairing each claim with the role that can legitimately hold it means a stray
 * row grants nothing on its own. SUPER short-circuits because it is scoped to
 * nothing in particular; every other role must match its grant.
 */
export function isAdminOfSeason(u: SessionUser, seasonId: number): boolean {
  if (u.role === "SUPER") return true;
  return u.role === "ADMIN" && u.seasonAdminIds.includes(seasonId);
}

export function isLeaderOfGroup(u: SessionUser, groupId: number): boolean {
  return u.role === "LEADER" && u.groupLeaderIds.includes(groupId);
}

export function canReadAllStudents(u: SessionUser): boolean {
  return u.role === "SUPER" || u.role === "MENTOR";
}

export function canManageUsers(u: SessionUser): boolean {
  return u.role === "SUPER";
}
