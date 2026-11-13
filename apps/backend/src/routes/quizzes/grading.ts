import type { Request, Response } from "express";

import { db } from "../../db/client";
import { apiOk, apiError, forbidden } from "../../lib/api-response";
import { parseId } from "../../lib/parse-id";
import { canGradeQuiz } from "../../lib/permissions";
import { isSuper } from "../../lib/rbac";
import { visibleStudentIdsForQuiz } from "../../lib/quiz-scope";
import { requireUser } from "../../middleware/require-auth";
import { gradeAttempt as gradeLeaderMarks } from "../../lib/quizzes/grading";
import { GRADING_ANSWER_SELECT, GRADING_QUESTION_SELECT, gradingAnswers } from "../../lib/quizzes/grading-view";
import { endInfo, exitLogsFor, GRADING_END_SELECT } from "../../lib/quizzes/exit-log";
import { isLeaderMarked } from "../../lib/quizzes/marking";
import { toScore } from "../../lib/quizzes/score";
import { bestScoresFor } from "../../lib/queries/quiz-best-scores";
import { studentPageByName } from "../../lib/quizzes/grading-order";
import {
  markAttemptRequestSchema,
  quizAttemptsQuerySchema,
  reopenAttemptRequestSchema,
} from "../../../../../packages/shared/src/index";
import { notifyQuizGraded, notifyQuizRetake } from "../../lib/quizzes/notify";
import { reopenAttemptFor } from "../../lib/quizzes/reopen-attempt";
import { closeExpiredForQuiz, closeLatestIfExpired } from "../../lib/quizzes/close-attempt";
import { SAVE_GRACE_MS } from "../../lib/quizzes/timing";
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

  // Derived, never accepted (R105). Paged in name order (owner, 2026-11-13); both lists keep it.
  const studentIds = await visibleStudentIdsForQuiz(user, quiz.seasonId);
  if (studentIds === null) return forbidden(res);
  const { pageIds, nameById, hasMore } = await studentPageByName(studentIds, cursor, limit);
  const place = new Map(pageIds.map((sid, i) => [sid, i]));
  const byPlace = (a: { studentUserId: number }, b: { studentUserId: number }) =>
    (place.get(a.studentUserId) ?? 0) - (place.get(b.studentUserId) ?? 0);

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
      ...GRADING_END_SELECT,
      answers: { select: GRADING_ANSWER_SELECT },
    },
  });
  const logs = await exitLogsFor(attempts.filter((a) => a.status !== "IN_PROGRESS").map((a) => a.id));

  // The score a grading list shows is the one that counts: the admin's score when there is one
  // (plan 4), else the best GRADED attempt's (spec "Honest accidents"). The row stays the latest
  // attempt, which is what gets marked or reopened.
  const { best: bestScores, admin, app } = await bestScoresFor(id, pageIds);

  const scored = attempts.filter((a) => a.status !== "IN_PROGRESS").sort(byPlace);
  const inProgress = attempts.filter((a) => a.status === "IN_PROGRESS");
  const startedIds = new Set(attempts.map((a) => a.studentUserId));

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
      adminScore: admin.get(att.studentUserId) ?? null,
      appScore: app.get(att.studentUserId) ?? null,
      submittedAt: att.submittedAt,
      gradedByName: att.gradedBy?.name ?? null,
      ...endInfo(att),
      events: logs.get(att.id) ?? [],
      // Projected over the quiz's CURRENT questions (R104), in the author's
      // order: a question with no answer row shows with empty answer fields.
      answers: gradingAnswers(questions, att.answers),
    })),
    waiting: [
      ...inProgress.map((att) => ({
        studentUserId: att.studentUserId,
        studentName: att.studentUser.name,
        startedAt: att.createdAt,
        ...endInfo(att),
        adminScore: admin.get(att.studentUserId) ?? null,
        // An open retake: an earlier attempt may still be graded.
        appScore: app.get(att.studentUserId) ?? null,
      })),
      ...pageIds
        .filter((sid) => !startedIds.has(sid))
        .map((sid) => ({
          studentUserId: sid,
          studentName: nameById.get(sid) ?? null,
          startedAt: null,
          endReason: null,
          endedByName: null,
          deadlineAt: null,
          adminScore: admin.get(sid) ?? null,
          appScore: null,
        })),
    ].sort(byPlace),
    nextCursor: hasMore ? (pageIds[pageIds.length - 1] ?? null) : null,
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
  // points. Checked and recorded under the Season, then the attempt row lock (lib/quizzes/grading.ts).
  const { scoreChanged } = await gradeLeaderMarks(id, attemptId, parsed.marks, user.userId, {
    id: quiz.seasonId,
    mayWriteFinished: isSuper(user),
  });

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
      ...GRADING_END_SELECT,
    },
  });
  const log = await exitLogsFor([attemptId]);
  const { best, admin, app } = await bestScoresFor(id, [attempt.studentUserId]);
  // The score shows once graded, released answers or not (spec "What students
  // see"), so the student hears now. D8's single rule for both grading paths:
  // notify on a first grade and on any score change, silent on a no-op re-save.
  // Silent too under the admin's score (plan 4): it still counts, so the
  // student's score didn't change.
  if (scoreChanged && !admin.has(attempt.studentUserId)) {
    await notifyQuizGraded([attempt.studentUserId], quiz.title);
  }
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
    adminScore: admin.get(attempt.studentUserId) ?? null,
    appScore: app.get(attempt.studentUserId) ?? null,
    submittedAt: page?.submittedAt ?? null,
    gradedByName: page?.gradedBy?.name ?? null,
    endReason: page?.endReason ?? null,
    endedByName: page?.endedBy?.name ?? null,
    deadlineAt: page?.deadlineAt ?? null,
    events: log.get(attemptId) ?? [],
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

  // An expired attempt still marked IN_PROGRESS is closed first, so it can be reopened.
  await closeLatestIfExpired(id, parsed.studentUserId, SAVE_GRACE_MS);
  // A new attempt, refused once the admin has entered the score (lib/quizzes/reopen-attempt.ts).
  const created = await reopenAttemptFor(id, parsed.studentUserId, {
    id: quiz.seasonId,
    mayWriteFinished: isSuper(user),
  });

  // v1 sent nothing at all, so a student was never told a retake existed. There
  // is no dedicated NotificationType, so
  // QUIZ_GRADED is reused with copy that says what actually happened — D5's
  // explicit second option.
  await notifyQuizRetake(parsed.studentUserId, quiz.title);

  return apiOk(res, { attemptId: created.id, attemptNumber: created.attemptNumber }, 201);
}
