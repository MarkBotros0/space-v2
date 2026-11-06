-- AlterTable
ALTER TABLE "Season" ADD COLUMN     "requiredProgram" TEXT;

-- AlterTable
ALTER TABLE "SeasonEnrollment" ADD COLUMN     "overrideAt" TIMESTAMP(3),
ADD COLUMN     "overrideById" INTEGER;

-- AddForeignKey
ALTER TABLE "SeasonEnrollment" ADD CONSTRAINT "SeasonEnrollment_overrideById_fkey" FOREIGN KEY ("overrideById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
