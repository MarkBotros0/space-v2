import { z } from "zod";

import { submissionStatusSchema } from "./enums";

// Wire shapes — see the note in season.ts on why timestamps are strings.
//
// A FORUM assignment is not an entity: the post *is* a Submission row and the
// only table this domain owns is ForumComment. `type`, `forumMinWords` and
// `forumAllowComments` belong to assignment.ts (domain 7) and are flattened
// onto the view below only as the two config values the screen needs.

export const forumCommentSchema = z.object({
  id: z.number(),
  authorUserId: z.number(),
  /**
   * `name`, or the literal "Group member". Never an email address: v1 fell back
   * to `email` (R30), so every student in a group saw the address of any
   * group-mate who had not set a name. These are young people's addresses.
   * There is no `authorEmail` field on this contract and there must not be one.
   */
  authorDisplayName: z.string(),
  /** Plain text. Never HTML — v1's comment box is a textarea (R29). */
  body: z.string(),
  createdAt: z.string(),
  /**
   * Computed server-side from the same gate the DELETE uses. v1's client
   * re-derived it as `authorUserId === currentUserId`, which is why R49's
   * SUPER/ADMIN removal power was unreachable from any UI (R52).
   */
  canDelete: z.boolean(),
});
export type ForumComment = z.infer<typeof forumCommentSchema>;

export const forumPostSchema = z.object({
  /** Addressed by publicId, never the sequential Submission.id (v1 R5/R43). */
  submissionPublicId: z.string(),
  studentUserId: z.number(),
  authorDisplayName: z.string(),
  /** Plain text, converted from stored rich text at the API boundary (ruling C11). */
  text: z.string(),
  submittedAt: z.string().nullable(),
  /** v1 never computed this; without it a paginated comment list has no affordance. */
  commentCount: z.number(),
  /** First page only. The rest come from the comments endpoint. */
  comments: z.array(forumCommentSchema),
  canComment: z.boolean(),
});
export type ForumPost = z.infer<typeof forumPostSchema>;

export const forumOwnResponseSchema = z.object({
  /**
   * Spec 14 §10 D9: posting sets SUBMITTED, which puts a forum post in the
   * leader review queue as ordinary work, and `reviewSubmissionAction` has no
   * type precondition — so a reviewer can write feedback on a discussion post
   * and v1's forum screen renders none of it, because `loadForumView` never
   * selects the column. Forum posts stay reviewable (that is the cheaper half
   * of the decision and matches what leaders already do); the fix is that the
   * student can now read the verdict.
   */
  feedback: z.string().nullable(),
  reviewedAt: z.string().nullable(),
  /**
   * Nullable, and that is the whole point: nothing creates the row up front any
   * more (ruling C6), so the screen must render the compose box, the counter and
   * the locked feed with no submission in existence.
   */
  submissionPublicId: z.string().nullable(),
  text: z.string(),
  status: submissionStatusSchema,
  wordCount: z.number(),
  posted: z.boolean(),
});
export type ForumOwnResponse = z.infer<typeof forumOwnResponseSchema>;

export const forumViewSchema = z.object({
  assignmentId: z.number(),
  /** Rendered on the forum screen — v1's FORUM branch omitted it (spec 14 D10). */
  dueAt: z.string().nullable(),
  /**
   * Null for staff readers, who have no response of their own. A student always
   * has one, even when its `submissionPublicId` is null.
   */
  own: forumOwnResponseSchema.nullable(),
  /** True until the caller's own response is posted. Staff are never locked. */
  locked: z.boolean(),
  minWords: z.number().nullable(),
  allowComments: z.boolean(),
  /** Which group's thread this is. Null for a staff reader seeing every group. */
  groupId: z.number().nullable(),
  posts: z.array(forumPostSchema),
  nextCursor: z.string().nullable(),
});
export type ForumView = z.infer<typeof forumViewSchema>;

/**
 * `min(1)` after trimming, regardless of the assignment's `forumMinWords`
 * (spec 14 §10 D8). With a null or zero minimum, v1's `countWords("") >= 0`
 * passed on both client and server, so a student could post nothing, flip to
 * SUBMITTED, unlock the peer feed and read everyone else's work without
 * contributing. "Post to unlock" is a contribution mechanic.
 *
 * The 20,000 cap matches domain 7's `description`; v1 had no cap at all.
 */
export const submitForumResponseRequestSchema = z.object({
  text: z.string().trim().min(1, "Write at least one word.").max(20_000),
});
export type SubmitForumResponseRequest = z.infer<typeof submitForumResponseRequestSchema>;

export const addForumCommentRequestSchema = z.object({
  body: z.string().trim().min(1, "Comment cannot be empty.").max(5000),
});
export type AddForumCommentRequest = z.infer<typeof addForumCommentRequestSchema>;

export const forumFeedQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
export type ForumFeedQuery = z.output<typeof forumFeedQuerySchema>;

export const forumCommentsQuerySchema = z.object({
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type ForumCommentsQuery = z.output<typeof forumCommentsQuerySchema>;

/** `GET .../posts/:publicId/comments` — one page, oldest first. */
export const forumCommentsPageSchema = z.object({
  comments: z.array(forumCommentSchema),
  nextCursor: z.number().nullable(),
});
export type ForumCommentsPage = z.infer<typeof forumCommentsPageSchema>;

export const addForumCommentResponseSchema = z.object({ comment: forumCommentSchema });

export const deleteForumCommentResponseSchema = z.object({ deleted: z.literal(true) });

/**
 * v1's word counter, carried verbatim from `jpc-space/src/lib/forum.ts`.
 *
 * Shared for the reason v1 shared it: the live counter in the compose box and
 * the server's `forumMinWords` gate must agree, or a student gets an enabled
 * button and a refusal. Numeric entities (`&#160;`) are deliberately still
 * unhandled — matching v1 exactly is the point (spec 14 R10).
 *
 * This is the only text helper the forum owns. Converting between stored HTML
 * and plain text is `html-text.ts` (Plan 12, ruling X3) — never a second copy.
 */
export function countWords(text: string): number {
  const stripped = text
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!stripped) return 0;
  return stripped.split(" ").length;
}
