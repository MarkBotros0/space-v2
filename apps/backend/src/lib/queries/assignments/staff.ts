import { db } from "../../../db/client";
import type { SubmissionStatus } from "../../../generated/prisma/enums";
import { orgDayKey } from "../../org-time";
import { isLate, isOverdue } from "./rules";

export interface AssignmentListRow {
  id: number;
  title: string;
  dueAt: Date | null;
  dueOrgDay: string | null;
  isOverdue: boolean;
  isAllGroups: boolean;
  targetGroupIds: number[];
  submissionCount: number;
  expectedCount: number;
  seasonCode: string;
}

export async function listAssignmentsForSeason(seasonId: number): Promise<AssignmentListRow[]> {
  const rows = await db.assignment.findMany({
    where: { seasonId, deletedAt: null },
    orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      title: true,
      dueAt: true,
      isAllGroups: true,
      _count: { select: { submissions: { where: { status: { not: "DRAFT" } } } } },
      targets: { select: { groupId: true } },
      season: { select: { code: true, id: true } },
    },
  });

  const now = new Date();

  // Expected count: students in targeted groups (or all season-enrolled if isAllGroups).
  return Promise.all(
    rows.map(async (a) => {
      const targetGroupIds = a.targets.map((t) => t.groupId);
      // Both branches count SeasonEnrollment. Counting GroupStudent instead —
      // as this did — counts every student whose *current* group is targeted,
      // regardless of season, so a past season's assignment was measured
      // against this season's roster. Ruling C9.
      const expected = await db.seasonEnrollment.count({
        where: {
          seasonId: a.season.id,
          status: "ACTIVE",
          ...(a.isAllGroups ? {} : { groupId: { in: targetGroupIds } }),
        },
      });
      return {
        id: a.id,
        title: a.title,
        dueAt: a.dueAt,
        dueOrgDay: a.dueAt ? orgDayKey(a.dueAt) : null,
        isOverdue: isOverdue(a.dueAt, now),
        isAllGroups: a.isAllGroups,
        targetGroupIds,
        submissionCount: a._count.submissions,
        expectedCount: expected,
        seasonCode: a.season.code,
      };
    }),
  );
}

export interface AssignmentTrackerRowData {
  studentUserId: number;
  name: string | null;
  email: string;
  groupId: number | null;
  groupName: string | null;
  status: SubmissionStatus | "PENDING";
  isLate: boolean;
  submittedAt: Date | null;
  reviewedAt: Date | null;
  submissionPublicId: string | null;
}

export interface AssignmentTrackerData {
  assignmentId: number;
  dueAt: Date | null;
  isOverdue: boolean;
  submittedCount: number;
  expectedCount: number;
  rows: AssignmentTrackerRowData[];
}

function compareNullsLast(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a.localeCompare(b);
}

/**
 * Who was given this assignment and what they have done about it.
 *
 * `restrictToGroupIds` narrows the roster for a leader, who may see only their
 * own groups — the same scoping the attendance roster needed, for the same
 * reason: the rows carry every student's name and email.
 *
 * The population comes from SeasonEnrollment, not from who happens to have a
 * Submission row, so a student who has done nothing still appears. That is the
 * whole point of a tracker, and it is also why `expectedCount` here and the
 * list's agree — one definition, ruling C5.
 */
export async function loadAssignmentTracker(
  assignmentId: number,
  restrictToGroupIds?: number[],
): Promise<AssignmentTrackerData | null> {
  const assignment = await db.assignment.findFirst({
    where: { id: assignmentId, deletedAt: null },
    select: {
      id: true,
      seasonId: true,
      dueAt: true,
      isAllGroups: true,
      targets: { select: { groupId: true } },
    },
  });
  if (!assignment) return null;

  const targetGroupIds = assignment.targets.map((t) => t.groupId);
  const groupFilter = assignment.isAllGroups ? undefined : { in: targetGroupIds };
  const groupId =
    restrictToGroupIds === undefined
      ? groupFilter
      : {
          in: assignment.isAllGroups
            ? restrictToGroupIds
            : restrictToGroupIds.filter((id) => targetGroupIds.includes(id)),
        };

  const enrollments = await db.seasonEnrollment.findMany({
    where: { seasonId: assignment.seasonId, status: "ACTIVE", ...(groupId ? { groupId } : {}) },
    select: {
      studentUserId: true,
      groupId: true,
      group: { select: { name: true } },
      studentUser: { select: { name: true, email: true } },
    },
  });

  // A DRAFT is the student's unfinished work and exists only for its author,
  // so the tracker shows that student as PENDING, with no link to open.
  const submissions = await db.submission.findMany({
    where: {
      assignmentId,
      studentUserId: { in: enrollments.map((e) => e.studentUserId) },
      status: { not: "DRAFT" },
    },
    select: {
      studentUserId: true,
      publicId: true,
      status: true,
      submittedAt: true,
      reviewedAt: true,
    },
  });
  const byStudent = new Map(submissions.map((s) => [s.studentUserId, s]));

  const rows: AssignmentTrackerRowData[] = enrollments
    .map((e) => {
      const sub = byStudent.get(e.studentUserId);
      return {
        studentUserId: e.studentUserId,
        name: e.studentUser.name,
        email: e.studentUser.email,
        groupId: e.groupId,
        groupName: e.group?.name ?? null,
        status: sub?.status ?? ("PENDING" as const),
        isLate: isLate(sub?.submittedAt ?? null, assignment.dueAt),
        submittedAt: sub?.submittedAt ?? null,
        reviewedAt: sub?.reviewedAt ?? null,
        submissionPublicId: sub?.publicId ?? null,
      };
    })
    // v1's order (REG-84): group name, then student name. A student with no
    // group sorts after every named group; name ties fall back to id so the
    // order is deterministic.
    .sort(
      (a, b) =>
        compareNullsLast(a.groupName, b.groupName) ||
        compareNullsLast(a.name, b.name) ||
        a.studentUserId - b.studentUserId,
    );

  return {
    assignmentId: assignment.id,
    dueAt: assignment.dueAt,
    isOverdue: isOverdue(assignment.dueAt, new Date()),
    // "Submitted" means a row exists and is not a DRAFT — the same definition
    // the list's submissionCount uses. Ruling C5: one denominator, one
    // numerator, no second opinion.
    // Drafts were filtered out above, so any row with a status was turned in.
    submittedCount: rows.filter((r) => r.status !== "PENDING").length,
    expectedCount: rows.length,
    rows,
  };
}
