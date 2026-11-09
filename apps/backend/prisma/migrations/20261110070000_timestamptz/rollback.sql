-- Rollback for 20261110070000_timestamptz (D6). Run with psql. Back to timestamp(3) holding UTC
-- wall-clock time, and dateOfBirth to timestamp(3) at UTC midnight. Values are preserved.
BEGIN;

ALTER TABLE "Announcement"
  ALTER COLUMN "createdAt" TYPE timestamp(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "editedAt" TYPE timestamp(3) USING "editedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE timestamp(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "AnnouncementPoll"
  ALTER COLUMN "closedAt" TYPE timestamp(3) USING "closedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "createdAt" TYPE timestamp(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE timestamp(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "AnnouncementPollOption"
  ALTER COLUMN "createdAt" TYPE timestamp(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE timestamp(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "AnnouncementPollVote"
  ALTER COLUMN "createdAt" TYPE timestamp(3) USING "createdAt" AT TIME ZONE 'UTC';

ALTER TABLE "AnnouncementRead"
  ALTER COLUMN "readAt" TYPE timestamp(3) USING "readAt" AT TIME ZONE 'UTC';

ALTER TABLE "Assignment"
  ALTER COLUMN "createdAt" TYPE timestamp(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "deletedAt" TYPE timestamp(3) USING "deletedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "dueAt" TYPE timestamp(3) USING "dueAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE timestamp(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "AssignmentTarget"
  ALTER COLUMN "createdAt" TYPE timestamp(3) USING "createdAt" AT TIME ZONE 'UTC';

ALTER TABLE "Attendance"
  ALTER COLUMN "checkedInAt" TYPE timestamp(3) USING "checkedInAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "createdAt" TYPE timestamp(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "markedAt" TYPE timestamp(3) USING "markedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE timestamp(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "DeviceToken"
  ALTER COLUMN "createdAt" TYPE timestamp(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "lastSeenAt" TYPE timestamp(3) USING "lastSeenAt" AT TIME ZONE 'UTC';

ALTER TABLE "EngagementNote"
  ALTER COLUMN "createdAt" TYPE timestamp(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE timestamp(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "ForumComment"
  ALTER COLUMN "createdAt" TYPE timestamp(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE timestamp(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "Group"
  ALTER COLUMN "createdAt" TYPE timestamp(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE timestamp(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "GroupLeader"
  ALTER COLUMN "assignedAt" TYPE timestamp(3) USING "assignedAt" AT TIME ZONE 'UTC';

ALTER TABLE "GroupStudent"
  ALTER COLUMN "enrolledAt" TYPE timestamp(3) USING "enrolledAt" AT TIME ZONE 'UTC';

ALTER TABLE "InviteToken"
  ALTER COLUMN "createdAt" TYPE timestamp(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "expiresAt" TYPE timestamp(3) USING "expiresAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "usedAt" TYPE timestamp(3) USING "usedAt" AT TIME ZONE 'UTC';

ALTER TABLE "JpcEvent"
  ALTER COLUMN "createdAt" TYPE timestamp(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "date" TYPE timestamp(3) USING "date" AT TIME ZONE 'UTC',
  ALTER COLUMN "endDate" TYPE timestamp(3) USING "endDate" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE timestamp(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "MentorFollowUp"
  ALTER COLUMN "createdAt" TYPE timestamp(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "doneAt" TYPE timestamp(3) USING "doneAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "dueAt" TYPE timestamp(3) USING "dueAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "remindedAt" TYPE timestamp(3) USING "remindedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE timestamp(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "Notification"
  ALTER COLUMN "createdAt" TYPE timestamp(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "readAt" TYPE timestamp(3) USING "readAt" AT TIME ZONE 'UTC';

ALTER TABLE "NotificationPreference"
  ALTER COLUMN "createdAt" TYPE timestamp(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE timestamp(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "PasswordResetToken"
  ALTER COLUMN "createdAt" TYPE timestamp(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "expiresAt" TYPE timestamp(3) USING "expiresAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "usedAt" TYPE timestamp(3) USING "usedAt" AT TIME ZONE 'UTC';

ALTER TABLE "Quiz"
  ALTER COLUMN "createdAt" TYPE timestamp(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "publishedAt" TYPE timestamp(3) USING "publishedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "resultsReleasedAt" TYPE timestamp(3) USING "resultsReleasedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE timestamp(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "QuizAnswer"
  ALTER COLUMN "createdAt" TYPE timestamp(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE timestamp(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "QuizAttempt"
  ALTER COLUMN "createdAt" TYPE timestamp(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "gradedAt" TYPE timestamp(3) USING "gradedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "submittedAt" TYPE timestamp(3) USING "submittedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE timestamp(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "QuizGrade"
  ALTER COLUMN "createdAt" TYPE timestamp(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "gradedAt" TYPE timestamp(3) USING "gradedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE timestamp(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "QuizQuestion"
  ALTER COLUMN "createdAt" TYPE timestamp(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE timestamp(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "RefreshToken"
  ALTER COLUMN "createdAt" TYPE timestamp(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "expiresAt" TYPE timestamp(3) USING "expiresAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "revokedAt" TYPE timestamp(3) USING "revokedAt" AT TIME ZONE 'UTC';

ALTER TABLE "Season"
  ALTER COLUMN "createdAt" TYPE timestamp(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "deletedAt" TYPE timestamp(3) USING "deletedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "endDate" TYPE timestamp(3) USING "endDate" AT TIME ZONE 'UTC',
  ALTER COLUMN "startDate" TYPE timestamp(3) USING "startDate" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE timestamp(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "SeasonAdmin"
  ALTER COLUMN "assignedAt" TYPE timestamp(3) USING "assignedAt" AT TIME ZONE 'UTC';

ALTER TABLE "SeasonEnrollment"
  ALTER COLUMN "completedAt" TYPE timestamp(3) USING "completedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "createdAt" TYPE timestamp(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "droppedAt" TYPE timestamp(3) USING "droppedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "enrolledAt" TYPE timestamp(3) USING "enrolledAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "overrideAt" TYPE timestamp(3) USING "overrideAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "resultSetAt" TYPE timestamp(3) USING "resultSetAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE timestamp(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "Session"
  ALTER COLUMN "checkInClosedAt" TYPE timestamp(3) USING "checkInClosedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "checkInOpenAt" TYPE timestamp(3) USING "checkInOpenAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "createdAt" TYPE timestamp(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "startsAt" TYPE timestamp(3) USING "startsAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE timestamp(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "SessionVideoProgress"
  ALTER COLUMN "completedAt" TYPE timestamp(3) USING "completedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "createdAt" TYPE timestamp(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE timestamp(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "SessionVideoQuestion"
  ALTER COLUMN "createdAt" TYPE timestamp(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE timestamp(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "SessionVideoQuestionResponse"
  ALTER COLUMN "answeredAt" TYPE timestamp(3) USING "answeredAt" AT TIME ZONE 'UTC';

ALTER TABLE "StudentDocument"
  ALTER COLUMN "uploadedAt" TYPE timestamp(3) USING "uploadedAt" AT TIME ZONE 'UTC';

ALTER TABLE "StudentProfile"
  ALTER COLUMN "createdAt" TYPE timestamp(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "dateOfBirth" TYPE timestamp(3) USING "dateOfBirth" AT TIME ZONE 'UTC',
  ALTER COLUMN "deletedAt" TYPE timestamp(3) USING "deletedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE timestamp(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "Submission"
  ALTER COLUMN "createdAt" TYPE timestamp(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "reviewedAt" TYPE timestamp(3) USING "reviewedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "submittedAt" TYPE timestamp(3) USING "submittedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE timestamp(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "SubmissionFile"
  ALTER COLUMN "uploadedAt" TYPE timestamp(3) USING "uploadedAt" AT TIME ZONE 'UTC';

ALTER TABLE "User"
  ALTER COLUMN "createdAt" TYPE timestamp(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "dateOfBirth" TYPE timestamp(3) USING "dateOfBirth"::timestamp(3),
  ALTER COLUMN "deletedAt" TYPE timestamp(3) USING "deletedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "graduationOverrideAt" TYPE timestamp(3) USING "graduationOverrideAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "lastLoginAt" TYPE timestamp(3) USING "lastLoginAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "sessionsValidFrom" TYPE timestamp(3) USING "sessionsValidFrom" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE timestamp(3) USING "updatedAt" AT TIME ZONE 'UTC';

DELETE FROM "_prisma_migrations" WHERE migration_name = '20261110070000_timestamptz';
COMMIT;
