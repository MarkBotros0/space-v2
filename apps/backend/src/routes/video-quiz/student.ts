import type { Request, Response } from "express";

import { db } from "../../db/client";
import { apiError, apiOk, forbidden } from "../../lib/api-response";
import { hasActiveEnrollment } from "../../lib/permissions";
import { isUniqueViolation } from "../../lib/prisma-errors";
import { loadStudentVideoQuiz } from "../../lib/queries/video-quiz";
import { requireUser } from "../../middleware/require-auth";
import { recordVideoAnswer, saveVideoProgressSeconds } from "../../lib/video-quiz/answer";
import { submitVideoAnswerRequestSchema, videoProgressRequestSchema } from "../../../../../packages/shared/src/index";
import { idParam } from "../../lib/http/params";
import { notFound } from "../../lib/http/not-found";
import { parseOr400 } from "../../lib/http/validate";

/**
 * The student gate, in one place: STUDENT role, session exists, ACTIVE
 * enrolment in its season. Returns the session's seasonId, or null after
 * having already answered the request.
 */
async function requireStudentOnSession(
  req: Request,
  res: Response,
  sessionId: number,
): Promise<{ seasonId: number } | null> {
  const user = requireUser(req);
  const session = await db.session.findUnique({
    where: { id: sessionId },
    select: { seasonId: true },
  });
  if (!session) {
    notFound(res, "Session");
    return null;
  }
  // Role first, then enrolment. v1 looked the question up before checking the
  // role, which let any authenticated caller tell an existing question id from
  // a missing one (spec 13 R52).
  if (!(await hasActiveEnrollment(user, session.seasonId))) {
    forbidden(res);
    return null;
  }
  return session;
}

export async function getVideoQuiz(req: Request, res: Response) {
  const user = requireUser(req);
  const sessionId = idParam(res, req.params.id, "session");
  if (sessionId === null) return;

  const gate = await requireStudentOnSession(req, res, sessionId);
  if (gate === null) return undefined;

  const data = await loadStudentVideoQuiz(sessionId, user.userId);
  if (data === null) return notFound(res, "Session");

  return apiOk(res, {
    videoId: data.videoId,
    youtubeUrl: data.youtubeUrl,
    questions: data.questions,
    furthestSeconds: data.furthestSeconds,
    completedAt: data.completedAt,
    earnedPoints: data.earnedPoints,
    totalPoints: data.totalPoints,
    answeredCount: data.answeredCount,
    nextQuestionId: data.nextQuestionId,
  });
}

export async function answerVideoQuestion(req: Request, res: Response) {
  const user = requireUser(req);
  const sessionId = idParam(res, req.params.id, "session");
  if (sessionId === null) return;

  const gate = await requireStudentOnSession(req, res, sessionId);
  if (gate === null) return undefined;

  const parsed = parseOr400(submitVideoAnswerRequestSchema, req.body, res, "Invalid answer.");
  if (parsed === null) return;
  const body = parsed;

  // Scoping the lookup by sessionId is what makes a mismatched pair a 404
  // rather than a silent success (spec 13 §7).
  const question = await db.sessionVideoQuestion.findFirst({
    where: { id: body.questionId, sessionId },
    select: { id: true, atSeconds: true, options: true, correctIndex: true },
  });
  if (!question) return notFound(res, "Question");

  // Range from the row, never from the client (v1 R53).
  if (body.selectedIndex >= question.options.length) {
    return apiError(res, "invalid_answer", "That is not one of the options.", 400);
  }

  const data = await loadStudentVideoQuiz(sessionId, user.userId);
  if (data === null) return notFound(res, "Session");

  // Replay before ordering: re-answering an earlier question must replay the
  // recorded verdict, not 409.
  const existing = await db.sessionVideoQuestionResponse.findUnique({
    where: {
      questionId_studentUserId: { questionId: question.id, studentUserId: user.userId },
    },
    select: { isCorrect: true },
  });
  if (existing) {
    return apiOk(res, {
      isCorrect: existing.isCorrect,
      correctIndex: question.correctIndex,
      furthestSeconds: data.furthestSeconds,
      completedAt: data.completedAt,
      nextQuestionId: data.nextQuestionId,
    });
  }

  // The ordering gate (D-13.2): only the earliest unanswered question.
  if (data.nextQuestionId !== question.id) {
    return apiError(res, "out_of_order", "Answer the earlier questions first.", 409);
  }

  const isCorrect = body.selectedIndex === question.correctIndex;
  const isLast = data.answeredCount + 1 === data.questions.length;

  let progress: { furthestSeconds: number; completedAt: Date | null };
  try {
    progress = await recordVideoAnswer({
      sessionId,
      studentUserId: user.userId,
      question,
      selectedIndex: body.selectedIndex,
      isCorrect,
      isLast,
    });
  } catch (err) {
    // The unique index on (questionId, studentUserId) IS the "one answer, no
    // retries" rule. A double tap losing that race must read as the answer it
    // already recorded, not as a 500 (spec 13 §10 D14).
    if (isUniqueViolation(err)) {
      const recorded = await db.sessionVideoQuestionResponse.findUnique({
        where: {
          questionId_studentUserId: { questionId: question.id, studentUserId: user.userId },
        },
        select: { isCorrect: true },
      });
      const after = await loadStudentVideoQuiz(sessionId, user.userId);
      return apiOk(res, {
        isCorrect: recorded?.isCorrect ?? isCorrect,
        correctIndex: question.correctIndex,
        furthestSeconds: after?.furthestSeconds ?? 0,
        completedAt: after?.completedAt ?? null,
        nextQuestionId: after?.nextQuestionId ?? null,
      });
    }
    throw err;
  }

  // The id after this one in the ordered list, or null when this was the last.
  const index = data.questions.findIndex((q) => q.id === question.id);
  const nextQuestionId = isLast ? null : (data.questions[index + 1]?.id ?? null);

  // `correctIndex` here is the only path by which the answer key reaches a
  // student, and only for the question they just answered — safe because the
  // first answer is final.
  return apiOk(res, {
    isCorrect,
    correctIndex: question.correctIndex,
    furthestSeconds: progress.furthestSeconds,
    completedAt: progress.completedAt,
    nextQuestionId,
  });
}

export async function saveVideoProgress(req: Request, res: Response) {
  const user = requireUser(req);
  const sessionId = idParam(res, req.params.id, "session");
  if (sessionId === null) return;

  const gate = await requireStudentOnSession(req, res, sessionId);
  if (gate === null) return undefined;

  const parsed = parseOr400(videoProgressRequestSchema, req.body, res, "Invalid progress.");
  if (parsed === null) return;

  // PUT, not PATCH: the write is idempotent and monotone, so repeating it with
  // the same value is a no-op — which matters under React Query's
  // refetch-on-focus behaviour. Read-then-write inside a transaction, because
  // v1 did it outside one and two concurrent saves (visibilitychange and
  // unmount fire together) could persist the lower value (spec 13 R64).
  const progress = await saveVideoProgressSeconds(sessionId, user.userId, parsed.furthestSeconds);

  return apiOk(res, progress);
}
