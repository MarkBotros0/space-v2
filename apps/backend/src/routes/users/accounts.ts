import type { Request, Response } from "express";

import { db } from "../../db/client";
import { apiOk, apiError } from "../../lib/api-response";
import { auditLog } from "../../lib/audit";
import { derivedRoleOf } from "../../lib/auth/scopes";
import { invalidateSessions, markSessionsStale } from "../../lib/auth/session-validity";
import { revokeAllRefreshTokensForUser } from "../../lib/auth/tokens";
import { findExistingByEmail } from "../../lib/imports/students/validation";
import { deliverInvite, issueInvite } from "../../lib/invites";
import { parseId } from "../../lib/parse-id";
import { isUniqueViolation } from "../../lib/prisma-errors";
import { liveSeasonRole, lockPeople } from "../../lib/roles";
import { isLastActiveSuper, lockActiveSuperIds } from "../../lib/super-guard";
// Relative, not "@space/shared" — same emit trap routes/auth.ts documents.
import {
  createUserRequestSchema,
  roleRequiresAlumnus,
  updateUserRequestSchema,
} from "../../../../../packages/shared/src/index";
import { requireSuper } from "./super-only";
import { loadUserDetail } from "./views";
import { EMAIL_IN_USE } from "../../lib/error-messages";

const isSeasonRole = (role: unknown): role is "ADMIN" | "LEADER" => role === "ADMIN" || role === "LEADER";

const roleFromSeasons = (res: Response) =>
  apiError(res, "role_from_seasons", "Admin and leader come from seasons, not from the account.", 400);

export async function getUser(req: Request, res: Response) {
  const user = requireSuper(req, res);
  if (!user) return;
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid user id.", 400);

  const detail = await loadUserDetail(id);
  if (!detail) return apiError(res, "not_found", "User not found.", 404);
  return apiOk(res, detail);
}

