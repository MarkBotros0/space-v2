import { db } from "../../db/client";
import { ApiError } from "../api-error";
import { newShuffleSeed } from "./shuffle";
import { hasAdminScore } from "./admin-score";
import { lockStudentInQuiz } from "./student-lock";

/**
 * A retake: a NEW attempt after the student's latest (R81, the previous one and its answers stay
 * intact), with its own shuffle. deadlineAt stays null: its fresh time limit starts when the
 * student opens it (lib/quizzes/start-attempt.ts).
 *
 * Refused once the admin has entered the student's score (plan 4), checked under the lock order
 * the admin's score save takes (lib/quizzes/student-lock.ts: Quiz, the student's User row, then
 * the attempts), so a save and a reopen never interleave. Also refused with no attempt to reopen,
 * or one still open.
 */
export async function reopenAttemptFor(
  quizId: number,
  studentUserId: number,
): Promise<{ id: number; attemptNumber: number }> {
  return db.$transaction(async (tx) => {
    const quiz = await lockStudentInQuiz(tx, quizId, studentUserId);
    if (!quiz) throw new ApiError("not_found", "Quiz not found.", 404);
    if (await hasAdminScore(tx, quizId, studentUserId)) {
      throw new ApiError(
        "manual_score_entered",
        "The admin has entered this student's score. Clear it to allow a retake.",
        409,
      );
    }
    const latest = await tx.quizAttempt.findFirst({
      where: { quizId, studentUserId },
      orderBy: { attemptNumber: "desc" },
      select: { attemptNumber: true, status: true },
    });
    if (!latest) throw new ApiError("no_attempt", "That student has no attempt to reopen.", 409);
    if (latest.status === "IN_PROGRESS") {
      throw new ApiError("attempt_open", "That student already has an attempt open.", 409);
    }
    return tx.quizAttempt.create({
      data: { quizId, studentUserId, attemptNumber: latest.attemptNumber + 1, shuffleSeed: newShuffleSeed() },
      select: { id: true, attemptNumber: true },
    });
  });
}
