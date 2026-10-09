import { z } from "zod";

// Wire shapes — see the note in season.ts on why timestamps are strings.
//
// Zod rather than bare interfaces, per the convention in CLAUDE.md: the mobile
// client parses every response against these instead of casting, so a backend
// drift fails at the client boundary rather than downstream.

export const groupListItemSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  /**
   * ACTIVE enrolments in this group **for this group's season** — not
   * GroupStudent rows, which are unique per student across the whole database
   * and so report the current roster no matter which season is being asked
   * about (ruling C9).
   */
  studentCount: z.number(),
  leaderNames: z.array(z.string()),
  seasonId: z.number(),
  seasonCode: z.string(),
  seasonTitle: z.string(),
});
export type GroupListItem = z.infer<typeof groupListItemSchema>;

/**
 * Creating or editing a group.
 *
 * v1's schema covered `name` and `description` only — `leaderIds` and
 * `studentIds` were read straight off the raw request body, with no check that
 * the named users could legitimately hold those roles. Since a GroupLeader row
 * populates the `groupLeaderIds` claim, an unvalidated leader list is a
 * privilege path, not just a data-quality problem. Both arrays are validated
 * here and their members checked for eligibility server-side.
 */
export const groupWriteRequestSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters.").max(80),
  description: z.string().max(2000).nullish(),
  // v1 parity 2026-10-09 (spec 05 R14): no size cap, as v1 group-actions.ts:16-19,49.
  leaderIds: z.array(z.number().int().positive()).default([]),
  studentIds: z.array(z.number().int().positive()).default([]),
});
export type GroupWriteRequest = z.infer<typeof groupWriteRequestSchema>;

export const groupMemberSchema = z.object({
  id: z.number(),
  name: z.string().nullable(),
  /**
   * Absent for student callers. A student may read their own group so the app
   * can show who is in it, but v1 only ever put this payload on staff pages —
   * a student's own view of their group was a separate, narrower query that
   * never selected addresses. Handing every member of a group each other's
   * email is a change v1 never made, so the API withholds it by role rather
   * than inheriting it from the staff shape.
   */
  email: z.string().optional(),
});
export type GroupMember = z.infer<typeof groupMemberSchema>;

export const groupDetailSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  seasonId: z.number(),
  seasonCode: z.string(),
  seasonTitle: z.string(),
  leaders: z.array(groupMemberSchema),
  students: z.array(groupMemberSchema),
  /** isAdminOfSeason for the caller (C4, D-16.15): may edit or delete this group. */
  canManage: z.boolean(),
});
export type GroupDetail = z.infer<typeof groupDetailSchema>;

/** POST /seasons/:id/groups (201) and PATCH /groups/:id. */
export const groupRefResponseSchema = z.object({ id: z.number() });

/** GET /groups/leader-options (D-16.14) — interim until domain 11's user directory. */
export const leaderOptionSchema = z.object({
  id: z.number(),
  name: z.string().nullable(),
  email: z.string(),
});
export type LeaderOption = z.infer<typeof leaderOptionSchema>;

/**
 * GET /groups/student-options — every live STUDENT user, name asc, for the
 * group form's picker (v1 groups-query.ts:112-121; v1 parity 2026-10-09, spec
 * 05 R18/R78). Saving the form enrols a picked student who is not yet in the season.
 */
export const studentOptionSchema = leaderOptionSchema;
export type StudentOption = z.infer<typeof studentOptionSchema>;

/** GET /groups/:id/impact — the confirmation v1 never had (spec 05 R45, D-16.13). */
export const groupImpactSchema = z.object({
  /** ACTIVE enrolments that would lose their group. */
  studentCount: z.number().int().nonnegative(),
  leaderCount: z.number().int().nonnegative(),
  /** Live assignments targeted at this group ONLY. Non-empty → delete is refused. */
  soleTargetAssignments: z.array(z.object({ id: z.number(), title: z.string() })),
});
export type GroupImpact = z.infer<typeof groupImpactSchema>;

export const groupDeleteResponseSchema = z.object({
  deleted: z.literal(true),
  orphanedStudentIds: z.array(z.number()),
});

/** GET /seasons/:id/roster (D-16.11). */
export const seasonRosterRowSchema = z.object({
  userId: z.number(),
  name: z.string().nullable(),
  email: z.string(),
  /** This season's group, from SeasonEnrollment.groupId (C9). */
  groupId: z.number().nullable(),
  groupName: z.string().nullable(),
  // v1 parity 2026-10-09 (spec 05 R82): no otherSeasonGroup — a student whose
  // group is in another season shows as unassigned, as v1 groups-query.ts:151-155.
});
export type SeasonRosterRow = z.infer<typeof seasonRosterRowSchema>;

/**
 * v1's cap, group-actions.ts:183-190 (v1 parity 2026-10-09, spec 05 R48). v1 could
 * not finish 2000 inside its own 20 s timeout (R56); v2 batches the writes.
 */
export const GROUP_ASSIGNMENTS_MAX = 2000;

export const groupAssignmentsRequestSchema = z.object({
  assignments: z
    .array(
      z.object({
        studentUserId: z.number().int().positive(),
        /** null = unassign from this season's group. */
        groupId: z.number().int().positive().nullable(),
      }),
    )
    .max(GROUP_ASSIGNMENTS_MAX)
    .refine((rows) => new Set(rows.map((r) => r.studentUserId)).size === rows.length, {
      message: "Each student may appear only once.",
    }),
});
export type GroupAssignmentsRequest = z.infer<typeof groupAssignmentsRequestSchema>;

/** Counts of what was WRITTEN (spec 05 R57) — the same shape Plan 17's group importer reports. */
export const groupAssignmentsResponseSchema = z.object({
  assigned: z.number().int().nonnegative(),
  unassigned: z.number().int().nonnegative(),
  skippedStudentIds: z.array(z.number()),
});
export type GroupAssignmentsResult = z.infer<typeof groupAssignmentsResponseSchema>;
