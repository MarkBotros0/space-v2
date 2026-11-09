import type { Request, Response } from "express";

import { db } from "../../db/client";
import { apiOk, apiError, forbidden } from "../../lib/api-response";
import { ForbiddenError } from "../../lib/auth/errors";
import { bestEffort } from "../../lib/best-effort";
import { createNotificationsBulk } from "../../lib/notifications";
import { parseId } from "../../lib/parse-id";
import { canReviewSubmission, hasActiveEnrollment, isHiddenDraft } from "../../lib/permissions";
import { newPublicId } from "../../lib/public-id";
import { studentCanSeeAssignment } from "../../lib/queries/assignments";
import { notifySubmissionReceived } from "../../lib/submission-notifications";
import { requireUser } from "../../middleware/require-auth";
import {
  htmlToPlainText,
  reviewSubmissionRequestSchema,
  updateSubmissionRequestSchema,
} from "../../../../../packages/shared/src/index";
import { EDITABLE_STATUSES, studentWriteRefusal } from "../../lib/permissions";
import { submissionLocked } from "./editable";
import { notificationLink } from "../../lib/notification-target";

export async function updateSubmission(req: Request<{ publicId: string }>, res: Response) {
  const user = requireUser(req);
  const { publicId } = req.params;

  const sub = await db.submission.findUnique({
    where: { publicId: publicId ?? "" },
    select: {
      id: true,
      publicId: true,
      status: true,
      studentUserId: true,
      assignment: { select: { seasonId: true, type: true, title: true } },
    },
  });
  // A draft is its author's alone: anyone else is told it does not exist.
  if (!sub || isHiddenDraft(user, sub)) {
    return apiError(res, "not_found", "Submission not found.", 404);
  }
  // Only the author may edit. Season admins and leaders can read a submission
  // (canViewSubmission) but must never rewrite a student's words.
  if (sub.studentUserId !== user.userId) throw new ForbiddenError();
  // A forum post has exactly one writer (plan 14 D-14.1). A save would replace
  // a posted body with unescaped text while the row stays SUBMITTED.
  if (sub.assignment.type === "FORUM") {
    return apiError(res, "use_forum_endpoint", "Post forum responses through the forum endpoint.", 409);
  }
  // Only DRAFT and RETURNED are editable, and only by a student still actively
  // enrolled in the assignment's season (see ./editable.ts). Order: who may
  // write (403), then a well-formed body (400), then the row's state (409).
  const refusal = await studentWriteRefusal(user, sub.assignment.seasonId, sub.status);
  if (refusal === "forbidden") return forbidden(res);

  const parsed = updateSubmissionRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid submission body.", 400);
  if (refusal === "not_editable") return submissionLocked(res);

  if (parsed.data.submit) {
    // REG-85: v1's form disabled Submit for blank text with no attached file.
    // That rule now lives on the server, where a client cannot skip it. A DRAFT
    // save of blank text stays legal.
    if (htmlToPlainText(parsed.data.text) === "") {
      const attached = await db.submissionFile.count({ where: { submissionId: sub.id } });
      if (attached === 0) {
        return apiError(res, "empty_submission", "Write a response or attach a file before submitting.", 400);
      }
    }
    // The transition is conditional on the row still being editable, so two
    // racing submits produce one SUBMITTED write and one 409 — and the
    // leaders are told once, by the request that actually moved it.
    const submitted = await db.submission.updateMany({
      where: { id: sub.id, status: { in: [...EDITABLE_STATUSES] } },
      data: { text: parsed.data.text, status: "SUBMITTED", submittedAt: new Date() },
    });
    if (submitted.count === 0) return submissionLocked(res);
    await notifySubmissionReceived({
      publicId: sub.publicId,
      studentUserId: sub.studentUserId,
      seasonId: sub.assignment.seasonId,
      assignmentTitle: sub.assignment.title,
    });
  } else {
    // Save the text; do NOT touch the status.
    //
    // v1 set status: "DRAFT" unconditionally here, so autosaving after a review
    // demoted a REVIEWED submission back to DRAFT — it vanished from the
    // reviewer's queue while `feedback` and `reviewedAt` survived, leaving the
    // student reading a verdict on text they had since replaced. A save is not
    // a state transition. Getting back to editable is what
    // POST /:publicId/review with returnForRevision is for.
    await db.submission.update({
      where: { id: sub.id },
      data: { text: parsed.data.text },
    });
  }

  return apiOk(res, { saved: true, submitted: Boolean(parsed.data.submit) });
}

/**
 * Create-or-fetch this caller's submission for an assignment.
 *
 * v1 created the row as a side effect of *rendering* the assignment page
 * (`student/assignments/[id]/page.tsx:40`). Ruling C6 forbids that, and React
 * Query would make it far worse than it was in v1: it refetches on mount, on
 * window focus and on reconnect, so a read-time write becomes a write every
 * time the app is tabbed back to.
 *
 * A real upsert on the natural unique key, not v1's read-then-create-then-catch
 * — that pattern leaned entirely on the unique constraint to paper over its own
 * race, and there is no reason to reproduce it when the constraint can do the
 * work directly. PUT because it is idempotent: calling it twice yields the same
 * row, which is what makes it safe on a screen that mounts repeatedly.
 */
