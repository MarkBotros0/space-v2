import { z } from "zod";
import { seasonStatusSchema } from "../enums";
import { engagementScoreSchema } from "../note";
import { isoDaySchema } from "../org-time";

import { engagementBandSchema } from "./bands";
import { reportScopeQuerySchema } from "./scope";

// ---------------------------------------------------------------------------
// The engagement report
// ---------------------------------------------------------------------------

const resolvedScopeSchema = z.object({
  /** The intersection actually queried — never the request (ruling C8, spec D6 #1). */
  seasonIds: z.array(z.number().int()),
  seasons: z.array(
    z.object({
      id: z.number().int(),
      code: z.string(),
      title: z.string(),
      /** Reports open on an ACTIVE season, else the one that ended last. */
      status: seasonStatusSchema,
      /** The season's last day (UTC midnight, spec 02 D12). */
      endDate: z.string(),
    }),
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

const engagementBandCountSchema = z.object({
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
