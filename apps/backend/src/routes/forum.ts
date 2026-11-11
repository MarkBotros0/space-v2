import { Router, type Request, type Response } from "express";

import { db } from "../db/client";
import { apiError, apiOk, forbidden } from "../lib/api-response";
import { addForumComment, postForumResponse } from "../lib/assignments/forum";
import { canCommentOnForumPost, canDeleteForumComment, forumAudienceFor } from "../lib/permissions";
import {
  listForumComments,
  loadForumPart,
  loadForumView,
  ownForumWork,
  postInAudience,
  toForumComment,
  type ForumPartRow,
} from "../lib/queries/forum";
import { requireAuth, requireUser } from "../middleware/require-auth";
import {
  addForumCommentRequestSchema,
  forumCommentsQuerySchema,
  forumFeedQuerySchema,
  submitForumResponseRequestSchema,
} from "../../../../packages/shared/src/index";
import { idParam } from "../lib/http/params";
import { notFound } from "../lib/http/not-found";
import { parseOr400 } from "../lib/http/validate";

/**
 * Domain 14. The forum is the FORUM part of an assignment (at most one per
 * assignment). Mounted at /api/v1 because the thread hangs off a part
 * (`/assignments/:id/parts/:partId/forum*`) while a comment is addressed on its
 * own (`/forum/comments/:commentId`). Per-route `requireAuth` only (ruling X5)
 * — see video-quiz/index.ts for why.
 *
 * Status-code rule: the part is resolved first (a missing part, a part that
 * isn't a forum, one named under another assignment, or a deleted assignment
 * → 404 for every caller); only then does the audience gate run (403).
 */
export const forumRouter = Router();

/** The FORUM part named by the path, or null after answering 404. */
async function findForumPart(req: Request, res: Response): Promise<ForumPartRow | null> {
  const assignmentId = idParam(res, req.params.id, "assignment");
  if (assignmentId === null) return null;
  const partId = idParam(res, req.params.partId, "part");
  if (partId === null) return null;
  const part = await loadForumPart(assignmentId, partId);
  if (part === null) notFound(res, "Forum");
  return part;
}

/** Has this student posted on the part? The post-first rule's question. */
async function hasPosted(partId: number, studentUserId: number): Promise<boolean> {
  const own = await ownForumWork(partId, studentUserId);
  return own !== null && own.status !== "DRAFT";
}

forumRouter.get("/assignments/:id/parts/:partId/forum", requireAuth, async (req, res) => {
  const user = requireUser(req);
  const part = await findForumPart(req, res);
  if (part === null) return;

  const parsedQuery = parseOr400(forumFeedQuerySchema, req.query, res, "Invalid query.");
  if (parsedQuery === null) return;

  const audience = await forumAudienceFor(user, part.assignmentId);
  if (audience === null) return forbidden(res);

  return apiOk(res, await loadForumView(part, user, audience, parsedQuery));
});

/** The student's post (lib/assignments/forum.ts makes the work and its Submission in step). */
forumRouter.put("/assignments/:id/parts/:partId/forum/response", requireAuth, async (req, res) => {
  const user = requireUser(req);
  const part = await findForumPart(req, res);
  if (part === null) return;

  if (user.role !== "STUDENT") {
    return apiError(res, "forbidden", "Only a student can post a response.", 403);
  }
  const audience = await forumAudienceFor(user, part.assignmentId);
  if (audience === null || audience.kind !== "student") return forbidden(res);

  const parsed = parseOr400(submitForumResponseRequestSchema, req.body, res, "Invalid response.");
  if (parsed === null) return;

  return apiOk(res, await postForumResponse(part.id, user.userId, parsed.text));
});

/**
 * v1 addresses a forum write by a bare sequential `Submission.id`, so the gates
 * constrain *who* the caller is but never *which* row they name (spec 14 R5,
 * R43, D14). Nesting the post under its part and re-checking the pair here
 * means a mismatched id is a 404 rather than a silent success — and the
 * publicId is unguessable in the first place.
 */
async function resolvePost(partId: number, publicId: string | string[] | undefined) {
  return db.assignmentPartWork.findFirst({
    where: { publicId: typeof publicId === "string" ? publicId : "", partId },
    select: { id: true, status: true, studentUserId: true },
  });
}

forumRouter.get("/assignments/:id/parts/:partId/forum/posts/:publicId/comments", requireAuth, async (req, res) => {
  const user = requireUser(req);
  const part = await findForumPart(req, res);
  if (part === null) return;

  const parsedQuery = parseOr400(forumCommentsQuerySchema, req.query, res, "Invalid query.");
  if (parsedQuery === null) return;

  const audience = await forumAudienceFor(user, part.assignmentId);
  if (audience === null) return forbidden(res);

  const post = await resolvePost(part.id, req.params.publicId);
  // A DRAFT is not a post (spec 14 R23): indistinguishable from a missing one.
  if (post === null || post.status === "DRAFT") {
    return notFound(res, "Post");
  }
  if (!(await postInAudience(audience, part.seasonId, post.studentUserId))) {
    return forbidden(res);
  }

  // The same lock the feed applies: on a "post before reading others" forum
  // a student reads nothing until they post.
  if (audience.kind === "student" && part.postToRead && !(await hasPosted(part.id, user.userId))) {
    return apiError(res, "post_first", "Post your own response before reading comments.", 403);
  }

  return apiOk(res, await listForumComments(post, part.seasonId, user, parsedQuery));
});

forumRouter.post("/assignments/:id/parts/:partId/forum/posts/:publicId/comments", requireAuth, async (req, res) => {
  const user = requireUser(req);
  const part = await findForumPart(req, res);
  if (part === null) return;

  // Before the gate, but note that canCommentOnForumPost also returns false
  // for a missing row, so a probe cannot tell "no such post" from "not
  // allowed" on the gate itself (spec 14 §6) — a deliberate property.
  const post = await resolvePost(part.id, req.params.publicId);
  if (post === null) return notFound(res, "Post");

  const parsed = parseOr400(addForumCommentRequestSchema, req.body, res, "Invalid comment.");
  if (parsed === null) return;

  if (!(await canCommentOnForumPost(user, post.id))) return forbidden(res);

  // Post-first, for students only (v1 R41), on a "post before reading others"
  // forum. Staff bypass it by construction.
  if (user.role === "STUDENT" && part.postToRead && !(await hasPosted(part.id, user.userId))) {
    return apiError(res, "post_first", "Post your own response before commenting.", 403);
  }

  const created = await addForumComment(part.id, post.id, user.userId, parsed.body);
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

  // Hard delete: there is no deletedAt column. Comments cannot nest, so
  // nothing is orphaned (spec 14 R51). deleteMany, so a comment removed in the
  // meantime (with its post, or its part) is a 404 rather than a 500.
  const { count } = await db.forumComment.deleteMany({ where: { id: commentId } });
  if (count === 0) return notFound(res, "Comment");
  return apiOk(res, { deleted: true });
});
