import type { Prisma } from "../../../generated/prisma/client";

import { db } from "../../../db/client";
import type { AssignmentProgress } from "../../../../../../packages/shared/src/index";
import { ApiError } from "../../api-error";
import { orgDayKey } from "../../org-time";
import { seasonParticipant } from "../season-participants";
import { isOverdue } from "./rules";
import { liveAssignment, liveUser } from "../../db/live";
import { isSubmitted, STAFF_MARK_SELECT, SUBMITTED_WHERE } from "../../assignments/submitted";
import { loadWorkIndex, partWorksFor, PART_SELECT } from "./part-work";

export interface AssignmentListRow {
  id: number;
  title: string;
  dueAt: Date | null;
  dueOrgDay: string | null;
  isOverdue: boolean;
  partsCount: number;
  submissionCount: number;
  expectedCount: number;
  /** Essays handed in and waiting for a verdict, among the students the caller reviews. */
  pendingReviewCount: number;
  seasonCode: string;
}

/**
 * The season's assignments for staff. An assignment is for the whole season,
 * so every row's expected count is the season's participants (one count), and
 * its submission count those of them who have submitted (SUBMITTED_WHERE).
 * `reviewScope` is the caller's review queue scope (submissionQueueScopeFor): the
 * essays waiting for review are counted among those students only, so a leader's
 * "2 to review" is their own groups'; null counts none.
 */
export async function listAssignmentsForSeason(
  seasonId: number,
  reviewScope: Prisma.SubmissionWhereInput | null = null,
): Promise<AssignmentListRow[]> {
  // One denominator with the progress roster: live users only.
  const participant = { ...liveUser, seasonEnrollments: { some: { seasonId, ...seasonParticipant } } };
  const [rows, expectedCount, waiting] = await Promise.all([
    db.assignment.findMany({
      where: { seasonId, ...liveAssignment },
      orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        title: true,
        dueAt: true,
        _count: {
          select: {
            parts: true,
            submissions: { where: { ...SUBMITTED_WHERE, studentUser: participant } },
          },
        },
        season: { select: { code: true } },
      },
    }),
    db.seasonEnrollment.count({ where: { seasonId, ...seasonParticipant, studentUser: liveUser } }),
    reviewScope === null
      ? Promise.resolve([])
      : db.assignmentPartWork.findMany({
          where: {
            status: "SUBMITTED",
            part: { kind: "ESSAY", assignment: { seasonId, ...liveAssignment } },
            submission: reviewScope,
          },
          select: { part: { select: { assignmentId: true } } },
        }),
  ]);
  const waitingBy = new Map<number, number>();
  for (const w of waiting) waitingBy.set(w.part.assignmentId, (waitingBy.get(w.part.assignmentId) ?? 0) + 1);

  const now = new Date();
  return rows.map((a) => ({
    id: a.id,
    title: a.title,
    dueAt: a.dueAt,
    dueOrgDay: a.dueAt ? orgDayKey(a.dueAt) : null,
    isOverdue: isOverdue(a.dueAt, now),
    partsCount: a._count.parts,
    submissionCount: a._count.submissions,
    expectedCount,
    pendingReviewCount: waitingBy.get(a.id) ?? 0,
    seasonCode: a.season.code,
  }));
}

function compareNullsLast(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a.localeCompare(b);
}

/**
 * `loadAssignmentProgress`: every participant of the season with their work on
 * each part. `restrictGroupIds` narrows it to a leader's own groups, the same
 * scoping the attendance roster has, because the rows name students. The
 * population comes from SeasonEnrollment, so a student who has done nothing
 * still appears. Students who haven't submitted (in the app, or marked by
 * staff) come first, then by name. A draft essay or forum post is the
 * student's alone: it reads as not started. `canMark` is the route's: the
 * caller may mark these rows submitted.
 */
export async function loadAssignmentProgress(
  id: number,
  restrictGroupIds: number[] | undefined,
  canMark: boolean,
): Promise<AssignmentProgress> {
  const assignment = await db.assignment.findFirst({
    where: { id, ...liveAssignment },
    select: { seasonId: true, parts: { orderBy: { position: "asc" }, select: PART_SELECT } },
  });
  if (!assignment) throw new ApiError("not_found", "Assignment not found.", 404);

  const enrollments = await db.seasonEnrollment.findMany({
    where: {
      seasonId: assignment.seasonId,
      ...seasonParticipant,
      studentUser: liveUser,
      ...(restrictGroupIds ? { groupId: { in: restrictGroupIds } } : {}),
    },
    select: { studentUserId: true, studentUser: { select: { name: true, avatarPath: true } } },
  });
  const studentIds = enrollments.map((e) => e.studentUserId);
  const [submissions, index] = await Promise.all([
    db.submission.findMany({
      where: { assignmentId: id, studentUserId: { in: studentIds } },
      select: { studentUserId: true, submittedAt: true, ...STAFF_MARK_SELECT },
    }),
    loadWorkIndex(
      assignment.parts.map((p) => p.id),
      studentIds,
    ),
  ]);
  const byStudent = new Map(submissions.map((s) => [s.studentUserId, s]));

  const rows = enrollments
    .map((e) => {
      const sub = byStudent.get(e.studentUserId);
      const mark = sub?.staffMark ?? null;
      return {
        studentUserId: e.studentUserId,
        name: e.studentUser.name,
        avatarPath: e.studentUser.avatarPath,
        submittedAt: sub?.submittedAt?.toISOString() ?? null,
        staffMark: mark && { markedAt: mark.markedAt.toISOString(), markedByName: mark.markedBy?.name ?? null },
        parts: partWorksFor(assignment.parts, e.studentUserId, index, { forStaff: true }),
        done: sub !== undefined && isSubmitted(sub),
      };
    })
    .sort(
      (a, b) =>
        Number(a.done) - Number(b.done) || compareNullsLast(a.name, b.name) || a.studentUserId - b.studentUserId,
    )
    .map(({ done: _done, ...row }) => row);
  return { canMark, rows };
}
