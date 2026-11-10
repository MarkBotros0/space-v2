# Quiz integrity and live screen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** While a student has an open quiz attempt the app blocks screenshots, recording, copy and paste, keeps the screen awake, holds its own notifications, opens straight into the quiz on every launch, warns on every exit and ends the attempt on the third; staff see every exit and a live screen of the room. Same behaviour on iPhone and Android.

**Architecture:** The phone reports exits as idempotent events (`POST /quizzes/:id/attempt/events`, client-generated ids); the **server** stores them in `QuizAttemptEvent`, counts exits and closes the attempt at the third with `closeAttempt(…, "ENDED_BY_EXITS")` from the timing plan. On the phone, one hook (`useQuizLock`) owns everything that applies while an attempt is open (capture block, keep-awake, notification hold, back-button block, AppState/dimension watching, the event queue); a Zustand flag `openAttemptQuizId` drives the launch redirect and the route guard. A live endpoint and screen poll every 4 s.

**Tech Stack:** Expo 58 (`expo-screen-capture`, `expo-keep-awake`, `expo-notifications`), expo-router, Zustand, React Query; Express 5, Prisma 7; Jest.

**Spec:** `docs/superpowers/specs/2026-11-10-quiz-question-types-and-integrity-design.md` — sections Integrity (Blocked, Leaving the quiz, Relaunch, Before you start, Honest accidents), Marking (exit log), Live screen.

**Depends on:** the quiz-types plan and the timing plan (`closeAttempt`, `QuizAttemptEndReason.ENDED_BY_EXITS`, `endAttempt`, `useEndAttempt`).

## Global Constraints