export async function updateUser(req: Request, res: Response) {
  const user = requireSuper(req, res);
  if (!user) return;
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid user id.", 400);

  // Before the schema, whose graduation-year rule would answer first. The form
  // sends no role for someone whose role comes from seasons, so ADMIN and
  // LEADER are never valid here, not even the derived one.
  if (isSeasonRole(req.body?.role)) return roleFromSeasons(res);

  const parsed = updateUserRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return apiError(res, "bad_request", parsed.error.issues[0]?.message ?? "Invalid user body.", 400);
  }
  const body = parsed.data;

  const outcome = await db.$transaction(async (tx) => {
    // A SUPER's demotion locks every SUPER before this person alone: two
    // demotions each holding their own row and waiting on the other's would deadlock.
    const before = await tx.user.findUnique({ where: { id }, select: { role: true } });
    const lockedSuperIds = before?.role === "SUPER" && body.role !== "SUPER" ? await lockActiveSuperIds(tx) : null;

    await lockPeople(tx, [id]);
    const target = await tx.user.findUnique({
      where: { id },
      select: { id: true, name: true, role: true, deletedAt: true, graduationYear: true },
    });
    // REG-104: a deactivated account is not an edit target. GET and reactivate
    // still reach it; only this write refuses.
    if (!target || target.deletedAt !== null) {
      return { fail: ["not_found", "User not found.", 404] as const };
    }

    // Against the role the form was shown, not the stored one: a stored ADMIN
    // with only finished rows reads STUDENT, and saving that changes nothing.
    // No role at all (a derived ADMIN or LEADER's form) is no change either.
    const currentRole = await derivedRoleOf(tx, target);
    const roleChanged = body.role !== undefined && body.role !== currentRole;

    // The schema can't check the year of a role it wasn't sent: that is the held one.
    if (body.role === undefined && body.graduationYear === null && roleRequiresAlumnus(currentRole)) {
      return { fail: ["bad_request", "Required for this role.", 400] as const };
    }

    // D7 rec 1: you cannot change your own role — the lockout guard v1's
    // updateUserAction lacked (R50). Renaming yourself stays allowed.
    if (roleChanged && id === user.userId) {
      return {
        fail: ["cannot_change_own_role", "You can't change your own role.", 409] as const,
      };
    }

    // D7 rec 3: SUPER is never a mis-tapped picker item.
    if (roleChanged && body.role === "SUPER" && body.confirmSuper !== true) {
      return {
        fail: ["confirm_super_required", "Granting SUPER requires explicit confirmation.", 400] as const,
      };
    }

    // D7 rec 2: never demote the last SUPER. The active SUPER rows are LOCKED
    // (Decision 16), not merely counted — a count alone lets two concurrent
    // demotions both pass under READ COMMITTED.
    if (roleChanged && target.role === "SUPER") {
      const activeSuperIds = lockedSuperIds ?? (await lockActiveSuperIds(tx));
      if (isLastActiveSuper(activeSuperIds, id)) {
        return {
          fail: ["last_super", "This is the only active SUPER account.", 409] as const,
        };
      }
    }

    // SUPER and MENTOR hold no seasons. A derived ADMIN or LEADER can't become
    // a STUDENT here either: the rows are the role, so saving would change nothing.
    if (roleChanged && (body.role !== "STUDENT" || isSeasonRole(currentRole))) {
      const held = await liveSeasonRole(tx, id);
      if (held) {
        return {
          fail: [
            "has_season_role",
            `${target.name} has a role in ${held.seasonTitle}. Remove them from that season first.`,
            409,
          ] as const,
        };
      }
    }

    // A stored student's year is their alumni status, and Graduate is what changes
    // that: its gate, its audit line, its enrolment completion. Correcting one year
    // to another isn't a change of status. Moving off STUDENT sets the year that
    // role needs.
    const staysStudent = target.role === "STUDENT" && (!roleChanged || body.role === "STUDENT");
    if (staysStudent && (target.graduationYear === null) !== (body.graduationYear === null)) {
      return {
        fail: ["use_graduate", "Use Graduate. A graduation year can't be added or cleared here.", 409] as const,
      };
    }
    const yearCorrected = staysStudent && target.graduationYear !== body.graduationYear;

    // A move to STUDENT finally gets a profile (R46: v1 left promoted users
    // with a null activeSeasonId forever).
    if (roleChanged && body.role === "STUDENT") {
      await tx.studentProfile.upsert({
        where: { userId: id },
        update: {},
        create: { userId: id },
      });
    }

    await tx.user.update({
      where: { id },
      data: {
        name: body.name,
        graduationYear: body.graduationYear,
        ...(roleChanged ? { role: body.role } : {}),
      },
    });

    if (roleChanged) {
      // C7 made real: the claims baked into live tokens cannot outlive the
      // change. The refresh path dies now, and so do the access tokens
      // (Plan 18 M13) instead of within their 900s TTL.
      await revokeAllRefreshTokensForUser(tx, id);
      await invalidateSessions(tx, id);
    }
    // The year rides in the token; the next silent refresh picks up the right one.
    if (yearCorrected) await markSessionsStale(tx, [id]);

    return { fail: null, roleChanged, yearCorrected };
  });

  if (outcome.fail) {
    const [code, message, status] = outcome.fail;
    return apiError(res, code, message, status);
  }
  if (outcome.roleChanged) auditLog("user.role_change", user.userId, id);
  if (outcome.yearCorrected) auditLog("user.graduation_year_change", user.userId, id);

  // Through the same builder GET /:id uses, so PATCH returns exactly what GET
  // does — invite panel included.
  const detail = await loadUserDetail(id);
  if (!detail) return apiError(res, "not_found", "User not found.", 404);
  return apiOk(res, detail);
}

export async function deactivateUser(req: Request, res: Response) {
  const user = requireSuper(req, res);
  if (!user) return;
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid user id.", 400);
  if (id === user.userId) {
    // v1 returned void and the UI couldn't tell the no-op from success (R57,
    // R58). An explicit error is the fix, not a silent return.
    return apiError(res, "cannot_deactivate_self", "You can't deactivate yourself.", 400);
  }

  const deletedAt = new Date();
  // The existence check, the last-SUPER guard and the write share one
  // transaction, and the guard locks the SUPER rows (Decision 16) — an earlier
  // draft counted outside any transaction, so a concurrent demotion could
  // slip between the count and the write.
  const outcome = await db.$transaction(async (tx) => {
    const target = await tx.user.findUnique({ where: { id }, select: { role: true } });
    if (!target) return "not_found" as const;
    if (target.role === "SUPER") {
      const activeSuperIds = await lockActiveSuperIds(tx);
      if (isLastActiveSuper(activeSuperIds, id)) return "last_super" as const;
    }
    await tx.user.update({ where: { id }, data: { deletedAt } });
    // D6: deactivation revokes — v1 left the refresh path live for 30 days.
    // Live access tokens end too (Plan 18 M13).
    await revokeAllRefreshTokensForUser(tx, id);
    await invalidateSessions(tx, id);
    return "ok" as const;
  });

  if (outcome === "not_found") return apiError(res, "not_found", "User not found.", 404);
  if (outcome === "last_super") {
    return apiError(res, "last_super", "This is the only active SUPER account.", 409);
  }
  auditLog("user.deactivate", user.userId, id);
  return apiOk(res, { deletedAt: deletedAt.toISOString() });
}

