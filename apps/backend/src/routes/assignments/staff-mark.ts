import type { Request, Response } from "express";

import { db } from "../../db/client";
import type { AssignmentStaffMark } from "../../../../../packages/shared/src/index";
import { apiNoContent, apiOk, forbidden } from "../../lib/api-response";
import { markSubmitted, undoMarkSubmitted, type StaffMarkTarget } from "../../lib/assignments/staff-mark";
import { liveAssignment, liveSeason } from "../../lib/db/live";
import { idParam } from "../../lib/http/params";
import { notFound } from "../../lib/http/not-found";
import { canMarkSubmitted } from "../../lib/permissions";
import { requireUser } from "../../middleware/require-auth";

/**
 * The checks both verbs share, answering and returning null on a refusal: the assignment is live
 * in a live season (404), and the caller is its season's admin, a super or the student's own
 * leader there (403). The season's status and the student's place in it are checked under the
 * locks, in lib/assignments/staff-mark.ts (409 season_draft / season_finished, 404).
 */
async function resolveTarget(req: Request, res: Response): Promise<{ target: StaffMarkTarget; byId: number } | null> {
  const user = requireUser(req);
  const id = idParam(res, req.params.id, "assignment");
  if (id === null) return null;
  const studentUserId = idParam(res, req.params.studentUserId, "student");
  if (studentUserId === null) return null;

  const assignment = await db.assignment.findFirst({
    where: { id, ...liveAssignment, season: liveSeason },
    select: { seasonId: true },
  });
  if (!assignment) {
    notFound(res, "Assignment");
    return null;
  }
  if (!(await canMarkSubmitted(user, assignment.seasonId, studentUserId))) {
    forbidden(res);
    return null;
  }
  return { target: { assignmentId: id, seasonId: assignment.seasonId, studentUserId }, byId: user.userId };
}

/**
 * PUT /assignments/:id/submitted-marks/:studentUserId: staff mark the assignment submitted for a
 * student who did it outside the app. A second mark keeps the first. Silent: no notification.
 */
export async function putStaffMark(req: Request, res: Response) {
  const resolved = await resolveTarget(req, res);
  if (resolved === null) return;
  const { markedAt, markedBy } = await markSubmitted(resolved.target, resolved.byId);
  const body: AssignmentStaffMark = {
    studentUserId: resolved.target.studentUserId,
    markedAt: markedAt.toISOString(),
    markedBy,
  };
  return apiOk(res, body);
}

/** DELETE /assignments/:id/submitted-marks/:studentUserId: takes the mark away, whoever made it; 204. */
export async function deleteStaffMark(req: Request, res: Response) {
  const resolved = await resolveTarget(req, res);
  if (resolved === null) return;
  await undoMarkSubmitted(resolved.target);
  return apiNoContent(res);
}
