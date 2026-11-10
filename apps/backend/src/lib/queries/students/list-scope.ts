import { db } from "../../../db/client";
import type { Prisma } from "../../../generated/prisma/client";
import type { SessionUser } from "../../auth/tokens";
import { canReadAllStudents } from "../../rbac";

/** Which students a caller may list (refactor BE-014: split from list.ts). */
type StudentScope = { kind: "all" } | { kind: "ids"; ids: number[] };

/**
 * D6's single implementation of "which students may this caller see".
 *
 * SUPER and MENTOR read all (canReadAllStudents). ADMIN gets the distinct
 * students EVER enrolled in their seasons, regardless of enrollment status —
 * v1's semantics (R30/R31), kept: the list answers "ever mine", not
 * "currently mine". LEADER gets the distinct students whose ENROLLMENT names
 * one of their groups — ruling C9; v1's (unreachable — no leader list page
 * ever existed, R28) branch read GroupStudent instead, which (while that table
 * was global) forgot a leader's students the moment a later season
 * reassigned them.
 *
 * null = this caller has no student-list surface at all (STUDENT) → 403.
 */
export async function studentListScope(user: SessionUser): Promise<StudentScope | null> {
  if (canReadAllStudents(user)) return { kind: "all" };
  if (user.role === "ADMIN") {
    if (user.seasonAdminIds.length === 0) return { kind: "ids", ids: [] };
    return { kind: "ids", ids: await enrolledStudentIds({ seasonId: { in: user.seasonAdminIds } }) };
  }
  if (user.role === "LEADER") {
    if (user.groupLeaderIds.length === 0) return { kind: "ids", ids: [] };
    return { kind: "ids", ids: await enrolledStudentIds({ groupId: { in: user.groupLeaderIds } }) };
  }
  return null;
}

/** The distinct students with an enrolment matching `where`, any status. */
async function enrolledStudentIds(where: Prisma.SeasonEnrollmentWhereInput): Promise<number[]> {
  const enrollments = await db.seasonEnrollment.findMany({
    where,
    select: { studentUserId: true },
    distinct: ["studentUserId"],
  });
  return enrollments.map((e) => e.studentUserId);
}
