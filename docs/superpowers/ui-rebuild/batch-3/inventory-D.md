# Inventory D — leader role (session detail, session attendance)

v1 root = `/home/mark/projects/JPC/.v1-reference/app/src` · v2 root = `/home/mark/projects/JPC/space-v2/apps/mobile` · shared = `/home/mark/projects/JPC/space-v2/packages/shared/src`

Common to both (v1):
- Page sits inside the leader shell `<main class="... px-4 pb-24 pt-4">` on `bg-brand-navy-50 dark:bg-transparent` → v2 `src/design/layout/shell-frame.tsx` (`ShellFrame`, `onRefresh` gives pull-to-refresh, V2-ONLY, keep). Both v2 screens currently use legacy `Screen` (src/ui) for every non-student role.
- Route loading (v1 `app/leader/loading.tsx`, 16 l): same skeleton as the student route (`Skeleton.h-32 rounded-2xl` · 3-col `Skeleton.h-24 rounded-2xl` · `SkeletonCard` ×2) → `RouteSkeleton` (`src/design/layout/route-states.tsx`) works as is.
- Route error (v1 `app/leader/error.tsx`, 23 l): `EmptyState icon=AlertTriangle title="Something went wrong" description="We couldn't load this page. Please try again — if it keeps happening, let an admin know." action=<Button>Try again</Button>`. **v2 `RouteError` hard-codes the student copy `… let your leader know.`** It needs a prop for the description (or a `role` prop) before staff screens can use it.
- `app/leader/template.tsx` → `RouteTransition` (motion only, drop).
- Neither page uses StaggerReveal. Both use `div.flex flex-col gap-4` (16px, not the student pages' `gap-3`).
- H1 idiom: `h1.text-2xl font-black text-brand-navy-900 dark:text-foreground` + `p.mt-1 text-sm text-muted-foreground` → `PageTitle size="page" subtitle=…` (`src/design/layout/page-title.tsx`: `text-2xl font-black text-brand-navy-900 dark:text-foreground`, subtitle `mt-1 text-sm text-muted-foreground`). Exact match. Neither page has a back link (no `BackLink`).
- These pages use the **ui `Card`** (`components/ui/card.tsx`, 80 l: `rounded-2xl bg-card shadow-[var(--shadow-soft)] ring-1 ring-border`, `CardHeader flex flex-col gap-1.5 p-4 md:p-6`, `CardTitle text-base font-semibold leading-tight tracking-tight md:text-lg`, `CardContent p-4 pt-0 md:p-6 md:pt-0`), not the hand-rolled `border border-border … p-4` card of the student pages. Ported as `src/design/ui/card.tsx` with the md: classes already dropped.
- Screenshot dialogs `leader__sessions__id__dialog-{0,1,2}.png` and `leader__sessions__id__attendance__dialog-{0,1,2}.png` are **shell menus only** (dev user switcher, notifications popover, user menu). No screen dialog was captured. The override modal (below) is from source only.

---

## 1. /leader/sessions/[id] (staff branch of `/session/[id]`)

### a) v1
Files: `app/leader/sessions/[id]/page.tsx` (129 l), `components/sessions/check-in-attendance-list.tsx` (150 l), ui: `card.tsx` (80 l), `badge.tsx`, `button.tsx`, `modal.tsx`. Icons: `PenLine`, `QrCode`.
Shots: `shots/leader/light/leader__sessions__id.png`, `shots/leader/dark/leader__sessions__id.png` (+ shell dialogs 0–2).

Server logic: `requireRole(["LEADER"])`; `isLeaderInSeason(user, session.seasonId)` else `notFound()`. `checkInOpen` = `checkInOpenAt` set && no `checkInClosedAt` && opened less than 3 h ago. Roster = `groupStudent` rows of the leader's groups in this season (no ordering), each with `{userId, name ?? "", checkedInAt, status}` from this session's attendance row. Quizzes = `listQuizzesForSession(id)` (createdAt asc).

**v1 leader page has NO open/close check-in, NO QR, NO code, NO regenerate, NO video section, NO recording link, NO description/location/duration, NO "Mark attendance" or "Edit session" button.** Those are on the admin page (`app/admin/season/[code]/sessions/[id]/page.tsx`, 277 l) and the calendar list. Check-in on this page = status badge + roster + per-student override.

Render tree (`div.flex flex-col gap-4`):
- Header `div`
  - `h1.text-2xl font-black text-brand-navy-900 dark:text-foreground` → `{session.title}` (shot: long title fits on one line at 375; would wrap if longer)
  - `p.mt-1 text-sm text-muted-foreground` → `format(startsAt,"EEE, MMM d · h:mm a")` e.g. `Mon, Jul 20 · 6:30 PM` (no year, no duration, no location)
- Quizzes card (**only when quizzes.length > 0**; nothing while empty): `Card`
  - `CardHeader` (`flex flex-col gap-1.5 p-4 md:p-6`) > `CardTitle className="flex items-center gap-2 text-base"` (md:text-lg overridden anyway) > `PenLine.size-4 text-brand-teal-600` + `Quizzes`
  - `CardContent` (`p-4 pt-0 md:p-6 md:pt-0`) > `ul.flex flex-col divide-y divide-border` > per quiz `li.flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0`
    - `div` > `p.text-sm font-semibold text-brand-navy-900 dark:text-foreground` title (shot: RTL title renders right-aligned in its box) · `p.text-xs text-muted-foreground` `Max score: {maxScore}`
    - `Link href=/leader/sessions/{sid}/quiz/{qid} .text-xs font-semibold text-brand-teal-700 hover:underline` → `Grade →` (no dark: variant; shot dark shows the same teal-700)
    - No Draft/Published marker, no question count, no kind.
- Check-in card: `Card`
  - `CardHeader className="flex flex-row items-center justify-between"` (keeps p-4; gap-1.5 irrelevant in a row)
    - `CardTitle className="flex items-center gap-2 text-base"` > `QrCode.size-4` (foreground colour, not teal) + `Check-in`
    - `checkInOpen ? Badge variant="success" "Open" : Badge variant="outline" "Closed"`
  - `CardContent className="flex flex-col gap-6"` > `CheckInAttendanceList sessionId students isOpen`

CheckInAttendanceList (`components/sessions/check-in-attendance-list.tsx`):
- While `isOpen`: `setInterval(router.refresh, 10_000)` (whole page re-renders: badge, roster, quizzes).
- 0 students: `p.py-4 text-center text-sm italic text-muted-foreground` → `No students have scanned yet.` (copy says "scanned" though the list is the whole group roster)
- `ul.flex flex-col divide-y divide-border` > per student `li.flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0`
  - `div.flex min-w-0 flex-col gap-0.5` > `span.text-sm font-medium text-foreground` name · `checkedInAt &&` `span.text-xs text-muted-foreground` `format(checkedInAt,"h:mm a")` (check-in time; device zone of v1 server)
  - `div.flex shrink-0 items-center gap-2`
    - status !== null: `Badge variant=` PRESENT `success` / LATE `warning` / ABSENT `error`, label = enum title-cased (`Present`/`Late`/`Absent`); null: `Badge variant="outline"` `Not recorded`
    - `Button variant="outline" size="xs"` → `Edit` (opens override modal)
- Override modal (`Modal open={editing!==null}`): `ModalContent` > `ModalHeader` > `ModalTitle` `Override attendance` + `ModalDescription` `{student.name}` · `div.grid grid-cols-2 gap-2` > 3× `Button variant="outline" disabled={pending}` `Present` / `Late` / `Absent` (2 columns → Absent alone on row 2). Press → `manualOverrideAction(sessionId,{studentUserId,status})` (no notes, no lateMinutes) → close + `router.refresh()`. No error display (result ignored). No cancel button (modal close X / backdrop).
- Shot: 8 rows, all `Not recorded` + `Edit`; names on one line; badge + Edit right-aligned.

md:/lg: dropped: `CardHeader md:p-6`, `CardTitle md:text-lg`, `CardContent md:p-6 md:pt-0`, modal md: centred-dialog classes (already dropped in ports).

### b) v2 current — `app/(app)/session/[id]/index.tsx` (383 l)
- Hooks (keep): `useSessionDetail(id)` → `queryKeys.sessions.detail(id)`, GET `/api/v1/sessions/:id`, parse `sessionDetailSchema` (`src/hooks/use-session-detail.ts`, 57 l). `useAttendanceRoster(id)` → `queryKeys.attendance.roster(id)`, GET `/api/v1/sessions/:id/attendance`, parse `z.array(attendanceRosterRowSchema)` (`src/hooks/use-attendance.ts`, 44 l; server narrows a leader to own groups via `attendanceScopeFor`, spec 04 D6). `useSessionQuizzes(id, true)` → `queryKeys.sessions.quizzes(id)`, GET `/api/v1/sessions/:id/quizzes`, parse `sessionQuizItemSchema[]`. `useVideoQuizResults(id, true)` → `queryKeys.videoQuiz.results(id)`, GET `/api/v1/sessions/:id/video-quiz/results`. Admin-only: `useCheckInState` (GET `/check-in`, D-16.9), `useOpenCheckIn`/`useCloseCheckIn` (POST `/check-in-open|close`), `useRegenerateCheckIn` (POST `/check-in-regenerate`), `useVideoQuestions`/`useVideoQuestionWrites`.
- `LIVE_ROSTER_REFRESH_MS = 10_000` exported; `LiveRoster` refetches the roster query only (not detail) every 10 s while `detail.checkInOpen` (keep — tested).
- Branching (`SessionDetailBody`):
  - pending/error: STUDENT → `ShellFrame`+`RouteSkeleton`/`RouteError`; staff → legacy `Screen`+`LoadingState` / `ErrorState "Couldn't load this session."`.
  - STUDENT → `StudentSessionBody` (batch 2, **do not change**).
  - Staff (ADMIN/SUPER/LEADER; MENTOR is not routed here) renders in a legacy `Screen scroll onRefresh`, top to bottom:

| # | Block | Gate | Leader sees? |
|---|---|---|---|
| 1 | Header `Card`: title (`Text variant=title`), `{formatDayKey(dayKey)} · {formatWallTime(startTime)} · {n} min`, location, description, `myAttendance` line | always | **yes** |
| 2 | `Button "Edit session"` → `/session/[id]/edit` | `canManageCheckIn` (season admin / SUPER) | no |
| 3 | `CheckInConsole`: `Check-in` heading, Open/Close buttons, `QRCode size=220`, `Code: {token}`, `Closes at {time}`, risk caption `Anyone with this code can check in — keep it on the room screen only.`, `Regenerate code` (two-press confirm `Replace the code? The current one stops working.`), error line, `Checked in` heading + `LiveRoster emptyText="No students are enrolled yet."` | `showConsole` = `canManageCheckIn && (role!==SUPER || seasonAdminIds∋seasonId)` | no |
| 4 | `LiveCheckInRoster`: `Check-in` heading, `Check-in is open` / `Check-in is closed`, `LiveRoster emptyText="No students in your groups."` → `{x} of {n} checked in` + rows `name ?? email` · `Present`/`Late`/`Absent`/`Not checked in` (plain text) | else-if `canMarkAttendance` | **yes** (also non-admin SUPER) |
| 5 | `SessionQuizzesCard` (`src/components/SessionQuizzesCard.tsx`, 43 l): null while pending/empty; error card `Couldn't load this session's quizzes.`; `Quizzes` heading; rows Pressable → `/quiz/[id]` (staff preview); caption `Max score: N` or `Max score: N · Draft` | `canMarkAttendance` | **yes** |
| 6 | `VideoSection`: nothing without `youtubeUrl`; `VideoQuestionsEditor` (which itself embeds `VideoQuizResultsTable`) for SUPER / season ADMIN; `VideoQuizResultsTable` (`Results`, rows `name · answered/total · earned/total pts · ✓/–`, empty `No students to show yet.`) for LEADER | role | **yes, results table only, when the session has a video** |
| 7 | `Button "Mark attendance"` → `/session/[id]/attendance` | `canMarkAttendance` | **yes** |

- Not found (bad id): legacy `EmptyState "Not found" / "That session doesn't exist."` (all roles).
- Legacy imports used by the staff branch: `../../../../src/theme` (`useTheme`), `../../../../src/ui` (`Button, Card, EmptyState, ErrorState, LoadingState, Screen, Text`); `SessionQuizzesCard` and `VideoQuestionsEditor.tsx` (281 l) also import `../theme` + `../ui` (`Button, Card, ErrorState, Input, LoadingState, Text`) and `./ChoiceChips`. `react-native-qrcode-svg` (admin console).
- Design imports already present (student branch): `BackLink, Eyebrow, PageTitle`, `RouteError, RouteSkeleton`, `ShellFrame`, `Badge`, `Button`, `Text`, `shadowStyle`, `iconWithClassName`.

### c) Data mapping
| v1 element | v2 source |
|---|---|
| title | `detail.title` ✓ |
| `EEE, MMM d · h:mm a` | `formatWeekdayDay(detail.dayKey)` + ` · ` + `formatWallTime(detail.startTime)` ✓ (org time, X13; both helpers exist in `src/lib/format.ts`) |
| quizzes list / order | `useSessionQuizzes` `[]` (`id,title,kind,maxScore,questionCount,publishedAt`) ✓ — order is the server's (check it is createdAt asc like v1) |
| `Max score: {n}` | `maxScore` ✓ |
| `Grade →` link target | v1 goes straight to grading (`/leader/sessions/[id]/quiz/[qid]`, screen-map → `(app)/quiz/[id]/grade`). v2 pushes `/quiz/[id]` (staff preview, then `Grade this quiz`). **Ruling needed** (see flags). Route `/quiz/[id]/grade` exists. |
| check-in Open/Closed badge | `detail.checkInOpen` ✓ (server applies the 3 h rule, C4 / spec 04 D8) |
| roster rows (who) | `useAttendanceRoster` ✓ — source is `SeasonEnrollment` ACTIVE by the leader's groups (D6 step 4), ordered group then name; v1 used `GroupStudent`, unordered (R99). Intentional per D6/D9. |
| row name | `row.name ?? row.email` (v1 `name ?? ""`) ✓ |
| row check-in time `h:mm a` | **GAP**: `attendanceRosterRowSchema` (`packages/shared/src/session.ts:82-90`) has no `checkedInAt`. Needs the field on the schema + `loadAttendanceRoster` (backend) — and an org wall time for it (X13), e.g. `checkedInAtTime: wallTimeSchema.nullable()`. |
| status badge / `Not recorded` | `row.status` (PRESENT/LATE/ABSENT/null) ✓ — v2 copy today `Not checked in` (change to `Not recorded`). |
| `Edit` → override modal → write | **GAP (behaviour)**: v2 has no override UI and no override endpoint. The write can reuse `useSaveAttendance(sessionId).mutate([{studentUserId, status, notes: row.notes, lateMinutes?}])` (POST `/sessions/:id/attendance`, one entry) — matches spec 04 D7 "one write path" and fixes R32 if `notes`/`lateMinutes` are carried (as `buildAttendanceEntries` does). Its onSuccess already invalidates `attendance.roster` + `sessions.all`. Note: unlike v1's override this path runs `flagLowAttendance` (D7 says it should). |
| modal description `{name}` | `row.name ?? row.email` ✓ |
| 10 s refresh while open | `LiveRoster` interval on roster refetch ✓ (v1 also refreshed quizzes and the badge; v2 refreshes roster only — fine) |
| empty `No students have scanned yet.` | roster length 0 ✓ (v2 copy `No students in your groups.` → change) |

V2-ONLY on the leader branch (v1 leader page has none of these):
- V2-ONLY: header card lines `· {n} min`, location, description, `myAttendance` line (always null for staff). v1 header is title + date/time only, no card.
- V2-ONLY: `{x} of {n} checked in` count line; `Check-in is open/closed` text (v1 = Open/Closed badge in the card header).
- V2-ONLY: `Max score: N · Draft` suffix for unpublished ONLINE quizzes (tested).
- V2-ONLY: `VideoQuizResultsTable` for leaders (spec 13 D10 recommendation, built in Plan 14; untested). v1 shows no video results anywhere.
- V2-ONLY: `Mark attendance` button. v1 reaches attendance only from the calendar list's `Mark attendance` (`components/sessions/calendar-list.tsx:116-123`, `Button variant="outline" size="sm"`). **v2's calendar has no such link — this button is the only way into `/session/[id]/attendance` today.** Removing it requires the leader calendar (other inventory) to gain the link first.
- V2-ONLY: quiz-card error state; roster loading/error states; pull-to-refresh.
- Ordering matches v1 already: quizzes are *before* check-in in v1; v2 puts check-in (4) before quizzes (5) → reorder.

Admin/SUPER blocks (2, 3, 6-editor) stay as they are in batch 3 for leaders; but screen-map rows 95/97 list the admin detail and admin attendance under the same batch number as the leader rows, and they share this file. Whoever rebuilds the admin page must re-skin blocks 2/3/6 to v1 admin's markup (check-in QR card with `Regenerate QR` ghost button, `Close` outline, Quizzes card with `CreateQuizForm`, `Video questions` card). For leader-only batch work: put the leader layout behind `!showConsole && !canAuthorVideo` (i.e. LEADER, and non-admin SUPER, which gets block 4 today) and leave the admin branch's legacy markup untouched.

### d) Components
- Ported (src/design/ui): `Card`, `CardHeader`, `CardTitle`, `CardContent` (md: dropped; `CardTitle` takes `className="flex-row items-center gap-2 text-base"` — note it is a `Text`, so the icon+label row needs a wrapping `View className="flex-row items-center gap-2"` with `CardTitle` inside), `Badge` (success/warning/error/outline), `Button` (variant outline, size xs → `h-6 gap-1 rounded-md px-2`, text-xs), `Modal`/`ModalContent`/`ModalHeader`/`ModalTitle`/`ModalDescription` (bottom sheet at phone width), `Text`, `PageTitle`, `ShellFrame`, `RouteSkeleton`, `RouteError` (needs leader copy). Icons: `PenLine`, `QrCode` from lucide-react-native (register with `iconWithClassName`).
- Needs port:
  - `components/sessions/check-in-attendance-list.tsx` (150 l) → `src/design/sessions/check-in-attendance-list.tsx` (props: rows, isOpen, onOverride, pending). Admin v1 page uses the same component — share it.
  - Quiz card is inline in page.tsx → replace `SessionQuizzesCard` markup (keep its hook, null-while-pending/empty, error state). The card is used only by this screen (staff), so changing it does not affect other roles except admin, whose v1 Quizzes card differs (admin page lines 141-198).
  - `VideoQuizResultsTable` has no v1 counterpart → leave legacy markup or re-skin with v1 idioms (needs ruling if kept).
  - Admin-only `CheckInConsole`/`VideoQuestionsEditor` → v1 `check-in-qr.tsx`, `session-checkin-controls.tsx`, `video-questions-editor.tsx`, `create-quiz-form.tsx` (admin inventory, not here).

### e) Tests — `src/__tests__/session-detail.test.tsx` (284 l)
- Student case l.64-82: batch 2, untouched.
- Behaviour (keep):
  - l.84-146 admin open/QR/recover/regenerate; l.148-154 admin `Edit session` push; l.202-230 admin console roster + 10 s refresh (REG-78); l.232-246 SUPER console gating (REG-79) — admin branch, unaffected if leader layout is separate.
  - l.156-180 leader: no open/close/regenerate/edit, no `Code:`, never GETs `/check-in` or `/seasons/7/sessions` (keep all of these).
  - l.182-200 leader roster refetched every 10 s while open (keep; anchored on `findByText("Check-in is open")` l.190 — change anchor).
  - l.264-271 quiz card hidden when none (keep; `queryByText("Quizzes")` still valid).
  - l.273-284 quiz row press → push `{pathname:"/quiz/[id]"}` (keep or change to `/quiz/[id]/grade` per ruling; v1 press target would be the `Grade →` link, not the title).
- Markup/copy (will change):
  - l.175 `Check-in is open` → badge `Open`; l.236 `Check-in is closed` → `Closed`.
  - l.176-177 `Present` / `Not checked in` → badge `Present` / `Not recorded`.
  - l.179 `Mark attendance` expected for leader — conflicts with v1 (no such button) → remove/flip if v1-exact.
  - l.218 `1 of 2 checked in` (admin console) — admin only.
  - l.259-261 `Paper quiz`, `Max score: 20` stay; `Max score: 10 · Draft` is V2-ONLY copy.
- Missing: no test covers `VideoQuizResultsTable`, the override modal (new), or the check-in time. Add: Edit → modal → POST one entry with stored notes; badge variants.

---

## 2. /leader/sessions/[id]/attendance (= `/session/[id]/attendance`, shared with admin)

### a) v1
Files: `app/leader/sessions/[id]/attendance/page.tsx` (38 l), `components/sessions/attendance-form.tsx` (204 l), ui: `button.tsx`, `input.tsx`. Icons: `Check`, `Clock`, `X`. (No `AttendancePill` — the form uses its own toggle buttons; `components/ui/attendance-pill.tsx` is not on this page.)
Admin twin: `app/admin/season/[code]/sessions/[id]/attendance/page.tsx` (42 l) — **identical markup and copy**; differs only in role gate, roster scope (whole season, `loadAttendanceRoster(id)` without groupIds) and `returnHref` (`/admin/season/{code}/sessions/{id}` vs `/leader/calendar`).
Shots: `shots/leader/light/leader__sessions__id__attendance.png`, `shots/leader/dark/leader__sessions__id__attendance.png` (full-page capture, so the sticky save bar appears mid-page above the tab bar; + shell dialogs 0–2).

Server logic: `requireRole(["LEADER"])`; `canMarkAttendance(user, id)` else `redirect("/leader/calendar")`. Roster = `loadAttendanceRoster(id, user.groupLeaderIds)` (ACTIVE enrollments, ordered group name asc then student name asc; `{studentUserId,name,email,groupName,status,notes,lateMinutes}`).

Render tree (`div.flex flex-col gap-4`):
- Header `div`
  - `h1.text-2xl font-black text-brand-navy-900 dark:text-foreground` → `` `Attendance — ${session.title}` `` (em dash; shot wraps to 2 lines)
  - `p.mt-1 text-sm text-muted-foreground` → `format(startsAt,"EEE, MMM d, yyyy · h:mm a")` e.g. `Mon, Jul 20, 2026 · 6:30 PM`
- `AttendanceForm`:
  - roster empty: `p.rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground` → `No students are enrolled in this scope.`
  - else `div.flex flex-col gap-4`:
    - Mark-all bar `div.flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card p-3` (no shadow)
      - `span.text-sm text-muted-foreground` `Quick mark all as`
      - `div.flex flex-wrap gap-1` > 3× `Button variant="outline" size="xs" disabled={pending}` `Present` / `Late` / `Absent` (shot: all on one row with the label at 375)
      - markAll sets every roster row's status (does not touch minutes).
    - `ul.flex flex-col gap-2` > per row `li.rounded-lg border border-border bg-card p-3` (no shadow)
      - `div.flex flex-col gap-2` (`md:flex-row md:items-center md:justify-between` dropped)
        - `div.min-w-0` > `p.truncate font-medium` (16px body size, foreground) `name ?? email` · `p.truncate text-xs text-muted-foreground` `{groupName} · {email}` (or just email)
        - `div.flex flex-wrap gap-1.5` > 3 toggle buttons `button aria-pressed` class `inline-flex h-9 min-w-[3.25rem] items-center justify-center gap-1 rounded-md px-2 text-xs font-medium ring-1 transition-colors disabled:opacity-50` +
          - active PRESENT `bg-success-100 text-success-800 ring-success-300` / LATE `bg-warning-100 text-warning-800 ring-warning-300` / ABSENT `bg-error-100 text-error-800 ring-error-300`
          - inactive `ring-border text-muted-foreground hover:bg-muted hover:text-foreground`
          - content `Icon.size-3.5` (`Check` / `Clock` / `X`) + `span` label `Present`/`Late`/`Absent`
      - `current === LATE`: `div.mt-2 flex items-center gap-2` > `label.text-xs font-medium text-muted-foreground` `Minutes late` + `Input type=number min=0 max=600 className="h-9 w-24"`
      - Initial state: each row's stored `status` / `lateMinutes` (pre-selected toggle).
    - error: `p.rounded-md border border-error-200 bg-error-50 px-3 py-2 text-sm text-error-800 dark:border-error-900 dark:bg-error-950 dark:text-error-200` → `Mark at least one student before saving.` or the server error string.
    - Save bar `div.sticky bottom-24 z-10 flex flex-col-reverse gap-2 rounded-lg border border-border bg-card p-3 shadow-sm` (`sm:flex-row sm:justify-end md:bottom-0` dropped) → at 375: full-width **Save on top, Cancel below**
      - `Button variant="outline" onClick=router.back disabled={pending}` `Cancel`
      - `Button onClick=save disabled={pending}` `Save attendance` / pending `Saving…` (default variant: navy in light, teal in dark per shots)
  - save(): entries = every row whose status is non-null (**including untouched pre-filled rows**), `notes: null` always, `lateMinutes` only for LATE (blank/junk → null). 0 entries → error. Success → `router.push("/leader/calendar")` + refresh.
- Sticky behaviour: bar sticks 96px above the viewport bottom (above the floating tab bar) while scrolling the list, then rests at its natural place after the list. In RN this needs either a footer outside the ScrollView positioned `absolute bottom-24` with matching bottom padding on the list, or `stickyHeaderIndices`-style workaround; simplest faithful port = absolute footer + `pb` on content.

md:/lg:/sm: dropped: `md:flex-row md:items-center md:justify-between` (row), `sm:flex-row sm:justify-end md:bottom-0` (save bar).

### b) v2 current — `app/(app)/session/[id]/attendance.tsx` (168 l)
- Hooks (keep): `useAttendanceRoster(sessionId)` (as above; server scope by role, D6); `useSaveAttendance(sessionId)` → POST `/api/v1/sessions/:id/attendance` `{entries}`, parse `saveAttendanceResponseSchema`, `meta: DASHBOARD_META`, invalidates `attendance.roster(id)` + `sessions.all`. Pure helper `buildAttendanceEntries` (`src/lib/attendance-entries.ts`) — keep.
- State: `marks` (touched rows only), `lateText`, `formError`; current = `marks[id] ?? row.status`.
- Renders (legacy `Screen scroll`): `Text title "Attendance"` (no session title, no date); Loading/Error `Couldn't load the roster.`/Empty `No students` + `No students are enrolled in this scope.`; row of 3 `Button`s `All present`/`All late`/`All absent`; per row `Card` with name, `{group} · {email}`, 3 Pressables (label only, no icons; a11y `Mark {name} {STATUS}`, `accessibilityState.selected`), LATE → legacy `Input label="Minutes late for {name}"`; `formError` caption; save error `Couldn't save attendance. Check your connection and try again.`; `Button "Save attendance"` (loading spinner). No Cancel. Success → `router.back()`. Invalid id → `EmptyState "Not found" / "That session link isn't valid."`.
- Legacy imports: `../../../../src/theme` (`useTheme`), `../../../../src/ui` (`Button, Card, EmptyState, ErrorState, Input, LoadingState, Screen, Text`).
- Shared: the same route serves ADMIN and SUPER (v1 admin attendance page) — one rebuild covers both; only the server-side roster scope differs.

### c) Data mapping
| v1 element | v2 source |
|---|---|
| `Attendance — {title}` | **GAP (fetch)**: screen does not load the session. Add `useSessionDetail(sessionId)` (same key `sessions.detail(id)`, usually already cached from the detail screen) → `detail.title`. |
| `EEE, MMM d, yyyy · h:mm a` | `detail.dayKey` → `formatWeekdayDayYear` + ` · ` + `formatWallTime(detail.startTime)` ✓ |
| roster rows name/email/groupName | `row.name ?? row.email`, `row.groupName`, `row.email` ✓ |
| initial status / minutes | `row.status`, `row.lateMinutes` ✓ |
| mark-all | `setMarks` over roster ✓ |
| minutes-late input | `lateText` ✓ (v1 field unlabeled for a11y beyond `<label>`; keep v2 a11y label) |
| save payload | `buildAttendanceEntries` — **differs from v1 deliberately**: touched rows only (v1: every non-null row) and stored `notes` carried (v1: `notes: null`). Spec 04 R13/R16 + D7; tested. Keep (V2-ONLY behaviour, no visual change). |
| validation copy `Mark at least one student before saving.` | ✓ same. Note: v2 "nothing touched" ≠ v1 "nothing non-null" — with pre-filled rows v1 would save, v2 errors. |
| server error text | v2 generic `Couldn't save attendance. Check your connection and try again.` — v1 shows `result.error` (e.g. `Invalid attendance entries.`). Could use `apiErrorMessage(err, …)` in the v1 error box. |
| `Saving…` | `save.isPending` ✓ (replace spinner with label) |
| Cancel → back | `router.back()` ✓ (add button) |
| success → `/leader/calendar` (admin: session detail) | v2 `router.back()` (returns to wherever the user came from — today always the detail screen). Keep `back()` unless the owner wants v1's fixed return target. |
| disable all controls while pending | `save.isPending` ✓ (v2 doesn't disable toggles today) |

- V2-ONLY: separate loading/error states for the roster (v1 server-rendered); invalid-id `Not found`.
- No status-vocabulary gap: `attendanceStatusSchema` = PRESENT|LATE|ABSENT (+ null), same as v1 (spec 04 D11 EXCUSED not shipped in either).

### d) Components
- Ported: `Button` (outline xs; default; outline), `Input` (`className="h-9 w-24"`, `keyboardType="number-pad"`), `Label`, `Text`, `PageTitle`, `ShellFrame`. Icons `Check`, `Clock`, `X` (lucide-react-native, `size={14}` for `size-3.5`).
- `src/design/ui/attendance-pill.tsx` exists but is **not** what v1 uses here (pill = `rounded-full px-2 py-0.5`, no ring; the form's toggle = `h-9 rounded-md ring-1`). Don't substitute it.
- Needs port: `components/sessions/attendance-form.tsx` (204 l) → `src/design/sessions/attendance-form.tsx` (presentational: roster, marks, lateText, pending, error, onMark/onMarkAll/onLate/onSave/onCancel; screen keeps hooks + `buildAttendanceEntries`). RN `ring-1` → `border` (foundations rule). Sticky save bar → absolute footer (see a).

### e) Tests
- `src/__tests__/attendance-screen.test.tsx` (109 l), all LEADER:
  - Behaviour (keep): l.33-53 GET roster, press toggles, POST touched rows with notes carried, `router.back()` after save; l.55-69 untouched row excluded; l.71-84 LATE shows minutes field and sends `lateMinutes: 15`; l.86-101 mark-all then save sends every row; l.103-109 empty save refused, no POST.
  - Selectors that must survive: a11y labels `Mark {name} {STATUS}` (l.40-41, 59, 75) and `Minutes late for {name}` (l.76) — keep these labels on the new toggles/Input; `Save attendance` text (l.42 etc.) unchanged.
  - Markup/copy (will change): `All present` (l.90) → v1 `Present` inside the mark-all bar — **duplicate text** with row toggles (`Present` appears 1+N times) → test must use a distinct a11y label (e.g. `Mark all PRESENT`) or `getAllByText(...)[0]`.
  - New tests needed: header `Attendance — Week 3` + date (requires mocking GET `/api/v1/sessions/12`; the test's `get.mockResolvedValue` returns the roster shape for every URL today → switch to URL routing as in session-detail.test), Cancel → back, `Saving…`.
- `src/__tests__/attendance-entries.test.ts` (29 l): pure logic, unaffected.
- `my-attendance-screen.test.tsx` is the student screen — not this one.

---

## Domain decisions that touch these screens

- **Spec 04 R100 / §9 row `/sessions/[id]`** ("leaders get the live roster and a read-only open/closed badge"): matches v1. v2's text line `Check-in is open/closed` is the deviation, not the spec.
- **Spec 04 D7 (one write path)**: v1's per-student `Edit` override is a second action; v2 must implement it via the batch POST (one entry). Agrees with D7; conflicts with nothing in v1's UI.
- **Spec 04 R32 / D2 recommendation** (override must not null `notes`/`lateMinutes`): v1's override drops them. If the ported modal sends `lateMinutes` from the row when re-marking LATE and carries `notes`, behaviour differs from v1 (intentional fix). Owner should confirm.
- **Spec 04 R33/R75**: v1's override does not notify; via the batch POST it will (`flagLowAttendance`). D7 recommends notifying. Behaviour change vs v1.
- **Spec 04 R13/R16 + `buildAttendanceEntries`**: v2 sends touched rows only and keeps notes; v1 re-sends every pre-filled row with `notes: null`. Kept, tested. Side effect on copy: the "Mark at least one student" error now fires when nothing was touched even if rows are pre-filled.
- **Spec 04 D6/D9**: roster source moved from `GroupStudent` (v1 leader detail, unordered) to `SeasonEnrollment.groupId` ordered by group/name. The row list may differ from the v1 shot in order and (for students who changed groups) membership. Intentional.
- **Spec 04 D8 / ruling C4**: badge reads `detail.checkInOpen` (server 3 h rule). No client recompute. ✓
- **X13**: check-in time per row needs an org wall time from the server if added (no device-zone formatting of `checkedInAt`).
- **Spec 13 D10**: recommends a video-quiz results screen. v2 shows `VideoQuizResultsTable` to leaders on this page; v1 has nothing. V2-ONLY: needs a ruling to keep it (and a v1-style skin) or drop it for the leader.
- **Spec 03 §screen map (l.574/577)**: one `/sessions/[id]` route with three content branches and one attendance route for ADMIN/SUPER/LEADER. Consistent with this inventory.

## Flags needing a ruling (summary)
1. GAP: per-student `Edit` → `Override attendance` modal is missing in v2 (proposal: reuse POST `/attendance` with one entry, carrying notes/lateMinutes).
2. GAP: roster has no `checkedInAt` (v1 shows `h:mm a` under the name) — schema + backend change, org wall time.
3. GAP: attendance screen header needs the session (`Attendance — {title}`, date) → add `useSessionDetail`.
4. V2-ONLY: `Mark attendance` button on the detail page is v2's only entry to the attendance screen; v1 puts it on the calendar list. Remove only once the leader calendar has the link.
5. V2-ONLY: `VideoQuizResultsTable` for leaders (spec 13 D10); header card extras (duration, location, description); `x of n checked in`; `· Draft` quiz suffix.
6. Conflict: quiz `Grade →` goes to grading in v1; v2 row opens the staff preview `/quiz/[id]` (tested l.273-284).
7. `RouteError` hard-codes student copy (`let your leader know`); leader/admin copy is `let an admin know`.
8. Save behaviour: v2 touched-rows-only + notes kept vs v1 all-non-null + notes nulled (spec 04 R13/R16, tested) — keep; return target `router.back()` vs v1 `/leader/calendar`.
