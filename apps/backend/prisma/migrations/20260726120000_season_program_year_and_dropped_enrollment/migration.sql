-- Season: split the "PROGRAM YEAR" display title into structured program/year
-- columns so a program (e.g. "GBV") can be browsed across its year history.
ALTER TABLE "Season" ADD COLUMN "program" TEXT;
ALTER TABLE "Season" ADD COLUMN "year" INTEGER;

-- Backfill from the existing title (e.g. "GBV 2026" -> program "GBV", year 2026).
-- Falls back to startDate's year / the full title when a title doesn't end in a year.
UPDATE "Season" SET
  "year" = COALESCE((regexp_match(title, '(\d{4})\s*$'))[1]::int, EXTRACT(YEAR FROM "startDate")::int),
  "program" = COALESCE(NULLIF(trim(regexp_replace(title, '[\s-]*\d{4}\s*$', '')), ''), title);

ALTER TABLE "Season" ALTER COLUMN "program" SET NOT NULL;
ALTER TABLE "Season" ALTER COLUMN "year" SET NOT NULL;

CREATE INDEX "Season_program_year_idx" ON "Season"("program", "year");

-- SeasonEnrollment: track when/why a student dropped (status transitions to WITHDRAWN).
ALTER TABLE "SeasonEnrollment" ADD COLUMN "droppedAt" TIMESTAMP(3);
ALTER TABLE "SeasonEnrollment" ADD COLUMN "dropReason" TEXT;
