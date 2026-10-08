import { z } from "zod";

import {
  attendanceStatusSchema,
  enrollmentStatusSchema,
  seasonStatusSchema,
  submissionStatusSchema,
} from "./enums";
import { isoDaySchema } from "./org-time";

// Wire shapes — timestamps travel as ISO strings (see the note in season.ts).
//
// `name` is `z.string()`, non-nullable, everywhere in this file: User.name is
// `String` in the schema (prisma/schema.prisma:106). The `string | null` in
// every v1 student type is D9's defect and does not port; nor do the
// `name ?? email` render fallbacks it forced.

/**
 * "" → null on optional free-text (v1 rule R26): a cleared field is stored
 * null, never "". `undefined` survives untouched so PATCH can distinguish
 * "clear this field" (null) from "leave it alone" (absent).
 */
const emptyToNull = (max: number) =>
  z
    .string()
    .max(max)
    .nullish()
    .transform((v) => (v === "" ? null : v));

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export const droppedEnrollmentSummarySchema = z.object({
  enrollmentId: z.number(),
  seasonId: z.number(),
  seasonTitle: z.string(),
  /**
   * Nullable on purpose: the column is nullable and only dropEnrollment sets
   * it alongside the status today. v1 read it with a non-null assertion
   * (students-query.ts:196) that a future bulk-withdraw would break silently
   * (spec 06 §2); the contract encodes the schema's truth instead.
   */
  droppedAt: z.string().nullable(),
  dropReason: z.string().nullable(),
});

export const studentListItemSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string(),
  avatarPath: z.string().nullable(),
  university: z.string().nullable(),
  year: z.string().nullable(),
  graduationYear: z.number().nullable(),
  activeSeasonTitle: z.string().nullable(),
  /**
   * The student's current group from GroupStudent — the ONE question that
   * table may answer, and only advisorily (ruling C9). Every per-season
   * membership decision in this domain goes through SeasonEnrollment instead.
   */
  currentGroupName: z.string().nullable(),
  /**
   * Non-null only on `status=dropped` rows: the dropped list is
   * enrollment-keyed (R43) — a student dropped from three seasons appears
   * three times, and screens must key rows on `enrollmentId`, not `id`.
   */
  droppedEnrollment: droppedEnrollmentSummarySchema.nullable(),
});
export type StudentListItem = z.infer<typeof studentListItemSchema>;

export const studentListResponseSchema = z.object({
  students: z.array(studentListItemSchema),
  nextCursor: z.number().nullable(),
  /**
   * The whole population under the current filters — D14's fix. v1 capped at
   * 200 rows and printed `rows.length` as if it were the count, so a
   * 250-student database read "200 students".
   */
  total: z.number(),
});
export type StudentListResponse = z.infer<typeof studentListResponseSchema>;

export const studentListStatusSchema = z.enum(["active", "alumni", "dropped"]);
export type StudentListStatus = z.infer<typeof studentListStatusSchema>;

/** v1's four sort keys on the students list (students-list.tsx `SortKey`). */
export const studentListSortSchema = z.enum(["name", "university", "season", "group"]);
export type StudentListSort = z.infer<typeof studentListSortSchema>;

export const studentListQuerySchema = z.object({
  status: studentListStatusSchema.default("active"),
  /** "has an enrollment in this season" — resolved through SeasonEnrollment (C9). */
  seasonId: z.coerce.number().int().positive().optional(),
  /**
   * Filter by the group the row DISPLAYS (`currentGroupName`, the advisory
   * GroupStudent pointer), as v1's group select did; `none` is v1's
   * "Unassigned". ANDed with scope (REG-82). Ignored for `status=dropped`,
   * whose rows are enrollments.
   */
  groupId: z
    .union([z.literal("none"), z.coerce.number().int().positive()])
    .optional(),
  /**
   * Sort key (REG-82). Absent keeps each list's own default order — name for
   * active, graduation year for alumni. A missing value sorts as "" like v1:
   * first ascending, last descending. Ignored for `status=dropped`.
   */
  sort: studentListSortSchema.optional(),
  dir: z.enum(["asc", "desc"]).default("asc"),
  /** Matches name, email or university, case-insensitive, ANDed with scope (R33). */
  q: z.string().trim().max(120).optional(),
  /** Row id of the last row of the previous page (enrollment id when status=dropped). */
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type StudentListQuery = z.output<typeof studentListQuerySchema>;

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
    year: z.string().nullable(),
    gifts: z.string().nullable(),
    activeSeasonId: z.number().nullable(),
    activeSeasonTitle: z.string().nullable(),
    activeSeasonCode: z.string().nullable(),
  })
  .strict();

