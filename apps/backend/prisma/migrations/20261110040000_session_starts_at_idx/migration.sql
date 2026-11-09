-- Refactor Wave 3, IDX-5 (docs/refactor-audit.md §2.11): the cross-season
-- calendar reads sessions by time range alone; (seasonId, startsAt) leads with
-- seasonId and can't serve it. Additive. CONCURRENTLY, so no transaction (D10).
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Session_startsAt_idx" ON "Session" ("startsAt");
