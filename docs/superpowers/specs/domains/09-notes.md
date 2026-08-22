# Domain 09 — Notes & engagement

> Status: draft · Phase: 4 · v1 API status: **none** (no `/api/v1` route in v1
> touches `EngagementNote` or `engagement.ts`; nothing is ported in
> `apps/backend/src/routes/`; `apps/mobile/app/(app)/notes.tsx` is a placeholder)

This domain owns two things that share a file prefix and almost nothing else.

**Notes** are the `EngagementNote` row: a free-text pastoral record written by a
member of staff *about a named student*, carrying a three-value visibility
setting and an optional follow-up flag. It is the most sensitive content in the
entire product, and — see §4 — v1 protects it with a filter that four separate
pages must each remember to call.

**Engagement** is `src/lib/engagement.ts`: v1's scoring and flagging model. It
is not about notes at all. It computes a 0–100 composite from attendance and
submissions, feeds the "at risk" lists on the mentor dashboard and the reports
screen, and is recomputed from scratch on every render.

**Boundary with domain 4 (Attendance).** `computeAttendanceBudget` (`:109-157`),
`computeAtRiskStudents` (`:173-243`) and `computeAttendanceStreak` (`:250-273`)
physically live in `engagement.ts` but are attendance derivations. Domain 4
specs the budget formula as its R88–R92 and owns the screens that render it
(`/student/attendance`). This domain restates only what `computeEngagementForStudent`
depends on (R51–R60) and the one place engagement and the budget are shown side
by side under contradictory labels (R64). **The `lateMinutes` defect is domain
4's D1/D2 and is cross-referenced, not restated** — but see R63 and §10 D8 for
how it propagates into this domain's numbers.

**Boundary with domain 6 (Students).** `loadStudentDetail` and
`filterVisibleNotes` both live in `src/lib/students-query.ts`. Domain 6 owns the
student record, the roster queries and the profile fields. This domain owns the
`notes` slice of `StudentDetailData` (`:248-258`, `:388-403`, `:470-480`) and
`filterVisibleNotes` (`:486-498`) entirely — every rule about who may read a
note is here.

**Boundary with domain 10 (Notifications).** This domain owns the *trigger* and
the *recipient set* for `MENTOR_FOLLOWUP` (R12–R20). Domain 10 owns delivery,
preferences and the inbox.

**Boundary with domain 17 (Reports).** `reports-query.ts` is domain 17's file.
This domain owns only the engagement banding and at-risk thresholds it applies
(R71–R74), because they are a second, contradictory statement of the same
concept the mentor dashboard uses.

---

## 1. v1 source

| File | Holds |
|---|---|
| `src/lib/note-actions.ts` | The whole note write surface: the Zod schema (`:17-22`), `createNoteAction` (`:31-95`), `updateNoteAction` (`:97-118`), `deleteNoteAction` (`:120-135`), the follow-up notification (`:68-88`), the revalidation set (`:90-93`) |
| `src/lib/engagement.ts` | `computeEngagementForStudent` (`:21-88`) — the score; `computeEngagementBulk` (`:90-99`) — uncalled; `computeAttendanceBudget` (`:109-157`) — domain 4; `computeAtRiskStudents` (`:173-243`) — uncalled; `computeAttendanceStreak` (`:250-273`) |
| `src/lib/students-query.ts` | The note read (`:388-403`), its projection (`:470-480`), the `notes` field of `StudentDetailData` (`:248-258`), the dead `forStudentSelfView` switch (`:275`, `:362-366`, `:388`, `:431`), and **`filterVisibleNotes` (`:486-498`) — the only visibility rule in v1** |
| `src/lib/auth/permissions.ts` | `canWriteNote` (`:405-427`) — the only gate the note actions consult; `canViewStudent` (`:359-386`) — the page-level gate that stands in for a read gate |
| `src/lib/rbac.ts` | `isSuper` (`:12`), `isMentor` (`:24-26`), `canReadAllStudents` (`:53-55`), `isAdminOfSeason` (`:28-30`), `isLeaderOfGroup` (`:32-34`) — the claims `filterVisibleNotes` and `canWriteNote` branch on |
| `src/lib/notifications.ts` | `PREF_FIELD` mapping `MENTOR_FOLLOWUP → mentorFollowup` (`:22`); `createNotificationsBulk` with the opt-out filter and the email fan-out (`:56-96`) |
| `src/lib/email.ts` | `sendNotificationEmail` (`:136-159`) — interpolates the notification body into an HTML email **unescaped** (`:145-150`) |
| `src/lib/reports-query.ts` | `loadReportsData`'s engagement loop (`:134-154`), the banding constants (`:47-59`), the at-risk cut (`:169-172`), `toCsv` (`:177-190`) |
| `src/components/students/note-form.tsx` | The per-student composer: visibility select (`:75-87`), follow-up checkbox (`:89-100`), the client-side empty check (`:41-44`), and the copy that misstates the rule (`:73`) |
| `src/components/students/mentor-note-composer.tsx` | The mentor's cross-student composer; hard-codes `visibility: MENTORS` (`:47`) |
| `src/components/students/student-detail.tsx` | The engagement card (`:101-125`) and the notes tab (`:279-340`), including the raw-HTML render (`:328-331`) |
| `src/components/ui/rich-text-editor.tsx` | TipTap; `onChange` emits an HTML string (`:23`), no sanitizer anywhere in the file |
| `src/app/mentor/notes/page.tsx` | The only "my notes" list. Role gate (`:21`), the unscoped student picker source (`:27-31`), the own-author filter (`:34`), the raw-HTML render (`:119-122`) |
| `src/app/mentor/dashboard/page.tsx` | The at-risk fan-out (`:24-55`), the 60% threshold (`:17`, `:57-64`) |
| `src/app/mentor/students/[id]/page.tsx` | Mentor student detail: `canViewStudent` (`:20`), `loadStudentDetail` (`:22`), engagement (`:23-25`), `filterVisibleNotes` (`:26`), `canWriteNote` (`:39`) |
| `src/app/admin/students/[id]/page.tsx` | Same five calls at `:20`, `:22`, `:23-25`, `:26`, `:39` |
| `src/app/leader/students/[id]/page.tsx` | Same five calls at `:20`, `:22`, `:23-25`, `:26`, `:39` |
| `src/app/super/students/[id]/page.tsx` | Same five calls at `:20`, `:22`, `:23-25`, `:26`, `:39` |
| `src/app/student/profile/page.tsx` | The student's own stats strip — calls `computeEngagementForStudent` (`:55`) and renders only two of its fields (`:86-110`), plus the mislabelled attendance number (`:61-63`) |
| `src/app/student/dashboard/page.tsx` | The same mislabelled attendance number (`:85-86`) and the streak (`:56`) |
| `src/app/api/reports/export/route.ts` | The engagement CSV; scope resolution (`:12-29`) |
| `prisma/schema.prisma` | `NoteVisibility` (`:57-61`), `MENTOR_FOLLOWUP` in `NotificationType` (`:68`), `EngagementNote` (`:572-588`), `NotificationPreference.mentorFollowup` (`:618`) |

**There is no `/api/v1` route for either half.** `find src/app/api -name route.ts`
returns 22 files; none reads or writes `EngagementNote`, and none calls anything
in `engagement.ts` except `src/app/api/reports/export/route.ts`, which is outside
`/api/v1` and belongs to domain 17.

v1 has **zero test files**. The source above is the only statement of intent.

---

## 2. Data model

### `EngagementNote` — `prisma/schema.prisma:572-588`

| Field | Meaning |
|---|---|
| `studentUserId` | The subject. `onDelete: Restrict` (`:575`) — a student with notes cannot be hard-deleted, which is consistent with `User` being soft-deleted anyway. |
| `authorUserId` | The writer. `onDelete: Restrict` (`:577`) — an author with notes cannot be hard-deleted either. Set from the session, never from input (R9). |
| `seasonId` | `Int?`, `onDelete: SetNull` (`:579`). Defaulted at write time from the student's `activeSeasonId` (R4) and **never maintained afterwards** (R5). Nullable in the schema and genuinely nullable in code — every consumer null-checks it. |
| `body` | `String`, no database length bound. Holds **HTML**, not text (R6). Validated 2–20000 chars on create only (R1) and not at all on update (R23). |
| `visibility` | `NoteVisibility`, `@default(LEADERS)` (`:581`). The schema default is never exercised — both composers always send a value (`note-form.tsx:33`, `mentor-note-composer.tsx:47`). |
| `followUpFlagged` | `Boolean @default(false)`. Read once, at create, to decide whether to notify (R12). **Nothing ever reads it again except to render a badge** (`student-detail.tsx:314-318`) — there is no "flagged notes" queue anywhere in v1. |
| `createdAt` | Ordering key for every read (R39). |
| `updatedAt` | `@updatedAt`. **Written but never read** — no surface displays it, and nothing distinguishes an edited note from an original (R24). |

