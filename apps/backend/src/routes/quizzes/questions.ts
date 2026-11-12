import type { Request, Response } from "express";

import { db } from "../../db/client";
import { apiOk, apiError, forbidden } from "../../lib/api-response";
import { parseId } from "../../lib/parse-id";
import { canManageQuiz } from "../../lib/permissions";
import { requireUser } from "../../middleware/require-auth";
import {
  publishQuizRequestSchema,
  quizQuestionRequestSchema,
  reorderQuestionsRequestSchema,
} from "../../../../../packages/shared/src/index";
import { notifyQuizPublished } from "../../lib/quizzes/notify";
import { quizHasAdminScores } from "../../lib/quizzes/admin-score";
import { unpublishQuiz } from "../../lib/quizzes/unpublish";
import {
  addQuizQuestion,
  deleteQuizQuestion,
  reorderQuizQuestions,
  SCORED_QUIZ_MESSAGE,
  updateQuizQuestion,
} from "../../lib/quizzes/questions";
import { idParam } from "../../lib/http/params";
import { notFound } from "../../lib/http/not-found";
import { parseOr400 } from "../../lib/http/validate";

/**
 * Spec D3: a quiz with attempts is structurally frozen.
 *
 * v1 allowed questions to be added, edited and deleted on a published quiz with
 * graded attempts (R22), rebasing maxScore retroactively (R13) and
 * cascade-deleting QuizAnswer rows out of GRADED attempts whose scores kept the
 * points those answers earned (R23, schema.prisma:739). Nothing records what a
 * quiz looked like when it was taken (there are no answer snapshots). So the
 * cheap correct version is: freeze.
 */
async function hasAttempts(quizId: number): Promise<boolean> {
  return (await db.quizAttempt.count({ where: { quizId } })) > 0;
}

/**
 * The shared preamble for all five authoring writes: exists, is ONLINE, caller
 * may manage it, and (unless `allowWithAttempts`) has no attempts yet.
 * Returns null once it has already answered the response.
 */
async function loadAuthorableQuiz(
  req: Request,
  res: Response,
  quizId: number,
  opts: { allowWithAttempts?: boolean } = {},
): Promise<{ id: number; kind: "PAPER" | "ONLINE" } | null> {
  const user = requireUser(req);
  const quiz = await db.quiz.findUnique({ where: { id: quizId }, select: { id: true, kind: true } });
  if (!quiz) {
    notFound(res, "Quiz");
    return null;
  }
  if (!(await canManageQuiz(user, quizId))) {
    forbidden(res);
    return null;
  }
  if (quiz.kind !== "ONLINE") {
    // R25: nothing in v1 scoped question writes to ONLINE quizzes, so questions
    // could be attached to a PAPER quiz where they were invisible everywhere
    // except one count.
    apiError(res, "wrong_quiz_kind", "This is a paper quiz — it has no questions.", 409);
    return null;
  }
  if (!opts.allowWithAttempts && (await hasAttempts(quizId))) {
    apiError(res, "quiz_has_attempts", "Students have started this quiz, so its questions can no longer change.", 409);
    return null;
  }
  if (!opts.allowWithAttempts && (await quizHasAdminScores(db, quizId))) {
    apiError(res, "quiz_has_attempts", SCORED_QUIZ_MESSAGE, 409);
    return null;
  }
  return quiz;
}

type PublishCheckRow = {
  type: string;
  quizOptions: { isCorrect: boolean; side: string | null; matchId: number | null }[];
  quizBlanks: unknown[];
};

/** Whether a stored question has the answer key its type needs. */
function isAnswerable(q: PublishCheckRow): boolean {
  const correct = q.quizOptions.filter((o) => o.isCorrect).length;
  switch (q.type) {
    case "SINGLE_CHOICE":
      return q.quizOptions.length >= 2 && correct === 1;
    case "MULTI_CHOICE":
      return q.quizOptions.length >= 3 && correct >= 2 && correct < q.quizOptions.length;
    case "TRUE_FALSE":
      return q.quizOptions.length === 2 && correct === 1;
    case "MATCHING": {
      const lefts = q.quizOptions.filter((o) => o.side === "LEFT");
      return lefts.length >= 2 && lefts.every((l) => l.matchId !== null);
    }
    case "FILL_BLANK":
      return q.quizBlanks.length >= 1;
    case "ESSAY":
      return true;
    default:
      return false;
  }
}

export async function addQuestion(req: Request, res: Response) {
  const id = idParam(res, req.params.id, "quiz");
  if (id === null) return;
  const quiz = await loadAuthorableQuiz(req, res, id);
  if (!quiz) return undefined;

  const parsed = parseOr400(quizQuestionRequestSchema, req.body, res, "Invalid question.");
  if (parsed === null) return;

  const created = await addQuizQuestion(id, parsed);

  return apiOk(res, created, 201);
}

