-- Account-level contact fields for every role (owner 2026-11-06). Additive.
ALTER TABLE "User" ADD COLUMN "phone" TEXT;
ALTER TABLE "User" ADD COLUMN "dateOfBirth" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "address" TEXT;

-- Carry the students' existing values over. StudentProfile.phone and
-- StudentProfile."dateOfBirth" stay in place but are no longer read.
UPDATE "User" u
SET "phone" = sp."phone", "dateOfBirth" = sp."dateOfBirth"
FROM "StudentProfile" sp
WHERE sp."userId" = u."id";

-- Student academic fields: a separate faculty, and the university graduation
-- year replacing the free-text "year" column (kept, not backfilled).
ALTER TABLE "StudentProfile" ADD COLUMN "faculty" TEXT;
ALTER TABLE "StudentProfile" ADD COLUMN "universityGraduationYear" INTEGER;
