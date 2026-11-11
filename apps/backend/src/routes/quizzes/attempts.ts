import type { Request, Response } from "express";

import { db } from "../../db/client";
import { apiOk, apiError, forbidden } from "../../lib/api-response";
import type { SessionUser } from "../../lib/auth/tokens";
import { hasActiveEnrollment } from "../../lib/permissions";
import { isAlumnusNotStudying } from "../../lib/rbac";
import { requireUser } from "../../middleware/require-auth";
import { answerRefusal, saveAnswers, submitAnswers } from "../../lib/quizzes/attempts";
import { saveQuizAnswersRequestSchema } from "../../../../../packages/shared/src/index";
import { MARKABLE_QUESTION_SELECT, toMarkable } from "../../lib/quizzes/marking";
import { notifyQuizGraded } from "../../lib/quizzes/notify";
import { closeLatestIfExpired } from "../../lib/quizzes/close-attempt";
import { createFirstAttempt, startClockIfUnset } from "../../lib/quizzes/start-attempt";
import { SAVE_GRACE_MS } from "../../lib/quizzes/timing";
import { loadStudentQuizDetail } from "./student-detail";
import { idParam } from "../../lib/http/params";
import { notFound } from "../../lib/http/not-found";
import { parseOr400 } from "../../lib/http/validate";

/**
 * Whether this student may WRITE an attempt in the quiz's season.
 *
 * Deliberately stricter than `canAccessSeason`, whose student branch accepts
 * any enrolment row: a dropped or completed student, or an alumnus who isn't
 * studying (read-only, see `isAlumnus`), must not start, save or submit an
 * attempt in a season they no longer have a live place in. Same rule video-quiz
 * and check-in already apply (`hasActiveEnrollment`).
 */
async function canTakeQuizIn(user: SessionUser, seasonId: number): Promise<boolean> {
  if (isAlumnusNotStudying(user)) return false;
  return hasActiveEnrollment(user, seasonId);
}

/** Load the quiz and apply the enrolment gate, or answer and return null. */
async function loadTakeableQuiz(res: Response, user: SessionUser, quizId: number) {
  const quiz = await db.quiz.findUnique({
    where: { id: quizId },
    select: { title: true, seasonId: true },
  });
  if (!quiz) {
    notFound(res, "Quiz");
    return null;
  }
  if (!(await canTakeQuizIn(user, quiz.seasonId))) {
    forbidden(res);
    return null;
  }
  return quiz;
}

/**
 * Start or resume this student's attempt.
 *
 * PUT, and idempotent, for the reason ruling C6 gives and Plan 1's
 * PUT /submissions/by-assignment/:id already demonstrates: a screen that
 * remounts, or React Query refetching on focus, must not produce a second row.
 * The attempt is addressed by QUIZ, never by attempt id — there is at most one
 * live attempt per (quiz, student) and the server can always find it, which
 * removes both the client's attemptId bookkeeping and the need for ownership to
 * be the only gate (v1's saveQuizAnswerAction had no role check at all and
 * compared user ids; here the id comes from the token and is never in the URL).
 */
export async function startAttempt(req: Request, res: Response) {
  const user = requireUser(req);
  const id = idParam(res, req.params.id, "quiz");
  if (id === null) return;

  // R41: only a student has an attempt of their own.
  if (user.role !== "STUDENT") {
    return apiError(res, "forbidden", "Only a student can take a quiz.", 403);
  }

  const quiz = await db.quiz.findUnique({
    where: { id },
    select: { seasonId: true, kind: true, publishedAt: true, timeLimitMinutes: true },
  });
  if (!quiz) return notFound(res, "Quiz");
  if (quiz.kind !== "ONLINE" || quiz.publishedAt === null) {
    return apiError(res, "quiz_not_published", "This quiz is not available.", 409);
  }
  if (!(await canTakeQuizIn(user, quiz.seasonId))) return forbidden(res);

  // A read: no grace. An expired attempt is closed and then reads as submitted.
  await closeLatestIfExpired(id, user.userId, 0);

  const latest = await db.quizAttempt.findFirst({
    where: { quizId: id, studentUserId: user.userId },
    orderBy: { attemptNumber: "desc" },
    select: { id: true, status: true },
  });

  if (latest && latest.status !== "IN_PROGRESS") {
    // R45: one attempt per student per quiz; a retake needs staff (see Task 5).
    return apiError(res, "attempt_closed", "You've already submitted this quiz. Ask your leader to reopen it.", 409);
  }

  // The start window is checked here, on attempt 1 only; a reopened attempt
  // just starts its clock (spec "Timing": the window doesn't block a reopen).
  if (latest) await startClockIfUnset(latest.id, quiz.timeLimitMinutes);
  else await createFirstAttempt(id, user.userId);

  const detail = await loadStudentQuizDetail(id, user.userId, false);
  if (!detail) return notFound(res, "Quiz");
  return apiOk(res, detail);
}

