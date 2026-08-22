# Domain 02 — Seasons

> Status: draft · Phase: 1 (reads) / 3 (writes) · v1 API status: read done

A season is the top-level container. Groups, sessions, assignments, enrollment,
attendance, quizzes, engagement notes and reports all hang off it, and four
other domain specs will reference the rules below. Every citation is a path
under `D:\Projects\JPC\jpc-space` unless prefixed with `apps/` or `packages/`,
which are `D:\Projects\JPC\space-v2`.

---

## 1. v1 source

| File | Holds |
|---|---|
| `src/lib/season-actions.ts` | All three season writes (`createSeasonAction`, `updateSeasonAction`, `softDeleteSeasonAction`) plus `duplicateSeasonAction`; the server-side Zod schema; the only `db.season.create/update` call sites in the repo |
| `src/lib/seasons-query.ts` | `loadSeasonByCode` — the single detail read, used by `/super/seasons/[code]` and all 18 `/admin/season/[code]/**` pages |
| `src/lib/season-history-query.ts` | `loadSeasonHistory` — a student's/alumnus's past seasons, attendance % and curriculum only |
| `src/lib/slug.ts` | `slugifySeasonCode` + `isValidSeasonCode` — the season-code format rule |
| `src/lib/auth/permissions.ts:37-71` | `canCreateSeason`, `canEditSeason`, `canAccessSeason` |
| `src/lib/rbac.ts:20-30` | `isAlumnus`, `isAdminOfSeason` — the claims the season gates read |
| `src/lib/auth/scopes.ts:10-25` | Loads `seasonAdminIds` and `activeSeasonId` into the JWT at sign-in |
| `src/components/seasons/season-form.tsx` | Create/edit form; client mirror of the server schema; code auto-fill rule |
| `src/components/seasons/season-status-badge.tsx` | Status → label/variant map; proves status is stored, not derived |
| `src/components/seasons/seasons-list.tsx` | Program grouping and within-program ordering; the create button |
| `src/components/seasons/season-detail.tsx` | Overview/Groups/Sessions tabs; where Duplicate and Edit are rendered |
| `src/components/seasons/duplicate-season-dialog.tsx` | Duplicate defaults (year+1, dates +1 year) and the user-facing statement of what is copied |
| `src/components/seasons/delete-season-button.tsx` | Confirm dialog; the only place the non-cascading nature of delete is stated |
| `src/components/students/season-history.tsx` | Shared history card used by both student and alumni history pages |
| `src/app/super/seasons/page.tsx` | SUPER list of all seasons |
| `src/app/super/seasons/new/page.tsx` | Create form host |
| `src/app/super/seasons/[code]/page.tsx` | SUPER season detail |
| `src/app/super/seasons/[code]/edit/page.tsx` | Edit form host + delete button; the only page that reads the absence-budget fields |
| `src/app/super/seasons/program/[program]/page.tsx` | Seasons of one program, year desc |
| `src/app/super/seasons/year/[year]/page.tsx` | Seasons of one year, program asc |
| `src/app/super/seasons/error.tsx`, `loading.tsx` | Error/skeleton boundaries for the list |
| `src/app/admin/season/page.tsx` | ADMIN's season list + single-season redirect |
| `src/app/admin/season/[code]/page.tsx` | ADMIN's single-season workspace (read-only header, sessions inline) |
| `src/app/admin/season/[code]/**` (17 more pages) | Consumers of `loadSeasonByCode`: groups, roster, calendar, sessions, assignments, quizzes, reports |
| `src/app/student/season/page.tsx` | STUDENT "Current season" — hero, progress, group, upcoming sessions |
| `src/app/student/history/page.tsx` | STUDENT past seasons |
| `src/app/alumni/history/page.tsx` | ALUMNI past seasons |
| `src/app/admin/dashboard/page.tsx:20-31` | The "which season am I looking at" resolution rule (duplicated below) |
| `src/app/admin/calendar/page.tsx:16-27`, `src/app/admin/quizzes/page.tsx:18-28` | The same resolution rule, copy-pasted |
| `src/lib/sessions-query.ts:64-66` | `listSessionsForAllActiveSeasons` — the only cross-season read gated on `status: "ACTIVE"` |
| `src/lib/enrollment-actions.ts:50-66` | Graduation clears `activeSeasonId` and closes the ACTIVE enrollment |

v1 has **no test files**; the source above is the entire statement of intent.

---

## 2. Data model

