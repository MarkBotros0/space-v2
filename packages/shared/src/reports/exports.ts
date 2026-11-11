import { z } from "zod";

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/**
 * One member on purpose (spec D7, D-17.7).
 *
 * v1's CSV quotes with JSON.stringify — an embedded `"` becomes `\"`, which no
 * CSV parser accepts, and a backslash is doubled (R40) — joins rows with bare
 * LF and writes no BOM, so Excel on Windows decodes it as the system codepage
 * and mangles every non-ASCII name (R41). Rather than fix four things, v2 uses
 * the exceljs path the workbook needs anyway. A one-member enum means
 * `?format=csv` is a 400 that names XLSX, not a 404 that reads as "broken".
 */
export const exportFormatSchema = z.enum(["xlsx"]);

export const exportKindSchema = z.enum(["engagement", "season-workbook"]);
export type ExportKind = z.infer<typeof exportKindSchema>;

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
/** iOS needs a UTI as well as a MIME type or the share sheet offers the wrong apps (spec D10). */
export const XLSX_UTI = "org.openxmlformats.spreadsheetml.sheet";

/**
 * The ONE filename builder.
 *
 * The server needs it for Content-Disposition; the client needs it for the
 * local cache path, which it must choose BEFORE it can see a response header
 * (downloadResumable writes to a path you name up front). Two implementations
 * would drift, and on a phone the filename is the only label the file ever
 * carries — it is what the user sees in the share sheet and later in Files.
 *
 * v1: `engagement-<epoch-milliseconds>.csv` (R42).
 */
export function exportFilename(kind: ExportKind, scopeLabel: string, isoDay: string): string {
  const slug =
    scopeLabel
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
      .replace(/-+$/g, "") || "export";
  const stem = kind === "engagement" ? `engagement-${slug}` : `${slug}-attendance-grades`;
  return `${stem}-${isoDay}.xlsx`;
}

export const exportManifestSchema = z.object({
  filename: z.string(),
  mimeType: z.string(),
  sheets: z.array(
    z.object({
      name: z.string(),
      columnCount: z.number().int().min(0),
      rowCount: z.number().int().min(0),
    }),
  ),
  /** A heuristic, not a promise — see the route. Lets the client warn before a large cellular download. */
  estimatedBytes: z.number().int().min(0),
  generatedAt: z.string(),
  scopeDescription: z.string(),
});
export type ExportManifest = z.infer<typeof exportManifestSchema>;

/**
 * The method note, rendered in two places and written once.
 *
 * The XLSX Key sheet (a Node builder) and the mobile screen's "How these
 * numbers are calculated" disclosure (a React Native <Text>) render the same
 * strings, so a spreadsheet and the app cannot describe the same metric
 * differently. Same C4 discipline as the metrics themselves, applied to prose.
 *
 * Every line here is a deliberate divergence from v1 that a reader comparing
 * the two systems during the transition needs to know about.
 */
export const REPORT_METRIC_NOTES: readonly string[] = [
  "Attendance % counts PRESENT and LATE alike, over the sessions that ran on or after the student enrolled. A student who joined mid-season is not scored against the weeks before they arrived.",
  "Submission % counts the assignments of the student's season that they have submitted: every part done and Submit tapped. An assignment whose essay was returned counts again once it is handed back in.",
  "The per-session attendance figure divides by the students enrolled at the time of that session, not by today's roster, so it cannot exceed 100%.",
  "“At risk” means either component is below 60%. A student who has stopped attending but is still submitting is at risk, even though the combined score may look healthy.",
  "Late arrivals show as “L”. Recorded minutes are withheld because the older system measured them from when staff opened check-in rather than from the session start; they return once the historic records have been corrected.",
  "Blank means no record. On the Assignments sheet a cell reads Submitted, Not submitted, or how many parts are done (for example “2 of 3 done”).",
] as const;
