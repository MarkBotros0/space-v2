// apps/backend/src/routes/reports.ts
import { Router } from "express";

// Relative, not "@space/shared": these are VALUE imports (Zod schemas), and
// tsc's rootDir here is the repo root, so a bare specifier is emitted as-is and
// resolves back to the TypeScript source at
// runtime and crashes the built server with ERR_MODULE_NOT_FOUND (CLAUDE.md).
// Four levels up from src/routes/.
import {
  engagementStudentsQuerySchema,
  reportScopeQuerySchema,
} from "../../../../packages/shared/src/index";

import { apiError, apiOk } from "../lib/api-response";
import { reportScopeFor } from "../lib/permissions";
import { buildOrganisationReport } from "../lib/queries/organisation-report";
import {
  buildEngagementSummary,
  listEngagementRows,
  resolveReportScope,
} from "../lib/queries/reports";
import { isSuper } from "../lib/rbac";
import { requireAuth, requireUser } from "../middleware/require-auth";

export const reportsRouter = Router();

// No `reportsRouter.use(requireAuth)`: /api/v1/reports is shared with
// reportExportsRouter, so router-level auth would answer 401 for unknown
// /api/v1/reports/* paths and run twice per request (ruling X5). Each route
// lists requireAuth first.

/**
 * The engagement summary.
 *
 * Everything in this domain is a read; nothing here writes a row (ruling C6,
 * spec §6). The three gates that matter all live above the query and none of
 * them is inherited from v1, because v1 had none: loadReportsData performs no
 * authorization of any kind and its only protection is which server component
 * calls it (R3).
 */
reportsRouter.get("/engagement", requireAuth, async (req, res) => {
  const user = requireUser(req);

  const scope = reportScopeFor(user);
  // LEADER and STUDENT, explicitly. Not an empty list — an empty list is
  // indistinguishable from "there is no data", which is exactly the accident
  // v1 relied on (spec D6 #4, R109, R110).
  if (scope === null) return apiError(res, "forbidden", "You don't have access to this.", 403);

  const parsed = reportScopeQuerySchema.safeParse(req.query);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid report filters.", 400);

  const resolved = await resolveReportScope(scope, parsed.data.seasonId);
  const summary = await buildEngagementSummary(resolved, {
    trendLimit: parsed.data.trendLimit,
    ...(parsed.data.from ? { from: new Date(parsed.data.from) } : {}),
    ...(parsed.data.to ? { to: new Date(parsed.data.to) } : {}),
  });

  return apiOk(res, summary);
});

/**
 * The cohort, paged and separately gated (spec D6 #2, R34).
 *
 * The gate is written out again rather than shared with the summary above on
 * purpose: "separately gated" is the requirement, and a helper that both routes
 * call is one edit away from being loosened for both at once.
 */
reportsRouter.get("/engagement/students", requireAuth, async (req, res) => {
  const user = requireUser(req);

  const scope = reportScopeFor(user);
  if (scope === null) return apiError(res, "forbidden", "You don't have access to this.", 403);

  const parsed = engagementStudentsQuerySchema.safeParse(req.query);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid report filters.", 400);

  const resolved = await resolveReportScope(scope, parsed.data.seasonId);
  const page = await listEngagementRows(resolved, {
    limit: parsed.data.limit,
    ...(parsed.data.cursor ? { cursor: parsed.data.cursor } : {}),
    ...(parsed.data.band ? { band: parsed.data.band } : {}),
  });

  return apiOk(res, page);
});

/**
 * The organisation roll-up.
 *
 * Shares no metric with the engagement report (R61) and is therefore its own
 * endpoint with its own gate rather than a mode flag on the one above.
 * loadSuperReports takes no arguments and covers the whole database with no
 * authorization (R49, R50); requireRole(["SUPER"]) on its single calling page
 * is the entire protection in v1, and it moves here.
 */
reportsRouter.get("/organisation", requireAuth, async (req, res) => {
  const user = requireUser(req);
  if (!isSuper(user)) return apiError(res, "forbidden", "You don't have access to this.", 403);

  return apiOk(res, await buildOrganisationReport());
});
