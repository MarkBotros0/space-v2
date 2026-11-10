-- Multi-part assignments: indexes for the reads that sort AssignmentPartWork on non-key columns
-- (root CLAUDE.md "Query indexes"). Partial, so they hold only the rows those reads can return.
-- * AssignmentPartWork_queue_idx: the review queue (routes/submissions/queue.ts) filters
--   status <> DRAFT (and status = SUBMITTED for "pending only") and sorts status, submittedAt DESC
--   NULLS LAST, id DESC; the mentor's handed-in feed (lib/queries/dashboard/mentor.ts) reads the same
--   rows by submittedAt DESC, id DESC.
-- * AssignmentPartWork_reviewed_idx: the mentor's reviewed feed filters reviewedAt IS NOT NULL and
--   sorts reviewedAt DESC, id DESC.
-- Additive.
BEGIN;

CREATE INDEX "AssignmentPartWork_queue_idx" ON "AssignmentPartWork"("status", "submittedAt" DESC NULLS LAST, "id" DESC)
    WHERE "status" <> 'DRAFT';

CREATE INDEX "AssignmentPartWork_reviewed_idx" ON "AssignmentPartWork"("reviewedAt" DESC, "id" DESC)
    WHERE "reviewedAt" IS NOT NULL;

COMMIT;
