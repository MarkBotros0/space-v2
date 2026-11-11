import type { Request, Response } from "express";

import { db } from "../../db/client";
import { apiOk, forbidden } from "../../lib/api-response";
import { liveAssignment } from "../../lib/db/live";
import { canManageAssignment, canManageSessionVideo, staffScopeForSeason } from "../../lib/permissions";
import { loadVideoQuizResults } from "../../lib/queries/video-quiz";
import { requireUser } from "../../middleware/require-auth";
import {
  assertInsideVideo,
  createQuestionFor,
  deleteQuestionCountingResponses,
  listQuestionsFor,
  toAdminRow,
  updateAndRegrade,
} from "../../lib/video-quiz/questions";
import { deletePartQuestion } from "../../lib/assignments/part-questions";
import { videoQuestionInputSchema } from "../../../../../packages/shared/src/index";
import { idParam } from "../../lib/http/params";
import { notFound } from "../../lib/http/not-found";
import { parseOr400 } from "../../lib/http/validate";

type Gate = { maxSeconds: number | null } | null;

/**
 * Who may edit or delete a question: for a session's, an admin of its season
 * (canManageSessionVideo); for a video part's, whoever manages the
 * assignment's season (canManageAssignment), and only while the assignment is
 * live. A part's question must also stay inside the video, whose length is
 * stored (a session's is not). Null is a refusal.
 */
async function questionGate(
  user: ReturnType<typeof requireUser>,
  q: { sessionId: number | null; assignmentPartId: number | null },
): Promise<Gate> {
  if (q.sessionId !== null) return (await canManageSessionVideo(user, q.sessionId)) ? { maxSeconds: null } : null;
  if (q.assignmentPartId === null) return null;
  const part = await db.assignmentPart.findFirst({
    where: { id: q.assignmentPartId, assignment: liveAssignment },
    select: { durationSeconds: true, assignment: { select: { seasonId: true } } },
  });
  if (!part || !canManageAssignment(user, part.assignment.seasonId)) return null;
  return { maxSeconds: part.durationSeconds };
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

  return apiOk(res, { questions: await listQuestionsFor({ sessionId }) });
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

  // Deliberately no check that the session has a youtubeUrl or that atSeconds
  // fits the video (v1 R14/R18; the length is not stored). The client guards
  // the deadlock.
  return apiOk(res, { question: await createQuestionFor({ sessionId }, parsed, user.userId) }, 201);
}

export async function updateVideoQuestion(req: Request, res: Response) {
  const user = requireUser(req);
  const questionId = idParam(res, req.params.questionId, "question");
  if (questionId === null) return;

  const existing = await db.sessionVideoQuestion.findUnique({
    where: { id: questionId },
    select: { id: true, sessionId: true, assignmentPartId: true, options: true, correctIndex: true, points: true },
  });
  if (!existing) return notFound(res, "Question");
  const gate = await questionGate(user, existing);
  if (gate === null) return forbidden(res);

  const parsed = parseOr400(videoQuestionInputSchema, req.body, res, "Invalid question.");
  if (parsed === null) return;
  const body = parsed;
  assertInsideVideo(body.atSeconds, gate.maxSeconds);

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
    select: { id: true, sessionId: true, assignmentPartId: true },
  });
  if (!existing) return notFound(res, "Question");
  if ((await questionGate(user, existing)) === null) return forbidden(res);

  // The database cascade removes the responses; the count exists so the client
  // can warn before and confirm after. A session's SessionVideoProgress is
  // deliberately left alone (v1 R11). A video part's students are settled under
  // the assignment's lock (ruling I1): the question changed who is done.
  const responsesRemoved =
    existing.assignmentPartId === null
      ? await deleteQuestionCountingResponses(questionId)
      : await deletePartQuestion(questionId, existing.assignmentPartId);

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
