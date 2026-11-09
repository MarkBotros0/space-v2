-- Rollback for 20261110100000_value_guards (D6). Run with psql. Fixed rows are not restored.
BEGIN;
ALTER TABLE "SessionVideoQuestion" DROP CONSTRAINT IF EXISTS "SessionVideoQuestion_correctIndex_check";
ALTER TABLE "Assignment" DROP CONSTRAINT IF EXISTS "Assignment_allowedMimeCategories_check";
ALTER TABLE "QuizAttempt" DROP CONSTRAINT IF EXISTS "QuizAttempt_totalScore_check";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261110100000_value_guards';
COMMIT;
