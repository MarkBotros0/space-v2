-- M3 rollback. lateMinutesLegacy is retained for one full release after
-- cutover precisely so this path exists.
BEGIN;

UPDATE "Attendance" SET "lateMinutes" = "lateMinutesLegacy";
ALTER TABLE "Attendance" DROP COLUMN "lateBasis";
ALTER TABLE "Attendance" DROP COLUMN "lateMinutesLegacy";
ALTER TABLE "Season" DROP COLUMN "lateThresholdMinutes";
DROP TYPE "LateBasis";

COMMIT;
