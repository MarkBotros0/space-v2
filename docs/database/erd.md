# Database ERD

Generated from `apps/backend/prisma/schema.prisma` by `pnpm --filter @space/backend db:erd`; do not edit by
hand. A unit test (`src/__tests__/erd.test.ts`) fails when this file is stale.

Each diagram draws one domain's tables in full. Tables from another domain appear as `id`-only stubs.
Cardinality: `||--o{` required parent, `|o--o{` nullable FK, `--o|` one-to-one (the FK is unique).
Types ending in `_arr` are arrays.

## 1. Identity & auth

```mermaid
erDiagram
  User |o--o{ User : "graduationOverrideBy"
  User ||--o{ InviteToken : "user"
  User ||--o{ InviteToken : "invitedBy"
  User ||--o{ RefreshToken : "user"
  User ||--o{ PasswordResetToken : "user"
  User ||--o| StudentProfile : "user"
  User ||--o| NotificationPreference : "user"
  User ||--o{ DeviceToken : "user"
  User {
    Int id PK
    String email UK
    String name
    String passwordHash "nullable"
    UserRole role
    Int graduationYear "nullable"
    DateTime graduationOverrideAt "nullable"
    Int graduationOverrideById FK "nullable"
    String graduationOverrideReason "nullable"
    String phone "nullable"
    DateTime dateOfBirth "nullable"
    String address "nullable"
    String avatarPath "nullable"
    DateTime lastLoginAt "nullable"
    DateTime sessionsValidFrom "nullable"
    DateTime deletedAt "nullable"
    DateTime createdAt
    DateTime updatedAt
  }
  InviteToken {
    Int id PK
    String tokenHash UK
    Int userId FK
    Int invitedById FK
    DateTime expiresAt
    DateTime usedAt "nullable"
    DateTime createdAt
  }
  RefreshToken {
    Int id PK
    String tokenHash UK
    Int userId FK
    DateTime expiresAt
    DateTime revokedAt "nullable"
    DateTime createdAt
  }
  PasswordResetToken {
    Int id PK
    String tokenHash UK
    Int userId FK
    DateTime expiresAt
    DateTime usedAt "nullable"
    DateTime createdAt
  }
  StudentProfile {
    Int id PK
    Int userId FK, UK
    String university "nullable"
    String faculty "nullable"
    Int universityGraduationYear "nullable"
    String notes "nullable"
    DateTime createdAt
    DateTime updatedAt
  }
  NotificationPreference {
    Int id PK
    Int userId FK, UK
    Boolean assignmentCreated
    Boolean submissionReviewed
    Boolean sessionRescheduled
    Boolean lowAttendanceFlag
    Boolean mentorFollowup
    Boolean quizGraded
    Boolean quizPublished
    Boolean submissionReceived
    Boolean sessionCancelled
    Boolean announcement
    DateTime createdAt
    DateTime updatedAt
  }
  DeviceToken {
    Int id PK
    Int userId FK
    String token UK
    DevicePlatform platform
    DateTime lastSeenAt
    DateTime createdAt
  }
  RateLimitHit {
    String key PK
    Int hits
    DateTime resetAt
  }
  SchedulerLease {
    String name PK
    DateTime lockedUntil
    DateTime lastRunAt "nullable"
    DateTime createdAt
    DateTime updatedAt
  }
```

## 2. Seasons, groups & enrolment

