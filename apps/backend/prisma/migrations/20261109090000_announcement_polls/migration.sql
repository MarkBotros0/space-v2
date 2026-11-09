-- Announcement polls: one optional poll per announcement. Additive only.
CREATE TABLE "AnnouncementPoll" (
    "id" SERIAL NOT NULL,
    "announcementId" INTEGER NOT NULL,
    "allowsMultiple" BOOLEAN NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "closedAt" TIMESTAMP(3),
    "closedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnnouncementPoll_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AnnouncementPollOption" (
    "id" SERIAL NOT NULL,
    "pollId" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "AnnouncementPollOption_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AnnouncementPollVote" (
    "optionId" INTEGER NOT NULL,
    "pollId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnnouncementPollVote_pkey" PRIMARY KEY ("optionId","userId")
);

CREATE UNIQUE INDEX "AnnouncementPoll_announcementId_key" ON "AnnouncementPoll"("announcementId");
CREATE INDEX "AnnouncementPollOption_pollId_position_idx" ON "AnnouncementPollOption"("pollId", "position");
CREATE INDEX "AnnouncementPollVote_pollId_userId_idx" ON "AnnouncementPollVote"("pollId", "userId");

ALTER TABLE "AnnouncementPoll" ADD CONSTRAINT "AnnouncementPoll_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnnouncementPoll" ADD CONSTRAINT "AnnouncementPoll_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AnnouncementPollOption" ADD CONSTRAINT "AnnouncementPollOption_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "AnnouncementPoll"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnnouncementPollVote" ADD CONSTRAINT "AnnouncementPollVote_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "AnnouncementPollOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnnouncementPollVote" ADD CONSTRAINT "AnnouncementPollVote_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "AnnouncementPoll"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnnouncementPollVote" ADD CONSTRAINT "AnnouncementPollVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
