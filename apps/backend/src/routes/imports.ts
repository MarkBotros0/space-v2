// apps/backend/src/routes/imports.ts
import express, { Router } from "express";
import rateLimit from "express-rate-limit";

import { apiError, apiOk } from "../lib/api-response";
import { config } from "../lib/config";
import { ImportParseError, parseDelimited } from "../lib/imports/delimited";
// The one 429 handler (ruling X4: Plan 9 extracted it; no copies anywhere).
import { rateLimitHandler } from "../lib/rate-limit";
import { buildStudentImportPreview, studentImportTemplate } from "../lib/imports/students";
import { isSuper } from "../lib/rbac";
// Value import — relative path is mandatory here (CLAUDE.md's rootDir emit
// trap). `import type` may use "@space/shared"; this line may not.
import {
  IMPORT_MAX_ROWS,
  pastedSheetInputSchema,
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
 * Spec D18/R84: neither importer is rate-limited in v1, where the
 * server-action transport makes that hard to notice. As HTTP endpoints taking
 * a 256 KB paste and a 2000-row commit, both want one.
 *
 * A factory, and the limits come from config (defaults 30 / 10 per 15 min):
 * the integration suite commits ~22 times from one IP, so jest.setup.ts lifts
 * both limits under test, and the 429 behaviour itself is proven by a unit
 * test that builds `importLimiter(1)` directly (import-limits.test.ts).
 */
export function importLimiter(limit: number) {
  return rateLimit({ windowMs: 15 * 60 * 1000, limit, handler: rateLimitHandler });
}
const previewLimiter = importLimiter(config.importPreviewRateLimit);
const commitLimiter = importLimiter(config.importCommitRateLimit);

/**
 * This router's own JSON parser, with an explicit limit.
 *
 * The global `express.json()` in app.ts keeps body-parser's 100 KB default,
 * which a legal 256 KB paste — and a 2000-row commit that resubmits every cell
 * — both exceed; the overflow would surface as an unmapped `entity.too.large`
 * and a 500. These routers are therefore mounted in app.ts BEFORE the global
 * parser, and every POST lists `importJsonParser` itself, AFTER its limiter so
 * a throttled request is refused before its body is read. Nothing else in the
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
function requireSuper(req: Parameters<typeof requireUser>[0], res: Parameters<typeof apiError>[0]): boolean {
  const user = requireUser(req);
  if (isSuper(user)) return true;
  apiError(res, "forbidden", "Only a super user can import students.", 403);
  return false;
}

importsRouter.get("/students/template", async (req, res) => {
  if (!requireSuper(req, res)) return;
  return apiOk(res, studentImportTemplate());
});

importsRouter.post("/students/preview", previewLimiter, importJsonParser, async (req, res) => {
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

export { commitLimiter, previewLimiter, IMPORT_FILE_UPLOAD_SUPPORTED };
