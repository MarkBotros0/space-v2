// apps/backend/src/lib/imports/students.ts
import {
  IMPORT_EMAIL_HEADERS,
  IMPORT_FIELD_LABELS,
  IMPORT_MAX_PASTE_CHARS,
  IMPORT_MAX_ROWS,
  IMPORT_NAME_HEADERS,
  IMPORT_PROFILE_ALIASES,
  studentImportRowSchema,
  // NOTE: a VALUE import from @space/shared in a backend file MUST use this
  // relative path. `tsc` emits this file to dist/apps/backend/src/lib/imports/
  // without rewriting bare specifiers, and a runtime `require("@space/shared")`
  // then resolves through node_modules back to the TypeScript SOURCE instead
  // of the compiled sibling in dist/packages/shared/src/ — the built server
  // dies with ERR_MODULE_NOT_FOUND. See CLAUDE.md; routes/auth.ts documents
  // the same trap in place. Do not "tidy" it back to the package name.
} from "../../../../../packages/shared/src/index";
import type {
  ImportCellValues,
  ImportProfileFieldKey,
  ImportTemplate,
  StudentImportPreview,
  StudentImportResult,
  StudentImportResultRow,
  StudentImportRow,
} from "@space/shared";

import { z } from "zod";

import { db } from "../../db/client";
import { Prisma } from "../../generated/prisma/client";
import { createStudentRows, type NewStudentInput } from "../queries/students";
import { ImportParseError, type ParsedSheet } from "./delimited";

// ---------------------------------------------------------------------------
// Header mapping
// ---------------------------------------------------------------------------

export interface StudentHeaderMap {
  nameCol: number;
  emailCol: number;
  profileCols: { col: number; field: ImportProfileFieldKey }[];
  detectedColumns: string[];
}

/**
 * Match a header cell by `trim().toLowerCase()` exact equality against a fixed
 * vocabulary — no fuzzy matching, no punctuation stripping (spec R12). A
 * header matching nothing is silently ignored, as v1 (R18 / D-16.12).
 *
 * Columns are recorded by their true index, so an empty header cell shifts
 * nothing (R13). Duplicate headers follow v1 exactly (R17 / D-16.22): the
 * LAST `name`/`email` column wins, the FIRST column for a profile field wins
 * (`jpc-space/src/lib/student-import.ts:96-103`).
 */
export function mapStudentHeaders(header: string[]): StudentHeaderMap {
  let nameCol = -1;
  let emailCol = -1;
  const profileCols: { col: number; field: ImportProfileFieldKey }[] = [];

  header.forEach((raw, col) => {
    const label = raw.trim();
    if (label === "") return;
    const key = label.toLowerCase();

    if ((IMPORT_NAME_HEADERS as readonly string[]).includes(key)) {
      nameCol = col;
      return;
    }
    if ((IMPORT_EMAIL_HEADERS as readonly string[]).includes(key)) {
      emailCol = col;
      return;
    }
    const field = IMPORT_PROFILE_ALIASES[key];
    if (field !== undefined) {
      if (!profileCols.some((p) => p.field === field)) profileCols.push({ col, field });
    }
  });

  if (nameCol === -1 || emailCol === -1) {
    throw new ImportParseError(
      'The first line must be a header row with "name" and "email" columns.',
    );
  }

  return {
    nameCol,
    emailCol,
    profileCols,
    // Display only (R19): the two literals, then each matched profile
    // column's canonical label in sheet order.
    detectedColumns: ["Name", "Email", ...profileCols.map((p) => IMPORT_FIELD_LABELS[p.field])],
  };
}

/**
 * One row's raw cells. Every value is trimmed, and an empty optional cell
 * becomes `null` rather than `""` (spec R21/R51 — a cleared field is stored
 * NULL, never an empty string).
 */
export function toCellValues(map: StudentHeaderMap, cells: string[]): ImportCellValues {
  const at = (col: number): string => (cells[col] ?? "").trim();

  const values: ImportCellValues = {
    name: at(map.nameCol),
    email: at(map.emailCol),
    university: null,
    year: null,
    phone: null,
    dateOfBirth: null,
    spiritualBackground: null,
    gifts: null,
    notes: null,
  };
  for (const { col, field } of map.profileCols) {
    const v = at(col);
    values[field] = v === "" ? null : v;
  }
  return values;
}

// ---------------------------------------------------------------------------
// Validation — two stages, as v1 (D-16.9)
// ---------------------------------------------------------------------------

