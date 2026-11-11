-- Rollback for 20261113000100_assignment_reminder (D6). Run with psql.
BEGIN;
DROP INDEX "Assignment_remind_due_idx";
ALTER TABLE "Assignment"
    DROP CONSTRAINT "Assignment_reminderDays_check",
    DROP CONSTRAINT "Assignment_reminderTime_check",
    DROP COLUMN "reminderEnabled",
    DROP COLUMN "reminderDays",
    DROP COLUMN "reminderAnchor",
    DROP COLUMN "reminderTime",
    DROP COLUMN "remindAt",
    DROP COLUMN "remindedAt";
DROP TYPE "ReminderAnchor";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261113000100_assignment_reminder';
COMMIT;
