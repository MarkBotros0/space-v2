-- CreateTable
CREATE TABLE "SessionVideoQuestion" (
    "id" SERIAL NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "atSeconds" INTEGER NOT NULL,
    "prompt" TEXT NOT NULL,
    "options" TEXT[],
    "correctIndex" INTEGER NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 1,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionVideoQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionVideoQuestionResponse" (
    "id" SERIAL NOT NULL,
    "questionId" INTEGER NOT NULL,
    "studentUserId" INTEGER NOT NULL,
    "selectedIndex" INTEGER NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionVideoQuestionResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionVideoProgress" (
    "id" SERIAL NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "studentUserId" INTEGER NOT NULL,
    "furthestSeconds" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionVideoProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SessionVideoQuestion_sessionId_atSeconds_idx" ON "SessionVideoQuestion"("sessionId", "atSeconds");

-- CreateIndex
CREATE INDEX "SessionVideoQuestionResponse_studentUserId_idx" ON "SessionVideoQuestionResponse"("studentUserId");

-- CreateIndex
CREATE UNIQUE INDEX "SessionVideoQuestionResponse_questionId_studentUserId_key" ON "SessionVideoQuestionResponse"("questionId", "studentUserId");

-- CreateIndex
CREATE UNIQUE INDEX "SessionVideoProgress_sessionId_studentUserId_key" ON "SessionVideoProgress"("sessionId", "studentUserId");

-- AddForeignKey
ALTER TABLE "SessionVideoQuestion" ADD CONSTRAINT "SessionVideoQuestion_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionVideoQuestion" ADD CONSTRAINT "SessionVideoQuestion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionVideoQuestionResponse" ADD CONSTRAINT "SessionVideoQuestionResponse_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "SessionVideoQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionVideoQuestionResponse" ADD CONSTRAINT "SessionVideoQuestionResponse_studentUserId_fkey" FOREIGN KEY ("studentUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionVideoProgress" ADD CONSTRAINT "SessionVideoProgress_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionVideoProgress" ADD CONSTRAINT "SessionVideoProgress_studentUserId_fkey" FOREIGN KEY ("studentUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