/**
 * The single normalisation used for EVERY email comparison in this domain.
 *
 * Comparison only — the address is stored exactly as the operator typed it
 * (D-16.6). `User.email` is a plain unique column with no citext
 * (prisma/schema.prisma:105) and v1's `verifyCredentials` looks it up
 * verbatim, so lower-casing what we STORE would lock existing users out. But
 * comparing case-sensitively is how v1's importer mints a second account for
 * someone already in the system (spec D2/R25/R28).
 *
 * Reverting this to `email.trim()` is Task 7's mutation 2.
 */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * D-16.11 / spec D8 (KEEP-FIX R50). `new Date("01/02/2003")` is 2 January in
 * V8, so a European sheet transposes every birthday; a bare date resolves to
 * LOCAL midnight, which on a UTC+2 server stores the previous day (ruling C2);
 * and v1 drops an unparseable value without failing the row. Returns the
 * operator-facing problem, or null when the cell is empty or a real ISO date.
 */
function dateOfBirthProblem(dateOfBirth: string | null): string | null {
  if (dateOfBirth === null) return null;
  if (!ISO_DATE.test(dateOfBirth)) return "Date of birth must be written as YYYY-MM-DD.";
  const asUtc = new Date(`${dateOfBirth}T00:00:00.000Z`);
  // Catches 2003-02-30, which passes the regex and which Date silently rolls
  // forward to 2 March.
  if (Number.isNaN(asUtc.getTime()) || asUtc.toISOString().slice(0, 10) !== dateOfBirth) {
    return "Date of birth is not a real date. Use YYYY-MM-DD.";
  }
  return null;
}

const previewEmailSchema = z.string().trim().email();

/**
 * The PREVIEW check, as v1 (`jpc-space/src/lib/student-import.ts:129`, R24):
 * only a name of at least 2 characters and a parseable email — plus the
 * date-of-birth rule (R50 KEEP-FIX). An over-long value previews `new` and is
 * reported `failed` at commit. Returns the row's message, or null when fine.
 */
export function previewRowProblem(values: ImportCellValues): string | null {
  if (values.name.length < 2) return "Name is missing or too short.";
  if (!previewEmailSchema.safeParse(values.email).success) return "Email is not valid.";
  return dateOfBirthProblem(values.dateOfBirth);
}

export type RowValidation = { ok: true; row: StudentImportRow } | { ok: false };

/**
 * The COMMIT check: `studentImportRowSchema` with v1's import bounds (R41)
 * plus the date-of-birth rule. A failing row is reported `failed`
 * "Invalid name or email." by the commit loop (R42).
 */
export function validateImportRow(values: ImportCellValues): RowValidation {
  if (dateOfBirthProblem(values.dateOfBirth) !== null) return { ok: false };
  const parsed = studentImportRowSchema.safeParse({
    ...values,
    dateOfBirth: values.dateOfBirth === null ? null : `${values.dateOfBirth}T00:00:00.000Z`,
  });
  return parsed.success ? { ok: true, row: parsed.data } : { ok: false };
}

// ---------------------------------------------------------------------------
// Existence lookup
// ---------------------------------------------------------------------------

export interface ExistingUser {
  id: number;
  email: string;
  role: string;
  deletedAt: Date | null;
}

/** `db` and a `$transaction` client both satisfy this. */
type Queryable = Pick<typeof db, "$queryRaw">;

/**
 * Every candidate address in one statement, matched on `lower(email)`.
 *
 * Raw SQL because Prisma's `mode: "insensitive"` would need one OR branch per
 * address — a 2000-branch WHERE for a full paste. `deletedAt` is deliberately
 * NOT filtered (spec R27/R43, kept): un-deleted matching would let an import
 * resurrect an account somebody removed on purpose, so a soft-deleted match
 * reads `exists` / `skipped` "Already in the system." like any other (R22).
 *
 * This is a sequential scan on User — there is no functional index on
 * `lower(email)` and creating one is a migration (ruling C1), so it is on
 * Plan 18's list. Acceptable here: the table is small.
 */
export async function findExistingByEmail(
  client: Queryable,
  emails: string[],
): Promise<Map<string, ExistingUser>> {
  const keys = [...new Set(emails.map(normaliseEmail))];
  if (keys.length === 0) return new Map();

  const rows = await client.$queryRaw<ExistingUser[]>`
    SELECT id, email, role::text AS role, "deletedAt"
    FROM "User"
    WHERE lower(email) = ANY(${keys}::text[])
  `;
  return new Map(rows.map((r) => [normaliseEmail(r.email), r]));
}

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

