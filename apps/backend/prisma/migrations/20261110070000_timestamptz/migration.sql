-- Refactor Wave 3, DB-015 (docs/refactor-audit.md §2.9, Q6): every timestamp
-- column becomes timestamptz(3), and User.dateOfBirth (a calendar day stored at
-- UTC midnight) becomes date. 107 columns in 38 tables; RateLimitHit.resetAt
-- already was timestamptz.
--
-- Values are preserved: the stored wall-clock times are UTC (Prisma writes UTC),
-- so each is read AT TIME ZONE 'UTC'; dateOfBirth keeps its UTC day. Prisma reads
-- both old and new types as the same Date, so a running build keeps working.
--
-- Deploy only where `pnpm check:wave-3` reports the session TimeZone as UTC: the
-- pg adapter sends a Date as UTC wall-clock time with no offset, which a
-- timestamptz column reads in the session time zone.
--
-- Cost: one rewrite per table under ACCESS EXCLUSIVE, in one transaction. Instant
-- on the current (test) data; on a large database, run it in a quiet window.
BEGIN;

ALTER TABLE "Announcement"
  ALTER COLUMN "createdAt" TYPE timestamptz(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "editedAt" TYPE timestamptz(3) USING "editedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE timestamptz(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "AnnouncementPoll"
  ALTER COLUMN "closedAt" TYPE timestamptz(3) USING "closedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "createdAt" TYPE timestamptz(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE timestamptz(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "AnnouncementPollOption"
  ALTER COLUMN "createdAt" TYPE timestamptz(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE timestamptz(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "AnnouncementPollVote"
  ALTER COLUMN "createdAt" TYPE timestamptz(3) USING "createdAt" AT TIME ZONE 'UTC';

ALTER TABLE "AnnouncementRead"
  ALTER COLUMN "readAt" TYPE timestamptz(3) USING "readAt" AT TIME ZONE 'UTC';

ALTER TABLE "Assignment"
  ALTER COLUMN "createdAt" TYPE timestamptz(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "deletedAt" TYPE timestamptz(3) USING "deletedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "dueAt" TYPE timestamptz(3) USING "dueAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE timestamptz(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "AssignmentTarget"
  ALTER COLUMN "createdAt" TYPE timestamptz(3) USING "createdAt" AT TIME ZONE 'UTC';

ALTER TABLE "Attendance"
  ALTER COLUMN "checkedInAt" TYPE timestamptz(3) USING "checkedInAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "createdAt" TYPE timestamptz(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "markedAt" TYPE timestamptz(3) USING "markedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE timestamptz(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "DeviceToken"
  ALTER COLUMN "createdAt" TYPE timestamptz(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "lastSeenAt" TYPE timestamptz(3) USING "lastSeenAt" AT TIME ZONE 'UTC';

ALTER TABLE "EngagementNote"
  ALTER COLUMN "createdAt" TYPE timestamptz(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE timestamptz(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "ForumComment"
  ALTER COLUMN "createdAt" TYPE timestamptz(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE timestamptz(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "Group"
  ALTER COLUMN "createdAt" TYPE timestamptz(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE timestamptz(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "GroupLeader"
  ALTER COLUMN "assignedAt" TYPE timestamptz(3) USING "assignedAt" AT TIME ZONE 'UTC';

ALTER TABLE "GroupStudent"
  ALTER COLUMN "enrolledAt" TYPE timestamptz(3) USING "enrolledAt" AT TIME ZONE 'UTC';

ALTER TABLE "InviteToken"
  ALTER COLUMN "createdAt" TYPE timestamptz(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "expiresAt" TYPE timestamptz(3) USING "expiresAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "usedAt" TYPE timestamptz(3) USING "usedAt" AT TIME ZONE 'UTC';

ALTER TABLE "JpcEvent"
  ALTER COLUMN "createdAt" TYPE timestamptz(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "date" TYPE timestamptz(3) USING "date" AT TIME ZONE 'UTC',
  ALTER COLUMN "endDate" TYPE timestamptz(3) USING "endDate" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE timestamptz(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "MentorFollowUp"
  ALTER COLUMN "createdAt" TYPE timestamptz(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "doneAt" TYPE timestamptz(3) USING "doneAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "dueAt" TYPE timestamptz(3) USING "dueAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "remindedAt" TYPE timestamptz(3) USING "remindedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE timestamptz(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "Notification"
  ALTER COLUMN "createdAt" TYPE timestamptz(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "readAt" TYPE timestamptz(3) USING "readAt" AT TIME ZONE 'UTC';

ALTER TABLE "NotificationPreference"
  ALTER COLUMN "createdAt" TYPE timestamptz(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE timestamptz(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "PasswordResetToken"
  ALTER COLUMN "createdAt" TYPE timestamptz(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "expiresAt" TYPE timestamptz(3) USING "expiresAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "usedAt" TYPE timestamptz(3) USING "usedAt" AT TIME ZONE 'UTC';

ALTER TABLE "Quiz"
  ALTER COLUMN "createdAt" TYPE timestamptz(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "publishedAt" TYPE timestamptz(3) USING "publishedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "resultsReleasedAt" TYPE timestamptz(3) USING "resultsReleasedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE timestamptz(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "QuizAnswer"
  ALTER COLUMN "createdAt" TYPE timestamptz(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE timestamptz(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "QuizAttempt"
  ALTER COLUMN "createdAt" TYPE timestamptz(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "gradedAt" TYPE timestamptz(3) USING "gradedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "submittedAt" TYPE timestamptz(3) USING "submittedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE timestamptz(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "QuizGrade"
  ALTER COLUMN "createdAt" TYPE timestamptz(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "gradedAt" TYPE timestamptz(3) USING "gradedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE timestamptz(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "QuizQuestion"
  ALTER COLUMN "createdAt" TYPE timestamptz(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE timestamptz(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "RefreshToken"
  ALTER COLUMN "createdAt" TYPE timestamptz(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "expiresAt" TYPE timestamptz(3) USING "expiresAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "revokedAt" TYPE timestamptz(3) USING "revokedAt" AT TIME ZONE 'UTC';

ALTER TABLE "Season"
  ALTER COLUMN "createdAt" TYPE timestamptz(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "deletedAt" TYPE timestamptz(3) USING "deletedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "endDate" TYPE timestamptz(3) USING "endDate" AT TIME ZONE 'UTC',
  ALTER COLUMN "startDate" TYPE timestamptz(3) USING "startDate" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE timestamptz(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "SeasonAdmin"
  ALTER COLUMN "assignedAt" TYPE timestamptz(3) USING "assignedAt" AT TIME ZONE 'UTC';

ALTER TABLE "SeasonEnrollment"
  ALTER COLUMN "completedAt" TYPE timestamptz(3) USING "completedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "createdAt" TYPE timestamptz(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "droppedAt" TYPE timestamptz(3) USING "droppedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "enrolledAt" TYPE timestamptz(3) USING "enrolledAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "overrideAt" TYPE timestamptz(3) USING "overrideAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "resultSetAt" TYPE timestamptz(3) USING "resultSetAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE timestamptz(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "Session"
  ALTER COLUMN "checkInClosedAt" TYPE timestamptz(3) USING "checkInClosedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "checkInOpenAt" TYPE timestamptz(3) USING "checkInOpenAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "createdAt" TYPE timestamptz(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "startsAt" TYPE timestamptz(3) USING "startsAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE timestamptz(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "SessionVideoProgress"
  ALTER COLUMN "completedAt" TYPE timestamptz(3) USING "completedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "createdAt" TYPE timestamptz(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE timestamptz(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "SessionVideoQuestion"
  ALTER COLUMN "createdAt" TYPE timestamptz(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE timestamptz(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "SessionVideoQuestionResponse"
  ALTER COLUMN "answeredAt" TYPE timestamptz(3) USING "answeredAt" AT TIME ZONE 'UTC';

ALTER TABLE "StudentDocument"
  ALTER COLUMN "uploadedAt" TYPE timestamptz(3) USING "uploadedAt" AT TIME ZONE 'UTC';

ALTER TABLE "StudentProfile"
  ALTER COLUMN "createdAt" TYPE timestamptz(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "dateOfBirth" TYPE timestamptz(3) USING "dateOfBirth" AT TIME ZONE 'UTC',
  ALTER COLUMN "deletedAt" TYPE timestamptz(3) USING "deletedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE timestamptz(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "Submission"
  ALTER COLUMN "createdAt" TYPE timestamptz(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "reviewedAt" TYPE timestamptz(3) USING "reviewedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "submittedAt" TYPE timestamptz(3) USING "submittedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE timestamptz(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "SubmissionFile"
  ALTER COLUMN "uploadedAt" TYPE timestamptz(3) USING "uploadedAt" AT TIME ZONE 'UTC';

ALTER TABLE "User"
  ALTER COLUMN "createdAt" TYPE timestamptz(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "dateOfBirth" TYPE date USING "dateOfBirth"::date,
  ALTER COLUMN "deletedAt" TYPE timestamptz(3) USING "deletedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "graduationOverrideAt" TYPE timestamptz(3) USING "graduationOverrideAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "lastLoginAt" TYPE timestamptz(3) USING "lastLoginAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "sessionsValidFrom" TYPE timestamptz(3) USING "sessionsValidFrom" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE timestamptz(3) USING "updatedAt" AT TIME ZONE 'UTC';

COMMIT;
