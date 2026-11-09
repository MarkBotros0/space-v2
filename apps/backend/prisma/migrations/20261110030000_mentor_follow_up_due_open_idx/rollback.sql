-- Rollback for 20261110030000_mentor_follow_up_due_open_idx (D6). Run with psql.
DROP INDEX CONCURRENTLY IF EXISTS "MentorFollowUp_due_open_idx";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261110030000_mentor_follow_up_due_open_idx';
