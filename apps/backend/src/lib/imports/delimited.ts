// apps/backend/src/lib/imports/delimited.ts

/**
 * Delimited-text parsing for the paste-first importer.
 *
 * This module replaces v1's `src/lib/spreadsheet.ts`, and none of that file
 * ports. `cellText()` there exists only to flatten ExcelJS's seven cell
 * shapes (string / number / Date / {text} / {hyperlink} / {result} /
 * {richText}) back into a string; with a paste there is nothing to flatten.
 * `loadFirstWorksheet()` is the branch that produced spec D7 — its CSV path
 * forces raw text to protect a leading "+" and leading zeros in phone
 * numbers, with the reason spelled out in a comment, and its XLSX path has no
 * such protection, so the same data imports differently depending on which
 * accepted format it was saved in.
 *
 * Here every cell is, and stays, a string. D7 cannot happen. When .xlsx
 * intake lands with the CMS it must read each cell's FORMATTED TEXT rather
 * than its value, or D7 comes straight back.
 *
 * `exceljs` is deliberately not a dependency of this backend (D-16.2).
 */

export type ImportDelimiter = "comma" | "tab";

/**
 * An error whose message was written for the operator and is safe to surface
 * verbatim (spec R14). Anything else thrown out of this module is a bug and
 * the route replaces it with a generic message.
 *
 * v1 used two different classes for this one job — `ImportParseError`
 * (student-import.ts:7) and `SpreadsheetParseError` (spreadsheet.ts:4). One.
 */
export class ImportParseError extends Error {}

export interface ParsedRow {
  /**
   * The operator's own line number. The header is line 1 and data starts at
   * line 2 (spec R11); a blank line KEEPS its number and is dropped, so these
   * are not contiguous (R20) and "row 41" points at line 41 of the paste.
   */
  rowNumber: number;
  cells: string[];
}

export interface ParsedSheet {
  delimiter: ImportDelimiter;
  header: string[];
  rows: ParsedRow[];
}

const DELIMITER_CHAR: Record<ImportDelimiter, string> = { comma: ",", tab: "\t" };

/**
 * Sniffing looks at the FIRST LINE ONLY.
 *
 * A header row is the one line in a sheet least likely to contain a comma
 * inside a value, and counting delimiters across the whole paste would let a
 * single "Cairo, Egypt" in row 900 flip the delimiter for every row. Spec
 * §10b: spreadsheet apps put tab-separated text on the clipboard, a CSV
 * export is comma-separated, and an explicit `delimiter` exists precisely so
 * the caller can overrule this when they know better.
 */
export function sniffDelimiter(firstLine: string): ImportDelimiter {
  return firstLine.includes("\t") ? "tab" : "comma";
}

/**
 * RFC-4180 scanner. Handles quoted fields containing the delimiter, a
 * newline, or a doubled quote; CRLF, LF and lone-CR line endings.
 *
 * Blank records are RETAINED here and dropped by the caller, after numbering
 * — dropping them in the scanner would renumber every row after a blank line
 * and make every message point at the wrong place.
 */
function splitRecords(text: string, delimiter: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  const endField = (): void => {
    record.push(field);
    field = "";
  };
  const endRecord = (): void => {
    endField();
    records.push(record);
    record = [];
  };

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    // A quote only opens a quoted field at the START of one; a stray quote
    // mid-value is data ( O"Brien ), not syntax.
    if (ch === '"' && field === "") {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === delimiter) {
      endField();
      i += 1;
      continue;
    }
    if (ch === "\r") {
      endRecord();
      i += text[i + 1] === "\n" ? 2 : 1;
      continue;
    }
    if (ch === "\n") {
      endRecord();
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }

  // A lenient scanner silently swallows everything after a stray quote into
  // one enormous field, and the operator sees "1 row" for a 400-row paste.
  if (inQuotes) {
    throw new ImportParseError(
      'There is an unclosed " in that paste. Remove or double it, then paste again.',
    );
  }
  // A trailing newline already closed the last record; only an unterminated
  // final line needs closing here.
  if (field !== "" || record.length > 0) endRecord();

  return records;
}

export function parseDelimited(
  text: string,
  requested: "comma" | "tab" | "auto",
  maxRows: number,
): ParsedSheet {
  // A clipboard round-trip through Windows or Excel routinely prefixes a BOM,
  // which would otherwise become part of the first header cell and make
  // "name" fail to match "name".
  const body = text.replace(/^\uFEFF/, "");

  const firstBreak = body.search(/\r\n|\n|\r/);
  const firstLine = firstBreak === -1 ? body : body.slice(0, firstBreak);
  const delimiter = requested === "auto" ? sniffDelimiter(firstLine) : requested;

  const records = splitRecords(body, DELIMITER_CHAR[delimiter]);
  const [headerRecord, ...dataRecords] = records;
  if (headerRecord === undefined) {
    throw new ImportParseError("There is nothing to import.");
  }

  const rows = dataRecords
    .map((cells, index) => ({ rowNumber: index + 2, cells }))
    // R20's blank-row skip, applied AFTER numbering so the numbers stay the
    // operator's own.
    .filter((row) => row.cells.some((c) => c.trim() !== ""));

  if (rows.length === 0) {
    throw new ImportParseError("That paste has a header row but no data rows.");
  }
  if (rows.length > maxRows) {
    throw new ImportParseError(
      `That paste has ${rows.length} rows. Import at most ${maxRows} at a time.`,
    );
  }

  return {
    delimiter,
    header: headerRecord.map((c) => c.trim()),
    rows,
  };
}
