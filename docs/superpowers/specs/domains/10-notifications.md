# Domain 10 — Notifications

> Status: draft · Phase: 4 · v1 API status: **none** (the migration design lists
> this domain as "partial"; see §7 — two library functions exist because domain 4
> needed them, and there is not one endpoint, contract or screen)

This domain owns the **delivery model**: the `Notification` row, the
`NotificationPreference` opt-out, the in-app inbox, the read/unread state, and
the email channel. It does **not** own any trigger. Almost every other domain
produces notifications; each of those triggers is stated here only as a boundary
with a cross-reference, and its rules live in the producing domain's spec.

`src/lib/notification-actions.ts` is 18 lines and contains two thin wrappers.
The domain actually lives in four other places: `src/lib/notifications.ts` (the
whole delivery library, 137 lines), `src/lib/email.ts` (the only channel besides
in-app), `src/components/layout/app-shell.tsx` + `notification-bell.tsx` (the
bell, which is the only surface that ever *changes* read state), and
`src/app/(notifications)/notifications-page.tsx` (the inbox body, re-exported by
six identical role pages).

### Producer boundaries

| Producing domain | Type it emits | Where its rules live |
|---|---|---|
| 3 — Sessions | `SESSION_RESCHEDULED` | `03-sessions.md` R45–R52 |
| 4 — Attendance | `LOW_ATTENDANCE_FLAG` | `04-attendance.md` R75–R87, D7, D9, D12, D13 |
| 7 — Assignments | `ASSIGNMENT_CREATED` | `07-assignments.md` R60–R66, R74, R86 |
| 8 — Submissions | `SUBMISSION_REVIEWED` | `08-submissions.md` R23, D14 |
| 9 — Notes | `MENTOR_FOLLOWUP` | domain 9 (not yet written) |
| 12 — Quizzes | `QUIZ_GRADED` | domain 12 (not yet written) |
| 2 — Seasons | *(none)* | `02-seasons.md`:360 — no season write notifies |

The rules below restate a producer only where the restatement is a *delivery*
fact — the recipient set, the payload shape, the channel, the transaction
boundary. Where the rule is "when does this fire", the producing domain owns it
and this document links rather than repeats.

---

## 1. v1 source

| File | Holds |
|---|---|
| `src/lib/notifications.ts` | The entire delivery library: `PREF_FIELD` (`:17-24`), `userAllowsType` (`:26-33`), `createNotification` (`:35-54`), `createNotificationsBulk` (`:56-95`), `unreadCount` (`:97-99`), `listRecent` (`:111-126`), `markRead` (`:128-137`) |
| `src/lib/notification-actions.ts` | The two Server Actions. `markAllNotificationsReadAction` (`:8-12`) and `markNotificationReadAction` (`:14-18`) — the second has **no callers** |
| `src/lib/email.ts` | The email channel. `getTransporter` throws when unconfigured (`:16-31`), `renderShell` (`:37-64`), `buttonHtml` (`:66-75`), `sendNotificationEmail` (`:136-159`). Also holds two non-notification senders (`:77-105`, `:107-134`) that belong to domain 11 |
| `src/lib/settings-actions.ts` | `NotificationPrefsInput` — the five-field preference shape (`:58-64`) — and `updateNotificationPreferencesAction` (`:66-77`) |
| `src/app/(notifications)/notifications-page.tsx` | The inbox body. The recipient-scoped query (`:14-27`), the unread/total header (`:33`), the empty state (`:35-40`), the row and its optional link (`:43-84`) |
| `src/app/{student,leader,mentor,admin,super,alumni}/notifications/page.tsx` | Six files, six lines each, all identical: `export default async function Page() { return <NotificationsPageBody /> }` |
| `src/components/layout/app-shell.tsx` | Feeds the bell on **every authenticated page render**: `listRecent(user.userId, 8)` + `unreadCount(user.userId)` (`:55-57`), the per-role inbox href (`:30-45`), the mark-all action passed down (`:91`) |
| `src/components/layout/top-bar.tsx` | Passes the bell's four props through (`:33-36`, `:78-83`) |
| `src/components/layout/notification-bell.tsx` | The only surface that mutates read state. Popover (`:47-102`), unread badge capped at `9+` (`:54-58`), "Mark all read" + `router.refresh()` (`:40-45`, `:65-73`), the row (`:105-141`) |
| `src/components/settings/settings-form.tsx` | `PREF_LABELS` — the five toggles the UI actually renders (`:27-53`) |
| `src/app/(settings)/settings-page.tsx` | Loads the preference row, falls back to `DEFAULT_PREFS` (`:7-13`, `:26-34`) |
| `src/components/layout/role-layout.tsx` | The only gate on the six inbox pages — a **URL** gate, not a data gate (`:17-33`) |
| `prisma/schema.prisma` | `NotificationType` (`:63-70`), `User.notifications` / `User.notificationPreference` (`:143-144`), `Notification` (`:594-607`), `NotificationPreference` (`:609-623`) |

### Producer call sites — the complete list

| Type | Call site | Function |
|---|---|---|
| `ASSIGNMENT_CREATED` | `src/lib/assignment-actions.ts:85-92` | `createNotificationsBulk` |
| `SUBMISSION_REVIEWED` | `src/lib/submission-actions.ts:193-198` | `createNotification` |
| `SESSION_RESCHEDULED` | `src/lib/session-actions.ts:161-169` | `createNotificationsBulk` |
| `LOW_ATTENDANCE_FLAG` | `src/lib/attendance-notifications.ts:61-67` (admins) | `createNotificationsBulk` |
| `LOW_ATTENDANCE_FLAG` | `src/lib/attendance-notifications.ts:69-75` (leaders) | `createNotificationsBulk` |
| `MENTOR_FOLLOWUP` | `src/lib/note-actions.ts:78-86` | `createNotificationsBulk` |
| `QUIZ_GRADED` | `src/lib/quiz-actions.ts:162-168` (paper grading) | `createNotification` |
| `QUIZ_GRADED` | `src/lib/quiz-actions.ts:478-484` (online auto-grade) | `createNotification` |
| `QUIZ_GRADED` | `src/lib/quiz-actions.ts:549-555` (essay grading) | `createNotification` |

**Nine emission sites, six types.** That is the whole of it — a repository-wide
search for `createNotification`, `createNotificationsBulk` and
`db.notification.create` outside `src/generated/` returns nothing else.

**There is no `/api/v1` notification route.** `src/app/api/v1/` contains 18 route
files and none of them touches `Notification` or `NotificationPreference`. The
domain is Server-Component + Server-Action only, so v1's own mobile API has never
been able to show a notification.

v1 has **zero test files**. The source above is the only statement of intent.

---

## 2. Data model

### `Notification` — `prisma/schema.prisma:594-607`

| Field | Meaning |
|---|---|
| `userId` | The recipient. One row per recipient — a fan-out to 30 students is 30 rows. `onDelete: Cascade` (`:597`), which never fires because `User` is soft-deleted (`:114`, and the schema header at `:6`). |
| `type` | `NotificationType`, non-nullable. The only structured field. |
| `title` | Non-nullable string, fully rendered at write time — including interpolated user data and, for two types, a formatted date (R57, R62). |
| `body` | Nullable. Absent on `SUBMISSION_REVIEWED` (R52) and on `ASSIGNMENT_CREATED` with no due date (R48). |
| `link` | Nullable string. A **v1 role-prefixed web path** (`/admin/students/12`), not an entity reference. Every producer sets it; nothing validates it. |
| `readAt` | `DateTime?`. Read state is a *timestamp*, not a boolean — null means unread. |
| `createdAt` | `@default(now())`. The only ordering key (R31). |

