# Inventory C — student: calendar, session detail, quizzes list, quiz runner

Paths: v1 = `/home/mark/projects/JPC/.v1-reference/app/src/`, v2 = `/home/mark/projects/JPC/space-v2/apps/mobile/`.
Shell (top bar + floating tab bar) is out of scope; all four v1 pages render inside v1's
`<main>` with no PageHeader component (they hand-roll their h1). **Note:** v2 `src/design/layout/page-header.tsx`
uses `text-2xl font-semibold tracking-tight text-foreground` — NOT v1's hand-rolled
`text-2xl font-black text-brand-navy-900 dark:text-foreground`; don't reuse PageHeader for these.
Card surface used everywhere in v1: `rounded-2xl border border-border bg-card … shadow-[var(--shadow-soft)]` → v2 `shadowStyle("soft")` from `src/design/lib/shadow` (as `design/ui/card.tsx` does).

---------------------------------------------------------------------------------------------------

## 1. /student/calendar

### a) v1
Files: `app/student/calendar/page.tsx` (44), `components/sessions/season-calendar.tsx` (494), `components/ui/empty-state.tsx`, `components/ui/button.tsx`.
Screenshot (light): `shots/student/light/student__calendar.png` = Upcoming tab, empty agenda ("Nothing coming up"). dialog-0..2 shots are shell menus, not calendar.

Render tree (page.tsx):
- `div.flex flex-col gap-3 md:gap-4` (md: → gap-3 on phone)
  - `h1.text-2xl font-black text-brand-navy-900 dark:text-foreground` — "Calendar"
  - **branch `!user.activeSeasonId`** → `EmptyState icon={Calendar} title="No active season" description="An admin will enroll you in a season when you're ready."` (nothing else; events NOT shown)
  - else `SeasonCalendar sessions={all sessions of active season, no window} jpcEvents={listJpcEvents({includeAlumniOnly:false})} sessionPathTemplate="/student/sessions/{id}"` (no seasonColors)

SeasonCalendar:
- **branch sessions.length===0 && jpcEvents.length===0** → `EmptyState icon={Calendar} title="Nothing scheduled yet" description="Sessions and events will appear here once they're added."` (replaces whole calendar incl. tabs)
- state: `view` default `"upcoming"`; `current` = startOfMonth(first session with !isPast||isToday) else startOfMonth(last session) else this month.
- `div.flex flex-col gap-4`
  - `div.flex flex-wrap items-center justify-between gap-3`
    - tablist `div[role=tablist][aria-label="Calendar view"].inline-flex rounded-xl border border-border bg-muted/40 p-0.5`
      - 3× `button[role=tab][aria-selected]` labels "Upcoming" / "Week" / "Month";
        base `cursor-pointer rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`;
        selected `bg-card text-foreground shadow-[var(--shadow-soft)]`; unselected `text-muted-foreground hover:text-foreground`
        (NOT the ui/tabs component — hand-rolled segmented control)
    - **only when view !== "upcoming"**: `div.flex items-center gap-1`
      - `Button variant="ghost" size="icon" aria-label="Previous week"|"Previous month"` → `ChevronLeft className="size-4"`
      - `span.min-w-32 text-center text-sm font-semibold text-foreground` — stepLabel: week `"MMM d – d"` (same month) or `"MMM d – MMM d"` (en dash, spaced); month `"MMMM yyyy"`
      - `Button variant="ghost" size="icon" aria-label="Next week"|"Next month"` → `ChevronRight className="size-4"`
  - season legend — SUPER only (seasonColors) — absent for student
  - **Upcoming → AgendaView**: entries = sessions with startsAt >= startOfDay(today) + events with date >= today, sorted by instant, grouped by `yyyy-MM-dd`.
    - **empty** → `EmptyState icon={Calendar} title="Nothing coming up" description="You're all caught up. Switch to Month to review past sessions."`
    - `div.flex flex-col gap-5` → per day `div.flex flex-col gap-2`
      - `div.flex items-baseline justify-between gap-2`
        - `p.text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70` — `format(date,"EEEE, MMMM d")` e.g. "Sunday, March 8" (rendered uppercase)
        - `p.text-[10px] font-medium text-brand-teal-700 dark:text-brand-teal-300` — "Today" or `in ${formatDistanceToNowStrict(date,{unit:"day"})}` → "in 1 day" / "in 5 days" (rounded instant distance, not calendar-day diff)
      - session → AgendaSession: `Link href=/student/sessions/{id}` `group flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-[var(--shadow-soft)] transition-colors hover:bg-accent`
        - TimeRail `div.flex w-12 shrink-0 flex-col items-center justify-center`
          - `span.text-sm font-bold leading-none text-foreground` — `format(startsAt,"h:mm")` e.g. "8:00"
          - `span.mt-0.5 text-[10px] uppercase text-muted-foreground` — `format(startsAt,"a")` → "PM"
        - `span.h-10 w-px shrink-0 bg-border` (divider)
        - `div.min-w-0 flex-1`
          - `p.truncate text-sm font-semibold text-brand-navy-900 dark:text-foreground` — title
          - `p.flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground`
            - `span` — "{durationMinutes} min"
            - if location: `span.inline-flex items-center gap-1` → `MapPin size-3 shrink-0` + location
            - seasonCode chip (SUPER only)
        - `ChevronRight size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5`
      - event → AgendaEvent: same card class (no `group`); `<a target=_blank href=url>` if url else `div`
        - `div.flex w-12 shrink-0 flex-col items-center justify-center text-muted-foreground` → `Calendar size-4`
        - divider `span.h-10 w-px shrink-0 bg-border`
        - `div.min-w-0 flex-1`
          - `p.flex items-center gap-1.5 truncate text-sm font-semibold text-brand-navy-900 dark:text-foreground` — `Lock size-3 shrink-0` if ALUMNI_ONLY (never for a student) + title
          - `p.text-xs text-muted-foreground` — "JPC event"
        - if url: `ExternalLink size-4 shrink-0 text-muted-foreground`
  - **Week / Month → CalendarGrid** (Mon-first)
    - `div.grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-border bg-border text-xs`
      - header cells ×7 `div.bg-card py-2 text-center font-medium text-muted-foreground` — "Mon".."Sun"
      - day cells `div.flex flex-col gap-0.5 bg-card p-1` + week `min-h-32` / month `min-h-[72px]` + out-of-month `opacity-40`
        - day number `span.flex size-6 items-center justify-center self-start rounded-full text-xs font-medium` + today `bg-brand-teal-500 text-brand-navy-950` else `text-foreground` — `format(day,"d")`
        - per session `Link.block truncate rounded px-1 py-0.5 font-medium leading-tight` + tone: today `bg-success-100 text-success-800 dark:bg-success-950 dark:text-success-200`; past `bg-muted text-muted-foreground`; upcoming `bg-brand-teal-100 text-brand-teal-800 dark:bg-brand-teal-950 dark:text-brand-teal-200` — title (truncated; ~45px wide at 375)
        - per event: `flex items-center gap-0.5 truncate rounded px-1 py-0.5 leading-tight` + `bg-brand-navy-100 text-brand-navy-800 dark:bg-brand-navy-900 dark:text-brand-navy-100` (ALUMNI_ONLY: warning-100/800, warning-950/200) → [Lock size-2.5] `span.truncate` title [+ `ExternalLink ml-auto size-2.5 shrink-0` when url, as `<a target=_blank>`]
    - Week and Month are the SAME grid (week = one row of 7, min-h-32). No tap-a-day list, no legend, no badges.

