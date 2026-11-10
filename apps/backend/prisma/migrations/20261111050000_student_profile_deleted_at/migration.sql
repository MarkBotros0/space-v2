-- Refactor Wave 6, DB-010 (docs/refactor-audit.md §2.3): StudentProfile.deletedAt duplicated
-- User.deletedAt and nothing has read or written it since Wave 4. User.deletedAt is the soft delete.
-- Contract step (D9).
BEGIN;

ALTER TABLE "StudentProfile" DROP COLUMN "deletedAt";

COMMIT;
