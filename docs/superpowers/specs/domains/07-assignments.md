# Domain 07 — Assignments

> Status: draft · Phase: 1 (student read) / 3 (admin writes) · v1 API status: read done

An assignment is a unit of work set inside a season. Admins author it, target it
at the whole season or at named groups, optionally hang a due date and a linked
session on it, and students respond with a **submission**.

**Boundary with domain 08 (Submissions).** This domain owns the assignment's own
lifecycle — create, edit, soft-delete, who can *see* which assignments — and the
**submission tracker**, the per-assignment roster of who has and has not
responded. The tracker is claimed here because it is derived entirely from the
assignment's targeting (`isAllGroups` / `AssignmentTarget`), lives in
`src/lib/assignments-query.ts:127-187`, and is rendered only by the assignment
detail page. Domain 08 owns the `Submission` row itself, its files, its
draft/submit transitions, and review/grading. Two things sit on the line and are
described here but **owned by domain 08**: `ensureDraftSubmission`
(`src/lib/assignment-actions.ts:184-213`, which physically lives in this
domain's action file) and the leader review queue that the tracker links into.

---

## 1. v1 source

| File | Holds |
|---|---|
| `src/lib/assignment-actions.ts:18-28` | The only server-side validation schema for an assignment |
| `src/lib/assignment-actions.ts:44-99` | `createAssignmentAction` — transaction, targets, notification fan-out |
| `src/lib/assignment-actions.ts:101-139` | `updateAssignmentAction` — full replace of fields and targets |
| `src/lib/assignment-actions.ts:141-162` | `softDeleteAssignmentAction` — sets `deletedAt`, redirects. **No caller anywhere in `src/`** |
| `src/lib/assignment-actions.ts:164-182` | `targetedStudentIds` — resolves targeting to a student id list for notifications |
| `src/lib/assignment-actions.ts:184-213` | `ensureDraftSubmission` — domain 08's, but lives here |
| `src/lib/assignments-query.ts:16-52` | `listAssignmentsForSeason` — the staff list, with submitted/expected counts |
| `src/lib/assignments-query.ts:73-113` | `loadAssignmentById` — the detail shape used by every consumer, all roles |
| `src/lib/assignments-query.ts:127-187` | `loadSubmissionTracker` — who has/has not submitted |
| `src/lib/assignments-query.ts:197-241` | `listAssignmentsForStudent` — the student list; **the visibility rule lives in its `where`** |
| `src/lib/auth/permissions.ts:273-290` | `canCreateAssignment`, `canEditAssignment` |
| `src/lib/auth/permissions.ts:45-71` | `canAccessSeason` — the read gate used by the v1 API |
| `src/lib/rbac.ts:28-30` | `isAdminOfSeason` — SUPER passes unconditionally |
| `src/components/assignments/assignment-form.tsx:33-50` | Client schema — **differs from the server schema** |
| `src/components/assignments/assignment-form.tsx:109-126` | Form defaults (due time 23:59, min words 50, max size 10 MB) |
| `src/components/assignments/assignment-form.tsx:133-177` | Payload assembly — local-timezone due date, forum/file mutual exclusion |
| `src/components/assignments/assignments-list.tsx:17-25` | `dueBadge` — where "overdue" is decided, presentationally |
| `src/components/assignments/submission-tracker.tsx:15-86` | Tracker table; links to `/leader/submissions/:publicId` (domain 08) |
| `src/components/ui/rich-text-view.tsx:11-31` | HTML sanitisation of `description` — happens at **render**, not at write |
| `src/app/admin/assignments/page.tsx:10-38` | Not a list — a redirect to the admin's most recent season |
| `src/app/admin/season/[code]/assignments/page.tsx:21-47` | The real staff list |
| `src/app/admin/season/[code]/assignments/new/page.tsx:17-56` | Create form + session/group option loading |
| `src/app/admin/season/[code]/assignments/[id]/page.tsx:25-94` | Staff detail + tracker; **no delete control** |
| `src/app/admin/season/[code]/assignments/[id]/edit/page.tsx:18-74` | Edit form |
| `src/app/student/assignments/page.tsx:43-118` | Student list + status counters |
| `src/app/student/assignments/[id]/page.tsx:22-146` | Student detail; re-checks targeting, creates a draft, branches STANDARD/FORUM |
| `src/app/api/v1/seasons/[id]/assignments/route.ts:12-30` | Ported list endpoint |
| `src/app/api/v1/assignments/[id]/route.ts:13-50` | Ported detail endpoint |
| `src/lib/navigation.ts:65,102,110` | Only ADMIN and STUDENT get an Assignments nav entry |
| `src/lib/notifications.ts:56-95` | `createNotificationsBulk` — opt-out filtering and email fan-out |
| `src/lib/submission-actions.ts:75-95` | Where the due date is (not) enforced |
| `src/lib/submissions-query.ts:122-127` | Leader queue — does **not** filter soft-deleted assignments |

---

## 2. Data model

Models named exactly as `apps/backend/prisma/schema.prisma` names them.

### `Assignment` (`schema.prisma:464-500`)

| Field | Meaning for this domain |
|---|---|
| `seasonId` | Owning season. Set at create, **never updated** — an assignment cannot move seasons. `onDelete: Cascade` from `Season`. |
| `sessionId` | Optional link to a calendar session. `onDelete: SetNull`, so deleting a session silently unlinks the assignment. |
| `title` | 2–160 chars server-side. |
| `description` | Raw HTML from the rich-text editor. Stored unsanitised; sanitised only when rendered. |
| `dueAt` | Nullable. Never enforced at write time; lateness is derived from it at render time and never stored — see R45–R52, R87–R88. |
| `isAllGroups` | `false` by default in the schema; the *form* defaults to `true` (`assignment-form.tsx:123`). When true, no `AssignmentTarget` rows exist. |
| `type` | `STANDARD` \| `FORUM`. Decides which config block is persisted and which student screen renders. |
| `forumMinWords`, `forumAllowComments` | Persisted only for `FORUM`; forcibly nulled/falsed for `STANDARD`. |
| `maxFileSizeMb` | **Doubles as the "accepts files" flag** — `null` means no uploads. Nulled for `FORUM`. |
| `allowedMimeCategories` | `String[]`, empty means "any type". Emptied for `FORUM`. |
| `createdById` / `updatedById` | Audit columns, both stamped on create, only `updatedById` on update. `onDelete: SetNull`. **Written but never read** by any query in this domain — no screen shows an author. |
| `deletedAt` | Soft delete. Filtered by every read *except* `loadSubmissionTracker` and `canEditAssignment`. |

Nullable in the schema but treated as required in code: none. The inverse is
the notable case — `maxFileSizeMb` is nullable *by design* and its nullness is
load-bearing (R10).

### `AssignmentTarget` (`schema.prisma:502-511`)

Composite PK `[assignmentId, groupId]`. `onDelete: Cascade` from both sides — so
hard-deleting a group removes its targeting rows, which silently widens or
narrows nothing but does shrink `expectedCount`. `createdAt` is written and
never read.

### `GroupStudent` (`schema.prisma:327-336`)

`studentUserId` is `@unique`. **A student belongs to at most one group across
the entire system, not one per season.** Every targeting read in this domain
depends on that (R23).

### `SeasonEnrollment` (`schema.prisma:339-357`)

Read for `expectedCount` and notification fan-out, filtered to `status: ACTIVE`.
Carries `groupId` — the group the student was in *for that season* — which this
domain **never uses**, preferring the live `GroupStudent` row (R25).

### `Submission` (`schema.prisma:513-537`)

Read-only here. `@@unique([assignmentId, studentUserId])` is what makes
`ensureDraftSubmission` idempotent. `onDelete: Cascade` from `Assignment` — but
v1 never hard-deletes an assignment, so the cascade never fires (R59).

### Enums

`AssignmentType` (`schema.prisma:78-81`), `SubmissionStatus`
(`schema.prisma:50-55`), `NotificationType.ASSIGNMENT_CREATED`
(`schema.prisma:64`), `EnrollmentStatus` (used as `ACTIVE`).

---

## 3. Business rules

### Validation and defaults (create and update share one schema)

- **R1.** `title` is required, 2–160 characters — `src/lib/assignment-actions.ts:19`.
- **R2.** `description` is optional/nullable and capped at 20,000 characters — `src/lib/assignment-actions.ts:20`.
- **R3.** `dueAt` is optional and nullable, coerced from whatever the caller sends — `src/lib/assignment-actions.ts:21`.
- **R4.** `sessionId` is an optional nullable integer with **no check that the session belongs to this season** *(implicit — the form only offers sessions of the current season)* — `src/lib/assignment-actions.ts:22`, options loaded at `src/app/admin/season/[code]/assignments/new/page.tsx:25-29`.
- **R5.** `type` defaults to `STANDARD` when absent — `src/lib/assignment-actions.ts:23`.
- **R6.** `forumMinWords` must be 0–2000 when supplied — `src/lib/assignment-actions.ts:24`.
- **R7.** `forumAllowComments` defaults to `false` — `src/lib/assignment-actions.ts:25`.
- **R8.** `maxFileSizeMb` must be 1–100 when supplied — `src/lib/assignment-actions.ts:26`.
- **R9.** `allowedMimeCategories` accepts only `image`, `pdf`, `doc`, `audio`, `video`, `text`, defaulting to `[]` — `src/lib/assignment-actions.ts:27`.
- **R10.** A `null` `maxFileSizeMb` means "this assignment accepts no files" — there is no separate boolean; the student form derives `acceptsFiles` from it — `src/app/student/assignments/[id]/page.tsx:140`, and the edit form re-derives it the same way at `src/components/assignments/assignment-form.tsx:120`.
- **R11.** `isAllGroups` and `groupIds` are **not in the validation schema** and are read straight off the unvalidated raw input — `src/lib/assignment-actions.ts:62` and `:73` use `input.`, not `parsed.data.`.
- **R12.** `groupIds` are not checked to belong to the assignment's season, nor to exist at all *(implicit — the form's multi-select is populated only from this season's groups)* — `src/lib/assignment-actions.ts:73-78`, options at `src/app/admin/season/[code]/assignments/new/page.tsx:30-34`.
- **R13.** An assignment may be saved with `isAllGroups = false` and an empty `groupIds` — it then targets nobody, notifies nobody, and has `expectedCount` 0 — `src/lib/assignment-actions.ts:73` (`groupIds.length > 0` guard), `:176`.

### Type-driven field coercion

- **R14.** For `FORUM`, `forumMinWords` is persisted and `maxFileSizeMb` is forced to `null` — `src/lib/assignment-actions.ts:64,66`.
- **R15.** For `FORUM`, `allowedMimeCategories` is forced to `[]` — `src/lib/assignment-actions.ts:67`.
- **R16.** For `STANDARD`, `forumMinWords` is forced to `null` and `forumAllowComments` to `false` — `src/lib/assignment-actions.ts:64-65`.
- **R17.** The same coercion is applied verbatim on update, so switching type discards the other type's config — `src/lib/assignment-actions.ts:121-124`.

### Form-level rules the server does not repeat

- **R18.** The client schema requires `title` min 2 but imposes **no max**, so a 161-character title passes the browser and fails on the server as a field error — `src/components/assignments/assignment-form.tsx:34` vs `src/lib/assignment-actions.ts:19`.
- **R19.** A picked due date defaults to **23:59 local time**; an existing due date pre-fills its own hour/minute — `src/components/assignments/assignment-form.tsx:113-115`.
- **R20.** The due time picker steps in 15-minute increments — `src/components/assignments/assignment-form.tsx:265`.
- **R21.** `forumMinWords` defaults to 50 in the form and falls back to 0 if cleared — `src/components/assignments/assignment-form.tsx:118,151`.
- **R22.** `maxFileSizeMb` defaults to 10 when "accept file uploads" is ticked without a value — `src/components/assignments/assignment-form.tsx:121,153`.
- **R23.** The form defaults new assignments to `targetMode: "all"`, i.e. `isAllGroups = true` — `src/components/assignments/assignment-form.tsx:123,156`.
- **R24.** Switching `targetMode` back to "all" discards the picked group ids before submit — `src/components/assignments/assignment-form.tsx:157`.
- **R25.** The file-upload fieldset is not rendered for `FORUM`, so a forum assignment can never acquire file settings through the UI *(implicit)* — `src/components/assignments/assignment-form.tsx:290-324`.

### Visibility — when a student can see an assignment

- **R26.** There is **no publish flag and no scheduled-visibility field** on `Assignment`; an assignment is visible to its targeted students the instant the create transaction commits — `apps/backend/prisma/schema.prisma:464-500` (no such column), `src/lib/assignments-query.ts:209-218` (no such filter).
- **R27.** A future `dueAt` does not delay visibility; `dueAt` never appears in a visibility `where` clause — `src/lib/assignments-query.ts:209-218`.
- **R28.** A student sees an assignment when it is in the season being listed, is not soft-deleted, and either `isAllGroups` is true or one of its targets is the student's group *(implicit — this is the whole rule, expressed as a `where`)* — `src/lib/assignments-query.ts:209-218`.
- **R29.** "The student's group" is resolved by `findUnique` on `GroupStudent.studentUserId`, which is `@unique` — a student has exactly one group globally, and it is **not** scoped to the season being listed *(implicit)* — `src/lib/assignments-query.ts:203-206`, `apps/backend/prisma/schema.prisma:330`.
- **R30.** A student with no group row sees only `isAllGroups` assignments — the targeted branch is spliced out of the `OR` entirely *(implicit)* — `src/lib/assignments-query.ts:212-216`.
- **R31.** `SeasonEnrollment.groupId`, the historic per-season group, is never consulted for visibility — `src/lib/assignments-query.ts:203-206` reads `GroupStudent` instead.
- **R32.** With no season id the student list short-circuits to empty — `src/lib/assignments-query.ts:201`.
- **R33.** The student list page passes `activeSeasonId` from the token, so students only ever see their current season's assignments in the web UI *(implicit)* — `src/app/student/assignments/page.tsx:47`.
- **R34.** The student **detail page** additionally requires `activeSeasonId === assignment.seasonId` and redirects otherwise *(implicit — a redirect, not a thrown gate)* — `src/app/student/assignments/[id]/page.tsx:29`.
- **R35.** The student detail page re-checks targeting independently of the list query and redirects if the student's group is not in `groupIds` — `src/app/student/assignments/[id]/page.tsx:30-38`.
- **R36.** The v1 **API** detail endpoint enforces the same targeting re-check but gates the season with `canAccessSeason`, i.e. *any* season the student is enrolled in — not only the active one — `src/app/api/v1/assignments/[id]/route.ts:24,30-38`.
- **R37.** Soft-deleted assignments are excluded from the staff list, the detail load, and the student list — `src/lib/assignments-query.ts:18,75,210`.
- **R38.** `loadAssignmentById` calls `notFound()` for a missing or soft-deleted assignment, which surfaces as a 404 page rather than a redirect — `src/lib/assignments-query.ts:94`.
- **R39.** Neither LEADER nor MENTOR has an Assignments entry in v1's navigation, so neither has a way to reach an assignment list in the web UI *(implicit — enforced by which nav items render)* — `src/lib/navigation.ts:79-95,117-131`. The API nonetheless grants both roles read access (R60).

### Ordering and derived values

- **R40.** Both the staff list and the student list order by `dueAt` ascending, then `createdAt` descending — `src/lib/assignments-query.ts:19,219`. Postgres sorts NULLs last on ascending, so undated assignments land at the bottom.
- **R41.** The staff list's `submissionCount` counts submissions whose status is **not** `DRAFT` — `src/lib/assignments-query.ts:25`.
- **R42.** `expectedCount` is the count of `ACTIVE` season enrollments when `isAllGroups`, otherwise the count of `GroupStudent` rows in the targeted groups — `src/lib/assignments-query.ts:33-40`. The targeted branch applies no season or status filter, so it counts every current member of those groups.
- **R43.** The staff detail page recomputes "submitted" from the tracker as rows whose status is not `PENDING`, which **includes drafts** and therefore disagrees with R41 — `src/app/admin/season/[code]/assignments/[id]/page.tsx:36`.
- **R44.** The student row's status is their own submission's status, or the synthetic `"PENDING"` when no row exists — `src/lib/assignments-query.ts:233-237`.

### Due dates and lateness

- **R45.** The due date is composed client-side from a date plus an hour/minute in the **browser's local timezone** and sent as a `Date`; nothing normalises it to a season or organisation timezone — `src/components/assignments/assignment-form.tsx:136-142`.
- **R46.** Due dates are rendered by server components using `date-fns` with no timezone argument, so they format in the **server's** timezone, not the viewer's — `src/components/assignments/assignments-list.tsx:19,50` and `src/app/student/assignments/page.tsx:39,101` (both are server components; neither file is `"use client"`).
- **R47.** "Overdue" is `isPast(dueAt)`, evaluated at render time in the list badge — `src/components/assignments/assignments-list.tsx:19`.
- **R48.** The student list computes the same thing independently for its status dot and badge, treating "past due and not started" as an error state — `src/app/student/assignments/page.tsx:21,38`.
- **R49.** **Nothing is enforced at the due date.** Submitting after `dueAt` succeeds — no action, gate, or query rejects or flags a late submission at write time — `src/lib/submission-actions.ts:75-95` contains no such check.
- **R50.** Lateness is deliberately **derived, never persisted**. `submitSubmissionAction` computes `isLate`, writes nothing for it, and discards it with `void isLate;`; the comment records that the `submittedAt > dueAt` comparison is the intended source of truth for the UI — `src/lib/submission-actions.ts:80,88-89,93`.
- **R51.** The forum post path does not consult `dueAt` at all, even though it selects it — `src/lib/forum-actions.ts:29,36-45`.
- **R52.** The only thing that changes at the due date is a **client-side** read-only lock on an already-submitted standard submission *(implicit — UI state, no server counterpart)* — `src/components/assignments/student-submission-form.tsx:96`.
- **R87.** The `submittedAt > dueAt` comparison is re-derived independently at **five** render sites with no shared helper, each hand-rolling the same null-guard: the assignment tracker (`src/lib/assignments-query.ts:171-174`), the leader queue's late counter (`src/app/leader/submissions/page.tsx:13-16`), the leader queue's per-row Late badge (`src/components/assignments/leader-queue-list.tsx:46`), the submission review header (`src/app/leader/submissions/[publicId]/page.tsx:33-36`), and the student dashboard's late counter (`src/app/student/dashboard/page.tsx:79-81`).
- **R88.** In the student list, the overdue branch is reached **only after** `REVIEWED`, `SUBMITTED` and `DRAFT` have each been checked and returned, so a past-due assignment the student has already submitted — or merely opened, since opening creates a `DRAFT` (R81) — never renders as overdue *(implicit — enforced by branch order, not by a condition)* — `src/app/student/assignments/page.tsx:17-23` (status dot) and `:32-39` (status badge), the overdue tests being `:21` and `:38`.

### Submission tracker

- **R53.** The tracker's roster is the assignment's targeting resolved to people: `ACTIVE` season enrollments when `isAllGroups`, otherwise `GroupStudent` rows of the targeted groups — `src/lib/assignments-query.ts:136-154`.
- **R54.** Tracker rows are ordered by group name ascending, then student name ascending — `src/lib/assignments-query.ts:144,153`.
- **R55.** A student with no submission row appears with the synthetic status `"PENDING"` and a null review link — `src/lib/assignments-query.ts:180-184`.
- **R56.** `isLate` on a tracker row requires both a `submittedAt` and a `dueAt`; either missing yields `false` — `src/lib/assignments-query.ts:171-174`.
- **R57.** The tracker returns an empty array for a missing assignment rather than throwing — `src/lib/assignments-query.ts:134`.
- **R58.** The tracker's assignment lookup does **not** filter `deletedAt`, so a soft-deleted assignment still yields a full tracker *(implicit — an omitted `where` clause)* — `src/lib/assignments-query.ts:130-133`.
- **R59.** The tracker performs no authorization of its own; the calling page's gate is the only check *(implicit)* — `src/lib/assignments-query.ts:127-129`, gate at `src/app/admin/season/[code]/assignments/[id]/page.tsx:27,30`.

### Notifications

- **R60.** Creating an assignment fans out an `ASSIGNMENT_CREATED` notification to every targeted student — `src/lib/assignment-actions.ts:83-93`.
- **R61.** Recipients are resolved the same way as the tracker roster and de-duplicated — `src/lib/assignment-actions.ts:164-182`.
- **R62.** The notification body is the due date via `toLocaleString()` on the server, or omitted entirely when there is no due date — `src/lib/assignment-actions.ts:88-90`.
- **R63.** The notification's deep link is the v1 web path `/student/assignments/:id` — `src/lib/assignment-actions.ts:91`.
- **R64.** Students who have opted out via `NotificationPreference.assignmentCreated` are filtered out before the rows are written, and no email is sent to them — `src/lib/notifications.ts:62-75`.
- **R65.** Notification creation happens **outside** the create transaction, after it commits — `src/lib/assignment-actions.ts:54-80` closes the transaction, `:82-93` fans out.
- **R66.** **No notification is sent on update or on delete** — neither action calls into `notifications` — `src/lib/assignment-actions.ts:101-139,141-162`.

### Editing

- **R67.** Update replaces every editable field wholesale; there is no partial update — `src/lib/assignment-actions.ts:113-126`.
- **R68.** Update never writes `seasonId`, so an assignment cannot be moved between seasons — `src/lib/assignment-actions.ts:113-126`.
- **R69.** Update replaces targeting by deleting all `AssignmentTarget` rows and recreating them inside one transaction — `src/lib/assignment-actions.ts:128-133`.
- **R70.** The recreate on update omits `skipDuplicates`, unlike create, so a payload with a repeated group id throws a unique-constraint error and rolls the transaction back — `src/lib/assignment-actions.ts:131` vs `:76`.
- **R71.** `updatedById` is stamped on every update — `src/lib/assignment-actions.ts:125`.
- **R72.** **Editing is unrestricted once submissions exist** — no action, gate, or query checks for existing submissions before writing — `src/lib/assignment-actions.ts:101-139` contains no such check.
- **R73.** Narrowing targeting retroactively hides the assignment from students who already submitted; their `Submission` rows survive untouched but drop out of the student's list *(implicit — the consequence of R28 plus R69)* — `src/lib/assignment-actions.ts:128-133`, `src/lib/assignments-query.ts:212-216`.
- **R74.** Retargeting sends no notification to the newly targeted students (R66), so a widened assignment appears silently.

### Deletion

- **R75.** Deletion is soft only: `deletedAt` is stamped and `updatedById` updated — `src/lib/assignment-actions.ts:152-155`.
- **R76.** Nothing cascades — `AssignmentTarget` rows and `Submission` rows are left in place — `src/lib/assignment-actions.ts:152-155`.
- **R77.** Soft-deleted assignments' submissions remain in the leader review queue, because that query filters on submission status only and never on `assignment.deletedAt` *(implicit — an omitted `where` clause)* — `src/lib/submissions-query.ts:122-127`.
- **R78.** The delete action re-reads the season code first so it can redirect to that season's assignment list, falling back to `/admin/season` — `src/lib/assignment-actions.ts:147-161`.
- **R79.** The delete gate does not filter `deletedAt`, so an already-deleted assignment can be "deleted" again — `src/lib/auth/permissions.ts:284-289`.
- **R80.** **No screen in v1 calls `softDeleteAssignmentAction`.** The staff detail page renders only an Edit control — `src/app/admin/season/[code]/assignments/[id]/page.tsx:49-58`; the action has no importer anywhere in `src/`.

### Draft creation on read (domain 08's rule, triggered here)

- **R81.** Rendering the student assignment detail page **creates a `DRAFT` submission as a side effect of a GET** — `src/app/student/assignments/[id]/page.tsx:40`, `src/lib/assignment-actions.ts:184-213`.
- **R82.** `ensureDraftSubmission` is idempotent on `@@unique([assignmentId, studentUserId])` and re-reads on a create failure to survive a concurrent prefetch — `src/lib/assignment-actions.ts:188-212`.
- **R83.** Because of R81, merely opening an assignment moves a student from `PENDING` to `DRAFT` in the tracker, which R43 counts as "submitted" and R41 does not.

### Sequencing

- **R84.** Create is transactional across the `Assignment` row and its `AssignmentTarget` rows — `src/lib/assignment-actions.ts:54-80`.
- **R85.** Update is transactional across the field update, the target delete, and the target recreate — `src/lib/assignment-actions.ts:111-134`.
- **R86.** Notification fan-out is **not** covered by the transaction and its failure is swallowed per-recipient, so an assignment can exist with nobody notified — `src/lib/assignment-actions.ts:82-93`, `src/lib/notifications.ts:90-94`.

---

## 4. Authorization

`isAdminOfSeason` returns true for `SUPER` unconditionally
(`src/lib/rbac.ts:28-30`), so every "season admin" row below implicitly includes
SUPER.

| Operation | Roles | Row-scoped condition | v1 citation |
|---|---|---|---|
| Create assignment | ADMIN, SUPER | Caller administers the target season | `src/lib/auth/permissions.ts:273-278`, called at `src/lib/assignment-actions.ts:49` |
| Update assignment | ADMIN, SUPER | Caller administers the *assignment's* season; assignment must exist (deleted ones pass) | `src/lib/auth/permissions.ts:280-290`, called at `src/lib/assignment-actions.ts:106` |
| Soft-delete assignment | ADMIN, SUPER | Same gate as update | `src/lib/assignment-actions.ts:145` |
| Open staff list / detail / forms (web) | ADMIN, SUPER | `canEditSeason` on the season in the URL, else redirect to `/admin/season` | `src/app/admin/season/[code]/assignments/page.tsx:23,26`; identically at `new/page.tsx:19,22`, `[id]/page.tsx:27,30`, `[id]/edit/page.tsx:19,23` |
| Staff detail cross-check | ADMIN, SUPER | Assignment's `seasonId` must equal the season in the URL, else redirect | `src/app/admin/season/[code]/assignments/[id]/page.tsx:33` |
| `/admin/assignments` entry point | **ADMIN only** | Caller has at least one `seasonAdminIds` entry | `src/app/admin/assignments/page.tsx:12,14` |
| Read assignment list (API) | any authenticated | `canAccessSeason`: SUPER/MENTOR always; ADMIN of that season; LEADER of a group in that season; STUDENT active in or enrolled in it | `src/app/api/v1/seasons/[id]/assignments/route.ts:19`, `src/lib/auth/permissions.ts:45-71` |
| Read assignment detail (API) | any authenticated | `canAccessSeason` **plus**, for students, group membership in `groupIds` | `src/app/api/v1/assignments/[id]/route.ts:24,30-38` |
| Read assignment detail (web, student) | STUDENT | `activeSeasonId === seasonId` **and** targeting match — both redirects | `src/app/student/assignments/[id]/page.tsx:24,29,30-38` |
| Read submission tracker | ADMIN, SUPER | **Nothing at the query level** — gated only by the page that renders it | `src/lib/assignments-query.ts:127`; gate at `src/app/admin/season/[code]/assignments/[id]/page.tsx:27,30` |

**Where v1 enforces nothing and relies on the UI.** Four cases, all of which
must become real gates in v2:

1. `loadSubmissionTracker` has no gate of its own (R59). In v2 the tracker
   endpoint needs an explicit season-admin gate, and a decision on leaders
   (see section 10).
2. LEADER and MENTOR cannot reach an assignment list only because no nav item
   renders one (R39) — the API already lets them (R60/`canAccessSeason`). v2's
   flat `/assignments` route makes this a live question, not a theoretical one.
3. The absence of a delete control is the only thing preventing deletion (R80);
   the action itself is fully reachable as a server action.
4. `groupIds` and `sessionId` are constrained only by what the form offers
   (R4, R12). A hand-crafted payload can target another season's groups.

---

## 5. Read surface

### `listAssignmentsForSeason(seasonId)` — staff list

Returns `id`, `title`, `dueAt`, `isAllGroups`, `submissionCount`,
`expectedCount`, `seasonCode`, ordered per R40
(`src/lib/assignments-query.ts:16-52`).

- Same shape for every non-student role — there is no per-role narrowing here.
- **N+1:** one extra count query *per assignment row*, issued inside
  `Promise.all` over the rows — `src/lib/assignments-query.ts:32-40`. A season
  with 40 assignments issues 41 queries.
- Returns `isAllGroups` but not the group ids, so the list can say "Some
  groups" but not which — `src/components/assignments/assignments-list.tsx:64-73`.

### `loadAssignmentById(id)` — detail, all roles

Returns the full authoring shape including `description`, `groupIds`,
`forumMinWords`, `forumAllowComments`, `maxFileSizeMb`,
`allowedMimeCategories`, plus denormalised `seasonCode`/`seasonTitle`/
`sessionTitle` (`src/lib/assignments-query.ts:73-113`).

- **The shape does not differ by role.** A student's detail request returns the
  same object an admin gets, including every authoring knob. The student screen
  simply renders less of it — `src/app/student/assignments/[id]/page.tsx:92-143`.
- `groupIds` is exposed to students, which is what lets the student page and
  the API do their targeting re-check (R35, R36) — but it also tells a student
  which group ids an assignment targets.
- The v1 API appends `mySubmission` (public id, status, submittedAt,
  reviewedAt, feedback) for students only — `src/app/api/v1/assignments/[id]/route.ts:40-48`.

### `loadSubmissionTracker(assignmentId)` — who has submitted

Returns one row per targeted student: `studentUserId`, `name`, `email`,
`groupName`, `status`, `isLate`, `submittedAt`, `reviewedAt`,
`submissionPublicId` (`src/lib/assignments-query.ts:127-187`).

- Three queries regardless of size: assignment, roster, submissions — then an
  in-memory join by `studentUserId` (`:167`). No N+1.
- Ordered per R54. Exposes every targeted student's email address.
- `submissionPublicId` is the handoff into domain 08's review screen —
  `src/components/assignments/submission-tracker.tsx:60-67`.

### `listAssignmentsForStudent(studentUserId, seasonId)` — student list

Returns `id`, `title`, `dueAt`, `status`, `reviewedAt`
(`src/lib/assignments-query.ts:197-241`).

- **This is where visibility lives** (R28–R32). Withholds `description`,
  targeting, forum config and file config from the list — students get those
  only from the detail read.
- Two queries: the group membership lookup, then one assignment query with a
  correlated `submissions` sub-select filtered to this student. No N+1.
- The page over-fetches relative to what it renders: it pulls every assignment
  to compute three counters and then renders the whole list —
  `src/app/student/assignments/page.tsx:49-55`.
- The same function powers the student dashboard's "pending" tile —
  `src/app/student/dashboard/page.tsx:54`.

---

## 6. Write surface

### `createAssignmentAction(seasonId, input)`

- **Inputs:** `seasonId` (from the route, not the body); title, description,
  dueAt, sessionId, type, forumMinWords, forumAllowComments, maxFileSizeMb,
  allowedMimeCategories, isAllGroups, groupIds.
- **Validation:** the shared schema (R1–R9). `isAllGroups`/`groupIds` skip it
  entirely (R11).
- **Writes:** one `Assignment` with both audit columns, plus `AssignmentTarget`
  rows when targeted — in one transaction (R84).
- **Cascades:** none.
- **Notifies:** `ASSIGNMENT_CREATED` to the resolved student set, outside the
  transaction (R60–R65).
- **Returns:** `{ ok: true, assignmentId }`, or `{ ok: false, error, fieldErrors }`
  where field errors are keyed by dotted path, first issue wins —
  `src/lib/assignment-actions.ts:215-222`.
- **Non-atomic:** the fan-out at `:82-93` runs after commit. A crash between
  them leaves an assignment nobody was told about. Email delivery is separately
  fire-and-forget — `src/lib/notifications.ts:90-94`.

### `updateAssignmentAction(assignmentId, input)`

- **Inputs:** same payload; `seasonId` is accepted by the form component but
  never sent to the action for edits — `src/components/assignments/assignment-form.tsx:163`.
- **Writes:** full field replace, then delete-all-and-recreate targeting, in one
  transaction (R85). `updatedById` stamped.
- **Cascades / notifies:** none (R66, R76).
- **Returns:** `{ ok: true }` or the same field-error shape.
- **Sharp edge:** the recreate omits `skipDuplicates` (R70) — a duplicate group
  id fails the whole transaction, which at least leaves targeting intact rather
  than empty.

### `softDeleteAssignmentAction(assignmentId)`

- **Inputs:** the id only.
- **Writes:** `deletedAt` and `updatedById` on the one row (R75). No transaction
  is needed — but note the preceding season-code read at `:147-151` is a second,
  unguarded query whose failure would break the redirect, not the delete.
- **Cascades:** none (R76, R77).
- **Returns:** nothing — it redirects (R78). Redirect-as-return does not survive
  the port to a REST endpoint.

### `ensureDraftSubmission(assignmentId, studentUserId)` — domain 08

Creates or returns a `DRAFT` submission (R81, R82). Listed here because it lives
in this domain's action file and is triggered by an assignment read. **v2 must
not reproduce it as a read side effect** — see section 10.

---

## 7. Proposed API

`apps/backend/src/routes/assignments.ts` is 61 lines and covers **one** of the
operations this domain needs: the detail read. The list read lives on the
seasons router. That is the entire ported surface — **no create, no update, no
delete, no tracker.** `apps/backend/src/lib/queries/assignments.ts` ports three
of v1's four query functions and omits `loadSubmissionTracker` entirely. Roughly
a fifth of the domain exists.

| Method | Path | Status | Auth | Request | Response |
|---|---|---|---|---|---|
| GET | `/api/v1/seasons/:id/assignments` | **exists** — `apps/backend/src/routes/seasons.ts:151-168` | `canAccessSeason` | — | `{ data: { assignments: StaffAssignmentListItem[] \| StudentAssignmentListItem[] } }` — role-branched at `seasons.ts:162-166` |
| GET | `/api/v1/assignments/:id` | **exists** — `apps/backend/src/routes/assignments.ts:14-61` | `canAccessSeason` + student targeting check | — | `{ data: AssignmentDetail }` including `mySubmission` |
| POST | `/api/v1/seasons/:id/assignments` | **new** | role ADMIN/SUPER + `canCreateAssignment(seasonId)` | create body (§8) | `201 { data: AssignmentDetail }` |
| PATCH | `/api/v1/assignments/:id` | **new** | `canEditAssignment(id)`, extended to reject soft-deleted rows | update body (§8) | `{ data: AssignmentDetail }` |
| DELETE | `/api/v1/assignments/:id` | **new** | `canEditAssignment(id)`, rejecting soft-deleted rows | — | `204`, no body |
| GET | `/api/v1/assignments/:id/tracker` | **new** | season admin (leader question in §10) | optional `?groupId=` | `{ data: { rows: AssignmentTrackerRow[] } }` |
| GET | `/api/v1/seasons/:id/groups` | **exists** — `apps/backend/src/routes/seasons.ts:121-135` | `canAccessSeason` | — | Reuse for the form's group picker; do not add an options endpoint |
| GET | `/api/v1/seasons/:id/sessions` | **exists** — `apps/backend/src/routes/seasons.ts:136-149` | `canAccessSeason` | — | Reuse for the form's session picker |

Error codes follow the established set: `bad_request` 400 for an unparseable id
or a failed body schema, `forbidden` 403, `not_found` 404.

**Where the existing endpoints do not match what the screens need:**

- `GET /seasons/:id/assignments` returns a **union type** discriminated only by
  the caller's role (`packages/shared/src/assignment.ts:25`). A React Query hook
  cannot parse that against one schema without knowing the role first. Resolve
  it by parsing against a role-selected schema in the hook rather than by adding
  a second endpoint.
- The staff list carries no `groupIds`, so a "Some groups" chip cannot name the
  groups. Add `targetGroupIds` to the staff row rather than making the screen
  fetch each assignment.
- The staff list's per-row `expectedCount` is the N+1 in
  `apps/backend/src/lib/queries/assignments.ts:30-49`. Fix it in the port with a
  single grouped count; it is behaviour-preserving.
- `GET /assignments/:id` returns the full authoring shape to students (§5). v2
  should withhold `groupIds`, `forumMinWords` when irrelevant, and the file
  config a student cannot act on — but see section 10, because the student
  screen needs `maxFileSizeMb` and `allowedMimeCategories` to render the
  uploader.
- The create/update flow needs the assignment id back to navigate to the detail
  screen. Returning the full `AssignmentDetail` avoids an immediate refetch.
- **No endpoint exists for creating the student's draft submission.** v1 gets
  one for free by writing during a page render (R81). v2's `GET` must stay a
  `GET`; the draft must come from domain 08's `PATCH /submissions/:publicId` or
  a new `POST /assignments/:id/submission`. Flagged to domain 08 in §10.

---

## 8. Proposed shared contracts

`packages/shared/src/assignment.ts` today is 54 lines of **bare
`interface`s** — `StaffAssignmentListItem`, `StudentAssignmentListItem`,
`AssignmentListItem`, `MySubmissionSummary`, `AssignmentDetail`. None is a Zod
schema, so `apps/mobile/src/lib/api-client.ts` cannot parse responses against
them and would have to cast. Per the convention in `space-v2/CLAUDE.md`
("Domain contracts are Zod, not bare interfaces"), **all five convert to Zod as
part of this domain**, with their types becoming `z.infer` of the schema. The
field lists below are the existing ones unless noted.

**Reuse, do not redefine:** `assignmentTypeSchema` and `submissionStatusSchema`
from `packages/shared/src/enums.ts:14-18` — both already exist as Zod enums.
`packages/shared/src/submission.ts` owns anything submission-shaped; the
tracker row must reference `submissionStatusSchema`, not restate its members.
Group and session pickers consume `packages/shared/src/group.ts` and
`session.ts` rather than defining local option types.

### Response schemas

| Schema | Fields |
|---|---|
| `staffAssignmentListItemSchema` | existing five fields plus `seasonCode`; **add** `targetGroupIds` (array of number, empty when `isAllGroups`) |
| `studentAssignmentListItemSchema` | `id`, `title`, `dueAt` (nullable string), `status` (submission status **or** the literal `PENDING`), `reviewedAt` (nullable string) |
| `assignmentDetailSchema` | the current `AssignmentDetail` field set; `type` uses `assignmentTypeSchema`; `mySubmission` nullable |
| `mySubmissionSummarySchema` | `publicId`, `status`, `submittedAt`, `reviewedAt`, `feedback` — all timestamps as nullable strings |
| `assignmentTrackerRowSchema` | `studentUserId`, `name` (nullable), `email`, `groupName` (nullable), `status` (submission status or `PENDING`), `isLate` (boolean), `submittedAt`, `reviewedAt`, `submissionPublicId` — all nullable strings where v1 nulls them |

The `PENDING` sentinel (R44, R55) is a wire-only value with no database
counterpart. Model it as a union of `submissionStatusSchema` with the literal
`"PENDING"`; do not add it to the Prisma enum.

### Request schemas

| Schema | Fields and constraints |
|---|---|
| `createAssignmentRequestSchema` | `title` 2–160 (R1); `description` nullable, max 20,000 (R2); `dueAt` nullable ISO string (R3); `sessionId` nullable positive int (R4); `type` via `assignmentTypeSchema`, default `STANDARD` (R5); `forumMinWords` nullable int 0–2000 (R6); `forumAllowComments` boolean default false (R7); `maxFileSizeMb` nullable int 1–100 (R8); `allowedMimeCategories` array of the six literals, default `[]` (R9); **`isAllGroups` boolean and `groupIds` array of positive int — both inside the schema, closing R11**; `seasonId` is **not** in the body, it comes from the path (R68) |
| `updateAssignmentRequestSchema` | Identical field set. v1 has no partial update (R67), so keep it a full replace rather than inventing PATCH semantics that v1 never had. Deduplicate `groupIds` in the schema to close R70. |

A cross-field refinement should encode R13–R17 once, in the schema, rather than
in the handler: `isAllGroups === false` implies a non-empty `groupIds` (a
deliberate divergence — see §10), and `type === "FORUM"` implies null file
config while `type === "STANDARD"` implies null forum config.

`dueAt` crosses the wire as an ISO-8601 string in both directions, matching the
note at `packages/shared/src/season.ts:3-8`.

---

## 9. Screens

| v1 page(s) | v2 route | Exists? | Roles | Notes |
|---|---|---|---|---|
| `/admin/assignments` **and** `/admin/season/[code]/assignments` | `/assignments` | placeholder only — `apps/mobile/app/(app)/assignments.tsx` renders an `EmptyState` | ADMIN, SUPER | **These are not two lists.** `/admin/assignments` is a pure redirect: it picks the caller's most recently started administered season and forwards to the season-scoped list (`src/app/admin/assignments/page.tsx:25-37`), showing a bare header if the admin administers no season. v2 collapses both into one route that resolves the season from `scopes.seasonAdminIds` / the active season and offers a season switcher instead of a redirect. |
| `/student/assignments` | `/assignments` | placeholder only | STUDENT | Same route, role branch inside. Nav already points both roles here — `packages/shared/src/navigation.ts:76,113`. Keep the three counters (submitted / pending / reviewed) from `src/app/student/assignments/page.tsx:49-55`. |
| `/admin/season/[code]/assignments/[id]` (detail + tracker) | `/assignments/[id]` | **does not exist** — the v2 tree has no dynamic segments at all | ADMIN, SUPER | Needs creating. Carries the tracker; the tracker's per-row "Open" button routes into domain 08's submission detail. |
| `/student/assignments/[id]` | `/assignments/[id]` | **does not exist** | STUDENT | Same route, role branch. Splits STANDARD vs FORUM (`src/app/student/assignments/[id]/page.tsx:42-75`). Hosts domain 08's submission form. |
| `/admin/season/[code]/assignments/new` | `/assignments/new` | **does not exist** | ADMIN, SUPER | Needs group and session pickers fed by the existing season sub-endpoints. |
| `/admin/season/[code]/assignments/[id]/edit` | `/assignments/[id]/edit` | **does not exist** | ADMIN, SUPER | Same form component, edit mode. |
| — (no v1 page) | delete control on `/assignments/[id]` | **does not exist** | ADMIN, SUPER | v1 has the action but never renders a control (R80). See §10. |

Every dynamic route above is new. `apps/mobile/app/(app)/` currently contains
only flat files plus a `students` directory — there is no `[id]` segment
anywhere in the tree, so the router conventions for detail screens are
established by this domain (or by whichever parallel domain lands first).

LEADER and MENTOR have no `/assignments` nav entry in
`packages/shared/src/navigation.ts:90-107` (leader) — matching v1 (R39). If
section 10's leader-tracker question resolves in favour of access, that nav file
changes too.

---

## 10. Open questions and divergences

**1. The tracker has no server-side gate — decide its audience before writing it.**
v1's tracker is protected only by the page that renders it (R59), and the only
page that renders it is admin-only. But the data it exposes — every targeted
student's name, email, group and submission state — is exactly what a group
leader needs and currently cannot get. *Recommendation:* gate
`GET /assignments/:id/tracker` on season admin by default, and add an explicit
leader branch that scopes rows to the leader's own groups (mirroring
`canViewSubmission`'s leader clause at `src/lib/auth/permissions.ts:180-187`).
Do not port "no gate at all". **Needs a decision before the endpoint is written**
— it changes both the response shape and the nav.

**2. Lateness is derived at five sites with no shared helper — decide where it
lives before any screen is written.** `void isLate;`
(`src/lib/submission-actions.ts:93`) is a deliberate decision not to *persist* a
derived value, not evidence that lateness is ignored: the comparison
`submittedAt > dueAt` is re-implemented, null-guards and all, at five separate
render sites (R87), and the code comment at `:88-89` names it as the intended
source of truth. That is survivable in one Next.js codebase where every site is
a server component reading the same Prisma rows. It will not survive React
Native, where the same five comparisons become client-side date arithmetic
across a tracker, two queue screens, a review header and a dashboard tile —
five chances to drift on null handling, on `>` versus `>=` at the exact
boundary, and on timezone (item 3). *Recommendation:* derive it **once,
server-side**, and expose `isLate` as a computed boolean on the submission wire
contract in `packages/shared` — every consumer then reads a field instead of
recomputing a rule. This is domain 08's contract, so it needs agreeing with
that author rather than asserting here; this domain's tracker row
(`assignmentTrackerRowSchema`, §8) already carries `isLate` on exactly that
basis and should be the precedent. **Needs a decision:** derived-once-on-the-wire
(recommended) versus persisted at submit time. Do not port five hand-rolled
comparisons.

**3. The deadline's timezone is undefined at both ends.** An admin authors the
instant with `d.setHours(hour, minute, 0, 0)` in the **authoring browser's**
timezone (R45, `src/components/assignments/assignment-form.tsx:136-142`), and
every screen that displays or tests it does so in the **server's** timezone —
`assignments-list.tsx`, `student/assignments/page.tsx` and
`leader-queue-list.tsx` all lack `"use client"`, so `format()` and `isPast()`
evaluate server-side (R46, R47). Nothing reconciles the two, and no season or
organisation timezone exists to reconcile them against. Today this is masked:
staff author from laptops in one region and the server runs in one zone. On
mobile that masking disappears — the device timezone is far more variable than a
staff browser, so "23:59" set by an admin in one zone is a genuinely different
wall-clock deadline for a student in another, and R47/R48/R88 will flip an
assignment between overdue and not depending on where the reader is standing.
*Recommendation:* state an explicit rule — a deadline is authored in a single
declared timezone (the season's, added as a field, or a fixed organisation
zone), stored as an instant, and rendered in the **device's** zone with the
authoring zone shown alongside. **Needs a decision before the create form is
built,** because it determines whether the form collects a wall-clock time plus
a zone or a bare instant.

**Separately:** v1 does not enforce the deadline at all (R49) — the only lock is
a client-side `readOnly` flag (R52) that a direct API call bypasses.
*Recommendation:* keep it non-enforcing; that is the product's actual behaviour
and students rely on it. Enforcing it in v2 would be a behaviour change users
notice on day one.

**4. `softDeleteAssignmentAction` is unreachable dead code, and deleting is
incoherent when it does run.** No screen calls it (R80). If it were called, it
would leave `AssignmentTarget` rows, leave `Submission` rows, and leave those
submissions sitting in the leader review queue for an assignment nobody can see
(R77, `src/lib/submissions-query.ts:122-127`) — while the tracker (R58) and the
edit gate (R79) both still treat the assignment as live. *Recommendation:*
implement `DELETE /assignments/:id` properly rather than porting the current
shape — add `deletedAt: null` to the tracker query, the edit gate, and the
leader queue's `where`, and decide explicitly what happens to existing
submissions. **Needs a decision:** should deleting an assignment with
submissions be blocked outright? Given nothing in v1 has ever exercised this
path, blocking it is the safe default and can be relaxed later.

**5. Editing after submissions exist is unrestricted, and retargeting hides
work.** Nothing checks for submissions before an update (R72). Narrowing
targeting orphans already-submitted work: the rows survive but vanish from the
student's list (R73), and the newly targeted students are never notified (R74).
*Recommendation:* keep editing open (admins genuinely fix typos), but warn on
the client when narrowing targeting would orphan existing submissions, and send
`ASSIGNMENT_CREATED` to students newly added by an edit — that is arguably a bug
fix rather than a divergence.

**6. `isAllGroups` and `groupIds` bypass validation entirely.** They are read
from the raw input, not the parsed schema (R11), and are never checked against
the season (R12). A crafted payload can target another season's groups; a
"specific groups" assignment with an empty list is accepted and targets nobody
(R13). *Recommendation:* put both in the Zod schema (§8) and add a server check
that every `groupId` belongs to the path's season. Reject empty `groupIds` when
`isAllGroups` is false — a deliberate divergence from v1, which silently
accepts it.

**7. One group per student, globally.** `GroupStudent.studentUserId` is
`@unique` (`apps/backend/prisma/schema.prisma:330`), and every visibility read
uses it rather than `SeasonEnrollment.groupId` (R29, R31). A student who moves
to a new season's group **loses sight of every group-targeted assignment from
their previous season**, even though the API's `canAccessSeason` would let them
read that season. Any "assignment history" screen will hit this immediately.
*Recommendation:* resolve targeting through `SeasonEnrollment.groupId` for
non-active seasons and `GroupStudent` for the active one. This is a schema-
adjacent behaviour change; flag it to domain 6 (Students & enrollment) rather
than deciding it unilaterally here.

**8. Two different "submitted" counts on two adjacent screens.** The list says
*N* submitted counting non-`DRAFT` rows (R41); the detail page says *M*
submitted counting non-`PENDING` rows, which includes drafts (R43). Since
merely *opening* an assignment creates a draft (R81), the detail page inflates
the number for every student who looked and left. *Recommendation:* pick
non-`DRAFT` — the list's definition — and use it in both places.

**9. Drafts are created by a page render.** R81 is a write during a GET. It
cannot survive as-is: v2's `GET /assignments/:id` must stay side-effect-free.
*Recommendation:* the student screen creates the draft lazily on first edit, via
domain 08's existing `PATCH /submissions/:publicId` or a new
`POST /assignments/:id/submission`. **This is a hard dependency on domain 08 and
should be agreed with it, not assumed** — it also removes the phantom-draft
inflation in item 8, and the DRAFT short-circuit in R88 that hides an overdue
badge from a student who only ever opened the assignment.

**10. `description` is raw HTML.** It is stored unsanitised and sanitised only at
render by `sanitize-html` (`src/components/ui/rich-text-view.tsx:11-31`), a
library with no React Native equivalent. The API will hand mobile a raw HTML
string. *Recommendation:* sanitise on write in v2 (server-side, same allow-list)
so every consumer is safe regardless of renderer, and pick the mobile rendering
strategy — a vetted HTML renderer or a migration to a structured format —
before the detail screen is built. **Needs a decision:** this is the single
biggest unknown in porting the assignment detail screen.

**11. The notification deep link points at a v1 web path.**
`/student/assignments/:id` (R63) does not exist in v2's route tree, which uses
`/assignments/[id]`. Every notification written while both systems share a
database carries a link one of them cannot resolve. *Recommendation:* have
domain 10 (Notifications) store a route-independent reference (type + entity id)
and resolve it per client; in the interim, v2 must tolerate and rewrite v1-shaped
links rather than 404 on them.

**12. `/admin/assignments` requires role `ADMIN` exactly, so SUPER gets a 403.**
`requireRole(user, ["ADMIN"])` at `src/app/admin/assignments/page.tsx:12`,
whereas every season-scoped assignment page allows `["ADMIN", "SUPER"]`. A SUPER
user clicking the admin nav item would be rejected — they simply never see that
nav item (`src/lib/navigation.ts:58-77`). *Recommendation:* v2's `/assignments`
should admit SUPER; this is a v1 inconsistency, not a rule.

**13. Audit columns are written and never read.** `createdById`/`updatedById`
are stamped faithfully (R71) and no screen or query in this domain ever selects
them. *Recommendation:* keep writing them — the project convention requires it —
but consider surfacing "last edited by" on the staff detail screen, since the
data has been collected all along.
