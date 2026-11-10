import type { Request, Response } from "express";

import { db } from "../../db/client";
import { apiOk, forbidden } from "../../lib/api-response";
import { canManageSessionVideo, staffScopeForSeason } from "../../lib/permissions";
import { loadVideoQuizResults } from "../../lib/queries/video-quiz";
import { requireUser } from "../../middleware/require-auth";
import { ADMIN_SELECT, deleteQuestionCountingResponses, updateAndRegrade } from "../../lib/video-quiz/questions";
import { videoQuestionInputSchema } from "../../../../../packages/shared/src/index";
import { idParam } from "../../lib/http/params";
import { notFound } from "../../lib/http/not-found";
import { parseOr400 } from "../../lib/http/validate";

/** The admin row shape — the only place `correctIndex` may be selected. */

function toAdminRow(q: {
  id: number;
  atSeconds: number;
  prompt: string;
  options: string[];
  correctIndex: number;
  points: number;
  _count: { responses: number };
}) {
  return {
    id: q.id,
    atSeconds: q.atSeconds,
    prompt: q.prompt,
    options: q.options,
    correctIndex: q.correctIndex,
    points: q.points,
    responseCount: q._count.responses,
  };
}

export async function listVideoQuestions(req: Request, res: Response) {
  const user = requireUser(req);
  const sessionId = idParam(res, req.params.id, "session");
  if (sessionId === null) return;

  const session = await db.session.findUnique({ where: { id: sessionId }, select: { id: true } });
  if (!session) return notFound(res, "Session");
  // This read carries correctIndex for every question. v1's query authorizes
  // nothing and the admin page is the only gate (spec 13 R68/R73).
  if (!(await canManageSessionVideo(user, sessionId))) return forbidden(res);

  const rows = await db.sessionVideoQuestion.findMany({
    where: { sessionId },
    orderBy: [{ atSeconds: "asc" }, { id: "asc" }],
    select: ADMIN_SELECT,
  });
  return apiOk(res, { questions: rows.map(toAdminRow) });
}

export async function createVideoQuestion(req: Request, res: Response) {
  const user = requireUser(req);
  const sessionId = idParam(res, req.params.id, "session");
  if (sessionId === null) return;

  const session = await db.session.findUnique({ where: { id: sessionId }, select: { id: true } });
  if (!session) return notFound(res, "Session");
  // Gate before parsing (v1 R2): an unauthorized caller gets a refusal, not a
  // validation message.
  if (!(await canManageSessionVideo(user, sessionId))) return forbidden(res);

  const parsed = parseOr400(videoQuestionInputSchema, req.body, res, "Invalid question.");
  if (parsed === null) return;
  const body = parsed;

  // createdById is stamped on create only — there is no updatedById column,
  // so it means "who first authored this". Deliberately
  // no check that the session has a youtubeUrl or that atSeconds fits the video
  // (v1 R14/R18; the length is not stored). The client guards the deadlock.
  const created = await db.sessionVideoQuestion.create({
    data: {
      sessionId,
      atSeconds: body.atSeconds,
      prompt: body.prompt,
      options: body.options,
      correctIndex: body.correctIndex,
      points: body.points,
      createdById: user.userId,
    },
    select: ADMIN_SELECT,
  });
  return apiOk(res, { question: toAdminRow(created) }, 201);
}

export async function updateVideoQuestion(req: Request, res: Response) {
  const user = requireUser(req);
  const questionId = idParam(res, req.params.questionId, "question");
  if (questionId === null) return;

  const existing = await db.sessionVideoQuestion.findUnique({
    where: { id: questionId },
    select: { id: true, sessionId: true, options: true, correctIndex: true, points: true },
  });
  if (!existing) return notFound(res, "Question");
  if (!(await canManageSessionVideo(user, existing.sessionId))) return forbidden(res);

  const parsed = parseOr400(videoQuestionInputSchema, req.body, res, "Invalid question.");
  if (parsed === null) return;
  const body = parsed;

  const keyChanged =
    body.correctIndex !== existing.correctIndex ||
    body.options.length !== existing.options.length ||
    body.options.some((o, i) => o !== existing.options[i]);

  // Re-grade in the same transaction as the edit (spec 13 §10 D5). v1 changes
  // the key and leaves every recorded verdict frozen at its old value, so a
  // corrected answer key leaves every prior grade wrong — and shrinking the
  // options can strand a selectedIndex that is now out of range (R8/R9).
  const { question, regradedCount } = await updateAndRegrade(questionId, body, keyChanged);

  return apiOk(res, {
    question: toAdminRow(question),
    regradedCount,
    // Points are never stored on a response (there is no pointsAwarded column),
    // so nothing needs re-grading when they change — but every student's score
    // moved, and the admin should be told rather than left to notice.
    pointsChanged: body.points !== existing.points,
  });
}

export async function deleteVideoQuestion(req: Request, res: Response) {
  const user = requireUser(req);
  const questionId = idParam(res, req.params.questionId, "question");
  if (questionId === null) return;

  const existing = await db.sessionVideoQuestion.findUnique({
    where: { id: questionId },
    select: { id: true, sessionId: true },
  });
  if (!existing) return notFound(res, "Question");
  if (!(await canManageSessionVideo(user, existing.sessionId))) return forbidden(res);

  // The database cascade removes the responses; the count exists so the client
  // can warn before and confirm after. SessionVideoProgress is deliberately left
  // alone (v1 R11): there is no soft-delete column to do better with.
  const responsesRemoved = await deleteQuestionCountingResponses(questionId);

  return apiOk(res, { deleted: true as const, responsesRemoved });
}

export async function getVideoQuizResults(req: Request, res: Response) {
  const user = requireUser(req);
  const sessionId = idParam(res, req.params.id, "session");
  if (sessionId === null) return;

  const session = await db.session.findUnique({
    where: { id: sessionId },
    select: { seasonId: true },
  });
  if (!session) return notFound(res, "Session");

  // The existing scope helper, so a leader's roster is identical here and on
  // the attendance screen.
  const scope = await staffScopeForSeason(user, session.seasonId);
  if (scope === null) return forbidden(res);

  const data = await loadVideoQuizResults(sessionId, scope.kind === "groups" ? scope.groupIds : undefined);
  if (data === null) return notFound(res, "Session");
  return apiOk(res, data);
}
