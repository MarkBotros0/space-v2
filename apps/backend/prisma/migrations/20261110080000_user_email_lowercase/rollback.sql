-- Rollback for 20261110080000_user_email_lowercase (D6). Run with psql. Emails stay lowercased.
BEGIN;
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_email_lowercase_check";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261110080000_user_email_lowercase';
COMMIT;
