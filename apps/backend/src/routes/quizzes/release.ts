import type { Request, Response } from "express";

import { db } from "../../db/client";
import { apiError, apiOk, forbidden } from "../../lib/api-response";
import { isAdminOfSeason, isSuper } from "../../lib/rbac";
import { requireUser } from "../../middleware/require-auth";
import { notifyQuizAnswersReleased } from "../../lib/quizzes/notify";
import { idParam } from "../../lib/http/params";
import { notFound } from "../../lib/http/not-found";

/** The season's admin, or a super: the only people who release results (owner, 2026-11-07). */
export function canReleaseQuizResults(user: Parameters<typeof isSuper>[0], seasonId: number): boolean {
  return isSuper(user) || isAdminOfSeason(user, seasonId);
}

/**
 * POST /quizzes/:id/release — let students see the answers: the questions, their own
 * answers and which were right. Scores show once graded. Until release every student read hides the answers, so a student taking the
 * quiz later can't learn the answers from one who took it first. One way: once
 * students have seen results there is nothing to take back. Only the request
 * that flips it notifies, so a repeat or a race stays silent.
 */
export async function releaseQuizResults(req: Request, res: Response) {
  const user = requireUser(req);
  const id = idParam(res, req.params.id, "quiz");
  if (id === null) return;

  const quiz = await db.quiz.findUnique({
    where: { id },
    select: { id: true, title: true, kind: true, seasonId: true, publishedAt: true },
  });
  if (!quiz) return notFound(res, "Quiz");
  if (!canReleaseQuizResults(user, quiz.seasonId)) return forbidden(res);
  if (quiz.kind === "ONLINE" && quiz.publishedAt === null) {
    return apiError(res, "quiz_not_published", "Publish the quiz before releasing its answers.", 409);
  }

  const now = new Date();
  const flipped =
    (
      await db.quiz.updateMany({
        where: { id, resultsReleasedAt: null },
        data: { resultsReleasedAt: now, resultsReleasedById: user.userId },
      })
    ).count === 1;
  if (flipped) await notifyQuizAnswersReleased(quiz);

  const { resultsReleasedAt } = await db.quiz.findUniqueOrThrow({
    where: { id },
    select: { resultsReleasedAt: true },
  });
  return apiOk(res, { answersReleasedAt: resultsReleasedAt });
}
