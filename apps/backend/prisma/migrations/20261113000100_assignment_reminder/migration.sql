-- Multi-part assignments: the assignment's reminder. `reminderDays` before the anchor (the season's
-- next session, or the due date) at `reminderTime` (HH:MM, Cairo); the app resolves `remindAt` on
-- save and the scheduler's sweep sets `remindedAt` when it sends. The partial index holds only the
-- rows that sweep reads. Additive.
BEGIN;

CREATE TYPE "ReminderAnchor" AS ENUM ('NEXT_SESSION', 'DUE_DATE');

ALTER TABLE "Assignment"
    ADD COLUMN "reminderEnabled" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "reminderDays" INTEGER NOT NULL DEFAULT 2,
    ADD COLUMN "reminderAnchor" "ReminderAnchor" NOT NULL DEFAULT 'NEXT_SESSION',
    ADD COLUMN "reminderTime" TEXT NOT NULL DEFAULT '09:00',
    ADD COLUMN "remindAt" TIMESTAMPTZ(3),
    ADD COLUMN "remindedAt" TIMESTAMPTZ(3),
    ADD CONSTRAINT "Assignment_reminderDays_check" CHECK ("reminderDays" BETWEEN 1 AND 14),
    ADD CONSTRAINT "Assignment_reminderTime_check" CHECK ("reminderTime" ~ '^[0-2][0-9]:[0-5][0-9]$');

CREATE INDEX "Assignment_remind_due_idx" ON "Assignment"("remindAt") WHERE "remindedAt" IS NULL AND "deletedAt" IS NULL;

COMMIT;
