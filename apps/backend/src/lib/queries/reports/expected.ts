import type { EnrollmentStatus } from "../../../generated/prisma/client";

interface ExpectedEnrollment {
  studentUserId: number;
  groupId: number | null;
  status: EnrollmentStatus;
}

interface ExpectedAssignment {
  isAllGroups: boolean;
  targets: Array<{ groupId: number }>;
}

/**
 * The students an assignment's completion bar is measured against: the
 * season's enrolments, narrowed by the enrolment's group when the assignment
 * is targeted (ruling C9 — through SeasonEnrollment, never GroupStudent).
 *
 * ACTIVE and COMPLETED both count; only WITHDRAWN is left out. COMPLETED is
 * what every enrolment becomes when its student finishes the season or
 * graduates, and those students were set the assignment like everyone else.
 * Counting ACTIVE alone made a finished season's every bar read 0 expected and
 * no rate at all, exactly when the season is worth reporting on.
 *
 * Rosters filter in the query with `seasonParticipant` instead. This one counts
 * a live season's graduate too, on purpose: the assignment was set to them.
 */
export function expectedStudentIds(
  enrollments: readonly ExpectedEnrollment[],
  assignment: ExpectedAssignment,
): Set<number> {
  const ids = new Set<number>();
  for (const e of enrollments) {
    if (e.status === "WITHDRAWN") continue;
    if (assignment.isAllGroups || (e.groupId !== null && assignment.targets.some((t) => t.groupId === e.groupId))) {
      ids.add(e.studentUserId);
    }
  }
  return ids;
}
