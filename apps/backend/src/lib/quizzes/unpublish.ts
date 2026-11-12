import { db } from "../../db/client";
import { ApiError } from "../api-error";
import { quizHasAdminScores } from "./admin-score";

/**
 * Unpublishes a quiz (spec D4) unless a student would lose a result they can see: a GRADED attempt
 * or the admin's score (plan 4). Checked under the Quiz row FOR UPDATE, which conflicts with the
 * FOR SHARE a manual score's save takes (lib/quizzes/student-lock.ts): a save either commits first
 * and this refuses, or waits and then reads the quiz unpublished and refuses. (Marking an attempt
 * locks only the attempt row, so the graded check is a read, as it was before.)
 */
export async function unpublishQuiz(quizId: number): Promise<{ publishedAt: Date | null }> {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Quiz" WHERE "id" = ${quizId} FOR UPDATE`;
    const graded = await tx.quizAttempt.count({ where: { quizId, status: "GRADED" } });
    if (graded > 0) {
      throw new ApiError(
        "quiz_has_graded_attempts",
        "Students have graded results for this quiz; unpublishing would hide them.",
        409,
      );
    }
    if (await quizHasAdminScores(tx, quizId)) {
      throw new ApiError(
        "quiz_has_graded_attempts",
        "Students have scores for this quiz; unpublishing would hide them.",
        409,
      );
    }
    return tx.quiz.update({ where: { id: quizId }, data: { publishedAt: null }, select: { publishedAt: true } });
  });
}
