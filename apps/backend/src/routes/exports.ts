// apps/backend/src/routes/exports.ts
import { Router } from "express";
import type { Response } from "express";
import rateLimit from "express-rate-limit";

// VALUE imports — relative, four levels up from src/routes/ (CLAUDE.md's
// rootDir trap; the emitted file sits at dist/apps/backend/src/routes/).
import {
  XLSX_MIME,
  exportFilename,
  exportFormatSchema,
  reportScopeQuerySchema,
} from "../../../../packages/shared/src/index";

import { apiError, apiOk } from "../lib/api-response";
import { logExport } from "../lib/exports/audit";
import { buildEngagementWorkbook } from "../lib/exports/engagement-workbook";
import { buildSeasonWorkbook, summariseSeasonWorkbook } from "../lib/exports/season-workbook";
import { orgDayKey } from "../lib/org-time";
import { parseId } from "../lib/parse-id";
import { canExportSeasonWorkbook, reportScopeFor } from "../lib/permissions";
import { listEngagementRows, resolveReportScope } from "../lib/queries/reports";
import { rateLimitHandler } from "../lib/rate-limit";
import { requireAuth, requireUser } from "../middleware/require-auth";

export const reportExportsRouter = Router();
export const seasonExportsRouter = Router();

// Per-route requireAuth (ruling X5): both prefixes are shared —
// /api/v1/reports with reportsRouter, /api/v1/seasons with seasonsRouter — so a
// router-level guard would 401 unknown paths and re-run auth for every request
// that falls through. requireAuth is listed BEFORE exportLimiter on each route,
// which is what guarantees the limiter's user-id key exists.

/**
 * Ten exports per fifteen minutes, per USER.
 *
 * These are the two most expensive authenticated reads in the system and the
 * two that return the most personal data per request (R48, R85); v1 rate-limits
 * neither (R88). Keyed on the user id rather than the IP because an office
 * behind one NAT would otherwise share a bucket — and because keying on IP
 * drags in IPv6 normalisation for no benefit. Listed AFTER requireAuth on each
 * route so the key always exists.
 *
 * The 429 body is the same `too_many_requests` envelope the login limiter
 * already returns.
 */
const exportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  handler: rateLimitHandler,
  keyGenerator: (req) => String(requireUser(req).userId),
});

/**
 * Success is bytes; every failure is still the JSON envelope (spec §7).
 *
 * Headers are set only once every check has passed, so there is no path on
 * which a JSON fragment is appended to a partial XLSX. After the first byte a
 * thrown error destroys the socket rather than trying to explain itself: a
 * truncated file the client can retry beats a corrupt file it cannot detect.
 *
 * NOTE: ENABLE_UPLOADS does not gate this. That flag gates
 * POST /api/v1/submissions/:publicId/files only — CLAUDE.md: "Only uploading is
 * gated — reading and deleting recorded files still work." These endpoints
 * produce bytes from database rows and touch no Storage driver at all.
 */
function setDownloadHeaders(res: Response, filename: string): void {
  res.setHeader("Content-Type", XLSX_MIME);
  // v1 interpolated Season.code straight into the header (R84). The value is an
  // admin-set slug so the risk is low, but a route should not rely on
  // validation two domains away. ASCII fallback plus RFC 5987 for the real name.
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\;]/g, "_");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
  );
  // A cohort export must not sit in an intermediary cache.
  res.setHeader("Cache-Control", "no-store");
}

