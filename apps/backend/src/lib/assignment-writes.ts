import type { ZodError } from "zod";
import type { AssignmentWriteBody } from "@space/shared";

import { db } from "../db/client";

import { createNotificationsBulk } from "./notifications";
import { bestEffort } from "./best-effort";
import { formatInOrgTime, orgWallClockToInstant } from "./org-time";

/**
 * Rules every assignment write shares, in one place so create and edit cannot
 * drift. Ported from v1 `src/lib/assignment-actions.ts:44-182` with the
 * divergences listed in Plan 5's header, each named where it happens.
 */

export interface AssignmentRefRefusal {
  code: "invalid_group" | "invalid_session";
  message: string;
}

/**
 * v1 constrained `groupIds` and `sessionId` only by which options its form
 * rendered (spec 07 R4, R12, §4 item 4): a hand-made payload could target
 * another season's groups or link another season's session. Ruling C8 — gate
 * the row, not the route. `groupIds` arrive deduplicated (shared schema), so a
 * count comparison is exact.
 */
export async function validateAssignmentRefs(
  seasonId: number,
  refs: { sessionId: number | null; groupIds: number[] },
): Promise<AssignmentRefRefusal | null> {
  if (refs.sessionId !== null) {
    const session = await db.session.findFirst({
      where: { id: refs.sessionId, seasonId },
      select: { id: true },
    });
    if (!session) {
      return { code: "invalid_session", message: "That session isn't part of this assignment's season." };
    }
  }
  if (refs.groupIds.length > 0) {
    const inSeason = await db.group.count({ where: { id: { in: refs.groupIds }, seasonId } });
    if (inSeason !== refs.groupIds.length) {
      return { code: "invalid_group", message: "Every group must belong to this assignment's season." };
    }
  }
  return null;
}

/**
 * The Assignment columns a write sets — everything except seasonId and the
 * audit columns, which differ between create and update. The deadline is
 * composed here, on the organisation's clock (ruling C2).
 */
export function assignmentColumns(body: AssignmentWriteBody) {
  return {
    title: body.title,
    description: body.description,
    dueAt: body.dueDay === null ? null : orgWallClockToInstant(body.dueDay, body.dueTime),
    sessionId: body.sessionId,
    isAllGroups: body.isAllGroups,
    type: body.type,
    forumMinWords: body.forumMinWords,
    forumAllowComments: body.forumAllowComments,
    maxFileSizeMb: body.maxFileSizeMb,
    allowedMimeCategories: body.allowedMimeCategories,
  };
}

/**
 * Who an assignment is given to: ACTIVE enrolments in the season, narrowed to
 * the targeted groups. v1 read GroupStudent for the targeted branch
 * (`assignment-actions.ts:177`) — ruling C9 forbids that, because GroupStudent
 * is one row per student database-wide. This is the same population
 * `loadAssignmentTracker` lists, so "who was notified" and "who the tracker
 * expects" are one answer.
 */
export async function targetedStudentIds(
  seasonId: number,
  isAllGroups: boolean,
  groupIds: number[],
): Promise<number[]> {
  const rows = await db.seasonEnrollment.findMany({
    where: { seasonId, status: "ACTIVE", ...(isAllGroups ? {} : { groupId: { in: groupIds } }) },
    select: { studentUserId: true },
  });
  return Array.from(new Set(rows.map((r) => r.studentUserId)));
}

/**
 * The single ASSIGNMENT_CREATED producer (create, and students newly targeted
 * by an edit). Runs after the write has committed (R65). Title and link are
 * v1's exact strings (`assignment-actions.ts:87,91`; ruling X1); the body's
 * time is the organisation's wall clock (C2), not the host's toLocaleString.
 */
export async function notifyAssignmentCreated(
  assignment: { id: number; title: string; dueAt: Date | null },
  studentIds: number[],
): Promise<void> {
  if (studentIds.length === 0) return;
  // Best-effort: the assignment exists; a notification failure must not
  // report the write as failed (spec D6, R86) — and bestEffort logs (R21).
  await bestEffort("notify:ASSIGNMENT_CREATED", () =>
    createNotificationsBulk(studentIds, {
      type: "ASSIGNMENT_CREATED",
      title: `New assignment: ${assignment.title}`,
      body: assignment.dueAt ? `Due ${formatInOrgTime(assignment.dueAt)}` : undefined,
      link: `/student/assignments/${assignment.id}`,
    }),
  );
}

/** The first schema issue as a sentence the client can show, prefixed with its field. */
export function bodyErrorMessage(err: ZodError, fallback: string): string {
  const issue = err.issues[0];
  if (!issue) return fallback;
  return issue.path.length > 0 ? `${issue.path.join(".")}: ${issue.message}` : issue.message;
}
