-- Rollback for 20261110020000_group_student_student_idx (D6). Run with psql.
DROP INDEX CONCURRENTLY IF EXISTS "GroupStudent_studentUserId_idx";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261110020000_group_student_student_idx';
