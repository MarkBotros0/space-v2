import type { Request, Response } from "express";

import { db } from "../../db/client";
import { apiOk, apiError, forbidden } from "../../lib/api-response";
import { canManageQuiz } from "../../lib/permissions";
import { isAdminOfSeason } from "../../lib/rbac";
import { requireUser } from "../../middleware/require-auth";
import { findLiveSeason } from "../../lib/queries/seasons";
import { createQuizRequestSchema, updateQuizRequestSchema } from "../../../../../packages/shared/src/index";
import { updateQuizSettings } from "../../lib/quizzes/settings";
import { idParam } from "../../lib/http/params";
import { notFound } from "../../lib/http/not-found";
import { parseOr400 } from "../../lib/http/validate";

/**
 * Create a quiz.
 *
 * POST /api/v1/quizzes with seasonId in the BODY, not
 * POST /api/v1/seasons/:id/quizzes. Every quiz route lives in this one file, so
 * creation cannot hang off the seasons router — the same recorded deviation
 * Plan 3 made for POST /api/v1/sessions, for the same file-disjointness reason.
 * Do not "fix" it back to a nested path without moving the whole domain.
 */
export async function createQuiz(req: Request, res: Response) {
  const user = requireUser(req);

  const parsed = parseOr400(createQuizRequestSchema, req.body, res, "Invalid quiz body.");
  if (parsed === null) return;
  const body = parsed;

  // R1: creating is a season-admin power. isAdminOfSeason short-circuits SUPER
  // and pairs the claim with the role that can hold it (ruling C7).
  if (!isAdminOfSeason(user, body.seasonId)) return forbidden(res);

  const season = await findLiveSeason(body.seasonId, { id: true });
  if (!season) return notFound(res, "Season");

  if (body.sessionId !== null) {
    // R7: v1 wrote both ids side by side and checked nothing — the pair was
    // consistent only because one component passed both from the same page.
    const session = await db.session.findUnique({
      where: { id: body.sessionId },
      select: { seasonId: true },
    });
    if (!session) return notFound(res, "Session");
    if (session.seasonId !== body.seasonId) {
      return apiError(res, "session_not_in_season", "That session is in another season.", 400);
    }
  }

  const quiz = await db.quiz.create({
    data: {
      seasonId: body.seasonId,
      sessionId: body.sessionId,
      title: body.title,
      kind: body.kind,
      // PAPER: the author's number. ONLINE: 0, then derived from question points
      // on every question write (R4, R11).
      maxScore: body.kind === "PAPER" ? (body.maxScore as number) : 0,
      createdById: user.userId,
    },
    select: { id: true },
  });

  return apiOk(res, { id: quiz.id }, 201);
}

export async function updateQuiz(req: Request, res: Response) {
  const user = requireUser(req);
  const id = idParam(res, req.params.id, "quiz");
  if (id === null) return;

  const quiz = await db.quiz.findUnique({
    where: { id },
    select: { id: true, seasonId: true, kind: true },
  });
  if (!quiz) return notFound(res, "Quiz");
  if (!(await canManageQuiz(user, id))) return forbidden(res);

  const parsed = parseOr400(updateQuizRequestSchema, req.body, res, "Invalid quiz body.");
  if (parsed === null) return;
  const body = parsed;

  // "No grades yet" for a paper max change is checked under the Quiz lock (updateQuizSettings).
  if (body.maxScore !== undefined && quiz.kind !== "PAPER") {
    return apiError(res, "wrong_quiz_kind", "An online quiz derives its max score from its questions.", 409);
  }

  if (body.sessionId !== undefined && body.sessionId !== null) {
    const session = await db.session.findUnique({
      where: { id: body.sessionId },
      select: { seasonId: true },
    });
    if (!session) return notFound(res, "Session");
    if (session.seasonId !== quiz.seasonId) {
      return apiError(res, "session_not_in_season", "That session is in another season.", 400);
    }
  }

  const timing = body.startsFrom !== undefined || body.startsUntil !== undefined || body.timeLimitMinutes !== undefined;
  if (timing && quiz.kind !== "ONLINE") {
    return apiError(res, "wrong_quiz_kind", "Only an online quiz has a start window or a time limit.", 409);
  }

  // The freeze checks (shuffle, time limit, a paper max once graded) and the write share one Quiz row lock.
  await updateQuizSettings(id, body);

  return apiOk(res, { updated: true });
}
