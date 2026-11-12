import { db } from "../../db/client";
import { ApiError } from "../api-error";
import { liveAssignment } from "../db/live";
import { notifyAssignmentSubmitted } from "../submission-notifications";
import { lockAssignmentForWork, lockOwnSubmission } from "./essay";
import { workStanding } from "./standing";

interface SubmitResult {
  submittedAt: Date;
  completedAt: Date | null;
}

/**
 * POST /assignments/:id/submit: the student hands the assignment in. Allowed
 * only when every part is done, videos included (owner); otherwise 409
 * `not_finished` with the line the app shows under its button. The draft
 * essays are handed in with it (DRAFT → SUBMITTED) and reach the review queue;
 * an assignment with no essay to review is complete at once, one with essays
 * when each is reviewed (`reviewEssay`).
 *
 * Submitting twice is refused (409 `already_submitted`): a returned essay goes
 * back on its own (`handInEssay`), never with a second Submit.
 *
 * Lock order (lib/assignments/essay.ts): the Assignment FOR SHARE, the
 * student's Submission FOR UPDATE, then their work rows FOR UPDATE. The
 * leader's notification goes after the commit, only on success.
 */
export async function submitAssignment(
  assignmentId: number,
  studentUserId: number,
  now = new Date(),
): Promise<SubmitResult> {
  const done = await db.$transaction(async (tx) => {
    await lockAssignmentForWork(tx, assignmentId);
    // Re-read under the lock: a delete that landed first wins.
    const assignment = await tx.assignment.findFirst({
      where: { id: assignmentId, ...liveAssignment },
      select: { seasonId: true, title: true },
    });
    if (!assignment) throw new ApiError("not_found", "Assignment not found.", 404);

    const submission = await lockOwnSubmission(tx, assignmentId, studentUserId);
    await tx.$queryRaw`SELECT "id" FROM "AssignmentPartWork" WHERE "submissionId" = ${submission.id} ORDER BY "id" FOR UPDATE`;
    // Read again now that it is locked: a concurrent Submit may have won.
    const current = await tx.submission.findUniqueOrThrow({
      where: { id: submission.id },
      select: { submittedAt: true },
    });
    if (current.submittedAt !== null) {
      throw new ApiError("already_submitted", "You've already submitted this assignment.", 409);
    }

    const standing = await workStanding(tx, assignmentId, studentUserId);
    if (!standing.everyPartDone)
      throw new ApiError("not_finished", standing.blocker ?? "Finish every part to submit", 409);

    await tx.assignmentPartWork.updateMany({
      where: { submissionId: submission.id, status: "DRAFT", part: { kind: "ESSAY" } },
      data: { status: "SUBMITTED", submittedAt: now },
    });
    // Reviewed already when every essay was (none, or all kept from before a reopen).
    const completedAt = standing.essaysReviewed ? now : null;
    await tx.submission.update({ where: { id: submission.id }, data: { submittedAt: now, completedAt } });

    const firstEssay = standing.works.find((w) => w.kind === "ESSAY" && w.essay !== undefined)?.essay ?? null;
    return { assignment, completedAt, essayPublicId: firstEssay?.publicId ?? null };
  });

  await notifyAssignmentSubmitted({
    studentUserId,
    seasonId: done.assignment.seasonId,
    assignmentId,
    assignmentTitle: done.assignment.title,
    essayPublicId: done.essayPublicId,
  });
  return { submittedAt: now, completedAt: done.completedAt };
}
