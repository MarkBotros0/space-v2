-- Refactor Wave 3, IDX-4 (docs/refactor-audit.md §2.11): the daily follow-up
-- reminder (lib/follow-ups.ts) reads only open, not-yet-reminded follow-ups by
-- due time; this partial index holds just those rows. SQL-only: schema.prisma
-- cannot express a partial index without a preview feature, so it is documented
-- there instead. Additive. CONCURRENTLY, so no transaction (D10).
CREATE INDEX CONCURRENTLY IF NOT EXISTS "MentorFollowUp_due_open_idx" ON "MentorFollowUp" ("dueAt") WHERE "doneAt" IS NULL AND "remindedAt" IS NULL;
