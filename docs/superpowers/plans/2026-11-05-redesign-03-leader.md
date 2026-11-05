# Redesign 03: Leader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild every screen a group leader uses on plan 01's kit: Today answers "the session to run, who is missing, what to review"; lists become grouped rows; quick actions become bottom sheets.

**Architecture:** The leader's Today reads one request: `GET /me/dashboard` gains one optional read-only field, `leaderSession`, for the groups scope. Screens move from `ShellFrame`/`PageTitle` to `Screen`. Where a route or component is shared with admin or mentor, the leader gets a new file or branch and the other roles' code keeps rendering as it does now, so plans 04 and 05 can adopt or replace it.

**Tech Stack:** Expo SDK 58, expo-router, NativeWind, React Query, Reanimated 4, Express 5 + Prisma 7, Zod (`packages/shared`), Jest + @testing-library/react-native, Maestro sweep rig.

**Spec:** `docs/superpowers/specs/2026-11-04-mobile-redesign-design.md` (rollout step 3). Rulings R1–R36: `/home/mark/projects/JPC/.redesign-rig/plan-01-ledger.md`. Device findings: `/home/mark/projects/JPC/.redesign-rig/role-review-A.md`.

## Global Constraints

- Every source and test file ≤ 400 lines; relative imports only; no `@/` alias; no non-route files under `app/` (sections go in `src/screens/<screen>/`).
- `src/design/` and `packages/shared` are additive only: new files, new props defaulting to current behaviour. Never change the default look of something another role uses. Before a new shared component, check `git diff redesign/foundation..redesign/0X-* --stat -- apps/mobile/src/design` for a sibling's equivalent and match its name and API.
- Do not edit `redesign/foundation`, its worktree, or `/home/mark/projects/JPC/jpc-space`.
- Contrast: text 4.5:1, icons and control borders 3:1, both themes. Tap targets ≥ 44pt. Works at font scale 1.3 on a 360dp phone; a name, date, count or time never breaks mid-word.
- Radii only `rounded-group|control|full|none` outside `src/design`; no hex/rgb, `shadow-`, raw font sizes, `fontSize:`, `text-[..]`, `leading-[..]`. Render text with `Text` `variant`. No `className` on `Animated.*`. `design-consistency.test.ts` and the contrast tests stay green.
- A Screen on the stack gets the pinned Back bar by default; never add an in-content back link. Tab-bar clearance comes from `useShellBottomPadding()`; Screen handles it.
- Goal 5 rule: quick action = `Sheet` + `SheetSaveBar`; long form = full screen + `SaveBar`. A write success gives `haptic("light")` plus a `toast.success` line.
- No backend rule, permission or write changes. No migrations. Do not run integration tests against the shared staging DB.
- Ruling R38 (owner): the pill becomes solid on both platforms; plan 01 makes that change. Do not touch the pill or flag its translucency.
- Do not implement PR #44's SUBMISSION_SUBMITTED notification (open owner decision).
- Behaviour and copy come from v1 and the current screens unless a task says otherwise; nothing a leader can do today disappears.
- Sweep flows never save anything. Never commit screenshots.
- Commit each fix on its own. Messages end with the session's Co-Authored-By and Claude-Session lines. When a commit touches a shared route, say so in the message.
- Test commands: `pnpm --filter @space/mobile exec jest <pattern>`, full suite `pnpm --filter @space/mobile test:unit` in tmux `space-v2-r03-<task>`, log `~/logs/space-v2-r03-<task>.log`; `pnpm --filter @space/mobile typecheck`; `pnpm --filter @space/mobile lint`.

## Rulings made while planning

