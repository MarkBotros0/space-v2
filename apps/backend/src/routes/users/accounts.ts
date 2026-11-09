import type { Request, Response } from "express";

import { db } from "../../db/client";
import { apiOk, apiError } from "../../lib/api-response";
import { auditLog } from "../../lib/audit";

import { invalidateSessions } from "../../lib/auth/session-validity";
import { revokeAllRefreshTokensForUser } from "../../lib/auth/tokens";
import { findExistingByEmail } from "../../lib/imports/students/validation";
import { deliverInvite, issueInvite } from "../../lib/invites";

import { isUniqueViolation } from "../../lib/prisma-errors";

import { isLastActiveSuper, lockActiveSuperIds } from "../../lib/super-guard";
// Relative, not "@space/shared" — same emit trap routes/auth.ts documents.
import { createUserRequestSchema, updateUserRequestSchema } from "../../../../../packages/shared/src/index";
import { loadUserDetail } from "./views";
import { isSeasonRole, updateUserInTx } from "../../lib/users/update-user";
import { EMAIL_IN_USE } from "../../lib/error-messages";
import { requireRole } from "../../middleware/require-auth";
import { canManageUsers } from "../../lib/rbac";
import { idParam } from "../../lib/http/params";
import { notFound } from "../../lib/http/not-found";

const roleFromSeasons = (res: Response) =>
  apiError(res, "role_from_seasons", "Admin and leader come from seasons, not from the account.", 400);

export async function getUser(req: Request, res: Response) {
  const user = requireRole(req, res, canManageUsers);
  if (!user) return;
  const id = idParam(res, req.params.id, "user");
  if (id === null) return;

  const detail = await loadUserDetail(id);
  if (!detail) return notFound(res, "User");
  return apiOk(res, detail);
}

export async function updateUser(req: Request, res: Response) {
  const user = requireRole(req, res, canManageUsers);
  if (!user) return;
  const id = idParam(res, req.params.id, "user");
  if (id === null) return;

  // Before the schema, whose graduation-year rule would answer first. The form
  // sends no role for someone whose role comes from seasons, so ADMIN and
  // LEADER are never valid here, not even the derived one.
  if (isSeasonRole(req.body?.role)) return roleFromSeasons(res);

  const parsed = updateUserRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return apiError(res, "bad_request", parsed.error.issues[0]?.message ?? "Invalid user body.", 400);
  }
  const body = parsed.data;

  const outcome = await db.$transaction((tx) => updateUserInTx(tx, user.userId, id, body));

  if (outcome.roleChanged) auditLog("user.role_change", user.userId, id);
  if (outcome.yearCorrected) auditLog("user.graduation_year_change", user.userId, id);

  // Through the same builder GET /:id uses, so PATCH returns exactly what GET
  // does — invite panel included.
  const detail = await loadUserDetail(id);
  if (!detail) return notFound(res, "User");
  return apiOk(res, detail);
}

export async function deactivateUser(req: Request, res: Response) {
  const user = requireRole(req, res, canManageUsers);
  if (!user) return;
  const id = idParam(res, req.params.id, "user");
  if (id === null) return;
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

  if (outcome === "not_found") return notFound(res, "User");
  if (outcome === "last_super") {
    return apiError(res, "last_super", "This is the only active SUPER account.", 409);
  }
  auditLog("user.deactivate", user.userId, id);
  return apiOk(res, { deletedAt: deletedAt.toISOString() });
}

export async function reactivateUser(req: Request, res: Response) {
  const user = requireRole(req, res, canManageUsers);
  if (!user) return;
  const id = idParam(res, req.params.id, "user");
  if (id === null) return;

  const target = await db.user.findUnique({ where: { id }, select: { id: true } });
  if (!target) return notFound(res, "User");

  // Only the user: StudentProfile.deletedAt is no longer read or kept in step
  // (refactor DB-010; the column goes in Wave 6).
  await db.user.update({ where: { id }, data: { deletedAt: null } });
  auditLog("user.reactivate", user.userId, id);
  return apiOk(res, { deletedAt: null });
}

export async function createUser(req: Request, res: Response) {
  const user = requireRole(req, res, canManageUsers);
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
