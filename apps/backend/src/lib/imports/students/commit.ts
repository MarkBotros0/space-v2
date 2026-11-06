import type {
  ImportCellValues,
  ImportOnExisting,
  StudentImportResult,
  StudentImportResultRow,
  StudentImportRow,
} from "@space/shared";

import { db } from "../../../db/client";
import { createStudentRows, type NewStudentInput } from "../../queries/students";
import { newPersonRefusal, readSeatSeason, seatStudents } from "../../roles";
import {
  findExistingByEmail,
  normaliseEmail,
  validateImportRow,
  type ExistingUser,
} from "./validation";

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

/** The target season went away between the route's check and the transaction. */
export class ImportSeasonGoneError extends Error {
  constructor() {
    super("The import's season no longer exists.");
    this.name = "ImportSeasonGoneError";
  }
}

function toNewStudentInput(row: StudentImportRow): NewStudentInput {
  return {
    name: row.name,
    email: row.email,
    university: row.university ?? null,
    faculty: row.faculty ?? null,
    universityGraduationYear: row.universityGraduationYear ?? null,
    phone: row.phone ?? null,
    // Already normalised to `YYYY-MM-DDT00:00:00.000Z` by validateImportRow,
    // so this is UTC midnight and not the server's local midnight (D-16.11).
    dateOfBirth: row.dateOfBirth ? new Date(row.dateOfBirth) : null,
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
      const season = target.kind === "season" ? await readSeatSeason(tx, target.seasonId) : null;
      if (target.kind === "season" && !season) throw new ImportSeasonGoneError();

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
        // A season with a required program refuses someone with no history,
        // and a refused row writes nothing: no account, no enrolment.
        const refusal = season ? await newPersonRefusal(tx, item.row.name, season) : null;
        if (refusal) {
          outcomes.set(item.rowNumber, {
            rowNumber: item.rowNumber,
            name: item.row.name,
            email: item.row.email,
            outcome: "skipped",
            message: refusal.message,
            userId: null,
          });
          continue;
        }
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

      if (season) {
        // D-16.7, on Plan 7's rules (one writer — enrollStudentsInSeason):
        //  - one enrolment per student per season, ever. An existing row —
        //    ACTIVE, WITHDRAWN or COMPLETED — is left entirely alone and the
        //    row is reported `skipped`, the bulk form of Plan 7's 409
        //    already_enrolled. A spreadsheet can never resurrect a WITHDRAWN
        //    enrolment or erase why somebody left;
        //  - nothing else on the profile is written.
        // One person refused doesn't stop the others: their row says why.
        const rowOf = new Map(toEnroll.map((e) => [e.userId, e.rowNumber]));
        const { refused } = await seatStudents(tx, season, toEnroll.map((e) => e.userId), { partial: true });
        for (const { userId, refusal } of refused) {
          const rowNumber = rowOf.get(userId)!;
          const prior = outcomes.get(rowNumber);
          if (prior) {
            outcomes.set(rowNumber, {
              ...prior,
              outcome: "skipped",
              message:
                refusal.code === "in_season" ? "Already enrolled in this season — left unchanged." : refusal.message,
            });
          }
        }
      }
    },
    // Generous but bounded. Neither the create path nor `seatStudents` grows its
    // statement count with the batch; each statement just carries more rows.
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
    // Provisional: `seatStudents` below may downgrade this to `skipped`, when
    // the student already holds an enrolment in the target season (Plan 7's
    // already_enrolled rule, applied per row) or can't take the seat.
    return { ...base, outcome: "enrolled", message: "Already in the system — enrolled in this season." };
  }
  return { ...base, outcome: "skipped", message: "Already in the system." };
}
