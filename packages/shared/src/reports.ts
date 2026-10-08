// packages/shared/src/reports.ts
import { z } from "zod";

import { seasonStatusSchema } from "./enums";
import { engagementScoreSchema, isAtRisk, type EngagementScore } from "./note";
import { isoDaySchema } from "./org-time"; // Plan 5's — consumed, never redefined

// ---------------------------------------------------------------------------
// Engagement bands
// ---------------------------------------------------------------------------

/**
 * The four bands of v1's AT_RISK_BUCKETS (reports-query.ts:47-59), as enum
 * members rather than the display strings v1 used as Map keys.
 *
 * v1's pie was semantic BY COINCIDENCE: `categoricalPalette`'s array order
 * (green, teal, amber, red) happened to line up with the Map seed order, so
 * reordering the seed would have silently painted "High" red (R92). An enum
 * lets the colour map be declared instead of inferred from array position —
 * see apps/mobile/src/lib/report-colors.ts.
 */
export const engagementBandSchema = z.enum(["HIGH", "MEDIUM", "LOW", "AT_RISK"]);
export type EngagementBand = z.infer<typeof engagementBandSchema>;

/** Seed order for the band counts — every band is emitted, including zeroes (R31). */
export const BAND_ORDER = ["HIGH", "MEDIUM", "LOW", "AT_RISK"] as const satisfies readonly EngagementBand[];

export const BAND_LABEL: Record<EngagementBand, string> = {
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
  AT_RISK: "At risk",
};

/**
 * The ONE banding function, and the reason the at-risk list cannot disagree
 * with the at-risk band.
 *
 * v1 had three thresholds on one screen: bands cut the composite at 80/60/40
 * (R30) while the at-risk list took `score < 60` (R33), and the mentor
 * dashboard tested each component against 60 (domain 9 R73). A student at
 * 55 attendance / 95 submissions was "Medium" here and at-risk there.
 *
 * AT_RISK is evaluated FIRST and delegates entirely to domain 9's `isAtRisk`,
 * so band membership is that predicate by construction (ruling C4, spec D5).
 * The remaining three bands are a presentational split of the composite.
 *
 * A student with both denominators zero — a season that has not started —
 * scores 0, is not at risk (Plan 12's guard, fixing R56), and bands LOW. "Low"
 * is a weak label for "no data yet"; the Key sheet and the screen's method
 * note say so, and a fifth band would change the pie's category count.
 */
export function bandFor(score: EngagementScore): EngagementBand {
  if (isAtRisk(score)) return "AT_RISK";
  if (score.score >= 80) return "HIGH";
  if (score.score >= 60) return "MEDIUM";
  return "LOW";
}

// ---------------------------------------------------------------------------
// Request scope
// ---------------------------------------------------------------------------

/**
 * Express hands a repeated query parameter as `string[]` and a single one as
 * `string`, so both shapes normalise to an array before coercion.
 *
 * An EMPTY array means "my whole permitted scope", resolved server-side — not
 * v1's "every season in the database" (R1), which was only safe because the
 * caller was a server component that had already checked.
 */
const seasonIdsParam = z.preprocess(
  (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]),
  z.array(z.coerce.number().int().positive()).max(50),
);

export const reportScopeQuerySchema = z.object({
  seasonId: seasonIdsParam.default([]),
  /**
   * v1 declared `from`/`to` and no caller ever passed them (R5). They narrow
   * the attendance-trend session window and nothing else (R4) — implemented
   * here rather than deleted, because a date window is exactly what a phone
   * needs (spec D9, §9).
   */
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  /** Most-recent-N sessions inside the window. 26 ≈ one point per week for a two-term season. */
  trendLimit: z.coerce.number().int().min(1).max(200).default(26),
});
export type ReportScopeQuery = z.output<typeof reportScopeQuerySchema>;

