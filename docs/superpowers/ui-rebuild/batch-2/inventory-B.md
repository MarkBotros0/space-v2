# Inventory B — student role (dashboard, season, history, attendance)

v1 root = `/home/mark/projects/JPC/.v1-reference/app/src` · v2 root = `/home/mark/projects/JPC/space-v2/apps/mobile` · shared = `/home/mark/projects/JPC/space-v2/packages/shared/src`

Common to all four (v1):
- Page sits inside shell `<main class="... px-4 pb-24 pt-4">` → v2 `src/design/layout/shell-frame.tsx` (`ShellFrame`, ScrollView `px-4 pb-24 pt-4`, **no RefreshControl**). All four v2 screens currently use legacy `Screen` (src/ui) with `onRefresh`; pull-to-refresh is V2-ONLY and tested on dashboard — keep it (add RefreshControl to ShellFrame or a scroll prop).
- Route loading (v1 `app/student/loading.tsx`): `div.flex flex-col gap-3 md:gap-4` > `Skeleton.h-32 rounded-2xl` · `div.grid grid-cols-3 gap-3` > 3× `Skeleton.h-24 rounded-2xl` · `SkeletonCard` · `SkeletonCard`. (Same skeleton for every student route.) v2 uses `LoadingState` (src/ui). `Skeleton`, `SkeletonCard` are ported in `src/design/ui/skeleton.tsx`.
- Route error (v1 `app/student/error.tsx`): `EmptyState icon=AlertTriangle title="Something went wrong" description="We couldn't load this page. Please try again — if it keeps happening, let your leader know." action=<Button>Try again</Button>`. v2 uses per-query `ErrorState` with its own copy (V2-ONLY copy; behaviour keep: retry → refetch).
- `app/student/template.tsx` → `RouteTransition` (route fade; motion, not layout).
- Card idiom used everywhere: `rounded-2xl border border-border bg-card p-4|p-5 shadow-[var(--shadow-soft)]` → design `Card` (`src/design/ui/card.tsx`, gives `rounded-2xl border border-border bg-card` + shadowStyle("soft"); add `p-4`/`p-5` via className).
- Eyebrow idiom: `text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70` (or `text-brand-teal-700 dark:text-brand-teal-300`).
- H1 idiom: `text-2xl font-black text-brand-navy-900 dark:text-foreground`.
- All text via `src/design/ui/text.tsx`; Badge needs `self-start` where v1 places it as a block.

---

## 1. /student/dashboard

### a) v1
Files: `app/student/dashboard/page.tsx` (296 l), `components/students/stat-card.tsx` (76 l), `components/events/upcoming-events-card.tsx` (65 l), `components/motion/stagger-reveal.tsx` (28 l), ui: badge, progress-ring, empty-state.

