// packages/shared/src/notification.ts
import { z } from "zod";

import { notificationTypeSchema, type NotificationType } from "./enums";

// Wire shapes — timestamps are strings, matching the note in season.ts.

/**
 * The route-independent reference that replaces `link` (spec D1).
 *
 * `Notification.link` is a v1 role-prefixed web path chosen by the producer
 * (R3), and v2's routes are flat, so `/admin/students/12` resolves to nothing
 * in the mobile app. The schema is frozen (C1), so the columns this wants
 * cannot exist yet: until cutover the API derives the target from the stored
 * string in one place (apps/backend/src/lib/notification-target.ts) and keeps
 * writing `link` verbatim so v1 — still in production against the same
 * database — keeps working. No client may parse the path itself.
 *
 * `calendar` is a destination rather than an entity because one of the five
 * link shapes v1 actually emits is the bare `/student/calendar` (R67), and
 * pretending it names a session would be a lie the resolver has to keep.
 *
 * Wire values are lowercase. Plan 18's M4 (entity columns) is withdrawn for
 * v1 parity, so `link` stays the stored form and this target is always derived.
 */
export const notificationEntityTypeSchema = z.enum([
  "assignment",
  "quiz",
  "calendar",
  "student",
]);
export type NotificationEntityType = z.infer<typeof notificationEntityTypeSchema>;

export const notificationTargetSchema = z.object({
  entityType: notificationEntityTypeSchema,
  /** Null for the two list-level links v1 emits (`/student/quizzes`, `/student/calendar`). */
  entityId: z.number().int().positive().nullable(),
});
export type NotificationTarget = z.infer<typeof notificationTargetSchema>;

export const notificationSchema = z.object({
  id: z.number().int(),
  type: notificationTypeSchema,
  title: z.string(),
  body: z.string().nullable(),
  /** The raw v1 path, still written for v1's benefit. Clients render `target`. */
  link: z.string().nullable(),
  target: notificationTargetSchema.nullable(),
  /** Read state is a timestamp, not a boolean — null means unread (§2). */
  readAt: z.string().nullable(),
  createdAt: z.string(),
});
export type NotificationItem = z.infer<typeof notificationSchema>;

/**
 * v1's inbox is one list of the newest 100 rows, createdAt desc, with no
 * cursor and no read-state filter (jpc-space
 * src/app/(notifications)/notifications-page.tsx:14-27; spec R33, R39).
 * GET /notifications takes no query parameters.
 */
export const NOTIFICATION_INBOX_LIMIT = 100;

export const notificationListResponseSchema = z.object({
  items: z.array(notificationSchema),
  /**
   * Rides along so the common case — open the inbox, render the badge — is one
   * request. It is a real `count`, not a filter over the page: v1 counted
   * unread by filtering the 100 rows it had fetched and silently understated
   * beyond that (R37).
   */
  unreadCount: z.number().int().min(0),
});

export const unreadCountResponseSchema = z.object({
  unreadCount: z.number().int().min(0),
});

/**
 * Mark-all only, as v1: the single-id action was dead code (R47) and opening a
 * notification leaves it unread (R48). `.strict()` refuses `ids` and a
 * client-supplied `userId`.
 */
export const markReadRequestSchema = z.object({ all: z.literal(true) }).strict();
export type MarkReadRequest = z.infer<typeof markReadRequestSchema>;

export const markReadResponseSchema = z.object({
  /** The number v1's markRead discarded (§6). */
  marked: z.number().int().min(0),
});

/**
 * NotificationType → its Boolean column on NotificationPreference.
 * `satisfies` makes a type without a column a compile error, mirroring
 * apps/backend/src/lib/notifications.ts:19-26.
 */
export const NOTIFICATION_PREFERENCE_KEY_BY_TYPE = {
  ASSIGNMENT_CREATED: "assignmentCreated",
  SUBMISSION_REVIEWED: "submissionReviewed",
  SESSION_RESCHEDULED: "sessionRescheduled",
  LOW_ATTENDANCE_FLAG: "lowAttendanceFlag",
  MENTOR_FOLLOWUP: "mentorFollowup",
  QUIZ_GRADED: "quizGraded",
} as const satisfies Record<NotificationType, string>;

export type NotificationPreferenceKey =
  (typeof NOTIFICATION_PREFERENCE_KEY_BY_TYPE)[NotificationType];

export const NOTIFICATION_PREFERENCE_KEYS: readonly NotificationPreferenceKey[] =
  notificationTypeSchema.options.map((t) => NOTIFICATION_PREFERENCE_KEY_BY_TYPE[t]);

/**
 * All six keys, required. The `satisfies` below is the structural fix for
 * R56/R57: drop a key and the object no longer satisfies
 * `Record<NotificationPreferenceKey, boolean>`, which is a compile error rather
 * than a preference nobody can set.
 */
export const notificationPreferencesSchema = z.object({
  assignmentCreated: z.boolean(),
  submissionReviewed: z.boolean(),
  sessionRescheduled: z.boolean(),
  lowAttendanceFlag: z.boolean(),
  mentorFollowup: z.boolean(),
  quizGraded: z.boolean(),
}) satisfies z.ZodType<Record<NotificationPreferenceKey, boolean>>;
export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;

/** A user with no preference row is opted in to everything (R6, R58). */
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  assignmentCreated: true,
  submissionReviewed: true,
  sessionRescheduled: true,
  lowAttendanceFlag: true,
  mentorFollowup: true,
  quizGraded: true,
};

export const notificationPreferencesResponseSchema = z.object({
  preferences: notificationPreferencesSchema,
});

/**
 * What PUT accepts: v1's five settable keys (jpc-space
 * src/lib/settings-actions.ts:58-73). `quizGraded` is not settable in v1 and
 * stays untouched by the write; Zod's default strip drops it if a client sends
 * it. GET still returns all six stored values.
 */
export const notificationPreferencesUpdateSchema = notificationPreferencesSchema.omit({
  quizGraded: true,
});
export type NotificationPreferencesUpdate = z.infer<typeof notificationPreferencesUpdateSchema>;
