-- Rollback for 20261111040000_refresh_token_user_agent (D6). Run with psql. Restores the column, not its data.
BEGIN;
ALTER TABLE "RefreshToken" ADD COLUMN "userAgent" text;
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261111040000_refresh_token_user_agent';
COMMIT;