export const resolvedScopeSchema = z.object({
  /** The intersection actually queried — never the request (ruling C8, spec D6 #1). */
  seasonIds: z.array(z.number().int()),
  seasons: z.array(
    z.object({ id: z.number().int(), code: z.string(), title: z.string() }),
  ),
  /**
   * True when the request named more seasons than the caller got. Deliberately
   * does NOT say which were dropped: a per-id answer turns the endpoint into an
   * existence oracle over the season table (spec §4 item 1).
   */
  truncated: z.boolean(),
  /** "All seasons" | "GBV 2026" | "3 seasons" — used in filenames and headings. */
  label: z.string(),
});
export type ResolvedScope = z.infer<typeof resolvedScopeSchema>;

// ---------------------------------------------------------------------------
// The engagement report
// ---------------------------------------------------------------------------

/**
 * One point per past session in the window.
 *
 * v1 returned a pre-formatted `MMM d` label and a percentage (R15), which made
 * the chart unfixable on the client, collapsed sessions from different years
 * onto one label, and hid that the percentage could exceed 100 (R12). This
 * carries the raw instant (the client formats — ruling C2, spec D12), both
 * counts, and the season so a multi-season chart can be split.
 *
 * `pct` is capped at 100 by the CONTRACT as well as by the query: the
 * denominator is the roster as it stood at `startsAt` and the numerator is
 * restricted to that same set (D-17.3), so a value above 100 means a bug
 * upstream and must fail at the boundary rather than render.
 *
 * `pct` is null — not 0 — when nobody was enrolled yet (fixing R13).
 */
export const attendancePointSchema = z.object({
  sessionId: z.number().int(),
  seasonId: z.number().int(),
  seasonTitle: z.string(),
  title: z.string(),
  startsAt: z.string(),
  /**
   * The org-calendar day of `startsAt`, computed server-side with Plan 4's
   * `orgDayKey` (ruling X13). The chart labels by this — never by formatting
   * `startsAt` in the device's zone.
   */
  dayKey: isoDaySchema,
  presentCount: z.number().int().min(0),
  expectedCount: z.number().int().min(0),
  pct: z.number().int().min(0).max(100).nullable(),
});
export type AttendancePoint = z.infer<typeof attendancePointSchema>;

/**
 * One row per assignment. `completionRate` is NOT a submission percentage —
 * it is a property of an assignment, and v1 calling both by one name is spec
 * D2's most consequential ambiguity (D-17.1).
 *
 * `targeting` exists because the denominator means two different things (R20)
 * and a reader currently cannot tell which they are looking at.
 *
 * `completionRate` is null when `expected` is 0 — a targeted assignment with no
 * AssignmentTarget rows. v1 showed 0 %, which reads as total cohort failure and
 * is actually a mis-configured assignment (R22, D-17.13).
 */
export const assignmentCompletionRowSchema = z.object({
  assignmentId: z.number().int(),
  seasonId: z.number().int(),
  title: z.string(),
  targeting: z.enum(["all_groups", "targeted"]),
  completed: z.number().int().min(0),
  expected: z.number().int().min(0),
  completionRate: z.number().int().min(0).max(100).nullable(),
});
export type AssignmentCompletionRow = z.infer<typeof assignmentCompletionRowSchema>;

export const engagementBandCountSchema = z.object({
  band: engagementBandSchema,
  count: z.number().int().min(0),
});

/**
 * One row per ACTIVE enrolment (R27) — a student in two in-scope seasons
 * produces two rows, which is why `cohortSize` exists beside `enrollmentCount`
 * (R32, spec D16).
 *
 * Built from domain 9's engagementScoreSchema, never redefined (spec §8).
 * `.strip()` is Zod's default and is what drops a stray `atRisk`: the band IS
 * the at-risk answer, and a second field for it would be a second definition.
 */
export const engagementReportRowSchema = engagementScoreSchema.extend({
  studentUserId: z.number().int(),
  name: z.string(),
  email: z.string(),
  seasonId: z.number().int(),
  seasonTitle: z.string(),
  band: engagementBandSchema,
});
export type EngagementReportRow = z.infer<typeof engagementReportRowSchema>;

/**
 * The summary. Deliberately does NOT carry the cohort.
 *
 * v1's `loadReportsData` returned `rawStudents` — every active student's name,
 * email and three scores — to every caller including the two screens that
 * render ten rows of it (R34). In v1 that array never leaves the server. An
 * endpoint returning it verbatim ships the whole cohort to the device on every
 * screen mount, and React Query mounts on focus and on reconnect.
 */