/**
 * Classify every row against the file and against the database.
 *
 * Order is blank (skipped) → invalid → duplicate → exists → new, with
 * existence resolved by ONE batched lookup after the row loop, so the preview
 * is not N+1 (spec R26). Counts tally the final statuses; blank rows are
 * excluded from `total` (R30).
 */
export async function buildStudentImportPreview(sheet: ParsedSheet): Promise<StudentImportPreview> {
  const map = mapStudentHeaders(sheet.header);

  const rows: StudentImportPreview["rows"] = [];
  const seen = new Set<string>();
  const candidates: string[] = [];

  for (const parsedRow of sheet.rows) {
    const values = toCellValues(map, parsedRow.cells);
    // v1's blank-row rule, applied after header mapping
    // (`jpc-space/src/lib/student-import.ts:120-127`, R20): a row is blank
    // when name, email and every RECOGNISED profile cell are empty, even if
    // an ignored column has text. The parser's all-blank filter only keeps
    // line numbering honest.
    const hasProfileData = map.profileCols.some(({ field }) => values[field] !== null);
    if (values.name === "" && values.email === "" && !hasProfileData) continue;

    const base = { rowNumber: parsedRow.rowNumber, name: values.name, email: values.email, values };

    const problem = previewRowProblem(values);
    if (problem !== null) {
      rows.push({ ...base, status: "invalid", message: problem });
      continue;
    }

    const key = normaliseEmail(values.email);
    if (seen.has(key)) {
      rows.push({ ...base, status: "duplicate", message: "Repeated earlier in this paste." });
      continue;
    }
    seen.add(key);
    candidates.push(values.email);
    rows.push({ ...base, status: "new", message: null });
  }

  const existing = await findExistingByEmail(db, candidates);
  for (const row of rows) {
    if (row.status !== "new") continue;
    // Deleted or not (R22 / D-16.14).
    if (existing.has(normaliseEmail(row.email))) {
      row.status = "exists";
      row.message = "Already in the system.";
    }
  }

  const counts = { new: 0, exists: 0, duplicate: 0, invalid: 0, total: rows.length };
  for (const row of rows) counts[row.status] += 1;

  return {
    rows,
    detectedColumns: map.detectedColumns,
    delimiter: sheet.delimiter,
    counts,
  };
}

// ---------------------------------------------------------------------------
// Template
// ---------------------------------------------------------------------------

/**
 * The column schema as data, so the mobile screen can render "columns we
 * recognise" and a copyable header row natively.
 *
 * Deliberately JSON and not a downloadable .xlsx (spec §7): a file download
 * would need the very upload/CMS machinery this domain is avoiding, and the
 * phone has nowhere useful to put a file anyway.
 */
export function studentImportTemplate(): ImportTemplate {
  const columns: ImportTemplate["columns"] = [
    {
      label: "Name",
      acceptedHeaders: [...IMPORT_NAME_HEADERS],
      required: true,
      maxLength: 120,
      target: "User.name",
      note: null,
    },
    {
      label: "Email",
      acceptedHeaders: [...IMPORT_EMAIL_HEADERS],
      required: true,
      maxLength: null,
      target: "User.email",
      note: "Matching is case-insensitive; someone already in the system is skipped, never duplicated.",
    },
    { label: "Mobile No", acceptedHeaders: ["phone", "mobile", "mobile no", "mobile no.", "mobile number", "phone number"], required: false, maxLength: 50, target: "StudentProfile.phone", note: null },
    { label: "University", acceptedHeaders: ["university", "college"], required: false, maxLength: 200, target: "StudentProfile.university", note: null },
    { label: "Year", acceptedHeaders: ["year"], required: false, maxLength: 50, target: "StudentProfile.year", note: "Stored as text — \"3rd\" and \"Year 3\" are both fine." },
    { label: "Date of birth", acceptedHeaders: ["date of birth", "dob", "birthdate", "birth date"], required: false, maxLength: null, target: "StudentProfile.dateOfBirth", note: "YYYY-MM-DD only. Anything else fails the row rather than being guessed at." },
    { label: "Spiritual background", acceptedHeaders: ["spiritual background"], required: false, maxLength: 2000, target: "StudentProfile.spiritualBackground", note: null },
    { label: "Gifts", acceptedHeaders: ["gifts", "spiritual gifts"], required: false, maxLength: 2000, target: "StudentProfile.gifts", note: null },
    { label: "Notes", acceptedHeaders: ["notes"], required: false, maxLength: 2000, target: "StudentProfile.notes", note: "Staff-internal. Never shown to the student." },
  ];

  return {
    columns,
    headerRow: ["name", "email", "Mobile No", "University", "Year", "Date of birth", "Spiritual background", "Gifts", "Notes"].join("\t"),
    maxRows: IMPORT_MAX_ROWS,
    maxPasteChars: IMPORT_MAX_PASTE_CHARS,
    capabilities: { pasteText: true, fileUpload: false },
  };
}

