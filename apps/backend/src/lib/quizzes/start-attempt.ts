import { db } from "../../db/client";
import { ApiError } from "../api-error";
import { formatInOrgTime } from "../org-time";
import { newShuffleSeed } from "./shuffle";
import { hasAdminScore, lockStudentInQuiz } from "./student-lock";
import { canStartNow, deadlineFor } from "./timing";

/** The student's copy when the admin has entered their score (plan 4): taking it is blocked. */
function manualScoreEntered(): ApiError {
  return new ApiError("manual_score_entered", "Your admin has entered your score for this quiz.", 409);
}

/**
 * A student's FIRST attempt at a quiz: refused outside the start window, refused
 * once the admin has entered their score, and timed from now when the quiz has a
 * limit. Lock order (lib/quizzes/student-lock.ts): the Quiz row FOR SHARE, so a
 * settings edit (FOR UPDATE, lib/quizzes/settings.ts) can't freeze the limit
 * between this read and the create; then the student's User row, which the
 * admin's score save takes too, so the QuizGrade read below sees a score saved
 * first and a save made after waits for this attempt; then the attempt. A retake
 * is never created here (staff reopen it), so the window never blocks one.
 *
 * A real upsert on the natural unique key, not v1's read-then-create with no
 * transaction (R119/D15): two concurrent opens both saw no attempt, both
 * created attemptNumber 1, and the loser got a raw Prisma error.
 */
export async function createFirstAttempt(quizId: number, studentUserId: number, now = new Date()): Promise<void> {
  await db.$transaction(async (tx) => {
    const quiz = await lockStudentInQuiz(tx, quizId, studentUserId);
    if (!quiz) throw new ApiError("not_found", "Quiz not found.", 404);
    if (await hasAdminScore(tx, quizId, studentUserId)) throw manualScoreEntered();

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
 * Opens an open attempt for the student (the start PUT on a reopened attempt, or
 * a resume): refused once the admin has entered their score, and starts the clock
 * on an attempt that has none yet, so a reopened attempt gets a fresh limit when
 * the student opens it, not when staff reopen it. Only a null deadline is set, so
 * re-opening never moves it. Same lock order as the first start
 * (lib/quizzes/student-lock.ts): Quiz, the student's User row, then the attempt.
 */
export async function startClockIfUnset(
  quizId: number,
  studentUserId: number,
  attemptId: number,
  now = new Date(),
): Promise<void> {
  await db.$transaction(async (tx) => {
    const quiz = await lockStudentInQuiz(tx, quizId, studentUserId);
    if (!quiz) throw new ApiError("not_found", "Quiz not found.", 404);
    if (await hasAdminScore(tx, quizId, studentUserId)) throw manualScoreEntered();
    const deadlineAt = deadlineFor(now, quiz.timeLimitMinutes);
    if (deadlineAt === null) return;
    await tx.quizAttempt.updateMany({
      where: { id: attemptId, status: "IN_PROGRESS", deadlineAt: null },
      data: { deadlineAt },
    });
  });
}
