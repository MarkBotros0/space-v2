-- AlterTable
ALTER TABLE "Quiz" ADD COLUMN     "resultsReleasedAt" TIMESTAMP(3),
ADD COLUMN     "resultsReleasedById" INTEGER;

-- AddForeignKey
ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_resultsReleasedById_fkey" FOREIGN KEY ("resultsReleasedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Results students have already seen stay visible: a quiz with any grade or
-- graded attempt counts as released from now on.
UPDATE "Quiz" q SET "resultsReleasedAt" = NOW()
WHERE EXISTS (SELECT 1 FROM "QuizGrade" g WHERE g."quizId" = q.id)
   OR EXISTS (SELECT 1 FROM "QuizAttempt" a WHERE a."quizId" = q.id AND a.status = 'GRADED');
