import type { Request, Response } from "express";

import { apiError, apiOk, forbidden } from "../../lib/api-response";
import { idParam } from "../../lib/http/params";
import { notFound } from "../../lib/http/not-found";
import { savePassCriteria } from "../../lib/passing/criteria";
import { loadPassingOutlook } from "../../lib/passing/outlook";
import { staffScopeForSeason } from "../../lib/permissions";
import { findLiveSeason } from "../../lib/queries/seasons";
import { isAdminOfSeason } from "../../lib/rbac";
import { requireUser } from "../../middleware/require-auth";
import { passCriteriaSchema } from "../../../../../packages/shared/src/index";

/**
 * Set the season's pass criteria: the season's admin or a super, while the season is ACTIVE
 * (409 `season_not_active`). A weight on a number the season has nothing for is 400 `weight_on_empty`.
 */
export async function putPassCriteria(req: Request, res: Response) {
  const user = requireUser(req);
  const id = idParam(res, req.params.id, "season");
  if (id === null) return;
  if (!isAdminOfSeason(user, id)) return forbidden(res);
  const parsed = passCriteriaSchema.safeParse(req.body);
  if (!parsed.success) {
    // Weights that don't add up say so; anything else is a malformed body.
    const sum = parsed.error.issues.find((i) => i.code === "custom");
    return apiError(res, "bad_request", sum?.message ?? "Invalid pass criteria.", 400);
  }
  if (!(await findLiveSeason(id, { id: true }))) return notFound(res, "Season");
  return apiOk(res, { criteria: await savePassCriteria(id, parsed.data, new Date()) });
}

/**
 * The season's passing outlook: the season's admin or a super see every student, a leader their own
 * groups' (`staffScopeForSeason`); a mentor, a student or another season's admin gets 403.
 */
export async function getPassingOutlook(req: Request, res: Response) {
  const user = requireUser(req);
  const id = idParam(res, req.params.id, "season");
  if (id === null) return;
  const scope = await staffScopeForSeason(user, id);
  if (scope === null) return forbidden(res);
  const season = await findLiveSeason(id, { id: true, status: true });
  if (!season) return notFound(res, "Season");
  return apiOk(res, await loadPassingOutlook(user, season, scope));
}