There is **no `deletedAt`**. `EngagementNote` is not in v1's soft-delete set
(`jpc-space/CLAUDE.md` lists `User`, `Season`, `StudentProfile`, `Assignment`),
so a delete is a hard delete (R27). There is no audit column pair
(`createdById`/`updatedById`) either — `authorUserId` is the only actor recorded,
and it does not change on edit.

Indexes: `@@index([studentUserId, createdAt])` (`:586`) serves the student-detail
read; `@@index([authorUserId])` (`:587`) serves the mentor's own-notes list.

### Enum — `prisma/schema.prisma:57-61`

`NoteVisibility` = `LEADERS | MENTORS | ADMINS`. These are **role names, matched
by equality** (R32), not a ladder — see R34 and R35, which are the two most
surprising consequences in this domain.

### Engagement has no model

`computeEngagementForStudent` returns an in-memory `EngagementScore` interface
(`engagement.ts:3-11`) and persists nothing. There is no `Engagement` table, no
cache table, and no column anywhere holding a score (R75). Its own doc comment
says so: `engagement.ts:19` reads "Pure query — recompute on read. Cheap at seed
sizes; cache later if needed."

### Models this domain reads but does not own

- `User` (`:136`, `:141`) — the two `EngagementNote` back-relations, plus `name`/`role` for the author badge (R40).
- `StudentProfile.activeSeasonId` — the season default (R4) and the ADMIN write gate (R45).
- `GroupStudent` — the LEADER write gate (R46) and the assignment-targeting lookup inside the score (R57). `studentUserId` is `@unique` *globally* (`:330`), so it cannot express a student who sat in different groups across seasons — the same defect domain 4 records as its D9.
- `SeasonAdmin` — the follow-up recipient set (R13).
- `Session`, `Attendance`, `Assignment`, `AssignmentTarget`, `Submission` — the score's inputs (R52–R58).
- `NotificationPreference.mentorFollowup` (`:618`) — the opt-out (R18).

---

## 3. Business rules

### Note creation — `createNoteAction`

- **R1.** `body` must be 2–20000 characters — `src/lib/note-actions.ts:18`.
- **R2.** `visibility` must be one of `LEADERS`, `MENTORS`, `ADMINS`; there is no "everyone" and no "author only" — `src/lib/note-actions.ts:19` with `prisma/schema.prisma:57-61`.
- **R3.** `followUpFlagged` defaults to `false` when absent — `src/lib/note-actions.ts:20`, `:41`.
- **R4.** When the caller supplies no `seasonId`, it is defaulted to the student's `StudentProfile.activeSeasonId`, or left null if the student has none — `src/lib/note-actions.ts:46-54`.
- **R5.** That default is a **snapshot taken at write time and never maintained**: if the student's active season changes afterwards, the note keeps pointing at the old one, and a note written while the student had no active season stays seasonless forever — `src/lib/note-actions.ts:46-54` (no other code path writes `EngagementNote.seasonId`).
- **R6.** `body` is **HTML produced by a TipTap editor**, stored verbatim with no sanitisation at any layer, and rendered back with `dangerouslySetInnerHTML` — `src/components/ui/rich-text-editor.tsx:23`, `src/components/students/note-form.tsx:64`, `src/lib/note-actions.ts:61`, `src/components/students/student-detail.tsx:328-331`, `src/app/mentor/notes/page.tsx:119-122`. See §10 D1.
- **R7.** *(implicit)* The only emptiness check is client-side: both composers reject `""` and the literal `"<p></p>"` before calling the action, while the server's `min(2)` accepts `"<p></p>"` (7 characters) — `src/components/students/note-form.tsx:41-44`, `src/components/students/mentor-note-composer.tsx:40-43` versus `src/lib/note-actions.ts:18`.
- **R8.** The caller must pass `canWriteNote(user, studentUserId)` or the action throws `ForbiddenError` — `src/lib/note-actions.ts:36`.
- **R9.** `authorUserId` is taken from the session, never from input — a caller cannot write a note attributed to someone else — `src/lib/note-actions.ts:59`.
- **R10.** On success the action returns the new note's id — `src/lib/note-actions.ts:65`, `:94`.
- **R11.** *(implicit)* The action revalidates four paths — `/super/students/:id`, `/admin/students/:id`, `/mentor/students/:id`, `/mentor/notes` — and **omits `/leader/students/:id`**, even though a LEADER is one of the four roles `canWriteNote` admits (R46). The leader's own view is refreshed only because `NoteForm` calls `router.refresh()` client-side — `src/lib/note-actions.ts:90-93` with `src/components/students/note-form.tsx:57`.
- **R12.** *(implicit)* The mentor composer hard-codes `visibility: MENTORS`, so a mentor writing from `/mentor/notes` cannot choose any other visibility, while the same mentor writing from a student detail page can — `src/components/students/mentor-note-composer.tsx:47` versus `src/components/students/note-form.tsx:75-87`.

### The follow-up notification

- **R13.** A notification is sent only when `followUpFlagged` is true **and** the resolved `seasonId` is non-null — a flagged note about a student with no active season notifies nobody — `src/lib/note-actions.ts:68`.
- **R14.** Recipients are every `SeasonAdmin` of that season. Not the season's leaders, not other mentors, not SUPER users — `src/lib/note-actions.ts:69-72`.
- **R15.** The notification title interpolates the student's name with the literal fallback `"a student"` — `src/lib/note-actions.ts:82`.
- **R16.** The notification body is the **first 140 characters of the raw HTML note body**, so recipients receive a truncated pastoral record — which may cut mid-tag — as the notification's own text — `src/lib/note-actions.ts:83`.
- **R17.** That body is stored on the `Notification` row and is also interpolated **unescaped** into an HTML email sent to each recipient's address — `src/lib/notifications.ts:56-96`, `src/lib/email.ts:145-150`. Note content therefore leaves the system by email; see §10 D2.
- **R18.** Every recipient gets the same link, `/admin/students/:id`, regardless of the recipient's role — `src/lib/note-actions.ts:84`.
- **R19.** Recipients with `NotificationPreference.mentorFollowup = false` are filtered out before the insert — `src/lib/notifications.ts:22`, `:62-75`.
- **R20.** The note create and the notification are **not** in a transaction, and the note is written first; a failure in the notification path leaves the note saved and nobody informed — `src/lib/note-actions.ts:56-88`.
- **R21.** Nothing notifies on update or delete, and there is no way to retract a follow-up: clearing the flag is impossible (R22) and the notification is never revoked — `src/lib/note-actions.ts:97-135`.
- **R22.** *(implicit)* `followUpFlagged` has no reader anywhere beyond a badge in the notes list — v1 has no "flagged for follow-up" queue, so an admin who deletes or misses the notification has no other route to the flagged note — `src/components/students/student-detail.tsx:314-318`, `src/app/mentor/notes/page.tsx:113-117` (no query anywhere filters on `followUpFlagged`).

### Note edit — `updateNoteAction`

- **R23.** Only the note's author may edit it; anyone else — including SUPER — gets `ForbiddenError` — `src/lib/note-actions.ts:107`.
- **R24.** An update may change **only `body`**. `visibility`, `followUpFlagged` and `seasonId` are immutable after creation; a note written to the wrong audience can only be deleted and rewritten — `src/lib/note-actions.ts:109-112`.
- **R25.** The update path performs **no validation at all** — the 2–20000 bound (R1) is on the create schema only, so an update may set `body` to the empty string — `src/lib/note-actions.ts:109-112` versus `:17-22`, `:38-44`.
- **R26.** The previous body is overwritten in place. There is no version table, no history, and `updatedAt` is the only trace that an edit happened — and nothing reads it — `src/lib/note-actions.ts:109-112` with `prisma/schema.prisma:584`.
- **R27.** A missing note id returns `{ ok: false, error: "Note not found." }` rather than throwing — `src/lib/note-actions.ts:106`.

### Note delete — `deleteNoteAction`

- **R28.** Only the author may delete; same `ForbiddenError` for everyone else, SUPER included — `src/lib/note-actions.ts:127`.
- **R29.** The delete is a **hard delete**, not a soft delete: `EngagementNote` has no `deletedAt` column and the action calls `db.engagementNote.delete` — `src/lib/note-actions.ts:129` with `prisma/schema.prisma:572-588`. A deleted note is unrecoverable and leaves no tombstone.
- **R30.** A missing note id returns `{ ok: false }` rather than throwing — `src/lib/note-actions.ts:126`.
- **R31.** *(implicit)* **Neither `updateNoteAction` nor `deleteNoteAction` has a single UI caller anywhere in v1** — `grep -rn "updateNoteAction\|deleteNoteAction" src` matches only their own definitions at `src/lib/note-actions.ts:97` and `:120`. They are exported `"use server"` functions, so they are reachable over the network by action id, but no rendered control invokes them. In practice **v1 notes are append-only from the user's point of view**. See §10 D4.

### Note visibility — who may read a note

This is the core of the domain. Every rule here is enforced in exactly one
place, `filterVisibleNotes`, which is a **pure in-memory function the page calls
after the query has already returned every note**.

