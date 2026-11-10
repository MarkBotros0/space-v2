import { db } from "../../db/client";

/**
 * Saves a paper quiz's batch of grades, all or none; the caller has validated
 * the whole batch first. A null score clears the student's row.
 */
export async function saveQuizGrades(
  quizId: number,
  entries: { studentUserId: number; score: number | null; notes: string | null }[],
  gradedById: number,
): Promise<void> {
  // One `now` for the whole batch, as v1 did (R91) — a batch is one act.
  const now = new Date();
  const writes = entries.map((entry) =>
    entry.score === null
      ? // Null CLEARS the row. v1 skipped null entries, so an existing grade
        // could never be removed — a typo was correctable, a grade against the
        // wrong student was not. deleteMany (not delete) so clearing an
        // already-absent row is a no-op rather than a P2025.
        db.quizGrade.deleteMany({ where: { quizId, studentUserId: entry.studentUserId } })
      : db.quizGrade.upsert({
          where: { quizId_studentUserId: { quizId, studentUserId: entry.studentUserId } },
          create: {
            quizId,
            studentUserId: entry.studentUserId,
            score: entry.score,
            notes: entry.notes,
            gradedById,
            gradedAt: now,
          },
          update: {
            score: entry.score,
            notes: entry.notes,
            gradedById,
            gradedAt: now,
          },
        }),
  );
  await db.$transaction(writes);
}
