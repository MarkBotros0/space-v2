# Domain 04 — Attendance & check-in

> Status: draft · Phase: 1–2 · v1 API status: **partial** (the migration design
> lists this domain as "done"; see §7 — the transport is ported, three
> operations and one authorization narrowing are not)

This domain owns the `Attendance` row: how it is created, by whom, with what
status, and what it notifies. It also owns the QR check-in flow end to end —
the token, the open/close window, and the scan write.

**Boundary with domain 3 (Sessions).** Domain 3 owns `Session` creation,
scheduling, recurrence, and the session's own fields. This domain owns
`Session.checkInToken`, `Session.checkInOpenAt` and `Session.checkInClosedAt` —
they live on the `Session` model but every rule that reads or writes them is an
attendance rule. Where domain 3 defines a read (`GET /sessions/:id`,
`GET /seasons/:id/sessions`), this domain defines only which attendance-bearing
fields that read may carry and to whom (R36–R38, R47).

**Boundary with domain 9 (Notes/engagement).** `computeAttendanceBudget` lives
in `src/lib/engagement.ts` and is consumed by the student dashboard and the
leader student detail page. It is *derived entirely from* `Attendance` rows and
two `Season` fields, so its formula is restated here (R75–R77) because the port
must not change the meaning of `lateMinutes`. The screens that render it belong
to domains 9 and 17.

**Boundary with domain 10 (Notifications).** This domain owns the *trigger* and
the *recipient set* for `LOW_ATTENDANCE_FLAG` (R63–R74). Domain 10 owns
delivery, preferences and the notification inbox.

---

## 1. v1 source

| File | Holds |
|---|---|
| `src/lib/attendance-actions.ts` | All three writes: `saveAttendanceAction` (batch manual marking, `:35-80`), `checkInByTokenAction` (the scan write, `:95-180`), `manualOverrideAction` (single-student override, `:193-232`) |
| `src/lib/attendance-notifications.ts` | `flagLowAttendance` — the only side effect in the domain (`:7-77`) |
| `src/lib/session-actions.ts` | `openCheckInAction` (`:225-250`), `closeCheckInAction` (`:252-273`), `regenerateCheckInTokenAction` (`:275-295`) — the check-in window and token lifecycle |
| `src/lib/sessions-query.ts` | `AttendanceRosterEntry` + `loadAttendanceRoster` (`:158-210`); the `includeCheckInToken` withholding switch on `listSessionsForSeason` (`:21-60`) and `loadSessionById` (`:113-155`) |
| `src/lib/auth/permissions.ts` | `canMarkAttendance` — the row-scoped gate for every manual write (`:98-116`) |
| `src/lib/rbac.ts` | `isAdminOfSeason` (`:28-30`) gates open/close/regenerate; `isLeaderInSeason` (`:36-50`) gates the leader session page only |
| `src/lib/engagement.ts` | `computeAttendanceBudget` (`:109-157`) — absence budget derived from `Attendance` |
| `src/lib/public-id.ts` | `newPublicId()` — the check-in token generator (`:3-8`) |
| `src/lib/notifications.ts` | `createNotificationsBulk`, including the per-user opt-out filter (`:56-85`) |
| `src/components/sessions/attendance-form.tsx` | The batch marking UI: three-status vocabulary (`:14-23`), mark-all (`:58-64`), the "skip unmarked students" rule (`:66-82`) |
| `src/components/sessions/check-in-attendance-list.tsx` | Live roster during check-in: status vocabulary (`:32-45`), 10s polling (`:56-60`), single-student override (`:62-72`), "Not recorded" default (`:101-108`) |
| `src/components/sessions/session-checkin-controls.tsx` | The open/close control and the QR modal (`:57-97`) |
| `src/components/sessions/check-in-qr.tsx` | Renders the check-in URL as a QR canvas + PNG download |
| `src/components/sessions/student-checkin-button.tsx` | In-app scanner entry point; validates the scanned URL's origin and path (`:26-37`) |
| `src/components/sessions/calendar-list.tsx` | The 3-hour auto-expiry constant and the check-in URL shape (`:7-19`); gates the control on `showCheckIn` (`:74-75`, `:107-126`) |
| `src/components/ui/attendance-pill.tsx` | The status → label/colour map (`:7-26`) — the shipped status vocabulary |
| `src/components/seasons/season-detail.tsx` | Passes `showCheckIn` only when a `checkInBaseUrl` is supplied (`:166-174`) |
| `src/app/checkin/[token]/page.tsx` | The scan target. Auth redirect (`:18-20`), the write-on-render (`:22`), success/error screens (`:24-76`) |
| `src/app/leader/sessions/[id]/attendance/page.tsx` | Leader batch marking; roster scoped to `groupLeaderIds` (`:23`) |
| `src/app/admin/season/[code]/sessions/[id]/attendance/page.tsx` | Admin batch marking; roster **unscoped** (`:27`) |
| `src/app/admin/season/[code]/sessions/[id]/page.tsx` | Admin check-in console: 3-hour computation (`:47-57`), QR URL (`:58-60`), live roster from `SeasonEnrollment` (`:65-87`), regenerate/open/close controls (`:216-274`) |
| `src/app/leader/sessions/[id]/page.tsx` | Leader session detail: live roster from `GroupStudent` (`:40-59`), status badge only — **no** open/close control (`:106-126`) |
| `src/app/student/sessions/[id]/page.tsx` | Student session detail; withholds the token (`:27`), enrollment guard (`:29-33`), 3-hour open computation (`:35-40`) |
| `src/app/student/attendance/page.tsx` | Student attendance history + budget hero (`:44-72`, `:126-179`) |
| `src/app/admin/season/[code]/page.tsx` | The only page that supplies `checkInBaseUrl`, and therefore the only place the open/close control renders (`:35-43`) |
| `src/app/student/calendar/page.tsx` | Passes `includeCheckInToken: false` (`:30`) |
| `src/app/leader/calendar/page.tsx` | Does **not** pass it — leaders' browsers receive every token (`:39`) |
| `src/app/api/v1/sessions/check-in/route.ts` | v1's own mobile API for the scan write (`:15-74`) |
| `src/app/api/v1/sessions/[id]/attendance/route.ts` | v1's mobile API roster read (`:17-31`) and batch write (`:41-83`) |
| `src/app/api/v1/sessions/[id]/check-in-open/route.ts` | Open, gated on `isAdminOfSeason` (`:13-37`) |
| `src/app/api/v1/sessions/[id]/check-in-close/route.ts` | Close, same gate (`:12-35`) |
| `src/app/api/v1/sessions/[id]/route.ts` | Session detail; carries `myAttendance` and `checkInOpen` (`:39-62`) |
| `src/app/api/v1/seasons/[id]/sessions/route.ts` | Session list; token withheld from `STUDENT` only (`:23-24`) |
| `prisma/schema.prisma` | `AttendanceStatus` (`:44-48`), `Season` budget fields (`:254-255`), `Session` check-in fields (`:376-378`), `Attendance` (`:440-458`) |

**Design documents.** Three exist and are cited in §10 where they state intent
the code contradicts:

- `docs/superpowers/specs/2026-06-02-qr-checkin-attendance-design.md`
- `docs/superpowers/specs/2026-06-03-student-qr-checkin-design.md`
- `docs/superpowers/plans/2026-06-02-qr-checkin-attendance.md`

v1 has **zero test files**. The source above is the only statement of intent.

---

## 2. Data model

### `Attendance` — `prisma/schema.prisma:440-458`

| Field | Meaning |
|---|---|
| `sessionId`, `studentUserId` | Composite identity. `@@unique([sessionId, studentUserId])` (`:456`) is what makes every write in this domain an upsert. |
| `status` | `AttendanceStatus`, **non-nullable**. There is no "unmarked" status — an unmarked student has no row (R2). |
| `notes` | Free text, ≤ 500 chars by validation only. Written by the batch form and the override; the override UI always sends it as absent, i.e. null (R26). |
| `markedById` | The actor. `onDelete: SetNull`, so a deleted marker leaves the row. On a self check-in it is the **student** (R57). |
| `markedAt` | `@default(now())`. Set explicitly on every update path; left to the default on `saveAttendance`'s create path (R11). |
| `checkedInAt` | Set only by the scan write. Its non-null-ness — not `status` — is the idempotency key (R52). Never cleared by any code path (R13, R25). |
| `lateMinutes` | Minutes late. Populated by the scan from the check-in window, or typed by a leader. Forced to `null` whenever status is not `LATE` (R9, R23). Feeds the absence budget directly (R75). |

`updatedAt` exists but nothing in this domain reads it.

### `Session` — check-in fields, `prisma/schema.prisma:376-378`

