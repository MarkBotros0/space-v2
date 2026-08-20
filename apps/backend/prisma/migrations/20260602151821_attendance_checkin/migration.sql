-- AlterTable
ALTER TABLE "Season" ADD COLUMN     "lateThresholdMinutes" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN     "absenceBudgetMinutes" INTEGER NOT NULL DEFAULT 180,
ADD COLUMN     "absenceWeightMinutes" INTEGER NOT NULL DEFAULT 90,
ADD COLUMN     "lateWeightMinutes" INTEGER NOT NULL DEFAULT 30;

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "checkInToken" TEXT,
ADD COLUMN     "checkInOpenAt" TIMESTAMP(3),
ADD COLUMN     "checkInClosedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Attendance" ADD COLUMN     "checkedInAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Session_checkInToken_key" ON "Session"("checkInToken");
