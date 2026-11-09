import { db } from "../../db/client";

interface QuizParticipation {
  quizzesGiven: number;
  quizzesTaken: number;
  quizPct: number;
}

/**
 * One student's quizzes in one season, for their page (owner, 2026-11-07).
 *
 * Given: every published ONLINE quiz, and every PAPER quiz someone in the season
 * has been graded on (a paper quiz nobody is graded on yet has not been given).
 * Taken: an ONLINE attempt handed in (SUBMITTED or GRADED), or a PAPER grade.
 * Whether results are released does not matter: this counts who took a quiz,
 * not how they did, and it is staff-only. Not part of the score or the
 * at-risk rule.
 */
export async function quizParticipation(
  seasonId: number,
  studentUserId: number,
): Promise<QuizParticipation> {
  const quizzes = await db.quiz.findMany({
    where: {
      seasonId,
      OR: [
        { kind: "ONLINE", publishedAt: { not: null } },
        { kind: "PAPER", grades: { some: {} } },
      ],
    },
    select: {
      kind: true,
      attempts: {
        where: { studentUserId, status: { in: ["SUBMITTED", "GRADED"] } },
        select: { id: true },
        take: 1,
      },
      grades: { where: { studentUserId }, select: { id: true }, take: 1 },
    },
  });
  const quizzesGiven = quizzes.length;
  const quizzesTaken = quizzes.filter((q) =>
    q.kind === "ONLINE" ? q.attempts.length > 0 : q.grades.length > 0,
  ).length;
  const quizPct = quizzesGiven === 0 ? 0 : Math.round((quizzesTaken / quizzesGiven) * 100);
  return { quizzesGiven, quizzesTaken, quizPct };
}
