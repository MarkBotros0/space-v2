import type { ClientRateLimitInfo, Options, Store } from "express-rate-limit";

import { db } from "../../db/client";
import { runInBackground } from "../background";
import { MS_PER_MINUTE } from "../org-time";

/** The slice of the Prisma client the store uses, so tests can pass a fake. */
type RateLimitDb = Pick<typeof db, "$queryRaw" | "$executeRaw">;

interface PostgresStoreOptions {
  client?: RateLimitDb;
  /** Share of increments that also sweep expired rows. Default 1%. */
  cleanupRate?: number;
  /** Injected for tests; defaults to Math.random. */
  random?: () => number;
}

interface HitRow {
  hits: number | bigint;
  resetAt: Date | string;
}

/**
 * express-rate-limit store backed by the RateLimitHit table, so every
 * serverless instance counts against the same bucket. The default MemoryStore
 * gives each Vercel instance its own counters, which lets a client that lands
 * on N instances make N times the limit.
 *
 * Every key is stored with this store's prefix (`auth:203.0.113.7`), so
 * limiters sharing the table never share a bucket. One store per limiter:
 * express-rate-limit refuses to let two limiters share a store instance.
 */
export class PostgresStore implements Store {
  /** Read by express-rate-limit's double-count check; also our key prefix. */
  readonly prefix: string;
  /** Counters are shared across instances, not local to this process. */
  readonly localKeys = false;

  private windowMs = MS_PER_MINUTE;
  private readonly client: RateLimitDb;
  private readonly cleanupRate: number;
  private readonly random: () => number;

  constructor(name: string, options: PostgresStoreOptions = {}) {
    this.prefix = `${name}:`;
    this.client = options.client ?? db;
    this.cleanupRate = options.cleanupRate ?? 0.01;
    this.random = options.random ?? Math.random;
  }

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  /**
   * One statement, so two instances incrementing the same key at once cannot
   * both read a stale count: the upsert takes the row lock, and Postgres
   * evaluates every SET expression against the row as it was before this
   * update. A row whose window has passed restarts at 1 with a fresh window.
   */
  async increment(key: string): Promise<ClientRateLimitInfo> {
    const rows = await this.client.$queryRaw<HitRow[]>`
      INSERT INTO "RateLimitHit" ("key", "hits", "resetAt")
      VALUES (
        ${this.prefix + key},
        1,
        now() + (${this.windowMs}::double precision * interval '1 millisecond')
      )
      ON CONFLICT ("key") DO UPDATE SET
        "hits" = CASE WHEN "RateLimitHit"."resetAt" <= now() THEN 1
                      ELSE "RateLimitHit"."hits" + 1 END,
        "resetAt" = CASE WHEN "RateLimitHit"."resetAt" <= now() THEN EXCLUDED."resetAt"
                         ELSE "RateLimitHit"."resetAt" END
      RETURNING "hits", "resetAt"`;
    const row = rows[0];
    if (!row) throw new Error("rate-limit upsert returned no row");

    if (this.random() < this.cleanupRate) {
      runInBackground("rate-limit-cleanup", this.sweepExpired());
    }
    return { totalHits: Number(row.hits), resetTime: new Date(row.resetAt) };
  }

  async get(key: string): Promise<ClientRateLimitInfo | undefined> {
    const rows = await this.client.$queryRaw<HitRow[]>`
      SELECT "hits", "resetAt" FROM "RateLimitHit"
      WHERE "key" = ${this.prefix + key} AND "resetAt" > now()`;
    const row = rows[0];
    return row ? { totalHits: Number(row.hits), resetTime: new Date(row.resetAt) } : undefined;
  }

  /** Used by skipSuccessfulRequests/skipFailedRequests; never below zero. */
  async decrement(key: string): Promise<void> {
    await this.client.$executeRaw`
      UPDATE "RateLimitHit" SET "hits" = GREATEST("hits" - 1, 0)
      WHERE "key" = ${this.prefix + key} AND "resetAt" > now()`;
  }

  async resetKey(key: string): Promise<void> {
    await this.client.$executeRaw`
      DELETE FROM "RateLimitHit" WHERE "key" = ${this.prefix + key}`;
  }

  /**
   * Rows an hour past their window. Any limiter's sweep clears every
   * limiter's dead rows; a live row is never touched, and an expired row the
   * sweep misses is restarted by its next hit anyway, so this only bounds the
   * table's size. Run in the background off ~1% of increments: no cron.
   */
  private async sweepExpired(): Promise<void> {
    await this.client.$executeRaw`
      DELETE FROM "RateLimitHit" WHERE "resetAt" < now() - interval '1 hour'`;
  }
}