Render tree:
- `StaggerReveal className="flex flex-col gap-3 md:gap-4"` (framer: each child wrapped in motion.div, fadeUp opacity 0→1, y 8→0, 0.24s, stagger 0.06s, delay 0.02s). Observed spacing in shot: each falsy slot (`{!season && …}` = false, `<UpcomingEventsCard>` returning null) still occupies a flex slot → **extra 12px**: greeting→hero ≈24px, next-session→due-soon ≈24px when no events; all other card gaps 12px. Decide whether to replicate (pixel match) — recommend replicate via spacer or explicit `mt-3`.
  - Greeting `div`
    - `h1.text-2xl font-black text-brand-navy-900 dark:text-foreground` → `Hi, {firstName} 👋` (firstName = first space token of name, else `there`)
    - `p.mt-1 text-sm text-muted-foreground` →
      - season && pending>0: `` `${n} assignment needs your attention.` `` (n=1) / `` `${n} assignments need your attention.` ``
      - season && pending=0: `You're all caught up this week.`
      - no season: `Welcome to JPC Space`
  - **No season branch** (`!season`):
    - `EmptyState icon=Sparkles title="Not enrolled yet" description="Contact your leader or admin to be enrolled in a season."`
    - `div.rounded-2xl bg-brand-teal-100 p-4 ring-1 ring-brand-teal-200 dark:bg-brand-teal-950 dark:ring-brand-teal-900`
      - `p.text-[10px] font-bold uppercase tracking-widest text-brand-teal-700 dark:text-brand-teal-300` → `While you wait`
      - `Link href=/student/profile .mt-1 block text-sm font-bold text-brand-teal-900 hover:underline dark:text-brand-teal-100` → `Complete your profile →`
  - **Active season branch**:
    - Hero `div.rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]` > `div.flex items-center gap-5`
      - `ProgressRing value={progressPct} label="Season {pct}% complete"` (default size 104, stroke 9, teal indicator)
        - `span.text-2xl font-black text-brand-navy-900 dark:text-foreground` → `{pct}%`
        - `span.mt-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70` → `done`
      - `div.min-w-0 flex-1`
        - `p.text-[10px] font-bold uppercase tracking-widest text-brand-teal-700 dark:text-brand-teal-300` → `Current season`
        - `p.mt-1 truncate text-lg font-black text-brand-navy-900 dark:text-foreground` → `{season.title}`
        - `p.text-xs text-muted-foreground` → `Week {done} of {total}` + (pct>=100 ? ` · complete` : ` · {left} week|weeks to go`) — "weeks" = session counts (sessions held = startsAt<=now / total sessions). pct=0 when total=0 (renders `0%`, `Week 0 of 0 · 0 weeks to go`).
    - Stat row `div.grid grid-cols-3 gap-3` (3 equal columns at 375px)
      - `StatCard label="Absence budget" value="{100-budgetPct}%"|"—" sublabel="this season" href=/student/attendance` (variant white)
      - `StatCard label="Streak" value=` streak>0 ? `span.flex items-center gap-1` > `Flame.size-6 text-warning-500` + `{streak}` : `{streak}` (no sublabel, no href)
      - `StatCard label="Assignments" value={pending} sublabel="pending" href=/student/assignments variant={pending>0?"teal":"white"}`
    - `lateCount>0`: `div.rounded-2xl bg-warning-50 p-3 ring-1 ring-warning-200 dark:bg-warning-950 dark:ring-warning-900` > `p.flex items-center gap-1.5 text-xs font-bold text-warning-800 dark:text-warning-200` > `AlertTriangle.size-3.5 shrink-0` + `{n} assignment{n!==1?"s":""} submitted late this season`
    - Next session card `div.rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-soft)]`
      - eyebrow muted → `Next session`
      - has next: `div.mt-2 flex flex-col gap-2`
        - `div.flex items-start gap-3`
          - dot `span.mt-1 size-2 shrink-0 rounded-full bg-brand-teal-500`
          - `div` > `Link href=/student/sessions/{id} .text-sm font-bold text-brand-navy-900 hover:underline dark:text-foreground` → title
            - `p.text-xs text-muted-foreground` → `format(startsAt,"EEE, MMM d · h:mm a")` + ` · {durationMinutes} min` + (location ? ` · {location}` : "") — e.g. `Sun, Mar 1 · 8:00 PM · 90 min · Hall`
            - `Badge variant="teal" className="mt-1.5 text-[10px]"` → `formatDistanceToNowStrict(startsAt,{addSuffix:true})` e.g. `in 3 days`
        - youtubeUrl: `a target=_blank .flex items-center justify-center gap-1.5 rounded-lg bg-brand-teal-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-brand-teal-700` → `Watch recording`
      - none: `p.mt-2 text-sm italic text-muted-foreground` → `No upcoming sessions.`
    - `UpcomingEventsCard` (returns **null** when 0 events):
      - `div.rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-soft)]`
        - eyebrow muted → `Upcoming events`
        - `ul.mt-2 flex flex-col gap-2.5` > per event (≤4, end-or-start >= today) `li` > (url ? `a.block hover:opacity-80` external : plain) > `div.flex items-start gap-3`
          - `CalendarDays.mt-0.5 size-4 shrink-0 text-brand-teal-500`
          - `div.min-w-0` > `p.truncate text-sm font-bold text-brand-navy-900 dark:text-foreground` title; `p.text-xs text-muted-foreground` whenLabel: one = `MMM d · h:mm a` if timed else `MMM d` (no year); range different day = `{one(start)} – {one(end)}` (each side its own time); same day → one(start).
        - Student: alumni-only events excluded; scoped to viewer seasons.
    - Due soon (pending>0): card `p-4`
      - `div.flex items-center justify-between` > eyebrow muted `Due soon` · `Link href=/student/assignments .text-xs font-semibold text-brand-teal-700 hover:underline dark:text-brand-teal-300` → `See all`
      - `ul.mt-2 flex flex-col divide-y divide-border` > first 3 pending (status PENDING|DRAFT, list order) `li.flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0`
        - `Link href=/student/assignments/{id} .flex-1 truncate text-sm font-semibold text-brand-navy-900 hover:underline dark:text-foreground` title
        - dueAt: `Badge variant={isPast?"error":"warning"} className="shrink-0 text-[10px]"` → past `Due {MMM d}` (e.g. `Due Mar 13`) / future `Due in {formatDistanceToNowStrict}` (e.g. `Due in 3 days`); no dueAt → no badge.

StatCard (`components/students/stat-card.tsx`):
- container (Link if href else div): `flex h-full flex-col items-center justify-center gap-1 rounded-2xl p-4 text-center` + href `transition-opacity hover:opacity-80` + variant:
  - white `border border-border bg-card shadow-[var(--shadow-soft)]`
  - navy `bg-gradient-to-br from-brand-navy-900 to-brand-navy-700 shadow-[0_4px_20px_rgba(31,50,96,0.25)] dark:from-brand-navy-800 dark:to-brand-navy-600 dark:ring-1 dark:ring-white/10`
  - teal `bg-brand-teal-100 ring-1 ring-brand-teal-200 dark:bg-brand-teal-950 dark:ring-brand-teal-900`
- value `p.flex items-center justify-center gap-1 text-3xl font-black leading-none` + white `text-brand-navy-900 dark:text-foreground` / navy `text-white` / teal `text-brand-teal-900 dark:text-brand-teal-100`
- label `p.text-[10px] font-bold uppercase tracking-widest` + white `text-muted-foreground/70` / navy `text-brand-teal-300` / teal `text-brand-teal-700 dark:text-brand-teal-300`
- sublabel `p.text-[10px]` + white `text-muted-foreground/70` / navy `text-white/40` / teal `text-brand-teal-600 dark:text-brand-teal-400`
- Shot: "ABSENCE BUDGET" wraps to 2 lines in a 1/3 column; tiles are equal height (h-full / grid stretch).

