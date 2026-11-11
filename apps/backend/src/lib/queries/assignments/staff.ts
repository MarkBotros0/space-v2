import { db } from "../../../db/client";
import type { AssignmentProgress } from "../../../../../../packages/shared/src/index";
import { ApiError } from "../../api-error";
import { orgDayKey } from "../../org-time";
import { seasonParticipant } from "../season-participants";
import { isOverdue } from "./rules";
import { liveAssignment, liveUser } from "../../db/live";
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
  seasonCode: string;
}

/**
 * The season's assignments for staff. An assignment is for the whole season,
 * so every row's expected count is the season's participants (one count), and
 * its submission count those of them who have tapped Submit.
 */
export async function listAssignmentsForSeason(seasonId: number): Promise<AssignmentListRow[]> {
  // One denominator with the progress roster: live users only.
  const participant = { ...liveUser, seasonEnrollments: { some: { seasonId, ...seasonParticipant } } };
  const [rows, expectedCount] = await Promise.all([
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
            submissions: { where: { submittedAt: { not: null }, studentUser: participant } },
          },
        },
        season: { select: { code: true } },
      },
    }),
    db.seasonEnrollment.count({ where: { seasonId, ...seasonParticipant, studentUser: liveUser } }),
  ]);

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
 * still appears. Students who haven't submitted come first, then by name.
 * A draft essay or forum post is the student's alone: it reads as not started.
 */
export async function loadAssignmentProgress(id: number, restrictGroupIds?: number[]): Promise<AssignmentProgress> {
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
      select: { studentUserId: true, submittedAt: true },
    }),
    loadWorkIndex(
      assignment.parts.map((p) => p.id),
      studentIds,
    ),
  ]);
  const submittedAt = new Map(submissions.map((s) => [s.studentUserId, s.submittedAt]));

  const rows = enrollments
    .map((e) => ({
      studentUserId: e.studentUserId,
      name: e.studentUser.name,
      avatarPath: e.studentUser.avatarPath,
      submittedAt: submittedAt.get(e.studentUserId)?.toISOString() ?? null,
      parts: partWorksFor(assignment.parts, e.studentUserId, index, { forStaff: true }),
    }))
    .sort(
      (a, b) =>
        Number(a.submittedAt !== null) - Number(b.submittedAt !== null) ||
        compareNullsLast(a.name, b.name) ||
        a.studentUserId - b.studentUserId,
    );
  return { rows };
}
