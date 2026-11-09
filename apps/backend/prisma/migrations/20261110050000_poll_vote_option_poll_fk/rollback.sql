-- Rollback for 20261110050000_poll_vote_option_poll_fk (D6). Run with psql. Votes deleted by the cleanup are not restored.
BEGIN;
ALTER TABLE "AnnouncementPollVote" DROP CONSTRAINT IF EXISTS "AnnouncementPollVote_optionId_pollId_fkey";
ALTER TABLE "AnnouncementPollVote" ADD CONSTRAINT "AnnouncementPollVote_optionId_fkey"
  FOREIGN KEY ("optionId") REFERENCES "AnnouncementPollOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;
DROP INDEX IF EXISTS "AnnouncementPollOption_id_pollId_key";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261110050000_poll_vote_option_poll_fk';
COMMIT;
