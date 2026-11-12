-- Season passing (Task 4, fix round 1): CHECKs on what End stores for each enrolment. The score is a
-- percentage, 0..100; each of the three numbers is a part of its whole (0 <= part <= whole, so its
-- percentage is 0..100); a result can only go against a score that exists. Additive: the columns
-- are new and every row is null.
BEGIN;

ALTER TABLE "SeasonEnrollment"
    ADD CONSTRAINT "SeasonEnrollment_passScore_check" CHECK ("passScore" BETWEEN 0 AND 100),
    ADD CONSTRAINT "SeasonEnrollment_passNumbers_check" CHECK (
        "passNumbers" IS NULL
        OR (
            ("passNumbers" -> 'attendance' ->> 'attended')::numeric
                BETWEEN 0 AND ("passNumbers" -> 'attendance' ->> 'total')::numeric
            AND ("passNumbers" -> 'assignments' ->> 'submitted')::numeric
                BETWEEN 0 AND ("passNumbers" -> 'assignments' ->> 'total')::numeric
            AND ("passNumbers" -> 'quizzes' ->> 'scored')::numeric
                BETWEEN 0 AND ("passNumbers" -> 'quizzes' ->> 'max')::numeric
        )
    ),
    ADD CONSTRAINT "SeasonEnrollment_resultAgainstScore_check" CHECK (
        "resultAgainstScore" IS NOT TRUE OR "passScore" IS NOT NULL
    );

COMMIT;