**Role-specific in v1** (component itself identical for all roles):
- page header: student/admin/leader all h1 "Calendar"; leader+admin add `p.mt-1 text-sm text-muted-foreground` "{n} session(s)"; super adds "All active seasons across JPC."; student has none.
- no-season empty: student "No active season"/"An admin will enroll you…"; leader no groups "No calendar"/"An admin will add you to a group when you're ready." + subtitle "You don't lead any groups yet."
- `sessionPathTemplate` (student → /student/sessions/{id}).
- `includeAlumniOnly`: student false, staff true.
- `seasonColors` (palette chips, legend, season chip in agenda): SUPER only. Leader with several seasons still gets tone colours.
- alumni have NO calendar in v1: `/alumni/calendar` is an "Events" page (`UpcomingEventsCard`), not SeasonCalendar.

### b) v2 current
`app/(app)/calendar.tsx` (345), `src/components/calendar/CalendarGrid.tsx` (172), `CalendarEntries.tsx` (185); libs `src/lib/calendar-grid.ts`, `src/lib/day-groups.ts`, `src/lib/format.ts`.
- Role router `CalendarScreen`: MENTOR → EmptyState; LEADER with no groups → "No calendar"/"You don't lead any groups yet."; SUPER/LEADER → `MultiSeasonCalendar` (range source, showSeason slots); ADMIN → `AdminCalendar` (`useStaffSeasonSelection(true)` + `SeasonSwitcher`); else (STUDENT, alumni-as-student) → `PinnedSeasonCalendar`.
- Student path hooks (KEEP): `useCurrentSeasonId()` (student → `scopes.activeSeasonId`, no fetch), `useSeasonSessions(seasonId)` → `GET /api/v1/seasons/:id/sessions`, key `queryKeys.sessions.bySeason(id)`, enabled on non-null; `useEvents()` → `GET /api/v1/events`, key `queryKeys.events.list()` (server window now−30d…now+365d; error swallowed to []). Pull-to-refresh refetches both.
- Navigation (KEEP): session → `router.push({pathname:"/session/[id]", params:{id}})`; event → `router.push({pathname:"/event/[id]", …})`.
- Renders: `Screen scroll`, `ChoiceChips label="Calendar view"` (Upcoming/Week/Month), stepper `Button title="‹"/"›" variant="ghost" accessibilityLabel={"Previous "+view}` + heading `rangeLabel`; Upcoming = `CalendarDays` (Legend chips + per-day `Text variant="heading"` formatDayKey "Mar 1, 2099" + cue Text) → `DayEntries` tinted `Card`s (title; "8:00 PM · Location"; badge chip "Today"/"Upcoming"/(staff)"Attendance marked|pending"; season chip if slots). Event card: "JPC event · 11:00 AM" / "JPC event · All day", chips "Alumni only", seasonCode. Week = stacked day rows (`formatWeekdayDay` "Sun, Mar 1", "Nothing scheduled"); Month = grid of dots (max 3, "+N") with tap-to-select-day list beneath (`minHeight 56`, selected teal-100 bg, a11y label "Mar 1, 2099, 1 scheduled").
- Student empty states: no season & no events "No season to show"/"You aren't in a season right now, so there are no sessions on your calendar."; no season but events → calendar of events only; zero sessions & events "No sessions"/"This season doesn't have any sessions yet."; loading `LoadingState`; errors "Couldn't load your seasons." / "Couldn't load sessions. Check your connection and try again."
- Old-UI imports: calendar.tsx → `src/ui` (Button, EmptyState, ErrorState, LoadingState, Screen, Text), `src/theme` (useTheme), `src/components/ChoiceChips`, `src/components/SeasonSwitcher`. CalendarGrid.tsx → `src/ui` Text, `src/theme`. CalendarEntries.tsx → `src/ui` Card, Text, `src/theme` (Theme type in tint helpers).
- **Role-specific in v2**: `ctx.isStaff` (badge "Attendance marked/pending"), `ctx.slots` (SUPER+LEADER season palette, legend, seasonTitle chip), range-window sources with Earlier/Later paging (staff Upcoming), Admin SeasonSwitcher, mentor/leader-no-groups states. Student: local source, no window, no slots, isStaff=false.