| Field | Meaning |
|---|---|
| `checkInToken` | `String? @unique`. Nullable in the schema and **treated as nullable throughout** — every consumer null-checks it (`sessions-query.ts:57`, `calendar-list.tsx:17`, `admin/.../sessions/[id]/page.tsx:58-60`). Minted lazily on first open (R30). |
| `checkInOpenAt` | Set by open, cleared by nothing. Also the epoch for `minutesLate` (R54) and for the 3-hour expiry (R43). |
| `checkInClosedAt` | Set by close; cleared by open (R40). |

### `Season` — attendance config, `prisma/schema.prisma:254-255`

| Field | Meaning |
|---|---|
| `absenceBudgetMinutes` | `Int @default(180)`. Denominator of the absence budget. |
| `absenceWeightMinutes` | `Int @default(90)`. Minutes one `ABSENT` costs. |

The design document specified **four** fields; only these two shipped.
`lateThresholdMinutes` and `lateWeightMinutes` do not exist in the schema — see
§10 D1 and D2.

### Enum — `prisma/schema.prisma:44-48`

`AttendanceStatus` = `PRESENT | ABSENT | LATE`. `EXCUSED` appears in both
design documents and in the implementation plan's override schema; it was never
added to the enum and no shipped code references it.

### Relations traversed

- `Attendance → Session → Season` (notification lookback, budget scoping)
- `SeasonEnrollment` (`:339-357`) — the roster source. `@@unique([studentUserId, seasonId])`, carries a nullable `groupId`.
- `GroupStudent` (`:327-336`) — `studentUserId` is `@unique`, so a student belongs to at most **one** group globally. Used by the leader session page and by the notification recipient lookup, and it is a *different* source of group membership from `SeasonEnrollment.groupId` (see §10 D9).
- `GroupLeader`, `SeasonAdmin` — notification recipients.

---

## 3. Business rules

### Status vocabulary and defaults

- **R1.** The status vocabulary is exactly `PRESENT`, `ABSENT`, `LATE` — `prisma/schema.prisma:44-48`.
- **R2.** `Attendance.status` is non-nullable, so "nobody marked this student" is represented by the **absence of a row**, never by a status value — `prisma/schema.prisma:446`.
- **R3.** *(implicit)* Reads therefore synthesise a null status for unmarked students, and every surface renders it as a distinct "no record" state rather than as `ABSENT` — `src/lib/sessions-query.ts:205`, `src/components/sessions/check-in-attendance-list.tsx:101-108`, `src/app/student/attendance/page.tsx:17`.
- **R4.** At most one attendance row exists per (session, student); the database enforces it, which is why every write in this domain is an upsert — `prisma/schema.prisma:456`.
- **R5.** All three statuses are settable by hand; only `PRESENT` and `LATE` are reachable from a check-in — `src/lib/attendance-actions.ts:152`.

### Batch manual marking — `saveAttendanceAction`

- **R6.** The caller must pass `canMarkAttendance` for the session or the action throws `ForbiddenError` — `src/lib/attendance-actions.ts:39-40`.
- **R7.** Each entry validates: `studentUserId` integer, `status` one of the three, `notes` ≤ 500 chars, `lateMinutes` integer 0–600 — `src/lib/attendance-actions.ts:17-26`.
- **R8.** The whole array is validated before any write; one invalid entry rejects the entire batch with `"Invalid attendance entries."` and writes nothing — `src/lib/attendance-actions.ts:42-43`.
- **R9.** Every upsert in the batch runs inside one `$transaction`, so a partially-marked roster is impossible — `src/lib/attendance-actions.ts:45-71`.
- **R10.** `lateMinutes` is forced to `null` whenever the status is not `LATE`, on both the create and update branches — `src/lib/attendance-actions.ts:57`, `:66`.
- **R11.** `markedById` is set to the acting user and `markedAt` to now on the update branch — `src/lib/attendance-actions.ts:58-59`.
- **R12.** The create branch sets `markedById` but **not** `markedAt`, so a first-time mark takes the schema default `now()` — `src/lib/attendance-actions.ts:61-68` with `prisma/schema.prisma:450`.
- **R13.** `notes` is always overwritten, never merged: an entry with no `notes` nulls whatever was there — `src/lib/attendance-actions.ts:56`, `:65`.
- **R14.** `saveAttendanceAction` never touches `checkedInAt`, so a manual mark preserves the scan timestamp on a row a student already checked into — `src/lib/attendance-actions.ts:54-68`.
- **R15.** `flagLowAttendance` is called after the transaction commits and **outside** it — a notification failure cannot roll the attendance back, and a transaction failure means no notification — `src/lib/attendance-actions.ts:73`.
- **R16.** *(implicit)* The form only submits students whose status is non-null, so students left untouched are silently omitted from the batch and keep whatever row they had (or none) — `src/components/sessions/attendance-form.tsx:66-78`.
- **R17.** *(implicit)* The form refuses an empty batch client-side, but the action itself accepts an empty array and succeeds without writing — `src/components/sessions/attendance-form.tsx:79-82` versus `src/lib/attendance-actions.ts:42-43`.
- **R18.** *(implicit)* The form clamps `lateMinutes` to a non-negative floored integer before sending, so the server's 0–600 bound is a second line of defence only — `src/components/sessions/attendance-form.tsx:72-77`.
- **R19.** *(implicit)* "Mark all" sets every roster row to one status, which is what makes an all-`ABSENT` batch — and therefore a burst of notifications — a one-tap operation — `src/components/sessions/attendance-form.tsx:58-64`.

### Roster construction

- **R20.** The roster is built from `SeasonEnrollment` with `status: "ACTIVE"` for the session's season — withdrawn and completed enrollees never appear and therefore can never be marked from a roster — `src/lib/sessions-query.ts:178-183`.
- **R21.** *(implicit)* Group scoping is a caller-supplied `groupIds` filter on the enrollment query, not a check inside it — `src/lib/sessions-query.ts:182`.
- **R22.** *(implicit)* The leader attendance page narrows the roster to `user.groupLeaderIds`; the *action* accepts any `studentUserId` in the season, so the narrowing is presentational only — `src/app/leader/sessions/[id]/attendance/page.tsx:23` versus `src/lib/attendance-actions.ts:35-71`.
- **R23.** *(implicit)* The admin attendance page passes no `groupIds`, so admins mark the entire season roster — `src/app/admin/season/[code]/sessions/[id]/attendance/page.tsx:27`.
- **R24.** Roster ordering is group name ascending, then student name ascending — `src/lib/sessions-query.ts:189`.
- **R25.** Each roster row carries `status`, `notes` and `lateMinutes` from the student's attendance row when one exists, and nulls when it does not — `src/lib/sessions-query.ts:198-209`.
- **R26.** The roster query is two round-trips (enrollments, then all attendance for the session) joined in memory — no N+1 — `src/lib/sessions-query.ts:178-196`.
- **R27.** A roster request for a non-existent session raises Next's `notFound()` inside the query rather than returning empty — `src/lib/sessions-query.ts:172-176`.

### Single-student override — `manualOverrideAction`

- **R28.** Same `canMarkAttendance` gate as the batch write — `src/lib/attendance-actions.ts:197-198`.
- **R29.** Same three-status vocabulary and the same `notes`/`lateMinutes` bounds — `src/lib/attendance-actions.ts:182-191`.
- **R30.** Unlike the batch create branch, the override sets `markedById` and `markedAt` explicitly on **both** create and update — `src/lib/attendance-actions.ts:217-218`, `:225-226`.
- **R31.** The override never clears `checkedInAt`, so a student marked `ABSENT` after scanning keeps a scan timestamp on the row — `src/lib/attendance-actions.ts:203-228`.
- **R32.** *(implicit)* The only caller sends neither `notes` nor `lateMinutes`, so every override through the UI nulls the notes and — because `lateMinutes` is nulled unless `LATE`, and is `?? null` when `LATE` — destroys the scan-computed lateness, and with it that session's contribution to the absence budget — `src/components/sessions/check-in-attendance-list.tsx:62-72` with `src/lib/attendance-actions.ts:222-224` and `src/lib/engagement.ts:143`.
- **R33.** `manualOverrideAction` does **not** call `flagLowAttendance` — marking a single student `ABSENT` from the check-in console never notifies anyone — `src/lib/attendance-actions.ts:193-232`.

### The check-in token

