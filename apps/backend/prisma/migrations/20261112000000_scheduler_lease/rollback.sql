-- Rollback for 20261112000000_scheduler_lease.
BEGIN;
DROP TABLE "SchedulerLease";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261112000000_scheduler_lease';
COMMIT;