`@@index([userId, readAt])` and `@@index([userId, createdAt])` (`:605-606`) —
the two access patterns are the unread count and the recent list, and both are
indexed. There is **no** `entityId`, no `entityType`, no dedupe key, no
`expiresAt`, no `channel` and no delivery-status column.

### `NotificationPreference` — `prisma/schema.prisma:609-623`

`userId` is `@unique` (`:611`), so exactly one row per user, created lazily.
Six `Boolean @default(true)` columns (`:614-619`), one per `NotificationType`:
`assignmentCreated`, `submissionReviewed`, `sessionRescheduled`,
`lowAttendanceFlag`, `mentorFollowup`, `quizGraded`.

**`quizGraded` is written by nothing and read by one code path.** It exists in
the schema and in `PREF_FIELD` (`src/lib/notifications.ts:23`), so
`createNotification` honours it — but no UI can set it and no upsert touches it
(R42, R43). It is the schema's only field in this domain that v1 writes never
reach.

### Enum — `prisma/schema.prisma:63-70`

`NotificationType` = `ASSIGNMENT_CREATED | SUBMISSION_REVIEWED |
SESSION_RESCHEDULED | LOW_ATTENDANCE_FLAG | MENTOR_FOLLOWUP | QUIZ_GRADED`.

Six values, six emitted (R1). There is no unused enum member and no emitted type
outside the enum.

### Relations traversed

- `Notification → User` only, and only to read `email` for the mail channel
  (`notifications.ts:47`, `:86-89`). The notification row itself is never joined
  to the entity it describes — `link` is a string, so there is no way to ask
  "notifications about assignment 12".
- Recipient resolution belongs to the producers: `SeasonEnrollment`
  (`assignment-actions.ts:170-174`, `session-actions.ts:156-159`),
  `GroupStudent` (`assignment-actions.ts:177-180`,
  `attendance-notifications.ts:35-39`), `GroupLeader` and `SeasonAdmin`
  (`attendance-notifications.ts:41-48`, `note-actions.ts:69-72`).

---

## 3. Business rules

### The catalogue

- **R1.** The vocabulary is exactly the six `NotificationType` values, and all six are emitted — `prisma/schema.prisma:63-70` with the nine call sites in §1.
- **R2.** A notification carries no machine-readable reference to the thing it is about: `type` plus a free-text `link` string is the entire payload — `prisma/schema.prisma:594-607`.
- **R3.** Every `link` in v1 is a role-prefixed web path chosen by the *producer*, based on which join table matched, not on the recipient's actual role — `attendance-notifications.ts:65`, `:73`, `note-actions.ts:84`, `assignment-actions.ts:91`, `submission-actions.ts:197`, `session-actions.ts:167`, `quiz-actions.ts:167`, `:483`, `:554`.
- **R4.** *(implicit)* Because the link is chosen by join table and the role areas are gated by `RoleLayout`, a recipient whose role does not match the link's prefix is redirected away from their own notification: a `MENTOR` who holds a `GroupLeader` row receives `/leader/students/:id`, and `/leader` admits only `SUPER`/`ADMIN`/`LEADER` — `attendance-notifications.ts:73` with `src/app/leader/layout.tsx:7` and `role-layout.tsx:30-32`. The same holds for an alumnus with a live enrollment receiving `/student/assignments/:id`, since `role-layout.tsx:27-29` bounces every alumnus out of `/student`.

### Preference filtering

- **R5.** `PREF_FIELD` maps each of the six types to its `NotificationPreference` column — `src/lib/notifications.ts:17-24`.
- **R6.** A user with **no** preference row is opted in to everything — `notifications.ts:30` (single) and `:71-74` (bulk, where absence from the opted-out `Set` is the default).
- **R7.** Only the literal value `false` suppresses; the check is `!== false` / `=== false`, so a null column would not opt out — `notifications.ts:32`, `:72`.
- **R8.** An opted-out recipient gets **no row and no email** — the filter runs before the insert, so the notification is not merely hidden, it is never recorded — `notifications.ts:36`, `:71-76`.
- **R9.** The preference is a single switch over **both** channels. There is no way to keep the in-app notification and decline the email, or the reverse — `notifications.ts:36-53`, `:62-94`.
- **R10.** In the bulk path the entire preference set is fetched in one query and filtered in memory; there is no per-recipient round trip — `notifications.ts:62-75`.
- **R11.** If every recipient has opted out, `createNotificationsBulk` returns before writing anything — `notifications.ts:75`.
- **R12.** `createNotificationsBulk`'s `prefField` is cast to a five-literal union that **omits `"quizGraded"`** — `notifications.ts:65-70`. It is correct at runtime because `PREF_FIELD` has all six, but the cast means a future bulk `QUIZ_GRADED` send would not typecheck against the column it needs.

### Writing a notification

- **R13.** `createNotification` writes one row and looks up the recipient's email in a single `Promise.all` — `notifications.ts:37-48`.
- **R14.** `createNotificationsBulk` no-ops on an empty recipient array — `notifications.ts:60`.
- **R15.** The bulk insert is a single `createMany` with no `skipDuplicates` and no uniqueness constraint to trip, so re-running a producer writes duplicate rows — `notifications.ts:77-85` with `prisma/schema.prisma:594-607` (no `@@unique`).
- **R16.** Nothing anywhere dedupes or rate-limits a notification: there is no read of prior notifications on any write path — `notifications.ts:35-95`.
- **R17.** The recipient list is used verbatim; the acting user is never excluded, so a producer can notify themselves — `notifications.ts:56-85` (no filter), demonstrated at `note-actions.ts:69-79` and `quiz-actions.ts:478-484`.
- **R18.** *(implicit)* Ordering within a fan-out is the producer's array order, and `createMany` gives every row in a batch a `createdAt` from the same statement, so the inbox order of a single fan-out is not defined by anything the code controls — `notifications.ts:77-85` with `prisma/schema.prisma:603`.

### The email channel

