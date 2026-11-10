import { db } from "../../db/client";
import type { Prisma, SubmissionStatus } from "../../generated/prisma/client";
import { essayWordCount, essayWordRangeMessage } from "../../../../../packages/shared/src/index";
import { ApiError } from "../api-error";
import { liveAssignment } from "../db/live";
import { EDITABLE_STATUSES } from "../permissions/submission";
import { newPublicId } from "../public-id";
import { workStanding } from "./standing";

/*
 * A student's essays: saving a draft and handing a returned essay in again.
 *
 * Lock order for every write to one student's work on an assignment:
 * 1. the Assignment FOR SHARE (`lockAssignmentForWork`), which pairs with
 *    `replaceAssignment`'s FOR UPDATE: an edit that removes the part waits, or
 *    the write sees it gone;
 * 2. the student's Submission FOR UPDATE (`lockSubmissionForWork`), so writes
 *    to sibling parts (two essays reviewed at once, a return racing a hand-in)
 *    run one after the other and each reads the other's result when it works
 *    out the student's standing;
 * 3. the work row FOR UPDATE.
 */

type Tx = Prisma.TransactionClient;

const essayGone = () => new ApiError("not_found", "Essay not found.", 404);

export function lockAssignmentForWork(tx: Tx, assignmentId: number) {
  return tx.$queryRaw`SELECT "id" FROM "Assignment" WHERE "id" = ${assignmentId} FOR SHARE`;
}

export function lockSubmissionForWork(tx: Tx, submissionId: number) {
  return tx.$queryRaw`SELECT "id" FROM "Submission" WHERE "id" = ${submissionId} FOR UPDATE`;
}

/**
 * Takes the three locks for the essay work with this publicId, in order, and
 * returns its assignment and Submission. 404 when there is no such work. The
 * caller re-reads the work under the locks (a removal may have deleted it).
 */
export async function lockEssayWork(tx: Tx, publicId: string): Promise<{ assignmentId: number; submissionId: number }> {
  const found = await tx.assignmentPartWork.findUnique({
    where: { publicId },
    select: { submissionId: true, part: { select: { assignmentId: true } } },
  });
  if (!found) throw essayGone();
  await lockAssignmentForWork(tx, found.part.assignmentId);
  await lockSubmissionForWork(tx, found.submissionId);
  await tx.$queryRaw`SELECT "id" FROM "AssignmentPartWork" WHERE "publicId" = ${publicId} FOR UPDATE`;
  return { assignmentId: found.part.assignmentId, submissionId: found.submissionId };
}

/**
 * The student's work on this part (an essay or a forum post), made (with the
 * assignment's Submission) if missing, so the work's part is always the
 * submission's assignment's and its student the submission's. The Submission,
 * then the work, are locked FOR UPDATE (the caller holds the assignment's lock).
 */
export async function ensurePartWork(tx: Tx, assignmentId: number, partId: number, studentUserId: number) {
  await tx.submission.createMany({
    data: [{ assignmentId, studentUserId, publicId: newPublicId() }],
    skipDuplicates: true,
  });
  const submission = await tx.submission.findUniqueOrThrow({
    where: { assignmentId_studentUserId: { assignmentId, studentUserId } },
    select: { id: true },
  });
  await lockSubmissionForWork(tx, submission.id);
  await tx.assignmentPartWork.createMany({
    data: [{ publicId: newPublicId(), partId, submissionId: submission.id, studentUserId }],
    skipDuplicates: true,
  });
  await tx.$queryRaw`SELECT "id" FROM "AssignmentPartWork" WHERE "partId" = ${partId} AND "studentUserId" = ${studentUserId} FOR UPDATE`;
  return tx.assignmentPartWork.findUniqueOrThrow({
    where: { partId_studentUserId: { partId, studentUserId } },
    select: { id: true, publicId: true, status: true },
  });
}

const handedInMessage = "This essay has been handed in and can no longer be changed.";

/**
 * PUT /assignments/:id/parts/:partId/essay: saves the draft's text. A save is
 * never a hand-in and never changes the status: a draft stays a draft until
 * Submit, a returned essay stays returned until it is handed in again. A
 * handed-in or reviewed essay is the reviewer's to judge (409).
 */
export async function saveEssayDraft(
  partId: number,
  studentUserId: number,
  text: string,
): Promise<{ publicId: string; wordCount: number; reviewStatus: SubmissionStatus }> {
  return db.$transaction(async (tx) => {
    const owner = await tx.assignmentPart.findUnique({ where: { id: partId }, select: { assignmentId: true } });
    if (!owner) throw new ApiError("not_found", "Part not found.", 404);
    await lockAssignmentForWork(tx, owner.assignmentId);
    // Re-read under the lock: an edit that landed first wins.
    const part = await tx.assignmentPart.findFirst({
      where: { id: partId, kind: "ESSAY", assignment: liveAssignment },
      select: { id: true },
    });
    if (!part) throw new ApiError("not_found", "Part not found.", 404);
    const work = await ensurePartWork(tx, owner.assignmentId, partId, studentUserId);
    if (!EDITABLE_STATUSES.includes(work.status)) throw new ApiError("submission_locked", handedInMessage, 409);
    await tx.assignmentPartWork.update({ where: { id: work.id }, data: { text } });
    return { publicId: work.publicId, wordCount: essayWordCount(text), reviewStatus: work.status };
  });
}

function notReturnedMessage(status: SubmissionStatus): string {
  return status === "DRAFT" ? "Hand your essays in with Submit." : "This essay is already handed in.";
}

/**
 * POST /submissions/:publicId/hand-in: a returned essay, handed in again on its
 * own (only from RETURNED; the first hand-in is the assignment's Submit). The
 * word range is checked on the server's count (`essayWordCount`, as the app
 * counts). The essay goes back to SUBMITTED, so only it re-enters the queue;
 * when that leaves every part done, the assignment is submitted again.
 */
export async function handInEssay(
  publicId: string,
  studentUserId: number,
  now = new Date(),
): Promise<{ reviewStatus: "SUBMITTED"; assignmentSubmitted: boolean }> {
  return db.$transaction(async (tx) => {
    const { assignmentId } = await lockEssayWork(tx, publicId);
    const work = await tx.assignmentPartWork.findFirst({
      where: { publicId, studentUserId, part: { kind: "ESSAY", assignment: liveAssignment } },
      select: {
        id: true,
        status: true,
        text: true,
        submissionId: true,
        part: { select: { minWords: true, maxWords: true } },
      },
    });
    if (!work) throw essayGone();
    if (work.status !== "RETURNED") throw new ApiError("not_returned", notReturnedMessage(work.status), 409);
    const refusal = essayWordRangeMessage(essayWordCount(work.text), work.part.minWords, work.part.maxWords);
    if (refusal !== null) throw new ApiError("word_range", refusal, 400);

    await tx.assignmentPartWork.update({ where: { id: work.id }, data: { status: "SUBMITTED", submittedAt: now } });
    const { everyPartDone } = await workStanding(tx, assignmentId, studentUserId);
    if (everyPartDone) {
      await tx.submission.updateMany({
        where: { id: work.submissionId, submittedAt: null },
        data: { submittedAt: now },
      });
    }
    return { reviewStatus: "SUBMITTED", assignmentSubmitted: everyPartDone };
  });
}
