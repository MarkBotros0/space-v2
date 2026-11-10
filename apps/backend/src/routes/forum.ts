import { Router } from "express";

import { db } from "../db/client";
import { apiError, apiOk, forbidden } from "../lib/api-response";
import { newPublicId } from "../lib/public-id";
import { canCommentOnForumSubmission, canDeleteForumComment, forumAudienceFor } from "../lib/permissions";
import {
  FORUM_COMMENT_SELECT,
  listForumComments,
  loadForumAssignment,
  loadForumView,
  postInAudience,
  toForumComment,
} from "../lib/queries/forum";
import { requireAuth, requireUser } from "../middleware/require-auth";
import {
  addForumCommentRequestSchema,
  countWords,
  forumCommentsQuerySchema,
  forumFeedQuerySchema,
  htmlToPlainText,
  plainTextToHtml,
  submitForumResponseRequestSchema,
} from "../../../../packages/shared/src/index";
import { idParam } from "../lib/http/params";
import { notFound } from "../lib/http/not-found";
import { parseOr400 } from "../lib/http/validate";

/**
 * Domain 14. Mounted at /api/v1 because the thread hangs off an assignment
 * (`/assignments/:id/forum*`) while a comment is addressed on its own
 * (`/forum/comments/:commentId`). Per-route `requireAuth` only (ruling X5) —
 * see video-quiz/index.ts for why.
 *
 * Status-code rule: the assignment is resolved first (missing, deleted or not
 * FORUM → 404 for every caller); only then does the audience gate run (403).
 */
export const forumRouter = Router();

forumRouter.get("/assignments/:id/forum", requireAuth, async (req, res) => {
  const user = requireUser(req);
  const assignmentId = idParam(res, req.params.id, "assignment");
  if (assignmentId === null) return;

  const parsedQuery = forumFeedQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) return apiError(res, "bad_request", "Invalid query.", 400);

  if ((await loadForumAssignment(assignmentId)) === null) {
    return notFound(res, "Assignment");
  }

  const audience = await forumAudienceFor(user, assignmentId);
  if (audience === null) return forbidden(res);

  const view = await loadForumView(assignmentId, user, audience, parsedQuery.data);
  if (view === null) return notFound(res, "Assignment");
  return apiOk(res, view);
});

/**
 * The creator of the submission row (ruling C6, D-14.1): posting IS submitting.
 * A GET must never do this, and the generic submission writers refuse FORUM.
 */
forumRouter.put("/assignments/:id/forum/response", requireAuth, async (req, res) => {
  const user = requireUser(req);
  const assignmentId = idParam(res, req.params.id, "assignment");
  if (assignmentId === null) return;

  if (user.role !== "STUDENT") {
    return apiError(res, "forbidden", "Only a student can post a response.", 403);
  }

  const assignment = await loadForumAssignment(assignmentId);
  if (assignment === null) return notFound(res, "Assignment");

  const audience = await forumAudienceFor(user, assignmentId);
  if (audience === null || audience.kind !== "student") return forbidden(res);

  const parsed = parseOr400(submitForumResponseRequestSchema, req.body, res, "Invalid response.");
  if (parsed === null) return;

  const words = countWords(parsed.text);
  const min = assignment.forumMinWords ?? 0;
  if (words < min) {
    return apiError(res, "too_few_words", `Please write at least ${min} words (you have ${words}).`, 400);
  }
  // No due-date branch, deliberately (spec 14 D5 / D-14.7): a discussion that
  // closes at a deadline stops being a discussion.

  const now = new Date();
  const html = plainTextToHtml(parsed.text);
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
    text: parsed.text,
    status: submission.status,
    wordCount: words,
    posted: true,
    feedback: submission.feedback ? htmlToPlainText(submission.feedback) : null,
    reviewedAt: submission.reviewedAt,
  });
});

/**
 * v1 addresses a forum write by a bare sequential `Submission.id`, so the gates
 * constrain *who* the caller is but never *which* row they name (spec 14 R5,
 * R43, D14). Nesting the post under its assignment and re-checking the pair
 * here means a mismatched id is a 404 rather than a silent success — and the
 * publicId is unguessable in the first place.
 */
