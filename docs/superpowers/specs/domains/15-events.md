# Domain 15 — JPC events

> Status: draft · Phase: 4 · v1 API status: none

A JPC event is an organisation-wide calendar entry published by SUPER — a
retreat, an outreach day, a graduation. It is **not** a session: it belongs to
no season by default, has no duration, no attendance, no check-in, no
recurrence, and nothing hangs off it. It exists to appear on other people's
calendars and, optionally, to link out.

This domain owns the `JpcEvent` model, its single query function, its three
server actions, the `/super/events` manager, and the alumni "Events" page. It
does **not** own the calendar component, the agenda window, the day-bucketing
rule, the Monday-first week, or the five per-role calendar pages — those are
**domain 3** (`03-sessions.md`, R92–R108). Section 3 below covers only the rules
that are about *events*; everything else is cross-referenced, not restated.

---

## 1. v1 source

All paths relative to `D:\Projects\JPC\jpc-space`.

| File | Holds |
|---|---|
| `src/lib/jpc-event-actions.ts` | All three writes. 158 lines: one Zod schema with two refinements, a date+time combiner, a photo uploader, and create / update / delete. |
| `src/lib/jpc-events-query.ts` | The only read. 79 lines: `viewerSeasonIds` (the row-scope resolver) and `listJpcEvents` (the one list function every surface calls). |
| `src/app/super/events/page.tsx` | The only management page. SUPER-gated, fetches all events plus the season picker's options. |
| `src/app/super/events/jpc-event-manager-client.tsx` | List, edit/delete controls, delete confirmation, and the date-range formatter. |
| `src/app/super/events/jpc-event-form.tsx` | Create/edit form. Carries the client-side photo size check, the conditional season picker, and the midnight-means-all-day seeding. |
| `src/components/events/upcoming-events-card.tsx` | The "Upcoming events" card. **A second, different visibility formula and a second, different date window** from the calendar's. |
| `src/components/sessions/season-calendar.tsx:69-73,102-121,236-244,355-381,458-488` | How events render inside the shared calendar. Owned by domain 3; the event-specific slices are cited here. |
| `src/lib/rbac.ts:20-22,57-59` | `isAlumnus` (role STUDENT + `graduationYear`) and `canManageUsers` (SUPER only) — the two predicates this domain turns on. |
| `src/lib/storage/index.ts:13-40`, `src/lib/storage/local.ts:33-36`, `src/lib/storage/s3.ts:19-21` | `buildStorageKey`, and the `url()` implementations behind `imageUrl`. |
| `src/app/api/uploads/[...path]/route.ts` | Serves every event photo. Gates on "is logged in" and nothing else — see R25. |

Pages and components that consume it:

| Page | Role gate | What it reads |
|---|---|---|
| `src/app/super/events/page.tsx:13,16` | `requireRole(["SUPER"])` | `listJpcEvents({ includeAlumniOnly: true, seasonIds: "all" })` + non-deleted seasons |
| `src/app/super/calendar/page.tsx:17` | SUPER | `listJpcEvents({ includeAlumniOnly: true, seasonIds: viewerSeasonIds })` |
| `src/app/admin/season/[code]/calendar/page.tsx:33` | ADMIN, SUPER + `canEditSeason` | same, `includeAlumniOnly: true` |
| `src/app/leader/calendar/page.tsx:42` | LEADER | same, `includeAlumniOnly: true` |
| `src/app/student/calendar/page.tsx:31` | STUDENT | same, **`includeAlumniOnly: false`** |
| `src/app/alumni/calendar/page.tsx:19` | `isAlumnus` | `UpcomingEventsCard` — **JPC events only, no sessions** |
| `src/app/{admin,alumni,leader,mentor,student,super}/dashboard/page.tsx:163,46,238,100,246,37` | per role | `UpcomingEventsCard` |
| `src/app/super/dashboard/page.tsx:18` | SUPER | a raw `db.jpcEvent.count` for the stat tile |

**There is no REST endpoint for events in v1** — `src/app/api/v1/` contains
`assignments`, `auth`, `groups`, `me`, `seasons`, `sessions`, `submissions` and
nothing else. Every consumer is a server component calling the query directly.

v1 has **zero test files**. There is also a design doc
(`docs/superpowers/specs/2026-06-04-calendar-and-avatar-design.md`) and a plan
(`docs/superpowers/plans/2026-06-04-season-calendar-jpc-events.md`) that describe
a materially smaller feature than what shipped — see section 10, item 13.

---

## 2. Data model

### `JpcEvent` — `apps/backend/prisma/schema.prisma:755-773`

| Field | Type | Meaning / rule it carries |
|---|---|---|
| `title` | `String` | Required, 1–200 at the action layer. |
| `date` | `DateTime` | The start instant. Written from a naive local string, so it carries the **server's** zone (R13). Midnight is the all-day convention (R14). |
| `endDate` | `DateTime?` | Optional end. Validated against `date` (R9), rendered by the manager list and the dashboard card, and **ignored by the calendar** (R56). |
| `description` | `String?` | ≤2000. Shown on the manager list only — no calendar surface renders it. |
| `imagePath` | `String?` | Storage key. Written on create and on update-with-photo; never cleared (R22). |
| `url` | `String?` | External link. Its presence is what makes an event chip clickable (R62). |
| `visibility` | `JpcVisibility @default(ALL)` | The whole access model. The default is never exercised — the action always sends a value (R7). |
| `seasonId` | `Int?`, FK → `Season`, `onDelete: SetNull` | Meaningful only when `visibility = SEASON`; force-nulled otherwise (R11). |
| `createdById` | `Int?`, FK → `User`, `onDelete: SetNull` | Set on create, never on update (R32). Returned to every reader including students. |
| `@@index([date])` | | Backs the ascending order. Note it is **not** `[visibility, date]` or `[seasonId, date]`, which is what the read's `OR` actually filters on. |

There is **no `deletedAt`** — deletion is hard, unlike `User` / `Season` /
`StudentProfile` / `Assignment`. There is no `updatedById`, unlike `Season` /
`Assignment` / `Submission`. There is no `recurrenceGroupId`, no
`durationMinutes`, no `allDay`, and no `location`.

### Enum

`JpcVisibility` — `apps/backend/prisma/schema.prisma:72-76`: `ALL`,
`ALUMNI_ONLY`, `SEASON`. This domain is the only writer and the only reader.

### Relations traversed

- `JpcEvent.season` → `Season` for `title` on every row (`jpc-events-query.ts:66`).
  `Season.status` and `Season.deletedAt` are **never** consulted (R45).
- `JpcEvent.createdBy` → `User`, declared at `schema.prisma:769` and **never
  traversed by any query** — only the raw `createdById` is selected.
- `Season.jpcEvents` (`schema.prisma:271`) and `User.jpcEventsCreated`
  (`:147`) exist as back-relations and are read by nothing.

