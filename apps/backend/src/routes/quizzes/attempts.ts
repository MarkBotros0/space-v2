import type { Request, Response } from "express";

import { db } from "../../db/client";
import type { Prisma } from "../../generated/prisma/client";
import { apiOk, apiError } from "../../lib/api-response";
import { parseId } from "../../lib/parse-id";
import type { SessionUser } from "../../lib/auth/tokens";
import { hasActiveEnrollment } from "../../lib/permissions";
import { isAlumnus, isStudyingAlumnus } from "../../lib/rbac";
import { requireUser } from "../../middleware/require-auth";
import { saveQuizAnswersRequestSchema } from "../../../../../packages/shared/src/index";
import { forbidden } from "../respond";
import { notifyQuizGraded } from "./notify";
import { loadStudentQuizDetail } from "./student-detail";

/**
 * Whether this student may WRITE an attempt in the quiz's season.
 *
 * Deliberately stricter than `canAccessSeason`, whose student branch accepts
 * any enrolment row: a dropped or completed student, or an alumnus who isn't
 * studying (read-only, see `isAlumnus`), must not start, save or submit an
 * attempt in a season they no longer have a live place in. Same rule video-quiz
 * and check-in already apply (`hasActiveEnrollment`).
 */
async function canTakeQuizIn(user: SessionUser, seasonId: number): Promise<boolean> {
  if (isAlumnus(user) && !isStudyingAlumnus(user)) return false;
  return hasActiveEnrollment(user, seasonId);
}

/** Load the quiz and apply the enrolment gate, or answer and return null. */
async function loadTakeableQuiz(res: Response, user: SessionUser, quizId: number) {
  const quiz = await db.quiz.findUnique({
    where: { id: quizId },
    select: { title: true, seasonId: true, resultsReleasedAt: true },
  });
  if (!quiz) {
    apiError(res, "not_found", "Quiz not found.", 404);
    return null;
  }
  if (!(await canTakeQuizIn(user, quiz.seasonId))) {
    forbidden(res);
    return null;
  }
  return quiz;
}

/**
 * Start or resume this student's attempt.
 *
 * PUT, and idempotent, for the reason ruling C6 gives and Plan 1's
 * PUT /submissions/by-assignment/:id already demonstrates: a screen that
 * remounts, or React Query refetching on focus, must not produce a second row.
 * The attempt is addressed by QUIZ, never by attempt id — there is at most one
 * live attempt per (quiz, student) and the server can always find it, which
 * removes both the client's attemptId bookkeeping and the need for ownership to
 * be the only gate (v1's saveQuizAnswerAction had no role check at all and
 * compared user ids; here the id comes from the token and is never in the URL).
 */
export async function startAttempt(req: Request, res: Response) {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid quiz id.", 400);

  // R41: only a student has an attempt of their own.
  if (user.role !== "STUDENT") {
    return apiError(res, "forbidden", "Only a student can take a quiz.", 403);
  }

  const quiz = await db.quiz.findUnique({
    where: { id },
    select: { seasonId: true, kind: true, publishedAt: true },
  });
  if (!quiz) return apiError(res, "not_found", "Quiz not found.", 404);
  if (quiz.kind !== "ONLINE" || quiz.publishedAt === null) {
    return apiError(res, "quiz_not_published", "This quiz is not available.", 409);
  }
  if (!(await canTakeQuizIn(user, quiz.seasonId))) return forbidden(res);

  const latest = await db.quizAttempt.findFirst({
    where: { quizId: id, studentUserId: user.userId },
    orderBy: { attemptNumber: "desc" },
    select: { id: true, status: true },
  });

  if (latest && latest.status !== "IN_PROGRESS") {
    // R45: one attempt per student per quiz; a retake needs staff (see Task 5).
    return apiError(
      res,
      "attempt_closed",
      "You've already submitted this quiz. Ask your leader to reopen it.",
      409,
    );
  }

  if (!latest) {
    // A real upsert on the natural unique key, not v1's read-then-create with
    // no transaction (R119/D15) — two concurrent calls both saw no attempt,
    // both created attemptNumber 1, and the loser surfaced a raw Prisma error
    // to the student instead of the friendly message.
    await db.quizAttempt.upsert({
      where: {
        quizId_studentUserId_attemptNumber: {
          quizId: id,
          studentUserId: user.userId,
          attemptNumber: 1,
        },
      },
      // Empty update: the point is to return the existing row untouched.
      update: {},
      create: { quizId: id, studentUserId: user.userId, attemptNumber: 1 },
      select: { id: true },
    });
  }

  const detail = await loadStudentQuizDetail(id, user.userId, false);
  if (!detail) return apiError(res, "not_found", "Quiz not found.", 404);
  return apiOk(res, detail);
}

