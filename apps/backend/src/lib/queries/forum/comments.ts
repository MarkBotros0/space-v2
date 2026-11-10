import { db } from "../../../db/client";
import type { SessionUser } from "../../auth/tokens";
import { canDeleteLoadedComment, commentDeleteCtx } from "../../permissions";
import { displayNameFor } from "./shared";

/** What every comment read selects (refactor BE-024: one select, three readers). */
export const FORUM_COMMENT_SELECT = {
  id: true,
  authorUserId: true,
  body: true,
  createdAt: true,
  authorUser: { select: { name: true } },
} as const;

type ForumCommentRow = {
  id: number;
  authorUserId: number;
  body: string;
  createdAt: Date;
  authorUser: { name: string | null };
};

/**
 * A comment as the client reads it. Plain text, rendered as plain text: v1's
 * comment box is a textarea and its comments are never parsed as HTML (R29).
 */
export function toForumComment(c: ForumCommentRow, canDelete: boolean): ForumCommentData {
  return {
    id: c.id,
    authorUserId: c.authorUserId,
    authorDisplayName: displayNameFor(c.authorUser.name),
    body: c.body,
    createdAt: c.createdAt,
    canDelete,
  };
}

export interface ForumCommentData {
  id: number;
  authorUserId: number;
  authorDisplayName: string;
  body: string;
  createdAt: Date;
  canDelete: boolean;
}

/**
 * One post's comments, oldest first (v1 R26), bounded.
 *
 * `canDelete` is computed here rather than left to the client, which is the fix
 * for the class of bug that made v1's staff removal power unreachable: the
 * component derived the affordance from `authorUserId === currentUserId` while
 * the action allowed three more cases (spec 14 R49/R52).
 */
export async function listForumComments(
  post: { id: number; studentUserId: number },
  seasonId: number,
  user: SessionUser,
  query: { cursor?: number; limit: number },
): Promise<{ comments: ForumCommentData[]; nextCursor: number | null }> {
  const rows = await db.forumComment.findMany({
    where: { partWorkId: post.id },
    orderBy: { id: "asc" },
    take: query.limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    select: FORUM_COMMENT_SELECT,
  });
  const page = rows.slice(0, query.limit);
  // Every comment here sits under the same post: one context, the gate's own rule (R52).
  const ctx = await commentDeleteCtx(user, seasonId, post.studentUserId);
  const comments = page.map((c) => toForumComment(c, canDeleteLoadedComment(user, c, ctx)));
  return {
    comments,
    nextCursor: rows.length > query.limit ? (page[page.length - 1]?.id ?? null) : null,
  };
}
