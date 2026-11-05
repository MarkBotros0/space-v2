-- Three notification types and their preference columns (v2-only schema,
-- owner ruling 2026-11-04). Additive. The statements are exactly what
-- `prisma migrate diff` produces between the previous schema and this one.
--
-- ADD VALUE inside a transaction needs PostgreSQL 12+; the new values are not
-- used in this migration, which is the only other restriction.

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'QUIZ_PUBLISHED';
ALTER TYPE "NotificationType" ADD VALUE 'SUBMISSION_RECEIVED';
ALTER TYPE "NotificationType" ADD VALUE 'SESSION_CANCELLED';

-- AlterTable
ALTER TABLE "NotificationPreference" ADD COLUMN     "quizPublished" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "sessionCancelled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "submissionReceived" BOOLEAN NOT NULL DEFAULT true;
