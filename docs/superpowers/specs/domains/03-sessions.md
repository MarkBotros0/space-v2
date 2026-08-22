# Domain 03 — Sessions

> Status: draft · Phase: 1 (read) / 3 (writes) · v1 API status: read done

A session is one scheduled meeting inside a season. This domain owns the
session's own lifecycle — create, edit, delete, recurrence, scheduling — plus
every calendar read and the check-in *lifecycle* (open / close / regenerate
token). It does **not** own marking attendance, the roster's rules, or the QR
check-in redemption flow; those are domain 4. Section 3 names the boundary at
each point where the two touch.

---

## 1. v1 source

All paths relative to `D:\Projects\JPC\jpc-space`.

| File | Holds |
|---|---|
| `src/lib/session-actions.ts` | Every write. Create (with weekly recurrence), update (with recurrence scope + reschedule notification), delete (with recurrence scope), and the three check-in lifecycle actions. 295 lines. |
| `src/lib/sessions-query.ts` | Every read. Per-season list, all-active-seasons list, single-session detail, and the attendance roster (roster read is domain 4's rules, listed here because it lives in this file). |
| `src/lib/recurrence.ts` | 27 lines, the densest rules-per-line in the domain. `RecurrenceScope`, occurrence-date generation, and the sibling-selection function that decides what an edit or delete actually hits. |
| `src/components/sessions/session-form.tsx` | Create/edit form. Carries validation and defaults the server action does **not** repeat, plus the in-person/online exclusivity that exists nowhere else. |
| `src/components/sessions/season-calendar.tsx` | The calendar itself: three views, day grouping, the "upcoming" window, chip colouring, Monday-first weeks. Shared by four of the five role calendars. |
| `src/components/sessions/calendar-list.tsx` | The flat list variant used on the season overview tab. Holds the status-badge rules and one of four copies of the 3-hour check-in window. |
| `src/lib/rbac.ts` | `isAdminOfSeason` (pure), `isLeaderInSeason` (database-backed). |
| `src/lib/auth/permissions.ts` | `canEditSeason`, `canAccessSeason`, `canMarkAttendance`. |
| `src/lib/notifications.ts` | `createNotificationsBulk` — the reschedule notification's opt-out filtering and fire-and-forget email. |
| `src/lib/season-actions.ts:199-321` | `duplicateSeasonAction`. Not a session action, but it **creates sessions** and copies `recurrenceGroupId` verbatim. See R33 and section 10. |
| `src/app/api/v1/sessions/[id]/route.ts` | v1's own REST detail endpoint. Diverges from v1's own web pages — see R66, R80. |
| `src/app/api/v1/seasons/[id]/sessions/route.ts` | v1's own REST list endpoint. |
| `src/app/api/v1/sessions/[id]/check-in-open/route.ts`, `.../check-in-close/route.ts` | REST equivalents of two of the three check-in actions. There is no REST equivalent of regenerate. |

Pages that consume it:

| Page | Role gate | What it reads |
|---|---|---|
| `src/app/admin/season/[code]/calendar/page.tsx` | ADMIN, SUPER + `canEditSeason` | `listSessionsForSeason(season.id)` — token included |
| `src/app/admin/season/[code]/calendar/new/page.tsx` | ADMIN, SUPER + `canEditSeason` | nothing; renders `SessionForm` in create mode |
| `src/app/admin/season/[code]/sessions/[id]/page.tsx` | ADMIN, SUPER + `canEditSeason` | `loadSessionById` + quizzes + video questions + a hand-rolled enrollment/attendance query |
| `src/app/admin/season/[code]/sessions/[id]/edit/page.tsx` | ADMIN, SUPER + `canEditSeason` | `loadSessionById`; passes `hasRecurrence` to the form |
| `src/app/admin/season/[code]/sessions/[id]/attendance/page.tsx` | ADMIN, SUPER + `canMarkAttendance` | `loadSessionById` + `loadAttendanceRoster` (unscoped) |
| `src/app/admin/season/[code]/page.tsx` | ADMIN + `canEditSeason` | `listSessionsForSeason` for the season's "Sessions" tab |
| `src/app/admin/calendar/page.tsx` | ADMIN, SUPER | seasons only — it is a redirect, not a calendar |
| `src/app/student/calendar/page.tsx` | STUDENT | `listSessionsForSeason(activeSeasonId, { includeCheckInToken: false })` |
| `src/app/leader/calendar/page.tsx` | LEADER | `listSessionsForSeason` once per led season — token included |
| `src/app/super/calendar/page.tsx` | SUPER | `listSessionsForAllActiveSeasons()` — token included |
| `src/app/alumni/calendar/page.tsx` | `isAlumnus` | **no sessions at all** — JPC events only |
| `src/app/student/sessions/[id]/page.tsx` | STUDENT + own ACTIVE enrollment | `loadSessionById(id, { includeCheckInToken: false })` |
| `src/app/leader/sessions/[id]/page.tsx` | LEADER + `isLeaderInSeason` | `loadSessionById(id)` — token included but never rendered |
| `src/app/leader/sessions/[id]/attendance/page.tsx` | LEADER + `canMarkAttendance` | `loadAttendanceRoster(id, user.groupLeaderIds)` — group-scoped |

v1 has **zero test files**. The source above is the only statement of intent.

---

## 2. Data model

### `Session` — `apps/backend/prisma/schema.prisma:363-390`

| Field | Type | Meaning / rule it carries |
|---|---|---|
| `seasonId` | `Int`, FK → `Season`, `onDelete: Cascade` | The only owning scope. Immutable after create — no code path writes it on update. |
| `title` | `String` | Required. |
| `startsAt` | `DateTime` | **The only time stored.** A UTC instant, no timezone, no all-day flag, no end column. |
| `durationMinutes` | `Int @default(90)` | End time is derived, never stored (`src/app/student/sessions/[id]/page.tsx:42-44`). |
| `location` | `String?` | Nullable. Treated as the in-person branch's field by the form; the schema allows it alongside `youtubeUrl`. |
| `youtubeUrl` | `String?` | Nullable. Its presence is what the UI re-derives "online vs in-person" from (`session-form.tsx:98`) and what gates the interactive-video surface (`admin/.../sessions/[id]/page.tsx:206`). |
| `description` | `String?` | Nullable, shown to leaders and students. |
| `materialsPath` | `String?` | **Written by nothing and read by nothing in v1.** Grep across `src/**` outside the generated Prisma client returns no hits. Dead column. |
| `recurrenceGroupId` | `String?` | Sibling sessions created in one batch share it. `nanoid(8)`. **Not season-scoped** and carries no ordering or index-within-series. |
| `checkInToken` | `String? @unique` | Null until check-in is first opened. Possession authorises a check-in, so it is withheld from students. |
| `checkInOpenAt` | `DateTime?` | Set on open, never cleared. |
| `checkInClosedAt` | `DateTime?` | Set on close, cleared on (re)open. |
| `@@index([seasonId, startsAt])` | | Backs the per-season ascending list. |
| `@@index([recurrenceGroupId])` | | Backs the sibling lookup. |

There is **no `deletedAt`** on `Session` — deletion is a hard delete, unlike
`User` / `Season` / `StudentProfile` / `Assignment`.

### Relations traversed

- `Session.season` → `Season` for `code` / `title` on every list row, and
  `Season.status` + `Season.deletedAt` for the super calendar's filter.
- `Session.attendance` → `Attendance[]`, used **only** as `_count` to derive
  `attendanceMarked` (`src/lib/sessions-query.ts:43,54`). Cascade-deletes with
  the session (`schema.prisma:443`).
- `Session.videoQuestions`, `Session.videoProgress` — cascade-delete with the
  session (`schema.prisma:397,430`). Domain 13.
- `Session.quizzes` → `Quiz` with a **nullable** `sessionId` and
  `onDelete: SetNull` (`schema.prisma:648-649`) — a quiz survives its session's
  deletion, detached. Domain 12.
- `Assignment.sessionId` → `Session?` with `onDelete: SetNull`
  (`schema.prisma:468-469`) — deleting a session orphans its assignments rather
  than removing them.
- `SeasonEnrollment` — read by the reschedule notification to find recipients
  (`src/lib/session-actions.ts:156-159`) and by the attendance roster.

### Enums

`NotificationType.SESSION_RESCHEDULED` (`schema.prisma:66`) is the only enum
this domain writes. `AttendanceStatus` is read-only here (domain 4 owns it).
`SeasonStatus.ACTIVE` is read as a filter by the super calendar.

### Nullable in schema, treated as required in code

- `durationMinutes` has a schema default but is a required field in both the
  action schema (`session-actions.ts:23`) and the form
  (`session-form.tsx:37,186`) — no path can create a session without it.
- `location` is nullable and genuinely optional, but the *list* UI renders it
  unconditionally when set and the form labels it without a `required` flag
  (`session-form.tsx:222`) — it is correctly optional throughout. Flagged
  because the brief asked: **no nullable session field is treated as required
  by v1's UI.** The inverse is the real problem — see R22.

---

## 3. Business rules

`(implicit)` marks a rule enforced by a query's `where`, by a default value, or
by which page renders a control — not by an explicit check. Those are the ones
a port silently drops.

### Creation

- **R1.** Creating a session requires season-admin scope on the target season; SUPER always passes. — `src/lib/session-actions.ts:48` + `src/lib/rbac.ts:28-30`
- **R2.** Title must be 2–120 characters. — `src/lib/session-actions.ts:21`
- **R3.** `startsAt` is coerced to a `Date`; any string a JS `Date` accepts is accepted. — `src/lib/session-actions.ts:22`
- **R4.** `durationMinutes` must be an integer between 15 and 600 inclusive. — `src/lib/session-actions.ts:23`
- **R5.** `location` is optional and capped at 200 characters. — `src/lib/session-actions.ts:24`
- **R6.** `youtubeUrl`, when present, must parse as a URL — it is **not** validated as a YouTube URL. — `src/lib/session-actions.ts:25`
- **R7.** `description` is optional and capped at 2000 characters. — `src/lib/session-actions.ts:26`
- **R8.** A session has no stored end time; the end is derived as `startsAt + durationMinutes`. — `apps/backend/prisma/schema.prisma:368-369` (no end column) and `src/app/student/sessions/[id]/page.tsx:42-44`
- **R9.** `repeatWeeks` is clamped server-side to 1–26 regardless of what the client sends; absent means 1. — `src/lib/session-actions.ts:53`
- **R10.** A `recurrenceGroupId` is assigned only when the clamped count is greater than 1; a single session gets `null`. — `src/lib/session-actions.ts:54`
- **R11.** The group id is `nanoid(8)`. Nothing in v1 parses or validates its format. — `src/lib/session-actions.ts:6,54`
- **R12.** Occurrences are spaced exactly 7 days apart starting from the submitted `startsAt`, which is itself the first occurrence. — `src/lib/session-actions.ts:55` + `src/lib/recurrence.ts:11`
- **R13.** Occurrence spacing uses date-fns `addDays`, i.e. calendar-day arithmetic in the **server's** local timezone, so a series spanning a DST change preserves server-local wall-clock rather than a fixed 168-hour interval. — `src/lib/recurrence.ts:1,11`
- **R14.** A count below 1 yields a single occurrence at the start date rather than an empty series. — `src/lib/recurrence.ts:10`
- **R15.** All occurrences are created inside one transaction — a partial series is impossible. — `src/lib/session-actions.ts:57-76`
- **R16.** Every occurrence receives identical `title`, `durationMinutes`, `location`, `youtubeUrl`, `description`; only `startsAt` varies. — `src/lib/session-actions.ts:59-72`
- **R17.** Create returns only the id of the **first** occurrence; the sibling ids are discarded. — `src/lib/session-actions.ts:75`
- **R18.** *(implicit)* Two sessions in the same season may share the same `startsAt` — there is no uniqueness constraint and no overlap check. — no unique index at `apps/backend/prisma/schema.prisma:388-389`, no check at `src/lib/session-actions.ts:57-76`
- **R19.** *(implicit)* `startsAt` is never validated against the season's `startDate`/`endDate`; a session can be scheduled outside its own season. — absent from `src/lib/session-actions.ts:20-27` and `:57-76`
- **R20.** Create never writes `checkInToken`, `checkInOpenAt` or `checkInClosedAt`; they stay null until check-in is first opened. — `src/lib/session-actions.ts:59-72`

### Form-level rules the server does not repeat

- **R21.** *(implicit)* The form allows any title of 2 or more characters with **no upper bound**, while the action caps it at 120 — a 200-character title passes client validation and is rejected by the server. — `src/components/sessions/session-form.tsx:31` vs `src/lib/session-actions.ts:21`
- **R22.** *(implicit)* A session is either in-person **or** online, never both: the form nulls `youtubeUrl` when the type is in-person and nulls `location` when it is online. The server accepts both simultaneously. — `src/components/sessions/session-form.tsx:118-119` (create), `:131-132` (edit) vs `src/lib/session-actions.ts:20-27`
- **R23.** *(implicit)* "Session type" is not a stored field. On edit it is re-derived as `online` iff `youtubeUrl` is set. — `src/components/sessions/session-form.tsx:98`
- **R24.** *(implicit)* A new session defaults to 18:00 local time and 90 minutes. — `src/components/sessions/session-form.tsx:96-97`
- **R25.** *(implicit)* Start time is picked in 15-minute steps. — `src/components/sessions/session-form.tsx:180`
- **R26.** *(implicit)* Date and time are combined with `setHours` in the **browser's** timezone, with seconds and milliseconds zeroed. — `src/components/sessions/session-form.tsx:48-52,112`
- **R27.** *(implicit)* On edit, the time picker is seeded from `startsAt.getHours()/getMinutes()` — the *viewer's* local reading of the stored instant, not the author's. — `src/components/sessions/session-form.tsx:95`
- **R28.** *(implicit)* Recurrence can only be set at creation. The `repeatWeeks` control renders in create mode only; no edit path can add, extend, shorten or dissolve a series. — `src/components/sessions/session-form.tsx:245-258`
- **R29.** *(implicit)* The recurrence-scope selector renders only when editing a session that already has a `recurrenceGroupId`; otherwise the submitted scope is the default `"one"`. — `src/components/sessions/session-form.tsx:103,260`
- **R30.** *(implicit)* Creating redirects to the season calendar; editing redirects to the session's detail page. — `src/components/sessions/session-form.tsx:125,138`

### Update

- **R31.** The session must exist; a missing id returns `{ ok: false, error: "Session not found." }` rather than throwing. — `src/lib/session-actions.ts:103`
- **R32.** Authorization is checked against the **stored** `seasonId`, and no update path writes `seasonId` — a session cannot be moved between seasons. — `src/lib/session-actions.ts:104`, `:128-134`, `:141-148`
- **R33.** Siblings are loaded by `recurrenceGroupId` **alone, with no `seasonId` filter**, so the target set can span seasons. — `src/lib/session-actions.ts:111-114`
- **R34.** Siblings are only loaded when the session has a `recurrenceGroupId` **and** the scope is not `"one"`; otherwise the target set is the anchor alone. — `src/lib/session-actions.ts:109-116`
- **R35.** Scope `"one"` targets the anchor only. — `src/lib/recurrence.ts:24`
- **R36.** Scope `"all"` targets every session sharing the group id, past occurrences included. — `src/lib/recurrence.ts:25`
- **R37.** Scope `"future"` targets siblings whose `startsAt` is greater than **or equal to** the anchor's, so it always includes the anchor itself. — `src/lib/recurrence.ts:26`
- **R38.** `"future"` is evaluated against the anchor's **stored** `startsAt`, not the submitted one — the target set is decided before the move. — `src/lib/session-actions.ts:118`
- **R39.** Scope `"one"` writes the submitted `startsAt` verbatim. — `src/lib/session-actions.ts:124-135`
- **R40.** Scope `"future"` / `"all"` computes `delta = submitted − stored` and shifts **every** target by that delta, preserving each sibling's own spacing rather than assigning them all the same time. — `src/lib/session-actions.ts:137,144`
- **R41.** Series updates run in one transaction. — `src/lib/session-actions.ts:138-152`
- **R42.** Non-date fields are overwritten identically on every target; there is no per-occurrence override and no way to keep a sibling's distinct title or location. — `src/lib/session-actions.ts:141-148`
- **R43.** *(implicit)* An edit never adds, removes or re-spaces occurrences — no `create` or `delete` appears in either branch. — `src/lib/session-actions.ts:109-153`
- **R44.** *(implicit)* An edit never clears or reassigns `recurrenceGroupId`, even at scope `"one"` — a session detached in time stays a member of its series. — absent from `src/lib/session-actions.ts:128-134` and `:141-148`
- **R45.** A reschedule notification fires iff the submitted `startsAt` differs from the stored one by any amount, compared as an exact millisecond instant. — `src/lib/session-actions.ts:121,155`
- **R46.** Recipients are every student with an **ACTIVE** `SeasonEnrollment` in the **anchor's** season — not the seasons of the shifted siblings, and not narrowed to any group. — `src/lib/session-actions.ts:156-159`
- **R47.** Exactly one notification is sent per edit, regardless of how many occurrences moved. — `src/lib/session-actions.ts:161-169`
- **R48.** The notification title quotes the **new** title and the body renders the new time via `toLocaleString()` executed **on the server**, so recipients see the server's locale and timezone. — `src/lib/session-actions.ts:165-166`
- **R49.** The notification link is hardcoded to `/student/calendar` — it does not deep-link the session. — `src/lib/session-actions.ts:167`
- **R50.** The notification is suppressed per-recipient by the `sessionRescheduled` notification preference. — `src/lib/notifications.ts:62-75`
- **R51.** Each notification also triggers an email that is **not awaited** — `Promise.allSettled` is voided, so email failures are invisible and the action returns before they resolve. — `src/lib/notifications.ts:90-94`
- **R52.** The notification is emitted **after** the update transaction commits and is not itself transactional; a failure here leaves the schedule changed and nobody told. — `src/lib/session-actions.ts:153-171`

### Delete

- **R53.** Scope defaults to `"one"` when the caller omits it. — `src/lib/session-actions.ts:183`
- **R54.** A missing session returns silently with no error and no redirect. — `src/lib/session-actions.ts:196`
- **R55.** Deletion requires season-admin scope on the stored season. — `src/lib/session-actions.ts:197`
- **R56.** Sibling selection is identical to update's — same unscoped `recurrenceGroupId` lookup, same `siblingsInScope`. — `src/lib/session-actions.ts:199-207`
- **R57.** Deletion is a **hard** `deleteMany`; `Session` has no `deletedAt`. — `src/lib/session-actions.ts:209` + `apps/backend/prisma/schema.prisma:363-390`
- **R58.** Deleting a session cascade-deletes its `Attendance`, `SessionVideoQuestion` and `SessionVideoProgress` rows, but **detaches** rather than deletes its `Assignment` and `Quiz` rows, both of which have a nullable `sessionId` with `onDelete: SetNull`. — `apps/backend/prisma/schema.prisma:443,397,430` (cascade) vs `:469,649` (set null)
- **R59.** No confirmation, no count, and no warning is surfaced before a series delete — the action redirects straight to the season calendar. — `src/lib/session-actions.ts:211-213`
- **R60.** *(implicit)* **`deleteSessionAction` has no caller anywhere in v1.** No page, component or route imports it; no UI renders a delete control. Its behaviour has never run in production. — grep for `deleteSession` across `src/**` returns only its own definition at `src/lib/session-actions.ts:181`

### Check-in lifecycle (this domain; redemption is domain 4)

- **R61.** Opening check-in reuses the existing `checkInToken` and mints a new one only when it is null, so reopening does not invalidate a code already shown to a room. — `src/lib/session-actions.ts:239`
- **R62.** Opening sets `checkInOpenAt` to now and **clears** `checkInClosedAt`, so a closed session can be reopened and the 3-hour window restarts. — `src/lib/session-actions.ts:240-241`
- **R63.** Closing sets `checkInClosedAt` only; the token and `checkInOpenAt` survive. — `src/lib/session-actions.ts:265`
- **R64.** Regenerating replaces the token and touches neither timestamp — a code currently displayed stops working while check-in remains open. — `src/lib/session-actions.ts:286-289`
- **R65.** All three check-in lifecycle actions require **season admin**, not group leader. A leader can mark attendance but cannot open, close or regenerate. — `src/lib/session-actions.ts:234,261,284` vs `src/lib/auth/permissions.ts:98-116`
- **R66.** *(implicit, derived)* Check-in counts as open iff `checkInOpenAt` is set, `checkInClosedAt` is null, **and** less than 3 hours have elapsed since `checkInOpenAt`. The 3-hour constant is duplicated verbatim in four files and stored nowhere. — `src/components/sessions/calendar-list.tsx:7,13-16`; `src/app/admin/season/[code]/sessions/[id]/page.tsx:47-53`; `src/app/student/sessions/[id]/page.tsx:36-40`; `src/app/leader/sessions/[id]/page.tsx:33-38`
- **R67.** v1's own REST detail endpoint computes `checkInOpen` as `Boolean(openAt) && !closedAt` and **omits the 3-hour expiry**, so the API and the web pages disagree about the same session. — `src/app/api/v1/sessions/[id]/route.ts:59` vs R66
- **R68.** The QR payload is `${AUTH_URL}/checkin/${checkInToken}`; without a token there is no QR. — `src/app/admin/season/[code]/sessions/[id]/page.tsx:58-60`, `src/components/sessions/calendar-list.tsx:17`
- **R69.** `checkInToken` is globally unique across all sessions, which is what makes token-only redemption possible. — `apps/backend/prisma/schema.prisma:376`
- Boundary: *who may redeem a token, the PRESENT-vs-LATE decision, `lateMinutes`, and the "already checked in" rule* are domain 4 — `apps/backend/src/routes/sessions.ts:25-87`.

### Reads and ordering

- **R70.** The per-season list returns **every** session of the season with no date window, ordered by `startsAt` ascending. — `src/lib/sessions-query.ts:30-32`
- **R71.** `attendanceMarked` is derived, not stored: true iff at least one `Attendance` row exists for the session, regardless of status or of how many students it covers. — `src/lib/sessions-query.ts:43,54`
- **R72.** `checkInToken` is suppressed by an explicit `includeCheckInToken` flag that **defaults to including it** — omitting the option leaks the token. — `src/lib/sessions-query.ts:26-28,40,58`
- **R73.** *(implicit)* Students are the only role denied the token, and only because their two call sites happen to pass the flag. Leaders, mentors, admins and super all receive it; the leader session page fetches it and never renders it. — `src/app/student/calendar/page.tsx:30`, `src/app/student/sessions/[id]/page.tsx:27`, `src/app/api/v1/seasons/[id]/sessions/route.ts:24` vs `src/app/leader/calendar/page.tsx:39`, `src/app/leader/sessions/[id]/page.tsx:27`
- **R74.** The all-seasons list covers every session of every season whose status is `ACTIVE` **and** `deletedAt` is null; DRAFT, COMPLETED and ARCHIVED seasons are invisible on the super calendar. — `src/lib/sessions-query.ts:66`
- **R75.** The all-seasons list has **no date window and no pagination** and always includes the token. — `src/lib/sessions-query.ts:64-81`
- **R76.** `loadSessionById` performs **no authorization at all** and 404s via Next's `notFound()` when the row is missing; every one of its six callers gates separately. — `src/lib/sessions-query.ts:117-139`
- **R77.** Detail adds `description` and `youtubeUrl` over the list row and drops `attendanceMarked`. — `src/lib/sessions-query.ts:99-114` vs `:5-19`
- **R78.** *(implicit)* A student may open the detail page of any session in **any season they hold an ACTIVE enrollment in**, not only their active season — while their calendar only ever shows the active season. — `src/app/student/sessions/[id]/page.tsx:29-33` vs `src/app/student/calendar/page.tsx:30`
- **R79.** *(implicit)* A leader may open the detail page of any session in any season where they lead at least one group; the page then lists only their own groups' students. — `src/app/leader/sessions/[id]/page.tsx:29-31,40-59` + `src/lib/rbac.ts:36-51`
- **R80.** v1's REST list endpoint gates on `canAccessSeason`, which admits SUPER, MENTOR, the season's admins, leaders of a group in that season, and any student with **any** enrollment in it (active or not). — `src/app/api/v1/seasons/[id]/sessions/route.ts:19` + `src/lib/auth/permissions.ts:45-71`

### The five role calendars

They are **three distinct queries**, one redirect, and one page that is not a
session calendar at all.

- **R81.** Student: scoped to `activeSeasonId` only, token withheld. Past seasons never appear. — `src/app/student/calendar/page.tsx:14,30`
- **R82.** A student with no `activeSeasonId` sees an empty state and **no query is issued**. — `src/app/student/calendar/page.tsx:16-27`
- **R83.** Leader: the union of the seasons of the groups they lead, de-duplicated; token included. — `src/app/leader/calendar/page.tsx:14,32-36`
- **R84.** A leader who leads no groups sees an empty state and no query is issued. — `src/app/leader/calendar/page.tsx:16-30`
- **R85.** The leader list is fetched with one query per season and merged and sorted in JavaScript — an N+1 over seasons. — `src/app/leader/calendar/page.tsx:39-41`
- **R86.** `/admin/calendar` is a **redirect**, not a calendar: it resolves the newest `ACTIVE` non-deleted season by `startDate` descending, falls back to the newest non-deleted season of any status, and renders a bare "No active season found" page if neither exists. — `src/app/admin/calendar/page.tsx:16-40`
- **R87.** That redirect scopes candidate seasons to `seasonAdminIds` for ADMIN and leaves them unscoped for SUPER. — `src/app/admin/calendar/page.tsx:13-14`
- **R88.** The real admin calendar is per-season at `/admin/season/[code]/calendar` and additionally requires `canEditSeason`, redirecting to `/admin/season` otherwise. — `src/app/admin/season/[code]/calendar/page.tsx:24,27`
- **R89.** Super: every session of every active season, coloured by `seasonCode` against a 5-entry palette cycled by first-appearance order; the season legend renders only when a colour map is supplied. — `src/app/super/calendar/page.tsx:16,21-25` + `src/components/sessions/season-calendar.tsx:37-43,190-198`
- **R90.** Alumni: the "calendar" nav item renders **JPC events only** and issues no session query whatsoever. — `src/app/alumni/calendar/page.tsx:11,19`
- **R91.** *(implicit)* MENTOR has **no calendar** — there is no mentor calendar page and no `/calendar` entry in the mentor nav. — `packages/shared/src/navigation.ts:128-142` (ported verbatim from v1's `src/lib/navigation.ts`)
- **R92.** Every calendar merges sessions with JPC events into one surface; alumni-only events are included for every role except students. — `src/app/{admin/season/[code],leader,super}/calendar/page.tsx` (`includeAlumniOnly: true`) vs `src/app/student/calendar/page.tsx:31` (`false`). Rules for JPC events themselves are domain 15.

### Calendar presentation (needed to rebuild the screen)

- **R93.** Three views: Upcoming (agenda), Week, Month. Upcoming is the default. — `src/components/sessions/season-calendar.tsx:45-51,94`
- **R94.** Weeks start on Monday everywhere. — `src/components/sessions/season-calendar.tsx:53,403,407-408`
- **R95.** The initial anchor month is the month of the first session that is not past **or** is today; failing that, the month of the last session; failing that, the current month. — `src/components/sessions/season-calendar.tsx:95-100`
- **R96.** The empty state renders only when sessions **and** events are both empty. — `src/components/sessions/season-calendar.tsx:102-110`
- **R97.** Sessions are bucketed into days by `format(startsAt, "yyyy-MM-dd")` — the **viewer's local** calendar date of a UTC instant. — `src/components/sessions/season-calendar.tsx:112-116`
- **R98.** The agenda shows only entries at or after the **local** start of today; past sessions are reachable only by switching to Week or Month. — `src/components/sessions/season-calendar.tsx:236,239,242,251`
- **R99.** The agenda interleaves sessions and JPC events in one ascending time order, grouped under a day heading. — `src/components/sessions/season-calendar.tsx:237-244,256-260`
- **R100.** The day heading reads "Today" or "in N days", never a past distance. — `src/components/sessions/season-calendar.tsx:273-276`
- **R101.** Month view dims days outside the anchor month to 40% opacity. — `src/components/sessions/season-calendar.tsx:423,432`
- **R102.** Session chip colour: green if today, muted if past, teal otherwise — overridden entirely by the season palette when one is supplied, which drops the today/past distinction on the super calendar. — `src/components/sessions/season-calendar.tsx:60-67`
- **R103.** The session link target is a caller-supplied template with `{id}` and `{seasonCode}` placeholders; the super calendar points at the **admin** session route. — `src/components/sessions/season-calendar.tsx:84-86` and `src/app/super/calendar/page.tsx:36`
- **R104.** In the flat list variant, the status badge is: `Today` if today, else if past `Attendance marked` / `Attendance pending` by `attendanceMarked`, else `Upcoming`. — `src/components/sessions/calendar-list.tsx:36-46`

### Time handling — the cross-cutting rules

- **R105.** Only a UTC instant is stored. No timezone column, no all-day flag, no per-season timezone. — `apps/backend/prisma/schema.prisma:368`
- **R106.** The wall-clock is authored in the **admin's browser** timezone (R26) and rendered in **each viewer's** timezone (R97, and `format()` throughout `season-calendar.tsx`). Two users in different timezones see different times, and potentially different days, for the same session. Nothing in v1 reconciles this.
- **R107.** Recurrence spacing is computed in the **server's** timezone (R13) while the first occurrence was authored in the browser's — the two can disagree across a DST boundary.
- **R108.** *(implicit)* v1 compares a UTC instant against a local date in three places: the agenda window (`season-calendar.tsx:236,239`), the day-bucket key (`:114`), and the today/past chip and badge tests (`:64-65`, `calendar-list.tsx:37-38`). All three are client-side and re-evaluate on hydration, so a server-rendered "Upcoming" list can differ from what the client then shows.
- **R109.** Instant-vs-instant comparisons elsewhere are correct and should be preserved as-is — e.g. engagement counts past sessions with `startsAt <= now`. — `src/lib/engagement.ts:26-30`

---

## 4. Authorization

Role gates are pure functions over token claims (`rbac.ts`); row-scoped gates
need a database read (`permissions.ts`).

| Operation | Roles | Row-scoped condition | v1 citation |
|---|---|---|---|
| Create session | ADMIN, SUPER | `isAdminOfSeason(user, seasonId)` — SUPER short-circuits true | `src/lib/session-actions.ts:48`, `src/lib/rbac.ts:28-30` |
| Update session | ADMIN, SUPER | `isAdminOfSeason` on the session's **stored** season | `src/lib/session-actions.ts:104` |
| Delete session | ADMIN, SUPER | `isAdminOfSeason` on the stored season | `src/lib/session-actions.ts:197` |
| Open check-in | ADMIN, SUPER | `isAdminOfSeason` | `src/lib/session-actions.ts:234` |
| Close check-in | ADMIN, SUPER | `isAdminOfSeason` | `src/lib/session-actions.ts:261` |
| Regenerate check-in token | ADMIN, SUPER | `isAdminOfSeason` | `src/lib/session-actions.ts:284` |
| Read season session list (web) | ADMIN, SUPER | `canEditSeason` — page-level, redirects to `/admin/season` | `src/app/admin/season/[code]/calendar/page.tsx:24,27` |
| Read season session list (REST) | any authenticated | `canAccessSeason` — SUPER, MENTOR, season admin, leader of a group in the season, or a student with **any** enrollment | `src/app/api/v1/seasons/[id]/sessions/route.ts:19`, `src/lib/auth/permissions.ts:45-71` |
| Read own-season session list | STUDENT | `activeSeasonId` only, hardcoded — **no gate function involved** | `src/app/student/calendar/page.tsx:30` |
| Read led-seasons session list | LEADER | seasons derived from `groupLeaderIds` — **no gate function involved** | `src/app/leader/calendar/page.tsx:32-36` |
| Read all-active-seasons list | SUPER | none beyond `requireRole(["SUPER"])` | `src/app/super/calendar/page.tsx:13` |
| Read session detail (lib) | — | **none** — `loadSessionById` is ungated | `src/lib/sessions-query.ts:117-139` |
| Read session detail (student page) | STUDENT | own ACTIVE `SeasonEnrollment` in the session's season, else `notFound()` | `src/app/student/sessions/[id]/page.tsx:29-33` |
| Read session detail (leader page) | LEADER | `isLeaderInSeason`, else `notFound()` | `src/app/leader/sessions/[id]/page.tsx:29-31` |
| Read session detail (admin page) | ADMIN, SUPER | `canEditSeason` **plus** an explicit `session.seasonId === season.id` check that redirects on mismatch | `src/app/admin/season/[code]/sessions/[id]/page.tsx:42,45` |
| Read session detail (REST) | any authenticated | `canAccessSeason` | `src/app/api/v1/sessions/[id]/route.ts:35` |
| Receive `checkInToken` | everyone except STUDENT | flag-based, default *include* | `src/lib/sessions-query.ts:26-28` |
| Read/write attendance | — | `canMarkAttendance` — **domain 4** | `src/lib/auth/permissions.ts:98-116` |

### Where v1 enforces nothing and relies on the UI

These become real gates in v2:

1. **`loadSessionById` has no authorization** (R76). Six callers each gate
   independently and one of them — the admin detail page — needs a *second*
   check (`session.seasonId !== season.id`) because the URL carries a season
   code that the loader ignores. In v2 the season-scope check belongs inside
   the endpoint, not in each screen.
2. **Delete has no UI** (R60), so its "series delete with no confirmation"
   behaviour (R59) has never been exercised. v2 must design the confirmation
   rather than port the absence of one.
3. **Recurrence scope is a client-supplied string with no server-side check
   that the session is actually part of a series.** A caller sending
   `scope: "all"` for a non-recurring session is handled only because the
   `recurrenceGroupId &&` guard short-circuits (R34). In v2, validate the
   combination explicitly.
4. **The student calendar's "active season only" rule lives in a page, not a
   gate** (R81). The REST list endpoint is far more permissive (R80). v2 has
   one endpoint serving both, so the narrower rule must move into the query.
5. **The 3-hour check-in expiry lives in four page files** (R66) and is absent
   from the REST layer (R67). It must become one server-side rule.

---

## 5. Read surface

### `listSessionsForSeason(seasonId, { includeCheckInToken })` — `src/lib/sessions-query.ts:26-62`

Returns `SessionListRow[]`: `id`, `title`, `startsAt`, `durationMinutes`,
`location`, `recurrenceGroupId`, `attendanceMarked`, `seasonId`, `seasonCode`,
`seasonTitle`, `checkInToken`, `checkInOpenAt`, `checkInClosedAt`.

- Ordering: `startsAt` ascending, backed by `@@index([seasonId, startsAt])`.
- Window: none. Every session of the season, past included.
- Per-role shape: identical except `checkInToken`, which is nulled for students.
  Note `checkInToken: includeCheckInToken` in the Prisma `select` means the
  column is not even fetched when false — a genuine suppression, not a mask.
- Not an N+1: `_count` and the `season` join are one query.
- Returns more than any page renders: the calendar renders the current view's
  slice, the agenda renders only future entries (R98).

### `listSessionsForAllActiveSeasons()` — `src/lib/sessions-query.ts:64-97`

Same row shape. Filters on `season.status === "ACTIVE" && season.deletedAt === null`,
orders by `startsAt` ascending, **always** includes the token, and has no date
window or limit. On a mature database this returns every session of every live
season in one array — the single least mobile-friendly read in the domain.

### `loadSessionById(id, { includeCheckInToken })` — `src/lib/sessions-query.ts:117-156`

Adds `description` and `youtubeUrl`, drops `attendanceMarked`. `notFound()` on a
missing row (R76). No authorization.

### `loadAttendanceRoster(sessionId, groupIds?)` — `src/lib/sessions-query.ts:168-210`

Lives in this file but its rules belong to **domain 4**. Two sequential queries
(enrollments, then attendance) joined in memory; ordered by group name then
student name; scoped to `EnrollmentStatus.ACTIVE`. The optional `groupIds` is
what makes a leader see only their own groups
(`src/app/leader/sessions/[id]/attendance/page.tsx:23`) — and it is **not**
passed by the admin page, by v1's REST endpoint, or by v2's.

### Per-page reads that bypass the query module

Two pages hand-roll their own enrollment + attendance query instead of using
`loadAttendanceRoster`:

- `src/app/admin/season/[code]/sessions/[id]/page.tsx:65-87` — all ACTIVE
  enrollees with a filtered `attendanceRecords` relation, ordered by name.
- `src/app/leader/sessions/[id]/page.tsx:40-59` — `groupStudent` rows for the
  leader's own groups, **unordered**.

Both use `attendanceRecords[0]`, silently relying on the `@@unique([sessionId,
studentUserId])` constraint to guarantee at most one row. v2 should serve both
from the roster endpoint rather than reproducing two more queries.

---

## 6. Write surface

### `createSessionAction(seasonId, input)` — `src/lib/session-actions.ts:43-83`

- **Inputs:** `title`, `startsAt`, `durationMinutes`, `location?`, `youtubeUrl?`,
  `description?`, `repeatWeeks?`.
- **Validation:** R2–R7. Zod errors are flattened to a `fieldErrors` map keyed
  by dotted path, first issue per field wins (`:216-223`).
- **Writes:** 1–26 `Session` rows in one transaction, all sharing a
  `recurrenceGroupId` when more than one.
- **Cascades:** none.
- **Notifies:** nothing. A new session — including a 26-week series — generates
  no notification, unlike a reschedule.
- **Returns:** `{ ok: true, sessionId }` where `sessionId` is the first
  occurrence only (R17).
- **Atomicity:** good.

### `updateSessionAction(sessionId, input)` — `src/lib/session-actions.ts:89-179`

- **Inputs:** the same six fields plus `scope: "one" | "future" | "all"`.
- **Validation:** identical to create. No validation of `scope` against whether
  the session actually has a series.
- **Writes:** one `Session` update, or N updates in one transaction.
- **Cascades:** none — attendance rows survive a reschedule untouched, so a
  session moved after attendance was marked keeps its records.
- **Notifies:** `SESSION_RESCHEDULED` to ACTIVE enrollees when the start time
  changed (R45–R52).
- **Returns:** `{ ok: true }` — **not** the affected ids. `targetIds` is
  computed and then discarded with `void targetIds` at `:177`; the caller cannot
  tell how many occurrences moved.
- **Non-atomic:** the notification (`:155-171`) runs **after** and outside the
  update transaction. A failure there leaves rescheduled sessions with no
  notification and no retry (R52). The emails inside `createNotificationsBulk`
  are additionally fire-and-forget (R51).

### `deleteSessionAction(sessionId, scope = "one")` — `src/lib/session-actions.ts:181-214`

- **Inputs:** id and scope.
- **Writes:** one `deleteMany` over the target ids — atomic as a single
  statement.
- **Cascades:** R58 — attendance, video questions and video progress are
  destroyed; assignments and quizzes are detached, not deleted.
- **Notifies:** nothing. Students enrolled in a deleted session's season are
  never told, even though a reschedule of the same session would notify them.
- **Returns:** `void`, then `redirect()`.
- **Unreachable in v1** (R60).

### `openCheckInAction` / `closeCheckInAction` / `regenerateCheckInTokenAction` — `src/lib/session-actions.ts:225-295`

- Each is a single-row update; all three are atomic.
- `openCheckInAction` does a read-then-write of `checkInToken` without a
  transaction (`:228-243`) — two concurrent opens could each mint a token, and
  the second write wins. The `@unique` constraint on `checkInToken` does not
  prevent this, it only prevents collision across sessions.
- None of the three notify. None return the token to the caller in v1; the page
  re-reads it after `revalidatePath`. v2's ported endpoint **does** return it
  (`apps/backend/src/routes/sessions.ts:231`).

### Session writes outside this module

`duplicateSeasonAction` (`src/lib/season-actions.ts:306-320`) creates sessions
directly inside the season-duplication transaction, shifting `startsAt` by a
fixed offset (`:274`) and copying `recurrenceGroupId` **verbatim**. It bypasses
`sessionSchema` entirely. See section 10, item 1.

---

## 7. Proposed API

Envelope per `CLAUDE.md`: `{ "data": ... }` / `{ "error": { "code", "message" } }`.

| Method | Path | Status | Auth | Request | Response |
|---|---|---|---|---|---|
| GET | `/api/v1/seasons/:id/sessions` | **exists** — `apps/backend/src/routes/seasons.ts:136-148` | `canAccessSeason` | — | `{ sessions: SessionListItem[] }` |
| GET | `/api/v1/sessions/:id` | **partial** — `apps/backend/src/routes/sessions.ts:89-144` | `canAccessSeason` | — | `SessionDetail`; see gaps below |
| GET | `/api/v1/sessions` | **new** | any authenticated; result set derived from role | `?from`, `?to`, `?seasonIds` (optional; role decides the default set) | `{ sessions: SessionListItem[] }` |
| POST | `/api/v1/seasons/:id/sessions` | **new** | `isAdminOfSeason` | create body incl. `repeatWeeks` | `{ session: SessionDetail, seriesIds: number[] }` |
| PATCH | `/api/v1/sessions/:id` | **new** | `isAdminOfSeason` | update body + `scope` | `{ affectedIds: number[], notified: number }` |
| DELETE | `/api/v1/sessions/:id` | **new** | `isAdminOfSeason` | `?scope=one\|future\|all` (**required**, no default) | `{ deletedIds: number[] }` |
| GET | `/api/v1/sessions/:id/series` | **new** | `isAdminOfSeason` | `?scope=` | `{ siblings: SessionSeriesItem[] }` — powers the "this will change N sessions" confirmation |
| POST | `/api/v1/sessions/:id/check-in-open` | **exists** — `apps/backend/src/routes/sessions.ts:207-232` | `isAdminOfSeason` | — | `{ checkInToken }` |
| POST | `/api/v1/sessions/:id/check-in-close` | **exists** — `apps/backend/src/routes/sessions.ts:234-254` | `isAdminOfSeason` | — | `{ closed: true }` |
| POST | `/api/v1/sessions/:id/check-in-token` | **new** | `isAdminOfSeason` | — | `{ checkInToken }` — ports `regenerateCheckInTokenAction`, which has no REST equivalent in v1 |
| GET | `/api/v1/sessions/:id/attendance` | exists — **domain 4** | `canMarkAttendance` | — | `{ roster }` |
| POST | `/api/v1/sessions/:id/attendance` | exists — **domain 4** | `canMarkAttendance` | entries | `{ saved }` |
| POST | `/api/v1/sessions/check-in` | exists — **domain 4** | authenticated student | `{ token }` | `{ status, minutesLate }` |

### Where the existing shapes do not match what the screens need

Three gaps in `GET /api/v1/sessions/:id`
(`apps/backend/src/routes/sessions.ts:89-144`). All three are faithful ports of
v1's `src/app/api/v1/sessions/[id]/route.ts`, which itself disagrees with v1's
web pages — so fixing them is a deliberate divergence, not a port error.

1. **No `checkInToken` for anyone.** The comment at
   `apps/backend/src/routes/sessions.ts:94-96` withholds it because detail is
   readable by every season member. But the admin session screen's whole
   purpose is rendering the QR (R68), and v1's admin page got the token from
   `loadSessionById`'s default (`src/lib/sessions-query.ts:119`). Today the
   only way for a v2 admin to obtain a token is to call `check-in-open` again —
   which is safe (R61 reuses it) but means the QR cannot be shown after an app
   restart without re-opening. **Add a role-conditional `checkInToken` to the
   detail response using the same rule as the list** (`includeCheckInToken:
   user.role !== "STUDENT"`), rather than adding a second endpoint.
2. **`checkInOpen` omits the 3-hour expiry** (R67). A session opened three days
   ago and never closed reports `checkInOpen: true` from the API while every v1
   page reports it closed. Fix in place and add `checkInExpiresAt` so the screen
   can render v1's "Closes at 9:12 PM" line
   (`src/app/admin/season/[code]/sessions/[id]/page.tsx:54-57,260-264`).
3. **No `attendanceMarked`.** The list row carries it (R71) and the detail
   screen's "Attendance pending / marked" badge (R104) needs it. Add it to the
   detail rather than making the screen fetch the list.

One gap already shipped, owned by domain 4, flagged here because it lives in
this route file: **`GET /api/v1/sessions/:id/attendance` calls
`loadAttendanceRoster(sessionId)` with no `groupIds`**
(`apps/backend/src/routes/sessions.ts:157`), so a LEADER receives every enrolled
student's name and email for the whole season. v1's leader attendance page
passes `user.groupLeaderIds` (`src/app/leader/sessions/[id]/attendance/page.tsx:23`).
v1's own REST endpoint has the same gap
(`src/app/api/v1/sessions/[id]/attendance/route.ts:28`), so v2 ported it
faithfully. Domain 4 should decide; it is a data-exposure widening either way.

### Why `GET /api/v1/sessions` is new rather than reusing the season route

Three of the five v1 calendars are not single-season: the leader calendar is a
union fetched as an N+1 (R85), the super calendar is all-active-seasons and
unbounded (R75), and the admin calendar is a redirect that picks one season by
a rule the client should not have to reimplement (R86–R87). One list endpoint
with a role-derived default season set and a `from`/`to` window replaces all
three and is the only way the super calendar is viable on a phone.

---

## 8. Proposed shared contracts

Target file: `packages/shared/src/session.ts` (already exists, 64 lines).

### Existing — reuse as-is

- **`sessionListItemSchema`** (`packages/shared/src/session.ts:7-25`) is
  **sufficient for the calendar list** and needs no change. It is the reference
  example for the whole migration: every field is Zod, timestamps are `string`
  (wire shape, per the note in `season.ts:1-8`), and the `checkInToken`
  null-for-students behaviour is documented in the schema itself
  (`:18-22`) rather than left to the endpoint. That doc comment is the contract
  for R72/R73 and must survive.
  - What it *lacks* is nothing for the list view, but note it exposes the raw
    `checkInOpenAt`/`checkInClosedAt` and no derived state — so every consumer
    must reimplement R66's three-part test. Rather than change the list row,
    put the derivation in one shared helper (a plain function, not a schema)
    that both the calendar list and the detail screen call.
- **`checkInRequestSchema`** (`:63-64`) belongs to domain 4; do not redefine.
- **`AttendanceStatus`** from `packages/shared/src/enums.ts` — reuse, do not
  redeclare the three-value union that `sessions-query.ts:163` inlines.

### Existing bare interfaces — convert to Zod as part of this domain

Per the convention in `CLAUDE.md` ("Domain contracts are Zod, not bare
interfaces… the remaining interfaces predate this and should convert as each
domain lands"):

- **`SessionDetail`** (`packages/shared/src/session.ts:35-51`) → `sessionDetailSchema`.
  Same fields, plus the three additions from section 7: a nullable
  `checkInToken` (staff-only), a nullable `checkInExpiresAt`, and
  `attendanceMarked`. `checkInOpen` stays but must mean R66, not R67.
- **`MyAttendance`** (`:28-33`) → `myAttendanceSchema`. Domain 4 owns its rules;
  it converts here because it is nested inside `SessionDetail`.
- **`AttendanceRosterRow`** (`:53-61`) → domain 4's call. Leave it if that spec
  claims it; do not convert it twice.

### New schemas this domain needs

| Name | Fields | Notes |
|---|---|---|
| `recurrenceScopeSchema` | enum `one` \| `future` \| `all` | The single source for R35–R37. Both request schemas and the series endpoint reference it. |
| `createSessionRequestSchema` | `title` (2–120), `startsAt` (ISO string), `durationMinutes` (int 15–600), `location` (nullable, ≤200), `youtubeUrl` (nullable, URL), `description` (nullable, ≤2000), `repeatWeeks` (int, default 1, **clamped 1–26 server-side per R9 — reject rather than clamp in v2**) | Mirrors R2–R7, R9. Must additionally encode R22 (in-person XOR online) as a refinement, since v1 only enforces it in the form. |
| `updateSessionRequestSchema` | the same six fields, plus `scope` | Must refine: `scope` other than `one` is only valid when the session has a `recurrenceGroupId` (closes the hole under R34). |
| `deleteSessionQuerySchema` | `scope`, **required** | Removes v1's silent `"one"` default (R53). |
| `sessionSeriesItemSchema` | `id`, `startsAt`, `isAnchor`, `attendanceMarked` | Feeds the "this will change N sessions, N of which already have attendance" confirmation the mobile app needs and v1 never had (R59). |
| `sessionWriteResponseSchema` | `affectedIds: number[]`, `notified: number` | Fixes R17 and the discarded `targetIds` at `session-actions.ts:177` — the client must be able to invalidate every affected session's cache entry. |
| `sessionListQuerySchema` | `from?`, `to?`, `seasonIds?` | For the new `GET /api/v1/sessions`. |

### Client-side query keys

`apps/mobile/src/lib/query-keys.ts:22-32` currently has one factory,
`sessions.bySeason(seasonId)`. This domain adds `sessions.detail(id)`,
`sessions.series(id)`, and `sessions.range(params)` for the cross-season list.
Because a series edit touches N sessions across potentially several list
queries, the mutation must invalidate `queryKeys.sessions.all` rather than a
single leaf — which is exactly what the hierarchy documented at
`query-keys.ts:1-21` was built for.

---

## 9. Screens

The v2 tree is flat: one route per destination with role branches inside. Five
v1 calendar files collapse into one `/calendar`.

| v1 page(s) | v2 route | Exists? | Roles | Notes |
|---|---|---|---|---|
| `student/calendar`, `leader/calendar`, `admin/calendar`, `admin/season/[code]/calendar`, `super/calendar`, `alumni/calendar` | `/calendar` | **placeholder** — `apps/mobile/app/(app)/calendar.tsx` renders only an `EmptyState` | STUDENT, LEADER, ADMIN, SUPER, ALUMNI | Six files, five branches. See below. |
| `admin/season/[code]/sessions/[id]`, `student/sessions/[id]`, `leader/sessions/[id]` | `/sessions/[id]` | **does not exist** | all except MENTOR | Three v1 pages, one route, three content branches. |
| `admin/season/[code]/calendar/new` | `/sessions/new` | **does not exist** | ADMIN, SUPER | Needs a season param; defaults to the active season (R86 logic, moved server-side). |
| `admin/season/[code]/sessions/[id]/edit` | `/sessions/[id]/edit` | **does not exist** | ADMIN, SUPER | Must render the scope selector only when `recurrenceGroupId` is set (R29) and must show the series-impact preview before submitting. |
| `admin/season/[code]/sessions/[id]/attendance`, `leader/sessions/[id]/attendance` | `/sessions/[id]/attendance` | **does not exist** | ADMIN, SUPER, LEADER | Route belongs to this domain's tree; its contents are **domain 4**. |
| `admin/season/[code]` (Sessions tab) | `/season` (sessions section) | exists as a stub — `apps/mobile/app/(app)/season.tsx` | ADMIN, STUDENT | Consumes the same list endpoint; list variant with status badges (R104). |
| `/checkin/[token]` (QR landing) | — | — | STUDENT | **Domain 4.** Not a session screen. |

### What branches inside `/calendar`

| Role | Data | Branch behaviour |
|---|---|---|
| STUDENT | `GET /seasons/:activeSeasonId/sessions`, token withheld | Empty state and **no fetch** when `activeSeasonId` is null (R82). Must pass `enabled` per the mobile convention — `apps/mobile/src/hooks/use-sessions.ts:27-32` already does exactly this and is the pattern to follow. |
| LEADER | `GET /sessions` with the led-season set | Empty state when they lead no groups (R84). Replaces the N+1 (R85). |
| ADMIN | `GET /sessions` scoped to `seasonAdminIds` | Needs a season switcher: v1 forced a single season via the redirect (R86–R87). On mobile, resolve the default server-side and let the user change it, rather than porting a redirect. |
| SUPER | `GET /sessions` over all ACTIVE seasons + `from`/`to` window | Season colour legend (R89). The window is a **required** divergence — R75 is unbounded. |
| ALUMNI | JPC events only, **no session fetch** (R90) | The alumni nav labels this destination "Events" (`packages/shared/src/navigation.ts:154`), so the screen title branches too. |
| MENTOR | — | No `/calendar` in the mentor nav (R91). The route is reachable by deep link, so it needs a graceful "not available for your role" state rather than a crash. |

Shared by every branch, from R93–R104: three views (Upcoming default, Week,
Month), Monday-first weeks, local-date day bucketing, the "at or after local
start of today" agenda window, the initial-anchor-month rule, and the
today/past/future chip colouring. Sessions and JPC events (domain 15) render in
one merged stream (R92, R99) — the calendar screen depends on both domains and
should not ship its final form until domain 15's contract exists.

---

## 10. Open questions and divergences

Ordered by how much damage a faithful port would do.

### 1. `recurrenceGroupId` is not season-scoped, and season duplication copies it — **decide before writing any recurrence code**

`duplicateSeasonAction` copies each source session's `recurrenceGroupId`
verbatim into the new season's sessions
(`src/lib/season-actions.ts:306-317`). Both `updateSessionAction`
(`src/lib/session-actions.ts:111-114`) and `deleteSessionAction`
(`:201-205`) then select siblings with `where: { recurrenceGroupId }` and **no
`seasonId` filter** (R33, R56).

The consequence: after duplicating a season, editing a recurring session in the
new season with scope `"all"` rewrites the *original* season's sessions too —
retitling them, shifting them by the same delta, and, in the delete case,
destroying them along with their attendance records (R58). It works in the
reverse direction as well. Nothing in v1 prevents or warns about this.

**Recommendation:** in v2, scope the sibling lookup by `seasonId`
unconditionally. This is a deliberate behavioural divergence, not a port error,
and it should be stated as such in the implementation. Separately, decide
whether `duplicateSeasonAction` (domain 2) should mint fresh group ids —
recommended, and the two changes are independent.

### 2. `deleteSessionAction` is unreachable, so its semantics are unproven

R60: nothing in v1 calls it. Its defaults were never exercised — scope silently
defaults to `"one"` (R53), a missing session returns silently (R54), a series
delete gives no confirmation and no count (R59), and it destroys attendance
history (R58) without notifying anyone, while a mere *reschedule* of the same
session does notify (R45).

**Recommendation:** ship delete, but do not port the shape. Make `scope`
required (no default), return the deleted ids, and gate the destructive scopes
behind the `GET /sessions/:id/series` preview so the confirmation can say "this
deletes 14 sessions, 6 of which have attendance recorded." Decide whether
deleting a session with existing attendance should be blocked outright rather
than cascading — recommended for anything in the past.

### 3. `scope: "future"` is anchored on the stored time while the write moves it

R37–R40: the target set is `startsAt >= anchor.startsAt` computed from the
**stored** value, then every target is shifted by the delta. Moving a session
*earlier* therefore does not pick up occurrences that fall between the new and
old times — they were before the old anchor and are excluded. Moving it *later*
can slide the shifted anchor past siblings that were not in the target set,
producing an out-of-order series.

v1 never wrote this down and there are no tests. **Recommendation:** state the
intended semantics explicitly in the v2 implementation (recommended:
"future" = the anchor and every sibling scheduled at or after it, evaluated
before the move — i.e. preserve v1's behaviour) and add a test for the
move-earlier case, because a reimplementer will otherwise guess.

### 4. The 3-hour check-in window is a magic number in four files and absent from the API

R66 vs R67: v1's four page files apply a 3-hour expiry; v1's own REST endpoint
does not, and v2 ported the REST version
(`apps/backend/src/routes/sessions.ts:140`). So v2's session detail currently
reports check-in open for a session opened three days ago — while the *redemption*
endpoint correctly enforces the same 3 hours
(`apps/backend/src/routes/sessions.ts:42-44`). The API contradicts itself:
`GET /sessions/:id` says open, `POST /sessions/check-in` says closed.

**Recommendation:** one exported constant, one derivation, used by the detail
response, the list-row helper and the redemption check. Return
`checkInExpiresAt` so the screen can render the countdown v1 showed
(`src/app/admin/season/[code]/sessions/[id]/page.tsx:54-57`).

### 5. No timezone is stored anywhere — **needs a product decision**

R105–R108. The wall-clock is authored in the admin's browser timezone,
recurrence spacing is computed in the *server's*, and everything is displayed in
each *viewer's*. Three timezones, none recorded. On the web this mostly went
unnoticed because staff and students shared a timezone. On mobile, a phone
crossing a timezone silently re-renders every session at a different hour, and
day-bucketing (R97) can move a session to a different calendar day.

**Recommendation:** decide whether a season carries an IANA timezone. If yes it
is a schema change and therefore blocked while the database is shared with v1
(`CLAUDE.md`: no migrations here) — so the interim answer is to pick one
convention (recommended: render every session in a season-level timezone
supplied by config, not by the device) and document it. This decision must be
made before the calendar screen is built; it is not retrofittable.

### 6. The reschedule notification is formatted on the server, in the server's locale

R48: `parsed.data.startsAt.toLocaleString()` at
`src/lib/session-actions.ts:166` runs in Node, so every recipient sees the
server's locale and timezone regardless of their own. The link is also
hardcoded to `/student/calendar` (R49), which is not a v2 route and does not
deep-link the session.

**Recommendation:** send the ISO instant in a structured payload and format on
the client; set the link to the v2 `/sessions/[id]` route. Coordinate with
domain 10, which owns the notification payload shape.

### 7. Client and server validation disagree on title length

R21: the form allows an unbounded title, the action caps it at 120. On the web
this surfaced as a server-side field error; on mobile it is a wasted round trip.
**Recommendation:** the shared Zod schema is the single source and both sides
consume it — which is the entire point of `packages/shared`.

### 8. In-person XOR online exists only in the form

R22: the exclusivity is enforced by the form nulling one field or the other. The
action accepts both `location` and `youtubeUrl` simultaneously, and any
non-form caller (including `duplicateSeasonAction`) can create such a row. The
detail screen then shows an "Online" badge *and* a location.
**Recommendation:** encode it as a refinement on the shared request schema so
the rule survives outside the form.

### 9. Regenerating the token silently breaks a QR that is currently displayed

R64: regenerate touches neither timestamp, so check-in stays open with a code
that no longer matches the projected QR. v1 offered the button next to the QR
with no warning
(`src/app/admin/season/[code]/sessions/[id]/page.tsx:223-233`).
**Recommendation:** confirm before regenerating while check-in is open, and
state that anyone holding the old code will be rejected.

### 10. The super calendar is unbounded

R75: every session of every active season, no window, no pagination, always
including check-in tokens. Acceptable on a server-rendered desktop page,
not on a phone. **Recommendation:** the new `GET /api/v1/sessions` takes a
required-in-practice `from`/`to` window defaulting to the visible month, and the
super calendar drives it from the view's date range.

### 11. `startsAt` is never checked against the season's date range

R19. A season running Jan–Jun accepts a session in November, and a 26-week
recurrence started near the season's end silently runs past `endDate`.
**Recommendation:** warn rather than reject (v1 admins may rely on the
looseness), but surface it — a 26-week series is where this bites.

### 12. `materialsPath` is a dead column

Section 2. Written by nothing, read by nothing. **Recommendation:** leave it
alone — the database is shared with v1 and no migration may be created here —
but omit it from every v2 contract so it does not acquire accidental meaning.

### 13. `nanoid` cannot be used for `recurrenceGroupId` in v2

R11. v1 uses `nanoid(8)`; `CLAUDE.md` records that nanoid v5 is ESM-only and
throws `ERR_REQUIRE_ESM` under this backend's CommonJS build, which is why
`lib/public-id.ts` reimplements it over `node:crypto`. Nothing in v1 parses the
group id's format or length. **Recommendation:** generate it with the existing
`newPublicId()` (10 chars) rather than adding a second generator; the extra two
characters are unobservable. Do not reintroduce `nanoid`.

### 14. Student calendar and student session detail disagree on scope

R78: the calendar shows the active season only, while the detail page admits any
season the student is actively enrolled in. Harmless in v1 because nothing links
to the wider set, but a v2 deep link or a notification could reach it.
**Recommendation:** pick one — recommended: allow detail for any ACTIVE
enrollment (the more permissive current behaviour), and say so explicitly rather
than leaving it as an accident of two different call sites.

### 15. The reschedule notification targets the wrong season on a cross-season series edit

R46 combined with R33: recipients are drawn from the **anchor's** season, but a
series edit can shift sessions in another season entirely (item 1). Fixing item
1 resolves this; noted separately so it is not missed if item 1 is deferred.
