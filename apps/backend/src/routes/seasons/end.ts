import type { Request, Response } from "express";

import { apiOk, apiError, forbidden } from "../../lib/api-response";
import { auditLog } from "../../lib/audit";
import { loadSeasonEndCheck } from "../../lib/queries/season-end";
import { findLiveSeason } from "../../lib/queries/seasons";
import { endSeasonNow } from "../../lib/seasons/end";
import { isAdminOfSeason } from "../../lib/rbac";
import { requireUser } from "../../middleware/require-auth";
import { endSeasonRequestSchema } from "../../../../../packages/shared/src/index";
import { idParam } from "../../lib/http/params";
import { notFound } from "../../lib/http/not-found";

/** What blocks the season from ending, and who it would end for. */
export async function getSeasonEndCheck(req: Request, res: Response) {
  const user = requireUser(req);
  const id = idParam(res, req.params.id, "season");
  if (id === null) return;
  if (!isAdminOfSeason(user, id)) return forbidden(res);

  const season = await findLiveSeason(id, { status: true });
  if (!season) return notFound(res, "Season");
  if (season.status !== "ACTIVE") {
    return apiError(res, "season_not_active", "Only an active season can be ended.", 409);
  }
  return apiOk(res, await loadSeasonEndCheck(id, new Date()));
}

/** End a season (see endSeasonNow in lib/seasons/end.ts for the transaction and its rules). */
export async function endSeason(req: Request, res: Response) {
  const user = requireUser(req);
  const id = idParam(res, req.params.id, "season");
  if (id === null) return;
  if (!isAdminOfSeason(user, id)) return forbidden(res);

  const result = endSeasonRequestSchema.safeParse(req.body);
  if (!result.success) {
    // Weights that don't add up say so; anything else is a malformed body.
    const sum = result.error.issues.find((i) => i.code === "custom" && i.path[0] === "weights");
    return apiError(res, "bad_request", sum?.message ?? "Invalid end-season body.", 400);
  }
  const parsed = result.data;
  const reasons = new Map(parsed.notPassed.map((n) => [n.userId, n.reason?.trim() || null]));
  const notes = new Map(parsed.passedNotes.map((n) => [n.userId, n.note?.trim() || null]));
  const criteria = { weights: parsed.weights, passMark: parsed.passMark };

  const season = await findLiveSeason(id, { status: true, year: true });
  if (!season) return notFound(res, "Season");
  if (season.status !== "ACTIVE") {
    return apiError(res, "season_not_active", "Only an active season can be ended.", 409);
  }

  const now = new Date();
  const ended = await endSeasonNow(
    id,
    user.userId,
    { reviewed: parsed.reviewed, reasons, notes, criteria },
    season.year,
    now,
  );
  auditLog("season.end", user.userId, user.userId, { season: id });
  for (const graduate of ended.graduated) {
    auditLog("student.graduate", user.userId, graduate, { season: id });
  }
  return apiOk(res, { season: ended.season, graduated: ended.graduated.length });
}
