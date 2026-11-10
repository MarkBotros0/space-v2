import type { Request, Response } from "express";

import { apiOk, apiError } from "../../lib/api-response";
import { auditLog } from "../../lib/audit";
import { graduateStudentAccount, softDeleteStudent } from "../../lib/students/lifecycle";
import { isSuper } from "../../lib/rbac";
import { requireRole } from "../../middleware/require-auth";
import { graduateStudentRequestSchema } from "../../../../../packages/shared/src/index";
import { idParam } from "../../lib/http/params";

/**
 * Graduation (Plan 10 Decision 2). SUPER-only — gated on isSuper alone (R55).
 * `graduatePerson` is the transaction's work:
 *   - it completes EVERY ACTIVE enrollment — v1 completed only the one matching
 *     activeSeasonId and left the rest ACTIVE forever (R48/R60), keeping an
 *     alumnus on rosters, in at-risk counts and (R53) in season access,
 *   - it ends live access tokens (Plan 18 M13): they carry graduationYear, and
 *     isAlumni() reads it from the token, so without this the graduate is
 *     treated as a current student for up to 15 minutes. Refresh tokens are
 *     kept, so the app silently picks up a token with the new claims.
 * Irreversible (R61): a second graduation is refused rather than silently
 * overwriting the year. Takes the person's lock, since a seat write reads
 * graduationYear under it.
 *
 * Passing a graduating season is how people graduate (owner, 2026-11-07), and End
 * does that itself. Anyone else needs `override` and an `overrideReason` (10 to 1000
 * characters). When it was actually needed, who/when/why go on the user in the same
 * transaction and the audit line says `override`, never the reason (a console log).
 */
export async function graduateStudent(req: Request, res: Response) {
  const user = requireRole(req, res, isSuper, "Only a super user can graduate students.");
  if (!user) return;
  const id = idParam(res, req.params.id, "student");
  if (id === null) return;

  const parsed = graduateStudentRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return apiError(res, "bad_request", parsed.error.issues[0]?.message ?? "Invalid graduation year.", 400);
  }
  const { graduationYear, override, overrideReason } = parsed.data;

  const outcome = await graduateStudentAccount(user.userId, id, { graduationYear, override, overrideReason });

  auditLog("student.graduate", user.userId, id, outcome.overridden ? { override: true } : {});
  return apiOk(res, { id, graduationYear, enrollmentsCompleted: outcome.enrollmentsCompleted });
}

/**
 * Soft delete (Plan 10 Decision 3; spec 06 D13 "keep soft delete as
 * DELETE /students/:id"). SUPER-only. One transaction that stamps the user
 * and revokes every refresh token (spec 11 D6: deactivation revokes); the
 * profile's own stamp is no longer written (refactor DB-010). Nothing cascades
 * (R87): enrollments, attendance, submissions and notes are history. A SUPER
 * undoes this through POST /users/:id/reactivate.
 */
export async function deleteStudent(req: Request, res: Response) {
  const user = requireRole(req, res, isSuper, "Only a super user can delete students.");
  if (!user) return;
  const id = idParam(res, req.params.id, "student");
  if (id === null) return;

  const deletedAt = new Date();
  await softDeleteStudent(id, deletedAt);

  auditLog("student.delete", user.userId, id);
  return apiOk(res, { id, deletedAt: deletedAt.toISOString() });
}
