import type { Request, Response } from "express";

import { db } from "../../db/client";
import { apiOk, apiError } from "../../lib/api-response";
import { parseId } from "../../lib/parse-id";
import { canGradeQuiz } from "../../lib/permissions";
import { visibleStudentIdsForQuiz } from "../../lib/quiz-scope";
import { requireUser } from "../../middleware/require-auth";
import {
  gradeEssayAnswersRequestSchema,
  quizAttemptsQuerySchema,
  reopenAttemptRequestSchema,
} from "../../../../../packages/shared/src/index";
import { forbidden } from "../respond";
import { notifyQuizGraded } from "./notify";

export async function listAttempts(req: Request, res: Response) {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid quiz id.", 400);

  const quiz = await db.quiz.findUnique({
    where: { id },
    select: { id: true, title: true, kind: true, maxScore: true, seasonId: true },
  });
  if (!quiz) return apiError(res, "not_found", "Quiz not found.", 404);
  if (!(await canGradeQuiz(user, id))) return forbidden(res);

  const parsed = quizAttemptsQuerySchema.safeParse(req.query);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid query.", 400);
  const { cursor, limit } = parsed.data;

  // Derived, never accepted (R105). visibleStudentIdsForQuiz returns them
  // sorted, so paging over the ids is stable and needs no second sort.
  const studentIds = await visibleStudentIdsForQuiz(user, quiz.seasonId);
  if (studentIds === null) return forbidden(res);
  const remaining = cursor === undefined ? studentIds : studentIds.filter((sid) => sid > cursor);
  const pageIds = remaining.slice(0, limit);

  const questions = await db.quizQuestion.findMany({
    where: { quizId: id },
    orderBy: { order: "asc" },
    select: {
      id: true, type: true, prompt: true, points: true, options: true, correctIndex: true,
    },
  });

  const attempts = await db.quizAttempt.findMany({
    where: { quizId: id, studentUserId: { in: pageIds } },
    // Latest attempt per student — every status, not just SUBMITTED|GRADED
    // (R102/D5): an in-progress attempt hid its student from the list entirely.
    orderBy: [{ studentUserId: "asc" }, { attemptNumber: "desc" }],
    distinct: ["studentUserId"],
    select: {
      id: true,
      studentUserId: true,
      attemptNumber: true,
      status: true,
      autoScore: true,
      manualScore: true,
      totalScore: true,
      submittedAt: true,
      createdAt: true,
      studentUser: { select: { name: true } },
      // D13: the audit column v1 wrote and never read anywhere.
      gradedBy: { select: { name: true } },
      answers: {
        select: {
          questionId: true, selectedIndex: true, text: true,
          isCorrect: true, pointsAwarded: true,
        },
      },
    },
  });

  const scored = attempts.filter((a) => a.status !== "IN_PROGRESS");
  const inProgress = attempts.filter((a) => a.status === "IN_PROGRESS");
  const startedIds = new Set(attempts.map((a) => a.studentUserId));

  const names = await db.user.findMany({
    where: { id: { in: pageIds } },
    select: { id: true, name: true },
  });
  const nameById = new Map(names.map((u) => [u.id, u.name]));

  return apiOk(res, {
    id: quiz.id,
    title: quiz.title,
    kind: quiz.kind,
    maxScore: quiz.maxScore,
    hasEssays: questions.some((q) => q.type === "ESSAY"),
    studentCount: studentIds.length,
    items: scored.map((att) => {
      const answerBy = new Map(att.answers.map((a) => [a.questionId, a]));
      return {
        attemptId: att.id,
        studentUserId: att.studentUserId,
        studentName: att.studentUser.name,
        attemptNumber: att.attemptNumber,
        status: att.status,
        autoScore: att.autoScore,
        manualScore: att.manualScore,
        totalScore: att.totalScore,
        submittedAt: att.submittedAt,
        gradedByName: att.gradedBy?.name ?? null,
        // Projected over the quiz's CURRENT questions (R104): a question added
        // after this attempt was submitted shows with every answer field null.
        // Under D3's freeze that can no longer happen going forward, but rows
        // v1 already produced still look like this.
        answers: questions.map((q) => {
          const a = answerBy.get(q.id);
          return {
            questionId: q.id,
            type: q.type,
            prompt: q.prompt,
            points: q.points,
            options: q.options,
            correctIndex: q.correctIndex,
            selectedIndex: a?.selectedIndex ?? null,
            isCorrect: a?.isCorrect ?? null,
            text: a?.text ?? null,
            pointsAwarded: a?.pointsAwarded ?? null,
          };
        }),
      };
    }),
    waiting: [
      ...inProgress.map((att) => ({
        studentUserId: att.studentUserId,
        studentName: att.studentUser.name,
        startedAt: att.createdAt,
      })),
      ...pageIds
        .filter((sid) => !startedIds.has(sid))
        .map((sid) => ({
          studentUserId: sid,
          studentName: nameById.get(sid) ?? null,
          startedAt: null,
        })),
    ],
    nextCursor: remaining.length > limit ? (pageIds[pageIds.length - 1] ?? null) : null,
  });
}

