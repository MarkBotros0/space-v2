import type { ManualScoreWrite } from "@space/shared";

import { db } from "../../db/client";
import { ApiError } from "../api-error";
import { toScore } from "./score";

/**
 * The season admin's score for one student on an ONLINE quiz (plan 4): a QuizGrade row, which
 * counts instead of any in-app attempt. Refused while the student has an attempt open, checked
 * with their attempts at this quiz locked FOR UPDATE in the same transaction, so a submit or an
 * end can't slip between the check and the write. A re-save with the same score and notes
 * leaves the row untouched (gradedAt and gradedBy stay) and reports `changed: false`, so the
 * caller only notifies on a new or changed score.
 */
export async function saveManualScore(
  quizId: number,
  studentUserId: number,
  input: ManualScoreWrite,
  byId: number,
): Promise<{ changed: boolean }> {
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
      select: { score: true, notes: true },
    });
    if (existing && toScore(existing.score) === input.score && existing.notes === input.notes) {
      return { changed: false };
    }

    const write = { score: input.score, notes: input.notes, gradedById: byId, gradedAt: new Date() };
    await tx.quizGrade.upsert({
      where: { quizId_studentUserId: { quizId, studentUserId } },
      create: { quizId, studentUserId, ...write },
      update: write,
    });
    return { changed: true };
  });
}

/** Clears the manual score; the student goes back to their best graded attempt. Clearing nothing is a no-op. */
export async function clearManualScore(quizId: number, studentUserId: number): Promise<void> {
  await db.quizGrade.deleteMany({ where: { quizId, studentUserId } });
}
