import { db } from "../../db/client";

/**
 * Takes the named lease for `holdMs` from `now`. The conditional UPDATE is what
 * makes the claim atomic: of two concurrent callers only one changes the row.
 * Returns the `lockedUntil` this caller now holds (pass it to `releaseLease`),
 * or null when another holds the lease.
 */
export async function claimLease(name: string, now: Date, holdMs: number): Promise<Date | null> {
  await db.$executeRaw`
    INSERT INTO "SchedulerLease" ("name", "lockedUntil", "updatedAt")
    VALUES (${name}, ${now}, ${now})
    ON CONFLICT ("name") DO NOTHING`;
  const until = new Date(now.getTime() + holdMs);
  const changed = await db.$executeRaw`
    UPDATE "SchedulerLease"
    SET "lockedUntil" = ${until}, "updatedAt" = ${now}
    WHERE "name" = ${name} AND "lockedUntil" <= ${now}`;
  return changed === 1 ? until : null;
}

/**
 * Frees the lease this caller holds (`heldUntil`, from `claimLease`) and
 * records when the run finished. Only while the row still says `heldUntil`: a
 * run that outlived its hold must not free the lease another instance has
 * taken since (review M7).
 */
export async function releaseLease(name: string, heldUntil: Date, now: Date): Promise<void> {
  await db.$executeRaw`
    UPDATE "SchedulerLease"
    SET "lockedUntil" = ${now}, "lastRunAt" = ${now}, "updatedAt" = ${now}
    WHERE "name" = ${name} AND "lockedUntil" = ${heldUntil}`;
}