```mermaid
erDiagram
  User |o--o{ Season : "createdBy"
  User |o--o{ Season : "updatedBy"
  Season ||--o{ SeasonAdmin : "season"
  User ||--o{ SeasonAdmin : "user"
  User |o--o{ SeasonAdmin : "assignedBy"
  Season ||--o{ Group : "season"
  Group ||--o{ GroupLeader : "group"
  User ||--o{ GroupLeader : "user"
  Group ||--o{ GroupStudent : "group"
  User ||--o{ GroupStudent : "studentUser"
  User ||--o{ SeasonEnrollment : "studentUser"
  Season ||--o{ SeasonEnrollment : "season"
  Group |o--o{ SeasonEnrollment : "group"
  User |o--o{ SeasonEnrollment : "overrideBy"
  Season {
    Int id PK
    String code UK
    String title
    String program
    String requiredProgram "nullable"
    Boolean graduatesOnPass
    Boolean isCommunityWide
    Int year
    String description "nullable"
    DateTime startDate
    DateTime endDate
    SeasonStatus status
    Int absenceBudgetMinutes
    Int absenceWeightMinutes
    Int createdById FK "nullable"
    Int updatedById FK "nullable"
    DateTime deletedAt "nullable"
    DateTime createdAt
    DateTime updatedAt
  }
  SeasonAdmin {
    Int seasonId PK, FK
    Int userId PK, FK
    DateTime assignedAt
    Int assignedById FK "nullable"
  }
  Group {
    Int id PK
    Int seasonId FK
    String name
    String description "nullable"
    DateTime createdAt
    DateTime updatedAt
  }
  GroupLeader {
    Int groupId PK, FK
    Int userId PK, FK
    DateTime assignedAt
  }
  GroupStudent {
    Int groupId PK, FK
    Int seasonId FK
    Int studentUserId PK, FK
    DateTime enrolledAt
  }
  SeasonEnrollment {
    Int id PK
    Int studentUserId FK
    Int seasonId FK
    Int groupId FK "nullable"
    EnrollmentStatus status
    DateTime enrolledAt
    DateTime completedAt "nullable"
    DateTime droppedAt "nullable"
    String dropReason "nullable"
    EnrollmentResult result "nullable"
    String resultReason "nullable"
    DateTime resultSetAt "nullable"
    Int overrideById FK "nullable"
    DateTime overrideAt "nullable"
    DateTime createdAt
    DateTime updatedAt
  }
  User {
    Int id PK
  }
```

## 3. Sessions, attendance & video

```mermaid
erDiagram
  Season ||--o{ Session : "season"
  Session |o--o{ SessionVideoQuestion : "session"
  AssignmentPart |o--o{ SessionVideoQuestion : "assignmentPart"
  User |o--o{ SessionVideoQuestion : "createdBy"
  SessionVideoQuestion ||--o{ SessionVideoQuestionResponse : "question"
  User ||--o{ SessionVideoQuestionResponse : "studentUser"
  Session ||--o{ SessionVideoProgress : "session"
  User ||--o{ SessionVideoProgress : "studentUser"
  Session ||--o{ Attendance : "session"
  User ||--o{ Attendance : "studentUser"
  User |o--o{ Attendance : "markedBy"
  Session {
    Int id PK
    Int seasonId FK
    String title
    DateTime startsAt
    Int durationMinutes
    String location "nullable"
    String youtubeUrl "nullable"
    String description "nullable"
    String recurrenceGroupId "nullable"
    String checkInToken UK "nullable"
    DateTime checkInOpenAt "nullable"
    DateTime checkInClosedAt "nullable"
    DateTime createdAt
    DateTime updatedAt
  }
  Attendance {
    Int id PK
    Int sessionId FK
    Int studentUserId FK
    AttendanceStatus status
    String notes "nullable"
    Int markedById FK "nullable"
    DateTime markedAt
    DateTime checkedInAt "nullable"
    Int lateMinutes "nullable"
    DateTime createdAt
    DateTime updatedAt
  }
  SessionVideoQuestion {
    Int id PK
    Int sessionId FK "nullable"
    Int assignmentPartId FK "nullable"
    Int atSeconds
    String prompt
    String_arr options
    Int correctIndex
    Int points
    Int createdById FK "nullable"
    DateTime createdAt
    DateTime updatedAt
  }
  SessionVideoQuestionResponse {
    Int id PK
    Int questionId FK
    Int studentUserId FK
    Int selectedIndex
    Boolean isCorrect
    DateTime answeredAt
  }
  SessionVideoProgress {
    Int id PK
    Int sessionId FK
    Int studentUserId FK
    Int furthestSeconds
    DateTime completedAt "nullable"
    DateTime createdAt
    DateTime updatedAt
  }
  AssignmentPart {
    Int id PK
  }
  Season {
    Int id PK
  }
  User {
    Int id PK
  }
```

