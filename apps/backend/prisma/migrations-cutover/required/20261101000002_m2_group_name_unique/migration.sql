-- M2 (Plan 18 Task 2.2): group names are unique within a season. Atomic.
BEGIN;

-- (b) Repair: the lowest id keeps the name; the rest are suffixed with their
--     id so the rename is reversible and obviously machine-made. Case and
--     whitespace variants are repaired too, so the endpoint's case-insensitive
--     rule (Task 2b.2) holds for every existing row. (If a suffixed name would
--     itself collide, e.g. an existing group literally called "Alpha #7", the
--     index below fails and the whole transaction rolls back: loud, not silent.)
UPDATE "Group" g SET "name" = g."name" || ' #' || g."id"
 WHERE EXISTS (SELECT 1 FROM "Group" g2
                WHERE g2."seasonId" = g."seasonId"
                  AND lower(btrim(g2."name")) = lower(btrim(g."name"))
                  AND g2."id" < g."id");

-- (c) The constraint: a unique INDEX, as Prisma generates @@unique.
CREATE UNIQUE INDEX "Group_seasonId_name_key" ON "Group"("seasonId", "name");

COMMIT;
