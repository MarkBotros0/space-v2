import { z } from "zod";

import { attendanceStatusSchema } from "./enums";
import { isoDaySchema } from "./org-time";

export const attendanceEntrySchema = z.object({
  studentUserId: z.number().int(),
  status: attendanceStatusSchema,
  notes: z.string().max(500).optional().nullable(),
  // Upper bound of 600 (ten hours) is v1's — a larger value is a client bug,
  // not a real lateness.
  lateMinutes: z.number().int().min(0).max(600).optional().nullable(),
});
export type AttendanceEntry = z.infer<typeof attendanceEntrySchema>;

export const saveAttendanceRequestSchema = z
  .object({
    entries: z.array(attendanceEntrySchema),
    /**
     * The check-in console's single-student override (v1 manualOverrideAction,
     * attendance-actions.ts:193-232). v1 parity 2026-10-09 (spec 04 R33): it never
     * sends the low-attendance flag; the batch form does. Exactly one entry.
     */
    consoleOverride: z.boolean().optional(),
  })
  .refine((v) => !v.consoleOverride || v.entries.length === 1, {
    path: ["entries"],
    message: "A console override marks exactly one student.",
  });
export type SaveAttendanceRequest = z.infer<typeof saveAttendanceRequestSchema>;

/**
 * `POST /sessions/:id/attendance` success payload. `saved` is the number of
 * entries written — a count, not a flag.
 */
export const saveAttendanceResponseSchema = z.object({
  saved: z.number().int().nonnegative(),
});
export type SaveAttendanceResponse = z.infer<typeof saveAttendanceResponseSchema>;

// ---------------------------------------------------------------------------
// Student self-service — Plan 11
// ---------------------------------------------------------------------------

/** `newPublicId()`'s alphabet and length — what `Session.checkInToken` holds (spec 04 R35). */
export const CHECK_IN_TOKEN_RE = /^[0-9A-Za-z]{10}$/;
const CHECK_IN_URL_RE = /^https?:\/\/[^/?#\s]+\/checkin\/([0-9A-Za-z]{10})\/?(?:[?#]\S*)?$/i;
const CHECK_IN_APP_LINK_RE = /^spacev2:\/\/\/?checkin\/([0-9A-Za-z]{10})\/?$/i;

/**
 * The one parser for anything a student scans or types (Plan 11 Decision 8):
 * the bare token (Plan 4's console QR), v1's printed
 * `http(s)://<host>/checkin/<token>` (spec 04 R41), or this app's own
 * `spacev2://checkin/<token>`. Anything else is null. Regexes rather than
 * `new URL`, whose React Native polyfill is incomplete.
 */
export function parseCheckInCode(raw: string): string | null {
  const value = raw.trim();
  if (CHECK_IN_TOKEN_RE.test(value)) return value;
  const match = CHECK_IN_URL_RE.exec(value) ?? CHECK_IN_APP_LINK_RE.exec(value);
  return match?.[1] ?? null;
}

/** `POST /sessions/check-in` success. A scan can never produce ABSENT (spec 04 R64). */
export const checkInResponseSchema = z.object({
  status: z.enum(["PRESENT", "LATE"]),
  /** Whole minutes after the SESSION START (ruling C3), 0 when on time. */
  minutesLate: z.number().int().min(0),
});
export type CheckInResponse = z.infer<typeof checkInResponseSchema>;

/** The five refusals of spec 04 R59, so the client branches on codes, never on message text. */
export const checkInErrorCodeSchema = z.enum([
  "invalid_token",
  "not_open",
  "closed",
  "not_enrolled",
  "already_checked_in",
]);
export type CheckInErrorCode = z.infer<typeof checkInErrorCodeSchema>;

/**
 * Spec 04 R88–R90, computed once in `apps/backend/src/lib/attendance-budget.ts`.
 * `remainingPct` = max(0, 100 − budgetPct) is spec 19 D14's "Absence budget
 * left" — sent, not inverted on the client.
 */
export const attendanceBudgetSchema = z.object({
  minutesUsed: z.number().int().min(0),
  budgetMinutes: z.number().int().min(0),
  budgetPct: z.number().int().min(0).max(100),
  remainingPct: z.number().int().min(0).max(100),
  absentCount: z.number().int().min(0),
  lateCount: z.number().int().min(0),
});
export type AttendanceBudget = z.infer<typeof attendanceBudgetSchema>;

export const myAttendanceSessionSchema = z.object({
  sessionId: z.number(),
  title: z.string(),
  startsAt: z.string(),
  dayKey: isoDaySchema,
  /** Null = no record for this past session (v1 "No record"). */
  status: attendanceStatusSchema.nullable(),
  checkedInAt: z.string().nullable(),
  /** Only for LATE rows. */
  lateMinutes: z.number().int().nullable(),
  /** What this session cost the budget (R95): the season's absence weight for ABSENT, the row's minutes for LATE. */
  costMinutes: z.number().int().nullable(),
});
export type MyAttendanceSession = z.infer<typeof myAttendanceSessionSchema>;

/** `GET /api/v1/me/attendance` — the active season only (Plan 11 Decision 10). */
export const myAttendanceResponseSchema = z.object({
  /** Null when the student has no active season, or it was soft-deleted. */
  season: z
    .object({
      id: z.number(),
      title: z.string(),
      absenceBudgetMinutes: z.number().int(),
      absenceWeightMinutes: z.number().int(),
    })
    .nullable(),
  budget: attendanceBudgetSchema.nullable(),
  /** Spec 09 R69 / spec 19 R70: consecutive attended past sessions; ABSENT breaks it, unmarked is skipped. */
  streak: z.number().int().min(0),
  /** Past sessions (`startsAt <= now`), newest first (R94). */
  sessions: z.array(myAttendanceSessionSchema),
});
export type MyAttendanceResponse = z.infer<typeof myAttendanceResponseSchema>;