## 4. Assignments & submissions

```mermaid
erDiagram
  Season ||--o{ Assignment : "season"
  User |o--o{ Assignment : "createdBy"
  User |o--o{ Assignment : "updatedBy"
  Assignment ||--o{ AssignmentPart : "assignment"
  Assignment ||--o{ Submission : "assignment"
  User ||--o{ Submission : "studentUser"
  Submission ||--o| SubmissionStaffMark : "submission"
  User |o--o{ SubmissionStaffMark : "markedBy"
  AssignmentPart ||--o{ AssignmentPartWork : "part"
  Submission ||--o{ AssignmentPartWork : "submission"
  User ||--o{ AssignmentPartWork : "studentUser"
  User |o--o{ AssignmentPartWork : "reviewedBy"
  AssignmentPartWork ||--o{ SubmissionFile : "partWork"
  AssignmentPartWork ||--o{ ForumComment : "partWork"
  User ||--o{ ForumComment : "authorUser"
  Assignment {
    Int id PK
    Int seasonId FK
    String title
    String description "nullable"
    DateTime dueAt "nullable"
    Boolean reminderEnabled
    Int reminderDays
    ReminderAnchor reminderAnchor
    String reminderTime
    DateTime remindAt "nullable"
    DateTime remindedAt "nullable"
    Int createdById FK "nullable"
    Int updatedById FK "nullable"
    DateTime deletedAt "nullable"
    DateTime createdAt
    DateTime updatedAt
  }
  AssignmentPart {
    Int id PK
    Int assignmentId FK
    Int position
    AssignmentPartKind kind
    String title "nullable"
    String youtubeId "nullable"
    String youtubeUrl "nullable"
    Int durationSeconds "nullable"
    Boolean blockSkipping
    String prompt "nullable"
    Int minWords "nullable"
    Int maxWords "nullable"
    Int maxFileSizeMb "nullable"
    String_arr allowedMimeCategories
    Boolean postToRead
    Boolean allowComments
    DateTime createdAt
    DateTime updatedAt
  }
  Submission {
    Int id PK
    String publicId UK
    Int assignmentId FK
    Int studentUserId FK
    DateTime submittedAt "nullable"
    DateTime completedAt "nullable"
    DateTime createdAt
    DateTime updatedAt
  }
  SubmissionStaffMark {
    Int submissionId PK, FK
    Int markedById FK "nullable"
    DateTime markedAt
    DateTime createdAt
    DateTime updatedAt
  }
  AssignmentPartWork {
    Int id PK
    String publicId UK
    Int partId FK
    Int submissionId FK
    Int studentUserId FK
    String text "nullable"
    SubmissionStatus status
    DateTime submittedAt "nullable"
    DateTime reviewedAt "nullable"
    String feedback "nullable"
    Int reviewedById FK "nullable"
    Json watchedIntervals
    Int watchedSeconds
    Int furthestSeconds
    DateTime lastReportAt "nullable"
    DateTime doneAt "nullable"
    DateTime createdAt
    DateTime updatedAt
  }
  SubmissionFile {
    Int id PK
    Int partWorkId FK
    String originalName
    String storagePath
    String mimeType
    Int sizeBytes
    DateTime uploadedAt
  }
  ForumComment {
    Int id PK
    Int partWorkId FK
    Int authorUserId FK
    String body
    DateTime createdAt
    DateTime updatedAt
  }
  Season {
    Int id PK
  }
  User {
    Int id PK
  }
```

## 5. Quizzes

