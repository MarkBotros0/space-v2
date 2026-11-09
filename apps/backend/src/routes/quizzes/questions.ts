import type { Request, Response } from "express";

import { db } from "../../db/client";
import type { Prisma } from "../../generated/prisma/client";
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

/** The authoring view of a question — the answer key included. */
const AUTHORING_QUESTION_SELECT = {
  id: true,
  order: true,
  type: true,
  prompt: true,
  points: true,
  options: true,
  correctIndex: true,
} as const;

/**
 * Recompute an ONLINE quiz's maxScore as the sum of its question points (R11).
 *
 * Takes the transaction client, because in v1 this ran as a separate update
 * *after* the question write with nothing tying the two together (R14) — a
 * failure between them left maxScore stale, silently changing the denominator
 * of every score the quiz had produced.
 */
async function recomputeMaxScore(tx: Prisma.TransactionClient, quizId: number): Promise<void> {
  const agg = await tx.quizQuestion.aggregate({ where: { quizId }, _sum: { points: true } });
  await tx.quiz.update({ where: { id: quizId }, data: { maxScore: agg._sum.points ?? 0 } });
}

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
    apiError(res, "not_found", "Quiz not found.", 404);
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
  return quiz;
}

export async function addQuestion(req: Request, res: Response) {
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid quiz id.", 400);
  const quiz = await loadAuthorableQuiz(req, res, id);
  if (!quiz) return undefined;

  const parsed = quizQuestionRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid question.", 400);

  const created = await db.$transaction(async (tx) => {
    // R20: order is the current count. It stays that way, but a real reorder
    // endpoint exists now, and delete renumbers, so `order` is a position.
    const count = await tx.quizQuestion.count({ where: { quizId: id } });
    const question = await tx.quizQuestion.create({
      data: { quizId: id, order: count, ...parsed.data },
      select: AUTHORING_QUESTION_SELECT,
    });
    await recomputeMaxScore(tx, id);
    return question;
  });

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

  const parsed = quizQuestionRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid question.", 400);

  const updated = await db.$transaction(async (tx) => {
    // `order` is deliberately not writable here — reordering has its own
    // endpoint, so a question edit cannot silently move a question.
    const question = await tx.quizQuestion.update({
      where: { id: questionId },
      data: parsed.data,
      select: AUTHORING_QUESTION_SELECT,
    });
    await recomputeMaxScore(tx, id);
    return question;
  });

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

  await db.$transaction(async (tx) => {
    await tx.quizQuestion.delete({ where: { id: questionId } });
    // R21: v1 left `order` sparse. Renumbering keeps it a position, which is
    // what the reorder endpoint and the runner's numbering both assume.
    const survivors = await tx.quizQuestion.findMany({
      where: { quizId: id },
      orderBy: { order: "asc" },
      select: { id: true },
    });
    for (const [index, row] of survivors.entries()) {
      await tx.quizQuestion.update({ where: { id: row.id }, data: { order: index } });
    }
    await recomputeMaxScore(tx, id);
  });

  return apiOk(res, { deleted: true });
}

/**
 * Reorder. New in v2 — v1 had no reorder action, no drag handle, and no `order`
 * on its update path (R20), so the only way to move a question was to delete
 * and re-add it, which under D3's freeze would now be impossible.
 */
export async function reorderQuestions(req: Request, res: Response) {
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid quiz id.", 400);
  const quiz = await loadAuthorableQuiz(req, res, id);
  if (!quiz) return undefined;

  const parsed = reorderQuestionsRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid order body.", 400);
  const { questionIds } = parsed.data;

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

  const questions = await db.$transaction(async (tx) => {
    for (const [index, questionId] of questionIds.entries()) {
      await tx.quizQuestion.update({ where: { id: questionId }, data: { order: index } });
    }
    return tx.quizQuestion.findMany({
      where: { quizId: id },
      orderBy: { order: "asc" },
      select: AUTHORING_QUESTION_SELECT,
    });
  });

  return apiOk(res, { questions });
}

export async function publishQuiz(req: Request, res: Response) {
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid quiz id.", 400);
  // Publishing IS allowed with attempts — republishing a live quiz changes
  // nothing structural (R31 only moves the timestamp, which is read as a
  // boolean everywhere). Unpublishing is the guarded direction, below.
  const quiz = await loadAuthorableQuiz(req, res, id, { allowWithAttempts: true });
  if (!quiz) return undefined;

  const parsed = publishQuizRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid publish body.", 400);

  if (parsed.data.publish) {
    const questions = await db.quizQuestion.findMany({
      where: { quizId: id },
      select: { type: true, correctIndex: true, options: true },
    });
    if (questions.length === 0) {
      return apiError(res, "no_questions", "Add at least one question before publishing.", 409);
    }
    // Re-checked here because R18's guarantee at write time can be broken later
    // by an option edit — correctIndex is a position into `options`, not a
    // reference to one (R24).
    const badMcq = questions.some(
      (q) => q.type === "MCQ" && (q.correctIndex === null || q.correctIndex >= q.options.length),
    );
    if (badMcq) {
      return apiError(res, "mcq_without_answer", "Every multiple-choice question needs a correct answer.", 409);
    }
  } else {
    // Spec D4. v1 wrote publishedAt: null unconditionally and both student
    // reads filter on it, so a student who had submitted and been graded lost
    // the quiz from their list AND got a 404 on the detail route, with the
    // notification they had already received pointing at the empty list.
    const graded = await db.quizAttempt.count({ where: { quizId: id, status: "GRADED" } });
    if (graded > 0) {
      return apiError(
        res,
        "quiz_has_graded_attempts",
        "Students have graded results for this quiz; unpublishing would hide them.",
        409,
      );
    }
  }

  // Draft → published is a conditional write, so only the request that
  // actually flips it notifies: a republish (which only moves the timestamp)
  // and the loser of two racing publishes stay silent.
  const firstPublish =
    parsed.data.publish &&
    (await db.quiz.updateMany({ where: { id, publishedAt: null }, data: { publishedAt: new Date() } })).count === 1;

  const select = { publishedAt: true, seasonId: true, title: true } as const;
  const updated = firstPublish
    ? await db.quiz.findUniqueOrThrow({ where: { id }, select })
    : await db.quiz.update({
        where: { id },
        data: { publishedAt: parsed.data.publish ? new Date() : null },
        select,
      });

  if (firstPublish) await notifyQuizPublished(updated);

  return apiOk(res, { publishedAt: updated.publishedAt });
}
