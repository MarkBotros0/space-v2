import { Router, type Request, type Response } from "express";

import { db } from "../db/client";
// A VALUE import: the P2002 branch below needs the PrismaClientKnownRequestError
// class at runtime. `db/client.ts` builds the client from this same module.
import { Prisma } from "../generated/prisma/client";
import { apiError, apiOk } from "../lib/api-response";
import { parseId } from "../lib/parse-id";
// Task 4 adds canManageSessionVideo and staffScopeForSeason to this import.
import { hasActiveEnrollment } from "../lib/permissions";
import { loadStudentVideoQuiz } from "../lib/queries/video-quiz";
// requireAuth is passed to every route individually — this router shares the
// /api/v1 prefix (ruling X5).
import { requireAuth, requireUser } from "../middleware/require-auth";
import {
  submitVideoAnswerRequestSchema,
  videoProgressRequestSchema,
} from "../../../../packages/shared/src/index";

/**
 * Domain 13. Mounted at /api/v1 rather than under a single prefix because the
 * surface spans two parents: the student and authoring reads hang off a
 * session (`/sessions/:id/video-*`) while update and delete address a question
 * directly (`/video-questions/:questionId`).
 *
 * Because the prefix is shared, `requireAuth` is attached to each route, never
 * with `videoQuizRouter.use(...)` (ruling X5): a router-wide guard here would
 * answer 401 for every unknown /api/v1 path and re-run auth for every router
 * mounted after it.
 *
 * Nothing here belongs to domain 12. Text quizzes own Quiz/QuizQuestion/
 * QuizAttempt/QuizAnswer/QuizGrade; this owns SessionVideoQuestion/
 * SessionVideoQuestionResponse/SessionVideoProgress. They share no table.
 */
export const videoQuizRouter = Router();

/**
 * The student gate, in one place: STUDENT role, session exists, ACTIVE
 * enrolment in its season. Returns the session's seasonId, or null after
 * having already answered the request.
 */
async function requireStudentOnSession(
  req: Request,
  res: Response,
  sessionId: number,
): Promise<{ seasonId: number } | null> {
  const user = requireUser(req);
  const session = await db.session.findUnique({
    where: { id: sessionId },
    select: { seasonId: true },
  });
  if (!session) {
    apiError(res, "not_found", "Session not found.", 404);
    return null;
  }
  // Role first, then enrolment. v1 looked the question up before checking the
  // role, which let any authenticated caller tell an existing question id from
  // a missing one (spec 13 R52).
  if (!(await hasActiveEnrollment(user, session.seasonId))) {
    apiError(res, "forbidden", "You don't have access to this.", 403);
    return null;
  }
  return session;
}

videoQuizRouter.get("/sessions/:id/video-quiz", requireAuth, async (req, res) => {
  const user = requireUser(req);
  const sessionId = parseId(req.params.id);
  if (sessionId === null) return apiError(res, "bad_request", "Invalid session id.", 400);

  const gate = await requireStudentOnSession(req, res, sessionId);
  if (gate === null) return undefined;

  const data = await loadStudentVideoQuiz(sessionId, user.userId);
  if (data === null) return apiError(res, "not_found", "Session not found.", 404);

  return apiOk(res, {
    videoId: data.videoId,
    youtubeUrl: data.youtubeUrl,
    questions: data.questions,
    furthestSeconds: data.furthestSeconds,
    completedAt: data.completedAt,
    earnedPoints: data.earnedPoints,
    totalPoints: data.totalPoints,
    answeredCount: data.answeredCount,
    nextQuestionId: data.nextQuestionId,
  });
});

