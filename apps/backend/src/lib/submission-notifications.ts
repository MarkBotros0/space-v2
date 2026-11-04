import { db } from "../db/client";

import { bestEffort } from "./best-effort";
import { createNotificationsBulk } from "./notifications";
import { groupIdInSeason } from "./queries/enrollment";

/**
 * Where SUBMISSION_RECEIVED points: the submission itself, by publicId.
 *
 * The recipient is a leader whose next step is to review this one piece of
 * work, and the mobile `/submission/[publicId]` screen is where the review
 * form lives. The path is v1's leader review page
 * (jpc-space src/app/leader/submissions/[publicId]), so the mailed web link
 * opens the same thing; lib/notification-target.ts maps it to the
 * `submission` target.
 */
export function submissionReceivedLink(publicId: string): string {
  return `/leader/submissions/${publicId}`;
}

export interface ReceivedSubmission {
  publicId: string;
  studentUserId: number;
  seasonId: number;
  assignmentTitle: string;
}

/**
 * Tell the leaders of the student's group IN THE ASSIGNMENT'S SEASON that work
 * came in (spec 08 D14).
 *
 * The group is resolved through SeasonEnrollment (`groupIdInSeason`, ruling
 * C9), the same lookup the low-attendance flag uses, never the database-wide
 * GroupStudent row. Season admins are deliberately left out: they would get
 * one notification per submission across the whole season. An ungrouped
 * student has no leader to tell, so nobody is notified.
 *
 * Best-effort and called after the submit has committed (spec D6): a
 * notification failure must not report the submission as failed.
 */
export async function notifySubmissionReceived(sub: ReceivedSubmission): Promise<void> {
  await bestEffort("notify:SUBMISSION_RECEIVED", async () => {
    const groupId = await groupIdInSeason(sub.studentUserId, sub.seasonId);
    if (groupId === null) return;

    const leaders = await db.groupLeader.findMany({
      where: { groupId, user: { deletedAt: null } },
      select: { userId: true },
    });
    // A student never hears about their own submission, whatever rows they hold.
    const leaderIds = leaders.map((l) => l.userId).filter((id) => id !== sub.studentUserId);
    if (leaderIds.length === 0) return;

    const student = await db.user.findUnique({
      where: { id: sub.studentUserId },
      select: { name: true },
    });
    await createNotificationsBulk(leaderIds, {
      type: "SUBMISSION_RECEIVED",
      title: `${student?.name ?? "A student"} submitted ${sub.assignmentTitle}`,
      link: submissionReceivedLink(sub.publicId),
    });
  });
}
