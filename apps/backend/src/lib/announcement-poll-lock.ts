import type { Prisma } from "../generated/prisma/client";

/**
 * Lock one poll row for the rest of the transaction. Every poll write (a vote,
 * an edit, close and reopen) takes it first, so a vote can't land on an option
 * an edit is removing, and a vote-loss count is the true one.
 */
export async function lockPoll(tx: Prisma.TransactionClient, pollId: number): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "AnnouncementPoll" WHERE "id" = ${pollId} FOR UPDATE`;
}
