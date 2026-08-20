-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'QUIZ_GRADED';

-- AlterTable
ALTER TABLE "NotificationPreference" ADD COLUMN     "quizGraded" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "Quiz" (
    "id" SERIAL NOT NULL,
    "seasonId" INTEGER NOT NULL,
    "sessionId" INTEGER,
    "title" TEXT NOT NULL,
    "maxScore" INTEGER NOT NULL DEFAULT 100,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quiz_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizGrade" (
    "id" SERIAL NOT NULL,
    "quizId" INTEGER NOT NULL,
    "studentUserId" INTEGER NOT NULL,
    "score" INTEGER,
    "notes" TEXT,
    "gradedById" INTEGER,
    "gradedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuizGrade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Quiz_seasonId_idx" ON "Quiz"("seasonId");

-- CreateIndex
CREATE INDEX "Quiz_sessionId_idx" ON "Quiz"("sessionId");

-- CreateIndex
CREATE INDEX "QuizGrade_studentUserId_idx" ON "QuizGrade"("studentUserId");

-- CreateIndex
CREATE UNIQUE INDEX "QuizGrade_quizId_studentUserId_key" ON "QuizGrade"("quizId", "studentUserId");

-- AddForeignKey
ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizGrade" ADD CONSTRAINT "QuizGrade_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizGrade" ADD CONSTRAINT "QuizGrade_studentUserId_fkey" FOREIGN KEY ("studentUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizGrade" ADD CONSTRAINT "QuizGrade_gradedById_fkey" FOREIGN KEY ("gradedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