- **R32.** A SUPER user sees every note about the student, regardless of visibility or author — `src/lib/students-query.ts:490`.
- **R33.** An author always sees their own notes, regardless of visibility and regardless of role — `src/lib/students-query.ts:492`.
- **R34.** Otherwise visibility is matched against the viewer's role **by equality**: `ADMINS` → role `ADMIN`, `MENTORS` → role `MENTOR`, `LEADERS` → role `LEADER` — `src/lib/students-query.ts:493-495`.
- **R35.** Anything not matched is dropped — `src/lib/students-query.ts:496`.
- **R36.** Consequence of R34: **a season ADMIN cannot read a `LEADERS` or a `MENTORS` note**, which directly contradicts the composer's own description of the setting, "Who can read this note (in addition to you and admins)" — `src/lib/students-query.ts:493-495` versus `src/components/students/note-form.tsx:73`. Every note written by a leader or a mentor under the default or the mentor composer's hard-coded value (R12) is invisible to the admins the UI told the author would see it.
- **R37.** Consequence of R34: visibility is not a hierarchy. A MENTOR — the role `canReadAllStudents` grants global read (`src/lib/rbac.ts:53-55`) — cannot see a `LEADERS` note; a LEADER cannot see an `ADMINS` note. Only SUPER (R32) and the author (R33) cross the boundary.
- **R38.** *(implicit)* **`loadStudentDetail` returns every note about the student to every caller.** The Prisma query filters on `studentUserId` only — no visibility clause, no viewer argument — and takes the 100 most recent. The filtering happens afterwards, in the page, and each of the four student-detail pages must remember to call `filterVisibleNotes` and to pass the *filtered* array to the component — `src/lib/students-query.ts:388-403` and `:470-480` versus `src/app/{admin,leader,mentor,super}/students/[id]/page.tsx:22`, `:26`, `:37`. **This is the single most important rule in the document.** See §4 and §10 D5.
- **R39.** *(implicit)* `filterVisibleNotes` never checks whether the viewer may see the *student at all*. That is `canViewStudent`, called separately by each page before the load — `src/lib/students-query.ts:486-498` versus `src/app/{admin,leader,mentor,super}/students/[id]/page.tsx:20`. Two independent implicit gates therefore protect one payload, and both live in the page.
- **R40.** *(implicit)* `loadStudentDetail` accepts a `forStudentSelfView` option that suppresses notes entirely (`:388-389`) and also blanks `StudentProfile.notes` (`:431`) — and **no caller ever passes it**. `grep -rn "forStudentSelfView" src` matches only `students-query.ts` itself. Students see no notes because **no student-facing page renders `StudentDetail`**, not because a check refuses them — `src/lib/students-query.ts:275`, `:388`; `grep -rn "<StudentDetail" src` returns only the four staff pages.
- **R41.** The note read is capped at the 100 most recent by `createdAt` descending; there is no pagination and no total count, so the 101st note is silently unreachable — `src/lib/students-query.ts:392-393`.
- **R42.** Every note a viewer is allowed to read discloses its author's name and role — pastoral authorship is never anonymous to a permitted reader — `src/lib/students-query.ts:400`, `:476-478`, `src/components/students/student-detail.tsx:305-310`.
- **R43.** *(implicit)* The `/mentor/notes` list applies **no visibility filter**, because its query is already narrowed to `authorUserId = the viewer` — R33 makes the filter a no-op there. The narrowing is the whole protection — `src/app/mentor/notes/page.tsx:34`.
- **R44.** *(implicit)* `/mentor/notes` is gated on role `MENTOR` only, so it is the one "my notes" surface in v1; admins, leaders and SUPER users have no way to list the notes they have authored across students — `src/app/mentor/notes/page.tsx:21`.
- **R45.** *(implicit)* The mentor composer's student picker is fed by a direct query for every non-deleted `STUDENT` — it does not use `getVisibleStudents`, and unlike `listStudentsForScope` it does not exclude graduated students — so alumni appear in the picker and can be written about — `src/app/mentor/notes/page.tsx:27-31` versus `src/lib/auth/permissions.ts:198-248` and `src/lib/students-query.ts:28`.

### Note write authorization — `canWriteNote`

- **R46.** SUPER and MENTOR may write a note about **any** student, with no scope check — `src/lib/auth/permissions.ts:409`.
- **R47.** An ADMIN may write only when the student's **current** `activeSeasonId` is a season they administer — `src/lib/auth/permissions.ts:410-417`.
- **R48.** Therefore an admin cannot write a note about a student who has no active season, even one enrolled in the admin's season — the gate reads `StudentProfile.activeSeasonId`, not `SeasonEnrollment` — `src/lib/auth/permissions.ts:411-416`. This is a narrower rule than `canViewStudent`, which checks `SeasonEnrollment` (`:366-373`), so **an admin can open a student they cannot write about**.
- **R49.** A LEADER may write only when the student's `GroupStudent` row names a group the leader leads — `src/lib/auth/permissions.ts:418-425`.
- **R50.** R49 uses `GroupStudent`, which is global and singular (`prisma/schema.prisma:330`), not `SeasonEnrollment.groupId` — so a leader's write right follows the student's *current* group across all seasons, and a student with no `GroupStudent` row cannot be written about by any leader — `src/lib/auth/permissions.ts:419-423`. Same defect class as domain 4's D9.
- **R51.** A STUDENT can never write a note, including about themselves — `src/lib/auth/permissions.ts:426`.
- **R52.** *(implicit)* Nothing gates *which* visibility a writer may choose. A LEADER may write an `ADMINS` note that they will then be unable to read back (R34, R37), and a mentor's composer silently locks the choice (R12) — `src/lib/note-actions.ts:19` (the schema accepts all three from any permitted writer).

### Engagement — what the score is computed from

- **R53.** `score = round(attendancePct × 0.5 + submissionPct × 0.5)` — an even split, hard-coded, not configurable per season — `src/lib/engagement.ts:77`.
- **R54.** `attendancePct = round(present / total × 100)`, where `present` counts attendance rows with status `PRESENT` **or** `LATE` — a late arrival is fully present for scoring purposes — `src/lib/engagement.ts:39-43`.
- **R55.** The denominator is **every session in the season with `startsAt <= now`**, not the sessions the student was enrolled for — a student who joins a season halfway through is scored against the sessions that ran before they existed — `src/lib/engagement.ts:27-30`, `:38`.
- **R56.** `attendancePct` is 0, not null, when the season has no past sessions — so a brand-new season scores every student at 0% attendance and therefore flags them at-risk (R72) — `src/lib/engagement.ts:42-43`.
- **R57.** `submissionPct` numerator counts assignments whose first submission row has status `SUBMITTED`, `REVIEWED` or `RETURNED`; a `DRAFT` counts as not done — `src/lib/engagement.ts:68-71`.
- **R58.** The denominator is every non-soft-deleted assignment in the season that is either `isAllGroups` or targets the student's current group — `src/lib/engagement.ts:50-58`.
- **R59.** The student's group for R58 is resolved from `GroupStudent` (global, singular), so a student with no `GroupStudent` row is scored against `isAllGroups` assignments only — `src/lib/engagement.ts:46-49`, `:56`.
- **R60.** Assignment due dates are **ignored**: an assignment created today with a due date next month counts against the student's `submissionPct` immediately — `src/lib/engagement.ts:50-58` (the `where` has no date clause).
- **R61.** `a.submissions[0]` takes whichever row Prisma returns first when a student has more than one submission for an assignment — there is no ordering and no "latest" selection — `src/lib/engagement.ts:69`.
- **R62.** `submissionPct` is 0 when the season has no assignments — `src/lib/engagement.ts:72-75`.
- **R63.** **Notes are not an input to engagement.** Despite the model being named `EngagementNote`, `computeEngagementForStudent` never reads it — `src/lib/engagement.ts:21-88`. The two halves of this domain do not touch.
- **R64.** `computeEngagementForStudent` performs **no authorization check of any kind** — it takes two integers and returns a score for any student in any season — `src/lib/engagement.ts:21-24`.

### Engagement and the absence budget — the two attendance numbers

- **R65.** `computeAttendanceBudget` computes `minutesUsed = absentCount × season.absenceWeightMinutes + SUM(lateMinutes)` over the student's `LATE` rows in the season — `src/lib/engagement.ts:143`. This is domain 4's R88 and is not restated further here.
- **R66.** `budgetPct = min(round(minutesUsed / absenceBudgetMinutes × 100), 100)` — `src/lib/engagement.ts:145-148` (domain 4 R90).
- **R67.** The budget therefore consumes **raw `lateMinutes`**, which domain 4 establishes is measured from `checkInOpenAt` — when an admin pressed the button — rather than from `session.startsAt` (domain 4 R63, D1, D2). Every number in this domain that derives from the budget inherits that: it is a function of staff behaviour, not student behaviour. **`computeEngagementForStudent` itself is immune** — it counts `PRESENT|LATE` rows and never reads `lateMinutes` (R54) — so v1's two attendance percentages have *different* sensitivities to the same defect. See §10 D8.
- **R68.** The student dashboard and the student profile both display `max(0, round(100 − budgetPct))` under the label **"Attendance"** — `src/app/student/dashboard/page.tsx:85-86`, `src/app/student/profile/page.tsx:61-63`. That is remaining absence *budget*, not attendance rate, and it is a different number from `engagement.attendancePct` (R54) computed on the same page.
- **R69.** `computeAttendanceStreak` counts consecutive past sessions attended, walking backwards from the most recent; `ABSENT` breaks the streak and a session with **no** attendance record is skipped without breaking it — `src/lib/engagement.ts:266-271`.
- **R70.** The streak is uncapped and scans every past session in the season on every call — `src/lib/engagement.ts:254-263`.

