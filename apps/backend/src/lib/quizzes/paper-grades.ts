import { db } from "../../db/client";
import { lockSeasonForStaffWrite } from "../seasons/staff-write-lock";

/**
 * Saves a paper quiz's batch of grades, all or none; the caller has validated
 * the whole batch first. A null score clears the student's row. The season is
 * locked first (`lockSeasonForStaffWrite`), so a grade and End never
 * interleave: it counts towards End's scores or waits and finds it ended.
 */
export async function saveQuizGrades(
  quizId: number,
  entries: { studentUserId: number; score: number | null; notes: string | null }[],
  gradedById: number,
  season: { id: number; mayWriteFinished: boolean },
): Promise<void> {
  // One `now` for the whole batch, as v1 did (R91) — a batch is one act.
  const now = new Date();
  await db.$transaction(async (tx) => {
    await lockSeasonForStaffWrite(tx, season.id, season.mayWriteFinished);
    for (const entry of entries) {
      if (entry.score === null) {
        // Null CLEARS the row. v1 skipped null entries, so an existing grade
        // could never be removed — a typo was correctable, a grade against the
        // wrong student was not. deleteMany (not delete) so clearing an
        // already-absent row is a no-op rather than a P2025.
        await tx.quizGrade.deleteMany({ where: { quizId, studentUserId: entry.studentUserId } });
        continue;
      }
      const graded = { score: entry.score, notes: entry.notes, gradedById, gradedAt: now };
      await tx.quizGrade.upsert({
        where: { quizId_studentUserId: { quizId, studentUserId: entry.studentUserId } },
        create: { quizId, studentUserId: entry.studentUserId, ...graded },
        update: graded,
      });
    }
  });
}