- **R34.** `Session.checkInToken` is nullable and globally unique; it is the sole lookup key for a scan — `prisma/schema.prisma:376` with `src/lib/attendance-actions.ts:98-99`.
- **R35.** The token is a 10-character string over the 62-character alphanumeric alphabet, generated by `newPublicId()` — the same generator used for `Submission.publicId` — `src/lib/public-id.ts:3-8` with `src/lib/session-actions.ts:239`.
- **R36.** The token is minted **lazily, on first open** — not at session creation as the design document specifies — `src/lib/session-actions.ts:236-243`.
- **R37.** Reopening a session reuses the existing token rather than minting a new one, so a code already displayed in a room keeps working — `src/lib/session-actions.ts:239`.
- **R38.** The token is **per session**, not per student and not per group: one token admits every actively-enrolled student in the season — `prisma/schema.prisma:376` with `src/lib/attendance-actions.ts:98-107` (the lookup carries no student or group component).
- **R39.** The token has **no expiry of its own** and is unaffected by closing check-in — closing writes only `checkInClosedAt` — `src/lib/session-actions.ts:263-266`.
- **R40.** The only way to invalidate a token is `regenerateCheckInTokenAction`, an explicit admin action which replaces the token and leaves `checkInOpenAt`/`checkInClosedAt` untouched — so regenerating during an open window keeps check-in open under a new code — `src/lib/session-actions.ts:275-295`.
- **R41.** The QR payload is the URL `${AUTH_URL}/checkin/${checkInToken}` — the token travels in a path segment and is therefore visible in the address bar of every device that scans it — `src/components/sessions/calendar-list.tsx:17`, `src/app/admin/season/[code]/sessions/[id]/page.tsx:58-60`.
- **R42.** *(implicit)* Students never receive the token: `listSessionsForSeason` and `loadSessionById` take an `includeCheckInToken` switch, and the two student pages pass `false` — `src/lib/sessions-query.ts:28`, `:58`, `:119`, `:152`, `src/app/student/calendar/page.tsx:30`, `src/app/student/sessions/[id]/page.tsx:27`.
- **R43.** *(implicit)* On the `/api/v1` surface the withholding is by role string, not by page: **every** non-`STUDENT` role receives the token, `MENTOR` included, even though mentors have no attendance write capability at all — `src/app/api/v1/seasons/[id]/sessions/route.ts:23-24`.
- **R44.** *(implicit)* The leader calendar loads sessions with the default `includeCheckInToken: true` and hands the result to a `"use client"` component, so a leader's browser receives every open session's token even though the leader UI never renders a check-in control — `src/app/leader/calendar/page.tsx:39` with `src/components/sessions/season-calendar.tsx:1`.
- **R45.** *(implicit)* `listSessionsForAllActiveSeasons` has no withholding switch and always selects the token; its only caller is the SUPER calendar — `src/lib/sessions-query.ts:64-94`, `src/app/super/calendar/page.tsx:16`.

### The check-in window

- **R46.** Opening sets `checkInOpenAt = now` and clears `checkInClosedAt`, so reopening a closed session is a supported operation — `src/lib/session-actions.ts:236-243`.
- **R47.** Closing sets `checkInClosedAt = now` and leaves `checkInOpenAt` in place — `src/lib/session-actions.ts:263-266`.
- **R48.** Open, close and regenerate are gated on `isAdminOfSeason`, i.e. `SUPER` or an admin of that specific season — **group leaders cannot open or close check-in**, contradicting the design document — `src/lib/session-actions.ts:234`, `:261`, `:284` with `src/lib/rbac.ts:28-30`.
- **R49.** A scan arriving more than three hours after `checkInOpenAt` is refused with `closed`, even when `checkInClosedAt` is still null — `src/lib/attendance-actions.ts:113-116`.
- **R50.** The three-hour rule is evaluated at read/scan time only; **nothing ever writes `checkInClosedAt`** at the three-hour mark, so a forgotten window stays structurally open in the database forever — `src/lib/attendance-actions.ts:113-116` (a `return`, not an update).
- **R51.** *(implicit)* Every UI that decides "is check-in open" recomputes the same expression — `checkInOpenAt` set, `checkInClosedAt` null, and `now − checkInOpenAt < 3h` — in four separate places, with the constant duplicated in three of them — `src/components/sessions/calendar-list.tsx:7,13-16`, `src/app/admin/season/[code]/sessions/[id]/page.tsx:47-53`, `src/app/leader/sessions/[id]/page.tsx:35-38`, `src/app/student/sessions/[id]/page.tsx:37-40`.
- **R52.** The admin console displays an expiry of `checkInOpenAt + 3h` while the window is open — `src/app/admin/season/[code]/sessions/[id]/page.tsx:54-57`, `:260-264`.
- **R53.** *(implicit)* Because the UI treats a >3h window as closed, the control flips back to "Open check-in", and pressing it re-stamps `checkInOpenAt` — which reuses the same token (R37) and resets the three-hour clock — `src/components/sessions/session-checkin-controls.tsx:87-97` with `src/lib/session-actions.ts:239-242`.
- **R54.** `/api/v1/sessions/[id]` reports `checkInOpen` as `checkInOpenAt && !checkInClosedAt` **without** the three-hour rule, so the API and the web pages disagree about whether an old window is open — `src/app/api/v1/sessions/[id]/route.ts:59`.
- **R55.** The three-hour rule is therefore stated in v1 **six times, as an unnamed literal, in two mutually contradictory forms.** The *write* form appears twice and refuses the scan: `src/lib/attendance-actions.ts:114` and `src/app/api/v1/sessions/check-in/route.ts:29`. The *read* form appears four times and hides the control: `src/components/sessions/calendar-list.tsx:7` (`CHECK_IN_DURATION_MS`, used at `:16`), `src/app/admin/season/[code]/sessions/[id]/page.tsx:47` (a second, page-local `CHECK_IN_DURATION_MS`, used at `:53`), `src/app/leader/sessions/[id]/page.tsx:38`, and `src/app/student/sessions/[id]/page.tsx:40`. The seventh place the question is answered — `src/app/api/v1/sessions/[id]/route.ts:59` — omits the rule entirely (R54). There is no shared constant and no shared predicate anywhere in v1: **v1's REST layer and v1's pages disagree**, and a client that trusts `checkInOpen` from the REST detail endpoint will enable a scan the REST check-in endpoint then refuses with `closed`. See §10 D8 for which form is authoritative in v2.

### The scan write — `checkInByTokenAction`

- **R56.** The caller must be authenticated; an anonymous visit to `/checkin/[token]` redirects to login carrying a `callbackUrl` back to the same token URL — `src/lib/attendance-actions.ts:96`, `src/app/checkin/[token]/page.tsx:18-20`.
- **R57.** There is **no role gate**: any authenticated user of any role may submit a token. The only thing that stops a leader, mentor or admin is the enrollment check — `src/lib/attendance-actions.ts:95-129`.
- **R58.** The action always writes attendance for **the caller**, never for a student named in the request — the student id is taken from the session, not the input — `src/lib/attendance-actions.ts:96`, `:163`.
- **R59.** Failure precedence is fixed and each failure returns a distinct machine code: unknown token → `invalid_token`; `checkInOpenAt` null → `not_open`; `checkInClosedAt` set → `closed`; >3h since open → `closed`; missing or non-`ACTIVE` enrollment → `not_enrolled`; existing `checkedInAt` → `already_checked_in` — `src/lib/attendance-actions.ts:109-146`.
- **R60.** The enrollment must exist for the token's season *and* have status `ACTIVE`; a `COMPLETED` or `WITHDRAWN` enrollee is refused — `src/lib/attendance-actions.ts:118-129`.
- **R61.** Idempotency is keyed on `checkedInAt != null`, not on the row existing and not on `status` — a leader-created row with a null `checkedInAt` does **not** block a subsequent scan — `src/lib/attendance-actions.ts:131-146`.
- **R62.** A second scan performs no write and returns the current status alongside the `already_checked_in` code — `src/lib/attendance-actions.ts:140-146`.
- **R63.** `minutesLate = floor((now − checkInOpenAt) / 60000)`, clamped at 0 — measured from **when check-in opened**, not from `session.startsAt` — `src/lib/attendance-actions.ts:148-151`.
- **R64.** Status is `LATE` if `minutesLate > 0`, otherwise `PRESENT`. There is no grace threshold: anyone who scans in the second minute of an open window is `LATE` — `src/lib/attendance-actions.ts:152`.
- **R65.** On create the scan writes `status`, `checkedInAt = now`, `lateMinutes` (null unless `LATE`), `markedById = the student's own user id`, and `markedAt = now` — a self check-in is recorded as self-marked — `src/lib/attendance-actions.ts:161-169`.
- **R66.** On update the scan overwrites `status`, `checkedInAt` and `lateMinutes` but leaves `markedById`, `markedAt` and `notes` from the earlier manual mark — so a scan **silently overrides a leader's `ABSENT`** while the row still attributes the mark to the leader — `src/lib/attendance-actions.ts:170-175`.
- **R67.** The scan write sends no notification under any circumstance — `src/lib/attendance-actions.ts:95-180`.
- **R68.** The scan write is a single upsert, not a transaction; the four preceding reads are unserialised, so two concurrent scans for the same student can both pass the `already_checked_in` check — the unique constraint then makes one of them an update rather than a duplicate — `src/lib/attendance-actions.ts:98-175`.
- **R69.** *(implicit)* The check-in page performs the write as a side effect of **rendering**, so a browser refresh re-invokes it; the second render is what produces the `already_checked_in` screen — `src/app/checkin/[token]/page.tsx:22`.
- **R70.** *(implicit)* `/checkin/[token]` is a standalone route outside the role-based shell, so it renders for any authenticated user regardless of role, and its only guard is `checkInByTokenAction`'s own checks — `src/app/checkin/[token]/page.tsx:14-22`.
- **R71.** The success screen tells the student the lateness is "after session start", but the number is minutes after check-in opened (R63) — `src/app/checkin/[token]/page.tsx:33-37`.
- **R72.** *(implicit)* The in-app scanner accepts a scanned QR only when it parses as a URL whose origin equals the app's own origin and whose path is exactly `/checkin/<token>`; it then navigates rather than posting, so the page's write-on-render (R69) is what performs the check-in — `src/components/sessions/student-checkin-button.tsx:26-37`, `:44-51`.
- **R73.** *(implicit)* The in-app "Check In" button is disabled unless the client-computed 3-hour window says open, which is the only place the student is told check-in has not started — `src/components/sessions/student-checkin-button.tsx:62-71` with `src/app/student/sessions/[id]/page.tsx:37-40`.
- **R74.** *(implicit)* The student session detail page 404s when the viewer has no `ACTIVE` enrollment in the session's season, so a student cannot reach the in-app scanner for another season — but this does not gate `/checkin/[token]`, which is reachable directly — `src/app/student/sessions/[id]/page.tsx:29-33`.

