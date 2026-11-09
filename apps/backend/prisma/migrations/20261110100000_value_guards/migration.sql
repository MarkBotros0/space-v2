-- Refactor Wave 3, DB-016 + DB-017 (docs/refactor-audit.md §2.6, §2.9, Q20 with D9):
-- stored values the code keeps consistent, now also checked by the database.
-- Violating rows are fixed first, in the same transaction (D9).
--
--   QuizAttempt   totalScore is null or autoScore + manualScore (attempts.ts,
--                 grading.ts always write it that way); mismatches are recomputed
--   Assignment    allowedMimeCategories only from the Zod enum; unknown values removed
--   SessionVideoQuestion  correctIndex an index into options (Zod: < options.length);
--                 an out-of-range one becomes 0, a question with no options is deleted
--
-- Not here (D8):
--   QuizQuestion.correctIndex: the publish route deliberately re-checks an
--   out-of-range answer key (R24) and its test builds one; a CHECK would make that
--   guard dead code, which is Wave 4's call.
--   Session.recurrenceGroupId -> uuid: the ids come from newPublicId()
--   (lib/public-id.ts), which is not a UUID, so the column stays text.
--
-- `pnpm check:wave-3` counts each rule's violating rows before deploy.
BEGIN;

UPDATE "QuizAttempt" SET "totalScore" = COALESCE("autoScore", 0) + COALESCE("manualScore", 0)
WHERE "totalScore" IS NOT NULL AND "totalScore" <> COALESCE("autoScore", 0) + COALESCE("manualScore", 0);

UPDATE "Assignment" SET "allowedMimeCategories" = ARRAY(
  SELECT c FROM unnest("allowedMimeCategories") AS c
  WHERE c = ANY (ARRAY['image', 'pdf', 'doc', 'audio', 'video', 'text'])
)
WHERE NOT ("allowedMimeCategories" <@ ARRAY['image', 'pdf', 'doc', 'audio', 'video', 'text']);

DELETE FROM "SessionVideoQuestion" WHERE cardinality("options") = 0;
UPDATE "SessionVideoQuestion" SET "correctIndex" = 0
WHERE "correctIndex" < 0 OR "correctIndex" >= cardinality("options");

ALTER TABLE "QuizAttempt" ADD CONSTRAINT "QuizAttempt_totalScore_check"
  CHECK ("totalScore" IS NULL OR "totalScore" = COALESCE("autoScore", 0) + COALESCE("manualScore", 0)) NOT VALID;
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_allowedMimeCategories_check"
  CHECK ("allowedMimeCategories" <@ ARRAY['image', 'pdf', 'doc', 'audio', 'video', 'text']) NOT VALID;
ALTER TABLE "SessionVideoQuestion" ADD CONSTRAINT "SessionVideoQuestion_correctIndex_check"
  CHECK ("correctIndex" >= 0 AND "correctIndex" < cardinality("options")) NOT VALID;

COMMIT;

-- Outside the transaction (D10): validate without a long write lock.
ALTER TABLE "QuizAttempt" VALIDATE CONSTRAINT "QuizAttempt_totalScore_check";
ALTER TABLE "Assignment" VALIDATE CONSTRAINT "Assignment_allowedMimeCategories_check";
ALTER TABLE "SessionVideoQuestion" VALIDATE CONSTRAINT "SessionVideoQuestion_correctIndex_check";
