-- Rollback for 20261111070000_drop_mentor_follow_up_due_idx (D6). Run with psql, one statement at a time.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "MentorFollowUp_dueAt_idx" ON "MentorFollowUp" ("dueAt");
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261111070000_drop_mentor_follow_up_due_idx';
