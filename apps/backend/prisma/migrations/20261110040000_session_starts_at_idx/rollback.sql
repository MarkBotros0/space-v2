-- Rollback for 20261110040000_session_starts_at_idx (D6). Run with psql.
DROP INDEX CONCURRENTLY IF EXISTS "Session_startsAt_idx";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261110040000_session_starts_at_idx';
