import { db } from "../../db/client";
import type { SubmissionStatus } from "../../generated/prisma/enums";

/**
 * Which group a student is in **for a given season**.
 *
 * Ruling C9: this must resolve through SeasonEnrollment, never GroupStudent.
 * `GroupStudent.studentUserId` is `@unique` on its own, so that table holds one
 * row per student across the entire database and cannot answer a per-season
 * question — a student who moves to a new season's group loses the old row, and
 * every past season then reports them as ungrouped. SeasonEnrollment.groupId is
 * the per-season fact.
 */
async function groupIdInSeason(studentUserId: number, seasonId: number): Promise<number | null> {
  const enrollment = await db.seasonEnrollment.findUnique({
    where: { studentUserId_seasonId: { studentUserId, seasonId } },
    select: { groupId: true },
  });
  return enrollment?.groupId ?? null;
}

/**
 * Ruling C4: derived once here, never re-derived by a renderer. v1 computed the
 * equivalent comparison at five separate sites with no shared helper.
 *
 * Both of these compare instants, so they need no timezone. Anything that
 * buckets by *day* does (ruling C2) and must not use these.
 */
function isOverdue(dueAt: Date | null, now: Date): boolean {
  return dueAt !== null && dueAt.getTime() < now.getTime();
}

function isLate(submittedAt: Date | null, dueAt: Date | null): boolean {
  return submittedAt !== null && dueAt !== null && submittedAt.getTime() > dueAt.getTime();
}

export interface AssignmentListRow {
  id: number;
  title: string;
  dueAt: Date | null;
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

export interface AssignmentDetailData {
  id: number;
  seasonId: number;
  seasonCode: string;
  seasonTitle: string;
  sessionId: number | null;
  sessionTitle: string | null;
  title: string;
  description: string | null;
  dueAt: Date | null;
  isAllGroups: boolean;
  type: "STANDARD" | "FORUM";
  forumMinWords: number | null;
  forumAllowComments: boolean;
  maxFileSizeMb: number | null;
  allowedMimeCategories: string[];
  groupIds: number[];
}

/** Returns null when the assignment does not exist or is soft-deleted. */
export async function loadAssignmentById(id: number): Promise<AssignmentDetailData | null> {
  const a = await db.assignment.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      seasonId: true,
      season: { select: { code: true, title: true } },
      sessionId: true,
      session: { select: { title: true } },
      title: true,
      description: true,
      dueAt: true,
      isAllGroups: true,
      type: true,
      forumMinWords: true,
      forumAllowComments: true,
      maxFileSizeMb: true,
      allowedMimeCategories: true,
      targets: { select: { groupId: true } },
    },
  });
  if (!a) return null;
  return {
    id: a.id,
    seasonId: a.seasonId,
    seasonCode: a.season.code,
    seasonTitle: a.season.title,
    sessionId: a.sessionId,
    sessionTitle: a.session?.title ?? null,
    title: a.title,
    description: a.description,
    dueAt: a.dueAt,
    isAllGroups: a.isAllGroups,
    type: a.type,
    forumMinWords: a.forumMinWords,
    forumAllowComments: a.forumAllowComments,
    maxFileSizeMb: a.maxFileSizeMb,
    allowedMimeCategories: a.allowedMimeCategories,
    groupIds: a.targets.map((t) => t.groupId),
  };
}

export interface StudentAssignmentRow {
  id: number;
  title: string;
  dueAt: Date | null;
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

export async function listAssignmentsForStudent(
  studentUserId: number,
  seasonId: number | null,
): Promise<StudentAssignmentRow[]> {
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
        select: { status: true, reviewedAt: true },
      },
    },
  });

  const now = new Date();
  return assignments.map((a) => {
    const sub = a.submissions[0];
    return {
      id: a.id,
      title: a.title,
      dueAt: a.dueAt,
      isOverdue: isOverdue(a.dueAt, now),
      status: sub?.status ?? "PENDING",
      reviewedAt: sub?.reviewedAt ?? null,
    };
  });
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

  const submissions = await db.submission.findMany({
    where: {
      assignmentId,
      studentUserId: { in: enrollments.map((e) => e.studentUserId) },
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
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));

  return {
    assignmentId: assignment.id,
    dueAt: assignment.dueAt,
    isOverdue: isOverdue(assignment.dueAt, new Date()),
    // "Submitted" means a row exists and is not a DRAFT — the same definition
    // the list's submissionCount uses. Ruling C5: one denominator, one
    // numerator, no second opinion.
    submittedCount: rows.filter((r) => r.status !== "PENDING" && r.status !== "DRAFT").length,
    expectedCount: rows.length,
    rows,
  };
}

export { isLate, isOverdue };
