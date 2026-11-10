import type { Request, Response } from "express";

import { db } from "../../db/client";
import { apiOk, apiError } from "../../lib/api-response";
import { auditLog } from "../../lib/audit";
import { invalidateSessions } from "../../lib/auth/session-validity";
import { revokeAllRefreshTokensForUser } from "../../lib/auth/tokens";
import { parseId } from "../../lib/parse-id";
import { graduatePerson, passedGraduatingYears } from "../../lib/queries/students/writes";
import { isSuper } from "../../lib/rbac";
import { lockPeople } from "../../lib/roles";
import { requireRole } from "../../middleware/require-auth";
import { graduateStudentRequestSchema } from "../../../../../packages/shared/src/index";

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
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid student id.", 400);

  const parsed = graduateStudentRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return apiError(res, "bad_request", parsed.error.issues[0]?.message ?? "Invalid graduation year.", 400);
  }
  const { graduationYear, override, overrideReason } = parsed.data;

  const outcome = await db.$transaction(async (tx) => {
    await lockPeople(tx, [id]);
    const student = await tx.user.findFirst({
      where: { id, role: "STUDENT", deletedAt: null },
      select: { name: true, graduationYear: true },
    });
    if (!student) return "not_found" as const;
    if (student.graduationYear !== null) return "already_graduated" as const;
    const passedYears = await passedGraduatingYears(tx, id);
    const qualified = passedYears.length > 0;
    if (!qualified && !override) return { notQualified: student.name };
    // A pass decides the class: a typed year can't put them in a different School.
    if (qualified && !passedYears.includes(graduationYear)) {
      return { wrongClass: { name: student.name, year: Math.max(...passedYears) } };
    }
    // The reason is kept only when the exception was needed, and only here.
    const exception = qualified ? undefined : { byId: user.userId, reason: overrideReason ?? "" };
    const done = await graduatePerson(tx, id, graduationYear, exception);
    return typeof done === "string" ? done : { ...done, overridden: !qualified };
  });

  if (outcome === "not_found") return apiError(res, "not_found", "Student not found.", 404);
  if (outcome === "already_graduated") {
    return apiError(res, "already_graduated", "This student has already graduated.", 409);
  }
  if ("notQualified" in outcome) {
    return apiError(res, "not_qualified", `${outcome.notQualified} hasn't passed a graduating season.`, 409);
  }

  if ("wrongClass" in outcome && outcome.wrongClass) {
    const { name, year } = outcome.wrongClass;
    return apiError(res, "wrong_class", `${name} passed the ${year} season, so they're School of ${year}.`, 409);
  }

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
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid student id.", 400);

  const deletedAt = new Date();
  const deleted = await db.$transaction(async (tx) => {
    const marked = await tx.user.updateMany({
      where: { id, role: "STUDENT", deletedAt: null },
      data: { deletedAt },
    });
    if (marked.count === 0) return false;
    await revokeAllRefreshTokensForUser(tx, id);
    await invalidateSessions(tx, id); // Plan 18 M13: live access tokens end too
    return true;
  });
  if (!deleted) return apiError(res, "not_found", "Student not found.", 404);

  auditLog("student.delete", user.userId, id);
  return apiOk(res, { id, deletedAt: deletedAt.toISOString() });
}
