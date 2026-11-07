import { z } from "zod";

import {
  attendanceStatusSchema,
  enrollmentStatusSchema,
  seasonStatusSchema,
  submissionStatusSchema,
} from "../enums";

// ---------------------------------------------------------------------------
// Detail — three role-shaped arms (spec 06 §4.2 is the contract)
// ---------------------------------------------------------------------------

/**
 * The cut every admitted staff role may read. `.strict()` — and kept strict by
 * `.extend()` below — so a client parsing the narrow arm FAILS on a payload
 * carrying a withheld field, instead of stripping it silently. That parse
 * failure is the leak detector D3 asks for.
 */
export const studentProfilePublicSchema = z
  .object({
    university: z.string().nullable(),
    faculty: z.string().nullable(),
    /** The university graduation year — not the JPCS `graduationYear`. */
    universityGraduationYear: z.number().int().nullable(),
    activeSeasonId: z.number().nullable(),
    activeSeasonTitle: z.string().nullable(),
    activeSeasonCode: z.string().nullable(),
    /** Every staff role may call a student (owner, 2026-11-07: leaders and mentors too). */
    phone: z.string().nullable(),
  })
  .strict();

/** + the personal data SUPER/ADMIN and the student themselves may read. */
export const studentProfilePrivateSchema = studentProfilePublicSchema.extend({
  dateOfBirth: z.string().nullable(),
});

/** + staff-only internal notes. Never sent to the subject (R23). */
export const studentProfileInternalSchema = studentProfilePrivateSchema.extend({
  notes: z.string().nullable(),
});

export const enrollmentHistoryItemSchema = z.object({
  enrollmentId: z.number(),
  seasonId: z.number(),
  seasonCode: z.string(),
  seasonTitle: z.string(),
  seasonStatus: seasonStatusSchema,
  startDate: z.string(),
  endDate: z.string(),
  /** The historic group for THAT season, from SeasonEnrollment.groupId (C9, R5). */
  groupName: z.string().nullable(),
  status: enrollmentStatusSchema,
  enrolledAt: z.string(),
  completedAt: z.string().nullable(),
  droppedAt: z.string().nullable(),
  /** Free-text personal data — always null in the public (LEADER/MENTOR) shape. */
  dropReason: z.string().nullable(),
  /**
   * Whole-number % of this season's past sessions (from the student's own
   * enrolment date) marked PRESENT or LATE — the Plan 12 engagement formula,
   * for every enrolment status (REG-83). Staff-only: null for the student's
   * own view, and null for a season outside the caller's attendance scope
   * (an ADMIN's other seasons).
   */
  attendancePct: z.number().int().nullable(),
});
export type EnrollmentHistoryItem = z.infer<typeof enrollmentHistoryItemSchema>;

/**
 * Who graduated this person by the rare exception (no graduating season passed),
 * when, and why. SUPER's view alone: null when there was none, absent for everyone else.
 */
export const graduatedByExceptionSchema = z
  .object({ at: z.string(), byName: z.string().nullable(), reason: z.string().nullable() })
  .nullable();
export type GraduatedByException = z.infer<typeof graduatedByExceptionSchema>;

const studentDetailBase = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string(),
  avatarPath: z.string().nullable(),
  graduationYear: z.number().nullable(),
  /** SUPER's view only; see `graduatedByExceptionSchema`. */
  graduatedByException: graduatedByExceptionSchema.optional(),
  /** Advisory current group (GroupStudent — the one question it may answer, C9/R4). */
  currentGroup: z.object({ id: z.number(), name: z.string() }).nullable(),
  /**
   * Enrollment history, `enrolledAt desc`. For a LEADER, only the rows whose
   * group is one of theirs (spec 06 §7: "the scoped season rows").
   * Sub-resources (attendance, submissions, notes, documents, engagement) are
   * NOT fields of this schema — they become their own endpoints in later
   * plans (spec 06 §7's split).
   */
  enrollments: z.array(enrollmentHistoryItemSchema),
});

/** One row of `GET /students/:id/attendance` (REG-83), newest session first. */
export const studentAttendanceHistoryItemSchema = z.object({
  sessionId: z.number(),
  sessionTitle: z.string(),
  startsAt: z.string(),
  seasonId: z.number(),
  seasonTitle: z.string(),
  status: attendanceStatusSchema,
});
export type StudentAttendanceHistoryItem = z.infer<typeof studentAttendanceHistoryItemSchema>;

/** `GET /students/:id/attendance` — staff only; the 100 most recent marks. */
export const studentAttendanceHistorySchema = z.object({
  history: z.array(studentAttendanceHistoryItemSchema),
});
export type StudentAttendanceHistory = z.infer<typeof studentAttendanceHistorySchema>;

/** One row of `GET /students/:id/submissions` (REG-83), newest first, never a DRAFT. */
export const studentSubmissionItemSchema = z.object({
  publicId: z.string(),
  assignmentId: z.number(),
  assignmentTitle: z.string(),
  status: submissionStatusSchema,
  isLate: z.boolean(),
  submittedAt: z.string().nullable(),
  reviewedAt: z.string().nullable(),
  seasonId: z.number(),
  seasonTitle: z.string(),
});
export type StudentSubmissionItem = z.infer<typeof studentSubmissionItemSchema>;

/** `GET /students/:id/submissions` — staff only; the 100 most recent. */
export const studentSubmissionsSchema = z.object({
  submissions: z.array(studentSubmissionItemSchema),
});
export type StudentSubmissions = z.infer<typeof studentSubmissionsSchema>;

export const studentDetailPublicSchema = studentDetailBase.extend({
  profile: studentProfilePublicSchema,
});
export type StudentDetailPublic = z.infer<typeof studentDetailPublicSchema>;

export const studentDetailPrivateSchema = studentDetailBase.extend({
  profile: studentProfilePrivateSchema,
});
export type StudentDetailPrivate = z.infer<typeof studentDetailPrivateSchema>;

export const studentDetailInternalSchema = studentDetailBase.extend({
  profile: studentProfileInternalSchema,
});
export type StudentDetailInternal = z.infer<typeof studentDetailInternalSchema>;
