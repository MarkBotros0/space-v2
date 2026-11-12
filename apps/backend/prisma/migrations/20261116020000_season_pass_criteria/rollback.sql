-- Rollback for 20261116020000_season_pass_criteria. Run with psql. Drops every season's saved criteria.
BEGIN;
ALTER TABLE "Season"
  DROP CONSTRAINT "Season_passCriteria_check",
  DROP COLUMN "passCriteriaSetAt",
  DROP COLUMN "passMark",
  DROP COLUMN "passWeightQuizzes",
  DROP COLUMN "passWeightAssignments",
  DROP COLUMN "passWeightAttendance";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261116020000_season_pass_criteria';
COMMIT;