### c) Data mapping (student)
| v1 element | v2 source |
|---|---|
| no-season branch | `scopes.activeSeasonId === null` (`useCurrentSeasonId`) |
| sessions | `useSeasonSessions` → `SessionListItem[]` |
| events | `useEvents()` → `JpcEventListItem[]` (visibility filtered server-side: plain STUDENT never gets ALUMNI_ONLY — matches includeAlumniOnly:false) |
| day grouping key `yyyy-MM-dd` | `s.dayKey`, `e.dayKey` (`groupCalendarByDay`, `bucketByDay`) |
| agenda heading "EEEE, MMMM d" | from dayKey — needs new formatter (format.ts has only "MMM d, yyyy" / "EEE, MMM d") |
| "Today"/"in N days" | `dayCue(dayKey, today)` — calendar-day diff (v1 rounds instant distance; differs by ≤1 day near evening sessions — acceptable/flag) |
| TimeRail "h:mm" / "a" | `s.startTime` ("HH:mm") — needs split formatter (formatWallTime gives "8:00 PM" whole) |
| title, "{n} min", location | `s.title`, `s.durationMinutes`, `s.location` |
| event title, "JPC event", Lock, ExternalLink, href | `e.title`, `e.visibility`, `e.url` |
| grid tones today/past/upcoming | `sessionTone(dayKey, today)` |
| initial month anchor | `initialAnchor()` (same rule) |
| stepLabel | `rangeLabel()` (same format, en dash) |
| "Nothing scheduled yet" (both empty) | sessions.data.length===0 && events===0 (v2 copy differs) |
- GAP: events older than now−30d / beyond +365d never load (server window) — v1 Month view shows all past events. Minor.
- GAP (formatters only, data present): long weekday heading; split h:mm / a.
- V2-ONLY: Legend chip row (Today/Upcoming/Past/JPC event/Alumni only); session status badge chips ("Today"/"Upcoming"); "8:00 PM · location" card line; tinted cards w/ left border; event card "JPC event · {time|All day}" and season chip; Week as stacked rows + "Nothing scheduled"; Month dots + tap-a-day list; events navigate to `/event/[id]` (v1: external link or inert); no-season student still sees events (v1 shows EmptyState only); pull-to-refresh; loading/error states (v1 SSR).
- Owner-decision risk: v1 week/month at 375 px is a 7-col grid with ~45 px truncated title chips; v2 replaced it with dots + day list. Exact match means porting the chip grid.

### d) Components
- Ported & usable: `EmptyState` (icon `Calendar` from lucide-react-native, title, description), `Button variant="ghost" size="icon"`, `Text`. Card shadow via `shadowStyle("soft")`.
- Not covered: the segmented view switcher (hand-rolled in v1, not `ui/tabs`) — build inline in the screen (or check `design/ui/tabs.tsx` TabsList styling matches `inline-flex rounded-xl border border-border bg-muted/40 p-0.5`; it does not by default).
- v1 non-ui component to port: `components/sessions/season-calendar.tsx` (494 lines; AgendaView/AgendaSession/AgendaEvent/TimeRail/CalendarGrid) → replaces v2 CalendarGrid.tsx + CalendarEntries.tsx rendering. `SEASON_PALETTE` (dark-tone pairs `bg-info-800 text-info-300` …) only for SUPER.

### e) Tests
`src/__tests__/calendar-screen.test.tsx` (student-relevant), `calendar-grid.test.ts` (pure lib — keep all).
- KEEP (behaviour): student fetch `GET /api/v1/seasons/7/sessions`, never `/api/v1/seasons`; dayKey grouping (late-night session under the 2nd); press session → push `/session/[id]` id "1"; no-season fetches only `/api/v1/events` (if no-season-shows-events kept); events interleaved in time order (event before session); events failure doesn't break calendar; Month anchored on next session + "March 2099" + "Next month" → "April 2099"; Week "Feb 23 – Mar 1" → "Next week" → "Mar 2 – 8"; a11y labels "Month"/"Week"/"Next month"/"Next week"; staff/SUPER/ADMIN/LEADER/MENTOR tests (out of scope, keep).
- WILL CHANGE (markup/copy): heading text "Mar 1, 2099" → "Sunday, March 1"; "No season to show" → "No active season"; "Upcoming" badge + `getByLabelText("Calendar legend")` (v2-only); month a11y labels "Feb 23, 2099, nothing scheduled", opacity on Pressable, tap-a-day showing/hiding titles (v1 shows titles in cells — "Week two" would be visible without tapping); "Sun, Mar 1" + `getAllByText("Nothing scheduled")` ×7; "8:00 PM" (LEADER, X13 — becomes "8:00" + "PM" if agenda ported for all roles); press event → `/event/[id]` (v1 opens url); alumnus-with-no-season-sees-events (contradicts v1 student EmptyState; v1 alumni have a separate Events page).

---------------------------------------------------------------------------------------------------

## 2. /student/sessions/[id]

### a) v1
Files: `app/student/sessions/[id]/page.tsx` (117), `components/sessions/interactive-video-player.tsx` (410), `components/sessions/student-checkin-button.tsx` (91), `components/sessions/qr-scanner-view.tsx` (53), ui `badge`, `button`, `modal`.
Screenshot: `shots/student/light/student__sessions__id.png` (online session with 3 video questions, 0/5 pts, check-in button disabled under tab bar).
Server gate: not ACTIVE-enrolled in session's season → notFound. `isCheckInOpen` = openAt && !closedAt && <3h. `isOnline = !!youtubeUrl`. `hasInteractiveVideo` = videoId parsed && quiz && questions.length>0.

