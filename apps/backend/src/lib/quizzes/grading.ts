import { db } from "../../db/client";

/**
 * Records an attempt's essay marks and its new totals, all or none, and marks
 * it GRADED by the caller. autoScore is trusted as stored and never recomputed
 * (R73); the caller has checked every essay is marked once, within its points.
 */
export async function recordEssayGrades(
  attemptId: number,
  awards: { questionId: number; points: number }[],
  scores: { manualScore: number; totalScore: number },
  gradedById: number,
  gradedAt: Date,
): Promise<void> {
  await db.$transaction([
    ...awards.map((award) =>
      db.quizAnswer.update({
        where: { attemptId_questionId: { attemptId, questionId: award.questionId } },
        data: { pointsAwarded: award.points },
      }),
    ),
    db.quizAttempt.update({
      where: { id: attemptId },
      data: { ...scores, status: "GRADED", gradedById, gradedAt },
    }),
  ]);
}
