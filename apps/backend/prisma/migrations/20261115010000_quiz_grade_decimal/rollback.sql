-- Rollback for 20261115010000_quiz_grade_decimal. Run with psql.
-- Rounds any decimal score half-up back to a whole number.
BEGIN;
ALTER TABLE "QuizGrade" ALTER COLUMN "score" TYPE INTEGER USING ROUND("score")::INTEGER;
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261115010000_quiz_grade_decimal';
COMMIT;