- **R19.** Every notification that is written also attempts an email — there is no type, role or recipient for which the in-app row is written and the email skipped — `notifications.ts:49-53`, `:86-94`.
- **R20.** Email is never awaited. The single path attaches `.catch(() => undefined)` and drops the promise; the bulk path `void`s a `Promise.allSettled` — `notifications.ts:50-52`, `:90-94`.
- **R21.** Consequently an email failure is completely invisible: no log line, no retry, no dead-letter, and no column recording that delivery was attempted — `notifications.ts:50-52`, `:90-94` with `prisma/schema.prisma:594-607`.
- **R22.** **v1 throws when email is unconfigured.** `getTransporter()` raises `"Email transport not configured: GMAIL_USER and GMAIL_APP_PASSWORD must be set."` before constructing a transport — `email.ts:16-23`.
- **R23.** *(implicit)* For notifications that throw is harmless — it becomes one rejected promise per recipient, swallowed by R20 — so an unconfigured v1 deploy silently sends no notification mail and logs nothing — `email.ts:19-23` with `notifications.ts:50-52`, `:90-94`.
- **R24.** The same throw is **not** harmless for the two other senders in the file: `sendPasswordResetEmail` (`email.ts:98-104`) and `sendInviteEmail` (`email.ts:127-133`) call `getTransporter()` with no catch anywhere up the stack, so an unconfigured deploy fails password reset and invitation outright. Those belong to domain 11 — flagged, not specced (§10 D9).
- **R25.** The transporter is cached after first construction, so the configuration is read once per process — `email.ts:14`, `:24-30`.
- **R26.** The `From` address is `JPC Space <GMAIL_USER>` — the sending account's own address, reused as the display address — `email.ts:33-35`.
- **R27.** The subject is `JPC Space — ${title}`; the notification's `body` becomes the mail body, falling back to `"You have a new notification in JPC Space."` when null — `email.ts:147`, `:156`.
- **R28.** The mail's link is `AUTH_URL` + the notification's relative `link`; when `AUTH_URL` is unset the button is omitted entirely and the mail carries no way back to the app — `email.ts:142-143`, `:149`.
- **R29.** `title` and `body` are interpolated **raw** into the HTML mail with no escaping — `email.ts:49`, `:100`, `:147`, `:156`. Both are built from user-controlled data on every type: assignment titles, quiz titles, session titles, student names, and the first 140 characters of a mentor's note (R63).

### The inbox — read surface

- **R30.** `listRecent(userId, limit = 10)` returns the seven display fields ordered `createdAt` desc — `notifications.ts:111-126`.
- **R31.** Ordering everywhere is `createdAt` desc with no secondary key and no unread-first grouping, so a week-old unread sits below a minute-old read one — `notifications.ts:114`, `notifications-page.tsx:16`.
- **R32.** The bell is fed with `limit = 8`, not the function's default of 10 — `app-shell.tsx:56`.
- **R33.** The inbox page takes the 100 most recent — `notifications-page.tsx:17`.
- **R34.** **The list query is scoped to the recipient by an explicit `where: { userId: user.userId }`**, in all four read paths — `notifications-page.tsx:15`, `notifications.ts:113`, `:98`, `:131`. This is *not* an implicit page-level gate; it is the answer to this domain's version of the R22-class question in `04-attendance.md`, and the answer is that the port is safe. See §4.
- **R35.** `unreadCount` is a separate `count` on `{ userId, readAt: null }` — `notifications.ts:97-99`.
- **R36.** *(implicit)* The bell's two queries run on **every authenticated page render**, in `AppShell`, for every role — they are not lazy, not cached and not deferred behind opening the popover — `app-shell.tsx:55-57`.
- **R37.** *(implicit)* The inbox page's header counts unread by filtering the 100 rows it already fetched, so a user with more than 100 notifications sees an unread count that silently understates — `notifications-page.tsx:33` with `:17`.
- **R38.** The unread badge renders `9+` above nine — `notification-bell.tsx:56`.
- **R39.** There is no pagination, no cursor, no "load more", and no filter by type or by read state on any surface — `notifications-page.tsx:14-27`, `notifications.ts:111-126`.
- **R40.** *(implicit)* The six role inbox pages are byte-identical re-exports of one body, and `RoleLayout` is the only difference between them — it gates the **URL**, never the data, since the body re-derives the viewer from the session and scopes to their own id — `src/app/{student,leader,mentor,admin,super,alumni}/notifications/page.tsx` (all `:1-6`) with `notifications-page.tsx:13-15` and `role-layout.tsx:17-33`.
- **R41.** *(implicit)* The inbox href is computed from the role in a switch that maps a graduated student to `/alumni/notifications` and everyone else to their own prefix — the sixth page exists solely because alumni are `STUDENT` with a `graduationYear` — `app-shell.tsx:30-45` with `src/lib/rbac.ts` `isAlumnus`.

### Read/unread state

- **R42.** `markRead(userId, ids?)` is an `updateMany` filtered on `userId` **and** `readAt: null`, with `id: { in: ids }` added only when ids are supplied — `notifications.ts:128-137`.
- **R43.** *(implicit)* The `userId` clause is what makes `markNotificationReadAction(id)` safe: the action accepts an arbitrary client-supplied id and performs no ownership check of its own — a forged id updates zero rows only because the `where` narrows it — `notification-actions.ts:14-18` with `notifications.ts:131`.
- **R44.** Because of the `readAt: null` filter a re-mark never re-stamps an already-read row, so `readAt` is stable once set — `notifications.ts:131`.
- **R45.** `markRead` with no ids marks **every** unread row for the user — `notifications.ts:132-134`.
- **R46.** *(implicit)* "Mark all read" therefore clears far more than the user saw: the bell displays 8 (R32) and the button clears all of them, however many exist — `notification-bell.tsx:65-73` with `notifications.ts:132-134`.
- **R47.** `markNotificationReadAction` is exported and **never called** — a repository-wide search finds only its definition. Marking a single notification read is unreachable in shipped v1 — `notification-actions.ts:14-18`.
- **R48.** *(implicit)* **Opening a notification does not mark it read.** Both row renderers wrap the card in a plain `Link` and fire no action — `notification-bell.tsx:133-139`, `notifications-page.tsx:75-81`.
- **R49.** *(implicit)* **The inbox page performs no write at all.** It is a pure read; there is no mark-on-render, no `useEffect`, and no action invoked from it. Read state in v1 changes from exactly one control: the bell's "Mark all read" — `notifications-page.tsx:12-27` (no mutation) with `notification-bell.tsx:40-45`.
- **R50.** *(implicit)* Visiting the inbox therefore never clears the badge; a user who reads everything on the page still shows the same unread count until they use the bell — `notifications-page.tsx:12-27` with `app-shell.tsx:57`.
- **R51.** *(implicit)* The "Mark all read" button is disabled client-side when `unread === 0`, but the action accepts the call regardless and would simply update zero rows — `notification-bell.tsx:70` versus `notification-actions.ts:8-12`.
- **R52.** Marking read revalidates the entire layout tree and additionally calls `router.refresh()` — two refreshes for one write — `notification-actions.ts:11` with `notification-bell.tsx:42-44`.
- **R53.** **Nothing ever deletes a `Notification`.** There is no `delete`, `deleteMany`, retention job, archive flag or TTL anywhere in v1 outside the generated client; the `onDelete: Cascade` on `userId` is the only deletion path, and `User` is soft-deleted so it never fires — `prisma/schema.prisma:597` with `:114` and the schema header at `:6`.

### Preferences

- **R54.** `updateNotificationPreferencesAction` upserts the row for the **session** user; the target id is never an input, so one user cannot write another's preferences — `settings-actions.ts:66-73`.
- **R55.** Its only gate is `getCurrentUserOrRedirect` — any authenticated role may set their own preferences — `settings-actions.ts:69`.
- **R56.** `NotificationPrefsInput` declares **five** fields; `quizGraded` is absent — `settings-actions.ts:58-64`.
- **R57.** *(implicit)* `QUIZ_GRADED` is therefore not opt-out-able through any surface in v1: the form renders five toggles, the action spreads a five-field object into both `update` and `create`, and the column keeps its schema default of `true` forever — `settings-form.tsx:27-53`, `settings-actions.ts:72-73`, `prisma/schema.prisma:619`.
- **R58.** The settings page falls back to an all-true literal when no preference row exists, mirroring R6 — `settings-page.tsx:7-13`, `:26-34`.
- **R59.** *(implicit)* No preference row is created at signup or invite acceptance; it appears only when a user saves settings, so most users have none and are covered by R6 — `settings-actions.ts:70-73` is the sole writer.
- **R60.** The `lowAttendanceFlag` toggle's help text says the flag fires when a student "misses 3 in a row"; the actual threshold is **two** — `settings-form.tsx:46` versus `attendance-notifications.ts:32-33` (`take: 2`) and `04-attendance.md` R79.
- **R61.** Saving preferences revalidates the whole layout — `settings-actions.ts:75`.

