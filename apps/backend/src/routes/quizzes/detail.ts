import type { Request, Response } from "express";

import { db } from "../../db/client";
import { apiOk, apiError, forbidden } from "../../lib/api-response";
import { parseId } from "../../lib/parse-id";
import { canAccessSeason, canGradeQuiz, canManageQuiz, hasActiveEnrollment } from "../../lib/permissions";
import { requireUser } from "../../middleware/require-auth";
import { canReleaseQuizResults } from "./release";
import { loadStudentQuizDetail } from "./student-detail";

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
      questions: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          order: true,
          type: true,
          prompt: true,
          points: true,
          options: true,
          correctIndex: true,
        },
      },
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
    resultsReleasedAt: quiz.resultsReleasedAt,
    canReleaseResults: canRelease(quiz.seasonId),
    questions: quiz.questions,
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
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid quiz id.", 400);

  const quiz = await db.quiz.findUnique({ where: { id }, select: { seasonId: true } });
  if (!quiz) return apiError(res, "not_found", "Quiz not found.", 404);

  if (user.role === "STUDENT") {
    if (!(await canAccessSeason(user, quiz.seasonId))) {
      // R35's ordering, kept deliberately: a student outside the season and a
      // quiz that does not exist are indistinguishable from the response.
      return apiError(res, "not_found", "Quiz not found.", 404);
    }
    const readOnly = !(await hasActiveEnrollment(user, quiz.seasonId));
    const detail = await loadStudentQuizDetail(id, user.userId, readOnly);
    if (!detail) return apiError(res, "not_found", "Quiz not found.", 404);
    return apiOk(res, detail);
  }

  // Staff: grading needs the answer key (R103), and canGradeQuiz is the
  // audience that grades. canManage narrows further, to authoring.
  if (!(await canGradeQuiz(user, id))) return forbidden(res);
  const detail = await loadQuizAuthoringDetail(id, await canManageQuiz(user, id), (seasonId) =>
    canReleaseQuizResults(user, seasonId),
  );
  if (!detail) return apiError(res, "not_found", "Quiz not found.", 404);
  return apiOk(res, detail);
}
