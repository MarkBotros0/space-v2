-- Refactor Wave 3, IDX-1 (docs/refactor-audit.md §2.11): enrolments by group,
-- usually filtered by status (15 read sites, e.g. lib/quiz-scope.ts, groups/read.ts);
-- also covers the groupId FK's ON DELETE SET NULL. Additive.
-- CONCURRENTLY, so no transaction (D10); IF NOT EXISTS makes a retry safe.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SeasonEnrollment_groupId_status_idx" ON "SeasonEnrollment" ("groupId", "status");