md:/lg: only: `md:gap-4` (dropped). Nothing else.

### b) v2 current
- `app/(app)/dashboard.tsx`: reads `useSessionStore` role + `scopes.graduationYear`; `dashboardBranchFor` → `StudentDashboard` for STUDENT. Null role → `DashboardFrame` + `LoadingState` (src/ui). Dispatcher is shared by all roles — keep untouched except the LoadingState import.
- `src/components/dashboard/StudentDashboard.tsx` (213 l):
  - Hooks (keep): `useStudentDashboard(activeSeasonId)` → key `queryKeys.dashboard.me(activeSeasonId)`, GET `/api/v1/me/dashboard`, parse `studentDashboardSchema`, stale 60s; `useMyAttendance(activeSeasonId)` → `queryKeys.me.attendance(seasonId)`, GET `/api/v1/me/attendance`, enabled seasonId!==null (shared with /attendance); `useUpcomingEvents(UPCOMING_EVENTS_LIMIT=4)` → `queryKeys.events.upcoming(4)`, GET `/api/v1/events?upcoming=true&limit=4`.
  - refresh(): refetch dash, attendance (guarded by activeSeasonId), events; `refreshing` = any isRefetching.
  - Navigation: `router.push("/profile")`, `"/attendance"`, `"/assignments"`, `{pathname:"/session/[id]"}`, `{pathname:"/assignment/[id]"}`, `Linking.openURL(youtubeUrl)`.
  - Renders: Text title `Welcome back, {first}`; subtitle (no trailing period; `You're all caught up`); pending → LoadingState; error → `ErrorState "Couldn't load your dashboard."`; not enrolled → `EmptyState` + Button `Complete your profile`; progress Card (`Session X of Y · …`, `No sessions scheduled yet` when pct null); attendance error → ErrorState; TileRow of `Absence budget left`/`Streak` (caption `sessions in a row`); TileRow `To do` (caption `{overdue} overdue`, tone warning); late Card `You submitted N assignment(s) late this season.`; next-session Card (`Happening now`/`Next session`, `formatDayKey · formatWallTime · location`, `Join stream` only when isInProgress); Due soon Card (labels `Overdue · was due {Mmm d, yyyy}` / `Due {Mmm d, yyyy}` / `No due date`); always `UpcomingEventsCard` at bottom (after due soon — v1 places it before due soon).
  - Old-UI imports: `../../theme` (useTheme), `../../ui` (Button, Card, EmptyState, ErrorState, LoadingState, Text).
