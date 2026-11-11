-- Rollback for 20261113010000_quiz_timing. Run with psql.
BEGIN;
DROP INDEX "QuizAttempt_deadline_open_idx";
ALTER TABLE "QuizAttempt"
  DROP CONSTRAINT "QuizAttempt_endedById_fkey",
  DROP COLUMN "endedById",
  DROP COLUMN "endReason",
  DROP COLUMN "deadlineAt";
ALTER TABLE "Quiz"
  DROP CONSTRAINT "Quiz_start_window_check",
  DROP CONSTRAINT "Quiz_timeLimitMinutes_check",
  DROP COLUMN "timeLimitMinutes",
  DROP COLUMN "startsUntil",
  DROP COLUMN "startsFrom";
DROP TYPE "QuizAttemptEndReason";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261113010000_quiz_timing';
COMMIT;
