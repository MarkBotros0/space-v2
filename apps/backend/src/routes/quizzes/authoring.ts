import type { Request, Response } from "express";

import { db } from "../../db/client";
import { apiOk, apiError, forbidden } from "../../lib/api-response";
import { parseId } from "../../lib/parse-id";
import { canManageQuiz } from "../../lib/permissions";
import { isAdminOfSeason } from "../../lib/rbac";
import { requireUser } from "../../middleware/require-auth";
import { createQuizRequestSchema, updateQuizRequestSchema } from "../../../../../packages/shared/src/index";

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

  const parsed = createQuizRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid quiz body.", 400);
  const body = parsed.data;

  // R1: creating is a season-admin power. isAdminOfSeason short-circuits SUPER
  // and pairs the claim with the role that can hold it (ruling C7).
  if (!isAdminOfSeason(user, body.seasonId)) return forbidden(res);

  const season = await db.season.findFirst({
    where: { id: body.seasonId, deletedAt: null },
    select: { id: true },
  });
  if (!season) return apiError(res, "not_found", "Season not found.", 404);

  if (body.sessionId !== null) {
    // R7: v1 wrote both ids side by side and checked nothing — the pair was
    // consistent only because one component passed both from the same page.
    const session = await db.session.findUnique({
      where: { id: body.sessionId },
      select: { seasonId: true },
    });
    if (!session) return apiError(res, "not_found", "Session not found.", 404);
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
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid quiz id.", 400);

  const quiz = await db.quiz.findUnique({
    where: { id },
    select: { id: true, seasonId: true, kind: true },
  });
  if (!quiz) return apiError(res, "not_found", "Quiz not found.", 404);
  if (!(await canManageQuiz(user, id))) return forbidden(res);

  const parsed = updateQuizRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid quiz body.", 400);
  const body = parsed.data;

  if (body.maxScore !== undefined) {
    if (quiz.kind !== "PAPER") {
      return apiError(res, "wrong_quiz_kind", "An online quiz derives its max score from its questions.", 409);
    }
    const grades = await db.quizGrade.count({ where: { quizId: id } });
    if (grades > 0) {
      return apiError(res, "quiz_has_grades", "This quiz already has grades.", 409);
    }
  }

  if (body.sessionId !== undefined && body.sessionId !== null) {
    const session = await db.session.findUnique({
      where: { id: body.sessionId },
      select: { seasonId: true },
    });
    if (!session) return apiError(res, "not_found", "Session not found.", 404);
    if (session.seasonId !== quiz.seasonId) {
      return apiError(res, "session_not_in_season", "That session is in another season.", 400);
    }
  }

  await db.quiz.update({
    where: { id },
    data: {
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.maxScore !== undefined ? { maxScore: body.maxScore } : {}),
      ...(body.sessionId !== undefined ? { sessionId: body.sessionId } : {}),
    },
  });

  return apiOk(res, { updated: true });
}
