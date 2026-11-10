-- Refactor Wave 6, DB-003 (docs/refactor-audit.md §2.2): StudentDocument, a v1 table v2 never reads
-- or writes. Its sequence, index and both FKs go with it. Contract step (D9: v1's rows are lost; the
-- files they named were never in v2's storage).
BEGIN;

DROP TABLE "StudentDocument";

COMMIT;