### Written but never read

- `description` is written and rendered **only** on `/super/events`
  (`jpc-event-manager-client.tsx:124-126`). No calendar, agenda or dashboard
  surface displays it — for every non-SUPER user it is write-only data.
- `createdById` is selected into `JpcEventRow` (`jpc-events-query.ts:17,67`) and
  rendered by nothing.

### Nullable in schema, treated as required in code

- `visibility` has a schema default but is required by the action schema
  (`jpc-event-actions.ts:20`) and by the form's hidden input
  (`jpc-event-form.tsx:199`) — no path can create an event without it.
- `seasonId` is nullable and correctly optional, **except** when
  `visibility = SEASON`, where the refinement at `jpc-event-actions.ts:27-30`
  makes it required. That conditional requirement exists nowhere in the schema.

---

## 3. Business rules

`(implicit)` marks a rule enforced by a query's `where`, by a call site's
argument, or by which page renders a control — not by an explicit check.

### Authorization and the write gate

- **R1.** All three actions require `canManageUsers(user)`, which is `role === "SUPER"` and nothing else — no season admin, no mentor. — `src/lib/jpc-event-actions.ts:68,108,148` + `src/lib/rbac.ts:57-59`
- **R2.** A failed gate `throw`s `new Error("Forbidden")` rather than returning the `{ error }` shape the same functions use for validation failures, so the client form's error branch never sees it and the request surfaces as an unhandled server-action error. — `src/lib/jpc-event-actions.ts:68` vs `:79`
- **R3.** The gate is a **real check, not a page gate.** Unlike most of v1, calling `createJpcEventAction` directly as a non-SUPER user is refused by the action itself, not merely hidden by `/super/events` being the only page that renders the control. This is the correct pattern and should be preserved. — `src/lib/jpc-event-actions.ts:68,108,148`

### Validation

- **R4.** Title is required, 1–200 characters. — `src/lib/jpc-event-actions.ts:15`
- **R5.** `date` is coerced; any string a JS `Date` accepts is accepted. — `:16`
- **R6.** `endDate` is nullable and coerced the same way. — `:17`
- **R7.** `visibility` must be exactly one of `ALL`, `ALUMNI_ONLY`, `SEASON`; there is no server-side default. — `:20`
- **R8.** `description` is optional, capped at 2000, and an empty string is explicitly allowed and stored as `null`. — `:18`, `:89`
- **R9.** `url` is optional; when non-empty it must parse as a URL — it is not restricted to `http(s)` and is stored `null` when empty. — `:19`, `:91`
- **R10.** `seasonId` must be a positive integer or `null`. — `:21`
- **R11.** `endDate`, when present, must be at or after `date`; equal is allowed. — `:23-26`
- **R12.** `visibility = SEASON` requires a non-null `seasonId`. — `:27-30`
- **R13.** `seasonId` is force-nulled whenever `visibility` is not `SEASON`, so switching an existing season event to `ALL` silently detaches its season. — `:93` (create), `:134` (update)
- **R14.** Only the **first** Zod issue is returned, as a bare `{ error: string }` — there is no `fieldErrors` map, so the form shows one message at a time and cannot attach it to a field. — `:79`, `:119`

### Dates, time, and the all-day convention

- **R15.** The client posts `date` + `time` and `endDate` + `endTime` as four separate fields; the action concatenates them into `yyyy-MM-ddTHH:mm` and hands that naive string to `z.coerce.date()`, which resolves it in the **server's** timezone. — `src/lib/jpc-event-actions.ts:36-42,16,72-73`
- **R16.** A missing time means `00:00`. Local midnight is v1's only encoding of "all-day" — there is no `allDay` column and no flag on the wire. — `:40`
- **R17.** `endDate` is `null` when the end **date** field is empty, even if an end **time** was supplied — the combiner returns `null` on a missing date key and never looks at the time. — `:36-38,73`
- **R18.** An empty `date` field yields `""`, which fails coercion and returns the generic first-issue message rather than "Date is required". — `:72,79`
- **R19.** *(implicit)* "All-day" is re-derived at read time by `getHours() !== 0 || getMinutes() !== 0` in **three** separate files, each in the **viewer's** timezone. — `src/components/events/upcoming-events-card.tsx:8`; `src/app/super/events/jpc-event-manager-client.tsx:17-19`; `src/app/super/events/jpc-event-form.tsx:119,148`
- **R20.** *(implicit)* Because the wall-clock is composed in the browser but **parsed on the server** (R15), while it is re-read in each viewer's zone (R19), an event authored as all-day by a user in a different zone from the server round-trips to a non-midnight instant and stops reading as all-day. This is the **opposite** failure from sessions, where the instant is composed in the browser (domain 3, R26) — two models on the same calendar disagree about which clock is authoritative.
- **R21.** Events have **no recurrence of any kind**: no `recurrenceGroupId` column, no repeat control on the form, and no import of `src/lib/recurrence.ts` anywhere in this domain. Domain 3's cross-season recurrence defect (03-sessions.md, section 10 item 1) therefore has no analogue here. — `apps/backend/prisma/schema.prisma:755-773` + grep for `recurrence` across `src/lib/jpc-event*.ts` and `src/app/super/events/` returns nothing

### Photo upload

- **R22.** The photo is optional; an absent field or a zero-byte file is treated as "none". — `src/lib/jpc-event-actions.ts:52`
- **R23.** MIME must be one of `image/jpeg`, `image/png`, `image/webp`; the check is on the declared type, not on content. — `:44,53`
- **R24.** Maximum 5 MB, enforced server-side and duplicated as a client-side constant with a comment binding the two. — `:45,54` + `src/app/super/events/jpc-event-form.tsx:28-30,56-59`
- **R25.** The file extension is derived from the MIME subtype, not from the uploaded filename — the original name is discarded entirely. — `src/lib/jpc-event-actions.ts:55-60`
- **R26.** The storage key is `events/YYYY/MM/{uuid}-event.{ext}`, where the uuid is `node:crypto` `randomUUID()` — not `newPublicId()`, which every other id in the codebase uses. — `:56-60` + `src/lib/storage/index.ts:29-40`
- **R27.** The photo is written to storage **before** the database row, and outside any transaction — a subsequent database failure leaves an orphaned blob with no row referencing it. — `:81-96` (create), `:121-136` (update)
- **R28.** On update, `imagePath` is written **only** when a new photo is supplied. There is no way to remove an event's photo once set. — `:131`
- **R29.** Replacing a photo never deletes the previous blob; `getStorage().delete` is called nowhere in this domain. — `src/lib/jpc-event-actions.ts` (whole file)
- **R30.** Deleting an event does not delete its photo either. — `:146-158`
- **R31.** `imageUrl` is derived per row as `storage.url(imagePath)`; the local driver returns the **relative** path `/api/uploads/<key>`, which a native mobile client cannot resolve. — `src/lib/jpc-events-query.ts:76` + `src/lib/storage/local.ts:33-36`
- **R32.** *(implicit)* `/api/uploads/[...path]` gates on "is there a session" and nothing else, so **any authenticated user who can guess or observe a path can fetch any event photo**, including one attached to an `ALUMNI_ONLY` or `SEASON` event they may not see. — `src/app/api/uploads/[...path]/route.ts:13-14`

