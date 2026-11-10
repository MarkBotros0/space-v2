import { db } from "../../../db/client";
import type { SessionUser } from "../../auth/tokens";
import { canDeleteForumComment } from "../../permissions";
import { displayNameFor } from "./shared";

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
  submissionId: number,
  user: SessionUser,
  query: { cursor?: number; limit: number },
): Promise<{ comments: ForumCommentData[]; nextCursor: number | null }> {
  const rows = await db.forumComment.findMany({
    where: { submissionId },
    orderBy: { id: "asc" },
    take: query.limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      authorUserId: true,
      body: true,
      createdAt: true,
      authorUser: { select: { name: true } },
    },
  });
  const page = rows.slice(0, query.limit);
  const comments = await Promise.all(
    page.map(async (c) => ({
      id: c.id,
      authorUserId: c.authorUserId,
      authorDisplayName: displayNameFor(c.authorUser.name),
      // Plain text, rendered as plain text. v1's comment box is a textarea and
      // its comments are never parsed as HTML (R29).
      body: c.body,
      createdAt: c.createdAt,
      canDelete: await canDeleteForumComment(user, c.id),
    })),
  );
  return {
    comments,
    nextCursor: rows.length > query.limit ? (page[page.length - 1]?.id ?? null) : null,
  };
}
