-- Multi-part assignments: the assignment reminder's notification type. It shares the
-- `assignmentCreated` preference, so no column is added. Additive.
--
-- ADD VALUE inside a transaction needs PostgreSQL 12+; the new value is not used in this
-- transaction, which is the only other restriction.
BEGIN;

ALTER TYPE "NotificationType" ADD VALUE 'ASSIGNMENT_REMINDER';

COMMIT;
