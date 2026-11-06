import { z } from "zod";

import { enrollmentStatusSchema } from "../enums";

// ---------------------------------------------------------------------------
// Lifecycle (Plan 10) — graduate, delete, and the response shapes every
// student write answers with (ruling X10: the client parses, never casts).
// ---------------------------------------------------------------------------

/**
 * Graduation is SUPER-only (R55) and irreversible (R61). The upper bound is
 * evaluated per call — v1 captured CURRENT_YEAR at module load and refused
 * January graduates until the process restarted (R58).
 */
const graduationYearField = z.number().int("Enter a whole year.");

function checkGraduationYear(v: { graduationYear: number }, ctx: z.RefinementCtx): void {
  const currentYear = new Date().getFullYear();
  if (v.graduationYear < 1990 || v.graduationYear > currentYear) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["graduationYear"],
      message: `Enter a year between 1990 and ${currentYear}.`,
    });
  }
}

export const graduateStudentRequestSchema = z
  .object({ graduationYear: graduationYearField })
  .strict()
  .superRefine(checkGraduationYear);
export type GraduateStudentBody = z.infer<typeof graduateStudentRequestSchema>;

/**
 * `POST /seasons/:id/graduate`. The cap is a season's list, about 200 people:
 * each person is several statements inside one transaction.
 */
export const graduateSeasonRequestSchema = z
  .object({
    userIds: z.array(z.number().int().positive()).min(1).max(250),
    graduationYear: graduationYearField,
  })
  .strict()
  .refine((b) => new Set(b.userIds).size === b.userIds.length, { path: ["userIds"], message: "Repeated person." })
  .superRefine(checkGraduationYear);
export type GraduateSeasonBody = z.infer<typeof graduateSeasonRequestSchema>;

export const graduateSeasonResponseSchema = z.object({
  /** Everyone graduated, in the order asked for. */
  graduated: z.array(z.number().int()),
  graduationYear: z.number().int(),
});
export type GraduateSeasonResponse = z.infer<typeof graduateSeasonResponseSchema>;

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

/**
 * POST /students — Plan 7's response, given a schema so the create screen
 * parses it. `inviteSent` means what it does on POST /users: false when the
 * student was created but the invite email could not be delivered (no mail
 * transport, or the send failed), so the account stays "pending".
 */
export const createStudentResponseSchema = z.object({
  id: z.number().int(),
  email: z.string(),
  inviteSent: z.boolean(),
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
