import type { Request, Response } from "express";

import { db } from "../../db/client";
import { apiOk, apiError, forbidden } from "../../lib/api-response";
import { parseId } from "../../lib/parse-id";
import { canGradeQuiz } from "../../lib/permissions";
import { visibleStudentIdsForQuiz } from "../../lib/quiz-scope";
import { requireUser } from "../../middleware/require-auth";
import { gradeAttempt as gradeLeaderMarks } from "../../lib/quizzes/grading";
import { GRADING_ANSWER_SELECT, GRADING_QUESTION_SELECT, gradingAnswers } from "../../lib/quizzes/grading-view";
import { isLeaderMarked } from "../../lib/quizzes/marking";
import { toScore } from "../../lib/quizzes/score";
import { bestScoresFor } from "../../lib/queries/quiz-best-scores";
import {
  markAttemptRequestSchema,
  quizAttemptsQuerySchema,
  reopenAttemptRequestSchema,
} from "../../../../../packages/shared/src/index";
import { notifyQuizGraded, notifyQuizRetake } from "../../lib/quizzes/notify";
import { newShuffleSeed } from "../../lib/quizzes/shuffle";
import { closeExpiredForQuiz } from "../../lib/quizzes/close-attempt";
import { idParam } from "../../lib/http/params";
import { notFound } from "../../lib/http/not-found";
import { parseOr400 } from "../../lib/http/validate";