```mermaid
erDiagram
  Season ||--o{ Quiz : "season"
  Session |o--o{ Quiz : "session"
  User |o--o{ Quiz : "createdBy"
  User |o--o{ Quiz : "resultsReleasedBy"
  Quiz ||--o{ QuizGrade : "quiz"
  User ||--o{ QuizGrade : "studentUser"
  User |o--o{ QuizGrade : "gradedBy"
  Quiz ||--o{ QuizQuestion : "quiz"
  Quiz ||--o{ QuizAttempt : "quiz"
  User ||--o{ QuizAttempt : "studentUser"
  User |o--o{ QuizAttempt : "gradedBy"
  User |o--o{ QuizAttempt : "endedBy"
  QuizAttempt ||--o{ QuizAttemptEvent : "attempt"
  QuizAttempt ||--o{ QuizAnswer : "attempt"
  QuizQuestion ||--o{ QuizAnswer : "question"
  QuizQuestion ||--o{ QuizOption : "question"
  QuizOption |o--o{ QuizOption : "match"
  QuizQuestion ||--o{ QuizBlank : "question"
  QuizAnswer ||--o{ QuizAnswerSelection : "answer"
  QuizOption ||--o{ QuizAnswerSelection : "option"
  QuizOption |o--o{ QuizAnswerSelection : "matchedOption"
  QuizAnswer ||--o{ QuizAnswerBlank : "answer"
  QuizBlank ||--o{ QuizAnswerBlank : "blank"
  Quiz {
    Int id PK
    Int seasonId FK
    Int sessionId FK "nullable"
    String title
    QuizKind kind
    Int maxScore
    Boolean shuffleQuestions
    DateTime publishedAt "nullable"
    Int createdById FK "nullable"
    DateTime resultsReleasedAt "nullable"
    Int resultsReleasedById FK "nullable"
    DateTime startsFrom "nullable"
    DateTime startsUntil "nullable"
    Int timeLimitMinutes "nullable"
    DateTime createdAt
    DateTime updatedAt
  }
  QuizGrade {
    Int id PK
    Int quizId FK
    Int studentUserId FK
    Decimal score "nullable"
    String notes "nullable"
    Int gradedById FK "nullable"
    DateTime gradedAt "nullable"
    DateTime createdAt
    DateTime updatedAt
  }
  QuizQuestion {
    Int id PK
    Int quizId FK
    Int order
    QuizQuestionType type
    String prompt
    Int points
    String_arr options
    Int correctIndex "nullable"
    DateTime createdAt
    DateTime updatedAt
  }
  QuizOption {
    Int id PK
    Int questionId FK
    Int position
    String label
    Boolean isCorrect
    QuizOptionSide side "nullable"
    Int matchId FK "nullable"
    DateTime createdAt
    DateTime updatedAt
  }
  QuizBlank {
    Int id PK
    Int questionId FK
    Int position
    String expected
    DateTime createdAt
    DateTime updatedAt
  }
  QuizAttempt {
    Int id PK
    Int quizId FK
    Int studentUserId FK
    Int attemptNumber
    QuizAttemptStatus status
    Decimal autoScore "nullable"
    Decimal manualScore "nullable"
    Decimal totalScore "nullable"
    Int shuffleSeed
    DateTime submittedAt "nullable"
    Int gradedById FK "nullable"
    DateTime gradedAt "nullable"
    DateTime deadlineAt "nullable"
    QuizAttemptEndReason endReason "nullable"
    Int endedById FK "nullable"
    DateTime createdAt
    DateTime updatedAt
  }
  QuizAttemptEvent {
    Int id PK
    Int attemptId FK
    QuizAttemptEventKind kind
    String clientEventId
    DateTime leftAt
    DateTime returnedAt "nullable"
    DateTime createdAt
  }
  QuizAnswer {
    Int id PK
    Int attemptId FK
    Int questionId FK
    Int selectedIndex "nullable"
    String text "nullable"
    Boolean isCorrect "nullable"
    Decimal pointsAwarded "nullable"
    DateTime createdAt
    DateTime updatedAt
  }
  QuizAnswerSelection {
    Int answerId PK, FK
    Int optionId PK, FK
    Int matchedOptionId FK "nullable"
    DateTime createdAt
    DateTime updatedAt
  }
  QuizAnswerBlank {
    Int answerId PK, FK
    Int blankId PK, FK
    String text
    Boolean isCorrect "nullable"
    DateTime createdAt
    DateTime updatedAt
  }
  Season {
    Int id PK
  }
  Session {
    Int id PK
  }
  User {
    Int id PK
  }
```

