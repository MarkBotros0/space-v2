import { z } from "zod";

// Mirrors the enums in prisma/schema.prisma. Kept as Zod enums rather than TS
// string unions so request bodies can validate against them on both sides.
export const seasonStatusSchema = z.enum(["DRAFT", "ACTIVE", "COMPLETED", "ARCHIVED"]);
export type SeasonStatus = z.infer<typeof seasonStatusSchema>;

export const enrollmentStatusSchema = z.enum(["ACTIVE", "COMPLETED", "WITHDRAWN"]);
export type EnrollmentStatus = z.infer<typeof enrollmentStatusSchema>;

export const attendanceStatusSchema = z.enum(["PRESENT", "ABSENT", "LATE"]);
export type AttendanceStatus = z.infer<typeof attendanceStatusSchema>;

export const submissionStatusSchema = z.enum(["DRAFT", "SUBMITTED", "REVIEWED", "RETURNED"]);
export type SubmissionStatus = z.infer<typeof submissionStatusSchema>;

export const assignmentTypeSchema = z.enum(["STANDARD", "FORUM"]);
export type AssignmentType = z.infer<typeof assignmentTypeSchema>;

export const quizKindSchema = z.enum(["PAPER", "ONLINE"]);
export type QuizKind = z.infer<typeof quizKindSchema>;

export const quizQuestionTypeSchema = z.enum(["MCQ", "ESSAY"]);
export type QuizQuestionType = z.infer<typeof quizQuestionTypeSchema>;

export const quizAttemptStatusSchema = z.enum(["IN_PROGRESS", "SUBMITTED", "GRADED"]);
export type QuizAttemptStatus = z.infer<typeof quizAttemptStatusSchema>;

export const notificationTypeSchema = z.enum([
  "ASSIGNMENT_CREATED",
  "SUBMISSION_REVIEWED",
  "SESSION_RESCHEDULED",
  "LOW_ATTENDANCE_FLAG",
  "MENTOR_FOLLOWUP",
  "QUIZ_GRADED",
]);
export type NotificationType = z.infer<typeof notificationTypeSchema>;
