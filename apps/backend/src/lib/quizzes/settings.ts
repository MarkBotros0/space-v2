import type { updateQuizRequestSchema } from "@space/shared";
import type { z } from "zod";

import { db } from "../../db/client";
import { ApiError } from "../api-error";

type QuizSettings = z.infer<typeof updateQuizRequestSchema>;
type StoredTiming = { startsFrom: Date | null; startsUntil: Date | null; timeLimitMinutes: number | null };

const toDate = (iso: string | null): Date | null => (iso === null ? null : new Date(iso));

/**
 * Writes a quiz's settings. What freezes once a student has started (shuffle,
 * the time limit; spec "Editing timing after attempts exist") is checked under
 * the Quiz row lock, which a first attempt takes FOR SHARE before it is
 * created (lib/quizzes/start-attempt.ts): no attempt can appear between the
 * check and the write. The window may change any time; its two ends are
 * checked together with the stored ones, so a one-sided edit can't cross them.
 */
export async function updateQuizSettings(quizId: number, body: QuizSettings): Promise<void> {
  await db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<StoredTiming[]>`
      SELECT "startsFrom", "startsUntil", "timeLimitMinutes" FROM "Quiz" WHERE "id" = ${quizId} FOR UPDATE`;
    const stored = rows[0];
    if (!stored) throw new ApiError("not_found", "Quiz not found.", 404);

    // Sending the limit it already has is not a change (a form that posts every field).
    const limitChanges = body.timeLimitMinutes !== undefined && body.timeLimitMinutes !== stored.timeLimitMinutes;
    if (
      (body.shuffleQuestions !== undefined || limitChanges) &&
      (await tx.quizAttempt.count({ where: { quizId } })) > 0
    ) {
      throw new ApiError(
        "quiz_has_attempts",
        "Students have started this quiz, so its settings can no longer change.",
        409,
      );
    }

    const startsFrom = body.startsFrom === undefined ? stored.startsFrom : toDate(body.startsFrom);
    const startsUntil = body.startsUntil === undefined ? stored.startsUntil : toDate(body.startsUntil);
    if (startsFrom !== null && startsUntil !== null && startsFrom.getTime() >= startsUntil.getTime()) {
      throw new ApiError("bad_request", "The quiz must stop being startable after it can first be started.", 400);
    }

    await tx.quiz.update({
      where: { id: quizId },
      data: {
        ...(body.shuffleQuestions !== undefined ? { shuffleQuestions: body.shuffleQuestions } : {}),
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.maxScore !== undefined ? { maxScore: body.maxScore } : {}),
        ...(body.sessionId !== undefined ? { sessionId: body.sessionId } : {}),
        ...(body.startsFrom !== undefined ? { startsFrom } : {}),
        ...(body.startsUntil !== undefined ? { startsUntil } : {}),
        ...(body.timeLimitMinutes !== undefined ? { timeLimitMinutes: body.timeLimitMinutes } : {}),
      },
    });
  });
}
