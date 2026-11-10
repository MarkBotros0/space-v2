# Multi-part assignments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn single-type assignments into assignments made of Video, Essay and Forum parts, with watch tracking that locks Submit, per-essay review, a checklist for students, a Details/Parts form for admins, and configurable reminders on the in-backend scheduler.

**Architecture:** An `Assignment` owns ordered `AssignmentPart`s. Each student's work on a part is one `AssignmentPartWork` row (essay text and review, forum post, or video watch intervals); the per-assignment `Submission` row only records Submit. Completion rules are pure functions in `packages/shared` used by both the server (which enforces them) and the app (which shows them). Session video questions are generalised to hang off a session **or** a video part. Reminders are a handler on the scheduler from the backend-scheduler plan.

**Tech Stack:** Express 5, Prisma 7, Zod (`packages/shared`), Expo + expo-router, React Query, NativeWind, `react-native-youtube-iframe` 2.4.1, Jest, Maestro (sweep).

**Spec:** `docs/superpowers/specs/2026-11-10-multi-part-assignments-design.md` (approved 2026-11-10). **Prerequisite:** `docs/superpowers/plans/2026-11-10-backend-scheduler.md` is merged (this plan uses `registerHandler`, `REMINDER_HOUR`).

## Global Constraints

- Part kinds: `VIDEO`, `ESSAY`, `FORUM`; any mix; **at most one FORUM per assignment**; at least one part to save.
- No linked session, no group targeting: an assignment is for the whole season (`seasonParticipant`, `docs/rules/community-model.md`). The forum stays scoped to the student's group as today.
- Watched = watched seconds ≥ **90%** of the video's length; watched intervals merged so a re-watched stretch counts once; a report claiming more new watched time than wall-clock time since the previous one (+2 s slack) is clamped to the wall-clock time.
- **Every part done, videos included, before Submit is accepted** (owner). Video done = watched **and** every timed question answered.
- Each essay reviewed on its own: Mark reviewed (feedback optional) or Return (note required); returning one essay reopens only it.
- Essays become SUBMITTED on the assignment's first Submit; a returned essay is handed in again on its own (`hand-in`), with no second Submit.
- Reminder: on/off, `days` (1–14) before `NEXT_SESSION | DUE_DATE`, at `time` (`HH:mm`, org clock); default on, 2, `NEXT_SESSION`, `"09:00"`; sent to season participants whose assignment is not submitted; once per assignment per student; copy says "around".
- Existing assignment data is not kept (owner: "Don't bother about the existing assignments"): migrations may delete it. This is the planned destructive change; say so in each migration's commit.
- UI: spec section "UI and code standards" is binding (kit components only, words for every state, no " · " lines, `plural()`, tokens only, 4.5:1 / 3:1, ≥ 44pt targets, no new motion, `SaveBar` footers, `ConfirmDialog`, `SegmentedControl`, lucide `PlayCircle` / `PenLine` / `MessagesSquare`).
- Standards: root `CLAUDE.md` "Code & Data Standards" (400 lines/file, no `$transaction` in routes, `ApiError` below routes, soft-delete helpers, migrations with `rollback.sql`, query indexes), `apps/mobile/CLAUDE.md` layers (screens never import axios/`api-client`), relative imports, Prettier. `pnpm check` green at every commit.
- Commits authored as `jesusprojectcommunity`, ending with the session's attribution lines; one concern each. Push nothing without asking. Backend and app ship together: the TestFlight build on today's API stops working when this backend deploys, accepted because the app is unpublished.

## Review Focus

1. **A student scrubs a 20-minute video to the end** with skipping allowed: progress shows the real watched minutes, Submit stays locked, the leave notice explains skipped parts don't count. Pinned in Task 5 (`jumping to the end is not watching`).
2. **Two progress reports arrive out of order or overlap** (retry after a flaky network): intervals merge, watched seconds never double-count or go down. Pinned in Task 1 (`mergeIntervals` cases) and Task 5 (`overlapping and repeated reports count once`).
3. **The admin adds a part after some students submitted**: they are told how many, those students' assignments reopen and get the reminder again; changing a word range never reopens handed-in essays. Pinned in Task 3 (`adding a part reopens submitted work after confirmation`, `a word-range change keeps handed-in essays`).
4. **The next session moves** (rescheduled, deleted or a new earlier one added) before the reminder went out: `remindAt` follows it; a season with no upcoming session sends nothing and says so. Pinned in Task 8 (`remindAt follows the next session`).
5. **An essay at the word limit counted differently by app and server** (pasted line breaks, HTML from the editor): both use `countWords` from `packages/shared` on the same plain text. Pinned in Task 1 (`wordRangeIssue` cases) and Task 6 (`hand-in refuses outside the range with the server's count`).

---

### Task 1: Shared contracts and the completion rules

**Files:**
- Modify: `packages/shared/src/assignment.ts`, `packages/shared/src/submission.ts`, `packages/shared/src/forum.ts` (`countWords` stays the one word counter), `packages/shared/src/video-quiz.ts`, `packages/shared/src/enums.ts` (drop `assignmentTypeSchema`; add `assignmentPartKindSchema`, `reminderAnchorSchema`), `packages/shared/src/index.ts`
- Create: `packages/shared/src/assignment-parts.ts` (part schemas), `packages/shared/src/assignment-progress.ts` (pure rules)
- Test: `packages/shared/src/__tests__/assignment-progress.test.ts`, `packages/shared/src/__tests__/assignment-write.test.ts` (rewrite)

