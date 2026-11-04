-- Plan 18 M13: User.sessionsValidFrom (v2-only schema, owner ruling
-- 2026-11-04). Additive. The statement is exactly what `prisma migrate diff`
-- produces between the previous schema and this one.
--
-- requireAuth refuses an access token issued (iat) before this instant, so
-- logout-all, a password change or reset, deactivation and a role change end
-- every outstanding access token at once instead of within its 900 s TTL.
-- No backfill: null means "nothing has been invalidated", which is true of
-- every user today, and null passes the check.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "sessionsValidFrom" TIMESTAMP(3);
