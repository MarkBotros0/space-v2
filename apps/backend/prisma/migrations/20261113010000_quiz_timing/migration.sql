-- Quiz timing: a start window and per-student time limit on Quiz; a server-clock
-- deadline, an end reason and who ended it on QuizAttempt.
BEGIN;

CREATE TYPE "QuizAttemptEndReason" AS ENUM ('SUBMITTED', 'TIMED_OUT', 'ENDED_BY_STAFF', 'ENDED_BY_EXITS');

ALTER TABLE "Quiz"
  ADD COLUMN "startsFrom" TIMESTAMPTZ(3),
  ADD COLUMN "startsUntil" TIMESTAMPTZ(3),
  ADD COLUMN "timeLimitMinutes" INTEGER,
  ADD CONSTRAINT "Quiz_timeLimitMinutes_check" CHECK ("timeLimitMinutes" IS NULL OR "timeLimitMinutes" BETWEEN 1 AND 300),
  ADD CONSTRAINT "Quiz_start_window_check" CHECK ("startsFrom" IS NULL OR "startsUntil" IS NULL OR "startsFrom" < "startsUntil");

ALTER TABLE "QuizAttempt"
  ADD COLUMN "deadlineAt" TIMESTAMPTZ(3),
  ADD COLUMN "endReason" "QuizAttemptEndReason",
  ADD COLUMN "endedById" INTEGER,
  ADD CONSTRAINT "QuizAttempt_endedById_fkey" FOREIGN KEY ("endedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The sweep that closes expired attempts reads only open, timed ones.
CREATE INDEX "QuizAttempt_deadline_open_idx" ON "QuizAttempt"("deadlineAt")
  WHERE "status" = 'IN_PROGRESS' AND "deadlineAt" IS NOT NULL;

COMMIT;
