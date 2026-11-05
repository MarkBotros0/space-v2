# Redesign 05: Mentor + Alumni Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild every mentor and alumni screen on the plan 01 kit: Today per role, mentor Students / Reports / Notes / Profile, alumni Events / History / Profile, plus the one read endpoint mentor Today needs.

**Architecture:** Most routes are owned by sibling plans and serve several roles, so each gets a one-line role branch into a new component under `src/screens/mentor/` or `src/screens/alumni/`; `MentorDashboard.tsx` and `AlumniDashboard.tsx` are rewritten in place so plan 02's dashboard route file is not touched. Shared code changes are additive props that default to today's behaviour. If a sibling has already landed a redesign that covers the mentor or alumni view when we rebase, the sibling's version wins and our branch is deleted.

**Tech Stack:** Expo SDK 58, expo-router, NativeWind, React Query, Express 5 + Prisma 7, Zod (`packages/shared`), Jest + @testing-library/react-native, Maestro sweep.

**Spec:** `docs/superpowers/specs/2026-11-04-mobile-redesign-design.md`. Also binding: `/home/mark/projects/JPC/.redesign-rig/BRIEF-common.md`, `BRIEF-05-mentor-alumni.md`, `plan-01-ledger.md` (R1–R36).

## Global Constraints

- Every source and test file ≤ 400 lines; relative imports only; no non-route files under `app/`.
- Text 4.5:1, icons and control borders 3:1, light and dark. Tap targets ≥ 44pt. Works at font 1.3 on a 360dp phone. No fixed heights on text. A time, date, count or name is never truncated mid-word.
- Every screen renders `Screen`; render text with `Text` `variant`; no hex/`rgb()`, `shadow-*`, raw font sizes, elevation or `rounded-*` other than `group|control|full|none` outside `src/design/` (guard: `src/__tests__/design-consistency.test.ts`). Never `className` on `Animated.*`.
- Goal 4: grouped lists, a card only for the single most important object. Goal 6: `StatusChip`/`statusChip`, a word on every status.
- `src/design/` and `packages/shared`: additive only; a new prop defaults to current behaviour. Do not change another role's tabs in `navigation.ts`. Before adding to `src/design/`, check `git diff redesign/foundation..redesign/0X-* --stat -- apps/mobile/src/design` for one doing the same job and match its API.
- Shared routes: only a role branch, as few lines as possible, and say so in the commit.
- Backend: read-only additions only, with tests and OpenAPI in the same commit. **No migrations.** Integration tests never run against staging: throwaway local Docker Postgres, serially.
- Notes are confidential: every read goes through `noteVisibilityWhere(user)`; audit logs carry ids and counts only, never a body or a name.
- Sweep flows never save anything and wait on screen-specific text. Never commit screenshots.
- One commit per fix, message ending with the session's Co-Authored-By / Claude-Session lines. No pushes until the final task.

## Review Focus

1. **A LEADERS or ADMINS note by someone else, or a note on a soft-deleted student, in the mentor feed:** it never appears (Task 1 integration test).
2. **A very long student name and a long note at font 1.3 on 360dp:** name wraps to two lines, note body stops at two lines; nothing pushes the row off-screen (Task 2 test on `titleLines`, sweep).
3. **One Today section's query fails:** only that section shows `InlineError`; the others render and pull-to-refresh refetches all (Tasks 2, 3).
4. **More at-risk students than the capped list:** "3 of 12" is visible and there is a route to the rest (Task 2).
5. **Typing in the mentor search:** focus and keyboard survive results reloading, the latest term wins, and the no-match state is readable without scrolling under the pill (Task 4).

---

### Task 1: `GET /api/v1/me/visible-notes` and its hook

**Files:**
- Modify: `apps/backend/src/lib/queries/notes.ts`, `apps/backend/src/routes/notes.ts`, `apps/backend/src/docs/paths/notes-notifications.ts`
- Modify: `apps/mobile/src/hooks/use-notes.ts`, `apps/mobile/src/lib/query-keys.ts`
- Test: `apps/backend/src/__tests__/integration/notes-read-routes.test.ts` (split if it would pass 400 lines: new `notes-visible-routes.test.ts`), `apps/mobile/src/__tests__/use-visible-notes.test.tsx`

