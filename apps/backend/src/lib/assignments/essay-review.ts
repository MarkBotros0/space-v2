import { db } from "../../db/client";
import { ApiError } from "../api-error";
import { liveAssignment } from "../db/live";
import { lockEssayWork } from "./essay";
import { workStanding } from "./standing";

/**
 * POST /submissions/:publicId/review: a verdict on one essay, on its own.
 *
 * - `reviewed` (feedback optional) sets it REVIEWED. When that leaves every
 *   essay of the student's assignment reviewed (and the assignment submitted,
 *   every part done), the assignment is complete: `completedAt` is set.
 * - `return` (a note, which the route has required) sets it RETURNED and
 *   reopens the assignment: `submittedAt` and `completedAt` are cleared, so it
 *   is outstanding again. The student's other parts are not touched.
 *
 * An essay is reviewed once it is handed in (SUBMITTED), and a reviewed one may
 * be re-judged. A returned essay is with the student until they hand it in
 * again (409). The caller has checked the reviewer may review it.
 */
export async function reviewEssay(
  publicId: string,
  reviewerId: number,
  action: "reviewed" | "return",
  feedback: string | null,
  now = new Date(),
): Promise<{ reviewStatus: "REVIEWED" | "RETURNED"; assignmentId: number; studentUserId: number }> {
  return db.$transaction(async (tx) => {
    const { assignmentId } = await lockEssayWork(tx, publicId);
    // Re-read under the locks: a removed part or a deleted assignment wins.
    const work = await tx.assignmentPartWork.findFirst({
      where: { publicId, part: { kind: "ESSAY", assignment: liveAssignment } },
      select: { id: true, status: true, submissionId: true, studentUserId: true },
    });
    if (!work || work.status === "DRAFT") throw new ApiError("not_found", "Essay not found.", 404);
    if (work.status === "RETURNED") {
      throw new ApiError(
        "not_handed_in",
        "This essay is back with the student. Review it once they hand it in again.",
        409,
      );
    }

    const reviewStatus = action === "return" ? "RETURNED" : "REVIEWED";
    await tx.assignmentPartWork.update({
      where: { id: work.id },
      // A blank note on `reviewed` is no note at all.
      data: {
        status: reviewStatus,
        feedback: feedback?.trim() ? feedback : null,
        reviewedAt: now,
        reviewedById: reviewerId,
      },
    });
    if (reviewStatus === "RETURNED") {
      await tx.submission.update({
        where: { id: work.submissionId },
        data: { submittedAt: null, completedAt: null },
      });
    } else {
      const standing = await workStanding(tx, assignmentId, work.studentUserId);
      if (standing.everyPartDone && standing.essaysReviewed) {
        await tx.submission.updateMany({
          where: { id: work.submissionId, submittedAt: { not: null }, completedAt: null },
          data: { completedAt: now },
        });
      }
    }
    return { reviewStatus, assignmentId, studentUserId: work.studentUserId };
  });
}
