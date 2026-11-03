import { z } from "zod";

import { emptyToNull } from "./empty-to-null";

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/** The student fields create and PATCH share — one definition, two schemas. */
const studentWriteFields = {
  name: z.string().trim().min(2).max(120),
  email: z.string().email(),
  university: emptyToNull(160),
  year: emptyToNull(40),
  phone: emptyToNull(60),
  dateOfBirth: z.string().datetime({ offset: true }).nullish(),
  spiritualBackground: emptyToNull(4000),
  gifts: emptyToNull(2000),
  notes: emptyToNull(4000),
};

/**
 * Creation (SUPER-only in v2 — see the route). No password field exists here:
 * D7's `ChangeMe123!` is not ported; the account gets credentials from Plan
 * 7's invites, exactly like v1's CSV import (`passwordHash: null`).
 */
export const createStudentRequestSchema = z.object({
  ...studentWriteFields,
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
    ...studentWriteFields,
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
