-- Rollback for 20261116030000_enrollment_pass_snapshot. Run with psql. Drops every enrolment's stored
-- score, numbers, against-the-score flag and who set the result.
BEGIN;
ALTER TABLE "SeasonEnrollment"
  DROP CONSTRAINT "SeasonEnrollment_resultSetById_fkey",
  DROP COLUMN "resultSetById",
  DROP COLUMN "resultAgainstScore",
  DROP COLUMN "passNumbers",
  DROP COLUMN "passScore";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261116030000_enrollment_pass_snapshot';
COMMIT;
