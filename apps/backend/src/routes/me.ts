import { Router } from "express";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
// Relative, not "@space/shared" — the rootDir emit trap (see routes/auth.ts).
import {
  changePasswordRequestSchema,
  updateProfileRequestSchema,
} from "../../../../packages/shared/src/index";

import { db } from "../db/client";
import { apiOk, apiError } from "../lib/api-response";
import { expireLiveResetTokens } from "../lib/auth/password-reset";
import { hashToken, revokeAllRefreshTokensForUser } from "../lib/auth/tokens";
import { loadMyAttendance, loadMySeason, loadSeasonHistory } from "../lib/queries/me";
// The one 429 handler (ruling X4) — never a local copy.
import { rateLimitHandler } from "../lib/rate-limit";
import { requireAuth, requireUser } from "../middleware/require-auth";

// Closes spec 18 R31: v1's current-password check was an unthrottled online
// oracle for anyone already holding a session.
const passwordLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, handler: rateLimitHandler });

export const meRouter = Router();

const ME_SELECT = {
  id: true, name: true, email: true, role: true, avatarPath: true,
  passwordHash: true, deletedAt: true,
} as const;

type MeRow = {
  id: number; name: string; email: string; role: string;
  avatarPath: string | null; passwordHash: string | null; deletedAt: Date | null;
};

/** The hash is reduced to a boolean before anything leaves this function. */
function toMeUser(row: MeRow) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    avatarPath: row.avatarPath,
    hasPassword: row.passwordHash !== null,
  };
}

meRouter.get("/", requireAuth, async (req, res) => {
  const user = requireUser(req);

  const record = await db.user.findUnique({ where: { id: user.userId }, select: ME_SELECT });

  apiOk(res, {
    // Soft-deleted now yields null, which is what packages/shared/src/auth.ts
    // documented all along (spec 11 §7 / D6: "one of the two is lying" — the
    // code was).
    user: record && record.deletedAt === null ? toMeUser(record) : null,
    // Scopes come from the token, not the database: they are what this token
    // was minted with, which is what the client's permission checks must agree
    // with until the next refresh.
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

meRouter.patch("/", requireAuth, async (req, res) => {
  const user = requireUser(req);

  // strict() in the schema refuses a body userId outright — the v1 property
  // "no settings action accepts a subject id" preserved by construction
  // (spec 18 §4).
  const parsed = updateProfileRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return apiError(res, "bad_request", parsed.error.issues[0]?.message ?? "Invalid profile.", 400);
  }

  const updated = await db.user.update({
    where: { id: user.userId },
    data: { name: parsed.data.name },
    select: ME_SELECT,
  });
  // Returning the row closes v1's write-then-double-refresh (spec 18 R23).
  return apiOk(res, { user: toMeUser(updated) });
});

meRouter.post("/password", requireAuth, passwordLimiter, async (req, res) => {
  const user = requireUser(req);

  const parsed = changePasswordRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return apiError(res, "bad_request", parsed.error.issues[0]?.message ?? "Invalid password body.", 400);
  }
  const body = parsed.data;

  const record = await db.user.findUnique({
    where: { id: user.userId },
    select: { passwordHash: true },
  });
  if (!record?.passwordHash) {
    // R27's rule kept, surfaced before typing on the client via hasPassword.
    return apiError(res, "no_password", "No password is set on this account — use your invite instead.", 409);
  }

  const ok = await bcrypt.compare(body.currentPassword, record.passwordHash);
  if (!ok) {
    // 400, not 401: the mobile client's interceptor reads any non-auth 401 as
    // an expired access token and spends a refresh rotation on it.
    return apiError(res, "incorrect_password", "Current password is incorrect.", 400);
  }

  const newHash = await bcrypt.hash(body.newPassword, 12);
  const exceptHash = body.refreshToken ? hashToken(body.refreshToken) : undefined;

  // Spec 18 D1: the change and the eviction are one transaction. Every other
  // session dies; the presented refresh token (this device) survives.
  const sessionsRevoked = await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.userId }, data: { passwordHash: newHash } });
    // Spec 18 R29 / spec 11 D6: an outstanding reset link must not outlive
    // the password it was meant to replace.
    await expireLiveResetTokens(tx, user.userId);
    return revokeAllRefreshTokensForUser(tx, user.userId, exceptHash);
  });

  return apiOk(res, { ok: true, sessionsRevoked });
});

const STUDENTS_ONLY = "This is only available to students and alumni.";

/*
 * Student self-service reads (Plan 11). requireAuth per route (ruling X5).
 * Role STUDENT covers alumni too (role stays STUDENT, graduationYear set).
 * Staff get 403, not an empty shape: a staff client calling these is a bug.
 */
meRouter.get("/season-history", requireAuth, async (req, res) => {
  const user = requireUser(req);
  if (user.role !== "STUDENT") return apiError(res, "forbidden", STUDENTS_ONLY, 403);
  return apiOk(res, { seasons: await loadSeasonHistory(user) });
});

meRouter.get("/season", requireAuth, async (req, res) => {
  const user = requireUser(req);
  if (user.role !== "STUDENT") return apiError(res, "forbidden", STUDENTS_ONLY, 403);
  return apiOk(res, { season: await loadMySeason(user) });
});

meRouter.get("/attendance", requireAuth, async (req, res) => {
  const user = requireUser(req);
  if (user.role !== "STUDENT") return apiError(res, "forbidden", STUDENTS_ONLY, 403);
  return apiOk(res, await loadMyAttendance(user));
});
