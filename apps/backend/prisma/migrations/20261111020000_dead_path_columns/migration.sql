-- Refactor Wave 6, DB-002 (docs/refactor-audit.md §2.2): three file-path columns no code reads or
-- writes (uploads move to a CMS, which gets its own columns when it lands). Contract step (D9).
BEGIN;

ALTER TABLE "Season" DROP COLUMN "coverImagePath";
ALTER TABLE "Session" DROP COLUMN "materialsPath";
ALTER TABLE "JpcEvent" DROP COLUMN "imagePath";

COMMIT;
