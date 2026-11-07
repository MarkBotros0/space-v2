-- CreateEnum
CREATE TYPE "AnnouncementAudience" AS ENUM ('COMMUNITY', 'SEASON');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'ANNOUNCEMENT';

-- AlterTable
ALTER TABLE "NotificationPreference" ADD COLUMN     "announcement" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "Announcement" (
    "id" SERIAL NOT NULL,
    "audience" "AnnouncementAudience" NOT NULL,
    "seasonId" INTEGER,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "authorId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "editedAt" TIMESTAMP(3),

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnouncementRead" (
    "announcementId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnnouncementRead_pkey" PRIMARY KEY ("announcementId","userId")
);

-- CreateIndex
CREATE INDEX "Announcement_audience_createdAt_idx" ON "Announcement"("audience", "createdAt");

-- CreateIndex
CREATE INDEX "Announcement_seasonId_createdAt_idx" ON "Announcement"("seasonId", "createdAt");

-- CreateIndex
CREATE INDEX "AnnouncementRead_userId_idx" ON "AnnouncementRead"("userId");

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementRead" ADD CONSTRAINT "AnnouncementRead_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementRead" ADD CONSTRAINT "AnnouncementRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A SEASON post names a season; a COMMUNITY post names none.
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_audience_season_check" CHECK (("audience" = 'SEASON') = ("seasonId" IS NOT NULL));
