import { Router } from "express";

import { db } from "../db/client";
import { apiError, apiOk } from "../lib/api-response";
import { newPublicId } from "../lib/public-id";
import { parseId } from "../lib/parse-id";
import {
  canCommentOnForumSubmission,
  canDeleteForumComment,
  forumAudienceFor,
} from "../lib/permissions";
import {
  displayNameFor,
  listForumComments,
  loadForumAssignment,
  loadForumView,
  postInAudience,
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

forumRouter.get(
  "/assignments/:id/forum/posts/:publicId/comments",
  requireAuth,
  async (req, res) => {
    const user = requireUser(req);
    const assignmentId = parseId(req.params.id);
    if (assignmentId === null) return apiError(res, "bad_request", "Invalid assignment id.", 400);

    const parsedQuery = forumCommentsQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) return apiError(res, "bad_request", "Invalid query.", 400);

    const assignment = await loadForumAssignment(assignmentId);
    if (assignment === null) return apiError(res, "not_found", "Assignment not found.", 404);

    const audience = await forumAudienceFor(user, assignmentId);
    if (audience === null) return apiError(res, "forbidden", "You don't have access to this.", 403);

    const post = await resolvePost(assignmentId, req.params.publicId);
    // A DRAFT is not a post (spec 14 R23): indistinguishable from a missing one.
    if (post === null || post.status === "DRAFT") {
      return apiError(res, "not_found", "Post not found.", 404);
    }
    if (!(await postInAudience(audience, assignment.seasonId, post.studentUserId))) {
      return apiError(res, "forbidden", "You don't have access to this.", 403);
    }

    // The same lock the feed applies: a student reads nothing until they post.
    if (audience.kind === "student") {
      const own = await db.submission.findUnique({
        where: { assignmentId_studentUserId: { assignmentId, studentUserId: user.userId } },
        select: { status: true },
      });
      if (!own || own.status === "DRAFT") {
        return apiError(res, "post_first", "Post your own response before reading comments.", 403);
      }
    }

    return apiOk(res, await listForumComments(post.id, user, parsedQuery.data));
  },
);

forumRouter.post(
  "/assignments/:id/forum/posts/:publicId/comments",
  requireAuth,
  async (req, res) => {
    const user = requireUser(req);
    const assignmentId = parseId(req.params.id);
    if (assignmentId === null) return apiError(res, "bad_request", "Invalid assignment id.", 400);

    if ((await loadForumAssignment(assignmentId)) === null) {
      return apiError(res, "not_found", "Assignment not found.", 404);
    }

    // Before the gate, but note that canCommentOnForumSubmission also returns
    // false for a missing row, so a probe cannot tell "no such post" from "not
    // allowed" on the gate itself (spec 14 §6) — a deliberate property.
    const post = await resolvePost(assignmentId, req.params.publicId);
    if (post === null) return apiError(res, "not_found", "Post not found.", 404);

    const parsed = addForumCommentRequestSchema.safeParse(req.body);
    if (!parsed.success) return apiError(res, "bad_request", "Invalid comment.", 400);

    if (!(await canCommentOnForumSubmission(user, post.id))) {
      return apiError(res, "forbidden", "You don't have access to this.", 403);
    }

    // Post-first, for students only (v1 R41). Staff bypass it by construction.
    if (user.role === "STUDENT") {
      const own = await db.submission.findUnique({
        where: { assignmentId_studentUserId: { assignmentId, studentUserId: user.userId } },
        select: { status: true },
      });
      if (!own || own.status === "DRAFT") {
        return apiError(res, "post_first", "Post your own response before commenting.", 403);
      }
    }

    // No notification: NotificationType has no forum member and adding one is a
    // migration (C1). A cutover task (spec 14 D13).
    const created = await db.forumComment.create({
      data: { submissionId: post.id, authorUserId: user.userId, body: parsed.data.body },
      select: {
        id: true,
        authorUserId: true,
        body: true,
        createdAt: true,
        authorUser: { select: { name: true } },
      },
    });

    return apiOk(
      res,
      {
        comment: {
          id: created.id,
          authorUserId: created.authorUserId,
          authorDisplayName: displayNameFor(created.authorUser.name),
          body: created.body,
          createdAt: created.createdAt,
          canDelete: true,
        },
      },
      201,
    );
  },
);

forumRouter.delete("/forum/comments/:commentId", requireAuth, async (req, res) => {
  const user = requireUser(req);
  const commentId = parseId(req.params.commentId);
  if (commentId === null) return apiError(res, "bad_request", "Invalid comment id.", 400);

  const comment = await db.forumComment.findUnique({
    where: { id: commentId },
    select: { id: true },
  });
  if (comment === null) return apiError(res, "not_found", "Comment not found.", 404);

  if (!(await canDeleteForumComment(user, commentId))) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  // Hard delete: there is no deletedAt column and adding one is a migration.
  // Comments cannot nest, so nothing is orphaned (spec 14 R51).
  await db.forumComment.delete({ where: { id: commentId } });
  return apiOk(res, { deleted: true });
});
