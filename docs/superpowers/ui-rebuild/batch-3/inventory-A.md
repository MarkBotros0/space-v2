# Inventory A — leader role (dashboard, groups, calendar, more/settings/notifications, route states)

v1 root = `/home/mark/projects/JPC/.v1-reference/app/src` · v2 root = `/home/mark/projects/JPC/space-v2/apps/mobile` · shared = `/home/mark/projects/JPC/space-v2/packages/shared/src` · shots = `/home/mark/projects/JPC/.v1-reference/shots/leader/{light,dark}/`

Common to all leader screens (v1):
- `app/leader/layout.tsx` (13 l) wraps every page in `div.-mx-4 -mt-4 -mb-24 bg-brand-navy-50 px-4 dark:bg-transparent pt-4 pb-24` (+ `md:-mx-8 md:-mt-8 md:-mb-10 md:px-8 md:pt-8 md:pb-10`, dropped). **Byte-identical to `app/student/layout.tsx`** except `allowedRoles={["SUPER","ADMIN","LEADER"]}` → v2 `ShellFrame` (navy-50 tint + optional RefreshControl) already does this. Nothing new.
- `app/leader/loading.tsx` (16 l): `div.flex flex-col gap-3 md:gap-4` > `Skeleton.h-32 rounded-2xl` · `div.grid grid-cols-3 gap-3` > 3× `Skeleton.h-24 rounded-2xl` · `SkeletonCard` · `SkeletonCard`. **Identical to the student skeleton** → reuse `RouteSkeleton` as is.
- `app/leader/error.tsx` (23 l): `EmptyState icon=AlertTriangle title="Something went wrong" description="We couldn't load this page. Please try again — if it keeps happening, let an admin know." action=<Button onClick={reset}>Try again</Button>`. **Differs from the student copy in one phrase: "let an admin know" (student: "let your leader know").** v2 `RouteError` (`src/design/layout/route-states.tsx`, 36 l) hardcodes the student phrase. See §5.
- `app/leader/template.tsx` (5 l) → `RouteTransition` (motion only; not ported, gaps-foundations).
- Shell dialogs: every leader route has 3 dialog shots. They're the shell, not the page: `__dialog-0` = DEV "switch user" popover (orange user-cog icon in the top bar, dev-only), `__dialog-1` = notification bell popover ("Notifications" / "Mark all read" / rows / "View all"), `__dialog-2` = avatar menu (name, LEADER badge, "Profile settings", "Dark mode", "Sign out"). Checked on dashboard and calendar. Covered by the shell (`app-top-bar`, `notification-bell`, `user-menu`), so they're out of scope here. The DEV switcher icon isn't ported (dev tool).
- Idioms (card, eyebrow, H1, Badge `self-start`, Text) as in batch-2 inventory-B header. Leader pages use the H1 idiom `text-2xl font-black text-brand-navy-900 dark:text-foreground` (→ `PageTitle`), **not** `PageHeader`, except More/Settings/Notifications, which use `PageHeader` as for the student.
- Leader pages use `gap-4` wrappers (16px), not the student `gap-3`.

---

## 1. /leader/dashboard

### a) v1
Files: `app/leader/dashboard/page.tsx` (390 l), `components/students/stat-card.tsx` (76 l), `components/events/upcoming-events-card.tsx` (65 l), ui: badge, empty-state, progress-ring (82 l). Icons: AlertTriangle, ClipboardList, PenLine, Users. **No StaggerReveal** (unlike the student page).
Shots: `leader/light/leader__dashboard.png`, `leader/dark/leader__dashboard.png` (+ `__dialog-0..2`, shell). In the shot the season has 12/12 sessions held, 8 students, no next session and **no events, so the events card renders nothing (null)**. Every student is below 70%, so the red callout is present.

Render tree, `div.flex flex-col gap-4` (no md: classes anywhere on this page):
- **Hero** `div.rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]` > `div.flex items-center gap-5`
  - `ProgressRing value={avg ?? 0} label=` avg!==null ? `Group average attendance {avg}%` : `No attendance yet`; `indicatorClassName=` avg<70 `stroke-[var(--color-error-500)]` / avg<85 `stroke-[var(--color-warning-500)]` / else default teal (v2 port: `stroke-error-500` / `stroke-warning-500`). The shot shows a red arc at 13%.
    - `span.text-2xl font-black text-brand-navy-900 dark:text-foreground` → `{avg}%` | `—`
    - `span.mt-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70` → `attendance`
  - `div.min-w-0 flex-1`
    - eyebrow teal `p.text-[10px] font-bold uppercase tracking-widest text-brand-teal-700 dark:text-brand-teal-300` → `{season.title}` | `No active season`
    - `p.mt-1 truncate text-lg font-black text-brand-navy-900 dark:text-foreground` → `{groups[0].name}` | `Your group`
    - `p.text-xs text-muted-foreground` → `{n} student|students` + (weeksTotal>0 ? ` · Week {held} of {total}` : "")
  - avg = mean of per-student pct with **null counted as 0**; null only when roster empty (R29).
- **Stat row** `div.grid grid-cols-3 gap-3`
  - `StatCard label="Students" value={studentCount} href=/leader/groups` (white, no sublabel)
  - `StatCard label="Progress" value="{round(held/total*100) | 0}%" sublabel="Week {held}/{total}"` (white, no href)
  - `StatCard label="Quizzes" value={quizzes.length>0 ? quizzesPending : 0} sublabel="pending" href=/leader/quizzes variant={quizzes.length>0 && pending>0 ? "teal" : "white"}`
