-- Refactor Wave 3, DB-004 (docs/refactor-audit.md, Q15 with D9): every stored
-- email is trimmed and lowercased, then a CHECK keeps it that way. With the
-- existing unique on "email", that makes addresses unique ignoring case.
--
-- Every write path already trims and lowercases (the shared Zod schemas, the CSV
-- importer, create-super-admin), so the running build never trips the CHECK.
--
-- If two accounts differ only in case, the UPDATE hits the unique index and the
-- whole migration fails, changing nothing: resolve that pair by hand first.
-- `pnpm check:wave-3` lists such pairs.
BEGIN;

UPDATE "User" SET "email" = lower(trim("email")) WHERE "email" <> lower(trim("email"));

ALTER TABLE "User" ADD CONSTRAINT "User_email_lowercase_check" CHECK ("email" = lower("email"));

COMMIT;