**Interfaces:**
- Produces:
  - `assignmentPartInputSchema` = discriminated union on `kind`:
    - `VIDEO`: `{ id?: number; kind; title: string(1..200); youtubeUrl: string (parseYouTubeId must succeed, message "That isn't a YouTube link"); blockSkipping: boolean }`
    - `ESSAY`: `{ id?; kind; prompt: string(1..2000); minWords: int(1..5000)|null; maxWords: int(1..5000)|null (min ≤ max, "The minimum is more than the maximum"); maxFileSizeMb: int|null; allowedMimeCategories: MimeCategory[] }`
    - `FORUM`: `{ id?; kind; prompt: string(1..2000); minWords: int|null; postToRead: boolean; allowComments: boolean }`
  - `assignmentWriteRequestSchema`: `{ title; description: string|null; dueDay: "YYYY-MM-DD"|null; dueTime: "HH:mm"|null; reminder: { enabled: boolean; days: int(1..14); anchor: "NEXT_SESSION"|"DUE_DATE"; time: "HH:mm" }; parts: AssignmentPartInput[] (1..20, ≤1 FORUM: "One forum per assignment"); confirm?: boolean }`. `DUE_DATE` anchor requires `dueDay` ("Set a due date first").
  - `partWorkSchema` (per part, for the student and the leader): `{ partId; kind; status: "NOT_STARTED"|"IN_PROGRESS"|"DONE"|"RETURNED"; essay?: { publicId; wordCount; reviewStatus: "DRAFT"|"SUBMITTED"|"REVIEWED"|"RETURNED"; feedback: string|null }; video?: { watchedSeconds; durationSeconds; answered; questionCount; correct }; forum?: { posted: boolean } }`
  - `assignmentDetailSchema`: `{ id; seasonId; title; description; dueAt; dueOrgDay; dueOrgTime; isOverdue; reminder; reminderLine: string|null; parts: AssignmentPart[] (input shape + id + position + videoId + durationSeconds); my: { submittedAt; parts: PartWork[] } | null; canManage; readOnly }`
  - `assignmentProgressSchema` (leader view): `{ rows: { studentUserId; name; avatarPath; submittedAt; parts: PartWork[] }[] }`; `submissionQueueItemSchema` items become essays: `{ publicId (the essay work's); assignmentId; assignmentTitle; prompt; studentName; submittedAt; isLate; reviewStatus }`.
  - Pure rules (assignment-progress.ts), each with exact behaviour pinned by its tests:
    - `mergeIntervals(a: [number,number][], b: [number,number][]): [number,number][]` (sorted, overlapping/touching merged, clamped to ≥ 0)
    - `watchedSeconds(intervals): number`
    - `isWatched(watched: number, duration: number): boolean` (`duration > 0 && watched >= 0.9 * duration`)
    - `wordRangeIssue(text: string, min: number|null, max: number|null): null | { kind: "short"|"long"; by: number }`
    - `partDone(part, work): boolean`, `partsLeft(parts, works): number`, `canSubmit(parts, works): boolean`
    - `submitBlockerLine(parts, works, partTitles): string|null`, e.g. "Finish Luke 15 talk (12 min left) and the forum post to submit" (uses `plural`-style joining with ", " and " and ", never " · ")

- [ ] **Step 1: Write the failing tests** (`assignment-progress.test.ts`)

```ts
it("mergeIntervals joins overlaps and touching ranges and keeps order", () => {
  expect(mergeIntervals([[0, 60]], [[50, 120], [300, 320], [120, 130]])).toEqual([[0, 130], [300, 320]]);
});
it("overlapping and repeated ranges count once", () => {
  expect(watchedSeconds(mergeIntervals([[0, 100]], [[0, 100], [90, 100]]))).toBe(100);
});
it("isWatched needs 90%", () => {
  expect(isWatched(971, 1080)).toBe(false);
  expect(isWatched(972, 1080)).toBe(true);
  expect(isWatched(0, 0)).toBe(false);
});
it("wordRangeIssue counts like the server", () => {
  expect(wordRangeIssue("one  two\nthree", 4, null)).toEqual({ kind: "short", by: 1 });
  expect(wordRangeIssue("a b c d e", null, 3)).toEqual({ kind: "long", by: 2 });
  expect(wordRangeIssue("a b c", 3, 3)).toBeNull();
});
it("canSubmit is false while a video is short of 90%, true when every part is done", () => { /* build 3 parts + works */ });
it("submitBlockerLine names what is left", () => {
  expect(submitBlockerLine(parts, works)).toBe("Finish Luke 15 talk (12 min left) and the forum post to submit");
});
```

