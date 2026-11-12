import type { Request, Response } from "express";

import { db } from "../../db/client";
import type { SessionUser } from "../../lib/auth/tokens";
import { apiError, apiNoContent, apiOk, forbidden } from "../../lib/api-response";
import { liveSeason, liveUser } from "../../lib/db/live";
import { canAdministerQuiz } from "../../lib/permissions";
import { visibleStudentIdsForQuiz } from "../../lib/quiz-scope";
import { requireUser } from "../../middleware/require-auth";
import { clearManualScore, saveManualScore } from "../../lib/quizzes/manual-score";
import { notifyQuizGraded } from "../../lib/quizzes/notify";
import { manualScoreWriteSchema } from "../../../../../packages/shared/src/index";
import { idParam } from "../../lib/http/params";
import { notFound } from "../../lib/http/not-found";
import { parseOr400 } from "../../lib/http/validate";

type TargetQuiz = {
  id: number;
  title: string;
  kind: string;
  seasonId: number;
  publishedAt: Date | null;
};
type Target = { user: SessionUser; quiz: TargetQuiz; studentUserId: number };

/** Answers the first refusal that applies and returns true; false when the target is fine. */
async function refuse(res: Response, user: SessionUser, quiz: TargetQuiz | null, studentUserId: number) {
  if (!quiz) {
    notFound(res, "Quiz");
    return true;
  }
  if (!canAdministerQuiz(user, quiz.seasonId)) {
    forbidden(res);
    return true;
  }
  if (quiz.kind !== "ONLINE") {
    apiError(res, "quiz_not_online", "A paper quiz is graded on its grade sheet.", 409);
    return true;
  }
  const visible = await visibleStudentIdsForQuiz(user, quiz.seasonId);
  if (visible === null) {
    forbidden(res);
    return true;
  }
  const live = visible.includes(studentUserId) && (await db.user.count({ where: { id: studentUserId, ...liveUser } }));
  if (!live) {
    notFound(res, "Student");
    return true;
  }
  return false;
}

/**
 * The checks both verbs share, answering and returning null on a refusal: the quiz exists in a
 * live season, the caller is its season's admin or a super (never a leader, who only marks), the
 * quiz is ONLINE (a paper quiz has its grade grid), and the student is a live user among the
 * quiz's season participants.
 */
async function resolveTarget(req: Request, res: Response): Promise<Target | null> {
  const user = requireUser(req);
  const id = idParam(res, req.params.id, "quiz");
  if (id === null) return null;
  const studentUserId = idParam(res, req.params.studentUserId, "student");
  if (studentUserId === null) return null;

  const quiz = await db.quiz.findFirst({
    where: { id, season: liveSeason },
    select: { id: true, title: true, kind: true, seasonId: true, publishedAt: true },
  });
  if ((await refuse(res, user, quiz, studentUserId)) || !quiz) return null;
  return { user, quiz, studentUserId };
}

/**
 * PUT /quizzes/:id/manual-scores/:studentUserId — the admin's score for one student on an ONLINE
 * quiz. It always counts, even below an in-app attempt. Refused on an unpublished quiz. "Your
 * score is in" on a new or changed score; a notes-only edit or a same re-save is silent. The
 * response carries no question, answer or key.
 */
export async function putManualScore(req: Request, res: Response) {
  const target = await resolveTarget(req, res);
  if (target === null) return;
  const { user, quiz, studentUserId } = target;
  if (quiz.publishedAt === null) {
    return apiError(res, "quiz_not_published", "Publish the quiz before entering a score.", 409);
  }

  const input = parseOr400(manualScoreWriteSchema, req.body, res, "Invalid manual score.");
  if (input === null) return;
  // The bound (400 score_exceeds_max) is checked under the Quiz lock, in saveManualScore.
  const { scoreChanged, grade } = await saveManualScore(quiz.id, studentUserId, input, user.userId);
  // Best-effort, after the write committed: the paper grade's notification and copy.
  if (scoreChanged) await notifyQuizGraded([studentUserId], quiz.title);
  return apiOk(res, grade);
}

/**
 * DELETE /quizzes/:id/manual-scores/:studentUserId — clears it, silently; 204 even when there was
 * none. Allowed on an unpublished quiz, so an admin can clear a score after unpublishing.
 */
export async function deleteManualScore(req: Request, res: Response) {
  const target = await resolveTarget(req, res);
  if (target === null) return;
  await clearManualScore(target.quiz.id, target.studentUserId);
  return apiNoContent(res);
}
