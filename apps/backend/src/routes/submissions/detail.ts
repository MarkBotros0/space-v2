import type { Request, Response } from "express";

import { db } from "../../db/client";
import { apiOk, apiError } from "../../lib/api-response";
import { config } from "../../lib/config";
import { canReviewSubmission, canViewSubmission } from "../../lib/permissions";
import { isLate } from "../../lib/queries/assignments";
import { requireUser } from "../../middleware/require-auth";
import { htmlToPlainText } from "../../../../../packages/shared/src/index";
import { forbidden } from "../respond";

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
      // storagePath is deliberately absent. v1's client needed it to build a
      // URL into /api/uploads/[...path] — the endpoint that served any stored
      // file to any logged-in user. v2 addresses a file by id scoped to its
      // submission, so the path is not just unnecessary on the wire, it is the
      // one field that made the old hole exploitable by anyone who saw a
      // response.
      files: {
        select: {
          id: true,
          originalName: true,
          mimeType: true,
          sizeBytes: true,
        },
        orderBy: { uploadedAt: "asc" },
      },
    },
  });
}


export async function getSubmission(req: Request<{ publicId: string }>, res: Response) {
  const user = requireUser(req);
  // publicId is an opaque 10-character string, not an integer — no parseId here.
  const { publicId } = req.params;

  const sub = await loadSubmissionForApi(publicId ?? "");
  if (!sub) return apiError(res, "not_found", "Submission not found.", 404);

  // The three reads below depend only on the row just loaded, not on each
  // other, so they run together: each is a round trip to the database, and
  // one after another they were the wait before the review screen could draw.
  // The student's group in this assignment's season comes from the enrolment
  // (ruling C9) — v1's detail named it. A caller who then fails the access
  // check has paid for two reads it never uses, the cheap side of the trade.
  const [canView, enrollment, canReview] = await Promise.all([
    canViewSubmission(user, sub.id),
    db.seasonEnrollment.findUnique({
      where: {
        studentUserId_seasonId: {
          studentUserId: sub.studentUserId,
          seasonId: sub.assignment.seasonId,
        },
      },
      select: { groupId: true, group: { select: { name: true } } },
    }),
    canReviewSubmission(user, sub.id),
  ]);
  if (!canView) return forbidden(res);

  return apiOk(res, {
    id: sub.id,
    publicId: sub.publicId,
    status: sub.status,
    // Ruling C11 / REG-90: stored values may be v1 TipTap HTML (or anything a
    // client once wrote); the wire carries plain text only.
    text: sub.text === null ? null : htmlToPlainText(sub.text),
    feedback: sub.feedback === null ? null : htmlToPlainText(sub.feedback),
    submittedAt: sub.submittedAt,
    reviewedAt: sub.reviewedAt,
    isLate: isLate(sub.submittedAt, sub.assignment.dueAt),
    assignmentId: sub.assignmentId,
    assignmentTitle: sub.assignment.title,
    assignmentDueAt: sub.assignment.dueAt,
    assignmentDescription: sub.assignment.description,
    seasonCode: sub.assignment.season.code,
    studentUserId: sub.studentUserId,
    studentName: sub.studentUser.name,
    studentEmail: sub.studentUser.email,
    groupId: enrollment?.groupId ?? null,
    groupName: enrollment?.group?.name ?? null,
    files: sub.files,
    // Told to the client rather than left for it to discover by receiving a
    // 503: an assignment declaring maxFileSizeMb is telling the student a file
    // is expected, so the screen needs to explain why it cannot offer one.
    canUploadFiles: config.enableUploads,
    canReview,
  });
}
