-- AlterTable
ALTER TABLE "Attendance" ADD COLUMN     "lateMinutes" INTEGER;

-- AlterTable
ALTER TABLE "Season" DROP COLUMN "lateThresholdMinutes",
DROP COLUMN "lateWeightMinutes";

