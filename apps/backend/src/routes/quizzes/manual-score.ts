import type { Request, Response } from "express";
import type { ManualScore } from "@space/shared";

import { db } from "../../db/client";
import type { SessionUser } from "../../lib/auth/tokens";
import { apiError, apiNoContent, apiOk, forbidden } from "../../lib/api-response";
import { canAdministerQuiz } from "../../lib/permissions";
import { visibleStudentIdsForQuiz } from "../../lib/quiz-scope";
import { requireUser } from "../../middleware/require-auth";
import { clearManualScore, saveManualScore } from "../../lib/quizzes/manual-score";
import { notifyQuizGraded } from "../../lib/quizzes/notify";
import { toScore } from "../../lib/quizzes/score";
import { manualScoreWriteSchema } from "../../../../../packages/shared/src/index";
import { idParam } from "../../lib/http/params";
import { notFound } from "../../lib/http/not-found";
import { parseOr400 } from "../../lib/http/validate";

type Target = { quiz: { id: number; title: string; maxScore: number }; studentUserId: number };

/** Answers the first refusal that applies and returns true; false when the target is fine. */
async function refuse(
  res: Response,
  user: SessionUser,
  quiz: { kind: string; seasonId: number } | null,
  studentUserId: number,
): Promise<boolean> {
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
  if (!visible.includes(studentUserId)) {
    notFound(res, "Student");
    return true;
  }
  return false;
}

/**
 * The checks both verbs share, answering and returning null on a refusal: the quiz exists, the
 * caller is its season's admin or a super (never a leader, who only marks), the quiz is ONLINE
 * (a paper quiz has its grade grid), and the student is one of the quiz's season participants.
 */
async function resolveTarget(req: Request, res: Response): Promise<Target | null> {
  const user = requireUser(req);
  const id = idParam(res, req.params.id, "quiz");
  if (id === null) return null;
  const studentUserId = idParam(res, req.params.studentUserId, "student");
  if (studentUserId === null) return null;

  const quiz = await db.quiz.findUnique({
    where: { id },
    select: { id: true, title: true, kind: true, maxScore: true, seasonId: true },
  });
  const refusal = await refuse(res, user, quiz, studentUserId);
  if (refusal || !quiz) return null;
  return { quiz, studentUserId };
}

/**
 * PUT /quizzes/:id/manual-scores/:studentUserId — the admin's score for one student on an ONLINE
 * quiz. It always counts, even below an in-app attempt. "Your score is in" on a new or changed
 * score, nothing on a re-save of the same score and notes. The response carries no question,
 * answer or key.
 */
export async function putManualScore(req: Request, res: Response) {
  const target = await resolveTarget(req, res);
  if (target === null) return;
  const { quiz, studentUserId } = target;

  const input = parseOr400(manualScoreWriteSchema, req.body, res, "Invalid manual score.");
  if (input === null) return;
  if (input.score > quiz.maxScore) {
    return apiError(res, "score_exceeds_max", `This quiz is out of ${quiz.maxScore}.`, 400);
  }

  const { changed } = await saveManualScore(quiz.id, studentUserId, input, requireUser(req).userId);
  // Best-effort, after the write committed: the paper grade's notification and copy.
  if (changed) await notifyQuizGraded([studentUserId], quiz.title);

  const row = await db.quizGrade.findUniqueOrThrow({
    where: { quizId_studentUserId: { quizId: quiz.id, studentUserId } },
    select: { score: true, notes: true, gradedAt: true, gradedById: true, gradedBy: { select: { name: true } } },
  });
  const body: ManualScore = {
    score: toScore(row.score) ?? 0,
    notes: row.notes,
    gradedAt: (row.gradedAt ?? new Date()).toISOString(),
    gradedBy: { id: row.gradedById ?? 0, name: row.gradedBy?.name ?? "" },
  };
  return apiOk(res, body);
}

/** DELETE /quizzes/:id/manual-scores/:studentUserId — clears it, silently; 204 even when there was none. */
export async function deleteManualScore(req: Request, res: Response) {
  const target = await resolveTarget(req, res);
  if (target === null) return;
  await clearManualScore(target.quiz.id, target.studentUserId);
  return apiNoContent(res);
}
