import { db } from "../../db/client";

/**
 * Takes the named lease for `holdMs` from `now`. The conditional UPDATE is what
 * makes the claim atomic: of two concurrent callers only one changes the row.
 */
export async function claimLease(name: string, now: Date, holdMs: number): Promise<boolean> {
  await db.$executeRaw`
    INSERT INTO "SchedulerLease" ("name", "lockedUntil", "updatedAt")
    VALUES (${name}, ${now}, ${now})
    ON CONFLICT ("name") DO NOTHING`;
  const until = new Date(now.getTime() + holdMs);
  const changed = await db.$executeRaw`
    UPDATE "SchedulerLease"
    SET "lockedUntil" = ${until}, "updatedAt" = ${now}
    WHERE "name" = ${name} AND "lockedUntil" <= ${now}`;
  return changed === 1;
}

/** Frees the lease and records when the run finished. */
export async function releaseLease(name: string, now: Date): Promise<void> {
  await db.$executeRaw`
    UPDATE "SchedulerLease"
    SET "lockedUntil" = ${now}, "lastRunAt" = ${now}, "updatedAt" = ${now}
    WHERE "name" = ${name}`;
}