Render tree:
- `div.flex flex-col gap-3 md:gap-4`
  - `div` (header)
    - `Link href="/student/calendar".text-xs font-semibold text-brand-teal-700 hover:underline dark:text-brand-teal-300` — "← Calendar" (literal arrow char, no icon)
    - hero `div.mt-2 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]`
      - `div.mb-2 flex items-center gap-2` → `Badge variant={isOnline?"teal":"outline"}` — "Online" | "In-person"
      - `h1.text-xl font-black text-brand-navy-900 dark:text-foreground` — title
      - `p.mt-1 text-sm text-muted-foreground` — `format(startsAt,"EEEE, MMMM d, yyyy")` e.g. "Sunday, March 8, 2026"
  - **if hasInteractiveVideo** → InteractiveVideoPlayer (below)
  - **else if youtubeUrl** → `<a target=_blank>.flex items-center justify-center gap-2 rounded-lg bg-brand-teal-600 px-4 py-3 text-sm font-bold text-white shadow-[0_2px_8px_rgba(93,185,188,0.35)] transition-colors hover:bg-brand-teal-700` → `Video size-4 shrink-0` + "Watch recording"
  - details `div.rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-soft)]`
    - `p.text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70` — "Details"
    - `div.mt-2 flex flex-col gap-2`
      - `div.flex items-center gap-2 text-sm text-muted-foreground` → `Clock size-4 shrink-0 text-brand-teal-600` + `span` "{h:mm a} – {h:mm a} · {n} min" e.g. "8:00 PM – 9:30 PM · 90 min"
      - if location: same row → `MapPin size-4 shrink-0 text-brand-teal-600` + location
  - StudentCheckinButton `div.flex flex-col items-start gap-1.5`
    - `Button size="lg" disabled={!open} className="w-full min-h-[44px]"` → `QrCode` icon + "Check In"
    - if !open: `p.text-sm text-neutral-500` — "Check-in hasn't opened yet"
    - `Modal` → `ModalHeader` `ModalTitle` "Scan check-in code", `ModalDescription` "Point your camera at the QR code displayed by your leader."; `QrScannerView` (`div.overflow-hidden rounded-xl bg-black` > `video.aspect-video w-full`); scanError `p.text-sm text-error-600 dark:text-error-400` "That doesn't look like a check-in code" (no period). Valid scan → `router.push("/checkin/{token}")` (separate page shows the result).
- description is NOT rendered for students. myAttendance NOT shown.

InteractiveVideoPlayer:
- `div.flex flex-col gap-3`
  - `div.overflow-hidden rounded-2xl border border-border bg-black shadow-[var(--shadow-soft)]`
    - `div.relative aspect-video w-full` > mount `div.absolute inset-0 size-full` (YT iframe, controls:0 fs:0 rel:0 modestbranding playsinline)
    - seek bar `div.bg-black px-3 py-2`
      - `div[role=slider][aria-label="Video progress"].group relative h-6 cursor-pointer` (click to seek, clamped to allowedMax)
        - track `div.absolute top-1/2 h-1.5 w-full -translate-y-1/2 rounded-full bg-white/20`
          - locked region `div.absolute inset-y-0 right-0 rounded-r-full bg-white/5` style left = lockedFraction%
          - played `div.absolute inset-y-0 left-0 rounded-full bg-brand-teal-500` width = played%
          - markers per question (when duration>0) `span.absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full` + answered `bg-success-500` / unanswered `bg-warning-400`, left = atSeconds/duration
      - `div.flex items-center justify-between text-[11px] font-medium text-white/70`
        - `span.font-mono` — "{m:ss} / {m:ss}" (formatTimestamp) e.g. "0:00 / 37:49"
        - if allowedMax < duration: `span.inline-flex items-center gap-1` → `Lock size-3` + "Answer to unlock"
  - summary `div.flex items-center justify-between rounded-xl border border-border bg-card p-4`
    - `div` → `p.text-sm font-semibold text-brand-navy-900 dark:text-foreground` "Quiz complete" | "In progress"; `p.text-xs text-muted-foreground` "{answered} of {total} answered"
    - `div.text-right` → `p.text-lg font-black text-brand-teal-700 dark:text-brand-teal-300` "{earned}" + `span.text-sm font-semibold text-muted-foreground` "/{totalPoints}"; `p.text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70` "Points"
  - QuestionModal `Modal open={pending!==null} onOpenChange={noop}` (not dismissable)
    - `ModalHeader > ModalTitle` — prompt
    - `div.flex flex-col gap-2`
      - per option `button.flex items-center justify-between gap-2 rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors disabled:cursor-default` + correct-after-answer `border-success-600 bg-success-600/10 text-success-700 dark:text-success-300` else `border-border bg-card text-foreground hover:border-brand-teal-500 hover:bg-brand-teal-500/5`; disabled while submitting or after feedback → `span` option + `Check size-4 shrink-0` on correct
      - error `p.text-xs text-error-600`
      - feedback `div.mt-2 flex flex-col gap-3` → `p.inline-flex items-center gap-2 text-sm font-bold` + correct `text-success-700 dark:text-success-300` (`Check size-4` "Correct!") / wrong `text-error-600` (`X size-4` "Not quite — the correct answer is highlighted."); `Button` "Continue"

