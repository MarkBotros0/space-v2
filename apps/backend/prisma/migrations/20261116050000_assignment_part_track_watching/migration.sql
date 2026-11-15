-- A video part can stop tracking watching (owner, 2026-11-15): opening it counts as done and its
-- timed questions are optional. Additive: every existing part keeps tracking.
BEGIN;

ALTER TABLE "AssignmentPart" ADD COLUMN "trackWatching" BOOLEAN NOT NULL DEFAULT true;

COMMIT;