### Payloads, per type

- **R62.** `ASSIGNMENT_CREATED` — recipients are the assignment's targeted students; title `New assignment: <title>`; body the due date via `toLocaleString()` or **omitted** when there is no due date; link `/student/assignments/:id` — `assignment-actions.ts:85-92`. Recipient resolution is domain 7's rule (`07-assignments.md` R60–R63).
- **R63.** `MENTOR_FOLLOWUP` — recipients are every `SeasonAdmin` of the note's season; title `Follow-up flagged for <name>` with the fallback `"a student"`; **body is the first 140 characters of the note body**; link `/admin/students/:id` — `note-actions.ts:78-86`, `:82-84`.
- **R64.** *(implicit)* R63 puts private note content into an email regardless of the note's `NoteVisibility`: the note may be `MENTORS`-only, and the notification body still carries its opening 140 characters to every season admin's inbox and mailbox — `note-actions.ts:61-63` (the visibility written) versus `:83` (the body copied) with `notifications.ts:92`.
- **R65.** *(implicit)* R63 does not exclude the note's author, so an admin who flags their own note notifies and emails themselves — `note-actions.ts:69-79` (no filter against `user.userId`).
- **R66.** `SUBMISSION_REVIEWED` — one notification to the submission's student; title `Feedback ready on "<assignment title>"`; **no body**; link `/student/assignments/:id` — `submission-actions.ts:193-198`. Firing is domain 8's rule (`08-submissions.md` R23).
- **R67.** `SESSION_RESCHEDULED` — recipients are every `ACTIVE` enrollee of the season; title quotes the **new** session title; body `New time: <toLocaleString()>`; link the hardcoded `/student/calendar`, never the session — `session-actions.ts:161-169`. Firing and series semantics are domain 3's rules (`03-sessions.md` R45–R49).
- **R68.** `LOW_ATTENDANCE_FLAG` — **two** bulk sends per flagged student, admins and leaders-minus-admins, with the *same* title and body and *different* links; title `<name> is at high risk — 2 consecutive absences` with the fallback `"A student"`; body the constant `"Consider reaching out for a check-in."` — `attendance-notifications.ts:57-75`. Firing, recipients and the missing-group hole are domain 4's rules (`04-attendance.md` R75–R87).
- **R69.** `QUIZ_GRADED` — three distinct emission sites, all with title `Quiz graded: <quiz title>`, a constant body carrying **no score**, and the same non-deep link `/student/quizzes` — `quiz-actions.ts:165-167`, `:481-483`, `:552-554`.
- **R70.** `QUIZ_GRADED` from paper grading fires only for students whose previous `gradedAt` was null, so re-grading a paper quiz does **not** re-notify — `quiz-actions.ts:137`, `:157`, `:161-169`.
- **R71.** `QUIZ_GRADED` from essay grading fires **unconditionally**, so re-grading an essay attempt re-notifies every time — `quiz-actions.ts:549-555`. This directly contradicts R70 within the same file.
- **R72.** `QUIZ_GRADED` from online submission notifies the student about **their own action**, and only when the quiz contains no essay questions — `quiz-actions.ts:447`, `:477-485`.

### Transactionality

- **R73.** **No notification in v1 is written inside its producing transaction.** All nine sites run after the business write commits — `assignment-actions.ts:54-80` then `:85`; `session-actions.ts:124-153` then `:161`; `submission-actions.ts:178-191` then `:193`; `note-actions.ts:56-66` then `:78`; `quiz-actions.ts:449-475` then `:478`, `:523-547` then `:549`; `attendance-actions.ts:45-71` then `:73` (`04-attendance.md` R15).
- **R74.** Consequently a rolled-back business write can never leave an orphan notification — the failure mode v1 does **not** have.
- **R75.** The failure mode it *does* have: every producer `await`s the notification write with no `try`/`catch`, so a failure in `db.notification.createMany` — after the business write has already committed — propagates out of the Server Action and the user is told their action failed when it succeeded — `assignment-actions.ts:85`, `session-actions.ts:161`, `submission-actions.ts:193`, `note-actions.ts:78`, `quiz-actions.ts:162`, `:478`, `:549`, `attendance-actions.ts:73`.
- **R76.** The email half is the exact opposite: never awaited, never surfaced, so an email outage is invisible while a notification-table outage is user-visible as a false failure — R20 versus R75.
- **R77.** `quiz-actions.ts`' paper-grading loop is itself non-transactional — the grade upserts run one at a time (`:134-158`) and the notifications follow in a second sequential loop (`:161-169`), so a mid-loop failure leaves some students graded, some graded-and-notified, and some neither.
- **R78.** Every fan-out is sequential and in-request. `attendance-notifications.ts` is the worst case (`04-attendance.md` R85, ~150 round trips for a 30-student all-`ABSENT` batch); `quiz-actions.ts:161-169` is the second, one full `createNotification` — a preference read, a row insert and a user lookup — per newly graded student.

### Time

- **R79.** The two date-bearing notifications render their instant with `Date#toLocaleString()` **executed on the server** and freeze the resulting string into `title`/`body` forever — `assignment-actions.ts:89`, `session-actions.ts:166`. Recipients see the server's locale and timezone, not their own, and the string cannot be reformatted later because the underlying instant is not stored (R2).
- **R80.** No notification carries a timezone, an offset or an ISO timestamp in its payload; `createdAt` is the only machine-readable time on the row — `prisma/schema.prisma:594-607`.
- **R81.** Relative times in the UI (`formatDistanceToNow`) are computed client-side from `createdAt`, so those are correct in the viewer's zone while the frozen strings inside `title`/`body` are not — `notification-bell.tsx:129`, `notifications-page.tsx:67` versus R79.

**Total: 81 rules, 17 of them marked `(implicit)` — R4, R18, R23, R36, R37,
R40, R41, R43, R46, R48, R49, R50, R51, R57, R59, R64, R65.**

---

## 4. Authorization

| Operation | Roles | Row-scoped condition | v1 citation |
|---|---|---|---|
| List own notifications (inbox page) | any authenticated | `userId = session user` — explicit `where` clause | `notifications-page.tsx:13-15` |
| List own notifications (bell, 8 most recent) | any authenticated | same | `app-shell.tsx:56` with `notifications.ts:113` |
| Read own unread count | any authenticated | same | `app-shell.tsx:57` with `notifications.ts:98` |
| Mark all own notifications read | any authenticated | same | `notification-actions.ts:8-12` with `notifications.ts:131` |
| Mark one notification read | any authenticated | `userId = session user` **in the `where` clause only** — the action does not check ownership before calling (R43) | `notification-actions.ts:14-18` with `notifications.ts:131` |
| Read own notification preferences | any authenticated | `userId = session user` | `settings-page.tsx:16-24` |
| Write own notification preferences | any authenticated | `userId = session user`; the target is never an input (R54) | `settings-actions.ts:69-73` |
| Create a notification | **not exposed** | — | no action, no route; only library calls from producers |
| Delete a notification | **does not exist** | — | R53 |