export async function gradeAttempt(req: Request, res: Response) {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  const attemptId = parseId(req.params.attemptId);
  if (id === null || attemptId === null) return apiError(res, "bad_request", "Invalid id.", 400);

  const quiz = await db.quiz.findUnique({
    where: { id },
    select: { id: true, title: true, seasonId: true },
  });
  if (!quiz) return apiError(res, "not_found", "Quiz not found.", 404);
  if (!(await canGradeQuiz(user, id))) return forbidden(res);

  const attempt = await db.quizAttempt.findUnique({
    where: { id: attemptId },
    select: {
      id: true, quizId: true, studentUserId: true, status: true,
      autoScore: true, totalScore: true,
    },
  });
  // Addressed through its quiz: a bare attempt id can never reach another quiz.
  if (!attempt || attempt.quizId !== id) {
    return apiError(res, "not_found", "Attempt not found.", 404);
  }

  // R68: v1 checked the season and stopped. A leader could grade a student in
  // another leader's group because the group scope existed only in the array
  // the page computed for the READ.
  const studentIds = await visibleStudentIdsForQuiz(user, quiz.seasonId);
  if (studentIds === null || !studentIds.includes(attempt.studentUserId)) {
    return apiError(res, "student_not_in_scope", "That student is not in your groups.", 403);
  }

  if (attempt.status === "IN_PROGRESS") {
    return apiError(res, "attempt_not_submitted", "This attempt has not been submitted.", 409);
  }

  const parsed = gradeEssayAnswersRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid awards.", 400);

  const essays = await db.quizQuestion.findMany({
    where: { quizId: id, type: "ESSAY" },
    select: { id: true, points: true },
  });
  const maxBy = new Map(essays.map((q) => [q.id, q.points]));

  // Every essay, exactly once. v1 recomputed manualScore from only the awards
  // present, so an omitted essay contributed 0 and silently lowered the total.
  const sent = new Set(parsed.data.awards.map((a) => a.questionId));
  if (sent.size !== parsed.data.awards.length || sent.size !== essays.length ||
      !essays.every((q) => sent.has(q.id))) {
    return apiError(res, "awards_incomplete", "Send a mark for every essay question.", 400);
  }
  for (const award of parsed.data.awards) {
    const max = maxBy.get(award.questionId) as number;
    // D8: reject rather than clamp, matching D7's rule for paper scores.
    if (award.points > max) {
      return apiError(res, "score_exceeds_max", `That question is out of ${max}.`, 400);
    }
  }

  const manualScore = parsed.data.awards.reduce((sum, a) => sum + a.points, 0);
  // autoScore is trusted as stored and never recomputed (R73) — recomputing it
  // would need the questions as they were when taken, which nothing records.
  const totalScore = (attempt.autoScore ?? 0) + manualScore;
  const scoreChanged = attempt.totalScore !== totalScore;
  const now = new Date();

  await db.$transaction([
    ...parsed.data.awards.map((award) =>
      db.quizAnswer.update({
        where: { attemptId_questionId: { attemptId, questionId: award.questionId } },
        data: { pointsAwarded: award.points },
      }),
    ),
    db.quizAttempt.update({
      where: { id: attemptId },
      data: {
        manualScore,
        totalScore,
        status: "GRADED",
        gradedById: user.userId,
        gradedAt: now,
      },
    }),
  ]);

  if (scoreChanged) {
    // D8's single rule for both grading paths: notify on a first grade and on
    // any score change, silent on a no-op re-save. v1's two paths disagreed —
    // ONLINE notified on every call (R75), PAPER never re-notified (R92).
    await notifyQuizGraded(
      [attempt.studentUserId],
      `Quiz graded: ${quiz.title}`,
      "Your quiz has been graded.",
    );
  }

  const page = await db.quizAttempt.findUnique({
    where: { id: attemptId },
    select: {
      id: true, studentUserId: true, attemptNumber: true, status: true,
      autoScore: true, manualScore: true, totalScore: true, submittedAt: true,
      studentUser: { select: { name: true } },
      gradedBy: { select: { name: true } },
    },
  });
  return apiOk(res, {
    attemptId: page?.id,
    studentUserId: page?.studentUserId,
    studentName: page?.studentUser.name ?? null,
    attemptNumber: page?.attemptNumber,
    status: page?.status,
    autoScore: page?.autoScore ?? null,
    manualScore: page?.manualScore ?? null,
    totalScore: page?.totalScore ?? null,
    submittedAt: page?.submittedAt ?? null,
    gradedByName: page?.gradedBy?.name ?? null,
    answers: [],
  });
}

