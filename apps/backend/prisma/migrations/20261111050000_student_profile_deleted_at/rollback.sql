-- Rollback for 20261111050000_student_profile_deleted_at (D6). Run with psql. Restores the column, not its data.
BEGIN;
ALTER TABLE "StudentProfile" ADD COLUMN "deletedAt" timestamp(3) with time zone;
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261111050000_student_profile_deleted_at';
COMMIT;
