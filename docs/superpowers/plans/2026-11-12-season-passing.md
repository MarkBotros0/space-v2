# Season passing by weighted score Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Execution:** subagent-driven-development (owner said "Implement" on 2026-11-12).

**Goal:** Staff see each student's attendance %, assignments submitted and quiz % per season; a weighted score against a pass mark pre-selects who passes at End and shows who is below the mark during the season; staff can mark an assignment as submitted.

**Architecture:** One backend loader, `loadPassingNumbers`, computes the three raw numbers for a set of students in a season; one pure shared function, `weightedScore`, turns them into the score on the server and in the app, so the End preview and the End recompute cannot disagree. "Submitted" becomes one shared Prisma fragment, `SUBMITTED_WHERE` (in the app, or a `SubmissionStaffMark` row), that every reader uses. Criteria live on `Season`; End stores each enrolment's score, numbers and whether the result went against the score.

**Tech Stack:** Express 5 + Prisma 7 (Postgres), Zod (`packages/shared`), Expo / React Query (`apps/mobile`).

**Spec:** `docs/superpowers/specs/2026-11-12-season-passing-design.md` (owner "Implement", 2026-11-12). Rules: `docs/rules/community-model.md`, `graduating-seasons.md`, `assignments.md`, `student-work.md`, `season-overview.md`, `quiz-results.md`, `roles.md`.

## Global Constraints

- The score is never edited. It is recomputed from attendance, quiz scores and submitted assignments; staff fix inputs at the source.
- The three numbers (one definition, `lib/passing/numbers.ts`):
  - Attendance: PRESENT + LATE over the season's sessions with `startsAt <= now` and `startsAt >= enrolledAt` (the student page's formula, `attendancePctForEnrollments`). Empty denominator: null.
  - Assignments: submitted (`SUBMITTED_WHERE`) over the season's live assignments.
  - Quizzes: Σ counting score over Σ `maxScore` of every PAPER quiz and every published ONLINE quiz of the season (`OR: [{ kind: "PAPER" }, { publishedAt: { not: null } }]`). ONLINE uses `countingScore`, PAPER the `QuizGrade.score`; nothing is 0.
- Score: Σ wᵢ·pctᵢ / Σ wᵢ over the numbers that are not null, from unrounded ratios, then `Math.round(x * 10) / 10`. The rounded score is compared with the pass mark (`>=`). No non-null number: score null.
- Weights are whole percentages 0..100 adding up to exactly 100; pass mark is a whole number 0..100. Defaults: the season with the newest `passCriteriaSetAt`, else 40 / 30 / 30 and 60. A weight above 0 on a number the season has nothing for is 400 `weight_on_empty`, "{Number} has nothing to count this season, so its weight must be 0."
- Criteria: the season's admin or a super, ACTIVE seasons only (409 `season_not_active`). Leaders read them.
- Staff mark: the season's admin, a super, or the student's leader in that season (`leadsStudentInSeason`); ACTIVE season only (409 `season_finished` "This season has ended; its work can't change.", 409 `season_draft` on a draft). Anyone who may mark may undo, whoever marked. No essay answers, nothing in the review queue, no notification.
- Locks: a mark or undo takes the Season FOR SHARE (`lockSeason(tx, id, "share")`), then `lockPeople(tx, [studentUserId])`, then the rows. End keeps Season FOR NO KEY UPDATE, then People, then rows, and computes the numbers inside its transaction after the claim.
- End: the request keeps `notPassed` and adds `weights`, `passMark`, `passedNotes` and `reviewed.scores`; a recomputed score that differs from `reviewed.scores` is 409 `season_unfinished`, "The scores changed; check the season again.".
- Seasons ended before this: `passScore` null; shown as "Ended before weighted passing".
- `engagement.ts` keeps its 50/50 formula; only its "submitted" read changes.
- Migrations: one concern each, `BEGIN; … COMMIT;`, a `rollback.sql`, cycled apply → rollback → apply on the local `quiz_test` database only (check the host first). New `*ById` audit FKs join `AUDIT_FKS` in `schema-conformance.test.ts`; a CHECK is noted `// SQL-only CHECK …` on its model; regenerate `docs/database/erd.md` with `db:erd`.
- Soft delete: every new read filters with `liveUser`, `liveSeason`, `liveAssignment`; rosters use `seasonParticipant`.
- Mobile: design kit only, `plural()` for counts, no " · " joins, no "—", status in words as well as tone, 44pt targets, 400 lines per file. No em dashes in UI copy. Relative imports; runtime `@space/shared` value imports in the backend by relative path.
- Long test runs go in tmux: `tmux new -d -s space-v2-quiz-pass-int "pnpm --filter @space/backend test:integration 2>&1 | tee ~/logs/space-v2-quiz-pass-int.log"`.