/**
 * Grant a retake.
 *
 * Gated on canGradeQuiz, not canManageQuiz — spec D5's recommendation. v1 made
 * this admin-only (R79), so the leader actually looking at the grading screen
 * could see a student stuck behind a dead attempt and had to find an admin. And
 * because there is no expiry, no timeout and no ABANDONED status (R47), a
 * dropped connection mid-quiz makes
 * this endpoint the ONLY way that student ever takes the quiz.
 */
export async function reopenAttempt(req: Request, res: Response) {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid quiz id.", 400);

  const quiz = await db.quiz.findUnique({
    where: { id },
    select: { id: true, title: true, seasonId: true, kind: true, publishedAt: true },
  });
  if (!quiz) return apiError(res, "not_found", "Quiz not found.", 404);
  if (!(await canGradeQuiz(user, id))) return forbidden(res);

  const parsed = reopenAttemptRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid body.", 400);

  const studentIds = await visibleStudentIdsForQuiz(user, quiz.seasonId);
  if (studentIds === null || !studentIds.includes(parsed.data.studentUserId)) {
    return apiError(res, "student_not_in_scope", "That student is not in your groups.", 403);
  }

  // R84: v1 checked neither kind nor publishedAt, so a retake could be opened
  // on an unpublished quiz the student then could not see.
  if (quiz.kind !== "ONLINE" || quiz.publishedAt === null) {
    return apiError(res, "quiz_not_published", "This quiz is not available to students.", 409);
  }

  const latest = await db.quizAttempt.findFirst({
    where: { quizId: id, studentUserId: parsed.data.studentUserId },
    orderBy: { attemptNumber: "desc" },
    select: { attemptNumber: true, status: true },
  });
  if (!latest) return apiError(res, "no_attempt", "That student has no attempt to reopen.", 409);
  if (latest.status === "IN_PROGRESS") {
    return apiError(res, "attempt_open", "That student already has an attempt open.", 409);
  }

  const created = await db.quizAttempt.create({
    data: {
      quizId: id,
      studentUserId: parsed.data.studentUserId,
      // R81: a NEW attempt; the previous one and its answers stay intact.
      attemptNumber: latest.attemptNumber + 1,
    },
    select: { id: true, attemptNumber: true },
  });

  // v1 sent nothing at all, so a student was never told a retake existed. There
  // is no dedicated NotificationType, so
  // QUIZ_GRADED is reused with copy that says what actually happened — D5's
  // explicit second option.
  await notifyQuizGraded(
    [parsed.data.studentUserId],
    `You can retake: ${quiz.title}`,
    "Your quiz has been reopened, so you can take it again.",
  );

  return apiOk(res, { attemptId: created.id, attemptNumber: created.attemptNumber }, 201);
}
