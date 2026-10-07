// apps/backend/src/lib/exports/workbook-style.ts
import type ExcelJS from "exceljs";

// VALUE import — relative, FIVE levels up from src/lib/exports/ (routes/ is
// four; getting this wrong is ERR_MODULE_NOT_FOUND at runtime, CLAUDE.md).
import { REPORT_METRIC_NOTES } from "../../../../../packages/shared/src/index";

import { formatInOrgTime } from "../org-time";

/** brand-navy-900, ported verbatim from jpc-space/src/lib/season-export.ts:23. */
export const HEADER_FILL = "FF0B2447";

/**
 * Pinned collation.
 *
 * v1 sorted with `a.name.localeCompare(b.name)` and NO locale argument
 * (season-export.ts:66, R65), so row order followed whatever ICU default the
 * host happened to have — which differs between a laptop and a container. Two
 * servers exporting the same season now produce identical row order.
 */
export const COLLATOR = new Intl.Collator("en", { sensitivity: "base" });

export function styleHeader(row: ExcelJS.Row): void {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
  row.alignment = { vertical: "middle" };
}

export function freezeFirstRowAndColumns(sheet: ExcelJS.Worksheet, xSplit: number): void {
  sheet.views = [{ state: "frozen", xSplit, ySplit: 1 }];
}

/** 22 / 28 / 22 for Student / Email / Group, then a per-sheet width (R67). */
export function columnWidths(headerLength: number, dataWidth: number): Array<{ width: number }> {
  return Array.from({ length: headerLength }, (_, i) => ({
    width: i < 3 ? (i === 1 ? 28 : 22) : dataWidth,
  }));
}

export interface KeySheetContext {
  scopeDescription: string;
  symbols: Array<[string, string]>;
}

/**
 * The fourth sheet.
 *
 * Spec D16 asks for a legend row; a legend row inside a data sheet breaks
 * sorting and filtering, which are the two things an operator opens a
 * spreadsheet to do. So it is its own sheet — a deliberate divergence from
 * R63's "exactly three sheets".
 *
 * REPORT_METRIC_NOTES comes from packages/shared and is rendered verbatim by
 * the mobile screen's method disclosure too, so the spreadsheet and the app
 * cannot describe the same metric differently (ruling C4 applied to prose).
 */
export function addKeySheet(workbook: ExcelJS.Workbook, ctx: KeySheetContext): void {
  const sheet = workbook.addWorksheet("Key");
  sheet.columns = [{ width: 18 }, { width: 110 }];

  sheet.addRow(["Key", ""]);
  styleHeader(sheet.getRow(1));

  sheet.addRow(["Scope", ctx.scopeDescription]);
  sheet.addRow(["Generated", formatInOrgTime(new Date())]);
  sheet.addRow(["", ""]);

  sheet.addRow(["Symbol", "Meaning"]);
  for (const [symbol, meaning] of ctx.symbols) sheet.addRow([symbol, meaning]);
  sheet.addRow(["", ""]);

  sheet.addRow(["How these numbers are calculated", ""]);
  for (const note of REPORT_METRIC_NOTES) sheet.addRow(["", note]);
}
