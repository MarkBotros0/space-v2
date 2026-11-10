-- Refactor Wave 6, IDX-D1 (docs/refactor-audit.md §2.12): GroupStudent_groupId_idx is a strict
-- prefix of GroupStudent_pkey (groupId, studentUserId), which serves every read by group and the
-- composite FK to Group. CONCURRENTLY, so no transaction and one statement per file (D10: Postgres
-- runs a multi-statement file as one transaction block); IF EXISTS makes a retry safe.
DROP INDEX CONCURRENTLY IF EXISTS "GroupStudent_groupId_idx";
