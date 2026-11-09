-- Refactor Wave 3, IDX-8 + DB-029 (docs/refactor-audit.md §2.6, §2.11): a vote's
-- pollId is its option's pollId. The code always takes it from the locked poll
-- row and refuses an option from another poll (poll-vote.ts, 400 bad_request),
-- so this only makes the database enforce what the code already guarantees, as
-- GroupStudent's (groupId, seasonId) FK does for Group.
--
-- The composite FK replaces the optionId FK; both cascade on delete and update,
-- so deleting an option still deletes its votes.
--
-- Count before applying (votes that disagree with their option; expect 0):
--   SELECT count(*) FROM "AnnouncementPollVote" v JOIN "AnnouncementPollOption" o
--   ON o."id" = v."optionId" WHERE o."pollId" <> v."pollId";
BEGIN;

-- D9: a vote that disagrees with its option's poll is deleted, not repaired.
DELETE FROM "AnnouncementPollVote" v
USING "AnnouncementPollOption" o
WHERE o."id" = v."optionId" AND o."pollId" <> v."pollId";

CREATE UNIQUE INDEX "AnnouncementPollOption_id_pollId_key" ON "AnnouncementPollOption"("id", "pollId");

ALTER TABLE "AnnouncementPollVote" DROP CONSTRAINT "AnnouncementPollVote_optionId_fkey";
ALTER TABLE "AnnouncementPollVote" ADD CONSTRAINT "AnnouncementPollVote_optionId_pollId_fkey"
  FOREIGN KEY ("optionId", "pollId") REFERENCES "AnnouncementPollOption"("id", "pollId")
  ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;

COMMIT;

-- Outside the transaction (D10): checks the existing rows without blocking writes.
ALTER TABLE "AnnouncementPollVote" VALIDATE CONSTRAINT "AnnouncementPollVote_optionId_pollId_fkey";
