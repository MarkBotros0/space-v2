-- Quiz question types, decimal marks (plan docs/superpowers/plans/2026-11-10-quiz-question-types.md
-- Task 1): partial credit on multi-choice, matching and blank questions awards fractions of a
-- question's points, so awarded points and attempt scores are stored to two places.
-- QuizQuestion.points, Quiz.maxScore and QuizGrade.score stay whole numbers.
--
-- Every integer converts exactly. QuizAttempt_totalScore_check (20261110100000) compares the
-- same columns and keeps holding on numeric; PostgreSQL rechecks it during the rewrite.
-- Cost: one rewrite of QuizAttempt and of QuizAnswer under ACCESS EXCLUSIVE.
BEGIN;

ALTER TABLE "QuizAttempt"
  ALTER COLUMN "autoScore" SET DATA TYPE DECIMAL(8,2),
  ALTER COLUMN "manualScore" SET DATA TYPE DECIMAL(8,2),
  ALTER COLUMN "totalScore" SET DATA TYPE DECIMAL(8,2);

ALTER TABLE "QuizAnswer" ALTER COLUMN "pointsAwarded" SET DATA TYPE DECIMAL(8,2);

COMMIT;
