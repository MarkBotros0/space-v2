-- Quiz question types, storage (plan docs/superpowers/plans/2026-11-10-quiz-question-types.md
-- Task 1). Additive: options, blanks and a student's picks and blank texts become rows with
-- stable ids, so answer keys (QuizOption.isCorrect / matchId, QuizBlank.expected) are columns a
-- student read can leave out. Plus Quiz.shuffleQuestions and the per-attempt shuffle seed.
-- QuizQuestion.options / correctIndex and QuizAnswer.selectedIndex stay until a contract
-- migration; 20261112040000 copies them into the new rows.
-- The statements are what `prisma migrate diff` produces for these models.
BEGIN;

-- CreateEnum
CREATE TYPE "QuizOptionSide" AS ENUM ('LEFT', 'RIGHT');

-- AlterTable
ALTER TABLE "Quiz" ADD COLUMN "shuffleQuestions" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "QuizAttempt" ADD COLUMN "shuffleSeed" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "QuizOption" (
    "id" SERIAL NOT NULL,
    "questionId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,
    "side" "QuizOptionSide",
    "matchId" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "QuizOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizBlank" (
    "id" SERIAL NOT NULL,
    "questionId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "expected" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "QuizBlank_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizAnswerSelection" (
    "answerId" INTEGER NOT NULL,
    "optionId" INTEGER NOT NULL,
    "matchedOptionId" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "QuizAnswerSelection_pkey" PRIMARY KEY ("answerId","optionId")
);

-- CreateTable
CREATE TABLE "QuizAnswerBlank" (
    "answerId" INTEGER NOT NULL,
    "blankId" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "isCorrect" BOOLEAN,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "QuizAnswerBlank_pkey" PRIMARY KEY ("answerId","blankId")
);

-- CreateIndex
CREATE INDEX "QuizOption_questionId_position_idx" ON "QuizOption"("questionId", "position");

-- CreateIndex
CREATE INDEX "QuizOption_matchId_idx" ON "QuizOption"("matchId");

-- CreateIndex
CREATE UNIQUE INDEX "QuizBlank_questionId_position_key" ON "QuizBlank"("questionId", "position");

-- CreateIndex
CREATE INDEX "QuizAnswerSelection_optionId_idx" ON "QuizAnswerSelection"("optionId");

-- CreateIndex
CREATE INDEX "QuizAnswerSelection_matchedOptionId_idx" ON "QuizAnswerSelection"("matchedOptionId");

-- CreateIndex
CREATE INDEX "QuizAnswerBlank_blankId_idx" ON "QuizAnswerBlank"("blankId");

-- AddForeignKey
ALTER TABLE "QuizOption" ADD CONSTRAINT "QuizOption_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "QuizQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizOption" ADD CONSTRAINT "QuizOption_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "QuizOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizBlank" ADD CONSTRAINT "QuizBlank_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "QuizQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizAnswerSelection" ADD CONSTRAINT "QuizAnswerSelection_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "QuizAnswer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizAnswerSelection" ADD CONSTRAINT "QuizAnswerSelection_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "QuizOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizAnswerSelection" ADD CONSTRAINT "QuizAnswerSelection_matchedOptionId_fkey" FOREIGN KEY ("matchedOptionId") REFERENCES "QuizOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizAnswerBlank" ADD CONSTRAINT "QuizAnswerBlank_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "QuizAnswer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizAnswerBlank" ADD CONSTRAINT "QuizAnswerBlank_blankId_fkey" FOREIGN KEY ("blankId") REFERENCES "QuizBlank"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