/** + the personal data SUPER/ADMIN and the student themselves may read. */
export const studentProfilePrivateSchema = studentProfilePublicSchema.extend({
  phone: z.string().nullable(),
  dateOfBirth: z.string().nullable(),
  spiritualBackground: z.string().nullable(),
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

const studentDetailBase = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string(),
  avatarPath: z.string().nullable(),
  graduationYear: z.number().nullable(),
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

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Creation (SUPER-only in v2 — see the route). No password field exists here:
 * D7's `ChangeMe123!` is not ported; the account gets credentials from Plan
 * 7's invites, exactly like v1's CSV import (`passwordHash: null`).
 */
export const createStudentRequestSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().email(),
  university: emptyToNull(160),
  year: emptyToNull(40),
  phone: emptyToNull(60),
  dateOfBirth: z.string().datetime({ offset: true }).nullish(),
  spiritualBackground: emptyToNull(4000),
  gifts: emptyToNull(2000),
  notes: emptyToNull(4000),
  /**
   * Optional first enrollment (spec 06 D1): when present, one transaction
   * creates User + StudentProfile + an ACTIVE SeasonEnrollment AND points
   * activeSeasonId at the same season — the two definitions of "in this
   * season" (R9–R13) agree by construction, as v1's CSV import already got
   * right and its form never did (R15).
   */
  seasonId: z.number().int().positive().nullish(),
});
export type CreateStudentBody = z.output<typeof createStudentRequestSchema>;

/**
 * PATCH: absent = untouched, null = cleared. Which keys a caller may send at
 * all is decided per role in the route (SELF_EDITABLE / ADMIN_EDITABLE) —
 * before this schema runs.
 */
export const updateStudentRequestSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: z.string().email(),
    university: emptyToNull(160),
    year: emptyToNull(40),
    phone: emptyToNull(60),
    dateOfBirth: z.string().datetime({ offset: true }).nullish(),
    spiritualBackground: emptyToNull(4000),
    gifts: emptyToNull(2000),
    notes: emptyToNull(4000),
    activeSeasonId: z.number().int().positive().nullish(),
  })
  .partial();
export type UpdateStudentBody = z.output<typeof updateStudentRequestSchema>;

export const createEnrollmentRequestSchema = z.object({
  seasonId: z.number().int().positive(),
  // No groupId: group membership is written by the groups endpoints
  // (PATCH /groups/:id → setGroupStudents), never here. One writer per fact.
});
export type CreateEnrollmentBody = z.output<typeof createEnrollmentRequestSchema>;

export const updateEnrollmentRequestSchema = z
  .object({
    /**
     * The only two transitions that exist, both out of ACTIVE (R48–R50).
     * ACTIVE is deliberately not accepted: no un-drop, no re-activate — the
     * only v1 path that ever resurrected a WITHDRAWN enrollment was the group
     * form's delete-and-recreate, the most damaging defect in the domain
     * (D2), and v2's group writes already refuse to touch status.
     */
    status: z.enum(["WITHDRAWN", "COMPLETED"]),
    dropReason: emptyToNull(500),
  })
  .refine((v) => v.status === "WITHDRAWN" || v.dropReason == null, {
    path: ["dropReason"],
    message: "A drop reason only accompanies a withdrawal.",
  });
export type UpdateEnrollmentBody = z.output<typeof updateEnrollmentRequestSchema>;
// ---------------------------------------------------------------------------
// Lifecycle (Plan 10) — graduate, delete, and the response shapes every
// student write answers with (ruling X10: the client parses, never casts).
// ---------------------------------------------------------------------------

/**
 * Graduation is SUPER-only (R55) and irreversible (R61). The upper bound is
 * evaluated per call — v1 captured CURRENT_YEAR at module load and refused
 * January graduates until the process restarted (R58).
 */
export const graduateStudentRequestSchema = z
  .object({ graduationYear: z.number().int("Enter a whole year.") })
  .strict()
  .superRefine((v, ctx) => {
    const currentYear = new Date().getFullYear();
    if (v.graduationYear < 1990 || v.graduationYear > currentYear) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["graduationYear"],
        message: `Enter a year between 1990 and ${currentYear}.`,
      });
    }
  });
export type GraduateStudentBody = z.infer<typeof graduateStudentRequestSchema>;

export const graduateStudentResponseSchema = z.object({
  id: z.number().int(),
  graduationYear: z.number().int(),
  /** Every ACTIVE enrollment is completed, not only the pointed-at one (Plan 10 Decision 2). */
  enrollmentsCompleted: z.number().int().nonnegative(),
});
export type GraduateStudentResponse = z.infer<typeof graduateStudentResponseSchema>;

export const studentDeletedResponseSchema = z.object({
  id: z.number().int(),
  deletedAt: z.string(),
});
export type StudentDeletedResponse = z.infer<typeof studentDeletedResponseSchema>;

