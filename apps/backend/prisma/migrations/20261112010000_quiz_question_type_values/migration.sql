-- Quiz question types (docs/superpowers/specs/2026-11-10-quiz-question-types-and-integrity-design.md,
-- plan docs/superpowers/plans/2026-11-10-quiz-question-types.md Task 1). Additive.
--
-- ALTER TYPE ... ADD VALUE stays in a file of its own with no BEGIN: a new value can't be
-- used in the transaction that adds it, and 20261112040000 uses SINGLE_CHOICE. IF NOT EXISTS
-- lets the migration be applied again after its rollback (a value can't be dropped).
-- MCQ stays in the enum; no row uses it after 20261112040000.
ALTER TYPE "QuizQuestionType" ADD VALUE IF NOT EXISTS 'SINGLE_CHOICE';
ALTER TYPE "QuizQuestionType" ADD VALUE IF NOT EXISTS 'MULTI_CHOICE';
ALTER TYPE "QuizQuestionType" ADD VALUE IF NOT EXISTS 'TRUE_FALSE';
ALTER TYPE "QuizQuestionType" ADD VALUE IF NOT EXISTS 'MATCHING';
ALTER TYPE "QuizQuestionType" ADD VALUE IF NOT EXISTS 'FILL_BLANK';