## Review Focus

1. A marked assignment reads as submitted in every count: progress row, the assignment list's count, engagement, reminders (skipped), My work, the workbook, the report summary and the End numbers. Pinned in Task 1 (`every reader agrees a staff mark is submitted`) and by the source guard `submitted-definition.test.ts`.
2. Between the End preview and the POST, a staff mark or a re-saved attendance changes one student's score: the End is refused with 409 and nothing is written. Pinned in Task 4 (`a score that changed since the preview is refused`).
3. The pass-mark edge: 59.95 rounds to 60.0 and passes a mark of 60; 59.94 shows 59.9 and does not. Pinned in Task 2 (`the rounded score decides at the mark`).
4. A student enrolled after the last session has no attendance denominator: their score is re-scaled over assignments and quizzes and `rescaled: true` reaches the row. Pinned in Task 2 (`a student with no sessions of their own is re-scaled`) and Task 8 (`a re-scaled row says so`).
5. A leader marking a student outside their groups gets 403; a mark on a finished season gets 409; a leader may undo an admin's mark. Pinned in Task 1 (`only the admin, a super or the student's own leader, on an active season`).

---

### Task 1: Staff mark as submitted, and one definition of "submitted"

**Files:**
- Create: `apps/backend/prisma/migrations/20261116010000_submission_staff_mark/{migration.sql,rollback.sql}` (table `SubmissionStaffMark`: `submissionId INT PRIMARY KEY REFERENCES "Submission" ON DELETE CASCADE`, `markedById INT REFERENCES "User" ON DELETE SET NULL`, `markedAt`, `createdAt`, `updatedAt`)
- Modify: `apps/backend/prisma/schema.prisma` (model + `Submission.staffMark SubmissionStaffMark?`), `src/__tests__/schema-conformance.test.ts` (`SubmissionStaffMark.markedById` in `AUDIT_FKS`), schema snapshot, `docs/database/erd.md`
- Create: `apps/backend/src/lib/assignments/submitted.ts`, `src/lib/assignments/staff-mark.ts`, route handlers `src/routes/assignments/staff-mark.ts` registered in `src/routes/assignments.ts`, OpenAPI in `src/docs/paths/` (the assignments file)
- Modify (readers switched to `SUBMITTED_WHERE` / `isSubmitted`): `lib/queries/engagement.ts` (read 5), `lib/queries/assignments/staff.ts` (list `_count`, progress rows), `lib/assignments/reminder.ts:223`, `lib/exports/season-workbook/load.ts:98`, `lib/queries/reports/summary.ts:147`, `lib/queries/assignments/student.ts`, `lib/queries/assignments/detail.ts`, `lib/queries/students/history.ts` (`loadStudentSubmissions`), `lib/queries/assignments/part-work.ts` (`assignmentStatusOf`)
- Modify contracts: `packages/shared/src/assignment-progress.ts` (row `staffMark`, top-level `canMark`), `packages/shared/src/assignment.ts` (student list item and detail `staffMarked: boolean`)
- Test: `src/__tests__/integration/assignment-staff-mark.test.ts`, `assignment-staff-mark-readers.test.ts`, unit `src/__tests__/submitted-definition.test.ts`

**Interfaces — Produces:**
- `SUBMITTED_WHERE: Prisma.SubmissionWhereInput` = `{ OR: [{ submittedAt: { not: null } }, { staffMark: { isNot: null } }] }`; `STAFF_MARK_SELECT = { staffMark: { select: { markedAt: true, markedBy: { select: { id: true, name: true } } } } }`; `isSubmitted(s: { submittedAt: Date | null; staffMark: object | null }): boolean` in `lib/assignments/submitted.ts`.
- `markSubmitted(t: { assignmentId: number; seasonId: number; studentUserId: number }, byId: number): Promise<{ markedAt: Date; markedBy: { id: number; name: string | null } }>`: creates the Submission row if missing (`createMany` + `skipDuplicates`, as `submit.ts` does), then the mark; a second mark keeps the first. `undoMarkSubmitted(t): Promise<void>`: deletes the mark, and the Submission too when it has no `submittedAt` and no part work. Both refuse a student who is not an ACTIVE live participant (404 "Student not found in this season.").
- `canMarkSubmitted(user: SessionUser, seasonId: number, studentUserId: number): Promise<boolean>` in `lib/permissions/submission.ts`: `isAdminOfSeason || leadsStudentInSeason`.
- Routes: `PUT /assignments/:id/submitted-marks/:studentUserId` → 200 `{ studentUserId, markedAt, markedBy: { id, name } }`; `DELETE` same path → 204.
- `assignmentStatusOf(submittedAt, works, hasSubmission, marked: boolean)`: `marked && submittedAt === null` → `"REVIEWED"` (complete, nothing to review); an app submission keeps today's ladder.
- Progress row: `staffMark: { markedAt: string; markedByName: string | null } | null`; `AssignmentProgress.canMark: boolean` (false on a finished or draft season). Rows with neither app submission nor mark sort first.

- [ ] **Step 1: Failing tests:** `only the admin, a super or the student's own leader, on an active season` (leader of another group 403; finished season 409 `season_finished`; draft 409 `season_draft`; a leader undoes an admin's mark 204); `marking twice keeps the first mark`; `undo removes a Submission it created and keeps one with work`; `a later app submit stands and the mark is kept` (row has both `submittedAt` and `staffMark`); `nothing enters the review queue and nobody is notified`; `every reader agrees a staff mark is submitted` (one marked student: progress `staffMark` set, list `submissionCount` 1, engagement `submissionsCompleted` 1, reminder sweep skips them, My work status `REVIEWED` with `staffMarked: true`, workbook row submitted, report summary counts it); source guard `submitted-definition.test.ts`: no `submittedAt: { not: null }` on a Submission query outside `lib/assignments/{submitted,submit,standing,writes,part-changes,essay-review}.ts`.
- [ ] **Step 2: Run** → FAIL. **Step 3:** migration (cycle on `quiz_test`), schema, helpers, service, gate, route, readers, OpenAPI. **Step 4: Run** → PASS; assignment, reminder, report and workbook suites still pass.
- [ ] **Step 5: Commit** — `feat(backend): staff mark an assignment as submitted; one definition of submitted`.

