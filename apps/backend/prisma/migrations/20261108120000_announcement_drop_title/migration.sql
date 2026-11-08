-- Announcements have no title (owner, 2026-11-08): a post is its message alone.
-- Destructive by request: existing posts' titles are dropped with the column.
ALTER TABLE "Announcement" DROP COLUMN "title";
