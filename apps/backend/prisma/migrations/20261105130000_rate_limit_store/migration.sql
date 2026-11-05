-- RateLimitHit: express-rate-limit counters shared through Postgres (v2-only
-- schema, owner ruling 2026-11-04). Additive. The statements below are exactly
-- what `prisma migrate diff` produces between the previous schema and this one.
--
-- The backend runs on Vercel serverless, where the default in-memory store
-- gives every instance its own counters, so a client spread across instances
-- was never really limited. lib/rate-limit/postgres-store.ts increments a row
-- per limiter-prefixed key in one atomic upsert. resetAt is timestamptz so the
-- `resetAt <= now()` comparisons never depend on the session time zone.

-- CreateTable
CREATE TABLE "RateLimitHit" (
    "key" TEXT NOT NULL,
    "hits" INTEGER NOT NULL,
    "resetAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RateLimitHit_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "RateLimitHit_resetAt_idx" ON "RateLimitHit"("resetAt");
