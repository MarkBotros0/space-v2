-- CreateEnum
CREATE TYPE "AssignmentType" AS ENUM ('STANDARD', 'FORUM');

-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN     "forumAllowComments" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "forumMinWords" INTEGER,
ADD COLUMN     "type" "AssignmentType" NOT NULL DEFAULT 'STANDARD';

-- CreateTable
CREATE TABLE "ForumComment" (
    "id" SERIAL NOT NULL,
    "submissionId" INTEGER NOT NULL,
    "authorUserId" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ForumComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ForumComment_submissionId_idx" ON "ForumComment"("submissionId");

-- CreateIndex
CREATE INDEX "ForumComment_authorUserId_idx" ON "ForumComment"("authorUserId");

-- AddForeignKey
ALTER TABLE "ForumComment" ADD CONSTRAINT "ForumComment_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumComment" ADD CONSTRAINT "ForumComment_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
