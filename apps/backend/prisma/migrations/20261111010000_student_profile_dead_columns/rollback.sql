-- Rollback for 20261111010000_student_profile_dead_columns (D6). Run with psql.
-- Restores the columns, FK and index; not their data.
BEGIN;
ALTER TABLE "StudentProfile"
  ADD COLUMN "activeSeasonId" integer,
  ADD COLUMN "year" text,
  ADD COLUMN "phone" text,
  ADD COLUMN "dateOfBirth" timestamp(3) with time zone,
  ADD COLUMN "spiritualBackground" text,
  ADD COLUMN "gifts" text,
  ADD COLUMN "photoPath" text;
CREATE INDEX "StudentProfile_activeSeasonId_idx" ON "StudentProfile" ("activeSeasonId");
ALTER TABLE "StudentProfile" ADD CONSTRAINT "StudentProfile_activeSeasonId_fkey"
  FOREIGN KEY ("activeSeasonId") REFERENCES "Season"(id) ON UPDATE CASCADE ON DELETE SET NULL;
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261111010000_student_profile_dead_columns';
COMMIT;