- **Next session** card `div.rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-soft)]`. Identical markup to the student card (batch-2 inventory-B §1): eyebrow `Next session`; dot + `Link href=/leader/sessions/{id}` title `text-sm font-bold …`; `p.text-xs text-muted-foreground` `EEE, MMM d · h:mm a · {dur} min[ · location]`; `Badge variant="teal" className="mt-1.5 text-[10px]"` relative; youtubeUrl → teal `Watch recording` link button; none → `p.mt-2 text-sm italic text-muted-foreground` `No upcoming sessions.`
- **`<UpcomingEventsCard user>`**. It returns null when there are 0 events (as in the shot). Staff variant: ALUMNI_ONLY events included; SEASON events for led seasons.
- **Your students** card `div.rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)]` (no padding)
  - header `div.flex items-center gap-2 border-b border-border px-4 py-3` > `Users.size-4 text-brand-teal-600` · `p.text-sm font-bold text-brand-navy-900 dark:text-foreground` `Your students` · `Link href=/leader/groups .ml-auto text-xs font-semibold text-brand-teal-700 hover:underline dark:text-brand-teal-300` `View all`
  - empty: `div.px-4 py-6` > `EmptyState icon=Users title="No students yet" description="Students will appear here once added to your group."`
  - else column header `div.grid grid-cols-[1fr_auto_auto] gap-3 border-b border-border px-4 py-2` > 3× `p.text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70`: `Student` · `Attendance` · `Assignments`. (The header grid and the flex rows below don't share columns, so in the shot the % values sit under "ASSIGNMENTS", not "ATTENDANCE". Reproduce for a pixel match.)
  - `ul.divide-y divide-border` > **every** student (unpaged), sorted attendance asc, null last > `li` > `Link href=/leader/students/{id} .flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40`
    - `p.flex-1 truncate text-sm font-semibold text-brand-navy-900 dark:text-foreground` → name ?? `Student`
    - `div.flex shrink-0 items-center gap-2`
      - pct!==null: `span.text-xs font-bold` + (<70 `text-error-600 dark:text-error-400` / <85 `text-warning-700 dark:text-warning-300` / else `text-success-700 dark:text-success-300`) → `{pct}%`
      - pending>0: `Badge variant="warning" className="text-[10px]"` → `{n} pending`
- **Assignments** card (same shell as Your students)
  - header: `ClipboardList.size-4 text-brand-teal-600` · `Assignments` · `Link href=/leader/submissions` `View all`
  - `div.grid grid-cols-2 divide-x divide-border` > 2× `div.px-4 py-3 text-center` > `p.text-2xl font-black {accent}` value · `p.mt-0.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70` label
    - `Pending review`: accent pending>0 `text-warning-700 dark:text-warning-300` else `text-brand-navy-900 dark:text-foreground`
    - `Reviewed`: accent `text-success-700 dark:text-success-300`
- **Quiz corrections** card, only when `quizzes.length > 0`: header `PenLine.size-4 text-brand-teal-600` · `Quiz corrections` · `Link href=/leader/quizzes` `View all`; 2-col: `Pending` (warning accent when >0, else navy) · `Fully graded` (= total − pending, success accent).
- **At-risk callout**, when any student pct<70: `div.flex items-start gap-3 rounded-2xl bg-error-50 p-4 ring-1 ring-error-200 dark:bg-error-950 dark:ring-error-900` > `AlertTriangle.mt-0.5 size-4 shrink-0 text-error-500` · `div` > `p.text-xs font-bold text-error-800 dark:text-error-200` `Students below 70% attendance` + `p.mt-0.5 text-xs text-error-600 dark:text-error-300` → names joined `, `.
- No-groups branch: there isn't one. Everything renders with zeros: hero `—`, `No active season`, `Your group`, `0 students`; tiles 0 / 0% `Week 0/0` / 0; next `No upcoming sessions.`; students EmptyState; Assignments 0/0; no quiz card; no callout (R42).

md:/lg: classes: none.

### b) v2 current
- `app/(app)/dashboard.tsx` (46 l): dispatcher. `case "LEADER": <SeasonStaffDashboard role="LEADER" />`, `case "ADMIN": <SeasonStaffDashboard role="ADMIN" />`. Null role → `DashboardFrame` + legacy `LoadingState`.
- `src/components/dashboard/SeasonStaffDashboard.tsx` (184 l). **Shared with ADMIN (batch 4).** `isLeader` switches 4 strings and 2 routes:
  - Hooks (keep): `useCurrentSeasonId()` (`src/hooks/use-seasons.ts`; for staff: first ACTIVE row of GET `/api/v1/seasons`, key `queryKeys.seasons.list()`); `useSeasonStaffDashboard(seasonId)` → key `queryKeys.dashboard.me(seasonId)`, GET `/api/v1/me/dashboard?seasonId={id}`, parse `staffSeasonDashboardSchema`, `enabled: seasonId!==null`, stale 60s; `useUpcomingEvents(4)` → `queryKeys.events.upcoming(4)`, GET `/api/v1/events?upcoming=true&limit=4`.
  - refresh: `current.refetch()`, dash.refetch guarded on seasonId, events.refetch; refreshing = dash||events isRefetching.
  - States: seasons pending → LoadingState; seasons error → `ErrorState "Couldn't load your seasons."`; no season → `EmptyState "No season yet" / "There is no season for you to manage yet."`; dash pending → LoadingState; dash error → `ErrorState apiErrorMessage(err,"Couldn't load the dashboard.")` (shows the server's message, which is tested); events card always last, outside the state switch.
  - Renders (legacy): Card {season.title; groups joined `, ` (D7); `Session N of M` | `No sessions scheduled yet`; `Group average attendance {mean}` (leader) | `Average attendance {mean}` (admin), neutral (D2), `—` when null (D5)}; `TileRow` of `StatTile`s `Students` (→ `/groups` leader | `/students` admin), `Quizzes pending` (tone warning >0, → `/quizzes`), `Pending review` (caption `{reviewed} reviewed`, → `/submissions`); next-session Card (Pressable a11y `Session {title}` → `/session/[id]`; `Happening now`/`Next session`; `formatDayKey · formatWallTime`; no duration, location, relative badge or stream link); at-risk Card `Your students at risk` (leader) | `At risk` (admin), `{n} of {atRiskTotal}`, rows `{name}` (error-600) + `{pct}% attendance, {completed} of {expected} submitted` → `/student/[id]`; empty `EmptyState "Nobody at risk" / "No student has attendance or submissions below 60%."`; `View all` link (→ `/groups` | `/students`); Quizzes Card (total>0 || drafts>0) `{fullyGraded} of {total} fully graded` + `{n} quiz draft(s) not yet published`.
  - Legacy imports: `../../theme` (useTheme), `../../ui` (Card, EmptyState, ErrorState, LoadingState, Text), `./StatTile`, `./DashboardFrame` (legacy `Screen`).
- `DashboardFrame.tsx` (25 l), `StatTile.tsx` (69 l): legacy, still used by SuperDashboard and this file. `UpcomingEventsCard.tsx` (75 l): **already v1-styled in batch 2** (B2-9), shared by all 6 dashboards; keeps the empty state (D19/R10).

**Admin sharing / safe plan:** v1's admin dashboard (`app/admin/dashboard/page.tsx`, 380 l) has the same skeleton (hero, 3 tiles, next session, events, roster card "All students"/"No students enrolled", Assignments, "Quizzes" panel instead of "Quiz corrections"; no difference in formulas, R41). Recommendation: add a new `src/components/dashboard/LeaderDashboard.tsx` (v1 markup, `ShellFrame`, design components) and switch only `case "LEADER"` in `dashboard.tsx`. Leave `SeasonStaffDashboard` untouched, so ADMIN keeps the legacy render and its tests. Optionally extract the v1 card pieces (hero, `SectionCard` header with icon + "View all", 2-col figure grid) into `src/design/dashboard/` so batch 4 reuses them. Do **not** change `StatTile`, `DashboardFrame` or `UpcomingEventsCard` (Super/Admin/Mentor/Alumni depend on them).

### c) Data mapping
| v1 element | v2 source (`StaffSeasonDashboard`) |
|---|---|
| season.title / "No active season" | `data.season.title` ✓. v2 has no "no season" render inside the body; the screen shows `EmptyState "No season yet"` instead (V2-ONLY branch, needs a ruling: v1 renders the zero dashboard) |
| hero title groups[0].name / "Your group" | `data.groups[].name` joined `, ` (D7: all led groups this season) ✓; `"Your group"` when `groups` empty |
| `{n} students` | `cohort.studentCount` ✓ (ACTIVE enrolments, D7/C9) |
| ` · Week N of M` | `progress.sessionsHeld` / `sessionsTotal` ✓. Copy: D12 → `Session N of M` (batch-2 precedent B2-8) |
| ring avg / label / `—` | `cohort.meanAttendancePct` ✓ (D5: null = nobody has had a session → `—`; v1 null only when roster empty) |
| ring colour tiers 70/85 | **conflict D2**: tiers dropped, ring neutral |
| Students tile | `cohort.studentCount` → `router.push("/groups")` ✓ |
| Progress tile `{pct}%` / `Week N/M` | `progress.pct` (null → v1 shows `0%`) / held/total ✓; sublabel D12 → `Session N/M`? (ruling) |
| Quizzes tile value / teal | `quizzes.pending` (D10 definition) ✓; teal when `quizzes.total>0 && pending>0` → `/quizzes` |
| next session title/id/dur/location/youtubeUrl | `nextSession.*` ✓ (`id,title,startsAt,dayKey,time,durationMinutes,location,youtubeUrl,isInProgress`) |
| `EEE, MMM d · h:mm a` | `formatWeekdayDay(dayKey)` + `formatWallTime(time)` ✓ (as the student card) |
| relative badge | `formatTimeAgo(startsAt)` ✓ (hidden while in progress, batch-2 precedent) |
| Watch recording | D13 → `Join stream` only while `isInProgress` (B2-8 precedent) |
| events card | `useUpcomingEvents(4)` + shared `UpcomingEventsCard` ✓; **v1 renders null when empty (shot); v2 shows the empty state (D19)** |
| Your students roster rows (every student, name, pct, `{n} pending`) | **GAP + conflict D6/D4**: `/me/dashboard` carries only `cohort.atRisk` (≤10, `DASHBOARD_AT_RISK_PREVIEW`). The full roster exists at GET `/api/v1/seasons/{id}/engagement` (leader-scoped to led groups, `apps/backend/src/routes/engagement.ts:134`), schema `seasonEngagementResponseSchema` (`note.ts:187`), key `queryKeys.engagement.season(seasonId)` exists but **no mobile hook**. Row → `studentName`, `attendancePct` (hide when `attendanceTotal===0`, = v1 null), sort client-side by pct asc. `{n} pending` = v1 R27 arithmetic, removed by D4 (no client subtraction; engagement row offers `submissionsCompleted/Expected` → "N of M submitted") |
| row pct colour tiers | **conflict D2** (neutral) |
| row link | `/student/[id]` ✓ |
| Pending review / Reviewed | `submissions.pendingReview` / `submissions.reviewed` ✓ (D11 scope: the leader's students only) |
| Quiz corrections Pending / Fully graded, shown when quizzes>0 | `quizzes.pending` / `quizzes.fullyGraded` ✓; condition `quizzes.total > 0` |
| Callout "Students below 70% attendance" + names | **conflict D2**: callout becomes the `isAtRisk` preview (`cohort.atRisk`, `AT_RISK_PCT`=60, component-wise). Names = `atRisk[].studentName` ✓; total `atRiskTotal` |

- V2-ONLY: `{n} quiz draft(s) not yet published` line (D10, `quizzes.drafts`); Quizzes card when `drafts>0` and total 0; ErrorState with the server message (tested); seasons-loading/error states; pull-to-refresh; at-risk rows' "N of M submitted" line.
- V2-ONLY branch: `No season yet` EmptyState (v1 has no empty dashboard; it renders zeros).
- GAP: the full roster needs a new `useSeasonEngagement(seasonId)` hook, plus a ruling against D6.

### d) Components
- Ported: `Card`, `Badge` (teal, warning), `ProgressRing` (label, `indicatorClassName`), `EmptyState` (Users), `Text`, `StatCard` (`src/design/students/stat-card.tsx`: white/teal, `onPress`, a11y `"{label}: {value}"`), `Eyebrow` (`page-title.tsx`), `ShellFrame`, `RouteSkeleton`/`RouteError`, `UpcomingEventsCard` (v1-styled). Icons from lucide-react-native: Users, ClipboardList, PenLine, AlertTriangle (register via `iconWithClassName`).
- Needs port: nothing from `components/` beyond what's ported. The hero, roster card, figure cards and callout are inline in page.tsx. Suggest a small `SectionCard` (header row: icon + bold title + `ml-auto` "View all" link, `border-b`) and a `FigurePair` (2-col `divide-x` grid). The 3 cards share them, and so does the admin dashboard in batch 4.
- Next-session card: copy the student implementation (`StudentDashboard.tsx` l.220-259) or extract it to a shared component. Both roles use identical v1 markup.

### e) Tests — `src/__tests__/dashboard.test.tsx` (573 l), block `DashboardScreen — ADMIN and LEADER` l.414-493
- Fixture `staffDashboard("groups")` l.127-148 (groups A/B, 3/4 sessions, mean 33, atRisk 1 of 12, review 1/2, quizzes 2/2/0/1).
- Leader l.454-470. Behaviour (keep): requests `/api/v1/seasons` then `/api/v1/me/dashboard?seasonId=7`; `View all` → `push("/groups")`. Markup/copy (will change): `Group A, Group B` (stays if D7 header kept), `Group average attendance 33%` (→ the ring's a11y label `Group average attendance 33%` via `getByLabelText`, plus `33%` text), `Your students at risk` (→ v1 `Your students`; at-risk moves to the callout). Two `View all` links appear once the Assignments/Quiz cards exist, so `getByText("View all")` throws on duplicates → `getAllByText(...)[0]` or a11y labels.
- Leader 403 l.472-493. Behaviour: an error surfaces. Copy: `You don't have access to this.` (server message). With batch-2's `RouteError` this becomes `Something went wrong`. Ruling: keep `apiErrorMessage` or v1 generic.
- Admin l.415-452: **must keep passing unchanged** (`Average attendance 33%`, `1 of 12`, `Quizzes pending: 2`, `1 quiz draft not yet published`, `Pending review: 1` press, `View all` → `/students`, no `/reports` read). The plan above (separate LeaderDashboard) satisfies this.
- `dashboard-branch.test.ts` (12 l), `use-dashboard.test.tsx` (56 l), `dashboard-invalidation.test.ts`: hook/logic only, unaffected. `upcoming-events-card.test.tsx`: unaffected (component unchanged).
- New coverage needed: leader roster rows (if adopted) press → `/student/[id]`; Assignments `View all` → `/submissions`; Quiz corrections `View all` → `/quizzes`; Quizzes tile → `/quizzes`; pull-to-refresh via `ShellFrame` RefreshControl.

---

## 2. /leader/groups

### a) v1
File: `app/leader/groups/page.tsx` (93 l). ui: `Card`, `CardHeader`, `CardTitle`, `CardContent` (`components/ui/card.tsx`, 80 l), `EmptyState`. Icon: Users.
Shots: `leader/light/leader__groups.png`, `leader/dark/leader__groups.png` (2 groups: one with 8 students, one with `No students yet.`).

- No groups (`groupLeaderIds.length === 0`, **no query issued**, R87): `div.flex flex-col gap-4` > `div` > H1 `My groups` + `p.mt-1 text-sm text-muted-foreground` `You don't lead any groups yet.` · `EmptyState icon=Users title="No groups" description="An admin will add you to a group when you're ready."`
- Main `div.flex flex-col gap-4`
  - `div` > H1 `My groups` + `p.mt-1 text-sm text-muted-foreground` `{n} group|groups`
  - `div.flex flex-col gap-4` > per group (orderBy **name asc**, across all seasons incl. archived, R85) `Card` (`rounded-2xl bg-card shadow-[var(--shadow-soft)] ring-1 ring-border`)
    - `CardHeader className="flex flex-row items-start justify-between gap-3"` (base `flex flex-col gap-1.5 p-4 md:p-6`)
      - `div` > `CardTitle className="text-base"` (base `text-base font-semibold leading-tight tracking-tight md:text-lg`) → group.name · `p.text-sm text-muted-foreground` → season.title
      - `Link href=/leader/calendar .text-sm font-medium text-brand-teal-700 hover:underline` → `Calendar →` (**no dark: variant**)
    - `CardContent` (`p-4 pt-0 md:p-6 md:pt-0`)
      - 0 students: `p.text-sm italic text-muted-foreground` `No students yet.`
      - else `ul.grid grid-cols-1 gap-1.5 sm:grid-cols-2` > `li.text-sm` > `Link href=/leader/students/{id} .hover:underline` → name ?? email (ordered by name; foreground colour)
- The card itself isn't a link. There's no group detail page for the leader in v1.
- md:/sm: dropped: `md:p-6`, `md:pt-0`, `md:text-lg` (CardTitle), `sm:grid-cols-2`.

### b) v2 current
- `app/(app)/groups.tsx` (128 l): `role ∈ SEASON_GROUPS_ROLES` (ADMIN/SUPER) → `SeasonGroups` (batch 4, untouched); `role ∈ MY_GROUPS_ROLES` (`["LEADER","STUDENT"]`) → `MyGroups`; else (MENTOR) legacy EmptyState.
- `MyGroups` (**shared with STUDENT**, deep-link only. The student nav has no `/groups`): `useMyGroups(true)` → key `queryKeys.groups.mine()`, GET `/api/v1/groups`, parse `groupListSchema` (`GroupListItem[]`: `id,name,description,studentCount,leaderNames,seasonId,seasonCode,seasonTitle`; backend `listMyGroups` orders **season year desc, name asc**). Always fetches (`enabled: true`, even with 0 led groups). Renders: legacy `Screen` + pull-to-refresh; LoadingState; `ErrorState "Couldn't load your groups. Check your connection and try again."`; `EmptyState "No groups" / "You aren't in any groups yet."`; `GroupRow` Card per group (heading name, label `{seasonTitle} · {studentCount} students`), Pressable → `router.push({pathname:"/group/[id]"})`. No page title, no member list.
- Legacy imports: `../../src/theme`, `../../src/ui` (Button, Card, EmptyState, ErrorState, LoadingState, Screen, Text); `SeasonSwitcher` (admin branch).
- **Group detail the leader can reach:** `app/(app)/group/[id]/index.tsx` (76 l). `useGroupDetail(id)` → `queryKeys.groups.detail(id)`, GET `/api/v1/groups/{id}`, parse `groupDetailSchema` (`leaders[]`, `students[]` `{id,name|null,email?}`, `canManage`). Legacy render: title, season, `Edit group` (canManage), description, `Leaders` / `Students` cards (`None yet.`, `Unnamed`). **v1 has no leader counterpart.** Its v1 counterpart is the admin page `app/admin/season/[code]/groups/[id]/page.tsx` (95 l, ADMIN/SUPER only; H1 name + `{description ?? "Group in {season}."}`, outline `Edit group`, two `Card`s `Leaders ({n})` / `Students ({n})` with `divide-y` rows name ?? email + email, empties `No leaders assigned.` / `No students enrolled.`). screen-map maps it to `(app)/group/[id]/index`, which is admin, batch 4. The leader reaches it only because v2's group row is pressable.

### c) Data mapping
| v1 element | v2 source |
|---|---|
| no-groups gate (no fetch) | `useSessionStore scopes.groupLeaderIds.length === 0` → render empty state, `useMyGroups(false)` ✓ (pattern already in `calendar.tsx` `leadsNothing`) |
| subtitle `{n} group(s)` | `data.length` ✓ |
| group name / season title | `GroupListItem.name` / `seasonTitle` ✓ |
| ordering name asc | **GAP (minor)**: server orders year desc, then name. Sort client-side by name for v1, or accept |
| Calendar → | `router.push("/calendar")` ✓ |
| student list (name ?? email, by name) | **GAP**: `GroupListItem` has only `studentCount`, no members. Options: (1) one `useGroupDetail(id)` per group (`useQueries`, N requests; `students[]` already name-ordered, email present for staff); (2) extend GET `/groups` rows with `students: {id,name,email}[]` for LEADER (contract change in `group.ts` + `apps/backend/src/lib/queries/groups.ts`). Spec 05 §7 (l.577-583) says the new `/groups` exists because the screens render member lists, which suggests (2) |
| student link | `router.push({pathname:"/student/[id]", params:{id}})` ✓ (`student/[id]` route exists) |
| `No students yet.` | `students.length === 0` (or `studentCount === 0`) ✓ |

- V2-ONLY: group card press → `/group/[id]` (v1 card inert). Under v1-exact the leader no longer reaches `/group/[id]`. Ruling needed: drop the press, or keep it as an extra.
- V2-ONLY: error state with retry, pull-to-refresh, loading.
- **Conflict, spec 05 §9 (LEADER row, l.685 in 05-groups.md):** "Groups from archived seasons must be visually separated (R85)". v1 mixes them, sorted by name, with no separation. v2 today doesn't separate either.
- The student path of `MyGroups` has no v1 page (v1 students see their group on `/student/season`). If LEADER gets its own branch, STUDENT keeps today's render or gets the same v1-styled list (no reference). Ruling needed.

### d) Components
- Ported: `Card`, `CardHeader`, `CardTitle`, `CardContent` (`src/design/ui/card.tsx`; v2 Card uses `border border-border` where v1 uses `ring-1 ring-border`, the same visual), `EmptyState` (Users icon), `Text`, `PageTitle`, `ShellFrame`, `RouteSkeleton`/`RouteError`.
- No non-ui v1 component to port. Note `CardHeader` must be given `flex-row items-start justify-between gap-3` (base is `flex-col gap-1.5 p-4`). The student `li` is a Pressable Text `text-sm text-foreground`.

### e) Tests — `src/__tests__/groups-screens.test.tsx` (96 l)
- l.36-47 "lists my groups…". Behaviour (keep): GET `/api/v1/groups`. Will change: `Spring 2026 · 8 students` (→ `Spring 2026` subtitle line + student names; fixture needs members or the detail mocks); press `Group A` → `/group/[id]` (removed if v1-exact; replace with press student → `/student/[id]` and `Calendar →` → `/calendar`).
- l.49-55 "empty state for a leader with no groups". Uses `groupLeaderIds: [3]` with an empty response. Copy `No groups` is the same. Add: `groupLeaderIds: []` → no request (R87). The v1 empty copy is `An admin will add you to a group when you're ready.` plus the subtitle `You don't lead any groups yet.`
- l.57-76, l.78-95: `GroupDetailScreen` (staff emails, student without emails, `Edit group` hidden, `Unnamed`). This is admin-batch markup; leave alone in batch 3.

---

## 3. /leader/calendar

### a) v1
Files: `app/leader/calendar/page.tsx` (58 l), `components/sessions/season-calendar.tsx` (494 l). ui: EmptyState. Icon: Calendar.
Shots: `leader/light/leader__calendar.png`, `leader/dark/leader__calendar.png` (20 sessions, all past → Upcoming shows `Nothing coming up` / `You're all caught up. Switch to Month to review past sessions.`); dialogs = shell.

- No groups (no query, R84): `div.flex flex-col gap-4` > `div` > H1 `Calendar` + `p.mt-1 text-sm text-muted-foreground` `You don't lead any groups yet.` · `EmptyState icon=Calendar title="No calendar" description="An admin will add you to a group when you're ready."`
- Main `div.flex flex-col gap-4`
  - `div` > H1 `Calendar` + `p.mt-1 text-sm text-muted-foreground` `{n} session|sessions` (n = **all** sessions of every led season, past included; `20 sessions` in the shot)
  - `SeasonCalendar sessions={allSessions} jpcEvents={…} sessionPathTemplate="/leader/sessions/{id}"`. **No `seasonColors`**, so the leader gets exactly the student's single-season rendering (segmented Upcoming/Week/Month, agenda, 7-col grid). Sessions = union of `listSessionsForSeason` per led season, sorted `startsAt`. Events = `listJpcEvents({ includeAlumniOnly: true, seasonIds: viewerSeasonIds })`, so ALUMNI_ONLY events appear with their `Lock` icon (students never see them).
- md: none on the page (SeasonCalendar internals: as batch-2 inventory-C §1).

### b) v2 current — `app/(app)/calendar.tsx` (436 l)
- `CalendarScreen`: `leadsNothing` (LEADER && `scopes.groupLeaderIds.length===0`) → legacy `Screen` + `EmptyState "No calendar" / "You don't lead any groups yet."` (no fetch, tested). `role === "SUPER" || role === "LEADER"` → `MultiSeasonCalendar`. **Shared with SUPER (batch 5).**
- `MultiSeasonCalendar` → legacy `Screen` > `CalendarSurface source={{kind:"range", seasonId:null}} showSeason` (pre-rebuild UI: `ChoiceChips`, `Legend` season slots, `CalendarDays` day groups, `CalendarGrid`, Earlier/Later window header `MMM d, yyyy – MMM d, yyyy`, staff `sessionBadge` attendance badges via `CalendarEntries`). No page title, no pull-to-refresh.
  - Hooks: `useSessionRange({seasonId:null, from, to}, true)` → key `queryKeys.sessions.range(params)`, GET `/api/v1/sessions` (params from/to), parse `sessionRangeResponseSchema` (`sessions, from, to, fromDayKey, toDayKey`); `useEvents()` → `queryKeys.events.list()`, GET `/api/v1/events` (server window today−30d … +365d; failure swallowed to []).
  - **Backend reality** (`apps/backend/src/routes/sessions.ts:225-256`): no bounds → org-midnight today + `SESSION_RANGE_DEFAULT_WEEKS` (8); span capped at `SESSION_RANGE_MAX_DAYS` (120). The plan's "v1 parity 2026-10-09" amendment to D-16.7 (unbounded when no bounds, nullable `from`/`to`, `todayDayKey`) is **not implemented** in backend or `session.ts:208`.
- Student path (done in batch 2): `StudentCalendar` → `ShellFrame` > `View.flex-col gap-3` > `PageTitle "Calendar"` + `SeasonCalendar sessions events today initialAnchor onOpenSession onOpenEvent` from `useSeasonSessions(seasonId)` (GET `/api/v1/seasons/{id}/sessions`, key `queryKeys.sessions.bySeason(id)`) + `useEvents()`; `RouteSkeleton` / `RouteError`; empty `Nothing scheduled yet`.
- Legacy imports used by the leader path: `../../src/theme`, `../../src/ui` (Button, EmptyState, ErrorState, LoadingState, Screen, Text), `ChoiceChips`, `SeasonSwitcher`, `components/calendar/*`.

**Can the leader reuse `src/design/sessions/season-calendar.tsx`? Yes, unchanged.** Its props (`sessions, events, today, initialAnchor, onOpenSession, onOpenEvent`) match v1's leader call. It already renders the ALUMNI_ONLY `Lock`. It has no season palette, which matches v1 (leader passes no `seasonColors`). Differences from the student wrapper:
1. Subtitle `{n} session(s)` under the title (student: no subtitle) → `PageTitle title="Calendar" subtitle=…`.
2. Wrapper `gap-4` (student `gap-3`).
3. Data: multi-season union instead of one pinned season (see GAP).
4. No-groups copy (above) instead of the student `No active season`.
5. Events include ALUMNI_ONLY (server-side, `eventVisibilityFilter`). Nothing to do client-side.
6. Session press → `/session/[id]` (same route; leader session detail is another batch-3 screen).
7. The student wrapper's extra `Nothing scheduled yet` empty state comes from inside v1 SeasonCalendar (l.104), so it applies to the leader too.

### c) Data mapping
| v1 element | v2 source |
|---|---|
| no-groups gate | `scopes.groupLeaderIds.length === 0` ✓ (existing `leadsNothing`) |
| led season ids | `useMyGroups(true)` → unique `seasonId`s ✓ (GET `/api/v1/groups`), or the server's LEADER scope in GET `/sessions` |
| allSessions (unbounded union, sorted) | **GAP**: GET `/api/v1/sessions` is 8-week windowed / 120-day capped. Options: (a) implement the D-16.7 parity amendment (no bounds → every session of the scoped seasons; nullable from/to; `todayDayKey`) and call `useSessionRange({seasonId:null,from:null,to:null})`; (b) `useSeasonSessions(id)` per led season via `useQueries` (GET `/api/v1/seasons/{id}/sessions`, leader admitted by `canAccessSeason`; this is v1's N+1, which spec 03 R85/§7 set out to replace) |
| `{n} sessions` | union `.length` ✓ (needs the full list, so it depends on the GAP above) |
| jpcEvents | `useEvents()` ✓ (server window −30d/+365d, D-15.1; same gap note as the student) |
| today | `deviceTodayKey()` (as the student) or `todayDayKey` if (a) lands |
| initialAnchor | `initialAnchor(sessions, today)` month start, as the student ✓ |
| session link | `router.push({pathname:"/session/[id]"})` ✓ |

- V2-ONLY (current leader path, removed by the rebuild): season Legend, per-row season label, Earlier/Later window paging, staff attendance badges on rows, `ChoiceChips`.
- Behaviour to keep: the no-groups gate fetches nothing; events failure never fails the screen; org wall time (X13) rendered (agenda rail `8:00` / `PM`).

### d) Components
- Ported: `SeasonCalendar` (`src/design/sessions/season-calendar.tsx`, 347 l), `PageTitle`, `ShellFrame`, `EmptyState` (Calendar icon), `RouteSkeleton`/`RouteError`.
- Nothing to port. Add a `LeaderCalendar` branch in `calendar.tsx` before the `SUPER || LEADER` line; keep `MultiSeasonCalendar` for SUPER (batch 5).

### e) Tests — `src/__tests__/calendar-screen.test.tsx` (343 l)
- l.138-143 "renders the server's org time… (X13)" uses **LEADER** with a `range` response and expects `8:00 PM`. Behaviour (keep): org wall time. Will change: the mock (→ `/api/v1/groups` + `/api/v1/seasons/7/sessions`, or the unbounded `/sessions`) and the assertion (agenda rail splits into `8:00` / `PM`, as student test l.261-271).
- l.145-150 "tells a leader with no groups so, and fetches nothing (R84)". Behaviour (keep): `get` not called. Copy stays `You don't lead any groups yet.` (now the subtitle) and gains `No calendar` / `An admin will add you to a group when you're ready.`
- l.110-136 (SUPER window, Earlier/Later), l.225-248 (SUPER events window), l.322+ (SUPER Month): SUPER only, so they must stay green (MultiSeasonCalendar untouched).
- New: leader `{n} sessions` subtitle; ALUMNI_ONLY event row shows the lock for a leader; session press → `/session/[id]`.

---

## 4. /leader/more, /leader/settings, /leader/notifications (differences from the batch-2 student screens only)

### a) v1
- `app/leader/more/page.tsx` (11 l) → `MoreMenu` (`components/layout/more-menu.tsx`, 151 l). Items = `navFor(LEADER).sidebar` minus tabs (`lib/navigation.ts:79-95`): sidebar Dashboard, My Groups, Calendar, Submissions, Quizzes, Settings; tabs My Group, Calendar, Home(`/leader/dashboard`), Submissions, More. So **More lists exactly `Quizzes` (PenLine) and `Settings` (Settings icon)**. Identity card: initials, name, `Badge role="leader"` → `LEADER` (purple). Shot `leader/light/leader__more.png` confirms: Quizzes, Settings, Appearance, Sign out. Everything else identical to the student.
- `app/leader/settings/page.tsx` (6 l) → `SettingsPageBody` (`app/(settings)/settings-page.tsx`, 46 l) + `SettingsForm` (211 l). **No role branch.** The leader sees the same 5 rows as the student (`New assignments`, `Submission reviewed`, `Session rescheduled`, `Low-attendance flags` "When a student you lead/admin misses 3 in a row.", `Mentor follow-ups`). Shot `leader/light/leader__settings.png` matches the student layout exactly. Leader difference: none in v1.
- `app/leader/notifications/page.tsx` (6 l) → `NotificationsPageBody` (89 l), no role branch. Shot `leader/light/leader__notifications.png`: `0 unread of 1`, one card (title "A student in your group has 3 consecutive absences", outline badge `LOW ATTENDANCE FLAG`, body, mojibake timestamp). Leader difference: only the notification types (LOW_ATTENDANCE_FLAG etc.) and their links (`/leader/students/{id}`).

### b) v2 current
- `app/(app)/more.tsx` (32 l) + `src/design/layout/more-menu.tsx` (146 l): already v1-styled (batch 2), items from shared `navFor` (`packages/shared/src/navigation.ts:101-119`). LEADER sidebar there: Dashboard, My Groups, **My notes**, Calendar, Submissions, Quizzes, **Notifications**, Settings. Tabs are the same as v1. So v2 More for a leader = **My notes, Quizzes, Notifications, Settings** (in that order).
- `app/(app)/settings.tsx` (192 l) + `src/components/NotificationPreferences.tsx` (158 l): zero role branches (spec 18 R3). A leader sees 6 rows: New assignments, Submission reviewed, Session rescheduled, **Quiz graded**, Low-attendance flags (**"…misses two in a row."**), Mentor follow-ups; plus Push notifications and Security sections (B2-6).
- `app/(app)/notifications.tsx` (137 l): role-agnostic; `{unread} unread` (B2-7); type badge `item.type.replace(/_/g," ")` ✓; tap → `routeForTarget(item.target)` (`src/lib/notification-route.ts`, 44 l, maps v1's `/(admin|leader)/students/:id` to `/student/[id]`). Error → `RouteError`, which reads **"let your leader know"** for a leader.

### c) Data mapping / differences
| Leader difference | v1 | v2 | Flag |
|---|---|---|---|
| More rows | Quizzes, Settings | My notes, Quizzes, Notifications, Settings | V2-ONLY `My notes` (spec 09 D14: nav must list notes) and `Notifications` (same reason as student B2-5). Precedent B2-5 says keep. Confirm for leader |
| Role badge | `LEADER` purple (`role="leader"`) | `ROLE_COLOR[LEADER]` ✓ | — |
| Settings rows | 5 (incl. Low-attendance "3 in a row") | 6 (+ Quiz graded; "two in a row") | Per B2-6 (spec 18 D12, R56/R57). For a leader "Quiz graded" can never fire; spec 18 D4 says show all six to staff, so no conflict |
| Low-attendance copy | "misses 3 in a row" | "misses two in a row" | B2-6 / spec 18 D12. Matters most for leaders (the flag's audience) |
| Notifications header | `{unread} unread of {total}` | `{unread} unread` | B2-7 data gap (same as student) |
| Notifications error copy | (page error = leader error.tsx) "let an admin know" | `RouteError` "let your leader know" | GAP: see §5 |

### d) Components
- All ported in batch 2 (`MoreMenu`, `Section`, `NotificationPreferences`, `PageHeader`, notification `Card`). Nothing new.

### e) Tests
- `more-screen.test.tsx` (82 l): student l.27-38, account card l.40-50, admin/alumnus l.52-63, navigate l.65-72, sign out l.74-80. All behaviour/copy for other roles, unaffected. **No leader case.** Add one asserting `My notes`, `Quizzes`, `Notifications`, `Settings` present and `My Group`/`Submissions`/`Calendar` absent, plus the `LEADER` badge.
- `more-menu.test.tsx` (33 l): component-level, unaffected.
- `settings-screen.test.tsx` (171 l) l.58-82 `it.each` includes LEADER ("same sections for every role"). Unaffected; keep.
- `notifications-screen.test.tsx` (153 l), `notification-preferences.test.tsx` (96 l), `notification-route.test.ts`: role-agnostic; unaffected unless `RouteError` gains a role-dependent phrase (then add a leader case asserting "let an admin know").

---

## 5. Leader route skeleton and error (`layout.tsx`, `loading.tsx`, `error.tsx`, `template.tsx`)

### a) v1
- `layout.tsx` (13 l): navy-50 wrapper, identical classes to the student layout (see header).
- `loading.tsx` (16 l): identical to `app/student/loading.tsx`.
- `error.tsx` (23 l): identical structure. Description is `We couldn't load this page. Please try again — if it keeps happening, let an admin know.` (student: `…let your leader know.`). Title `Something went wrong`, icon `AlertTriangle`, `Button` `Try again`.
- `template.tsx` (5 l): `RouteTransition`.
- md: `md:gap-4` (loading), layout `md:*` paddings: dropped.

### b) v2 current — `src/design/layout/route-states.tsx` (36 l)
- `RouteSkeleton()`: `View.flex-col gap-3` > `Skeleton.h-32 rounded-2xl` · `View.flex-row gap-3` > 3× `Skeleton.h-24 flex-1 rounded-2xl` · 2× `SkeletonCard`; a11y "Loading". **Reusable as is for leader.**
- `RouteError({ onRetry })`: hardcoded student copy. Used by screens a leader also reaches: `notifications.tsx`, `session/[id]/index.tsx`, `quizzes.tsx`, `quiz/[id]/index.tsx`, `assignments.tsx`, `assignment/[id]/index.tsx`, `calendar.tsx` (student path only today).

### c) Mapping
| v1 | v2 |
|---|---|
| leader skeleton | `RouteSkeleton` ✓ (no change) |
| leader error copy "let an admin know" | **GAP**: add a prop (e.g. `RouteError contact="admin"|"leader"`, or derive from `useSessionStore` role: STUDENT → "your leader", staff → "an admin"). Keep the student default so batch-2 screens/tests are untouched. Role-derived is simplest for shared screens (notifications, session detail, quizzes) |
| `ShellFrame` navy-50 | ✓ already |
| RouteTransition | not ported (gaps-foundations) |

### d) Components
- Ported: `RouteSkeleton`, `RouteError`, `EmptyState`, `Button`, `Skeleton`, `SkeletonCard`. Only change: the error phrase variant.

### e) Tests — `src/__tests__/batch2-shared.test.tsx` (136 l) l.51-65 "route states"
- Behaviour (keep): `Loading` label, `Something went wrong`, `Try again` → onRetry once. If a role-derived phrase is added, add an assertion for each phrase (student → "let your leader know", leader/admin → "let an admin know").

---

## Domain-decision conflicts with v1 on these screens (need rulings)

| Item | Screen | v1 | Decision | Note |
|---|---|---|---|---|
| spec 19 **D2** (needs ruling) | Dashboard | 70/85 colour tiers on ring and rows; red callout "Students below 70% attendance" | Tiers dropped, neutral; callout = `isAtRisk` preview (60, component-wise) | Owner "UI matches v1 exactly" vs D2. Data for v1's tier colours is available (pct), the rule isn't |
| spec 19 **D4** | Dashboard | per-student `{n} pending` badge | Removed; "N of M submitted" from engagement | No v2 field for v1's number (deliberately) |
| spec 19 **D5** | Dashboard | null pct counted as 0 → red `0%` on day one | `—` when no one has had a session | Only visible early in a season |
| spec 19 **D6** (needs ruling) | Dashboard | full "Your students" roster, unpaged | at-risk preview + View all | Roster is possible via GET `/seasons/:id/engagement` (needs a hook) |
| spec 19 **D7** | Dashboard | `groups[0].name` | all led groups joined | Copy-only difference in the hero title |
| spec 19 **D12** | Dashboard | `Week N of M`, `Week N/M` | `Session N of M` | Batch-2 precedent B2-8 adopted D12 |
| spec 19 **D13** | Dashboard | `Watch recording` on future session | `Join stream` only while in progress; `Happening now` | B2-8 precedent |
| spec 19 **D19/R10** | Dashboard | events card absent when empty (as in the shot) | empty state shown | B2-9 precedent; visible diff in the leader shot |
| spec 05 **§9 LEADER** (R85) | Groups | archived-season groups mixed, name order | "must be visually separated" | Conflicts with v1-exact; v2 doesn't do it either today |
| Plan 06 **D-16.7** parity amendment (2026-10-09) | Calendar | unbounded union of led seasons' sessions | amendment says unbounded; **backend still 8 weeks / 120 days** | Implement it, or use the per-season N+1 (conflicts with spec 03 R85/§7) |
| spec 18 **D12** / R56-57 | Settings | 5 rows, "3 in a row" | 6 rows, "two in a row" | Already ruled B2-6 |
| spec 09 **D14** | More | Quizzes, Settings | + My notes, Notifications | B2-5 precedent |
