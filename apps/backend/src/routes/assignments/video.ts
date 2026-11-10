import { Router, type Request, type Response } from "express";

import { db } from "../../db/client";
import { apiOk, forbidden } from "../../lib/api-response";
import { liveAssignment } from "../../lib/db/live";
import { notFound } from "../../lib/http/not-found";
import { idParam } from "../../lib/http/params";
import { parseOr400 } from "../../lib/http/validate";
import { canManageAssignment, hasActiveEnrollment } from "../../lib/permissions";
import { studentCanSeeAssignment } from "../../lib/queries/assignments";
import { loadStudentVideoQuiz } from "../../lib/queries/video-quiz";
import { answerVideoQuestionFor } from "../../lib/video-quiz/answer";
import { saveVideoPartProgress } from "../../lib/video-quiz/part-progress";
import { assertInsideVideo, createQuestionFor, listQuestionsFor } from "../../lib/video-quiz/questions";
import { requireAuth, requireUser } from "../../middleware/require-auth";
import {
  submitVideoAnswerRequestSchema,
  videoPartProgressRequestSchema,
  videoQuestionInputSchema,
} from "../../../../../packages/shared/src/index";

/**
 * A video part of an assignment: the student's player data, progress and
 * timed-question answers, and the admin's question authoring. Mounted at
 * /api/v1/assignments ahead of assignmentsRouter; `requireAuth` is attached
 * per route so an unknown path falls through to that router untouched.
 * Editing and deleting a question stay at /video-questions/:questionId
 * (videoQuizRouter), which serves both owners.
 */
export const assignmentVideoRouter = Router();

/** The part, if it is a video part of this live assignment. Answers 404 itself. */
async function findVideoPart(req: Request, res: Response) {
  const assignmentId = idParam(res, req.params.id, "assignment");
  if (assignmentId === null) return null;
  const partId = idParam(res, req.params.partId, "part");
  if (partId === null) return null;
  const part = await db.assignmentPart.findFirst({
    where: { id: partId, assignmentId, kind: "VIDEO", assignment: liveAssignment },
    select: { id: true, durationSeconds: true, assignment: { select: { seasonId: true } } },
  });
  if (!part) {
    notFound(res, "Part");
    return null;
  }
  return { partId: part.id, seasonId: part.assignment.seasonId, durationSeconds: part.durationSeconds };
}

/**
 * The student gates. Reading follows the assignment's own visibility rule
 * (`studentCanSeeAssignment`: a season participant, so a finished season's
 * student still sees their progress). Writing needs a live place in the season
 * (`hasActiveEnrollment`: an ACTIVE enrolment in an ACTIVE season), as on a
 * session's video; a finished season stays locked. Returns the part id, or
 * null after answering.
 */
async function studentPart(req: Request, res: Response, mode: "read" | "write"): Promise<number | null> {
  const part = await findVideoPart(req, res);
  if (part === null) return null;
  const user = requireUser(req);
  const allowed =
    mode === "write"
      ? await hasActiveEnrollment(user, part.seasonId)
      : user.role === "STUDENT" && (await studentCanSeeAssignment(user.userId, part.seasonId));
  if (!allowed) {
    forbidden(res);
    return null;
  }
  return part.partId;
}

/** The authoring gate: whoever manages the assignment's season. The question list carries the answer key. */
async function staffPart(req: Request, res: Response) {
  const part = await findVideoPart(req, res);
  if (part === null) return null;
  if (!canManageAssignment(requireUser(req), part.seasonId)) {
    forbidden(res);
    return null;
  }
  return part;
}

assignmentVideoRouter.get("/:id/parts/:partId/video", requireAuth, async (req, res) => {
  const partId = await studentPart(req, res, "read");
  if (partId === null) return;
  const data = await loadStudentVideoQuiz({ partId }, requireUser(req).userId);
  if (data === null || data.part === null) return notFound(res, "Part");
  return apiOk(res, {
    videoId: data.videoId,
    youtubeUrl: data.youtubeUrl,
    ...data.part,
    questions: data.questions,
    furthestSeconds: data.furthestSeconds,
    completedAt: data.completedAt,
    earnedPoints: data.earnedPoints,
    totalPoints: data.totalPoints,
    answeredCount: data.answeredCount,
    nextQuestionId: data.nextQuestionId,
  });
});

/**
 * PUT: the ranges that played since the last report. Idempotent for a repeated
 * report (the ranges are already watched); the server decides what counts.
 */
assignmentVideoRouter.put("/:id/parts/:partId/video/progress", requireAuth, async (req, res) => {
  const partId = await studentPart(req, res, "write");
  if (partId === null) return;
  const parsed = parseOr400(videoPartProgressRequestSchema, req.body, res, "Invalid progress.");
  if (parsed === null) return;
  const { userId } = requireUser(req);
  return apiOk(res, await saveVideoPartProgress(partId, userId, parsed.intervals, parsed.position, new Date()));
});

assignmentVideoRouter.post("/:id/parts/:partId/video/answers", requireAuth, async (req, res) => {
  const partId = await studentPart(req, res, "write");
  if (partId === null) return;
  const parsed = parseOr400(submitVideoAnswerRequestSchema, req.body, res, "Invalid answer.");
  if (parsed === null) return;
  return apiOk(res, await answerVideoQuestionFor({ partId }, requireUser(req).userId, parsed));
});

assignmentVideoRouter.get("/:id/parts/:partId/video-questions", requireAuth, async (req, res) => {
  const part = await staffPart(req, res);
  if (part === null) return;
  return apiOk(res, { questions: await listQuestionsFor({ partId: part.partId }) });
});

assignmentVideoRouter.post("/:id/parts/:partId/video-questions", requireAuth, async (req, res) => {
  // Gate before parsing (v1 R2): an unauthorized caller gets a refusal, not a validation message.
  const part = await staffPart(req, res);
  if (part === null) return;
  const parsed = parseOr400(videoQuestionInputSchema, req.body, res, "Invalid question.");
  if (parsed === null) return;
  assertInsideVideo(parsed.atSeconds, part.durationSeconds);
  const question = await createQuestionFor({ partId: part.partId }, parsed, requireUser(req).userId);
  return apiOk(res, { question }, 201);
});
