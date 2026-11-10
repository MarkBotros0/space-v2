-- Refactor Wave 6, IDX-D3 (docs/refactor-audit.md §2.12): MentorFollowUp_dueAt_idx is superseded by
-- the partial MentorFollowUp_due_open_idx (IDX-4, Wave 3), which serves the reminder sweep; a
-- mentor's own list reads through MentorFollowUp_mentorUserId_doneAt_idx. CONCURRENTLY, one
-- statement per file (D10); IF EXISTS makes a retry safe.
DROP INDEX CONCURRENTLY IF EXISTS "MentorFollowUp_dueAt_idx";
