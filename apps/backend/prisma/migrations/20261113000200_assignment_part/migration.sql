-- Multi-part assignments: an assignment is an ordered list of parts, each a Video, an Essay or a
-- Forum, with that kind's settings. The CHECKs hold what each kind needs; an assignment has at most
-- one Forum part (partial unique AssignmentPart_one_forum). Additive.
BEGIN;

CREATE TYPE "AssignmentPartKind" AS ENUM ('VIDEO', 'ESSAY', 'FORUM');

CREATE TABLE "AssignmentPart" (
    "id" SERIAL NOT NULL,
    "assignmentId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "kind" "AssignmentPartKind" NOT NULL,
    "title" TEXT,
    "youtubeId" TEXT,
    "youtubeUrl" TEXT,
    "durationSeconds" INTEGER,
    "blockSkipping" BOOLEAN NOT NULL DEFAULT false,
    "prompt" TEXT,
    "minWords" INTEGER,
    "maxWords" INTEGER,
    "maxFileSizeMb" INTEGER,
    "allowedMimeCategories" TEXT[] NOT NULL DEFAULT '{}',
    "postToRead" BOOLEAN NOT NULL DEFAULT true,
    "allowComments" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AssignmentPart_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AssignmentPart_video_check" CHECK ("kind" <> 'VIDEO' OR "youtubeId" IS NOT NULL),
    CONSTRAINT "AssignmentPart_prompt_check" CHECK ("kind" NOT IN ('ESSAY', 'FORUM') OR "prompt" IS NOT NULL),
    CONSTRAINT "AssignmentPart_words_check" CHECK ("minWords" <= "maxWords"),
    CONSTRAINT "AssignmentPart_allowedMimeCategories_check"
        CHECK ("allowedMimeCategories" <@ ARRAY['image', 'pdf', 'doc', 'audio', 'video', 'text']::TEXT[])
);

CREATE INDEX "AssignmentPart_assignmentId_position_idx" ON "AssignmentPart"("assignmentId", "position");
CREATE UNIQUE INDEX "AssignmentPart_one_forum" ON "AssignmentPart"("assignmentId") WHERE "kind" = 'FORUM';

ALTER TABLE "AssignmentPart" ADD CONSTRAINT "AssignmentPart_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