/** Resolve the caller's live attempt, or answer and return null. */
async function resolveOpenAttempt(
  res: Response,
  quizId: number,
  studentUserId: number,
) {
  const attempt = await db.quizAttempt.findFirst({
    where: { quizId, studentUserId },
    orderBy: { attemptNumber: "desc" },
    select: { id: true, status: true },
  });
  if (!attempt) {
    apiError(res, "no_attempt", "Start the quiz before saving answers.", 409);
    return null;
  }
  if (attempt.status !== "IN_PROGRESS") {
    apiError(res, "attempt_closed", "This attempt is closed.", 409);
    return null;
  }
  return attempt;
}

/**
 * Lock the attempt row and return its CURRENT status (REG-111 / R120). The
 * pre-transaction status check in resolveOpenAttempt is only a fast refusal;
 * this is the authoritative one. Both the answer save and the submit take this
 * lock first, so a save can never land between submit's read of the answers and
 * its commit, and two submits cannot both score the same attempt.
 */
async function lockAttemptStatus(
  tx: Prisma.TransactionClient,
  attemptId: number,
): Promise<string | null> {
  const rows = await tx.$queryRaw<{ status: string }[]>`
    SELECT "status"::text AS "status" FROM "QuizAttempt" WHERE "id" = ${attemptId} FOR UPDATE`;
  return rows[0]?.status ?? null;
}

export async function saveAttemptAnswers(req: Request, res: Response) {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid quiz id.", 400);
  if (user.role !== "STUDENT") {
    return apiError(res, "forbidden", "Only a student can take a quiz.", 403);
  }

  const parsed = saveQuizAnswersRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid answers.", 400);

  if (!(await loadTakeableQuiz(res, user, id))) return undefined;

  const attempt = await resolveOpenAttempt(res, id, user.userId);
  if (!attempt) return undefined;

  const questions = await db.quizQuestion.findMany({
    where: { quizId: id },
    select: { id: true, type: true, options: true },
  });
  const byId = new Map(questions.map((q) => [q.id, q]));

  for (const answer of parsed.data.answers) {
    const question = byId.get(answer.questionId);
    // R50 — the one cross-entity consistency check v1 did make, kept.
    if (!question) {
      return apiError(res, "question_not_in_quiz", "That question is not in this quiz.", 400);
    }
    if (question.type === "MCQ") {
      // R52: v1 validated neither of these. An ESSAY accepted a selectedIndex
      // and an MCQ accepted free text; only the client's good manners kept the
      // data coherent.
      if (answer.text !== null) {
        return apiError(res, "wrong_answer_type", "A multiple-choice answer has no text.", 400);
      }
      // R51: the real bound is THIS question's option count, not v1's constant 5.
      if (answer.selectedIndex !== null && answer.selectedIndex >= question.options.length) {
        return apiError(res, "answer_out_of_range", "That option does not exist.", 400);
      }
    } else if (answer.selectedIndex !== null) {
      return apiError(res, "wrong_answer_type", "An essay answer has no option index.", 400);
    }
  }

  const closed = await db.$transaction(async (tx) => {
    if ((await lockAttemptStatus(tx, attempt.id)) !== "IN_PROGRESS") return true;
    for (const answer of parsed.data.answers) {
      await tx.quizAnswer.upsert({
        where: { attemptId_questionId: { attemptId: attempt.id, questionId: answer.questionId } },
        create: {
          attemptId: attempt.id,
          questionId: answer.questionId,
          selectedIndex: answer.selectedIndex,
          text: answer.text,
        },
        // isCorrect and pointsAwarded are untouched — saving never grades (R54).
        update: { selectedIndex: answer.selectedIndex, text: answer.text },
      });
    }
    return false;
  });
  if (closed) return apiError(res, "attempt_closed", "This attempt is closed.", 409);

  return apiOk(res, { saved: parsed.data.answers.length });
}