- **P1:** the leader's Today data is one optional field on `GET /me/dashboard`, not a new route. The spec allows read-only fields on existing responses and asks for one request. Optional, so admin fixtures and plan 04 stay untouched. Cost if wrong: one schema field moves.
- **P2:** who-is-missing shows only while the session is in progress or its org day is today; before that the hero shows the session and student count. A week out, "everyone not checked in" is noise. The server always sends the field. Cost if wrong: remove one condition.
- **P3:** the sweep seed's next session is days away and the seed DB is shared, so the day-of state is shown on device through a catalogue section rendering the same component with fake data (s10). Cost if wrong: one catalogue section.
- **P4:** leader tab label and screen title are both "Groups" (sidebar too): "My Group" is wrong for a leader of two groups, and "My Groups" risks truncation in a five-tab pill. Same word admin uses. Cost if wrong: three strings.
- **P5:** the leader's student page is a new `StudentDetailGrouped`, not a change to `StudentDetail`, whose admin mode is plan 04's; 04 may adopt it. Cost if wrong: temporary duplicate tab bodies.
- **P6:** three leader branches no brief names are taken here, as they are on the leader's path and sweep flows s14/s16: `LeaderSessionBody`, `LeaderQuizzes`, and the check-in override (Modal → Sheet, which admin's session page inherits as goal 5 asks). Cost if wrong: a rebase conflict with 02/04.
- **P7:** paper grading becomes rows that open one sheet per student and save that one row, replacing the sideways-scrolling table with a batch Save. Spec goal 5 lists "grade" as a sheet; it also makes "untouched rows are never re-sent" true by construction. Cost if wrong: slower bulk entry from a paper pile; the owner can ask for inline fields.
- **P8:** attendance's Cancel button goes: the Back bar is cancel. The attendance save bar is pinned again (spec goal 5). The 2026-10-21 ruling put it in the flow because it covered rows; a measured spacer now reserves its height. Cost if wrong: one component.
- **P9:** the Groups "Calendar →" link goes: Calendar is a tab for this role, so nothing is lost. Cost if wrong: one row.

## Review Focus

1. **Leader of two groups in one season:** `leaderSession` covers both groups and no other group's students (Task 1 integration test); Today's subtitle names both (Task 2).
2. **Sheet dragged away with typed text:** the feedback, note or score is still there on reopen and nothing was sent (Tasks 5, 7, 9).
3. **Save fails (403 or offline):** the sheet or save bar stays, the error shows in place, nothing is lost, no success haptic (Tasks 5, 6, 7, 9).
4. **Font 1.3 at 360dp with a long name:** row titles wrap to two lines, chips stay whole (Tasks 2, 4, 6).
5. **Keyboard open on the last student's minutes-late field:** the field stays above the pinned save bar (Task 6 flow s14; device check).

---

### Task 1: `leaderSession` on the staff dashboard

**Files:**
- Modify: `packages/shared/src/dashboard.ts`
- Modify: `apps/backend/src/lib/queries/dashboard.ts`
- Modify: `apps/backend/src/docs/paths/me.ts` and the dashboard component schema under `apps/backend/src/docs/components/`
- Test: `apps/backend/src/__tests__/integration/dashboard-routes.test.ts`, `packages/shared/src/__tests__/` (the existing dashboard schema test, or a new `leader-session.test.ts`)

**Interfaces:**
- Produces: `leaderSessionCheckInSchema` / `LeaderSessionCheckIn` = strict `{ sessionId: int, total: count, present: count, late: count, absent: count, notCheckedIn: { id: int, name: string }[] }`; `staffSeasonDashboardSchema` gains `leaderSession: leaderSessionCheckInSchema.nullable().optional()`.

- [ ] **Step 1: Write failing tests.** Shared: a dashboard without the field parses; `{ ...leaderSession, email: "x" }` in `notCheckedIn` fails (strict). Integration, in `dashboard-routes.test.ts`: leader of group A with one PRESENT, one LATE, one ABSENT and one unmarked student gets `{ total: 4, present: 1, late: 1, absent: 1, notCheckedIn: [{ id, name }] }` with `sessionId === nextSession.id`; a student of another group never appears; an admin's response has no `leaderSession` key; a season with no next session gives `leaderSession: null`; a student with a null name appears under their email.
- [ ] **Step 2: Start a throwaway DB, run, see FAIL.**
```bash
docker rm -f space-v2-r03-testdb 2>/dev/null; docker run -d --name space-v2-r03-testdb -e POSTGRES_PASSWORD=t -e POSTGRES_DB=t -p 55441:5432 postgres:16
export DATABASE_URL=postgresql://postgres:t@localhost:55441/t AUTH_SECRET=local-test-secret-local-test-secret
pnpm --filter @space/backend db:migrate:deploy
pnpm --filter @space/backend exec jest --runInBand dashboard-routes
```
Check first which Jest config the backend's `test:integration` script uses and pass the same one. Never point this at staging.
- [ ] **Step 3: Implement.** In `loadSeasonStaffDashboard`, when `scope.kind === "groups"` and `next` exists, call the existing `loadAttendanceRoster(next.id, scope.groupIds)` and reduce it: `name = row.name ?? row.email`, `status === null` means not checked in. Omit the key for the season scope; `null` for groups with no next session. Add the schema and the OpenAPI entry.
- [ ] **Step 4: Run** the integration file, backend `test:unit`, shared tests, and backend typecheck → PASS.
- [ ] **Step 5: Tear down** with `docker rm -f space-v2-r03-testdb`.
- [ ] **Step 6: Commit** `feat(api): leader's session check-in counts on the staff dashboard (read-only)`, stating it was tested on a local throwaway Postgres and no migration is involved.

