-- Rollback for 20261113000300_assignment_part_work (D6). Run with psql, after 20261113000400's
-- rollback. Restores Submission's review columns and the submissionId keys, empty: files and
-- comments made against a part's work are deleted, since they have no submission to go back to.
BEGIN;
DELETE FROM "ForumComment";
DELETE FROM "SubmissionFile";
ALTER TABLE "ForumComment" DROP COLUMN "partWorkId", ADD COLUMN "submissionId" INTEGER NOT NULL;
CREATE INDEX "ForumComment_submissionId_idx" ON "ForumComment"("submissionId");
ALTER TABLE "ForumComment" ADD CONSTRAINT "ForumComment_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubmissionFile" DROP COLUMN "partWorkId", ADD COLUMN "submissionId" INTEGER NOT NULL;
CREATE INDEX "SubmissionFile_submissionId_idx" ON "SubmissionFile"("submissionId");
ALTER TABLE "SubmissionFile" ADD CONSTRAINT "SubmissionFile_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Submission"
    DROP COLUMN "completedAt",
    ADD COLUMN "text" TEXT,
    ADD COLUMN "status" "SubmissionStatus" NOT NULL DEFAULT 'DRAFT',
    ADD COLUMN "reviewedAt" TIMESTAMPTZ(3),
    ADD COLUMN "feedback" TEXT,
    ADD COLUMN "reviewedById" INTEGER;
CREATE INDEX "Submission_assignmentId_status_idx" ON "Submission"("assignmentId", "status");
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
DROP TABLE "AssignmentPartWork";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261113000300_assignment_part_work';
COMMIT;
