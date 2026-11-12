import type { Request, Response } from "express";

import { db } from "../../db/client";
import { apiOk, forbidden } from "../../lib/api-response";
import {
  canAccessSeason,
  canAdministerQuiz,
  canGradeQuiz,
  canManageQuiz,
  hasActiveEnrollment,
} from "../../lib/permissions";
import { requireUser } from "../../middleware/require-auth";
import { closeLatestIfExpired } from "../../lib/quizzes/close-attempt";
import { AUTHORING_QUESTION_SELECT } from "../../lib/quizzes/questions";
import { toAuthoringQuestion } from "../../lib/quizzes/question-rows";
import { loadStudentQuizDetail } from "./student-detail";
import { idParam } from "../../lib/http/params";
import { notFound } from "../../lib/http/not-found";

/** The authoring/grading projection — the answer key, for the audience that needs it. */
async function loadQuizAuthoringDetail(quizId: number, canManage: boolean, canRelease: (seasonId: number) => boolean) {
  const quiz = await db.quiz.findUnique({
    where: { id: quizId },
    select: {
      id: true,
      title: true,
      kind: true,
      seasonId: true,
      sessionId: true,
      publishedAt: true,
      resultsReleasedAt: true,
      maxScore: true,
      season: { select: { code: true } },
      session: { select: { title: true } },
      _count: { select: { attempts: true, grades: true } },
      shuffleQuestions: true,
      startsFrom: true,
      startsUntil: true,
      timeLimitMinutes: true,
      questions: { orderBy: { order: "asc" }, select: AUTHORING_QUESTION_SELECT },
    },
  });
  if (!quiz) return null;

  return {
    id: quiz.id,
    title: quiz.title,
    kind: quiz.kind,
    seasonId: quiz.seasonId,
    seasonCode: quiz.season.code,
    sessionId: quiz.sessionId,
    sessionTitle: quiz.session?.title ?? null,
    publishedAt: quiz.publishedAt,
    maxScore: quiz.maxScore,
    attemptCount: quiz._count.attempts,
    gradeCount: quiz._count.grades,
    // Derived once, server-side (C4): the same condition the write path
    // enforces, so the screen never has to guess whether the builder is live.
    canEditStructure: canManage && quiz.kind === "ONLINE" && quiz._count.attempts === 0,
    canManage,
    answersReleasedAt: quiz.resultsReleasedAt,
    canReleaseResults: canRelease(quiz.seasonId),
    shuffleQuestions: quiz.shuffleQuestions,
    startsFrom: quiz.startsFrom,
    startsUntil: quiz.startsUntil,
    timeLimitMinutes: quiz.timeLimitMinutes,
    questions: quiz.questions.map(toAuthoringQuestion),
  };
}

/**
 * One path, two projections, chosen by role on the server.
 *
 * Spec §7 recommends two separate handlers so the authoring select is
 * unreachable from a student token by construction. This is that, one level in:
 * the dispatch is the first thing the handler does, the two loaders are separate
 * functions with separate Prisma selects and separate response types, and
 * neither can be reached with the other's audience. A single handler that
 * built one object and deleted fields for students is what must never exist.
 */
export async function getQuiz(req: Request, res: Response) {
  const user = requireUser(req);
  const id = idParam(res, req.params.id, "quiz");
  if (id === null) return;

  const quiz = await db.quiz.findUnique({ where: { id }, select: { seasonId: true } });
  if (!quiz) return notFound(res, "Quiz");

  if (user.role === "STUDENT") {
    if (!(await canAccessSeason(user, quiz.seasonId))) {
      // R35's ordering, kept deliberately: a student outside the season and a
      // quiz that does not exist are indistinguishable from the response.
      return notFound(res, "Quiz");
    }
    // Lazy close (spec "Timing"): a read past the deadline closes the attempt
    // first, no grace, so the student sees it submitted. This is the path the
    // app refetches when its countdown reaches zero.
    await closeLatestIfExpired(id, user.userId, 0);
    const readOnly = !(await hasActiveEnrollment(user, quiz.seasonId));
    const detail = await loadStudentQuizDetail(id, user.userId, readOnly);
    if (!detail) return notFound(res, "Quiz");
    return apiOk(res, detail);
  }

  // Staff: grading needs the answer key (R103), and canGradeQuiz is the
  // audience that grades. canManage narrows further, to authoring.
  if (!(await canGradeQuiz(user, id))) return forbidden(res);
  const detail = await loadQuizAuthoringDetail(id, await canManageQuiz(user, id), (seasonId) =>
    canAdministerQuiz(user, seasonId),
  );
  if (!detail) return notFound(res, "Quiz");
  return apiOk(res, detail);
}