### Notifications — `flagLowAttendance`

- **R75.** The flag is triggered from `saveAttendanceAction` only — never from the scan write and never from the single-student override — `src/lib/attendance-actions.ts:73` (and its absence at `:180`, `:231`).
- **R76.** It no-ops immediately when the batch contains no `ABSENT` entry — `src/lib/attendance-notifications.ts:12-14`.
- **R77.** It no-ops silently for an unknown session id rather than throwing — `src/lib/attendance-notifications.ts:16-21`.
- **R78.** For each absent student it reads the two most recent attendance rows in that season at or before this session's `startsAt`, ordered by `session.startsAt` desc — `src/lib/attendance-notifications.ts:22-31`.
- **R79.** Fewer than two such rows → no flag. Both rows must be `ABSENT` → otherwise no flag. So the threshold is exactly "two consecutive recorded absences", where "consecutive" means consecutive *recorded* rows, not consecutive sessions — a session nobody marked does not break the streak — `src/lib/attendance-notifications.ts:32-33`.
- **R80.** The student's group is resolved through `GroupStudent`, which is their single current group across all seasons — not through the season enrollment's `groupId` — `src/lib/attendance-notifications.ts:35-39` with `prisma/schema.prisma:330`.
- **R81.** A student with no `GroupStudent` row is skipped entirely — no admin is notified either — `src/lib/attendance-notifications.ts:38-39`.
- **R82.** Recipients are every `SeasonAdmin` of the session's season plus every `GroupLeader` of the student's group, with leaders who are also season admins removed so nobody is notified twice — `src/lib/attendance-notifications.ts:41-52`.
- **R83.** The two audiences get different deep links: admins `/admin/students/:id`, leaders `/leader/students/:id` — `src/lib/attendance-notifications.ts:60-75`.
- **R84.** The title interpolates the student's name with the literal fallback `"A student"` when the name is null — `src/lib/attendance-notifications.ts:53-57`.
- **R85.** All notification work happens outside any transaction and sequentially: per absent student, four to six queries and up to two bulk inserts, awaited in order — a 30-student all-`ABSENT` batch is ~150 sequential round-trips before the action returns — `src/lib/attendance-notifications.ts:22-76`.
- **R86.** Recipients who have set `lowAttendanceFlag = false` on their notification preference are filtered out before the insert — `src/lib/notifications.ts:62-75`.
- **R87.** There is no dedupe or cooldown: re-saving the same attendance batch re-sends the same flag — `src/lib/attendance-notifications.ts:22-76` (no read of prior notifications).

### Derived values — absence budget

- **R88.** `minutesUsed = absentCount × season.absenceWeightMinutes + SUM(lateMinutes) over that student's `LATE` rows in the season` — a `LATE` costs the *actual* minutes recorded, not a fixed weight — `src/lib/engagement.ts:122-143`.
- **R89.** A `LATE` row with a null `lateMinutes` contributes zero to the budget — `src/lib/engagement.ts:141`.
- **R90.** `budgetPct` is `round(minutesUsed / absenceBudgetMinutes × 100)` capped at 100 — `src/lib/engagement.ts:145-148`.
- **R91.** The budget counts all attendance rows in the season regardless of session date, including future-dated sessions if any were marked — `src/lib/engagement.ts:123-138`.
- **R92.** `computeAttendanceBudget` returns null for an unknown season, and callers fall back to the season's raw `absenceBudgetMinutes` or the literal 180 — `src/lib/engagement.ts:113-120`, `src/app/student/attendance/page.tsx:74-76`.

### Student read surface

- **R93.** The student attendance page requires role `STUDENT` and scopes to `user.activeSeasonId`; a student with no active season gets an empty state and no queries run — `src/app/student/attendance/page.tsx:25-42`.
- **R94.** It lists only sessions with `startsAt <= now`, newest first — `src/app/student/attendance/page.tsx:53-58`.
- **R95.** Per-session budget cost is displayed as `absenceWeightMinutes` for `ABSENT` and the row's own `lateMinutes` for `LATE`, mirroring R88 — `src/app/student/attendance/page.tsx:143-149`.
- **R96.** The page states the rule to the student in words: "Absent = N min · Late = actual minutes late" — `src/app/student/attendance/page.tsx:116-120`.

### Live check-in console

- **R97.** While check-in is open the live roster calls `router.refresh()` every 10 seconds; the interval is not started when check-in is closed — `src/components/sessions/check-in-attendance-list.tsx:56-60`.
- **R98.** The admin console's live roster is built from `SeasonEnrollment` with `status: "ACTIVE"`, ordered by student name — the whole season — `src/app/admin/season/[code]/sessions/[id]/page.tsx:65-80`.
- **R99.** The leader session page's live roster is built from `GroupStudent` restricted to `user.groupLeaderIds` **and** the session's season, with no ordering — a different membership source from the admin console and from the marking roster — `src/app/leader/sessions/[id]/page.tsx:40-59`.
- **R100.** *(implicit)* The leader session page renders only an open/closed badge — the open and close controls are absent from it entirely, which is consistent with R48 — `src/app/leader/sessions/[id]/page.tsx:106-126`.
- **R101.** *(implicit)* The open/close control renders only where a `checkInBaseUrl` is supplied to `SeasonDetail`, and the admin season detail page is the only page that supplies one — the SUPER season detail page passes neither sessions nor a base URL, so a SUPER user who is not a season admin has no UI to open check-in despite passing the gate — `src/components/seasons/season-detail.tsx:166-174`, `src/app/admin/season/[code]/page.tsx:35-43`, `src/app/super/seasons/[code]/page.tsx:40-45`.
- **R102.** *(implicit)* The QR is only rendered while the window is open; closing hides it but does not invalidate it (R39) — `src/app/admin/season/[code]/sessions/[id]/page.tsx:265-267`.

**Total: 102 rules, 23 of them marked `(implicit)`.**

---

## 4. Authorization

| Operation | Roles | Row-scoped condition | v1 citation |
|---|---|---|---|
| Read attendance roster for a session | SUPER, season ADMIN, LEADER | `canMarkAttendance(user, sessionId)` — leader must lead a group in the session's season | `src/app/api/v1/sessions/[id]/attendance/route.ts:24-28` |
| Batch mark attendance | SUPER, season ADMIN, LEADER | `canMarkAttendance(user, sessionId)` | `src/lib/attendance-actions.ts:39-40`, `src/lib/auth/permissions.ts:98-116` |
| Override one student's attendance | SUPER, season ADMIN, LEADER | `canMarkAttendance(user, sessionId)` | `src/lib/attendance-actions.ts:197-198` |
| Open check-in | SUPER, season ADMIN | `isAdminOfSeason(user, session.seasonId)` — pure token-claims check, but preceded by a session lookup to get `seasonId` | `src/lib/session-actions.ts:228-234`, `src/app/api/v1/sessions/[id]/check-in-open/route.ts:20-27` |
| Close check-in | SUPER, season ADMIN | same | `src/lib/session-actions.ts:255-261`, `src/app/api/v1/sessions/[id]/check-in-close/route.ts:19-26` |
| Regenerate check-in token | SUPER, season ADMIN | same | `src/lib/session-actions.ts:278-284` |
| Check in by token | **any authenticated role** | an `ACTIVE` `SeasonEnrollment` in the token's season, for the *caller* | `src/lib/attendance-actions.ts:96`, `:118-129` |
| Read own attendance history | STUDENT | `user.activeSeasonId`, own rows only | `src/app/student/attendance/page.tsx:25-28`, `:61-62` |
| Read `myAttendance` on session detail | STUDENT | `canAccessSeason` + own row | `src/app/api/v1/sessions/[id]/route.ts:35-45` |
| Receive `checkInToken` in a session list | every role except STUDENT | none beyond `canAccessSeason` | `src/app/api/v1/seasons/[id]/sessions/route.ts:23-24` |

