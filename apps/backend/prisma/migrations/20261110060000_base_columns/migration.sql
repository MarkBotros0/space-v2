-- Refactor Wave 3, DB-021 + DB-030 (docs/refactor-audit.md §2.7, Q4): the missing
-- createdAt / updatedAt on tables whose rows are created and then updated.
--   MentorFollowUp          + updatedAt  (remindedAt, doneAt change)
--   SessionVideoProgress    + createdAt  (had updatedAt only)
--   AnnouncementPoll        + updatedAt  (closedAt, version change)
--   AnnouncementPollOption  + createdAt, updatedAt (label, position change)
-- Every column has a default, so the build that is already running (whose
-- client doesn't know them) keeps inserting. Existing rows get the time this
-- migration runs, not their real creation time. A constant default, so
-- PostgreSQL adds the columns without rewriting the tables.
BEGIN;

ALTER TABLE "MentorFollowUp" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "SessionVideoProgress" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "AnnouncementPoll" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "AnnouncementPollOption"
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

COMMIT;