**Interfaces:**
- Produces: `listVisibleNotes(user: SessionUser, query: NoteListQuery): Promise<NotePage<AuthoredNote> | null>`; route `GET /api/v1/me/visible-notes?limit&cursor` answering the existing `authoredNoteListResponseSchema` shape.
- Produces (mobile): `useVisibleNotes(limit: number, enabled: boolean): UseQueryResult<AuthoredNote[]>`, key `queryKeys.notes.visible(limit)` under `notes.lists()` so note writes refresh it.

- [ ] **Step 1: Failing integration tests** using `seedNotesFixtures`: mentor gets `mentorsNoteId` and not `adminsNoteId`/`leadersNoteId`; rows carry `student.id`; newest first; `limit=1` returns one row with a `nextCursor`; a soft-deleted student's note is absent; SUPER, ADMIN, LEADER and STUDENT tokens each get 403; no token gets 401; `limit=0` gets 400.
- [ ] **Step 2: Start a throwaway database** (controller runs this, not the implementer): `docker run -d --name space-v2-r05-itdb -e POSTGRES_PASSWORD=it -p 127.0.0.1:55460:5432 postgres:16`, then `DATABASE_URL=postgresql://postgres:it@localhost:55460/postgres pnpm --filter @space/backend db:migrate:deploy`. Every integration command below sets that `DATABASE_URL` explicitly; `dotenv` does not override a set variable. Print only the host and port before running, to confirm it is not staging.
- [ ] **Step 3: Run** `DATABASE_URL=… pnpm --filter @space/backend exec jest --config jest.integration.config.js --runInBand notes-` → new cases FAIL with 404.
- [ ] **Step 4: Implement.** `listVisibleNotes` ANDs `noteVisibilityWhere(user)` (null → return null) with `studentUser: { deletedAt: null }`, ordered `createdAt desc, id desc`, reusing `cursorClause` and the `/me/notes` projection (extract one `toAuthoredPage` helper so the two cannot drift). The route on `myNotesRouter` is `requireAuth, noteReadLimiter`, refuses every role but `MENTOR` with `forbidden(res)` (the spec names mentors; no caller exists for others), parses `noteListQuerySchema`, and logs `{ event: "note_feed_read", viewerId, noteCount, at }`. Add the OpenAPI entry beside `/api/v1/me/notes`. `canViewStudent` is already true for every student for a mentor, so no second gate is needed; say so in a comment.
- [ ] **Step 5: Run** integration again → PASS; `pnpm --filter @space/backend test:unit && pnpm --filter @space/backend typecheck` → PASS. Remove the container once the plan's backend work is done (`docker rm -f space-v2-r05-itdb`).
- [ ] **Step 6: Mobile hook.** Test asserts it GETs `/api/v1/me/visible-notes?limit=5`, returns `.notes` parsed with `authoredNoteListResponseSchema`, and that a body missing `student` rejects. Implement; run `pnpm --filter @space/mobile exec jest use-visible-notes` → PASS.
- [ ] **Step 7: Commit** `feat(backend): mentor's newest visible notes across students (read-only)`, noting no environment needs a migration.

### Task 2: Mentor Today

**Files:**
- Modify: `apps/mobile/src/design/ui/grouped-list.tsx` (additive `titleLines?: number`, default 1)
- Rewrite in place: `apps/mobile/src/components/dashboard/MentorDashboard.tsx`
- Create: `apps/mobile/src/screens/mentor/at-risk-group.tsx`, `src/screens/mentor/recent-notes-group.tsx`, `src/screens/mentor/recent-activity-group.tsx`, `src/screens/events/upcoming-events-group.tsx`
- Modify: `apps/mobile/.maestro/sweep/mentor-scenarios/s41-dashboard.yaml`
- Test: `apps/mobile/src/__tests__/mentor-today.test.tsx`, extend `src/__tests__/grouped-list*.test.tsx`

**Interfaces:**
- Consumes: `useVisibleNotes` (Task 1).
- Produces: `AtRiskGroup({ rows: EngagementReportRow[]; total: number; footer?: ReactNode; emptyText?: string })`; `UpcomingEventsGroup({ query: UseQueryResult<JpcEventListResponse>; skip?: number; header?: string })`. Tasks 3 and 5 reuse them.

