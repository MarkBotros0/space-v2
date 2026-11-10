-- Rollback for 20261112020000_quiz_option_blank_rows (D6). Run with psql, after the rollback of
-- 20261112040000 and 20261112030000. Drops the rows written since (options, blanks and answers
-- to them) and the shuffle settings; the legacy options / correctIndex / selectedIndex columns
-- still hold what 20261112040000 copied from them.
BEGIN;
DROP TABLE "QuizAnswerBlank";
DROP TABLE "QuizAnswerSelection";
DROP TABLE "QuizBlank";
DROP TABLE "QuizOption";
DROP TYPE "QuizOptionSide";
ALTER TABLE "QuizAttempt" DROP COLUMN "shuffleSeed";
ALTER TABLE "Quiz" DROP COLUMN "shuffleQuestions";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261112020000_quiz_option_blank_rows';
COMMIT;
