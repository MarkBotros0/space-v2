import { db } from "../db/client";
import { MS_PER_DAY } from "./org-time";

/**
 * How long rows nobody can use any more are kept (owner, refactor Q13). The
 * daily cron (`/api/v1/internal/retention/purge`) deletes the rest.
 */
export const RETENTION = {
  /** A revoked, used or expired token is kept this long, then deleted. */
  deadTokenGraceDays: 7,
  /** A notification older than this is deleted, read or not. */
  notificationDays: 180,
  /** A push device not seen for this long is deleted; the next sign-in registers it again. */
  staleDeviceDays: 180,
  /** Rows per DELETE, and DELETEs per table per run: a backlog drains over several days. */
  batchSize: 5000,
  maxBatches: 20,
} as const;

export interface RetentionCounts {
  refreshTokens: number;
  inviteTokens: number;
  passwordResetTokens: number;
  notifications: number;
  deviceTokens: number;
}

/** Runs one batched DELETE until it removes fewer than a batch, or the batch cap is hit. */
async function drain(deleteBatch: () => Promise<number>): Promise<number> {
  let total = 0;
  for (let i = 0; i < RETENTION.maxBatches; i++) {
    const n = await deleteBatch();
    total += n;
    if (n < RETENTION.batchSize) break;
  }
  return total;
}

/**
 * Deletes what the retention rules allow, table by table. A dead invite is kept
 * while it is its person's newest one: the user panel shows the latest invite's
 * dates even once it has expired (R75), and "pending" vs "invited" reads it.
 * Every other reader treats a missing token exactly like a dead one.
 */
export async function purgeRetained(now = new Date()): Promise<RetentionCounts> {
  const tokenCutoff = new Date(now.getTime() - RETENTION.deadTokenGraceDays * MS_PER_DAY);
  const notificationCutoff = new Date(now.getTime() - RETENTION.notificationDays * MS_PER_DAY);
  const deviceCutoff = new Date(now.getTime() - RETENTION.staleDeviceDays * MS_PER_DAY);
  const limit = RETENTION.batchSize;

  const refreshTokens = await drain(
    () => db.$executeRaw`
      DELETE FROM "RefreshToken" WHERE "id" IN (
        SELECT "id" FROM "RefreshToken"
        WHERE "revokedAt" < ${tokenCutoff} OR "expiresAt" < ${tokenCutoff}
        LIMIT ${limit})`,
  );
  const inviteTokens = await drain(
    () => db.$executeRaw`
      DELETE FROM "InviteToken" WHERE "id" IN (
        SELECT t."id" FROM "InviteToken" t
        WHERE (t."usedAt" < ${tokenCutoff} OR t."expiresAt" < ${tokenCutoff})
          AND EXISTS (
            SELECT 1 FROM "InviteToken" n
            WHERE n."userId" = t."userId" AND (n."createdAt", n."id") > (t."createdAt", t."id"))
        LIMIT ${limit})`,
  );
  const passwordResetTokens = await drain(
    () => db.$executeRaw`
      DELETE FROM "PasswordResetToken" WHERE "id" IN (
        SELECT "id" FROM "PasswordResetToken"
        WHERE "usedAt" < ${tokenCutoff} OR "expiresAt" < ${tokenCutoff}
        LIMIT ${limit})`,
  );
  const notifications = await drain(
    () => db.$executeRaw`
      DELETE FROM "Notification" WHERE "id" IN (
        SELECT "id" FROM "Notification" WHERE "createdAt" < ${notificationCutoff} LIMIT ${limit})`,
  );
  const deviceTokens = await drain(
    () => db.$executeRaw`
      DELETE FROM "DeviceToken" WHERE "id" IN (
        SELECT "id" FROM "DeviceToken" WHERE "lastSeenAt" < ${deviceCutoff} LIMIT ${limit})`,
  );
  return { refreshTokens, inviteTokens, passwordResetTokens, notifications, deviceTokens };
}
