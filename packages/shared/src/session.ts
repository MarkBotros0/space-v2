import { z } from "zod";

import { attendanceStatusSchema, quizKindSchema } from "./enums";
import { isoDaySchema, wallTimeSchema } from "./org-time";

// Wire shapes — see the note in season.ts on why timestamps are strings.

export const sessionListItemSchema = z.object({
  id: z.number(),
  title: z.string(),
  startsAt: z.string(),
  /**
   * The organisation-calendar day of `startsAt`, "YYYY-MM-DD", computed
   * server-side in the org timezone (ruling X13). Group by this — never by
   * formatting `startsAt` in the device zone.
   */
  dayKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** `startsAt` on the org clock, "HH:mm" (X13). Render this — never format `startsAt` on the device. */
  startTime: wallTimeSchema,
  durationMinutes: z.number(),
  location: z.string().nullable(),
  recurrenceGroupId: z.string().nullable(),
  attendanceMarked: z.boolean(),
  seasonId: z.number(),
  seasonCode: z.string(),
  seasonTitle: z.string(),
  /**
   * Null for students. Possession of this value authorises a check-in, so the
   * API withholds it from the role that could abuse it.
   */
  checkInToken: z.string().nullable(),
  checkInOpenAt: z.string().nullable(),
  checkInClosedAt: z.string().nullable(),
});
export type SessionListItem = z.infer<typeof sessionListItemSchema>;

export const myAttendanceSchema = z.object({
  status: attendanceStatusSchema,
  notes: z.string().nullable(),
  lateMinutes: z.number().nullable(),
  checkedInAt: z.string().nullable(),
});
export type MyAttendance = z.infer<typeof myAttendanceSchema>;

export const sessionDetailSchema = z.object({
  id: z.number(),
  title: z.string(),
  description: z.string().nullable(),
  startsAt: z.string(),
  /** Org-calendar day of `startsAt` (X13). */
  dayKey: isoDaySchema,
  /** `startsAt` on the org clock, "HH:mm" (X13); also the edit form's pre-fill. */
  startTime: wallTimeSchema,
  durationMinutes: z.number(),
  location: z.string().nullable(),
  youtubeUrl: z.string().nullable(),
  recurrenceGroupId: z.string().nullable(),
  seasonId: z.number(),
  seasonCode: z.string(),
  seasonTitle: z.string(),
  /**
   * True only while a scan would actually be accepted — opened, not closed,
   * within the server's three-hour window. The client renders this flag and
   * never re-derives the rule (ruling C4).
   */
  checkInOpen: z.boolean(),
  /** Present only for students; null for everyone else. */
  myAttendance: myAttendanceSchema.nullable(),
  /** Season admins AND group leaders (attendanceScopeFor). Drives "Mark attendance". */
  canMarkAttendance: z.boolean(),
  /**
   * Season admins only (isAdminOfSeason) — the open/close gate. A leader has
   * canMarkAttendance but not this, and gets the read-only live roster.
   */
  canManageCheckIn: z.boolean(),
});
export type SessionDetail = z.infer<typeof sessionDetailSchema>;

export const checkInOpenResponseSchema = z.object({ checkInToken: z.string() });
export const checkInCloseResponseSchema = z.object({ closed: z.literal(true) });

export const attendanceRosterRowSchema = z.object({
  studentUserId: z.number(),
  name: z.string().nullable(),
  email: z.string(),
  groupName: z.string().nullable(),
  status: attendanceStatusSchema.nullable(),
  notes: z.string().nullable(),
  lateMinutes: z.number().nullable(),
});
export type AttendanceRosterRow = z.infer<typeof attendanceRosterRowSchema>;

export const checkInRequestSchema = z.object({ token: z.string().min(1) });
export type CheckInRequest = z.infer<typeof checkInRequestSchema>;

export const recurrenceScopeSchema = z.enum(["one", "future", "all"]);
export type RecurrenceScope = z.infer<typeof recurrenceScopeSchema>;

/** v1's server schema, verbatim bounds: title 2–120, duration 15–600 min. */
const sessionWriteBase = z.object({
  title: z.string().min(2).max(120),
  /** An instant (Plan 3). Send this OR startDay + startTime, never both. */
  startsAt: z.string().datetime({ offset: true }).optional(),
  /**
   * Org wall-clock start (Plan 6 D-16.6) — the same day/time split as Plan
   * 15's dueDay/dueTime. The server composes the instant in ORG_TIMEZONE, so
   * a phone in another zone can never shift a session by entering "20:00".
   */
  startDay: isoDaySchema.optional(),
  startTime: wallTimeSchema.optional(),
  durationMinutes: z.number().int().min(15).max(600),
  location: z.string().max(200).nullish(),
  youtubeUrl: z.string().url().nullish(),
  description: z.string().max(2000).nullish(),
});

