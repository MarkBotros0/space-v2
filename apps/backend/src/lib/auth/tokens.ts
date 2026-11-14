import { createHash, randomBytes } from "node:crypto";

import { SignJWT, jwtVerify } from "jose";
import type { UserRole } from "@space/shared";

import { db } from "../../db/client";
import { bestEffort } from "../best-effort";
import { config } from "../config";
import { loadScopes } from "./scopes";
import { MS_PER_DAY } from "../org-time";

const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_MS = 30 * MS_PER_DAY;
/** How long a refresh token outlives its rotation while its successor is unused (see rotateRefreshToken). */
const ROTATED_GRACE_MS = 7 * MS_PER_DAY;
const AUDIENCE = "jpc-mobile";

export interface SessionUser {
  userId: number;
  role: UserRole;
  seasonAdminIds: number[];
  groupLeaderIds: number[];
  activeSeasonId: number | null;
  graduationYear: number | null;
}

interface IssuedSession {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
}

function secret(): Uint8Array {
  return new TextEncoder().encode(config.authSecret);
}

export async function signAccessToken(user: SessionUser): Promise<{ token: string; expiresIn: number }> {
  const token = await new SignJWT({
    role: user.role,
    seasonAdminIds: user.seasonAdminIds,
    groupLeaderIds: user.groupLeaderIds,
    activeSeasonId: user.activeSeasonId,
    graduationYear: user.graduationYear,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.userId))
    .setIssuedAt()
    .setAudience(AUDIENCE)
    .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
    .sign(secret());
  return { token, expiresIn: ACCESS_TTL_SECONDS };
}

/** A verified access token: its claims plus its `iat`, in seconds. */
type VerifiedAccess = SessionUser & { issuedAt: number };

/**
 * Signature, audience and expiry only. Whether the user has since invalidated
 * their sessions (Plan 18 M13) is requireAuth's check, which needs `issuedAt`.
 */
export async function verifyAccessToken(token: string): Promise<VerifiedAccess | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), { audience: AUDIENCE });
    const userId = Number(payload.sub);
    if (!Number.isInteger(userId) || userId <= 0) return null;
    return {
      userId,
      role: payload.role as UserRole,
      seasonAdminIds: (payload.seasonAdminIds as number[] | undefined) ?? [],
      groupLeaderIds: (payload.groupLeaderIds as number[] | undefined) ?? [],
      activeSeasonId: (payload.activeSeasonId as number | null | undefined) ?? null,
      graduationYear: (payload.graduationYear as number | null | undefined) ?? null,
      // signAccessToken always sets iat; a token without one counts as oldest.
      issuedAt: typeof payload.iat === "number" ? payload.iat : 0,
    };
  } catch {
    return null;
  }
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

async function issueRefreshToken(userId: number): Promise<{ token: string; expiresAt: Date }> {
  const raw = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);
  await db.refreshToken.create({
    data: { tokenHash: hashToken(raw), userId, expiresAt },
  });
  return { token: raw, expiresAt };
}

/**
 * A new refresh token replaces every other one the person holds, live or not:
 * one signed-in device per person (owner, refactor DB-007), so signing in on a
 * new phone signs the old one out, and the table holds at most two rows per
 * person (the newest and the one it rotated) instead of one per refresh forever.
 * Uses the userId index.
 */
async function deleteOtherRefreshTokens(userId: number, keepTokenHashes: string[]): Promise<number> {
  const { count } = await db.refreshToken.deleteMany({ where: { userId, tokenHash: { notIn: keepTokenHashes } } });
  return count;
}

/** `rotatedTokenHash`: the token a refresh presented, kept until the new one is used. */
export async function issueSession(
  userId: number,
  rotatedTokenHash?: string,
): Promise<{ session: IssuedSession; user: SessionUser } | null> {
  const dbUser = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, deletedAt: true },
  });
  if (!dbUser || dbUser.deletedAt) return null;

  const user: SessionUser = { userId: dbUser.id, ...(await loadScopes(dbUser.id)) };
  const access = await signAccessToken(user);
  const refresh = await issueRefreshToken(user.userId);
  // Never a reason to fail a sign-in: a row left behind is swept next time.
  await bestEffort("delete other refresh tokens", () =>
    deleteOtherRefreshTokens(user.userId, [hashToken(refresh.token), ...(rotatedTokenHash ? [rotatedTokenHash] : [])]),
  );
  return {
    session: {
      accessToken: access.token,
      expiresIn: access.expiresIn,
      refreshToken: refresh.token,
    },
    user,
  };
}

/**
 * Swap a refresh token for a new session. The presented token is NOT spent here: it stays good
 * (for at most ROTATED_GRACE_MS) until the new one is itself rotated, or a sign-in replaces both.
 * Owner report 2026-11-14, "signed out without doing anything": the server rotated, the reply
 * never reached the phone (backgrounded, network switch), so the phone kept a token that was
 * already gone and its next refresh signed it out. Now that retry gets a fresh pair and the
 * successor nobody received is deleted. Logout and every revocation still end both tokens.
 */
export async function rotateRefreshToken(rawToken: string): Promise<IssuedSession | null> {
  const record = await db.refreshToken.findUnique({ where: { tokenHash: hashToken(rawToken) } });
  if (!record || record.revokedAt || record.expiresAt < new Date()) return null;

  // Guarded on still-live, so a revocation landing between the read and here wins.
  const graceEnd = new Date(Math.min(record.expiresAt.getTime(), Date.now() + ROTATED_GRACE_MS));
  const kept = await db.refreshToken.updateMany({
    where: { id: record.id, revokedAt: null },
    data: { expiresAt: graceEnd },
  });
  if (kept.count !== 1) return null;

  const issued = await issueSession(record.userId, record.tokenHash);
  return issued?.session ?? null;
}

/**
 * Sign-out. Ends every live token of the person who holds this one, not just this one: a refresh
 * keeps the token it rotated alive for a while (rotateRefreshToken), and there is one signed-in
 * device per person, so this is the same as ending that device's session.
 */
export async function revokeRefreshToken(rawToken: string): Promise<void> {
  const record = await db.refreshToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    select: { userId: true },
  });
  if (!record) return;
  await revokeAllRefreshTokensForUser(db, record.userId);
}

/**
 * Revoke every live refresh token a user holds. C7's note — "a role change
 * does not revoke a live token; the mitigation is TTL" — stops being a
 * mitigation and becomes a revocation here: stored-role change, deactivation,
 * account deletion and password reset all call this in (or right after) the
 * write that changes the user's authority, together with invalidateSessions
 * (session-validity.ts), which ends the access tokens too (Plan 18 M13).
 *
 * Accepts any client exposing `refreshToken` so it runs inside a
 * db.$transaction as well as standalone.
 */
type DbWriter = Pick<typeof db, "refreshToken">;

export async function revokeAllRefreshTokensForUser(client: DbWriter, userId: number): Promise<number> {
  const result = await client.refreshToken.updateMany({
    where: {
      userId,
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });
  return result.count;
}
