// packages/shared/src/dashboard.ts
import { z } from "zod";

import { studentAssignmentListItemSchema } from "./assignment";
import { attendanceStatusSchema, seasonStatusSchema } from "./enums";
import { engagementRowSchema, type EngagementScore } from "./note";
import { isoDaySchema, wallTimeSchema } from "./org-time";

// ---------------------------------------------------------------------------
// Role dashboards — spec 19 §8. One definition of each figure (ruling C4); the
// server computes, the client renders. Engagement rows, the at-risk predicate,
// the budget and the events rows are REUSED from their owning domains, never
// restated here.
// ---------------------------------------------------------------------------

/** v1's cap on the at-risk list (spec 19 R47). */
export const DASHBOARD_AT_RISK_PREVIEW = 10;
/** v1's "due soon" length (R73). */
export const DUE_SOON_LIMIT = 3;
/** v1's events-card cap (R8). */
export const UPCOMING_EVENTS_LIMIT = 4;
/** The merged mentor feed (D18). */
export const RECENT_ACTIVITY_LIMIT = 8;

/**
 * Mean attendance over the students who have actually had a session.
 *
 * v1 counted a student with no past sessions as 0 %, so a season's first day
 * showed a red "0 %" (R29). Same guard as `isAtRisk` (spec 09 R56). Lives here
 * so the Reports screen can never grow a second definition; called only on the
 * server.
 */
export function meanAttendancePct(
  rows: readonly Pick<EngagementScore, "attendancePct" | "attendanceTotal">[],
): number | null {
  const counted = rows.filter((r) => r.attendanceTotal > 0);
  if (counted.length === 0) return null;
  return Math.round(counted.reduce((sum, r) => sum + r.attendancePct, 0) / counted.length);
}

const count = z.number().int().min(0);

/** Sessions, never weeks (D12): held = `startsAt <= now`. */
const seasonProgressSchema = z
  .object({
    sessionsHeld: count,
    sessionsTotal: count,
    /** Null when the season has no sessions — there is no percentage of nothing. */
    pct: z.number().int().min(0).max(100).nullable(),
  })
  .strict();

/** The session in progress, else the next one (D13). Day and time are org wall-clock (X13). */
const dashboardSessionSchema = z
  .object({
    id: z.number().int(),
    title: z.string(),
    /** The instant — for ordering and relative labels only. */
    startsAt: z.string(),
    dayKey: isoDaySchema,
    time: wallTimeSchema,
    durationMinutes: z.number().int(),
    location: z.string().nullable(),
    youtubeUrl: z.string().nullable(),
    /** Server-derived: `startsAt <= now < startsAt + durationMinutes`. */
    isInProgress: z.boolean(),
  })
  .strict();
export type DashboardSession = z.infer<typeof dashboardSessionSchema>;

const dashboardSeasonSchema = z
  .object({ id: z.number().int(), code: z.string(), title: z.string(), status: seasonStatusSchema })
  .strict();

const staffCohortSummarySchema = z
  .object({
    /** ACTIVE enrolments in scope (C9, D8). */
    studentCount: count,
    meanAttendancePct: z.number().int().min(0).max(100).nullable(),
    atRiskTotal: count,
    /** `isAtRisk` rows, score asc then studentUserId (Plan 15's `byScoreThenId`). */
    atRisk: z.array(engagementRowSchema).max(DASHBOARD_AT_RISK_PREVIEW),
  })
  .strict();

/** The review queue's own scope (D11): SUBMITTED, and REVIEWED | RETURNED. */
const reviewCountsSchema = z.object({ pendingReview: count, reviewed: count }).strict();

/** D10: Plan 8's per-kind graded count; unpublished ONLINE quizzes are `drafts`, not pending. */
const quizRollupSchema = z.object({ total: count, pending: count, fullyGraded: count, drafts: count }).strict();

/**
 * The leader's own groups checked in for the next session (read-only). `total`
 * is every ACTIVE student in their groups; `notCheckedIn` is those with no
 * mark yet. Strict, so an unexpected field (another group's student, a stray
 * property) fails at the client boundary. `name` falls back to the student's
 * email when their name is blank, so an email can appear there by design.
 */
