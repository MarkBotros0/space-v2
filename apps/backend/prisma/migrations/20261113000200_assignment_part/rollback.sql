-- Rollback for 20261113000200_assignment_part (D6). Run with psql, after 20261113000300's and
-- 20261113000400's rollbacks (they reference this table).
BEGIN;
DROP TABLE "AssignmentPart";
DROP TYPE "AssignmentPartKind";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261113000200_assignment_part';
COMMIT;
