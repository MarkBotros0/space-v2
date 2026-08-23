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
