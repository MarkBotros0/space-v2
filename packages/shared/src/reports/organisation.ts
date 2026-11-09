import { z } from "zod";
import { seasonStatusSchema } from "../enums";

// ---------------------------------------------------------------------------
// The organisation roll-up
// ---------------------------------------------------------------------------

/**
 * `withdrawnCount` names the enum member it counts. v1's `droppedCount` was a
 * display rename applied at the data layer (R54); the label stays "Dropped".
 *
 * `code` rides beside `id` because every season link on v1's SUPER reports page
 * points at `/super/seasons/<integer id>` while the route resolves by `code`,
 * so every row 404s (R62, spec D13).
 */
const seasonEnrollmentCountSchema = z.object({
  seasonId: z.number().int(),
  code: z.string(),
  program: z.string(),
  year: z.number().int(),
  title: z.string(),
  status: seasonStatusSchema,
  activeCount: z.number().int().min(0),
  completedCount: z.number().int().min(0),
  withdrawnCount: z.number().int().min(0),
  leaderCount: z.number().int().min(0),
});

const alumniByYearRowSchema = z.object({
  year: z.number().int(),
  count: z.number().int().min(0),
});

/**
 * `totalStudentsNotGraduated` renames v1's `totalStudents`, which counted every
 * non-deleted STUDENT with no graduationYear — including students never
 * enrolled in anything and students withdrawn from everything — and was
 * labelled "Current students" (R51, spec D4).
 *
 * The QUERY is unchanged. Renaming is the safer half: changing the query would
 * move a headline number somebody has been quoting.
 */
export const organisationReportSchema = z.object({
  totalStudentsNotGraduated: z.number().int().min(0),
  totalAlumni: z.number().int().min(0),
  activeSeasonCount: z.number().int().min(0),
  seasons: z.array(seasonEnrollmentCountSchema),
  alumniByYear: z.array(alumniByYearRowSchema),
  generatedAt: z.string(),
});
export type OrganisationReport = z.infer<typeof organisationReportSchema>;
