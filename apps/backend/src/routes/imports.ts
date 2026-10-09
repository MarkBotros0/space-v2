// apps/backend/src/routes/imports.ts
import express, { Router } from "express";

import { db } from "../db/client";
import { apiError, apiOk } from "../lib/api-response";
import { config } from "../lib/config";
import { ImportParseError, parseDelimited } from "../lib/imports/delimited";
import { buildGroupImportPreview } from "../lib/imports/groups";
import {
  buildStudentImportPreview,
  commitStudentImport,
  studentImportTemplate,
  type StudentImportTarget,
} from "../lib/imports/students";
import { parseId } from "../lib/parse-id";
import { assignStudentsToGroups, GroupOutsideSeasonError } from "../lib/queries/groups";
import { isAdminOfSeason, isSuper } from "../lib/rbac";
// Value import — relative path is mandatory here (CLAUDE.md's rootDir emit
// trap). `import type` may use "@space/shared"; this line may not.
import {
  IMPORT_MAX_ROWS,
  groupImportCommitInputSchema,
  pastedSheetInputSchema,
  studentImportCommitInputSchema,
} from "../../../../packages/shared/src/index";
import { requireAuth, requireUser } from "../middleware/require-auth";

/**
 * Import intake is NOT gated by `ENABLE_UPLOADS`, and nothing in this file
 * touches the `Storage` interface. Read this before "fixing" that.
 *
 * `ENABLE_UPLOADS` is off because *persisted* files — submission attachments —
 * need a storage driver, a retention story and a serving route, and that work
 * waits on the CMS. An import paste is the opposite: it is read once, parsed
 * in memory, and must NEVER be stored, because it is a sheet of students'
 * names, phone numbers, birth dates and pastoral notes. Sharing one flag
 * between the two would make them look like one concern and then enforce the
 * confusion (spec 16 §10a, decision D-16.2).
 */

/**
 * Flipped to `true` when .xlsx/CSV file intake lands with the CMS. Until then
 * the client is TOLD there is no picker rather than left to infer it from an
 * absent button (D-16.3).
 *
 * When it flips: the .xlsx reader must take each cell's FORMATTED TEXT, never
 * its value, or spec D7 comes straight back — a phone number typed into Excel
 * becomes a number and loses the leading "+" the CSV path went out of its way
 * to protect.
 */
const IMPORT_FILE_UPLOAD_SUPPORTED = false;

/**
 * No rate limit on any import route, as v1 (spec R84 / D-16.21, v1 parity
 * 2026-10-09). A concurrent-commit race is handled per row (R52).
 */

/**
 * This router's own JSON parser, with an explicit limit.
 *
 * The global `express.json()` in app.ts keeps body-parser's 100 KB default,
 * which a legal 5 MB paste (R3) — and a 2000-row commit that resubmits every
 * cell — both exceed; the overflow would surface as an unmapped `entity.too.large`
 * and a 500. These routers are therefore mounted in app.ts BEFORE the global
 * parser, and every POST lists `importJsonParser` itself. Nothing else in the
 * API gets the larger limit.
 */
export const importJsonParser = express.json({ limit: config.importBodyLimit });

// /api/v1/imports is this router's exclusive prefix, so router-level auth is
// permitted (ruling X5).
export const importsRouter = Router();
importsRouter.use(requireAuth);

/**
 * SUPER only, and it stays that way (spec D3).
 *
 * v1's commit checks that the target season exists but NOT that the caller
 * administers it (R40) — correct today solely because the action is
 * SUPER-gated. If a future product decision lets a season ADMIN import their
 * own roster, the row-scoped check goes in THE SAME change as the widened
 * role gate, never after it (ruling C8).
 */
function requireSuper(
  req: Parameters<typeof requireUser>[0],
  res: Parameters<typeof apiError>[0],
): boolean {
  const user = requireUser(req);
  if (isSuper(user)) return true;
  apiError(res, "forbidden", "Only a super user can import students.", 403);
  return false;
}

importsRouter.get("/students/template", async (req, res) => {
  if (!requireSuper(req, res)) return;
  return apiOk(res, studentImportTemplate());
});

