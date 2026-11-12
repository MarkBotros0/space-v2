-- Staff mark an assignment as submitted (season passing, Task 1). One row per Submission: who
-- marked it and when. "Submitted" is now "tapped Submit in the app, or marked by staff"
-- (lib/assignments/submitted.ts). Deleting the Submission deletes its mark; deleting the marker
-- keeps the mark with no name.
BEGIN;

CREATE TABLE "SubmissionStaffMark" (
    "submissionId" INTEGER NOT NULL,
    "markedById" INTEGER,
    "markedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SubmissionStaffMark_pkey" PRIMARY KEY ("submissionId")
);

ALTER TABLE "SubmissionStaffMark" ADD CONSTRAINT "SubmissionStaffMark_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubmissionStaffMark" ADD CONSTRAINT "SubmissionStaffMark_markedById_fkey" FOREIGN KEY ("markedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
