import { db } from "../../db/client";
import { liveSeason } from "../db/live";
import { closeIfExpired } from "./close-attempt";
import { isExpired } from "./timing";

/**
 * The quiz whose attempt this student has open, or null (spec "Relaunch"). Timed or untimed, and a
 * reopened timed attempt not started yet counts too. An attempt past its deadline is closed first
 * (grace 0, as the student's own read of the quiz) and not reported. Only an attempt the student can
 * still work on: a published ONLINE quiz in a live ACTIVE season where they hold an ACTIVE place.
 * An attempt left open in a finished season reads as "You didn't finish this quiz", so it must
 * never hold the phone.
 */
export async function openQuizAttemptFor(studentUserId: number, now = new Date()): Promise<number | null> {
  const open = await db.quizAttempt.findMany({
    where: {
      studentUserId,
      status: "IN_PROGRESS",
      quiz: {
        kind: "ONLINE",
        publishedAt: { not: null },
        season: { ...liveSeason, status: "ACTIVE", enrollments: { some: { studentUserId, status: "ACTIVE" } } },
      },
    },
    orderBy: { id: "desc" },
    select: { id: true, quizId: true, deadlineAt: true },
  });
  for (const attempt of open) {
    if (!isExpired(attempt.deadlineAt, now)) return attempt.quizId;
    await closeIfExpired(attempt.id, now, 0);
  }
  return null;
}
