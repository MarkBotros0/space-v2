-- Refactor Wave 6, DB-006 (docs/refactor-audit.md §2.2): RefreshToken.userAgent, identifying data no
-- screen reads; nothing writes it since Wave 4. Contract step (D9).
BEGIN;

ALTER TABLE "RefreshToken" DROP COLUMN "userAgent";

COMMIT;
