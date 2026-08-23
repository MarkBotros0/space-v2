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
  leaderIds: z.array(z.number().int().positive()).max(20).default([]),
  studentIds: z.array(z.number().int().positive()).max(500).default([]),
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
});
export type GroupDetail = z.infer<typeof groupDetailSchema>;
