-- Quiz question types, backfill (plan docs/superpowers/plans/2026-11-10-quiz-question-types.md
-- Task 1). Every MCQ question becomes SINGLE_CHOICE: options[i] becomes a QuizOption at
-- position i, correct when i = correctIndex; every answer's selectedIndex becomes a
-- QuizAnswerSelection of the option at that position. The legacy columns keep their values
-- (a later contract migration drops them). Attempts that predate the shuffle get a seed.
--
-- `pnpm check:quiz-types` counts, before deploy, what does not copy cleanly: a missing or
-- out-of-range correctIndex (the question gets no correct option), a selectedIndex past the
-- options (the answer gets no selection), a question with fewer than two options.
-- Needs 20261112010000 committed first (it adds SINGLE_CHOICE).
BEGIN;

INSERT INTO "QuizOption" ("questionId", "position", "label", "isCorrect", "createdAt", "updatedAt")
SELECT q."id", o.ord - 1, o.label, COALESCE(o.ord - 1 = q."correctIndex", false), q."createdAt", q."updatedAt"
FROM "QuizQuestion" q
CROSS JOIN LATERAL unnest(q."options") WITH ORDINALITY AS o(label, ord)
WHERE q."type" = 'MCQ';

INSERT INTO "QuizAnswerSelection" ("answerId", "optionId", "createdAt", "updatedAt")
SELECT a."id", o."id", a."createdAt", a."updatedAt"
FROM "QuizAnswer" a
JOIN "QuizQuestion" q ON q."id" = a."questionId"
JOIN "QuizOption" o ON o."questionId" = q."id" AND o."position" = a."selectedIndex"
WHERE q."type" = 'MCQ' AND a."selectedIndex" IS NOT NULL;

UPDATE "QuizQuestion" SET "type" = 'SINGLE_CHOICE' WHERE "type" = 'MCQ';

UPDATE "QuizAttempt" SET "shuffleSeed" = floor(random() * 2147483647)::integer WHERE "shuffleSeed" = 0;

COMMIT;
