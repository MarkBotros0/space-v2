import {
  studentImportRowSchema,
  yearFromText,
  // NOTE: a VALUE import from @space/shared in a backend file MUST use this
  // relative path. `tsc` emits this file to dist/apps/backend/src/lib/imports/students/
  // without rewriting bare specifiers, and a runtime `require("@space/shared")`
  // then resolves through node_modules back to the TypeScript SOURCE instead
  // of the compiled sibling in dist/packages/shared/src/ — the built server
  // dies with ERR_MODULE_NOT_FOUND. See CLAUDE.md; routes/auth.ts documents
  // the same trap in place. Do not "tidy" it back to the package name.
} from "../../../../../../packages/shared/src/index";
import type { ImportCellValues, StudentImportRow } from "@space/shared";

import type { db } from "../../../db/client";

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
  faculty: "Faculty is too long.",
  universityGraduationYear: "Graduation year must be a whole year between 1950 and 2100.",
  phone: "Mobile No is too long.",
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
    // A whole number or nothing; "2027.5" or "Class of 27" fails the row.
    universityGraduationYear:
      values.universityGraduationYear === null ? null : yearFromText(values.universityGraduationYear),
    dateOfBirth:
      values.dateOfBirth === null ? null : `${values.dateOfBirth}T00:00:00.000Z`,
  });
  if (parsed.success) return { ok: true, row: parsed.data };

  const first = parsed.error.issues[0];
  const key = typeof first?.path[0] === "string" ? first.path[0] : "";
  return { ok: false, message: FIELD_MESSAGE[key] ?? "This row is not valid." };
}

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
 * `lower(email)`. Acceptable here: the table is small, and both preview and
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