/** Resolve the caller's live attempt, or answer and return null. */
async function resolveOpenAttempt(res: Response, quizId: number, studentUserId: number) {
  const attempt = await db.quizAttempt.findFirst({
    where: { quizId, studentUserId },
    orderBy: { attemptNumber: "desc" },
    select: { id: true, status: true },
  });
  if (!attempt) {
    apiError(res, "no_attempt", "Start the quiz before saving answers.", 409);
    return null;
  }
  if (attempt.status !== "IN_PROGRESS") {
    apiError(res, "attempt_closed", "This attempt is closed.", 409);
    return null;
  }
  return attempt;
}

export async function saveAttemptAnswers(req: Request, res: Response) {
  const user = requireUser(req);
  const id = idParam(res, req.params.id, "quiz");
  if (id === null) return;
  if (user.role !== "STUDENT") {
    return apiError(res, "forbidden", "Only a student can take a quiz.", 403);
  }

  const parsed = parseOr400(saveQuizAnswersRequestSchema, req.body, res, "Invalid answers.");
  if (parsed === null) return;

  if (!(await loadTakeableQuiz(res, user, id))) return undefined;

  // A write: the save grace, so a save in flight at the deadline still lands.
  await closeLatestIfExpired(id, user.userId, SAVE_GRACE_MS);
  const attempt = await resolveOpenAttempt(res, id, user.userId);
  if (!attempt) return undefined;

  // Loads the key server-side to count "Choose N"; nothing of it is answered.
  const questions = await db.quizQuestion.findMany({ where: { quizId: id }, select: MARKABLE_QUESTION_SELECT });
  const byId = new Map(questions.map((q) => [q.id, toMarkable(q)]));

  const refusal = answerRefusal(byId, parsed.answers);
  if (refusal) return apiError(res, refusal.code, refusal.message, 400);

  await saveAnswers(attempt.id, parsed.answers);

  return apiOk(res, { saved: parsed.answers.length });
}

export async function submitAttempt(req: Request, res: Response) {
  const user = requireUser(req);
  const id = idParam(res, req.params.id, "quiz");
  if (id === null) return;
  if (user.role !== "STUDENT") {
    return apiError(res, "forbidden", "Only a student can take a quiz.", 403);
  }

  const quiz = await loadTakeableQuiz(res, user, id);
  if (!quiz) return undefined;

  // Past the deadline (+ grace) the attempt is closed with what's saved, and this submit is attempt_closed.
  await closeLatestIfExpired(id, user.userId, SAVE_GRACE_MS);
  const attempt = await resolveOpenAttempt(res, id, user.userId);
  if (!attempt) return undefined;

  const { graded } = await submitAnswers(id, attempt.id);

  // The score shows as soon as the attempt is GRADED, answers released or not
  // (spec "What students see"), so the student hears now.
  if (graded) {
    // Best-effort, outside the transaction (spec D6). A mail failure must not
    // report a submitted quiz as failed.
    await notifyQuizGraded([user.userId], quiz.title);
  }

  const detail = await loadStudentQuizDetail(id, user.userId, false);
  if (!detail) return notFound(res, "Quiz");
  return apiOk(res, detail);
}
