-- Rollback for 20261112030000_quiz_scores_decimal (D6). Run with psql. Fractional marks are
-- rounded (half away from zero). totalScore is rebuilt from the two rounded parts, not rounded
-- itself, so QuizAttempt_totalScore_check (total = auto + manual) still holds; the USING
-- expressions read the values from before the change.
BEGIN;

ALTER TABLE "QuizAttempt"
  ALTER COLUMN "autoScore" SET DATA TYPE INTEGER USING round("autoScore")::integer,
  ALTER COLUMN "manualScore" SET DATA TYPE INTEGER USING round("manualScore")::integer,
  ALTER COLUMN "totalScore" SET DATA TYPE INTEGER USING (
    CASE WHEN "totalScore" IS NULL THEN NULL
    ELSE round(COALESCE("autoScore", 0)) + round(COALESCE("manualScore", 0))
    END
  )::integer;

ALTER TABLE "QuizAnswer" ALTER COLUMN "pointsAwarded" SET DATA TYPE INTEGER USING round("pointsAwarded")::integer;

DELETE FROM "_prisma_migrations" WHERE migration_name = '20261112030000_quiz_scores_decimal';
COMMIT;
