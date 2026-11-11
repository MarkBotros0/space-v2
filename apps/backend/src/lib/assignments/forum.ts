import { db } from "../../db/client";
import type { Prisma } from "../../generated/prisma/client";
import { countWords, plainTextToHtml } from "../../../../../packages/shared/src/index";
import { ApiError } from "../api-error";
import { liveAssignment } from "../db/live";
import { FORUM_COMMENT_SELECT } from "../queries/forum";
import { ensurePartWork, lockAssignmentForWork } from "./essay";

/*
 * A forum part's writes: the student's post and a comment on someone's post.
 *
 * A post is the student's AssignmentPartWork on the FORUM part, written with
 * status SUBMITTED: every reader counts non-DRAFT forum work as posted, and a
 * forum part has no review, so posting is what makes the part done. Posting is
 * not Submit: the assignment's Submission is only made (in step with the work,
 * by `ensurePartWork`), never stamped submitted here.
 *
 * Lock order is the per-student one (see essay.ts): the Assignment FOR SHARE,
 * then the Submission FOR UPDATE, then the work row FOR UPDATE. The part is
 * re-read under the Assignment's lock, so a part removed (or an assignment
 * deleted) while the request was on its way answers 404, not a foreign-key 500.
 */

type Tx = Prisma.TransactionClient;

const forumGone = () => new ApiError("not_found", "Forum not found.", 404);

/** Locks the part's assignment FOR SHARE and re-reads the part as a live FORUM part. 404 when it is gone. */
async function lockForumPart(tx: Tx, partId: number) {
  const owner = await tx.assignmentPart.findUnique({ where: { id: partId }, select: { assignmentId: true } });
  if (!owner) throw forumGone();
  await lockAssignmentForWork(tx, owner.assignmentId);
  const part = await tx.assignmentPart.findFirst({
    where: { id: partId, kind: "FORUM", assignment: liveAssignment },
    select: { id: true, assignmentId: true, minWords: true, allowComments: true },
  });
  if (!part) throw forumGone();
  return part;
}

interface ForumPostResult {
  publicId: string;
  text: string;
  status: "SUBMITTED";
  wordCount: number;
  posted: true;
}

/**
 * PUT …/parts/:partId/forum/response: the creator of the post (ruling C6,
 * D-14.1): a GET never writes. Idempotent; a second call overwrites the text
 * and re-stamps `submittedAt`. The part's `minWords` is applied to the count
 * the client shows (`countWords` on the plain text). No due-date branch,
 * deliberately (spec 14 D5): a discussion that closes at a deadline stops
 * being a discussion.
 */
export async function postForumResponse(
  partId: number,
  studentUserId: number,
  text: string,
  now = new Date(),
): Promise<ForumPostResult> {
  return db.$transaction(async (tx) => {
    const part = await lockForumPart(tx, partId);
    const words = countWords(text);
    const min = part.minWords ?? 0;
    if (words < min) {
      throw new ApiError("too_few_words", `Please write at least ${min} words (you have ${words}).`, 400);
    }
    const work = await ensurePartWork(tx, part.assignmentId, part.id, studentUserId);
    await tx.assignmentPartWork.update({
      where: { id: work.id },
      data: {
        text: plainTextToHtml(text),
        status: "SUBMITTED",
        submittedAt: now,
        // The part is done from the first post on.
        ...(work.status === "DRAFT" ? { doneAt: now } : {}),
      },
    });
    return { publicId: work.publicId, text, status: "SUBMITTED", wordCount: words, posted: true };
  });
}

/**
 * POST …/forum/posts/:publicId/comments, once the route's gates have passed.
 * Under the Assignment's lock the part and the post are re-read: the post must
 * still be a posted work on this live FORUM part (404 otherwise), and the
 * part's comments must still be on (403, the route gate's refusal: an edit that
 * turned them off landed first). No notification:
 * NotificationType has no forum member (spec 14 D13).
 */
export async function addForumComment(partId: number, postWorkId: number, authorUserId: number, body: string) {
  return db.$transaction(async (tx) => {
    const part = await lockForumPart(tx, partId);
    if (!part.allowComments) throw new ApiError("forbidden", "You don't have access to this.", 403);
    const post = await tx.assignmentPartWork.findFirst({
      where: { id: postWorkId, partId, status: { not: "DRAFT" } },
      select: { id: true },
    });
    if (!post) throw new ApiError("not_found", "Post not found.", 404);
    return tx.forumComment.create({
      data: { partWorkId: post.id, authorUserId, body },
      select: FORUM_COMMENT_SELECT,
    });
  });
}
