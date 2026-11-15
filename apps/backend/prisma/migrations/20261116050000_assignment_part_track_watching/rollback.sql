BEGIN;
ALTER TABLE "AssignmentPart" DROP COLUMN "trackWatching";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261116050000_assignment_part_track_watching';
COMMIT;
