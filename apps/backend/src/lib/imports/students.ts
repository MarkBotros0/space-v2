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
  ImportOnExisting,
  ImportProfileFieldKey,
  ImportTemplate,
  StudentImportPreview,
  StudentImportResult,
  StudentImportResultRow,
  StudentImportRow,
} from "@space/shared";

import { db } from "../../db/client";
import { createStudentRows, enrollStudentInSeason, type NewStudentInput } from "../queries/students";
import { ImportParseError, type ParsedSheet } from "./delimited";

// ---------------------------------------------------------------------------
// Header mapping
// ---------------------------------------------------------------------------

export interface StudentHeaderMap {
  nameCol: number;
  emailCol: number;
  profileCols: { col: number; field: ImportProfileFieldKey }[];
  detectedColumns: string[];
  unrecognisedColumns: string[];
}

/**
 * Match a header cell by `trim().toLowerCase()` exact equality against a fixed
 * vocabulary — no fuzzy matching, no punctuation stripping (spec R12). What is
 * new is that a header matching NOTHING is collected and reported (R18/D11):
 * v1 drops it silently, which is the most common real-world silent data loss
 * in this domain.
 *
 * Columns are recorded by their true index, so an empty header cell shifts
 * nothing (R13). On a duplicate recognised header the FIRST wins, uniformly —
 * v1 is asymmetric here by accident (last wins for name/email, first for
 * profile columns, R17), and an artefact of an if/else chain is not a
 * specification (the reasoning behind ruling C12).
 */