And in `assignment-write.test.ts`: two FORUM parts → "One forum per assignment"; zero parts → "Add at least one part"; `anchor: "DUE_DATE"` with `dueDay: null` → "Set a due date first"; minWords 300 > maxWords 150 → "The minimum is more than the maximum"; a non-YouTube link → "That isn't a YouTube link".

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @space/shared exec jest src/__tests__/assignment-progress.test.ts src/__tests__/assignment-write.test.ts`
Expected: FAIL, missing exports.

- [ ] **Step 3: Implement the schemas and rules** as in Interfaces. Delete `refineTargeting`, `normalizeAssignmentWrite`'s forum/file nulling, `groupIds`, `sessionId`, `type`, and `assignmentTrackerSchema` (replaced by `assignmentProgressSchema`). Keep `isAssignmentOutstanding` but redefine it over `{ submittedAt, partsLeft, returned }`.

- [ ] **Step 4: Run the shared tests**

Run: `pnpm --filter @space/shared exec jest`
Expected: PASS. (Backend and mobile typecheck will now fail; Tasks 2–13 fix them. Commit on the feature branch anyway.)

- [ ] **Step 5: Commit** — `feat(shared): multi-part assignment contracts and completion rules`

### Task 2: Schema migrations (planned destructive change)

**Files:**
- Create migrations (one concern each, `BEGIN; … COMMIT;`, `rollback.sql` each), after `20261112000000_scheduler_lease`:
  1. `20261113000000_assignment_drop_single_type`: delete all assignment data (`DELETE FROM "ForumComment"; DELETE FROM "SubmissionFile"; DELETE FROM "Submission"; DELETE FROM "AssignmentTarget"; DELETE FROM "Assignment";`), drop `AssignmentTarget`, drop columns `sessionId`, `type`, `isAllGroups`, `forumMinWords`, `forumAllowComments`, `forumPostToRead`, `maxFileSizeMb`, `allowedMimeCategories` (and its CHECK), drop enum `AssignmentType`.
  2. `20261113000100_assignment_reminder`: enum `ReminderAnchor (NEXT_SESSION, DUE_DATE)`; columns `reminderEnabled bool default true`, `reminderDays int default 2 CHECK 1..14`, `reminderAnchor default NEXT_SESSION`, `reminderTime text default '09:00' CHECK ~ '^[0-2][0-9]:[0-5][0-9]$'`, `remindAt timestamptz null`, `remindedAt timestamptz null`; partial index `Assignment_remind_due_idx (remindAt) WHERE "remindedAt" IS NULL AND "deletedAt" IS NULL` (`// SQL-only`).
  3. `20261113000200_assignment_part`: enum `AssignmentPartKind`; table `AssignmentPart` (`id`, `assignmentId` FK cascade, `position int`, `kind`, `title`, `youtubeId`, `youtubeUrl`, `durationSeconds int`, `blockSkipping bool default false`, `prompt`, `minWords`, `maxWords`, `maxFileSizeMb`, `allowedMimeCategories text[] default '{}'`, `postToRead bool default true`, `allowComments bool default false`, `createdAt`, `updatedAt`); index `(assignmentId, position)`; CHECKs: VIDEO needs `youtubeId`; ESSAY/FORUM need `prompt`; `minWords <= maxWords`; partial unique `AssignmentPart_one_forum (assignmentId) WHERE kind = 'FORUM'`.
  4. `20261113000300_assignment_part_work`: table `AssignmentPartWork` (`id`, `publicId unique`, `partId` FK cascade, `submissionId` FK cascade, `studentUserId` FK restrict, `text`, `status SubmissionStatus default DRAFT`, `submittedAt`, `reviewedAt`, `feedback`, `reviewedById` FK set null, `watchedIntervals jsonb default '[]'`, `watchedSeconds int default 0`, `furthestSeconds int default 0`, `lastReportAt`, `doneAt`, `createdAt`, `updatedAt`); unique `(partId, studentUserId)`; indexes `(submissionId)`, `(studentUserId)`, `(partId, status)`, `(reviewedById)`. `Submission`: drop `text`, `status`, `feedback`, `reviewedAt`, `reviewedById`; keep `publicId`, `submittedAt`; add `completedAt`. `SubmissionFile.submissionId` → `partWorkId` (FK to `AssignmentPartWork`); `ForumComment.submissionId` → `partWorkId`.
  5. `20261113000400_video_question_part`: `SessionVideoQuestion.sessionId` nullable, add `assignmentPartId` FK cascade + index `(assignmentPartId, atSeconds)`, CHECK `num_nonnulls("sessionId","assignmentPartId") = 1`.
- Modify: `apps/backend/prisma/schema.prisma`, `docs/database/erd.md`, `apps/backend/src/__tests__/schema-conformance.test.ts` (drop `AssignmentTarget` from its lists, add the new tables where its lists need them)
- Test: `src/__tests__/integration/schema-snapshot.test.ts` (update with `-u`), `src/__tests__/erd.test.ts`, `schema-conformance.test.ts`

- [ ] **Step 1:** Write the five migrations and rollbacks; mirror them in `schema.prisma` with `// SQL-only` notes for the CHECKs, the partial indexes and the one-forum unique.
- [ ] **Step 2:** Cycle apply → rollback → apply on a throwaway database (`docker run` Postgres on a free port; `DATABASE_URL=… pnpm --filter @space/backend db:migrate:deploy`, then run each `rollback.sql` newest first, then deploy again). Expected: every step exits 0.
- [ ] **Step 3:** `pnpm --filter @space/backend db:generate`, update `docs/database/erd.md`, run `jest src/__tests__/schema-conformance.test.ts src/__tests__/erd.test.ts` and the snapshot test with `-u`. Expected: PASS, snapshot diff shows only these tables and columns.
- [ ] **Step 4: Commit** — `feat(db): assignment parts, part work and reminder columns (drops single-type assignment data, owner ruling 2026-11-10)`

### Task 3: Assignment writes with parts

