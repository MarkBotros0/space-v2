import { Router } from "express";

import { apiOk, apiError, forbidden } from "../../lib/api-response";
import { parseId } from "../../lib/parse-id";
import { staffScopeForSeason } from "../../lib/permissions";
import { loadMentorDashboard, loadSeasonStaffDashboard, loadStudentDashboard } from "../../lib/queries/dashboard";
import { isAlumnusNotStudying } from "../../lib/rbac";
import { requireAuth, requireUser } from "../../middleware/require-auth";
import { notFound } from "../../lib/http/not-found";

export const meDashboardRouter = Router();

/**
 * The role dashboard's server-derived figures (spec 19 §7). A read with no
 * side effects (C6); requireAuth per route because /api/v1/me is shared with
 * the other self-service routes (X5).
 */
meDashboardRouter.get("/dashboard", requireAuth, async (req, res) => {
  const user = requireUser(req);
  const now = new Date();

  // An alumnus's Home is /me + /events; this endpoint has nothing for them,
  // unless they're studying: then their Home is a student's.
  if (isAlumnusNotStudying(user)) return forbidden(res);
  // A student's season is their token's, never a parameter (D22, C8).
  if (user.role === "STUDENT") return apiOk(res, await loadStudentDashboard(user, now));
  if (user.role === "MENTOR") return apiOk(res, await loadMentorDashboard());

  const raw = req.query.seasonId;
  const seasonId = parseId(typeof raw === "string" ? raw : undefined);
  if (seasonId === null) {
    return apiError(res, "bad_request", "seasonId is required.", 400);
  }

  // The gate, not a where clause (spec §4 item 1): SUPER and the season's
  // admins get "season"; a LEADER gets their groups in it; everyone else null.
  const scope = await staffScopeForSeason(user, seasonId);
  if (scope === null) return forbidden(res);

  const dashboard = await loadSeasonStaffDashboard(user, seasonId, scope, now);
  if (!dashboard) return notFound(res, "Season");
  return apiOk(res, dashboard);
});