### Write side effects

- **R33.** Neither create, update nor delete emits a notification of any kind — `src/lib/notifications.ts` is not imported. A new organisation-wide event reaches users only when they next open a calendar. — `src/lib/jpc-event-actions.ts` (whole file)
- **R34.** `createdById` is set from the session user on create and is **never** written on update — there is no `updatedById` on the model. — `:94` vs `:124-136`
- **R35.** Delete is a **hard** delete; `JpcEvent` has no `deletedAt`, unlike four other models in the schema. — `:150` + `apps/backend/prisma/schema.prisma:755-773`
- **R36.** Delete does not check that the row exists first, so a stale id throws a raw Prisma `P2025` that reaches the client as an unhandled server-action error. — `:150`
- **R37.** The delete confirmation is client-side only — a `ConfirmDialog` in the manager component, with nothing behind it. — `src/app/super/events/jpc-event-manager-client.tsx:161-170`
- **R38.** *(implicit)* All three actions revalidate the same five hardcoded paths: `/super/events`, `/super/calendar`, `/student/calendar`, `/leader/calendar`, `/admin/calendar`. **`/alumni/calendar` and all six dashboards are not in the list**, and `/admin/calendar` is a redirect rather than a calendar (domain 3, R86) — so the one path that *is* revalidated for admins is the one that renders no events. — `:98-102,138-142,152-156` vs `src/app/alumni/calendar/page.tsx:19`
- **R39.** The action returns `{ success: true }` and never the created or updated row; the client recovers the new state with `router.refresh()`. — `:103,143,157` + `src/app/super/events/jpc-event-form.tsx:68`

### Visibility — the access model

- **R40.** Every read in the system goes through one function, `listJpcEvents`, with exactly two knobs: `includeAlumniOnly: boolean` and `seasonIds?: number[] | "all"`. — `src/lib/jpc-events-query.ts:39-54`
- **R41.** `ALL` events are included unconditionally for every caller — there is no way to suppress them. — `:46`
- **R42.** `ALUMNI_ONLY` events are included only when the caller passes `includeAlumniOnly: true`. — `:47`
- **R43.** *(implicit)* **The caller decides who counts as alumni-eligible, and there are two different formulas.** The four calendar pages pass a hardcoded literal — `true` for admin, leader and super, `false` for student. — `src/app/admin/season/[code]/calendar/page.tsx:33`, `src/app/leader/calendar/page.tsx:42`, `src/app/super/calendar/page.tsx:17` vs `src/app/student/calendar/page.tsx:31`
- **R44.** *(implicit)* `UpcomingEventsCard` uses a **different** rule: `user.role !== "STUDENT"`. — `src/components/events/upcoming-events-card.tsx:23`
- **R45.** *(implicit)* **An alumnus is role `STUDENT` with a `graduationYear`, so R44 evaluates to `false` for them — `ALUMNI_ONLY` events are hidden from the alumni "Events" page and the alumni dashboard, the only two surfaces that exist for the audience the visibility level is named after.** In shipped v1, `ALUMNI_ONLY` means *staff-only*. — `src/lib/rbac.ts:20-22` + `src/components/events/upcoming-events-card.tsx:23` + `src/app/alumni/calendar/page.tsx:19`, `src/app/alumni/dashboard/page.tsx:46`
- **R46.** *(implicit)* The form's own label says the opposite of R45 — "Alumni only (leaders, admins)" — while the manager list badges the same value as plain "Alumni only". The UI cannot decide what the level means either. — `src/app/super/events/jpc-event-form.tsx:195` vs `src/app/super/events/jpc-event-manager-client.tsx:114-115`
- **R47.** `SEASON` events are included only when `seasonIds` is `"all"` (no id filter) or a non-empty array (`seasonId IN (...)`). — `src/lib/jpc-events-query.ts:48-52`
- **R48.** *(implicit)* When `seasonIds` is an empty array or omitted, the `SEASON` branch is dropped from the `OR` entirely — no `SEASON` event is returned, correctly, but by clause-omission rather than by a check. — `:50-52`
- **R49.** `viewerSeasonIds` is the union of the viewer's `activeSeasonId`, their `seasonAdminIds`, and the seasons of the groups in their `groupLeaderIds`; SUPER short-circuits to `"all"`. — `:24-37`
- **R50.** The group→season lookup is one extra database query, issued only when `groupLeaderIds` is non-empty. — `:29-35`
- **R51.** *(implicit)* MENTOR holds none of those three claims, so a mentor sees no `SEASON` events at all — even though `canReadAllStudents` grants mentors read-everything elsewhere. — `:24-37` + `src/lib/rbac.ts:53-55`
- **R52.** *(implicit)* **`SEASON` scoping is never checked against `Season.status` or `Season.deletedAt`.** An event attached to a `DRAFT`, `COMPLETED`, `ARCHIVED` or soft-deleted season stays visible to that season's members. Sessions on the cross-season feed *are* gated on `ACTIVE` and `deletedAt: null` (domain 3, R74) — **events do not inherit that gate.** — `src/lib/jpc-events-query.ts:48-52` (no `season:` clause) vs `src/lib/sessions-query.ts:66`
- **R53.** *(implicit)* SUPER's `"all"` therefore also surfaces `SEASON` events belonging to soft-deleted seasons. — `:48-49`
- **R54.** *(implicit)* `Season` uses `onDelete: SetNull`, so a **hard**-deleted season nulls its events' `seasonId` while leaving `visibility = SEASON` — such a row matches the `seasonId IN (...)` branch for nobody and remains visible only to SUPER. — `apps/backend/prisma/schema.prisma:770` + `src/lib/jpc-events-query.ts:48-52`
- **R55.** *(implicit)* `listJpcEvents` performs **no authorization of its own**. Both scoping decisions are arguments; a caller that forgets them gets `ALL`-only, which fails safe, but a caller that hardcodes `true`/`"all"` gets everything. — `:39-79`

### Read shape and ordering

