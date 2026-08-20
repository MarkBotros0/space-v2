-- Graduation year on User: the alumnus marker, set when a student graduates from
-- JPCS. Also gates eligibility for LEADER/SEASON_ADMIN/MENTOR roles.
ALTER TABLE "User" ADD COLUMN "graduationYear" INTEGER;