export function mapStudentHeaders(header: string[]): StudentHeaderMap {
  let nameCol = -1;
  let emailCol = -1;
  const profileCols: { col: number; field: ImportProfileFieldKey }[] = [];
  const unrecognisedColumns: string[] = [];

  header.forEach((raw, col) => {
    const label = raw.trim();
    if (label === "") return;
    const key = label.toLowerCase();

    if ((IMPORT_NAME_HEADERS as readonly string[]).includes(key)) {
      if (nameCol === -1) nameCol = col;
      return;
    }
    if ((IMPORT_EMAIL_HEADERS as readonly string[]).includes(key)) {
      if (emailCol === -1) emailCol = col;
      return;
    }
    const field = IMPORT_PROFILE_ALIASES[key];
    if (field !== undefined) {
      if (!profileCols.some((p) => p.field === field)) profileCols.push({ col, field });
      return;
    }
    unrecognisedColumns.push(label);
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
    unrecognisedColumns,
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
// Validation — ONE standard for preview and commit (D-16.9)
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

export type RowValidation =
  | { ok: true; row: StudentImportRow }
  | { ok: false; message: string };

const FIELD_MESSAGE: Record<string, string> = {
  name: "Name is missing or too short.",
  email: "Email is not valid.",
  university: "University is too long.",
  year: "Year is too long.",
  phone: "Mobile No is too long.",
  spiritualBackground: "Spiritual background is too long.",
  gifts: "Gifts is too long.",
  notes: "Notes is too long.",
};

/**
 * Is this row importable? Called by the preview classifier AND by the commit,
 * which is the whole of D-16.9: v1 validated names and emails at preview and
 * lengths only at commit, so an over-long value previewed green and came back
 * `failed` after the operator had already committed (spec R24/R41/D12).
 *
 * `studentImportRowSchema` is `createStudentRequestSchema.omit({ seasonId })`,
 * so this is literally the same standard `POST /api/v1/students` applies.
 */
export function validateImportRow(values: ImportCellValues): RowValidation {
  if (values.dateOfBirth !== null) {
    // D-16.11 / spec D8. `new Date("01/02/2003")` is 2 January in V8, so a
    // European sheet transposes every birthday; a bare date resolves to LOCAL
    // midnight, which on a UTC+2 server stores the previous day (ruling C2
    // forbids deriving wall-clock facts from an incidental zone); and v1 drops
    // an unparseable value without failing the row.
    if (!ISO_DATE.test(values.dateOfBirth)) {
      return { ok: false, message: "Date of birth must be written as YYYY-MM-DD." };
    }
    const asUtc = new Date(`${values.dateOfBirth}T00:00:00.000Z`);
    // Catches 2003-02-30, which passes the regex and which Date silently
    // rolls forward to 2 March.
    if (Number.isNaN(asUtc.getTime()) || asUtc.toISOString().slice(0, 10) !== values.dateOfBirth) {
      return { ok: false, message: "Date of birth is not a real date. Use YYYY-MM-DD." };
    }
  }

  const parsed = studentImportRowSchema.safeParse({
    ...values,
    dateOfBirth:
      values.dateOfBirth === null ? null : `${values.dateOfBirth}T00:00:00.000Z`,
  });
  if (parsed.success) return { ok: true, row: parsed.data };

  const first = parsed.error.issues[0];
  const key = typeof first?.path[0] === "string" ? first.path[0] : "";
  return { ok: false, message: FIELD_MESSAGE[key] ?? "This row is not valid." };
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
 * resurrect an account somebody removed on purpose. The caller distinguishes
 * the two cases and reports `previously_removed` (D-16.14).
 *
 * This is a sequential scan on User — there is no functional index on
 * `lower(email)` and creating one is a migration (ruling C1), so it is on
 * Plan 18's list. Acceptable here: the table is small, and both preview and
 * commit are rate-limited (D-16.21).
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
 * Order is invalid → duplicate → (exists | previously_removed) → new, with
 * existence resolved by ONE batched lookup after the row loop, so the preview
 * is not N+1 (spec R26). Counts tally the final statuses; blank rows the
 * parser dropped are excluded from `total` (R30).
 */
export async function buildStudentImportPreview(sheet: ParsedSheet): Promise<StudentImportPreview> {
  const map = mapStudentHeaders(sheet.header);

  const rows: StudentImportPreview["rows"] = [];
  const seen = new Set<string>();
  const candidates: string[] = [];

  for (const parsedRow of sheet.rows) {
    const values = toCellValues(map, parsedRow.cells);
    const base = { rowNumber: parsedRow.rowNumber, name: values.name, email: values.email, values };

    const validation = validateImportRow(values);
    if (!validation.ok) {
      rows.push({ ...base, status: "invalid", message: validation.message });
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
    const match = existing.get(normaliseEmail(row.email));
    if (!match) continue;
    if (match.deletedAt !== null) {
      row.status = "previously_removed";
      row.message = "Previously removed — restore this account from the users screen.";
    } else {
      row.status = "exists";
      row.message = "Already in the system.";
    }
  }

  const counts = {
    new: 0,
    exists: 0,
    duplicate: 0,
    invalid: 0,
    previously_removed: 0,
    total: rows.length,
  };
  for (const row of rows) counts[row.status] += 1;

  return {
    rows,
    detectedColumns: map.detectedColumns,
    unrecognisedColumns: map.unrecognisedColumns,
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
    { label: "Mobile No", acceptedHeaders: ["phone", "mobile", "mobile no", "mobile no.", "mobile number", "phone number"], required: false, maxLength: 60, target: "StudentProfile.phone", note: null },
    { label: "University", acceptedHeaders: ["university", "college"], required: false, maxLength: 160, target: "StudentProfile.university", note: null },
    { label: "Year", acceptedHeaders: ["year"], required: false, maxLength: 40, target: "StudentProfile.year", note: "Stored as text — \"3rd\" and \"Year 3\" are both fine." },
    { label: "Date of birth", acceptedHeaders: ["date of birth", "dob", "birthdate", "birth date"], required: false, maxLength: null, target: "StudentProfile.dateOfBirth", note: "YYYY-MM-DD only. Anything else fails the row rather than being guessed at." },
    { label: "Spiritual background", acceptedHeaders: ["spiritual background"], required: false, maxLength: 4000, target: "StudentProfile.spiritualBackground", note: null },
    { label: "Gifts", acceptedHeaders: ["gifts", "spiritual gifts"], required: false, maxLength: 2000, target: "StudentProfile.gifts", note: null },
    { label: "Notes", acceptedHeaders: ["notes"], required: false, maxLength: 4000, target: "StudentProfile.notes", note: "Staff-internal. Never shown to the student." },
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

/**
 * Some rows the client asked to commit are not importable. The batch is
 * all-or-nothing (D-16.5), so this aborts everything and carries the row
 * NUMBERS — never the addresses (spec D19).
 */
export class ImportRowsInvalidError extends Error {
  constructor(readonly rowNumbers: number[]) {
    super("Some import rows are not valid.");
    this.name = "ImportRowsInvalidError";
  }
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

/**
 * Commit a whole batch: one transaction, all-or-nothing, idempotent by email.
 *
 * The preview lives in the client and is resubmitted (roadmap Plan 17), which
 * in v1 made the preview purely advisory — its commit accepted any rows the
 * shape schema admitted, never checked a preview had happened, and never
 * re-ran the classifier (spec R34, "the preview is advisory"). Here the
 * client sends cell VALUES and no status, and this function re-derives every
 * fact it needs: it re-validates each row against the same schema the preview
 * used, re-deduplicates the batch, and re-runs the existence lookup inside
 * the transaction. That re-derivation IS the integrity control (D-16.4).
 */
export async function commitStudentImport(
  input: StudentImportCommitRow[],
  target: StudentImportTarget,
  onExisting: ImportOnExisting,
): Promise<StudentImportResult> {
  // 1 ─ Re-validate everything BEFORE opening a transaction. A batch with any
  //     unimportable row writes nothing at all (D-16.5): v1 would have
  //     written rows 1–39, recorded row 40 `failed` and carried on to row 100.
  const validated: { rowNumber: number; row: StudentImportRow }[] = [];
  const invalidRowNumbers: number[] = [];
  for (const item of input) {
    const result = validateImportRow(item.values);
    if (!result.ok) {
      invalidRowNumbers.push(item.rowNumber);
      continue;
    }
    validated.push({ rowNumber: item.rowNumber, row: result.row });
  }
  if (invalidRowNumbers.length > 0) throw new ImportRowsInvalidError(invalidRowNumbers);

  // 2 ─ In-batch duplicates: the first occurrence wins, the rest are reported
  //     skipped. Case-insensitive — v1 compares raw strings, so "Foo@x.com"
  //     and "foo@x.com" in one file become TWO accounts (spec R25).
  const seen = new Set<string>();
  const unique: typeof validated = [];
  const outcomes = new Map<number, StudentImportResultRow>();

  for (const item of validated) {
    const key = normaliseEmail(item.row.email);
    if (seen.has(key)) {
      outcomes.set(item.rowNumber, {
        rowNumber: item.rowNumber,
        name: item.row.name,
        email: item.row.email,
        outcome: "skipped",
        message: "Repeated earlier in this import.",
        userId: null,
      });
      continue;
    }
    seen.add(key);
    unique.push(item);
  }

  await db.$transaction(
    async (tx) => {
      const existing = await findExistingByEmail(tx, unique.map((u) => u.row.email));

      const toCreate: typeof unique = [];
      const toEnroll: { rowNumber: number; userId: number }[] = [];

      for (const item of unique) {
        // ── THE IDEMPOTENCE BRANCH ────────────────────────────────────────
        // Everything from `const match` to the `continue` is what makes
        // "re-running the same paste creates zero new rows" true (spec R44,
        // decision D-16.6). On a match the importer skips: it never updates
        // and never duplicates.
        //
        // Deleting these lines is Task 7's mutation 1. The test that must go
        // red is "re-running the same paste creates ZERO new rows" in
        // imports-routes.test.ts.
        const match = existing.get(normaliseEmail(item.row.email));
        if (match) {
          const outcome = existingOutcome(item, match, target, onExisting);
          outcomes.set(item.rowNumber, outcome);
          if (outcome.outcome === "enrolled") {
            toEnroll.push({ rowNumber: item.rowNumber, userId: match.id });
          }
          continue;
        }
        // ── END IDEMPOTENCE BRANCH ────────────────────────────────────────
        toCreate.push(item);
      }

      if (toCreate.length > 0) {
        const created = await createStudentRows(
          tx,
          toCreate.map((t) => toNewStudentInput(t.row)),
          target,
        );
        const idByEmail = new Map(created.map((c) => [normaliseEmail(c.email), c.id]));
        for (const item of toCreate) {
          outcomes.set(item.rowNumber, {
            rowNumber: item.rowNumber,
            name: item.row.name,
            email: item.row.email,
            outcome: "created",
            message: null,
            userId: idByEmail.get(normaliseEmail(item.row.email)) ?? null,
          });
        }
      }

      if (target.kind === "season") {
        for (const e of toEnroll) {
          // D-16.7, on Plan 7's rules (one writer — enrollStudentInSeason):
          //  - one enrolment per student per season, ever. An existing row —
          //    ACTIVE, WITHDRAWN or COMPLETED — is left entirely alone and the
          //    row is reported `skipped`, the bulk form of Plan 7's 409
          //    already_enrolled. A spreadsheet can never resurrect a WITHDRAWN
          //    enrolment or erase why somebody left;
          //  - the profile pointer is set only when it is UNSET; a pointer
          //    another season already holds is never stolen;
          //  - nothing else on the profile is written.
          const result = await enrollStudentInSeason(tx, e.userId, target.seasonId);
          if (result === "already_enrolled") {
            const prior = outcomes.get(e.rowNumber);
            if (prior) {
              outcomes.set(e.rowNumber, {
                ...prior,
                outcome: "skipped",
                message: "Already enrolled in this season — left unchanged.",
              });
            }
          }
        }
      }
    },
    // Generous but bounded. The create path is three statements regardless of
    // size; only the `enroll` loop scales with the number of EXISTING
    // students in the batch, which is the smaller number in practice.
    { timeout: 30_000 },
  );

  const rows = input
    .map((item) => outcomes.get(item.rowNumber))
    .filter((r): r is StudentImportResultRow => r !== undefined);

  return {
    created: rows.filter((r) => r.outcome === "created").length,
    skipped: rows.filter((r) => r.outcome === "skipped").length,
    enrolled: rows.filter((r) => r.outcome === "enrolled").length,
    rows,
  };
}

/**
 * What happens to a row whose address is already in the database.
 *
 * The deleted and non-student cases come FIRST, so `enroll` can never reach
 * them: enrolling a soft-deleted account would quietly undo a deliberate
 * removal, and enrolling a LEADER's address as a student would put staff on
 * a roster.
 */
function existingOutcome(
  item: { rowNumber: number; row: StudentImportRow },
  match: ExistingUser,
  target: StudentImportTarget,
  onExisting: ImportOnExisting,
): StudentImportResultRow {
  const base = {
    rowNumber: item.rowNumber,
    name: item.row.name,
    email: item.row.email,
    userId: match.id,
  };

  if (match.deletedAt !== null) {
    // D-16.14 / spec D6. The lookup is deliberately unfiltered by deletedAt,
    // so this row can never be re-imported — the address stays reserved by
    // User.email @unique. Freeing it is a partial unique index, which is a
    // migration, which is Plan 18.
    return {
      ...base,
      // No id for a removed or staff account: the import screen has no use
      // for it, and it would hand the operator a handle on a row they
      // reached only by typing its address.
      userId: null,
      outcome: "skipped",
      message: "Previously removed — restore this account from the users screen.",
    };
  }
  if (match.role !== "STUDENT") {
    return {
      ...base,
      userId: null,
      outcome: "skipped",
      message: "That address already belongs to a staff account.",
    };
  }
  if (onExisting === "enroll" && target.kind === "season") {
    // Provisional: the enrol loop below may downgrade this to `skipped` when
    // the student already holds an enrolment in the target season (Plan 7's
    // already_enrolled rule, applied per row).
    return { ...base, outcome: "enrolled", message: "Already in the system — enrolled in this season." };
  }
  return { ...base, outcome: "skipped", message: "Already in the system." };
}
