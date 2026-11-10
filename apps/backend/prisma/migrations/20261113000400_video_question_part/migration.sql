-- Multi-part assignments: a video question hangs off a session's video or a Video part, exactly one
-- of the two (SessionVideoQuestion_owner_check). Responses stay keyed by question. Additive.
BEGIN;

ALTER TABLE "SessionVideoQuestion"
    ALTER COLUMN "sessionId" DROP NOT NULL,
    ADD COLUMN "assignmentPartId" INTEGER,
    ADD CONSTRAINT "SessionVideoQuestion_owner_check" CHECK (num_nonnulls("sessionId", "assignmentPartId") = 1);

CREATE INDEX "SessionVideoQuestion_assignmentPartId_atSeconds_idx" ON "SessionVideoQuestion"("assignmentPartId", "atSeconds");

ALTER TABLE "SessionVideoQuestion" ADD CONSTRAINT "SessionVideoQuestion_assignmentPartId_fkey" FOREIGN KEY ("assignmentPartId") REFERENCES "AssignmentPart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
