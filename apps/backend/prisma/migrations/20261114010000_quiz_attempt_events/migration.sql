-- Quiz integrity: the phone's exit reports. One row per event the phone saw (an exit, a relaunch
-- after a crash or kill, a blocked screenshot), keyed by the phone's own id so a retry or an
-- offline replay is stored once. The server counts EXIT + RELAUNCH rows; the third ends the
-- attempt. Rows are written once, with both times, and never updated.
BEGIN;

CREATE TYPE "QuizAttemptEventKind" AS ENUM ('EXIT', 'RELAUNCH', 'SCREENSHOT');

CREATE TABLE "QuizAttemptEvent" (
    "id" SERIAL NOT NULL,
    "attemptId" INTEGER NOT NULL,
    "kind" "QuizAttemptEventKind" NOT NULL,
    "clientEventId" TEXT NOT NULL,
    "leftAt" TIMESTAMPTZ(3) NOT NULL,
    "returnedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuizAttemptEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "QuizAttemptEvent_attemptId_clientEventId_key" ON "QuizAttemptEvent"("attemptId", "clientEventId");
CREATE INDEX "QuizAttemptEvent_attemptId_leftAt_idx" ON "QuizAttemptEvent"("attemptId", "leftAt");

ALTER TABLE "QuizAttemptEvent" ADD CONSTRAINT "QuizAttemptEvent_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "QuizAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