### Where v1 enforces nothing and relies on the UI

These become real gates in v2:

1. **Leader roster scoping is presentational.** `canMarkAttendance` passes if the leader leads *any* group in the season; the leader's own group narrowing happens only because the page passed `user.groupLeaderIds` to the query (R22). `saveAttendanceAction` and `manualOverrideAction` accept any `studentUserId` in the season and never verify the target is in a group the caller leads. v1's own `/api/v1` roster read is likewise unscoped (`src/app/api/v1/sessions/[id]/attendance/route.ts:28` passes no `groupIds`), so a leader calling the mobile API already receives the whole season's names and emails. **v2 must decide: either scope both the read and the write to the leader's groups, or accept that "leader" means "leader of the season's roster".** See §10 D6.

2. **`MENTOR` receives check-in tokens.** Nothing gates the token by capability, only by the role string `STUDENT` (R43). Mentors can neither mark attendance nor open check-in, yet they hold a live check-in credential. In v2 the withholding should be capability-based, not `role !== "STUDENT"`.

3. **`ALUMNI` is not a role.** Alumni carry `role: "STUDENT"` with a `graduationYear` (`src/lib/rbac.ts:20-22`), so the token withholding covers them by accident. If v2 ever splits alumni into their own role string, R42/R43 silently invert and alumni begin receiving tokens. Gate on capability, not on the literal `"STUDENT"`.

4. **The check-in write has no role gate at all** (R57). A `LEADER` who is somehow also enrolled would check *themselves* in. More importantly, there is nothing preventing a non-student caller from probing tokens — see §10 D4.

5. **Nothing rate-limits token guesses.** `/checkin/[token]` and `POST /api/v1/sessions/check-in` both accept unlimited attempts from any authenticated account, and the four distinct error codes (R59) are an oracle: `invalid_token` versus `not_open` tells an attacker a guessed token exists. 62^10 makes brute force impractical, but the enumeration oracle should still be collapsed. See §10 D4.

---

## 5. Read surface

### Attendance roster (staff)

`loadAttendanceRoster(sessionId, groupIds?)` — `src/lib/sessions-query.ts:168-210`.

Returns `{ studentUserId, name, email, groupName, status, notes, lateMinutes }[]`,
one row per **actively enrolled** student in the session's season (R20),
ordered group-then-name (R24). `status` is null for students with no attendance
row (R25). Two queries, joined in memory (R26).

The shape is identical for every staff role — v1 does not vary it. What varies
is which students appear, and that is the caller's `groupIds` argument (R21).
The row carries `email`, which is why the v2 endpoint gates it on
`canMarkAttendance` rather than `canAccessSeason`
(`apps/backend/src/routes/sessions.ts:151-155`).

### Live check-in roster (staff)

Not a shared query — each console builds its own:

- Admin (`src/app/admin/season/[code]/sessions/[id]/page.tsx:65-87`): `SeasonEnrollment` ACTIVE, name asc, with a filtered `attendanceRecords` relation returning `status` and `checkedInAt` (R98).
- Leader (`src/app/leader/sessions/[id]/page.tsx:40-59`): `GroupStudent` for the leader's groups in that season, unordered (R99).

Both return `{ userId, name, checkedInAt, status }` and both refresh by
re-rendering the whole page every 10 seconds (R97). Neither returns `notes` or
`lateMinutes`, which is why the override that consumes them sends neither (R32).

### Session detail (`/api/v1/sessions/[id]`)

`src/app/api/v1/sessions/[id]/route.ts:39-62`. Attendance-relevant fields:

| Field | Who gets it |
|---|---|
| `checkInOpen` | everyone with `canAccessSeason` — computed **without** the 3h rule (R54) |
| `myAttendance` | students only; null for every other role (`:39-45`) |
| `canMarkAttendance` | everyone — a capability hint the client uses to decide whether to show marking UI |

`checkInToken` is deliberately absent from this select.

### Session list (`/api/v1/seasons/[id]/sessions`)

Carries `checkInToken`, `checkInOpenAt`, `checkInClosedAt` and
`attendanceMarked` (a boolean derived from `_count.attendance > 0`,
`src/lib/sessions-query.ts:43`, `:54`). The token is present for every role
except `STUDENT` (R43). `attendanceMarked` is true if *any* student has a row —
it does not mean the roster is complete.

### Student attendance history

`src/app/student/attendance/page.tsx:44-72`. Three parallel queries: the budget
(R88), the season's two config fields, and every past session in the active
season with the student's own attendance row inlined. Returns more than the page
renders — it selects `markedAt` and never displays it (`:66`).

There is **no query function** for this; the page queries Prisma directly. v2
needs one (§7, §8).

---

## 6. Write surface

### `saveAttendanceAction(sessionId, entries[])` — `src/lib/attendance-actions.ts:35-80`

- **In:** session id; array of `{ studentUserId, status, notes?, lateMinutes? }`.
- **Validates:** R7, R8.
- **Writes:** one `Attendance` upsert per entry, all inside one transaction (R9). Sets `status`, `notes`, `lateMinutes` (nulled unless LATE, R10), `markedById`, `markedAt` (R11, R12). Never touches `checkedInAt` (R14).
- **Notifies:** `flagLowAttendance` after the transaction, outside it (R15).
- **Returns:** `{ ok: true }` or `{ ok: false, error }`; throws `ForbiddenError` on the auth gate.
- **Non-atomic:** the notification work (R85) is a long unguarded sequence after the commit. A crash mid-way leaves attendance saved and some recipients notified — acceptable, but v2 should make it explicitly fire-and-forget rather than accidentally so.

### `checkInByTokenAction(token)` — `src/lib/attendance-actions.ts:95-180`

- **In:** a token string only. The student is the caller (R58).
- **Validates:** R59–R62.
- **Writes:** one upsert (R65, R66).
- **Notifies:** nothing (R67).
- **Returns:** `{ ok: true, status, minutesLate }` or `{ ok: false, error, currentStatus? }`.
- **Non-atomic:** four reads then one write with no transaction and no locking (R68). Two simultaneous scans can both pass the already-checked-in read; the unique constraint saves the data but the second scan reports success rather than `already_checked_in`.

### `manualOverrideAction(sessionId, input)` — `src/lib/attendance-actions.ts:193-232`

- **In:** session id; one `{ studentUserId, status, notes?, lateMinutes? }`.
- **Writes:** one upsert (R30, R31).
- **Notifies:** nothing (R33).
- **Data loss:** through the only caller it nulls `notes` and destroys scan-computed `lateMinutes` (R32).

Functionally this is `saveAttendanceAction` with an array of one. The only
behavioural differences are R12 versus R30 (`markedAt` on create) and R15
versus R33 (notification). v2 should collapse them — see §7.

### `openCheckInAction` / `closeCheckInAction` / `regenerateCheckInTokenAction` — `src/lib/session-actions.ts:225-295`

- **In:** session id only.
- **Gate:** `isAdminOfSeason` (R48).
- **Writes:** one `Session` update each (R46, R47, R40).
- **Returns:** `{ ok: true }` — notably, the Server Action does **not** return the token; the page re-reads the session after revalidation. The `/api/v1` open endpoint *does* return it (`src/app/api/v1/sessions/[id]/check-in-open/route.ts:35`), and that is the only place a client can obtain a token without a session-list read.

---

## 7. Proposed API

The migration design lists this domain's API status as **done**. Checked
against `apps/backend/src/routes/sessions.ts`, that claim **does not hold**, and
the right word is **partial**. Six operations exist as faithful ports of v1's
`/api/v1` layer, but:

- three v1 capabilities have **no endpoint at all** (regenerate the token, read
  the check-in state back after opening, read a student's own attendance
  history);
- two shipped endpoints let a group leader read **and write** attendance for
  students they do not lead — a live authorization defect in merged v2 code,
  detailed below and in §10 D6;
- one shipped endpoint contradicts another about whether check-in is open
  (R54, R55), detailed below and in §10 D8.

"Done" describes the transport. It does not describe the authorization or the
consistency, and the two defects below are in `apps/backend`, not in v1.

