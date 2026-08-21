import { Router } from "express";

import { db } from "../db/client";
import { apiOk, apiError } from "../lib/api-response";
import { parseId } from "../lib/parse-id";
import { canAccessSeason } from "../lib/permissions";
import { loadAssignmentById } from "../lib/queries/assignments";
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
  // be in one of the groups it targets.
  if (user.role === "STUDENT" && !detail.isAllGroups) {
    const membership = await db.groupStudent.findUnique({
      where: { studentUserId: user.userId },
      select: { groupId: true },
    });
    if (!membership || !detail.groupIds.includes(membership.groupId)) {
      return apiError(res, "forbidden", "You don't have access to this.", 403);
    }
  }

  let mySubmission = null;
  if (user.role === "STUDENT") {
    mySubmission = await db.submission.findUnique({
      where: { assignmentId_studentUserId: { assignmentId: id, studentUserId: user.userId } },
      select: {
        publicId: true,
        status: true,
        submittedAt: true,
        reviewedAt: true,
        feedback: true,
      },
    });
  }

  return apiOk(res, { ...detail, mySubmission });
});
