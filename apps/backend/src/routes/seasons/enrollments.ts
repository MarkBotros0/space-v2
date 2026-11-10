import type { Request, Response } from "express";

import { apiOk, apiError, forbidden } from "../../lib/api-response";
import { auditLog } from "../../lib/audit";
import { addSeasonPeople, overrideOnDraft, removeFromDraft } from "../../lib/enrolment/season-roster";
import { idParam } from "../../lib/http/params";
import { parseId } from "../../lib/parse-id";
import { parseOr400 } from "../../lib/http/validate";
import { isAdminOfSeason } from "../../lib/rbac";
import { requireUser } from "../../middleware/require-auth";
// Value import: relative path is mandatory here (CLAUDE.md's rootDir emit trap).
import { addSeasonEnrollmentsRequestSchema } from "../../../../../packages/shared/src/index";

/**
 * `POST /seasons/:id/enrollments`: SUPER, or that season's admin. All or
 * nothing, because a half-applied batch can't be read by the operator.
 */
export async function addSeasonEnrollments(req: Request, res: Response) {
  const user = requireUser(req);
  const seasonId = idParam(res, req.params.id, "season");
  if (seasonId === null) return;
  if (!isAdminOfSeason(user, seasonId)) return forbidden(res);

  const parsed = parseOr400(addSeasonEnrollmentsRequestSchema, req.body, res, "Invalid enrollment body.");
  if (parsed === null) return;
  // Whoever administers the season may let someone past a block (owner, 2026-11-07).
  const { userIds, overrideUserIds = [] } = parsed;

  const outcome = await addSeasonPeople(seasonId, user.userId, userIds, overrideUserIds);
  for (const id of outcome.seated) auditLog("enrollment.add", user.userId, id, { season: seasonId });
  for (const id of outcome.overridden) auditLog("enrollment.override", user.userId, id, { season: seasonId });
  return apiOk(res, { added: outcome.seated.length }, 201);
}

/**
 * `DELETE /seasons/:id/enrollments/:userId`: a draft's row is a plan, not
 * history, so it goes entirely, unless the person has already done work.
 */
export async function removeSeasonEnrollment(req: Request, res: Response) {
  const user = requireUser(req);
  const seasonId = parseId(req.params.id);
  const userId = parseId(req.params.userId);
  if (seasonId === null || userId === null) {
    return apiError(res, "bad_request", "Invalid season or user id.", 400);
  }
  if (!isAdminOfSeason(user, seasonId)) return forbidden(res);

  await removeFromDraft(seasonId, userId);

  auditLog("enrollment.remove", user.userId, userId, { season: seasonId });
  return apiOk(res, { removed: true });
}

/**
 * `POST /seasons/:id/enrollments/:userId/override`: SUPER, or that season's
 * admin (owner, 2026-11-07). Lets someone
 * already on a draft's roster past a block, for Start's checklist.
 */
export async function overrideSeasonEnrollment(req: Request, res: Response) {
  const user = requireUser(req);
  const seasonId = parseId(req.params.id);
  const userId = parseId(req.params.userId);
  if (seasonId === null || userId === null) {
    return apiError(res, "bad_request", "Invalid season or user id.", 400);
  }
  if (!isAdminOfSeason(user, seasonId)) return forbidden(res);

  const outcome = await overrideOnDraft(seasonId, userId, user.userId);

  auditLog("enrollment.override", user.userId, userId, { season: seasonId });
  return apiOk(res, outcome);
}
