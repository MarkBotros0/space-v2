import { z } from "zod";

/**
 * SUPER-only management of a season's admins (owner decision 2026-11): v1 had
 * no way to create a SeasonAdmin row at all, so a new season could only get an
 * admin through a database edit.
 *
 * Wire shapes — see the note in season.ts on why timestamps are strings.
 */

/** One SeasonAdmin row, joined to the person it names. */
export const seasonAdminItemSchema = z.object({
  userId: z.number().int(),
  name: z.string(),
  email: z.string(),
  assignedAt: z.string(),
  /** Null when the assigner's account was since removed (onDelete: SetNull) or the row predates v2. */
  assignedByName: z.string().nullable(),
});
export type SeasonAdminItem = z.infer<typeof seasonAdminItemSchema>;

/**
 * `GET /seasons/:id/admins`, and the body of the add and remove responses —
 * both return the list as it stands after the write, so the screen never has
 * to stitch a row in or out of its cache.
 */
export const seasonAdminListResponseSchema = z.object({
  admins: z.array(seasonAdminItemSchema),
});
export type SeasonAdminListResponse = z.infer<typeof seasonAdminListResponseSchema>;

/**
 * `POST /seasons/:id/admins`. Only an alumnus can serve; the rest of the rule
 * is `seatRefusal` on the server.
 */
export const addSeasonAdminRequestSchema = z.object({
  userId: z.number().int().positive(),
});
export type AddSeasonAdminBody = z.infer<typeof addSeasonAdminRequestSchema>;

/**
 * `GET /seasons/:id/staff-candidates`: alumni with no active role, name order.
 * Name and last season only: a season admin picks a leader from this and sees
 * nothing else of anyone's earlier seasons.
 */
export const staffCandidateSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  lastSeason: z.object({ title: z.string() }).nullable(),
});
export type StaffCandidate = z.infer<typeof staffCandidateSchema>;

export const staffCandidatesResponseSchema = z.object({ people: z.array(staffCandidateSchema) });
export type StaffCandidatesResponse = z.infer<typeof staffCandidatesResponseSchema>;