- **R56.** Events are ordered by `date` ascending, matching the calendar's merge order. — `src/lib/jpc-events-query.ts:55`
- **R57.** There is **no date window, no limit and no pagination** — every event ever created, past included, is returned on every calendar render. — `:43-69`
- **R58.** The row shape is identical for every role: `id`, `title`, `date`, `endDate`, `description`, `imageUrl`, `url`, `visibility`, `seasonId`, `seasonTitle`, `createdById`. Nothing is withheld from students. — `:6-18,56-68`
- **R59.** `seasonTitle` comes from a joined `season` relation and is `null` for non-`SEASON` events. — `:66,74`
- **R60.** `imageUrl` resolution is a per-row `await storage.url(...)` inside a `Promise.all` — free on the local driver, one call per row on any real one, and `S3Storage.url` **throws unconditionally**, so switching `STORAGE_DRIVER=s3` breaks every calendar in the product. — `:71-78` + `src/lib/storage/s3.ts:19-21`
- **R61.** The `/super/events` manager passes `seasonIds: "all"` as a literal rather than via `viewerSeasonIds(user)` — same result for SUPER, but the scoping rule is stated in two places. — `src/app/super/events/page.tsx:16`
- **R62.** The season picker offers only non-deleted seasons, ordered by `startDate` descending. An event already pointing at a soft-deleted season keeps its `seasonId` through an edit, but the picker renders blank. — `src/app/super/events/page.tsx:17-21` + `src/app/super/events/jpc-event-form.tsx:37-39,205-215`

### How events render on the calendar (domain 3 owns the component)

- **R63.** Events are bucketed into days by `format(e.date, "yyyy-MM-dd")` — the **viewer's local** calendar date of the stored instant, exactly as sessions are. Cross-ref domain 3, R97. — `src/components/sessions/season-calendar.tsx:117-121`
- **R64.** *(implicit)* **`endDate` is never read by the calendar.** A five-day retreat renders as a single chip on its start day in both Week and Month view, with no span and no repetition. — `:117-121,458-488`
- **R65.** The agenda includes events whose `date` is at or after the **local** start of today, interleaved with sessions in one ascending time order. Cross-ref domain 3, R98–R99. — `:236,241-244`
- **R66.** **A multi-day event in progress vanishes from the agenda** the moment its start day passes, because the agenda filters on `date` (R65) while `UpcomingEventsCard` filters on `(endDate ?? date) >= today`. Two surfaces, two windows, same rows. — `src/components/sessions/season-calendar.tsx:242` vs `src/components/events/upcoming-events-card.tsx:27`
- **R67.** Agenda event rows render **no time at all** — the session row's time rail is replaced by a calendar icon, and the subtitle is the literal string "JPC event". — `:355-361,367` vs `:310-324`
- **R68.** Chip colour is amber with a lock icon for `ALUMNI_ONLY` and navy otherwise; **`SEASON` is styled identically to `ALL`**, so nothing on the calendar distinguishes an organisation-wide event from a season-scoped one. — `:69-73,364,471,484`
- **R69.** *(implicit)* The super calendar's season colour palette applies to sessions only — event chips keep the two-colour scheme and are absent from the season legend. — `:57-67` vs `:69-73`, `:190-198`
- **R70.** An event with a `url` renders as an external `<a target="_blank" rel="noopener noreferrer">` in every view; without one it is an inert `<span>` or `<div>`. **There is no event detail page anywhere in v1** — description, photo and season are unreachable from any calendar. — `:374-380,458-487` + `src/components/events/upcoming-events-card.tsx:52-58`
- **R71.** The calendar's empty state renders only when sessions **and** events are both empty. Cross-ref domain 3, R96. — `:102-110`
- **R72.** *(implicit)* The initial anchor month is derived from **sessions only**, so a calendar carrying events but no sessions always opens on the current month regardless of when its events are. Cross-ref domain 3, R95. — `:95-100`

### The alumni surface and the dashboard card

- **R73.** `/alumni/calendar` is not a calendar: it renders `UpcomingEventsCard` and issues no session query. Cross-ref domain 3, R90. — `src/app/alumni/calendar/page.tsx:11,19`
- **R74.** The card keeps events where `(endDate ?? date) >= startOfDay(now)` and takes the **first four** after the query's ascending sort. — `src/components/events/upcoming-events-card.tsx:20,27-28`
- **R75.** The card renders **nothing at all** — not an empty state — when no event qualifies, so an alumnus with no upcoming events sees a page with a heading and blank space. — `:30` + `src/app/alumni/calendar/page.tsx:13-21`
- **R76.** The card's label omits the time when the instant reads as local midnight (R19), and collapses a same-day range to a single date. — `:7-16`
- **R77.** The whole card row is the external link when `url` is set. — `:52-58`
- **R78.** The card appears on all six role dashboards as well as the alumni Events page. — `src/app/{admin,alumni,leader,mentor,student,super}/dashboard/page.tsx:163,46,238,100,246,37`
- **R79.** The super dashboard's "Upcoming events" tile is a **raw `db.jpcEvent.count`** that bypasses `listJpcEvents` entirely: it ignores `visibility`, ignores `endDate`, and compares against `now` rather than start-of-day — so it disagrees with the card directly beneath it. — `src/app/super/dashboard/page.tsx:18,33`

### Form-level rules the server does not repeat

- **R80.** *(implicit)* The season picker renders only when `visibility === "SEASON"`; its value reaches the action through a hidden input. Choosing SEASON and leaving the picker empty posts `""`, which becomes `null` and is caught by R12. — `src/app/super/events/jpc-event-form.tsx:199,202-217`
- **R81.** *(implicit)* Title is `required` on the client with **no maximum**, while the action caps it at 200 — a 300-character title passes client validation and is rejected by the server. — `:77-83` vs `src/lib/jpc-event-actions.ts:15`
- **R82.** *(implicit)* On edit, the time inputs are seeded from the stored instant read through `getHours()/getMinutes()` in the **editor's** browser zone, not the author's or the server's — so opening and re-saving an event from a different timezone silently moves it. — `:119-122,147-151`
- **R83.** *(implicit)* The edit branch looks the event up client-side with `.find()` and passes the result straight through; a miss yields `event === undefined`, which makes `JpcEventForm` silently switch to **create** mode under an "Edit event" heading. — `src/app/super/events/jpc-event-manager-client.tsx:69,73` + `src/app/super/events/jpc-event-form.tsx:61-63`

---

## 4. Authorization

