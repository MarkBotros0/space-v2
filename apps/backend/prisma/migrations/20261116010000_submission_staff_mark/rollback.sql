-- Rollback for 20261116010000_submission_staff_mark. Run with psql. Drops every staff mark.
BEGIN;
DROP TABLE "SubmissionStaffMark";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261116010000_submission_staff_mark';
COMMIT;
