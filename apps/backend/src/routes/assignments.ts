import { Router } from "express";

import { db } from "../db/client";
import { apiOk, apiError } from "../lib/api-response";
import { parseId } from "../lib/parse-id";
import { assignmentColumns, bodyErrorMessage, validateAssignmentRefs } from "../lib/assignment-writes";
import { canAccessSeason, canManageAssignment } from "../lib/permissions";
import {
  assignmentDetailPayload,
  isLate,
  loadAssignmentById,
  loadAssignmentTracker,
  studentCanSeeAssignment,
} from "../lib/queries/assignments";
import { requireAuth, requireUser } from "../middleware/require-auth";
import { updateAssignmentRequestSchema } from "../../../../packages/shared/src/index";

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

  return apiOk(
    res,
    assignmentDetailPayload(detail, {
      isStudent,
      canManage: canManageAssignment(user, detail.seasonId),
      mySubmission,
    }),
  );
});

/**
 * Who was given this assignment and what they have done about it.
 *
 * Season admins and SUPER only, as v1 (`assignments-query.ts:127-129`,
 * `admin/season/[code]/assignments/[id]/page.tsx:27,30`; 07-assignments R59).
 * LEADER and MENTOR get 403. v1 parity 2026-10-09: was "leaders too, narrowed
 * to their own groups".
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

  // canManageAssignment is isAdminOfSeason (SUPER passes).
  if (!canManageAssignment(user, assignment.seasonId)) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const tracker = await loadAssignmentTracker(id);
  if (!tracker) return apiError(res, "not_found", "Assignment not found.", 404);

  return apiOk(res, tracker);
});

/**
 * Full replace (spec 07 R67): the body is the whole assignment. Targeting is
 * deleted and recreated inside the same transaction as the field update (R69,
 * R85). An edit notifies nobody and newly targeted students are added
 * silently, as v1 (`assignment-actions.ts:101-139,128-133`; R66, R74).
 * v1 parity 2026-10-09: was "notify newly targeted students".
 */
assignmentsRouter.patch("/:id", async (req, res) => {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid assignment id.", 400);

  // v1's canEditAssignment read the row without a deletedAt filter (R79).
  const existing = await db.assignment.findFirst({
    where: { id, deletedAt: null },
    select: { seasonId: true },
  });
  if (!existing) return apiError(res, "not_found", "Assignment not found.", 404);
  if (!canManageAssignment(user, existing.seasonId)) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const parsed = updateAssignmentRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return apiError(res, "bad_request", bodyErrorMessage(parsed.error, "Invalid assignment body."), 400);
  }
  const body = parsed.data;

  const refusal = await validateAssignmentRefs(existing.seasonId, body);
  if (refusal) return apiError(res, refusal.code, refusal.message, 400);

  const columns = assignmentColumns(body);
  await db.$transaction(async (tx) => {
    // seasonId and createdById are never written here (R68).
    await tx.assignment.update({ where: { id }, data: { ...columns, updatedById: user.userId } });
    await tx.assignmentTarget.deleteMany({ where: { assignmentId: id } });
    if (!body.isAllGroups) {
      await tx.assignmentTarget.createMany({
        data: body.groupIds.map((groupId) => ({ assignmentId: id, groupId })),
      });
    }
  });

  // v1 parity 2026-10-09 (R66, R74): an edit notifies nobody.

  const detail = await loadAssignmentById(id);
  if (!detail) return apiError(res, "not_found", "Assignment not found.", 404);
  return apiOk(res, assignmentDetailPayload(detail, { isStudent: false, canManage: true, mySubmission: null }));
});

assignmentsRouter.delete("/:id", async (req, res) => {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid assignment id.", 400);

  const existing = await db.assignment.findFirst({
    where: { id, deletedAt: null },
    select: { seasonId: true },
  });
  if (!existing) return apiError(res, "not_found", "Assignment not found.", 404);
  if (!canManageAssignment(user, existing.seasonId)) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  // Designed, not ported (ruling C12, spec 07 §10 item 4): a deleted
  // assignment with submissions would strand student work out of every view.
  // The "no submissions" condition is in the UPDATE's own WHERE, so a draft
  // created after the lookup above still blocks the delete.
  const { count } = await db.assignment.updateMany({
    where: { id, deletedAt: null, submissions: { none: {} } },
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
