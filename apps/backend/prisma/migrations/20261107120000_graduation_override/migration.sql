-- AlterTable
ALTER TABLE "User" ADD COLUMN     "graduationOverrideAt" TIMESTAMP(3),
ADD COLUMN     "graduationOverrideById" INTEGER,
ADD COLUMN     "graduationOverrideReason" TEXT;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_graduationOverrideById_fkey" FOREIGN KEY ("graduationOverrideById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
