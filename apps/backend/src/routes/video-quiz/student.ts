import type { Request, Response } from "express";

import { db } from "../../db/client";
import { apiOk, forbidden } from "../../lib/api-response";
import { hasActiveEnrollment } from "../../lib/permissions";
import { loadStudentVideoQuiz } from "../../lib/queries/video-quiz";
import { requireUser } from "../../middleware/require-auth";
import { answerVideoQuestionFor, saveVideoProgressSeconds } from "../../lib/video-quiz/answer";
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

  const data = await loadStudentVideoQuiz({ sessionId }, user.userId);
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

  // The flow (range check, replay, order gate, the race) is shared with video
  // parts; refusals arrive as ApiErrors.
  return apiOk(res, await answerVideoQuestionFor({ sessionId }, user.userId, parsed));
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