Everything in this domain is a self-service operation on the caller's own rows.
There is no cross-user read, no admin view of another user's inbox, and no
broadcast surface.

### Where v1 relies on the UI — and where, unusually, it does not

**The headline finding is negative, and it is worth stating explicitly.** The
class of defect this wave exists to catch — a page narrowing a query while the
action underneath checks nothing (`04-attendance.md` R22/D6) — **is not present
here**. Every one of the four read paths and both write paths carries
`userId: user.userId` in its own `where` clause, derived server-side from the
session, never from a request parameter (R34, R42, R54). A ported endpoint that
copies those functions inherits the scoping. `markNotificationReadAction` is the
one that *looks* like the pattern — it accepts a raw client id with no ownership
check (R43) — and it is safe only because `markRead` conjoins `userId`. **A v2
port must not "simplify" `markRead` into `updateMany({ where: { id: { in: ids } } })`.**
That single change would make the domain's only id-taking write a
cross-user write.

Three things *are* UI-only and become real decisions in v2:

1. **The six inbox pages are one destination.** `RoleLayout` gates the URL and
   nothing else; the body is identical and self-scoped (R40). Collapsing six
   routes into one in v2 loses no authorization, because there never was any.

2. **Marking a single notification read is unreachable** (R47) and marking
   *anything* read is reachable only from the bell (R49). If v2 adds
   mark-on-open — the obvious mobile behaviour — it is adding a write that v1
   never had, on a path v1 renders as a pure read. Under React Query's
   refetch-on-focus that write would fire far more often than any v1 equivalent.
   See §10 D2.

3. **`QUIZ_GRADED` cannot be declined** (R57). The column exists and is honoured;
   only the input type and the form omit it. In v2 the preference contract
   should be derived from the enum so this cannot recur.

---

## 5. Read surface

### `listRecent(userId, limit)` — `src/lib/notifications.ts:111-126`

Returns `{ id, type, title, body, link, readAt, createdAt }[]`, `createdAt`
desc, `take` = limit (R30, R31). Called once, with 8, from `AppShell`
(`app-shell.tsx:56`), which means it executes on **every authenticated page
render for every role** (R36) — a per-navigation cost paid whether or not the
user opens the bell.

The shape does not vary by role. There is no field any role is denied.

### `unreadCount(userId)` — `src/lib/notifications.ts:97-99`

A `count` on `{ userId, readAt: null }`, indexed by
`@@index([userId, readAt])`. Also per-render (R36). Together with `listRecent`
this is two queries on the hot path of every page in the application.

### Inbox page query — `src/app/(notifications)/notifications-page.tsx:14-27`

Same seven fields, same ordering, `take: 100`, queried directly against Prisma —
there is no shared query function, so v2 must write one (§7, §8). Returns
exactly what the page renders. No N+1: the domain never joins.

The unread/total header is computed in memory over those 100 rows (R37), so
above 100 notifications the header is wrong in a way no query change fixes —
it needs the separate `count`.

### Preferences — `src/app/(settings)/settings-page.tsx:17-34`

One `findUnique` on `User` with `notificationPreference` included, projected down
to the five-field `NotificationPrefsInput` (R56) with an all-true fallback
(R58). The sixth column is read from the database and then dropped on the floor
at `:26-33`.

---

## 6. Write surface

### `createNotification(input)` — `src/lib/notifications.ts:35-54`

- **In:** `{ userId, type, title, body?, link? }`.
- **Gate:** none — it is a library function, callable only from producers.
- **Validates:** nothing. No length bound on `title` or `body`, no shape check on `link`.
- **Writes:** zero or one `Notification` row, after the preference check (R8).
- **Notifies:** one detached email (R19, R20).
- **Returns:** `void` — the caller cannot learn whether a row was written or suppressed.
- **Non-atomic:** the row insert and the recipient email lookup run in one `Promise.all` (`:37-48`); if the user lookup rejects, the row is already written and the email never attempted.

### `createNotificationsBulk(userIds, payload)` — `src/lib/notifications.ts:56-95`

- **In:** a recipient id array plus one shared `{ type, title, body?, link? }`.
- **Writes:** one `createMany` (R15) after one preference `findMany` (R10).
- **Notifies:** one detached `Promise.allSettled` fan-out (R20).
- **Returns:** `void` — again, no count of what was written or suppressed. Domain 3 already needs that number (`03-sessions.md` R17 and `sessionWriteResponseSchema`).
- **Non-atomic:** the insert and the email lookup are sequential and unguarded (`:77-89`); a failure between them leaves rows written and nobody mailed — which is indistinguishable from R21's normal behaviour.

### `markRead(userId, ids?)` — `src/lib/notifications.ts:128-137`

- **In:** the caller's user id (server-derived) and an optional id array.
- **Writes:** one `updateMany` setting `readAt = new Date()` on unread rows (R42, R44).
- **Returns:** `void` — the update count is discarded, so a caller cannot tell whether the ids were theirs.

### `markAllNotificationsReadAction()` — `src/lib/notification-actions.ts:8-12`

- **Gate:** `getCurrentUserOrRedirect`.
- **Writes:** `markRead(user.userId)` — everything (R45, R46).
- **Then:** `revalidatePath("/", "layout")`, plus the caller's own `router.refresh()` (R52).

### `markNotificationReadAction(id)` — `src/lib/notification-actions.ts:14-18`

Identical but for one id. **Dead code** (R47). Safe only by R43.

### `updateNotificationPreferencesAction(prefs)` — `src/lib/settings-actions.ts:66-77`

- **In:** the five-field object (R56).
- **Validates:** nothing — unlike its two siblings in the same file, there is no Zod schema on this action (`:14-23` and `:79-81` have one; this does not).
- **Writes:** one upsert on `NotificationPreference`, spreading the same five fields into both `update` and `create`, leaving `quizGraded` at its default (R57).
- **Returns:** `{ ok: true }` unconditionally.

---

## 7. Proposed API

The migration design lists this domain's API status as **partial**
(`2026-08-21-full-migration-design.md:123`). Checked against
`apps/backend/`, **"partial" is generous, and the accurate word for the domain is
"none".**

What actually exists in v2 today:

| Piece | State |
|---|---|
| `apps/backend/src/lib/notifications.ts` | `createNotificationsBulk` **only** — 64 lines. `createNotification`, `unreadCount`, `listRecent` and `markRead` were **not** ported. |
| `apps/backend/src/lib/email.ts` | `sendNotificationEmail` **only**. The reset and invite senders were not ported. |
| `apps/backend/src/lib/attendance-notifications.ts` | `flagLowAttendance`, a verbatim port of v1 including the `GroupStudent` lookup and its skip (`04-attendance.md` D9). |
| Producers wired | **One of nine** — `apps/backend/src/routes/sessions.ts:202`. The other eight producers' domains are not ported. |
| Endpoints | **Zero.** There is no `apps/backend/src/routes/notifications.ts`, and `routes/me.ts:9-32` returns no unread count. |
| Shared contracts | **Zero.** No `packages/shared/src/notification.ts`; `packages/shared/src/enums.ts:1-18` has five enums and no `notificationTypeSchema`. |
| Screens | **Zero.** No `/notifications` route under `apps/mobile/app/(app)/`; `navigation.ts` has no `/notifications` entry for any role; `more.tsx` and `settings.tsx` are three-line `EmptyState` placeholders. |
| Tests | `apps/backend/src/__tests__/integration/notifications.test.ts` — three cases, all against `flagLowAttendance` (`:75`, `:88`, `:110`). It documents the trigger, the two-recipient split and the opt-out; it cannot document the inbox because there is none. |

