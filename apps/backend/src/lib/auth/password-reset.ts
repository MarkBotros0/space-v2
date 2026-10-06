import { randomBytes } from "node:crypto";

import bcrypt from "bcryptjs";
// Relative, not "@space/shared" — a VALUE import from src/lib/auth/ (ruling X12).
import { PASSWORD_RESET_TTL_MINUTES } from "../../../../../packages/shared/src/index";

import { db } from "../../db/client";
import { isEmailConfigured, sendPasswordResetEmail } from "../email";
import { hashToken, revokeAllRefreshTokensForUser } from "./tokens";

/** v1's TTL, unchanged (spec 11 R73). */
export const PASSWORD_RESET_TTL_MS = PASSWORD_RESET_TTL_MINUTES * 60 * 1000;
/** One request per account per minute — stops mail-bombing a victim from many IPs. */
export const RESET_REQUEST_COOLDOWN_MS = 60 * 1000;

export type ResetWriter = Pick<typeof db, "passwordResetToken">;

/** Expire every live, unused reset token a user holds. Returns how many. */
export async function expireLiveResetTokens(
  client: ResetWriter,
  userId: number,
  now: Date = new Date(),
): Promise<number> {
  const result = await client.passwordResetToken.updateMany({
    where: { userId, usedAt: null, expiresAt: { gt: now } },
    data: { expiresAt: now },
  });
  return result.count;
}

/**
 * Mint a reset token in v1's exact format — 32 random bytes as 64 hex chars
 * (R71), stored only as its SHA-256 hex digest (R72) via the same hashToken
 * refresh and invite tokens use. Identical format is what lets a token minted
 * by either backend complete at either backend (Plan 10 Decision 9).
 * Prior live tokens are expired first: one live reset per user (spec 11 D5
 * rec 2 — v1 let every request add another live credential, R76).
 * Deliberately sends no email: callers mail after their transaction commits.
 */
export async function issuePasswordReset(
  client: ResetWriter,
  userId: number,
): Promise<{ raw: string; expiresAt: Date }> {
  const raw = randomBytes(32).toString("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + PASSWORD_RESET_TTL_MS);
  await expireLiveResetTokens(client, userId, now);
  await client.passwordResetToken.create({ data: { token: hashToken(raw), userId, expiresAt } });
  return { raw, expiresAt };
}

/**
 * Everything forgot-password does, run AFTER the route has already answered
 * (Plan 10 Decision 9) — so neither the lookup nor the SMTP round trip can be
 * timed (v1 awaited SMTP only for real accounts, R69). Returns void on every
 * path; the caller learns nothing (R67).
 */
export async function requestPasswordReset(email: string): Promise<void> {
  // No transport → mint nothing: a code nobody can receive is a liability.
  if (!isEmailConfigured()) return;

  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, email: true, deletedAt: true },
  });
  if (!user || user.deletedAt) return; // R70

  const recent = await db.passwordResetToken.findFirst({
    where: { userId: user.id, createdAt: { gt: new Date(Date.now() - RESET_REQUEST_COOLDOWN_MS) } },
    select: { id: true },
  });
  if (recent) return;

  const { raw, expiresAt } = await db.$transaction((tx) => issuePasswordReset(tx, user.id));
  try {
    await sendPasswordResetEmail(user.email, raw, expiresAt);
  } catch (err) {
    // R68 kept: a transport failure is logged, never surfaced. User id and
    // message only — not the address, not the code.
    console.error(
      `[password-reset] failed to send the reset email for user ${user.id}:`,
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * Complete a reset. "invalid" covers unknown, used, expired, and a target
 * deleted since the request — one outcome, so the route can answer with one
 * opaque code (spec 11 D5 rec 3; v1 rendered three different messages, R78).
 *
 * The consume is a guarded updateMany inside the transaction, so two
 * concurrent submissions of one token cannot both win. In the same
 * transaction: the cost-12 hash (D8), every other live reset token and live
 * invite expired, and every refresh token revoked — the "I think I'm
 * compromised" remedy finally evicts the attacker (R79, spec 11 D6).
 */
export async function completePasswordReset(rawToken: string, password: string): Promise<"ok" | "invalid"> {
  const record = await db.passwordResetToken.findUnique({
    where: { token: hashToken(rawToken) },
    select: { id: true, userId: true, usedAt: true, expiresAt: true, user: { select: { deletedAt: true } } },
  });
  if (!record) return "invalid";
  if (record.usedAt !== null) return "invalid";
  if (record.expiresAt <= new Date()) return "invalid";
  if (record.user.deletedAt !== null) return "invalid";

  const passwordHash = await bcrypt.hash(password, 12);

  const consumed = await db.$transaction(async (tx) => {
    const now = new Date();
    const stamped = await tx.passwordResetToken.updateMany({
      where: { id: record.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (stamped.count === 0) return false;
    await tx.user.update({ where: { id: record.userId }, data: { passwordHash } });
    await expireLiveResetTokens(tx, record.userId, now);
    await tx.inviteToken.updateMany({
      where: { userId: record.userId, usedAt: null, expiresAt: { gt: now } },
      data: { expiresAt: now },
    });
    await revokeAllRefreshTokensForUser(tx, record.userId);
    return true;
  });
  return consumed ? "ok" : "invalid";
}
