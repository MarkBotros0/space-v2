-- Reassign any existing EXCUSED attendance to ABSENT before the value is removed
-- from the enum (Postgres cannot drop an enum value while rows still reference it).
UPDATE "Attendance" SET "status" = 'ABSENT' WHERE "status" = 'EXCUSED';

-- AlterEnum
BEGIN;
CREATE TYPE "AttendanceStatus_new" AS ENUM ('PRESENT', 'ABSENT', 'LATE');
ALTER TABLE "Attendance" ALTER COLUMN "status" TYPE "AttendanceStatus_new" USING ("status"::text::"AttendanceStatus_new");
ALTER TYPE "AttendanceStatus" RENAME TO "AttendanceStatus_old";
ALTER TYPE "AttendanceStatus_new" RENAME TO "AttendanceStatus";
DROP TYPE "AttendanceStatus_old";
COMMIT;