So the delivery *library* is roughly half-ported and the *domain* is not started.
Everything that exists exists because domain 4 needed it. Nothing in this domain
is reachable from a device.

**Two v2 divergences are improvements and must not be reverted:**

- `apps/backend/src/lib/notifications.ts:19-26` types `PREF_FIELD` with
  `satisfies Record<NotificationType, string>`, so adding an enum member without
  a preference column is a compile error. This fixes R12 and forecloses the
  `quizGraded` class of gap at the type level.
- `apps/backend/src/lib/email.ts:85-93` **returns early and warns once** when
  `GMAIL_USER`/`GMAIL_APP_PASSWORD` are unset, instead of throwing per recipient
  (R22, R23). Same observable behaviour, one log line instead of silence. The
  comment at `:71-78` already records the reasoning.

### Endpoints

| Method | Path | Status | Auth | Request | Response |
|---|---|---|---|---|---|
| GET | `/api/v1/notifications` | **new** | any authenticated; own rows only | `?cursor`, `?limit` (default 20, max 50), `?unreadOnly` | `{ data: { items: [...], nextCursor, unreadCount } }` |
| GET | `/api/v1/notifications/unread-count` | **new** | any authenticated; own rows only | — | `{ data: { unreadCount } }` |
| POST | `/api/v1/notifications/read` | **new** | any authenticated; own rows only | `{ ids: number[] }` or `{ all: true }` | `{ data: { marked: number } }` |
| GET | `/api/v1/me/notification-preferences` | **new** | any authenticated; own row only | — | `{ data: { preferences } }` — all six keys |
| PUT | `/api/v1/me/notification-preferences` | **new** | any authenticated; own row only | full six-key object | `{ data: { preferences } }` |
| POST | `/api/v1/me/devices` | **new** — push, §10 D5 | any authenticated | `{ token, platform }` | `{ data: { registered: true } }` |
| DELETE | `/api/v1/me/devices/:token` | **new** — push, §10 D5 | any authenticated; own token | — | `{ data: { removed: true } }` |

Notes:

- **One `read` endpoint, not two.** v1 has two actions and one is dead (R47);
  a single endpoint taking either `ids` or `all` covers both and gives the client
  the count v1 discards. **The handler must keep `userId` in the `where` clause**
  and must not trust `ids` as an ownership assertion (R43, §4).
- **`unreadCount` rides along on the list response** so the common case — open
  the inbox, render the badge — is one request. The standalone count endpoint
  exists for the badge poll, which must not fetch 20 rows to render a number.
  v1 pays for both on every page render (R36); v2 should pay for the count only.
- **The list needs a cursor.** v1 has none (R39) and truncates at 100 (R33) with
  an in-memory unread count that is wrong beyond that (R37). On a phone the
  inbox is a `FlatList` and pagination is not optional.
- **`unreadOnly` is new.** v1 cannot filter (R39). It is the cheap version of
  the "unread first" ordering v1 also lacks (R31).
- **`PUT`, not `PATCH`, on preferences**, and the body carries **all six** keys
  derived from the enum — this is what closes R56/R57 structurally rather than
  by remembering to add a field.
- **No create endpoint.** Notifications are produced by server-side domain code
  only; there must be no client-callable send. v1 has none and v2 must not add
  one.

### Shape mismatches to resolve here, not with a second endpoint

- **`createNotificationsBulk` returns `void`** (§6). Domain 3 already needs the
  written count (`03-sessions.md` R17, `sessionWriteResponseSchema.notified`).
  Change the library function to return `{ written, suppressed }` as part of this
  domain, rather than having each producer count its own recipients and report a
  number the opt-out filter may have reduced.
- **`link` is a v1 web path** (R3, R4). `07-assignments.md`:645-649 already
  raises this and assigns it here. Every notification written while both systems
  share a database carries a path only v1 can resolve. See §10 D1 — this must be
  decided before any producer is ported, because it changes the stored payload.

---

## 8. Proposed shared contracts

`packages/shared/src/notification.ts` — **new file**; nothing exists today.
Add `export * from "./notification"` to `packages/shared/src/index.ts` (which
currently has nine lines and no notification export).

### Reuse, do not redefine

- `notificationTypeSchema` belongs in `packages/shared/src/enums.ts` beside the
  five existing enum schemas (`enums.ts:5-18`), not in the domain file — it is a
  mirror of `prisma/schema.prisma:63-70` exactly as the others are.
- The preference field names must be **derived from** `notificationTypeSchema`,
  not written out by hand. A hand-written list is precisely how v1 lost
  `quizGraded` (R56, R57).

### Bare interfaces this domain must convert to Zod

Per the `CLAUDE.md` convention:

| Existing | Where | Becomes |
|---|---|---|
| `NotificationListItem` | `jpc-space/src/lib/notifications.ts:101-109` | `notificationSchema` — v1-side only, so this is a port rather than a conversion |
| `CreateNotificationInput` | `jpc-space/src/lib/notifications.ts:5-11` and `apps/backend/src/lib/notifications.ts:6-12` | stays a server-side TypeScript interface — it is never a wire shape and must not become a client-visible contract (§7: no create endpoint) |
| `NotificationPrefsInput` | `jpc-space/src/lib/settings-actions.ts:58-64` | `notificationPreferencesSchema` — **with all six keys**, derived from the enum |

### New schemas

| Name | Fields |
|---|---|
| `notificationTypeSchema` | the six enum literals (into `enums.ts`) |
| `notificationSchema` | `id` (int), `type` (enum), `title` (string), `body` (nullable string), `link` (nullable string — see D1), `readAt` (nullable ISO string), `createdAt` (ISO string) |
| `notificationListResponseSchema` | `items` (array of the above), `nextCursor` (nullable), `unreadCount` (int ≥ 0) |
| `unreadCountResponseSchema` | `unreadCount` (int ≥ 0) |
| `markReadRequestSchema` | a union: `{ ids: int[] }` (non-empty, bounded — 200 is ample) **or** `{ all: true }`. Must not accept both, and must not accept a `userId` |
| `markReadResponseSchema` | `marked` (int ≥ 0) — the number v1 discards (§6) |
| `notificationPreferencesSchema` | one boolean per `notificationTypeSchema` member, all six, all defaulting true (R6, R58) |
| `notificationTargetSchema` | *(D1)* `entityType` + `entityId` — the route-independent reference that replaces `link` |
| `deviceRegistrationSchema` | *(D5)* `token` (string), `platform` (`ios`/`android`) |

Timestamps are strings on the wire, matching the note in `season.ts`.

**No schema in this domain may contain a `userId` on the request side.** Every
operation is self-service (§4); accepting a recipient id from a client is how
the one safe property this domain has would be lost.

---

## 9. Screens