**Files:**
- Rewrite: `apps/backend/src/lib/assignment-writes.ts` → split into `apps/backend/src/lib/assignments/writes.ts` (create/replace in one transaction), `apps/backend/src/lib/assignments/part-changes.ts` (diff + impact), `apps/backend/src/lib/assignments/reminder.ts` (Task 8 fills it; this task adds the signature and calls it)
- Modify: `apps/backend/src/routes/seasons/children.ts` (`createSeasonAssignment`), `apps/backend/src/routes/assignments.ts` (`PATCH`, `DELETE`), `apps/backend/src/lib/seasons/duplicate.ts` (`cloneAssignments` copies parts, no session/targets), `apps/backend/src/lib/groups/writes.ts` and `apps/backend/src/lib/queries/groups/read.ts` (drop the sole-target rule and `soleTargetAssignments`), `apps/backend/src/docs/paths/assignments.ts`
- Test: `src/__tests__/integration/assignment-writes-create-routes.test.ts`, `assignment-writes-update-routes.test.ts`, `assignment-writes-setup.ts`, `seasons-duplicate-routes.test.ts`, `group-admin-routes.test.ts`

**Interfaces:**
- Consumes: `assignmentWriteRequestSchema` (Task 1).
- Produces:
  - `planPartChanges(existing: PartRow[], incoming: AssignmentPartInput[]): { create; update; remove: number[]; resetVideo: number[]; reopensSubmitted: boolean }` (pure; an incoming part with an `id` not in `existing` is a 400 `unknown_part`)
  - `partChangeImpact(assignmentId, plan): Promise<{ students: number }>`: students with work on removed parts, on reset videos, or (when `reopensSubmitted`) with a submission.
  - `createAssignment(seasonId, body, actorId): Promise<{ id: number }>`, `replaceAssignment(id, body, actorId): Promise<{ reopened: number }>` in `lib/assignments/writes.ts`; replace without `body.confirm` and a non-zero impact throws `ApiError(409, "needs_confirmation", "This changes work 3 students have done.", { students: 3 })`.
  - `resolveRemindAt(assignment, now): Promise<Date|null>` (stub returning `null` in this task).
  - Rules: adding a part sets `Submission.submittedAt = null, completedAt = null` for everyone who had submitted; changing a video's `youtubeUrl` deletes that part's works and its question responses; changing `minWords`/`maxWords` changes nothing for handed-in essays; removing a part deletes its works.
  - YouTube duration: the admin form sends it — `AssignmentPartInput` VIDEO gains `durationSeconds: int(1..43200)` read from the in-form player (`getDuration()`); the server stores it (no YouTube API key exists).

