import { Router } from "express";

import { db } from "../db/client";
import { apiOk, apiError } from "../lib/api-response";
import { parseId } from "../lib/parse-id";
import { canAccessSeason, canManageAssignment, staffScopeForSeason } from "../lib/permissions";
import {
  isLate,
  isOverdue,
  loadAssignmentById,
  loadAssignmentTracker,
  studentCanSeeAssignment,
} from "../lib/queries/assignments";
import { requireAuth, requireUser } from "../middleware/require-auth";

export const assignmentsRouter = Router();

assignmentsRouter.use(requireAuth);

assignmentsRouter.get("/:id", async (req, res) => {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid assignment id.", 400);

  const assignment = await db.assignment.findFirst({
    where: { id, deletedAt: null },
    select: { seasonId: true },
  });
  if (!assignment) return apiError(res, "not_found", "Assignment not found.", 404);

  if (!(await canAccessSeason(user, assignment.seasonId))) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const detail = await loadAssignmentById(id);
  // Unreachable in practice — the existence check above already passed — but
  // loadAssignmentById is nullable, so narrow it rather than asserting.
  if (!detail) return apiError(res, "not_found", "Assignment not found.", 404);

  // Season access is not enough for a targeted assignment: a student must also
  // be in one of the groups it targets, in this season. Resolved through
  // studentCanSeeAssignment so the rule has one definition shared with the list
  // query — and through SeasonEnrollment, not GroupStudent (ruling C9).
  const isStudent = user.role === "STUDENT";
  if (
    isStudent &&
    !(await studentCanSeeAssignment(
      user.userId,
      detail.seasonId,
      detail.isAllGroups,
      detail.groupIds,
    ))
  ) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
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

  return apiOk(res, {
    ...detail,
    // Ruling C8 — narrow the payload, not just the access. v1 handed students
    // the authoring shape so its own page could re-check targeting client-side;
    // that check now happens above, server-side, so the ids need not travel.
    groupIds: isStudent ? null : detail.groupIds,
    isOverdue: isOverdue(detail.dueAt, new Date()),
    mySubmission,
    canManage: canManageAssignment(user, detail.seasonId),
  });
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
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid assignment id.", 400);

  const assignment = await db.assignment.findFirst({
    where: { id, deletedAt: null },
    select: { seasonId: true },
  });
  if (!assignment) return apiError(res, "not_found", "Assignment not found.", 404);

  const scope = await staffScopeForSeason(user, assignment.seasonId);
  if (scope === null) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const tracker = await loadAssignmentTracker(
    id,
    scope.kind === "groups" ? scope.groupIds : undefined,
  );
  if (!tracker) return apiError(res, "not_found", "Assignment not found.", 404);

  return apiOk(res, tracker);
});