### Task 2: Leader Today

**Files:**
- Create: `apps/mobile/src/screens/leader-today/index.tsx` (`LeaderToday`), `apps/mobile/src/screens/leader-today/session-section.tsx`, `apps/mobile/src/screens/leader-today/at-risk-reason.ts`
- Create: `apps/mobile/src/screens/design-catalogue/leader-section.tsx`
- Modify: `apps/mobile/app/(app)/(tabs)/dashboard.tsx` (one import, plan 02's route, say so in the commit), `apps/mobile/src/components/dashboard/StaffDashboard.tsx` (remove only the `LeaderDashboard` export), `apps/mobile/app/(app)/design-catalogue.tsx` (add the section)
- Modify: `apps/mobile/src/design/ui/grouped-list.tsx`: additive `titleLines?: number` (default 1) and `onPressIn?: () => void` on `ListRow`
- Modify: `apps/mobile/.maestro/sweep/leader-scenarios/s10-dashboard.yaml`
- Test: new `apps/mobile/src/__tests__/leader-today.test.tsx`; move the leader cases out of `dashboard-staff.test.tsx`; add to `grouped-list.test.tsx`; `at-risk-reason` cases in the same new test file

**Interfaces:**
- Consumes: `LeaderSessionCheckIn` (Task 1).
- Produces: `atRiskReason(row: EngagementRow): string`; `LeaderSessionSection({ session, checkIn, now? })`; `ListRow` props `titleLines`, `onPressIn` (Tasks 4, 6 use them).

Layout, top to bottom, inside `<Screen home title="Today" subtitle={groupNames || "Your group"} refreshing onRefresh>`. If plan 02's student Today has landed with a different frame call, match it.
1. `HeroCard`: eyebrow "Happening now" or "Next session"; session title; meta `Weekday · time · N min · location`. On the day (`isInProgress || dayKey === deviceTodayKey()`): meta ends `· N present · M not checked in` (present = `present + late`), action Button "Take attendance" → `/session/[id]/attendance`, plus secondary "Open session" → `/session/[id]`, plus "Join stream" while in progress with a `youtubeUrl`. Otherwise the action is "Open session" and meta ends with the `dayCue`. No session: `HeroCard` eyebrow "Next session", title "No upcoming sessions."
2. On the day only, `GroupedList header="Not checked in"`: `ListRow` per student (`titleLines={2}`, chevron → `/student/[id]`), first 5, then a "See all N" row → attendance. Omit when empty.
3. `GroupedList header="To review"`: "Submissions waiting" trailing `pendingReview` → `/submissions` with `{ seasonId }` (keep the comment explaining why); "Reviewed" trailing `reviewed`, same target; and when `quizzes.total > 0 || drafts > 0`: "Quizzes to grade" trailing `pending` → `/quizzes`, "Fully graded" trailing `fullyGraded`, same target; subtitle on the quiz row carries `${drafts} quiz draft(s) not yet published` when `drafts > 0`.
4. `GroupedList header="Your students at risk"`: `ListRow` title name (`titleLines={2}`), subtitle `atRiskReason(row)`, chevron → `/student/[id]`; a "See all N" row → `/groups` when `atRiskTotal > atRisk.length`. Empty: `EmptyState` "Nobody at risk" with the current description.
5. Figures: `StatTile`s in `flex-row flex-wrap gap-3`: Students `n` (pressable via a wrapping `Pressable` → `/groups`), Attendance `mean%` or "—", Progress `${pct ?? 0}%` with label `Session held of total`.
6. `UpcomingEventsCard` unchanged.

`atRiskReason` is the R33 fix: it names only what is below `AT_RISK_PCT`, so a good value is never shown as the problem. It never uses colour.

- [ ] **Step 1: Failing tests:** `atRiskReason({ attendanceTotal: 4, attendancePct: 40, attendancePresent..., submissionsExpected: 3, submissionsCompleted: 3, submissionPct: 100 })` is `"Attendance 40%"`; attendance 100% with 1 of 3 submitted is `"1 of 3 submitted"` and does not contain `"100%"`; both low gives `"Attendance 40% · 1 of 3 submitted"`. Screen: day-of fixture shows "Take attendance", "2 not checked in", the names and "See all 7" with 7 missing (five named); pressing "Take attendance" pushes `{ pathname: "/session/[id]/attendance", params: { id } }`; fixture a week out shows "Open session" and no "Not checked in"; `leaderSession: null` with `nextSession: null` shows "No upcoming sessions."; submissions row pushes with `seasonId`; a figure stays (`getByLabelText("Students: 3")`); the bell shows once (`home-actions`); no season shows "No season yet" and makes no dashboard request; leads-two-groups subtitle is `"Group A, Group B"`. `ListRow`: `titleLines` passes through to the title, default stays 1, `onPressIn` fires.
- [ ] **Step 2: Run** `pnpm --filter @space/mobile exec jest leader-today grouped-list` → FAIL.
- [ ] **Step 3: Implement** the files above; states as the current `StaffDashboard` (`RouteSkeleton`, `RouteError`, no-season `EmptyState` + events card). Add the catalogue section `id="leader-today"` rendering `LeaderSessionSection` with fake data in the day-of state.
- [ ] **Step 4: Rewrite s10:** wait on `'Today'`; shots s10-01, scroll, s10-02; then `openLink: spacev2://design-catalogue`, wait, `_catalogue-section.yaml` with `SECTION: leader-today`, shot s10-03. Nothing else in `.maestro/sweep/s90-*` changes.
- [ ] **Step 5: Run** jest for those files and `design-consistency`, plus typecheck → PASS.
- [ ] **Step 6: Commit** `feat(mobile): leader Today: the session to run, who is missing, what to review`.

### Task 3: Groups and group detail

**Files:**
- Create: `apps/mobile/src/screens/leader-groups/index.tsx` (`LeaderGroups`, moved out of the route)
- Modify: `apps/mobile/app/(app)/(tabs)/groups.tsx` (delete the leader branch's code, import it), `apps/mobile/app/(app)/group/[id]/index.tsx`, `packages/shared/src/navigation.ts` (LEADER only, P4)
- Modify: `apps/mobile/.maestro/sweep/leader-scenarios/s11-groups.yaml`, `s12-student-note.yaml` (first wait: `'Groups'`)
- Test: `apps/mobile/src/__tests__/groups-screens.test.tsx`, `role-tabs.test.tsx`, `packages/shared/src/__tests__/navigation.test.ts`

`LeaderGroups`: `<Screen title="Groups" subtitle="N group(s)">`. One `GroupedList` per group, `header={group.seasonTitle}`: first `ListRow` title group name, subtitle "N students", chevron → `/group/[id]`; then one `ListRow` per student (name ?? email ?? "Student", `titleLines={2}`, chevron → `/student/[id]`). Member-load failure and "No students yet." are a non-pressable `ListRow` title in the same group. Past seasons follow under `ListSectionHeader` "Past seasons". Leads nothing: subtitle "You don't lead any groups yet." + the current `EmptyState`, no request (R87 stays).

`group/[id]`: `<Screen title={data.name} subtitle={description ?? "Group in season."} trailing={canManage ? Edit group Button : undefined}>`, and `GroupedList header="Leaders (n)"`, `header="Students (n)"`. Rows: title name ("Unnamed"), subtitle email only when present (the contract's withholding is the switch, keep the comment), `titleLines={2}`. A student row opens `/student/[id]` with a chevron when the viewer's role isn't STUDENT. Leader rows are not pressable. Group edit and new are admin-only (`canManage` is `isAdminOfSeason`): untouched.

- [ ] **Step 1: Update tests:** title "Groups" not "My groups"; "3 groups"; pressing "Group A" now pushes `/group/[id]` (replaces the `not.toHaveBeenCalled` line); pressing a student pushes `/student/[id]`; order still current before "PAST SEASONS" (header uppercases); no "Calendar →"; `role-tabs` and `navigation.test` read LEADER tab "Groups", sidebar "Groups"; a student viewing `group/[id]` gets no chevron and no email; a leader pressing a student row pushes.
- [ ] **Step 2: Run** `pnpm --filter @space/mobile exec jest groups-screens role-tabs` and shared navigation test → FAIL.
- [ ] **Step 3: Implement.** Admin's `SeasonGroups` and student `MyGroups` stay as they are.
- [ ] **Step 4: Rewrite s11** to wait on `'Groups'` and add a shot of `spacev2://group/<id>`, id taken from the seed. Update any other leader flow waiting on 'My groups'.
- [ ] **Step 5: Run** tests and typecheck → PASS.
- [ ] **Step 6: Commit** `feat(mobile): leader Groups as grouped rows; tab and title agree`.

### Task 4: Submissions queue

**Files:**
- Create: `apps/mobile/src/screens/leader-submissions/index.tsx` (`LeaderQueue`), `apps/mobile/src/screens/leader-submissions/queue-sections.ts`
- Modify: `apps/mobile/app/(app)/(tabs)/submissions.tsx` (leader branch only; `PendingQueue` stays)
- Modify: `apps/mobile/.maestro/sweep/leader-scenarios/s15-submissions.yaml` (queue half)
- Test: `apps/mobile/src/__tests__/submission-queue.test.tsx`

**Interfaces:**
- Produces: `queueSections(items: SubmissionQueueItem[]): { waiting: SubmissionQueueItem[]; done: SubmissionQueueItem[] }`, waiting = `status === "SUBMITTED"`, order kept.

`<Screen title="Submissions" subtitle="N pending review · M total · L late">` (late only when > 0). Season filter stays visible: a row of `Text` "Current season only" and Button `variant="plain"` "Show all seasons". `GroupedList header="Waiting for review"` then `header="Reviewed"`: `ListRow` title student name (`titleLines={2}`), subtitle `assignment · group · Late · Mon 3 Nov, 10:00` using one joined string, no dangling separator, trailing `StatusChip {...statusChip("submission", status)}`, chevron, `onPress` → review, `onPressIn` → prefetch, `index` for the stagger. Empty sections are omitted; an empty queue shows the current `EmptyState`. Load more stays, `variant="secondary"`.

- [ ] **Step 1: Update tests:** `queueSections` splits and keeps order; a late row's subtitle contains "Late"; `Late` appears as a word on the row; missing group gives no `· ·`; the rest of the file (paging, season param, malformed param, prefetch on touch-down, student empty branch, admin `PendingQueue`) keeps passing unchanged in intent.
- [ ] **Step 2: Run** `pnpm --filter @space/mobile exec jest submission-queue` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Update s15's queue half.** Row taps stay `'Salma Student'` by regex (the accessibility label is now `title, subtitle`, so match `'Salma Student.*'`), with the second-row index for the reviewed row.
- [ ] **Step 5: Run** tests and typecheck → PASS.
- [ ] **Step 6: Commit** `feat(mobile): leader's submission queue as grouped rows with status chips`.

### Task 5: Submission review with a feedback sheet

**Files:**
- Create: `apps/mobile/src/screens/submission-review/feedback-sheet.tsx`, `apps/mobile/src/screens/submission-review/work-sections.tsx`
- Modify: `apps/mobile/app/(app)/submission/[publicId].tsx`, `apps/mobile/src/design/layout/save-bar.tsx` (additive `onHeight?: (h: number) => void` on `SaveBar`, reported from the wrapper's `onLayout`)
- Modify: `s15-submissions.yaml` (review half)
- Test: `apps/mobile/src/__tests__/submission-review.test.tsx`, `save-bar` test if one exists, else add the case to the sheet's test file

**Interfaces:**
- Produces: `SaveBar` `onHeight` (Task 6 uses the same pattern: `useState(72)`, a `<View style={{ height }} />` at the end of the content).
- `FeedbackSheet({ open, onClose, publicId, alreadyReviewed, feedback, onFeedback, onReturned })`: the parent owns `feedback` so dismissal keeps it.

This route is staff review for every staff role, and plan 02 owns only its student side; the screen today has no role branches (a student page is elsewhere or goes through `canReview`). Keep every condition on the contract's `canReview`, not on role.

`<Screen title={assignmentTitle} subtitle="student · group">`: chips row (`StatusChip` status; Late; `Submitted …` and `Due …` as neutral chips in `flex-row flex-wrap`); `Assignment prompt` and `Submission` under `ListSectionHeader`, each on one `rounded-group bg-surface p-4` surface (attachments list kept, with "Files can't be opened in the app yet."); returned and read-only states as they are on the same surface. When `canReview && status !== "RETURNED"`: `SaveBar` label "Update feedback" if reviewed else "Add feedback" opens the sheet, and the current feedback, if any, shows on a surface above it. Sheet: title = same words; `Textarea` with the current placeholder; error box (current copy); Button `variant="secondary"` "Return for revision"; `SheetSaveBar` label "Update review" or "Mark as reviewed", `loading` on pending. Success: `haptic("light")`, the current toast, sheet closes; returned → `onReturned`.

- [ ] **Step 1: Update tests:** feedback is reached by pressing "Add feedback"; "Mark as reviewed" posts `{ feedback, returnForRevision: false }` and stays on the screen; dismiss the sheet (`onClose`) then reopen: the typed text is still there and no request was made; 403 keeps the sheet open with the message and calls no haptic; "Return for revision" posts the flag, then leaves; can't-review shows no save bar; exactly one back link (existing test); `SaveBar` calls `onHeight` on layout.
- [ ] **Step 2: Run** `pnpm --filter @space/mobile exec jest submission-review` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Update s15:** tap `'Add feedback'`, wait for the placeholder, shot; tap the placeholder, shot with keyboard; type, hide keyboard, shot; drag the sheet down or `back`, never tap save; s15-07 waits on `'Update feedback'` as before.
- [ ] **Step 5: Run** tests and typecheck → PASS.
- [ ] **Step 6: Commit** `feat(mobile): review a submission from a feedback sheet`.

### Task 6: Marking attendance, and the leader's session page

**Files:**
- Modify: `apps/mobile/src/design/sessions/attendance-form.tsx`, `apps/mobile/app/(app)/session/[id]/attendance.tsx`, `apps/mobile/src/design/sessions/check-in-attendance-list.tsx`
- Modify: `apps/mobile/src/screens/session-detail/staff-session-bodies.tsx` (`LeaderSessionBody` only), `apps/mobile/src/screens/session-detail/quizzes-cards.tsx` (`LeaderQuizzesCard` only), `check-in-cards.tsx` (`LeaderCheckInCard` only)
- Modify: `apps/mobile/.maestro/sweep/leader-scenarios/s14-session-attendance.yaml`
- Test: `apps/mobile/src/__tests__/attendance-screen.test.tsx`, the check-in override test (grep `Override attendance`)

**Attendance:** `<Screen title="Attendance" subtitle="Session title · weekday · time">`. Summary card "Quick mark all as" with three `Button variant="secondary" size="sm"`. Roster: one `GroupedList` holding a custom row per student: name `titleLines`-equivalent `numberOfLines={2}`, caption `group · email`, then three toggles `min-h-[44px] flex-1 rounded-control border` that fill the row: active uses `bg-ok-soft text-ok` / `bg-warn-soft text-warn` / `bg-bad-soft text-bad`, inactive `border-control-border` and `text-muted-foreground`, icon + word kept. Late shows "Minutes late" and an `Input` (`min-h-*`, `py-0`, no fixed height). Pressing a toggle fires `haptic("selection")`. `SaveBar` label "Save attendance", `loading`, `hint` "N changed" when N > 0, `onHeight` + spacer (P8). Remove `AttendanceSaveBar` and Cancel. Success: `haptic("light")`, `toast.success("Attendance saved.")`, `router.back()`. Errors stay in the form, above the spacer. Touched-rows-only logic (`buildAttendanceEntries`) is unchanged.

**Override:** `CheckInAttendanceList`: rows `StatusChip` (or neutral "Not recorded") and the Edit button at `size="sm"`; `Modal` → `Sheet title="Override attendance"` with the name as caption and three full-width Buttons; error stays in the sheet. Keep accessibility labels.

**Leader session body:** `<Screen title subtitle>`; primary Button "Mark attendance" with `self-start`; quizzes as a `GroupedList header="Quizzes"` with rows → grade; check-in card content on a `rounded-group bg-surface p-4` surface. `LeaderVideoResults` stays unless the sweep shows a defect.

- [ ] **Step 1: Update tests:** the save bar is `testID="save-bar"` and carries "Save attendance"; hint reads "1 changed" after one mark; no Cancel; each toggle's accessibilityState `selected` follows the mark; success fires the haptic and goes back; failed save shows the message, stays, no haptic; touched-only, late-minutes, mark-all, nothing-marked tests keep their payload assertions. Override: `Mark <name> ABSENT` in the sheet posts one entry with notes and late minutes carried.
- [ ] **Step 2: Run** `pnpm --filter @space/mobile exec jest attendance-screen session-detail check-in` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Update s14:** the waits move to `'Quick mark all as'` (unchanged) and `'Override attendance'` (unchanged); add a shot with focus on the last LATE student's minutes field so Review Focus 5 is on film.
- [ ] **Step 5: Run** tests and typecheck → PASS.
- [ ] **Step 6: Commit** `feat(mobile): attendance with a pinned save bar, override sheet, leader session page`. Say in the message that the override sheet also reaches admin's session page.

### Task 7: Grading

**Files:**
- Create: `apps/mobile/src/screens/quiz-grade/paper-grade-sheet.tsx`, `apps/mobile/src/screens/quiz-grade/attempt-sheet.tsx`, `apps/mobile/src/screens/leader-quizzes.tsx`
- Modify: `apps/mobile/app/(app)/quiz/[id]/grade.tsx`, `apps/mobile/src/design/quizzes/quiz-grade-form.tsx`, `apps/mobile/src/design/quizzes/quiz-essay-grader.tsx`, `apps/mobile/app/(app)/(tabs)/quizzes.tsx` (`LeaderQuizzes` moves out; plan 02's route, say so)
- Modify: `apps/mobile/.maestro/sweep/leader-scenarios/s16-quizzes.yaml`
- Test: `apps/mobile/src/__tests__/quiz-grading.test.tsx`, `quizzes-screen.test.tsx`

**Interfaces:**
- `parseMark` moves to `src/lib/parse-mark.ts`: `parseMark(value: string): number | null`.

Paper (P7): `<Screen title={detail.title} subtitle="session · Max score: N · G / T graded">`, `GroupedList`, `ListRow` title student name, subtitle notes, trailing `tabular` text `8 / 10` or "—", chevron. Row opens a sheet: `Input` "Score for <name>" (number-pad), `Textarea`/`Input` "Notes for <name>", `SheetSaveBar` "Save". Entries are one row: empty score = `null` clear, non-whole number = current message and no request; above max is the server's call (D7). Success: `haptic("light")`, `toast.success("Saved.")`, sheet closes. Failure stays open with the message. Drafts per student live in the parent keyed by `studentUserId`, cleared on that row's success.

Online: `<Screen title subtitle>`; `GroupedList` of attempts: title student, subtitle score and when, trailing `statusChip("quizAttempt", status)`, chevron; opens a sheet with the answers (current content, restyled on tokens: `Check`/`X` icons with `text-ok`/`text-bad`), essay award inputs, `SheetSaveBar` "Save marks" when the attempt has essays, and "Reopen retake" as a secondary Button, whose confirmation behaviour is unchanged. `GroupedList header="Waiting"` with non-pressable rows, current copy. Load more stays.

Leader quizzes list: `<Screen title="Quizzes" subtitle="Grade paper quizzes for your group">` (keep the words, s16 waits on them), `GroupedList` rows from `QuizSummaryRow`'s data → grade, as `ListRow` with a graded `StatusChip`-style chip. Student and admin branches stay.

- [ ] **Step 1: Update tests:** pressing a row opens the sheet; saving posts exactly one entry; a second row's untouched data is not sent; "abc" shows the whole-number message and no request; emptied score sends `score: null`; dismiss then reopen keeps the typed score; failure keeps it; online: essay award saves `{ attemptId, awards }`, reopen still calls with `studentUserId`, `Waiting` has no Reopen; non-staff and bad id branches stay.
- [ ] **Step 2: Run** `pnpm --filter @space/mobile exec jest quiz-grading quizzes-screen` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Update s16:** tap the row, wait for `'Score for Samir Student'` in the sheet, shot; focus the field, shot with keyboard; type, hide keyboard, shot; `back` to dismiss without saving; the online quiz gets an attempt-sheet shot.
- [ ] **Step 5: Run** tests and typecheck → PASS.
- [ ] **Step 6: Commit** `feat(mobile): grade one student at a time from a sheet; leader quizzes list as rows`.

### Task 8: My notes

**Files:**
- Create: `apps/mobile/src/screens/staff-notes/note-row.tsx`
- Modify: `apps/mobile/app/(app)/(tabs)/notes.tsx`
- Modify: `apps/mobile/.maestro/sweep/leader-scenarios/s17-notes.yaml`
- Test: `apps/mobile/src/__tests__/notes-screen.test.tsx`

**Interfaces:**
- Produces: `NoteRow({ item, index })`, usable by plan 05's mentor branch.

Plan 05 owns a mentor branch here and none exists yet: leave one seam, a `role === "MENTOR"` return reusing this list until 05 replaces it, with a comment saying so. `<Screen title="My notes" subtitle="N note(s) you've authored">`, `GroupedList` of custom `Pressable` rows: student name as `headline`-weight `body`, caption `date · season` as one joined string (R33 dangling separators), full body, `StatusChip` warn "Follow-up flagged" when flagged, then caption `Visible to …` (the exact `VISIBILITY_LABEL` copy) and "Edited". Press scale via `usePressScale`, opens `/student/[id]`. Load more `variant="secondary"`.

- [ ] **Step 1: Update tests:** existing assertions keep passing (visibility wording, follow-up, edited, press navigates, student branch, cursor); add: no standalone "·" text node; a note with no season has no trailing separator.
- [ ] **Step 2: Run** `pnpm --filter @space/mobile exec jest notes-screen` → FAIL on the new cases.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** tests and typecheck → PASS.
- [ ] **Step 5: Commit** `feat(mobile): My notes as grouped rows`.

### Task 9: Leader's student page and the note sheet

**Files:**
- Create: `apps/mobile/src/design/students/student-detail-grouped.tsx`, `apps/mobile/src/design/students/grouped-tabs.tsx`, `apps/mobile/src/design/students/note-sheet.tsx`
- Modify: `apps/mobile/app/(app)/student/[id]/index.tsx` (`LeaderStudentDetail` only)
- Modify: `apps/mobile/.maestro/sweep/leader-scenarios/s12-student-note.yaml`
- Test: `apps/mobile/src/__tests__/student-detail.test.tsx` (leader describe block), new `apps/mobile/src/__tests__/note-sheet.test.tsx`

**Interfaces:**
- Produces: `StudentDetailGrouped({ student, canWriteNote })`; `NoteSheet({ open, onClose, studentUserId, defaultVisibility? })`. Before writing, run the sibling check in Global Constraints; if plan 04 already has an equivalent, match it.

`<Screen title={data.name} subtitle={data.email}>` (drop "· leader view"). Body: chips (Alumnus, season, group) in `flex-row flex-wrap`; Button `variant="secondary"` Email (`self-start`), Call if a phone is present. Engagement: `StatTile`s Score, Attendance, Submissions in a wrap row, with the sublabel fractions in each tile's label (`Attendance 3/4`), a `StatusChip tone="bad" label="At risk"` when `e.atRisk`; `no_season` still renders nothing. The existing horizontal `Tabs` stays, five tabs, lazy as now. Tab bodies use `GroupedList`/`ListRow` and the same hooks as `student-activity-tabs`, `student-profile-tabs`, `student-notes-tab`: same empty-state copy, chips via `statusChip`, joined captions with no dangling separator. Notes tab: Button "Write a note" (only when `canWriteNote`) opens `NoteSheet`; the list follows.

`NoteSheet`: title "Write a note"; `Textarea` (current label and placeholder); `SegmentedControl` "Visible to" Leaders / Mentors / Admins only, with the current description as caption; a `Switch` row "Flag for admin follow-up"; error box; `SheetSaveBar` "Add note". Min length 2 with "Note can't be empty." Success: reset, `haptic("light")`, `toast.success("Note added.")`, close. Failure stays with the current message. Dismiss keeps the text.

- [ ] **Step 1: Update tests:** leader header has no "leader view"; tab lazy-fetch test keeps passing; note flow goes through "Write a note", posts `{ body, visibility, followUpFlagged }`; empty note shows the message with no request; dismiss and reopen keeps the text; failure stays; a segmented change sends `MENTORS`; admin `StudentDetail` tests unchanged.
- [ ] **Step 2: Run** `pnpm --filter @space/mobile exec jest student-detail note-sheet` → FAIL.
- [ ] **Step 3: Implement.** Keep each new file ≤ 400 lines.
- [ ] **Step 4: Update s12:** wait on the student's email instead of `'.*leader view'`; tab shots stay; add `Write a note` sheet, keyboard shot, then `back` without saving.
- [ ] **Step 5: Run** tests and typecheck → PASS.
- [ ] **Step 6: Commit** `feat(mobile): leader's student page in grouped lists, write a note from a sheet`.

### Task 10: Whole-suite check and device sweep (controller)

**Files:** whatever the sweep's fixes touch, each its own commit.

Run by the controller, not a subagent: the emulator and tmux are single-tenant (R21).

- [ ] **Step 1:** Full suite, typecheck, lint in tmux `space-v2-r03-verify`. Expected: all pass; also confirm no leader path still imports `PageTitle`/`ShellFrame` (`git grep -n` in the files this plan touched).
- [ ] **Step 2:** Build: `/home/mark/projects/JPC/.redesign-rig/build-apk.sh <worktree> ~/projects/JPC/.v2-captures/sweep-app-03.apk` in tmux `space-v2-r03-apk`.
- [ ] **Step 3:** Corner cells: `FLOWS=s10,s11,s12,s13,s14,s15,s16,s17,s18,s19 sweep.sh <worktree> <apk> ~/projects/JPC/.v2-captures/ui-sweep/redesign-03-<ts> leader small-1.3-3btn-light,iphone-1.0-gesture-dark` in tmux `space-v2-r03-sweep`. The rig runs the backend from this worktree, so it serves `leaderSession`.
- [ ] **Step 4:** Review shots through subagents (≤ 80 images each, ≤ 3 per message), the `ui-sweep` checklist, contrast measured; spot-check every High personally; fix what's the leader's, one commit each.
- [ ] **Step 5:** All 16 cells once corners are clean; review; fix.
- [ ] **Step 6:** Final whole-branch review on opus, one fix wave, scoped re-review, as `superpowers:subagent-driven-development` directs. Update `.redesign-rig/pending-03.md`.
- [ ] **Step 7:** Push per the brief's "Push": only once `55d5c52` is an ancestor of `origin/main`; rebase, re-run mobile `test:unit`, `typecheck`, `lint`, backend unit tests; `gh auth switch --hostname github.com --user MarkBotros0 && git push origin HEAD:main`.
