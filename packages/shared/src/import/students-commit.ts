import { z } from "zod";

import { IMPORT_MAX_ROWS } from "./limits";
import { importCellValuesSchema } from "./students-preview";

// ---------------------------------------------------------------------------
// Student importer — commit
// ---------------------------------------------------------------------------

/**
 * `skip` reproduces v1 exactly (R44). `enroll` is spec D4's fix for the
 * domain's highest-value gap: a returning student bulk-imported into a new
 * season currently ends the import with their old activeSeasonId and no new
 * enrolment, and the operator's only signal is a "Skip · exists" badge.
 *
 * `enroll` writes TWO things and nothing else — the SeasonEnrollment and the
 * activeSeasonId pointer. It never touches a User or profile field, because a
 * mode that overwrote profile data from a spreadsheet is how a stale export
 * erases a year of pastoral notes.
 */
const importOnExistingSchema = z.enum(["skip", "enroll"]);
export type ImportOnExisting = z.infer<typeof importOnExistingSchema>;

/**
 * What the client posts per row. Cell VALUES only — no `status`. v1 posted
 * the client's own classification and the server never re-checked it (spec
 * R34: "the preview is advisory"). Here the server re-derives every status
 * itself before writing (D-16.4), so sending one would be meaningless; the
 * schema strips it.
 */
const studentImportCommitRowSchema = z.object({
  rowNumber: z.number().int().positive(),
  values: importCellValuesSchema,
});

const commitRowsSchema = z.array(studentImportCommitRowSchema).min(1).max(IMPORT_MAX_ROWS);

/**
 * Evaluated per parse, not at module load. v1 captured `CURRENT_YEAR` once at
 * import time in BOTH the server action (`student-import-actions.ts:49`) and
 * the client (`student-import-form.tsx:54`), so a long-lived process caps the
 * alumni year at the year it booted (spec R38).
 */
const graduationYearSchema = z
  .number()
  .int()
  .min(1990)
  .refine((y) => y <= new Date().getUTCFullYear(), {
    message: "Graduation year cannot be in the future.",
  });

export const studentImportCommitInputSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("season"),
    seasonId: z.number().int().positive(),
    onExisting: importOnExistingSchema,
    rows: commitRowsSchema,
  }),
  z.object({
    mode: z.literal("alumni"),
    graduationYear: graduationYearSchema,
    // Alumni mode creates no enrolment at all (spec R48), so there is nothing
    // for `enroll` to mean. Narrowing the literal here is what makes that a
    // 400 rather than a silently ignored field.
    onExisting: z.literal("skip"),
    rows: commitRowsSchema,
  }),
]);
export type StudentImportCommitInput = z.output<typeof studentImportCommitInputSchema>;

/**
 * `failed` does not exist. The commit is all-or-nothing (D-16.5): a row that
 * cannot be written aborts the whole request with `422 import_rows_invalid`
 * and nothing is written, so no result can contain a failure. `enrolled` is
 * `onExisting: "enroll"` landing on an existing student.
 */
const importCommitOutcomeSchema = z.enum(["created", "skipped", "enrolled"]);

const studentImportResultRowSchema = z.object({
  /**
   * v1 omits the row number here (`student-import.ts:183-189`), which makes a
   * report impossible to map back to the sheet. Added (spec §8).
   */
  rowNumber: z.number().int().positive(),
  name: z.string(),
  email: z.string(),
  outcome: importCommitOutcomeSchema,
  message: z.string().nullable(),
  userId: z.number().nullable(),
});
export type StudentImportResultRow = z.infer<typeof studentImportResultRowSchema>;

export const studentImportResultSchema = z.object({
  created: z.number(),
  skipped: z.number(),
  enrolled: z.number(),
  rows: z.array(studentImportResultRowSchema),
});
export type StudentImportResult = z.infer<typeof studentImportResultSchema>;