### b) v2 current
`app/(app)/session/[id]/index.tsx` (302, shared). Student-relevant hooks/mutations (KEEP):
- `useSessionDetail(id)` → `GET /api/v1/sessions/:id`, key `queryKeys.sessions.detail(id)`; pull-to-refresh refetch.
- `useStudentVideoQuiz(id, isStudent && hasVideo)` → `GET /api/v1/sessions/:id/video-quiz`, key `queryKeys.videoQuiz.forSession(id)`, parsed with `.strict()` student schema.
- In `VideoQuizPlayer` (346): `useSubmitVideoAnswer(sessionId)` POST `/video-quiz/answers` (invalidates videoQuiz.forSession), `useSaveVideoProgress` PUT `/video-quiz/progress`; `react-native-youtube-iframe`; POLL 400ms, tolerance 0.75s, save every 15s/pause/background/unmount, load-timeout 15s, deadlock guard, `onRequestClose=handleLeave` (Android back = leave, spec D15), barrier from server `nextQuestionId`.
- `StudentCheckInCard` (104): `useCheckIn()` POST `/api/v1/sessions/check-in` {token} (invalidates sessions.all + me.all); `parseCheckInCode`; `QrScanner` (87, expo-camera, permission flow "Allow camera"/"Open settings"); `CheckInResult` (19) + `lib/check-in-result.ts` copy (v1 /checkin/[token] wording).
- `parsePositiveInt` id → "Not found"/"That session doesn't exist."
Renders for student: `Card` (title `Text variant="title"`; "Mar 15, 2099 · 8:00 PM · 90 min"; location; description; "Your attendance: Present|Late (n min)|Absent"), `StudentCheckInCard` ("Your check-in"; "Check-in isn't open right now." / "You checked in at {time}." / "Scan QR code" + "Enter code" → Input "Check-in code" + "Check in"/"Cancel"), `VideoSection` (Loading/"Couldn't load the video quiz."/questions 0 → `Button "Watch on YouTube" variant="secondary"`/player).
VideoQuizPlayer renders: Card "{earned} / {total} points", "{n} of {m} questions answered", "Quiz complete"; YoutubePlayer h220; plain track (neutral-300, teal fill, no markers/lock); caption "m:ss / m:ss"; `Button Play|Pause`; `Button "Leave the quiz"`; RN `Modal` bottom sheet with prompt heading, options as ghost Buttons, feedback "Correct" / "Not quite — the answer was {opt}", "Continue", "Leave the quiz"; fallback EmptyState "Video unavailable"/"This session's video link can't be played in the app." + "Watch on YouTube".
Old-UI imports: index.tsx → `src/ui` (Button, Card, EmptyState, ErrorState, LoadingState, Screen, Text), `src/theme`, `src/components/{check-in/StudentCheckInCard, SessionQuizzesCard, VideoQuestionsEditor, VideoQuizPlayer}`; VideoQuizPlayer → `src/ui` (Button, Card, EmptyState, ErrorState, Text), `src/theme`; StudentCheckInCard → `src/ui` (Button, Card, Input, Text), `src/theme`; QrScanner, CheckInResult → `src/ui`, `src/theme`.

### c) Data mapping
| v1 | v2 |
|---|---|
| "← Calendar" link | `router.back()` / push `/calendar` (no data) |
| Badge Online/In-person | `detail.youtubeUrl !== null` |
| title | `detail.title` |
| "EEEE, MMMM d, yyyy" | `detail.dayKey` — needs new long formatter |
| hasInteractiveVideo | `quiz.videoId !== null && quiz.questions.length > 0` |
| "Watch recording" href | `detail.youtubeUrl` (`Linking.openURL`) |
| "h:mm a – h:mm a · n min" | `detail.startTime` + `durationMinutes` → end = wall-clock add (no end field) |
| location | `detail.location` |
| isCheckInOpen | `detail.checkInOpen` (server, C4) |
| scan → check-in | `useCheckIn` POST (v1 navigated to /checkin page) |
| player time / duration | player state |
| markers atSeconds, answered colour | `quiz.questions[].atSeconds`, `.answered` |
| allowedMax / "Answer to unlock" | barrier from `quiz.nextQuestionId` → `atSeconds` (∞ when null) |
| "Quiz complete"/"In progress" | `quiz.completedAt !== null` |
| answered / total | `quiz.answeredCount`, `quiz.questions.length` |
| earned / totalPoints | `quiz.earnedPoints`, `quiz.totalPoints` |
| modal prompt/options | `open.prompt`, `open.options` |
| feedback correctIndex/isCorrect | submit response `res.correctIndex`, `res.isCorrect` |
- GAP: no end wall-time field (derive from startTime+duration; DST-edge/midnight-crossing risk — or add `endTime` to sessionDetailSchema).
- GAP (formatter): "EEEE, MMMM d, yyyy" from dayKey.
- V2-ONLY: description paragraph; "Your attendance: …" line (myAttendance); "You checked in at …" state; typed "Enter code" fallback; in-place check-in result (CheckInResult) instead of /checkin page; camera permission UI; Play/Pause button (v1 relies on tapping the YT iframe); "Leave the quiz" buttons + Android back = leave; deadlock ErrorState; load-timeout → "Video unavailable" fallback; "Couldn't load the video quiz." error; pull-to-refresh; staff branches (console, live roster, quizzes card, editor, results, Edit session, Mark attendance — out of scope, keep).
- Copy diffs: "Check-in isn't open right now." vs v1 "Check-in hasn't opened yet"; "That doesn't look like a check-in code." (period) vs v1 no period; "Correct" vs "Correct!"; "Not quite — the answer was X" vs "Not quite — the correct answer is highlighted."; "Watch on YouTube" vs "Watch recording".
- v1 check-in button is visible-but-disabled when closed (hint text below); v2 hides controls. Already-checked-in: v1 still shows "Check In" (enabled if open).

