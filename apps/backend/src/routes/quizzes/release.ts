import type { Request, Response } from "express";

import { db } from "../../db/client";
import { apiError, apiOk } from "../../lib/api-response";
import { parseId } from "../../lib/parse-id";
import { isAdminOfSeason, isSuper } from "../../lib/rbac";
import { requireUser } from "../../middleware/require-auth";
import { forbidden } from "../respond";
import { notifyQuizResultsReleased } from "./notify";

/** The season's admin, or a super: the only people who release results (owner, 2026-11-07). */
export function canReleaseQuizResults(user: Parameters<typeof isSuper>[0], seasonId: number): boolean {
  return isSuper(user) || isAdminOfSeason(user, seasonId);
}

/**
 * POST /quizzes/:id/release — let students see their scores and which answers
 * were right. Until then every student read hides them, so a student taking the
 * quiz later can't learn the answers from one who took it first. One way: once
 * students have seen results there is nothing to take back. Only the request
 * that flips it notifies, so a repeat or a race stays silent.
 */
export async function releaseQuizResults(req: Request, res: Response) {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid quiz id.", 400);

  const quiz = await db.quiz.findUnique({
    where: { id },
    select: { id: true, title: true, kind: true, seasonId: true, publishedAt: true },
  });
  if (!quiz) return apiError(res, "not_found", "Quiz not found.", 404);
  if (!canReleaseQuizResults(user, quiz.seasonId)) return forbidden(res);
  if (quiz.kind === "ONLINE" && quiz.publishedAt === null) {
    return apiError(res, "quiz_not_published", "Publish the quiz before releasing its results.", 409);
  }

  const now = new Date();
  const flipped =
    (
      await db.quiz.updateMany({
        where: { id, resultsReleasedAt: null },
        data: { resultsReleasedAt: now, resultsReleasedById: user.userId },
      })
    ).count === 1;
  if (flipped) await notifyQuizResultsReleased(quiz);

  const { resultsReleasedAt } = await db.quiz.findUniqueOrThrow({
    where: { id },
    select: { resultsReleasedAt: true },
  });
  return apiOk(res, { resultsReleasedAt });
}
