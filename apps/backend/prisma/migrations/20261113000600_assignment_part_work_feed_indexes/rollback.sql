-- Rollback for 20261113000600_assignment_part_work_feed_indexes (D6). Run with psql.
BEGIN;
DROP INDEX "AssignmentPartWork_reviewed_idx";
DROP INDEX "AssignmentPartWork_queue_idx";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261113000600_assignment_part_work_feed_indexes';
COMMIT;