| v1 page(s) | v2 route | Exists? | Roles | Notes |
|---|---|---|---|---|
| `/student/notifications`, `/leader/notifications`, `/mentor/notifications`, `/admin/notifications`, `/super/notifications`, `/alumni/notifications` | `/notifications` | **no** | all | Six byte-identical files collapse into one (R40). The role branching v1 performs is entirely in `RoleLayout` and gates only the URL, so there is nothing role-specific left to branch on inside the screen. Needs `FlatList` + cursor pagination (§7), `EmptyState` (v1 has one at `notifications-page.tsx:35-40`), and per-row read/unread affordance. |
| `NotificationBell` in `TopBar` | header action on every screen, or a `/notifications` tab entry | **no** | all | React Native has no top bar equivalent yet. The badge needs the standalone count endpoint, not v1's per-render pair (R36). Decide bell-vs-tab in D3. |
| `notificationsHrefFor` (`app-shell.tsx:30-45`) | — | **n/a** | — | Deleted. One route means no per-role href map, and the alumni special case (R41) disappears with it. |
| Notification preference toggles in `/settings` | `/settings` | placeholder | all | `apps/mobile/app/(app)/settings.tsx` is a three-line `EmptyState`. Domain 18 owns the settings screen; this domain owns the six toggles inside it — **six, not five** (R56, R57) — plus, if D5 lands, the push toggle. |

**`/notifications` is in no role's navigation.** `packages/shared/src/navigation.ts`
has no `/notifications` href in any of the six navs, and `ALL_NAV_HREFS`
(`:200-207`) is what `(app)/_layout.tsx` derives the route universe from — so the
route must either be added to a nav or be registered and hidden with
`href: null` and reached from a header bell. This is D3 and it must be settled
before the screen is written; it is the same class of gap as
`04-attendance.md` D14.

---

## 10. Open questions and divergences

### D1 — `link` is a v1 web path, and every row written before cutover is a dead link in v2

This is the decision with the longest tail and it must be made **before any
producer is ported**, because it changes what gets stored.

`Notification.link` is a free-text string holding a v1 role-prefixed path (R3).
v2's routes are flat and role-driven (`CLAUDE.md`, "Mobile conventions"), so
`/admin/students/12` resolves to nothing in the mobile app. Worse, the two
systems share one database: every notification v1 writes between now and cutover
lands in the same table v2 reads. And R4 shows the scheme is already broken
inside v1 — the link is chosen by which join table matched, not by the
recipient's role, so a mentor holding a `GroupLeader` row gets a `/leader` link
that bounces them to their own dashboard.

`07-assignments.md`:645-649 raises this and assigns the decision here.

**Recommendation:** store a route-independent reference —
`entityType` (`student` | `assignment` | `submission` | `session` | `quiz`) plus
`entityId` — and let each client resolve it to its own route. Two obstacles and
their answers:

1. **It needs two new columns**, and the shared-database freeze forbids a
   migration while v1 runs. Interim: derive the target by parsing the existing
   `link` in a single mapping function in `apps/backend/src/lib/` — the nine
   emission sites produce a closed set of exactly five path shapes
   (`/student/assignments/:id`, `/student/quizzes`, `/student/calendar`,
   `/admin/students/:id`, `/leader/students/:id`; R3) — and keep writing `link` for v1's
   benefit. Add the columns at cutover and backfill from `link` with the same
   function.
2. **v2 producers must keep writing `link`** in v1's exact format until v1 is
   switched off, or a notification generated by the new backend is unopenable in
   the old web app that is still in production.

Do **not** let each mobile screen parse the path. One function, one place, tested
against all five shapes.

### D2 — mark-on-open is a new write on a path v1 renders as a pure read

v1 never marks a notification read by opening it (R48), the inbox page performs
no write whatsoever (R49), and single-notification marking is dead code (R47).
Read state changes from exactly one control, the bell's "Mark all read", which
clears everything including the 92 rows the bell never displayed (R46). The
practical consequence is that in v1 a user who reads their inbox still shows the
same unread badge (R50).

Mobile users will expect the opposite, so v2 will want mark-on-open. **That is a
new write, and it lands on a screen that React Query will refetch on focus.**
The failure mode is a `POST /notifications/read` fired from a `useEffect` on
every screen focus, every app foreground, and every pull-to-refresh — a write
amplification v1 has no analogue for.

**Recommendation:** mark read on an **explicit** signal only — the row being
tapped, or the screen being *left* — never as a side effect of the list query
resolving. Concretely: no mutation in a `useEffect` keyed on query data; debounce
the ids and send one batched call; make the endpoint idempotent (it already is,
by R44's `readAt: null` filter — keep that filter, it is what makes repeat calls
free and keeps `readAt` stable). And keep "Mark all read" as a distinct explicit
action, since R46's semantics are the ones users expect from that button.

### D3 — the inbox has no home in the v2 navigation, and no bell to hang off

`packages/shared/src/navigation.ts` has no `/notifications` entry for any of the
six navs, and the mobile shell derives its route universe from `ALL_NAV_HREFS`
(`:200-207`), so today the screen would be unreachable. v1 reached it through the
`TopBar` bell, which React Native's tab shell has no equivalent of.

**Recommendation:** register `/notifications` as a hidden route (`href: null`,
per the `(app)/_layout.tsx` convention) and reach it from a header icon with an
unread badge on the primary screens. Adding it to every role's `sidebar` would
also work and is the smaller change, but it buries the badge — and the badge is
the entire point of the feature. Decide with domain 18 (Settings), which faces
the same "in the nav or behind `/more`" question.

### D4 — the preference model is one switch for two channels, and push makes that untenable

R9: one boolean per type controls both the in-app row and the email, and R8 means
opting out suppresses the row itself — the notification is not hidden, it is
never recorded. A user who only wants to stop the emails must give up the in-app
history too.

With push added (D5) this becomes a three-way choice controlled by one boolean.

**Recommendation:** split the semantics. The in-app row is **always** written —
it is the user's history and suppressing it destroys data — and the preference
governs *outbound* channels only. That is a behaviour change: it makes an
opted-out user's inbox non-empty where v1's was empty. It is the right change,
and it must be a decision rather than a drift, because the shared database means
v1 and v2 would disagree about what the same column means. If the change is
rejected, keep R8 exactly as it is and document that "off" means "no record".

Either way the preference contract must carry all six keys derived from the enum
(§8), so R57 cannot recur.

### D5 — push notifications: the delivery model, and where the token lives

v1 has no push of any kind — there is no device table, no token, no service
worker, and no web-push code anywhere. This is the single clearest mobile win in
the whole rebuild: the app is Expo, and `expo-notifications` with Expo's push
service is the natural fit for a project this size (no APNs/FCM credential
handling, one HTTP endpoint, batch sends).

Three things need deciding before code:

1. **Where the token is stored.** A `DeviceToken` model (`userId`, `token`
   `@unique`, `platform`, `lastSeenAt`) is the obvious shape, and it is a **new
   table** — which the shared-database freeze forbids while v1 runs
   (`CLAUDE.md`: "No migrations are created here"). This is the blocking
   constraint. Options: (a) defer push to cutover, when the migration is
   allowed; (b) add the table in a v2-only schema/database, accepting a second
   connection; (c) reuse an existing nullable column, which is a hack and should
   be refused. **Recommend (a)**: build the endpoints and the client permission
   flow now against the contract in §8, ship the table at cutover. Do not block
   the inbox on it.
