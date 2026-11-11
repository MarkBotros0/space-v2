-- Rollback for 20261114010000_quiz_attempt_events. Run with psql.
BEGIN;
DROP TABLE "QuizAttemptEvent";
DROP TYPE "QuizAttemptEventKind";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261114010000_quiz_attempt_events';
COMMIT;
