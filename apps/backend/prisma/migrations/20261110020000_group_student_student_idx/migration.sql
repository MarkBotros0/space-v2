-- Refactor Wave 3, IDX-2 (docs/refactor-audit.md §2.11): GroupStudent is kept (Q14),
-- and its reads by student (the studentUserId FK, "which group is this student in")
-- had no index of their own: the unique (seasonId, studentUserId) leads with seasonId.
-- Additive. CONCURRENTLY, so no transaction (D10); IF NOT EXISTS makes a retry safe.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "GroupStudent_studentUserId_idx" ON "GroupStudent" ("studentUserId");
