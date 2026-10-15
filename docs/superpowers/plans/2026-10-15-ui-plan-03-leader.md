# UI Plan 03 — Batch 3: Leader screens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the 13 screens a leader reaches so each matches v1's `/leader/*` pages at 375px in light and dark. Every v2 hook, query key, permission and navigation stays. Admin, super and mentor branches of shared route files keep their current rendering, except where v1's markup is identical for those roles: the attendance screen and quiz grading.

**Architecture:** Same loop as batch 2. Each screen's leader branch is rewritten with `src/design` components and v1 class strings. A few v1 leader-page pieces that several screens share are ported first into `src/design/`: a role-aware route error, an icon back link, the dashboard section card, the check-in list, the attendance form, the quiz graders, student detail and the note form. Every screen ends with a Maestro capture on `jpc-ui`, compared side by side with v1's leader screenshot.

**Tech Stack:** Expo SDK 54, React Native 0.81, expo-router 6, NativeWind 4.2.7, lucide-react-native, React Query 5 (`useQueries`), date-fns, Jest (jest-expo) + @testing-library/react-native, Maestro.

**Spec:** `docs/superpowers/specs/2026-10-14-mobile-ui-v1-match-design.md` (§2, §6, §7, §8)

**Prerequisites:** Plan 02 merged (main `1b88eeb`). v1 copy on `http://127.0.0.1:3100` (tmux `jpc-space-v1-ref`). Screenshots under `~/projects/JPC/.v1-reference/shots/leader/`. Emulator `emulator-5558`, Metro 8095 (tmux `jpc-space-metro`), v2 backend `:4100` (tmux `jpc-space-backend-ref`). v1 detail ids in the leader shots: session 52, quiz 2, student 98, submission `Nc3twuM0F3`.

**Element-level spec (binding):** `docs/superpowers/ui-rebuild/batch-3/inventory-{A,B,C,D}.md`, in the same format as batch 2: per screen (a) v1 elements and classes, (b) v2 hooks to keep, (c) data mapping with GAP / V2-ONLY flags, (d) components, (e) test impact. The Rulings below settle every flag.

## Global Constraints

- `~/projects/JPC/jpc-space` is READ-ONLY. Read v1 from `~/projects/JPC/.v1-reference/app/src/`.
- Match v1 exactly at 375px: same class strings, variants, sizes, icons and copy. Deviate only per the Rulings or where React Native cannot do it. Every deviation goes in `docs/superpowers/ui-rebuild/gaps-batch-3.md`.
- **No backend or `packages/shared` change** (spec §2). A gap that needs a contract change goes in the gap note's "Data gaps (backend)" table.
- Phone width only: drop `md:`/`lg:`/`sm:` classes.
- Leader pages use `flex-col gap-4` page stacks (v1 leader), not the student pages' `gap-3`.
- Text goes through `src/design/ui/text.tsx`. Button and Badge placed as v1 blocks get `self-start`. Inputs keep an explicit `accessibilityLabel`.
- Relative imports only; no `as Href`/`as any`.
- Admin/super/mentor branches of shared files are untouched unless a task says otherwise; their tests must stay green unchanged.
- Org-day rule X13 as in batch 2: format server `dayKey`/`time` where present; format instants in the device zone and list them in the gap note.
- Never touch emulators 5554/5556 or Metro 8081/8090. Long processes in tmux, logs `~/logs/jpc-space-<task>.log`.
- Screenshots (real data) stay under `~/projects/JPC/.v1-reference/` and `~/projects/JPC/.v2-captures/batch-3/`. Never commit or publish them; the comparison page goes to the owner with SendUserFile only.
- Ask the owner before any push. **Never start an EAS build, store submission or production deploy without the owner's explicit yes at that moment.**
- The batch ends with `pnpm typecheck`, `pnpm lint` and `pnpm test:unit` green.

## Rulings (settle every inventory flag)

