# Redesign 02: Student, signed-out and personal screens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild every screen a student touches, the signed-out screens and the shared personal screens on plan 01's kit: Today opens on the next session with Check in and the open work, a merged Work tab replaces Assignments and Quizzes, and every screen moves to `Screen`, grouped lists, one chip set and sheets.

**Architecture:** Screens compose `src/design/`; shared kit changes are additive props that default to today's look. Screen sections live in `src/screens/<screen>/`; route files stay thin and keep other roles' branches byte-identical wherever possible. Two read-only backend additions (`dueOrgDay` on the student assignment list, `todayOrgDay` + `assignments.open` on the student dashboard) make the chips and Today server-derived.

**Tech Stack:** Expo SDK 58, expo-router, NativeWind, React Query, Reanimated 4, react-native-svg, Express 5 + Prisma 7 (read-only additions), Zod (`packages/shared`), Jest + @testing-library/react-native, Maestro sweep.

**Spec:** `docs/superpowers/specs/2026-11-04-mobile-redesign-design.md`. Foundation: `docs/superpowers/plans/2026-11-04-redesign-01-foundation.md`. Rulings R1–R36: `/home/mark/projects/JPC/.redesign-rig/plan-01-ledger.md`. Device findings: `/home/mark/projects/JPC/.redesign-rig/role-review-A.md`. Assignment brief: `.redesign-rig/BRIEF-common.md` + `BRIEF-02-student.md`.

## Decisions this plan makes (rulings P2-*)

- **P2-1 Work tab: merge.** Student tabs become Today, Calendar, Work, More (the approved mockup). New route `/work`. Spec's Today says "See all to the Work list"; it also removes the truncated "Assignme…" tab label — cost if wrong: restore two nav entries, the model splits by kind.
- **P2-2 Assignments and quizzes move to the stack.** `/assignments` and `/quizzes` become a tab for no role, so the derived route rule (`route-names.ts`) puts them in `app/(app)/`. Done as pure-rename commits so sibling branches' edits follow the rename on rebase. A student opening either (deep link, notification) is redirected to `/work`.
- **P2-3 Check in on Today uses `useSessionDetail(next.id)`**, no new backend field: same `checkInOpen`/`myAttendance` as the session screen, shared cache. Failure degrades to the card without the action.
- **P2-4 "Open work"** = assignments PENDING, DRAFT or RETURNED, plus ONLINE quizzes with no score and attempt null or IN_PROGRESS. `outstandingCount` (C5/D15) keeps its definition (PENDING | DRAFT).
- **P2-5 Today's list** = overdue, then returned, then due within 7 org days, then open quizzes. Later or undated work is behind "See all".
- **P2-6 Figures below the action:** a 2×2 tile grid (Absence budget left, Streak, Assignments pending, Sessions done `held/total`) so the tiles never leave an orphan full-width third; season title + "N sessions to go" is a row to `/season`.
- **P2-7 Brand hero.** `HeroCard` gains `tone="brand"` (navy in light, navy-700 in dark, per the mockup) with its own tokens and a Button `onHero` variant. Default look unchanged.

## Global Constraints

