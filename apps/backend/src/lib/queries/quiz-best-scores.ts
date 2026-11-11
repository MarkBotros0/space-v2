import { db } from "../../db/client";
import { bestScoreByStudent } from "../quizzes/best-attempt";

/**
 * Each listed student's best GRADED total on one quiz (spec "Honest
 * accidents"), for the staff grading list and the grade response. A student
 * with nothing graded is absent from the map.
 */
export async function bestScoresFor(quizId: number, studentUserIds: number[]): Promise<Map<number, number>> {
  const graded = await db.quizAttempt.findMany({
    where: { quizId, studentUserId: { in: studentUserIds }, status: "GRADED" },
    select: { studentUserId: true, status: true, totalScore: true, attemptNumber: true },
  });
  return bestScoreByStudent(graded);
}
