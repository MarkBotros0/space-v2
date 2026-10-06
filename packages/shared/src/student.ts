import { z } from "zod";

import { enrollmentStatusSchema, seasonStatusSchema } from "./enums";

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

export const studentListQuerySchema = z.object({
  status: studentListStatusSchema.default("active"),
  /** "has an enrollment in this season" — resolved through SeasonEnrollment (C9). */
  seasonId: z.coerce.number().int().positive().optional(),
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
