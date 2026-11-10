# Quiz timing — start window, time limit, auto-submit, staff End — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An online quiz can have a start window and a per-student time limit enforced by the server clock; an attempt that runs out of time submits itself even if the phone never returns; staff can end an open attempt.

**Architecture:** `Quiz` gains `startsFrom`, `startsUntil`, `timeLimitMinutes`; `QuizAttempt` gains `deadlineAt` (set when the student first opens the attempt) and `endReason`. One service, `lib/quizzes/close-attempt.ts`, closes an attempt (marking what's saved, like submit but without the completeness rule) and is called from three places: the student's own reads/writes once the deadline has passed (lazy close), every staff read of attempts, and — if `lib/scheduler` exists when this runs — a scheduler handler. Staff End uses the same service.

**Tech Stack:** Express 5, Prisma 7, Zod 4, Expo 58 / React Query, Jest.

**Spec:** `docs/superpowers/specs/2026-11-10-quiz-question-types-and-integrity-design.md` — sections Timing, Live screen ("End attempt"), Editing timing after attempts exist.

**Depends on:** `docs/superpowers/plans/2026-11-10-quiz-question-types.md` (uses `submitAnswers`'s marking path, `autoMark`, `isLeaderMarked`, `sumScores`, `newShuffleSeed`).

## Global Constraints

- Everything in the quiz-types plan's Global Constraints applies.
- The server clock decides. The phone's countdown is display only; a save or submit after `deadlineAt + 10 s` is refused `attempt_closed` and closes the attempt (*builder's call: 10 s grace for in-flight saves*).
- Both settings optional per quiz: no window = startable whenever published; no limit = untimed.
- Start window limits **starting** only. A reopened attempt is not blocked by the window and gets a fresh limit.
- The start window may be edited any time; `timeLimitMinutes` is frozen once any attempt exists (`quiz_has_attempts`).
- Time-out and End submit with what's saved; unanswered questions score 0; leader-marked questions still wait for marking (status SUBMITTED) if any exist.
- Organisation clock for displayed times: `ORG_TIMEZONE` via `lib/org-time.ts` on the backend; the app formats with its existing date helpers.

## Review Focus

1. **A phone that dies mid-quiz and never comes back** — the attempt is closed the next time anyone (staff list, the student) reads it after the deadline. Pinned in Task 2 (`staff list closes an expired attempt`).
2. **Save racing the deadline** — a save 5 s after the deadline lands; one 15 s after is refused and the attempt closed. Pinned in Task 2.
3. **Start exactly at `startsUntil`** — allowed at the instant, refused one second later (`startsUntil` inclusive). Pinned in Task 2.
4. **Close running twice at once** (two staff screens, or close + student submit) — exactly one close; the other sees `attempt_closed` or a no-op. Pinned in Task 2 (`concurrent close is single`), using the existing row lock.
5. **Phone clock wrong** — countdown derives from server `deadlineAt` minus a server-time offset taken from the response's `serverNow`, not from the phone's clock alone. Pinned in Task 4 (`countdown corrects for a skewed clock`).

---

### Task 1: Schema and contracts

**Files:**
- Create: `apps/backend/prisma/migrations/20261113010000_quiz_timing/{migration.sql,rollback.sql}`
- Modify: `apps/backend/prisma/schema.prisma`, erd, schema snapshot
- Modify: `packages/shared/src/quiz/writes.ts` (`updateQuizRequestSchema` + `startsFrom?`, `startsUntil?` ISO datetimes or null, `timeLimitMinutes?` int 1–300 or null; refine `startsFrom < startsUntil` when both set), `read.ts` (authoring + student detail carry the three fields; student detail adds `deadlineAt: string|null`, `serverNow: string`, `endReason`), `writes.ts` + `responses.ts` (`endAttemptRequestSchema {studentUserId}`, `endAttemptResponseSchema {attemptId, status}`)
- Test: `packages/shared/src/__tests__/quiz-timing.test.ts`

**Interfaces — Produces:**
- `enum QuizAttemptEndReason { SUBMITTED TIMED_OUT ENDED_BY_STAFF ENDED_BY_EXITS }` (`ENDED_BY_EXITS` used by the integrity plan).
- `Quiz.startsFrom DateTime? @db.Timestamptz(3)`, `Quiz.startsUntil DateTime? @db.Timestamptz(3)`, `Quiz.timeLimitMinutes Int?` (SQL-only CHECK `timeLimitMinutes BETWEEN 1 AND 300`; CHECK `startsFrom < startsUntil` when both non-null).
- `QuizAttempt.deadlineAt DateTime? @db.Timestamptz(3)`, `QuizAttempt.endReason QuizAttemptEndReason?`, `QuizAttempt.endedById Int?` → User (SetNull; add to `AUDIT_FKS`).
- Partial index `QuizAttempt(deadlineAt) WHERE status = 'IN_PROGRESS' AND deadlineAt IS NOT NULL` (SQL-only, for the sweep).

- [ ] **Step 1: Failing shared tests:** `startsFrom after startsUntil refused`; `timeLimitMinutes 0 refused, 300 ok, 301 refused`; `null clears`.
- [ ] **Step 2: Run** `pnpm --filter @space/shared test:unit -- quiz-timing` → FAIL. **Step 3:** migration (+ rollback, cycled), schema, `db:generate`, schemas. **Step 4: Run** shared tests + `schema-conformance erd` + `schema-snapshot` → PASS.
- [ ] **Step 5: Commit** — `feat(backend): quiz start window, time limit and attempt end reason`.

### Task 2: Close service, lazy close, start window, deadline

**Files:**
- Create: `apps/backend/src/lib/quizzes/close-attempt.ts`
- Create: `apps/backend/src/lib/quizzes/timing.ts` (pure)
- Modify: `apps/backend/src/lib/quizzes/attempts.ts` (`submitAnswers` writes `endReason: SUBMITTED`; shares the marking core with `closeAttempt` — extract `markAndClose(tx, quizId, attemptId, opts: { requireComplete: boolean; endReason; endedById: number|null })`)
- Modify: `apps/backend/src/routes/quizzes/attempts.ts` (`startAttempt`: window check on attempt 1; sets `deadlineAt` when null and the quiz has a limit; every handler calls `closeIfExpired` first — reads with grace 0, saves with `SAVE_GRACE_MS`, so a save in flight at the deadline still lands if no read closed the attempt first), `routes/quizzes/detail.ts` (the student GET calls `closeIfExpired(attempt, now)` with grace 0), `routes/quizzes/grading.ts` (`listAttempts` calls `closeExpiredForQuiz(quizId)` first; `reopenAttempt` leaves `deadlineAt` null so it's set when the student opens it), `routes/quizzes/authoring.ts` (`updateQuiz` freezes `timeLimitMinutes` once attempts exist)
- Test: `apps/backend/src/__tests__/quiz-timing.test.ts`; `src/__tests__/integration/quizzes-timing-routes.test.ts`

**Interfaces — Produces:**
- `canStartNow(quiz: { startsFrom: Date|null; startsUntil: Date|null }, now: Date): "ok" | "not_yet" | "closed"` — inclusive bounds.
- `deadlineFor(startedAt: Date, timeLimitMinutes: number | null): Date | null`
- `isExpired(deadlineAt: Date | null, now: Date, graceMs = 0): boolean`
- `SAVE_GRACE_MS = 10_000`
- `closeAttempt(attemptId: number, endReason: "TIMED_OUT"|"ENDED_BY_STAFF"|"ENDED_BY_EXITS", endedById: number|null): Promise<{ closed: boolean }>` — under the row lock; `closed: false` if it wasn't IN_PROGRESS.
- `closeIfExpired(attemptId: number, now?: Date): Promise<boolean>`
- `closeExpiredForQuiz(quizId: number, now?: Date): Promise<number>` — closes every IN_PROGRESS attempt of the quiz past its deadline (+ grace).
- Refusals: `quiz_not_open_yet` (409, "This quiz opens at {time}."), `quiz_start_closed` (409, "The time to start this quiz has passed."). Add both to `ApiErrorCode`.

- [ ] **Step 1: Failing unit tests** for `canStartNow` (before, at `startsFrom`, at `startsUntil`, 1 s after, no window), `deadlineFor`, `isExpired` with grace.
- [ ] **Step 2: Failing integration tests:** `start before the window is refused`; `start after the window is refused`; `start at startsUntil works`; `deadline is set on first open and not moved on re-open`; `save 5 s after deadline lands, 15 s after is refused and closes TIMED_OUT`; `submit after deadline is attempt_closed and the attempt is TIMED_OUT with partial marks`; `staff list closes an expired attempt`; `concurrent close is single` (two `closeAttempt` in `Promise.all` → one `closed: true`); `reopen of a timed-out attempt gets a fresh deadline when opened, even after the window`; `time limit can't change once attempts exist, window can`. Use a `now` override (inject via `closeIfExpired(id, now)` and an `X-Test-Now`-free approach: set `deadlineAt` in the DB to the past instead of faking clocks).
- [ ] **Step 3: Run** `test:unit -- quiz-timing`, `test:integration -- quizzes-timing` → FAIL. **Step 4: Implement.** **Step 5: Run** → PASS, plus `test:integration -- quizzes-attempt-submit quizzes-online-grading` still PASS.
- [ ] **Step 6: Commit** — `feat(backend): server-enforced quiz start window and time limit`.

### Task 3: Staff End and the scheduler hook

**Files:**
- Modify: `apps/backend/src/routes/quizzes/grading.ts` or create `routes/quizzes/end-attempt.ts` (keep each < 400 lines); register `quizzesRouter.post("/:id/attempts/end", endAttempt)` in `routes/quizzes/index.ts`
- Modify: `apps/backend/src/__tests__/__snapshots__/route-inventory…` (`test:unit -- -u route-inventory`)
- Modify (only if `apps/backend/src/lib/scheduler/handlers.ts` exists): register `{ name: "quiz-deadlines", run: (now) => closeAllExpired(now) }`; create `closeAllExpired(now): Promise<number>` in `close-attempt.ts` using the partial index. If the scheduler doesn't exist yet, skip this and note it in the commit body; lazy close already covers correctness.
- Modify: docs paths (`docs/paths/quizzes-attempts.ts`), `docs/rules/quiz-integrity.md` (Timing section)
- Test: `integration/quizzes-timing-routes.test.ts`

**Interfaces — Produces:** `endAttempt(req, res)` — `canGradeQuiz` gate, student must be in `visibleStudentIdsForQuiz`; latest attempt IN_PROGRESS else `attempt_closed`; `closeAttempt(id, "ENDED_BY_STAFF", user.userId)`; responds `endAttemptResponseSchema`.

- [ ] **Step 1: Failing tests:** `leader ends a student's open attempt → SUBMITTED/GRADED, endReason ENDED_BY_STAFF, endedById set`; `admin and super can end`; `leader outside the student's group is 403`; `ending a closed attempt is attempt_closed`; (scheduler present) `handler closes expired attempts across quizzes`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(backend): staff can end an open quiz attempt`.

### Task 4: Mobile — settings, start states, countdown, End

**Files:**
- Modify: `apps/mobile/src/screens/quiz-edit/quiz-details-sheet.tsx` (Start window: two date-time fields "Can start from" / "Can start until", each clearable; Time limit: number field "minutes", locked with a note once attempts exist)
- Modify: `apps/mobile/src/screens/quiz-detail/student-quiz-runner.tsx` (start card: "Opens at 6:00 pm" disabled, "Starting closed at 6:30 pm" disabled, or "Start quiz · 20 minutes")
- Create: `apps/mobile/src/screens/quiz-detail/countdown.ts` (pure) and `quiz-countdown.tsx` (header chip `mm:ss`, `bad` tone under 60 s, no animation, `accessibilityLiveRegion="polite"` announcing each minute)
- Modify: `apps/mobile/src/screens/quiz-detail/quiz-attempt-form.tsx` (at 0: `await flush()`, then refetch the student detail — the GET closes the expired attempt — and show the result stage; no submit call; toast "Time's up — your answers were submitted.")
- Modify: `apps/mobile/src/screens/quiz-grade/online-grading.tsx` + `attempt-sheet.tsx` ("In progress" rows from `waiting[]` get an "End attempt" button with `ConfirmDialog` "End {name}'s attempt? Their saved answers are submitted.")
- Create hook: `useEndAttempt(quizId)` in `apps/mobile/src/hooks/use-quizzes/grading.ts`
- Test: `apps/mobile/src/__tests__/quiz-countdown.test.ts`; modify `quiz-runner.test.tsx`, `quiz-grading-online.test.tsx`, `quiz-authoring.test.tsx`

**Interfaces — Produces:**
- `clockOffsetMs(serverNowIso: string, receivedAt: number): number`
- `remainingMs(deadlineIso: string, offsetMs: number, now: number): number` (≥ 0)
- `formatRemaining(ms: number): string` (`"19:05"`, `"0:42"`)

- [ ] **Step 1: Failing tests:** `countdown corrects for a skewed clock` (phone 5 min fast → same remaining); `formatRemaining`; runner: `locked before window shows the opening time`; `at zero submits and shows the submitted stage`; grading: `End attempt posts and refreshes`; authoring: `time limit field is locked once attempts exist`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS; `pnpm check` green.
- [ ] **Step 5:** Seed a timed quiz (window open now, 20 min) in `seed-sweep/activity.ts`; add shots to `s06-quizzes.yaml` (start card, countdown) and `s26-quizzes.yaml` (details sheet); run `ui-sweep` for those flows; fix what the shots show.
- [ ] **Step 6: Commit** — `feat(mobile): quiz start window, countdown, auto-submit and staff End`.