| Method | Path | Status | Auth | Request | Response |
|---|---|---|---|---|---|
| POST | `/api/v1/sessions/check-in` | **exists** — `apps/backend/src/routes/sessions.ts:25-87` | any authenticated; `ACTIVE` enrollment in the token's season | `{ token }` | `{ data: { status, minutesLate } }`; errors `invalid_token` 404, `not_open` 409, `closed` 409, `not_enrolled` 403, `already_checked_in` 409 |
| GET | `/api/v1/sessions/:id` | **exists** — `sessions.ts:89-144` | `canAccessSeason` | — | `{ data: SessionDetail }` incl. `checkInOpen`, `myAttendance`, `canMarkAttendance` |
| GET | `/api/v1/sessions/:id/attendance` | **partial** — `sessions.ts:146-161` | `canMarkAttendance` | — | `{ data: { roster } }` — **not group-scoped for leaders**; see below |
| POST | `/api/v1/sessions/:id/attendance` | **partial** — `sessions.ts:163-205` | `canMarkAttendance` | `{ entries: AttendanceEntry[] }` | `{ data: { saved: number } }` — **not group-scoped for leaders**; see below |
| POST | `/api/v1/sessions/:id/check-in-open` | **exists** — `sessions.ts:207-232` | `isAdminOfSeason` | — | `{ data: { checkInToken } }` |
| POST | `/api/v1/sessions/:id/check-in-close` | **exists** — `sessions.ts:234-254` | `isAdminOfSeason` | — | `{ data: { closed: true } }` |
| POST | `/api/v1/sessions/:id/check-in-regenerate` | **new** | `isAdminOfSeason` | — | `{ data: { checkInToken } }` |
| GET | `/api/v1/sessions/:id/check-in` | **new** | `isAdminOfSeason` | — | `{ data: { checkInToken, checkInOpenAt, checkInClosedAt, expiresAt, isOpen } }` |
| GET | `/api/v1/me/attendance` | **new** | STUDENT (own) | `?seasonId` optional, defaults to active season | `{ data: { budget, sessions: [...] } }` |

### Notes on the existing endpoints

- **Both attendance endpoints are under-scoped for leaders — this is a live
  defect in merged v2 code, traced end to end.**
  `apps/backend/src/lib/permissions.ts:55-70` returns true for a `LEADER` when
  *any one* of their `groupLeaderIds` belongs to the session's season
  (`:63-69`); it never narrows to *which students*.
  `apps/backend/src/routes/sessions.ts:157` then calls
  `loadAttendanceRoster(sessionId)` with no second argument, and that function's
  signature (`apps/backend/src/lib/queries/sessions.ts:76-79`) takes no user and
  applies no group filter unless the caller supplies `groupIds` — so a leader
  with one group in a large season receives **the whole season's names and
  email addresses**. The comment at `routes/sessions.ts:151-152` justifies the
  gate as "staff-only because the roster carries names and emails", which is
  correct as far as it goes and stops short of the real question.
  `apps/backend/src/routes/sessions.ts:163-205` uses the *same* gate and then
  upserts on whatever `studentUserId` values the client submits (`:178-199`), so
  this is not only a read leak: **a leader can write attendance for students
  they do not lead.**

  v1's rule is not ambiguous, and the fix is to restore it rather than to invent
  a policy. v1's leader attendance page passes `user.groupLeaderIds` into the
  roster query (`src/app/leader/sessions/[id]/attendance/page.tsx:23`), which
  narrows the enrollment `where` clause (`src/lib/sessions-query.ts:182`); v1's
  leader session console reads from `GroupStudent` restricted to the same ids
  (`src/app/leader/sessions/[id]/page.tsx:40-46`). That scoping is R22 and R98 —
  and R22 is `(implicit)` in exactly the sense this wave exists to catch: v1's
  *action* (`src/lib/attendance-actions.ts:35-71`) never checks the target
  student at all, so the only thing that ever stopped a v1 leader from marking
  another group's student was that the page never rendered that student. v1's
  own `/api/v1` roster route dropped the argument
  (`src/app/api/v1/sessions/[id]/attendance/route.ts:28`) and v2 ported the
  route, so the implicit gate was lost exactly where an API made it reachable.
  See §10 D6 for the recommended shape.

- **`POST /sessions/:id/attendance` should absorb the single-student
  override.** v1 has two near-identical actions (§6); one endpoint with a
  one-element array covers both. The two behavioural deltas must be resolved
  explicitly rather than inherited: set `markedAt` on create (adopt R30, not
  R12), and decide whether a one-element save should notify (§10 D7).

- **The `checkInToken` is returned exactly once**, by `check-in-open`. If the
  admin's device loses it, the only recovery is `GET /seasons/:id/sessions`,
  which returns the token for *every* session in the season to *every* non-
  student role (R43). The proposed `GET /sessions/:id/check-in` exists to make
  the narrow read available so the broad one can be tightened.

- **v2's API contradicts itself about whether check-in is open.**
  `apps/backend/src/routes/sessions.ts:40-44` enforces the three-hour stop on
  the scan, with a comment explaining that an admin who forgets to close a
  session must not leave a working code live. But
  `apps/backend/src/routes/sessions.ts:140` computes
  `checkInOpen: Boolean(session.checkInOpenAt) && !session.checkInClosedAt` —
  no expiry. A session opened three days ago therefore **reports open on
  `GET /sessions/:id` and rejects with `closed` on
  `POST /sessions/check-in`**. This is a faithful port of v1's REST layer
  (`src/app/api/v1/sessions/[id]/route.ts:59` versus
  `src/app/api/v1/sessions/check-in/route.ts:29`), which itself disagrees with
  v1's four page files (R55). §10 D8 decides which form is authoritative and
  where the constant lives.

- **`GET /seasons/:id/sessions`** belongs to domain 3, but its
  `includeCheckInToken` decision is this domain's rule. Recommend narrowing it
  from `role !== "STUDENT"` to "may open check-in for this season", which drops
  MENTOR and every leader (R43, R44).

---

## 8. Proposed shared contracts

`packages/shared/src/attendance.ts` today is 18 lines: `attendanceEntrySchema`
and `saveAttendanceRequestSchema`. It lacks everything on the read side, the
entire check-in surface (which currently lives in `session.ts`), and every
response shape. The check-in contracts should **move** into this file, leaving
`session.ts` to domain 3.

### Reuse, do not redefine

- `attendanceStatusSchema` — `packages/shared/src/enums.ts` (already the three shipped values; do not add `EXCUSED`).
- `attendanceEntrySchema`, `saveAttendanceRequestSchema` — already correct against R7; keep the 0–600 bound and the ≤500 notes bound.
- `checkInRequestSchema` — currently in `session.ts:63`; move here.
- `sessionListItemSchema` — domain 3 owns it; this domain owns only the doc-comment rule on `checkInToken` (`session.ts:18-22`), which is R42 restated.

### Bare interfaces this domain must convert to Zod

Per the `CLAUDE.md` convention, these predate the Zod rule and convert as this
domain lands:

| Existing | Where | Becomes |
|---|---|---|
| `MyAttendance` | `packages/shared/src/session.ts:28-33` | `myAttendanceSchema` — move to `attendance.ts` |
| `AttendanceRosterRow` | `packages/shared/src/session.ts:53-61` | `attendanceRosterRowSchema` — move to `attendance.ts` |
| `SessionDetail` | `packages/shared/src/session.ts:35-51` | domain 3's job, but its `myAttendance`/`checkInOpen`/`canMarkAttendance` fields are this domain's |

### New schemas

| Name | Fields |
|---|---|
| `myAttendanceSchema` | `status` (enum), `notes` (nullable string), `lateMinutes` (nullable int), `checkedInAt` (nullable ISO string) |
| `attendanceRosterRowSchema` | `studentUserId` (int), `name` (nullable), `email`, `groupName` (nullable), `status` (enum, nullable — null means no record, R2/R3), `notes` (nullable), `lateMinutes` (nullable int) |
| `attendanceRosterResponseSchema` | `roster` — array of the above |
| `saveAttendanceResponseSchema` | `saved` (int) |
| `checkInResponseSchema` | `status` (`PRESENT`/`LATE` only — the scan cannot produce `ABSENT`, R64), `minutesLate` (int ≥ 0) |
| `checkInErrorCodeSchema` | the five literals from R59, so the client can branch on them rather than on message text |
| `checkInStateSchema` | `checkInToken` (nullable string), `checkInOpenAt` (nullable ISO), `checkInClosedAt` (nullable ISO), `checkInExpiresAt` (nullable ISO), `isOpen` (boolean) |
| `attendanceBudgetSchema` | `minutesUsed`, `budgetMinutes`, `budgetPct` (0–100), `absentCount`, `lateCount` |
| `myAttendanceSessionSchema` | `sessionId`, `title`, `startsAt` (ISO), `status` (nullable enum), `checkedInAt` (nullable ISO), `lateMinutes` (nullable int), `costMinutes` (nullable int — R95, computed server-side so the client does not re-derive the budget formula) |
| `myAttendanceResponseSchema` | `budget` (nullable — R92), `absenceWeightMinutes`, `sessions` (array of the above) |

Timestamps are strings on the wire, matching the note in `season.ts`.

**`checkInToken` must not appear in any student-facing schema.** The one place
it may appear is `checkInStateSchema`, behind the admin-only endpoint.