### d) Components
- Ported: `Badge` (teal/outline), `Button` (size lg, default variant; add `self-stretch`/w-full + min-h-[44px]), `Modal`+ModalHeader/Title/Description (`design/ui/modal.tsx`; v1 QuestionModal uses `onOpenChange={noop}` — confirm the port can be non-dismissable and wire Android back to handleLeave), `Text`.
- Port needed: `components/sessions/interactive-video-player.tsx` (410) → restyle `src/components/VideoQuizPlayer.tsx` keeping its logic; `components/sessions/student-checkin-button.tsx` (91) → restyle `StudentCheckInCard` as button + modal hosting `QrScanner`; `components/sessions/qr-scanner-view.tsx` (53) — covered by v2 `QrScanner.tsx` (expo-camera), only frame styling `overflow-hidden rounded-xl bg-black` + aspect-video.
- Icons needed (lucide-react-native): Clock, MapPin, Video, QrCode, Lock, Check, X.

### e) Tests
`session-detail.test.tsx` (student test only in scope), `student-check-in.test.tsx`, `video-quiz-screen.test.tsx` (student describe), `video-resume.test.tsx`, `check-in-result.test.ts`.
- KEEP: session-detail student — no "Edit session"/"Mark attendance", no `/sessions/12/quizzes` fetch; all staff tests. student-check-in — POST `/api/v1/sessions/check-in` {token} for bare token and URL form; posts once; refusal copy "Check-in is now closed."/"Can't check in"; result "You're checked in!", "Checked in — late", "12 minutes after session start."; camera permission flow; refetch after success; not shown to staff. video-quiz — GET `/video-quiz`, never `/video-questions`; correctIndex leak → error, no score; modal opens at barrier, press option "alpha" → POST answers body; completed quiz "Quiz complete". video-resume (all 4: seekTo 20/30/75/none) — pure behaviour. check-in-result.test.ts — keep.
- WILL CHANGE: "Mar 15, 2099 · 8:00 PM · 90 min" → "Sunday, March 15, 2099" + "8:00 PM – 9:30 PM · 90 min"; "Your attendance: Late (10 min)" (v2-only — drop or keep by decision); "Check-in isn't open right now." → "Check-in hasn't opened yet"; "Scan QR code" → "Check In" (opens modal "Scan check-in code"); "Enter code"/"Check-in code" typed flow (v2-only, keep or drop by decision); "That doesn't look like a check-in code." period; "Your check-in" heading; "0 / 2 points"/"2 / 2 points" → "0" + "/2" + "Points"; "Correct" → "Correct!"; "Watch on YouTube" + "This session's video link can't be played in the app." → "Watch recording"; `screen.findByText("Question 1")` is the fixture prompt (keeps working if prompt is the modal title).

---------------------------------------------------------------------------------------------------

## 3. /student/quizzes

### a) v1
File: `app/student/quizzes/page.tsx` (156); ui `empty-state`, `badge`, `progress-ring`. Screenshot `shots/student/light/student__quizzes.png` (hero 0% avg, 1 graded · 0 pending, one ONLINE row 0/1 0%, "Graded Jul 8, 2026", chevron). **No h1 on this page.**
Data: no season → results = [] (no separate empty state; hero still renders). avgScore = round(mean of score/max*100 over score!==null) else null.

Render tree:
- `div.flex flex-col gap-3 md:gap-4`
  - hero `div.rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]` > `div.flex items-center gap-5`
    - `ProgressRing value={avgScore ?? 0} label={avg!==null ? "Average quiz score {n}%" : "No graded quizzes yet"}` (default size)
      - `span.text-2xl font-black text-brand-navy-900 dark:text-foreground` — "{n}%" | "—"
      - `span.mt-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70` — "avg"
    - `div.min-w-0 flex-1`
      - `p.text-[10px] font-bold uppercase tracking-widest text-brand-teal-700 dark:text-brand-teal-300` — "Quiz performance"
      - `p.mt-1 text-lg font-black text-brand-navy-900 dark:text-foreground` — "Average score"
      - `p.text-xs text-muted-foreground` — "{graded} graded · {total−graded} pending"
  - **empty** → `EmptyState icon={PenLine} title="No quizzes yet" description="Your quiz results will appear here once graded."`
  - else `div.flex flex-col gap-3`, per row:
    - ONLINE: `Link href=/student/quizzes/{quizId}.rounded-2xl border border-border bg-card px-4 py-4 shadow-[var(--shadow-soft)] transition-colors hover:border-brand-teal-500`; PAPER: same `div` without hover/link (not tappable)
      - `div.flex items-start justify-between gap-3`
        - `div.min-w-0` → `p.text-sm font-bold text-brand-navy-900 dark:text-foreground` title; if sessionTitle: `p.mt-0.5 text-xs text-muted-foreground` "{sessionTitle}[ · MMM d, yyyy sessionDate]"
        - `div.flex shrink-0 items-center gap-1 text-right` → QuizStatus + (ONLINE) `ChevronRight size-4 text-muted-foreground`
          - QuizStatus: score!==null → `div` > `p.text-lg font-black text-brand-navy-900 dark:text-foreground` "{score}" + `span.text-sm font-normal text-muted-foreground` "/{max}"; `p.text-xs text-muted-foreground` "{pct}%"
          - ONLINE attemptStatus null → `Badge variant="teal"` "Take quiz"; IN_PROGRESS → `Badge variant="warning"` "Resume"; else → `Badge variant="outline"` "Awaiting grading"
          - PAPER (score null) → `Badge variant="outline"` "Pending"
      - if notes: `p.mt-2 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground` notes
      - if gradedAt: `p.mt-2 text-[10px] text-muted-foreground/70` "Graded {MMM d, yyyy}"

