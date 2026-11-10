-- Rollback for 20261112010000_quiz_question_type_values (D6). Run with psql.
-- PostgreSQL can't drop an enum value without recreating the type and every column using it,
-- so the five values stay; nothing reads them once the code that writes them is rolled back.
-- Roll back 20261112040000 first: it turns SINGLE_CHOICE questions back into MCQ.
-- Only the migration record is removed, so applying the migration again is a no-op (IF NOT EXISTS).
BEGIN;
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261112010000_quiz_question_type_values';
COMMIT;