Precedence, as in batch 2: a numbered v2 domain decision (D-/R-/C-/X-, kept by the owner in PR #21) wins over v1 for behaviour, and for copy that encodes that behaviour. It is presented in v1's layout. Copy that differs only in wording for the same behaviour takes v1's words. Batch-2 rulings B2-1…B2-18 still apply.

| # | Screen | Flag | Ruling |
|---|---|---|---|
| B3-1 | All staff screens | `RouteError` copy | `RouteError` reads the session role: STUDENT/ALUMNI (and no user) → "…let your leader know." (unchanged); every other role → "…let an admin know." (v1 `app/leader/error.tsx`, same for admin/mentor). No prop, so the shared screens need no change. Load errors on rebuilt leader screens use `RouteError`; the leader-dashboard 403 test asserts the generic copy, not the server message (B2-18). |
| B3-2 | Shared | back link with icon | `BackLink` gains `icon?: boolean`. With it set, it renders lucide `ArrowLeft` 12px plus label in `flex-row items-center gap-1`, `mb-1 text-xs font-semibold text-brand-teal-700` (the leader quiz page has no `dark:` variant). Without it, it renders as today. |
| B3-3 | Dashboard | shared with admin | New `src/components/dashboard/LeaderDashboard.tsx`; only `case "LEADER"` switches. `SeasonStaffDashboard` (admin), `StatTile` and `DashboardFrame` are untouched. |
| B3-4 | Dashboard | D2/D4/D5/D6/D7/D12/D13/D19 vs v1 | v1 layout throughout. **Hero:** `ProgressRing` neutral teal (D2: no 70/85 tiers), value `{meanAttendancePct}%` or `—` (D5), label "attendance", a11y label `Group average attendance {n}%` / `No attendance yet`. Teal eyebrow = season title. Title = led groups joined `, ` (D7), or "Your group" when there are none. Line `{n} student(s)` + ` · Session {held} of {total}` (D12). **Stat row:** 3 `StatCard`s: "Students" → `/groups`; "Progress" `{pct ?? 0}%`, sublabel `Session {held}/{total}`; "Quizzes" `{pending}`, sublabel "pending", teal when `total>0 && pending>0` → `/quizzes`. **Next session:** the student card's markup (extract it to `src/design/sessions/next-session-card.tsx`; StudentDashboard switches to it with no visual change), Join stream per D13, empty "No upcoming sessions.". **Events:** `UpcomingEventsCard`, which keeps its empty state (D19). **"Your students at risk" card:** v1 "Your students" card shell (header icon `Users`, "View all" → `/groups`, column header Student / Attendance / Assignments), rows = `cohort.atRisk` (D6, not the full roster). Each row: name, `{pct}%` in `text-error-600 dark:text-error-400` (all rows are at risk), and `Badge variant="warning"` `{completed}/{expected} submitted` (D4, in place of "{n} pending"). Rows → `/student/[id]`. Empty: `EmptyState icon=Users` "Nobody at risk" / "No student has attendance or submissions below 60%." **Assignments card:** Pending review / Reviewed → "View all" `/submissions`. **Quiz corrections card** when `quizzes.total > 0 \|\| quizzes.drafts > 0`: Pending / Fully graded, plus the V2-ONLY line `{n} quiz draft(s) not yet published` as `px-4 pb-3 text-xs text-muted-foreground` when drafts > 0. **At-risk callout** (v1 red box) when `atRiskTotal > 0`: title "{atRiskTotal} student(s) at risk" (v2 rule, not "below 70%"), names joined `, `. **No season:** `EmptyState` "No season yet" / "There is no season for you to manage yet." (V2-ONLY: v1 renders zeros). |
| B3-5 | Groups | members, press, archived, student path | Leader branch = v1 `/leader/groups`. Members come from one `GET /groups/:id` per group via a new `useGroupDetails(ids)` (`useQueries` over `queryKeys.groups.detail(id)`); no contract change. Group cards are **not** pressable (v1). Students → `/student/[id]`; "Calendar →" → `/calendar`. Order: groups of ACTIVE seasons first, by name; groups of other seasons follow under an `Eyebrow` "Past seasons" (spec 05 §9 asks for separation, drawn in v1 idioms). A leader with `groupLeaderIds.length === 0` gets v1's no-groups page and **no request** (R87). The STUDENT path (deep link only, no v1 page) keeps today's rendering until the batch-6 cleanup (gap note). A failed detail query shows `text-sm italic text-muted-foreground` "Couldn't load the members." in that card. |
| B3-6 | Calendar | data source | New `LeaderCalendar` branch before `SUPER \|\| LEADER`. Sessions = union of `useSeasonSessions` per led season (unique `seasonId`s from `useMyGroups`), via a new `useLedSeasonSessions(seasonIds)` (`useQueries`, same keys as `useSeasonSessions`), sorted by `startsAt`. This mirrors v1's per-season union without the 8-week `/sessions` window (D-16.7 parity amendment not implemented; gap note). `PageTitle` "Calendar" + subtitle `{n} session(s)`; `SeasonCalendar` unchanged; `gap-4`. No groups → v1 copy ("You don't lead any groups yet." subtitle + `EmptyState icon=Calendar` "No calendar" / "An admin will add you to a group when you're ready."), no request. SUPER keeps `MultiSeasonCalendar`. |
| B3-7 | More / Settings / Notifications | leader extras | Unchanged screens (batch 2). More keeps "My notes" and "Notifications" from `navFor` (B2-5, spec 09 D14). Settings rows per B2-6. Add a leader More test. Capture and compare only. |
| B3-8 | Submissions | list scope, email, copy | `pendingOnly: false` (v1 lists SUBMITTED, REVIEWED and RETURNED; the backend already supports it with v1's order, and the header counts were always scope-wide). The row is v1's `DataTable` phone row: name (`studentName ?? "Student"`), second line `{groupName}` (no `studentEmail` on queue items: gap), meta Assignment · status badge (+ `Late`) · `MMM d, h:mm a` / `—`. The whole row is pressable → `/submission/[publicId]`. Empty: v1 "No submissions yet" / "Submissions from students in your groups will appear here.". "Load more" (D12) as `Button variant="outline" className="self-center"` under the list. The student guard is unchanged. |
| B3-9 | Submission review | return, after-verdict, feedback card, editor, files | v1 layout. **Return for revision** (spec 08 D11) is kept: `Button variant="outline"` left of the primary in `flex-row justify-end gap-2`. **After a verdict, stay on the page** (v1: refresh; the invalidation refetches, so the title flips to "Update feedback"). A success toast "Review saved." / "Returned for revision." confirms it (v2 feedback, like B2-6). The separate Feedback card shows only when `!canReview` (v1). The editor is a plain `Textarea` (`min-h-32`, v1 placeholder, `accessibilityLabel="Feedback"`) per C11/B2-16. Button "Mark as reviewed" / "Update review" / pending "Saving…". Attachments: v1's inert rows; the note line reads "Files can't be opened in the app yet." (v1's TODO.md line is dev copy, like B2-3). The error box shows `apiErrorMessage(err, "Couldn't record the review. It may not have been submitted yet.")`. |
| B3-10 | Quizzes (leader) | rows, order, admin | Leader branch only (`role === "LEADER"`); admin/super keep `StaffQuizzes`. v1 rows: title (1 line), `{sessionTitle} · {MMM d, yyyy} · Max {n} pts` / `No session · Max {n} pts`, `{graded}/{studentCount} graded` + Done/Partial/Pending badge (v1 rule over server counts, C4/D10). Client-side sort by `sessionDate` desc (nulls last), then `id` desc, so v1's order needs no backend change. Every row is pressable → `/quiz/[id]/grade` (D12). Empty, or no season: v1 `EmptyState icon=PenLine` "No quizzes yet" / "Quizzes created by your admin will appear here.". |
| B3-11 | Quiz grading | shared, reopen, waiting, copy, table | Rebuild for every staff role: v1's `QuizEssayGrader` / `QuizGradeForm` are the same component for leader and admin. Header: icon `BackLink` "Back to session" → `/session/[id]` (hidden when `sessionId === null`) + h1. ONLINE: v1 attempt cards; MCQ shows `(correct: X)` only when wrong (v1); the essay `Input` keeps the label `Marks for {prompt}`. Buttons "Save grade" / "Update grade" / "Saving…". **Reopen** (spec 12 D5: leaders may) as v1 `Button size="sm" variant="outline"` with `RotateCcw` "Reopen retake", on GRADED **and** SUBMITTED attempts (D5). **Waiting** (V2-ONLY, D5/R102): `Eyebrow` "Waiting" + v1 card rows (`text-sm font-bold` name; `text-xs text-muted-foreground` "Not started" / "In progress since {date}"; the same Reopen button where v2 offers it). The "Graded by" line is dropped (v1 has none; D13 gap note). The header summary cards are dropped (v1 subtitle instead). Essay error copy v1 "Enter 0–{points} points for each written answer." for client validation; the server stays the bound (D7). PAPER: v1 subtitle; the table is a horizontal `ScrollView` with fixed columns (name `w-40`, score `w-32`, notes `w-64`), keeping v1's light-only colours (gap note: v1 has no dark variant). Save row: "Save grades" / "Saving...", `{graded} / {rows} graded`, "Saved" flash on success. Touched-rows / clear / no-clamp behaviour is unchanged. |
| B3-12 | Staff quiz preview `/quiz/[id]` | no v1 page | Untouched (admin batch). Nothing in the leader flow routes to it after B3-13. |
| B3-13 | Session detail (leader) | layout, override, Grade →, extras | The leader layout renders when `!showConsole && !canAuthorVideo` (LEADER, and non-admin SUPER); the admin console branch is untouched. v1 order: header (`PageTitle` title + `{formatWeekdayDay(dayKey)} · {formatWallTime(startTime)}`), Quizzes card (only with quizzes; `PenLine` title; rows title + `Max score: {n}` (+ ` · Draft`, V2-ONLY) + `Grade →` link → `/quiz/[id]/grade`, v1's target), Check-in card (`QrCode` title, Open/Closed badge from `checkInOpen`, ported `CheckInAttendanceList`: name, status badge or "Not recorded", `Edit` → v1 "Override attendance" modal with Present/Late/Absent). The override writes through `useSaveAttendance` with one entry carrying the row's stored `notes` and, for LATE, `lateMinutes` (spec 04 D7/R32; also runs low-attendance flagging per D7 — gap note). V2-ONLY kept: the 10 s live roster refresh; the "Mark attendance" `Button` placed right after the header, as v1 admin's (`self-start`; the only way into the attendance screen, since v1 leaders have no link); video results (spec 13 D10) as a v1 `Card` "Video quiz results" with `DataTable` rows when the session has a video. Dropped for the leader (v1): duration, location, description, the "x of n checked in" line. Check-in time per row: gap (no `checkedInAt`). |
| B3-14 | Attendance | shared, save, header | Rebuild for every staff role (v1 admin markup is identical). Header `Attendance — {title}` + `formatWeekdayDayYear(dayKey) · formatWallTime(startTime)` via `useSessionDetail` (usually cached). Ported `AttendanceForm`: the mark-all bar's buttons carry a11y `Mark all {STATUS}`, row toggles keep `Mark {name} {STATUS}`, minutes `Minutes late for {name}`. The save bar sits absolute at `bottom-24` above the tab bar, with matching content padding: Save above Cancel. Save rules unchanged (touched rows, notes kept, R13/R16). The error box shows `apiErrorMessage`. Success → `router.back()` (v2; v1 jumps to `/leader/calendar`; gap note). Controls are disabled while pending. |
| B3-15 | Student profile (leader) | fields, tabs, notes | New `src/design/students/student-detail.tsx` (v1 port, role props) rendered for **LEADER only**; SUPER/ADMIN/MENTOR keep today's render until their batches. Header h1 name + `{email} · leader view`. Hero (avatar initials, badges, outline "Email"; **no Call button**). Profile tab shows only the fields a leader receives (University, Year / faculty, Gifts / interests); Phone, Date of birth, Spiritual background and Internal notes are hidden (spec 06 D3/C8). Engagement card only when engagement loads (404 `no_season` → no card, v1). The tab row (Profile · Seasons · Attendance · Submissions · Notes) is a horizontal `ScrollView`; attendance, submissions and notes queries fetch **when their tab first opens** (spec 06 §9). Seasons rows show raw enums (v1); the `{pct}% attendance` badge is hidden when null. Submissions rows → `/submission/[publicId]`, with an extra `Late` warning badge when `isLate` (V2-ONLY, like B2-16). Notes: v1 composer (`Textarea` per C11; `Select` Leaders / Mentors / Admins only; FormField description = v2's sentence per spec 09 D3; ported `Checkbox` "Flag for admin follow-up" wired to `followUpFlagged`; "Note can't be empty." under the 2-char minimum; "Add note" / "Saving…"); note cards v1 (author, role badge, visibility badge, Follow up, date, season), body as plain `Text`, "Load more" outline. The V2-ONLY "At risk" label shows as `Badge variant="error"` "At risk" in the engagement card title row. |
| B3-16 | Staff assignment detail | no v1 leader page | Not rebuilt here: its v1 counterpart is the admin page (batch 4). Two fixes only. (1) The staff branch renders `description` via `RichTextView html={storedTextToHtml(...)}` instead of raw `Text` (a bug: v1 HTML tags show). (2) The `ForumThread` comment-delete dialog description becomes "This removes the comment for everyone." (it was wrong when a leader removes a student's comment). |

## Review Focus

- **A leader with no groups** opens Dashboard, Groups, Calendar, Submissions, Quizzes: each shows its v1 empty branch, and Groups/Calendar send no request. Pinned in Tasks 4 and 5.
- **A leader whose groups span an archived and an active season** sees sessions from both seasons in the calendar union, and the groups under the right headings. Pinned in Tasks 4 and 5 (two-season fixtures).
- **An override on a row that already has notes or late minutes** must not wipe them. Pinned in Task 11 (the POST payload carries the stored notes).
- **The attendance save bar must not cover the last row or the tab bar.** Pinned by the Task 12 capture plus a test that the list's content container has `pb` ≥ the bar height.
- **Lazy tabs on the student profile** must fetch nothing until a tab opens, and still fetch when it does (also after pull-to-refresh). Pinned in Task 13.

---

## File Structure

```
apps/mobile/
  src/design/layout/route-states.tsx            # RouteError: role-aware contact phrase (B3-1)
  src/design/layout/page-title.tsx              # BackLink icon variant (B3-2)
  src/design/dashboard/section-card.tsx         # NEW v1 leader-dashboard card shell + FigurePair
  src/design/sessions/next-session-card.tsx     # NEW extracted from StudentDashboard
  src/design/sessions/check-in-attendance-list.tsx  # NEW port of v1 check-in-attendance-list.tsx
  src/design/sessions/attendance-form.tsx       # NEW port of v1 attendance-form.tsx (presentational)
  src/design/quizzes/quiz-essay-grader.tsx      # NEW port (attempt card, presentational)
  src/design/quizzes/quiz-grade-form.tsx        # NEW port (paper table + save row)
  src/design/students/student-detail.tsx        # NEW port (hero, engagement, tabs)
  src/design/students/note-form.tsx             # NEW port
  src/design/ui/checkbox.tsx                    # NEW (v1 native checkbox look) + index export
  src/lib/format.ts                             # + formatShortDateTime ("MMM d, h:mm a")
  src/hooks/use-groups.ts                       # + useGroupDetails(ids)
  src/hooks/use-sessions.ts                     # + useLedSeasonSessions(seasonIds)
  src/components/dashboard/LeaderDashboard.tsx  # NEW
  app/(app)/{dashboard,groups,calendar,submissions,quizzes}.tsx
  app/(app)/submission/[publicId].tsx
  app/(app)/quiz/[id]/grade.tsx
  app/(app)/session/[id]/{index,attendance}.tsx
  app/(app)/student/[id]/index.tsx
  app/(app)/assignment/[id]/index.tsx, src/components/ForumThread.tsx   # B3-16 fixes
tools/ui-reference/capture-v2.sh               # BATCH env (default batch-2)
tools/ui-reference/batch-3-pairs.sh            # NEW
docs/superpowers/ui-rebuild/gaps-batch-3.md    # NEW
```

## The per-screen loop (every screen task)

1. Read the inventory section named in the task, the v1 sources it lists, and v1's light and dark leader screenshots.
2. **RED:** edit the test file per the task's "Test changes" (behaviour assertions untouched). Run it and watch the changed assertions fail.
3. **GREEN:** rewrite the leader rendering per the inventory's (a), with the Rulings; hooks from (b) stay. Run the file until green, then the mobile suite.
4. **Capture:** `BATCH=batch-3 tools/ui-reference/capture-v2.sh leader <light|dark> <route> <name> [shots] [wait-text]`. Compare with v1's PNG side by side (Read tool). Fix every visible difference that is not a platform detail; write the rest in `gaps-batch-3.md`.
5. **Commit** with the task's message.

Commands:
- One file: `cd apps/mobile && npx jest src/__tests__/<file> --forceExit 2>&1 | tail -30`
- Mobile suite: `cd apps/mobile && npx jest --forceExit > <scratchpad>/unit.log 2>&1; tail -15 <scratchpad>/unit.log`
- Types/lint: `pnpm typecheck && pnpm lint`

---

### Task 1: Capture rig for batch 3

**Files:** Modify `tools/ui-reference/capture-v2.sh`; Create `tools/ui-reference/batch-3-pairs.sh`.

- [ ] **Step 1:** In `capture-v2.sh` replace `root=~/projects/JPC/.v2-captures/batch-2` with `root=~/projects/JPC/.v2-captures/${BATCH:-batch-2}` and the header comment's path accordingly.
- [ ] **Step 2:** Write `batch-3-pairs.sh`: a copy of `batch-2-pairs.sh` with `v2=~/projects/JPC/.v2-captures/batch-3`, output `compare-batch-3.html`, and pairs (role `leader`): Dashboard `leader__dashboard.png` dashboard · Groups `leader__groups.png` groups · Calendar `leader__calendar.png` calendar · Submissions `leader__submissions.png` submissions · Submission `leader__submissions__publicId.png` submission · Quizzes `leader__quizzes.png` quizzes · Quiz grading `leader__sessions__id__quiz__id.png` quiz-grade · Session detail `leader__sessions__id.png` session · Attendance `leader__sessions__id__attendance.png` attendance · Student `leader__students__id.png` student · More `leader__more.png` more · Settings `leader__settings.png` settings · Notifications `leader__notifications.png` notifications.
- [ ] **Step 3:** `node tools/ui-reference/set-reference-passwords.mjs`, then `BATCH=batch-3 tools/ui-reference/capture-v2.sh leader light more more 1 "Appearance"`. Expected: `more-1.png` under `.v2-captures/batch-3/leader/light/`, showing the leader More screen.
- [ ] **Step 4:** Commit `chore(ui-reference): batch-3 capture target and comparison pairs`.

### Task 2: Shared batch-3 pieces

**Files:** Modify `src/design/layout/route-states.tsx`, `src/design/layout/page-title.tsx`, `src/lib/format.ts`, `src/hooks/use-groups.ts`, `src/hooks/use-sessions.ts`, `src/design/ui/index.ts`. Create `src/design/dashboard/section-card.tsx`, `src/design/sessions/next-session-card.tsx`, `src/design/ui/checkbox.tsx`. Modify `src/components/dashboard/StudentDashboard.tsx` (use `NextSessionCard`). Test: `src/__tests__/batch3-shared.test.tsx` (new), `format.test.ts`.

**Interfaces (produced):**
- `RouteError({ onRetry })`: phrase by `useSessionStore` role (B3-1).
- `BackLink({ label, onPress, icon? })` (B3-2).
- `formatShortDateTime(iso: string | null): string` → `"Jul 1, 6:13 PM"` (`MMM d, h:mm a`, device zone), `"—"` for null/invalid.
- `useGroupDetails(ids: number[]): UseQueryResult<GroupDetail>[]`: `useQueries` with `queryKeys.groups.detail(id)` and the same fetch/parse as `useGroupDetail`.
- `useLedSeasonSessions(seasonIds: number[]): { sessions: SessionListItem[]; isPending: boolean; isError: boolean; refetch: () => void }`: `useQueries` over `queryKeys.sessions.bySeason(id)` with `fetchSeasonSessions`, union sorted by `startsAt` then `id`.
- `SectionCard({ icon, title, onViewAll?, children })`: v1 `rounded-2xl border border-border bg-card` + `shadowStyle("soft")`; header `flex-row items-center gap-2 border-b border-border px-4 py-3`, icon 16 `text-brand-teal-600`, title `text-sm font-bold text-brand-navy-900 dark:text-foreground`, "View all" `ml-auto text-xs font-semibold text-brand-teal-700 dark:text-brand-teal-300` (`accessibilityRole="link"`, a11y label `View all {title}`). `FigurePair({ items: [{label, value, accent}] x2 })`: `flex-row` with a `border-l border-border` divider; cell `flex-1 px-4 py-3 items-center`, value `text-2xl font-black {accent}`, label `mt-0.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70`.
- `NextSessionCard({ session, onOpen, onJoin })`: the markup moved verbatim from `StudentDashboard.tsx` (the student card: eyebrow, dot + title, date line, relative badge, Join stream, "No upcoming sessions."); `session` is `nextSession | null`.
- `Checkbox({ checked, onCheckedChange, accessibilityLabel, disabled? })`: `size-4 rounded-[3px] border border-input items-center justify-center`; checked `bg-primary border-primary` with lucide `Check` 12 `text-primary-foreground`; `accessibilityRole="checkbox"`, `accessibilityState={{checked}}`.

- [ ] **Step 1 (RED):** `batch3-shared.test.tsx`:
  - `RouteError` as STUDENT → `getByText(/let your leader know/)`; as LEADER → `getByText(/let an admin know/)`; "Try again" calls `onRetry` once.
  - `BackLink icon` → renders "Back to session" and calls `onPress`; without `icon` → "← Back".
  - `SectionCard` "View all" press calls `onViewAll`; it has no "View all" when `onViewAll` is absent.
  - `Checkbox` press toggles via `onCheckedChange(true)`; `accessibilityState.checked` reflects the prop.
  - `useGroupDetails([3,4])` (with `renderHook` + the api mock) requests `/api/v1/groups/3` and `/api/v1/groups/4`.
  - `useLedSeasonSessions([7,8])` merges and sorts sessions from `/api/v1/seasons/7/sessions` and `/api/v1/seasons/8/sessions`.
  - `format.test.ts`: `formatShortDateTime` for a fixed instant built with `new Date(2026, 6, 1, 18, 13)` → `"Jul 1, 6:13 PM"`, and null → `"—"`.
  - Run. Expected: FAIL (missing exports / student phrase for leader).
- [ ] **Step 2 (GREEN):** implement the interfaces. Move the next-session JSX out of `StudentDashboard` unchanged. Run the new file, `dashboard.test.tsx` and `format.test.ts`. Expected: PASS, with the student dashboard tests unchanged.
- [ ] **Step 3:** Commit `feat(mobile): batch-3 shared pieces (role-aware route error, icon back link, section card, checkbox, led-season hooks)`.

### Task 3: Leader dashboard

**Files:** Create `src/components/dashboard/LeaderDashboard.tsx`; Modify `app/(app)/dashboard.tsx` (`case "LEADER"`). Test: `src/__tests__/dashboard.test.tsx` (LEADER cases l.454-493 only).
**Markup spec:** inventory-A §1 (a). Rulings B3-1, B3-3, B3-4.
**Hooks (keep, from SeasonStaffDashboard):** `useCurrentSeasonId`, `useSeasonStaffDashboard(seasonId)`, `useUpcomingEvents(UPCOMING_EVENTS_LIMIT)`; the same refresh logic.

- [ ] **Step 1 (RED)** leader tests:
  - Keep: requests `/api/v1/seasons` then `/api/v1/me/dashboard?seasonId=7`.
  - `getByText("Group average attendance 33%")` → `getByLabelText("Group average attendance 33%")` + `getByText("33%")`.
  - `"Your students at risk"` stays (card title).
  - `View all` → press `getByLabelText("View all Your students at risk")` → push `/groups`; add `View all Assignments` → `/submissions`; `View all Quiz corrections` → `/quizzes`.
  - Add: `getByText("Group A, Group B")`; `getByText("Session 3 of 4")` inside `"8 students · Session 3 of 4"` (use the fixture's count); StatCards `getByLabelText("Students: …")`, `getByLabelText("Quizzes: 2")`; at-risk row press → `/student/[id]`; callout `"1 student at risk"`.
  - 403 test: `"You don't have access to this."` → `"Something went wrong"` + `/let an admin know/`.
  - Admin cases: unchanged.
  - Run. Expected: FAIL on the leader cases only.
- [ ] **Step 2 (GREEN):** transcribe inventory-A §1 (a) inside `ShellFrame refreshing onRefresh` > `View className="flex-col gap-4"` with B3-4. Loading → `RouteSkeleton`; errors → `RouteError`. Run. Expected: PASS (admin unchanged).
- [ ] **Step 3: Capture** `dashboard` (3 shots, wait "Your students"), light and dark; compare with `leader__dashboard.png`.
- [ ] **Step 4:** Commit `feat(mobile): v1 leader dashboard`.

### Task 4: Groups (leader)

**Files:** Modify `app/(app)/groups.tsx` (new `LeaderGroups`; STUDENT keeps `MyGroups`). Test: `src/__tests__/groups-screens.test.tsx` (l.36-55).
**Markup spec:** inventory-A §2 (a). Ruling B3-5.

- [ ] **Step 1 (RED):**
  - "lists my groups": route GETs by URL: `/api/v1/seasons` → seasons 7 (ACTIVE) and 3 (ARCHIVED); `/api/v1/groups` → group 1 (season 7) and group 2 (season 3); `/api/v1/groups/1` → two students, `/api/v1/groups/2` → no students. Expect `"My groups"`, `"2 groups"`, both season titles, the two student names, `"No students yet."`, and `"Past seasons"` rendered before group 2's name. A group is "current" when its `seasonId` belongs to a season whose `status === "ACTIVE"` in `useSeasons()`.
  - Press a student → push `{pathname:"/student/[id]", params:{id:"21"}}`; press `"Calendar →"` → push `/calendar`; pressing the group title pushes nothing.
  - No groups: `groupLeaderIds: []` → `"You don't lead any groups yet."`, `"No groups"`, `"An admin will add you to a group when you're ready."`, and `get` not called.
  - GroupDetail tests l.57-95: unchanged.
  - Run. Expected: FAIL.
- [ ] **Step 2 (GREEN):** implement inside `ShellFrame refreshing onRefresh`. `useSeasons()` (GET `/api/v1/seasons`, already cached by staff screens) tells ACTIVE seasons; while it is pending, treat every group as current. Run. Expected: PASS.
- [ ] **Step 3: Capture** `groups` (2 shots, wait "My groups"); compare with `leader__groups.png`.
- [ ] **Step 4:** Commit `feat(mobile): v1 leader groups`.

### Task 5: Calendar (leader)

**Files:** Modify `app/(app)/calendar.tsx`. Test: `src/__tests__/calendar-screen.test.tsx` (l.138-150; new leader cases).
**Markup spec:** inventory-A §3. Ruling B3-6.

- [ ] **Step 1 (RED):**
  - l.138-143 X13 test: mock `/api/v1/groups` (groups in seasons 7 and 8), `/api/v1/seasons/7/sessions` and `/api/v1/seasons/8/sessions` (one session each, `startTime "20:00"`), `/api/v1/events` → []. Expect `getByText("2 sessions")`, the agenda rail `"8:00"` + `"PM"` (as the student test does), and no request to `/api/v1/sessions`.
  - l.145-150: keep `get` not called; add `"No calendar"` and `"An admin will add you to a group when you're ready."`.
  - New: press a session title → push `{pathname:"/session/[id]"}`.
  - SUPER tests: unchanged.
  - Run. Expected: FAIL.
- [ ] **Step 2 (GREEN):** `LeaderCalendar` = `ShellFrame refreshing onRefresh` > `View.flex-col gap-4` > `PageTitle title="Calendar" subtitle={`${n} ${n===1?"session":"sessions"}`}` + `SeasonCalendar` with the same props the student wrapper passes. Loading → `RouteSkeleton`; any session query failed → `RouteError onRetry={refetch}`; events failure is swallowed (as for the student). Run. Expected: PASS.
- [ ] **Step 3: Capture** `calendar` (1 shot, wait "Calendar"); compare with `leader__calendar.png`.
- [ ] **Step 4:** Commit `feat(mobile): v1 leader calendar over every led season`.

### Task 6: More, Settings, Notifications (leader check)

**Files:** Test `src/__tests__/more-screen.test.tsx` (add a leader case).
- [ ] **Step 1:** Add a test: as LEADER, `My notes`, `Quizzes`, `Notifications` and `Settings` are present, `Submissions`/`Calendar` absent, and the `LEADER` badge shows. Run → PASS (it pins the existing behaviour; no RED expected, since this task only verifies and records). Note it in the ledger as a pinning test.
- [ ] **Step 2: Capture** `more` (2), `settings` (4, wait "Settings"), `notifications` (2, wait "Notifications"); compare with the leader shots. Write every difference in the gap note (expected: More rows B3-7, Settings rows B2-6, the notifications total B2-7).
- [ ] **Step 3:** Commit `test(mobile): leader More menu rows`.

### Task 7: Submissions queue

**Files:** Modify `app/(app)/submissions.tsx`. Test: `src/__tests__/submission-queue.test.tsx`.
**Markup spec:** inventory-B §1 (a). Ruling B3-8.

- [ ] **Step 1 (RED):**
  - URLs: `pendingOnly=true` → `pendingOnly=false` (l.42, 47).
  - Add `getByText("Submissions")` (h1).
  - l.60 `"Test student · Group A · Late"` → `getByText("Test student")`, `getByText("Group A")`, `getByText("Submitted")`, `getByText("Late")`.
  - l.69 press: press `getByText("Test student")` (whole row) → same push.
  - l.82 `"All caught up"` → `"No submissions yet"` + `"Submissions from students in your groups will appear here."`.
  - Keep: the header counts lines, the student guard (no request), "Load more" paging.
  - Run. Expected: FAIL.
- [ ] **Step 2 (GREEN):** `ShellFrame refreshing onRefresh` > `flex-col gap-4` > `PageTitle title="Submissions" subtitle={counts}` + the v1 list (use `DataTable` if its phone row accepts the four columns and a row press; otherwise transcribe the row markup from inventory-B §1 (a) into `src/design/submissions/leader-queue-list.tsx`) + "Load more". Date via `formatShortDateTime`. Run. Expected: PASS.
- [ ] **Step 3: Capture** `submissions` (3, wait "Submissions"); compare with `leader__submissions.png`.
- [ ] **Step 4:** Commit `feat(mobile): v1 leader submissions queue`.

### Task 8: Submission review

**Files:** Modify `app/(app)/submission/[publicId].tsx`. Test: `src/__tests__/submission-review.test.tsx`.
**Markup spec:** inventory-B §2 (a). Ruling B3-9.

- [ ] **Step 1 (RED):**
  - l.44 `"Submitted late"` → `getByText("Submitted")` (exact) + `getByText("Late")`.
  - `"Mark reviewed"` → `"Mark as reviewed"` (l.47, 66, 97, 109).
  - l.54 `expect(mockBack).toHaveBeenCalled()` → `expect(mockBack).not.toHaveBeenCalled()` + `findByText("Review saved.")` (toast).
  - Return case: after the POST, `findByText("Returned for revision.")` and no back.
  - Add: with `assignmentDescription: "<p>Write 300 words</p>"` → `getByText("Assignment prompt")` + `getByText("Write 300 words")`; with `files: [{id:1, originalName:"essay.pdf", sizeBytes:2048, mimeType:"application/pdf"}]` → `"Attachments"`, `"essay.pdf"`, `"2.0 KB"`, `"Files can't be opened in the app yet."`.
  - Add: `canReview: true` with existing feedback → no `"Feedback"` card title (`queryByText("Feedback")` null — the Textarea's label is a11y only); `canReview: false` with feedback → `getByText("Feedback")`.
  - Keep: payloads, the 409 message, hidden controls, the subtitle.
  - Run. Expected: FAIL.
- [ ] **Step 2 (GREEN):** port `submission-review-form.tsx` inline or to `src/design/submissions/submission-review-form.tsx`; page per inventory-B §2 (a); toasts via the ported toaster (as Settings does). Run. Expected: PASS.
- [ ] **Step 3: Capture** `submission/Nc3twuM0F3` name `submission` (3, wait "Submission"); compare with `leader__submissions__publicId.png` and one REVIEWED shot (`leader__submissions__FwsYZexPgf.png` vs `submission/FwsYZexPgf`, name `submission-reviewed`).
- [ ] **Step 4:** Commit `feat(mobile): v1 submission review for leaders`.

### Task 9: Quizzes list (leader)

**Files:** Modify `app/(app)/quizzes.tsx` (new `LeaderQuizzes`, dispatcher `LEADER` → it). Test: `src/__tests__/quizzes-screen.test.tsx` (staff block, leader cases).
**Markup spec:** inventory-C §1 (a). Ruling B3-10.

- [ ] **Step 1 (RED):** as LEADER (`l.150-166`, `218-224`): `"Paper · 3/8 graded"` → `"3/8 graded"` + `"Partial"`; subtitle `"Week 1 · Mar 1, 2099 · Max 20 pts"` (fixture values); add `"Quizzes"` h1 + `"Grade paper quizzes for your group"`; empty `"No quizzes"` → `"No quizzes yet"`; add an order test (two quizzes, the later `sessionDate` renders first). Keep: the requests, press → `/quiz/[id]/grade`, no "New quiz". Admin cases: unchanged (they still go through `StaffQuizzes`).
  - Run. Expected: FAIL on the leader cases.
- [ ] **Step 2 (GREEN):** implement; rows `Pressable accessibilityRole="link"` `flex-row items-center justify-between gap-4 rounded-2xl border border-border bg-card px-4 py-4` + `shadowStyle("soft")`. Run. Expected: PASS.
- [ ] **Step 3: Capture** `quizzes` (1, wait "Quizzes"); compare with `leader__quizzes.png`.
- [ ] **Step 4:** Commit `feat(mobile): v1 leader quizzes list`.

### Task 10: Quiz grading (all staff)

**Files:** Create `src/design/quizzes/quiz-essay-grader.tsx`, `src/design/quizzes/quiz-grade-form.tsx`; Modify `app/(app)/quiz/[id]/grade.tsx`. Test: `src/__tests__/quiz-grading.test.tsx`.
**Markup spec:** inventory-C §2 (a). Rulings B3-2, B3-11.

- [ ] **Step 1 (RED):**
  - l.88 `"1/2 graded"` → `"1 / 2 graded"`; after a successful save, `findByText("Saved")`.
  - l.160 `"Correct answer: Paris"` → `queryByText(/correct:/)` null for a correct MCQ, `getByText("Paris")`, `getByText("2/2")`; add a wrong-answer fixture → `getByText(" (correct: Paris)")` (or a regex).
  - l.163 `"Save marks"` → `"Save grade"`.
  - l.201 `"Reopen for a retake"` → `"Reopen retake"`.
  - Waiting l.175-177: `"Waiting"` and `"Not started"` stay.
  - Add: `"Back to session"` press → push `{pathname:"/session/[id]", params:{id:"…"}}` when `sessionId` is set; absent when null.
  - Keep: payloads, the no-clamp server message, the label queries.
  - Run. Expected: FAIL.
- [ ] **Step 2 (GREEN):** transcribe; the screen keeps every hook and handler; the components are presentational (props: rows/attempts, values, onChange, onSave, pending, error, saved). Run. Expected: PASS.
- [ ] **Step 3: Capture** `quiz/2/grade` name `quiz-grade` (2, wait "Back to session"); compare with `leader__sessions__id__quiz__id.png`.
- [ ] **Step 4:** Commit `feat(mobile): v1 quiz grading (online grader and paper sheet)`.

### Task 11: Session detail (leader) + override

**Files:** Create `src/design/sessions/check-in-attendance-list.tsx`; Modify `app/(app)/session/[id]/index.tsx` (leader branch), `src/components/SessionQuizzesCard.tsx` (only if reused; otherwise the leader card is inline and `SessionQuizzesCard` stays for admin). Test: `src/__tests__/session-detail.test.tsx`.
**Markup spec:** inventory-D §1 (a). Rulings B3-1, B3-13.

- [ ] **Step 1 (RED):**
  - l.175 `"Check-in is open"` → `getByText("Open")`; l.236 (SUPER non-admin) `"Check-in is closed"` → `getByText("Closed")`.
  - l.176-177 → `getByText("Present")` (badge) + `getByText("Not recorded")`.
  - l.179 `"Mark attendance"` stays (B3-13).
  - l.190 anchor → `findByText("Open")`.
  - l.273-284 → press `"Grade →"` → push `{pathname:"/quiz/[id]/grade", params:{id:"…"}}`.
  - Add the override: press the row's `Edit` (a11y `Edit attendance for {name}`) → `"Override attendance"` + the name → press `"Late"` → POST `/api/v1/sessions/12/attendance` with `{ entries: [{ studentUserId, status: "LATE", notes: <row notes>, lateMinutes: <row lateMinutes ?? null> }] }`; the modal closes.
  - Keep: the admin/console tests, the leader never-requests checks, the 10 s refresh.
  - Run. Expected: FAIL.
- [ ] **Step 2 (GREEN):** leader layout per B3-13 inside `ShellFrame refreshing onRefresh` > `flex-col gap-4`; pending/error → `RouteSkeleton`/`RouteError` for this branch too. Run. Expected: PASS.
- [ ] **Step 3: Capture** `session/52` name `session` (3, wait "Check-in"); compare with `leader__sessions__id.png`.
- [ ] **Step 4:** Commit `feat(mobile): v1 leader session detail with attendance override`.

### Task 12: Attendance (all staff)

**Files:** Create `src/design/sessions/attendance-form.tsx`; Modify `app/(app)/session/[id]/attendance.tsx`. Test: `src/__tests__/attendance-screen.test.tsx`.
**Markup spec:** inventory-D §2 (a). Ruling B3-14.

- [ ] **Step 1 (RED):**
  - Switch the `get` mock to URL routing: `/api/v1/sessions/12` → a session detail fixture (copy `sessionDetail` from `video-quiz-screen.test.tsx`, title "Week three"), `/api/v1/sessions/12/attendance` → the roster.
  - Add `getByText("Attendance — Week three")` and `getByText("Sun, Mar 1, 2099 · 8:00 PM")`.
  - l.90 `"All present"` → `getByLabelText("Mark all PRESENT")`.
  - Add `"Cancel"` press → `mockBack`; during a pending save `"Saving…"`.
  - Add the Review Focus check: the list's `contentContainerStyle`/class includes the save-bar padding (assert the presence of the absolute bar's a11y label `"Save bar"` and that the scroll content has `pb-48`).
  - Keep: the payloads, untouched-row exclusion, LATE minutes, the empty-save refusal, back after save.
  - Run. Expected: FAIL.
- [ ] **Step 2 (GREEN):** implement; the screen keeps the hooks, `marks`/`lateText` state and `buildAttendanceEntries`. Run. Expected: PASS.
- [ ] **Step 3: Capture** `session/52/attendance` name `attendance` (3, wait "Attendance"); compare with `leader__sessions__id__attendance.png`.
- [ ] **Step 4:** Commit `feat(mobile): v1 attendance form for staff`.

### Task 13: Student profile (leader)

**Files:** Create `src/design/ui/checkbox.tsx` (Task 2), `src/design/students/student-detail.tsx`, `src/design/students/note-form.tsx`; Modify `app/(app)/student/[id]/index.tsx` (LEADER → new component), `src/hooks/use-students.ts`/`use-notes.ts` only if an `enabled` flag is missing for lazy tabs. Test: `src/__tests__/student-detail.test.tsx` (new LEADER block).
**Markup spec:** inventory-C §3 (a). Ruling B3-15.

- [ ] **Step 1 (RED):** a new `describe("LEADER")` with a public-arm fixture:
  - `getByText("{email} · leader view")`; `getByText("Email")` button; `queryByText("Call")` null; `queryByText("Phone")` null; Profile fields `University`, `Year / faculty`, `Gifts / interests`.
  - On mount only `/api/v1/students/21` and `/engagement` are requested (not `/attendance`, `/submissions`, `/notes`).
  - Press tab `"Submissions"` → `/api/v1/students/21/submissions` requested; press the row → push `/submission/[publicId]`.
  - Press `"Notes"` → `/notes` requested; type into `getByLabelText("Note")`, choose `"Admins only"`, tick `getByLabelText("Flag for admin follow-up")`, press `"Add note"` → POST `{ body, visibility: "ADMINS", followUpFlagged: true }`; a 1-char body → `"Note can't be empty."` and no POST.
  - Engagement 404 `no_season` → no `"Engagement (current season)"` card.
  - SUPER/ADMIN/MENTOR tests: unchanged.
  - Run. Expected: FAIL.
- [ ] **Step 2 (GREEN):** implement; per-tab queries get `enabled = role !== null && role !== "STUDENT" && openedTabs.has(tab)` (a `Set` in state that only grows); pull-to-refresh refetches the engagement and every opened tab. Run. Expected: PASS.
- [ ] **Step 3: Capture** `student/98` name `student` (4, wait "leader view"); compare with `leader__students__id.png` (v1 is 464px wide, so compare structure and the left 375px).
- [ ] **Step 4:** Commit `feat(mobile): v1 student profile for leaders (tabs, notes)`.

### Task 14: Staff assignment detail fixes (B3-16)

**Files:** Modify `app/(app)/assignment/[id]/index.tsx` (staff description), `src/components/ForumThread.tsx` (dialog copy). Test: `assignment-staff-detail.test.tsx`, `forum-screen.test.tsx`.
- [ ] **Step 1 (RED):** staff fixture `description: "<p>Read <b>chapter 2</b></p>"` → `queryByText(/<p>/)` null and `getByText(/chapter 2/)`; forum: the dialog description `"This removes the comment for everyone."`. Run → FAIL.
- [ ] **Step 2 (GREEN):** `RichTextView html={storedTextToHtml(detail.description)}`; dialog copy. Run → PASS.
- [ ] **Step 3:** Commit `fix(mobile): staff assignment brief renders stored HTML; neutral comment-delete copy`.

### Task 15: Gap note, comparison page, verification

- [ ] **Step 1:** Delete legacy files freed by this batch (same `grep` loop as batch 2 Task 13 Step 1); run the suite.
- [ ] **Step 2:** `docs/superpowers/ui-rebuild/gaps-batch-3.md`: one heading per screen with every remaining difference and its reason (platform / ruling id / data gap). "Data gaps (backend)" table: `studentEmail` on queue items; `checkedInAt` (org wall time) on roster rows; the D-16.7 unbounded `/sessions`; the quiz list order; feedback stored raw (not `plainTextToHtml`); file streaming hook; notification total; instants formatted in the device zone (queue, review, quizzes, attendance history).
- [ ] **Step 3:** Update `CLAUDE.md` Mobile conventions with one line on the batch-3 shared pieces (`src/design/dashboard/`, `src/design/quizzes/`, `src/design/sessions/{check-in-attendance-list,attendance-form,next-session-card}.tsx`, `src/design/students/{student-detail,note-form}.tsx`; `RouteError` is role-aware).
- [ ] **Step 4:** `pnpm typecheck && pnpm lint` and the full unit suites (`pnpm test:unit` or per package with `--forceExit`). Expected: green; record the counts.
- [ ] **Step 5:** Recapture every leader screen (light and dark), run `batch-3-pairs.sh`, send `compare-batch-3.html` to the owner with SendUserFile, then `node tools/ui-reference/restore-reference-passwords.mjs`.
- [ ] **Step 6:** Commit `docs(mobile): batch-3 gap note`.
- [ ] **Step 7 (owner gates):** whole-branch review per the executing skill, then the finishing skill. Ask before pushing. **Ask before any TestFlight build; never start one unprompted.**