type SubmitOutcome =
  | { fail: [code: string, message: string, status: 409] }
  | { hasEssays: boolean };

export async function submitAttempt(req: Request, res: Response) {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid quiz id.", 400);
  if (user.role !== "STUDENT") {
    return apiError(res, "forbidden", "Only a student can take a quiz.", 403);
  }

  const quiz = await loadTakeableQuiz(res, user, id);
  if (!quiz) return undefined;

  const attempt = await resolveOpenAttempt(res, id, user.userId);
  if (!attempt) return undefined;

  // REG-111 / R120: read, validate, score and write all inside ONE transaction
  // that holds the attempt row lock (see lockAttemptStatus), so the answers
  // scored are exactly the answers committed with the status change.
  const outcome = await db.$transaction(async (tx): Promise<SubmitOutcome> => {
    if ((await lockAttemptStatus(tx, attempt.id)) !== "IN_PROGRESS") {
      return { fail: ["attempt_closed", "This attempt is closed.", 409] };
    }

    const [questions, answers] = await Promise.all([
      tx.quizQuestion.findMany({
        where: { quizId: id },
        select: { id: true, type: true, points: true, correctIndex: true },
      }),
      tx.quizAnswer.findMany({
        where: { attemptId: attempt.id },
        select: { questionId: true, selectedIndex: true, text: true },
      }),
    ]);
    const answerBy = new Map(answers.map((a) => [a.questionId, a]));

    // R59: one unanswered question rejects the whole submit.
    for (const q of questions) {
      const a = answerBy.get(q.id);
      const answered =
        q.type === "MCQ"
          ? a?.selectedIndex !== null && a?.selectedIndex !== undefined
          : Boolean(a?.text && a.text.trim().length > 0);
      if (!answered) {
        return {
          fail: [
            "attempt_incomplete", "Answer every question before submitting.", 409,
          ],
        };
      }
    }

    let autoScore = 0;
    const scored = questions
      .filter((q) => q.type === "MCQ")
      .map((q) => {
        // R60: full points or nothing. No partial credit, no negative marking,
        // no per-option weighting anywhere in this domain.
        const isCorrect = answerBy.get(q.id)?.selectedIndex === q.correctIndex;
        const pointsAwarded = isCorrect ? q.points : 0;
        autoScore += pointsAwarded;
        return { questionId: q.id, isCorrect, pointsAwarded };
      });
    const hasEssays = questions.some((q) => q.type === "ESSAY");
    const now = new Date();

    for (const s of scored) {
      await tx.quizAnswer.update({
        where: { attemptId_questionId: { attemptId: attempt.id, questionId: s.questionId } },
        data: { isCorrect: s.isCorrect, pointsAwarded: s.pointsAwarded },
      });
    }
    await tx.quizAttempt.update({
      where: { id: attempt.id },
      data: hasEssays
        ? { status: "SUBMITTED", submittedAt: now, autoScore }
        : {
            status: "GRADED",
            submittedAt: now,
            autoScore,
            manualScore: 0,
            totalScore: autoScore,
            gradedAt: now,
            // gradedById stays null: nobody graded it (R64).
          },
    });
    return { hasEssays };
  });
  if ("fail" in outcome) return apiError(res, outcome.fail[0], outcome.fail[1], outcome.fail[2]);
  const { hasEssays } = outcome;

  // Held results stay quiet: the student hears once they are released.
  if (!hasEssays && quiz.resultsReleasedAt !== null) {
    // Best-effort, outside the transaction (spec D6). A mail failure must not
    // report a submitted quiz as failed.
    await notifyQuizGraded(
      [user.userId],
      `Quiz graded: ${quiz.title}`,
      "Your quiz was graded automatically.",
    );
  }

  const detail = await loadStudentQuizDetail(id, user.userId, false);
  if (!detail) return apiError(res, "not_found", "Quiz not found.", 404);
  return apiOk(res, detail);
}