/** POST /students — Plan 7's response, given a schema so the create screen parses it. */
export const createStudentResponseSchema = z.object({
  id: z.number().int(),
  email: z.string(),
});
export type CreateStudentResponse = z.infer<typeof createStudentResponseSchema>;

/** PATCH /students/:id — Plan 7's response. */
export const updateStudentResponseSchema = z.object({ id: z.number().int() });
export type UpdateStudentResponse = z.infer<typeof updateStudentResponseSchema>;

/** PATCH /students/:id/enrollments/:seasonId — Plan 7's response. */
export const enrollmentTransitionResponseSchema = z.object({
  id: z.number().int(),
  status: enrollmentStatusSchema,
});
export type EnrollmentTransitionResponse = z.infer<typeof enrollmentTransitionResponseSchema>;

// ---------------------------------------------------------------------------
// Date-only values (Plan 10 Decision 8). A date of birth is a calendar day,
// not an instant: it has no wall clock for the org timezone to apply to, and
// the device timezone must never decide it either (ruling X13).
// ---------------------------------------------------------------------------

/**
 * True for a real calendar day written as YYYY-MM-DD ("2003-02-29" is not).
 * Delegates to Plan 5's isoDaySchema (packages/shared/src/org-time.ts) — one
 * definition of "a day on the wire", not a second regex.
 */
export function isDateOnly(value: string): boolean {
  return isoDaySchema.safeParse(value).success;
}

/** The instant v2 stores for a calendar day: that day's UTC midnight. */
export function isoFromDateOnly(day: string): string {
  return `${day}T00:00:00.000Z`;
}

/**
 * The calendar day a stored date-of-birth instant names, read without any
 * timezone: shift +12h and take the UTC day. A local midnight from any zone
 * in UTC−11…UTC+12 lands inside its own day — so v1's rows (its web date
 * picker stored browser-local midnight, e.g. Cairo's `…T22:00Z` on the
 * previous UTC day) and v2's UTC-midnight rows both read back correctly.
 */
export function dateOnlyFromIso(iso: string | null): string | null {
  if (iso == null) return null;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return new Date(ms + 12 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// The student's own profile — Plan 11 (GET/PATCH /api/v1/me/profile)
// ---------------------------------------------------------------------------

/**
 * The StudentProfile columns a student edits about themselves — and nothing
 * else (Plan 11 Decision 1). `User.name` is Plan 9's PATCH /me; `User.email`
 * is staff-only (spec 18 D8); `notes` and `activeSeasonId` never (R23).
 * routes/students.ts's SELF_EDITABLE is narrowed to this same set.
 */
export const OWN_PROFILE_FIELDS = [
  "university",
  "year",
  "phone",
  "dateOfBirth",
  "spiritualBackground",
  "gifts",
] as const;
export type OwnProfileField = (typeof OWN_PROFILE_FIELDS)[number];

/**
 * PATCH semantics: absent = untouched, "" or null = cleared (R26). `.strict()`
 * makes name/email/notes/activeSeasonId a parse failure (spec 06 §8: "a type
 * error rather than a runtime no-op"); the route refuses them by name first.
 * The mobile form validates with THIS schema before sending.
 */
export const updateOwnProfileInputSchema = z
  .object({
    university: emptyToNull(160),
    year: emptyToNull(40),
    phone: emptyToNull(60),
    /** A calendar date, "YYYY-MM-DD" (Plan 11 Decision 11) — Plan 5's isoDaySchema, not a copy. */
    dateOfBirth: z
      .string()
      .nullish()
      .transform((v) => (v === "" ? null : v))
      .pipe(isoDaySchema.nullish()),
    spiritualBackground: emptyToNull(4000),
    gifts: emptyToNull(2000),
  })
  .strict();
export type UpdateOwnProfileInput = z.input<typeof updateOwnProfileInputSchema>;

/**
 * What the student reads back about themselves. `.strict()`: staff-only
 * `notes` arriving here fails the parse (R23) instead of being stripped.
 */
export const myProfileSchema = z
  .object({
    name: z.string(),
    email: z.string(),
    avatarPath: z.string().nullable(),
    /** Non-null = alumnus (read-only profile). */
    graduationYear: z.number().int().nullable(),
    activeSeasonTitle: z.string().nullable(),
    university: z.string().nullable(),
    year: z.string().nullable(),
    phone: z.string().nullable(),
    dateOfBirth: isoDaySchema.nullable(),
    spiritualBackground: z.string().nullable(),
    gifts: z.string().nullable(),
  })
  .strict();
export type MyProfile = z.infer<typeof myProfileSchema>;

export const myProfileResponseSchema = z.object({ profile: myProfileSchema });
