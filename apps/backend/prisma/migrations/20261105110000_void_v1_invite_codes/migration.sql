-- Plan 18 M12: v1's plaintext invite codes are voided (v2-only schema, owner
-- ruling 2026-11-04).
--
-- Data only: no schema change, so `prisma migrate diff` between the previous
-- schema and this one is empty and this file holds no DDL.
--
-- v1 stored its 32-character invite code raw in "InviteToken"."token"; v2
-- stores only the SHA-256 hex digest (64 lowercase hex) and looks invites up
-- by digest, so a v1 code can never be accepted by v2. The plaintext is still
-- a secret at rest, so it is overwritten. 'v1-void-<id>' is unique (ids are),
-- non-null, can never equal a SHA-256 hex digest and fails isV2InviteDigest,
-- so every row keeps its history (userId, invitedById, usedAt, expiresAt,
-- createdAt) and every reader behaves exactly as before: a v1 row already
-- counted as "no working invite" for the bulk re-invite, and still does.
--
-- One-way by design: the old codes are not recoverable, and were unusable.
-- Idempotent: rows already voided are skipped.
--
-- Count before applying (rows to void; people still waiting on one):
--   SELECT count(*) FROM "InviteToken" WHERE "token" !~ '^[0-9a-f]{64}$' AND "token" !~ '^v1-void-[0-9]+$';
-- Verification after applying (expect 0):
--   SELECT count(*) FROM "InviteToken" WHERE "token" !~ '^[0-9a-f]{64}$' AND "token" !~ '^v1-void-[0-9]+$';
BEGIN;

-- DATA
UPDATE "InviteToken"
   SET "token" = 'v1-void-' || "id"
 WHERE "token" !~ '^[0-9a-f]{64}$'
   AND "token" !~ '^v1-void-[0-9]+$';

COMMIT;
