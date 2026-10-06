import { randomBytes } from "node:crypto";

import type { db } from "../db/client";
import { hashToken } from "./auth/tokens";
import { config } from "./config";

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