---

## 9. Screens

| v1 page(s) | v2 route | Exists? | Roles | Notes |
|---|---|---|---|---|
| `/leader/sessions/[id]/attendance`, `/admin/season/[code]/sessions/[id]/attendance` | `/sessions/[id]/attendance` | **no** | SUPER, ADMIN, LEADER | One marking screen. Roster scoping (whole season vs own groups) is a server decision (§10 D6), not a per-role screen. Needs the mark-all control (R19) and the conditional minutes-late field (R18). |
| `/admin/season/[code]/sessions/[id]` (check-in card), `/leader/sessions/[id]` (check-in card), `/student/sessions/[id]` | `/sessions/[id]` | **no** | all | One session detail route with role branches: admins get open/close/regenerate + QR; leaders get the live roster and a read-only open/closed badge (R100); students get the check-in action and their own status. |
| `/checkin/[token]` | — | **n/a** | STUDENT | Does not survive as a route. On mobile the scanner posts the decoded token to `POST /sessions/check-in` and shows the result inline. See §10 D3. Keep a deep-link handler for the URL form only if v1 QR sheets stay in circulation during the transition. |
| `/student/attendance` | `/attendance` | **no** | STUDENT | Budget hero + past-session list (R93–R96). Not currently in `navigation.ts` for any role — the student tab set has no attendance entry, so this needs a nav decision or must be reachable from `/dashboard`. |
| `/student/dashboard` budget bar, `/leader/students/[id]` budget | `/dashboard`, student detail | partly | STUDENT, LEADER, MENTOR, ADMIN | Domains 9/17 own the screens; they consume `attendanceBudgetSchema` from here. |
| QR display (`check-in-qr.tsx`) | modal on `/sessions/[id]` | **no** | SUPER, ADMIN | React Native has no canvas; needs an RN QR library. "Download PNG" becomes share-sheet or is dropped — §10 D10. |
| QR scanner (`student-checkin-button.tsx` + `qr-scanner-view.tsx`) | modal on `/sessions/[id]` | **no** | STUDENT | `expo-camera`'s barcode scanner replaces the WASM `qr-scanner`. Camera permission flow is new and has no v1 equivalent. |

Every route in this table is a detail route or an absent destination — none of
`/sessions/[id]`, `/sessions/[id]/attendance` or `/attendance` exists in
`apps/mobile/app/(app)/` today.

---

## 10. Open questions and divergences

### D1 — `lateThresholdMinutes` was specified, never shipped, and lateness is measured from the wrong instant

The design document computes `LATE` as
`checkedInAt − session.startsAt > season.lateThresholdMinutes`
(`2026-06-02-qr-checkin-attendance-design.md:46-54`), and the implementation
plan writes exactly that (`2026-06-02-qr-checkin-attendance.md:494-500`). The
shipped code measures from `checkInOpenAt` and has no threshold at all: any
non-zero minute count is `LATE` (R63, R64). `lateThresholdMinutes` is not in the
schema.

The practical effect is severe. An admin who opens check-in five minutes early
marks the entire punctual cohort `PRESENT` in minute zero and everyone after
that `LATE`. An admin who opens twenty minutes late marks the whole room
`PRESENT` regardless of when they arrived. The status is a function of admin
behaviour, not student behaviour — and because `lateMinutes` feeds the absence
budget by its raw value (R88), a late-opened session silently forgives real
lateness and an early-opened one silently charges it.

