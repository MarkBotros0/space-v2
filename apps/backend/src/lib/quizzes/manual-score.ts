import type { ManualScore, ManualScoreWrite } from "@space/shared";

import { db } from "../../db/client";
import { ApiError } from "../api-error";
import { toScore } from "./score";

/**
 * The season admin's score for one student on an ONLINE quiz (plan 4): a QuizGrade row, which
 * counts instead of any in-app attempt. Refused while the student has an attempt open, checked
 * with their attempts at this quiz locked FOR UPDATE in the same transaction, so a submit or an
 * end can't slip between the check and the write.
 *
 * Returns the stored row and whether the SCORE is new or changed, the paper rule for "Your score
 * is in": a notes-only edit is written (and restamps gradedAt and gradedBy) but notifies nobody.
 * A re-save of the same score and notes writes nothing, so the row stays as it was.
 */
export async function saveManualScore(
  quizId: number,
  studentUserId: number,
  input: ManualScoreWrite,
  byId: number,
): Promise<{ scoreChanged: boolean; grade: ManualScore }> {
  return db.$transaction(async (tx) => {
    const attempts = await tx.$queryRaw<{ status: string }[]>`
      SELECT "status"::text AS "status" FROM "QuizAttempt"
      WHERE "quizId" = ${quizId} AND "studentUserId" = ${studentUserId}
      FOR UPDATE`;
    if (attempts.some((a) => a.status === "IN_PROGRESS")) {
      throw new ApiError("attempt_open", "End their attempt first.", 409);
    }

    const existing = await tx.quizGrade.findUnique({
      where: { quizId_studentUserId: { quizId, studentUserId } },
      select: { score: true, notes: true, gradedAt: true, gradedBy: { select: { id: true, name: true } } },
    });
    const scoreChanged = !existing || toScore(existing.score) !== input.score;
    // A row missing its audit columns is restamped rather than answered with blanks.
    if (!scoreChanged && existing.notes === input.notes && existing.gradedAt && existing.gradedBy) {
      const gradedAt = existing.gradedAt.toISOString();
      return { scoreChanged, grade: { score: input.score, notes: input.notes, gradedAt, gradedBy: existing.gradedBy } };
    }

    const gradedAt = new Date();
    const write = { score: input.score, notes: input.notes, gradedById: byId, gradedAt };
    await tx.quizGrade.upsert({
      where: { quizId_studentUserId: { quizId, studentUserId } },
      create: { quizId, studentUserId, ...write },
      update: write,
    });
    const gradedBy = await tx.user.findUniqueOrThrow({ where: { id: byId }, select: { id: true, name: true } });
    return {
      scoreChanged,
      grade: { score: input.score, notes: input.notes, gradedAt: gradedAt.toISOString(), gradedBy },
    };
  });
}

/** Clears the manual score; the student goes back to their best graded attempt. Clearing nothing is a no-op. */
export async function clearManualScore(quizId: number, studentUserId: number): Promise<void> {
  await db.quizGrade.deleteMany({ where: { quizId, studentUserId } });
}