Role gates are pure functions over token claims (`rbac.ts`); row-scoped gates
need a database read (`jpc-events-query.ts`'s `viewerSeasonIds` is one).

| Operation | Roles | Row-scoped condition | v1 citation |
|---|---|---|---|
| Create event | SUPER | none | `src/lib/jpc-event-actions.ts:68` + `src/lib/rbac.ts:57-59` |
| Update event | SUPER | none — any SUPER may edit any event, including one another SUPER created | `src/lib/jpc-event-actions.ts:108` |
| Delete event | SUPER | none | `src/lib/jpc-event-actions.ts:148` |
| Upload event photo | SUPER | folded into create/update; no separate operation | `src/lib/jpc-event-actions.ts:81,121` |
| Read the manager list | SUPER | `requireRole(["SUPER"])`, page-level | `src/app/super/events/page.tsx:13` |
| Read `ALL` events | every authenticated user | none | `src/lib/jpc-events-query.ts:46` |
| Read `ALUMNI_ONLY` events | ADMIN, LEADER, MENTOR, SUPER — **not STUDENT, and therefore not alumni** | caller-supplied boolean, two different formulas | `:47` + `src/app/student/calendar/page.tsx:31`, `src/components/events/upcoming-events-card.tsx:23` |
| Read `SEASON` events | any role holding the season | `viewerSeasonIds` — active season ∪ season-admin ∪ led-group seasons; SUPER = all. **No season status or soft-delete check** | `:24-37,48-52` |
| Read an event photo | any authenticated user | **none** — path-addressed and ungated | `src/app/api/uploads/[...path]/route.ts:13-14` |
| Read an event detail | — | **no such operation exists in v1** | — |

### Where v1 enforces nothing and relies on the caller

These become real gates in v2:

1. **`listJpcEvents` has no authorization** (R55). Both the alumni knob and the
   season set are arguments. In v2 the predicate must be derived from the token
   inside the endpoint, so there is exactly one formula instead of R43's and
   R44's two.
2. **The alumni-eligibility rule is a literal at five call sites** (R43, R44),
   and one of them (R45) is wrong for the audience it names. This is a
   behavioural decision, not a port — see section 10, item 2.
3. **Event photos are ungated** (R32). v2 already refused to port v1's
   equivalent hole for submission files (`CLAUDE.md`, "Two endpoints here are
   **not** ports"). Do the same here: address the photo by event id and gate it
   on the same visibility predicate as the event row.
4. **The write gate is already correct** (R3) and is one of the few places in
   v1 where the action, not the page, enforces the role. Preserve it verbatim.

---

## 5. Read surface

### `listJpcEvents({ includeAlumniOnly, seasonIds })` — `src/lib/jpc-events-query.ts:39-79`

The only read in the domain. Returns `JpcEventRow[]`: `id`, `title`, `date`,
`endDate`, `description`, `imageUrl`, `url`, `visibility`, `seasonId`,
`seasonTitle`, `createdById`.

- **Filter:** a single `OR` of up to three branches — `ALL` always,
  `ALUMNI_ONLY` when the flag is set, `SEASON` when a season set is supplied
  (R41–R48).
- **Ordering:** `date` ascending (R56). Backed by `@@index([date])`, which does
  not cover the `visibility`/`seasonId` predicates the `OR` actually filters on.
- **Window:** none. Every event ever created, on every render (R57).
- **Per-role shape:** identical for all roles (R58). Unlike sessions, nothing is
  withheld from students — but `description`, `imagePath`/`imageUrl` and
  `seasonId` are all delivered and then rendered by no non-SUPER surface.
- **N+1:** none against the database — the season join is part of the same
  query. There **is** a per-row `await` on `storage.url` (R60), which is a
  no-op locally and a per-row call on any real driver.
- **Returns more than any page renders:** every consumer post-filters —
  the agenda by `date >= today` (R65), the card by `(endDate ?? date) >= today`
  then `.slice(0, 4)` (R74), the grid by the visible month.

### `viewerSeasonIds(user)` — `src/lib/jpc-events-query.ts:24-37`

Resolves the row-scope for `SEASON` events. Pure for SUPER (`"all"`) and for
users with no `groupLeaderIds`; otherwise one `group.findMany` (R50). Returns a
de-duplicated array. Never consults `Season.status` or `Season.deletedAt` (R52).

### Reads that bypass the query module

- `src/app/super/dashboard/page.tsx:18` — a raw `db.jpcEvent.count` with no
  visibility filter (R79).

---

## 6. Write surface

### `createJpcEventAction(formData)` — `src/lib/jpc-event-actions.ts:66-104`

- **Inputs:** `FormData` with `title`, `date`, `time?`, `endDate?`, `endTime?`,
  `description?`, `url?`, `visibility`, `seasonId?`, `photo?`.
- **Validation:** R4–R14, plus the photo checks R22–R24.
- **Writes:** one storage object (when a photo is present) and one `JpcEvent`
  row. `createdById` from the session user.
- **Cascades:** none.
- **Notifies:** **nothing** (R33).
- **Returns:** `{ success: true }` or `{ error: string }` — never the row (R39).
- **Non-atomic:** the storage write happens before the row insert and outside
  any transaction (R27). A validation failure after the upload, or a database
  error, leaves an orphaned blob.

### `updateJpcEventAction(id, formData)` — `src/lib/jpc-event-actions.ts:106-144`

- **Inputs:** the same `FormData`, plus the id as a positional argument.
- **Validation:** identical to create — the same schema instance, so an update
  must resend every field. A partial update is impossible.
- **Writes:** one `JpcEvent` update. `imagePath` is included **only** when a new
  photo was uploaded (R28); `createdById` is not touched (R34).
- **Existence:** the row is not read first — a stale id throws Prisma `P2025`.
- **Cascades / notifies / returns:** as create.
- **Non-atomic:** same upload-then-write ordering (R27), plus the old blob is
  leaked on every photo replacement (R29).

### `deleteJpcEventAction(id)` — `src/lib/jpc-event-actions.ts:146-158`

- **Inputs:** id only.
- **Writes:** one hard `delete` (R35).
- **Cascades:** none — nothing references `JpcEvent`. The stored photo is left
  behind (R30).
- **Notifies:** nothing.
- **Returns:** `{ success: true }`; a missing row throws instead (R36).

### Event writes outside this module

None. Nothing else in `src/**` writes `jpcEvent` — season duplication
explicitly does not copy events (see `02-seasons.md`, R61).

---

## 7. Proposed API

Envelope per `CLAUDE.md`: `{ "data": ... }` / `{ "error": { "code", "message" } }`.
**Every endpoint here is new** — v1 has no REST surface for this domain (section 1).

| Method | Path | Status | Auth | Request | Response |
|---|---|---|---|---|---|
| GET | `/api/v1/events` | **new** | any authenticated; visibility derived from the token, never from a query param | `?from`, `?to` (both optional, default = the visible month) | `{ events: JpcEventListItem[] }` |
| GET | `/api/v1/events/:id` | **new** | any authenticated **+ the same visibility predicate applied to the row** | — | `{ event: JpcEventDetail }` — v1 has no detail view; this is what makes `description`, the photo and the season reachable (R70) |
| POST | `/api/v1/events` | **new** | SUPER (`canManageUsers`) | JSON create body | `{ event: JpcEventDetail }` — returns the row, closing R39 |
| PATCH | `/api/v1/events/:id` | **new** | SUPER | JSON partial body | `{ event: JpcEventDetail }` |
| DELETE | `/api/v1/events/:id` | **new** | SUPER | — | `{ deleted: true }` — 404 `not_found` instead of R36's raw throw |
| POST | `/api/v1/events/:id/photo` | **new**, upload-gated | SUPER | multipart `file` | `{ imageUrl }` — **`ENABLE_UPLOADS` defaults to `false` (`CLAUDE.md`), so this returns `503 uploads_disabled` until the CMS lands.** Split out of create/update deliberately so the row write is never blocked on a disabled upload path |
| DELETE | `/api/v1/events/:id/photo` | **new** | SUPER | — | `{ deleted: true }` — closes R28, which v1 has no way to express |
| GET | `/api/v1/events/:id/photo` | **new** | any authenticated + the row's visibility predicate | — | image stream — replaces the ungated path-addressed `/api/uploads/*` (R32) |
| GET | `/api/v1/calendar` | **new** — **shared with domain 3** | any authenticated | `?from`, `?to` | `{ sessions: SessionListItem[], events: JpcEventListItem[] }` |

### `GET /api/v1/calendar` and the relationship to domain 3

Domain 3 proposes `GET /api/v1/sessions` with a role-derived season set and a
`from`/`to` window (`03-sessions.md`, section 7). Every one of v1's calendar
pages issues **both** queries and merges the results client-side
(`season-calendar.tsx:237-244`). On mobile that is two requests, two loading
states and two error states for one screen, with an interleave that only works
if both arrived.

One endpoint returning both arrays under one window is the right shape. It does
**not** require unifying the models (section 10, item 1) — the response keeps
two typed arrays, and the client interleaves them exactly as v1 does. `GET
/api/v1/events` still exists on its own for the alumni Events screen and the
dashboard card, which never want sessions (R73, R78).

### Deliberate divergences from v1 in the shapes above

1. **`from`/`to` are required in practice.** R57 is unbounded; the mobile
   calendar must not download every event ever created. Same reasoning as
   domain 3, section 10 item 10.
2. **The window filters on `(endDate ?? date)`, not `date`.** This is the one
   rule that fixes R66 and makes R64 renderable — see section 10, item 5.
3. **`description` and `seasonTitle` move to the detail response.** The list row
   does not need them (nothing renders `description` outside `/super/events`),
   and the list is the response that must stay small.
4. **`createdById` is dropped from both.** It is written but read by nothing
   (section 2) and there is no reason to ship a user id to every student.

---

## 8. Proposed shared contracts

Target file: **`packages/shared/src/event.ts` — does not exist yet.** Add it to
`packages/shared/src/index.ts`, which currently exports nine modules and no
event module.

### Existing — reuse, do not redefine

- **`packages/shared/src/enums.ts`** already mirrors five Prisma enums as Zod
  enums. `JpcVisibility` belongs there, next to them, **not** in `event.ts` —
  `jpcVisibilitySchema` over `["ALL", "ALUMNI_ONLY", "SEASON"]`.
- **`sessionListItemSchema`** (`packages/shared/src/session.ts:7-25`) is the
  other half of the calendar feed. Reference it from the feed schema; do not
  restate its fields.

### New schemas this domain needs

| Name | Fields | Notes |
|---|---|---|
| `jpcVisibilitySchema` | enum `ALL` \| `ALUMNI_ONLY` \| `SEASON` | Lives in `enums.ts`. Single source for R7, R41–R47. |
| `jpcEventListItemSchema` | `id`, `title`, `date` (ISO string), `endDate` (ISO string, nullable), `allDay` (boolean, **derived server-side**), `url` (nullable), `imageUrl` (nullable, **absolute**), `visibility`, `seasonId` (nullable) | Timestamps are wire strings per the note in `season.ts:1-8`. `allDay` replaces R19's three duplicated midnight tests with one server-side derivation. `imageUrl` must be absolute — R31's relative `/api/uploads/...` is unusable from a native client. |
| `jpcEventDetailSchema` | the list fields plus `description` (nullable), `seasonTitle` (nullable) | Powers the event detail screen v1 never had (R70). |
| `createJpcEventRequestSchema` | `title` (1–200), `date` (ISO instant), `endDate` (ISO instant, nullable), `allDay` (boolean), `description` (nullable, ≤2000), `url` (nullable, URL), `visibility`, `seasonId` (nullable) | Mirrors R4–R12. Must carry both refinements: `endDate >= date` (R11) and `visibility === "SEASON" → seasonId != null` (R12). **`date` is a full ISO instant, not the four-field date/time split** — that composition (R15) is client work, and doing it there rather than on the server is what stops R20. |
| `updateJpcEventRequestSchema` | the same fields, all optional | v1 forces a full resend (section 6); v2 should accept a partial. Must re-apply both refinements against the merged row, not the patch. |
| `eventListQuerySchema` | `from`, `to` (both ISO dates) | For `GET /api/v1/events`. |
| `calendarFeedSchema` | `sessions: sessionListItemSchema[]`, `events: jpcEventListItemSchema[]` | The `GET /api/v1/calendar` response. Two arrays, not one union — see section 10, item 1. |

### Bare interfaces to convert

None in this domain — `packages/shared` has no event types today. Per the
convention in `CLAUDE.md`, everything here is authored as Zod from the start,
with the types as `z.infer`.

### Client-side query keys

`apps/mobile/src/lib/query-keys.ts` has no event factory. This domain adds
`events.all`, `events.list(params)`, `events.detail(id)`, and — jointly with
domain 3 — `calendar.range(params)`. Because an event mutation changes what
both the events list **and** the merged calendar return, every write must
invalidate `events.all` **and** the calendar key, which is the v2 equivalent of
R38's five hardcoded `revalidatePath` calls and their omissions.

---

## 9. Screens

The v2 tree is flat: one route per destination, role branches inside.

| v1 page(s) | v2 route | Exists? | Roles | Notes |
|---|---|---|---|---|
| `super/events` (page + manager client) | `/events` | **placeholder** — `apps/mobile/app/(app)/events.tsx` renders an `EmptyState` | SUPER | The management list. `packages/shared/src/navigation.ts:52` already points SUPER's sidebar here, labelled "JPC Events". |
| `super/events` inline create form | `/events/new` | **does not exist** | SUPER | v1 swaps the whole list for a form (`jpc-event-manager-client.tsx:59-66`); on mobile this is a route. |
| `super/events` inline edit form | `/events/[id]/edit` | **does not exist** | SUPER | Must fetch the row rather than `.find()` it client-side — closes R83. |
| — | `/events/[id]` | **does not exist** | all | **New.** v1 has no event detail anywhere (R70), so `description`, the photo, the season and a non-`url` event's own content are currently unreachable. Without it, `imagePath` and `description` stay write-only for every non-SUPER user. |
| `alumni/calendar` (`UpcomingEventsCard`) | `/calendar`, ALUMNI branch | **placeholder** — `apps/mobile/app/(app)/calendar.tsx` | ALUMNI | Domain 3 already claims this route; the ALUMNI branch is events-only and issues **no** session fetch (R73, and domain 3 R90). `navigation.ts:148,154` labels it "Events". |
| event chips inside the four session calendars | `/calendar`, all other branches | **placeholder** | STUDENT, LEADER, ADMIN, SUPER | Chips, agenda rows, colours: R63–R72. The component is domain 3's; this domain supplies the data and the `allDay` / span rules. |
| `UpcomingEventsCard` on six dashboards | `/dashboard` (shared card) | exists — `apps/mobile/app/(app)/dashboard.tsx` | all | One card, one hook, one query key. Replaces six independent server-component instances (R78). Must render an empty state rather than nothing (R75). |
| `super/dashboard` "Upcoming events" tile | `/dashboard`, SUPER branch | exists | SUPER | Should be derived from the same list the card renders, not a second unfiltered count (R79). |

### Naming conflict to resolve before building

v2's navigation already ships **two different destinations both called
"Events"**: SUPER's `/events` (`navigation.ts:52`, "JPC Events" — the manager)
and ALUMNI's `/calendar` (`:148,154`, "Events" — a read-only upcoming list).
This mirrors v1, where `/super/events` and `/alumni/calendar` were likewise
unrelated. It is survivable because no role sees both, but it means `/events`
must branch: SUPER gets the manager, and any other role reaching it by deep
link needs a graceful read-only or "not available" state rather than a crash —
the same requirement domain 3 flagged for MENTOR on `/calendar`.

---

## 10. Open questions and divergences

Ordered by how much damage a faithful port would do.

### 1. Should v2 unify events and sessions into one model? — **No. Unify the feed, not the model.**

The brief asks this first because both appear on one calendar. The evidence says
they are different things that share a surface.

What an event is that a session is not:

| | `Session` | `JpcEvent` |
|---|---|---|
| Owning scope | `seasonId` **required**, `onDelete: Cascade` | `seasonId` **nullable**, `onDelete: SetNull`, meaningful only for one of three visibilities |
| Audience | everyone in the season | an explicit `visibility` enum with three levels, spanning the whole organisation |
| Duration | `durationMinutes`, end derived | `endDate` stored, possibly spanning days; no duration |
| All-day | impossible | the default (R16) |
| Attendance | `Attendance[]`, check-in token, QR, 3-hour window | none |
| Recurrence | `recurrenceGroupId`, scopes, sibling edits | none at all (R21) |
| Hangs off it | quizzes, video questions, video progress, assignments | nothing |
| Media / link | none | `imagePath`, `url` |
| Notifications | `SESSION_RESCHEDULED` on reschedule | none (R33) |
| Who writes it | season admins (`isAdminOfSeason`) | SUPER only (R1) |
| Deletion | hard, cascading through four tables | hard, cascading nowhere |

A unified model would need roughly nine nullable columns and a discriminator,
and every rule in domain 3 would have to grow an "only when kind = SESSION"
qualifier. It would also be **impossible to build here regardless**: the
database is shared with production v1 and `CLAUDE.md` forbids creating
migrations in this repo, so `JpcEvent` and `Session` stay as they are for the
whole migration.

**Recommendation:** keep two Prisma models and two endpoints. Unify only the
*read feed* — `GET /api/v1/calendar` returning two typed arrays under one
`from`/`to` window (section 7) — and one shared `CalendarEntry` view model on
the client, built by interleaving the two arrays exactly as
`season-calendar.tsx:237-244` already does. Revisit unification only if events
ever acquire attendance or recurrence, which nothing in v1 suggests.

### 2. `ALUMNI_ONLY` events are invisible to alumni — **the headline defect**

R44 + R45: `UpcomingEventsCard` computes eligibility as
`user.role !== "STUDENT"`, and an alumnus **is** role `STUDENT`
(`rbac.ts:20-22`). The alumni Events page and the alumni dashboard are the only
two surfaces alumni have, and both use that card. So in shipped v1,
`ALUMNI_ONLY` means "visible to staff, hidden from alumni" — the exact inverse
of its name, its design-doc description, and the manager list's badge (R46).

The form label hedges it as "Alumni only (leaders, admins)"
(`jpc-event-form.tsx:195`), which suggests someone noticed and documented the
behaviour rather than fixing it.

**Recommendation:** this needs a product decision, not a port. The likely intent
is "alumni and staff", i.e. include when `isAlumnus(user) || user.role !==
"STUDENT"`. Whichever is chosen, it becomes **one** server-side predicate in the
events endpoint (item 3) and the enum's UI label must match it. Do not ship the
current behaviour by accident.

### 3. Visibility is a caller-supplied argument, not a server rule

R43, R44, R55: `listJpcEvents` authorizes nothing. Five call sites pass literals
and the dashboard card passes a formula, and the two disagree (item 2). This is
exactly the implicit-gate shape the first batch of specs found elsewhere: the
rule lives in whichever component happens to call the query.

**Recommendation:** in v2 the endpoint derives both knobs from the token —
never from a request parameter — so there is one alumni formula and one
`viewerSeasonIds` resolution. A `?visibility=` filter, if ever added, must
narrow the derived set and never widen it.

### 4. `SEASON` events ignore season status and soft-delete — and do **not** inherit the sessions gate

R52, R53, R54. Domain 3 established that the cross-season session feed is
implicitly gated on `season.status === "ACTIVE" && deletedAt === null`
(`03-sessions.md`, R74). Events have **no such clause**. A `SEASON` event on a
`DRAFT`, `COMPLETED`, `ARCHIVED` or soft-deleted season keeps appearing for that
season's members, and SUPER's `"all"` surfaces soft-deleted seasons' events too.

The asymmetry is almost certainly unintentional — the two filters were written
months apart — but it is not obviously wrong: an event on a completed season is
history that arguably should still show, whereas the session feed's `ACTIVE`
filter exists to keep the super calendar finite.

**Recommendation:** exclude soft-deleted seasons (`deletedAt: null`) — that is a
bug in any reading. Keep events visible across all season *statuses*, and state
that as an intentional divergence from R74 rather than silently inheriting or
silently not inheriting it. Also decide what happens to R54's orphans:
`visibility = SEASON` with `seasonId = null` should be treated as `ALL` or
hidden outright, not left in a state only SUPER can observe.

### 5. Multi-day events are half-implemented

R64 + R66 are the same defect from two directions. `endDate` is stored,
validated (R11), rendered by the manager list and the dashboard card — and
**completely ignored by the calendar**, which buckets on `date` alone. So a
five-day retreat is one chip on day one, and it drops out of the agenda on day
two while the dashboard card two screens away still shows it.

**Recommendation:** pick one window — `(endDate ?? date) >= from` — and use it
in the endpoint, the agenda and the card. Then either render the span across its
days in Week/Month view, or accept single-day chips and say so explicitly. The
worst outcome is porting both windows again.

### 6. Midnight-means-all-day is a value convention, re-derived in three places

R16, R19. There is no `allDay` column and no migration is possible here.

**Recommendation:** derive `allDay` **once**, server-side, and put it on the
contract (section 8). Every client then reads a boolean instead of running
`getHours() !== 0` in the viewer's timezone — which is what makes R19 wrong for
anyone not in the server's zone.

### 7. Time is authored on the **server** for events and in the **browser** for sessions

R15, R20, R82. Domain 3 established that v1 stores no timezone anywhere and that
the session wall-clock is composed in the *admin's browser*
(`03-sessions.md`, R26, R105–R108). Events do the opposite: the browser posts
four naive strings and the **server** parses them (R15). Two entries on the same
calendar, authored on the same day, resolve against two different clocks — and
editing an event from a different timezone than it was created in silently moves
it (R82).

**Recommendation:** cross-reference `03-sessions.md` section 10 item 5 — this
domain does not get its own answer, it must take that one. In the interim,
compose the full ISO instant **client-side** for events too (section 8), so at
least both models behave identically and the defect is one problem instead of
two. This must be settled before the calendar screen is built.

### 8. The event photo has no lifecycle

R27 (written before the row, outside a transaction), R28 (cannot be removed),
R29 (replacement leaks the old blob), R30 (deleting the event leaks it too).
Nothing in v1 ever calls `storage.delete` for an event.

Note also that uploads are **switched off in v2** — `ENABLE_UPLOADS` defaults to
`false` while file handling moves to a CMS (`CLAUDE.md`). So the photo path
cannot be exercised at all yet.

**Recommendation:** split photo upload out of create/update into its own
endpoint (section 7) so the row write never depends on a disabled upload path;
add the missing `DELETE .../photo`; and delete the blob on both replacement and
event deletion. Since uploads are off, an events screen can ship complete
without them — build the read path against `imageUrl` and leave the write
behind the existing gate.

### 9. Event photos are served by an ungated path

R32: `/api/uploads/[...path]` checks only that a session exists. Any
authenticated user who observes or guesses a key can fetch any event photo,
including one attached to an `ALUMNI_ONLY` or `SEASON` event they cannot see.

v2 already refused to port the identical hole for submission files and replaced
it with an id-addressed, permission-gated route (`CLAUDE.md`, "Two endpoints
here are **not** ports"). **Recommendation:** do exactly that here — `GET
/api/v1/events/:id/photo`, gated on the same visibility predicate as the row,
and never expose the storage key on the wire.

### 10. The events list is unbounded

R57: no window, no limit, no pagination, on every calendar render for every
role. Identical in kind to domain 3's item 10 for sessions, and it lands on the
same screen.

**Recommendation:** the `from`/`to` window on `GET /api/v1/events` and
`GET /api/v1/calendar` (section 7), driven by the calendar view's visible range,
with the dashboard card requesting a small forward window instead of the whole
table.

### 11. Delete and update are unguarded against a missing row

R36: neither reads the row first, so a stale id throws a raw Prisma error
through the server action. There is also no soft delete (R35) while `User`,
`Season`, `StudentProfile` and `Assignment` all have one.

**Recommendation:** 404 `not_found` in the v2 envelope. Leave the hard delete —
adding `deletedAt` would need a migration, which this repo cannot create — but
note that a deleted event is unrecoverable and keep the confirmation dialog v1
already has (R37).

### 12. Two `SEASON`-related read gaps worth deciding together

R68 (nothing on the calendar distinguishes a `SEASON` event from an `ALL` one)
and R62 (the season picker hides soft-deleted seasons, so editing an event bound
to one shows a blank select). Both are small; both are the kind of thing a
faithful port reproduces silently.

**Recommendation:** badge `SEASON` chips with the season code, and have the
picker include the event's current season even when soft-deleted, marked as
such.

### 13. The design doc and the plan describe a much smaller feature than what shipped

`docs/superpowers/specs/2026-06-04-calendar-and-avatar-design.md` and
`docs/superpowers/plans/2026-06-04-season-calendar-jpc-events.md` are both from
before the fact. Where they disagree with the code, **the code is what runs.**
Recorded here so a v2 implementer reading them is not misled:

| Design/plan says | Code does |
|---|---|
| `JpcVisibility` has two values, `ALL` and `ALUMNI_ONLY` (design:97-100, plan:46-49) | Three — `SEASON` exists and carries a whole row-scope model (R47–R54) |
| Model has `title`, `date`, `url`, `visibility`, `createdById` (design:84-95) | Also `endDate`, `description`, `imagePath`, `seasonId` — four fields and two relations the design never mentions |
| `createdById Int` — required, `onDelete` default (plan:71) | `createdById Int?` with `onDelete: SetNull` (`schema.prisma:765,769`) |
| "Enforced at the query layer in `getJpcEvents` and verified in Server Actions" (design:124) | **False.** The query authorizes nothing (R55); the *caller* decides (R43, R44). The actions verify the write gate only. |
| `ALUMNI_ONLY` visible to "LEADER, ADMIN, MENTOR, SUPER — not STUDENT" (design:123) | Accurate — and therefore not visible to alumni either, which the design never confronts (R45) |
| Query returns "upcoming + recent events" (design:106) | Returns **every** event, unwindowed (R57) |
| Month grid only, defaulting to the current month (design:47) | Three views — Upcoming (default), Week, Month — with a session-derived anchor month (R72, domain 3 R93–R95) |
| "only Monday cells carry session cells" (design:33) | No such restriction; sessions bucket to their own weekday |
| Function named `getJpcEvents` (design:106) | `listJpcEvents` |

The `SEASON` visibility, the photo, `endDate` and `description` were all added
after the plan was written and were never specified anywhere. **This spec is
their first written contract.**

### 14. Minor: `randomUUID()` rather than the house id generator

R26: the storage key uses `node:crypto` `randomUUID()`, while every other
identifier in the product uses `newPublicId()` (10 chars, `nanoid`-compatible in
v1 and reimplemented over `node:crypto` in v2 per `CLAUDE.md`).
**Recommendation:** use `newPublicId()` in v2 for consistency; nothing parses
the key, so the change is unobservable.

### 15. Minor: no notification on a new organisation-wide event

R33. A retreat published to every member in the system produces no notification
at all, while merely *rescheduling* a single session notifies every enrolled
student (domain 3, R45). **Recommendation:** worth raising with the product
owner. If it is wanted, the payload shape belongs to domain 10 and the
recipient set is exactly the visibility predicate from item 3 — which is a good
argument for building that predicate as a reusable function rather than a
`where` clause.
