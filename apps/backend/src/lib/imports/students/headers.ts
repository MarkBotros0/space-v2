import {
  IMPORT_EMAIL_HEADERS,
  IMPORT_FIELD_LABELS,
  IMPORT_NAME_HEADERS,
  IMPORT_PROFILE_ALIASES,
  // NOTE: a VALUE import from @space/shared in a backend file MUST use this
  // relative path. `tsc` emits this file to dist/apps/backend/src/lib/imports/students/
  // without rewriting bare specifiers, and a runtime `require("@space/shared")`
  // then resolves through node_modules back to the TypeScript SOURCE instead
  // of the compiled sibling in dist/packages/shared/src/ — the built server
  // dies with ERR_MODULE_NOT_FOUND. See CLAUDE.md; routes/auth.ts documents
  // the same trap in place. Do not "tidy" it back to the package name.
} from "../../../../../../packages/shared/src/index";
import type { ImportCellValues, ImportProfileFieldKey } from "@space/shared";

import { ImportParseError } from "../delimited";

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