- Everything in the quiz-types plan's Global Constraints applies.
- Same rules on both platforms. No Apple Automatic Assessment Configuration, no Android screen pinning, no Do Not Disturb permission.
- Exit limit is fixed for every quiz: exits 1 and 2 warn, exit 3 ends the attempt. `MAX_EXITS = 3` lives in `packages/shared`.
- The warning never shows a count. Exact copy: title "You left the quiz", body "Leaving the quiz isn't allowed and has been recorded. Leaving again may end your attempt." Ended copy: "Your attempt has ended because you left the quiz. Your answers were submitted. Ask your leader if this was a mistake."
- Counts as an exit: AppState → `background` (home, app switch, tapping another app's notification, power-button lock, a call that takes over the screen); an Android multi-window shrink (window height < 85% of screen height for > 1 s); a cold start while an attempt is open (crash, kill, dead battery). Not an exit: iOS `inactive` without reaching `background` (Control Center / notification shade peek), network loss, a screenshot attempt (logged only).
- Known limit, documented in `docs/rules/quiz-integrity.md`: an Android floating (picture-in-picture/bubble) window that doesn't resize ours is not detectable without also counting the notification shade, so it isn't counted.
- The server's count is the truth; the phone never decides the third exit alone. Events carry a client UUID; `(attemptId, clientEventId)` is unique, so retries and offline replays never double-count.

## Review Focus

1. **Exit while offline** — the event is queued in secure storage and sent on reconnect; the warning still shows on return; if the server says ended, the app moves to the result stage then. Pinned in Task 4 (`queued exit is sent once on reconnect`).
2. **Same exit reported twice** (AppState fires background twice, or a retry) — counted once. Pinned in Task 1 (`duplicate clientEventId counts once`).
3. **Kill the app, reopen** — lands in the quiz, one exit recorded with `kind: RELAUNCH`. Pinned in Task 4 (`cold start with an open attempt records one relaunch exit`).
4. **Deep link or notification tap into another screen while an attempt is open** — redirected back to the quiz. Pinned in Task 5 (`guard redirects any route while an attempt is open`).
5. **Third exit arrives after the deadline already closed it** — no error to the student, no double close; status stays TIMED_OUT. Pinned in Task 1 (`exit on a closed attempt is ignored`).

---

### Task 1: Exit events — schema, endpoint, server count

**Files:**
- Create: `apps/backend/prisma/migrations/20261114010000_quiz_attempt_events/{migration.sql,rollback.sql}`
- Modify: `apps/backend/prisma/schema.prisma`, erd, snapshot, `integration/fixtures.ts` cleanup
- Modify: `packages/shared/src/quiz/writes.ts` (`quizAttemptEventsRequestSchema`), `responses.ts` (`quizAttemptEventsResponseSchema`), `packages/shared/src/quiz/index.ts` (`MAX_EXITS = 3`)
- Create: `apps/backend/src/lib/quizzes/attempt-events.ts`
- Create: `apps/backend/src/routes/quizzes/attempt-events.ts`; register `quizzesRouter.post("/:id/attempt/events", postAttemptEvents)`; route-inventory snapshot
- Test: `apps/backend/src/__tests__/integration/quizzes-attempt-events-routes.test.ts`

**Interfaces — Produces:**
- `enum QuizAttemptEventKind { EXIT RELAUNCH SCREENSHOT }`
- `model QuizAttemptEvent { id, attemptId → QuizAttempt (Cascade), kind, clientEventId String (uuid), leftAt DateTime @db.Timestamptz(3), returnedAt DateTime? @db.Timestamptz(3), createdAt; @@unique([attemptId, clientEventId]); @@index([attemptId, leftAt]) }` — append-only (add to `APPEND_ONLY` with "event log, never updated").
- Request: `{ events: { clientEventId: uuid; kind: "EXIT"|"RELAUNCH"|"SCREENSHOT"; leftAt: iso; returnedAt: iso|null }[] 1..20 }`.
- Response: `{ exits: number; ended: boolean; status: QuizAttemptStatus }` — `exits` is internal (the app never displays it).
- `recordAttemptEvents(attemptId, events): Promise<{ exits: number; ended: boolean }>` — under the attempt row lock: if the attempt isn't IN_PROGRESS, store nothing and return `{exits, ended: false}`; insert with `skipDuplicates`; `exits` = count of EXIT + RELAUNCH rows; if `exits >= MAX_EXITS` call the timing plan's close core with `ENDED_BY_EXITS` inside the same transaction.
- Route gate: student, own latest attempt, same `canTakeQuizIn` gate as saves. `leftAt` later than server now + 60 s is refused 400 (`event_in_future`).

- [ ] **Step 1: Failing integration tests:** `first and second exit return ended false`; `third exit ends the attempt ENDED_BY_EXITS and marks saved answers`; `duplicate clientEventId counts once`; `screenshot events don't count`; `relaunch counts as an exit`; `exit on a closed attempt is ignored`; `another student's attempt is unreachable` (403/no_attempt); `raw JSON of the response has no answer data`.
- [ ] **Step 2: Run** `pnpm --filter @space/backend test:integration -- quizzes-attempt-events` → FAIL. **Step 3: Implement** (migration cycled, schema, docs path). **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(backend): server-counted quiz exit events; third exit ends the attempt`.

### Task 2: Staff views — exit log and live endpoint

**Files:**
- Modify: `packages/shared/src/quiz/grading.ts` (`quizGradingAttemptSchema` + `endReason`, `events: {kind, leftAt, returnedAt}[]`)
- Create: `packages/shared/src/quiz/live.ts` (`quizLiveSchema`)
- Modify: `apps/backend/src/routes/quizzes/grading.ts` or its view module (attach events, author order)
- Create: `apps/backend/src/routes/quizzes/live.ts`; register `quizzesRouter.get("/:id/live", getQuizLive)` (before `/:id`-style catch-alls as the table orders them)
- Test: `apps/backend/src/__tests__/integration/quizzes-live-routes.test.ts`

**Interfaces — Produces:**
- `quizLiveSchema = { quizId, title, timeLimitMinutes: number|null, serverNow: iso, rows: { studentUserId, studentName, groupName, state: "not_started"|"in_progress"|"submitted"|"graded"|"timed_out"|"ended_by_exits"|"ended_by_staff", deadlineAt: iso|null, exits: number, lastExitAt: iso|null }[] }` — rows for `visibleStudentIdsForQuiz`, latest attempt each, sorted: in_progress with exits first, then in_progress, not_started, then finished by name.
- `getQuizLive` — `canGradeQuiz`; calls `closeExpiredForQuiz(quizId)` first.

- [ ] **Step 1: Failing tests:** `live lists every student in scope with state`; `exits and lastExitAt reflect events`; `expired attempt shows timed_out` (deadline in the past); `leader sees only their students; admin and super see all`; `grading attempts carry the exit log`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(backend): quiz exit log on grading and a live endpoint`.

### Task 3: Mobile — install and the content locks

**Files:**
- Modify: `apps/mobile/package.json` (`expo-screen-capture`, `expo-keep-awake` via `npx expo install`), `app.json` plugins only if the packages need one (check their docs; neither normally does)
- Create: `apps/mobile/src/screens/quiz-detail/lock/use-capture-lock.ts`, `use-notification-hold.ts`
- Modify: `apps/mobile/src/lib/notifications*` (the existing `setNotificationHandler` site — find with `grep -rn setNotificationHandler apps/mobile/src`) to return `shouldShowBanner/List/Sound: false` while `useQuizLockStore.getState().openAttemptQuizId` is set
- Create: `apps/mobile/src/store/quiz-lock.ts` (Zustand: `openAttemptQuizId: number|null`, `setOpenAttempt(id|null)`)
- Modify: answer inputs from the quiz-types plan (`questions/fill-blank.tsx`, `essay.tsx`): `contextMenuHidden`, `autoCorrect={false}`, `spellCheck={false}`, `autoComplete="off"`, `importantForAutofill="no"`, `textContentType="none"`
- Test: `apps/mobile/src/__tests__/quiz-locks.test.tsx`

**Interfaces — Produces:**
- `useCaptureLock(active: boolean, onScreenshot: () => void)` — `usePreventScreenCapture` while active; `addScreenshotListener` → `onScreenshot`.
- `useNotificationHold(active: boolean)` — sets the store flag the handler reads.
- `useKeepAwake` from `expo-keep-awake` is called by the lock hook in Task 4 while active.

- [ ] **Step 1: Failing tests** (mock both expo modules): `capture is prevented while active and released after`; `screenshot listener calls onScreenshot`; `notification handler hides banners while an attempt is open`; `answer inputs hide the paste menu and autocorrect`.
- [ ] **Step 2: Run** `pnpm --filter @space/mobile test:unit -- quiz-locks` → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(mobile): block capture, paste and the app's own banners during a quiz`.

### Task 4: Mobile — exit detection, queue and warning

**Files:**
- Create: `apps/mobile/src/screens/quiz-detail/lock/exit-model.ts` (pure), `exit-queue.ts` (secure-store backed), `use-quiz-lock.ts`, `exit-warning.tsx`
- Create hook: `usePostAttemptEvents(quizId)` in `apps/mobile/src/hooks/use-quizzes/student.ts`
- Modify: `apps/mobile/src/screens/quiz-detail/quiz-attempt-form.tsx` (mount `useQuizLock`), `student-quiz-runner.tsx`
- Test: `apps/mobile/src/__tests__/quiz-exit-model.test.ts`, `quiz-exit-flow.test.tsx`

**Interfaces — Produces:**
- `exitTransition(prev: AppStateStatus, next: AppStateStatus): "left" | "returned" | null` — `left` only on `→ background`; `returned` on `background → active`; `inactive` alone → null.
- `isMultiWindow(window: {height}, screen: {height}): boolean` — `window.height < 0.85 * screen.height`.
- `ExitQueue`: `enqueue(e: QuizAttemptEventInput): Promise<void>`, `drain(send: (events) => Promise<Response>): Promise<Response | null>`, `peek(): Promise<QuizAttemptEventInput[]>` — key `quiz-exit-queue:{attemptId}`; drain removes only sent ids.
- `useQuizLock({ quizId, attemptId, active })` — while active: capture lock, notification hold, `useKeepAwake`, Android `BackHandler` returns true, AppState and `Dimensions` listeners; on `left` record `leftAt`; on `returned` enqueue EXIT `{leftAt, returnedAt}` and drain; on mount, if `ExitQueue` has a pending "left" marker without `returnedAt` **or** the mount is a cold start with an open attempt (`AppState.currentState === "active"` and a persisted `quiz-open:{attemptId}` marker from the previous run), enqueue RELAUNCH; on a drain response `{ended: true}` invalidate the student detail (result stage shows the ended copy); otherwise show `ExitWarning` (a `ConfirmDialog`-style modal, single "Back to the quiz" action, `bad` tone icon).
- `ExitWarning({ open, onClose })` — exact copy from Global Constraints.

- [ ] **Step 1: Failing tests:** `exitTransition` table (active→inactive→active is null; active→background→active is left then returned); `isMultiWindow`; flow: `background then active posts one EXIT and shows the warning`; `queued exit is sent once on reconnect` (first post rejects offline, then `useIsOnline` flips); `ended response moves to the ended result`; `cold start with an open attempt records one relaunch exit`; `warning copy has no number in it`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(mobile): count quiz exits, warn, and end on the third`.

### Task 5: Mobile — launch redirect, route guard, before-you-start

**Files:**
- Create: `apps/backend` endpoint `GET /api/v1/me/open-quiz-attempt` → `{ quizId: number|null }` (in the existing `/me` router; student's IN_PROGRESS attempt after `closeIfExpired`), shared `openQuizAttemptSchema`, integration test `me-open-quiz-attempt.test.ts`
- Create hook: `useOpenQuizAttempt()` in `apps/mobile/src/hooks/use-quizzes/student.ts` (sets `useQuizLockStore.setOpenAttempt`)
- Modify: `apps/mobile/app/index.tsx:7` (authenticated student with an open attempt → `/quiz/[id]`), `apps/mobile/app/(app)/_layout.tsx:118-136` (guard: any route other than `/quiz/[id]` for that id → `router.replace` to it), `app/(app)/_layout.tsx:91` (quiz route uses options with `gestureEnabled: false` and no back button while the store flag matches)
- Create: `apps/mobile/src/screens/quiz-detail/before-you-start.tsx` (replaces the start card body: title, time limit line, three short points — "Turn on Do Not Disturb or Focus.", "Leaving the quiz is recorded. Leaving more than twice ends your attempt.", "Screenshots are blocked." — and an "I'm ready" `SaveBar` that calls start)
- Test: `apps/mobile/src/__tests__/quiz-lock-routing.test.tsx`; backend integration as above

- [ ] **Step 1: Failing tests:** backend `returns the open attempt's quiz, null after submit, null after it expired`; mobile `launch with an open attempt lands on the quiz`; `guard redirects any route while an attempt is open`; `after submit the guard lifts`; `before-you-start shows the limit and starts on I'm ready`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(mobile): reopen into an open quiz and the before-you-start screen`.

### Task 6: Mobile — live screen and exit log

**Files:**
- Create: `apps/mobile/app/(app)/quiz/[id]/live.tsx` (register in `DETAIL_ROUTE_NAMES`, `app/(app)/_layout.tsx:66-69`)
- Create: `apps/mobile/src/screens/quiz-live/{live-screen.tsx,live-model.ts}`; hook `useQuizLive(id)` (`refetchInterval: 4000` while focused, paused in background) in `apps/mobile/src/hooks/use-quizzes/staff.ts`
- Modify: `apps/mobile/src/screens/quiz-detail/staff-quiz-preview.tsx` (a "Live" `PillButton` while the quiz is published), `apps/mobile/src/screens/quiz-grade/attempt-sheet.tsx` (exit log section: each exit "Left 6:14 pm · away 0:42", the end reason line)
- Test: `apps/mobile/src/__tests__/quiz-live-model.test.ts`, `quiz-live-screen.test.tsx`

**Interfaces — Produces:**
- `liveSummary(rows): { notStarted; inProgress; finished; withExits }` and `liveRowView(row, offsetMs, now): { title; stateChip: ChipSpec; detail: string }` — detail e.g. "12:30 left · 1 exit", "Ended — left the quiz", "Timed out".
- Screen: summary tiles (`StatTile` ×3), a `GroupedList` of rows; row actions in a `Sheet`: "End attempt" (in progress; `useEndAttempt`) and "Reopen" (finished; `useReopenAttempt`). Staff here = leader, admin, super.

- [ ] **Step 1: Failing tests:** `liveSummary` counts; `liveRowView` for each state; screen `polls every 4 s while focused`; `End attempt from the live screen posts`; `exit log lists each exit with duration`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS; `pnpm check` green.
- [ ] **Step 5: Commit** — `feat(mobile): live quiz screen and exit log`.

### Task 7: Rules, sweep and device check

**Files:**
- Modify: `docs/rules/quiz-integrity.md` (Integrity + Live sections, the floating-window limit), `apps/mobile/CLAUDE.md` feature map (quiz-live, lock)
- Modify: `apps/backend/scripts/seed-sweep/activity.ts` (an in-progress attempt with two exits; a finished one ended by exits), `.maestro/sweep/student-scenarios/s06-quizzes.yaml` (before-you-start), `leader-scenarios/s16-quizzes.yaml` (live screen, exit log)

- [ ] **Step 1:** Rules and docs; `pnpm check:docs`.
- [ ] **Step 2:** Run `ui-sweep` for `s06,s16` and fix what the shots show.
- [ ] **Step 3: Device check on a real iPhone and a real Android** (TestFlight / dev build; capture blocking doesn't show in a simulator): screenshot is blank on both; home → back shows the warning; third exit ends; kill and reopen lands in the quiz with one exit; Control Center peek on iPhone and the notification shade on Android don't warn; split screen on Android warns. Record the results in the commit body.
- [ ] **Step 4: Commit** — `docs(quizzes): integrity rules; sweep the lock and live screens`.
