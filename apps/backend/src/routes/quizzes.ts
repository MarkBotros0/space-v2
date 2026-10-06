import { Router } from "express";

import type { QuizQuestionStudent, StudentQuizDetail } from "@space/shared";

import { db } from "../db/client";
import type { Prisma } from "../generated/prisma/client";
import { apiOk, apiError } from "../lib/api-response";
import { parseId } from "../lib/parse-id";
import { createNotificationsBulk } from "../lib/notifications";
import { canAccessSeason, canGradeQuiz, canManageQuiz } from "../lib/permissions";
import { visibleStudentIdsForQuiz } from "../lib/quiz-scope";
import { isAdminOfSeason } from "../lib/rbac";
import { requireAuth, requireUser } from "../middleware/require-auth";
import {
  createQuizRequestSchema,
  gradeEssayAnswersRequestSchema,
  quizAttemptsQuerySchema,
  reopenAttemptRequestSchema,
  publishQuizRequestSchema,
  quizListQuerySchema,
  quizQuestionRequestSchema,
  reorderQuestionsRequestSchema,
  saveQuizAnswersRequestSchema,
  saveQuizGradesRequestSchema,
  updateQuizRequestSchema,
} from "../../../../packages/shared/src/index";

export const quizzesRouter = Router();

/**
 * v1's exact link for every QUIZ_GRADED row — `quiz-actions.ts:167,483,554`
 * all write the bare list path. Ruling X1: every plan writes v1's link format,
 * because v1 renders these same rows from the shared database today and a
 * v2-only path would be a dead link in v1. Plan 13's link parser maps this
 * shape to the mobile `/quizzes` tab; any remap is Plan 18's cutover backfill.
 * Do not "improve" it to a per-quiz path here.
 */
const QUIZ_GRADED_LINK = "/student/quizzes";

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
 * quiz looked like when it was taken; answer snapshots would be a schema change
 * and are therefore blocked (C1). So the cheap correct version is: freeze.
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
  req: Parameters<typeof requireUser>[0],
  res: Parameters<typeof apiOk>[0],
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
    apiError(res, "forbidden", "You don't have access to this.", 403);
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
    apiError(
      res,
      "quiz_has_attempts",
      "Students have started this quiz, so its questions can no longer change.",
      409,
    );
    return null;
  }
  return quiz;
}

quizzesRouter.post("/:id/questions", async (req, res) => {
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
      select: {
        id: true, order: true, type: true, prompt: true, points: true,
        options: true, correctIndex: true,
      },
    });
    await recomputeMaxScore(tx, id);
    return question;
  });

  return apiOk(res, created, 201);
});

quizzesRouter.patch("/:id/questions/:questionId", async (req, res) => {
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
      select: {
        id: true, order: true, type: true, prompt: true, points: true,
        options: true, correctIndex: true,
      },
    });
    await recomputeMaxScore(tx, id);
    return question;
  });

  return apiOk(res, updated);
});

quizzesRouter.delete("/:id/questions/:questionId", async (req, res) => {
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
});

/**
 * Reorder. New in v2 — v1 had no reorder action, no drag handle, and no `order`
 * on its update path (R20), so the only way to move a question was to delete
 * and re-add it, which under D3's freeze would now be impossible.
 */
quizzesRouter.put("/:id/questions/order", async (req, res) => {
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
      select: {
        id: true, order: true, type: true, prompt: true, points: true,
        options: true, correctIndex: true,
      },
    });
  });

  return apiOk(res, { questions });
});

quizzesRouter.post("/:id/publish", async (req, res) => {
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
      return apiError(
        res, "mcq_without_answer", "Every multiple-choice question needs a correct answer.", 409,
      );
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

  const updated = await db.quiz.update({
    where: { id },
    data: { publishedAt: parsed.data.publish ? new Date() : null },
    select: { publishedAt: true },
  });

  return apiOk(res, { publishedAt: updated.publishedAt });
});

/**
 * The student projection.
 *
 * NEVER SELECTS correctIndex. v1's equivalent had exactly this property and
 * said so in a comment (quiz-query.ts:373-374) — but it lived in the same file
 * as the two reads that DO return the key, so the protection was one "let's
 * reuse this query" refactor away from evaporating.
 *
 * What protects it here, stated exactly (no stronger claim):
 * 1. The raw-JSON integration test above — the guarantee. It fails on any
 *    path by which the key reaches the response.
 * 2. `toStudentQuestion` below returns an object LITERAL typed as the shared
 *    `QuizQuestionStudent`, so TypeScript's excess-property check rejects a
 *    `correctIndex: q.correctIndex` line added to it. It does NOT catch a
 *    spread (`...q`) or a select widened and passed through some other way —
 *    structural typing allows extra keys on non-literals — which is why (1)
 *    exists and is the one that must never be weakened.
 * The loader's return type is `StudentQuizDetailRow`: the shared wire type
 * with its two timestamps as `Date` (the backend hands Dates to res.json()).
 */
