import { db } from "../../db/client";
import type { SessionUser } from "../auth/tokens";
import { isMentor, isSuper } from "../rbac";

export type StaffRoster = { seasonId: { in: number[] } } | { groupId: { in: number[] } };

/**
 * The rows of a live season the caller serves in, as a `where` that fits both
 * SeasonEnrollment and GroupStudent: an ADMIN's seasons, a LEADER's groups. The
 * claims hold only DRAFT and ACTIVE seasons, so a finished one has already gone.
 * Null for SUPER, MENTOR and STUDENT, who have no staff roster.
 */
export function staffRosterWhere(user: SessionUser): StaffRoster | null {
  if (user.role === "ADMIN") return { seasonId: { in: user.seasonAdminIds } };
  if (user.role === "LEADER") return { groupId: { in: user.groupLeaderIds } };
  return null;
}

/**
 * Is this student on the caller's staff roster in a season they serve in now?
 *
 * ADMIN: enrolled (any status) in a season they administer — SeasonEnrollment,
 * not StudentProfile.activeSeasonId (spec D12, R47/R48). LEADER: an enrolment
 * names a group they lead — SeasonEnrollment.groupId, not GroupStudent (ruling
 * C9, R49/R50). Every other role: false. canViewStudent and canWriteNote both
 * answer through this, so "can see" and "can write about" cannot disagree. What
 * they then see of the student is narrowed to that season: see
 * canReadEnrollmentHistory.
 */
export async function staffRosterIncludes(user: SessionUser, studentUserId: number): Promise<boolean> {
  const roster = staffRosterWhere(user);
  if (!roster) return false;
  const enrollment = await db.seasonEnrollment.findFirst({
    where: { studentUserId, ...roster },
    select: { id: true },
  });
  return enrollment !== null;
}

/**
 * May this caller read this student at all? (spec 06 §4.1 "Read student detail")
 *
 * v1's loadStudentDetail performed no authorization — four pages each called
 * canViewStudent by convention before it (R70). Here the gate lives in the
 * handler. One deliberate divergence from v1's gate: the LEADER branch
 * resolves through SeasonEnrollment.groupId, not GroupStudent (ruling C9) —
 * while GroupStudent was global (before Plan 18 M1) it answered "are they in
 * my group NOW", denying a leader their own students' history the moment a
 * new season reassigned them. canViewSubmission makes this exact call; the
 * two must not disagree.
 */
export async function canViewStudent(user: SessionUser, studentUserId: number): Promise<boolean> {
  if (isSuper(user) || isMentor(user)) return true;
  if (user.userId === studentUserId) return true;
  return staffRosterIncludes(user, studentUserId);
}

/**
 * May this caller edit this student's profile?
 *
 * Divergence from v1, per spec 06 D4: v1's canEditStudent tested the
 * activeSeasonId pointer while canViewStudent tested enrollments, so an ADMIN
 * could edit a student their list never showed them and not edit one it did.
 * Both gates are enrollment-based here, and edit additionally requires the
 * enrollment to be ACTIVE — an admin's write power over a person ends when
 * that person's season with them does.
 */
export async function canEditStudent(user: SessionUser, studentUserId: number): Promise<boolean> {
  if (isSuper(user)) return true;
  if (user.userId === studentUserId) return true;
  if (user.role !== "ADMIN" || user.seasonAdminIds.length === 0) return false;
  const enrollment = await db.seasonEnrollment.findFirst({
    where: { studentUserId, seasonId: { in: user.seasonAdminIds }, status: "ACTIVE" },
    select: { id: true },
  });
  return enrollment !== null;
}
