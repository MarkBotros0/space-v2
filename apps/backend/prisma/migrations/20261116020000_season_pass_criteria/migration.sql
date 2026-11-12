-- Season passing by weighted score (season passing, Task 2): the season's pass criteria. Three
-- whole-percentage weights (attendance, assignments, quizzes) that add up to 100 and a pass mark,
-- all four null until the season's admin or a super saves them (or End does); passCriteriaSetAt is
-- when, and the newest one is every other season's default. Additive.
BEGIN;

ALTER TABLE "Season"
    ADD COLUMN "passWeightAttendance" INTEGER,
    ADD COLUMN "passWeightAssignments" INTEGER,
    ADD COLUMN "passWeightQuizzes" INTEGER,
    ADD COLUMN "passMark" INTEGER,
    ADD COLUMN "passCriteriaSetAt" TIMESTAMPTZ(3),
    ADD CONSTRAINT "Season_passCriteria_check" CHECK (
        num_nonnulls("passWeightAttendance", "passWeightAssignments", "passWeightQuizzes", "passMark") = 0
        OR (
            num_nonnulls("passWeightAttendance", "passWeightAssignments", "passWeightQuizzes", "passMark") = 4
            AND "passWeightAttendance" BETWEEN 0 AND 100
            AND "passWeightAssignments" BETWEEN 0 AND 100
            AND "passWeightQuizzes" BETWEEN 0 AND 100
            AND "passMark" BETWEEN 0 AND 100
            AND "passWeightAttendance" + "passWeightAssignments" + "passWeightQuizzes" = 100
        )
    );

COMMIT;
