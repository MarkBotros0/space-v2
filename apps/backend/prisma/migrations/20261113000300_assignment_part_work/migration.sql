-- Multi-part assignments: a student's work is kept per part. AssignmentPartWork holds a video's
-- watched intervals and progress, an essay's text and its review, and a forum post; Submission
-- stays the one row per student and assignment (publicId, submittedAt, completedAt). An essay's
-- files and a forum post's comments hang off the part's work. The tables are empty
-- (20261113000000 deleted their rows), so the moved keys are added NOT NULL directly.
BEGIN;

CREATE TABLE "AssignmentPartWork" (
    "id" SERIAL NOT NULL,
    "publicId" TEXT NOT NULL,
    "partId" INTEGER NOT NULL,
    "submissionId" INTEGER NOT NULL,
    "studentUserId" INTEGER NOT NULL,
    "text" TEXT,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMPTZ(3),
    "reviewedAt" TIMESTAMPTZ(3),
    "feedback" TEXT,
    "reviewedById" INTEGER,
    "watchedIntervals" JSONB NOT NULL DEFAULT '[]',
    "watchedSeconds" INTEGER NOT NULL DEFAULT 0,
    "furthestSeconds" INTEGER NOT NULL DEFAULT 0,
    "lastReportAt" TIMESTAMPTZ(3),
    "doneAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AssignmentPartWork_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AssignmentPartWork_publicId_key" ON "AssignmentPartWork"("publicId");
CREATE UNIQUE INDEX "AssignmentPartWork_partId_studentUserId_key" ON "AssignmentPartWork"("partId", "studentUserId");
CREATE INDEX "AssignmentPartWork_submissionId_idx" ON "AssignmentPartWork"("submissionId");
CREATE INDEX "AssignmentPartWork_studentUserId_idx" ON "AssignmentPartWork"("studentUserId");
CREATE INDEX "AssignmentPartWork_partId_status_idx" ON "AssignmentPartWork"("partId", "status");
CREATE INDEX "AssignmentPartWork_reviewedById_idx" ON "AssignmentPartWork"("reviewedById");

ALTER TABLE "AssignmentPartWork" ADD CONSTRAINT "AssignmentPartWork_partId_fkey" FOREIGN KEY ("partId") REFERENCES "AssignmentPart"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssignmentPartWork" ADD CONSTRAINT "AssignmentPartWork_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssignmentPartWork" ADD CONSTRAINT "AssignmentPartWork_studentUserId_fkey" FOREIGN KEY ("studentUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssignmentPartWork" ADD CONSTRAINT "AssignmentPartWork_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The review moves to the part's work (Submission_assignmentId_status_idx and
-- Submission_reviewedById_fkey go with their columns).
ALTER TABLE "Submission"
    DROP COLUMN "text",
    DROP COLUMN "status",
    DROP COLUMN "feedback",
    DROP COLUMN "reviewedAt",
    DROP COLUMN "reviewedById",
    ADD COLUMN "completedAt" TIMESTAMPTZ(3);

ALTER TABLE "SubmissionFile" DROP COLUMN "submissionId", ADD COLUMN "partWorkId" INTEGER NOT NULL;
CREATE INDEX "SubmissionFile_partWorkId_idx" ON "SubmissionFile"("partWorkId");
ALTER TABLE "SubmissionFile" ADD CONSTRAINT "SubmissionFile_partWorkId_fkey" FOREIGN KEY ("partWorkId") REFERENCES "AssignmentPartWork"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ForumComment" DROP COLUMN "submissionId", ADD COLUMN "partWorkId" INTEGER NOT NULL;
CREATE INDEX "ForumComment_partWorkId_idx" ON "ForumComment"("partWorkId");
ALTER TABLE "ForumComment" ADD CONSTRAINT "ForumComment_partWorkId_fkey" FOREIGN KEY ("partWorkId") REFERENCES "AssignmentPartWork"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
