import type { ManualScore, ManualScoreWrite } from "@space/shared";

import { db } from "../../db/client";
import type { Prisma } from "../../generated/prisma/client";
import { ApiError } from "../api-error";
import { lockSeason } from "../roles";
import { isSeasonFinished } from "../seasons/status";
import { toScore } from "./score";
import { lockStudentInQuiz } from "./student-lock";

/** Whose score, on which quiz; the season is the quiz's, passed so it can be locked first. */
type ManualScoreTarget = { quizId: number; seasonId: number; studentUserId: number };

/**
 * The locks a save and a clear both take, in one order: the Season FOR SHARE (End takes it FOR NO
 * KEY UPDATE, so a save or clear lands wholly before End's blocker check or sees the season
 * finished), then lockStudentInQuiz's Quiz and User. A finished season never reopens, so its
 * scores can't change (docs/rules/community-model.md). Returns the locked quiz.
 */
async function lockForScore(tx: Prisma.TransactionClient, { quizId, seasonId, studentUserId }: ManualScoreTarget) {
  await lockSeason(tx, seasonId, "share");
  const season = await tx.season.findUnique({ where: { id: seasonId }, select: { status: true } });
  if (season && isSeasonFinished(season.status)) {
    throw new ApiError("season_finished", "This season has ended; its scores can't change.", 409);
  }
  const quiz = await lockStudentInQuiz(tx, quizId, studentUserId);
  if (!quiz) throw new ApiError("not_found", "Quiz not found.", 404);
  return quiz;
}

/**
 * The season admin's score for one student on an ONLINE quiz (plan 4): a QuizGrade row, which
 * counts instead of any in-app attempt. Refused on a finished season and on an unpublished quiz,
 * both read under the locks. Lock order: the Season FOR SHARE (lockForScore), then the one a start
 * and a reopen take (lib/quizzes/student-lock.ts): the Quiz row FOR SHARE, so an unpublish can't
 * land between the publishedAt check and the write, and so a question edit can't drop maxScore below
 * this score (the bound is checked here, under it); the student's User row, so a start racing
 * this save either commits its attempt first (and this save sees it) or waits and then sees
 * this row and refuses; then their attempts at this quiz FOR UPDATE, so a submit or an end can't
 * slip between the open-attempt check and the write.
 *
 * Returns the stored row and whether the SCORE is new or changed, the paper rule for "Your score
 * is in": a notes-only edit is written (and restamps gradedAt and gradedBy) but notifies nobody.
 * A re-save of the same score and notes writes nothing, so the row stays as it was.
 */
export async function saveManualScore(
  target: ManualScoreTarget,
  input: ManualScoreWrite,
  byId: number,
): Promise<{ scoreChanged: boolean; grade: ManualScore }> {
  const { quizId, studentUserId } = target;
  return db.$transaction(async (tx) => {
    const quiz = await lockForScore(tx, target);
    if (quiz.publishedAt === null) {
      throw new ApiError("quiz_not_published", "Publish the quiz before entering a score.", 409);
    }
    if (input.score > quiz.maxScore) {
      throw new ApiError("score_exceeds_max", `This quiz is out of ${quiz.maxScore}.`, 400);
    }
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

/**
 * Clears the manual score; the student goes back to their best graded attempt. Clearing nothing
 * is a no-op. Under the save's locks, so it can't land during End (End would then keep a SUBMITTED
 * attempt it had dropped from the blockers); refused on a finished season, allowed unpublished.
 */
export async function clearManualScore(target: ManualScoreTarget): Promise<void> {
  await db.$transaction(async (tx) => {
    await lockForScore(tx, target);
    await tx.quizGrade.deleteMany({ where: { quizId: target.quizId, studentUserId: target.studentUserId } });
  });
}