async function resolvePost(assignmentId: number, publicId: string | string[] | undefined) {
  return db.submission.findFirst({
    where: { publicId: typeof publicId === "string" ? publicId : "", assignmentId },
    select: { id: true, status: true, studentUserId: true },
  });
}

forumRouter.get("/assignments/:id/forum/posts/:publicId/comments", requireAuth, async (req, res) => {
  const user = requireUser(req);
  const assignmentId = idParam(res, req.params.id, "assignment");
  if (assignmentId === null) return;

  const parsedQuery = forumCommentsQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) return apiError(res, "bad_request", "Invalid query.", 400);

  const assignment = await loadForumAssignment(assignmentId);
  if (assignment === null) return notFound(res, "Assignment");

  const audience = await forumAudienceFor(user, assignmentId);
  if (audience === null) return forbidden(res);

  const post = await resolvePost(assignmentId, req.params.publicId);
  // A DRAFT is not a post (spec 14 R23): indistinguishable from a missing one.
  if (post === null || post.status === "DRAFT") {
    return notFound(res, "Post");
  }
  if (!(await postInAudience(audience, assignment.seasonId, post.studentUserId))) {
    return forbidden(res);
  }

  // The same lock the feed applies: on a "post before reading others" forum
  // a student reads nothing until they post.
  if (audience.kind === "student" && assignment.forumPostToRead) {
    const own = await db.submission.findUnique({
      where: { assignmentId_studentUserId: { assignmentId, studentUserId: user.userId } },
      select: { status: true },
    });
    if (!own || own.status === "DRAFT") {
      return apiError(res, "post_first", "Post your own response before reading comments.", 403);
    }
  }

  return apiOk(res, await listForumComments(post, assignment.seasonId, user, parsedQuery.data));
});

forumRouter.post("/assignments/:id/forum/posts/:publicId/comments", requireAuth, async (req, res) => {
  const user = requireUser(req);
  const assignmentId = idParam(res, req.params.id, "assignment");
  if (assignmentId === null) return;

  const assignment = await loadForumAssignment(assignmentId);
  if (assignment === null) return notFound(res, "Assignment");

  // Before the gate, but note that canCommentOnForumSubmission also returns
  // false for a missing row, so a probe cannot tell "no such post" from "not
  // allowed" on the gate itself (spec 14 §6) — a deliberate property.
  const post = await resolvePost(assignmentId, req.params.publicId);
  if (post === null) return notFound(res, "Post");

  const parsed = parseOr400(addForumCommentRequestSchema, req.body, res, "Invalid comment.");
  if (parsed === null) return;

  if (!(await canCommentOnForumSubmission(user, post.id))) return forbidden(res);

  // Post-first, for students only (v1 R41), on a "post before reading others"
  // forum. Staff bypass it by construction.
  if (user.role === "STUDENT" && assignment.forumPostToRead) {
    const own = await db.submission.findUnique({
      where: { assignmentId_studentUserId: { assignmentId, studentUserId: user.userId } },
      select: { status: true },
    });
    if (!own || own.status === "DRAFT") {
      return apiError(res, "post_first", "Post your own response before commenting.", 403);
    }
  }

  // No notification: NotificationType has no forum member (spec 14 D13).
  const created = await db.forumComment.create({
    data: { submissionId: post.id, authorUserId: user.userId, body: parsed.body },
    select: FORUM_COMMENT_SELECT,
  });

  return apiOk(res, { comment: toForumComment(created, true) }, 201);
});

forumRouter.delete("/forum/comments/:commentId", requireAuth, async (req, res) => {
  const user = requireUser(req);
  const commentId = idParam(res, req.params.commentId, "comment");
  if (commentId === null) return;

  const comment = await db.forumComment.findUnique({
    where: { id: commentId },
    select: { id: true },
  });
  if (comment === null) return notFound(res, "Comment");

  if (!(await canDeleteForumComment(user, commentId))) return forbidden(res);

  // Hard delete: there is no deletedAt column and adding one is a migration.
  // Comments cannot nest, so nothing is orphaned (spec 14 R51).
  await db.forumComment.delete({ where: { id: commentId } });
  return apiOk(res, { deleted: true });
});
