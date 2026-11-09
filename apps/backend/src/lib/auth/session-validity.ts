import type { Prisma } from "../../generated/prisma/client";

import { db } from "../../db/client";

/**
 * `User.sessionsValidFrom` (Plan 18 M13): access tokens issued before it are
 * refused. Discharges C7 — "a role change does not revoke a live token; the
 * mitigation is TTL" — for the 900 s access token, as
 * revokeAllRefreshTokensForUser already did for the 30-day refresh token.
 *
 * Checked on every authenticated request with ONE primary-key read of one
 * column, not cached. A per-process cache would have to live for the token's
 * remaining TTL to be worth having, and the backend runs as several
 * instances (serverless functions), so a write on one instance would not
 * reach another's cache: a logged-out or demoted token would keep working on
 * the other instances for as long as the cache lives — the very window this
 * column exists to close. A lookup by `User.id` is an index probe on the
 * primary key and costs far less than the request it guards.
 */

/** Whole seconds, like a JWT's `iat`. */
function toEpochSeconds(at: Date): number {
  return Math.floor(at.getTime() / 1000);
}

/**
 * Was a token with this `iat` (seconds) issued before the cut-off? Strict on
 * whole seconds, so a token minted in the same second as the invalidation
 * stays valid: that is what lets the client's own refresh straight after a
 * password change (whose refresh token is spared) produce a working token.
 */
export function issuedBeforeCutoff(issuedAt: number, sessionsValidFrom: Date | null): boolean {
  if (sessionsValidFrom === null) return false;
  return issuedAt < toEpochSeconds(sessionsValidFrom);
}

/** True when the user has invalidated every session issued before `issuedAt`. */
export async function isAccessTokenInvalidated(userId: number, issuedAt: number): Promise<boolean> {
  const row = await db.user.findUnique({ where: { id: userId }, select: { sessionsValidFrom: true } });
  return issuedBeforeCutoff(issuedAt, row?.sessionsValidFrom ?? null);
}

type SessionInvalidator = Pick<typeof db, "user">;

/**
 * Every access token the user holds stops working now. Call it in the same
 * transaction as revokeAllRefreshTokensForUser, so the refresh path and the
 * access path end together.
 */
export async function invalidateSessions(
  client: SessionInvalidator,
  userId: number,
  at: Date = new Date(),
): Promise<void> {
  await client.user.update({ where: { id: userId }, data: { sessionsValidFrom: at }, select: { id: true } });
}

/**
 * A student's season membership changed (enrolled, dropped, completed,
 * graduated), so their derived `activeSeasonId` claim is stale: every access
 * token issued before `now` is refused and the next refresh re-reads scopes.
 * Pass the caller's transaction so the stamp commits with the change.
 */
export async function markSessionsStale(
  tx: Prisma.TransactionClient,
  userIds: number[],
  now: Date = new Date(),
): Promise<void> {
  if (userIds.length === 0) return;
  await tx.user.updateMany({ where: { id: { in: userIds } }, data: { sessionsValidFrom: now } });
}
