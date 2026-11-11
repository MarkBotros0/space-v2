import type { Request, Response } from "express";

import { db } from "../../db/client";
import { apiError, apiOk } from "../../lib/api-response";
import { idParam } from "../../lib/http/params";
import { parseOr400 } from "../../lib/http/validate";
import { recordAttemptEvents } from "../../lib/quizzes/attempt-events";
import { closeLatestIfExpired } from "../../lib/quizzes/close-attempt";
import { SAVE_GRACE_MS } from "../../lib/quizzes/timing";
import { requireUser } from "../../middleware/require-auth";
import { quizAttemptEventsRequestSchema } from "../../../../../packages/shared/src/index";
import { loadTakeableQuiz } from "./attempts";

/**
 * The phone reports what it saw while the student's attempt was open (spec
 * "Leaving the quiz"). Gated like a save: a student, an active place in the
 * season, their own latest attempt, addressed by quiz. The answer is the
 * server's count; it carries nothing of the questions or answers.
 */
export async function postAttemptEvents(req: Request, res: Response) {
  const user = requireUser(req);
  const id = idParam(res, req.params.id, "quiz");
  if (id === null) return;
  if (user.role !== "STUDENT") {
    return apiError(res, "forbidden", "Only a student can take a quiz.", 403);
  }

  const parsed = parseOr400(quizAttemptEventsRequestSchema, req.body, res, "Invalid events.");
  if (parsed === null) return;

  const quiz = await loadTakeableQuiz(res, user, id);
  if (!quiz) return undefined;

  // A write, like a save: an attempt past its deadline (+ grace) closes TIMED_OUT first,
  // and the report then lands on a closed attempt, which ignores it.
  await closeLatestIfExpired(id, user.userId, SAVE_GRACE_MS);
  const attempt = await db.quizAttempt.findFirst({
    where: { quizId: id, studentUserId: user.userId },
    orderBy: { attemptNumber: "desc" },
    select: { id: true },
  });
  if (!attempt) return apiError(res, "no_attempt", "Start the quiz first.", 409);

  // Events the phone queued for an older attempt (replayed onto a retake) aren't this
  // attempt's: dropped, and the answer reflects the latest attempt.
  const events = parsed.attemptId === attempt.id ? parsed.events : [];
  const { exits, ended } = await recordAttemptEvents(attempt.id, events);
  const after = await db.quizAttempt.findUniqueOrThrow({ where: { id: attempt.id }, select: { status: true } });
  return apiOk(res, { exits, ended, status: after.status });
}
