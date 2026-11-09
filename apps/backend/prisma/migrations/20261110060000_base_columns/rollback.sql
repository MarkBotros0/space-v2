-- Rollback for 20261110060000_base_columns (D6). Run with psql. The columns' values are lost.
BEGIN;
ALTER TABLE "MentorFollowUp" DROP COLUMN IF EXISTS "updatedAt";
ALTER TABLE "SessionVideoProgress" DROP COLUMN IF EXISTS "createdAt";
ALTER TABLE "AnnouncementPoll" DROP COLUMN IF EXISTS "updatedAt";
ALTER TABLE "AnnouncementPollOption" DROP COLUMN IF EXISTS "createdAt", DROP COLUMN IF EXISTS "updatedAt";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261110060000_base_columns';
COMMIT;
