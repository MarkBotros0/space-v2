import { z } from "zod";
import { createStudentRequestSchema } from "../student";

// ---------------------------------------------------------------------------
// Student importer — preview
// ---------------------------------------------------------------------------

/**
 * Per-cell ceiling on the RAW value echoed back for resubmission. Deliberately
 * larger than any field's real maximum so an over-long cell fails
 * `studentImportRowSchema` with a message naming the column, instead of being
 * swallowed by the body schema with a generic "invalid request".
 */
const IMPORT_MAX_CELL_CHARS = 5000;

/**
 * v1 has four (`student-import.ts:9`). `previously_removed` is v2's fifth
 * (spec D6 / D-16.14): the existence lookup deliberately does NOT filter
 * `deletedAt` — un-deleted matching would let an import resurrect an account
 * somebody removed on purpose — but reporting a soft-deleted row as "Already
 * in the system" is a lie the operator cannot act on.
 */
const importRowStatusSchema = z.enum(["new", "exists", "duplicate", "invalid", "previously_removed"]);
export type ImportRowStatus = z.infer<typeof importRowStatusSchema>;

const cell = z.string().max(IMPORT_MAX_CELL_CHARS);

/**
 * The RAW trimmed cell text of one row, exactly as the preview read it. Flat,
 * not v1's nested `profile` object (D-16.10) — flatness is what lets
 * `studentImportRowSchema` be derived from the student create schema instead
 * of restated.
 *
 * These values are echoed to the client and resubmitted on commit (D-16.4),
 * so they must survive being invalid: a 300-character name is exactly what
 * this carries, and `studentImportRowSchema` is what refuses it.
 */
export const importCellValuesSchema = z.object({
  name: cell,
  email: cell,
  university: cell.nullable(),
  faculty: cell.nullable(),
  /** Raw text as typed; a whole year (1950–2100) is the only accepted form. */
  universityGraduationYear: cell.nullable(),
  phone: cell.nullable(),
  /** Raw text as typed; `YYYY-MM-DD` is the only accepted form (D-16.11). */
  dateOfBirth: cell.nullable(),
  notes: cell.nullable(),
});
export type ImportCellValues = z.infer<typeof importCellValuesSchema>;

/**
 * ONE definition of "is this row importable", used by the preview classifier
 * and by the commit (D-16.9, fixing spec D12/R24).
 *
 * Derived, not restated: `createStudentRequestSchema` is the student domain's
 * own create contract, so an imported student and a form-created student
 * accept exactly the same data and there is no second set of maxima to drift.
 * `seasonId` is omitted because the target comes from the commit's mode and
 * applies to every row uniformly (spec R37) — a single paste can never mix
 * seasons.
 */
export const studentImportRowSchema = createStudentRequestSchema.omit({ seasonId: true });
export type StudentImportRow = z.output<typeof studentImportRowSchema>;

const studentImportPreviewRowSchema = z.object({
  /**
   * The operator's line number: the header is line 1, data starts at line 2
   * (spec R11). NOT contiguous — a blank line keeps its number and is skipped
   * (R20), so "row 41" points at line 41 of what they pasted.
   */
  rowNumber: z.number().int().positive(),
  name: z.string(),
  email: z.string(),
  status: importRowStatusSchema,
  message: z.string().nullable(),
  /** Echoed back so the client can resubmit exactly what the server parsed. */
  values: importCellValuesSchema,
});

const studentImportCountsSchema = z.object({
  new: z.number(),
  exists: z.number(),
  duplicate: z.number(),
  invalid: z.number(),
  previously_removed: z.number(),
  /** Blank rows skipped by R20 are excluded, exactly as v1 excludes them. */
  total: z.number(),
});

export const studentImportPreviewSchema = z.object({
  rows: z.array(studentImportPreviewRowSchema),
  /** "Name", "Email", then each matched profile column's label, in sheet order (R19). */
  detectedColumns: z.array(z.string()),
  /**
   * v2's addition (spec D11 / D-16.12). v1 silently ignores an unknown header
   * (R18), so `Phone No` or `Uni` vanishes without a word. Echoed as typed,
   * trimmed — matching trims too, so whitespace alone never causes a miss.
   */
  unrecognisedColumns: z.array(z.string()),
  /** What auto-sniffing chose, so the screen can say "read as tab-separated". */
  delimiter: z.enum(["comma", "tab"]),
  counts: studentImportCountsSchema,
});
export type StudentImportPreview = z.infer<typeof studentImportPreviewSchema>;