/** The engagement export — v1's CSV, as a workbook (spec D7). */
reportExportsRouter.get("/engagement/export", requireAuth, exportLimiter, async (req, res) => {
  const user = requireUser(req);

  const scope = reportScopeFor(user);
  if (scope === null) return apiError(res, "forbidden", "You don't have access to this.", 403);

  if (req.query.format !== undefined) {
    const format = exportFormatSchema.safeParse(req.query.format);
    if (!format.success) {
      // Somebody has bookmarked v1's /api/reports/export, which returned CSV.
      // A legible 400 beats a 404 that reads as "the export is broken".
      return apiError(res, "bad_request", "Exports are XLSX only. Drop ?format or pass xlsx.", 400);
    }
  }

  const parsed = reportScopeQuerySchema.safeParse(req.query);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid report filters.", 400);

  const resolved = await resolveReportScope(scope, parsed.data.seasonId);
  // limit is the cap the contract allows; an export is the one caller that
  // legitimately wants every row, and it is rate-limited and audited for it.
  const page = await listEngagementRows(resolved, { limit: Number.MAX_SAFE_INTEGER });

  const filename = exportFilename("engagement", resolved.label, orgDayKey(new Date()));
  const workbook = buildEngagementWorkbook(page.rows, resolved.label);

  setDownloadHeaders(res, filename);
  await workbook.xlsx.write(res);
  res.end();

  logExport({
    actorId: user.userId,
    actorRole: user.role,
    kind: "engagement",
    seasonIds: resolved.seasonIds,
    rowCount: page.rows.length,
  });
});

/**
 * The season workbook.
 *
 * seasonId moves into the PATH. v1 takes it as a query parameter on a route
 * living outside any season namespace (src/app/api/season/export/route.ts:13);
 * a path parameter matches the existing seasons router and makes the row-scoped
 * gate the obvious one (spec §7).
 */
seasonExportsRouter.get("/:id/exports/workbook", requireAuth, exportLimiter, async (req, res) => {
  const user = requireUser(req);
  const seasonId = parseId(req.params.id);
  if (seasonId === null) return apiError(res, "bad_request", "Invalid season id.", 400);

  // MENTOR is refused here and admitted by the engagement export above — see
  // lib/permissions.ts and spec D6 #3. This is a deliberate divergence from
  // v1, whose endpoint allows any mentor any season (R85) and whose only
  // protection is an unrendered button (R86).
  if (!canExportSeasonWorkbook(user, seasonId)) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  // null covers "does not exist" AND "soft-deleted" — v1 checked neither
  // (R81, spec D14). One answer for both, so this cannot become an existence
  // oracle either.
  const built = await buildSeasonWorkbook(seasonId);
  if (!built) return apiError(res, "not_found", "Season not found.", 404);

  const filename = exportFilename(
    "season-workbook",
    built.seasonCode,
    orgDayKey(new Date()),
  );

  setDownloadHeaders(res, filename);
  // One materialisation, streamed. v1 built a Buffer and copied it again into a
  // Uint8Array (R83) — two full in-memory copies of a students × (sessions +
  // quizzes + assignments) matrix.
  await built.workbook.xlsx.write(res);
  res.end();

  logExport({
    actorId: user.userId,
    actorRole: user.role,
    kind: "season-workbook",
    seasonIds: [seasonId],
    rowCount: built.rowCount,
  });
});

/**
 * The manifest.
 *
 * Exists for mobile: it lets the client show a size and a sheet list, and warn
 * before a multi-megabyte download on a cellular connection, without building
 * the workbook (spec §7). Same gate as the workbook, deliberately — a manifest
 * a caller cannot act on is a size oracle over a season they may not read.
 */
seasonExportsRouter.get("/:id/exports/manifest", requireAuth, async (req, res) => {
  const user = requireUser(req);
  const seasonId = parseId(req.params.id);
  if (seasonId === null) return apiError(res, "bad_request", "Invalid season id.", 400);

  if (!canExportSeasonWorkbook(user, seasonId)) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const summary = await summariseSeasonWorkbook(seasonId);
  if (!summary) return apiError(res, "not_found", "Season not found.", 404);

  return apiOk(res, {
    filename: exportFilename("season-workbook", summary.seasonCode, orgDayKey(new Date())),
    mimeType: XLSX_MIME,
    sheets: summary.sheets,
    estimatedBytes: summary.estimatedBytes,
    generatedAt: new Date().toISOString(),
    scopeDescription: `${summary.seasonTitle} (${summary.seasonCode})`,
  });
});