- `DashboardFrame.tsx` (25 l): wraps legacy `Screen edges=[top,left,right] onRefresh refreshing`. **Shared by all 6 branches.**
- `StatTile.tsx` (69 l): `StatTile` + `TileRow`, legacy Card/Text/theme; a11y label `"{label}: {value}"`. **Shared**: Super (4 tiles), SeasonStaff (3), Student. (Mentor/Alumni don't use it.)
- `UpcomingEventsCard.tsx` (53 l): takes `query` prop; loading/error/EmptyState("No upcoming events"/"Nothing is scheduled from today onwards."); rows Pressable → url ? openURL : `router.push({pathname:"/event/[id]"})`; when = `formatEventWhen` (`MMM d, yyyy[ – MMM d, yyyy] · h:mm a`). **Shared by all 6 dashboards** (Student, Alumni, Mentor, Super, SeasonStaff×2).

### c) Data mapping
| v1 element | v2 source |
|---|---|
| firstName | `useSessionStore user.name` → `firstName()` (src/lib/format) ✓ |
| subtitle pending count | `dash.data.assignments.outstandingCount` ✓; "no season" = `data.season===null` ✓ |
| season.title | `data.season.title` ✓ |
| progressPct / weeksCompleted / weeksTotal | `data.progress.pct` / `sessionsHeld` / `sessionsTotal` ✓ (pct **nullable** when 0 sessions; v1 shows 0%) |
| Absence budget value | `attendance.data.budget.remainingPct` ✓ (= v1 100−budgetPct); budget null → `—` |
| Streak | `attendance.data.streak` ✓ |
| Assignments pending | `data.assignments.outstandingCount` ✓ |
| lateCount | `data.assignments.lateSubmittedCount` ✓ |
| nextSession title/id/duration/location/youtubeUrl | `data.nextSession.*` ✓ |
| next date `EEE, MMM d · h:mm a` | `nextSession.dayKey` → `formatWeekdayDay` ("EEE, MMM d") + `formatWallTime(time)` ✓ (org time; no new helper needed) |
| relative badge `in 3 days` | `nextSession.startsAt` + `formatTimeAgo`-style `formatDistanceToNowStrict(addSuffix)` ✓ (relative labels allowed, D23) |
| Due soon rows (≤3) | `data.assignments.dueSoon[]` (id, title, dueAt, isOverdue, dueOrgDay) ✓ |
| Due badge past/future | past = `isOverdue` (server) ; `Due {MMM d}` from `dueOrgDay` (format "MMM d" — no helper exists, add one); `Due in {X}` from `dueAt` via formatDistanceToNowStrict ✓ |
| Events rows | `events.data.events[]` (title, url, dayKey, endDayKey, time) ✓; v1 `MMM d · h:mm a` (no year, time on each side of a range) ≠ `formatEventWhen` (with year) — need a v1-format helper (formatEventWhen is also used by other screens/tests; add new fn, don't change it) |

GAP / deviations:
- GAP(copy/ruling): `Week X of Y … weeks to go` — v2 renders `Session …` per ruling D12/R29; test asserts `Session 3 of 4 · 1 session to go`. Owner ruling "UI matches v1 exactly" vs D12 → needs decision (data is identical; copy only).
- GAP(copy/ruling): subtitle `You're all caught up this week.` — v2 dropped "this week" (R67) and the trailing periods.
- GAP(ruling): `Watch recording` button whenever youtubeUrl — v2 D13 shows `Join stream` only while `isInProgress` and labels `Happening now`. V2-ONLY behaviour, tested (keep unless owner overrides).
- V2-ONLY: separate `ErrorState` for attendance failure and for events failure (cards fail independently — tested); dashboard `ErrorState` + retry; pull-to-refresh.
- V2-ONLY: UpcomingEventsCard EmptyState when 0 events (v1 renders nothing) + loading/error states — tested in upcoming-events-card.test (R10). Changing it affects all 6 dashboards.
- V2-ONLY: non-url event row navigates to `/event/[id]` (v1 not pressable).
- V2-ONLY: `To do` tile caption `{overdueCount} overdue`; separate `TileRow` (2+1 tiles) vs v1 single 3-col row.
- V2-ONLY: progress `pct===null` → `No sessions scheduled yet`; `progress` null → card hidden (v1 always shows hero with 0%).
- Ordering: v1 events card is **before** Due soon; v2 after and outside the season branch (also shown when not enrolled; v1 not-enrolled branch shows no events card).
- Not-enrolled: v1 EmptyState description `Contact your leader or admin to be enrolled in a season.` + teal `While you wait / Complete your profile →` link box; v2 different copy + Button.

### d) Components
- Ported (src/design/ui): `Card`, `Badge` (variants teal/error/warning; `textClassName="text-[10px]"`), `ProgressRing` (size 104/stroke 9 defaults; children absolutely centred), `EmptyState` (icon prop LucideIcon), `Text`, `Skeleton`/`SkeletonCard`. Icons from `lucide-react-native`: Sparkles, Flame, AlertTriangle, CalendarDays.
- Needs port (non-ui v1):
  - `components/students/stat-card.tsx` (76 l) → replace `src/components/dashboard/StatTile.tsx` (or new `src/design/students/stat-card.tsx`). navy variant needs expo-linear-gradient (used by Super/Staff dashboards in v1). Keep a11y label `"{label}: {value}"` for tests of other roles, or update them.
  - `components/events/upcoming-events-card.tsx` (65 l) → rewrite `src/components/dashboard/UpcomingEventsCard.tsx` markup (keep `query` prop + behaviours).
  - `components/motion/stagger-reveal.tsx` (28 l) → optional; reanimated 4.1 present (`FadeInUp`/entering with delay idx*60ms). Can drop.
  - Not-enrolled teal box, hero, next-session, due-soon are inline in page.tsx (no component).

### e) Tests
- `src/__tests__/dashboard.test.tsx` (572 l), STUDENT block l.254-393:
  - Behaviour (keep): requested-endpoint set (only /me/dashboard, /me/attendance, events); not-enrolled skips /me/attendance; press budget tile → push `/attendance`; press due row → push `/assignment/[id]` id "42"; no stream for non-running session (D13); events failure independent of budget tile; dashboard ErrorState retry → refetch; pull-to-refresh refetches all three (uses `UNSAFE_getByType(ScrollView).props.refreshControl` — ShellFrame/Frame must keep a RefreshControl on a ScrollView); `Complete your profile` press → `/profile`; no own notification bell (l.564).
  - Markup/copy (will change): `Welcome back, Sara`, `2 assignments need your attention` (→ `.` suffix), `Session 3 of 4 · 1 session to go`, labels `Absence budget left: 42%` / `Streak: 2` / `To do: 2` (→ `Absence budget: 42%`, `Assignments: 2`), `You submitted 1 assignment late this season.`, `Happening now`, `Mar 1, 2099 · 6:00 PM · Hall` (→ `Sun, Mar 1 · 6:00 PM · N min · Hall`), `Overdue · was due Jan 5, 2020` (→ `Due Jan 5`), `Due Jun 1, 2099` (→ `Due in …`), a11y `New essay, Due Jun 1, 2099`, `Not enrolled yet` (same), `Welcome to JPC Space` (same), `Join stream`.
  - ALUMNI/ADMIN/LEADER/MENTOR/SUPER blocks touch shared StatTile labels (`Quizzes pending: 2`, `Pending review: 1`, `Students (not graduated): 40`, `Alumni: 12`, `Seasons: 1`, `Upcoming events: 9`) and `Open day` from the events card — if StatTile/UpcomingEventsCard change, those must keep passing.
- `src/__tests__/upcoming-events-card.test.tsx` (78 l): keep endpoint `/api/v1/events?upcoming=true&limit=4`, url→openURL, non-url→`/event/[id]`, error retry; copy `Mar 5, 2099 · 6:30 PM` and a11y `Open day, Mar 5, 2099 · 6:30 PM` change if v1 format (`Mar 5 · 6:30 PM`) adopted; `No upcoming events` EmptyState conflicts with v1 (null).
- `use-dashboard.test.tsx`, `dashboard-branch.test.ts`, `dashboard-invalidation.test.ts`: hook/logic only — unaffected.

---

## 2. /student/season

### a) v1
File: `app/student/season/page.tsx` (288 l). ui: Badge, Button, Progress, EmptyState. Icons: CalendarDays, MapPin, Users. No StaggerReveal.

- no activeSeasonId: `div.flex flex-col gap-3 md:gap-4` > `h1` (H1 idiom) `Current season` + `EmptyState icon=Users title="No active season" description="An admin will enroll you when you're ready."`
- season row missing: H1 `Current season` + `p.text-sm text-muted-foreground` `Season not found.`
- Main `div.flex flex-col gap-3 md:gap-4` (no page H1 — the hero h1 is the title):
  - Hero card `rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]`
    - `div.flex flex-wrap items-start justify-between gap-2`
      - `div.min-w-0`
        - eyebrow teal `Current season`
        - `h1.mt-1 text-2xl font-black text-brand-navy-900 dark:text-foreground` → title
        - `p.mt-1 flex items-center gap-1.5 text-sm text-muted-foreground` > `CalendarDays.size-3.5 shrink-0` + `{MMM d, yyyy} – {MMM d, yyyy}` (en dash, spaces) e.g. `Feb 1, 2026 – May 31, 2026`
      - `div.flex shrink-0 flex-wrap justify-end gap-1.5` > `Badge variant="teal"` → raw enum `{season.status}` (e.g. `COMPLETED`, uppercase as stored) · group && `Badge variant="outline"` → group.name. At 375 the badges wrap under the title (left-aligned in shot).
    - weeksTotal>0: `div.mt-4` > `div.flex items-center justify-between text-xs` > `span.font-semibold text-brand-navy-900 dark:text-foreground` `Week {done} of {total}` · `span.text-muted-foreground` → pct>=100 `Complete` else `{total-done} to go`; `Progress value={pct} className="mt-1.5"`
  - group: card `rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-soft)] md:p-5`
    - `div.mb-3 flex items-center gap-2` > `span.flex size-7 items-center justify-center rounded-lg bg-brand-navy-100 text-brand-navy-800 dark:bg-brand-navy-900 dark:text-brand-navy-100` > `Users.size-4` · `div` > eyebrow muted `Your group` + `p.text-sm font-bold text-brand-navy-900 dark:text-foreground` group.name
    - description: `p.mb-4 text-sm text-muted-foreground`
    - `p.mb-2 text-xs font-bold text-brand-navy-900 dark:text-foreground` → `Leader` (1) / `Leaders`
    - 0 leaders: `p.text-sm italic text-muted-foreground` `No leaders assigned yet.`
    - else `ul.flex flex-col gap-2.5` > `li.flex items-center gap-3`
      - `span.flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-navy-100 text-xs font-bold text-brand-navy-800 dark:bg-brand-navy-900 dark:text-brand-navy-100` initials (fallback first letter of email)
      - `div.min-w-0 flex-1` > `p.truncate text-sm font-semibold text-brand-navy-900 dark:text-foreground` name ?? email · name && `a href=mailto:{email} .truncate text-xs text-muted-foreground hover:text-brand-teal-700 hover:underline dark:hover:text-brand-teal-300` email
    - `p.mb-2 mt-4 text-xs font-bold text-brand-navy-900 dark:text-foreground` `Members` + `span.ml-1 font-normal text-muted-foreground` `({n})`
    - `ul.flex flex-wrap gap-1.5` > `li.inline-flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 text-xs` + isYou `bg-brand-teal-100 text-brand-teal-800 ring-1 ring-brand-teal-300 dark:bg-brand-teal-950 dark:text-brand-teal-200 dark:ring-brand-teal-900` else `bg-muted/60 text-foreground`
      - `span.flex size-6 items-center justify-center rounded-full bg-card text-[10px] font-bold text-brand-navy-800 dark:text-brand-navy-100` initials (fallback `?`)
      - `span.max-w-32 truncate font-medium` → `You` | name ?? `—`
  - description: card `p-4 … md:p-5` > `p.mb-2` eyebrow muted `About this season` + `p.text-sm text-foreground/90` description
  - Upcoming card `p-4 … md:p-5`
    - `div.mb-3 flex items-center justify-between` > eyebrow muted `Upcoming sessions` · `Button variant="ghost" size="sm" render=<Link href=/student/calendar> className="text-xs text-brand-teal-700 dark:text-brand-teal-300"` `See calendar`
    - none: `p.text-sm italic text-muted-foreground` `No upcoming sessions.`
    - `ul.flex flex-col gap-3` > (≤3) `li.flex items-center gap-3`
      - date tile `div.flex size-11 shrink-0 flex-col items-center justify-center rounded-lg bg-brand-teal-100 text-brand-teal-800 dark:bg-brand-teal-950 dark:text-brand-teal-200` > `span.text-[9px] font-bold uppercase leading-none` `MMM` · `span.text-base font-black leading-tight` `d`
      - `div.min-w-0 flex-1` > `Link href=/student/sessions/{id} .truncate text-sm font-semibold text-brand-navy-900 hover:underline dark:text-foreground` title · `p.flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground` > `span` `EEE · h:mm a` + location && `span.inline-flex items-center gap-1` > `MapPin.size-3 shrink-0` + location
- md: only: `md:gap-4`, `md:p-5` (dropped).

### b) v2 current
- `app/(app)/season.tsx` (100 l): STUDENT → `StudentSeason`, else `StaffSeason` (out of scope; it imports legacy `Screen/Card/Text/Button/...` and `useTheme`). Keep dispatcher.
- `src/components/season/StudentSeason.tsx` (172 l): `useMySeason(seasonId)` → `queryKeys.me.season(seasonId)`, GET `/api/v1/me/season`, enabled seasonId!==null, parse `mySeasonResponseSchema` → `.season` (nullable). Pull-to-refresh guarded. Nav: `router.push("/calendar")`, `{pathname:"/session/[id]"}`. States: seasonId null / data null → EmptyState `No active season` (`An admin will enroll you when you're ready.`); pending LoadingState; error `Couldn't load your season.`. Renders hero (`Session X of Y`, status+group as text line), GroupCard, About card, UpcomingCard. Imports: `../../theme`, `../../ui` (Button, Card, EmptyState, ErrorState, LoadingState, Screen, Text), `formatDate/formatDayKey/formatSessionTime`, `initialsOf` (src/lib/initials — keep).

### c) Data mapping
| v1 | v2 (`MySeason`) |
|---|---|
| title, status, description | `title`, `status` (seasonStatusSchema enum, same raw value), `description` ✓ |
| startDate/endDate `MMM d, yyyy` | `startDate`/`endDate` ISO → `formatDate` ✓ (device-zone date of an instant — same as today) |
| weeksCompleted/Total/pct | `progress.completedSessions/totalSessions/pct` ✓ |
| group name/description | `group.name/description` ✓ |
| leaders name/email | `group.leaders[].name/email` ✓ (name non-null in v2 → `name ?? email` branch and "no mailto when no name" moot) |
| mailto link | `Linking.openURL("mailto:"+email)` — V2 has no link today (add) |
| members id/name/isYou | `group.members[].{id,name,isYou}` ✓ (v1 compares ids; v2 server flag) |
| upcoming id/title/location | `upcoming[].*` ✓ |
| date tile `MMM` / `d` | `upcoming[].dayKey` parse → format ✓ |
| `EEE · h:mm a` | **GAP**: no org wall time in `mySeasonUpcomingSessionSchema` (only `startsAt`, `dayKey`). Weekday from dayKey ✓; time only via `formatSessionTime(startsAt)` = device zone (what v2 does now). Add `time: wallTimeSchema` to schema+backend for X13 consistency, or accept device zone. |
| "Season not found." | V2 maps server `season:null` to `No active season` (tested, spec 02 D2) — V2-ONLY deviation, keep. |
- V2-ONLY: ErrorState on fetch failure; pull-to-refresh; LoadingState.
- Copy GAP/ruling: `Week X of Y` vs v2 `Session X of Y` (R29; test asserts `Session 3 of 7`).

### d) Components
- Ported: `Card`, `Badge` (teal, outline), `Progress` (`className="mt-1.5"`; v2 Progress wraps in `flex-col gap-1.5` — fine without label), `Button` (variant ghost size sm; Button has `textClassName` → `text-xs text-brand-teal-700 dark:text-brand-teal-300`), `EmptyState`, `Text`. Icons: CalendarDays, MapPin, Users.
- No non-ui v1 component to port (all inline). Avatar-like initials spans are inline (could reuse `src/design/ui/avatar.tsx` only if classes match — v1 uses raw spans, keep inline).

### e) Tests — `src/__tests__/student-season.test.tsx` (111 l)
- Behaviour (keep): GET `/api/v1/me/season` only (not `/seasons/7`, `/seasons`); press session → `/session/[id]` id "41"; press `See calendar` → `/calendar`; no group → no `Your group`; no request when no active season; server null → `No active season`; no `Save changes`.
- Copy that stays identical in v1: `GBV 2026`, `Your group`, `Group B1`, `Leader`, `Lina Leader`, `lina@jpc.test`, `You`, `Peer Person`, `The spring season.`, `Week 4` (session title), `No upcoming sessions.`, `No active season`, `4 to go`.
- Will change: `Session 3 of 7` (→ `Week 3 of 7` if v1 copy adopted); `Members (2)` — v1 renders `Members` + nested span `(2)` → in RN nested Text the getByText string becomes `Members(2)`/needs regex; `Group B1` will now appear twice (outline badge + group card) → `getByText` throws on duplicates → use `getAllByText`.

---

## 3. /student/history (also /alumni/history)

### a) v1
Files: `app/student/history/page.tsx` (30 l), `app/alumni/history/page.tsx` (25 l), `components/students/season-history.tsx` (70 l). ui: Badge, EmptyState. Icon: Sparkles.

- `div.flex flex-col gap-3 md:gap-4`
  - `div` > `h1` (H1 idiom) `History` (alumni: `My History`) + `p.mt-1 text-sm text-muted-foreground` `Seasons you've participated in` (alumni: `The seasons you journeyed through`)
  - `SeasonHistory rows emptyDescription`:
    - empty: `EmptyState icon=Sparkles title="No past seasons" description=` student `Once you complete a season, it'll appear here.` / alumni `Your completed seasons will appear here.`
    - `ol.flex flex-col gap-3` > `li` > card `rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-soft)]`
      - `div.flex flex-wrap items-start justify-between gap-2` (at 375 badges wrap under title, left)
        - `div` > `p.text-base font-bold text-brand-navy-900 dark:text-foreground` title · `p.text-xs text-muted-foreground` `{MMM d, yyyy} – {MMM d, yyyy}` + (groupName ? ` · {groupName}`) e.g. `Jun 1, 2025 – Sep 15, 2025 · Delta`
        - `div.flex flex-wrap gap-1.5` > `Badge variant="teal"` `{pct}% attended` · `Badge variant="success"` `Participated`
      - curriculum.length>0: `details.mt-3 text-sm` (collapsed by default; browser ▶/▼ disclosure marker, dark navy, see shot)
        - `summary.cursor-pointer font-semibold text-brand-navy-700 dark:text-brand-navy-200` `Curriculum ({n} sessions)` — **always "sessions"** even for n=1
        - `ol.mt-2 flex flex-col gap-1 text-muted-foreground` > `li.flex justify-between gap-3 border-t border-border pt-1 first:border-0 first:pt-0` > `span` title · `span.shrink-0 text-xs tabular-nums` `MMM d, yyyy`
- md: only `md:gap-4`.

### b) v2 current — `app/(app)/history.tsx` (104 l)
- Hooks: `useSessionStore` role, `scopes.graduationYear`, `scopes.activeSeasonId`; `useSeasonHistory(activeSeasonId, isStudent)` → `queryKeys.me.seasonHistory(activeSeasonId)`, GET `/api/v1/me/season-history`, parse `seasonHistoryResponseSchema` (strict rows) → `.seasons`. isAlumnus = STUDENT && graduationYear!==null → alumni copy (title/subtitle/empty).
- Renders: non-student → EmptyState `History` / `Season history is for students and alumni.` (V2-ONLY); title/subtitle; Loading/Error(`Couldn't load your history.`)/Empty; card per row with `{pct}% attended · Participated` as one text, Pressable toggle `Curriculum (n session|sessions)` with `accessibilityState.expanded`, rows title + `formatDayKey(dayKey)`.
- Old-UI imports: `../../src/theme`, `../../src/ui` (Card, EmptyState, ErrorState, LoadingState, Screen, Text).

### c) Data mapping
| v1 | v2 (`SeasonHistoryRow`) |
|---|---|
| title, groupName, attendancePct | ✓ |
| startDate/endDate | ✓ ISO → `formatDate` |
| curriculum title / date | `curriculum[].title`, `dayKey` → `formatDayKey` (= `MMM d, yyyy`) ✓; key `sessionId` |
| Participated | constant ✓ (R40) |
- No GAP. V2-ONLY: staff explanation screen, error state, pull-to-refresh, loading. Disclosure needs an icon (lucide `ChevronRight`/`Play`-like triangle; v1 is the native `<details>` marker ▶ rotating to ▼) — keep the Pressable + `accessibilityState.expanded`.
- Copy deviation: v2 pluralises `1 session`; v1 always `sessions`.

### d) Components
- Ported: `Card`, `Badge` (teal, success), `EmptyState` (Sparkles), `Text`.
- Needs port: `components/students/season-history.tsx` (70 l) → e.g. `src/design/students/season-history.tsx` (or inline in history.tsx); shared student+alumni.

### e) Tests — `src/__tests__/history-screen.test.tsx` (82 l)
- Behaviour (keep): GET `/api/v1/me/season-history`; curriculum collapsed until pressed; strict parse rejects feedback field → error; staff gets explanation and no fetch; alumni title/empty copy.
- Copy: `GBV 2025`, `History`, `/Group A1/`, `Opening night`, `Mar 2, 2025`, `No past seasons`, `My History`, `Your completed seasons will appear here.` — unchanged. Will change: `50% attended · Participated` (→ two badges `50% attended`, `Participated`); `Curriculum (1 session)` (→ `Curriculum (1 sessions)` per v1); `Couldn't load your history.` (V2-ONLY copy, may stay).

---

## 4. /student/attendance

### a) v1
File: `app/student/attendance/page.tsx` (202 l). ui: Badge, ProgressRing, EmptyState. Icon: Calendar.

- Header (both branches): `div` > `Link href=/student/dashboard .text-xs font-semibold text-brand-teal-700 hover:underline dark:text-brand-teal-300` `← Dashboard` · `h1.mt-2 text-2xl font-black text-brand-navy-900 dark:text-foreground` `Attendance`
- no season: `div.flex flex-col gap-3 md:gap-4` > header + `EmptyState icon=Calendar title="Not enrolled" description="Enroll in a season to track attendance."`
- Main `div.flex flex-col gap-3 md:gap-4`:
  - header
  - Budget hero card `p-5` > `div.flex items-center gap-5`
    - `ProgressRing value={budgetPct} label="Absence budget {pct}% used" indicatorClassName=` pct>=100 `stroke-[var(--color-error-500)]` / >=70 `stroke-[var(--color-warning-500)]` / default teal (v2 port rule → `stroke-error-500` / `stroke-warning-500`)
      - `span.text-2xl font-black text-brand-navy-900 dark:text-foreground` `{pct}%` · `span.mt-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70` `used`
    - `div.min-w-0 flex-1` > eyebrow teal `Absence budget` · `p.mt-1 text-lg font-black text-brand-navy-900 dark:text-foreground` `{minutesUsed} of {budgetMinutes} min` · season && `p.text-xs text-muted-foreground` `Absent = {absenceWeightMinutes} min · Late = actual minutes late`
    - budget null → pct 0, used 0, budgetMinutes = season.absenceBudgetMinutes ?? 180.
  - 0 past sessions: `EmptyState icon=Calendar title="No sessions yet" description="Past sessions will appear here."`
  - else card `rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)]` (no padding)
    - `p.px-4 pt-4` eyebrow muted `Session history`
    - `ul.mt-2 divide-y divide-border` > (newest first) `li.flex items-start gap-3 px-4 py-3 last:pb-4`
      - `div.mt-0.5 flex-1 min-w-0` > `p.truncate text-sm font-semibold text-brand-navy-900 dark:text-foreground` title · `p.text-xs text-muted-foreground/70` `EEE, MMM d, yyyy · h:mm a` (e.g. `Sun, Mar 8, 2026 · 8:00 PM`) · LATE & lateMinutes>0: `p.mt-0.5 text-xs text-warning-700 dark:text-warning-300` `{n} min late` · cost>0: `p.mt-0.5 text-xs text-error-600 dark:text-error-400` `−{n} min from budget` (U+2212 minus)
      - `div.shrink-0 pt-0.5` > statusBadge: null `Badge variant="outline"` `No record`; PRESENT `success` `Present`; LATE `warning` `Late`; ABSENT `error` `Absent`; EXCUSED etc → nothing.
- md: only `md:gap-4`.

### b) v2 current — `app/(app)/attendance.tsx` (125 l)
- Hooks: `useSessionStore` role + `scopes.activeSeasonId`; `seasonId = isStudent ? activeSeasonId : null`; `useMyAttendance(seasonId)` (same key as dashboard tile). Pull-to-refresh guarded.
- Renders: title `Attendance` (no back link); non-student `Not available` EmptyState (V2-ONLY); no season / `data.season===null` → `Not enrolled`; Loading; Error `Couldn't load your attendance.`; budget Card (`{pct}% used` text, `X of Y min`, rule line, `Streak: N session(s)` — V2-ONLY), `No sessions yet` EmptyState, Session history Card with rows (status as plain text label, date `formatDayKey(dayKey) · formatSessionTime(startsAt)`).
- Old-UI imports: `../../src/theme`, `../../src/ui` (Card, EmptyState, ErrorState, LoadingState, Screen, Text).
- Navigation: none today; v1 back link → `router.push("/dashboard")` or `router.back()` (add).

### c) Data mapping
| v1 | v2 (`MyAttendanceResponse`) |
|---|---|
| budgetPct / minutesUsed / budgetMinutes | `budget.budgetPct/minutesUsed/budgetMinutes` ✓ (budget nullable → fallback 0/0/`season.absenceBudgetMinutes`) |
| absenceWeightMinutes | `season.absenceWeightMinutes` ✓ |
| rows title/status | `sessions[].title/status` ✓ (key `sessionId`) |
| lateMinutes / cost | `sessions[].lateMinutes` / `costMinutes` ✓ (server-computed) |
| date `EEE, MMM d, yyyy · h:mm a` | `dayKey` → `format(parse(dayKey),"EEE, MMM d, yyyy")` (no helper; formatDayKey lacks weekday) + time: **GAP** — no org wall time in `myAttendanceSessionSchema`; only `formatSessionTime(startsAt)` (device zone, as today). |
- V2-ONLY: `Streak: N sessions` line (no v1 counterpart on this page — v1 shows streak only on dashboard); staff `Not available`; error/loading; pull-to-refresh.
- No GAP on status: `attendanceStatusSchema` = PRESENT|ABSENT|LATE (+ null = No record), same as v1.

### d) Components
- Ported: `Card`, `Badge` (outline/success/warning/error), `ProgressRing` (indicatorClassName `stroke-error-500`/`stroke-warning-500`), `EmptyState` (Calendar), `Text`. `src/design/ui/attendance-pill.tsx` exists but v1 page uses plain Badge — don't use it.
- No non-ui component to port. Do NOT use `src/design/layout/page-header.tsx` (it is `text-2xl font-semibold tracking-tight text-foreground` + pb-4, not these pages' `font-black text-brand-navy-900` h1). Applies to all four screens.

### e) Tests — `src/__tests__/my-attendance-screen.test.tsx` (80 l)
- Behaviour (keep): GET `/api/v1/me/attendance`; no-season → `Not enrolled` and no fetch; staff → `Not available` and no fetch; empty sessions → `No sessions yet`.
- Copy unchanged in v1: `105 of 180 min`, `Absent = 90 min · Late = actual minutes late`, `12 min late`, `−12 min from budget`, `−90 min from budget`, `Late`, `Absent`, `No record`, `/Mar 8, 2099/`.
- Will change: `58% used` (→ ring shows `58%` + `used` as separate Texts; a11y label `Absence budget 58% used` on ring → assert via `getByLabelText`); `Streak: 1 session` (V2-ONLY line, removed if v1-exact).
- Note `attendance-screen.test.tsx` is the staff session roster screen — not this one.