export const leaderSessionCheckInSchema = z
  .object({
    sessionId: z.number().int(),
    total: count,
    present: count,
    late: count,
    absent: count,
    notCheckedIn: z.array(z.object({ id: z.number().int(), name: z.string() }).strict()),
  })
  .strict();
export type LeaderSessionCheckIn = z.infer<typeof leaderSessionCheckInSchema>;

export const staffSeasonDashboardSchema = z
  .object({
    variant: z.literal("SEASON_STAFF"),
    /** Today's org-calendar day. Staff screens compare session days to this, not the device's. */
    todayOrgDay: isoDaySchema,
    scope: z.enum(["season", "groups"]),
    season: dashboardSeasonSchema,
    /** Every group the leader leads in this season (D7); empty for `"season"`. */
    groups: z.array(z.object({ id: z.number().int(), name: z.string() }).strict()),
    progress: seasonProgressSchema,
    nextSession: dashboardSessionSchema.nullable(),
    cohort: staffCohortSummarySchema,
    submissions: reviewCountsSchema,
    quizzes: quizRollupSchema,
    /** Leader scope only: absent for admin/super, null when there is no next session. */
    leaderSession: leaderSessionCheckInSchema.nullable().optional(),
  })
  .strict();
export type StaffSeasonDashboard = z.infer<typeof staffSeasonDashboardSchema>;

/**
 * A due-soon / open row: the student list row, which carries its org-calendar
 * due day so the label never formats `dueAt` in the device zone (X13).
 */
const dashboardDueItemSchema = studentAssignmentListItemSchema;
export type DashboardDueItem = z.infer<typeof dashboardDueItemSchema>;

const studentAssignmentSummarySchema = z
  .object({
    /** `isAssignmentOutstanding` (PENDING | DRAFT), targeted assignments only. */
    outstandingCount: count,
    /** Outstanding and `isOverdue`. */
    overdueCount: count,
    /** Turned-in rows with `isLate` (D16). */
    lateSubmittedCount: count,
    /** Outstanding only, `dueAt` asc nulls last, overdue included (R73). */
    dueSoon: z.array(dashboardDueItemSchema).max(DUE_SOON_LIMIT),
    /** PENDING | DRAFT | RETURNED, uncapped, `dueAt` asc nulls last then id. */
    open: z.array(dashboardDueItemSchema),
  })
  .strict();

/**
 * The student's own figures and nothing else (C8 #2). `.strict()` so a server
 * that starts leaking a cohort figure, another student, or `score` fails at
 * the client boundary. Every field is null together when `season` is null
 * (R63) — the server states "not enrolled", the client does not guess it.
 */
export const studentDashboardSchema = z
  .object({
    variant: z.literal("STUDENT"),
    /** Today's org-calendar day; present also when not enrolled. Chips compare `dueOrgDay` to this. */
    todayOrgDay: isoDaySchema,
    season: dashboardSeasonSchema.nullable(),
    progress: seasonProgressSchema.nullable(),
    nextSession: dashboardSessionSchema.nullable(),
    assignments: studentAssignmentSummarySchema.nullable(),
  })
  .strict();
export type StudentDashboard = z.infer<typeof studentDashboardSchema>;

const activityItemSchema = z
  .object({
    /** Stable list key: `att:<id>`, `sub:<id>`, `rev:<id>`. */
    key: z.string(),
    kind: z.enum(["attendance", "submitted", "reviewed"]),
    /** `markedAt`, `submittedAt` or `reviewedAt` respectively (D18). */
    at: z.string(),
    studentUserId: z.number().int(),
    studentName: z.string(),
    /** Session title for attendance, assignment title otherwise. */
    subjectTitle: z.string(),
    attendanceStatus: attendanceStatusSchema.nullable(),
    submissionPublicId: z.string().nullable(),
  })
  .strict();

export const mentorDashboardSchema = z
  .object({
    variant: z.literal("MENTOR"),
    recentActivity: z.array(activityItemSchema).max(RECENT_ACTIVITY_LIMIT),
  })
  .strict();
export type MentorDashboard = z.infer<typeof mentorDashboardSchema>;