- [ ] **Step 1: Failing tests** with `renderWithProviders`, mocked `apiClient.get`, MENTOR session:
  - section headers read `AT RISK`, `RECENT NOTES`, `RECENT ACTIVITY`, `UPCOMING EVENTS`, in that order;
  - at-risk row title is the name, subtitle contains `GBV 2026`, `40% attendance`, `55% submissions`; pressing pushes `/student/[id]`;
  - with `atRiskTotal: 12` and 3 rows the header reads `AT RISK · 3 OF 12`, and an `All students` row pushes `/students`;
  - a note row shows student name, the body, and a `Follow-up` chip only when `followUpFlagged`; pressing pushes the student;
  - `My notes` row pushes `/notes`;
  - the notes request failing shows `Couldn't load recent notes.` while at-risk rows still render, and Retry refetches only notes;
  - `refreshing` refetches engagement, notes, activity and events;
  - `ListRow titleLines={2}` sets `numberOfLines` 2 on the title; default stays 1.
- [ ] **Step 2: Run** `pnpm --filter @space/mobile exec jest mentor-today grouped-list` → FAIL.
- [ ] **Step 3: Implement.** `<Screen home title="Today" onRefresh refreshing>`, sections in the order above with `gap-6`. Rows are `ListRow` with `index` for stagger. At-risk subtitle `${seasonTitle} · ${attendancePct}% attendance · ${submissionPct}% submissions`, no chips (no colour-only meaning, and this is what stops the name truncating, R33), `titleLines={2}`. Empty at-risk: a non-pressable row `Nobody at risk` / `No student has attendance or submissions below ${AT_RISK_PCT}%.`. Note row: title student name, subtitle `${formatDate(createdAt)} · ${authorName} · ${body}`, trailing `Follow-up` warn chip when flagged; `useVisibleNotes(5, true)`. Empty notes: row `No notes yet`. Activity keeps `activityParts`: title name, subtitle `${rest.trim()} · ${formatTimeAgo(at)}`, same `open` routing. Each section maps pending → `Skeleton` rows, error → `InlineError` with its own retry. Events per v1 R11: a row with `url` opens it, otherwise pushes `/event/[id]`. Drop the "Mentor dashboard" title and subtitle.
- [ ] **Step 4: Update `s41`:** wait on `At risk`; scroll; user menu via the compact header as today. **Run** test → PASS; `pnpm --filter @space/mobile typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(mobile): mentor Today, at-risk and newest notes first`.

### Task 3: Alumni Today

**Files:**
- Rewrite in place: `apps/mobile/src/components/dashboard/AlumniDashboard.tsx`
- Modify: `apps/mobile/src/lib/dashboard-branch.ts` (use `isAlumnus` unless already fixed on `redesign/foundation`), `apps/mobile/.maestro/sweep/alumni-scenarios/s47-dashboard.yaml`
- Test: `apps/mobile/src/__tests__/alumni-today.test.tsx`

**Interfaces:**
- Consumes: `UpcomingEventsGroup` (Task 2), `useSeasonHistory`, `useUpcomingEvents`.

- [ ] **Step 1: Failing tests** with an alumnus session (`role: STUDENT`, `graduationYear: 2025`), asserting: title `Today`, subtitle `Welcome back, Aya · Class of 2025`; the first event is a `HeroCard` with eyebrow `NEXT EVENT` and only the others are listed under `ALSO COMING UP`; the hero action reads `Open link` and calls `Linking.openURL` when `url` is set, else `View event` and pushes `/event/[id]`; no events → `No upcoming events` and no hero; history rows show season title and `85% attended`, at most 3; `View my history` pushes `/history`; no seasons → `No past seasons`; the history request failing leaves events rendered; `/api/v1/me/dashboard` is never requested (an alumnus gets 403 there, spec 19 §7).
- [ ] **Step 2: Run** `pnpm --filter @space/mobile exec jest alumni-today` → FAIL.
- [ ] **Step 3: Implement.** `<Screen home title="Today" subtitle=…>`; `useSeasonHistory(activeSeasonId, true)`. Hero meta is `formatEventWhenShort`. History section header `YOUR HISTORY`; rows: title season, subtitle `dates · group` with no dangling separator when `groupName` is null, trailing `statusChip`-styled neutral `85% attended`; each row and the final `View my history` row push `/history`. Refresh refetches both.
- [ ] **Step 4: Update `s47`:** wait on `View my history`; `Sweep kickoff event` is now the hero or a row, so tap `View event` if it is the hero. **Run** test → PASS.
- [ ] **Step 5: Commit** `feat(mobile): alumni Today, next event and history`.

### Task 4: Mentor Students

**Files:**
- Modify (one branch): `apps/mobile/app/(app)/(tabs)/students/index.tsx`
- Create: `apps/mobile/src/screens/mentor/mentor-students.tsx`, `src/screens/mentor/student-filter-sheet.tsx`
- Modify: `apps/mobile/.maestro/sweep/mentor-scenarios/s42-students.yaml`, `s43-student-note.yaml` (first wait only)
- Test: `apps/mobile/src/__tests__/mentor-students.test.tsx`

