-- Plan 18 M1: GroupStudent becomes season-scoped (v2-only schema, owner
-- ruling 2026-11-04).
--
-- Before: GroupStudent.studentUserId was unique on its own, so a student held
-- one group membership in the whole database and assigning them in a new
-- season destroyed the previous season's row. After: one row per student per
-- season, enforced by a unique on (seasonId, studentUserId). seasonId is
-- denormalised from Group.seasonId and pinned to it by a composite foreign key
-- to Group(id, seasonId), so it can never disagree with its group's season.
--
-- The DDL is exactly what `prisma migrate diff` produces between the previous
-- schema and this one, with one change: the diff adds "seasonId" as NOT NULL
-- in one statement, which fails on a non-empty table, so here it is added
-- nullable, backfilled, then made NOT NULL. The end state is identical.
-- Steps marked DATA are backfills the diff cannot produce; each is idempotent
-- (running it a second time changes nothing).
--
-- Atomic: everything below commits together or not at all.
BEGIN;

-- DropForeignKey (replaced by the composite key below)
ALTER TABLE "GroupStudent" DROP CONSTRAINT "GroupStudent_groupId_fkey";

-- DropIndex. Dropped BEFORE the DATA (c) insert: while it exists, a second
-- row for the same student (another season) is rejected.
DROP INDEX "GroupStudent_studentUserId_key";

-- AlterTable (nullable for now, see the header)
ALTER TABLE "GroupStudent" ADD COLUMN "seasonId" INTEGER;

-- DATA (a): every existing row takes its group's season. No row can be left
-- without one: GroupStudent.groupId is a non-null foreign key to Group and
-- Group.seasonId is non-null, so every existing row has exactly one season.
UPDATE "GroupStudent" gs
   SET "seasonId" = g."seasonId"
  FROM "Group" g
 WHERE g."id" = gs."groupId"
   AND gs."seasonId" IS DISTINCT FROM g."seasonId";

ALTER TABLE "GroupStudent" ALTER COLUMN "seasonId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Group_id_seasonId_key" ON "Group"("id", "seasonId");

-- CreateIndex. Cannot fail here: studentUserId was unique a moment ago, so
-- (seasonId, studentUserId) is too.
CREATE UNIQUE INDEX "GroupStudent_seasonId_studentUserId_key" ON "GroupStudent"("seasonId", "studentUserId");

-- AddForeignKey
ALTER TABLE "GroupStudent" ADD CONSTRAINT "GroupStudent_groupId_seasonId_fkey" FOREIGN KEY ("groupId", "seasonId") REFERENCES "Group"("id", "seasonId") ON DELETE CASCADE ON UPDATE CASCADE;

-- DATA (b), the repair: where the enrolment and the membership name DIFFERENT
-- groups of the same season, the enrolment wins (ruling C9 makes
-- SeasonEnrollment the authority). The join on g_se."seasonId" skips an
-- enrolment whose groupId points into ANOTHER season's group: that enrolment
-- is inconsistent on its own and is left for a person to fix (moving the
-- membership there would violate the composite key and abort the migration).
UPDATE "GroupStudent" gs
   SET "groupId" = se."groupId"
  FROM "SeasonEnrollment" se
  JOIN "Group" g_se ON g_se."id" = se."groupId" AND g_se."seasonId" = se."seasonId"
 WHERE se."studentUserId" = gs."studentUserId"
   AND se."seasonId"      = gs."seasonId"
   AND se."groupId"      <> gs."groupId";

-- DATA (c), the backfill: restore every per-season membership the enrolments
-- record and the old global unique destroyed. Same season guard as (b). The
-- NOT EXISTS makes it idempotent and keeps it clear of the new unique.
INSERT INTO "GroupStudent" ("groupId", "studentUserId", "seasonId", "enrolledAt")
SELECT se."groupId", se."studentUserId", se."seasonId", se."enrolledAt"
  FROM "SeasonEnrollment" se
  JOIN "Group" g ON g."id" = se."groupId" AND g."seasonId" = se."seasonId"
 WHERE NOT EXISTS (
       SELECT 1 FROM "GroupStudent" gs
        WHERE gs."studentUserId" = se."studentUserId"
          AND gs."seasonId"      = se."seasonId");

COMMIT;

-- Rows this migration deliberately leaves as they are, and how to list them
-- (read-only; run them before and after applying):
--
-- 1. Orphans: a membership with no enrolment in its group's season (a student
--    put in a group without being enrolled). The row is kept and takes its
--    group's season like every other row; no enrolment is invented.
--      SELECT gs."studentUserId", gs."groupId", gs."seasonId" FROM "GroupStudent" gs
--       WHERE NOT EXISTS (SELECT 1 FROM "SeasonEnrollment" se
--                          WHERE se."studentUserId" = gs."studentUserId"
--                            AND se."seasonId" = gs."seasonId");
--
-- 2. A membership whose season's enrolment has groupId NULL. Kept.
--      SELECT gs."studentUserId", gs."groupId", gs."seasonId" FROM "GroupStudent" gs
--        JOIN "SeasonEnrollment" se ON se."studentUserId" = gs."studentUserId"
--                                  AND se."seasonId" = gs."seasonId"
--       WHERE se."groupId" IS NULL;
--
-- 3. An enrolment whose groupId names a group in a DIFFERENT season. It gets
--    no membership, and the enrolment itself is not changed.
--      SELECT se."id", se."studentUserId", se."seasonId", se."groupId", g."seasonId" AS "groupSeasonId"
--        FROM "SeasonEnrollment" se JOIN "Group" g ON g."id" = se."groupId"
--       WHERE g."seasonId" <> se."seasonId";
--
-- Verification after applying (each expects 0):
--   SELECT count(*) FROM "SeasonEnrollment" se JOIN "Group" g ON g."id" = se."groupId" AND g."seasonId" = se."seasonId"
--    WHERE NOT EXISTS (SELECT 1 FROM "GroupStudent" gs WHERE gs."studentUserId" = se."studentUserId"
--                        AND gs."seasonId" = se."seasonId" AND gs."groupId" = se."groupId");
--   SELECT count(*) FROM "GroupStudent" gs JOIN "Group" g ON g."id" = gs."groupId" WHERE gs."seasonId" <> g."seasonId";
