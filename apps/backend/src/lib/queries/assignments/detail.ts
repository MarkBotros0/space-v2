import { db } from "../../../db/client";
import type { AssignmentDetail, Reminder } from "../../../../../../packages/shared/src/index";
import { ApiError } from "../../api-error";
import { describeReminder } from "../../assignments/reminder";
import { orgDayKey, orgWallTime } from "../../org-time";
import { liveAssignment } from "../../db/live";
import { isOverdue } from "./rules";
import { loadWorkIndex, partWorksFor, PART_SELECT, toAssignmentPart, type PartRow } from "./part-work";

/** Who is reading: the gate (route) has already decided they may. */
export interface AssignmentViewer {
  /** The student reading their own assignment; null for staff. */
  studentUserId: number | null;
  /** Whether this caller may edit or delete it. Drives the UI, never the gate. */
  canManage: boolean;
  /** A student whose place in the season has ended: they read, they cannot write. */
  readOnly: boolean;
}

/**
 * The detail response, built in one place for GET, POST and PATCH so the three
 * cannot drift. Everything derived is derived here, server-side (ruling C4):
 * `isOverdue`, and the organisation-clock day/time of the deadline that every
 * screen labels with and the edit form pre-fills from (C2/X13). A student also
 * gets their own work on each part (`my`); staff read progress elsewhere.
 * Throws 404 when the assignment does not exist or is soft-deleted.
 */
export async function loadAssignmentDetail(id: number, viewer: AssignmentViewer): Promise<AssignmentDetail> {
  const a = await db.assignment.findFirst({
    where: { id, ...liveAssignment },
    select: {
      id: true,
      seasonId: true,
      season: { select: { code: true, title: true } },
      title: true,
      description: true,
      dueAt: true,
      reminderEnabled: true,
      reminderDays: true,
      reminderAnchor: true,
      reminderTime: true,
      remindAt: true,
      remindedAt: true,
      createdAt: true,
      parts: { orderBy: { position: "asc" }, select: PART_SELECT },
    },
  });
  if (!a) throw new ApiError("not_found", "Assignment not found.", 404);
  const now = new Date();

  const reminder: Reminder = {
    enabled: a.reminderEnabled,
    days: a.reminderDays,
    anchor: a.reminderAnchor,
    time: a.reminderTime,
  };
  return {
    id: a.id,
    seasonId: a.seasonId,
    seasonCode: a.season.code,
    seasonTitle: a.season.title,
    title: a.title,
    description: a.description,
    dueAt: a.dueAt?.toISOString() ?? null,
    dueOrgDay: a.dueAt ? orgDayKey(a.dueAt) : null,
    dueOrgTime: a.dueAt ? orgWallTime(a.dueAt) : null,
    isOverdue: isOverdue(a.dueAt, now),
    reminder,
    reminderLine: await describeReminder(a, now),
    parts: a.parts.map(toAssignmentPart),
    my: viewer.studentUserId === null ? null : await myWork(a.id, a.parts, viewer.studentUserId),
    canManage: viewer.canManage,
    readOnly: viewer.readOnly,
  };
}

async function myWork(assignmentId: number, parts: PartRow[], studentUserId: number): Promise<AssignmentDetail["my"]> {
  const [submission, index] = await Promise.all([
    db.submission.findUnique({
      where: { assignmentId_studentUserId: { assignmentId, studentUserId } },
      select: { submittedAt: true },
    }),
    loadWorkIndex(
      parts.map((p) => p.id),
      [studentUserId],
    ),
  ]);
  return {
    submittedAt: submission?.submittedAt?.toISOString() ?? null,
    parts: partWorksFor(parts, studentUserId, index, { forStaff: false }),
  };
}
