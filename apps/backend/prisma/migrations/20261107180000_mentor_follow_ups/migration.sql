-- A mentor's follow-ups (owner, 2026-11-07). Additive: a new table only.
CREATE TABLE "MentorFollowUp" (
    "id" SERIAL NOT NULL,
    "mentorUserId" INTEGER NOT NULL,
    "studentUserId" INTEGER NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "remindedAt" TIMESTAMP(3),
    "doneAt" TIMESTAMP(3),

    CONSTRAINT "MentorFollowUp_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MentorFollowUp_mentorUserId_doneAt_idx" ON "MentorFollowUp"("mentorUserId", "doneAt");
CREATE INDEX "MentorFollowUp_dueAt_idx" ON "MentorFollowUp"("dueAt");

-- One open follow-up per mentor and student; done ones may pile up.
CREATE UNIQUE INDEX "MentorFollowUp_one_open" ON "MentorFollowUp"("mentorUserId", "studentUserId") WHERE "doneAt" IS NULL;

ALTER TABLE "MentorFollowUp" ADD CONSTRAINT "MentorFollowUp_mentorUserId_fkey" FOREIGN KEY ("mentorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MentorFollowUp" ADD CONSTRAINT "MentorFollowUp_studentUserId_fkey" FOREIGN KEY ("studentUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
