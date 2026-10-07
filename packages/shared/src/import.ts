// packages/shared/src/import.ts
import { z } from "zod";

import { createStudentRequestSchema } from "./student";

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

/** v1's cap (spec R35), kept. */
export const IMPORT_MAX_ROWS = 2000;

/**
 * 256 KB of pasted text. This REPLACES v1's 5 MB file ceiling (R3), which was
 * a file-size limit checked after the whole file had already reached the
 * server. 5 MB of text is not a realistic paste, it is a request body; 256 KB
 * comfortably holds 2000 rows with eight populated columns. The client checks
 * it before spending a request and the server checks it again, because a
 * client-side limit is a courtesy and not a control.
 */
export const IMPORT_MAX_PASTE_CHARS = 256 * 1024;

/**
 * Per-cell ceiling on the RAW value echoed back for resubmission. Deliberately
 * larger than any field's real maximum so an over-long cell fails
 * `studentImportRowSchema` with a message naming the column, instead of being
 * swallowed by the body schema with a generic "invalid request".
 */
export const IMPORT_MAX_CELL_CHARS = 5000;

// ---------------------------------------------------------------------------
// Header vocabulary — pure data, shared so the mobile screen can render
// "columns we recognise" without a round trip (spec §8).
// ---------------------------------------------------------------------------

/**
 * `student` is v2's addition (spec D14): every season export's first column is
 * headed "Student", and v1's importer rejected the file this system had just
 * produced.
 */
export const IMPORT_NAME_HEADERS = ["name", "student"] as const;
export const IMPORT_EMAIL_HEADERS = ["email", "e-mail"] as const;
export const IMPORT_GROUP_HEADERS = ["group"] as const;

export const IMPORT_PROFILE_FIELDS = [
  "phone",
  "university",
  "year",
  "dateOfBirth",
  "spiritualBackground",
  "gifts",
  "notes",
] as const;
export type ImportProfileFieldKey = (typeof IMPORT_PROFILE_FIELDS)[number];

/** v1's table verbatim (`jpc-space/src/lib/student-import.ts:24-42`). */
export const IMPORT_PROFILE_ALIASES: Readonly<Record<string, ImportProfileFieldKey>> = {
  phone: "phone",
  mobile: "phone",
  "mobile no": "phone",
  "mobile no.": "phone",
  "mobile number": "phone",
  "phone number": "phone",
  university: "university",
  college: "university",
  year: "year",
  "date of birth": "dateOfBirth",
  dob: "dateOfBirth",
  birthdate: "dateOfBirth",
  "birth date": "dateOfBirth",
  "spiritual background": "spiritualBackground",
  gifts: "gifts",
  "spiritual gifts": "gifts",
  notes: "notes",
};

/** Display labels (`student-import.ts:44-52`), used by `detectedColumns`. */
export const IMPORT_FIELD_LABELS: Readonly<Record<ImportProfileFieldKey, string>> = {
  phone: "Mobile No",
  university: "University",
  year: "Year",
  dateOfBirth: "Date of birth",
  spiritualBackground: "Spiritual background",
  gifts: "Gifts",
  notes: "Notes",
};

// ---------------------------------------------------------------------------
// Student importer — preview
// ---------------------------------------------------------------------------

/**
 * v1 has four (`student-import.ts:9`). `previously_removed` is v2's fifth
 * (spec D6 / D-16.14): the existence lookup deliberately does NOT filter
 * `deletedAt` — un-deleted matching would let an import resurrect an account
 * somebody removed on purpose — but reporting a soft-deleted row as "Already
 * in the system" is a lie the operator cannot act on.
 */
export const importRowStatusSchema = z.enum([
  "new",
  "exists",
  "duplicate",
  "invalid",
  "previously_removed",
]);
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
  year: cell.nullable(),
  phone: cell.nullable(),
  /** Raw text as typed; `YYYY-MM-DD` is the only accepted form (D-16.11). */
  dateOfBirth: cell.nullable(),
  spiritualBackground: cell.nullable(),
  gifts: cell.nullable(),
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

