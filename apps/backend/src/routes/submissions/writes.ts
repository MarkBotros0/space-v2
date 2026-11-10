import type { Request, Response } from "express";

import { apiError, apiOk, forbidden } from "../../lib/api-response";
import { handInEssay } from "../../lib/assignments/essay";
import { reviewEssay } from "../../lib/assignments/essay-review";
import { ForbiddenError } from "../../lib/auth/errors";
import { bestEffort } from "../../lib/best-effort";
import { notFound } from "../../lib/http/not-found";
import { notificationLink } from "../../lib/notification-target";
import { createNotificationsBulk } from "../../lib/notifications";
import { canReviewSubmission, hasActiveEnrollment, isHiddenDraft } from "../../lib/permissions";
import { findEssayWork } from "../../lib/queries/essays";
import { notifyEssayHandedIn } from "../../lib/submission-notifications";
import { requireUser } from "../../middleware/require-auth";
import { reviewEssayRequestSchema } from "../../../../../packages/shared/src/index";

/**
 * POST /submissions/:publicId/hand-in: the author hands a returned essay in
 * again. Who may (the author, 403 for anyone else, with an ACTIVE enrolment in
 * the season) is checked here; what may (only from RETURNED, inside the word
 * range) under the locks in `handInEssay`. The leaders are told once, after the
 * write committed, naming the essay.
 */
export async function handInSubmission(req: Request<{ publicId: string }>, res: Response) {
  const user = requireUser(req);
  const work = await findEssayWork(req.params.publicId ?? "");
  // A draft is its author's alone: anyone else is told it does not exist.
  if (!work || isHiddenDraft(user, work)) return notFound(res, "Submission");
  if (work.studentUserId !== user.userId) throw new ForbiddenError();
  if (!(await hasActiveEnrollment(user, work.part.assignment.seasonId))) return forbidden(res);

  const result = await handInEssay(work.publicId, user.userId);
  await notifyEssayHandedIn({
    publicId: work.publicId,
    studentUserId: work.studentUserId,
    seasonId: work.part.assignment.seasonId,
    assignmentTitle: work.part.assignment.title,
    prompt: work.part.prompt ?? "",
  });
  return apiOk(res, result);
}

/** The body's first refusal in words: the schema's own "Say what to change", or a generic one. */
function reviewBodyMessage(issue: { code: string; message: string } | undefined): string {
  return issue?.code === "custom" ? issue.message : "Invalid review body.";
}

/**
 * POST /submissions/:publicId/review: a verdict on one essay. Gated on
 * canReviewSubmission (over the essay's Submission), which is strictly
 * narrower than the read gate rather than derived from it. `return` needs a
 * note ("Say what to change"). `reviewEssay` holds what each verdict does.
 */
export async function reviewSubmission(req: Request<{ publicId: string }>, res: Response) {
  const user = requireUser(req);
  const work = await findEssayWork(req.params.publicId ?? "");
  // A draft is its author's alone, and the author never reviews, so nobody can
  // review a DRAFT: to everyone but its author it does not exist.
  if (!work || isHiddenDraft(user, work)) return notFound(res, "Submission");
  if (!(await canReviewSubmission(user, work.submissionId))) return forbidden(res);

  const parsed = reviewEssayRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", reviewBodyMessage(parsed.error.issues[0]), 400);
  const { action, feedback } = parsed.data;

  const result = await reviewEssay(work.publicId, user.userId, action, feedback);
  const title = work.part.assignment.title;
  // Best-effort: the student is told, but a notification failure must not
  // report the review itself as failed (spec D6, ruling from R75).
  await bestEffort("notify:SUBMISSION_REVIEWED", () =>
    createNotificationsBulk([work.studentUserId], {
      type: "SUBMISSION_REVIEWED",
      // REG-91: v1's exact wording for a verdict (submission-actions.ts:196).
      // v1 had no "returned" state, so that one keeps its own v2 title. Neither
      // carries the feedback text — the body is left empty on purpose.
      title: action === "return" ? `${title} was returned for revision` : `Feedback ready on "${title}"`,
      // v1's exact link (submission-actions.ts:197; ruling X1): the assignment.
      link: notificationLink.studentAssignment(result.assignmentId),
    }),
  );

  return apiOk(res, { reviewStatus: result.reviewStatus });
}
