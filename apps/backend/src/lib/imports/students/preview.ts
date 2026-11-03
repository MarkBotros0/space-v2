import type { StudentImportPreview } from "@space/shared";

import { db } from "../../../db/client";
import type { ParsedSheet } from "../delimited";
import { mapStudentHeaders, toCellValues } from "./headers";
import { findExistingByEmail, normaliseEmail, validateImportRow } from "./validation";

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
