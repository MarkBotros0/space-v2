import { db } from "../../../db/client";
import type { SubmissionStatus } from "../../../generated/prisma/enums";
import { orgDayKey } from "../../org-time";
import { seasonParticipant } from "../season-participants";
import { isLate, isOverdue } from "./rules";
import { liveAssignment } from "../../db/live";
import { STAFF_MARK_SELECT } from "../../assignments/submitted";
import { assignmentStatusOf, loadWorkIndex, partWorksFor, PART_SELECT, reviewedAtOf, standingOf } from "./part-work";

export interface StudentAssignmentRow {
  id: number;
  title: string;
  dueAt: Date | null;
  /** Org-calendar day of `dueAt` (X13). */
  dueOrgDay: string | null;
  isOverdue: boolean;
  status: SubmissionStatus | "PENDING";
  reviewedAt: Date | null;
  /** When they tapped Submit; null before they have, or since an essay came back. */
  submittedAt: Date | null;
  partsTotal: number;
  partsDone: number;
  returned: boolean;
  /** An essay part exists, so a submitted assignment waits for review. */
  hasEssay: boolean;
  /** Staff marked it submitted: it counts as done whatever the parts say. */
  staffMarked: boolean;
  createdAt: Date;
}

/**
 * Whether this student may see this season's assignments: they are one of its
 * participants (`seasonParticipant`). An assignment is for the whole season, so
 * there is nothing narrower to check. The one definition, shared by the work
 * routes, so they cannot drift into disagreeing about who may see what.
 */
export async function studentCanSeeAssignment(studentUserId: number, seasonId: number): Promise<boolean> {
  const row = await db.seasonEnrollment.findFirst({
    where: { studentUserId, seasonId, ...seasonParticipant },
    select: { id: true },
  });
  return row !== null;
}

/**
 * The student list row plus `isLate` (D16), which the dashboard needs and the
 * list wire shape does not carry.
 */
export interface StudentAssignmentStateRow extends StudentAssignmentRow {
  isLate: boolean;
}

/**
 * Every assignment of this season, with this student's standing on it. The ONE
 * query behind the student list, the student dashboard and the season record,
 * so they cannot disagree about which assignments a student has or how far
 * they are through them. Constant in queries: four however many assignments.
 */
export async function listAssignmentStatesForStudent(
  studentUserId: number,
  seasonId: number | null,
  now: Date = new Date(),
): Promise<StudentAssignmentStateRow[]> {
  if (!seasonId) return [];

  const assignments = await db.assignment.findMany({
    where: { seasonId, ...liveAssignment },
    orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      title: true,
      dueAt: true,
      createdAt: true,
      parts: { orderBy: { position: "asc" }, select: PART_SELECT },
      submissions: { where: { studentUserId }, select: { submittedAt: true, ...STAFF_MARK_SELECT } },
    },
  });
  const index = await loadWorkIndex(
    assignments.flatMap((a) => a.parts.map((p) => p.id)),
    [studentUserId],
  );

  return assignments.map((a) => {
    const sub = a.submissions[0];
    const works = partWorksFor(a.parts, studentUserId, index, { forStaff: false });
    const submittedAt = sub?.submittedAt ?? null;
    const staffMarked = (sub?.staffMark ?? null) !== null;
    return {
      id: a.id,
      title: a.title,
      dueAt: a.dueAt,
      dueOrgDay: a.dueAt ? orgDayKey(a.dueAt) : null,
      isOverdue: isOverdue(a.dueAt, now),
      isLate: isLate(submittedAt, a.dueAt),
      status: assignmentStatusOf(submittedAt, works, sub !== undefined, staffMarked),
      reviewedAt: reviewedAtOf(a.parts, studentUserId, index),
      submittedAt,
      ...standingOf(works),
      staffMarked,
      createdAt: a.createdAt,
    };
  });
}

export async function listAssignmentsForStudent(
  studentUserId: number,
  seasonId: number | null,
): Promise<StudentAssignmentRow[]> {
  const rows = await listAssignmentStatesForStudent(studentUserId, seasonId);
  // `dueOrgDay` rides along so a chip never formats `dueAt` in the device zone;
  // `isLate` stays dashboard-only.
  return rows.map(({ isLate: _late, ...row }) => row);
}