**Recommendation:** measure from `session.startsAt` and add
`lateThresholdMinutes` to `Season` — but this needs a migration, and the shared
database freeze forbids one while v1 runs. Two-stage: for now, compute lateness
from `session.startsAt` with a hard-coded 15-minute grace (the design's default)
and keep writing `lateMinutes` as the actual minutes past `startsAt`; add the
column at cutover. **Decide before code is written** — it changes every
`lateMinutes` value the rebuild produces and therefore every budget number.

### D2 — `lateWeightMinutes` was specified, never shipped, and the budget uses raw minutes instead

The design says a `LATE` costs a fixed `lateWeightMinutes`
(`2026-06-02-qr-checkin-attendance-design.md:138-140`). The code sums the actual
`lateMinutes` per row (R88). Combined with D1 this means a student's budget
consumption depends on when an admin pressed a button.

Compounding it, R32: a leader who taps "Edit" on a `LATE` student in the
check-in console — for any reason, even to re-confirm `LATE` — sends no
`lateMinutes`, and the row's lateness drops to null (R10, R32), refunding the
budget. This is a silent data-loss path in normal use.

**Recommendation:** keep the "actual minutes" model — it is more honest than a
fixed weight and the student attendance page already explains it to students
(R96) — but fix R32 by making the override a partial update that omits unstated
fields rather than nulling them.

### D3 — the mobile flow: the URL is the credential, and on mobile it does not need to be

This is the security core of the domain and it needs a decision before code.

In v1 the token travels as a URL path segment (R41). Every student who scans
sees `https://…/checkin/AbC123XyZ0` in their address bar. The token does not
expire (R39), is reused across reopenings (R37), is not bound to a device,
a location, a student, or a group (R38), and the same value works again the next
time that session's check-in is opened. So:

- A student in the room can send the URL to an absent friend, who taps it and is marked `PRESENT`.
- A student can screenshot the URL and use it at the next reopening of the same session.
- Leaders' browsers hold every session's token (R44) and mentors' clients receive them over the API (R43), neither of whom can open check-in.
- The only revocation is a manual admin action nobody is prompted to perform (R40).

`packages/shared/src/session.ts:18-22` already documents the v2 stance that
possession of `checkInToken` authorises a check-in and must be withheld from
students. That is correct as far as it goes, but v1's flow **hands the token to
every student by design** — the QR is the delivery mechanism. Withholding it
from the API while displaying it on a screen is not a control.

**Recommendation, and the thing that most needs deciding:** in v2 the app is on
the phone, so the QR does not have to carry a long-lived secret. Options, in
order of preference:

1. **Rotating short-lived code.** The console displays a code derived from the session id plus a time bucket (e.g. 30 seconds), signed with `AUTH_SECRET`. The client posts the displayed code; the server accepts only the current and previous bucket. A forwarded screenshot is dead within a minute. Requires no schema change — `checkInToken` becomes the seed rather than the credential, and stays in the database unread by clients.
2. **Reverse the direction.** The *student's* app displays a per-student code and the leader scans it. This binds the check-in to a present device and gives the leader physical confirmation. It costs the leader one scan per student, which is only acceptable for small groups.
3. **Keep the static token but bind it.** Require the client to submit the token together with a coarse location or a session-scoped nonce issued at page load. Weakest option; keeps the forwarding vector open.

Option 1 preserves the current leader workflow and closes the forwarding hole.
Whichever is chosen, **do not port `/checkin/[token]` as a deep-linked web route
in v2** — a URL that performs a state-changing write on GET render (R69) is a
CSRF-shaped design even inside an authenticated session.

### D4 — the check-in endpoint has no role gate and is an enumeration oracle

Any authenticated user of any role may post any token (R57), and the five
distinct error codes (R59) distinguish "no such token" from "token exists but is
not open". 62^10 makes guessing impractical today, but the oracle survives any
future shortening of the token, and there is no rate limit on the path.

**Recommendation:** gate the endpoint on `role === "STUDENT"` (nobody else can
legitimately check themselves in — no non-student passes the enrollment check
anyway, so this loses nothing), collapse `invalid_token` / `not_open` / `closed`
into one client-facing code while keeping the distinction in server logs, and
put the path behind the same rate limiter the auth routes use.

### D5 — a scan silently overwrites a leader's judgement

R66: if a leader marks a student `ABSENT` and the student then scans, the scan
overwrites the status to `PRESENT`/`LATE` while leaving `markedById` and
`markedAt` pointing at the leader. The audit trail now claims the leader marked
the student present. The reverse (R61) also holds: a leader's mark does not set
`checkedInAt`, so it never blocks a later scan.

**Recommendation:** last-write-wins is defensible, but the attribution must
follow the write. On a scan that updates an existing row, set
`markedById = the student` and `markedAt = now` alongside `checkedInAt`. If the
product wants leader marks to be authoritative, the alternative is to refuse the
scan with a new `already_marked` code when `markedById != null` and
`markedById != studentUserId` — but that is a behaviour change, so decide it
rather than inherit it.

### D6 — a leader can read and mark attendance for students outside their own groups (live defect in merged v2 code)

**This is not a v1 question to settle later; it is shipped v2 behaviour today.**
`apps/backend/src/lib/permissions.ts:63-69` admits a `LEADER` on the strength of
holding *any* group in the session's season and never narrows to which students.
`apps/backend/src/routes/sessions.ts:157` then reads the roster with no group
filter — `loadAttendanceRoster`'s `groupIds` parameter exists and is simply not
passed (`apps/backend/src/lib/queries/sessions.ts:76-79`) — and
`apps/backend/src/routes/sessions.ts:163-205` upserts whatever `studentUserId`
values the client submits (`:178-199`). So a leader of one group in a
fifty-student season can read every student's name and email address, and can
write any of their attendance rows.

v1's rule, stated precisely so the fix is *restore*, not *invent*: the roster
query is scoped by an explicit `groupIds` argument
(`src/lib/sessions-query.ts:182`), the leader page is the only caller that
supplies one (`src/app/leader/sessions/[id]/attendance/page.tsx:23`), and the
admin page deliberately supplies none
(`src/app/admin/season/[code]/sessions/[id]/attendance/page.tsx:27`). The write
action has no student-level check at all
(`src/lib/attendance-actions.ts:35-71`, `:193-232`). So in v1 the leader
restriction is **entirely a property of which students the page rendered** —
that is R22, and it is the highest-value class of implicit rule in this domain.
v1's own `/api/v1` route already dropped the argument
(`src/app/api/v1/sessions/[id]/attendance/route.ts:28`), and v2 ported that
route — the implicit gate was lost at exactly the point an API made the other
students reachable. The live-roster sources disagree separately: the leader
console reads `GroupStudent` (R99), the admin console and the marking roster
read `SeasonEnrollment` (R20, R98).

**Recommendation — restore the scoping on both verbs, in the gate rather than in
the caller:**

1. Add a row-scoped `attendanceScopeFor(user, sessionId)` to
   `apps/backend/src/lib/permissions.ts`, returning either "whole season" (SUPER,
   season ADMIN) or the leader's `groupLeaderIds` intersected with the session's
   season. `canMarkAttendance` stays as the coarse gate; the scope is what the
   handlers consume.
2. `GET /sessions/:id/attendance` passes that scope into `loadAttendanceRoster`'s
   existing `groupIds` parameter — the plumbing is already there and unused.
3. `POST /sessions/:id/attendance` rejects with `forbidden` when any submitted
   `studentUserId` falls outside the scope. **This is the half that matters and
   the half neither v1 nor v2 has ever had**; without it, step 2 only hides the
   other students rather than protecting them.
4. Resolve group membership through `SeasonEnrollment.groupId`, not
   `GroupStudent`. `GroupStudent.studentUserId` is `@unique` *globally*
   (`prisma/schema.prisma:330`), so it cannot represent a student who sat in
   different groups across seasons and is the wrong source for any season-scoped
   question — see D9, where the same choice causes a missed notification.

Fixing the read without the write leaves the serious half open; fixing the write
without the read leaves the roster leak. Do both in one change, with an
integration test that asserts a leader is refused a student from another group.

### D7 — one write path, not two

`saveAttendanceAction` and `manualOverrideAction` differ only in `markedAt` on
create (R12 vs R30) and in whether they notify (R15 vs R33). The notification
asymmetry is the one that matters: a leader who marks a student `ABSENT` from
the check-in console produces no low-attendance flag, while the same mark from
the batch form does.

**Recommendation:** one endpoint, always sets `markedAt`, always runs
`flagLowAttendance`. Then also fix the corollary — the flag should be idempotent
per (student, session), since R87 re-sends it on every re-save.

### D8 — the three-hour window: which answer is authoritative, and where the constant lives

Two problems, one decision.

**The rule expires in the check, never in the data** (R49, R50). Nothing writes
`checkInClosedAt` at the three-hour mark, so a forgotten window stays
structurally open in the database forever and every consumer has to re-derive
the truth.

**The consumers disagree** (R54, R55). In v1 the rule is an unnamed literal in
six places in two contradictory forms — refuse the scan
(`src/lib/attendance-actions.ts:114`,
`src/app/api/v1/sessions/check-in/route.ts:29`) versus hide the control
(`src/components/sessions/calendar-list.tsx:7,16`,
`src/app/admin/season/[code]/sessions/[id]/page.tsx:47,53`,
`src/app/leader/sessions/[id]/page.tsx:38`,
`src/app/student/sessions/[id]/page.tsx:40`) — and a seventh consumer,
`src/app/api/v1/sessions/[id]/route.ts:59`, omits it altogether. **v1's REST
layer and v1's page files disagree**, and v2 faithfully ported the REST version:
`apps/backend/src/routes/sessions.ts:40-44` enforces the stop on the scan while
`apps/backend/src/routes/sessions.ts:140` reports `checkInOpen` without it. A
session opened three days ago therefore reports open on `GET /sessions/:id` and
rejects with `closed` on `POST /sessions/check-in` — the client enables a button
the server was always going to refuse.

**Decision — the enforcing form is authoritative.** The scan path is the only
one with consequences, its comment states the intent explicitly
(`apps/backend/src/routes/sessions.ts:40-42`: an admin who forgets to close must
not leave a working code live), and the four v1 page files agree with it. The
detail endpoint is the outlier and is wrong.

**Where the constant lives:** one exported value and one predicate in
`apps/backend/src/lib/`, beside the other check-in logic — e.g.
`CHECK_IN_WINDOW_MS` and `checkInState(session)` returning
`{ isOpen, expiresAt }`. Every server consumer calls the predicate; no route
file, and no mobile screen, recomputes the expression. Then:

1. `GET /sessions/:id` returns `checkInExpiresAt` **and** derives `checkInOpen`
   from the same predicate the scan uses, so the two endpoints cannot drift.
2. The mobile client derives its enabled/disabled state from `checkInExpiresAt`
   rather than re-implementing the arithmetic — v1's four duplicated copies are
   exactly the drift this is meant to prevent.
3. Expose the window length in the shared contract
   (`checkInStateSchema.checkInExpiresAt`, §8) rather than as a number the
   client hard-codes.

Optionally also write `checkInClosedAt` when a scan is refused for expiry, so
the data converges on the rule; this is a behaviour change to a shared-database
table, so treat it as separate from the consistency fix.

### D9 — two sources of truth for a student's group

`SeasonEnrollment.groupId` (season-scoped, nullable) versus `GroupStudent`
(global, exactly one). The notification recipient lookup uses `GroupStudent`
(R80) and skips the student entirely if there is no row (R81) — so a student
enrolled in a season but not placed in a current group generates **no
low-attendance flag at all**, not even to the season admins who need it most.

**Recommendation:** resolve leaders through `SeasonEnrollment.groupId` for the
session's season, and always notify season admins even when the group is
unresolved. This is a real missed-notification bug, not a style preference.

### D10 — "Download QR" does not port

`check-in-qr.tsx` renders to a canvas and triggers an `<a download>`. React
Native has neither. The realistic replacements are a share sheet
(`expo-sharing`) or nothing.

**Recommendation:** drop the download. The stated use — print a QR for the
venue — is better served by the console keeping the code on screen, and the
rotating-code design in D3 makes a printed QR wrong anyway.

### D11 — `EXCUSED` is in the design docs and the plan, and in no code

Both design documents list four statuses including `EXCUSED`
(`2026-06-02-qr-checkin-attendance-design.md:93`, `:11`), and the
implementation plan's override schema includes it
(`2026-06-02-qr-checkin-attendance.md:530-535`). The enum has three
(`prisma/schema.prisma:44-48`) and no shipped code references `EXCUSED`. Do not
add it to `packages/shared/src/enums.ts` — that would let a client send a value
Prisma rejects at runtime. If the product wants it, it is a schema migration at
cutover.

### D12 — the low-attendance threshold counts recorded rows, not sessions

R79: "two consecutive absences" means the two most recent *attendance rows*, not
the two most recent sessions. A session nobody marked leaves no row and does not
break the streak, so a student marked `ABSENT` in January and `ABSENT` in June
with five unmarked sessions between them triggers the flag.

**Recommendation:** either compare against the last two sessions that have
started (treating a missing row as "unknown", which breaks the streak), or
rename the notification so it does not claim consecutiveness. The first is
probably intended.

### D13 — notification work is unbounded and synchronous

R85: an all-`ABSENT` batch on a 30-student roster performs roughly 150
sequential queries after the transaction, inside the request. On mobile that is
a visibly hung Save button.

**Recommendation:** batch the lookups (one `groupStudent.findMany` for all
absent students, one `groupLeader.findMany`, one `seasonAdmin.findMany`) and run
the whole thing after the response is sent. Nothing in the flow needs its result.

### D14 — `/student/attendance` has no home in the v2 navigation

`packages/shared/src/navigation.ts` has no `/attendance` entry for any role.
v1 gave students a dedicated attendance page with the budget hero. It must
either join the student nav or be reachable from `/dashboard` — otherwise the
budget, which is the whole point of the feature, becomes invisible to the
student it constrains.

### D15 — the success screen lies about what it measured

R71: the copy reads "N minutes after session start" while the number is minutes
after check-in opened. Trivial to fix, and it will keep being wrong until D1 is
decided. Fix the copy in the same change as D1, not before.