### Task 2: The three numbers, the score and the season's pass criteria

**Files:**
- Create: `packages/shared/src/season-passing.ts` (export from `index.ts`), test `packages/shared/src/__tests__/season-passing.test.ts`
- Create: `apps/backend/prisma/migrations/20261116020000_season_pass_criteria/{migration.sql,rollback.sql}` (Season: `passWeightAttendance`, `passWeightAssignments`, `passWeightQuizzes`, `passMark` INT NULL, `passCriteriaSetAt` TIMESTAMPTZ(3) NULL; CHECK `Season_passCriteria_check`: all four null, or all set, each 0..100, the three weights sum to 100)
- Modify: `schema.prisma` (columns + `// SQL-only CHECK Season_passCriteria_check: …`), snapshot, `docs/database/erd.md`
- Create: `apps/backend/src/lib/passing/numbers.ts`, `src/lib/passing/criteria.ts`, `src/routes/seasons/passing.ts` (registered in `routes/seasons/index.ts` before `/:id`-catching paths), OpenAPI `src/docs/paths/season-passing.ts`
- Test: `src/__tests__/integration/season-passing-numbers.test.ts`, `season-pass-criteria.test.ts`

**Interfaces — Produces (shared):**
- `PassWeights = { attendance: number; assignments: number; quizzes: number }`; `passCriteriaSchema = z.object({ weights, passMark })` with the sum refine, message "The weights must add up to 100%."; `PassCriteria`.
- `passingNumbersSchema = { attendance: { attended: number; total: number }; assignments: { submitted: number; total: number }; quizzes: { scored: number; max: number } }`; `seasonAvailabilitySchema = { attendance: boolean; assignments: boolean; quizzes: boolean }`.
- `PassingPcts = Record<"attendance" | "assignments" | "quizzes", number | null>`; `passingPcts(n: PassingNumbers): PassingPcts` (unrounded, null on a 0 denominator).
- `weightedScore(p: PassingPcts, w: PassWeights): { score: number | null; rescaled: boolean }` (`rescaled` when a weighted number was null).
- `meetsMark(score: number | null, passMark: number): boolean | null`; `pointsShort(score: number, passMark: number): number` (1 decimal); `weakestNumber(p: PassingPcts, w: PassWeights): keyof PassingPcts | null` (lowest pct among weighted, non-null).
- `DEFAULT_PASS_CRITERIA = { weights: { attendance: 40, assignments: 30, quizzes: 30 }, passMark: 60 }`.

