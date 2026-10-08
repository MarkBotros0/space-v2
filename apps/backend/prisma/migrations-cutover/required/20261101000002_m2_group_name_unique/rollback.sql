-- M2 rollback. The suffix ' #<id>' is unambiguous, so the machine-made renames
-- are stripped again (only where the suffix is exactly the row's own id).
BEGIN;

DROP INDEX "Group_seasonId_name_key";

UPDATE "Group" SET "name" = left("name", length("name") - length(' #' || "id"))
 WHERE right("name", length(' #' || "id")) = ' #' || "id";

COMMIT;
