// apps/backend/src/lib/exports/engagement-workbook.ts
import ExcelJS from "exceljs";

import type { EngagementReportRow } from "@space/shared";
// VALUE import — relative, five levels up.
import { BAND_LABEL } from "../../../../../packages/shared/src/index";

import { addKeySheet, columnWidths, freezeFirstRowAndColumns, styleHeader } from "./workbook-style";

/**
 * The per-student engagement export — v1's CSV, as a spreadsheet.
 *
 * v1's toCsv quoted with JSON.stringify, so a name containing a double quote
 * came out as \" (which no CSV parser accepts) and a backslash was doubled
 * (R40); rows joined with bare LF and no BOM, so Excel on Windows decoded the
 * file as the system codepage and mangled every non-ASCII name (R41). For this
 * organisation's roster that is most of them. exceljs handles encoding, and the
 * workbook path has to exist anyway (spec D7, D10).
 *
 * Rows are sorted ascending by score — v1 had no orderBy at all (R39), so the
 * file came out in whatever order Postgres returned the enrolments. Ascending
 * puts the students who need attention on the first screen.
 *
 * `Band` is a column because the enum is the contract; a reader can filter on
 * "AT_RISK" without knowing the threshold.
 */
export function buildEngagementWorkbook(
  rows: EngagementReportRow[],
  scopeLabel: string,
): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "JPC Space";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Engagement");
  const header = [
    "Student",
    "Email",
    "Season",
    "Attendance %",
    // The denominator, in the header — the same discipline as the season
    // workbook's Assignments sheet (ruling C5).
    "Submission % (assigned to student)",
    "Score",
    "Band",
  ];
  sheet.addRow(header);
  sheet.columns = columnWidths(header.length, 20);

  for (const row of [...rows].sort((a, b) => a.score - b.score || a.studentUserId - b.studentUserId)) {
    sheet.addRow([
      row.name,
      row.email,
      row.seasonTitle,
      row.attendancePct,
      row.submissionPct,
      row.score,
      BAND_LABEL[row.band],
    ]);
  }

  styleHeader(sheet.getRow(1));
  freezeFirstRowAndColumns(sheet, 3);

  addKeySheet(workbook, {
    scopeDescription: scopeLabel,
    symbols: [
      ["At risk", "Either component is below 60%"],
      ["Low / Medium / High", "Combined score bands, applied after the at-risk test"],
    ],
  });

  return workbook;
}
