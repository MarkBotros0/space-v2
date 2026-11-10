import type { Request, Response } from "express";

import { db } from "../../db/client";
import { apiOk, apiError } from "../../lib/api-response";
import { auditLog } from "../../lib/audit";
import { findExistingByEmail } from "../../lib/imports/students/validation";
import { deliverInvite } from "../../lib/invites";
import { isUniqueViolation } from "../../lib/prisma-errors";
// Relative, not "@space/shared" — same emit trap routes/auth.ts documents.
import { createUserRequestSchema, updateUserRequestSchema } from "../../../../../packages/shared/src/index";
import { loadUserDetail } from "./views";
import { isSeasonRole, saveUser } from "../../lib/users/update-user";
import { deactivateAccount } from "../../lib/users/deactivate";
import { createInvitedUser } from "../../lib/users/create";
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

  const outcome = await saveUser(user.userId, id, body);

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
  await deactivateAccount(id, deletedAt);
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
    created = await createInvitedUser(user.userId, body);
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
