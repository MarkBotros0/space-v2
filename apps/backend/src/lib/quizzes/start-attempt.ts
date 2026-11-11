import { db } from "../../db/client";
import { ApiError } from "../api-error";
import { formatInOrgTime } from "../org-time";
import { newShuffleSeed } from "./shuffle";
import { canStartNow, deadlineFor } from "./timing";

type QuizTiming = { startsFrom: Date | null; startsUntil: Date | null; timeLimitMinutes: number | null };

/**
 * A student's FIRST attempt at a quiz: refused outside the start window, and
 * timed from now when the quiz has a limit. The Quiz row is read FOR SHARE, so
 * a settings edit (which takes it FOR UPDATE, lib/quizzes/settings.ts) can't
 * freeze the limit between this read and the create. Lock order: Quiz, then
 * the attempt. A retake is never created here (staff reopen it), so the window
 * never blocks one.
 *
 * A real upsert on the natural unique key, not v1's read-then-create with no
 * transaction (R119/D15): two concurrent opens both saw no attempt, both
 * created attemptNumber 1, and the loser got a raw Prisma error.
 */
export async function createFirstAttempt(quizId: number, studentUserId: number, now = new Date()): Promise<void> {
  await db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<QuizTiming[]>`
      SELECT "startsFrom", "startsUntil", "timeLimitMinutes" FROM "Quiz" WHERE "id" = ${quizId} FOR SHARE`;
    const quiz = rows[0];
    if (!quiz) throw new ApiError("not_found", "Quiz not found.", 404);

    const verdict = canStartNow(quiz, now);
    if (verdict === "not_yet" && quiz.startsFrom !== null) {
      throw new ApiError("quiz_not_open_yet", `This quiz opens at ${formatInOrgTime(quiz.startsFrom)}.`, 409);
    }
    if (verdict === "closed") {
      throw new ApiError("quiz_start_closed", "The time to start this quiz has passed.", 409);
    }

    await tx.quizAttempt.upsert({
      where: { quizId_studentUserId_attemptNumber: { quizId, studentUserId, attemptNumber: 1 } },
      // Empty update: the point is to return the existing row untouched.
      update: {},
      // The seed fixes this attempt's question and option order for its whole life.
      create: {
        quizId,
        studentUserId,
        attemptNumber: 1,
        shuffleSeed: newShuffleSeed(),
        deadlineAt: deadlineFor(now, quiz.timeLimitMinutes),
      },
      select: { id: true },
    });
  });
}

/**
 * Starts the clock on an open attempt that has none yet: a reopened attempt
 * gets a fresh limit when the student opens it, not when staff reopen it. Only
 * a null deadline is set, so re-opening never moves it.
 */
export async function startClockIfUnset(attemptId: number, timeLimitMinutes: number | null, now = new Date()) {
  const deadlineAt = deadlineFor(now, timeLimitMinutes);
  if (deadlineAt === null) return;
  await db.quizAttempt.updateMany({
    where: { id: attemptId, status: "IN_PROGRESS", deadlineAt: null },
    data: { deadlineAt },
  });
}