### b) v2 current
`app/(app)/quizzes.tsx` (200) student branch `StudentQuizzes`. Hooks (KEEP): `useStudentQuizList(seasonId)` → `GET /api/v1/quizzes?seasonId=N`, key `[...queryKeys.quizzes.bySeason(id),"student"]`, seasonId from `scopes.activeSeasonId`, refetch guarded on non-null; pull-to-refresh. Navigation: every row `router.push({pathname:"/quiz/[id]", params:{id}})` (incl. PAPER).
Renders: no season → EmptyState "No active season"/"You don't have an active season right now, so there are no quizzes to show." (no fetch); Loading; Error "Couldn't load your quizzes."; average Card only when scored>0 ("{n}% average", "Across N graded quiz(zes)"); empty "No quizzes"/"This season doesn't have any quizzes for you yet."; rows Card: title heading, "{sessionTitle ?? 'No session'} · {status}" (status strings "Pending" / "{s} / {m}" / "Not started" / "In progress" / "Waiting to be marked" / "Graded"), notes.
Old-UI imports: `src/ui` (Button, Card, EmptyState, ErrorState, LoadingState, Screen, Text), `src/theme`, `src/lib/format` formatDate.

### c) Data mapping
| v1 | v2 (`StudentQuizResult`) |
|---|---|
| title, kind, maxScore, score, notes | `title`, `kind`, `maxScore`, `score`, `notes` |
| sessionTitle | `sessionTitle` |
| sessionDate "MMM d, yyyy" | `sessionDate` (ISO instant string) |
| gradedAt "Graded MMM d, yyyy" | `gradedAt` (ISO instant) |
| attemptStatus | `attemptStatus` |
| avg / graded / pending | derived client-side (v2 also filters maxScore>0 — keep, harmless) |
- GAP/risk: `sessionDate` and `gradedAt` are instants with no org dayKey — formatting on device violates X13 (Cairo-midnight edge). Either add `sessionDayKey`/`gradedDayKey` to schema or accept `formatDate`.
- V2-ONLY: no-season EmptyState (v1: hero with "—" + "No quizzes yet"); Loading/Error states; PAPER rows tappable (v1 inert); hero hidden when no graded quizzes (v1 always shows hero).