type StudentQuizDetailRow = Omit<StudentQuizDetail, "submittedAt" | "gradedAt"> & {
  submittedAt: Date | null;
  gradedAt: Date | null;
};

interface StudentQuestionSource {
  id: number;
  order: number;
  type: "MCQ" | "ESSAY";
  prompt: string;
  points: number;
  options: string[];
}
interface StudentAnswerSource {
  selectedIndex: number | null;
  text: string | null;
  isCorrect: boolean | null;
  pointsAwarded: number | null;
}

function toStudentQuestion(
  q: StudentQuestionSource,
  a: StudentAnswerSource | undefined,
): QuizQuestionStudent {
  return {
    id: q.id,
    order: q.order,
    type: q.type,
    prompt: q.prompt,
    points: q.points,
    options: q.options,
    selectedIndex: a?.selectedIndex ?? null,
    text: a?.text ?? null,
    // Null until submit (R52/R54), so nothing leaks mid-attempt.
    isCorrect: a?.isCorrect ?? null,
    pointsAwarded: a?.pointsAwarded ?? null,
  };
}

async function loadStudentQuizDetail(
  quizId: number,
  studentUserId: number,
): Promise<StudentQuizDetailRow | null> {
  const quiz = await db.quiz.findUnique({
    where: { id: quizId },
    select: {
      id: true,
      title: true,
      kind: true,
      seasonId: true,
      maxScore: true,
      publishedAt: true,
      session: { select: { title: true } },
      questions: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          order: true,
          type: true,
          prompt: true,
          points: true,
          options: true,
          // correctIndex is absent on purpose. Do not add it "for the review
          // screen" — the student's own isCorrect/pointsAwarded is the review.
        },
      },
    },
  });
  // R32: a non-ONLINE or unpublished quiz simply does not exist for a student.
  if (!quiz || quiz.kind !== "ONLINE" || quiz.publishedAt === null) return null;

  const attempt = await db.quizAttempt.findFirst({
    where: { quizId, studentUserId },
    orderBy: { attemptNumber: "desc" },
    select: {
      id: true,
      attemptNumber: true,
      status: true,
      totalScore: true,
      submittedAt: true,
      gradedAt: true,
      answers: {
        select: {
          questionId: true,
          selectedIndex: true,
          text: true,
          isCorrect: true,
          pointsAwarded: true,
        },
      },
    },
  });
  const answerByQuestion = new Map((attempt?.answers ?? []).map((a) => [a.questionId, a]));

  return {
    id: quiz.id,
    title: quiz.title,
    kind: quiz.kind,
    seasonId: quiz.seasonId,
    maxScore: quiz.maxScore,
    sessionTitle: quiz.session?.title ?? null,
    attemptId: attempt?.id ?? null,
    attemptNumber: attempt?.attemptNumber ?? 0,
    status: attempt?.status ?? null,
    // autoScore/manualScore deliberately absent: v1 sent both and rendered
    // neither. totalScore is the only score a student is shown.
    totalScore: attempt?.totalScore ?? null,
    submittedAt: attempt?.submittedAt ?? null,
    gradedAt: attempt?.gradedAt ?? null,
    questions: quiz.questions.map((q) => toStudentQuestion(q, answerByQuestion.get(q.id))),
  };
}

