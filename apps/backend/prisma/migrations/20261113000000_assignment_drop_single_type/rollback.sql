-- Rollback for 20261113000000_assignment_drop_single_type (D6). Run with psql. Restores the type,
-- the columns, their CHECK and AssignmentTarget, empty: the deleted rows do not come back.
BEGIN;
CREATE TYPE "AssignmentType" AS ENUM ('STANDARD', 'FORUM');
ALTER TABLE "Assignment"
    ADD COLUMN "sessionId" INTEGER,
    ADD COLUMN "isAllGroups" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "allowedMimeCategories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN "maxFileSizeMb" INTEGER,
    ADD COLUMN "forumAllowComments" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "forumMinWords" INTEGER,
    ADD COLUMN "type" "AssignmentType" NOT NULL DEFAULT 'STANDARD',
    ADD COLUMN "forumPostToRead" BOOLEAN NOT NULL DEFAULT true,
    ADD CONSTRAINT "Assignment_allowedMimeCategories_check"
        CHECK ("allowedMimeCategories" <@ ARRAY['image', 'pdf', 'doc', 'audio', 'video', 'text']::TEXT[]);
CREATE INDEX "Assignment_sessionId_idx" ON "Assignment"("sessionId");
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE TABLE "AssignmentTarget" (
    "assignmentId" INTEGER NOT NULL,
    "groupId" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssignmentTarget_pkey" PRIMARY KEY ("assignmentId", "groupId")
);
CREATE INDEX "AssignmentTarget_groupId_idx" ON "AssignmentTarget"("groupId");
ALTER TABLE "AssignmentTarget" ADD CONSTRAINT "AssignmentTarget_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssignmentTarget" ADD CONSTRAINT "AssignmentTarget_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261113000000_assignment_drop_single_type';
COMMIT;
