import type { Request, Response } from "express";

import { db } from "../../db/client";
import { apiOk, forbidden } from "../../lib/api-response";
import { canAccessSeason } from "../../lib/permissions";
import { countGradedByQuiz, visibleStudentIdsForQuiz } from "../../lib/quiz-scope";
import { requireUser } from "../../middleware/require-auth";
import { bestGraded, countingScore } from "../../lib/quizzes/best-attempt";
import { toScore } from "../../lib/quizzes/score";
import { quizListQuerySchema } from "../../../../../packages/shared/src/index";
import { parseOr400 } from "../../lib/http/validate";

/**
 * The student's own results — v1's listQuizResultsForStudent, ported.
 *
 * PAPER rows start from QuizGrade, so a paper quiz stays invisible until a
 * score is entered (R36); there is no release gate on a score. ONLINE rows start from Quiz filtered to published, so they
 * appear as soon as they are available, attempted or not (R37). Merged by
 * session date descending, a null date sunk to the bottom (R38).
 */
async function listQuizResultsForStudent(studentUserId: number, seasonId: number) {
  const [grades, onlineQuizzes] = await Promise.all([
    db.quizGrade.findMany({
      where: { studentUserId, score: { not: null }, quiz: { seasonId, kind: "PAPER" } },
      select: {
        score: true,
        notes: true,
        gradedAt: true,
        quiz: {
          select: {
            id: true,
            title: true,
            maxScore: true,
            session: { select: { title: true, startsAt: true } },
          },
        },
      },
    }),
    db.quiz.findMany({
      where: { seasonId, kind: "ONLINE", publishedAt: { not: null } },
      select: {
        id: true,
        title: true,
        maxScore: true,
        resultsReleasedAt: true,
        session: { select: { title: true, startsAt: true } },
        attempts: {
          where: { studentUserId },
          orderBy: { attemptNumber: "desc" },
          select: { status: true, totalScore: true, gradedAt: true, attemptNumber: true },
        },
        // On an ONLINE quiz a QuizGrade row is the admin's score (plan 4).
        grades: {
          where: { studentUserId, score: { not: null } },
          select: { score: true, notes: true, gradedAt: true },
        },
      },
    }),
  ]);

  const rows = [
    ...grades.map((g) => ({
      quizId: g.quiz.id,
      title: g.quiz.title,
      kind: "PAPER" as const,
      maxScore: g.quiz.maxScore,
      score: toScore(g.score),
      notes: g.notes,
      gradedAt: g.gradedAt,
      sessionTitle: g.quiz.session?.title ?? null,
      sessionDate: g.quiz.session?.startsAt ?? null,
      attemptStatus: null,
      answersReleased: true,
      adminScore: null,
    })),
    ...onlineQuizzes.map((q) => {
      const latest = q.attempts[0];
      const admin = q.grades[0] ?? null;
      // The score that counts: the admin's when there is one (plan 4), else the best graded
      // attempt's. Either shows with no release (spec "What students see"); a later attempt in
      // progress or awaiting marking does not hide it. Only a GRADED attempt has a score (R37).
      const counting = countingScore(admin, q.attempts);
      const byAdmin = counting?.source === "manual";
      return {
        quizId: q.id,
        title: q.title,
        kind: "ONLINE" as const,
        maxScore: q.maxScore,
        score: counting?.score ?? null,
        notes: null,
        gradedAt: byAdmin ? (admin?.gradedAt ?? null) : (bestGraded(q.attempts)?.gradedAt ?? null),
        sessionTitle: q.session?.title ?? null,
        sessionDate: q.session?.startsAt ?? null,
        attemptStatus: latest?.status ?? null,
        answersReleased: q.resultsReleasedAt !== null,
        adminScore: byAdmin && counting ? { score: counting.score, notes: admin?.notes ?? null } : null,
      };
    }),
  ];

  return rows.sort((a, b) => (b.sessionDate?.getTime() ?? 0) - (a.sessionDate?.getTime() ?? 0));
}

/**
 * The list, role-scoped.
 *
 * One route, two row shapes: staff get quizSummary, a STUDENT gets their own
 * results. The precedent is GET /seasons/:id/assignments, which already returns
 * a different row shape per role and whose client hook parses the student arm
 * specifically (Plan 1 Task 1). Collapsing v1's three list pages into one
 * endpoint is what fixes R108 (a leader with groups in two seasons saw one
 * season's quizzes measured against both seasons' students) and R109 (no season
 * picker existed at all).
 */
export async function listQuizzes(req: Request, res: Response) {
  const user = requireUser(req);

  const parsed = parseOr400(quizListQuerySchema, req.query, res, "Invalid query.");
  if (parsed === null) return;
  const { seasonId, sessionId, cursor, limit } = parsed;

  const resolvedSeasonId = seasonId ?? user.activeSeasonId;
  if (resolvedSeasonId === null || resolvedSeasonId === undefined) {
    // No season to talk about is an empty list, not an error — v1's student list
    // did the same for a student with no active season (R39).
    return apiOk(res, { items: [], nextCursor: null });
  }

  if (user.role === "STUDENT") {
    if (!(await canAccessSeason(user, resolvedSeasonId))) return forbidden(res);
    return apiOk(res, {
      items: await listQuizResultsForStudent(user.userId, resolvedSeasonId),
      nextCursor: null,
    });
  }

  const studentIds = await visibleStudentIdsForQuiz(user, resolvedSeasonId);
  if (studentIds === null) return forbidden(res);

  const rows = await db.quiz.findMany({
    where: {
      seasonId: resolvedSeasonId,
      ...(sessionId !== undefined ? { sessionId } : {}),
      ...(cursor !== undefined ? { id: { lt: cursor } } : {}),
    },
    orderBy: { id: "desc" },
    take: limit + 1,
    select: {
      id: true,
      title: true,
      kind: true,
      publishedAt: true,
      resultsReleasedAt: true,
      maxScore: true,
      sessionId: true,
      seasonId: true,
      season: { select: { code: true } },
      session: { select: { title: true, startsAt: true } },
      // _count only. v1 selected the whole `grades` relation ({ id: true } for
      // every row) purely to take .length (R98) — every grade row for the quiz,
      // fetched and discarded.
      _count: { select: { questions: true } },
    },
  });
  const page = rows.slice(0, limit);

  const gradedBy = await countGradedByQuiz(page, studentIds);

  return apiOk(res, {
    items: page.map((q) => ({
      id: q.id,
      title: q.title,
      kind: q.kind,
      publishedAt: q.publishedAt,
      questionCount: q._count.questions,
      maxScore: q.maxScore,
      sessionId: q.sessionId,
      sessionTitle: q.session?.title ?? null,
      sessionDate: q.session?.startsAt ?? null,
      seasonId: q.seasonId,
      seasonCode: q.season.code,
      gradedCount: gradedBy.get(q.id) ?? 0,
      studentCount: studentIds.length,
      answersReleasedAt: q.resultsReleasedAt,
    })),
    nextCursor: rows.length > limit ? (page[page.length - 1]?.id ?? null) : null,
  });
}
