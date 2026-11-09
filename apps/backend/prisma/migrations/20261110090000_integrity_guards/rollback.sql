-- Rollback for 20261110090000_integrity_guards (D6). Run with psql. Cleaned-up rows are not restored.
DROP INDEX CONCURRENTLY IF EXISTS "QuizAttempt_one_in_progress_key";
DROP INDEX CONCURRENTLY IF EXISTS "Group_seasonId_name_key";
BEGIN;
ALTER TABLE "SessionVideoQuestion" DROP CONSTRAINT IF EXISTS "SessionVideoQuestion_points_check";
ALTER TABLE "QuizQuestion" DROP CONSTRAINT IF EXISTS "QuizQuestion_points_check";
ALTER TABLE "Session" DROP CONSTRAINT IF EXISTS "Session_durationMinutes_check";
ALTER TABLE "Season" DROP CONSTRAINT IF EXISTS "Season_absenceMinutes_check";
ALTER TABLE "Season" DROP CONSTRAINT IF EXISTS "Season_endDate_check";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261110090000_integrity_guards';
COMMIT;