**Interfaces — Produces (backend):**
- `loadPassingNumbers(seasonId: number, studentUserIds: number[] | null, client: Prisma.TransactionClient = db, now = new Date()): Promise<{ available: SeasonAvailability; numbers: Map<number, PassingNumbers> }>`: a constant number of queries; `null` ids = every live `seasonParticipant`; `available` = the season has any session / live assignment / counted quiz.
- `loadPassCriteria(seasonId, client = db): Promise<{ criteria: PassCriteria; isDefault: boolean }>`; `checkWeightsAvailable(criteria, available): void` (throws the `weight_on_empty` ApiError); `savePassCriteria(seasonId, criteria, now): Promise<PassCriteria>` (Season FOR SHARE, ACTIVE check, availability check).
- Route `PUT /seasons/:id/pass-criteria` (body `passCriteriaSchema`; `isAdminOfSeason`, leaders 403) → `{ criteria }`.

- [ ] **Step 1: Failing tests (shared unit):** `the rounded score decides at the mark` (pcts giving 59.95 → 60.0, `meetsMark(60.0, 60)` true; 59.94 → 59.9 false); `a student with no sessions of their own is re-scaled` (attendance null, weights 40/30/30, assignments 80, quizzes 60 → 70.0, `rescaled: true`); `no weighted number gives no score`; `weights must add up to 100` (39/30/30 refused with the message); `weakestNumber ignores a zero weight`.
- [ ] **Integration:** `numbers follow the one definition` (late joiner's denominator starts at enrolment; future sessions don't count; LATE counts; a staff mark counts as submitted; an unpublished ONLINE quiz is left out, an ungraded PAPER grade and a not-taken quiz count 0 of max, an admin score beats a higher attempt, a SUBMITTED attempt counts 0); `a deleted assignment or student is left out`; criteria: `admin or super saves; a leader gets 403`; `a draft or finished season answers 409 season_not_active`; `a weight on a season with no quizzes is 400 weight_on_empty`; `defaults come from the last season that saved criteria, else 40/30/30 and 60`.
- [ ] **Step 2: Run** → FAIL. **Step 3:** migration (cycle on `quiz_test`), shared module, loader, criteria service, route, OpenAPI. **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(passing): the three numbers, the weighted score and the season's pass criteria`.

### Task 3: Outlook, a student's progress, and the students list

**Files:**
- Modify: `src/routes/seasons/passing.ts` (`GET /seasons/:id/passing`), `src/routes/students/reads.ts` + `routes/students/index.ts` (`GET /students/:id/progress`)
- Create: `src/lib/passing/outlook.ts`, `src/lib/passing/student-progress.ts`, `src/lib/queries/students/list-progress.ts`
- Modify: `src/lib/queries/students/list.ts` (both return paths call `withProgress`), `src/lib/queries/students/current-season.ts` (select the season `id` too), `packages/shared/src/student/list.ts` (item `progress`), `packages/shared/src/season-passing.ts` (outlook and progress schemas), OpenAPI
- Test: `src/__tests__/integration/season-passing-outlook.test.ts`, `student-progress.test.ts`, `students-list-progress.test.ts`

