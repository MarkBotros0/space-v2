import { z } from "zod";

// Mirrors the enums in prisma/schema.prisma. Kept as Zod enums rather than TS
// string unions so request bodies can validate against them on both sides.
export const seasonStatusSchema = z.enum(["DRAFT", "ACTIVE", "COMPLETED", "ARCHIVED"]);
export type SeasonStatus = z.infer<typeof seasonStatusSchema>;

/** A finished season is locked: read-only, never reopened, nothing enrols into it. */
export const FINISHED_SEASON_STATUSES = ["COMPLETED", "ARCHIVED"] as const satisfies readonly SeasonStatus[];
/** A live season still takes people and roles: a draft or a running one. */
export const LIVE_SEASON_STATUSES = ["DRAFT", "ACTIVE"] as const satisfies readonly SeasonStatus[];

// The predicates take any string, so a row typed loosely (`status: string`) needs no cast.
export function isSeasonFinished(status: string | null | undefined): boolean {
  return status === "COMPLETED" || status === "ARCHIVED";
}

export function isSeasonLive(status: string | null | undefined): boolean {
  return status === "DRAFT" || status === "ACTIVE";
}

export const enrollmentStatusSchema = z.enum(["ACTIVE", "COMPLETED", "WITHDRAWN"]);
export type EnrollmentStatus = z.infer<typeof enrollmentStatusSchema>;

export const attendanceStatusSchema = z.enum(["PRESENT", "ABSENT", "LATE"]);
export type AttendanceStatus = z.infer<typeof attendanceStatusSchema>;

export const submissionStatusSchema = z.enum(["DRAFT", "SUBMITTED", "REVIEWED", "RETURNED"]);
export type SubmissionStatus = z.infer<typeof submissionStatusSchema>;

export const assignmentPartKindSchema = z.enum(["VIDEO", "ESSAY", "FORUM"]);
export type AssignmentPartKind = z.infer<typeof assignmentPartKindSchema>;

export const reminderAnchorSchema = z.enum(["NEXT_SESSION", "DUE_DATE"]);
export type ReminderAnchor = z.infer<typeof reminderAnchorSchema>;

export const quizKindSchema = z.enum(["PAPER", "ONLINE"]);
export type QuizKind = z.infer<typeof quizKindSchema>;

export const quizQuestionTypeSchema = z.enum([
  "SINGLE_CHOICE",
  "MULTI_CHOICE",
  "TRUE_FALSE",
  "MATCHING",
  "FILL_BLANK",
  "ESSAY",
]);
export type QuizQuestionType = z.infer<typeof quizQuestionTypeSchema>;

export const quizAttemptStatusSchema = z.enum(["IN_PROGRESS", "SUBMITTED", "GRADED"]);
export type QuizAttemptStatus = z.infer<typeof quizAttemptStatusSchema>;

/** Why an attempt stopped being IN_PROGRESS; null on attempts that predate the column. */
export const quizAttemptEndReasonSchema = z.enum(["SUBMITTED", "TIMED_OUT", "ENDED_BY_STAFF", "ENDED_BY_EXITS"]);

export const notificationTypeSchema = z.enum([
  "ASSIGNMENT_CREATED",
  "SUBMISSION_REVIEWED",
  "SESSION_RESCHEDULED",
  "LOW_ATTENDANCE_FLAG",
  "MENTOR_FOLLOWUP",
  "QUIZ_GRADED",
  "QUIZ_PUBLISHED",
  "SUBMISSION_RECEIVED",
  "SESSION_CANCELLED",
  "ANNOUNCEMENT",
  "ASSIGNMENT_REMINDER",
]);
export type NotificationType = z.infer<typeof notificationTypeSchema>;

export const announcementAudienceSchema = z.enum(["COMMUNITY", "SEASON"]);

export const jpcVisibilitySchema = z.enum(["ALL", "ALUMNI_ONLY", "SEASON"]);
export type JpcVisibility = z.infer<typeof jpcVisibilitySchema>;
