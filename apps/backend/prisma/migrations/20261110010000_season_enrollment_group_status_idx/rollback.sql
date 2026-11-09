-- Rollback for 20261110010000_season_enrollment_group_status_idx (D6). Run with psql.
DROP INDEX CONCURRENTLY IF EXISTS "SeasonEnrollment_groupId_status_idx";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261110010000_season_enrollment_group_status_idx';
