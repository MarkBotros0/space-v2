-- Rollback for 20261111020000_dead_path_columns (D6). Run with psql. Restores the columns, not their data.
BEGIN;
ALTER TABLE "Season" ADD COLUMN "coverImagePath" text;
ALTER TABLE "Session" ADD COLUMN "materialsPath" text;
ALTER TABLE "JpcEvent" ADD COLUMN "imagePath" text;
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261111020000_dead_path_columns';
COMMIT;