Models named exactly as `apps/backend/prisma/schema.prisma` (verbatim copy of
v1's) names them.

### `Season` (`prisma/schema.prisma:242-278`)

| Field | Meaning / rule dependency |
|---|---|
| `code` | `@unique`. The URL identifier. Human-authored slug, mutable. See R1–R9. |
| `title` | **Derived, never user-supplied** — always `"<program> <year>"`. See R10. |
| `program` | The recurring program ("GBV"). Groups a season's year history. Free text, exact-match filtered. |
| `year` | Cohort year within the program. Validated 2000–2100 in code, unconstrained in the DB. |
| `description` | Nullable. Shown on detail and on the student's season page. |
| `startDate`, `endDate` | `DateTime`, both required. `endDate >= startDate` enforced in code only. **No timezone column anywhere.** |
| `status` | `SeasonStatus` enum, `@default(DRAFT)`. Stored, not derived. See R16–R21. |
| `absenceBudgetMinutes` | `@default(180)`. Written by update, **not** by create — see R21. Read only by the edit page and the attendance domain. |
| `absenceWeightMinutes` | `@default(90)`. Same gap as above. |
| `coverImagePath` | **Written nowhere and read nowhere** in v1. Dead column. |
| `createdById` / `updatedById` | Audit columns, `onDelete: SetNull`. Populated on every season write. |
| `deletedAt` | Soft delete. Every list/detail read filters it — with two exceptions (R27, R37). |

Relations traversed by this domain: `groups` (with `leaders.user.name` and
`_count.students`), `sessions` (`_count` and, on duplicate, full rows),
`assignments` (on duplicate), `enrollments` (`_count`), `activeForStudents`
(`StudentProfile.activeSeasonId` back-relation), `admins` (`SeasonAdmin`, read
only indirectly through the JWT).

Cascade behaviour that constrains deletion design:
`Session.seasonId onDelete: Cascade` (`:366`), `SeasonAdmin.seasonId Cascade`
(`:282`), but `Group.seasonId onDelete: Restrict` (`:300`) and
`SeasonEnrollment.seasonId onDelete: Restrict` (`:344`). **A hard delete of a
season with any group or enrollment would be refused by the database**; v1
never attempts one.

### `SeasonEnrollment` (`:339-357`)

Append-only history. `@@unique([studentUserId, seasonId])` (`:355`) is what
`canAccessSeason` looks up for students (`src/lib/auth/permissions.ts:63-65`).
`status` is `EnrollmentStatus` (`ACTIVE|COMPLETED|WITHDRAWN`, `:38-42`) — note
this is a *different* enum from `SeasonStatus` and the two are easy to confuse
in a port.

### `SeasonStatus` enum (`:31-36`)

`DRAFT`, `ACTIVE`, `COMPLETED`, `ARCHIVED` — declaration order matters, see R24.

### `StudentProfile.activeSeasonId`

Nullable FK, relation `"StudentActiveSeason"` (`:270`). It is the *only*
definition of "the student's current season"; there is no query that derives it
from dates or enrollment status.

### Nullable-in-schema, treated-as-required-in-code

- `Season.description` is nullable but the form binds it to `""` and coerces
  back to `null` on save (`src/components/seasons/season-form.tsx:86`,
  `src/lib/season-actions.ts:91`).
- `StudentProfile.activeSeasonId` is nullable and correctly handled as such by
  the student page (`src/app/student/season/page.tsx:25`), but
  `src/app/student/season/page.tsx:40` then assumes the referenced season row
  exists **and is not soft-deleted** — see R27.

---

## 3. Business rules

### Identity and the season code

- **R1.** `Season.code` is globally unique and is the URL identifier for a season — `prisma/schema.prisma:244`.
- **R2.** On create, when the caller supplies no code, it is generated from `"<program> <year>"` — `src/lib/season-actions.ts:65`.
- **R3.** Whatever code is supplied is slugified server-side before validation and storage: NFKD normalise, strip combining marks, lowercase, every run of non-`[a-z0-9]` → `-`, trim leading/trailing dashes, collapse repeats — `src/lib/slug.ts:3-11`, applied at `src/lib/season-actions.ts:65` (create), `:115` (update), `:256` (duplicate).
- **R4.** The slugified code must match `^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$` and be 2–40 characters — `src/lib/slug.ts:1,13-15`; length bound at `src/lib/season-actions.ts:23`, format refinement at `:38-41`.
- **R5.** Create rejects a code already in use with a field-level error rather than throwing — `src/lib/season-actions.ts:76-83`.
- **R6.** Update's uniqueness check excludes the row being updated, so re-saving an unchanged code succeeds — `src/lib/season-actions.ts:126-129`.
- **R7.** *(implicit)* The uniqueness check has no `deletedAt: null` filter, so a soft-deleted season permanently reserves its code — `src/lib/season-actions.ts:76`, `:126-129`, `:264`.
- **R8.** Codes are mutable — update rewrites `code`, changing every URL that addresses the season — `src/lib/season-actions.ts:141`. v1 issues no redirect and keeps no alias; `revalidatePath` is called for the *new* code only (`:157`).
- **R9.** The form auto-fills the code from `program + year` on every keystroke until the user edits the code field, after which it stops; in `edit` mode, or whenever a default code is supplied, auto-fill is off from the start — `src/components/seasons/season-form.tsx:97-105`.

### Derived and defaulted values

- **R10.** `title` is always derived as `"<program> <year>"` and is recomputed on every update — `src/lib/season-actions.ts:88` (create), `:142` (update), `:281` (duplicate). It is never an input field on any form.
- **R11.** Field bounds: `program` 1–60 chars; `year` integer 2000–2100; `description` ≤2000 chars, optional and nullable; `absenceBudgetMinutes` and `absenceWeightMinutes` integers ≥1 defaulting to 180 and 90 — `src/lib/season-actions.ts:21-37`.
- **R12.** `endDate` must be on or after `startDate`; equal dates are allowed — `src/lib/season-actions.ts:42-45`.
- **R13.** Both dates are `z.coerce.date()`, so ISO strings are accepted as well as `Date` — `src/lib/season-actions.ts:27-28`, and the input type declares `Date | string` at `:52-53`.
- **R14.** Validation failures return `{ ok: false, error, fieldErrors }` and keep only the **first** issue per field path — `src/lib/season-actions.ts:67-74`, `:117-124`.
- **R15.** An empty or absent description is stored as `null`, not `""` — `src/lib/season-actions.ts:91`, `:145`.
- **R16.** Season status is a **stored** enum column defaulting to `DRAFT` — `prisma/schema.prisma:31-36,251`. It is not derived from dates anywhere: the badge is a pure map over the stored value — `src/components/seasons/season-status-badge.tsx:4-19`.
- **R17.** There is no state machine. Any status may be set to any other status through the edit form's free `Select` — `src/components/seasons/season-form.tsx:61-66,208-227`, written unconditionally at `src/lib/season-actions.ts:148`.
- **R18.** Create takes the status from the form, which defaults the control to `DRAFT` — `src/components/seasons/season-form.tsx:89`, written at `src/lib/season-actions.ts:94`.
- **R19.** Nothing in v1 ever transitions a season's status automatically — no cron, no date check, no enrollment side effect. The only writes to `Season` in the whole repo are at `src/lib/season-actions.ts:85` (create), `:138` (update), `:169` (soft delete) and `:278` (duplicate). A season whose `endDate` has passed stays `ACTIVE` until a human changes it.
- **R20.** Duplicate always creates the new season as `DRAFT`, whatever the source's status — `src/lib/season-actions.ts:287`.
- **R21.** **Create does not persist `absenceBudgetMinutes` / `absenceWeightMinutes`** — the create `data` object omits both (`src/lib/season-actions.ts:85-99`) while update writes them (`:149-150`). Values the operator typed on the create form are silently discarded and the DB defaults 180/90 apply (`prisma/schema.prisma:254-255`). See §10.

### Status and deletion as implicit filters

- **R22.** *(implicit)* "The current season" for an ADMIN or SUPER is resolved as: the most recent **ACTIVE, non-deleted** season by `startDate desc` within the caller's `seasonAdminIds` (unscoped for SUPER); if none, fall back to the most recent non-deleted season of any status — `src/app/admin/dashboard/page.tsx:20-31`. The identical two-query fallback is copy-pasted at `src/app/admin/calendar/page.tsx:16-27` and `src/app/admin/quizzes/page.tsx:18-28`.
- **R23.** *(implicit)* The all-seasons session feed includes only sessions whose season is `ACTIVE` and not deleted — `src/lib/sessions-query.ts:64-66`. A `DRAFT` season's sessions never appear there.
- **R24.** *(implicit)* The SUPER season list is ordered `status asc, startDate desc`. Postgres orders enums by declaration order, so this means DRAFT → ACTIVE → COMPLETED → ARCHIVED — `src/app/super/seasons/page.tsx:20` with `prisma/schema.prisma:31-36`. The same ordering is used for the ADMIN list — `src/app/admin/season/page.tsx:28`.
- **R25.** *(implicit)* Every season list and the detail read filter `deletedAt: null` — `src/lib/seasons-query.ts:8`, `src/app/super/seasons/page.tsx:19`, `src/app/super/seasons/[code]/edit/page.tsx:23`, `src/app/super/seasons/program/[program]/page.tsx:26`, `src/app/super/seasons/year/[year]/page.tsx:27`, `src/app/admin/season/page.tsx:27`. The two exceptions are R27 and R37.

### The student's active season

- **R26.** A student's active season is the stored FK `StudentProfile.activeSeasonId`, read once at sign-in into the JWT — `src/lib/auth/scopes.ts:14-23`, `src/lib/auth.ts:80,90`. It is never recomputed per request, so a mid-session enrollment change is invisible until the token refreshes.
- **R27.** *(implicit)* The student's "Current season" page loads the season by id with **no `deletedAt: null` filter** — a soft-deleted season stays fully visible to its enrolled students — `src/app/student/season/page.tsx:40-51`. See §10.
- **R28.** *(implicit)* A student with `activeSeasonId === null` gets an "No active season" empty state, not an error — `src/app/student/season/page.tsx:25-38`.
- **R29.** *(implicit)* Season progress on that page is **session-based, not calendar-based**: total = every session in the season, completed = sessions with `startsAt <= now`; the percentage is rounded and is 0 when there are no sessions — `src/app/student/season/page.tsx:87-88,92`. It is labelled "Week N of M" although it counts sessions, not weeks (`:121`).
- **R30.** *(implicit)* The "upcoming sessions" block shows the next three sessions of the season with `startsAt >= now`, ascending — `src/app/student/season/page.tsx:81-86`.
- **R31.** A student's group membership is a global singleton keyed on `studentUserId` alone, looked up **without a season filter** — `src/app/student/season/page.tsx:63-64`, `prisma/schema.prisma:330`. The page therefore shows whatever group the student is currently in, even if that group belongs to a different season than `activeSeasonId`.
- **R32.** Graduating a student clears `activeSeasonId` and closes their ACTIVE enrollment as `COMPLETED` with `completedAt` — `src/lib/enrollment-actions.ts:50-66`. This is the only path that empties `activeSeasonId` other than a direct profile edit (`src/lib/student-actions.ts:134`).

### Season history (student and alumni)

- **R33.** History is enrollment-driven: one row per `SeasonEnrollment` of the student, ordered `enrolledAt desc`, **regardless of enrollment status** — WITHDRAWN and COMPLETED enrollments both appear — `src/lib/season-history-query.ts:22-33`.
- **R34.** History deliberately fetches no submissions, feedback or engagement notes — attendance percentage and curriculum only — `src/lib/season-history-query.ts:13-17` (documented intent) and the `select` at `:28-32`.
- **R35.** `excludeSeasonId` removes the caller's current season from the list; the student page passes `activeSeasonId`, the alumni page passes `null` so every enrollment shows — `src/lib/season-history-query.ts:25`, `src/app/student/history/page.tsx:17`, `src/app/alumni/history/page.tsx:15`.
- **R36.** Attendance percentage = (`PRESENT` + `LATE` attendance rows for that student in that season) ÷ (all sessions in that season), rounded; 0 when the season has no sessions — `src/lib/season-history-query.ts:43-51,63-66,76`.
- **R37.** *(implicit)* The denominator is every session the season has **now**, not the sessions that existed while the student was enrolled, and not the sessions the student had any attendance record for — `src/lib/season-history-query.ts:38-42,55-58`. Adding a session to a past season retroactively lowers every alumnus's percentage.
- **R38.** *(implicit)* History has no `deletedAt` filter on the joined season, so a soft-deleted season still appears in a student's or alumnus's history — `src/lib/season-history-query.ts:22-32`.
- **R39.** Curriculum is every session title + `startsAt` in the season, ascending — `src/lib/season-history-query.ts:38-41,59-61`; rendered inside a collapsed `<details>` — `src/components/students/season-history.tsx:45-64`.
- **R40.** Every history row is badged "Participated" unconditionally — the enrollment's `status` is not read — `src/components/students/season-history.tsx:41`, and it is absent from the query's `select` at `src/lib/season-history-query.ts:28-32`.
- **R41.** Zero enrollments renders an empty state, not an error — `src/lib/season-history-query.ts:34`, `src/components/students/season-history.tsx:14-22`.

### Program and year grouping

- **R42.** `program` groups a season's year history and `year` is the cohort year within it — `prisma/schema.prisma:246-247`; indexed `@@index([program, year])` at `:277`.
- **R43.** Any season list groups its rows by `program` in the client, programs sorted alphabetically (`localeCompare`), seasons within a program sorted by `year` descending — `src/components/seasons/seasons-list.tsx:112-123`.
- **R44.** *(implicit)* `/super/seasons/program/[program]` matches `program` by exact decoded string equality — no case folding, no trimming, no slug — so "GBV" and "gbv" are different programs — `src/app/super/seasons/program/[program]/page.tsx:23,26`.
- **R45.** Both the by-program and by-year pages return **404 when the filter yields no rows**, rather than rendering an empty state — `src/app/super/seasons/program/[program]/page.tsx:40`, `src/app/super/seasons/year/[year]/page.tsx:41`.
- **R46.** `/super/seasons/year/[year]` 404s a non-integer year, but accepts any integer including years outside the 2000–2100 write bound — `src/app/super/seasons/year/[year]/page.tsx:23-24`.
- **R47.** By-program orders `year desc`; by-year orders `program asc` — `src/app/super/seasons/program/[program]/page.tsx:27`, `src/app/super/seasons/year/[year]/page.tsx:27`. The client-side regrouping in R43 then re-sorts within each program regardless.

### Deletion

- **R48.** Deletion is a soft delete: `deletedAt = now()` and `updatedById = actor`. Nothing is hard-deleted — `src/lib/season-actions.ts:169-172`.
- **R49.** *(implicit)* v1 checks **nothing** before soft-deleting: not enrolled students, not sessions, not groups, not assignments, not whether the season is `ACTIVE` — `src/lib/season-actions.ts:163-177`. The confirm dialog's copy is the only guard the user sees — `src/components/seasons/delete-season-button.tsx:34`.
- **R50.** Soft delete cascades to nothing. Groups, sessions, attendance, enrollments, assignments and quizzes all survive and remain reachable by their own ids — `src/lib/season-actions.ts:169-172` (single-field update).
- **R51.** *(implicit)* Soft delete does **not** clear `StudentProfile.activeSeasonId` for students pointing at the season, and does **not** remove `SeasonAdmin` rows — both scopes stay live in tokens and in the database — `src/lib/season-actions.ts:169-172`.
- **R52.** There is no un-delete. `deletedAt` is written at exactly one place and cleared nowhere — the repo's only `db.season.update` calls are `src/lib/season-actions.ts:138` and `:169`.
- **R53.** Soft delete redirects to `/super/seasons` — `src/lib/season-actions.ts:176` — so it can only be invoked from a page where that destination makes sense.

### Duplication

- **R54.** Duplicate requires `canCreateSeason` (SUPER only), **not** the source season's admin rights — `src/lib/season-actions.ts:204` with `src/lib/auth/permissions.ts:37-39`.
- **R55.** Duplicate validates `year` as an integer 2000–2100 **before** reading the source, with its own hand-written check rather than the Zod schema — `src/lib/season-actions.ts:206-208`.
- **R56.** Duplicate copies from the source season: `program`, `description`, `absenceBudgetMinutes`, `absenceWeightMinutes` — `src/lib/season-actions.ts:280-291`. It takes `year`, `code`, `startDate`, `endDate` from input and forces `status: DRAFT`.
- **R57.** Duplicate copies **groups** (`name`, `description` only) — `src/lib/season-actions.ts:218,298-303`.
- **R58.** Duplicate copies **sessions** (`title`, shifted `startsAt`, `durationMinutes`, `location`, `youtubeUrl`, `description`, `recurrenceGroupId`) — `src/lib/season-actions.ts:219-230,307-321`.
- **R59.** Duplicate copies **assignments that are not soft-deleted** (`title`, `description`, shifted `dueAt`, `isAllGroups`, `type`, `forumMinWords`, `forumAllowComments`, `maxFileSizeMb`, `allowedMimeCategories`, and `sessionId` remapped to the cloned session) — `src/lib/season-actions.ts:231-247,324-341`. The `where: { deletedAt: null }` at `:232` is the only place a child's soft-delete state is respected.
- **R60.** Assignment→group targets are copied only when the assignment is not `isAllGroups` and only for groups that were successfully remapped; an unmappable target is dropped silently — `src/lib/season-actions.ts:342-354`.
- **R61.** Duplicate copies **nothing else**. Specifically not: enrollments, attendance, submissions, quizzes, engagement notes, JPC events, `SeasonAdmin` rows, `GroupLeader` rows, `GroupStudent` memberships, `coverImagePath`, session `materialsPath`, session `checkInToken`/`checkInOpenAt`/`checkInClosedAt`, or soft-deleted assignments — the `select` at `src/lib/season-actions.ts:210-248` is the whole contract; documented intent at `:193-198` and shown to the user at `src/components/seasons/duplicate-season-dialog.tsx:126-129`. **The cloned groups therefore have no leaders.**
- **R62.** The date shift is a single offset — `newStartDate − source.startDate` — applied to every session's `startsAt` and every non-null assignment `dueAt`; a null `dueAt` stays null — `src/lib/season-actions.ts:273-275,311,330`.
- **R63.** The new `endDate` is taken verbatim from input and is **not** derived from the offset, so cloned sessions can land after the new season's end date with no validation — `src/lib/season-actions.ts:286` versus `:273`.
- **R64.** Duplicate's code follows the same rules as create: default `"<source.program> <year>"`, slugified, format-checked, uniqueness-checked — `src/lib/season-actions.ts:256-271`.
- **R65.** *(implicit)* Duplicate copies `recurrenceGroupId` verbatim, so cloned sessions share a recurrence group with the **source season's** sessions. A later "this and following" session edit or delete then matches rows in both seasons — `src/lib/season-actions.ts:316` with `src/lib/session-actions.ts:110-113` and `:200-203`, which scope their `updateMany`/`deleteMany` on `recurrenceGroupId` alone with no season filter.
- **R66.** *(implicit)* The source lookup has no `deletedAt: null` filter, so a soft-deleted season can be duplicated — `src/lib/season-actions.ts:210-211`.
- **R67.** The entire clone runs inside one `db.$transaction` — a partial clone is impossible — `src/lib/season-actions.ts:277-358`. This is the only transactional write in the domain.
- **R68.** Cloned season and cloned assignments carry the duplicating user as `createdById`/`updatedById`; `Group` and `Session` have no audit columns to carry — `src/lib/season-actions.ts:290-291,337-338`, `prisma/schema.prisma:297-312,363-380`.
- **R69.** The duplicate dialog defaults to `year + 1` and to start/end dates shifted by exactly one calendar year (`addYears`), and auto-fills the code from `"<program> <year>"` until the user edits it — `src/components/seasons/duplicate-season-dialog.tsx:63,73-78,84-87`. These are UI defaults only; the action accepts any dates.

### Audit columns

- **R70.** Create sets both `createdById` and `updatedById` to the actor; update and soft delete set `updatedById` — `src/lib/season-actions.ts:95-96,151,171`.

### Read behaviour

- **R71.** `loadSeasonByCode` throws Next's `notFound()` (404) when the code does not resolve to a live season — `src/lib/seasons-query.ts:33`. Because it is the first call in every `/admin/season/[code]/**` page, an unknown or deleted code 404s **before** any authorization check runs.
- **R72.** *(implicit)* `studentCount` on the season detail is `_count.enrollments` — every enrollment ever, including `WITHDRAWN` and `COMPLETED` — `src/lib/seasons-query.ts:19,46`. Every other student count in v1 filters `status: "ACTIVE"` (e.g. `src/lib/reports-query.ts:99`, `src/lib/season-export.ts:52`), so the detail page's number is systematically higher than the roster's.
- **R73.** Season detail groups are ordered by `name asc`; leader names with a null `User.name` are dropped from the list rather than shown as a placeholder — `src/lib/seasons-query.ts:21,47-54`.
- **R74.** `loadSeasonByCode` returns the identical shape to every role — no field is withheld from students or leaders — `src/lib/seasons-query.ts:35-55`. (v2's ported endpoint already diverges here; see §7 and §10.)
- **R75.** The ADMIN season index redirects straight into the workspace when the admin administers exactly one season — `src/app/admin/season/page.tsx:42`.
- **R76.** An ADMIN with zero season scopes gets a "you aren't assigned to a season yet" message instead of an empty list — `src/app/admin/season/page.tsx:15-24`.
- **R77.** *(implicit)* The ADMIN season list is scoped by `id: { in: user.seasonAdminIds }` taken from the token — no database re-read of `SeasonAdmin` — `src/app/admin/season/page.tsx:27`.

---

## 4. Authorization

Role gates are pure functions over token claims (`src/lib/rbac.ts`); row-scoped
gates need a database read (`src/lib/auth/permissions.ts`). Note that
`isAdminOfSeason` is *claims-only* — it reads `seasonAdminIds` from the token —
so `canEditSeason` is a role gate despite its name.

| Operation | Roles | Row-scoped condition | v1 citation |
|---|---|---|---|
| List all seasons | SUPER | none | `src/app/super/seasons/page.tsx:16,19` |
| List own seasons | ADMIN | `id ∈ token.seasonAdminIds` | `src/app/admin/season/page.tsx:13,27` |
| List by program / by year | SUPER | none | `src/app/super/seasons/program/[program]/page.tsx:21`, `year/[year]/page.tsx:21` |
| Read season detail (super view) | SUPER | none | `src/app/super/seasons/[code]/page.tsx:20` |
| Read season detail (admin workspace) | ADMIN **only** — SUPER is refused | `canEditSeason(user, season.id)` else redirect | `src/app/admin/season/[code]/page.tsx:21,25` |
| Read season workspace sub-pages | ADMIN, SUPER | `canEditSeason(user, season.id)` else redirect | `src/app/admin/season/[code]/groups/page.tsx:23,26`; `roster/page.tsx:23,26`; `reports/page.tsx:21,24` |
| Read season (API-level, all roles) | any authenticated | SUPER/MENTOR always; ADMIN if in `seasonAdminIds`; LEADER if they lead a group in the season (DB read); STUDENT if it is their `activeSeasonId` or they hold an enrollment row (DB read) | `src/lib/auth/permissions.ts:45-71` |
| Read own current season | STUDENT | `activeSeasonId` from token; no ownership re-check | `src/app/student/season/page.tsx:23,25,40` |
| Read own season history | STUDENT | `studentUserId = self` (parameter, not a gate) | `src/app/student/history/page.tsx:15,17` |
| Read own season history | ALUMNI (`role STUDENT` + `graduationYear`) | `isAlumnus` else redirect to `/login` | `src/app/alumni/history/page.tsx:12`, `src/lib/rbac.ts:20-22` |
| Create season | SUPER | none | `src/lib/season-actions.ts:63`, `src/lib/auth/permissions.ts:37-39` |
| Update season | SUPER **or ADMIN of that season** | `isAdminOfSeason(user, seasonId)` from claims | `src/lib/season-actions.ts:111`, `src/lib/auth/permissions.ts:41-43` |
| Soft-delete season | SUPER **or ADMIN of that season** | `isAdminOfSeason(user, seasonId)` from claims | `src/lib/season-actions.ts:167` |
| Duplicate season | SUPER | none — source-season admin rights are irrelevant | `src/lib/season-actions.ts:204` |

Where v1 enforces nothing and relies on the UI:

- **Update and delete are authorized for a season ADMIN** (`canEditSeason` =
  `isAdminOfSeason`) but no page ever renders those controls for one: the season
  form and delete button live only under `/super/seasons/**`, which is
  `requireRole(["SUPER"])` (`src/app/super/seasons/[code]/edit/page.tsx:19`), and
  the ADMIN workspace passes `canEdit={false}`
  (`src/app/admin/season/[code]/page.tsx:39`). A season admin who posts the
  action directly may rename, re-code, restatus or delete their season. In v2
  every one of these becomes a real HTTP endpoint, so this stops being
  theoretical — decide it in §10 (D3).
- **Duplicate is rendered whenever `canEdit` is true**
  (`src/components/seasons/season-detail.tsx:66-74`) but the action itself
  requires SUPER. Today the two agree only because `canEdit` is passed `true`
  solely on the SUPER page.
- **`loadSeasonHistory` has no authorization at all** — it takes a
  `studentUserId` and returns that student's history
  (`src/lib/season-history-query.ts:18-21`). Both call sites pass
  `user.userId`, which is the only thing preventing it from reading anyone's
  history. In v2 this must be an explicit ownership gate, not a call-site
  convention.

---

## 5. Read surface

**`loadSeasonByCode(code)`** — `src/lib/seasons-query.ts:6-56`.
Returns one object: `id`, `code`, `title`, `program`, `year`, `description`,
`status`, `startDate`, `endDate`, `sessionCount` (`_count.sessions`),
`studentCount` (`_count.enrollments`, see R72), and `groups[]` of
`{ id, name, studentCount, leaderNames[] }` ordered by name. Filters
`deletedAt: null`; 404s via `notFound()`. Same shape for every role (R74).
One query, no N+1. It returns group and leader data that the ADMIN workspace's
Overview tab does not render, and is called by 19 pages, most of which need only
`{ id, code, title }` — every `/admin/season/[code]/**` page pays for the full
group tree plus two `_count` sub-queries.

**Super season list** — `src/app/super/seasons/page.tsx:18-32`.
All non-deleted seasons with `_count.groups`, ordered `status asc, startDate desc`
(R24). Grouped by program in the client (R43). No pagination, no filtering — the
whole table is fetched every render.

**Admin season list** — `src/app/admin/season/page.tsx:26-40`. Same shape and
ordering, scoped to `token.seasonAdminIds`; redirects when exactly one row (R75).

**By-program / by-year lists** —
`src/app/super/seasons/program/[program]/page.tsx:25-39`,
`src/app/super/seasons/year/[year]/page.tsx:26-40`. Same row shape as the super
list; different `orderBy` (R47); 404 on empty (R45).

**Edit-form load** — `src/app/super/seasons/[code]/edit/page.tsx:22-37`. The
only read anywhere that selects `absenceBudgetMinutes` / `absenceWeightMinutes`.

**`loadSeasonHistory(studentUserId, excludeSeasonId?)`** —
`src/lib/season-history-query.ts:18-80`. Returns
`{ seasonId, title, startDate, endDate, groupName, attendancePct, curriculum[] }[]`
ordered by `enrolledAt desc`. Three queries total (enrollments, then sessions and
attendance in parallel), aggregated in memory — **not** an N+1, but it loads
every session of every season the student was ever in, and every PRESENT/LATE
attendance row, to produce two numbers per season. Deliberately withholds
submissions, feedback and notes (R34).

**Student current-season page** — `src/app/student/season/page.tsx:40-89`.
Six queries: season by id (no `deletedAt` filter, R27), group membership with
leaders and all members, next three sessions, and two `session.count` calls for
the progress bar. The group query returns every member's name — a student sees
their whole group roster.

Role-shape differences in v1: **none** for the season itself. The only
per-role difference is which page you land on. v2's ported detail endpoint
already adds one (students see only their own group) — see §7.

---

## 6. Write surface

**`createSeasonAction(input)`** — `src/lib/season-actions.ts:59-104`.
Inputs `code?`, `program`, `year`, `description?`, `startDate`, `endDate`,
`status`, `absenceBudgetMinutes?`, `absenceWeightMinutes?`. Gate:
`canCreateSeason` (throws `ForbiddenError`). Slugifies the code, Zod-validates,
checks code uniqueness, inserts. **Does not write the two absence fields (R21).**
Cascades to nothing, notifies nothing. Revalidates `/super/seasons` and
`/admin/season`. Returns `{ ok: true, code }`.
*Non-atomic:* the uniqueness `findUnique` and the `create` are separate
statements with no transaction — a concurrent create of the same code raises a
raw Prisma `P2002` that the action does not catch.

**`updateSeasonAction(seasonId, input)`** — `:106-161`.
Gate: `canEditSeason` (claims-only, so an ADMIN of that season passes). Same
validation; uniqueness check excludes self (R6). Writes every field including
`code`, the derived `title`, `status`, and both absence fields.
Revalidates four paths, all built from the **new** code (`:156-159`) — the old
code's cache entry is left stale. Same P2002 race as create.

**`softDeleteSeasonAction(seasonId)`** — `:163-177`.
Gate: `canEditSeason`. Sets `deletedAt` + `updatedById`. No pre-checks (R49), no
cascade (R50), no cleanup of `activeSeasonId` or `SeasonAdmin` (R51). Redirects
to `/super/seasons`, so it returns nothing on success.

**`duplicateSeasonAction(sourceSeasonId, input)`** — `:199-362`.
Inputs `year`, `code?`, `startDate`, `endDate`. Gate: `canCreateSeason`.
Order of operations: year check → source read (no `deletedAt` filter, R66) →
date validation → code slugify/format/uniqueness → transaction (season, groups,
sessions, assignments, assignment targets). Fully atomic (R67). Notifies
nothing. Returns `{ ok: true, code }`. Revalidates `/super/seasons` only — the
new season's own path is never revalidated.

No season write sends a notification, writes an audit log row beyond the two
audit columns, or touches the notifications domain.

---

## 7. Proposed API

Envelope per `CLAUDE.md`: `{ data }` / `{ error: { code, message } }`.
Error codes already in use by this router: `bad_request` 400, `forbidden` 403,
`not_found` 404 (`apps/backend/src/routes/seasons.ts:65,68,98`).

| Method | Path | Status | Auth | Request | Response |
|---|---|---|---|---|---|
| GET | `/api/v1/seasons` | **partial** — `apps/backend/src/routes/seasons.ts:21-60` | any authed; visibility as a Prisma `where` per role (`:32-42`) | — | `{ seasons: SeasonListItem[] }` |
| GET | `/api/v1/seasons/:id` | **exists** — `:62-119` | `canAccessSeason` | — | `SeasonDetail` |
| GET | `/api/v1/seasons/:id/groups` | **exists** — `:121-134` | `canAccessSeason` | — | `{ groups }` (domain 5) |
| GET | `/api/v1/seasons/:id/sessions` | **exists** — `:136-149` | `canAccessSeason` | — | `{ sessions }` (domain 3) |
| GET | `/api/v1/seasons/:id/assignments` | **exists** — `:151-168` | `canAccessSeason` | — | `{ assignments }` (domain 7) |
| GET | `/api/v1/seasons/by-code/:code` | **new** | `canAccessSeason` after resolving the code | — | `SeasonDetail` |
| GET | `/api/v1/seasons/current` | **new** | any authed | — | `{ season: SeasonDetail \| null }` |
| POST | `/api/v1/seasons` | **new** | SUPER (`isSuper`) | `CreateSeasonInput` | `{ season: SeasonDetail }`, 201 |
| PATCH | `/api/v1/seasons/:id` | **new** | `isAdminOfSeason` — but see §10 D3 | `UpdateSeasonInput` | `{ season: SeasonDetail }` |
| DELETE | `/api/v1/seasons/:id` | **new** | `isAdminOfSeason` — see §10 D3 | — | `{ ok: true }` (soft delete) |
| POST | `/api/v1/seasons/:id/duplicate` | **new** | SUPER | `DuplicateSeasonInput` | `{ season: SeasonListItem }`, 201 |
| GET | `/api/v1/me/season-history` | **new** | STUDENT / ALUMNI, self only | `?excludeCurrent=true\|false` | `{ seasons: SeasonHistoryRow[] }` |

Notes on shape mismatches with what the screens need — deliberately listed here
rather than solved with extra endpoints:

- **`GET /seasons` omits `groupCount`.** Every v1 season list renders a Groups
  column from `_count.groups` (`src/app/super/seasons/page.tsx:30`), which the
  ported endpoint does not select (`apps/backend/src/routes/seasons.ts:47-56`).
  Add the field to the existing endpoint.
- **`GET /seasons` ordering differs from v1.** The endpoint orders
  `year desc, title asc` (`:46`); v1's lists order `status asc, startDate desc`
  (R24). Since the list screen regroups by program client-side anyway (R43),
  pick one and state it in the contract — recommend keeping the endpoint's
  `year desc, title asc` and dropping the status-ordering quirk.
- **`GET /seasons` visibility is per-role and broader than v1's SUPER list.**
  It returns a LEADER's and a STUDENT's seasons too (`:38-42`), which no v1 page
  does. That is the right behaviour for a flat mobile route (`/seasons` serves
  every role) — keep it, and let the screen decide what to render.
- **`GET /seasons/:id` withholds other groups from students** (`:86-87`), which
  v1 does not do (R74). Keep the v2 behaviour; it is strictly safer. But note
  `studentCount` still comes from `_count.enrollments` and therefore still tells
  a student the size of the whole season (`:83,111`).
- **The by-program and by-year screens need filters, not routes.** Add
  `?program=` and `?year=` to `GET /seasons` rather than porting
  `/super/seasons/program/[program]` and `/year/[year]` as two more endpoints.
- **Addressing.** v2's screens are code-addressed (`/season/[code]`) but every
  existing endpoint is id-addressed via `parseId`. `by-code/:code` bridges this;
  do **not** overload `:id` to accept both, because a numeric season code is a
  legal slug under R4 and would be ambiguous.
- **`GET /seasons/current`** exists to kill R22: three v1 pages each hand-roll
  the ACTIVE-then-fallback resolution, and the student flavour of the same
  question is `activeSeasonId`. One endpoint that answers "which season is this
  user looking at" for all five roles removes the copy-paste before it is ported.

---

## 8. Proposed shared contracts

`packages/shared/src/season.ts` today is **bare `interface`s, not Zod**
(`packages/shared/src/season.ts:10,21,28`), which predates the convention in
`CLAUDE.md`. Converting them is part of this domain.

Reuse rather than redefine: `SeasonStatus` from `packages/shared/src/enums.ts`
(already imported at `season.ts:1`), `UserRole` from `./auth`, and — once
domains 3 and 5 land — `sessionListItemSchema` / the group list item for the
nested payloads. `EnrollmentStatus` also lives in `./enums` and must not be
re-declared here.

| Schema | Fields | Notes |
|---|---|---|
| `seasonStatusSchema` | the four `SeasonStatus` values | derive from the existing enum, do not restate the literals |
| `seasonCodeSchema` | string, 2–40, matches the R4 pattern | shared by create, update and duplicate; the client form must validate with the *same* schema the server uses, as v1's two copies (`src/lib/season-actions.ts:21-45` vs `src/components/seasons/season-form.tsx:29-51`) had already drifted on the `max(40)` bound |
| `seasonListItemSchema` | `id`, `code`, `title`, `program`, `year`, `status`, `startDate` (ISO string), `endDate` (ISO string), **`groupCount`** | converts the existing `SeasonListItem` interface; adds the missing count per §7 |
| `seasonDetailGroupSchema` | `id`, `name`, `studentCount`, `leaderNames` (string array) | converts `SeasonDetailGroup` |
| `seasonDetailSchema` | list-item fields plus `description` (nullable), `sessionCount`, `studentCount`, `groups` (array of the above) | converts `SeasonDetail` |
| `seasonHistoryCurriculumItemSchema` | `sessionId`, `title`, `startsAt` (ISO string) | new |
| `seasonHistoryRowSchema` | `seasonId`, `title`, `startDate`, `endDate`, `groupName` (nullable), `attendancePct` (int 0–100), `curriculum` (array of the above) | new; must **not** gain a submissions/feedback field — R34 is a privacy rule, not an omission |
| `createSeasonInputSchema` | `code` (optional — R2 generates it), `program` 1–60, `year` int 2000–2100, `description` nullable ≤2000, `startDate`, `endDate`, `status`, `absenceBudgetMinutes` int ≥1 default 180, `absenceWeightMinutes` int ≥1 default 90; refinement `endDate >= startDate` | mirrors `src/lib/season-actions.ts:21-45` |
| `updateSeasonInputSchema` | same fields, all required except `description` | v1 reuses one schema for both; keeping them separate lets create make `code` optional without weakening update |
| `duplicateSeasonInputSchema` | `year` int 2000–2100, `code` optional, `startDate`, `endDate`; refinement `endDate >= startDate` | mirrors `src/lib/season-actions.ts:186-191,206-208` |
| `seasonCurrentResponseSchema` | nullable `seasonDetailSchema` | for `GET /seasons/current` |

`slugifySeasonCode` (`src/lib/slug.ts:3-11`) is a pure function used on both
sides of v1 and must move into `packages/shared` alongside these schemas — the
mobile form needs it to preview the code exactly as the server will store it.

---

## 9. Screens

The v2 tree is flat and role-driven, so v1's `/super/seasons/**`,
`/admin/season/**` and `/student/season` collapse onto two routes plus a detail
route.

| v1 page(s) | v2 route | Exists? | Roles | Notes |
|---|---|---|---|---|
| `src/app/super/seasons/page.tsx` | `/seasons` | file exists, placeholder — `apps/mobile/app/(app)/seasons.tsx` | SUPER (tab), ADMIN with >1 season | Program-grouped list (R43); needs `groupCount` |
| `src/app/super/seasons/program/[program]/page.tsx`, `year/[year]/page.tsx` | `/seasons` with a filter control | — | SUPER | Do not port as routes; they are filters (§7). Fixes R45's 404-on-empty as a side effect |
| `src/app/super/seasons/[code]/page.tsx`, `src/app/admin/season/[code]/page.tsx` | `/seasons/[code]` | **missing — must be created** | SUPER, ADMIN, LEADER, MENTOR | One detail screen with role branches; SUPER gets Edit + Duplicate + Delete, ADMIN gets the workspace links, others read-only |
| `src/app/super/seasons/new/page.tsx` | `/seasons/new` | **missing — must be created** | SUPER | Form; code auto-fill per R9 |
| `src/app/super/seasons/[code]/edit/page.tsx` | `/seasons/[code]/edit` | **missing — must be created** | SUPER (see §10 D3) | Hosts the delete action too |
| `src/components/seasons/duplicate-season-dialog.tsx` | modal on `/seasons/[code]` | **missing** | SUPER | Bottom sheet; defaults per R69 |
| `src/app/admin/season/page.tsx` | `/season` | file exists, placeholder — `apps/mobile/app/(app)/season.tsx` | ADMIN | Single-season redirect (R75) and the no-scope message (R76) live here |
| `src/app/student/season/page.tsx` | `/season` | same file, STUDENT branch | STUDENT | `scopes.activeSeasonId` from the session store, `enabled`-gated query per the `dashboard.tsx` pattern (`apps/mobile/app/(app)/dashboard.tsx:28-38`) |
| `src/app/student/history/page.tsx`, `src/app/alumni/history/page.tsx` | `/history` | file exists, placeholder — `apps/mobile/app/(app)/history.tsx` | STUDENT, ALUMNI | One screen; the only difference is whether the current season is excluded (R35) |
| `src/app/super/seasons/loading.tsx`, `error.tsx` | `LoadingState` / `ErrorState` primitives | exist | all | Per `CLAUDE.md`'s mobile conventions, not route files |

`/seasons` and `/season` are both already in `ALL_NAV_HREFS`
(`packages/shared/src/navigation.ts:61,72,111`), so the tab bar needs no change;
the three detail routes above are new files under `apps/mobile/app/(app)/`.
Query keys need a `seasons` factory in `apps/mobile/src/lib/query-keys.ts`,
which currently holds only `sessions` (`:22-33`).

---

## 10. Open questions and divergences

**D1 — Create silently discards the absence budget fields (R21).** A SUPER who
sets a 240-minute budget on the create form gets 180. Two seasons created and
edited look identical but behave differently in the attendance domain.
*Recommendation:* fix in v2 — `POST /seasons` writes both fields. This changes
observable behaviour versus v1, so it must be an explicit decision, not a
silent correction. Flag it to the attendance-domain spec (domain 4).

**D2 — A student can see a soft-deleted season, and so can history (R27, R38).**
Deleting a season hides it from every staff list while its students keep seeing
it on `/season` and every alumnus keeps seeing it in `/history`.
*Recommendation:* filter `deletedAt: null` in both v2 reads. If the product
intent is that history should survive deletion, then delete should be renamed
"archive" and the `ARCHIVED` status used instead — but the current split
(hidden from staff, visible to students) is not a defensible intent.

**D3 — A season ADMIN is authorized to rename, restatus and delete their season,
but no v1 UI lets them (§4, and R77's token-only scoping).** `canEditSeason` is `isAdminOfSeason`
(`src/lib/auth/permissions.ts:41-43`) while every control lives behind
`requireRole(["SUPER"])`. In v1 this is latent; in v2 it becomes a live HTTP
endpoint the moment `PATCH`/`DELETE /seasons/:id` ships.
*Recommendation:* split the gate. `PATCH` limited to a **field allowlist** for
ADMIN (`description`, `absenceBudgetMinutes`, `absenceWeightMinutes`) and full
for SUPER; `DELETE` and `POST /seasons` and `duplicate` SUPER-only. Do not ship
`canEditSeason` as-is on a write endpoint.

**D4 — Delete checks nothing and cleans up nothing (R49, R51).** A season with
200 enrolled students soft-deletes with one confirm click, leaving those
students' `activeSeasonId` pointing at it and their admins' `seasonAdminIds`
claims intact.
*Recommendation:* v2's `DELETE` refuses (409 `conflict`) when the season has any
`ACTIVE` enrollment, and requires an explicit `?force=true` otherwise; on
success it clears `StudentProfile.activeSeasonId` for that season in the same
transaction. Needs a product decision before code.

**D5 — Duplicate clones `recurrenceGroupId` across seasons (R65).** This is the
most dangerous defect found. `src/lib/session-actions.ts:110-113` and `:200-203`
scope their recurrence `updateMany`/`deleteMany` on `recurrenceGroupId` alone,
with **no season filter** — so after a duplicate, editing "this and following"
in the new season silently rewrites or deletes sessions in the old, live season.
*Recommendation:* v2's duplicate mints a fresh `recurrenceGroupId` per source
group. Independently, the sessions domain (3) should add `seasonId` to those
recurrence `where` clauses — record it there as a cross-domain dependency.

**D6 — Duplicate can clone a deleted season (R66)** and produces groups with no
leaders (R61), which is not stated in the dialog copy
(`src/components/seasons/duplicate-season-dialog.tsx:126-129` mentions only that
students are not copied). *Recommendation:* filter `deletedAt: null` on the
source; say "leaders and students are not copied" in the v2 sheet.

**D7 — `studentCount` on the detail counts withdrawn students (R72).** The
detail page and the roster disagree by design nowhere else in v1.
*Recommendation:* count `enrollments where status = ACTIVE`, matching
`src/lib/reports-query.ts:99`. This changes a visible number — flag it.

**D8 — The season code is mutable and v2 addresses seasons by code (R8).**
Renaming a code in v2 breaks every deep link, every cached React Query key, and
any pending screen holding the old code.
*Recommendation:* keep `code` mutable (it is a real operator need) but make the
API canonical on `id`, treat `by-code` as a resolution step, and have the mobile
detail screen store the resolved `id` in its query key. Alternatively freeze the
code after creation — cheaper, but a real behaviour removal.

**D9 — Two dead links in v1's season surface.**
`src/app/super/reports/page.tsx:37` links to `/super/seasons/${r.seasonId}` — a
numeric id where the route expects a code, so it 404s — and
`src/app/super/seasons/[code]/page.tsx:44` points "Manage groups" at
`/super/seasons/<code>/groups`, a route that does not exist (`src/app/super/seasons/`
contains only `[code]`, `new`, `program`, `year`).
*Recommendation:* in v2 the SUPER detail screen links to the same
`/seasons/[code]` groups branch the ADMIN uses. Do not reproduce either link.

**D10 — `/admin/season` and `/admin/season/[code]` refuse SUPER (§4).** `requireRole(user, ["ADMIN"])` at `src/app/admin/season/page.tsx:13` and
`src/app/admin/season/[code]/page.tsx:21`, while every sibling sub-page allows
`["ADMIN", "SUPER"]` (`groups/page.tsx:23`, `roster/page.tsx:23`,
`reports/page.tsx:21`). A SUPER can open a season's groups page but not the
season page it links from. The redirect target is also inconsistent —
`/admin/season` everywhere except reports, which sends you to `/admin/dashboard`
(`reports/page.tsx:24`). *Recommendation:* in v2 there is one `/seasons/[code]`
route, so this resolves itself; do not port the role list literally.

**D11 — Status is stored, hand-managed, and never advances itself (R16, R19).**
A season stays `ACTIVE` forever unless a human edits it, yet `ACTIVE` gates the
cross-season calendar (R23) and the admin's default season (R22).
*Recommendation:* keep status stored — four other domains filter on it and a
derived status would need a timezone the schema does not have (§2). But surface
a "this season ended N days ago and is still Active" hint on the detail screen,
and consider a scheduled transition as a separate, later decision. Do **not**
switch to date-derived status inside this domain.

**D12 — No timezone anywhere.** `startDate`/`endDate` are bare `DateTime`s
written from a web date picker; every comparison in this domain
(`startsAt >= now`, `startsAt <= now` at `src/app/student/season/page.tsx:82,88`)
is an instant comparison, so nothing breaks today. But R29's "Week N of M" and
any future date-derived status would be timezone-sensitive.
*Recommendation:* record that seasons are timezone-naive, keep all v2 date
comparisons instant-based, and do not introduce a date-only boundary check
without adding a timezone field first.

**D13 — `loadSeasonHistory` has no authorization (§4).** Safe in v1 only because
both call sites pass `user.userId`. As an HTTP endpoint it needs a real gate.
*Recommendation:* expose it as `GET /api/v1/me/season-history` (self only). If
staff ever need to view a student's history, that is a separate, gated endpoint
in the students domain (6), not a `studentUserId` query parameter on this one.

**D14 — History's attendance denominator is retroactive (R37).** Adding a
session to a finished season changes every past participant's percentage.
*Recommendation:* accept it for the port (matching v1 avoids a divergence in
numbers users have already seen), but note it in the reports domain (17), which
computes attendance differently.

**D15 — Uniqueness checks race (§6).** Create, update and duplicate all read
then write without a transaction; a concurrent request produces an uncaught
`P2002`. *Recommendation:* in v2 catch the unique-constraint violation and map
it to the same `{ code: "conflict" }` response the pre-check produces, so the
race and the check are indistinguishable to the client.
