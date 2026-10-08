-- M1 (Plan 18 Task 2.1): GroupStudent becomes season-scoped. Atomic.
BEGIN;

-- (a) Composite key on Group that the child FK needs. A unique INDEX named and
--     shaped as Prisma generates @@unique([id, seasonId]).
CREATE UNIQUE INDEX "Group_id_seasonId_key" ON "Group"("id", "seasonId");

-- (b) Add the column nullable so the backfill can run.
ALTER TABLE "GroupStudent" ADD COLUMN "seasonId" INTEGER;

-- (c) Backfill from the group the row already points at (groupId is a non-null FK).
UPDATE "GroupStudent" gs
   SET "seasonId" = g."seasonId"
  FROM "Group" g
 WHERE g."id" = gs."groupId";

ALTER TABLE "GroupStudent" ALTER COLUMN "seasonId" SET NOT NULL;

-- (d) Composite FK replaces the single-column FK from the init migration.
ALTER TABLE "GroupStudent" DROP CONSTRAINT "GroupStudent_groupId_fkey";
ALTER TABLE "GroupStudent"
  ADD CONSTRAINT "GroupStudent_groupId_seasonId_fkey"
  FOREIGN KEY ("groupId", "seasonId") REFERENCES "Group"("id", "seasonId")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- (e) THE REPAIR. SeasonEnrollment wins (C9). Only enrolments whose group
--     really belongs to the enrolment's season are trusted: the composite FK
--     would reject (and abort the whole migration for) any other pairing.
UPDATE "GroupStudent" gs
   SET "groupId"  = se."groupId",
       "seasonId" = se."seasonId"
  FROM "SeasonEnrollment" se, "Group" g_gs, "Group" g_se
 WHERE g_gs."id"         = gs."groupId"
   AND se."studentUserId" = gs."studentUserId"
   AND se."seasonId"      = g_gs."seasonId"
   AND g_se."id"          = se."groupId"
   AND g_se."seasonId"    = se."seasonId"
   AND se."groupId"      <> gs."groupId";

-- (g) Swap the constraint BEFORE the backfill. (The plan listed this after (f),
--     but the standalone unique on studentUserId is still live during (f): the
--     ON CONFLICT DO NOTHING would then silently skip exactly the students the
--     backfill exists for, those who already hold a row in another season.)
DROP INDEX "GroupStudent_studentUserId_key";
CREATE UNIQUE INDEX "GroupStudent_seasonId_studentUserId_key"
    ON "GroupStudent"("seasonId", "studentUserId");

-- (f) THE BACKFILL: restore every per-season membership SeasonEnrollment
--     recorded and the global unique destroyed (same group/season guard as (e)).
INSERT INTO "GroupStudent" ("groupId", "studentUserId", "seasonId", "enrolledAt")
SELECT se."groupId", se."studentUserId", se."seasonId", se."enrolledAt"
  FROM "SeasonEnrollment" se
  JOIN "Group" g ON g."id" = se."groupId" AND g."seasonId" = se."seasonId"
 WHERE NOT EXISTS (
       SELECT 1 FROM "GroupStudent" gs
        WHERE gs."studentUserId" = se."studentUserId"
          AND gs."seasonId"      = se."seasonId")
ON CONFLICT DO NOTHING;

COMMIT;
