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

export function isAdminOfSeason(u: SessionUser, seasonId: number): boolean {
  return u.role === "SUPER" || u.seasonAdminIds.includes(seasonId);
}

export function isLeaderOfGroup(u: SessionUser, groupId: number): boolean {
  return u.groupLeaderIds.includes(groupId);
}

export function canReadAllStudents(u: SessionUser): boolean {
  return u.role === "SUPER" || u.role === "MENTOR";
}

export function canManageUsers(u: SessionUser): boolean {
  return u.role === "SUPER";
}
