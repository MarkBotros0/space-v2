-- Season passing by weighted score (season passing, Task 4): what End stored for each enrolment.
-- passScore is the weighted score at End (one decimal; null when the student had nothing to count
-- or the season ended before weighted passing), passNumbers the three numbers it came from,
-- resultAgainstScore whether the result went against the score (passed below the mark, or did not
-- pass at or above it), and resultSetById who set the result (End, or a later correction). All
-- null until then. Additive.
BEGIN;

ALTER TABLE "SeasonEnrollment"
    ADD COLUMN "passScore" DECIMAL(4,1),
    ADD COLUMN "passNumbers" JSONB,
    ADD COLUMN "resultAgainstScore" BOOLEAN,
    ADD COLUMN "resultSetById" INTEGER,
    ADD CONSTRAINT "SeasonEnrollment_resultSetById_fkey" FOREIGN KEY ("resultSetById")
        REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
