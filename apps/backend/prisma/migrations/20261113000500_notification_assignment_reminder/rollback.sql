-- Rollback for 20261113000500_notification_assignment_reminder. Run with psql.
-- Postgres cannot drop an enum value, so the type is recreated without it. The reminders
-- already sent go with it: their rows could not be read back as any other type.
BEGIN;
DELETE FROM "Notification" WHERE "type" = 'ASSIGNMENT_REMINDER';
ALTER TYPE "NotificationType" RENAME TO "NotificationType_old";
CREATE TYPE "NotificationType" AS ENUM (
    'ASSIGNMENT_CREATED',
    'SUBMISSION_REVIEWED',
    'SESSION_RESCHEDULED',
    'LOW_ATTENDANCE_FLAG',
    'MENTOR_FOLLOWUP',
    'QUIZ_GRADED',
    'QUIZ_PUBLISHED',
    'SUBMISSION_RECEIVED',
    'SESSION_CANCELLED',
    'ANNOUNCEMENT'
);
ALTER TABLE "Notification" ALTER COLUMN "type" TYPE "NotificationType" USING "type"::text::"NotificationType";
DROP TYPE "NotificationType_old";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261113000500_notification_assignment_reminder';
COMMIT;