### At-risk thresholds and banding — stated three times, three ways

- **R71.** `computeAtRiskStudents` flags a student when `minutesUsed >= season.absenceBudgetMinutes`, sorts by `minutesOver` descending, and scopes to a passed-in student list or the whole active season — `src/lib/engagement.ts:229`, `:242`, `:187-197`.
- **R72.** **`computeAtRiskStudents` has no callers.** `grep -rn "computeAtRiskStudents" src` matches only its own definition at `src/lib/engagement.ts:173`. The one at-risk definition based on the absence budget is dead code.
- **R73.** The mentor dashboard's live definition is different: a student is at risk when `attendancePct < 60` **or** `submissionPct < 60` — either component, not the composite — then sorted by `score` ascending and cut to 10 — `src/app/mentor/dashboard/page.tsx:17`, `:57-64`.
- **R74.** The reports screen's definition is different again: `score < 60` — the *composite* — sorted ascending, cut to 10 — `src/lib/reports-query.ts:169-172`.
- **R75.** Reports also bands every student: `High >= 80`, `Medium >= 60`, `Low >= 40`, else `At risk` — `src/lib/reports-query.ts:47-59`. A student at 55/55 is "Low" on reports and at-risk on the mentor dashboard.
- **R76.** *(implicit)* The mentor dashboard's empty state tells the user "All students above the 60% engagement threshold", describing the composite — while the filter it guards tests the two components separately (R73) — `src/app/mentor/dashboard/page.tsx:120` versus `:57-64`.
- **R77.** The engagement CSV export carries `name`, `email`, season title, `attendancePct`, `submissionPct` and `score`, one row per **active enrollment** (so a student in two seasons appears twice) — `src/lib/reports-query.ts:142-154`, `:177-190`.

### Engagement is computed on read, never stored

