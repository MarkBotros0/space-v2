import { db } from "../../../db/client";
import type { SubmissionStatus } from "../../../generated/prisma/enums";
import { orgDayKey } from "../../org-time";
import { groupIdInSeason } from "../enrollment";
import { isLate, isOverdue } from "./rules";

export interface StudentAssignmentRow {
  id: number;
  title: string;
  dueAt: Date | null;
  /** Org-calendar day of `dueAt` (X13). */
  dueOrgDay: string | null;
  isOverdue: boolean;
  status: SubmissionStatus | "PENDING";
  reviewedAt: Date | null;
}

/**
 * Whether this assignment is targeted at this student, for this season.
 *
 * The single definition of the visibility rule. v1 spelled it out separately in
 * the list query, the detail page and the tracker; exporting it here means the
 * route and the list cannot drift into disagreeing about who may see what.
 */
export async function studentCanSeeAssignment(
  studentUserId: number,
  seasonId: number,
  isAllGroups: boolean,
  targetGroupIds: number[],
): Promise<boolean> {
  if (isAllGroups) return true;
  const groupId = await groupIdInSeason(studentUserId, seasonId);
  return groupId !== null && targetGroupIds.includes(groupId);
}

/**
 * The student list row plus `isLate` (D16), which the dashboard needs and the
 * list wire shape does not carry.
 */
export interface StudentAssignmentStateRow extends StudentAssignmentRow {
  isLate: boolean;
}

/**
 * Every assignment targeted at this student in this season, with their state.
 * The ONE query behind both the student list and the student dashboard, so
 * the two cannot disagree about which assignments a student was given (C9).
 */
export async function listAssignmentStatesForStudent(
  studentUserId: number,
  seasonId: number | null,
  now: Date = new Date(),
): Promise<StudentAssignmentStateRow[]> {
  if (!seasonId) return [];

  const groupId = await groupIdInSeason(studentUserId, seasonId);

  const assignments = await db.assignment.findMany({
    where: {
      seasonId,
      deletedAt: null,
      OR: [
        { isAllGroups: true },
        ...(groupId !== null ? [{ targets: { some: { groupId } } }] : []),
      ],
    },
    orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      title: true,
      dueAt: true,
      submissions: {
        where: { studentUserId },
        select: { status: true, reviewedAt: true, submittedAt: true },
      },
    },
  });

  return assignments.map((a) => {
    const sub = a.submissions[0];
    return {
      id: a.id,
      title: a.title,
      dueAt: a.dueAt,
      dueOrgDay: a.dueAt ? orgDayKey(a.dueAt) : null,
      isOverdue: isOverdue(a.dueAt, now),
      isLate: isLate(sub?.submittedAt ?? null, a.dueAt),
      status: sub?.status ?? "PENDING",
      reviewedAt: sub?.reviewedAt ?? null,
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
