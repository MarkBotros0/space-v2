-- A forum's "post before reading others" setting (owner, 2026-11-08). Additive: one column whose
-- default keeps every existing forum as it was (a student sees group-mates' posts only after posting).
ALTER TABLE "Assignment" ADD COLUMN "forumPostToRead" BOOLEAN NOT NULL DEFAULT true;
