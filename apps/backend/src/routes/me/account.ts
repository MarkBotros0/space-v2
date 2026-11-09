import { Router } from "express";
import type { UserRole } from "@space/shared";
// Relative, not "@space/shared" — the rootDir emit trap (see routes/auth.ts).
import { updateProfileRequestSchema } from "../../../../../packages/shared/src/index";

import { db } from "../../db/client";
import { apiOk, apiError } from "../../lib/api-response";
import { auditLog } from "../../lib/audit";
import { invalidateSessions } from "../../lib/auth/session-validity";
import { revokeAllRefreshTokensForUser } from "../../lib/auth/tokens";
import { dateFromDay, dayFromDate } from "../../lib/org-time";
import { isLastActiveSuper, lockActiveSuperIds } from "../../lib/super-guard";
import { requireAuth, requireUser } from "../../middleware/require-auth";

export const meAccountRouter = Router();

const ME_SELECT = {
  id: true,
  name: true,
  email: true,
  avatarPath: true,
  phone: true,
  dateOfBirth: true,
  address: true,
  passwordHash: true,
  deletedAt: true,
} as const;

type MeRow = {
  id: number;
  name: string;
  email: string;
  avatarPath: string | null;
  phone: string | null;
  dateOfBirth: Date | null;
  address: string | null;
  passwordHash: string | null;
  deletedAt: Date | null;
};

/** The hash is reduced to a boolean before anything leaves this function. */
function toMeUser(row: MeRow, role: UserRole) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role,
    avatarPath: row.avatarPath,
    phone: row.phone,
    dateOfBirth: dayFromDate(row.dateOfBirth),
    address: row.address,
    hasPassword: row.passwordHash !== null,
  };
}

meAccountRouter.get("/", requireAuth, async (req, res) => {
  const user = requireUser(req);

  const record = await db.user.findUnique({ where: { id: user.userId }, select: ME_SELECT });

  apiOk(res, {
    // Soft-deleted now yields null, which is what packages/shared/src/auth.ts
    // documented all along (spec 11 §7 / D6: "one of the two is lying" — the
    // code was).
    // The role and scopes come from the token, not the database: they are what
    // this token was minted with (loadScopes derived both, together), which is
    // what the client's permission checks must agree with until the next refresh.
    user: record && record.deletedAt === null ? toMeUser(record, user.role) : null,
    scopes: {
      seasonAdminIds: user.seasonAdminIds,
      groupLeaderIds: user.groupLeaderIds,
      activeSeasonId: user.activeSeasonId,
      // The client distinguishes an alumnus from an active student by
      // role === "STUDENT" && graduationYear != null. Without this field it
      // would have to decode the JWT itself to find out.
      graduationYear: user.graduationYear,
    },
  });
});

meAccountRouter.patch("/", requireAuth, async (req, res) => {
  const user = requireUser(req);

  // strict() in the schema refuses a body userId outright — the v1 property
  // "no settings action accepts a subject id" preserved by construction
  // (spec 18 §4).
  const parsed = updateProfileRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return apiError(res, "bad_request", parsed.error.issues[0]?.message ?? "Invalid profile.", 400);
  }

  // Partial: Prisma reads `undefined` as "leave the column alone".
  const body = parsed.data;
  const updated = await db.user.update({
    where: { id: user.userId },
    data: {
      name: body.name,
      phone: body.phone,
      dateOfBirth: dateFromDay(body.dateOfBirth),
      address: body.address,
    },
    select: ME_SELECT,
  });
  // Returning the row closes v1's write-then-double-refresh (spec 18 R23).
  return apiOk(res, { user: toMeUser(updated, user.role) });
});

/**
 * The account holder deletes their own account (App Store guideline 5.1.1(v)).
 * Same soft delete as a SUPER's deactivation — deletedAt on the user and on a
 * student profile, every session revoked — plus this account's push devices,
 * so nothing reaches the phone afterwards. The rows that record what the
 * person did (submissions, attendance) stay: other people's history points at
 * them. The last active SUPER can't delete themselves (409 last_super), the
 * same guard deactivation has.
 */
meAccountRouter.delete("/", requireAuth, async (req, res) => {
  const user = requireUser(req);
  const deletedAt = new Date();

  const outcome = await db.$transaction(async (tx) => {
    const row = await tx.user.findUnique({
      where: { id: user.userId },
      select: { role: true, deletedAt: true },
    });
    if (!row || row.deletedAt) return "gone" as const;
    if (row.role === "SUPER") {
      const activeSuperIds = await lockActiveSuperIds(tx);
      if (isLastActiveSuper(activeSuperIds, user.userId)) return "last_super" as const;
    }
    await tx.user.update({ where: { id: user.userId }, data: { deletedAt } });
    await tx.studentProfile.updateMany({ where: { userId: user.userId }, data: { deletedAt } });
    await tx.deviceToken.deleteMany({ where: { userId: user.userId } });
    await revokeAllRefreshTokensForUser(tx, user.userId);
    await invalidateSessions(tx, user.userId);
    return "ok" as const;
  });

  if (outcome === "gone") return apiError(res, "not_found", "Account not found.", 404);
  if (outcome === "last_super") {
    return apiError(res, "last_super", "You're the only active SUPER account, so it can't be deleted.", 409);
  }
  auditLog("user.self_delete", user.userId, user.userId);
  return apiOk(res, { deletedAt: deletedAt.toISOString() });
});
