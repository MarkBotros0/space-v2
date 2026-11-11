import { Router, type Request, type Response } from "express";

import { db } from "../../db/client";
import { apiOk, forbidden } from "../../lib/api-response";
import { saveEssayDraft } from "../../lib/assignments/essay";
import { liveAssignment } from "../../lib/db/live";
import { notFound } from "../../lib/http/not-found";
import { idParam } from "../../lib/http/params";
import { parseOr400 } from "../../lib/http/validate";
import { hasActiveEnrollment } from "../../lib/permissions";
import { requireAuth, requireUser } from "../../middleware/require-auth";
import { saveEssayDraftRequestSchema } from "../../../../../packages/shared/src/index";

/**
 * An essay part of an assignment: the student saves their draft here. Reading
 * it, its files, the hand-in and the review address the essay work by its
 * publicId under /api/v1/submissions. Mounted at /api/v1/assignments ahead of
 * assignmentsRouter; `requireAuth` is per route so an unknown path falls
 * through to that router untouched.
 */
export const assignmentEssayRouter = Router();

/**
 * PUT: the draft's whole text. Gates before the body (v1 R2): the part must be
 * an essay of this live assignment (404), and the caller a student with a live
 * place in the season (`hasActiveEnrollment`: an ACTIVE enrolment in an ACTIVE
 * season, so staff and a finished season's students get 403).
 */
export async function putEssayDraft(req: Request, res: Response) {
  const assignmentId = idParam(res, req.params.id, "assignment");
  if (assignmentId === null) return;
  const partId = idParam(res, req.params.partId, "part");
  if (partId === null) return;
  const part = await db.assignmentPart.findFirst({
    where: { id: partId, assignmentId, kind: "ESSAY", assignment: liveAssignment },
    select: { id: true, assignment: { select: { seasonId: true } } },
  });
  if (!part) return notFound(res, "Part");
  const user = requireUser(req);
  if (!(await hasActiveEnrollment(user, part.assignment.seasonId))) return forbidden(res);

  const parsed = parseOr400(saveEssayDraftRequestSchema, req.body, res, "Invalid essay body.");
  if (parsed === null) return;
  return apiOk(res, await saveEssayDraft(part.id, user.userId, parsed.text));
}

assignmentEssayRouter.put("/:id/parts/:partId/essay", requireAuth, putEssayDraft);
