-- Multi-part assignments (docs/superpowers/specs/2026-11-10-multi-part-assignments-design.md, "Data").
-- Planned destructive change, owner ruling 2026-11-10: the app is unpublished, so the existing
-- assignment data is not kept. An assignment no longer has one type, a session or group targets:
-- its kinds of work move to AssignmentPart (20261113000200), and it reaches the whole season.
BEGIN;

DELETE FROM "ForumComment";
DELETE FROM "SubmissionFile";
DELETE FROM "Submission";
DELETE FROM "AssignmentTarget";
DELETE FROM "Assignment";

DROP TABLE "AssignmentTarget";

ALTER TABLE "Assignment"
    DROP CONSTRAINT "Assignment_allowedMimeCategories_check",
    DROP COLUMN "sessionId",
    DROP COLUMN "type",
    DROP COLUMN "isAllGroups",
    DROP COLUMN "forumMinWords",
    DROP COLUMN "forumAllowComments",
    DROP COLUMN "forumPostToRead",
    DROP COLUMN "maxFileSizeMb",
    DROP COLUMN "allowedMimeCategories";

DROP TYPE "AssignmentType";

COMMIT;