export async function reactivateUser(req: Request, res: Response) {
  const user = requireSuper(req, res);
  if (!user) return;
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid user id.", 400);

  const target = await db.user.findUnique({ where: { id }, select: { id: true } });
  if (!target) return apiError(res, "not_found", "User not found.", 404);

  await db.$transaction([
    db.user.update({ where: { id }, data: { deletedAt: null } }),
    // A student deleted through DELETE /students/:id also carries a profile
    // stamp (v1 parity, R86). Clearing only the user would leave the profile
    // "deleted" to v1's readers — jpc-space/src/app/admin/quizzes/page.tsx:31
    // counts profiles with deletedAt: null. updateMany: non-students have no
    // profile row, and that is fine.
    db.studentProfile.updateMany({ where: { userId: id }, data: { deletedAt: null } }),
  ]);
  auditLog("user.reactivate", user.userId, id);
  return apiOk(res, { deletedAt: null });
}

export async function createUser(req: Request, res: Response) {
  const user = requireSuper(req, res);
  if (!user) return;

  // Before the schema, whose graduation-year rule would answer first.
  if (isSeasonRole(req.body?.role)) return roleFromSeasons(res);

  const parsed = createUserRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return apiError(res, "bad_request", parsed.error.issues[0]?.message ?? "Invalid user body.", 400);
  }
  const body = parsed.data;

  // Plan 10 Decision 13 — spec 11 D7 rec 3 on CREATE as Plan 9 has it on
  // PATCH: a SUPER grant can never be a mis-tapped picker item.
  if (body.role === "SUPER" && body.confirmSuper !== true) {
    return apiError(res, "confirm_super_required", "Granting SUPER requires explicit confirmation.", 400);
  }

  // Pre-check for the friendly 409, case-insensitive through the importer's
  // own lookup: `User.email` is a plain unique column, so "Foo@x.com" would
  // otherwise slip past an existing "foo@x.com" and become a second account.
  // (The schema already trims and lower-cases what is stored.) Deactivated
  // accounts count too, as they always did. The @unique constraint stays the
  // real guard, so a lost race is caught below rather than surfacing as a 500.
  const existing = await findExistingByEmail(db, [body.email]);
  if (existing.size > 0) return apiError(res, "email_taken", EMAIL_IN_USE, 409);

  let created: { id: number; raw: string; expiresAt: Date };
  try {
    created = await db.$transaction(async (tx) => {
      // Spec 11 §7: creation and invitation are ONE operation. passwordHash
      // stays null — the column is nullable and null IS the activation model
      // (R14). No temp password exists to log, display, or share (D2).
      const row = await tx.user.create({
        data: {
          name: body.name,
          email: body.email,
          role: body.role,
          graduationYear: body.graduationYear,
          passwordHash: null,
          ...(body.role === "STUDENT" ? { studentProfile: { create: {} } } : {}),
        },
        select: { id: true },
      });
      const invite = await issueInvite(tx, row.id, user.userId);
      return { id: row.id, raw: invite.raw, expiresAt: invite.expiresAt };
    });
  } catch (err) {
    // Unique-violation from the race the pre-check can lose.
    if (isUniqueViolation(err)) {
      return apiError(res, "email_taken", EMAIL_IN_USE, 409);
    }
    throw err;
  }

  auditLog("user.create", user.userId, created.id);

  // Mail AFTER commit (R25). The account is created either way — failing the
  // create over a mail outage would leave the operator retyping a form for a
  // row that already exists. An undelivered invite is withdrawn again
  // (deliverInvite), so the account reads "pending" rather than "invited"
  // with a code nobody received, and the response says so.
  const delivery = await deliverInvite(created.id, body.email, created);

  return apiOk(res, { userId: created.id, inviteSent: delivery === "sent" }, 201);
}
