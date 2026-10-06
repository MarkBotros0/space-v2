import { Router } from "express";

import { db } from "../db/client";
import { apiOk, apiError } from "../lib/api-response";
import { parseId } from "../lib/parse-id";
import { canAccessSeason, canManageQuiz } from "../lib/permissions";
import { visibleStudentIdsForQuiz } from "../lib/quiz-scope";
import { isAdminOfSeason } from "../lib/rbac";
import { requireAuth, requireUser } from "../middleware/require-auth";
import {
  createQuizRequestSchema,
  quizListQuerySchema,
  updateQuizRequestSchema,
} from "../../../../packages/shared/src/index";

export const quizzesRouter = Router();

quizzesRouter.use(requireAuth);

/**
 * The student's own results — v1's listQuizResultsForStudent, ported.
 *
 * PAPER rows start from QuizGrade, so a paper quiz stays invisible until it is
 * graded (R36); ONLINE rows start from Quiz filtered to published, so they
 * appear as soon as they are available, attempted or not (R37). Merged by
 * session date descending, a null date sunk to the bottom (R38).
 */
async function listQuizResultsForStudent(studentUserId: number, seasonId: number) {
  const [grades, onlineQuizzes] = await Promise.all([
    db.quizGrade.findMany({
      where: { studentUserId, quiz: { seasonId, kind: "PAPER" } },
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
        session: { select: { title: true, startsAt: true } },
        attempts: {
          where: { studentUserId },
          orderBy: { attemptNumber: "desc" },
          take: 1,
          select: { status: true, totalScore: true, gradedAt: true },
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
      score: g.score,
      notes: g.notes,
      gradedAt: g.gradedAt,
      sessionTitle: g.quiz.session?.title ?? null,
      sessionDate: g.quiz.session?.startsAt ?? null,
      attemptStatus: null,
    })),
    ...onlineQuizzes.map((q) => {
      const attempt = q.attempts[0];
      const status = attempt?.status ?? null;
      return {
        quizId: q.id,
        title: q.title,
        kind: "ONLINE" as const,
        maxScore: q.maxScore,
        // Only a GRADED attempt has a score to show (R37).
        score: status === "GRADED" ? (attempt?.totalScore ?? null) : null,
        notes: null,
        gradedAt: attempt?.gradedAt ?? null,
        sessionTitle: q.session?.title ?? null,
        sessionDate: q.session?.startsAt ?? null,
        attemptStatus: status,
      };
    }),
  ];

  return rows.sort((a, b) => (b.sessionDate?.getTime() ?? 0) - (a.sessionDate?.getTime() ?? 0));
}

/**
 * Create a quiz.
 *
 * POST /api/v1/quizzes with seasonId in the BODY, not
 * POST /api/v1/seasons/:id/quizzes. Every quiz route lives in this one file, so
 * creation cannot hang off the seasons router — the same recorded deviation
 * Plan 3 made for POST /api/v1/sessions, for the same file-disjointness reason.
 * Do not "fix" it back to a nested path without moving the whole domain.
 */
quizzesRouter.post("/", async (req, res) => {
  const user = requireUser(req);

  const parsed = createQuizRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid quiz body.", 400);
  const body = parsed.data;

  // R1: creating is a season-admin power. isAdminOfSeason short-circuits SUPER
  // and pairs the claim with the role that can hold it (ruling C7).
  if (!isAdminOfSeason(user, body.seasonId)) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const season = await db.season.findFirst({
    where: { id: body.seasonId, deletedAt: null },
    select: { id: true },
  });
  if (!season) return apiError(res, "not_found", "Season not found.", 404);

  if (body.sessionId !== null) {
    // R7: v1 wrote both ids side by side and checked nothing — the pair was
    // consistent only because one component passed both from the same page.
    const session = await db.session.findUnique({
      where: { id: body.sessionId },
      select: { seasonId: true },
    });
    if (!session) return apiError(res, "not_found", "Session not found.", 404);
    if (session.seasonId !== body.seasonId) {
      return apiError(res, "session_not_in_season", "That session is in another season.", 400);
    }
  }

  const quiz = await db.quiz.create({
    data: {
      seasonId: body.seasonId,
      sessionId: body.sessionId,
      title: body.title,
      kind: body.kind,
      // PAPER: the author's number. ONLINE: 0, then derived from question points
      // on every question write (R4, R11).
      maxScore: body.kind === "PAPER" ? (body.maxScore as number) : 0,
      createdById: user.userId,
    },
    select: { id: true },
  });

  return apiOk(res, { id: quiz.id }, 201);
});

quizzesRouter.patch("/:id", async (req, res) => {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid quiz id.", 400);

  const quiz = await db.quiz.findUnique({
    where: { id },
    select: { id: true, seasonId: true, kind: true },
  });
  if (!quiz) return apiError(res, "not_found", "Quiz not found.", 404);
  if (!(await canManageQuiz(user, id))) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const parsed = updateQuizRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid quiz body.", 400);
  const body = parsed.data;

  if (body.maxScore !== undefined) {
    if (quiz.kind !== "PAPER") {
      return apiError(
        res,
        "wrong_quiz_kind",
        "An online quiz derives its max score from its questions.",
        409,
      );
    }
    const grades = await db.quizGrade.count({ where: { quizId: id } });
    if (grades > 0) {
      return apiError(res, "quiz_has_grades", "This quiz already has grades.", 409);
    }
  }

  if (body.sessionId !== undefined && body.sessionId !== null) {
    const session = await db.session.findUnique({
      where: { id: body.sessionId },
      select: { seasonId: true },
    });
    if (!session) return apiError(res, "not_found", "Session not found.", 404);
    if (session.seasonId !== quiz.seasonId) {
      return apiError(res, "session_not_in_season", "That session is in another season.", 400);
    }
  }

  await db.quiz.update({
    where: { id },
    data: {
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.maxScore !== undefined ? { maxScore: body.maxScore } : {}),
      ...(body.sessionId !== undefined ? { sessionId: body.sessionId } : {}),
    },
  });

  return apiOk(res, { updated: true });
});

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
quizzesRouter.get("/", async (req, res) => {
  const user = requireUser(req);

  const parsed = quizListQuerySchema.safeParse(req.query);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid query.", 400);
  const { seasonId, sessionId, cursor, limit } = parsed.data;

  const resolvedSeasonId = seasonId ?? user.activeSeasonId;
  if (resolvedSeasonId === null || resolvedSeasonId === undefined) {
    // No season to talk about is an empty list, not an error — v1's student list
    // did the same for a student with no active season (R39).
    return apiOk(res, { items: [], nextCursor: null });
  }

  if (user.role === "STUDENT") {
    if (!(await canAccessSeason(user, resolvedSeasonId))) {
      return apiError(res, "forbidden", "You don't have access to this.", 403);
    }
    return apiOk(res, {
      items: await listQuizResultsForStudent(user.userId, resolvedSeasonId),
      nextCursor: null,
    });
  }

  const studentIds = await visibleStudentIdsForQuiz(user, resolvedSeasonId);
  if (studentIds === null) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

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
  const quizIds = page.map((q) => q.id);

  // ONE definition of "graded", computed once, server-side (ruling C4; spec
  // D10). PAPER: a grade row with a real score. ONLINE: an attempt that reached
  // GRADED — v1's dashboards never consulted QuizAttempt at all, so every ONLINE
  // quiz read as permanently pending (R114).
  const [paperGraded, onlineGraded] = await Promise.all([
    db.quizGrade.groupBy({
      by: ["quizId"],
      where: { quizId: { in: quizIds }, studentUserId: { in: studentIds }, score: { not: null } },
      _count: { _all: true },
    }),
    db.quizAttempt.groupBy({
      by: ["quizId"],
      where: { quizId: { in: quizIds }, studentUserId: { in: studentIds }, status: "GRADED" },
      _count: { _all: true },
    }),
  ]);
  const paperBy = new Map(paperGraded.map((g) => [g.quizId, g._count._all]));
  const onlineBy = new Map(onlineGraded.map((g) => [g.quizId, g._count._all]));

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
      gradedCount: (q.kind === "PAPER" ? paperBy.get(q.id) : onlineBy.get(q.id)) ?? 0,
      studentCount: studentIds.length,
    })),
    nextCursor: rows.length > limit ? (page[page.length - 1]?.id ?? null) : null,
  });
});