- **R78.** No table, column or cache holds an engagement score; every consumer recomputes it — `src/lib/engagement.ts:19` (the function's own comment states the intent), and `EngagementNote` is the only engagement-named model in `prisma/schema.prisma`.
- **R79.** One call to `computeEngagementForStudent` issues **four database round-trips**, the first two and the last two sequential: past sessions, that student's attendance, the student's `GroupStudent` row, then the assignments with their submissions — `src/lib/engagement.ts:27`, `:31`, `:46`, `:50`.
- **R80.** The mentor dashboard calls it once per active student, all in flight simultaneously via `Promise.all` — for a cohort of *N* students that is **4N queries per page render**, concurrently — `src/app/mentor/dashboard/page.tsx:24-41`, `:44-55`.
- **R81.** `loadReportsData` calls it once per active enrollment in a `for … await` loop — the same 4N queries, but strictly sequential, so the reports page's latency grows linearly with the cohort — `src/lib/reports-query.ts:143-154`.
- **R82.** `computeEngagementBulk` exists precisely to solve this and is **never called**; it would not help anyway, since it is itself a sequential `for … await` over the single-student function — `src/lib/engagement.ts:90-99`, and `grep -rn "computeEngagementBulk" src` matches only the definition.
- **R83.** The four student-detail pages each call it once, after `loadStudentDetail`, and only when the student has an `activeSeasonId` — otherwise the engagement card is omitted entirely — `src/app/{admin,leader,mentor,super}/students/[id]/page.tsx:23-25` with `src/components/students/student-detail.tsx:101`.
- **R84.** `loadStudentDetail` adds its own N+1 on the same render: two aggregate queries **per enrolled season** in a sequential loop, on top of the four already-fetched relations — `src/lib/students-query.ts:346-358`. Its own comment at `:341-345` records an abandoned attempt to avoid this.

### Who may see an engagement score

- **R85.** *(implicit)* The engagement card renders only inside `StudentDetail` (`src/components/students/student-detail.tsx:101-125`), and `StudentDetail` is rendered by exactly four pages, all staff-only — `grep -rn "<StudentDetail" src` returns `src/app/{admin,leader,mentor,super}/students/[id]/page.tsx:34`. **There is no gate on the score itself** (R64); the score is protected only by which page renders the card.
- **R86.** *(implicit)* **A student never sees their composite score.** `/student/profile` calls `computeEngagementForStudent` and renders only `submissionsCompleted / submissionsExpected` from the result, discarding `score`, `attendancePct` and `submissionPct` — `src/app/student/profile/page.tsx:53-59`, `:86-110`. `grep -rn "\.score" src/app src/components` finds `engagement.score` in one place only: `src/components/students/student-detail.tsx:108-111`.
- **R87.** *(implicit)* The number a student *is* shown under "Attendance" is the inverted absence budget (R68), so the student sees a plausible-looking attendance figure that no member of staff sees and that disagrees with the `attendancePct` on the staff view of the same student — `src/app/student/profile/page.tsx:61-63`, `:88-91` versus `src/components/students/student-detail.tsx:113-117`.
- **R88.** The engagement CSV is downloadable by SUPER, MENTOR and any ADMIN (scoped to their seasons); a bare request with no `season` parameter returns **every season** for SUPER and MENTOR — `src/app/api/reports/export/route.ts:12-29`.

### Time

- **R89.** Every date comparison in this domain uses a bare `new Date()` evaluated on the server — `src/lib/engagement.ts:26`, `:28`, `:255`, `src/lib/reports-query.ts:82`. There is no timezone handling anywhere, so "sessions in the past" is decided in the server's zone, matching the rest of v1.
- **R90.** Note timestamps are formatted with `date-fns` inside **server** components, so a reader always sees the note's date rendered in the server's timezone rather than their own — `src/components/students/student-detail.tsx:320`, `src/app/mentor/notes/page.tsx:103`.

**Total: 90 rules, 16 of them marked `(implicit)`** — R7, R11, R12, R22, R31,
R38, R39, R40, R43, R44, R45, R52, R76, R85, R86, R87. Four of those (R38, R40,
R85, R86) are the load-bearing ones: they are the only things standing between a
confidential note or an engagement score and the wrong reader, and none of them
is a check.

---

## 4. Authorization

**Read this section before any other.** This domain has the most sensitive
payload in the migration and the thinnest enforcement of any domain specced so
far: **there is no read gate on a note anywhere in v1's library layer.** The
query returns everything; a pure function filters it; four pages must each
remember to call that function and to pass its output rather than the raw array.

| Operation | Roles | Row-scoped condition | v1 citation |
|---|---|---|---|
| Read notes about a student | SUPER, ADMIN, LEADER, MENTOR | **none in the library.** `loadStudentDetail` returns all notes about the student to any caller; `canViewStudent` gates the *student*, `filterVisibleNotes` narrows the *array*, and both are called by the page | `src/lib/students-query.ts:388-403`; `src/app/{admin,leader,mentor,super}/students/[id]/page.tsx:20`, `:26` |
| See an individual note | SUPER (all); author (own); ADMIN (`ADMINS` only); MENTOR (`MENTORS` only); LEADER (`LEADERS` only) | in-memory match on `visibility` and `authorId` — no database read | `src/lib/students-query.ts:486-498` |
| Read own authored notes | MENTOR | `authorUserId = viewer`, applied as a `where` clause | `src/app/mentor/notes/page.tsx:21`, `:34` |
| Create a note | SUPER, MENTOR (any student); ADMIN (student's active season is theirs); LEADER (student's current group is theirs) | `canWriteNote(user, studentUserId)` — a real row-scoped gate, the only one in the domain | `src/lib/note-actions.ts:36`, `src/lib/auth/permissions.ts:405-427` |
| Choose a note's visibility | any permitted writer | none | `src/lib/note-actions.ts:19` |
| Edit a note | the author only | `note.authorUserId === user.userId`; SUPER is **not** exempt | `src/lib/note-actions.ts:107` |
| Delete a note | the author only | same; SUPER is **not** exempt | `src/lib/note-actions.ts:127` |
| Read a student's engagement score | *not gated at all in the library* | none — two integers in, a score out | `src/lib/engagement.ts:21-24` |
| See an engagement score in the UI | SUPER, ADMIN, LEADER, MENTOR | only via `canViewStudent` on the page that renders `StudentDetail` | `src/components/students/student-detail.tsx:101-125`; `src/app/{admin,leader,mentor,super}/students/[id]/page.tsx:20` |
| See own engagement | STUDENT — **partially** | own user id only; the composite `score` is fetched and discarded | `src/app/student/profile/page.tsx:53-59`, `:86-110` |
| Read at-risk lists (all students) | MENTOR | none — every active student in the system | `src/app/mentor/dashboard/page.tsx:21`, `:24-41` |
| Export the engagement CSV | SUPER, MENTOR (all seasons); ADMIN (own seasons) | `user.seasonAdminIds.includes(id)` when a season is named | `src/app/api/reports/export/route.ts:12-29` |

### Where v1 enforces nothing and relies on the UI

These become real gates in v2. They are ordered by how bad the failure is.

1. **The note read gate does not exist.** `loadStudentDetail` (`src/lib/students-query.ts:388-403`) selects every `EngagementNote` for the student with no viewer argument and no visibility clause, returns them in `StudentDetailData.notes`, and the four pages call `filterVisibleNotes(student.notes, user)` (`:26`) and pass `visibleNotes` — not `student.notes` — to the component (`:37`). Today all four do it correctly. **The moment this becomes an endpoint, the correctness of every future caller depends on remembering a second function call**, and the failure mode is silent: the wrong array renders perfectly, just with other people's confidential notes in it. Compare domain 4's D6, where exactly this shape — a page-supplied narrowing with no check underneath — survived the port and shipped as a live defect in `apps/backend`. **In v2 the visibility filter must be part of the query, expressed as a Prisma `where` built from the viewer's claims, and the endpoint must not be able to return an unfiltered array at all.** There should be no function in v2 that returns notes without a viewer.

2. **Students are excluded by absence, not by refusal.** `forStudentSelfView` is a real, working suppression switch that no caller passes (R40); students see no notes purely because no student-facing page renders `StudentDetail` (R40, `grep -rn "<StudentDetail" src`). In v2 the same student opens the same app as the staff, over the same API. **A student must be refused notes about themselves by an explicit rule in the gate — not by the absence of a screen.** This is the single most consequential line of code this domain will add.

3. **The engagement score has no gate whatsoever.** `computeEngagementForStudent` takes `(studentUserId, seasonId)` and returns a score (R64). Its protection is entirely which page calls it. In v2 it must sit behind `canViewStudent`, and the decision in §10 D9 — whether a student may see their own score — must be made explicitly rather than inherited from the fact that v1's student profile happened to discard the field.

4. **`filterVisibleNotes` and `canViewStudent` are two implicit gates on one payload.** Neither knows about the other (R39). A v2 endpoint must check both, in that order, and an integration test must assert both — a leader from another group refused the student at all, and a permitted leader refused an `ADMINS` note about a student they *do* lead.

5. **SUPER cannot edit or delete another author's note** (R23, R28). That is deliberate-looking and defensible for a pastoral record, but it also means v1 has **no way for anyone to remove a note** other than its author — and no author-facing control exists (R31). In practice v1 notes are permanent. §10 D4 decides whether v2 keeps that.

6. **The visibility choice is ungated** (R52). A leader may write an `ADMINS` note they cannot read back; the mentor composer removes the choice entirely (R12). Either the choice is meaningful and every writer gets it, or it is derived from the writer's role — v2 should not ship both.

7. **`MENTOR` is a global read-all role with global write.** `canWriteNote` admits a MENTOR for any student with no scope check at all (R46), and the mentor composer lists every student in the system including alumni (R45). That matches `canReadAllStudents` (`src/lib/rbac.ts:53-55`) and is presumably intended, but it means one compromised mentor account reaches every pastoral record in the product. Worth stating explicitly rather than discovering.

---

## 5. Read surface

### Notes about a student

`loadStudentDetail(studentUserId)` → `StudentDetailData.notes` —
`src/lib/students-query.ts:388-403`, projected at `:470-480`.

Returns `{ id, body, visibility, followUpFlagged, createdAt, authorId,
authorName, authorRole, seasonTitle }[]`, the 100 most recent by `createdAt`
descending (R41). **The shape does not vary by role and neither does the
content — every caller receives every note** (R38). The narrowing is the page's
`filterVisibleNotes` call (R32–R35), applied in memory afterwards.

This is the clearest example in the domain of "returns more than the page
renders": for a viewer who is a LEADER, the query may fetch 100 `ADMINS` notes
and render none of them, having transported all 100 bodies into the render
process. In v2, over an API, that becomes 100 note bodies transported to a
device.

`loadStudentDetail` is also expensive for reasons that are not this domain's:
two aggregate queries per enrolled season in a sequential loop (R84), plus the
notes, attendance, submissions and documents relations.

### The mentor's own notes

`src/app/mentor/notes/page.tsx:32-48`. Returns `{ id, body, visibility,
followUpFlagged, createdAt, studentUser: { id, name, email }, season: { title } }[]`,
`authorUserId = viewer`, optionally narrowed to one student by a `?student=`
query parameter (`:24`, `:35`), 100 most recent. Runs in parallel with a query
for **every** student in the system to populate the composer's picker (R45) —
that second query returns `id`, `name` and `email` for the whole cohort on every
page load.

### Engagement for one student

`computeEngagementForStudent(studentUserId, seasonId)` — `src/lib/engagement.ts:21-88`.

Returns `{ attendancePct, submissionPct, score, attendanceTotal,
attendancePresent, submissionsExpected, submissionsCompleted }`. Four queries
(R79). No caching, no memoisation, no authorization (R64).

Shape does not vary by role. What varies is **how much of it is rendered**: the
staff card shows all seven fields (`student-detail.tsx:101-125`); the student
profile shows two and silently discards `score` (R86).

### Engagement in bulk — the N+1

There are two bulk consumers and neither uses the bulk function:

- **Mentor dashboard** (`src/app/mentor/dashboard/page.tsx:44-55`) — 4N concurrent queries (R80), plus two more for the recent-activity lists (`:67-91`). For a 200-student cohort that is ~800 simultaneous queries against a pooled connection on a single page render.
- **Reports** (`src/lib/reports-query.ts:143-154`) — 4N sequential queries (R81). Latency is linear in cohort size, and this path also backs the CSV export (`src/app/api/reports/export/route.ts:31`), which is domain 17's screen but this domain's arithmetic.

`computeEngagementBulk` (`:90-99`) is dead and would not have helped (R82).

**This is a mobile problem, not just a slow page.** In v1 it is one server render
per navigation. Under React Query, which refetches on mount, on window focus and
on reconnect, a `/dashboard` screen backed by a per-student engagement endpoint
re-issues the whole fan-out every time the app returns to the foreground. There
is no *write* on read here — nothing in this domain mutates during a GET — but
the cost profile is the same trap: an operation priced for one render per
navigation, invoked on every focus.

**Where engagement should live in v2.** Not on the client, and not as one
endpoint per student:

1. **Server-side, one query per cohort.** The score's four inputs are all
   aggregatable. Attendance is a `groupBy` over `Attendance` joined to the
   season's past sessions; submissions are a `groupBy` over `Submission` joined
   to the season's assignments. Both collapse to **two queries for the whole
   cohort**, which is the shape `computeAtRiskStudents` already uses for the
   absence budget (`src/lib/engagement.ts:203-212`) and the model to copy.
2. **A cohort endpoint, not a per-student one.** `GET /seasons/:id/engagement`
   returns a row per student; the dashboard and the reports screen both consume
   it. A single-student `GET /students/:id/engagement` exists for the detail
   screen and reuses the same aggregation with an `in` list of one.
3. **Still computed, not stored — for now.** Storing a score needs a column,
   and the shared-database freeze forbids a migration while v1 runs. Two-stage:
   ship the aggregate queries now, and if the cohort endpoint is still slow at
   real cohort sizes, add a materialised score at cutover. Do **not** cache it
   in the mobile client beyond React Query's normal staleness — a stale
   at-risk list is worse than a slow one.

### What each role sees

| Surface | STUDENT | LEADER | MENTOR | ADMIN | SUPER |
|---|---|---|---|---|---|
| Notes about a student | none (R40 — by absence) | `LEADERS` + own | `MENTORS` + own | `ADMINS` + own | all |
| Own authored notes list | n/a | no surface (R44) | `/mentor/notes` | no surface | no surface |
| Composite engagement score | **no** (R86) | yes | yes | yes | yes |
| `attendancePct` / `submissionPct` | no | yes | yes | yes | yes |
| Inverted absence budget labelled "Attendance" | **yes** (R68) | no | no | no | no |
| Attendance streak | yes | no | no | no | no |
| At-risk list | no | no | yes (all students) | via reports | via reports |

---

## 6. Write surface

### `createNoteAction(studentUserId, input)` — `src/lib/note-actions.ts:31-95`

- **In:** `studentUserId`; `{ body, visibility, followUpFlagged?, seasonId? }`.
- **Gate:** `canWriteNote` (R8), throws `ForbiddenError`.
- **Validates:** R1–R3. Returns per-field errors via `zodErrors` (`:137-144`).
- **Derives:** `seasonId` from the student's active season when absent (R4) — one extra query.
- **Writes:** one `EngagementNote` row; `authorUserId` from the session (R9).
- **Notifies:** `MENTOR_FOLLOWUP` to the season's admins, when flagged and seasoned (R13–R19). Three further queries plus a `createMany` plus an email fan-out.
- **Returns:** `{ ok: true, noteId }`.
- **Non-atomic:** the note write, the admin lookup, the student lookup and the notification insert are four separate awaited statements with no transaction (R20). A failure after `:56` leaves a note with no notification — the less harmful direction, but silent.
- **Revalidates:** four paths, omitting the leader's (R11).

### `updateNoteAction(noteId, body)` — `src/lib/note-actions.ts:97-118`

- **In:** note id, new body string. **No visibility, no flag, no season** (R24).
- **Gate:** author equality (R23).
- **Validates:** **nothing** (R25).
- **Writes:** `body` only; `updatedAt` by `@updatedAt`. Destroys the previous body with no history (R26).
- **Returns:** `{ ok: true }`, or `{ ok: false }` for a missing id (R27).
- **Callers:** none (R31).

### `deleteNoteAction(noteId)` — `src/lib/note-actions.ts:120-135`

- **Gate:** author equality (R28).
- **Writes:** a hard `delete` (R29). No tombstone, no `deletedAt`, no cascade concerns (`EngagementNote` is a leaf).
- **Notifies:** nothing — a `MENTOR_FOLLOWUP` notification whose note has been deleted keeps its 140-character excerpt (R16) and its now-dangling link (R18, R21).
- **Callers:** none (R31).

### Nothing else writes

`engagement.ts` is read-only end to end — five exported functions, all `findMany`/
`count`/`aggregate`/`groupBy`. There is no write anywhere in this domain outside
`note-actions.ts`, and no write is performed during any read.

---

## 7. Proposed API

The migration design lists this domain as **none**, and that is correct: no v1
`/api/v1` route and no `apps/backend/src/routes/` file touches either half.
Everything below is **new**. There is no ported shape to be faithful to, which
means the implicit rules in §4 can be made explicit at zero compatibility cost —
this domain is the cheapest place in the whole migration to fix an authorization
model, and the most expensive place to get one wrong.

| Method | Path | Status | Auth | Request | Response |
|---|---|---|---|---|---|
| GET | `/api/v1/students/:id/notes` | **new** | `canViewStudent` **and** `role !== "STUDENT"` | `?cursor`, `?limit` | `{ data: { notes: NoteSummary[], nextCursor } }` — visibility applied **in the query**, never after |
| POST | `/api/v1/students/:id/notes` | **new** | `canWriteNote` | `{ body, visibility, followUpFlagged?, seasonId? }` | `{ data: { note: NoteSummary } }` |
| PATCH | `/api/v1/notes/:id` | **new** | author only (R23) | `{ body }` | `{ data: { note: NoteSummary } }` |
| DELETE | `/api/v1/notes/:id` | **new** | author only (R28) | — | `{ data: { deleted: true } }` |
| GET | `/api/v1/me/notes` | **new** | any role that may author (SUPER, ADMIN, LEADER, MENTOR) | `?studentId`, `?cursor` | `{ data: { notes: AuthoredNote[], nextCursor } }` — replaces `/mentor/notes` and extends it to the other three roles (R44) |
| GET | `/api/v1/students/:id/engagement` | **new** | `canViewStudent`; see §10 D9 for the student's own case | `?seasonId` (defaults to the student's active season) | `{ data: EngagementScore }` |
| GET | `/api/v1/seasons/:id/engagement` | **new** | `canAccessSeason` + staff role | `?groupId` optional | `{ data: { students: EngagementRow[] } }` — **the cohort endpoint; two aggregate queries, not 4N** |
| GET | `/api/v1/me/engagement` | **new**, conditional | STUDENT (own) | — | `{ data: { … } }` — exists only if §10 D9 decides students may see it; otherwise the student profile's two counters come from this domain's `students/:id/engagement` under a self-read gate |