2. **Which types warrant a push.** Not all six. Push is interruptive and the
   fastest way to train users to disable it is to push things that are not
   urgent. Proposed split — **push**: `SESSION_RESCHEDULED` (time-critical and
   the user will otherwise arrive at the wrong hour), `SUBMISSION_REVIEWED` and
   `QUIZ_GRADED` (the student is actively waiting), `LOW_ATTENDANCE_FLAG` and
   `MENTOR_FOLLOWUP` (staff-facing, low volume, actionable). **In-app only**:
   `ASSIGNMENT_CREATED`, which is the highest-volume fan-out in the system
   (every targeted student on every assignment) and is not time-critical. Note
   the volume asymmetry: `LOW_ATTENDANCE_FLAG` looks low-volume but
   `04-attendance.md` R19 makes an all-`ABSENT` batch a one-tap operation and
   R87 gives it no dedupe, so it can burst — do not push it until D7 and D12 of
   that domain are settled.
3. **How push relates to the preference model.** It is the third channel in D4.
   Per-channel-per-type is a 18-cell matrix and too much UI for this product;
   recommend one push master switch plus the existing per-type toggles, with
   push suppressed for any type the user has turned off.

`08-submissions.md` D14 flags a missing submit→leader notification and names
push as the reason to reconsider it. That needs a new `NotificationType` enum
value, which is also a migration — group it with this one at cutover.

### D6 — a notification failure reports a business write as failed

R73–R75. No notification is written inside a producing transaction, which is the
right half; but every producer `await`s the notification without a catch, so a
`createMany` failure *after* the assignment/session/submission has already been
committed propagates out and the user is told their action failed. They will
retry, and the retry will succeed and produce a second business write on the
paths that are not idempotent.

**Recommendation:** in v2 make the notification side effect explicitly
fire-and-forget — `void`ed with a logged catch, after the response is sent —
rather than accidentally in-band. `04-attendance.md` D13 reaches the same
conclusion from the latency direction and should be implemented once, here, as a
shared helper the producers call. Two properties the helper must have: it never
rejects into its caller, and it always logs, because R21 means v1's email
failures are currently invisible and that should not be inherited.

### D7 — `QUIZ_GRADED` fires three ways with three different dedupe rules

R70 (paper grading, only when previously ungraded), R71 (essay grading,
unconditional, re-notifies on every re-grade) and R72 (online auto-grade, the
student notified about their own submit) are three behaviours behind one enum
value, in one file. The middle one is the defect: a leader adjusting an essay
score three times sends three identical notifications and three identical emails.

All three carry the same non-deep link `/student/quizzes` and a constant body
with no score (R69), so the notification cannot even tell the student what
changed.

**Recommendation:** one rule — notify on the *transition* to graded, as R70 does,
not on every write; deep-link to the attempt; put the score in the body. Owned by
domain 12, decided here because the dedupe rule is a delivery concern. Related:
`SUBMISSION_REVIEWED` has the same shape and the same gap
(`08-submissions.md` R23 — re-review re-notifies).

### D8 — notification content is interpolated into HTML mail unescaped

R29. `title` and `body` go straight into the mail template with no escaping
(`email.ts:49`, `:100`, `:147`), and both are built from user-controlled strings
on every type: assignment titles, quiz titles, session titles, student names, and
the first 140 characters of a mentor's free-text note (R63). A title containing
markup is rendered as markup in every recipient's mailbox.

It is not a v1-app XSS — the in-app surfaces render through React and escape —
but the mail is real HTML sent to real inboxes, and `apps/backend/src/lib/email.ts:98-103`
inherits the template verbatim.

**Recommendation:** escape `title` and `body` at the template boundary in
`apps/backend/src/lib/email.ts` as part of this domain. It is a two-line change
in one function and it is the only place it needs to happen.

Compounding it, **R64**: `MENTOR_FOLLOWUP` copies 140 characters of the note into
the notification body and therefore into email, regardless of the note's
`NoteVisibility`. A `MENTORS`-only note's opening sentence is emailed to every
season admin. That one is a content decision, not an escaping one — recommend
dropping the body to a fixed string and making the recipient open the note.
Owned by domain 9; flagged here because this domain is where the leak happens.

### D9 — invite and password-reset email hard-fail when the transport is unconfigured

R24. `sendPasswordResetEmail` (`email.ts:98-104`) and `sendInviteEmail`
(`email.ts:127-133`) call `getTransporter()` with no catch, and `getTransporter()`
throws when `GMAIL_USER`/`GMAIL_APP_PASSWORD` are unset (R22). Unlike
notification mail, which degrades silently (R23), these fail the user's action
outright — an admin inviting a user gets an error and no invitation.

Neither function has been ported to v2 (§7). **Cross-domain — flagged, not
specced.** Domain 11 (Invites & users) owns both, and should adopt v2's
`isConfigured()` early-return pattern (`apps/backend/src/lib/email.ts:85-93`)
only if it *also* surfaces the failure to the caller, because unlike a
notification, an unsent invitation is a broken workflow rather than a missing
convenience.

### D10 — nothing is ever deleted, and nothing ever expires

R53. There is no retention policy, no archive, no TTL, and no delete path.
`onDelete: Cascade` on `Notification.userId` never fires because `User` is
soft-deleted. Every notification ever generated is still in the table and is
still returned by `where: { userId }` — the only thing bounding the read is
`take: 100` (R33).

At v1's volumes this is not yet a problem, but two things make it one in v2: the
inbox becomes paginated (§7), so the 100-row ceiling that has been hiding the
growth goes away; and a soft-deleted user's notifications remain indefinitely,
which is a data-retention question, not a performance one.

**Recommendation:** add a delete surface (swipe-to-dismiss on mobile is the
natural gesture) and a retention rule — e.g. hard-delete read notifications
older than 180 days — implemented as a scheduled job, not as a side effect of a
read. Both are new behaviour; neither is urgent; the *decision* matters now
because it determines whether `notificationSchema` needs a `deletedAt` (it should
not — hard delete is correct for this table) and whether the list endpoint needs
a `DELETE` sibling.

### D11 — the bell costs two queries on every page render

R36. `AppShell` runs `listRecent(user.userId, 8)` and `unreadCount(user.userId)`
on every authenticated page render, for every role, whether or not the user opens
the bell. Both are indexed, so it is cheap per call and it is paid on literally
every navigation.

v2 must not port the shape. The list belongs behind the inbox screen; the badge
needs only the count. **Recommendation:** the badge polls
`GET /notifications/unread-count` on a slow interval (60s) plus on app
foreground, and the list is fetched only when `/notifications` mounts. Do not
put the unread count on `GET /me` — that endpoint is cached as session identity
in the mobile client and a count that changes every minute does not belong in it.

### D12 — the `lowAttendanceFlag` help text states the wrong threshold

R60. The settings toggle says the flag fires when a student "misses 3 in a row"
(`settings-form.tsx:46`); the rule is two (`attendance-notifications.ts:32-33`,
`04-attendance.md` R79). Trivial, and it will stay wrong until someone reads both
files. Fix the copy when the toggle is rebuilt — and note that
`04-attendance.md` D12 may change the *rule*, so write the copy after that
decision, not before.