- Every source and test file ≤ 400 lines; relative imports only; no `@/` alias; no non-route files under `app/`.
- No `process.env` outside `src/lib/app-config.ts` (mobile) / `src/lib/config.ts` (backend).
- Contrast: text 4.5:1, icons and control borders 3:1, in light and dark; tap targets ≥ 44pt; works at font scale 1.3 on a 360dp phone; no word breaks mid-word; never truncate a time, date, count or name mid-word.
- No hex/rgb literals, no `shadow-`/elevation, radii only `rounded-group|control|full|none`, no raw font sizes outside `src/design/`: use `Text` `variant`. `design-consistency.test.ts`, `no-classname-on-animated.test.ts` and the contrast tests stay green. No `className` on `Animated.*`.
- Every screen renders `Screen` (`design/layout/screen.tsx`) with a large title; pushed screens get the Back bar by default, never an in-content back link. Status always through `StatusChip` (`statusChip`, `dueChip`), each chip a word.
- Motion only through `src/design/motion`; every animated thing reads `useReducedMotion`; no state depends on an animation finishing.
- `src/design/` and `packages/shared` are **additive**: new props default to current behaviour; no renames, no changed defaults (exceptions: `dueChip` per R8; student's own tab set). Before adding to the kit: `git diff redesign/foundation..redesign/03-leader --stat -- apps/mobile/src/design` (and `04-admin-super`, `05-mentor-alumni`), match an existing name/API if one does the job.
- Other roles' branches inside a shared route stay as they are. Keep behaviour and copy from v1/v2 where clear; nothing a student can do today disappears. Never `as Href`/`as any` on a route.
- Backend: read-only additions only, no migrations, OpenAPI entry in the same commit. Integration tests never against staging: throwaway local Docker Postgres, serially.
- Sweep flows: `apps/mobile/.maestro/sweep/`; never save; a task that changes a screen updates its flow's waits in the same commit and runs `~/.maestro/bin/maestro check-syntax <flow>`. Implementers do not drive the emulator (controller does, Task 15).
- One commit per fix; messages end with the session's `Co-Authored-By` / `Claude-Session` lines. No pushing from tasks. Shared-route edits say so in the commit message.
- Tests: `pnpm --filter @space/mobile exec jest <pattern>`; before each commit `pnpm --filter @space/mobile typecheck` and `lint`; full `pnpm --filter @space/mobile test:unit` in tmux (`tmux new -d -s space-v2-r02-unit "… 2>&1 | tee ~/logs/space-v2-r02-unit.log"`), waited on with a background loop. Existing tests that pin old copy/layout are updated to the new screen, never deleted if they pin a behaviour.

## Review Focus

1. **A student with no active season or not enrolled (`activeSeasonId` null, `season` null):** Today and Work send no season query and show their empty states (tests in Tasks 6, 7).
2. **A device clock in another timezone around a due-day boundary:** the chip still comes from `isOverdue`/`dueOrgDay`/`todayOrgDay`, so the student agrees with their leader (Task 2 test; Task 7 passes server fields).
3. **Long assignment title with a chip at font 1.3 on 360dp:** the title wraps to two lines, the chip stays whole (Task 3 `titleLines` test; Tasks 6, 7 use it).
4. **One of two queries failing:** session detail fails on Today → the session card still shows, no action; quiz list fails on Work → assignments still render with `InlineError` for quizzes (tests in Tasks 6, 7).
5. **Check-in refused or repeated:** already checked in, not open, and refused codes show the right message; a second tap while pending does nothing; the typed-code fallback stays reachable with the camera denied (Task 5).

---

### Task 1: Read-only server fields for chips and Today

**Files:**
- Modify: `packages/shared/src/assignment.ts` (`studentAssignmentListItemSchema` + `dueOrgDay: isoDaySchema.nullable()`), `packages/shared/src/dashboard.ts`
- Modify: `apps/backend/src/lib/queries/assignments/student.ts:101` (stop stripping `dueOrgDay`), `apps/backend/src/lib/dashboard-figures.ts`, `apps/backend/src/lib/queries/dashboard.ts`, `apps/backend/src/docs/paths/me.ts`, `apps/backend/src/docs/components/sessions-assignments.ts`
- Test: `apps/backend/src/__tests__/dashboard-figures.test.ts`, `apps/backend/src/__tests__/integration/dashboard-routes.test.ts`, the assignments integration test that pins the student row, `packages/shared/src/__tests__/dashboard.test.ts`, `apps/mobile/src/__tests__/helpers/dashboard-fixtures.ts`, mobile assignment fixtures

**Interfaces:**
- Produces: `StudentDashboard.todayOrgDay: string` (always present, also when not enrolled); `StudentAssignmentSummary.open: DashboardDueItem[]` (uncapped; PENDING | DRAFT | RETURNED; `dueAt` asc nulls last, then id); `StudentAssignmentListItem.dueOrgDay: string | null`. `dueSoon`, `outstandingCount`, `overdueCount` unchanged.

- [ ] **Step 1: Failing unit tests.** In `dashboard-figures.test.ts`: `summarizeStudentAssignments(rows, 3).open` holds every PENDING/DRAFT/RETURNED row (more than 3) in `dueAt` asc nulls-last order, excludes SUBMITTED/REVIEWED, and `outstandingCount` still excludes RETURNED. In shared `dashboard.test.ts`: schema requires `todayOrgDay`; `.strict()` still refuses unknown keys.
- [ ] **Step 2: Run** `pnpm --filter @space/backend exec jest dashboard-figures` → FAIL.
- [ ] **Step 3: Implement.** `open` computed in `summarizeStudentAssignments`; `todayOrgDay: orgDayKey(now)` in both returns of the student dashboard loader; list rows keep `dueOrgDay`. Update OpenAPI (`todayOrgDay`, `assignments.open`, list row `dueOrgDay`).
- [ ] **Step 4: Run** backend + shared unit tests and `typecheck`; update mobile fixtures so mobile `typecheck` passes.
- [ ] **Step 5: Integration on a throwaway DB.** `docker run -d --rm --name space-v2-r02-pg -e POSTGRES_PASSWORD=x -p 55461:5432 postgres:16`, apply migrations with `DATABASE_URL` pointed at it, run only `dashboard-routes` and the student assignment-list integration test with `--runInBand`, stop the container. Expected: PASS, with new assertions that `d.todayOrgDay` matches `/^\d{4}-\d{2}-\d{2}$/` and that `assignments.open` includes a RETURNED row.
- [ ] **Step 6: Commit** `feat(backend): student dashboard returns todayOrgDay and the full open work list; list rows carry dueOrgDay`.

### Task 2: dueChip from server fields (R8)

**Files:**
- Modify: `apps/mobile/src/design/ui/status-chip.tsx`, `apps/mobile/src/screens/design-catalogue/chips-section.tsx`
- Test: `apps/mobile/src/__tests__/status-chip.test.tsx`

**Interfaces:**
- Produces: `dueChip({ isOverdue, dueOrgDay, todayOrgDay }: { isOverdue: boolean; dueOrgDay: string | null; todayOrgDay: string }): ChipSpec`. Uses `daysBetween` from `lib/calendar-grid` (export it if private). No device clock, no `differenceInCalendarDays`.

- [ ] **Step 1: Failing test** (`it.each`, today `2026-11-05`): overdue flag wins whatever the days say → `{bad,"Overdue"}`; `dueOrgDay` null → `{neutral,"No due date"}`; same day → `{warn,"Due today"}`; +1 → `{warn,"Due in 1 day"}`; +2 → `{warn,"Due in 2 days"}`; +3 → `{neutral,"Due Sunday"}`; +6 → `{neutral,"Due Wednesday"}`; +7 → `{neutral,"Due Nov 12"}`. A test with `TZ` irrelevant: the weekday is read from the day key, so it never shifts.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**, update the catalogue's calls. **Step 4: Run** → PASS; `typecheck`; grep the sibling branches for old-signature callers and record any in the ledger.
- [ ] **Step 5: Commit** `fix(mobile): dueChip reads the server's overdue flag and org days (R8)`.

### Task 3: Kit additions the student screens need

**Files:**
- Modify: `apps/mobile/src/design/theme/tokens.json` (regenerate with `design:tokens`), `src/design/ui/hero-card.tsx`, `src/design/ui/button.tsx`, `src/design/ui/grouped-list.tsx`, `src/design/ui/stat-tile.tsx`, `src/design/layout/screen.tsx`, `src/design/layout/save-bar.tsx`, `src/screens/design-catalogue/*`
- Test: `design-tokens-contrast.test.ts`, `hero-card` / `grouped-list` / `stat-tile` / `screen` / `save-bar` tests (extend the existing file for each, or create beside them)

**Interfaces (each default = today's behaviour):**
- `HeroCard` `tone?: "surface" | "brand"`; `Button` `variant="onHero"`.
- Tokens: `hero`, `hero-foreground`, `hero-eyebrow`, `hero-muted`, `on-hero`, `on-hero-foreground` (light hero `#142048`, eyebrow `#ABDFE2`, muted `#D4DAEA`, action `#7DCED1` on `#103436`; dark hero `#24346E`; adjust any value the test rejects).
- `ListRow` `leading?: ReactNode`, `titleLines?: number` (default 1), `subtitleLines?: number` (default 2).
- `GroupedList` `headerAction?: { label: string; onPress: () => void }` (a 44pt `link` on the header line, label ≥4.5:1).
- `StatTile` `onPress?: () => void` (role button, press scale; no `onPress` = today's plain view).
- `Screen` `compactTitle?: string` (overrides the collapsed title; Home's stays "Today" when unset) and `footer?: ReactNode` (renders pinned over the bottom; its measured height is added to the scroll content's bottom padding).
- `SaveBar`/`SaveBarBody` `secondary?: { label: string; onPress: () => void; disabled?: boolean }` and `disabled?: boolean`; `SheetSaveBar` inherits.

- [ ] **Step 1: Failing tests.** Contrast: `hero-foreground`, `hero-eyebrow`, `hero-muted` on `hero` ≥4.5, `on-hero-foreground` on `on-hero` ≥4.5, `on-hero` on `hero` ≥3, both themes. `ListRow title titleLines={2}` → title `numberOfLines` 2; default still 1. `GroupedList headerAction` fires `onPress`. `StatTile onPress` is a button with the label in its a11y label; without it, no button role. `Screen footer`: footer rendered, content padding grows after a layout event with height 80. `SaveBar secondary` renders both, each fires its handler; `disabled` blocks the primary.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**, add `tone="brand"` and the new row props to the catalogue. **Step 4: Run** → PASS; `typecheck`, `lint`.
- [ ] **Step 5: Commit** one per component group (`feat(mobile): …`), each green.

### Task 4: Signed-out screens

**Files:**
- Create: `apps/mobile/src/lib/auth-error.ts`
- Modify: `app/login.tsx`, `app/forgot-password.tsx`, `app/reset-password.tsx`, `app/accept-invite.tsx`, `src/design/layout/auth-card.tsx` (text variants, status tones, 44pt `AuthLink`; additive, no API change), `.maestro/sweep/s01-signed-out.yaml`
- Test: `apps/mobile/src/__tests__/auth-error.test.ts`, the existing login/forgot/reset/invite screen tests

**Interfaces:**
- Produces: `authErrorMessage(err: unknown, badCredentials: string): string`: no `err.response` → `"Can't reach JPC Space. Check your connection and try again."`; 401 → `badCredentials`; 429 or other 4xx with a parsable envelope → `apiErrorMessage`'s server text; 5xx or unparsable → `"Something went wrong on our side. Try again in a moment."`.

- [ ] **Step 1: Failing tests.** `auth-error.test.ts` covers each branch above with axios-shaped errors. Login screen test: a network error shows "Can't reach JPC Space…", a 401 shows "Invalid email or password." and the fields keep their values.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** Login's catch uses it (401 copy unchanged); forgot/reset/invite use it wherever they currently show a generic failure. `AuthCard` title `variant="title"`, description `variant="subhead"`, `AuthNotice` `bg-bad-soft text-bad` / `bg-ok-soft text-ok` `rounded-control`, links `min-h-[44px]` centred. `index` and `+not-found` stay redirects.
- [ ] **Step 4: Run** targeted tests, `typecheck`, `lint`; check-syntax s01.
- [ ] **Step 5: Commit** `fix(mobile): login says when it can't reach the server instead of blaming the password`, then `feat(mobile): signed-out screens on the type scale and status tones`.

### Task 5: Check-in sheet and the success moment

**Files:**
- Create: `apps/mobile/src/components/check-in/check-in-success.tsx`
- Modify: `src/components/check-in/StudentCheckInCard.tsx`, `src/components/check-in/CheckInResult.tsx` (status tones), `app/checkin/[token].tsx` (renders `Screen` with `back={null}`, `Go to Today` as plain Button), `src/screens/design-catalogue/states-sheet-sections.tsx`, `.maestro/sweep/s90-design-catalogue.yaml` if the section needs its own shot
- Test: `apps/mobile/src/__tests__/check-in-success.test.tsx`, existing check-in tests

**Interfaces:**
- Produces: `CheckInSuccess({ outcome, attendance }: { outcome: Extract<CheckInOutcome,{kind:"checked_in"}>; attendance: { attended: number; total: number } | null })`; `StudentCheckInCard({ detail, onHero }: { detail: SessionDetail; onHero?: boolean })` (name kept; session screen and Today both use it), `attendanceTally(rows: MyAttendanceSession[]): { attended: number; total: number } | null` in `src/lib/check-in-result.ts`.

- [ ] **Step 1: Failing tests.** Reduced motion: `CheckInSuccess` renders final state and title "You're checked in!"; `haptic("success")` fired once on mount (mock); a late outcome shows the late copy and warn tone; `attendance` null hides the ring without error; tally ignores unmarked rows and counts LATE as attended. `StudentCheckInCard`: not open → disabled + "Check-in hasn't opened yet"; checked in → "You checked in at …", no button; press opens the `Sheet`; "Enter code instead" reachable; bad code → `That doesn't look like a check-in code`; pending → submit blocked (no second `mutate`); refused → message from `checkInCopy`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** Replace `Modal` with kit `Sheet`; `CheckInSuccess` draws the check (react-native-svg + `useAnimatedProps` strokeDashoffset over `DURATION.slow`) and pulses a `ProgressRing` once (`SPRING.gentle`), caption "Season attendance · 3 of 4 sessions", `Done` button. Captions use full `text-muted-foreground`; `onHero` swaps to `Button variant="onHero"` and `text-hero-muted`. Confirm `useCheckIn` invalidates session detail, dashboard and my-attendance; add what's missing. Add the success state to the catalogue (not reachable in a read-only sweep).
- [ ] **Step 4: Run** targeted, `typecheck`, `lint`.
- [ ] **Step 5: Commit** `feat(mobile): check-in opens as a sheet and ends on the success moment`.

### Task 6: Student Today

**Files:**
- Create: `apps/mobile/src/screens/today/student-today.tsx`, `src/screens/today/next-session-hero.tsx`, `src/screens/today/open-work-list.tsx`, `src/screens/today/today-figures.tsx`, `src/screens/work/work-model.ts`
- Delete: `src/components/dashboard/StudentDashboard.tsx` (after moving tests)
- Modify: `app/(app)/(tabs)/dashboard.tsx` (student case only), `.maestro/sweep/student-scenarios/s03-dashboard.yaml`, `src/design/sessions/next-session-card.tsx` stays for staff (do not edit)
- Test: `apps/mobile/src/__tests__/student-today.test.tsx`, `apps/mobile/src/__tests__/work-model.test.ts`, update tests that imported `StudentDashboard`

**Interfaces:**
- Consumes: Task 1 fields; Task 2 `dueChip`; Task 3 props; Task 5 `StudentCheckInCard`.
- Produces in `work-model.ts`: `type WorkRow = { key: string; kind: "assignment" | "quiz"; id: number; title: string; subtitle?: string; chip?: ChipSpec; score?: string; href: Href | null }`; `assignmentRow(a: StudentAssignmentListItem, todayOrgDay: string): WorkRow`; `quizRow(q: StudentQuizResult): WorkRow`; `isOpenQuiz(q): boolean`; `todayWork(open: DashboardDueItem[], quizzes: StudentQuizResult[], todayOrgDay: string): WorkRow[]`.

Chip rules: RETURNED → `statusChip("submission","RETURNED")`, subtitle "Returned with comments"; overdue or open → `dueChip`; DRAFT adds subtitle "Draft saved"; SUBMITTED/REVIEWED → `statusChip`. Quiz: attempt null → `{info,"Take quiz"}`; IN_PROGRESS → `{warn,"Resume"}`; SUBMITTED, no score → `{neutral,"Awaiting grading"}`; PAPER, no score → `{neutral,"Pending"}` with `href` null; scored → `score: "8/10"`, subtitle `80%`, plus "Graded <date>"; `row.notes` appended to subtitle.

Layout, top to bottom: `Screen home title="Hi, <first name>" subtitle=<long org date from todayOrgDay> compactTitle="Today"`; no emoji. `NextSessionHero` (`tone="brand"`; eyebrow "Next session · in 2 days" via `dayCue`, or "Happening now"; title opens the session; meta `Fri, Nov 6 · 8:00 PM · 90 min · Hall A`; action `StudentCheckInCard onHero`; "Join stream" only while in progress with a URL, D13). No session: `No upcoming sessions.` on a surface hero. `OpenWorkList` (`GroupedList header="To do" headerAction See all → /work`, `titleLines={2}`; empty: one row "You're all caught up."; only later work: "Nothing due this week."). Late callout (`bg-warn-soft`, keep copy). `TodayFigures` (P2-6; tiles to `/attendance`, `/work`; row to `/season`). `UpcomingEventsCard` unchanged. Not enrolled: EmptyState "Not enrolled yet", row "Complete your profile" → `/profile`, events.

- [ ] **Step 1: Failing tests.** `work-model`: `todayWork` order overdue → returned → due ≤7 days → open quizzes, drops +8 days and undated; `isOpenQuiz` false for PAPER and for scored. `student-today`: renders Hi + "Check In" with `checkInOpen` true; session-detail query error → title still shows, no button, no RouteError; `season` null → "Not enrolled yet", and neither session detail nor quiz list requested; dash error → `RouteError` retry refetches; quiz error → assignments list plus `InlineError`; five open rows (over the old cap of 3) all render; "See all" pushes `/work`; budget tile pushes `/attendance`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** targeted, `typecheck`, `lint`, check-syntax s03. Fixes role-review items: stat "pendin/g", due-row truncation, in 6/7 days (cue comes from `dayCue` everywhere).
- [ ] **Step 5: Commit** `feat(mobile): student Today opens on the next session, Check in and open work`.

### Task 7: The Work tab

**Files:**
- Rename (pure, own commit): `app/(app)/(tabs)/assignments.tsx` → `app/(app)/assignments.tsx`; `app/(app)/(tabs)/quizzes.tsx` → `app/(app)/quizzes.tsx`
- Create: `app/(app)/(tabs)/work.tsx`, `src/screens/work/work-screen.tsx`
- Modify: `packages/shared/src/navigation.ts` (STUDENT only: tabs Today, Calendar, Work `{href:"/work",label:"Work",icon:"assignments"}`, More; sidebar replaces the Assignments and Quizzes entries with Work), `src/lib/nav-routes.ts`, the two moved files (student branch → `<Redirect href="/work" />`, remove student-only code; staff branch untouched), `app/(app)/_layout.tsx` only if its lists need it, `.maestro/sweep/student-scenarios/s05-assignments.yaml`, `s06-quizzes.yaml`
- Test: `apps/mobile/src/__tests__/work-screen.test.tsx`; update `role-tabs`, `floating-tab-bar`, `more-back`, `more-screen`, `deep-links`, `app-layout-routes`, `assignments-screen`, `quizzes-screen`, `packages/shared` navigation tests

**Interfaces:**
- Consumes: `work-model.ts` from Task 6.
- Produces: `workSections(assignments: StudentAssignmentListItem[], quizzes: StudentQuizResult[], todayOrgDay: string): { todo: WorkRow[]; doneAssignments: WorkRow[]; doneQuizzes: WorkRow[]; stats: { submitted: number; pending: number; reviewed: number; quizAverage: number | null } }` added to `work-model.ts`. RETURNED counts in none of the three; average over scored rows only (both as today).

Layout: `Screen title="Work" subtitle="Your current season"` with pull-to-refresh; `SegmentedControl` `To do n` / `Done n`; To do: one `GroupedList`, ordered as `todayWork` then later and undated work; Done: "Assignments" and "Quizzes" groups; tiles (Submitted, Pending, Reviewed, Quiz average) under the list. `todayOrgDay` from `useStudentDashboard(...).data?.todayOrgDay ?? deviceTodayKey()`.

- [ ] **Step 1: Commit the renames alone**, fixing only what the route lists need to compile: `refactor(mobile): assignments and quizzes push on the stack (no role has them as a tab)`. This commit also moves the nav, since the derived test needs both; keep file contents otherwise identical.
- [ ] **Step 2: Failing tests.** `work-screen`: `activeSeasonId` null → "No active season", no list or quiz request; empty both → "No assignments yet"-style state; To do empty, Done populated → "You're all caught up" and the Done segment still reachable; quiz query error → assignments still render + `InlineError` with retry; PAPER row has no button role, its notes are visible; a `DRAFT` overdue row chips "Overdue"; rows push `/assignment/[id]` and `/quiz/[id]`. Route: a student at `/assignments` and `/quizzes` lands on `/work`; an ADMIN at `/assignments` sees the staff screen. `navFor(student).tabs` hrefs equal `["/dashboard","/calendar","/work","/more"]`; other roles' tab sets unchanged; `moreItemsFor(student)` lists no `/work`, no `/assignments`.
- [ ] **Step 3: Run** → FAIL. **Step 4: Implement**, rewrite s05/s06 (`openLink: spacev2://work`, wait on 'Your current season'; open a row; keep the response-keyboard steps).
- [ ] **Step 5: Run** targeted + shared tests, `typecheck`, `lint`, check-syntax. Confirm the pill's 4-tab layout: highlight test still lands under the tapped tab.
- [ ] **Step 6: Commit** `feat(mobile): student Assignments and Quizzes merge into a Work tab (P2-1)`.

### Task 8: Assignment detail and submission, student side

**Files:**
- Create: `apps/mobile/src/screens/assignment-detail/student-assignment.tsx`, `submission-editor.tsx`
- Modify: `app/(app)/assignment/[id]/index.tsx` (student branch moves out; staff branch and `ForumThread` use untouched), `app/(app)/submission/[publicId].tsx` (student view only), `.maestro/sweep/student-scenarios/s05-assignments.yaml`
- Test: `assignment-detail.test.tsx`, `submission-editor.test.tsx`

Layout: `Screen title=<assignment title> subtitle=<season/session>`; chip row from `dueChip` / `statusChip` + "Late" chip; due banner copy kept as callouts; description `RichTextView`; response `Textarea` on a surface group; files grouped rows; Save draft and Submit in the `Screen footer` `SaveBar` (`secondary` = Save draft, hint "A saved draft is private to you…"), only while editable. Submit keeps its `ConfirmDialog`; "Start working" is the primary in the bar when no submission exists (nothing created up front, C6). Feedback, forum stay below.

- [ ] **Step 1: Failing tests:** no submission → "Start working" only, pressing calls ensure; DRAFT with empty text → Submit disabled, Save draft enabled; RETURNED → editable, confirm copy says review again; REVIEWED → read-only, no footer; save failure shows the server message and keeps the typed text; `isOverdue` from server shows "Past due…" whatever the device clock.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** targeted, `typecheck`, `lint`. Keyboard: footer stays above it (`SaveBar` uses `useKeyboardBottomOffset`).
- [ ] **Step 5: Commit** `feat(mobile): student assignment detail with a fixed save bar`.

### Task 9: Taking a quiz

**Files:**
- Modify: `apps/mobile/src/screens/quiz-detail/student-quiz-runner.tsx`, `quiz-attempt-form.tsx`, `quiz-result-view.tsx`, `quiz-header.tsx` (`staff-quiz-preview.tsx` untouched; if `quiz-header` is shared, keep its props), `.maestro/sweep/student-scenarios/s06-quizzes.yaml`
- Test: the quiz runner / result tests

Layout: `Screen title=<quiz title> subtitle=<session>`; questions as surface groups (`rounded-group`), options `rounded-control` rows ≥44pt; Submit in `Screen footer` `SaveBar` with hint `3 of 5 answered`; result: `StatTile` score + per-question `statusChip`-tone correctness words.

- [ ] **Step 1: Failing tests:** hint counts answered questions; Submit confirm unchanged; a graded result shows score, never colour alone (word per question); resume restores saved answers.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** targeted, `typecheck`, `lint`, check-syntax.
- [ ] **Step 5: Commit** `feat(mobile): quiz runner on the kit with a fixed submit bar`.

### Task 10: Session detail, student side

**Files:**
- Modify: `apps/mobile/src/screens/session-detail/student-session-body.tsx`, `.maestro/sweep/student-scenarios/s04-season-calendar.yaml` (staff bodies, `VideoQuizPlayer` internals untouched)
- Test: `session-detail.test.tsx`, `video-quiz-screen.test.tsx`

Layout: `Screen title=<session title> subtitle=<long org date>`; `HeroCard`-less: chip Online/In-person; Check-in block directly under the title (R33: `StudentCheckInCard`, full-width button, caption beneath, no extra box); video block; `GroupedList header="Details"` rows Time (`8:00 PM – 9:30 PM · 90 min`), Location, Attendance (`attendanceLine`, chip via `statusChip("attendance", …)`); "About" group.

- [ ] **Step 1: Failing tests:** check-in appears before details; attendance row shows the chip word; no location → no row; 404 still "Not available".
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** targeted, `typecheck`, `lint`.
- [ ] **Step 5: Commit** `feat(mobile): student session detail on the kit, Check in first`.

### Task 11: Calendar, student and staff views

**Files:**
- Modify: `app/(app)/(tabs)/calendar.tsx` (mentor and no-group states to `Screen title="Calendar"`), `src/screens/calendar/season-calendars.tsx`, `src/components/calendar/CalendarGrid.tsx`, `CalendarEntries.tsx`, `src/design/sessions/season-calendar*.tsx`, `calendar-list.tsx`, `src/components/SeasonSwitcher.tsx` if styled inline (`alumni-calendar.tsx` untouched), `.maestro/sweep/student-scenarios/s04-season-calendar.yaml`
- Test: calendar tests

Layout: `Screen title="Calendar"`; `SegmentedControl` for Month/Agenda if there is a toggle today; agenda as `GroupedList` rows, header = day, `leading` none, chip from the existing `sessionBadge` mapped to `StatusChip`; grid day cells ≥44pt, numbers tabular with no font growth beyond 1.3. The last rows clear the pill (no `pb-*`, `useShellBottomPadding`).

- [ ] **Step 1: Failing tests:** each role still reaches its branch; session row pushes `/session/[id]` carrying the same cue as Today (`dayCue` on one key: "in 6 days" in both).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** targeted, `typecheck`, `lint`.
- [ ] **Step 5: Commit** `feat(mobile): calendar on large titles and grouped rows (student and staff views)`.

### Task 12: Season, attendance and history

**Files:**
- Modify: `src/components/season/StudentSeason.tsx` (split under `src/screens/season/` if it grows), `app/(app)/attendance.tsx`, `app/(app)/(tabs)/history.tsx` (student view; alumni title/copy branch stays as is), `src/design/students/season-history.tsx` (shared with staff student detail: keep props), `.maestro/sweep/student-scenarios/s04-season-calendar.yaml`, `s07-attendance-history.yaml`
- Test: `student-season` / `attendance-screen` / `history` tests

Layout. Season: `Screen title=<season title> subtitle="Session 3 of 8"` with `Progress`; `GroupedList header="Your group"` (group row, description; leader rows with `leading` initials, email as a `mailto` row subtitle); members chips stay wrapped below; `GroupedList header="Upcoming sessions" headerAction See calendar` (R33: same rhythm as the others) rows with date tile `leading`. Attendance: `Screen title="Attendance"`, budget `StatTile`s, `GroupedList` of sessions with `statusChip("attendance", …)`. History: `Screen title`, `GroupedList` per season; pct text uses neutral tone (no red on a good value).

- [ ] **Step 1: Failing tests:** no leaders → "No leaders assigned yet."; leader email row opens mailto; 0 upcoming → "No upcoming sessions."; attendance row chip word per status; history privacy test (only attendance % and curriculum) still passes.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** targeted, `typecheck`, `lint`, check-syntax.
- [ ] **Step 5: Commit** one per screen: `feat(mobile): student season …`, `… attendance …`, `… history …`.

### Task 13: Profile, More, Settings, Notifications

**Files:**
- Modify: `src/screens/profile/student-profile.tsx`, `identity-card.tsx`, `profile-form.tsx` (shared with alumni/account: keep props), `src/design/layout/more-menu.tsx`, `app/(app)/(tabs)/more.tsx`, `app/(app)/settings.tsx`, `src/design/settings/section.tsx`, `src/components/NotificationPreferences.tsx`, `app/(app)/notifications.tsx`, `.maestro/sweep/s02-settings.yaml`, `student-scenarios/s08-profile.yaml`, `s09-notifications-more.yaml`
- Test: `more-menu`, `more-screen`, `settings`, `notifications-screen`, profile tests

Layout. More: `Screen title="More"`; identity row; `GroupedList` of `moreItemsFor(nav)` with `leading` icon and `chevron`; Appearance row with `ThemeToggle` trailing; Sign out as `destructive` row. Every role sees this; no role-specific copy changes. Settings: `Screen title="Settings"`, sections as `GroupedList` groups, destructive actions behind the existing confirm. Notifications: `Screen title="Notifications"`, `GroupedList` rows, unread dot ≥3:1, mark-read control in `trailing`, `EmptyState` when none. Student profile: `Screen title="Profile"`; identity; 2-column `StatTile`s (Absence budget left, Assignments, Streak); `GroupedList` form group; `Screen footer` is not used unless the form has its own Save (keep its existing Save behaviour); "Open settings" as a row.

- [ ] **Step 1: Failing tests:** `more-menu` sign-out fires once; every `moreItemsFor` row navigates; theme toggle reachable; notifications row tap routes via `routeForTarget`, unread count updates; settings name change still validates; profile `activeSeasonId` null hides tiles.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** targeted, `typecheck`, `lint`, check-syntax.
- [ ] **Step 5: Commit** one per screen.

### Task 14: Final kit tidy and full checks

**Files:** whatever `grep` finds below.

- [ ] **Step 1:** In the routes this plan owns, confirm no student/signed-out path still imports `PageTitle`, `ShellFrame`, `StatCard`, `Card`, `Badge`, `Eyebrow`, `DataTable`: `grep -nE "PageTitle|ShellFrame|StatCard|CardV1|Eyebrow" <owned files>`. Staff branches may keep them. Delete any legacy component whose last user just went; list the rest in `pending-02.md`.
- [ ] **Step 2:** Run shared + backend unit tests, mobile `test:unit`, `typecheck`, `lint` in tmux → all pass. **Step 3: Commit** any tidy.

### Task 15: Device sweep (controller)

- [ ] **Step 1: Build** `tmux new -d -s space-v2-r02-build "/home/mark/projects/JPC/.redesign-rig/build-apk.sh $PWD ~/projects/JPC/.v2-captures/sweep-app-02.apk 2>&1 | tee ~/logs/space-v2-r02-build.log"`; expected `BUILD_DONE`.
- [ ] **Step 2: Corner cells:** `FLOWS=s01,s02,s03,s04,s05,s06,s07,s08,s09 sweep.sh <worktree> <apk> ~/projects/JPC/.v2-captures/ui-sweep/redesign-02-<ts> student small-1.3-3btn-light,iphone-1.0-gesture-dark` in tmux `space-v2-r02-sweep`. Expected: 0 `*-zz-FAILED.png`.
- [ ] **Step 3: Review** every shot via subagents (≤80 images each, ≤3 per message) against the `ui-sweep` checklist; spot-check every High myself. Fix one commit at a time, rebuild, re-sweep the affected flows. Include: light-mode toast if it shows (R27), disabled Check In contrast, `s90` for the success moment and hero.
- [ ] **Step 4: All 16 cells**, review the differences, fix.
- [ ] **Step 5:** Write `/home/mark/projects/JPC/.redesign-rig/pending-02.md` with states the read-only sweep can't reach.

### Task 16: Whole-branch review, then land

- [ ] **Step 1:** Final whole-branch review on opus, one fix wave, a scoped re-review (per SDD).
- [ ] **Step 2:** `superpowers:finishing-a-development-branch` with the brief's Push section: wait for `git merge-base --is-ancestor 55d5c52 origin/main`, re-check about every 30 minutes with ScheduleWakeup; `git rebase origin/main`; mobile `test:unit`, `typecheck`, `lint`, backend unit tests; `gh auth switch --hostname github.com --user MarkBotros0 && git push origin HEAD:main`; on rejection repeat.
- [ ] **Step 3:** Delete `.superpowers/sdd/<plan>/`, leave the worktree. Tell the owner the rulings and the pending list.
