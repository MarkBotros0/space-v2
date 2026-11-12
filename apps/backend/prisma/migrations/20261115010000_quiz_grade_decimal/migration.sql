-- A QuizGrade score may carry two decimals (plan 4, owner 2026-11-12): an admin's
-- manual score on an online quiz, and a paper grade. Every whole number fits.
BEGIN;
ALTER TABLE "QuizGrade" ALTER COLUMN "score" TYPE DECIMAL(8,2);
COMMIT;