### Notes on the proposed endpoints

- **`GET /students/:id/notes` must not have an unfiltered variant.** The v2
  query function takes the viewer as a required argument and builds the
  visibility clause into Prisma's `where` — an `OR` of `authorUserId = viewer`,
  `visibility = <viewer's role's literal>`, and unconditionally true for SUPER
  (R32–R35). There must be no exported function that returns notes without a
  viewer, because that is precisely the function `loadStudentDetail` is
  (`src/lib/students-query.ts:388-403`) and precisely how domain 4's D6 defect
  came to exist. An integration test should assert that a LEADER receives none
  of an `ADMINS` note about a student they legitimately lead.

- **Notes must leave `GET /students/:id`.** In v1 the notes ride along inside
  `loadStudentDetail`'s payload, which is domain 6's endpoint. Keeping that
  coupling in v2 means the student-detail response is only as safe as its most
  careless consumer. Separate route, separate gate, separate query — the detail
  endpoint carries a note *count* at most.

- **Pagination replaces the silent 100-row cap** (R41). v1's cap is a
  correctness bug in slow motion: a student with a long pastoral history has
  older notes that no surface can reach. Cursor on `createdAt`.

- **`PATCH` should validate what `POST` validates.** R25 is a straightforward
  defect — reuse the create schema's `body` field rather than porting the
  unvalidated update.

- **The mentor at-risk dashboard consumes `GET /seasons/:id/engagement`,** not
  N calls to the per-student endpoint. Its v1 form (R80) is unshippable on
  mobile. The threshold and banding must be resolved first — see §10 D7.

- **No endpoint should return an engagement score without a viewer check.**
  `computeEngagementForStudent`'s two-integer signature (R64) is fine as an
  internal function; the route must gate before calling it.

---

## 8. Proposed shared contracts

`packages/shared/src/notes.ts` — **new file, nothing exists today.**
`packages/shared/src/` currently holds `assignment.ts`, `attendance.ts`,
`auth.ts`, `enums.ts`, `group.ts`, `navigation.ts`, `season.ts`, `session.ts`,
`submission.ts` and `index.ts`. Nothing in any of them mentions notes or
engagement.

Whether engagement shares that file or gets `packages/shared/src/engagement.ts`
is a judgement call; **prefer two files**, because the two halves have no shared
type (R63) and the note file is the one that will accumulate privacy-sensitive
review attention.

### Reuse, do not redefine

- `userRoleSchema` — `packages/shared/src/enums.ts`. `NoteVisibility`'s three values are role names (R34) but they are a **different enum** with a different domain (`LEADERS`/`MENTORS`/`ADMINS`, plural, no `SUPER`, no `STUDENT`). Define `noteVisibilitySchema` separately and do not derive it from the role enum — a future role addition must not silently become a visibility.
- `attendanceStatusSchema` — `enums.ts`. The engagement score reads `PRESENT`/`LATE` (R54); do not restate the enum.
- `submissionStatusSchema` — wherever `submission.ts` defines it. R57's three "counts as done" values must be expressed against it, not as free literals.
- `attendanceBudgetSchema` — **domain 4 owns this** (its §8). This domain's screens consume it (R65–R68); do not define a second one.

### New schemas — notes

| Name | Fields |
|---|---|
| `noteVisibilitySchema` | the three literals from `prisma/schema.prisma:57-61`. Do not add a fourth. |
| `noteSummarySchema` | `id` (int), `body` (string — see D1 on whether this stays HTML), `visibility`, `followUpFlagged` (bool), `createdAt` (ISO string), `updatedAt` (ISO string — v1 writes it and never reads it; expose it so an edited note can be labelled), `authorId` (int), `authorName` (nullable string), `authorRole` (role enum), `seasonId` (nullable int), `seasonTitle` (nullable string) |
| `authoredNoteSchema` | the same, plus `student` (`{ id, name (nullable), email }`) — the `/me/notes` shape, mirroring `src/app/mentor/notes/page.tsx:45` |
| `createNoteRequestSchema` | `body` (2–20000, R1), `visibility`, `followUpFlagged` (default false, R3), `seasonId` (nullable int, optional — R4 says the server defaults it) |
| `updateNoteRequestSchema` | `body` only (R24), **with the same bound as create** (fixes R25) |
| `noteListResponseSchema` | `notes` (array), `nextCursor` (nullable string) |

`studentUserId` is **not** a field of `createNoteRequestSchema` — it is a path
parameter, so a client cannot address a note at a student it did not name in the
URL the gate checked.

### New schemas — engagement

| Name | Fields |
|---|---|
| `engagementScoreSchema` | `score` (0–100 int), `attendancePct` (0–100), `submissionPct` (0–100), `attendanceTotal`, `attendancePresent`, `submissionsExpected`, `submissionsCompleted` — the seven fields of `src/lib/engagement.ts:3-11` |
| `engagementRowSchema` | `studentUserId`, `name` (nullable), `seasonId`, `seasonTitle` (nullable), plus `engagementScoreSchema`'s fields — the cohort endpoint's row |
| `engagementBandSchema` | the four literals from `src/lib/reports-query.ts:47-52`, **only if §10 D7 keeps banding** |
| `attendanceStreakSchema` | `streak` (int ≥ 0) — R69; consider folding into domain 4's contracts instead, since it reads only `Attendance` |

