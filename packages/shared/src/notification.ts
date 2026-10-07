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
 * Wire values are lowercase. Plan 18's M4 stores the same set as the
 * uppercase Postgres enum `NotificationEntityType` (ASSIGNMENT, QUIZ,
 * CALENDAR, STUDENT, plus SUBMISSION/SESSION which nothing writes yet); the
 * mapping is written out in the cutover doc (Task 5) so the wire contract —
 * and every client built against it — does not change at cutover.
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

export const notificationListQuerySchema = z.object({
  /** Id of the last row of the previous page; the list is ordered by id desc. */
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  unreadOnly: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});
export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;

export const notificationListResponseSchema = z.object({
  items: z.array(notificationSchema),
  nextCursor: z.number().int().nullable(),
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
 * One endpoint for both v1 actions — the single-id one was dead code (R47) and
 * C12 says dead code is not a specification. `.strict()` on both arms is what
 * refuses `{ ids, all }` together and refuses a client-supplied `userId`.
 */
export const markReadRequestSchema = z.union([
  z.object({ ids: z.array(z.number().int().positive()).min(1).max(200) }).strict(),
  z.object({ all: z.literal(true) }).strict(),
]);
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
 * Which types warrant an interruptive push (spec D5 item 2, narrowed).
 *
 * ASSIGNMENT_CREATED is the highest-volume fan-out in the system and is not
 * time-critical. LOW_ATTENDANCE_FLAG can burst (04 R87 gives it no dedupe) and
 * waits on 04's D7/D12. MENTOR_FOLLOWUP names a student flagged for pastoral
 * follow-up in its title, which must never reach a lock screen (R64, D8) —
 * Plan 12 removed v1's note excerpt from the body, but the name remains.
 */
export const PUSH_NOTIFICATION_TYPES = [
  "SESSION_RESCHEDULED",
  "SUBMISSION_REVIEWED",
  "QUIZ_GRADED",
] as const satisfies readonly NotificationType[];

export function shouldPush(type: NotificationType): boolean {
  return (PUSH_NOTIFICATION_TYPES as readonly NotificationType[]).includes(type);
}

/**
 * The wire spelling of a device platform — lowercase, matching
 * react-native's `Platform.OS`. Plan 18's M10 stores it as the Postgres enum
 * `DevicePlatform { IOS ANDROID }`; the server maps at the write
 * (`DEVICE_PLATFORM_TO_DB`, below), so the wire contract never changes.
 */
export const devicePlatformSchema = z.enum(["ios", "android"]);
export type DevicePlatform = z.infer<typeof devicePlatformSchema>;

/** Wire → database enum value, for the cutover upsert (Task 5's doc, Plan 18 M10). */
export const DEVICE_PLATFORM_TO_DB = {
  ios: "IOS",
  android: "ANDROID",
} as const satisfies Record<DevicePlatform, string>;

/**
 * Device registration (spec D5). The row this writes does not exist yet — the
 * schema is frozen and there is no DeviceToken model — so the endpoint answers
 * 503 until cutover. The contract is fixed now so the client is built once.
 */
export const deviceRegistrationSchema = z
  .object({
    token: z.string().min(1).max(200),
    platform: devicePlatformSchema,
  })
  .strict();
export type DeviceRegistration = z.infer<typeof deviceRegistrationSchema>;
