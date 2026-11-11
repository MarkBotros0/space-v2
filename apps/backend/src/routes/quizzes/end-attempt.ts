import type { Request, Response } from "express";

import { db } from "../../db/client";
import { apiError, apiOk, forbidden } from "../../lib/api-response";
import { notFound } from "../../lib/http/not-found";
import { idParam } from "../../lib/http/params";
import { parseOr400 } from "../../lib/http/validate";
import { canGradeQuiz } from "../../lib/permissions";
import { visibleStudentIdsForQuiz } from "../../lib/quiz-scope";
import { closeAttempt, closeLatestIfExpired } from "../../lib/quizzes/close-attempt";
import { SAVE_GRACE_MS } from "../../lib/quizzes/timing";
import { requireUser } from "../../middleware/require-auth";
import { endAttemptRequestSchema } from "../../../../../packages/shared/src/index";

/**
 * Staff end a student's open attempt (spec "Live screen"): it is marked like a
 * submit with what is saved, `endReason` ENDED_BY_STAFF, `endedById` the caller.
 * Gated like reopen: canGradeQuiz, and the student must be in the caller's set.
 */
export async function endAttempt(req: Request, res: Response) {
  const user = requireUser(req);
  const id = idParam(res, req.params.id, "quiz");
  if (id === null) return;

  const quiz = await db.quiz.findUnique({ where: { id }, select: { seasonId: true } });
  if (!quiz) return notFound(res, "Quiz");
  if (!(await canGradeQuiz(user, id))) return forbidden(res);

  const parsed = parseOr400(endAttemptRequestSchema, req.body, res, "Invalid body.");
  if (parsed === null) return;

  const studentIds = await visibleStudentIdsForQuiz(user, quiz.seasonId);
  if (studentIds === null || !studentIds.includes(parsed.studentUserId)) {
    return apiError(res, "student_not_in_scope", "That student is not in your groups.", 403);
  }

  // An attempt already past its deadline is closed as TIMED_OUT first, so it reads as closed here.
  await closeLatestIfExpired(id, parsed.studentUserId, SAVE_GRACE_MS);
  const latest = await db.quizAttempt.findFirst({
    where: { quizId: id, studentUserId: parsed.studentUserId },
    orderBy: { attemptNumber: "desc" },
    select: { id: true, status: true },
  });
  if (!latest) return apiError(res, "no_attempt", "That student has no attempt to end.", 409);
  if (latest.status !== "IN_PROGRESS") return apiError(res, "attempt_closed", "That attempt is already closed.", 409);

  const { closed } = await closeAttempt(latest.id, "ENDED_BY_STAFF", user.userId);
  if (!closed) return apiError(res, "attempt_closed", "That attempt is already closed.", 409);

  const after = await db.quizAttempt.findUniqueOrThrow({ where: { id: latest.id }, select: { status: true } });
  return apiOk(res, { attemptId: latest.id, status: after.status });
}