### d) Components
Ported: `ProgressRing` (value, label, children; check default size matches v1's), `Badge` (teal/warning/outline — add `self-start` not needed inside row), `EmptyState` (icon `PenLine`). Icons: PenLine, ChevronRight. No v1 non-ui component to port.

### e) Tests (`quizzes-screen.test.tsx`, student describe)
- KEEP: GET `/api/v1/quizzes?seasonId=7`; press ONLINE row → push `/quiz/[id]`; no-season never calls API.
- WILL CHANGE: "Week 1 · 15 / 20" → "15" + "/20" + "75%" with "Week 1 · {date}" subtitle; "63% average" → "63%" + "avg" + "Average score"; "Week 1 · Not started" → Badge "Take quiz"; "Week 1 · Waiting to be marked" → "Awaiting grading"; "No active season" (v1 has no such copy). Staff tests out of scope — keep.

---------------------------------------------------------------------------------------------------

## 4. /student/quizzes/[quizId]

### a) v1
Files: `app/student/quizzes/[quizId]/page.tsx` (45), `components/quizzes/quiz-runner.tsx` (266); ui `button`, `textarea`, `badge`, `confirm-dialog`. Screenshot `shots/student/light/student__quizzes__id.png` (GRADED, 0/1, Q1 Incorrect).
Server: quiz not found / no season access → notFound.

Page:
- `div.flex flex-col gap-3 md:gap-4`
  - `div`
    - `Link href="/student/quizzes".inline-flex items-center gap-1 text-xs font-semibold text-brand-teal-700 hover:underline dark:text-brand-teal-300` → `ArrowLeft size-3` + "Quizzes"
    - `h1.mt-1 text-xl font-black text-brand-navy-900 dark:text-foreground` — quiz title
    - if sessionTitle: `p.text-sm text-muted-foreground` sessionTitle
  - QuizRunner: status null → NotStarted; IN_PROGRESS → InProgress; SUBMITTED|GRADED → Result

NotStarted: `div.flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]`
- `p.text-sm text-muted-foreground` — "{n} question{s} · {maxScore} points. You have one attempt — answer every question before submitting."
- `Button className="self-start" disabled={pending}` — "Start quiz" | "Starting…"
- error `p.text-xs text-error-600`

InProgress: `div.flex flex-col gap-3`
- per question `div.rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-soft)]`
  - `div.flex items-center gap-2` → `span.text-xs font-bold text-muted-foreground` "Q{i+1}"; `Badge variant={MCQ?"teal":"outline"}` "Multiple choice"|"Essay"; `span.text-xs text-muted-foreground` "{p} pt{s}"
  - `p.mt-2 text-sm font-semibold text-brand-navy-900 dark:text-foreground` prompt
  - MCQ `div.mt-3 flex flex-col gap-2` → per option `button.flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors` + selected `border-brand-teal-600 bg-brand-teal-600/10 text-brand-teal-700 dark:text-brand-teal-300` / else `border-border bg-card text-foreground hover:border-brand-teal-500`
    - radio `span.flex size-5 shrink-0 items-center justify-center rounded-full border` + selected `border-brand-teal-600 bg-brand-teal-600 text-white` (`Check size-3`) / else `border-border`; then option text
    - select saves immediately (fire-and-forget)
  - ESSAY `Textarea className="mt-3" placeholder="Write your answer…"` saves on blur
- error `p.text-xs text-error-600`
- `Button className="self-start" disabled={!allAnswered || pending}` — "Submit quiz"
- if !allAnswered: `p.text-xs text-muted-foreground` — "Answer every question to submit."
- `ConfirmDialog title="Submit quiz?" description="You can't change your answers after submitting." confirmLabel="Submit" pending` → saves all then submits

Result (SUBMITTED or GRADED): `div.flex flex-col gap-3`
- summary `div.flex items-center justify-between rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]`
  - `div` → `p.text-sm font-bold text-brand-navy-900 dark:text-foreground` "Graded"|"Submitted"; `p.text-xs text-muted-foreground` "Your quiz has been graded." | "Awaiting grading for the written answers."
  - graded: `div.text-right` → `p.text-2xl font-black text-brand-teal-700 dark:text-brand-teal-300` "{totalScore}" + `span.text-sm font-semibold text-muted-foreground` "/{maxScore}"; `p.text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70` "Score"
  - submitted: `Badge variant="warning"` → `Clock size-3` + "Pending"
- per question `div.rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-soft)]`
  - `div.flex items-center justify-between gap-2` → `span.text-xs font-bold text-muted-foreground` "Q{i+1}"; MCQ with isCorrect!==null: `Badge variant="success"` (`Check size-3` "Correct") / `Badge variant="error"` (`X size-3` "Incorrect"); else `span.text-xs text-muted-foreground` "{awarded}/{points} pts" | "{points} pts"
  - `p.mt-1 text-sm font-semibold text-brand-navy-900 dark:text-foreground` prompt
  - MCQ `p.mt-1 text-sm text-muted-foreground` "Your answer: {option | —}"; ESSAY `p.mt-1 whitespace-pre-line rounded-lg bg-muted/40 px-3 py-2 text-sm text-foreground` `{text || "—"}`

### b) v2 current
`app/(app)/quiz/[id]/index.tsx` (388), student branch `StudentRunner` / `AttemptForm` / `ResultView`. Hooks (KEEP): `useStudentQuizDetail(id)` key `[...queryKeys.quizzes.detail(id),"student"]`; `useStartAttempt(id)` PUT `/api/v1/quizzes/:id/attempt` (setQueryData + invalidate lists); `useSaveAnswers(id)` PATCH `/api/v1/quizzes/:id/attempt` batched `AnswerInput[]`; `useSubmitAttempt(id)` POST `/attempt/submit` (setQueryData + invalidate lists). Debounce 1000ms + flush before submit; save state; `parsePositiveInt`.
Renders: NotStarted Card (title heading, "{n} questions · {m} points", error, Button "Start quiz" loading); SUBMITTED Card "Submitted {date} — waiting to be marked." (no question list); IN_PROGRESS: heading title, Cards "Question N", prompt, "{p} point(s)", MCQ Pressables (`accessibilityRole="radio"`, label "Answer {i} option {j}: {opt}", navy border when selected), essay `Input label="Answer {i}" multiline`; "Saving…/Saved/Not saved", "Retry save", submit error, Button "Submit" (no confirm). GRADED: Card title + "{total} / {max}", per question "Question N", prompt, "Your answer: {opt|No answer}", "Correct"/"Incorrect", "{a} / {p} points". Staff branch `StaffPreview` (out of scope, keep).
Old-UI imports: `src/ui` (Button, Card, EmptyState, ErrorState, Input, LoadingState, Screen, Text), `src/theme`, `src/lib/format` formatDate.

### c) Data mapping (`StudentQuizDetail`)
| v1 | v2 |
|---|---|
| title, sessionTitle | `title`, `sessionTitle` |
| status branch | `status` (null / IN_PROGRESS / SUBMITTED / GRADED) |
| question count / maxScore | `questions.length`, `maxScore` |
| Q type, prompt, points, options | `questions[].type/prompt/points/options` |
| selectedIndex, text | `questions[].selectedIndex/text` |
| isCorrect, pointsAwarded | `questions[].isCorrect/pointsAwarded` |
| totalScore | `totalScore` |
| attemptId | `attemptId` (not needed client-side in v2: endpoints keyed by quiz id) |
- No data GAPs.
- V2-ONLY: debounced batched save + "Saving…/Saved/Not saved" + "Retry save" (keep — behaviour, spec R55/R56; restyle as `text-xs text-muted-foreground`); `submittedAt` date in SUBMITTED copy; Loading/Error/"Not found" states.
- v1 behaviour v2 lacks: ConfirmDialog before submit ("Submit quiz?"); SUBMITTED shows full Result (summary + per-question answers) instead of a single sentence; NotStarted error under button.

### d) Components
Ported: `Button` (+`self-start`), `Badge` (teal/outline/success/error/warning), `Textarea` (placeholder "Write your answer…"), `ConfirmDialog` (title, description, confirmLabel, pending, onConfirm), `Text`. Icons: ArrowLeft, Check, X, Clock. No v1 non-ui port beyond `components/quizzes/quiz-runner.tsx` (266) itself (restyle into the screen; keep v2's AttemptForm logic).

### e) Tests (`quiz-runner.test.tsx`, student tests)
- KEEP: start only on press → PUT `/api/v1/quizzes/41/attempt`, then prompt "Capital of France?" shows; debounced single PATCH body; "Saved"/"Not saved" (if save-state kept); submit disabled until complete, then POST `/attempt/submit`; result never sees answer key; "Incorrect" badge text; "Week 1 quiz" title (h1). a11y labels "Answer 1 option 2: Paris" and "Answer 2" — keep as accessibilityLabel on the option button / Textarea so queries still work.
- WILL CHANGE: press "Submit" → "Submit quiz" then ConfirmDialog "Submit" (test must press both); "5 / 7" → "5" + "/7" + "Score"; /waiting to be marked/i → "Submitted" + "Awaiting grading for the written answers." (and SUBMITTED now lists answers); "Question N" → "Q{N}". Staff preview test out of scope.
