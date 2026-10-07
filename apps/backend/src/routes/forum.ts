import { Router } from "express";

import { db } from "../db/client";
import { apiError, apiOk } from "../lib/api-response";
import { newPublicId } from "../lib/public-id";
import { parseId } from "../lib/parse-id";
import { forumAudienceFor } from "../lib/permissions";
import { loadForumAssignment, loadForumView } from "../lib/queries/forum";
import { requireAuth, requireUser } from "../middleware/require-auth";
import {
  countWords,
  forumFeedQuerySchema,
  htmlToPlainText,
  plainTextToHtml,
  submitForumResponseRequestSchema,
} from "../../../../packages/shared/src/index";

/**
 * Domain 14. Mounted at /api/v1 because the thread hangs off an assignment
 * (`/assignments/:id/forum*`) while a comment is addressed on its own
 * (`/forum/comments/:commentId`). Per-route `requireAuth` only (ruling X5) —
 * see video-quiz.ts for why.
 *
 * Status-code rule: the assignment is resolved first (missing, deleted or not
 * FORUM → 404 for every caller); only then does the audience gate run (403).
 */
export const forumRouter = Router();

forumRouter.get("/assignments/:id/forum", requireAuth, async (req, res) => {
  const user = requireUser(req);
  const assignmentId = parseId(req.params.id);
  if (assignmentId === null) return apiError(res, "bad_request", "Invalid assignment id.", 400);

  const parsedQuery = forumFeedQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) return apiError(res, "bad_request", "Invalid query.", 400);

  if ((await loadForumAssignment(assignmentId)) === null) {
    return apiError(res, "not_found", "Assignment not found.", 404);
  }

  const audience = await forumAudienceFor(user, assignmentId);
  if (audience === null) return apiError(res, "forbidden", "You don't have access to this.", 403);

  const view = await loadForumView(assignmentId, user, audience, parsedQuery.data);
  if (view === null) return apiError(res, "not_found", "Assignment not found.", 404);
  return apiOk(res, view);
});

/**
 * The creator of the submission row (ruling C6, D-14.1): posting IS submitting.
 * A GET must never do this, and the generic submission writers refuse FORUM.
 */
forumRouter.put("/assignments/:id/forum/response", requireAuth, async (req, res) => {
  const user = requireUser(req);
  const assignmentId = parseId(req.params.id);
  if (assignmentId === null) return apiError(res, "bad_request", "Invalid assignment id.", 400);

  if (user.role !== "STUDENT") {
    return apiError(res, "forbidden", "Only a student can post a response.", 403);
  }

  const assignment = await loadForumAssignment(assignmentId);
  if (assignment === null) return apiError(res, "not_found", "Assignment not found.", 404);

  const audience = await forumAudienceFor(user, assignmentId);
  if (audience === null || audience.kind !== "student") {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const parsed = submitForumResponseRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid response.", 400);

  const words = countWords(parsed.data.text);
  const min = assignment.forumMinWords ?? 0;
  if (words < min) {
    return apiError(
      res,
      "too_few_words",
      `Please write at least ${min} words (you have ${words}).`,
      400,
    );
  }
  // No due-date branch, deliberately (spec 14 D5 / D-14.7): a discussion that
  // closes at a deadline stops being a discussion.

  const now = new Date();
  const html = plainTextToHtml(parsed.data.text);
  const submission = await db.submission.upsert({
    where: { assignmentId_studentUserId: { assignmentId, studentUserId: user.userId } },
    update: { text: html, status: "SUBMITTED", submittedAt: now },
    create: {
      assignmentId,
      studentUserId: user.userId,
      publicId: newPublicId(),
      text: html,
      status: "SUBMITTED",
      submittedAt: now,
    },
    select: { publicId: true, status: true, feedback: true, reviewedAt: true },
  });

  return apiOk(res, {
    submissionPublicId: submission.publicId,
    text: parsed.data.text,
    status: submission.status,
    wordCount: words,
    posted: true,
    feedback: submission.feedback ? htmlToPlainText(submission.feedback) : null,
    reviewedAt: submission.reviewedAt,
  });
});