// ---------------------------------------------------------------------------
// Commit
// ---------------------------------------------------------------------------

export type StudentImportTarget =
  | { kind: "season"; seasonId: number }
  | { kind: "alumni"; graduationYear: number };

export interface StudentImportCommitRow {
  rowNumber: number;
  values: ImportCellValues;
}

function toNewStudentInput(row: StudentImportRow): NewStudentInput {
  return {
    name: row.name,
    email: row.email,
    university: row.university ?? null,
    year: row.year ?? null,
    phone: row.phone ?? null,
    // Already normalised to `YYYY-MM-DDT00:00:00.000Z` by validateImportRow,
    // so this is UTC midnight and not the server's local midnight (D-16.11).
    dateOfBirth: row.dateOfBirth ? new Date(row.dateOfBirth) : null,
    spiritualBackground: row.spiritualBackground ?? null,
    gifts: row.gifts ?? null,
    notes: row.notes ?? null,
  };
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

/**
 * Commit the rows: v1's sequential per-row loop, each row in its own
 * transaction (`jpc-space/src/lib/student-import.ts:238-291`, D-16.5).
 *
 * The client sends cell VALUES and no status, and each row is re-validated
 * (R41) and re-checked against the database (D-16.4) before it is written:
 *  - invalid → `failed` "Invalid name or email." and the loop continues (R42);
 *  - an existing user, deleted or not, staff or student → `skipped`
 *    "Already in the system." (R44, R22). Never updated, never enrolled;
 *  - otherwise User + StudentProfile (+ ACTIVE SeasonEnrollment in season
 *    mode) in ONE transaction for this row (R45, R46). Earlier rows stay
 *    committed when a later one fails;
 *  - a unique-violation race → `skipped` "Already in the system." (R52);
 *  - any other error → logged by row number (never the email, D-16.18) and
 *    `failed` "Could not create this account." (R53).
 *
 * Re-running the same paste creates zero new rows (D-16.6): every row then
 * hits the existence branch. A repeated address later in the same paste
 * finds the row created moments earlier and is skipped the same way.
 */
export async function commitStudentImport(
  input: StudentImportCommitRow[],
  target: StudentImportTarget,
): Promise<StudentImportResult> {
  const rows: StudentImportResultRow[] = [];

  for (const item of input) {
    const base = { rowNumber: item.rowNumber, name: item.values.name, email: item.values.email };

    const validation = validateImportRow(item.values);
    if (!validation.ok) {
      rows.push({ ...base, outcome: "failed", message: "Invalid name or email.", userId: null });
      continue;
    }
    const row = validation.row;
    const shown = { ...base, name: row.name, email: row.email };

    try {
      // ── THE IDEMPOTENCE BRANCH ────────────────────────────────────────
      // On a match the importer skips: it never updates and never
      // duplicates (spec R44, decision D-16.6). Deleting this branch is
      // Task 7's mutation 1.
      const existing = await findExistingByEmail(db, [row.email]);
      if (existing.size > 0) {
        rows.push({ ...shown, outcome: "skipped", message: "Already in the system.", userId: null });
        continue;
      }
      // ── END IDEMPOTENCE BRANCH ────────────────────────────────────────

      const [created] = await db.$transaction((tx) =>
        createStudentRows(tx, [toNewStudentInput(row)], target),
      );
      rows.push({ ...shown, outcome: "created", message: null, userId: created?.id ?? null });
    } catch (err) {
      if (isUniqueViolation(err)) {
        rows.push({ ...shown, outcome: "skipped", message: "Already in the system.", userId: null });
      } else {
        // The row number and error class only: a Prisma message can quote
        // the address, and a log of student emails is not wanted (D-16.18).
        const kind = err instanceof Prisma.PrismaClientKnownRequestError ? err.code : err instanceof Error ? err.name : "unknown";
        console.error(`[student-import] row ${item.rowNumber} failed: ${kind}`);
        rows.push({
          ...shown,
          outcome: "failed",
          message: "Could not create this account.",
          userId: null,
        });
      }
    }
  }

  return {
    created: rows.filter((r) => r.outcome === "created").length,
    skipped: rows.filter((r) => r.outcome === "skipped").length,
    failed: rows.filter((r) => r.outcome === "failed").length,
    rows,
  };
}
