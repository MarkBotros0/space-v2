import type { Request, Response } from "express";

import { db } from "../../db/client";
import { apiOk, apiError } from "../../lib/api-response";
import { parseId } from "../../lib/parse-id";
import { loadSeasonEndCheck } from "../../lib/queries/season-end";
import { isAdminOfSeason } from "../../lib/rbac";
import { requireUser } from "../../middleware/require-auth";
import { forbidden } from "../respond";

/** What blocks the season from ending, and who it would end for. */
export async function getSeasonEndCheck(req: Request, res: Response) {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid season id.", 400);
  if (!isAdminOfSeason(user, id)) return forbidden(res);

  const season = await db.season.findFirst({ where: { id, deletedAt: null }, select: { status: true } });
  if (!season) return apiError(res, "not_found", "Season not found.", 404);
  if (season.status !== "ACTIVE") {
    return apiError(res, "season_not_active", "Only an active season can be ended.", 409);
  }
  return apiOk(res, await loadSeasonEndCheck(id, new Date()));
}