**Interfaces — Consumes:** Task 2's `loadPassingNumbers`, `loadPassCriteria`, `weightedScore`, `weakestNumber`; Task 1's `SUBMITTED_WHERE`, `STAFF_MARK_SELECT`, `canMarkSubmitted`.
**Produces:**
- `PassingOutlook = { criteria: PassCriteria; isDefault: boolean; available: SeasonAvailability; canEditCriteria: boolean; onTrack: number; below: number; rows: OutlookRow[] }`; `OutlookRow = { userId; name; groupName: string | null; numbers: PassingNumbers; score: number | null; rescaled: boolean; pointsShort: number | null; weakest: "attendance" | "assignments" | "quizzes" | null }`. Order: below the mark (most short first), then no score, then on track by name. Gate `staffScopeForSeason`; a leader's rows are their groups'. `below` counts rows with a score under the mark.
- `StudentProgress = { seasonId; seasonTitle; seasonActive: boolean; canMark: boolean; available; numbers; assignments: { id; title; dueAt: string | null; submitted: "app" | "staff" | null; staffMark: { markedAt: string; markedByName: string | null } | null }[]; quizzes: { id; title; kind; score: number | null; maxScore: number }[] }`: assignments not submitted first, quizzes lowest `score / maxScore` first. Season picked and gated exactly as `GET /students/:id/engagement` (reuse `mayScoreInSeason`, `?seasonId`); a student caller gets 403; none → 404 `no_season`.
- Student list item: `progress: { attendancePct: number | null; assignmentsPct: number | null; quizPct: number | null } | null` (rounded integers) for the row's current season when the caller may score it; null otherwise and on alumni and dropped lists. `withProgress(items: StudentListItem[], user: SessionUser): Promise<StudentListItem[]>` groups the page by season: one `loadPassingNumbers` per season on the page.

- [ ] **Step 1: Failing tests:** `outlook counts and orders below the mark first` (3 students, mark 60: counts `onTrack` 1 `below` 2, first row the most short, `pointsShort` 8.0 and `weakest` "quizzes"); `a leader sees only their groups and cannot edit criteria` (`canEditCriteria` false); `a mentor or another season's admin gets 403`; `progress lists missing assignments first and the lowest quiz first`; `progress names who marked an assignment`; `a student cannot read their own progress (403)`; `the list carries progress per page with a fixed number of queries` (query count equal for a page of 2 and of 20); `alumni list rows have no progress`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS; students list suites still pass.
- [ ] **Step 5: Commit** — `feat(passing): the passing outlook, a student's progress and the list's numbers`.

### Task 4: End by the score, stored results, and results after End

**Files:**
- Create: `apps/backend/prisma/migrations/20261116030000_enrollment_pass_snapshot/{migration.sql,rollback.sql}` (SeasonEnrollment: `passScore DECIMAL(4,1)`, `passNumbers JSONB`, `resultAgainstScore BOOLEAN`, `resultSetById INT REFERENCES "User" ON DELETE SET NULL`, all NULL)
- Modify: `schema.prisma`, `AUDIT_FKS` (`SeasonEnrollment.resultSetById`), snapshot, erd
- Modify: `packages/shared/src/season-lifecycle.ts` (`seasonEndCheckSchema`, `endSeasonRequestSchema`, `seasonResultRowSchema`, new `seasonResultsResponseSchema`), `lib/queries/season-end.ts`, `lib/seasons/end.ts`, `routes/seasons/end.ts`, `lib/queries/season-results.ts`, `lib/seasons/results.ts`, `routes/seasons/results.ts`, `lib/permissions/season.ts`, `src/docs/paths/season-end.ts`
- Test: extend `src/__tests__/integration/season-end-routes.test.ts`, `graduating-seasons-end.test.ts`; create `season-end-passing.test.ts`, `season-results-admin.test.ts`

**Interfaces — Consumes:** Task 2 (`loadPassingNumbers` with `tx`, `checkWeightsAvailable`, `weightedScore`, `meetsMark`, `loadPassCriteria`).
**Produces:**
- End check: adds `criteria`, `isDefault`, `available`; each student gains `numbers: PassingNumbers`; `attendancePct` stays (now the Task 2 attendance, rounded; 0 when null).
- `endSeasonRequestSchema`: `{ notPassed, passedNotes: { userId; note: string | null }[] (default []), weights: PassWeights, passMark: number, reviewed: { graduatesOnPass; userIds; scores: { userId: number; score: number | null }[] } }`, `.strict()`, refine "weights must add up to 100".
- `endSeasonNow(id: number, actorId: number, body: { reviewed; reasons: Map<number, string | null>; notes: Map<number, string | null>; criteria: PassCriteria }, year: number, now: Date)`: after the claim and blockers, `checkWeightsAvailable`, recompute every score with the request's criteria, refuse any difference from `reviewed.scores`; write the Season criteria (`passCriteriaSetAt = now`); each completed enrolment gets `passScore`, `passNumbers`, `resultAgainstScore = (result === "PASSED") !== meetsMark(score)` (false when the score is null), `resultSetById = actorId`; a passed row's note goes to `resultReason`.
- `canCorrectSeasonResults(user: SessionUser, seasonId: number): Promise<boolean>` = `isSuper` or a `SeasonAdmin` row for that season (any status, the way `reportScopeFor` reads it).
- `GET /seasons/:id/results` → `{ season: { id; code; title; year; graduatesOnPass }; criteria: PassCriteria | null; results: SeasonResultRow[] }`; row adds `passScore: number | null`, `numbers: PassingNumbers | null`, `againstScore: boolean`, `setByName: string | null`, `setAt: string | null`. `PATCH` recomputes `resultAgainstScore` from the stored `passScore` and sets `resultSetById`; `passScore` never changes.

