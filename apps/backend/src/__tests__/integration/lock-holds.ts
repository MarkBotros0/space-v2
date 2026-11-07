import { db } from "../../db/client";
import type { Prisma } from "../../generated/prisma/client";

// Forcing the order of two writers: one transaction holds its locks open, and
// the route under test is sent behind it. Postgres says when the route has
// queued, so the order is forced, not hoped for.

const HOLD_MS = 25_000;

export type Held = { pid: number; release: () => void; done: Promise<unknown> };

/**
 * Opens a transaction, runs `work`, and keeps it open until `release`; `finish`
 * then runs last, in the same transaction, while whoever queued is still queued.
 * The transaction's own timeout bounds a failure.
 */
export async function holdTransaction(
  work: (tx: Prisma.TransactionClient) => Promise<unknown>,
  finish?: (tx: Prisma.TransactionClient) => Promise<unknown>,
): Promise<Held> {
  let release = () => {};
  const gate = new Promise<void>((resolve) => (release = resolve));
  let ready = (_pid: number) => {};
  const held = new Promise<number>((resolve) => (ready = resolve));
  const done = db.$transaction(
    async (tx) => {
      await work(tx);
      const rows = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      ready(rows[0]!.pid);
      await gate;
      await finish?.(tx);
    },
    { timeout: HOLD_MS, maxWait: 10_000 },
  );
  const pid = await Promise.race([held, done.then(() => Promise.reject(new Error("hold ended early")))]);
  return { pid, release, done };
}

/** Until a backend is queued behind `pid`. Fails, rather than hangs, if nothing ever is. */
export async function untilBlockedBehind(pid: number): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const rows = await db.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM pg_stat_activity WHERE ${pid}::int = ANY(pg_blocking_pids(pid))`;
    if (rows[0]!.n > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("nothing queued behind the held transaction");
}

/** Until `count` backends in this database are waiting on a lock, whoever they wait for. */
export async function untilWaiting(count: number): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const rows = await db.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM pg_stat_activity
      WHERE datname = current_database() AND cardinality(pg_blocking_pids(pid)) > 0`;
    if (rows[0]!.n >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`fewer than ${count} backends ever waited on a lock`);
}

/** One held side, one route behind it: returns the route's answer once the hold commits. */
export async function behind<T>(held: Held, send: () => PromiseLike<T>): Promise<T> {
  const answer = Promise.resolve(send());
  try {
    await untilBlockedBehind(held.pid);
  } finally {
    held.release();
    await held.done;
  }
  return answer;
}