videoQuizRouter.post("/sessions/:id/video-quiz/answers", requireAuth, async (req, res) => {
  const user = requireUser(req);
  const sessionId = parseId(req.params.id);
  if (sessionId === null) return apiError(res, "bad_request", "Invalid session id.", 400);

  const gate = await requireStudentOnSession(req, res, sessionId);
  if (gate === null) return undefined;

  const parsed = submitVideoAnswerRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid answer.", 400);
  const body = parsed.data;

  // Scoping the lookup by sessionId is what makes a mismatched pair a 404
  // rather than a silent success (spec 13 §7).
  const question = await db.sessionVideoQuestion.findFirst({
    where: { id: body.questionId, sessionId },
    select: { id: true, atSeconds: true, options: true, correctIndex: true },
  });
  if (!question) return apiError(res, "not_found", "Question not found.", 404);

  // Range from the row, never from the client (v1 R53).
  if (body.selectedIndex >= question.options.length) {
    return apiError(res, "invalid_answer", "That is not one of the options.", 400);
  }

  const data = await loadStudentVideoQuiz(sessionId, user.userId);
  if (data === null) return apiError(res, "not_found", "Session not found.", 404);

  // Replay before ordering: re-answering an earlier question must replay the
  // recorded verdict, not 409.
  const existing = await db.sessionVideoQuestionResponse.findUnique({
    where: {
      questionId_studentUserId: { questionId: question.id, studentUserId: user.userId },
    },
    select: { isCorrect: true },
  });
  if (existing) {
    return apiOk(res, {
      isCorrect: existing.isCorrect,
      correctIndex: question.correctIndex,
      furthestSeconds: data.furthestSeconds,
      completedAt: data.completedAt,
      nextQuestionId: data.nextQuestionId,
    });
  }

  // The ordering gate (D-13.2): only the earliest unanswered question.
  if (data.nextQuestionId !== question.id) {
    return apiError(res, "out_of_order", "Answer the earlier questions first.", 409);
  }

  const isCorrect = body.selectedIndex === question.correctIndex;
  const isLast = data.answeredCount + 1 === data.questions.length;

  let progress: { furthestSeconds: number; completedAt: Date | null };
  try {
    progress = await db.$transaction(async (tx) => {
      await tx.sessionVideoQuestionResponse.create({
        data: {
          questionId: question.id,
          studentUserId: user.userId,
          selectedIndex: body.selectedIndex,
          isCorrect,
        },
      });
      const current = await tx.sessionVideoProgress.findUnique({
        where: { sessionId_studentUserId: { sessionId, studentUserId: user.userId } },
        select: { furthestSeconds: true, completedAt: true },
      });
      // Math.max, never `{ set: ... }`. v1 wrote the question's atSeconds
      // absolutely (spec 13 R57), twenty lines above a comment promising
      // furthestSeconds "only ever moves forward" — unreachable through its own
      // UI because the barrier forced ascending order, trivially reachable
      // through an API.
      const furthestSeconds = Math.max(current?.furthestSeconds ?? 0, question.atSeconds);
      // Completion is derived here and asserted nowhere (spec 13 D3).
      const completedAt = current?.completedAt ?? (isLast ? new Date() : null);
      return tx.sessionVideoProgress.upsert({
        where: { sessionId_studentUserId: { sessionId, studentUserId: user.userId } },
        create: { sessionId, studentUserId: user.userId, furthestSeconds, completedAt },
        update: { furthestSeconds, completedAt },
        select: { furthestSeconds: true, completedAt: true },
      });
    });
  } catch (err) {
    // The unique index on (questionId, studentUserId) IS the "one answer, no
    // retries" rule. A double tap losing that race must read as the answer it
    // already recorded, not as a 500 (spec 13 §10 D14).
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const recorded = await db.sessionVideoQuestionResponse.findUnique({
        where: {
          questionId_studentUserId: { questionId: question.id, studentUserId: user.userId },
        },
        select: { isCorrect: true },
      });
      const after = await loadStudentVideoQuiz(sessionId, user.userId);
      return apiOk(res, {
        isCorrect: recorded?.isCorrect ?? isCorrect,
        correctIndex: question.correctIndex,
        furthestSeconds: after?.furthestSeconds ?? 0,
        completedAt: after?.completedAt ?? null,
        nextQuestionId: after?.nextQuestionId ?? null,
      });
    }
    throw err;
  }

  // The id after this one in the ordered list, or null when this was the last.
  const index = data.questions.findIndex((q) => q.id === question.id);
  const nextQuestionId = isLast ? null : (data.questions[index + 1]?.id ?? null);

  // `correctIndex` here is the only path by which the answer key reaches a
  // student, and only for the question they just answered — safe because the
  // first answer is final.
  return apiOk(res, {
    isCorrect,
    correctIndex: question.correctIndex,
    furthestSeconds: progress.furthestSeconds,
    completedAt: progress.completedAt,
    nextQuestionId,
  });
});

videoQuizRouter.put("/sessions/:id/video-quiz/progress", requireAuth, async (req, res) => {
  const user = requireUser(req);
  const sessionId = parseId(req.params.id);
  if (sessionId === null) return apiError(res, "bad_request", "Invalid session id.", 400);

  const gate = await requireStudentOnSession(req, res, sessionId);
  if (gate === null) return undefined;

  const parsed = videoProgressRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid progress.", 400);

  // PUT, not PATCH: the write is idempotent and monotone, so repeating it with
  // the same value is a no-op — which matters under React Query's
  // refetch-on-focus behaviour. Read-then-write inside a transaction, because
  // v1 did it outside one and two concurrent saves (visibilitychange and
  // unmount fire together) could persist the lower value (spec 13 R64).
  const progress = await db.$transaction(async (tx) => {
    const current = await tx.sessionVideoProgress.findUnique({
      where: { sessionId_studentUserId: { sessionId, studentUserId: user.userId } },
      select: { furthestSeconds: true, completedAt: true },
    });
    const furthestSeconds = Math.max(current?.furthestSeconds ?? 0, parsed.data.furthestSeconds);
    return tx.sessionVideoProgress.upsert({
      where: { sessionId_studentUserId: { sessionId, studentUserId: user.userId } },
      // completedAt is untouched on both branches. This endpoint cannot set it
      // and cannot clear it: the answer endpoint derives it (spec 13 D3), and
      // v1's client-asserted boolean does not exist on the contract at all.
      create: { sessionId, studentUserId: user.userId, furthestSeconds },
      update: { furthestSeconds },
      select: { furthestSeconds: true, completedAt: true },
    });
  });

  return apiOk(res, progress);
});
