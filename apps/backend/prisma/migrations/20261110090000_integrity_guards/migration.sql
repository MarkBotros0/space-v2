-- Refactor Wave 3, DB-019 + IDX-6 + IDX-7 (docs/refactor-audit.md §2.6, §2.11, Q20 with D9):
-- rules the code already enforces, now also enforced by the database. Each rule's
-- violating rows are cleaned up first, in the same transaction (D9: losing or
-- rewriting them is acceptable). None of the rules is stricter than the Zod
-- schemas, so no request the API accepts today is refused.
--
--   Season       endDate >= startDate                  (Zod: season write + duplicate)
--   Season       absenceBudgetMinutes >= 0, absenceWeightMinutes > 0   (Zod: min 1)
--   Session      durationMinutes > 0                   (Zod: 15..600)
--   QuizQuestion, SessionVideoQuestion  points >= 0    (Zod: 1..100)
--   Group        UNIQUE (seasonId, name) — exact, as validateGroupWrite compares
--                (the audit's lower(name) would refuse names the code accepts)
--   QuizAttempt  one IN_PROGRESS attempt per quiz and student (partial unique)
--
-- Not here (D8): JpcEvent endDate >= date. endDate is org midnight of the end day
-- while date carries the start time, so a valid same-day event with a time has
-- endDate < date; a correct rule needs org-time days.
--
-- `pnpm check:wave-3` counts each rule's violating rows before deploy.
BEGIN;

-- One IN_PROGRESS attempt per quiz and student: keep the newest; older ones (and
-- their answers, by cascade) are deleted.
DELETE FROM "QuizAttempt" a
USING (
  SELECT "id", row_number() OVER (
    PARTITION BY "quizId", "studentUserId" ORDER BY "attemptNumber" DESC, "id" DESC
  ) AS rn
  FROM "QuizAttempt" WHERE "status" = 'IN_PROGRESS'
) ranked
WHERE a."id" = ranked."id" AND ranked.rn > 1;

-- Group names: the oldest keeps its name, later ones get " (2)", " (3)", ...
UPDATE "Group" g SET "name" = g."name" || ' (' || ranked.rn || ')'
FROM (
  SELECT "id", row_number() OVER (PARTITION BY "seasonId", "name" ORDER BY "id") AS rn FROM "Group"
) ranked
WHERE g."id" = ranked."id" AND ranked.rn > 1;

-- Out-of-range values take the column default (an end before the start takes the start).
UPDATE "Season" SET "endDate" = "startDate" WHERE "endDate" < "startDate";
UPDATE "Season" SET "absenceBudgetMinutes" = 180 WHERE "absenceBudgetMinutes" < 0;
UPDATE "Season" SET "absenceWeightMinutes" = 90 WHERE "absenceWeightMinutes" <= 0;
UPDATE "Session" SET "durationMinutes" = 90 WHERE "durationMinutes" <= 0;
UPDATE "QuizQuestion" SET "points" = 1 WHERE "points" < 0;
UPDATE "SessionVideoQuestion" SET "points" = 1 WHERE "points" < 0;

ALTER TABLE "Season" ADD CONSTRAINT "Season_endDate_check" CHECK ("endDate" >= "startDate") NOT VALID;
ALTER TABLE "Season" ADD CONSTRAINT "Season_absenceMinutes_check"
  CHECK ("absenceBudgetMinutes" >= 0 AND "absenceWeightMinutes" > 0) NOT VALID;
ALTER TABLE "Session" ADD CONSTRAINT "Session_durationMinutes_check" CHECK ("durationMinutes" > 0) NOT VALID;
ALTER TABLE "QuizQuestion" ADD CONSTRAINT "QuizQuestion_points_check" CHECK ("points" >= 0) NOT VALID;
ALTER TABLE "SessionVideoQuestion" ADD CONSTRAINT "SessionVideoQuestion_points_check" CHECK ("points" >= 0) NOT VALID;

COMMIT;

-- Outside the transaction (D10): validate without a long write lock, then build
-- the two unique indexes without blocking writes. If an index build fails it is
-- left INVALID: drop it before retrying, or IF NOT EXISTS skips it.
ALTER TABLE "Season" VALIDATE CONSTRAINT "Season_endDate_check";
ALTER TABLE "Season" VALIDATE CONSTRAINT "Season_absenceMinutes_check";
ALTER TABLE "Session" VALIDATE CONSTRAINT "Session_durationMinutes_check";
ALTER TABLE "QuizQuestion" VALIDATE CONSTRAINT "QuizQuestion_points_check";
ALTER TABLE "SessionVideoQuestion" VALIDATE CONSTRAINT "SessionVideoQuestion_points_check";

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "Group_seasonId_name_key" ON "Group" ("seasonId", "name");
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "QuizAttempt_one_in_progress_key"
  ON "QuizAttempt" ("quizId", "studentUserId") WHERE "status" = 'IN_PROGRESS';