/** The authoring/grading projection — the answer key, for the audience that needs it. */
async function loadQuizAuthoringDetail(quizId: number, canManage: boolean) {
  const quiz = await db.quiz.findUnique({
    where: { id: quizId },
    select: {
      id: true,
      title: true,
      kind: true,
      seasonId: true,
      sessionId: true,
      publishedAt: true,
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
quizzesRouter.get("/:id", async (req, res) => {
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
    const detail = await loadStudentQuizDetail(id, user.userId);
    if (!detail) return apiError(res, "not_found", "Quiz not found.", 404);
    return apiOk(res, detail);
  }

  // Staff: grading needs the answer key (R103), and canGradeQuiz is the
  // audience that grades. canManage narrows further, to authoring.
  if (!(await canGradeQuiz(user, id))) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }
  const detail = await loadQuizAuthoringDetail(id, await canManageQuiz(user, id));
  if (!detail) return apiError(res, "not_found", "Quiz not found.", 404);
  return apiOk(res, detail);
});

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
quizzesRouter.put("/:id/attempt", async (req, res) => {
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
  if (!(await canAccessSeason(user, quiz.seasonId))) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

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

  const detail = await loadStudentQuizDetail(id, user.userId);
  if (!detail) return apiError(res, "not_found", "Quiz not found.", 404);
  return apiOk(res, detail);
});

/** Resolve the caller's live attempt, or answer and return null. */
async function resolveOpenAttempt(
  res: Parameters<typeof apiOk>[0],
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

quizzesRouter.patch("/:id/attempt", async (req, res) => {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid quiz id.", 400);
  if (user.role !== "STUDENT") {
    return apiError(res, "forbidden", "Only a student can take a quiz.", 403);
  }

  const parsed = saveQuizAnswersRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid answers.", 400);

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

  await db.$transaction(
    parsed.data.answers.map((answer) =>
      db.quizAnswer.upsert({
        where: { attemptId_questionId: { attemptId: attempt.id, questionId: answer.questionId } },
        create: {
          attemptId: attempt.id,
          questionId: answer.questionId,
          selectedIndex: answer.selectedIndex,
          text: answer.text,
        },
        // isCorrect and pointsAwarded are untouched — saving never grades (R54).
        update: { selectedIndex: answer.selectedIndex, text: answer.text },
      }),
    ),
  );

  return apiOk(res, { saved: parsed.data.answers.length });
});

quizzesRouter.post("/:id/attempt/submit", async (req, res) => {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid quiz id.", 400);
  if (user.role !== "STUDENT") {
    return apiError(res, "forbidden", "Only a student can take a quiz.", 403);
  }

  const attempt = await resolveOpenAttempt(res, id, user.userId);
  if (!attempt) return undefined;

  const quiz = await db.quiz.findUnique({ where: { id }, select: { title: true } });
  if (!quiz) return apiError(res, "not_found", "Quiz not found.", 404);

  const [questions, answers] = await Promise.all([
    db.quizQuestion.findMany({
      where: { quizId: id },
      select: { id: true, type: true, points: true, correctIndex: true },
    }),
    // Read INSIDE the request that scores them, unlike v1, which read the
    // answers off the attempt, validated, and then opened a transaction that
    // scored from the stale in-memory copy (R120).
    db.quizAnswer.findMany({
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
      return apiError(res, "attempt_incomplete", "Answer every question before submitting.", 409);
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

  await db.$transaction([
    ...scored.map((s) =>
      db.quizAnswer.update({
        where: { attemptId_questionId: { attemptId: attempt.id, questionId: s.questionId } },
        data: { isCorrect: s.isCorrect, pointsAwarded: s.pointsAwarded },
      }),
    ),
    db.quizAttempt.update({
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
    }),
  ]);

  if (!hasEssays) {
    // Best-effort, outside the transaction, and swallowed — the same shape as
    // submissions.ts's review notification. A mail failure must not report a
    // submitted quiz as failed.
    try {
      await createNotificationsBulk([user.userId], {
        type: "QUIZ_GRADED",
        title: `Quiz graded: ${quiz.title}`,
        body: "Your quiz was graded automatically.",
        // v1's exact link (ruling X1) — see QUIZ_GRADED_LINK below.
        link: QUIZ_GRADED_LINK,
      });
    } catch {
      // Swallowed deliberately; see above.
    }
  }

  const detail = await loadStudentQuizDetail(id, user.userId);
  if (!detail) return apiError(res, "not_found", "Quiz not found.", 404);
  return apiOk(res, detail);
});

quizzesRouter.get("/:id/attempts", async (req, res) => {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid quiz id.", 400);

  const quiz = await db.quiz.findUnique({
    where: { id },
    select: { id: true, title: true, kind: true, maxScore: true, seasonId: true },
  });
  if (!quiz) return apiError(res, "not_found", "Quiz not found.", 404);
  if (!(await canGradeQuiz(user, id))) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const parsed = quizAttemptsQuerySchema.safeParse(req.query);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid query.", 400);
  const { cursor, limit } = parsed.data;

  // Derived, never accepted (R105). visibleStudentIdsForQuiz returns them
  // sorted, so paging over the ids is stable and needs no second sort.
  const studentIds = await visibleStudentIdsForQuiz(user, quiz.seasonId);
  if (studentIds === null) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }
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
});

quizzesRouter.post("/:id/attempts/:attemptId/grade", async (req, res) => {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  const attemptId = parseId(req.params.attemptId);
  if (id === null || attemptId === null) return apiError(res, "bad_request", "Invalid id.", 400);

  const quiz = await db.quiz.findUnique({
    where: { id },
    select: { id: true, title: true, seasonId: true },
  });
  if (!quiz) return apiError(res, "not_found", "Quiz not found.", 404);
  if (!(await canGradeQuiz(user, id))) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

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
    try {
      await createNotificationsBulk([attempt.studentUserId], {
        type: "QUIZ_GRADED",
        title: `Quiz graded: ${quiz.title}`,
        body: "Your quiz has been graded.",
        link: QUIZ_GRADED_LINK,
      });
    } catch {
      // Best-effort; a transport failure must not fail the grade.
    }
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
});

/**
 * Grant a retake.
 *
 * Gated on canGradeQuiz, not canManageQuiz — spec D5's recommendation. v1 made
 * this admin-only (R79), so the leader actually looking at the grading screen
 * could see a student stuck behind a dead attempt and had to find an admin. And
 * because there is no expiry, no timeout and no ABANDONED status (R47, and
 * adding one is a schema change under C1), a dropped connection mid-quiz makes
 * this endpoint the ONLY way that student ever takes the quiz.
 */
quizzesRouter.post("/:id/attempts/reopen", async (req, res) => {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid quiz id.", 400);

  const quiz = await db.quiz.findUnique({
    where: { id },
    select: { id: true, title: true, seasonId: true, kind: true, publishedAt: true },
  });
  if (!quiz) return apiError(res, "not_found", "Quiz not found.", 404);
  if (!(await canGradeQuiz(user, id))) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

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
  // is no dedicated NotificationType and adding one is a schema change (C1), so
  // QUIZ_GRADED is reused with copy that says what actually happened — D5's
  // explicit second option.
  try {
    await createNotificationsBulk([parsed.data.studentUserId], {
      type: "QUIZ_GRADED",
      title: `You can retake: ${quiz.title}`,
      body: "Your quiz has been reopened, so you can take it again.",
      link: QUIZ_GRADED_LINK,
    });
  } catch {
    // Best-effort.
  }

  return apiOk(res, { attemptId: created.id, attemptNumber: created.attemptNumber }, 201);
});

/** Build the sheet for a scope. Shared by the GET and by the POST's response. */
async function buildGradeSheet(quizId: number, studentIds: number[]) {
  const quiz = await db.quiz.findUnique({
    where: { id: quizId },
    select: {
      id: true, title: true, kind: true, maxScore: true, seasonId: true,
      session: { select: { title: true } },
    },
  });
  if (!quiz) return null;

  const [students, grades] = await Promise.all([
    db.user.findMany({
      // R100: deleted users are not on the sheet; ordered by name.
      where: { id: { in: studentIds }, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.quizGrade.findMany({
      where: { quizId, studentUserId: { in: studentIds } },
      select: {
        studentUserId: true, score: true, notes: true, gradedAt: true,
        gradedBy: { select: { name: true } },
      },
    }),
  ]);
  const gradeBy = new Map(grades.map((g) => [g.studentUserId, g]));

  return {
    id: quiz.id,
    title: quiz.title,
    kind: quiz.kind,
    maxScore: quiz.maxScore,
    seasonId: quiz.seasonId,
    sessionTitle: quiz.session?.title ?? null,
    studentCount: studentIds.length,
    rows: students.map((s) => {
      const g = gradeBy.get(s.id);
      return {
        studentUserId: s.id,
        studentName: s.name,
        score: g?.score ?? null,
        notes: g?.notes ?? null,
        gradedAt: g?.gradedAt ?? null,
        gradedByName: g?.gradedBy?.name ?? null,
      };
    }),
  };
}

quizzesRouter.get("/:id/grades", async (req, res) => {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid quiz id.", 400);

  const quiz = await db.quiz.findUnique({ where: { id }, select: { seasonId: true } });
  if (!quiz) return apiError(res, "not_found", "Quiz not found.", 404);
  if (!(await canGradeQuiz(user, id))) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const studentIds = await visibleStudentIdsForQuiz(user, quiz.seasonId);
  if (studentIds === null) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const sheet = await buildGradeSheet(id, studentIds);
  if (!sheet) return apiError(res, "not_found", "Quiz not found.", 404);
  return apiOk(res, sheet);
});

/**
 * Save PAPER grades.
 *
 * The v1 action this replaces (saveQuizGradesAction) is the domain's
 * authorization hole, twice over:
 *
 *   (a) R86 — its season check was written
 *       `user.role === "LEADER" && !(await isLeaderInSeason(...))`, so an ADMIN
 *       of any season passed with no scope check whatsoever. Every other write
 *       in the domain routes through canManageQuiz/canGradeQuiz, both of which
 *       check the season. This one did not.
 *   (b) R93 — it then iterated the caller-supplied array and upserted every
 *       studentUserId verbatim, with no check that the student was in the
 *       caller's groups, in the quiz's season, or enrolled anywhere. The only
 *       scoping in the whole system was the array the PAGE passed to the READ.
 *
 * All three of D1's corrections are here: one gate for every role, a
 * server-derived visible set that every entry must be inside, and whole-batch
 * rejection so a client bug is loud rather than half-applied. The upserts and
 * deletes also share one transaction — v1 ran two sequential unbatched loops
 * (R95), so a failure at student 15 of 30 left half the class graded, some of
 * them notified, and returned an error as though nothing had happened.
 */
quizzesRouter.post("/:id/grades", async (req, res) => {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid quiz id.", 400);

  const quiz = await db.quiz.findUnique({
    where: { id },
    select: { id: true, title: true, kind: true, maxScore: true, seasonId: true },
  });
  if (!quiz) return apiError(res, "not_found", "Quiz not found.", 404);

  // (a) One gate, no role-conditional branch.
  if (!(await canGradeQuiz(user, id))) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  // R94/D10: a QuizGrade against an ONLINE quiz is invisible to the student and
  // counts everywhere else.
  if (quiz.kind !== "PAPER") {
    return apiError(res, "wrong_quiz_kind", "This is an online quiz — grade its attempts.", 409);
  }

  const parsed = saveQuizGradesRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid grade entries.", 400);

  // (b) Derived here, never taken from the request.
  const studentIds = await visibleStudentIdsForQuiz(user, quiz.seasonId);
  if (studentIds === null) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }
  const visible = new Set(studentIds);

  // (c) Validate the WHOLE batch before writing any of it.
  for (const entry of parsed.data.entries) {
    if (!visible.has(entry.studentUserId)) {
      return apiError(
        res, "student_not_in_scope", `Student ${entry.studentUserId} is not in your groups.`, 403,
      );
    }
    // R88/D7: the only bound in v1 was Math.min in the form, so an above-max
    // score stored fine and rendered as a >100% average in the student's own
    // list and in the season export.
    if (entry.score !== null && entry.score > quiz.maxScore) {
      return apiError(res, "score_exceeds_max", `This quiz is out of ${quiz.maxScore}.`, 400);
    }
  }

  const existing = await db.quizGrade.findMany({
    where: { quizId: id, studentUserId: { in: parsed.data.entries.map((e) => e.studentUserId) } },
    select: { studentUserId: true, score: true },
  });
  const previousScore = new Map(existing.map((g) => [g.studentUserId, g.score]));

  // One `now` for the whole batch, as v1 did (R91) — a batch is one act.
  const now = new Date();
  const writes = parsed.data.entries.map((entry) =>
    entry.score === null
      ? // Null CLEARS the row. v1 skipped null entries, so an existing grade
        // could never be removed — a typo was correctable, a grade against the
        // wrong student was not. deleteMany (not delete) so clearing an
        // already-absent row is a no-op rather than a P2025.
        db.quizGrade.deleteMany({ where: { quizId: id, studentUserId: entry.studentUserId } })
      : db.quizGrade.upsert({
          where: { quizId_studentUserId: { quizId: id, studentUserId: entry.studentUserId } },
          create: {
            quizId: id,
            studentUserId: entry.studentUserId,
            score: entry.score,
            notes: entry.notes,
            gradedById: user.userId,
            gradedAt: now,
          },
          update: {
            score: entry.score,
            notes: entry.notes,
            gradedById: user.userId,
            gradedAt: now,
          },
        }),
  );
  await db.$transaction(writes);

  // D8's single rule, shared with the essay path: a first grade or a changed
  // score notifies; a no-op re-save is silent. v1's two paths disagreed.
  const notifyIds = parsed.data.entries
    .filter((e) => e.score !== null && previousScore.get(e.studentUserId) !== e.score)
    .map((e) => e.studentUserId);
  if (notifyIds.length > 0) {
    try {
      await createNotificationsBulk(notifyIds, {
        type: "QUIZ_GRADED",
        title: `Quiz graded: ${quiz.title}`,
        body: "Your quiz has been graded.",
        link: QUIZ_GRADED_LINK,
      });
    } catch {
      // Best-effort, outside the transaction. v1 issued three queries per
      // student here, one student at a time (R96); createNotificationsBulk
      // batches the whole set.
    }
  }

  const sheet = await buildGradeSheet(id, studentIds);
  if (!sheet) return apiError(res, "not_found", "Quiz not found.", 404);
  return apiOk(res, sheet);
});
