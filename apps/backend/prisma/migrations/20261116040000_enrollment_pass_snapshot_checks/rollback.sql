-- Rollback for 20261116040000_enrollment_pass_snapshot_checks. Run with psql. Drops the three CHECKs only.
BEGIN;
ALTER TABLE "SeasonEnrollment"
  DROP CONSTRAINT "SeasonEnrollment_resultAgainstScore_check",
  DROP CONSTRAINT "SeasonEnrollment_passNumbers_check",
  DROP CONSTRAINT "SeasonEnrollment_passScore_check";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261116040000_enrollment_pass_snapshot_checks';
COMMIT;