function exactlyOneStart(
  v: { startsAt?: string; startDay?: string; startTime?: string },
  ctx: z.RefinementCtx,
): void {
  const hasWallClock = v.startDay !== undefined || v.startTime !== undefined;
  if (hasWallClock && (v.startDay === undefined || v.startTime === undefined)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [v.startDay === undefined ? "startDay" : "startTime"],
      message: "Send both a start day and a start time.",
    });
    return;
  }
  if ((v.startsAt === undefined) === !hasWallClock) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["startsAt"],
      message: "Send exactly one of startsAt or startDay + startTime.",
    });
  }
}

export const createSessionRequestSchema = sessionWriteBase
  .extend({
    seasonId: z.number().int().positive(),
    /** Weekly siblings sharing one recurrenceGroupId. v1 clamped to 26 silently; refusing is honest. */
    repeatWeeks: z.number().int().min(1).max(26).default(1),
  })
  .superRefine(exactlyOneStart);
export type CreateSessionBody = z.output<typeof createSessionRequestSchema>;
export type CreateSessionInput = z.input<typeof createSessionRequestSchema>;

export const updateSessionRequestSchema = sessionWriteBase
  .extend({ scope: recurrenceScopeSchema })
  .superRefine(exactlyOneStart);
export type UpdateSessionBody = z.output<typeof updateSessionRequestSchema>;
export type UpdateSessionInput = z.input<typeof updateSessionRequestSchema>;

export const deleteSessionRequestSchema = z.object({
  scope: recurrenceScopeSchema.default("one"),
  /**
   * Attendance and video progress are student history; destroying them
   * silently is v1's unreachable delete, not a behaviour anyone chose (ruling
   * C12). Deleting a session that has either requires this acknowledgement.
   */
  force: z.boolean().default(false),
});
export type DeleteSessionBody = z.output<typeof deleteSessionRequestSchema>;

/** POST /sessions (Plan 3). `id` is the first session of the series. */
export const sessionCreatedResponseSchema = z.object({
  id: z.number(),
  recurrenceGroupId: z.string().nullable(),
});
/** PATCH /sessions/:id (Plan 3): how many sessions the scope touched. */
export const sessionUpdatedResponseSchema = z.object({ updated: z.number().int().nonnegative() });
/** DELETE /sessions/:id (Plan 3). */
export const sessionDeletedResponseSchema = z.object({ deleted: z.number().int().nonnegative() });

/** One target of a scoped edit/delete, as GET /sessions/:id/series previews it (D-16.8). */
export const sessionSeriesItemSchema = z.object({
  id: z.number(),
  title: z.string(),
  startsAt: z.string(),
  dayKey: isoDaySchema,
  startTime: wallTimeSchema,
  isAnchor: z.boolean(),
  attendanceCount: z.number().int().nonnegative(),
});
export type SessionSeriesItem = z.infer<typeof sessionSeriesItemSchema>;

export const sessionSeriesResponseSchema = z.object({
  scope: recurrenceScopeSchema,
  sessions: z.array(sessionSeriesItemSchema),
  /** Totals across the targets — what Plan 3's delete refuses without `force`. */
  attendanceCount: z.number().int().nonnegative(),
  videoProgressCount: z.number().int().nonnegative(),
});
export type SessionSeries = z.infer<typeof sessionSeriesResponseSchema>;

/** GET /api/v1/sessions window (D-16.7). */
export const SESSION_RANGE_DEFAULT_WEEKS = 8;
export const SESSION_RANGE_MAX_DAYS = 120;

/** Parses `req.query` — every value arrives as a string. */
export const sessionRangeQuerySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  seasonId: z.coerce.number().int().positive().optional(),
});

export const sessionRangeResponseSchema = z.object({
  sessions: z.array(sessionListItemSchema),
  /** The effective window, half-open [from, to). Page with to=from / from=to. */
  from: z.string(),
  to: z.string(),
  /** Org-calendar days of the first and last instant in the window (X13) — for the header. */
  fromDayKey: isoDaySchema,
  toDayKey: isoDaySchema,
});
export type SessionRange = z.infer<typeof sessionRangeResponseSchema>;

export const checkInStateValueSchema = z.enum(["not_open", "open", "expired", "closed"]);

/** GET /sessions/:id/check-in — admin-only (D-16.9). One derivation: lib/check-in.ts. */
export const checkInStateSchema = z.object({
  state: checkInStateValueSchema,
  isOpen: z.boolean(),
  checkInToken: z.string().nullable(),
  checkInOpenAt: z.string().nullable(),
  checkInClosedAt: z.string().nullable(),
  /** Only while open: when the 3-hour window ends. */
  expiresAt: z.string().nullable(),
  /** `expiresAt` on the org clock, "HH:mm" (X13). */
  expiresAtTime: wallTimeSchema.nullable(),
});
export type CheckInStateResponse = z.infer<typeof checkInStateSchema>;

/**
 * A quiz linked to a session (v1 listQuizzesForSession). `kind` is Plan 8's
 * shared quiz-kind enum.
 */
export const sessionQuizItemSchema = z.object({
  id: z.number(),
  title: z.string(),
  kind: quizKindSchema,
  maxScore: z.number(),
  questionCount: z.number().int().nonnegative(),
  publishedAt: z.string().nullable(),
});
export type SessionQuizItem = z.infer<typeof sessionQuizItemSchema>;
