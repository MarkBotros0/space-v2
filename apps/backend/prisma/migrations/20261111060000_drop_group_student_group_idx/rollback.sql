-- Rollback for 20261111060000_drop_group_student_group_idx (D6). Run with psql, one statement at a time.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "GroupStudent_groupId_idx" ON "GroupStudent" ("groupId");
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261111060000_drop_group_student_group_idx';