Timestamps are strings on the wire, matching the convention noted in `season.ts`.

### Bare interfaces this domain converts to Zod

Per the `CLAUDE.md` convention, this domain introduces no legacy interfaces —
there is nothing in `packages/shared` to convert. The v1 interfaces
`EngagementScore` (`src/lib/engagement.ts:3-11`), `AttendanceBudget` (`:101-107`),
`AtRiskStudent` (`:159-167`) and the `notes` slice of `StudentDetailData`
(`src/lib/students-query.ts:248-258`) are the source material, not files to
migrate.

**`body` must not appear in any student-facing schema, and no schema in this
domain may be reachable by a STUDENT-role token** unless §10 D6 explicitly
decides otherwise.

---

## 9. Screens

| v1 page(s) | v2 route | Exists? | Roles | Notes |
|---|---|---|---|---|
| `/mentor/notes` | `/notes` | **placeholder** — `apps/mobile/app/(app)/notes.tsx` renders an `EmptyState` | MENTOR today; see below | The composer (student picker + rich text + follow-up flag) and the authored-note list. Already in the tab bar for MENTOR only — `packages/shared/src/navigation.ts:139`. If `/me/notes` is opened to ADMIN/LEADER/SUPER (§7), the nav entry must follow, or the route is reachable by URL and invisible in the bar. |
| Notes tab of `/{admin,leader,mentor,super}/students/[id]` | `/students/[id]` **notes tab** | **no** — `apps/mobile/app/(app)/students/` holds only `index.tsx`, `alumni.tsx`, `dropped.tsx` | SUPER, ADMIN, LEADER, MENTOR | Domain 6 owns the route; this domain owns the tab. **The tab must not render until the notes request returns** — it cannot reuse a student-detail payload, because in v2 notes come from their own gated endpoint (§7). |
| Engagement card on the same four pages | `/students/[id]` header | **no** | SUPER, ADMIN, LEADER, MENTOR | `src/components/students/student-detail.tsx:101-125`. Hidden when the student has no active season (R83). |
| `/mentor/dashboard` at-risk list | `/dashboard`, MENTOR branch | partly — `dashboard.tsx` exists as the worked React Query example | MENTOR | Must consume the cohort endpoint (§7), not N per-student calls. Threshold decided in §10 D7. |
| `/mentor/reports` engagement buckets + at-risk + CSV | `/reports` | route exists, content does not | MENTOR, ADMIN, SUPER | Domain 17's screen; this domain supplies the arithmetic (R74–R77). The CSV export is separately awkward on React Native — same class of problem as domain 4's D10. |
| `/student/profile` stats strip | `/profile`, STUDENT branch | route exists | STUDENT | Two counters plus the streak. **Do not port the "Attendance" label as-is** — R68/R87, §10 D3. |
| `/student/dashboard` absence-budget tile | `/dashboard`, STUDENT branch | partly | STUDENT | Domain 4's number on domain 4's terms; this domain only flags the shared mislabel. |
| — | note edit / delete controls | **do not exist in v1** (R31) | author | If §10 D4 says v2 ships them, they are new UI with no v1 precedent to copy. |

`/students/[id]` is the detail route this domain most needs and it does not
exist. `/notes` exists as a file but renders nothing.

---

## 10. Open questions and divergences

### D1 — note bodies are unsanitised HTML, rendered raw, in three places

`RichTextEditor` emits an HTML string (`src/components/ui/rich-text-editor.tsx:23`),
`createNoteAction` stores it verbatim (`src/lib/note-actions.ts:61`), and two
surfaces render it with `dangerouslySetInnerHTML`
(`src/components/students/student-detail.tsx:328-331`,
`src/app/mentor/notes/page.tsx:119-122`). There is no sanitizer in the file, in
the action, or in the render — `grep -n "sanitize\|DOMPurify" src/components/ui/rich-text-editor.tsx`
returns nothing.

In v1 the blast radius is contained by who can write: only staff, and TipTap's
`StarterKit` produces safe markup from normal use. But the *stored value* is
attacker-controlled by anyone who can call the Server Action directly, and the
readers are the most privileged accounts in the product — a script in a note
body executes in an admin's or a SUPER user's session on a page that also
renders every other note about that student.

**Recommendation, and it must be settled before the schema is written:** React
Native has no `dangerouslySetInnerHTML`, so the port cannot reproduce the render
even if it wanted to. Two options:

1. **Store rich text as a structured document** (TipTap JSON) and render it with
   a whitelisted RN renderer. Correct, and a data-shape change on a shared
   database — the column is `String`, so it does not need a migration, but old
   rows are HTML and new rows would not be. Needs a read-time discriminator.
2. **Keep HTML on the wire, sanitise on write and on read, render through a
   whitelisting RN HTML component.** Cheaper, compatible with existing rows,
   and the sanitiser becomes a permanent dependency.

Option 2 is the pragmatic choice while v1 still writes to the same table.
Whichever is chosen, **sanitise on write as well as on read** — the existing
rows are already untrusted.

### D2 — a 140-character excerpt of a pastoral note is emailed to every season admin

R16 and R17. `createNoteAction` puts `body.slice(0, 140)` — raw HTML, possibly
cut mid-tag — into the notification row, and `createNotificationsBulk`
(`src/lib/notifications.ts:56-96`) hands it to `sendNotificationEmail`, which
interpolates it into an HTML email without escaping
(`src/lib/email.ts:145-150`). Confidential content about a named young person
therefore leaves the system to every season admin's mailbox, including admins
who have no other route to that note — a `MENTORS`-visibility note is unreadable
to an ADMIN in the app (R36) while its first 140 characters arrive in their inbox.

**This is the sharpest privacy defect in the domain and it needs a product
decision, not a code decision.**

**Recommendation:** the notification says *that* a follow-up was flagged and
links to it; it carries no excerpt. Title stays as-is (R15), body becomes a
fixed string, link stays. If an excerpt is genuinely wanted, it must be plain
text, and the recipient set must be intersected with who can actually read the
note (R36) — an admin who cannot open a `MENTORS` note should not receive its
first sentence by email.

### D3 — `visibility` does not mean what the UI says it means

R36 and R37. The composer's helper text reads "Who can read this note (in
addition to you and admins)" (`src/components/students/note-form.tsx:73`), while
`filterVisibleNotes` (`src/lib/students-query.ts:490-496`) grants admins nothing
beyond `ADMINS`-visibility notes. Every `LEADERS` note — the schema default
(`prisma/schema.prisma:581`) — and every note written from the mentor composer
(R12) is invisible to season admins, who are the people the follow-up flag
notifies (R14).

**This is a live contradiction between what staff were told when they wrote and
who can actually read.** Three coherent resolutions:

1. **Make it a ladder.** `LEADERS` means "leaders and above", `MENTORS` means "mentors and above", `ADMINS` means "admins and above". Matches the composer's copy and the ordinary intuition. **Changes who can read existing notes** — an admin gains visibility of every historic `LEADERS` note. That is a privacy expansion applied retroactively to records written under a different promise, so it needs an explicit decision by whoever owns the pastoral policy, not an engineer.
2. **Keep the equality and fix the copy.** No data change, no visibility change. The setting becomes "which staff group may read this", exactly as implemented.
3. **Replace the enum with an explicit audience set.** Most honest, needs a migration, therefore not available before cutover.

**Recommendation: option 2 now, and raise option 1 with the product owner as a
separate decision.** Do not port the misleading copy.

### D4 — v1 notes are, in practice, permanent and unauditable

`updateNoteAction` and `deleteNoteAction` exist, are author-gated (R23, R28),
and **have no UI callers anywhere** (R31). Delete is a hard delete with no
tombstone (R29). Update overwrites with no history and no validation (R25, R26).
`updatedAt` is written and never read (R26).

So today: a note, once written, cannot be corrected or removed through the app
by anyone — not the author, not an admin, not SUPER. That is arguably the right
default for a pastoral record and arguably an accident.

**Recommendation:**

1. **Ship edit and delete for the author** — the actions already exist and are
   correctly gated; the UI is the only missing half. A staff member who writes
   something in error currently has no remedy.
2. **Make delete soft.** Add `deletedAt` to `EngagementNote`. It is a migration,
   so it lands at cutover; until then, v2's delete either stays unavailable or
   is a hard delete matching v1. Do not ship a hard delete that v1's users never
   had access to and then add soft delete later — the notes destroyed in between
   are unrecoverable.
3. **Surface `updatedAt`** so a reader can tell an edited note from an original
   (§8 puts it in `noteSummarySchema`).
4. **Decide whether SUPER may delete.** v1 says no (R28). For a record about a
   young person, a subject-access or erasure request has no operator today.

### D5 — the note read has no gate below the page, and this domain is the worst place for that