export const engagementSummarySchema = z.object({
  scope: resolvedScopeSchema,
  attendanceTrend: z.array(attendancePointSchema),
  completion: z.array(assignmentCompletionRowSchema),
  bands: z.array(engagementBandCountSchema),
  /** Capped at 10, ascending by score. */
  atRisk: z.array(engagementReportRowSchema),
  /** The uncapped count, so a reader can be told "10 of 34" (spec D16, R33). */
  atRiskTotal: z.number().int().min(0),
  /** Distinct students. */
  cohortSize: z.number().int().min(0),
  /** Enrolments — the number the band counts actually count (R32). */
  enrollmentCount: z.number().int().min(0),
  generatedAt: z.string(),
  /**
   * Today in the ORGANISATION's zone, `YYYY-MM-DD` (ruling C2/X13), from the
   * server's `orgDayKey`. The client builds the engagement export's local
   * filename from this — never from its own clock, whose UTC or device day
   * differs from the server's `Content-Disposition` day around midnight
   * (D-17.16's "cannot drift").
   */
  exportDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type EngagementSummary = z.infer<typeof engagementSummarySchema>;

export const engagementStudentsQuerySchema = reportScopeQuerySchema.extend({
  band: engagementBandSchema.optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const engagementStudentPageSchema = z.object({
  scope: resolvedScopeSchema,
  rows: z.array(engagementReportRowSchema),
  nextCursor: z.string().nullable(),
  total: z.number().int().min(0),
});
export type EngagementStudentPage = z.infer<typeof engagementStudentPageSchema>;

// ---------------------------------------------------------------------------
// The organisation roll-up
// ---------------------------------------------------------------------------

/**
 * `withdrawnCount` names the enum member it counts. v1's `droppedCount` was a
 * display rename applied at the data layer (R54); the label stays "Dropped".
 *
 * `code` rides beside `id` because every season link on v1's SUPER reports page
 * points at `/super/seasons/<integer id>` while the route resolves by `code`,
 * so every row 404s (R62, spec D13).
 */
export const seasonEnrollmentCountSchema = z.object({
  seasonId: z.number().int(),
  code: z.string(),
  program: z.string(),
  year: z.number().int(),
  title: z.string(),
  status: seasonStatusSchema,
  activeCount: z.number().int().min(0),
  completedCount: z.number().int().min(0),
  withdrawnCount: z.number().int().min(0),
  leaderCount: z.number().int().min(0),
});

export const alumniByYearRowSchema = z.object({
  year: z.number().int(),
  count: z.number().int().min(0),
});

/**
 * `totalStudentsNotGraduated` renames v1's `totalStudents`, which counted every
 * non-deleted STUDENT with no graduationYear — including students never
 * enrolled in anything and students withdrawn from everything — and was
 * labelled "Current students" (R51, spec D4).
 *
 * The QUERY is unchanged. Renaming is the safer half: changing the query would
 * move a headline number somebody has been quoting.
 */
export const organisationReportSchema = z.object({
  totalStudentsNotGraduated: z.number().int().min(0),
  totalAlumni: z.number().int().min(0),
  activeSeasonCount: z.number().int().min(0),
  seasons: z.array(seasonEnrollmentCountSchema),
  alumniByYear: z.array(alumniByYearRowSchema),
  generatedAt: z.string(),
});
export type OrganisationReport = z.infer<typeof organisationReportSchema>;

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

export const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
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
  "Submission % counts only assignments assigned to that student — all-groups assignments plus those targeting their group for this season. An assignment a student was never given does not count against them.",
  "The per-session attendance figure divides by the students enrolled at the time of that session, not by today's roster, so it cannot exceed 100%.",
  "“At risk” means either component is below 60%. A student who has stopped attending but is still submitting is at risk, even though the combined score may look healthy.",
  "Late cells show minutes after the session's start. Rows recorded before the cutover were recomputed from the check-in time; rows typed in by a leader are shown as entered. A late row with no minutes shows “L”.",
  "Blank means no record. “n/a” on the Assignments sheet means the assignment was not assigned to that student.",
] as const;