**Interfaces:**
- Consumes: `useStudentList`, `DEFAULT_STUDENT_VIEW`, `useAllGroups`, `SearchField`, `Sheet`.
- Produces: `MentorStudents()`; `StudentFilterSheet({ open, onClose, view, onChange })`.

- [ ] **Step 1: Failing tests:** title `Students`, subtitle `3 students in your seasons`; `Alumni` row pushes `/students/alumni`; there is no `Search` button and no `Dropped students`; a row subtitle with null university and null group has no `·`, `—` or dangling separator (`Cairo University · Year 3 · GBV 2026 · Group A` when all present); typing `sa` then advancing fake timers 300ms requests `q=sa` once, and the field stays mounted (same test instance) across the reload; two quick terms request only the last; no match shows title `No matches` with `No students match your search.`, never the page title; `Filters` opens the sheet, choosing a group and `Z–A` requests them and the button reads `Filters · 2`; `Load more` fetches the next page. A non-MENTOR session on the route still renders `StudentList` (`students-list.test.tsx` stays green unchanged).
- [ ] **Step 2: Run** `pnpm --filter @space/mobile exec jest mentor-students` → FAIL.
- [ ] **Step 3: Implement.** `<Screen title="Students" subtitle onRefresh refreshing>`. Row of `SearchField` (placeholder `Search students`, `flex-1`) and a secondary `Filters` button, `flex-wrap`. Group list: `Alumni` chevron row first, then students as `ListRow` with `titleLines={2}`, chevron. Debounce with a local effect + `setTimeout`, trimmed; nothing else re-keys the field. Sheet content: group option rows (`All groups`, `Unassigned`, one per group) with a check on the selected one, sort `SegmentedControl` (Name, University, Season, Group), direction `SegmentedControl` (A–Z, Z–A); selections apply at once, a `Done` button closes. No-match `EmptyState` gets `py-6` so it sits above the pill at 360dp@1.3. Route branch: `if (role === "MENTOR") return <MentorStudents />;` in a wrapper above the existing body so hook order holds.
- [ ] **Step 4: Update `s42`/`s43`:** drop `tapOn: 'Search'`; shoot the filter sheet; wait on `\d+ students? in your seasons` still holds. **Run** tests → PASS.
- [ ] **Step 5: Commit** `feat(mobile): mentor Students, one search field and a filter sheet` (noting the one-line branch in plan 04's route).

### Task 5: Mentor Reports and Notes

**Files:**
- Modify (branch only): `apps/mobile/app/(app)/(tabs)/reports.tsx`, `apps/mobile/app/(app)/(tabs)/notes.tsx`
- Modify (additive prop `atRisk?: ReactNode`, default the current card): `apps/mobile/src/screens/reports/engagement-cards.tsx`
- Create: `apps/mobile/src/screens/mentor/mentor-reports.tsx`, `src/screens/mentor/mentor-notes.tsx`
- Modify: `apps/mobile/.maestro/sweep/mentor-scenarios/s44-reports.yaml`, `s45-notes.yaml` if a wait changed
- Test: `apps/mobile/src/__tests__/mentor-reports.test.tsx`, `src/__tests__/mentor-notes.test.tsx`; move the mentor session in `notes-screen.test.tsx` / `reports-screen.test.tsx` to a non-mentor role only where a case asserts the old layout

**Interfaces:**
- Consumes: `AtRiskGroup` (Task 2), `useEngagementReport`, `useEngagementStudents`, `useAuthoredNotes`, `flattenNotePages`, `SeasonPicker`, `ExportMenu`, `EngagementCards`.

- [ ] **Step 1: Failing tests.** Reports: title `Reports`, subtitle `Scoped to …`; `canExportWorkbook` false for a mentor even with a season chosen; at-risk renders as `AtRiskGroup` with `Show more` calling `fetchNextPage`; no `OrganisationSection`; empty scope shows `No data in this scope`. Notes: title `Notes`, subtitle `2 notes you've authored` (`2+` with a next page); a row shows student, `formatDate`, season, the full body, the exact `Visible to mentors only` label as a neutral chip, `Follow-up flagged` warn chip when set, `Edited` when `edited`; no dangling `·` when `seasonTitle` is null; `Load more`; empty → `No notes yet` with its description.
- [ ] **Step 2: Run** `pnpm --filter @space/mobile exec jest mentor-reports mentor-notes` → FAIL.
- [ ] **Step 3: Implement.** Reports route: rename the default function `StaffReports`, add a default wrapper choosing `MentorReports` for `MENTOR`. `MentorReports` keeps the route's `permitted`/`seasonId`/`showAllAtRisk` logic and renders `<Screen title="Reports" …>`, passing `atRisk={<AtRiskGroup … />}`. Notes route: same wrapper. Mentor notes rows are full-body pressable rows in a `GroupedList` pushing `/student/[id]`; export `VISIBILITY_LABEL` from one place so route and component share the copy (spec D3: this wording is deliberate).
- [ ] **Step 4: Run** tests and the existing `notes-screen`, `reports-screen` → PASS.
- [ ] **Step 5: Commit** `feat(mobile): mentor Reports and Notes on Screen` (noting the branches in plans 03's and 04's routes), as two commits if the diff splits cleanly.

### Task 6: Mentor and alumni Profile

**Files:**
- Rewrite: `apps/mobile/src/screens/profile/account-profile.tsx`, `src/screens/profile/alumni-profile.tsx`
- Modify: `apps/mobile/.maestro/sweep/mentor-scenarios/s46-profile-settings-notifications.yaml`, `alumni-scenarios/s50-profile-more-notifications.yaml` if a wait changed
- Test: `apps/mobile/src/__tests__/profile-mentor-alumni.test.tsx`; `more-back.test.tsx` stays green

- [ ] **Step 1: Failing tests.** Account: title `Profile`; `IdentityCard` with name and email; rows `Settings` and `Notifications` push their routes; `Sign out` button calls logout. Alumni: title `Profile`, subtitle `Your alumni record`; rows Name, Email, University, Status; Status is an ok chip `Alumnus · Class of 2025`; a null university shows `—`; no pressable or edit control exists; `To update your details, please contact the JPC team.` is shown; pending → skeleton, error → retry.
- [ ] **Step 2: Run** `pnpm --filter @space/mobile exec jest profile-mentor-alumni` → FAIL.
- [ ] **Step 3: Implement** with `Screen`, `GroupedList`, `ListRow`. Long emails get `titleLines={2}` on a value-under-label row (label as subtitle-style caption, value as title). `Sign out` is `variant="secondary"`, `self-start`. `AccountProfile` serves every non-student role, so nothing mentor-only appears in it. `IdentityCard` is untouched (plan 02's).
- [ ] **Step 4: Run** tests → PASS.
- [ ] **Step 5: Commit** `feat(mobile): mentor and alumni Profile on grouped rows`.

### Task 7: Alumni History

**Files:**
- Modify (one branch): `apps/mobile/app/(app)/(tabs)/history.tsx`
- Create: `apps/mobile/src/screens/alumni/alumni-history.tsx`
- Modify: `apps/mobile/.maestro/sweep/alumni-scenarios/s49-history.yaml`
- Test: `apps/mobile/src/__tests__/alumni-history.test.tsx`; `season-history` tests stay green

- [ ] **Step 1: Failing tests:** title `My History`, subtitle `The seasons you journeyed through`; a row shows title, `formatDate` range, `· group` only when present, `85% attended` and `Participated` chips; `Curriculum (3 sessions)` carries `accessibilityState.expanded`, toggles the session rows with their `formatDayKey`, and no `▶`/`▼` glyph is rendered; empty → `No past seasons` / `Your completed seasons will appear here.`; a row object with extra fields renders none of them (R34 privacy: only attendance % and curriculum).
- [ ] **Step 2: Run** `pnpm --filter @space/mobile exec jest alumni-history` → FAIL.
- [ ] **Step 3: Implement.** One `GroupedList` per season with chips under the title and a lucide chevron that rotates through `DURATION.fast` (instant under reduced motion). Route: `if (alumnus) return <AlumniHistory query={…} />` right after the hooks, sharing the route's existing query.
- [ ] **Step 4: Update `s49`:** expand one curriculum and shoot it. **Run** tests → PASS.
- [ ] **Step 5: Commit** `feat(mobile): alumni History on grouped rows` (noting the branch in plan 02's route).

### Task 8: Alumni Events

**Files:**
- Rewrite: `apps/mobile/src/screens/calendar/alumni-calendar.tsx`
- Create: `apps/mobile/src/screens/alumni/event-day-list.tsx`
- Modify (additive prop, default `DayEntries`): `apps/mobile/src/components/calendar/CalendarGrid.tsx` (`renderEntries?: (entries: CalendarEntry[]) => ReactNode`)
- Modify (use `isAlumnus`, unless already fixed on `redesign/foundation`): `apps/mobile/app/(app)/(tabs)/calendar.tsx`, `apps/mobile/app/(app)/_layout.tsx`
- Modify: `apps/mobile/.maestro/sweep/alumni-scenarios/s48-events-calendar.yaml`
- Test: `apps/mobile/src/__tests__/alumni-events.test.tsx`; existing `CalendarGrid` tests stay green

**Interfaces:**
- Produces: `EventDayRows({ entries: CalendarEntry[] })`: event rows push `/event/[id]`, session rows push `/session/[id]`.

- [ ] **Step 1: Failing tests:** title `Events`; a `SegmentedControl` with Upcoming, Week, Month; default Upcoming lists days as `GroupedList` headers with no legend above the rows; an event row subtitle `JPC event · 18:30` or `JPC event · All day`, and an `ALUMNI_ONLY` event carries an `Alumni only` chip; `Today` / `in N days` cue shows in the header via `dayCue`; no row has a `border-l-*` class; Week and Month show the stepper with `Previous month`/`Next month` labels; Month shows the legend below the selected day's rows, separated from the control, and rows use `EventDayRows`; the empty, no-season and error states keep their copy and the server-sourced day (`dayKey`, never a device-zone format). The events query failing still shows sessions.
- [ ] **Step 2: Run** `pnpm --filter @space/mobile exec jest alumni-events` → FAIL.
- [ ] **Step 3: Implement.** `<Screen title="Events" onRefresh refreshing>`, `SegmentedControl` then `mt-4` content. Keep `useCurrentSeasonId`, `useSeasonSessions`, `useEvents`, `initialAnchor`, `stepAnchor`, `groupCalendarByDay` as they are: behaviour does not change. Drop `ChoiceChips` from this screen only.
- [ ] **Step 4: Update `s48`:** wait on `Upcoming` plus `Events`; `Week` and `Month` tapped as segments. **Run** tests and `pnpm --filter @space/mobile exec jest calendar` → PASS.
- [ ] **Step 5: Commit** `feat(mobile): alumni Events on Screen with grouped days` (noting the additive grid prop and the branch edit in plan 02's route).

### Task 9: Device sweep, fixes, landing (controller)

**Files:** whatever the sweep finds; `/home/mark/projects/JPC/.redesign-rig/pending-05.md`

- [ ] **Step 1: Verify.** `pnpm --filter @space/mobile test:unit`, `typecheck`, `lint` and backend `test:unit` in tmux `space-v2-r05-verify`, log `~/logs/space-v2-r05-verify.log` → all pass.
- [ ] **Step 2: Build and corner sweep.** `build-apk.sh <worktree> ~/projects/JPC/.v2-captures/sweep-app-05.apk` in tmux `space-v2-r05-apk`, then `sweep.sh` for `"mentor alumni"` on `small-1.3-3btn-light,iphone-1.0-gesture-dark` in tmux `space-v2-r05-sweep`, out `~/projects/JPC/.v2-captures/ui-sweep/redesign-05-<ts>` → 0 failed pairs, every shot looked at via subagents, each High spot-checked by the controller, contrast measured per the `ui-sweep` skill.
- [ ] **Step 3: Fix what is ours,** one commit per fix, rebuild, re-sweep the affected flows. Findings in screens owned by a sibling (student detail, event detail, More, Settings, Notifications, alumni list) go on the pending list unless mentor- or alumni-specific.
- [ ] **Step 4: All 16 cells**, same review → no open High or Medium of ours.
- [ ] **Step 5: Final whole-branch review on opus,** one fix wave, scoped re-review.
- [ ] **Step 6: Land per the brief.** Wait for `git merge-base --is-ancestor 55d5c52 origin/main`, re-checking about every 30 minutes. `git rebase origin/main`, keep both sides' intent, and where a sibling landed a redesign covering the mentor or alumni view, drop our branch for it. Delete `shell-frame.tsx` only if nothing uses it after the rebase; otherwise it goes on the pending list. Re-run mobile `test:unit`, `typecheck`, `lint`, backend unit tests. `gh auth switch --hostname github.com --user MarkBotros0 && git push origin HEAD:main`; on rejection, repeat. Delete `.superpowers/sdd/<plan>/`; leave the worktree.
- [ ] **Step 7: Tell the owner** the pending list and every ruling.
