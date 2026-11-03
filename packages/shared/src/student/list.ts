import { z } from "zod";

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
