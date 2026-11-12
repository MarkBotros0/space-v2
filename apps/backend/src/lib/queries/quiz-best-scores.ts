import { db } from "../../db/client";
import { ADMIN_SCORE_WHERE } from "../quizzes/admin-score";
import { bestScoreByStudent } from "../quizzes/best-attempt";
import { toScore } from "../quizzes/score";

/** The season admin's score as the staff grading list shows it (plan 4). */
type StaffAdminScore = { score: number; notes: string | null; gradedAt: Date; gradedByName: string | null };

/** Each listed student's admin score on one quiz (a QuizGrade row with a score); a student with none is absent. */
async function adminScoresFor(quizId: number, studentUserIds: number[]): Promise<Map<number, StaffAdminScore>> {
  const rows = await db.quizGrade.findMany({
    where: { quizId, studentUserId: { in: studentUserIds }, ...ADMIN_SCORE_WHERE },
    select: {
      studentUserId: true,
      score: true,
      notes: true,
      gradedAt: true,
      updatedAt: true,
      gradedBy: { select: { name: true } },
    },
  });
  return new Map(
    rows.map((r) => [
      r.studentUserId,
      {
        score: toScore(r.score) ?? 0,
        notes: r.notes,
        // The manual-score save always stamps gradedAt; a row without it falls back to its last write.
        gradedAt: r.gradedAt ?? r.updatedAt,
        gradedByName: r.gradedBy?.name ?? null,
      },
    ]),
  );
}

/**
 * Each listed student's counting score on one quiz, for the staff grading list and the grade
 * response: the admin's score when there is one (plan 4), else the best GRADED total (spec
 * "Honest accidents"). A student with neither is absent from `best`; `admin` holds the admin
 * scores themselves, and `app` each student's best GRADED total whatever the admin entered (what
 * the admin's score sheet calls "Graded in the app").
 */
export async function bestScoresFor(
  quizId: number,
  studentUserIds: number[],
): Promise<{ best: Map<number, number>; admin: Map<number, StaffAdminScore>; app: Map<number, number> }> {
  const [graded, admin] = await Promise.all([
    db.quizAttempt.findMany({
      where: { quizId, studentUserId: { in: studentUserIds }, status: "GRADED" },
      select: { studentUserId: true, status: true, totalScore: true, attemptNumber: true },
    }),
    adminScoresFor(quizId, studentUserIds),
  ]);
  const adminTotals = new Map([...admin].map(([id, a]) => [id, a.score]));
  return { best: bestScoreByStudent(graded, adminTotals), admin, app: bestScoreByStudent(graded) };
}