Restated from §4 because it is the finding that most needs to survive into code
review. `loadStudentDetail` returns every note about a student to any caller
(R38); `filterVisibleNotes` is a pure function four pages each remember to call
(R32–R35); the student exclusion is the absence of a screen rather than a rule
(R40); and the engagement score has no gate at all (R64, R85).

Domain 4's D6 is the precedent: a leader-scoping rule that existed only as a
page's query argument was lost when the route was ported, and now ships in
`apps/backend` as a live defect. **The same shape exists here with a far worse
payload.** A leaked attendance row is an embarrassment; a leaked pastoral note
about a named young person is a safeguarding incident.

**Recommendation — three non-negotiables for the v2 implementation:**

1. The query function takes the viewer as a **required** argument and builds
   visibility into the `where`. There is no unfiltered variant, so there is
   nothing for a future caller to forget.
2. `role === "STUDENT"` is refused at the route, explicitly, with a test that
   asserts a student requesting their own notes gets `403` — not an empty array,
   which would be indistinguishable from "no notes exist".
3. Notes never ride inside another domain's payload. `GET /students/:id` does
   not carry them.

### D6 — should a student ever read a note about themselves?

v1's answer is no, delivered by accident (R40). The `forStudentSelfView` switch
suggests someone once intended a student-facing student-detail page and it was
never built.

This is a policy question with a legal edge: pastoral records about identifiable
young people are subject-access material in most jurisdictions, and "the app
does not show it" is not the same as "the record does not exist". **That is a
question for the organisation, not for this migration** — but v2 must implement
one answer deliberately.

**Recommendation:** implement **refuse** (D5 item 2), and record that a
subject-access route exists outside the app. Do not implement a partial
student-facing view; "students see only notes tagged X" is the kind of rule that
drifts.

### D7 — "at risk" is defined three times and the definitions disagree

- `computeAtRiskStudents`: absence minutes over the season budget (R71) — **uncalled** (R72).
- Mentor dashboard: `attendancePct < 60` **or** `submissionPct < 60` (R73).
- Reports: composite `score < 60` (R74), on top of a four-band scale (R75).

A student at 55% attendance and 95% submissions is at risk on the dashboard
(one component below 60) and "Medium" on reports (composite 75). The dashboard's
own empty-state copy describes the reports definition (R76).

**Recommendation:** one definition, in `packages/shared`, consumed by both
screens — and it should be the **component-wise** one (R73), because the
composite hides exactly the case pastoral staff care about: a student who has
stopped turning up but is still submitting. Delete the banding or derive it from
the same predicate. Whichever is chosen, the threshold belongs in a named
constant, not as `60` in two files.

### D8 — engagement's attendance and the budget's attendance disagree, and only one inherits domain 4's defect

`engagement.attendancePct` counts `PRESENT|LATE` rows over past sessions (R54)
and **never reads `lateMinutes`**. `computeAttendanceBudget` charges the raw
`lateMinutes` value (R65), which domain 4's D1/D2 establishes is measured from
`checkInOpenAt` — the moment an admin pressed a button — rather than from
`session.startsAt`.

So the two attendance numbers v1 shows have different failure modes:

- The **score's** attendance is insensitive to when check-in opened. It is wrong for a different reason: it divides by every past session in the season regardless of when the student enrolled (R55) and returns 0% for a season that has not started (R56).
- The **budget's** attendance is a function of staff behaviour.

And they are rendered side by side under the same word: the staff card shows
`attendancePct` (`src/components/students/student-detail.tsx:113-117`) while the
student's own screens show `100 − budgetPct` labelled "Attendance"
(R68, R87).

**Recommendation:** two decisions, both before code.

1. **Fix R55.** Scope the denominator to sessions at or after the student's
   enrollment date — `SeasonEnrollment.enrolledAt` already exists
   (`src/lib/students-query.ts:308`). A mid-season joiner scored against
   sessions that ran before they enrolled is straightforwardly wrong and is
   currently the largest source of spurious at-risk flags.
2. **Stop calling two different numbers "Attendance".** The budget figure is
   *absence budget remaining*; label it that, as domain 4's own student
   attendance page already does in words (domain 4 R96). Whether the student
   should also see `attendancePct` is D9.

Domain 4's D1 fix (measure lateness from `session.startsAt`) changes every
budget number and therefore every figure on the student's screens. It does
**not** change the engagement score. Sequence D8 after domain 4's D1 is decided.

### D9 — should a student see their own engagement score?

v1 computes it for them and throws it away (R86). The student sees only their
submission counters and the mislabelled budget figure (R87). Nothing in the code
suggests the omission was deliberate — the function is called, the fields are
discarded.

**Recommendation:** show the two components (`attendancePct`, `submissionPct`)
and **not** the composite. The components are facts the student can act on; the
composite is a staff triage number whose thresholds (D7) exist to sort a cohort,
and showing a young person a single "engagement: 47%" figure is a product
decision nobody has made. Fix R55 first or the number shown to a mid-season
joiner is indefensible.

### D10 — the score is computed on read and does not survive contact with React Query

R78–R82, and §5. Four queries per student per render (R79), 4N concurrently on
the mentor dashboard (R80), 4N sequentially on reports (R81), plus
`loadStudentDetail`'s own per-season loop on the detail screen (R84). Under
React Query's refetch-on-mount / focus / reconnect defaults, every one of those
is re-issued each time the app returns to the foreground.

**Recommendation:** the cohort endpoint and the two-query aggregation described
in §5. `computeAtRiskStudents` (`src/lib/engagement.ts:203-212`) already
demonstrates the `groupBy` shape for the absence half — copy it. Delete
`computeEngagementBulk` rather than porting it (R82). Do not add a stored score
before cutover: it needs a column, and the shared-database freeze forbids the
migration.

### D11 — `followUpFlagged` has no queue, so the flag is a fire-and-forget notification

R22. Nothing in v1 queries on `followUpFlagged`; it decides whether to notify at
create time (R13) and afterwards renders a badge. An admin who dismisses or
misses the notification has no list of outstanding follow-ups, and the flag
cannot be cleared (R24) — so even if a queue existed, every note ever flagged
would stay in it forever.

**Recommendation:** if follow-up is a real workflow, it needs a resolution state
(`resolvedAt`, `resolvedById`) and a queue screen — that is a schema migration
and therefore a cutover item. If it is not a real workflow, keep the flag as a
notification trigger only and stop rendering it as a badge that implies
something is pending.

### D12 — `seasonId` is a stale snapshot and `activeSeasonId` is the wrong source for a write gate

R5 and R47/R48. A note's season is fixed to the student's active season at write
time and never revisited. Meanwhile `canWriteNote`'s ADMIN branch reads the same
`activeSeasonId` (`src/lib/auth/permissions.ts:411-416`), so when a student moves
to a new season, an admin of the *old* season instantly loses the ability to
write about a student they still administer historically — and gains nothing —
while `canViewStudent` (which checks `SeasonEnrollment`, `:366-373`) still lets
them open the page.

**Recommendation:** resolve the write gate through `SeasonEnrollment` for
consistency with `canViewStudent`, and require the caller to name the season
explicitly when writing a note rather than inferring it. Both are behaviour
changes; both are small; both remove a class of "why can't I write a note about
this student I can clearly see" support question.

### D13 — the mentor composer lists every student in the system, including alumni

R45. `src/app/mentor/notes/page.tsx:27-31` queries `role: "STUDENT",
deletedAt: null` directly, bypassing `getVisibleStudents`
(`src/lib/auth/permissions.ts:198-248`) and omitting the `graduationYear: null`
filter that `listStudentsForScope` applies (`src/lib/students-query.ts:28`). For
a MENTOR the scope is correct by accident — `canReadAllStudents` is true — but
the query will be wrong the moment `/me/notes` is opened to ADMIN or LEADER
(§7), and it already lists graduated students in a picker whose other surfaces
exclude them.

**Recommendation:** the v2 composer's picker calls the domain-6 visible-students
endpoint. Do not port the direct query.

### D14 — `/notes` is in the tab bar for MENTOR only

`packages/shared/src/navigation.ts:139` gives MENTOR a `/notes` tab; no other
role has one, matching v1 where `/mentor/notes` is the only authored-notes list
(R44). If §7's `GET /me/notes` is opened to ADMIN, LEADER and SUPER — and it
should be, since all three can author (R46–R49) and none can list what they
wrote — the navigation must be extended in the same change, or the route is
reachable only by typing a URL that mobile users cannot type.

### D15 — no rate limit and no audit trail on note reads

v1 has neither, and in a server-rendered app the question barely arises. Once
notes are an API, a compromised staff token can enumerate `GET
/students/:id/notes` across every student id and exfiltrate the entire pastoral
record set at machine speed. Nothing in v1 or in `apps/backend` would record it
— `apps/backend` has rate limiting only on the auth routes (`CLAUDE.md`,
"Login-path codes").

**Recommendation:** treat note reads as auditable. At minimum log
`(viewerId, studentUserId, noteCount, timestamp)` for every notes read, and put
the notes routes behind the same limiter the auth routes use. This is the one
place in the migration where "who looked at what" is a question someone may one
day have to answer.
