BEGIN;

CREATE TABLE "SchedulerLease" (
    "name" TEXT PRIMARY KEY,
    "lockedUntil" TIMESTAMPTZ(3) NOT NULL,
    "lastRunAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL
);

COMMIT;