export async function updateQuestion(req: Request, res: Response) {
  const id = parseId(req.params.id);
  const questionId = parseId(req.params.questionId);
  if (id === null || questionId === null) {
    return apiError(res, "bad_request", "Invalid id.", 400);
  }
  const quiz = await loadAuthorableQuiz(req, res, id);
  if (!quiz) return undefined;

  const existing = await db.quizQuestion.findUnique({
    where: { id: questionId },
    select: { quizId: true },
  });
  // Addressed through its quiz, so a bare question id can never reach another
  // quiz's row — v1 took questionId alone and derived the gate from it.
  if (!existing || existing.quizId !== id) {
    return apiError(res, "question_not_in_quiz", "Question not found.", 404);
  }

  const parsed = parseOr400(quizQuestionRequestSchema, req.body, res, "Invalid question.");
  if (parsed === null) return;

  const updated = await updateQuizQuestion(id, questionId, parsed);

  return apiOk(res, updated);
}

export async function deleteQuestion(req: Request, res: Response) {
  const id = parseId(req.params.id);
  const questionId = parseId(req.params.questionId);
  if (id === null || questionId === null) {
    return apiError(res, "bad_request", "Invalid id.", 400);
  }
  const quiz = await loadAuthorableQuiz(req, res, id);
  if (!quiz) return undefined;

  const existing = await db.quizQuestion.findUnique({
    where: { id: questionId },
    select: { quizId: true },
  });
  if (!existing || existing.quizId !== id) {
    return apiError(res, "question_not_in_quiz", "Question not found.", 404);
  }

  await deleteQuizQuestion(id, questionId);

  return apiOk(res, { deleted: true });
}

/**
 * Reorder. New in v2 — v1 had no reorder action, no drag handle, and no `order`
 * on its update path (R20), so the only way to move a question was to delete
 * and re-add it, which under D3's freeze would now be impossible.
 */
export async function reorderQuestions(req: Request, res: Response) {
  const id = idParam(res, req.params.id, "quiz");
  if (id === null) return;
  const quiz = await loadAuthorableQuiz(req, res, id);
  if (!quiz) return undefined;

  const parsed = parseOr400(reorderQuestionsRequestSchema, req.body, res, "Invalid order body.");
  if (parsed === null) return;
  const { questionIds } = parsed;

  const current = await db.quizQuestion.findMany({ where: { quizId: id }, select: { id: true } });
  const currentIds = new Set(current.map((q) => q.id));
  const sent = new Set(questionIds);
  // Exact permutation or nothing: a partial list would leave the omitted
  // questions holding stale positions and silently reshuffle the paper.
  const isPermutation =
    sent.size === questionIds.length &&
    sent.size === currentIds.size &&
    questionIds.every((qid) => currentIds.has(qid));
  if (!isPermutation) {
    return apiError(res, "invalid_order", "Send every question id exactly once.", 400);
  }

  const questions = await reorderQuizQuestions(id, questionIds);

  return apiOk(res, { questions });
}

export async function publishQuiz(req: Request, res: Response) {
  const id = idParam(res, req.params.id, "quiz");
  if (id === null) return;
  // Publishing IS allowed with attempts — republishing a live quiz changes
  // nothing structural (R31 only moves the timestamp, which is read as a
  // boolean everywhere). Unpublishing is the guarded direction, below.
  const quiz = await loadAuthorableQuiz(req, res, id, { allowWithAttempts: true });
  if (!quiz) return undefined;

  const parsed = parseOr400(publishQuizRequestSchema, req.body, res, "Invalid publish body.");
  if (parsed === null) return;

  if (parsed.publish) {
    const questions = await db.quizQuestion.findMany({
      where: { quizId: id },
      select: {
        type: true,
        quizOptions: { select: { isCorrect: true, side: true, matchId: true } },
        quizBlanks: { select: { id: true } },
      },
    });
    if (questions.length === 0) {
      return apiError(res, "no_questions", "Add at least one question before publishing.", 409);
    }
    // Re-checked here by type, because the write-time schema can be bypassed
    // by rows written elsewhere; an unanswerable question must never go live.
    if (questions.some((q) => !isAnswerable(q))) {
      return apiError(res, "mcq_without_answer", "Every question needs a complete answer key.", 409);
    }
  } else {
    // Spec D4. v1 wrote publishedAt: null unconditionally and both student
    // reads filter on it, so a student who had submitted and been graded lost
    // the quiz from their list AND got a 404 on the detail route, with the
    // notification they had already received pointing at the empty list.
    // Refused, under the Quiz lock, while a graded attempt or an admin score stands.
    return apiOk(res, await unpublishQuiz(id));
  }

  // Draft → published is a conditional write, so only the request that
  // actually flips it notifies: a republish (which only moves the timestamp)
  // and the loser of two racing publishes stay silent.
  const firstPublish =
    (await db.quiz.updateMany({ where: { id, publishedAt: null }, data: { publishedAt: new Date() } })).count === 1;

  const select = { publishedAt: true, seasonId: true, title: true } as const;
  const updated = firstPublish
    ? await db.quiz.findUniqueOrThrow({ where: { id }, select })
    : await db.quiz.update({
        where: { id },
        data: { publishedAt: new Date() },
        select,
      });

  if (firstPublish) await notifyQuizPublished(updated);

  return apiOk(res, { publishedAt: updated.publishedAt });
}
