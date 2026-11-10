import { Router } from "express";

import { db } from "../db/client";
import { apiOk, apiError, forbidden } from "../lib/api-response";
import { bodyErrorMessage, replaceAssignment } from "../lib/assignments/writes";
import { canAccessSeason, canManageAssignment, hasActiveEnrollment, staffScopeForSeason } from "../lib/permissions";
import {
  assignmentDetailPayload,
  isLate,
  loadAssignmentById,
  loadAssignmentTracker,
  studentCanSeeAssignment,
} from "../lib/queries/assignments";
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
  let readOnly = false;
  if (user.role === "STUDENT") {
    const enrollment = await db.seasonEnrollment.findUnique({
      where: { studentUserId_seasonId: { studentUserId: user.userId, seasonId: assignment.seasonId } },
      select: { id: true },
    });
    if (!enrollment) return forbidden(res);
    readOnly = !(await hasActiveEnrollment(user, assignment.seasonId));
  } else if (!(await canAccessSeason(user, assignment.seasonId))) {
    return forbidden(res);
  }

  const detail = await loadAssignmentById(id);
  // Unreachable in practice — the existence check above already passed — but
  // loadAssignmentById is nullable, so narrow it rather than asserting.
  if (!detail) return notFound(res, "Assignment");

  // Season access is not enough for a targeted assignment: a student must also
  // be in one of the groups it targets, in this season. Resolved through
  // studentCanSeeAssignment so the rule has one definition shared with the list
  // query — and through SeasonEnrollment, not GroupStudent (ruling C9).
  const isStudent = user.role === "STUDENT";
  if (
    isStudent &&
    !(await studentCanSeeAssignment(user.userId, detail.seasonId, detail.isAllGroups, detail.groupIds))
  ) {
    return forbidden(res);
  }

  let mySubmission = null;
  if (isStudent) {
    const sub = await db.submission.findUnique({
      where: { assignmentId_studentUserId: { assignmentId: id, studentUserId: user.userId } },
      select: {
        publicId: true,
        status: true,
        submittedAt: true,
        reviewedAt: true,
        feedback: true,
      },
    });
    mySubmission = sub && { ...sub, isLate: isLate(sub.submittedAt, detail.dueAt) };
  }

  return apiOk(
    res,
    assignmentDetailPayload(detail, {
      isStudent,
      canManage: canManageAssignment(user, detail.seasonId),
      mySubmission,
      readOnly,
    }),
  );
});

/**
 * Who was given this assignment and what they have done about it.
 *
 * Staff only, and scoped: a leader sees their own groups' students, exactly as
 * the attendance roster does. Both carry names and email addresses, so both are
 * gated the same way rather than on season access.
 */
assignmentsRouter.get("/:id/tracker", async (req, res) => {
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

  const tracker = await loadAssignmentTracker(id, scope.kind === "groups" ? scope.groupIds : undefined);
  if (!tracker) return notFound(res, "Assignment");

  return apiOk(res, tracker);
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
  return apiOk(res, { id, reopened });
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
