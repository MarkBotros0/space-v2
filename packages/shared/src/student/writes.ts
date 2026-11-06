import { z } from "zod";

import { PHONE_MAX, universityGraduationYearFieldSchema } from "../contact-fields";
import { emptyToNull } from "./empty-to-null";

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/** The student fields create and PATCH share — one definition, two schemas. */
const studentWriteFields = {
  name: z.string().trim().min(2).max(120),
  // Trimmed and lowercased, as the CSV importer normalises it
  // (normaliseEmail). User.email is a plain unique column, so "A@x" typed
  // here and "a@x" imported would otherwise be two accounts.
  email: z.string().trim().toLowerCase().email(),
  university: emptyToNull(160),
  faculty: emptyToNull(160),
  universityGraduationYear: universityGraduationYearFieldSchema,
  // User.phone / User.dateOfBirth since 2026-11-06; the wire is unchanged.
  phone: emptyToNull(PHONE_MAX),
  dateOfBirth: z.string().datetime({ offset: true }).nullish(),
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
   * creates User + StudentProfile + an ACTIVE SeasonEnrollment. The current
   * season is derived from that enrolment; nothing stores a pointer.
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
