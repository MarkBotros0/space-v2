# Redesign 04: Admin + Super Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild every admin and super screen on the plan 01 kit: Today opens on the live session and what needs action, lists become grouped rows, quick actions become sheets, long forms become full screens with a fixed save bar, and no admin/super screen keeps a `PageTitle`, `DataTable` or `Tabs` strip.

**Architecture:** Mobile only; no backend, shared-contract or migration change. Today is composed from existing reads (`/me/dashboard`, `/seasons/:id/sessions`, the submission queue's counts, `/reports/engagement/students?band=AT_RISK`, `/users/invites/pending`) through one pure selector, so it needs no integration tests against any database. A count on Today always comes from the same query as the list it opens. Routes shared with other plans get a role branch, with the new screen in `src/screens/<area>/`.

**Tech Stack:** Expo SDK 58, expo-router, NativeWind, React Query, `src/design/` kit, Jest + @testing-library/react-native, Maestro sweep via the shared rig.

**Spec:** `docs/superpowers/specs/2026-11-04-mobile-redesign-design.md`. Also binding: `/home/mark/projects/JPC/.redesign-rig/BRIEF-common.md`, `BRIEF-04-admin-super.md`, rulings R1–R36 in `plan-01-ledger.md`, findings for admin/super in `role-review-A.md` / `role-review-B.md`.

## Global Constraints

- Every source and test file ≤ 400 lines; relative imports only; no `@/` alias; no non-route files under `app/` (screen sections go in `src/screens/<screen>/`).
- Text 4.5:1, icons and control borders 3:1, in light and dark; tap targets ≥ 44pt; works at font scale 1.3 on a 360dp phone; a time, date, count or name never truncates mid-word.
- Every screen renders `Screen` (`design/layout/screen.tsx`) or `FormScreen` (Task 1). Text through `ui/text.tsx` variants; radii only `rounded-group|control|full|none`; no hex, `shadow-`, raw font size or elevation; never `className` on `Animated.*`. Design-consistency, no-classname-on-animated and contrast tests stay green.
- `src/design/` and `packages/shared`: additive only (new files, new props defaulting to today's behaviour, new tokens). Before adding a shared component run `git diff redesign/foundation..redesign/0X-* --stat -- apps/mobile/src/design` for X in 2, 3, 5 and match any sibling's name and API.
- Nothing a role can do today disappears (spec non-goal). **Every task's first step inventories each action, link and state of the files it rebuilds into its report; each must exist afterwards.** Existing tests change only where the look changes: never delete an assertion about behaviour, permissions or a request.
- Copy: v1 wording where clear, plain where not. Status shown only through `StatusChip`/`statusChip`, each with a word. Meta lines join through `joinMeta` (Task 1), never by hand.
- Grouped rows: `GroupedList`/`ListRow`, chevron where the row opens something; one card at most per screen (`HeroCard`). Sheets for quick actions (`Sheet`, `SheetSaveBar`); full screens with fixed save bar for long forms.
- Change only the admin/super branch of a route another plan owns (dashboard: 02; submissions, group detail, session detail, attendance: 03; mentor branch of students/reports: 05); keep that edit minimal and say so in the commit.
- Don't touch another role's tabs in `navigation.ts`. Don't implement the season-admin assignment UI change or super events paging (open owner decisions).
- No backend changes, no migrations, no integration tests. No sweep screenshots in git. Long commands in tmux with prefix `space-v2-r04-`, logs in `~/logs/`.
- Sweep flows never save anything; pushed screens wait on screen-specific text, never `User menu`. A task that changes a screen updates its flow's waits in the same commit.
- Plan 01's final wave (owner, BRIEF-common "Owner updates") lands before this plan pushes. After save `router.back()`; after delete `router.dismissTo(<list>)`; never `router.replace` to a tab from a stacked screen. A fixed save bar only through `FormScreen`, which moves onto `Screen`'s `footer` prop at rebase. No own trailing-status label on `ListRow`, no local Android nav-inset keyboard compensation, nothing depending on `app/dev/design-system`.
- The pill is solid (owner R38, plan 01's change): don't touch it, don't flag translucency.
- Commit every fix one by one; messages end with the session's Co-Authored-By / Claude-Session lines. No push until the end (Task 15).
- Verify each task: `pnpm --filter @space/mobile test:unit -- <its tests>`, then `pnpm --filter @space/mobile typecheck` and `lint`.

## Review Focus

1. **One failed read on Today:** a season's dashboard or sessions query errors. That row shows an inline error with retry, never a confident 0 or "All clear" (Task 2 selector returns `null` for unknown; Task 3 test).
2. **Count differs from the list it opens:** tapping "3 waiting for review" lands on exactly those 3. Same query, same scope and season param (Tasks 3, 4, 11 tests).
3. **Super with no or several active seasons; admin with no season or several:** Today still renders; two sessions live at once both show (Tasks 2, 3 tests).
4. **Missing optional fields in rows:** no university, no group, no season, no last login. No dangling "·", no "— · —" (Task 1 `joinMeta` test; Tasks 5, 8, 11 row tests).
5. **Search with the keyboard open and no results on a short phone:** field stays above the keyboard, empty message clear of the pill (Task 8 test on padding source; sweep s35).

---

### Task 1: Kit additions: `joinMeta`, `FormScreen`, `ChoiceChip`, `ListRow.leading`

**Files:**
- Create: `apps/mobile/src/lib/join-meta.ts`, `apps/mobile/src/design/layout/form-screen.tsx`, `apps/mobile/src/design/ui/choice-chip.tsx`
- Modify: `apps/mobile/src/design/ui/grouped-list.tsx`, `apps/mobile/src/design/ui/index.ts`, catalogue section in `apps/mobile/src/screens/design-catalogue/`
- Test: `apps/mobile/src/__tests__/join-meta.test.ts`, `form-screen.test.tsx`, `choice-chip.test.tsx`, extend the grouped-list test

**Interfaces:**
- Produces: `joinMeta(parts: (string | number | null | undefined | false)[]): string`; `FormScreen({ title, subtitle?, back?, saveLabel, onSave, saving?, saveHint?, children })`; `ChoiceChip({ label, selected, onPress, accessibilityLabel? })`; `ListRow` prop `leading?: ReactNode`.

- [ ] **Step 1: Write failing tests.** `joinMeta(["Cairo University", null, "", 3, undefined, false])` → `"Cairo University · 3"`; `joinMeta([null])` → `""`; whitespace-only part dropped. FormScreen: renders title, children, `testID="save-bar"` with `saveLabel`; press calls `onSave`; `saving` disables; scroll content bottom padding exceeds `useShellBottomPadding()` by the measured bar height so the last field clears the bar. ChoiceChip: `accessibilityRole="button"`, `accessibilityState.selected`, min height 44. ListRow: `leading` renders; without it the tree matches today's.
- [ ] **Step 2: Run them; expect FAIL (modules missing).**
- [ ] **Step 3: Implement.** `FormScreen` is a `Screen` plus `SaveBar` as a sibling of the scroll view, with `onLayout` of the bar adding padding through `contentClassName`-free inline style on a trailing spacer `View` in the content. `ChoiceChip` uses `rounded-full`, `min-h-[44px]`, selected `bg-primary` + `on-primary` text, unselected `border-control-border`; text `maxFontSizeMultiplier={1.3}`, never wraps mid-word. Add both to the catalogue.
- [ ] **Step 4: Run the tests; expect PASS. Run typecheck and lint.**
- [ ] **Step 5: Commit** `feat(mobile): joinMeta, FormScreen, ChoiceChip, ListRow leading for plan 04`.

### Task 2: Staff Today data

**Files:**
- Create: `apps/mobile/src/lib/staff-today.ts`, `apps/mobile/src/hooks/use-staff-today.ts`
- Test: `apps/mobile/src/__tests__/staff-today.test.ts`, `use-staff-today.test.tsx`

**Interfaces:**
- Consumes: `useSeasonStaffDashboard`, `useCurrentSeasonId`, `useSeasons`, `useLedSeasonSessions(seasonIds)` (use as is if it fits; otherwise a new `useSeasonsSessions(seasonIds)` with the same per-season query key as `useSeasonSessions`), `useSubmissionQueue({ pendingOnly: true, seasonId? }, enabled)`, `useEngagementStudents(seasonId, "AT_RISK", enabled)`, `usePendingInviteCount(enabled)`.
- Produces:
  ```ts
  type NeedsAction = { pendingReview: number | null; unmarkedSessions: number | null; atRisk: number | null; pendingInvites: number | null | undefined };
  // null = unknown (query failed or loading); undefined = not applicable (ADMIN has no invites).
  unmarkedSessions(sessions: SessionListItem[], now: Date): SessionListItem[];   // startsAt + durationMinutes <= now && !attendanceMarked, newest first
  liveSessions(sessions: SessionListItem[], now: Date): SessionListItem[];       // startsAt <= now < startsAt + durationMinutes
  nextSession(sessions: SessionListItem[], now: Date): SessionListItem | null;   // earliest startsAt > now
  hasNothingToDo(n: NeedsAction): boolean;                                       // every applicable count is exactly 0; any null → false
  useStaffToday(role: "ADMIN" | "SUPER"): {
    seasonIds: number[];            // ADMIN: [current]; SUPER: every ACTIVE season
    scopeSeasonId: number | null;   // ADMIN: current; SUPER: null. The param every list it opens uses.
    sessions: SessionListItem[];
    needs: NeedsAction;
    isPending: boolean; refetch: () => void; isRefetching: boolean;
  };
  ```

- [ ] **Step 1: Write failing tests** for the selectors with a fixed `now`: a session ending exactly at `now` counts as unmarked and not live; one marked session excluded; two overlapping live sessions both returned; future session never unmarked; `hasNothingToDo` false on any `null`, true when `pendingInvites` is `undefined` and the rest 0. Hook tests with a mocked `apiClient`: SUPER requests sessions only for ACTIVE seasons; ADMIN never calls `/users/invites/pending`; a failed sessions request yields `unmarkedSessions: null` while the other counts stay numbers; SUPER with no active seasons yields `sessions: []`, `unmarkedSessions: 0`.
- [ ] **Step 2: Run; expect FAIL.**
- [ ] **Step 3: Implement.** Instants compare against `startsAt` only for ordering and in-progress, matching the server's definition in `dashboardSessionSchema`; `pendingReview` from `data.pages[0].counts.pending`; `atRisk` from `pages[0].total`.
- [ ] **Step 4: Run; expect PASS. Typecheck, lint.**
- [ ] **Step 5: Commit** `feat(mobile): staff Today data from existing reads`.

### Task 3: Admin and Super Today

**Files:**
- Create: `apps/mobile/src/screens/staff-today/live-session-hero.tsx`, `needs-action-list.tsx`, `admin-today.tsx`, `super-today.tsx`
- Modify: `apps/mobile/app/(app)/(tabs)/dashboard.tsx` (ADMIN and SUPER cases only), `apps/mobile/.maestro/sweep/admin-scenarios/s20-dashboard.yaml`, `apps/mobile/.maestro/sweep/super-scenarios/s29-dashboard.yaml`
- Delete: `apps/mobile/src/components/dashboard/SuperDashboard.tsx` and its test cases
- Test: `apps/mobile/src/__tests__/admin-today.test.tsx`, `super-today.test.tsx`; move admin cases out of `dashboard-staff.test.tsx` (leader cases stay; `StaffDashboard`'s leader branch is plan 03's, and its now-unused `AdminDashboard` export is left for plan 03 or the rebase)

**Interfaces:**
- Consumes: Task 2 `useStaffToday`, selectors; Task 1 `joinMeta`.
- Produces: `NeedsActionList({ needs, scopeSeasonId, onRetry })`, `AdminToday()`, `SuperToday()`. Destinations used by rows: `/submissions` (with `pending=1`, and `seasonId` when scoped), `/attention/sessions`, `/attention/at-risk` (both with optional `seasonId`), `/users?status=pending`.

Layout, top to bottom, inside `Screen title="Today" home`:
1. **Live session** `HeroCard`: eyebrow "Happening now" or "Next session"; title; meta `joinMeta([seasonTitle, weekday day, wall time, "N min", location])`; actions "Mark attendance" (only in progress or past) and "Open session". Admin's comes from `dash.nextSession`, and keeps "Join stream" while in progress with a `youtubeUrl` (D13). Super's comes from `liveSessions` else `nextSession`; any further live sessions follow as rows under header "Also happening now". No session: no card.
2. **Needs action** `GroupedList`: rows only for counts > 0: "N submissions waiting for review", "N sessions with no attendance", "N students at risk", "N people not invited yet" (super), with correct singular, count in the title, chevron. `null` → one `InlineError` with retry in place of that row. `hasNothingToDo` → a single row "Nothing needs action".
3. **Figures (the old dashboards', below the action).** Admin: `StatTile`s in a `flex-wrap` row: Attendance (`meanAttendancePct` or "—", no ring), Progress (`Session held/total`), Students; then rows "Season" (season title, opens `/seasons/[code]`), "Students" (`/students`), "Assignments" (subtitle `joinMeta(["N reviewed", "N pending review"])`, `/assignments`), "Quizzes" (subtitle pending, fully graded, drafts; `/quizzes`) shown under the same condition as today; at-risk preview rows (name; subtitle `N/M submitted` and attendance; no red on a good value, finding "red 100%"; opens `/student/[id]`), then `UpcomingEventsCard`. Super: rows "Students (not graduated)", "Alumni", "Seasons" (subtitle "All statuses"), "Upcoming events" (subtitle "From today, next 12 months"), each trailing the count and opening what its `StatCard` opened; then `UpcomingEventsCard`.
4. Admin with no season: `EmptyState` "No season yet" + events card (D19), as today.

- [ ] **Step 1: Inventory the two old branches into the report.**
- [ ] **Step 2: Write failing tests.** Admin: order is hero, then needs, then figures; "Mark attendance" pushes `/session/[id]/attendance`; "3 submissions waiting for review" pushes `/submissions` with `pending: "1"` and the season id; zero counts hide their rows; failed sessions request shows retry and never "Nothing needs action"; no-season state; singular "1 student at risk". Super: no invites row at zero; invites row pushes `/users` with `status: "pending"` and no season id; two live sessions both visible; no active seasons still shows figures; bell + user menu present (`home`).
- [ ] **Step 3: Run; expect FAIL.**
- [ ] **Step 4: Implement; switch the two `dashboard.tsx` cases.** `dashboard.tsx` keeps its shape; only imports and two case bodies change.
- [ ] **Step 5: Update s20 and s29** to wait on `Today`/`Needs action` text; tap `User menu` before scrolling, and scroll up first if after.
- [ ] **Step 6: Run tests, typecheck, lint; expect PASS.**
- [ ] **Step 7: Commit** `feat(mobile): admin and super Today, the action before the figures`.

### Task 4: Lists Today opens: sessions without attendance, at-risk students, pending queue

**Files:**
- Create: `apps/mobile/app/(app)/attention/sessions.tsx`, `apps/mobile/app/(app)/attention/at-risk.tsx`, `apps/mobile/src/screens/staff-queue/pending-queue.tsx`
- Modify: `apps/mobile/app/(app)/_layout.tsx` (append both routes to `DETAIL_ROUTE_NAMES`), `apps/mobile/app/(app)/(tabs)/submissions.tsx` (replace the non-leader `PendingQueue` only; read `seasonId`; say so in the commit)
- Test: `apps/mobile/src/__tests__/attention-screens.test.tsx`, `staff-pending-queue.test.tsx`

**Interfaces:**
- Consumes: `useStaffToday`, `unmarkedSessions`, `useEngagementStudents`, `useSubmissionQueue`.
- Produces: routes `/attention/sessions?seasonId`, `/attention/at-risk?seasonId`; `StaffPendingQueue({ seasonId })`.

Sessions: `Screen title="Sessions with no attendance"`, one `GroupedList` per season when several; row title session, subtitle `joinMeta([weekday day, wall time])`, chevron opens `/session/[id]/attendance`. At-risk: `Screen title="Students at risk"`, rows name, subtitle `joinMeta([groupName, "N% attendance", "N/M submitted"])`, chevron opens `/student/[id]`, "Load more" while `hasNextPage`. Pending queue: rows student, subtitle `joinMeta([assignment, group])`, trailing `statusChip("submission", status)` plus a "Late" chip when `isLate`, opens `/submission/[publicId]`; title "Submissions". MENTOR reaches this same branch: its rendering changes only in look; note it to plan 05 in pending. Non-staff get the existing "not available" state. All three have skeleton, retry, `EmptyState`.

- [ ] **Step 1: Inventory `PendingQueue` into the report. Write failing tests:** the header count equals rows when all fit; `seasonId` param reaches the request query string; a non-numeric `seasonId` is ignored; ADMIN and SUPER allowed, STUDENT sees "not available"; the route-names test passes for both new files; leader branch of `/submissions` untouched (existing tests stay green).
- [ ] **Step 2: Run; expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run; expect PASS. Typecheck, lint.**
- [ ] **Step 5: Commit** `feat(mobile): the filtered lists Today's counts open`.

### Task 5: Seasons list and My Season (staff)

**Files:**
- Modify: `apps/mobile/app/(app)/(tabs)/seasons/index.tsx`, `apps/mobile/app/(app)/season.tsx` (`StaffSeason`, `AdminSeason` only; `StudentSeason` is plan 02's), `apps/mobile/src/design/seasons/seasons-list.tsx`, flows s21, s30
- Test: `season-screens.test.tsx`

Seasons: `Screen title="Seasons" trailing={New season}` (super); no subtitle. Program filter becomes `ChoiceChip`s, hidden under 2 programs. `SeasonsList` becomes one `GroupedList header={program}` per program, newest first: row title `row.title`, subtitle `joinMeta([code, dates])`, trailing `statusChip("season", status)`, chevron opens the season. Super's per-row pencil moves to the season detail (Task 6's "Edit season" row), which keeps the action reachable. My Season: admin with several seasons reuses the same list, `Screen title="My Season"`; no-season message as `EmptyState`. `StaffSeason`'s two cards become a `GroupedList` of rows; Calendar and Assignments become chevron rows; `EditSeason` stays.

- [ ] **Step 1: Inventory; write failing tests:** a row shows code and dates and no trailing "·"; status is a chip with its word; a season whose program is the only one shows no chips; empty state keeps "New season" for super only; filter narrows rows; admin with exactly one season still redirects.
- [ ] **Step 2: Run; expect FAIL. Step 3: Implement; update flows (wait on `Seasons`, not the removed subtitle). Step 4: Run; expect PASS; typecheck, lint.**
- [ ] **Step 5: Commit** `feat(mobile): seasons list and My Season as grouped rows`.

### Task 6: Season detail

**Files:**
- Modify: `apps/mobile/app/(app)/seasons/[code]/index.tsx`, `apps/mobile/src/design/seasons/season-detail.tsx`, `apps/mobile/src/components/season/DuplicateSeasonDialog.tsx` (Modal → `Sheet` + `SheetSaveBar`), `SeasonAdmins.tsx`, `EditSeason.tsx` (kit parts only), flows s21, s30, s32
- Test: `season-detail-screens.test.tsx`, `season-admins-card.test.tsx`, `season-edit-forms.test.tsx`

`Screen title={s.title} subtitle={"Code: " + s.code}`. `SegmentedControl` Overview / Groups / Sessions with no counts in the labels (fixes the clipped strip at 360dp/1.3). Overview: `GroupedList` rows Status (chip), Dates, Enrollment with correct plurals ("3 students in 1 group", fixes "1 groups"); About text; header "Manage" rows, each with a chevron and shown under today's conditions: Roster, New group, New session, Edit season, Duplicate season (opens the sheet); then `EditSeason` / `SeasonAdmins`. Groups: section header "N groups", rows name, subtitle `joinMeta(["N students", "Leaders: …" or "No leader yet"])`; "Manage groups" stays and the last item clears the bottom by `useShellBottomPadding` (R33 finding). Sessions: `CalendarList` as is. The disabled "Add admin" behaviour is unchanged (open owner decision).

- [ ] **Step 1: Inventory; write failing tests:** three segments switch content; "1 student in 1 group" and "3 students in 2 groups" plurals; super sees Duplicate and Edit, a plain admin with `canAdminister` sees Roster / New group / New session and not Duplicate; a mentor sees none of the Manage rows; duplicate sheet saves then pushes the new code; missing `code` param state.
- [ ] **Step 2: Run; expect FAIL. Step 3: Implement; flows wait on `Code: gbv-…` and tap `Groups` / `Sessions` by the new labels. Step 4: Run; expect PASS; typecheck, lint.**
- [ ] **Step 5: Commit** `feat(mobile): season detail with segments and a Manage list`.

### Task 7: Season forms, roster, roster import

**Files:**
- Modify: `apps/mobile/src/components/season/SeasonForm.tsx`, `apps/mobile/app/(app)/seasons/new.tsx`, `seasons/[code]/edit.tsx`, `seasons/[code]/roster/index.tsx`, `roster/import.tsx`, flows s31, s32
- Test: `season-write-screens.test.tsx`, `season-edit-forms.test.tsx`, existing roster tests

Forms root at `FormScreen` (`saveLabel` is the form's current submit label). `SeasonForm` takes `title` and owns the frame; the routes' `PageTitle` goes; each route's loading and error states render inside `Screen`. Roster: `Screen title="Roster"`, students as `ListRow`s with `leading` avatar, subtitle `joinMeta`, and the assign-to-groups action as a `Sheet` with `SheetSaveBar`. Import: `FormScreen`; paste, preview, result steps keep their logic.

- [ ] **Step 1: Inventory; write failing tests:** save bar label and press submit the same payload the old button did (assert the request body); server field error still shows; roster assign sheet opens and saves through the same mutation; import still blocks on an empty paste.
- [ ] **Step 2: Run; expect FAIL. Step 3: Implement; update flows. Step 4: Run; expect PASS; typecheck, lint.**
- [ ] **Step 5: Commit** `feat(mobile): season forms, roster and import on the fixed save bar`.

### Task 8: Students list, alumni, dropped

**Files:**
- Create: `apps/mobile/src/screens/students-list/student-rows.tsx`, `student-filter-sheet.tsx`
- Modify: `apps/mobile/src/components/StudentList.tsx`, `apps/mobile/app/(app)/(tabs)/students/index.tsx`, `students/alumni.tsx`, `students/dropped.tsx`, flows s24, s35, s36
- Test: `apps/mobile/src/__tests__/student-list*.test.tsx` (existing), new `student-rows.test.tsx`

**Interfaces:**
- Consumes: `joinMeta`, `ListRow.leading`, `ChoiceChip`.
- Produces: `ActiveStudentRow`, `AlumnusRow`, `DroppedStudentRow`, `StudentFilterSheet({ open, onClose, view, onChange })`.

`Screen title={title} subtitle={count line} trailing={headerAction}`. `SearchField` alone, placeholder "Search students", submitting on keyboard search and debounced 300ms; the separate Search button goes (keep the `accessibilityLabel`). "Filter" `ChoiceChip`, labelled with the active count, opens the sheet: group, sort, direction. Alumni and Dropped are chevron rows above the list, gated as today. Rows: active `joinMeta([university, year, season, group])`; alumni subtitle `joinMeta(["Class of N", university])`; dropped `joinMeta(["Dropped from " + season, date, reason])`. Mixed chip radii vanish because seasons and groups are no longer chips. Mentor gets this list too, since it's the same component: look change only, reported in pending for plan 05. Keep enrollment-keyed dropped rows (R43) and server-side filter and paging. Empty title no longer repeats the page title; keep the message.

- [ ] **Step 1: Inventory; write failing tests:** a student with no university, season or group shows name and email only, with no "·" or "—"; typing then waiting 300ms issues one request with `q`; keyboard search issues it at once; the filter sheet applies group and sort to the query string; dropped rows with the same student key by enrollment; role gates for alumni and dropped unchanged; list bottom padding comes from `useShellBottomPadding`.
- [ ] **Step 2: Run; expect FAIL. Step 3: Implement; keep `StudentList.tsx` ≤ 400 lines; update flows (placeholder text changes). Step 4: Run; expect PASS; typecheck, lint.**
- [ ] **Step 5: Commit** `feat(mobile): students lists as rows with one search field and a filter sheet`.

### Task 9: Student detail (admin mode), new, edit, drop and graduate sheets

**Files:**
- Create: `apps/mobile/src/screens/student-admin/admin-student-detail.tsx`
- Modify: `apps/mobile/app/(app)/student/[id]/index.tsx` (branch for ADMIN and SUPER; other roles keep `StudentDetail`), `student/[id]/edit.tsx`, `students/new.tsx`, `src/components/StudentForm.tsx`, `DropEnrollmentSheet.tsx`, `GraduateStudentSheet.tsx` (Modal → `Sheet` + `SheetSaveBar`), flows s24, s35
- Test: existing student detail tests, `student-write*.test.tsx`, new `admin-student-detail.test.tsx`

`Screen title={name} subtitle={email}`; call and mail actions in `trailing` or a row; five sections through wrapping `ChoiceChip`s (Profile, Seasons, Attendance, Submissions, Notes), lazily fetching as today (spec 06 §9), reusing the existing tab bodies from `src/design/students/`, which stay shared with plans 03 and 05 (edit their internals only where a sweep finding is on admin's shot, and additively). Forms root at `FormScreen`. A `Drop` is `destructive`.

- [ ] **Step 1: Inventory; write failing tests:** admin branch shows Edit, Drop, Graduate under today's conditions; leader and mentor render the old component (spy on the module); each section fetches on first open only; drop sheet requires what it required and sends the same body; save bar stays above the keyboard (`keyboardBottomOffset` is the kit's; assert `sheet-save-bar` present).
- [ ] **Step 2: Run; expect FAIL. Step 3: Implement. Step 4: Run; expect PASS; typecheck, lint.**
- [ ] **Step 5: Commit** `feat(mobile): student detail for admin and super, drop and graduate as sheets`.

### Task 10: Reports (admin, super)

**Files:**
- Modify: `apps/mobile/app/(app)/(tabs)/reports.tsx`, `apps/mobile/src/screens/reports/engagement-cards.tsx`, `organisation-section.tsx`, `season-picker.tsx`, `src/components/ExportMenu.tsx`, flows s27, s39
- Test: `reports-screen.test.tsx`, `reports-screen-numbers.test.tsx`

`Screen title="Reports" trailing={ExportMenu}`; picker as `ChoiceChip`s or the existing select if there are many seasons; figures as `StatTile`s in a `flex-wrap` row; at-risk and season rows as `GroupedList`, `joinMeta` subtitles, "Show more" kept. Mentor's branch shares these sections: if a section must change only for admin and super, add a prop defaulting to the mentor look, and leave the mentor's frame to plan 05 (brief).

- [ ] **Step 1: Inventory; failing tests:** every existing figure still rendered with its number; export sheet opens and calls the same endpoints; picker change refetches with `seasonId`; numbers don't truncate at font scale 1.3 (tile uses shrink, not ellipsis).
- [ ] **Step 2: Run; expect FAIL. Step 3: Implement; flows wait on `Reports`. Step 4: Run; expect PASS; typecheck, lint.**
- [ ] **Step 5: Commit** `feat(mobile): reports on tiles and grouped rows for admin and super`.

### Task 11: Users

**Files:**
- Modify: `apps/mobile/app/(app)/users/index.tsx`, `users/new.tsx`, `users/import.tsx`, `user/[id].tsx`, `src/design/users/users-list.tsx`, `src/components/UserForm.tsx`, `src/screens/user-import/*` (frame only), `src/hooks/use-users.ts` (pass `status`), flows s37, s38
- Test: `users-screen.test.tsx`, existing user tests

`Screen title="Users" trailing={New}`; `SearchField`; `ChoiceChip`s All / Active / Invited / No invite / Inactive; initial from the `status` param (Today). Rows: `leading` avatar, title name or email, subtitle `joinMeta([email, role label, last login])`, trailing `statusChip("user", status)`, chevron. "No invite" stays the label users see for `pending`: pass the existing label through a `{ ...statusChip("user", s), label: "No invite" }` at this call site only, leaving the shared table. Row-level invite stays. "Send N invites" and Import become chevron rows above the list. `user/[id]` and `new` root at `FormScreen`; destructive and invite actions stay as rows below the form.

- [ ] **Step 1: Inventory; failing tests:** `status=pending` param selects "No invite" and sends `status=pending`; the count on Today's row and the list's rows come from the same definition (read `countPendingInvites` and `statusWhere`; if they differ, the row's copy and destination follow the list's definition and the difference goes in the report); clearing to All refetches; invite confirm, batch summary and `Send N` hidden at 0 unchanged; a user with no name shows the email once.
- [ ] **Step 2: Run; expect FAIL. Step 3: Implement; update flows. Step 4: Run; expect PASS; typecheck, lint.**
- [ ] **Step 5: Commit** `feat(mobile): users as rows with status filter and fixed save bars`.

### Task 12: Events admin list and detail

**Files:**
- Modify: `apps/mobile/app/(app)/events.tsx`, `event/[id].tsx`, `src/components/EventForm.tsx`, flow s34
- Test: `events-screen.test.tsx`

Admin/super surface only; alumni's calendar branch, if rendered from these files, stays for plan 05. `Screen title="JPC Events" trailing={New event}`; rows title, subtitle `joinMeta([date, time, location])`, chip for past or alumni-only, chevron. `EventForm` opens in a `Sheet` with `SheetSaveBar` from the list (the save bar rides the keyboard) and on the detail for edit. Paging stays as it is (open owner decision).

- [ ] **Step 1: Inventory; failing tests:** create and edit send the same bodies; delete still confirms; a role without write access sees no New; date and time never truncate.
- [ ] **Step 2: Run; expect FAIL. Step 3: Implement; update s34. Step 4: Run; expect PASS; typecheck, lint.**
- [ ] **Step 5: Commit** `feat(mobile): JPC events list and detail with the form in a sheet`.

### Task 13: Authoring: assignment and quiz forms

**Files:**
- Modify: `apps/mobile/src/components/assignment-form.tsx`, `QuestionEditor.tsx`, `apps/mobile/app/(app)/assignment/new.tsx`, `assignment/[id]/edit.tsx`, `quiz/new.tsx`, `quiz/[id]/edit.tsx`, flows s25, s26
- Test: existing assignment and quiz form tests

All root at `FormScreen`. `quiz/[id]/edit.tsx` is at 391 lines: split questions into `src/screens/quiz-edit/` before adding anything. Question add/edit keeps its current surface unless it's a Modal, which becomes a `Sheet`. Publish and delete actions stay as rows or `Button`s beneath the form with today's conditions and confirms. Fix the `border-input` finding on assignment-form (plan 01 ledger): `border-control-border`.

- [ ] **Step 1: Inventory; failing tests:** save label and bodies unchanged for new and edit; a validation error appears on its field and the bar stays usable; publish state rules unchanged; the last question clears the save bar (spacer from `FormScreen`).
- [ ] **Step 2: Run; expect FAIL. Step 3: Implement; update flows. Step 4: Run; expect PASS; typecheck, lint.**
- [ ] **Step 5: Commit** `feat(mobile): assignment and quiz authoring on the fixed save bar`.

### Task 14: Authoring: group and session forms

**Files:**
- Modify: `apps/mobile/src/components/GroupForm.tsx`, `apps/mobile/app/(app)/group/new.tsx`, `group/[id]/edit.tsx`, `session/new.tsx`, `session/[id]/edit.tsx`, flows s23, s32
- Test: existing group and session form tests

All root at `FormScreen`. Series scope choice on session edit stays (a `SegmentedControl` or `Sheet` if it's a dialog). `border-input` → `border-control-border` wherever these files use it. Date and time pickers keep behaviour; give their triggers `min-h-[44px]`.

- [ ] **Step 1: Inventory; failing tests:** bodies unchanged including `repeatWeeks`; series scope reaches the request; delete confirm kept; missing `seasonId` param state kept.
- [ ] **Step 2: Run; expect FAIL. Step 3: Implement; update flows. Step 4: Run; expect PASS; typecheck, lint.**
- [ ] **Step 5: Commit** `feat(mobile): group and session forms on the fixed save bar`.

### Task 15: Device sweep, findings, push (controller)

**Files:**
- Modify: whatever the shots require; `/home/mark/projects/JPC/.redesign-rig/pending-04.md`

- [ ] **Step 1: Build and sweep corners.** In tmux session `space-v2-r04-build`: `build-apk.sh <worktree> ~/projects/JPC/.v2-captures/sweep-app-04.apk`. Then session `space-v2-r04-sweep`: `sweep.sh <worktree> <apk> ~/projects/JPC/.v2-captures/ui-sweep/redesign-04-<ts> "admin super" small-1.3-3btn-light,iphone-1.0-gesture-dark`. Expected: `0 failed pairs`, or each FAILED classified.
- [ ] **Step 2: Look at every shot** through subagents (≤ 80 images each, ≤ 3 per message) against the `ui-sweep` checklist and the admin/super findings in `role-review-A/B.md` not marked fixed. Controller opens every High. Fix each as its own commit through a dispatched fixer.
- [ ] **Step 3: All 16 cells** once corners are clean; repeat Step 2 for what's new.
- [ ] **Step 4: Full checks in tmux:** `pnpm --filter @space/mobile test:unit`, `typecheck`, `lint`. Expected: all pass, guard and contrast tests included.
- [ ] **Step 5: Final review, one fix wave, scoped re-review (SDD).**
- [ ] **Step 6: Push per the brief** once `git merge-base --is-ancestor 55d5c52 origin/main` succeeds: rebase on `origin/main`, move `FormScreen` onto `Screen`'s `footer` (drop `SaveBar`'s `onLayout` and the spacer), merge `ListRow`'s `leading` with plan 01's trailing label, grep `router.replace`, re-run Step 4, then `gh auth switch --hostname github.com --user MarkBotros0 && git push origin HEAD:main`; retry on a sibling's push. Re-check every ~30 min until plan 01 lands.
- [ ] **Step 7: Write `pending-04.md`, tell the owner the pending list and rulings; delete `.superpowers/sdd/<plan>/`.**

## Owner decisions, 2026-11-05 (BRIEF-common "Owner updates")

Tasks 16 to 18 run before Task 15 Step 3 (all 16 cells): the corner sweep's fixes and these tasks ship in the same APK. They supersede the ruling "no Past chip on JPC events" and the brief's "season-admin assignment UI is an open decision".

### Task 16: "Hi, <name>" on admin and super Today; "Alumni only" on events

**Files:**
- Modify: `apps/mobile/src/screens/staff-today/admin-today.tsx`, `apps/mobile/src/screens/staff-today/super-today.tsx`, `apps/mobile/src/components/EventForm.tsx`, `apps/mobile/src/screens/events/event-row.tsx`
- Test: the existing admin and super Today tests; `apps/mobile/src/__tests__/events-screen.test.tsx`

- [ ] **Step 1: Failing tests.** Admin and super Today render `Hi, <first name>` (first name via `firstName` from `lib/format`) and fall back to `Today` when the name is blank; the list chip, event detail chip and form option read exactly `Alumni only`, and `Alumni & staff` appears nowhere under `apps/mobile/src` or `.maestro`.
- [ ] **Step 2: Implement.** Both Today screens read `useSessionStore((s) => s.user?.name ?? null)` and pass `title={named ? \`Hi, ${firstName(name)}\` : "Today"}` and `compactTitle="Today"` with `home`, as `leader-today/index.tsx:137` does, on every branch including no-season. `VISIBILITY_LABELS.ALUMNI_ONLY` becomes `"Alumni only"`. Keep the code comment that the audience is alumni and staff (D-15.2). Fix the `event-row.tsx` doc comment.
- [ ] **Step 3: Verify and commit.** `pnpm --filter @space/mobile test:unit` on the touched tests, typecheck, lint. One commit per concern.

### Task 17: Events Past chip from a server-side `isPast`

**Files:**
- Modify: `packages/shared/src/event.ts`, `apps/backend/src/routes/events.ts`, `apps/backend/src/docs/components/video-events-forum.ts`, `apps/mobile/src/screens/events/event-row.tsx`, `apps/mobile/app/(app)/event/[id].tsx`, event fixtures in mobile tests
- Test: a backend unit test beside `events-paging-unit.test.ts`; `apps/backend/src/__tests__/integration/events-detail-writes-routes.test.ts`; `apps/mobile/src/__tests__/events-screen.test.tsx`

**Interfaces:**
- Produces: `jpcEventListItemSchema.isPast: z.boolean()`, required, inherited by `jpcEventDetailSchema`.

- [ ] **Step 1: Failing backend tests.** `isPast` is `(endDayKey ?? dayKey) < orgDayKey(now)`, the exact complement of the `upcoming` filter: an event starting yesterday with no end is past; one starting yesterday and ending today is not; a timed event earlier today is not (day granularity); the org-timezone midnight boundary is pinned with an instant that falls on different days in UTC and in `config.orgTimezone`.
- [ ] **Step 2: Backend.** Compute it in `toListItem` in `routes/events.ts`, so list, paged list, detail, create and update all carry it. `toListItem` is passed directly to `.map`, so do not add a second parameter (it would receive the index). `openapi` component and the shared schema change in the same commit. No migration.
- [ ] **Step 3: Mobile.** `eventChip` returns `{ tone: "neutral", label: "Past" }` first: a row keeps at most one chip and Past wins, the audience stays on the detail. Event detail shows Past beside the visibility chip in a `flex-row flex-wrap gap-2` row. Never compare dates on the device (D23/R75). Update fixtures.
- [ ] **Step 4: Verify and commit.** Backend and mobile `test:unit`, typecheck, lint. Integration: only the touched events file, `--runInBand`, on staging (owner allows it, serially).

### Task 18: Season-admin assignment: close the gaps in what exists

The feature already exists: `routes/seasons/admins.ts` (4ce95ca2, SUPER only, audited, additive, refresh tokens revoked), `docs/paths/season-admins.ts`, `packages/shared/src/season-admins.ts`, `hooks/use-season-admins.ts`, and `components/season/SeasonAdmins.tsx` on the SUPER season overview. Do not rebuild it. Its gaps are coverage.

**Files:**
- Modify: `apps/mobile/src/components/season/SeasonAdmins.tsx` only as the tests require; `apps/backend/src/__tests__/season-admins-unit.test.ts`; `apps/mobile/.maestro/sweep/super-scenarios/s30-seasons.yaml`
- Create: `apps/mobile/src/__tests__/season-admins.test.tsx`, `apps/backend/src/__tests__/integration/season-admins-routes.test.ts`

- [ ] **Step 1: Backend unit gap.** Add the missing case: POST for a user whose role is not ADMIN answers 400 `not_an_admin` with no write, revoke or audit.
- [ ] **Step 2: Integration test.** Non-SUPER gets 403 on all three routes; add, idempotent add and remove against a real row, and the assigned admin's `canAdminister`. Follow the setup and cleanup of the neighbouring integration tests, delete every row it creates. Run this file only, `--runInBand`, on staging.
- [ ] **Step 3: Mobile tests.** SUPER season overview shows Admins and ADMIN's does not; the picker excludes current admins and deactivated users; add calls POST and toasts; remove goes through the confirm dialog; load error offers Try again.
- [ ] **Step 4: Sweep flow.** `s30` shoots the Admins section and the opened picker without saving, using the seeded season.
- [ ] **Step 5: Verify and commit.**
