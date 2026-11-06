-- CreateEnum
CREATE TYPE "EnrollmentResult" AS ENUM ('PASSED', 'NOT_PASSED');

-- AlterTable
ALTER TABLE "SeasonEnrollment" ADD COLUMN     "result" "EnrollmentResult",
ADD COLUMN     "resultReason" TEXT,
ADD COLUMN     "resultSetAt" TIMESTAMP(3);
