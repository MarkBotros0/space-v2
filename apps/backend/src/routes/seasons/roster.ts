import type { Request, Response } from "express";

import { apiOk, apiError, forbidden } from "../../lib/api-response";

import { listSeasonRoster } from "../../lib/queries/groups";
import { GroupOutsideSeasonError, saveRosterAssignments } from "../../lib/groups/membership";
import { idParam } from "../../lib/http/params";
import { notFound } from "../../lib/http/not-found";
import { parseOr400 } from "../../lib/http/validate";
import { findLiveSeason } from "../../lib/queries/seasons";
import { isAdminOfSeason } from "../../lib/rbac";
import { requireUser } from "../../middleware/require-auth";
import { groupAssignmentsRequestSchema } from "../../../../../packages/shared/src/index";

/** Season-admin only (spec 05 §4 — v1's roster page required canEditSeason). */
async function requireLiveSeasonAdmin(req: Request, res: Response): Promise<number | null> {
  const user = requireUser(req);
  const seasonId = idParam(res, req.params.id, "season");
  if (seasonId === null) return null;
  if (!isAdminOfSeason(user, seasonId)) {
    forbidden(res);
    return null;
  }
  const season = await findLiveSeason(seasonId, { id: true });
  if (!season) {
    notFound(res, "Season");
    return null;
  }
  return seasonId;
}

export async function getSeasonRoster(req: Request, res: Response) {
  const seasonId = await requireLiveSeasonAdmin(req, res);
  if (seasonId === null) return;
  return apiOk(res, { roster: await listSeasonRoster(seasonId) });
}

/**
 * Bulk group assignment (spec 05 §7, Plan 6 D-16.12). Non-null groupIds go
 * through assignStudentsToGroups — the same function Plan 17's importer
 * commits through — and nulls through unassignStudentsFromGroups, in ONE
 * transaction: a group outside the season refuses everything.
 */
export async function saveGroupAssignments(req: Request, res: Response) {
  const seasonId = await requireLiveSeasonAdmin(req, res);
  if (seasonId === null) return;

  const parsed = parseOr400(groupAssignmentsRequestSchema, req.body, res, "Invalid assignments.");
  if (parsed === null) return;

  try {
    return apiOk(res, await saveRosterAssignments(seasonId, parsed.assignments));
  } catch (err) {
    if (err instanceof GroupOutsideSeasonError) {
      return apiError(res, "group_outside_season", err.message, 400);
    }
    throw err;
  }
}
