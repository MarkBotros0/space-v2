import { Router } from "express";

import { apiError, apiOk, forbidden } from "../../lib/api-response";
import { ImportParseError, parseDelimited } from "../../lib/imports/delimited";
import { buildGroupImportPreview, commitGroupImport } from "../../lib/imports/groups";
import { GroupOutsideSeasonError } from "../../lib/groups/membership";
import { isAdminOfSeason } from "../../lib/rbac";
// Value import — relative path is mandatory here (CLAUDE.md's rootDir emit
// trap). `import type` may use "@space/shared"; this line may not.
import {
  IMPORT_MAX_ROWS,
  groupImportCommitInputSchema,
  pastedSheetInputSchema,
} from "../../../../../packages/shared/src/index";
import { requireAuth, requireUser } from "../../middleware/require-auth";
import { findLiveSeason } from "../../lib/queries/seasons";
import { idParam } from "../../lib/http/params";
import { notFound } from "../../lib/http/not-found";
import { parseOr400 } from "../../lib/http/validate";
import { commitLimiter, importJsonParser, previewLimiter } from "./limits";

/**
 * Season-scoped import routes, mounted at /api/v1/seasons. That prefix is
 * SHARED with seasonsRouter (and Plan 15's seasonExportsRouter), so there is
 * no `seasonImportsRouter.use(requireAuth)` — each route lists requireAuth
 * first (ruling X5). It is mounted ahead of the global JSON parser (see
 * importJsonParser), so it sits before seasonsRouter too; it defines only
 * POST /:id/imports/groups/*, so every other request falls through untouched
 * and `routes/seasons/` stays unmodified (D-16.20).
 */
export const seasonImportsRouter = Router();

/**
 * `seasonId` comes from the PATH and nowhere else (D-16.20). v1 takes it as an
 * argument on both the preview and the commit
 * (`jpc-space/src/lib/group-import-actions.ts:20,59`), so the two calls could
 * in principle target different seasons.
 *
 * Returns the season id on success, or null having already answered.
 */
async function resolveAdministeredSeason(
  req: Parameters<typeof requireUser>[0],
  res: Parameters<typeof apiError>[0],
): Promise<number | null> {
  const user = requireUser(req);
  const seasonId = idParam(res, (req.params as { id?: string }).id, "season");
  if (seasonId === null) return null;
  // Claims-only, per rbac.ts — and paired with the role that may hold the
  // claim (ruling C7), so a stray SeasonAdmin row naming a student grants
  // nothing. SUPER short-circuits inside isAdminOfSeason.
  if (!isAdminOfSeason(user, seasonId)) {
    forbidden(res);
    return null;
  }
  const season = await findLiveSeason(seasonId, { id: true });
  if (!season) {
    notFound(res, "Season");
    return null;
  }
  return season.id;
}

// requireAuth per route — /api/v1/seasons is a shared prefix (ruling X5).
seasonImportsRouter.post(
  "/:id/imports/groups/preview",
  requireAuth,
  previewLimiter,
  importJsonParser,
  async (req, res) => {
    const seasonId = await resolveAdministeredSeason(req, res);
    if (seasonId === null) return;

    const parsed = parseOr400(pastedSheetInputSchema, req.body, res, "Paste a header row and at least one data row.");
    if (parsed === null) return;

    try {
      const sheet = parseDelimited(parsed.text, parsed.delimiter, IMPORT_MAX_ROWS);
      return apiOk(res, await buildGroupImportPreview(sheet, seasonId));
    } catch (err) {
      if (err instanceof ImportParseError) return apiError(res, "bad_request", err.message, 400);
      throw err;
    }
  },
);

seasonImportsRouter.post(
  "/:id/imports/groups/commit",
  requireAuth,
  commitLimiter,
  importJsonParser,
  async (req, res) => {
    const seasonId = await resolveAdministeredSeason(req, res);
    if (seasonId === null) return;

    const parsed = parseOr400(groupImportCommitInputSchema, req.body, res, "Invalid import request.");
    if (parsed === null) return;

    try {
      const result = await commitGroupImport(seasonId, parsed.assignments);
      return apiOk(res, {
        assigned: result.assigned,
        skipped: result.skippedStudentIds.length,
        skippedStudentIds: result.skippedStudentIds,
      });
    } catch (err) {
      if (err instanceof GroupOutsideSeasonError) {
        return apiError(res, "group_outside_season", err.message, 400);
      }
      throw err;
    }
  },
);