importsRouter.post("/students/preview", importJsonParser, async (req, res) => {
  if (!requireSuper(req, res)) return;

  const parsed = pastedSheetInputSchema.safeParse(req.body);
  if (!parsed.success) {
    return apiError(res, "bad_request", "Paste a header row and at least one data row.", 400);
  }

  try {
    const sheet = parseDelimited(parsed.data.text, parsed.data.delimiter, IMPORT_MAX_ROWS);
    return apiOk(res, await buildStudentImportPreview(sheet));
  } catch (err) {
    // The importer's own error type carries a message written for the
    // operator and is safe to surface verbatim (spec R14). Anything else is a
    // bug and goes to the terminal error handler as a 500 with no detail.
    //
    // Note what is NOT logged: v1 logs the email address on failure
    // (student-import.ts:280). The row number is what a support conversation
    // actually needs, and a log full of student addresses is not (spec D19).
    if (err instanceof ImportParseError) return apiError(res, "bad_request", err.message, 400);
    throw err;
  }
});

importsRouter.post("/students/commit", importJsonParser, async (req, res) => {
  if (!requireSuper(req, res)) return;

  const parsed = studentImportCommitInputSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid import request.", 400);
  const body = parsed.data;

  let target: StudentImportTarget;
  if (body.mode === "season") {
    // Liveness, not scope (spec R39/R40). This endpoint is SUPER-only and
    // stays that way (D3); if it is ever opened to a season ADMIN, the
    // row-scoped check goes in the SAME change as the widened gate (C8).
    const season = await db.season.findFirst({
      where: { id: body.seasonId, deletedAt: null },
      select: { id: true },
    });
    if (!season) return apiError(res, "not_found", "That season no longer exists.", 404);
    target = { kind: "season", seasonId: season.id };
  } else {
    target = { kind: "alumni", graduationYear: body.graduationYear };
  }

  // v1's per-row loop (D-16.5): invalid rows, races and unexpected per-row
  // errors are reported in the result, so this answers 200 with the report
  // (R42, R52, R53).
  return apiOk(res, await commitStudentImport(body.rows, target));
});

/**
 * Season-scoped import routes, mounted at /api/v1/seasons. That prefix is
 * SHARED with seasonsRouter (and Plan 15's seasonExportsRouter), so there is
 * no `seasonImportsRouter.use(requireAuth)` — each route lists requireAuth
 * first (ruling X5). It is mounted ahead of the global JSON parser (see
 * importJsonParser), so it sits before seasonsRouter too; it defines only
 * POST /:id/imports/groups/*, so every other request falls through untouched
 * and `routes/seasons.ts` stays unmodified (D-16.20).
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
  const seasonId = parseId((req.params as { id?: string }).id);
  if (seasonId === null) {
    apiError(res, "bad_request", "Invalid season id.", 400);
    return null;
  }
  // Claims-only, per rbac.ts — and paired with the role that may hold the
  // claim (ruling C7), so a stray SeasonAdmin row naming a student grants
  // nothing. SUPER short-circuits inside isAdminOfSeason.
  if (!isAdminOfSeason(user, seasonId)) {
    apiError(res, "forbidden", "You don't have access to this.", 403);
    return null;
  }
  const season = await db.season.findFirst({
    where: { id: seasonId, deletedAt: null },
    select: { id: true },
  });
  if (!season) {
    apiError(res, "not_found", "Season not found.", 404);
    return null;
  }
  return season.id;
}

// requireAuth per route — /api/v1/seasons is a shared prefix (ruling X5).
seasonImportsRouter.post(
  "/:id/imports/groups/preview",
  requireAuth,
  importJsonParser,
  async (req, res) => {
    const seasonId = await resolveAdministeredSeason(req, res);
    if (seasonId === null) return;

    const parsed = pastedSheetInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return apiError(res, "bad_request", "Paste a header row and at least one data row.", 400);
    }

    try {
      const sheet = parseDelimited(parsed.data.text, parsed.data.delimiter, IMPORT_MAX_ROWS);
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
  importJsonParser,
  async (req, res) => {
    const seasonId = await resolveAdministeredSeason(req, res);
    if (seasonId === null) return;

    const parsed = groupImportCommitInputSchema.safeParse(req.body);
    if (!parsed.success) return apiError(res, "bad_request", "Invalid import request.", 400);

    try {
      // v1's group import is already transactional (spec R79) and stays that
      // way. The write independently re-derives every scope it needs — every
      // group must belong to this season, every student must hold an enrolment
      // in it — which is why posting resolved ids is safe here in a way it is
      // not for the student importer (spec §4).
      const result = await db.$transaction(
        (tx) => assignStudentsToGroups(tx, seasonId, parsed.data.assignments),
        { timeout: 30_000 },
      );
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

export { IMPORT_FILE_UPLOAD_SUPPORTED };