- [ ] **Step 1: Failing tests:** `End stores the criteria, each score and its numbers`; `a score that changed since the preview is refused` (preview, then a staff mark on one student, POST with the old scores → 409 `season_unfinished`, season still ACTIVE, no enrolment changed); `a weight on a season with no quizzes is 400 weight_on_empty`; `passing below the mark and failing above it are stored as against the score, with the optional note`; `End on a graduating season graduates the passers whatever their score`; `the season's admin reads and corrects results after End` (as a former admin with the SeasonAdmin row; a leader 403; correction keeps `passScore`, flips `againstScore`, sets `setByName`); `a season ended before this shows passScore null and criteria null`; existing End suites updated to the new body and still green.
- [ ] **Step 2: Run** → FAIL. **Step 3:** migration (cycle on `quiz_test`), contracts, End, results, gate, OpenAPI. **Step 4: Run** → PASS; the whole integration suite in tmux (`space-v2-quiz-pass-int`) green.
- [ ] **Step 5: Commit** — `feat(seasons): End pre-selects by the weighted score and stores it; the season admin corrects results`.

### Task 5: Mobile, mark as submitted

**Files:**
- Create: `apps/mobile/src/screens/assignment-detail/staff-mark-sheet.tsx` (confirm "Mark as submitted" with "Use this when {name} did it outside the app. It counts as submitted everywhere."; marked state "Marked submitted by {name}" and "Undo, not submitted")
- Modify: `src/screens/assignment-detail/assignment-progress.tsx` (row press opens the sheet when `canMark`), `progress-model.ts` (row words: "Marked submitted"), `src/screens/work/work-model.ts` and `src/screens/assignment-detail/student-assignment.tsx` (student sees "Marked submitted by your leader", chip "Done")
- Hooks: `useMarkSubmitted(assignmentId: number)`, `useUndoMarkSubmitted(assignmentId: number)` in `src/hooks/use-assignment-writes.ts` (mutate `{ studentUserId }`; invalidate the assignment's progress, the season's assignments list, `queryKeys.students.all` and `queryKeys.passing.all`)
- Keys: add `queryKeys.passing` (`all`, `outlook(seasonId)`, `student(studentId)`) to `src/lib/query-keys.ts` here; Tasks 6 to 8 use them
- Test: `src/__tests__/assignment-staff-mark.test.tsx`, extend `assignment-progress-model.test.ts`

**Interfaces — Consumes:** Task 1 routes, `staffMark`, `canMark`, `staffMarked`.
**Produces:** `StaffMarkSheet({ student: { userId: number; name: string } | null; mark: { markedByName: string | null } | null; assignmentId: number; onClose: () => void })`, reused by Task 6.

- [ ] **Step 1: Failing tests:** `a leader marks a student from the progress list after a confirm`; `a marked row says who marked it and offers Undo`; `no action when canMark is false (finished season)`; `season_finished shows "This season has ended; its work can't change."`; `the student's My work row reads "Marked submitted by your leader" with Done`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS; `pnpm --filter @space/mobile typecheck` and lint green.
- [ ] **Step 5: Commit** — `feat(mobile): staff mark an assignment as submitted`.

### Task 6: Mobile, Season progress on the student page and the list's numbers

