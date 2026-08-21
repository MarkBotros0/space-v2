import { Router } from "express";

import { db } from "../db/client";
import { apiOk, apiError } from "../lib/api-response";
import { ForbiddenError } from "../lib/auth/errors";
import { canViewSubmission } from "../lib/permissions";
import { requireAuth, requireUser } from "../middleware/require-auth";
import { updateSubmissionRequestSchema } from "../../../../packages/shared/src/index";

export const submissionsRouter = Router();

submissionsRouter.use(requireAuth);

async function loadSubmissionForApi(publicId: string) {
  return db.submission.findUnique({
    where: { publicId },
    select: {
      id: true,
      publicId: true,
      status: true,
      text: true,
      feedback: true,
      submittedAt: true,
      reviewedAt: true,
      assignmentId: true,
      studentUserId: true,
      assignment: {
        select: {
          title: true,
          dueAt: true,
          description: true,
          seasonId: true,
          season: { select: { code: true } },
        },
      },
      studentUser: { select: { name: true, email: true } },
      files: {
        select: { id: true, originalName: true, storagePath: true, mimeType: true, sizeBytes: true },
        orderBy: { uploadedAt: "asc" },
      },
    },
  });
}

submissionsRouter.get("/:publicId", async (req, res) => {
  const user = requireUser(req);
  // publicId is an opaque 10-character string, not an integer — no parseId here.
  const { publicId } = req.params;

  const sub = await loadSubmissionForApi(publicId ?? "");
  if (!sub) return apiError(res, "not_found", "Submission not found.", 404);

  if (!(await canViewSubmission(user, sub.id))) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  return apiOk(res, {
    id: sub.id,
    publicId: sub.publicId,
    status: sub.status,
    text: sub.text,
    feedback: sub.feedback,
    submittedAt: sub.submittedAt,
    reviewedAt: sub.reviewedAt,
    assignmentId: sub.assignmentId,
    assignmentTitle: sub.assignment.title,
    assignmentDueAt: sub.assignment.dueAt,
    assignmentDescription: sub.assignment.description,
    seasonCode: sub.assignment.season.code,
    studentUserId: sub.studentUserId,
    studentName: sub.studentUser.name,
    studentEmail: sub.studentUser.email,
    files: sub.files,
  });
});

submissionsRouter.patch("/:publicId", async (req, res) => {
  const user = requireUser(req);
  const { publicId } = req.params;

  const sub = await db.submission.findUnique({
    where: { publicId: publicId ?? "" },
    select: { id: true, studentUserId: true, assignment: { select: { dueAt: true } } },
  });
  if (!sub) return apiError(res, "not_found", "Submission not found.", 404);
  // Only the author may edit. Season admins and leaders can read a submission
  // (canViewSubmission) but must never rewrite a student's words.
  if (sub.studentUserId !== user.userId) throw new ForbiddenError();

  const parsed = updateSubmissionRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid submission body.", 400);

  if (parsed.data.submit) {
    const now = new Date();
    await db.submission.update({
      where: { id: sub.id },
      data: { text: parsed.data.text, status: "SUBMITTED", submittedAt: now },
    });
  } else {
    await db.submission.update({
      where: { id: sub.id },
      data: { text: parsed.data.text, status: "DRAFT" },
    });
  }

  return apiOk(res, { saved: true, submitted: Boolean(parsed.data.submit) });
});
