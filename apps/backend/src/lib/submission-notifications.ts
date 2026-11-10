import { db } from "../db/client";

import { bestEffort } from "./best-effort";
import { createNotificationsBulk } from "./notifications";
import { groupIdInSeason } from "./queries/enrollment";
import { notificationLink } from "./notification-target";
import { liveUser } from "./db/live";

/**
 * Where SUBMISSION_RECEIVED points: one essay, by its work's publicId.
 *
 * The recipient is a leader whose next step is to review that essay, and the
 * mobile `/submission/[publicId]` screen is where the review form lives. The
 * path is v1's leader review page (jpc-space src/app/leader/submissions/[publicId]);
 * lib/notification-target.ts maps it to the `submission` target.
 */
export function submissionReceivedLink(publicId: string): string {
  return notificationLink.leaderSubmission(publicId);
}

/**
 * Tell the leaders of the student's group IN THE ASSIGNMENT'S SEASON (spec 08
 * D14) with one notification each, titled from the student's name.
 *
 * The group is resolved through SeasonEnrollment (`groupIdInSeason`, ruling
 * C9), never GroupStudent. Season admins are deliberately left out: they would
 * get one notification per hand-in across the whole season. An ungrouped
 * student has no leader to tell, so nobody is notified.
 *
 * Best-effort and called after the write has committed (spec D6): a
 * notification failure must not report the hand-in as failed.
 */
async function notifyStudentLeaders(
  studentUserId: number,
  seasonId: number,
  title: (studentName: string) => string,
  link: string,
): Promise<void> {
  await bestEffort("notify:SUBMISSION_RECEIVED", async () => {
    const groupId = await groupIdInSeason(studentUserId, seasonId);
    if (groupId === null) return;

    const leaders = await db.groupLeader.findMany({
      where: { groupId, user: liveUser },
      select: { userId: true },
    });
    // A student never hears about their own work, whatever rows they hold.
    const leaderIds = leaders.map((l) => l.userId).filter((id) => id !== studentUserId);
    if (leaderIds.length === 0) return;

    const student = await db.user.findUnique({ where: { id: studentUserId }, select: { name: true } });
    await createNotificationsBulk(leaderIds, {
      type: "SUBMISSION_RECEIVED",
      title: title(student?.name ?? "A student"),
      link,
    });
  });
}

/**
 * One per Submit, naming the assignment. It opens the assignment's first essay,
 * which is what waits for the leader; an assignment with no essay opens the
 * assignment itself.
 */
export async function notifyAssignmentSubmitted(sub: {
  studentUserId: number;
  seasonId: number;
  assignmentId: number;
  assignmentTitle: string;
  essayPublicId: string | null;
}): Promise<void> {
  const link =
    sub.essayPublicId === null
      ? notificationLink.studentAssignment(sub.assignmentId)
      : submissionReceivedLink(sub.essayPublicId);
  await notifyStudentLeaders(
    sub.studentUserId,
    sub.seasonId,
    (name) => `${name} submitted ${sub.assignmentTitle}`,
    link,
  );
}

const PROMPT_IN_TITLE = 60;

function shortPrompt(prompt: string): string {
  const flat = prompt.replace(/\s+/g, " ").trim();
  return flat.length <= PROMPT_IN_TITLE ? flat : `${flat.slice(0, PROMPT_IN_TITLE - 1).trimEnd()}…`;
}

/** One per hand-in of a returned essay, naming the essay and opening it. */
export async function notifyEssayHandedIn(essay: {
  publicId: string;
  studentUserId: number;
  seasonId: number;
  assignmentTitle: string;
  prompt: string;
}): Promise<void> {
  await notifyStudentLeaders(
    essay.studentUserId,
    essay.seasonId,
    (name) => `${name} handed in ${essay.assignmentTitle} again: ${shortPrompt(essay.prompt)}`,
    submissionReceivedLink(essay.publicId),
  );
}
