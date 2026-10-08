-- M3 (Plan 18 Task 2.3): lateness gets a basis and a threshold. Atomic.
BEGIN;

CREATE TYPE "LateBasis" AS ENUM ('SESSION_START', 'MANUAL', 'UNKNOWN');
ALTER TABLE "Season"     ADD COLUMN "lateThresholdMinutes" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Attendance" ADD COLUMN "lateMinutesLegacy" INTEGER;
ALTER TABLE "Attendance" ADD COLUMN "lateBasis" "LateBasis" NOT NULL DEFAULT 'UNKNOWN';

-- (a) Preserve every value before touching one.
UPDATE "Attendance" SET "lateMinutesLegacy" = "lateMinutes";

-- (b) Recompute from the session start wherever a check-in instant exists on a
--     LATE row. Basis-independent: it does not matter whether v1 or v2 wrote
--     the row, because checkedInAt and startsAt are both facts. Only LATE rows
--     carry minutes (the budget sums lateMinutes over LATE rows only), so a
--     PRESENT row's minutes are left alone and only its basis is labelled.
UPDATE "Attendance" a
   SET "lateMinutes" = GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (a."checkedInAt" - s."startsAt")) / 60))::int,
       "lateBasis"   = 'SESSION_START'
  FROM "Session" s
 WHERE s."id" = a."sessionId" AND a."checkedInAt" IS NOT NULL AND a."status" = 'LATE';

UPDATE "Attendance" SET "lateBasis" = 'SESSION_START'
 WHERE "checkedInAt" IS NOT NULL AND "status" <> 'LATE';

-- (c) Rows with a lateness but no check-in instant were typed in by a leader.
--     Nothing can be recomputed from them; label them honestly.
UPDATE "Attendance" SET "lateBasis" = 'MANUAL'
 WHERE "checkedInAt" IS NULL AND "lateMinutes" IS NOT NULL;
-- Everything else keeps UNKNOWN.

COMMIT;