export async function listAttempts(req: Request, res: Response) {
  const user = requireUser(req);
  const id = idParam(res, req.params.id, "quiz");
  if (id === null) return;

  const quiz = await db.quiz.findUnique({
    where: { id },
    select: { id: true, title: true, kind: true, maxScore: true, seasonId: true },
  });
  if (!quiz) return notFound(res, "Quiz");
  if (!(await canGradeQuiz(user, id))) return forbidden(res);

  const parsed = parseOr400(quizAttemptsQuerySchema, req.query, res, "Invalid query.");
  if (parsed === null) return;
  const { cursor, limit } = parsed;

  // A phone that died mid-quiz never comes back to close its attempt: every
  // staff read closes the quiz's expired ones first (spec "Timing").
  await closeExpiredForQuiz(id);

  // Derived, never accepted (R105). visibleStudentIdsForQuiz returns them
  // sorted, so paging over the ids is stable and needs no second sort.
  const studentIds = await visibleStudentIdsForQuiz(user, quiz.seasonId);
  if (studentIds === null) return forbidden(res);
  const remaining = cursor === undefined ? studentIds : studentIds.filter((sid) => sid > cursor);
  const pageIds = remaining.slice(0, limit);

  // Staff-only (canGradeQuiz above): the key is loaded on purpose (R103).
  const questions = await db.quizQuestion.findMany({
    where: { quizId: id },
    orderBy: { order: "asc" },
    select: GRADING_QUESTION_SELECT,
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
      answers: { select: GRADING_ANSWER_SELECT },
    },
  });

  // Spec "Honest accidents": the score a grading list shows is the best GRADED
  // attempt's. The row stays the latest attempt, which is what gets marked or reopened.
  const bestScores = await bestScoresFor(id, pageIds);

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
    // Kept name, wider meaning: the quiz has leader-marked questions (FILL_BLANK or ESSAY).
    hasEssays: questions.some((q) => isLeaderMarked(q.type)),
    studentCount: studentIds.length,
    items: scored.map((att) => ({
      attemptId: att.id,
      studentUserId: att.studentUserId,
      studentName: att.studentUser.name,
      attemptNumber: att.attemptNumber,
      status: att.status,
      autoScore: toScore(att.autoScore),
      manualScore: toScore(att.manualScore),
      totalScore: toScore(att.totalScore),
      bestScore: bestScores.get(att.studentUserId) ?? null,
      submittedAt: att.submittedAt,
      gradedByName: att.gradedBy?.name ?? null,
      // Projected over the quiz's CURRENT questions (R104), in the author's
      // order: a question with no answer row shows with empty answer fields.
      answers: gradingAnswers(questions, att.answers),
    })),
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
  if (!quiz) return notFound(res, "Quiz");
  if (!(await canGradeQuiz(user, id))) return forbidden(res);

  const attempt = await db.quizAttempt.findUnique({
    where: { id: attemptId },
    select: {
      id: true,
      quizId: true,
      studentUserId: true,
      status: true,
    },
  });
  // Addressed through its quiz: a bare attempt id can never reach another quiz.
  if (!attempt || attempt.quizId !== id) {
    return notFound(res, "Attempt");
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

  const parsed = parseOr400(markAttemptRequestSchema, req.body, res, "Invalid marks.");
  if (parsed === null) return;

  // Leaders mark right or wrong; the points follow from the admin's per-question
  // points. Checked and recorded under the attempt row lock (lib/quizzes/grading.ts).
  const { scoreChanged } = await gradeLeaderMarks(id, attemptId, parsed.marks, user.userId);

  // The score shows once graded, released answers or not (spec "What students
  // see"), so the student hears now. D8's single rule for both grading paths:
  // notify on a first grade and on any score change, silent on a no-op re-save.
  if (scoreChanged) {
    await notifyQuizGraded([attempt.studentUserId], quiz.title);
  }

  const page = await db.quizAttempt.findUnique({
    where: { id: attemptId },
    select: {
      id: true,
      studentUserId: true,
      attemptNumber: true,
      status: true,
      autoScore: true,
      manualScore: true,
      totalScore: true,
      submittedAt: true,
      studentUser: { select: { name: true } },
      gradedBy: { select: { name: true } },
    },
  });
  const best = await bestScoresFor(id, [attempt.studentUserId]);
  return apiOk(res, {
    attemptId: page?.id,
    studentUserId: page?.studentUserId,
    studentName: page?.studentUser.name ?? null,
    attemptNumber: page?.attemptNumber,
    status: page?.status,
    autoScore: toScore(page?.autoScore ?? null),
    manualScore: toScore(page?.manualScore ?? null),
    totalScore: toScore(page?.totalScore ?? null),
    bestScore: best.get(attempt.studentUserId) ?? null,
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
 * because an untimed attempt has no expiry and no ABANDONED status (R47), a dropped
 * connection mid-quiz makes this endpoint the ONLY way that student ever
 * takes the quiz.
 */
export async function reopenAttempt(req: Request, res: Response) {
  const user = requireUser(req);
  const id = idParam(res, req.params.id, "quiz");
  if (id === null) return;

  const quiz = await db.quiz.findUnique({
    where: { id },
    select: { id: true, title: true, seasonId: true, kind: true, publishedAt: true },
  });
  if (!quiz) return notFound(res, "Quiz");
  if (!(await canGradeQuiz(user, id))) return forbidden(res);

  const parsed = parseOr400(reopenAttemptRequestSchema, req.body, res, "Invalid body.");
  if (parsed === null) return;

  const studentIds = await visibleStudentIdsForQuiz(user, quiz.seasonId);
  if (studentIds === null || !studentIds.includes(parsed.studentUserId)) {
    return apiError(res, "student_not_in_scope", "That student is not in your groups.", 403);
  }

  // R84: v1 checked neither kind nor publishedAt, so a retake could be opened
  // on an unpublished quiz the student then could not see.
  if (quiz.kind !== "ONLINE" || quiz.publishedAt === null) {
    return apiError(res, "quiz_not_published", "This quiz is not available to students.", 409);
  }

  const latest = await db.quizAttempt.findFirst({
    where: { quizId: id, studentUserId: parsed.studentUserId },
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
      studentUserId: parsed.studentUserId,
      // R81: a NEW attempt; the previous one and its answers stay intact.
      attemptNumber: latest.attemptNumber + 1,
      // A retake gets its own shuffle. deadlineAt stays null: its fresh time
      // limit starts when the student opens it (lib/quizzes/start-attempt.ts).
      shuffleSeed: newShuffleSeed(),
    },
    select: { id: true, attemptNumber: true },
  });

  // v1 sent nothing at all, so a student was never told a retake existed. There
  // is no dedicated NotificationType, so
  // QUIZ_GRADED is reused with copy that says what actually happened — D5's
  // explicit second option.
  await notifyQuizRetake(parsed.studentUserId, quiz.title);

  return apiOk(res, { attemptId: created.id, attemptNumber: created.attemptNumber }, 201);
}
