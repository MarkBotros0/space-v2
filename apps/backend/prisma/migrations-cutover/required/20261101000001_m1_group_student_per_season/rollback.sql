-- M1 rollback (reasoning aid and Task 2.18 Step 6; the real procedure is the R8 backup restore).
-- Data note: step (e)'s group rewrites and step (f)'s inserts are not undone
-- individually; each student keeps ONE membership (their most recently
-- enrolled, ties broken by the later season) so the old global unique holds.
BEGIN;

DELETE FROM "GroupStudent" gs
 USING "GroupStudent" newer
 WHERE newer."studentUserId" = gs."studentUserId"
   AND (newer."enrolledAt", newer."seasonId") > (gs."enrolledAt", gs."seasonId");

ALTER TABLE "GroupStudent" DROP CONSTRAINT "GroupStudent_groupId_seasonId_fkey";
DROP INDEX "GroupStudent_seasonId_studentUserId_key";
CREATE UNIQUE INDEX "GroupStudent_studentUserId_key" ON "GroupStudent"("studentUserId");
ALTER TABLE "GroupStudent" DROP COLUMN "seasonId";
ALTER TABLE "GroupStudent"
  ADD CONSTRAINT "GroupStudent_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
DROP INDEX "Group_id_seasonId_key";

COMMIT;
