import { randomBytes } from "node:crypto";

import { db } from "../db/client";
import type { Prisma } from "../generated/prisma/client";
import { hashToken } from "./auth/tokens";
import { config } from "./config";
import { mapWithConcurrency } from "./concurrency";
import { sendInviteEmail } from "./email";
import type { BulkInviteResponse } from "@space/shared";
// Relative, not "@space/shared": a VALUE import (ruling X12 — the rootDir emit trap).
import { BULK_INVITE_BATCH_SIZE } from "../../../../packages/shared/src/index";

export type InviteWriter = Pick<typeof db, "inviteToken">;

export interface IssuedInvite {
  /** The raw code. Goes to the mailer and NOWHERE else — never into a
   *  response body, never into a production log (spec 11 §7, R21). */
  raw: string;
  expiresAt: Date;
}

/**
 * Mint an invite for a user.
 *
 * - The token is 32 base64url characters (24 random bytes ≈ 192 bits —
 *   matches v1's ~190-bit strength, R13).
 * - Only its SHA-256 digest is stored — the same `hashToken` the refresh and
 *   password-reset tokens already use. v1 stored invite tokens in plaintext
 *   while hashing the LOWER-value reset tokens (spec 11 D5); this closes it.
 *   v1's plaintext rows in the shared DB can never match a digest lookup and
 *   simply age out — none of them was ever acceptable anyway (D1).
 * - Prior live invites for the user are expired in the same client, so at
 *   most one invite is live per user (D5 rec 2). `expiresAt = now`, not
 *   `usedAt` — "used" means accepted and must stay honest.
 *
 * Deliberately does NOT send email: callers mail after their transaction
 * commits, so a transport failure can't roll back a minted row and a rolled
 * back row can't have been mailed.
 */
export async function issueInvite(
  client: InviteWriter,
  userId: number,
  invitedById: number,
): Promise<IssuedInvite> {
  const raw = randomBytes(24).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + config.inviteTokenTtlHours * 60 * 60 * 1000);

  await client.inviteToken.updateMany({
    where: { userId, usedAt: null, expiresAt: { gt: now } },
    data: { expiresAt: now },
  });
  await client.inviteToken.create({
    data: { token: hashToken(raw), userId, invitedById, expiresAt },
  });

  return { raw, expiresAt };
}

/** A live, unaccepted invite — moved here from routes/users.ts (Plan 9) so
 *  the library and the route share one definition. */
export function liveInviteWhere(now: Date) {
  return { usedAt: null, expiresAt: { gt: now } } as const;
}

/**
 * v2 stores a 64-hex SHA-256 digest; v1 stored its 32-char raw code (spec 11
 * R23). A digest lookup can never match a v1 row (Plan 9 Decision 4), so for
 * "does this person hold an invite that can work?" only digests count.
 */
export function isV2InviteDigest(token: string): boolean {
  return /^[0-9a-f]{64}$/.test(token);
}

/** v1's invitability filter (spec 11 R14), unchanged. */
const INVITABLE_USER_WHERE = { deletedAt: null, passwordHash: null, lastLoginAt: null } as const;

/**
 * Ids of every account the bulk button would reach, oldest first: invitable
 * (R14) and holding no live v2 invite (R20, with v1's dead plaintext invites
 * not counted). `scope` narrows further — production passes none; the
 * integration suite forces the fixture prefix so it can never touch a real
 * user in the shared staging DB.
 */
export async function listPendingInviteUserIds(scope: Prisma.UserWhereInput = {}): Promise<number[]> {
  const now = new Date();
  const rows = await db.user.findMany({
    where: { AND: [scope, INVITABLE_USER_WHERE] },
    select: { id: true, invitesReceived: { where: liveInviteWhere(now), select: { token: true } } },
    orderBy: { id: "asc" },
  });
  return rows
    .filter((row) => !row.invitesReceived.some((invite) => isV2InviteDigest(invite.token)))
    .map((row) => row.id);
}

export interface MintedInvite extends IssuedInvite {
  userId: number;
  email: string;
}

/**
 * Mint an invite for one user IF they are still pending — decided under a row
 * lock, so a double-tap or two SUPERs pressing the button at once re-check
 * against the committed state and skip instead of minting twice (which would
 * mail two codes and silently kill the first). Returns null when skipped.
 */
export async function inviteIfStillPending(userId: number, invitedById: number): Promise<MintedInvite | null> {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    const row = await tx.user.findFirst({
      where: { id: userId, ...INVITABLE_USER_WHERE },
      select: { email: true, invitesReceived: { where: liveInviteWhere(new Date()), select: { token: true } } },
    });
    if (!row || row.invitesReceived.some((invite) => isV2InviteDigest(invite.token))) return null;
    const issued = await issueInvite(tx, userId, invitedById);
    return { userId, email: row.email, ...issued };
  });
}

/** Parallel SMTP sends per batch (Plan 10 Decision 12). */
export const BULK_INVITE_MAIL_CONCURRENCY = 5;

/**
 * One bounded batch of "send all pending invites" (Plan 10 Decision 12).
 *
 * Spec 11 §7 asks for a queue; v2 has none and a job table is a migration
 * (C1). So: at most `batchSize` users per call, one short locked transaction
 * each, mail AFTER the commits with a small pool, and the counts back — the
 * screen says "tap again for the rest". A mail failure expires the invite it
 * just minted, so that person stays pending and the next tap retries them;
 * v1 left them "invited" with a code nobody received (R25).
 *
 * Logs carry user ids and error messages only — never an address or a code
 * (Plan 9 Decision 2).
 */
export async function sendPendingInviteBatch(
  invitedById: number,
  options: { scope?: Prisma.UserWhereInput; batchSize?: number } = {},
): Promise<BulkInviteResponse> {
  const batchSize = options.batchSize ?? BULK_INVITE_BATCH_SIZE;
  const batch = (await listPendingInviteUserIds(options.scope)).slice(0, batchSize);

  let skipped = 0;
  let failed = 0;
  const minted: MintedInvite[] = [];
  for (const userId of batch) {
    try {
      const outcome = await inviteIfStillPending(userId, invitedById);
      if (outcome === null) skipped += 1;
      else minted.push(outcome);
    } catch (err) {
      failed += 1;
      console.error(
        `[invites] bulk: failed to issue an invite for user ${userId}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  const delivered = await mapWithConcurrency(minted, BULK_INVITE_MAIL_CONCURRENCY, async (invite) => {
    try {
      await sendInviteEmail(invite.email, invite.raw, invite.expiresAt);
      return true;
    } catch (err) {
      console.error(
        `[invites] bulk: failed to send the invite email for user ${invite.userId}:`,
        err instanceof Error ? err.message : err,
      );
      // Back into the pending pool: an invite nobody received is not an invite.
      await db.inviteToken.updateMany({
        where: { token: hashToken(invite.raw), usedAt: null },
        data: { expiresAt: new Date() },
      });
      return false;
    }
  });

  const sent = delivered.filter(Boolean).length;
  failed += delivered.length - sent;
  const remaining = (await listPendingInviteUserIds(options.scope)).length;
  return { sent, skipped, failed, remaining };
}