## 6. Notes, follow-ups, notifications, announcements, events

```mermaid
erDiagram
  User ||--o{ EngagementNote : "studentUser"
  User ||--o{ EngagementNote : "authorUser"
  Season |o--o{ EngagementNote : "season"
  User ||--o{ MentorFollowUp : "mentorUser"
  User ||--o{ MentorFollowUp : "studentUser"
  User ||--o{ Notification : "user"
  User |o--o{ JpcEvent : "createdBy"
  Season |o--o{ JpcEvent : "season"
  Season |o--o{ Announcement : "season"
  User |o--o{ Announcement : "author"
  Announcement ||--o{ AnnouncementRead : "announcement"
  User ||--o{ AnnouncementRead : "user"
  EngagementNote {
    Int id PK
    Int studentUserId FK
    Int authorUserId FK
    Int seasonId FK "nullable"
    String body
    NoteVisibility visibility
    Boolean followUpFlagged
    DateTime createdAt
    DateTime updatedAt
  }
  MentorFollowUp {
    Int id PK
    Int mentorUserId FK
    Int studentUserId FK
    String reason "nullable"
    DateTime createdAt
    DateTime updatedAt
    DateTime dueAt
    DateTime remindedAt "nullable"
    DateTime doneAt "nullable"
  }
  Notification {
    Int id PK
    Int userId FK
    NotificationType type
    String title
    String body "nullable"
    String link "nullable"
    DateTime readAt "nullable"
    DateTime createdAt
  }
  JpcEvent {
    Int id PK
    String title
    DateTime date
    DateTime endDate "nullable"
    String description "nullable"
    String url "nullable"
    JpcVisibility visibility
    Int seasonId FK "nullable"
    Int createdById FK "nullable"
    DateTime createdAt
    DateTime updatedAt
  }
  Announcement {
    Int id PK
    AnnouncementAudience audience
    Int seasonId FK "nullable"
    String body
    Int authorId FK "nullable"
    DateTime createdAt
    DateTime updatedAt
    DateTime editedAt "nullable"
  }
  AnnouncementRead {
    Int announcementId PK, FK
    Int userId PK, FK
    DateTime readAt
  }
  Season {
    Int id PK
  }
  User {
    Int id PK
  }
```

## 7. Announcement polls

```mermaid
erDiagram
  Announcement ||--o| AnnouncementPoll : "announcement"
  User |o--o{ AnnouncementPoll : "closedBy"
  AnnouncementPoll ||--o{ AnnouncementPollOption : "poll"
  AnnouncementPollOption ||--o{ AnnouncementPollVote : "option"
  AnnouncementPoll ||--o{ AnnouncementPollVote : "poll"
  User ||--o{ AnnouncementPollVote : "user"
  AnnouncementPoll {
    Int id PK
    Int announcementId FK, UK
    Boolean allowsMultiple
    Int version
    DateTime closedAt "nullable"
    Int closedById FK "nullable"
    DateTime createdAt
    DateTime updatedAt
  }
  AnnouncementPollOption {
    Int id PK
    Int pollId FK
    String label
    Int position
    DateTime createdAt
    DateTime updatedAt
  }
  AnnouncementPollVote {
    Int optionId PK, FK
    Int pollId FK
    Int userId PK, FK
    DateTime createdAt
  }
  Announcement {
    Int id PK
  }
  User {
    Int id PK
  }
```

## SQL-only objects

Rules Prisma cannot declare. They live in `prisma/migrations` and are noted on their model in
`schema.prisma`; `schema-snapshot.test.ts` fails if the database has one that is not noted. Never run
`prisma migrate dev` against a migrated database: it would drop them.