**Files:**
- Create: `src/hooks/use-season-passing.ts` (`useStudentProgress(studentId: number | null)` on `queryKeys.passing.student`), `src/screens/student-detail/season-progress-card.tsx`, `src/screens/student-detail/progress-model.ts`, `src/screens/student-detail/progress-detail-sheet.tsx` (one of: sessions summary, assignments with Mark as submitted via `StaffMarkSheet`, quizzes lowest first with "Reopen retake" pushing `/quiz/[id]/grade`)
- Modify: `src/screens/student-detail/student-detail-grouped.tsx:63` and `src/screens/student-admin/admin-student-detail.tsx:158` (the card replaces `EngagementSummary`; delete `engagement-summary.tsx` and any hook `check:dead` then reports), `src/screens/students-list/student-rows.tsx` (three captions that wrap: "Attendance 85%", "Assignments 78%", "Quizzes 72%"; a null reads "None this season")
- Test: `src/__tests__/season-progress-card.test.tsx`, `student-progress-model.test.ts`, extend `students-list.test.tsx`, update `student-detail*.test.tsx` and `admin-student-detail.test.tsx`

**Interfaces — Consumes:** Task 3 `StudentProgress`, list `progress`; Task 5 `StaffMarkSheet`.
**Produces:** `progressLines(p: StudentProgress): { key: "attendance" | "assignments" | "quizzes"; label: string; pct: number | null; figure: string }[]` with figures "Attendance 85%" + "17 of 20 sessions", "Assignments 7 / 9", "Quizzes 72%" + "36 of 50 marks"; a 0 denominator gives `pct: null`, figure "None this season". No composite score on this card (owner 2026-11-07).

- [ ] **Step 1: Failing tests:** `the card shows three labelled bars with exact figures`; `a number with nothing to count reads "None this season"`; `tapping Assignments lists missing ones first with Mark as submitted`; `tapping Quizzes lists the lowest first with Reopen retake`; `the card hides on no_season`; `list rows show the three numbers and none on alumni`; model tests for `progressLines` (fractional marks "36.5 of 50 marks").
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS; `pnpm check` green.
- [ ] **Step 5: Commit** — `feat(mobile): season progress on the student page and in the students list`.

### Task 7: Mobile, pass criteria and the Passing outlook

**Files:**
- Create: `app/(app)/seasons/[code]/passing.tsx` (thin), `src/screens/season-passing/outlook-screen.tsx`, `outlook-model.ts`, `criteria-sheet.tsx`, `criteria-model.ts`
- Modify: `src/screens/season/overview-model.ts` (tile `{ key: "passing", label: "Passing", hint: "Who is on track" }` for admin, super and leaders while ACTIVE), the tile's press handler in `src/screens/season/season-overview.tsx`, `src/lib/route-names.ts` (`DETAIL_ROUTE_NAMES`), `src/hooks/use-season-passing.ts` (`usePassingOutlook(seasonId)`, `useSavePassCriteria(seasonId)`)
- Test: `src/__tests__/season-passing-outlook.test.tsx`, `pass-criteria-model.test.ts`, extend `season-overview-model.test.ts`

**Interfaces — Consumes:** Task 2 route, Task 3 outlook, shared `weightedScore`.
**Produces:**
- `CriteriaDraft = { attendance: string; assignments: string; quizzes: string; passMark: string }`; `draftTotal(d: CriteriaDraft): number`; `parseCriteria(d: CriteriaDraft, available: SeasonAvailability): { ok: true; criteria: PassCriteria } | { ok: false; errors: Partial<Record<keyof CriteriaDraft | "total", string>> }` with "The weights must add up to 100%." and "Enter a pass mark from 0 to 100."; a field for an unavailable number is off and 0.
- `CriteriaSheet({ open; initial: PassCriteria; available: SeasonAvailability; readOnly: boolean; saveLabel: string; saving?: boolean; error?: string | null; onSave: (c: PassCriteria) => void; onClose })`: a live "Total 100%" line; reused by Task 8.
- Outlook copy: header "{n} on track" and "{m} below the mark" on their own lines; a below row "8 points short" and "Quizzes 45%"; a re-scaled row "Scored without attendance"; a row opens `/student/[id]`; "Send a reminder" opens `/announcements/new`.

- [ ] **Step 1: Failing tests:** `the total reads 100% only when the weights add up`; `an unavailable number's field is off and fixed at 0`; `a leader sees the criteria read-only and no Edit`; `saving posts and the outlook reloads`; `rows below the mark come first with points short and the weakest number`; `the Passing tile shows for staff on an active season only`; model tests.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS; `pnpm check` green.
- [ ] **Step 5: Commit** — `feat(mobile): pass criteria and the passing outlook`.

### Task 8: Mobile, End review by the score, and results after End

