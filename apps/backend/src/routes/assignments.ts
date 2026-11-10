import { Router } from "express";

import { db } from "../db/client";
import { apiOk, apiError, forbidden } from "../lib/api-response";
import { submitAssignment } from "../lib/assignments/submit";
import { bodyErrorMessage, replaceAssignment } from "../lib/assignments/writes";
import { canAccessSeason, canManageAssignment, hasActiveEnrollment, staffScopeForSeason } from "../lib/permissions";
import { loadAssignmentDetail, loadAssignmentProgress } from "../lib/queries/assignments";
import { requireAuth, requireUser } from "../middleware/require-auth";
import { updateAssignmentRequestSchema } from "../../../../packages/shared/src/index";
import { idParam } from "../lib/http/params";
import { notFound } from "../lib/http/not-found";
import { liveAssignment } from "../lib/db/live";

export const assignmentsRouter = Router();

assignmentsRouter.use(requireAuth);

assignmentsRouter.get("/:id", async (req, res) => {
  const user = requireUser(req);
  const id = idParam(res, req.params.id, "assignment");
  if (id === null) return;

  const assignment = await db.assignment.findFirst({
    where: { id, ...liveAssignment },
    select: { seasonId: true },
  });
  if (!assignment) return notFound(res, "Assignment");

  // A student reads an assignment of any season they hold an enrolment in,
  // whatever its status: a finished, dropped or alumni student keeps their own
  // past work, and the response says `readOnly` so the app doesn't offer to edit
  // it. Writes are gated separately (hasActiveEnrollment). The token's
  // activeSeasonId is not consulted: a place in the season is the enrolment.
  // An assignment is for the whole season, so there is no group to check.
  const isStudent = user.role === "STUDENT";
  let readOnly = false;
  if (isStudent) {
    const enrollment = await db.seasonEnrollment.findUnique({
      where: { studentUserId_seasonId: { studentUserId: user.userId, seasonId: assignment.seasonId } },
      select: { id: true },
    });
    if (!enrollment) return forbidden(res);
    readOnly = !(await hasActiveEnrollment(user, assignment.seasonId));
  } else if (!(await canAccessSeason(user, assignment.seasonId))) {
    return forbidden(res);
  }

  const detail = await loadAssignmentDetail(id, {
    studentUserId: isStudent ? user.userId : null,
    canManage: canManageAssignment(user, assignment.seasonId),
    readOnly,
  });
  return apiOk(res, detail);
});

/**
 * Every student's work on each part: the leader's progress view, which
 * replaces the old tracker. Staff only, and scoped: a leader sees their own
 * groups' students, exactly as the attendance roster does.
 */
assignmentsRouter.get("/:id/progress", async (req, res) => {
  const user = requireUser(req);
  const id = idParam(res, req.params.id, "assignment");
  if (id === null) return;

  const assignment = await db.assignment.findFirst({
    where: { id, ...liveAssignment },
    select: { seasonId: true },
  });
  if (!assignment) return notFound(res, "Assignment");

  const scope = await staffScopeForSeason(user, assignment.seasonId);
  if (scope === null) return forbidden(res);

  return apiOk(res, await loadAssignmentProgress(id, scope.kind === "groups" ? scope.groupIds : undefined));
});

/**
 * Full replace (spec 07 R67): the body is the whole assignment, its parts in
 * order. Wording, dates and the reminder change freely; a change to students'
 * work answers 409 `needs_confirmation` with `students` until the body is
 * re-sent with `confirm: true` (lib/assignments/writes.ts). Nobody is told
 * again: the whole season was told when it was created.
 */
assignmentsRouter.patch("/:id", async (req, res) => {
  const user = requireUser(req);
  const id = idParam(res, req.params.id, "assignment");
  if (id === null) return;

  // v1's canEditAssignment read the row without a deletedAt filter (R79).
  const existing = await db.assignment.findFirst({
    where: { id, ...liveAssignment },
    select: { seasonId: true },
  });
  if (!existing) return notFound(res, "Assignment");
  if (!canManageAssignment(user, existing.seasonId)) return forbidden(res);

  const parsed = updateAssignmentRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return apiError(res, "bad_request", bodyErrorMessage(parsed.error, "Invalid assignment body."), 400);
  }

  const { reopened } = await replaceAssignment(id, parsed.data, user.userId);
  const detail = await loadAssignmentDetail(id, { studentUserId: null, canManage: true, readOnly: false });
  return apiOk(res, { ...detail, reopened });
});

/**
 * The student hands the assignment in (lib/assignments/submit.ts): 409
 * `not_finished` with the reason while a part is left, 409 `already_submitted`
 * the second time. Only a student with a live place in the season (an ACTIVE
 * enrolment in an ACTIVE season); staff and a finished season get 403.
 */
assignmentsRouter.post("/:id/submit", async (req, res) => {
  const user = requireUser(req);
  const id = idParam(res, req.params.id, "assignment");
  if (id === null) return;

  const assignment = await db.assignment.findFirst({
    where: { id, ...liveAssignment },
    select: { seasonId: true },
  });
  if (!assignment) return notFound(res, "Assignment");
  if (!(await hasActiveEnrollment(user, assignment.seasonId))) return forbidden(res);

  const result = await submitAssignment(id, user.userId);
  return apiOk(res, {
    submittedAt: result.submittedAt.toISOString(),
    completedAt: result.completedAt?.toISOString() ?? null,
  });
});

assignmentsRouter.delete("/:id", async (req, res) => {
  const user = requireUser(req);
  const id = idParam(res, req.params.id, "assignment");
  if (id === null) return;

  const existing = await db.assignment.findFirst({
    where: { id, ...liveAssignment },
    select: { seasonId: true },
  });
  if (!existing) return notFound(res, "Assignment");
  if (!canManageAssignment(user, existing.seasonId)) return forbidden(res);

  // Designed, not ported (ruling C12, spec 07 §10 item 4): a deleted
  // assignment with submissions would strand student work out of every view.
  // The "no submissions" condition is in the UPDATE's own WHERE, so a draft
  // created after the lookup above still blocks the delete.
  const { count } = await db.assignment.updateMany({
    where: { id, ...liveAssignment, submissions: { none: {} } },
    data: { deletedAt: new Date(), updatedById: user.userId },
  });
  if (count === 0) {
    return apiError(
      res,
      "has_submissions",
      "Students have already started this assignment, so it can't be deleted.",
      409,
    );
  }
  return apiOk(res, { deleted: true });
});