| Table | Kind | Name | Definition |
|---|---|---|---|
| Announcement | CHECK | `Announcement_audience_season_check` | `(audience = 'SEASON') = (seasonId IS NOT NULL)` |
| Assignment | CHECK | `Assignment_reminderDays_check` | `reminderDays BETWEEN 1 AND 14` |
| Assignment | CHECK | `Assignment_reminderTime_check` | `reminderTime ~ '^[0-2][0-9]:[0-5][0-9]$'` |
| Assignment | INDEX | `Assignment_remind_due_idx` | `(remindAt) WHERE remindedAt IS NULL AND deletedAt IS NULL` |
| AssignmentPart | CHECK | `AssignmentPart_video_check` | `kind <> VIDEO OR youtubeId IS NOT NULL` |
| AssignmentPart | CHECK | `AssignmentPart_prompt_check` | `kind NOT IN (ESSAY, FORUM) OR prompt IS NOT NULL` |
| AssignmentPart | CHECK | `AssignmentPart_words_check` | `minWords <= maxWords` |
| AssignmentPart | CHECK | `AssignmentPart_allowedMimeCategories_check` | `allowedMimeCategories <@ {image, pdf, doc, audio, video, text}` |
| AssignmentPart | UNIQUE INDEX | `AssignmentPart_one_forum` | `(assignmentId) WHERE kind = FORUM` |
| AssignmentPartWork | INDEX | `AssignmentPartWork_queue_idx` | `(status, submittedAt DESC NULLS LAST, id DESC) WHERE status <> 'DRAFT' (the review queue and the mentor's handed-in feed)` |
| AssignmentPartWork | INDEX | `AssignmentPartWork_reviewed_idx` | `(reviewedAt DESC, id DESC) WHERE reviewedAt IS NOT NULL (the mentor's reviewed feed)` |
| MentorFollowUp | UNIQUE INDEX | `MentorFollowUp_one_open` | `(mentorUserId, studentUserId) WHERE doneAt IS NULL` |
| MentorFollowUp | INDEX | `MentorFollowUp_due_open_idx` | `(dueAt) WHERE doneAt IS NULL AND remindedAt IS NULL` |
| Quiz | CHECK | `Quiz_timeLimitMinutes_check` | `timeLimitMinutes IS NULL OR timeLimitMinutes BETWEEN 1 AND 300` |
| Quiz | CHECK | `Quiz_start_window_check` | `startsFrom IS NULL OR startsUntil IS NULL OR startsFrom < startsUntil` |
| QuizAttempt | UNIQUE INDEX | `QuizAttempt_one_in_progress_key` | `(quizId, studentUserId) WHERE status = 'IN_PROGRESS'` |
| QuizAttempt | INDEX | `QuizAttempt_deadline_open_idx` | `(deadlineAt) WHERE status = 'IN_PROGRESS' AND deadlineAt IS NOT NULL` |
| QuizAttempt | CHECK | `QuizAttempt_totalScore_check` | `totalScore IS NULL OR totalScore = coalesce(autoScore, 0) + coalesce(manualScore, 0)` |
| QuizQuestion | CHECK | `QuizQuestion_points_check` | `points >= 0` |
| Season | CHECK | `Season_endDate_check` | `endDate >= startDate` |
| Season | CHECK | `Season_absenceMinutes_check` | `absenceBudgetMinutes >= 0 AND absenceWeightMinutes > 0` |
| Session | CHECK | `Session_durationMinutes_check` | `durationMinutes > 0` |
| SessionVideoQuestion | CHECK | `SessionVideoQuestion_points_check` | `points >= 0` |
| SessionVideoQuestion | CHECK | `SessionVideoQuestion_correctIndex_check` | `0 <= correctIndex < cardinality(options)` |
| SessionVideoQuestion | CHECK | `SessionVideoQuestion_owner_check` | `num_nonnulls(sessionId, assignmentPartId) = 1` |
| User | CHECK | `User_email_lowercase_check` | `email = lower(email) (so the unique is case-insensitive in effect; write it trimmed and lowercased)` |