export const studentImportPreviewRowSchema = z.object({
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

export const studentImportCountsSchema = z.object({
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
export const importOnExistingSchema = z.enum(["skip", "enroll"]);
export type ImportOnExisting = z.infer<typeof importOnExistingSchema>;

/**
 * What the client posts per row. Cell VALUES only — no `status`. v1 posted
 * the client's own classification and the server never re-checked it (spec
 * R34: "the preview is advisory"). Here the server re-derives every status
 * itself before writing (D-16.4), so sending one would be meaningless; the
 * schema strips it.
 */
export const studentImportCommitRowSchema = z.object({
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
export const importCommitOutcomeSchema = z.enum(["created", "skipped", "enrolled"]);

export const studentImportResultRowSchema = z.object({
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

// ---------------------------------------------------------------------------
// Intake + template
// ---------------------------------------------------------------------------

/**
 * The one intake shape (D-16.2). Spreadsheet apps put TAB-separated text on
 * the clipboard and a CSV export is comma-separated, so both must work;
 * `delimiter` exists so a comma-containing name in a TSV can never be
 * misread by a sniffer that guessed wrong.
 */
export const pastedSheetInputSchema = z.object({
  text: z.string().min(1).max(IMPORT_MAX_PASTE_CHARS),
  delimiter: z.enum(["comma", "tab", "auto"]).default("auto"),
});
export type PastedSheetInput = z.output<typeof pastedSheetInputSchema>;

export const importColumnSpecSchema = z.object({
  label: z.string(),
  acceptedHeaders: z.array(z.string()),
  required: z.boolean(),
  maxLength: z.number().nullable(),
  target: z.string(),
  note: z.string().nullable(),
});

export const importTemplateSchema = z.object({
  columns: z.array(importColumnSpecSchema),
  /** A ready-made tab-separated header line the operator can copy. */
  headerRow: z.string(),
  maxRows: z.number(),
  maxPasteChars: z.number(),
  /**
   * D-16.3. `fileUpload` is a hard `false` today; the screen renders the
   * reason rather than omitting a picker and letting the operator conclude
   * the feature was forgotten. It flips when .xlsx intake lands with the CMS.
   */
  capabilities: z.object({
    pasteText: z.boolean(),
    fileUpload: z.boolean(),
  }),
});
export type ImportTemplate = z.infer<typeof importTemplateSchema>;

// ---------------------------------------------------------------------------
// Group importer
// ---------------------------------------------------------------------------

/** v1's five (`jpc-space/src/lib/group-import.ts:6`), unchanged. */
export const groupImportRowStatusSchema = z.enum([
  "assign",
  "unchanged",
  "no_student",
  "no_group",
  "invalid",
]);

export const groupImportPreviewRowSchema = z.object({
  rowNumber: z.number().int().positive(),
  /** Read for display only — never written, never validated (spec R56). */
  name: z.string(),
  email: z.string(),
  group: z.string(),
  status: groupImportRowStatusSchema,
  message: z.string().nullable(),
  studentUserId: z.number().nullable(),
  groupId: z.number().nullable(),
});

export const groupImportPreviewSchema = z.object({
  rows: z.array(groupImportPreviewRowSchema),
  delimiter: z.enum(["comma", "tab"]),
  counts: z.object({
    assign: z.number(),
    unchanged: z.number(),
    no_student: z.number(),
    no_group: z.number(),
    invalid: z.number(),
    total: z.number(),
  }),
});
export type GroupImportPreview = z.infer<typeof groupImportPreviewSchema>;

/**
 * `seasonId` is NOT here: it comes from the path (D-16.20). v1 took it as an
 * argument on both the preview and the commit
 * (`group-import-actions.ts:20,59`), so the two calls could target different
 * seasons.
 */
export const groupImportCommitInputSchema = z.object({
  assignments: z
    .array(
      z.object({
        studentUserId: z.number().int().positive(),
        groupId: z.number().int().positive(),
      }),
    )
    .min(1)
    .max(IMPORT_MAX_ROWS),
});

export type GroupImportCommitInput = z.infer<typeof groupImportCommitInputSchema>;

export const groupImportResultSchema = z.object({
  /**
   * The number actually WRITTEN. v1 returns the requested array length
   * (spec R80/D5) while the underlying write silently skips anyone whose
   * eligibility check fails — "Assigned 40 students" could mean 12.
   */
  assigned: z.number(),
  skipped: z.number(),
  /** Who was not applied, so the screen can say which rows to look at. */
  skippedStudentIds: z.array(z.number()),
});
export type GroupImportResult = z.infer<typeof groupImportResultSchema>;
