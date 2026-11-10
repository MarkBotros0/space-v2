-- Refactor Wave 6, DB-001 + IDX-D2 (docs/refactor-audit.md §2.2): StudentProfile's dead columns.
-- activeSeasonId (scopes are derived from SeasonEnrollment since Build 1; nothing reads or writes it),
-- year, phone, dateOfBirth (the User columns are the live ones), spiritualBackground, gifts and
-- photoPath (dropped from the product 2026-11-06). Their FK and index go with them.
-- Contract step: deploy only once no running build's Prisma client knows these columns (D9: the data
-- is lost; rollback.sql restores the columns empty).
BEGIN;

ALTER TABLE "StudentProfile" DROP CONSTRAINT "StudentProfile_activeSeasonId_fkey";
DROP INDEX "StudentProfile_activeSeasonId_idx";
ALTER TABLE "StudentProfile"
  DROP COLUMN "activeSeasonId",
  DROP COLUMN "year",
  DROP COLUMN "phone",
  DROP COLUMN "dateOfBirth",
  DROP COLUMN "spiritualBackground",
  DROP COLUMN "gifts",
  DROP COLUMN "photoPath";

COMMIT;
