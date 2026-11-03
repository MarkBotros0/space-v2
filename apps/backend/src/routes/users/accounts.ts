import type { Request, Response } from "express";

import { db } from "../../db/client";
import { apiOk, apiError } from "../../lib/api-response";
import { revokeAllRefreshTokensForUser } from "../../lib/auth/tokens";
import { issueInvite } from "../../lib/invites";
import { parseId } from "../../lib/parse-id";
import { isUniqueViolation } from "../../lib/prisma-errors";
import { isLastActiveSuper, lockActiveSuperIds } from "../../lib/super-guard";
// Relative, not "@space/shared" — same emit trap routes/auth.ts documents.
import {
  createUserRequestSchema,
  updateUserRequestSchema,
} from "../../../../../packages/shared/src/index";
import { sendInviteEmailBestEffort } from "../invite-email";
import { requireSuper } from "./super-only";
import { loadUserDetail } from "./views";

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

  const parsed = updateUserRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return apiError(
      res, "bad_request",
      parsed.error.issues[0]?.message ?? "Invalid user body.", 400,
    );
  }
  const body = parsed.data;

  const outcome = await db.$transaction(async (tx) => {
    const target = await tx.user.findUnique({
      where: { id },
      select: { id: true, role: true, deletedAt: true },
    });
    // REG-104: a deactivated account is not an edit target. GET and reactivate
    // still reach it; only this write refuses.
    if (!target || target.deletedAt !== null) {
      return { fail: ["not_found", "User not found.", 404] as const };
    }

    const roleChanged = body.role !== target.role;

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
        fail: [
          "confirm_super_required",
          "Granting SUPER requires explicit confirmation.", 400,
        ] as const,
      };
    }

    // D7 rec 2: never demote the last SUPER. The active SUPER rows are LOCKED
    // (Decision 16), not merely counted — a count alone lets two concurrent
    // demotions both pass under READ COMMITTED.
    if (roleChanged && target.role === "SUPER") {
      const activeSuperIds = await lockActiveSuperIds(tx);
      if (isLastActiveSuper(activeSuperIds, id)) {
        return {
          fail: ["last_super", "This is the only active SUPER account.", 409] as const,
        };
      }
    }

    if (roleChanged) {
      // D3 — fix the write, not the predicate: demotion cascades to the scope
      // tables so loadScopes has nothing to return on the next refresh...
      if (target.role === "ADMIN") {
        await tx.seasonAdmin.deleteMany({ where: { userId: id } });
      }
      if (target.role === "LEADER") {
        await tx.groupLeader.deleteMany({ where: { userId: id } });
      }
      // ...and a promotion to STUDENT finally gets a profile (R46: v1 left
      // promoted users with a null activeSeasonId forever).
      if (body.role === "STUDENT") {
        await tx.studentProfile.upsert({
          where: { userId: id },
          update: {},
          create: { userId: id },
        });
      }
    }

    await tx.user.update({
      where: { id },
      data: { name: body.name, role: body.role, graduationYear: body.graduationYear },
    });

    if (roleChanged) {
      // C7 made real: the claims baked into live tokens cannot outlive the
      // change. Access tokens die within 900s; the refresh path dies now.
      await revokeAllRefreshTokensForUser(tx, id);
    }

    return { fail: null };
  });

  if (outcome.fail) {
    const [code, message, status] = outcome.fail;
    return apiError(res, code, message, status);
  }

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
    await revokeAllRefreshTokensForUser(tx, id);
    return "ok" as const;
  });

  if (outcome === "not_found") return apiError(res, "not_found", "User not found.", 404);
  if (outcome === "last_super") {
    return apiError(res, "last_super", "This is the only active SUPER account.", 409);
  }
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
  return apiOk(res, { deletedAt: null });
}

export async function createUser(req: Request, res: Response) {
  const user = requireSuper(req, res);
  if (!user) return;

  const parsed = createUserRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return apiError(
      res, "bad_request",
      parsed.error.issues[0]?.message ?? "Invalid user body.", 400,
    );
  }
  const body = parsed.data;

  // Plan 10 Decision 13 — spec 11 D7 rec 3 on CREATE as Plan 9 has it on
  // PATCH: a SUPER grant can never be a mis-tapped picker item.
  if (body.role === "SUPER" && body.confirmSuper !== true) {
    return apiError(res, "confirm_super_required", "Granting SUPER requires explicit confirmation.", 400);
  }

  // Pre-check for the friendly 409; the @unique constraint stays the real
  // guard, so a lost race is caught below rather than surfacing as a 500.
  const existing = await db.user.findUnique({ where: { email: body.email }, select: { id: true } });
  if (existing) return apiError(res, "email_taken", "Email already in use.", 409);

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
      return apiError(res, "email_taken", "Email already in use.", 409);
    }
    throw err;
  }

  // Mail AFTER commit, best-effort (R25) — see sendInviteEmailBestEffort.
  await sendInviteEmailBestEffort(created.id, body.email, created.raw, created.expiresAt);

  return apiOk(res, { userId: created.id }, 201);
}
