import type { Request, Response } from "express";

import { db } from "../../db/client";
import { apiOk, forbidden } from "../../lib/api-response";
import { notFound } from "../../lib/http/not-found";
import { idParam } from "../../lib/http/params";
import { canGradeQuiz } from "../../lib/permissions";
import { visibleStudentIdsForQuiz } from "../../lib/quiz-scope";
import { closeExpiredForQuiz } from "../../lib/quizzes/close-attempt";
import { loadLive } from "../../lib/quizzes/live-view";
import { SAVE_GRACE_MS } from "../../lib/quizzes/timing";
import { requireUser } from "../../middleware/require-auth";

/** GET /quizzes/:id/live: staff see where every student in scope is. No answer content. */
export async function getQuizLive(req: Request, res: Response) {
  const user = requireUser(req);
  const id = idParam(res, req.params.id, "quiz");
  if (id === null) return;

  const quiz = await db.quiz.findUnique({
    where: { id },
    select: { id: true, title: true, seasonId: true, timeLimitMinutes: true },
  });
  if (!quiz) return notFound(res, "Quiz");
  if (!(await canGradeQuiz(user, id))) return forbidden(res);

  // As the grading list: a dead phone's expired attempt closes on this read.
  const now = new Date();
  await closeExpiredForQuiz(id, now, SAVE_GRACE_MS);

  const studentIds = await visibleStudentIdsForQuiz(user, quiz.seasonId);
  if (studentIds === null) return forbidden(res);
  return apiOk(res, await loadLive(quiz, studentIds, now));
}
