-- Rollback for 20261112040000_quiz_backfill_options (D6). Run with psql, before the rollbacks of
-- 20261112030000 and 20261112020000. A former MCQ question is a SINGLE_CHOICE one with legacy
-- options (questions written after the deploy leave options empty): its option rows go (their
-- selections by cascade) and it is MCQ again, its legacy columns untouched. Not restored: an
-- MCQ question that had no options stays SINGLE_CHOICE, and the attempts keep their seeds.
BEGIN;

DELETE FROM "QuizOption" o
USING "QuizQuestion" q
WHERE o."questionId" = q."id" AND q."type" = 'SINGLE_CHOICE' AND cardinality(q."options") > 0;

UPDATE "QuizQuestion" SET "type" = 'MCQ' WHERE "type" = 'SINGLE_CHOICE' AND cardinality("options") > 0;

DELETE FROM "_prisma_migrations" WHERE migration_name = '20261112040000_quiz_backfill_options';
COMMIT;
