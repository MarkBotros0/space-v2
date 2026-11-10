import type { Request, Response } from "express";

import { db } from "../../db/client";
import { apiOk, forbidden } from "../../lib/api-response";
import { config } from "../../lib/config";
import { liveAssignment } from "../../lib/db/live";
import { canReviewSubmission, canViewSubmission, isHiddenDraft } from "../../lib/permissions";
import { isLate } from "../../lib/queries/assignments";
import { requireUser } from "../../middleware/require-auth";
import { essayWordCount, htmlToPlainText } from "../../../../../packages/shared/src/index";
import { notFound } from "../../lib/http/not-found";
import { orgDayKey, orgWallTime } from "../../lib/org-time";

/** One essay work (not a video's progress or a forum post), with its part and assignment. */
async function loadEssayForApi(publicId: string) {
  return db.assignmentPartWork.findFirst({
    where: { publicId, part: { kind: "ESSAY", assignment: liveAssignment } },
    select: {
      id: true,
      publicId: true,
      status: true,
      text: true,
      feedback: true,
      submittedAt: true,
      reviewedAt: true,
      studentUserId: true,
      submissionId: true,
      part: {
        select: {
          id: true,
          assignmentId: true,
          prompt: true,
          minWords: true,
          maxWords: true,
          maxFileSizeMb: true,
          allowedMimeCategories: true,
          assignment: {
            select: {
              title: true,
              dueAt: true,
              description: true,
              seasonId: true,
              season: { select: { code: true } },
            },
          },
        },
      },
      studentUser: { select: { name: true, email: true } },
      // storagePath is deliberately absent. v1's client needed it to build a
      // URL into /api/uploads/[...path] — the endpoint that served any stored
      // file to any logged-in user. v2 addresses a file by id scoped to its
      // essay, so the path is not just unnecessary on the wire, it is the one
      // field that made the old hole exploitable by anyone who saw a response.
      files: {
        select: { id: true, originalName: true, mimeType: true, sizeBytes: true },
        orderBy: { uploadedAt: "asc" },
      },
    },
  });
}

/**
 * GET /submissions/:publicId: one essay, for its author (their draft too), the
 * staff who may read the student's work, and the review screen.
 */
export async function getSubmission(req: Request<{ publicId: string }>, res: Response) {
  const user = requireUser(req);
  // publicId is an opaque 10-character string, not an integer — no parseId here.
  const work = await loadEssayForApi(req.params.publicId ?? "");
  // A draft is its author's alone: anyone else is told it does not exist.
  if (!work || isHiddenDraft(user, work)) return notFound(res, "Submission");
  const { part } = work;
  const { assignment } = part;

  // The three reads below depend only on the row just loaded, not on each
  // other, so they run together. The student's group in this assignment's
  // season comes from the enrolment (ruling C9).
  const [canView, enrollment, canReview] = await Promise.all([
    canViewSubmission(user, work.submissionId),
    db.seasonEnrollment.findUnique({
      where: { studentUserId_seasonId: { studentUserId: work.studentUserId, seasonId: assignment.seasonId } },
      select: { groupId: true, group: { select: { name: true } } },
    }),
    canReviewSubmission(user, work.submissionId),
  ]);
  if (!canView) return forbidden(res);

  // Ruling C11 / REG-90: stored values may be HTML (or anything a client once
  // wrote); the wire carries plain text only.
  const text = work.text === null ? null : htmlToPlainText(work.text);
  return apiOk(res, {
    id: work.id,
    publicId: work.publicId,
    status: work.status,
    text,
    wordCount: essayWordCount(work.text),
    partId: part.id,
    prompt: part.prompt ?? "",
    minWords: part.minWords,
    maxWords: part.maxWords,
    maxFileSizeMb: part.maxFileSizeMb,
    allowedMimeCategories: part.allowedMimeCategories,
    feedback: work.feedback === null ? null : htmlToPlainText(work.feedback),
    submittedAt: work.submittedAt,
    reviewedAt: work.reviewedAt,
    isLate: isLate(work.submittedAt, assignment.dueAt),
    assignmentId: part.assignmentId,
    assignmentTitle: assignment.title,
    assignmentDueAt: assignment.dueAt,
    // The org day and wall time of the due date, so the chip never formats it in the device zone.
    dueOrgDay: assignment.dueAt ? orgDayKey(assignment.dueAt) : null,
    dueOrgTime: assignment.dueAt ? orgWallTime(assignment.dueAt) : null,
    assignmentDescription: assignment.description,
    seasonCode: assignment.season.code,
    studentUserId: work.studentUserId,
    studentName: work.studentUser.name,
    studentEmail: work.studentUser.email,
    groupId: enrollment?.groupId ?? null,
    groupName: enrollment?.group?.name ?? null,
    files: work.files,
    // An essay with no file limit takes no files; with uploads switched off
    // the screen explains why it cannot offer one rather than meeting a 503.
    canUploadFiles: config.enableUploads && part.maxFileSizeMb !== null,
    canReview,
  });
}