**Files:**
- Create: `src/screens/season-end/end-review-model.ts`, `src/screens/season-end/criteria-step.tsx`
- Modify: `app/(app)/seasons/[code]/end.tsx` (criteria step, then the review; keep the route thin by moving state into the model), `src/screens/season-end/review-list.tsx` (score and three numbers per row, "Select all on track" and "Clear", labels), `src/screens/season-end/result-sheet.tsx` (note field for a row chosen against the score), `src/hooks/use-season-end.ts` (results parse `seasonResultsResponseSchema`; `useSeasonResults(id)` no longer super-only), `app/(app)/seasons/[code]/results.tsx` (takes `?id=` when present, season header from the response, row shows the score and "Passed below the mark" / "Did not pass above the mark", or "Ended before weighted passing"; 403 shows "Not available"), `src/screens/season/overview-model.ts:73` (Results tile for the season's admin too), `src/screens/reports/report-season-header.tsx` (a "Results" link for a finished season an admin held, pushing `/seasons/[code]/results?id=`)
- Test: extend `src/__tests__/season-end.test.tsx`, `season-end-graduating.test.tsx`, `season-end-community.test.tsx`; create `end-review-model.test.ts`, `season-results-admin.test.tsx`

**Interfaces — Consumes:** Task 4 contracts; Task 7 `CriteriaSheet`; shared `weightedScore`, `meetsMark`.
**Produces:**
- `scoreRows(students: SeasonEndCheck["students"], c: PassCriteria): { userId; score: number | null; rescaled: boolean; onTrack: boolean | null }[]`
- `initialSelection(rows): Record<number, "PASSED" | "NOT_PASSED">` (on track or no score → PASSED; below → NOT_PASSED); `selectAllOnTrack(sel, rows)`; `clearAll(rows)` (everyone NOT_PASSED).
- `rowLabel(result, onTrack): "Passed below the mark" | "Did not pass above the mark" | null`
- `buildEndRequest(check: SeasonEndCheck, c: PassCriteria, sel, notes: Record<number, string>): EndSeasonRequest`
- Confirm copy: "End {season}? {n} students pass, {m} don't." and on a graduating season "{n} students graduate as JPCS-YY." (`plural`, `classLabel`).

- [ ] **Step 1: Failing tests:** `students on track are pre-selected Passed and the rest Did not pass`; `changing a weight re-scores and re-selects only rows not changed by hand`; `Select all on track and Clear`; `a row chosen against its score is labelled`; `a re-scaled row says so` ("Scored without attendance"); `the POST carries weights, passMark and the scores shown`; `season_unfinished reloads the check and keeps the choices`; `the confirm says how many pass and graduate`; `the season's admin opens Results and corrects one`; `a season ended before reads "Ended before weighted passing"`; model tests.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS; `pnpm check` green.
- [ ] **Step 5: Commit** — `feat(mobile): End pre-selects by the score; results for the season admin`.

### Task 9: Rules, seed and flows

**Files:**
- Create: `docs/rules/season-passing.md` (the three numbers, the score and rounding, criteria and defaults, outlook, End and the stored snapshot, results after End, staff mark), with a row in the root `CLAUDE.md` rulings table
- Modify: `docs/rules/community-model.md` (End: pre-selected by the score, the `reviewed` scores; results readable and correctable by the season's admin), `docs/rules/graduating-seasons.md` (`reviewed` covers criteria and scores), `docs/rules/assignments.md` and `docs/rules/student-work.md` (Mark as submitted, the definition, "Marked submitted by your leader"), `docs/rules/season-overview.md` (Passing tile), `apps/mobile/CLAUDE.md` and `apps/backend/CLAUDE.md` code maps (`lib/passing/`, `src/screens/season-passing/`)
- Modify: `apps/backend/scripts/seed-sweep/activity.ts` (criteria on the sweep season; one staff mark; one student below the mark), `apps/mobile/.maestro/sweep/admin-scenarios/s54-end-season.yaml` (criteria step and review), new `admin-scenarios/s60-passing.yaml` (outlook, criteria sheet with the keyboard on each field), `leader-scenarios/s59-assignment-progress.yaml` (the mark sheet), `super-scenarios/s55-results.yaml` (score labels)
- [ ] **Step 1:** Docs; `pnpm check:docs`. **Step 2:** Seed typechecks, flows parse; the sweep runs when the owner says go (postponed by the owner). **Step 3: Commit** — `docs(passing): season passing rules; seed and flows`.
