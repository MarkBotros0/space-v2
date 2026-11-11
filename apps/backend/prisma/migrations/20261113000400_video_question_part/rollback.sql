-- Rollback for 20261113000400_video_question_part (D6). Run with psql. A part's questions (and,
-- by cascade, their responses) are deleted: a session question must have its session.
BEGIN;
DELETE FROM "SessionVideoQuestion" WHERE "sessionId" IS NULL;
ALTER TABLE "SessionVideoQuestion"
    DROP CONSTRAINT "SessionVideoQuestion_owner_check",
    DROP COLUMN "assignmentPartId",
    ALTER COLUMN "sessionId" SET NOT NULL;
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261113000400_video_question_part';
COMMIT;
