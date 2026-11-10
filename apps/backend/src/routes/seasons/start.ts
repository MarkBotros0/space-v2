import type { Request, Response } from "express";

import { apiOk, apiError } from "../../lib/api-response";
import { auditLog } from "../../lib/audit";
import { loadSeasonStartCheck } from "../../lib/queries/season-start";
import { findLiveSeason } from "../../lib/queries/seasons";
import { startSeasonNow } from "../../lib/seasons/start";
import { type SeatRefusal } from "../../lib/roles";
import { refusalStatus } from "../../lib/api-error";
import { NOT_DRAFT, SEASON_NOT_FOUND } from "../../lib/enrolment/season-roster";
import { requireRole } from "../../middleware/require-auth";
import { canManageUsers } from "../../lib/rbac";
import { idParam } from "../../lib/http/params";

function refuse(res: Response, refusal: SeatRefusal) {
  return apiError(res, refusal.code, refusal.message, refusalStatus(refusal));
}

/** `GET /seasons/:id/start-check`: SUPER only. Who stops this draft from starting, for the checklist. */
export async function getSeasonStartCheck(req: Request, res: Response) {
  if (!requireRole(req, res, canManageUsers)) return;
  const id = idParam(res, req.params.id, "season");
  if (id === null) return;

  const season = await findLiveSeason(id, {
    id: true,
    status: true,
    program: true,
    requiredProgram: true,
    isCommunityWide: true,
  });
  if (!season) return refuse(res, SEASON_NOT_FOUND);
  if (season.status !== "DRAFT") return refuse(res, NOT_DRAFT);
  return apiOk(res, await loadSeasonStartCheck(season));
}

/**
 * `POST /seasons/:id/start`: SUPER only. The one way a draft goes live. Takes the global start
 * lock, so every start is serialised and a community-wide season runs alone, then holds the
 * season, so no seat can be written around the check, then everyone in it, so
 * none of them takes a role elsewhere meanwhile. Because starts run one after another,
 * two never race over a shared person: the later one sees the earlier season as ACTIVE.
 * Everyone refreshes into their role: no one is signed out.
 */
export async function startSeason(req: Request, res: Response) {
  const user = requireRole(req, res, canManageUsers);
  if (!user) return;
  const id = idParam(res, req.params.id, "season");
  if (id === null) return;

  const outcome = await startSeasonNow(id, user.userId);

  auditLog("season.start", user.userId, user.userId, { season: id });
  return apiOk(res, outcome);
}
