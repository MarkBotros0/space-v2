import type { Prisma } from "../generated/prisma/client";

/**
 * Would removing `targetId` from the active SUPERs leave none? Pure, so the
 * branch the shared staging DB can never reach in an integration test (it
 * always holds real SUPERs) is still pinned by a test.
 */
export function isLastActiveSuper(activeSuperIds: readonly number[], targetId: number): boolean {
  return activeSuperIds.includes(targetId) && activeSuperIds.length <= 1;
}

/**
 * Lock every active SUPER row for the rest of the transaction and return the
 * ids (Decision 16).
 *
 * A bare count is not enough under READ COMMITTED: two concurrent demotions
 * each count two SUPERs and both proceed. FOR UPDATE makes the second
 * transaction wait for the first; when it resumes, Postgres re-checks the
 * WHERE against the committed row, so the SUPER the first transaction demoted
 * or deactivated is no longer returned and the guard refuses. Ordered by id so
 * every caller takes the locks in the same order (no lock-order deadlock).
 *
 * Must be called with a $transaction client — the lock is released at commit.
 */
export async function lockActiveSuperIds(tx: Prisma.TransactionClient): Promise<number[]> {
  const rows = await tx.$queryRaw<{ id: number }[]>`
    SELECT "id" FROM "User"
    WHERE "role" = 'SUPER' AND "deletedAt" IS NULL
    ORDER BY "id"
    FOR UPDATE`;
  return rows.map((r) => r.id);
}