export async function startSubmission(req: Request, res: Response) {
  const user = requireUser(req);
  const assignmentId = parseId(req.params.assignmentId);
  if (assignmentId === null) return apiError(res, "bad_request", "Invalid assignment id.", 400);

  // Only a student has a submission of their own; staff have nothing to create.
  if (user.role !== "STUDENT") {
    return apiError(res, "forbidden", "Only a student can start a submission.", 403);
  }

  const assignment = await db.assignment.findFirst({
    where: { id: assignmentId, deletedAt: null },
    select: {
      seasonId: true,
      isAllGroups: true,
      type: true,
      targets: { select: { groupId: true } },
    },
  });
  if (!assignment) return apiError(res, "not_found", "Assignment not found.", 404);
  // A forum post has exactly one writer: PUT /assignments/:id/forum/response,
  // which applies forumMinWords, refuses an empty post (it would unlock every
  // peer's work) and stores escaped HTML. Creating the row here would let a
  // client skip all three with a follow-up PATCH {submit:true} (plan 14 D-14.1).
  if (assignment.type === "FORUM") {
    return apiError(res, "use_forum_endpoint", "Post forum responses through the forum endpoint.", 409);
  }

  // An ACTIVE enrolment, not canAccessSeason: that accepts any enrolment row,
  // so a dropped, completed or alumni student could start work in a past season.
  if (!(await hasActiveEnrollment(user, assignment.seasonId))) return forbidden(res);
  // The same targeting rule the assignment reads use, from the same helper —
  // a student must not be able to start a submission on work never set them.
  const targeted = await studentCanSeeAssignment(
    user.userId,
    assignment.seasonId,
    assignment.isAllGroups,
    assignment.targets.map((t) => t.groupId),
  );
  if (!targeted) return forbidden(res);

  const submission = await db.submission.upsert({
    where: { assignmentId_studentUserId: { assignmentId, studentUserId: user.userId } },
    // Empty update: the point is to return the existing row untouched. Writing
    // anything here — even a status — would let a remount overwrite work.
    update: {},
    create: { assignmentId, studentUserId: user.userId, publicId: newPublicId(), status: "DRAFT" },
    select: { publicId: true, status: true },
  });

  return apiOk(res, { publicId: submission.publicId, status: submission.status });
}

/**
 * Record a verdict.
 *
 * v1's reviewSubmissionAction has no ported counterpart, so Phase 2's whole
 * leader surface has been unbuildable. Gated on canReviewSubmission, which is
 * strictly narrower than the read gate rather than derived from it.
 */
export async function reviewSubmission(req: Request<{ publicId: string }>, res: Response) {
  const user = requireUser(req);
  const { publicId } = req.params;

  const sub = await db.submission.findUnique({
    where: { publicId: publicId ?? "" },
    select: {
      id: true,
      status: true,
      studentUserId: true,
      assignmentId: true,
      assignment: { select: { title: true } },
    },
  });
  // A draft is its author's alone, and the author never reviews, so nobody can
  // review a DRAFT: to everyone but its author it does not exist.
  if (!sub || isHiddenDraft(user, sub)) {
    return apiError(res, "not_found", "Submission not found.", 404);
  }

  if (!(await canReviewSubmission(user, sub.id))) return forbidden(res);

  const parsed = reviewSubmissionRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid review body.", 400);

  const now = new Date();
  await db.submission.update({
    where: { id: sub.id },
    data: {
      feedback: parsed.data.feedback,
      status: parsed.data.returnForRevision ? "RETURNED" : "REVIEWED",
      reviewedAt: now,
      reviewedById: user.userId,
    },
  });

  // Best-effort: the student is told, but a mail or notification failure must
  // not report the review itself as failed (spec D6, ruling from R75).
  await bestEffort("notify:SUBMISSION_REVIEWED", () =>
    createNotificationsBulk([sub.studentUserId], {
      type: "SUBMISSION_REVIEWED",
      // REG-91: v1's exact wording for a verdict (submission-actions.ts:196).
      // v1 had no "returned" state, so that one keeps its own v2 title. Neither
      // carries the feedback text — the body is left empty on purpose.
      title: parsed.data.returnForRevision
        ? `${sub.assignment.title} was returned for revision`
        : `Feedback ready on "${sub.assignment.title}"`,
      // v1's exact link (submission-actions.ts:197; ruling X1): the assignment,
      // not the list.
      link: notificationLink.studentAssignment(sub.assignmentId),
    }),
  );

  return apiOk(res, { reviewed: true, returnedForRevision: Boolean(parsed.data.returnForRevision) });
}