- [ ] **Step 1: Write the failing tests** — in the create suite: "creates an assignment with three parts in order", "refuses two forums (400) and zero parts (400)", "refuses a leader (403)", "notifies every season participant once"; in the update suite: "adding a part reopens submitted work after confirmation" (first PATCH → 409 `needs_confirmation` with `students: 1`; with `confirm: true` → 200, the student's `submittedAt` is null), "a word-range change keeps handed-in essays" (essay stays SUBMITTED), "changing a video link resets its progress", "an unknown part id is a 400". Delete every test about `sessionId`, `groupIds`, `type` and targets.
- [ ] **Step 2:** Run `pnpm --filter @space/backend exec jest --config jest.integration.config.js assignment-writes` — FAIL.
- [ ] **Step 3:** Implement as in Interfaces; `targetedStudentIds` becomes `liveStudentIds(seasonId)` from `lib/queries/season-participants.ts` (the `seasonParticipant` roster); `DELETE` keeps its 409 `has_submissions` rule over `Submission`.
- [ ] **Step 4:** Run the suites above plus `seasons-duplicate-routes` and `group-admin-routes` — PASS.
- [ ] **Step 5: Commit** — `feat(backend): assignments are written with their parts`

### Task 4: Assignment reads for students and staff

**Files:**
- Modify: `apps/backend/src/lib/queries/assignments/{detail,student,staff}.ts`, `apps/backend/src/routes/assignments.ts` (`GET /:id`; replace `GET /:id/tracker` with `GET /:id/progress`), `apps/backend/src/routes/seasons/children.ts` (`listSeasonAssignments`)
- Modify (readers of the old shape — each keeps its endpoint and response contract except where named):
  - `lib/dashboard-figures.ts` (`summarizeStudentAssignments` over `isAssignmentOutstanding`), `lib/queries/dashboard/{student,staff,mentor}.ts` (staff "pending review" = essays `SUBMITTED`; mentor feeds = essays `SUBMITTED|REVIEWED|RETURNED`)
  - `lib/queries/me/season-record.ts`, `lib/queries/season-end.ts` (blocker = essay works `SUBMITTED` from active students), `lib/queries/engagement.ts` + `lib/queries/reports/{summary,folds,expected}.ts` (expected = every season participant; completed = `Submission.submittedAt` not null; drop `targeting`), `lib/queries/students/history.ts`, `lib/exports/season-workbook/{load,build,summary}.ts` (status label: "Submitted", "Not submitted", "2 of 3 done"), `lib/students/graduation.ts` (`hasWorkInSeason` = any `AssignmentPartWork`)
- Test: `assignments-routes.test.ts`, `dashboard-routes*.test.ts`, `season-record-routes`, `season-end-check-routes`, `season-end-routes`, `engagement-routes`, `reports-*`, `season-workbook`, `students-history-routes`, and unit `dashboard-figures`, `report-expected`, `student-engagement`, `assignment-read-gate`

**Interfaces:**
- Consumes: Task 1 schemas and rules; Task 2 tables.
- Produces: `loadAssignmentDetail(id, viewer): Promise<AssignmentDetail>`, `loadAssignmentProgress(id, restrictGroupIds?: number[]): Promise<AssignmentProgress>` (not-finished students first, then by name), `loadPartWorks(assignmentId, studentUserId): Promise<PartWork[]>`; student list rows gain `partsTotal`, `partsDone`, `returned: boolean`, `submittedAt`.

- [ ] **Step 1: Write the failing tests** — `assignments-routes`: "a student sees parts in order with their own progress", "a leader's progress lists only their groups, unfinished first", "progress says how far into each video"; each cross-cutting suite's existing expectations rewritten to the new counts (one assertion per suite naming the new rule, e.g. season-end: "an unreviewed essay blocks End; an unwatched video does not").
- [ ] **Step 2:** Run the listed suites — FAIL.
- [ ] **Step 3:** Implement. `studentCanSeeAssignment` becomes "is a season participant"; delete `isAllGroups`/target reads everywhere (`grep -rn "isAllGroups\|assignmentTarget\|\.type ===\|forumMinWords" apps/backend/src` prints nothing outside migrations and `generated/`).
- [ ] **Step 4:** Run the listed suites and `pnpm --filter @space/backend typecheck` — PASS.
- [ ] **Step 5: Commit** — `feat(backend): assignment reads, progress and every count follow the parts`

### Task 5: Video parts (player data, progress, questions)

**Files:**
- Modify: `apps/backend/src/lib/video-quiz/answer.ts`, `lib/video-quiz/questions.ts`, `lib/queries/video-quiz.ts` — generalise over `type VideoOwner = { sessionId: number } | { partId: number }`
- Create: `apps/backend/src/routes/assignments/video.ts` (mounted under `/api/v1/assignments`): `GET /:id/parts/:partId/video`, `PUT /:id/parts/:partId/video/progress`, `POST /:id/parts/:partId/video/answers`, staff `GET|POST /:id/parts/:partId/video-questions`, `PATCH|DELETE /video-questions/:questionId` keeps working for both owners
- Modify: `packages/shared/src/video-quiz.ts` (`videoProgressRequestSchema` for parts: `{ intervals: [number,number][] (≤ 50, each 0 ≤ from < to ≤ 43200), position: int }`; the session endpoint keeps `{ furthestSeconds }`)
- Test: `src/__tests__/integration/assignment-video-routes.test.ts` (new), `video-quiz-student-routes`, `video-quiz-authoring-routes` (still green)

**Interfaces:**
- Consumes: `mergeIntervals`, `watchedSeconds`, `isWatched` (Task 1).
- Produces: `saveVideoPartProgress(partId, studentUserId, intervals, position, now): Promise<PartWork["video"]>` — merges into `watchedIntervals`, clamps new watched time to `(now − lastReportAt) + 2 s` (first report: to the reported span length capped at 60 s), sets `furthestSeconds = max`, sets `doneAt` once `isWatched` and all questions are answered; with `blockSkipping`, intervals starting past `furthestSeconds + 5` are dropped. The order gate and barrier logic for questions are the session ones, unchanged.

- [ ] **Step 1: Write the failing tests:** "jumping to the end is not watching" (report `[[1060,1080]]` on a 1080 s part → watched 20, not done); "overlapping and repeated reports count once"; "a report faster than real time is clamped" (two reports 10 s apart claiming 300 s → +12 s); "done needs 90% and every question answered"; "with blockSkipping, a range past the furthest point is ignored"; "a student of another season gets 403"; "session video quiz still works" (run the existing suite).
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement. **Step 4:** Run `assignment-video-routes`, `video-quiz-student-routes`, `video-quiz-authoring-routes` — PASS.
- [ ] **Step 5: Commit** — `feat(backend): video parts track real watching and carry timed questions`

### Task 6: Essay parts, files and per-essay review

**Files:**
- Modify: `apps/backend/src/routes/submissions/{index,queue,queue-counts,detail,writes,files,editable}.ts` — the queue and detail now serve **essay works** (`:publicId` = `AssignmentPartWork.publicId`); `PUT /submissions/by-assignment/:assignmentId` is removed
- Create: routes `PUT /api/v1/assignments/:id/parts/:partId/essay` (save draft `{ text }`), `POST /api/v1/submissions/:publicId/hand-in` (returned essay only), `POST /api/v1/submissions/:publicId/review` (`{ action: "reviewed"|"return"; feedback: string|null }`, note required for return: "Say what to change")
- Modify: `lib/permissions/submission.ts` (gates over essay works), `lib/submission-notifications.ts` (one SUBMISSION_RECEIVED per Submit naming the assignment; one per hand-in naming the essay), `packages/shared/src/submission.ts`
- Test: `submissions-drafts-routes`, `submissions-queue-routes`, `submissions-review-routes`, `submission-files-routes`, `submissions-setup.ts`, unit `submission-writes`, `submission-notifications`, `submission-queue-counts`, `submission-drafts-hidden`

**Interfaces:**
- Produces: `saveEssayDraft(partId, studentUserId, text)`, `handInEssay(publicId, studentUserId)` (allowed only from `RETURNED`; refuses outside the word range with 400 `word_range` and the server's count in the message, e.g. "This is 142 words; it needs at least 150."), `reviewEssay(publicId, reviewerId, action, feedback)` (`return` sets `RETURNED` and clears `Submission.submittedAt` and `completedAt`; `reviewed` sets `REVIEWED` and sets `completedAt` when every essay of that submission is REVIEWED).

- [ ] **Step 1: Write the failing tests:** "drafts are private until Submit"; "hand-in refuses outside the range with the server's count"; "returning one essay reopens only it" (the other essay stays REVIEWED, video and forum works unchanged, `submittedAt` null); "hand-in again puts only that essay back in the queue and marks the assignment submitted"; "the queue lists one item per essay"; "files attach to the essay and respect its limits".
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement. **Step 4:** Run the listed suites — PASS.
- [ ] **Step 5: Commit** — `feat(backend): essays are drafted, handed in and reviewed one by one`

### Task 7: Forum parts

**Files:**
- Modify: `apps/backend/src/routes/forum.ts` → paths become `/assignments/:id/parts/:partId/forum`, `…/forum/response`, `…/forum/posts/:publicId/comments` (`:publicId` = the post's `AssignmentPartWork.publicId`), `DELETE /forum/comments/:commentId` unchanged; `lib/queries/forum/{shared,feed,comments}.ts` read settings from the part; `lib/permissions/forum.ts` (`forumAudienceFor` without targets: the student's own group; staff by `staffScopeForSeason`); `packages/shared/src/forum.ts`
- Test: `forum-feed-routes`, `forum-response-routes`, `forum-comments-routes`, `forum-post-to-read-routes`, `forum-setup.ts`

- [ ] **Step 1:** Rewrite the suites' setup to create a FORUM part; add "posting marks the forum part done", "a second forum part on the same assignment is impossible (DB unique)". **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS. **Step 5: Commit** — `feat(backend): the forum is a part of an assignment`

### Task 8: Submit, completion and reminders

**Files:**
- Create: route `POST /api/v1/assignments/:id/submit` in `routes/assignments.ts`; `apps/backend/src/lib/assignments/submit.ts`; fill `lib/assignments/reminder.ts`; register the handler in `lib/scheduler/handlers.ts`
- Modify: `lib/sessions/*` writes that create, move, cancel or delete a session (call `refreshSeasonReminders(seasonId, now)` after the write's transaction), `lib/notifications.ts` + `packages/shared/src/notification.ts` (new type `ASSIGNMENT_REMINDER` sharing the `assignmentCreated` preference — no new column; extend `PREF_FIELD` typing accordingly), Prisma enum `NotificationType` (own migration `20261113000500_notification_assignment_reminder`, `ALTER TYPE … ADD VALUE`, no transaction, rollback recreates the enum without it)
- Test: `src/__tests__/integration/assignment-submit-routes.test.ts`, `src/__tests__/integration/assignment-reminders.test.ts`, `src/__tests__/assignment-reminder-unit.test.ts`

**Interfaces:**
- Consumes: `canSubmit` (Task 1), `registerHandler` (scheduler plan).
- Produces:
  - `submitAssignment(assignmentId, studentUserId, now)`: refuses with 409 `not_finished` and the `submitBlockerLine` text when `canSubmit` is false; sets essays DRAFT → SUBMITTED with `submittedAt`, `Submission.submittedAt = now`, and `completedAt = now` when there are no essays.
  - `remindAtFor({ anchor, days, time, dueAt, nextSessionStartsAt }): Date|null` (pure): anchor day minus `days`, at `time` on the org clock; `null` if the anchor is missing or the result is already past at save time.
  - `resolveRemindAt(assignment, now)`: next session = first live session of the season with `startsAt > assignment.createdAt` and `startsAt > now`.
  - `refreshSeasonReminders(seasonId, now)`: recomputes `remindAt` for the season's assignments with `remindedAt IS NULL`.
  - `reminderLine(assignment, remindAt): string|null` for the Details tab: "Tue 11 Nov, around 9:00 AM — students who haven't finished", "No upcoming session yet — no reminder", or `null` when off.
  - Handler `{ name: "assignment-reminders", run }`: claims due assignments (`remindedAt = now WHERE id = … AND remindedAt IS NULL`), notifies season participants whose `Submission.submittedAt` is null (title "Reminder: The Prodigal Son", body "2 parts left before Thursday"), link to the assignment.

- [ ] **Step 1: Write the failing tests:** unit — `remindAtFor` "2 days before Thu 13 Nov at 09:00 Cairo is Tue 11 Nov 07:00Z", "DUE_DATE without a due date is null", "a time already past is null"; integration — "submit is refused while a video is short (409 not_finished with the blocker line)", "submit with every part done hands the essays in and notifies the leader once", "remindAt follows the next session" (move the session → `remindAt` moves; delete it → null and the line says no upcoming session), "the reminder skips students who submitted and goes once" (run the handler twice), "a returned essay makes a student eligible again" (only before the reminder went out — once per assignment).
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** Run the three suites plus `sessions-writes-routes` — PASS.
- [ ] **Step 5: Commit** — `feat(backend): submit checks every part; reminders before the next session`

### Task 9: App data layer

**Files:**
- Modify: `apps/mobile/src/hooks/use-assignments.ts` (`useAssignmentDetail`, `useAssignmentProgress` replacing `useAssignmentTracker`, list hooks), `use-assignment-writes.ts` (create/update send `parts`; update surfaces `needs_confirmation` as a typed result `{ kind: "confirm"; students: number }`), `use-submission.ts` (`useSaveEssayDraft`, `useHandInEssay`, `useSubmitAssignment`, `useReviewEssay`; delete `useEnsureSubmission`), `use-forum.ts` (part paths), `use-video-quiz.ts` (`usePartVideo`, `useSavePartVideoProgress`, `useSubmitPartVideoAnswer`, part question writes), `src/lib/query-keys.ts`, `src/lib/assignment-form-values.ts` (values ↔ body with parts), `src/lib/assignment-labels.ts` (drop `targetLabel`, `configLabel`; add `partKindLabel`, `partStatusLine(part, work): string`)
- Test: `apps/mobile/src/__tests__/assignment-hooks.test.ts`, `assignment-labels.test.ts`, new `assignment-form-values.test.ts`

- [ ] **Step 1:** Tests: "partStatusLine says Watched 6 of 18 min / Draft, 120 words / Returned — needs changes / Posted / Not started"; "toAssignmentBody keeps part order and ids"; "update returns confirm with the student count on 409 needs_confirmation". **Step 2:** FAIL. **Step 3:** Implement (all through `apiGet` / `apiSend`, parsed with the Task 1 schemas). **Step 4:** `pnpm --filter @space/mobile exec jest assignment-hooks assignment-labels assignment-form-values` — PASS. **Step 5: Commit** — `feat(mobile): data layer for multi-part assignments`

### Task 10: Admin form — Details / Parts tabs

**Files:**
- Rewrite: `apps/mobile/src/screens/assignment-form/assignment-form.tsx` (shell: `Screen`, `SegmentedControl` "Details" · "Parts N", one `SaveBar` footer), create `details-tab.tsx`, `parts-tab.tsx`, `part-card.tsx`, `part-sheets/{video-part-sheet,essay-part-sheet,forum-part-sheet}.tsx`, `use-parts-draft.ts` (pure reducer: add, edit, move up/down, remove; the one-forum rule), `reminder-fields.tsx`
- Delete: `assignment-form-sections.tsx` (type toggle, file section move into the essay sheet)
- Modify: `app/(app)/assignment/new.tsx`, `app/(app)/assignment/[id]/edit.tsx` (no session picker, no `useSeasonSessions`), `src/screens/video-quiz/video-questions-editor.tsx` (takes a `VideoOwner`), `src/screens/design-catalogue/` (part card states, reminder line)
- Test: `assignment-form-screens.test.tsx`, `assignment-form-bar.test.tsx`, new `use-parts-draft.test.ts`, new `video-part-sheet.test.tsx`

**Interfaces:**
- Consumes: Task 9 hooks; `parseYouTubeId` from shared for the live link check; `YoutubePlayer` for the preview; `ConfirmDialog` for remove and for `needs_confirmation` ("This changes work 3 students have done. Save anyway?").

- [ ] **Step 1:** Tests: reducer — "a second forum can't be added", "move up/down swaps positions", "remove asks first"; screens — "Details has Title, Instructions, Due, Reminder and no Session or Groups", "the reminder line updates with days, anchor and time", "'The due date' is disabled without a due date", "Parts shows the YouTube player once the link parses and an inline error when it doesn't", "Save is one footer button for both tabs", "a 409 needs_confirmation opens the confirm dialog with the count". **Step 2:** FAIL. **Step 3:** Implement per the spec's UI table (cards `rounded-group`, Edit as `PillButton`, Move up/Move down buttons ≥ 44pt with labels "Move Essay question up", sheets with `SheetSaveBar` and `keyboardBottomOffset`). **Step 4:** `pnpm --filter @space/mobile exec jest assignment-form use-parts-draft video-part-sheet` and `pnpm --filter @space/mobile lint` — PASS. **Step 5: Commit** — `feat(mobile): assignment form with Details and Parts tabs`

### Task 11: Student checklist and part screens

**Files:**
- Rewrite: `apps/mobile/src/screens/assignment-detail/student-assignment.tsx` (checklist page), create `assignment-checklist.tsx` (progress line + `GroupedList` of part rows), `essay-part-screen.tsx` (replaces `submission-editor.tsx`; keeps `use-draft-flush.ts`), `video-part-screen.tsx`, `forum-part-screen.tsx`, `leave-video-notice.ts` (pure: whether to show it and its text)
- Create route: `apps/mobile/app/(app)/assignment/[id]/part/[partId].tsx` (thin; picks the part screen by kind); add it to `DETAIL_ROUTE_NAMES` in `src/lib/route-names.ts`
- Modify: `src/screens/video-quiz/video-quiz-player.tsx` — extract the polling/barrier core into `src/screens/video-quiz/use-video-playback.ts` used by both session and part players; the part player reports `intervals` (start a range on "playing", close it on each poll/pause; with `blockSkipping`, `VideoProgressTrack` clamps forward seeks to `furthest`)
- Test: new `assignment-checklist.test.tsx`, `essay-part-screen.test.tsx`, `video-part-screen.test.tsx`, `leave-video-notice.test.ts`; update `assignment-detail*.test.tsx`, `submission-editor.test.tsx` → `essay-part-screen`, `submission-draft-flush.test.tsx`, `video-quiz-screen.test.tsx`, `video-resume.test.tsx`

- [ ] **Step 1:** Tests: "the page says 1 of 3 done and lists parts in order with their status in words"; "Submit is disabled with 'Finish Luke 15 talk (12 min left) and the forum post to submit' under it"; "Submit enabled when every part is done calls submit once"; "the essay count reads '142 words · 150–300' as one unbreakable run and turns to '8 over the limit' in the bad tone"; "leaving a part-watched video shows Not finished yet with Keep watching and Leave"; "with blockSkipping a forward seek past furthest snaps back"; "a returned essay shows the note and Hand in again"; "a finished season shows the checklist read-only with no Submit". **Step 2:** FAIL. **Step 3:** Implement per the spec's UI table (`Progress` + words, lucide icons decorative, `SaveBar` footer, `ConfirmDialog`). **Step 4:** run the listed tests, `pnpm --filter @space/mobile typecheck lint` — PASS. **Step 5: Commit** — `feat(mobile): one assignment, a checklist of parts`

### Task 12: Leader progress, essay review and the queue

**Files:**
- Rewrite: `apps/mobile/src/screens/assignment-detail/assignment-staff-panel.tsx` → `assignment-progress.tsx` (`GroupedList` rows with `StatusChip`s per part, wrapping), `src/screens/submission-review/{work-sections,feedback-sheet}.tsx` (one essay: its prompt, text, files, Mark reviewed / Return with a required note), `src/screens/staff-queue/pending-queue.tsx`, `src/screens/leader-submissions/{index,queue-sections}.tsx` (items are essays: assignment title + prompt), `app/(app)/submission/[publicId].tsx`
- Modify: `app/(app)/assignment/[id]/index.tsx` (staff: progress; no `ForumThread` branch on `type`)
- Test: `assignment-staff-detail.test.tsx`, `submission-review.test.tsx`, `submission-queue.test.tsx`, `staff-pending-queue.test.tsx`

- [ ] **Step 1:** Tests: "progress lists unfinished students first with 'Video 6/18 min', 'Video: 3 of 4 correct', 'Essay: waiting review', 'Forum: posted'"; "Return needs a note"; "the queue shows one row per essay with its prompt". **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS. **Step 5: Commit** — `feat(mobile): leaders see progress per part and review each essay`

### Task 13: Everywhere else, rules, catalogue and the sweep

**Files:**
- Modify: `src/screens/work/{work-model,work-row}.ts(x)` ("2 of 3 done"; "Returned — needs changes" when any essay is returned), `src/screens/today/{student-today,today-figures}.tsx`, staff Home tiles (`staff-today/needs-action-list.tsx`, `home/count-tile.tsx`), `src/screens/season/{overview-model,submissions-section,student-season}.ts(x)`, `src/screens/past-season/record-lists.tsx`, `src/screens/season-end/blockers-list.tsx` ("3 essays waiting review"), `src/screens/student-detail/grouped-tabs.tsx`, `src/screens/session-detail/*` (no linked-assignment UI remains), `src/lib/notification-route.ts` (ASSIGNMENT_REMINDER → the assignment), `src/screens/settings/` notification copy ("New assignments and reminders")
- Modify docs: `docs/rules/student-work.md` (My work rows show parts), `docs/rules/home-checkin-offline.md` ("Assignments always go to the whole season" bullet: drop the `groupIds` remark), new `docs/rules/assignments.md` (the owner rulings of this spec, verbatim) and its row in the root `CLAUDE.md` rule table
- Create sweep flows (read-only, never Submit/Hand in/Save): `apps/mobile/.maestro/sweep/student-scenarios/s57-assignment-parts.yaml` (checklist, each part screen, essay keyboard, leave-video notice), `admin-scenarios/s58-assignment-form.yaml` (both tabs, each part sheet with keyboard, video preview), `leader-scenarios/s59-assignment-progress.yaml`; extend `apps/backend/scripts/seed-sweep.ts` with one three-part assignment and partial work for the sweep users
- Test: `work-model.test.ts`, `work-screen.test.tsx`, `student-today*.test.tsx`, `staff-today.test.tsx`, `past-season.test.tsx`, `season-end*.test.tsx`, `student-detail*.test.tsx`, `sweep-rules.test.ts`, `design-consistency.test.ts`

- [ ] **Step 1:** Update the listed tests to the new rows and copy; run — FAIL. **Step 2:** Implement. **Step 3:** `pnpm check` — PASS (lint, typecheck, unit, dead, size, docs). **Step 4:** `~/.maestro/bin/maestro check-syntax` on each new flow; run the `ui-sweep` skill for `s57`–`s59` on `small-1.3-3btn-light` and `iphone-1.0-gesture-dark` against the local sweep backend, review every shot against the spec's "Rules that bite here", fix, then all 16 cells. **Step 5: Commit** — `feat(mobile): parts everywhere assignments show; rules, catalogue and sweep flows`

### Task 14: Ship

- [ ] **Step 1:** Whole-branch review (`superpowers:requesting-code-review`), then `pnpm check` and `pnpm test` (integration against the local test database) — all green.
- [ ] **Step 2 (ask the owner first):** apply migrations `20261113*` to the database (`~/.secrets/space-new-db.url`; staging is the same database), merge to `main`, push to `jpc` and `origin` per root `CLAUDE.md` "Git", then a TestFlight build with the `release-app` skill (version bump to the next `1.0.N`). Record in the commit which environments the migrations reached.
