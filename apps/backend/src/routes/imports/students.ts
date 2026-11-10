import { Router, type Request, type Response } from "express";

import { isUniqueViolation } from "../../lib/prisma-errors";
import { apiError, apiOk } from "../../lib/api-response";
import { ImportParseError, parseDelimited } from "../../lib/imports/delimited";
import { withImpliedHeader, withoutImpliedHeaderLine } from "../../lib/imports/students/implied-header";
import {
  buildStudentImportPreview,
  commitStudentImport,
  ImportRowsInvalidError,
  ImportSeasonGoneError,
  studentImportTemplate,
  type StudentImportTarget,
} from "../../lib/imports/students";
import { isSuper } from "../../lib/rbac";
// Value import — relative path is mandatory here (CLAUDE.md's rootDir emit
// trap). `import type` may use "@space/shared"; this line may not.
import {
  IMPORT_MAX_ROWS,
  pastedSheetInputSchema,
  studentImportCommitInputSchema,
} from "../../../../../packages/shared/src/index";
import { requireAuth, requireRole } from "../../middleware/require-auth";
import { isSeasonFinished } from "../../lib/seasons/status";
import { findLiveSeason } from "../../lib/queries/seasons";
import { parseOr400 } from "../../lib/http/validate";
import { commitLimiter, importJsonParser, previewLimiter } from "./limits";

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
const requireImporter = (req: Request, res: Response) =>
  requireRole(req, res, isSuper, "Only a super user can import students.");

importsRouter.get("/students/template", async (req, res) => {
  if (!requireImporter(req, res)) return;
  return apiOk(res, studentImportTemplate());
});

importsRouter.post("/students/preview", previewLimiter, importJsonParser, async (req, res) => {
  if (!requireImporter(req, res)) return;

  const parsed = parseOr400(pastedSheetInputSchema, req.body, res, "Paste a header row and at least one data row.");
  if (parsed === null) return;

  try {
    // Plain "name, email" lines work without a header row (owner, 2026-11-07).
    const pasted = withImpliedHeader(parsed.text);
    const sheet = parseDelimited(pasted.text, parsed.delimiter, IMPORT_MAX_ROWS);
    const preview = await buildStudentImportPreview(sheet);
    return apiOk(res, pasted.implied ? withoutImpliedHeaderLine(preview) : preview);
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

importsRouter.post("/students/commit", commitLimiter, importJsonParser, async (req, res) => {
  if (!requireImporter(req, res)) return;

  const body = parseOr400(studentImportCommitInputSchema, req.body, res, "Invalid import request.");
  if (body === null) return;

  let target: StudentImportTarget;
  if (body.mode === "season") {
    // Liveness, not scope (spec R39/R40). This endpoint is SUPER-only and
    // stays that way (D3); if it is ever opened to a season ADMIN, the
    // row-scoped check goes in the SAME change as the widened gate (C8).
    const season = await findLiveSeason(body.seasonId, { id: true, status: true });
    if (!season) return apiError(res, "not_found", "That season no longer exists.", 404);
    if (isSeasonFinished(season.status)) {
      return apiError(res, "season_finished", "This season has finished.", 409);
    }
    target = { kind: "season", seasonId: season.id };
  } else {
    target = { kind: "alumni", graduationYear: body.graduationYear };
  }

  try {
    return apiOk(res, await commitStudentImport(body.rows, target, body.onExisting));
  } catch (err) {
    if (err instanceof ImportSeasonGoneError) {
      return apiError(res, "not_found", "That season no longer exists.", 404);
    }
    if (err instanceof ImportRowsInvalidError) {
      const shown = err.rowNumbers.slice(0, 10).join(", ");
      const more = err.rowNumbers.length > 10 ? ` and ${err.rowNumbers.length - 10} more` : "";
      return apiError(
        res,
        "import_rows_invalid",
        `${err.rowNumbers.length} row(s) are not valid — rows ${shown}${more}. Nothing was imported. Preview again and fix them.`,
        422,
      );
    }
    if (isUniqueViolation(err)) {
      // Somebody else created one of these addresses between this request's
      // existence lookup and its insert. The whole transaction rolled back,
      // so nothing partial landed — and because the commit is idempotent,
      // re-running the same paste is safe. Say exactly that: v1 downgraded
      // this race to a silent per-row "skipped" (R52), which made a genuine
      // conflict indistinguishable from a clean no-op.
      return apiError(
        res,
        "import_conflict",
        "Someone else added one of these people while this import was running. Nothing was written — run it again.",
        409,
      );
    }
    throw err;
  }
});
