# Domain 06 — Students & enrollment

> Status: draft · Phase: 3 (admin core) · v1 API status: **none**

This domain owns the *person*: the `User` row with role `STUDENT`, its
`StudentProfile`, the `SeasonEnrollment` rows that record which seasons that
person has been in, and the three list surfaces those rows drive — active
students, alumni, dropped students. It is the largest greenfield API design in
the migration: not one `/api/v1` endpoint exists, and `students-query.ts` (498
lines) is the biggest query file in v1.

Every citation is a path under `D:\Projects\JPC\jpc-space` unless prefixed with
`apps/` or `packages/`, which are `D:\Projects\JPC\space-v2`.

**It is also the only domain whose payload is personal data end to end** —
name, email, phone, date of birth, spiritual background, free-text internal
notes, and uploaded documents. Section 4 is therefore written field by field
rather than operation by operation, because v1 has exactly **one** detail query
serving four roles and it returns the identical object to all of them
(`src/lib/students-query.ts:273-483`). Four server-rendered pages currently
decide what a role sees by *not rendering* it. An HTTP endpoint cannot.

**Boundary with domain 5 (Groups).** Domain 5 owns `Group`, `GroupStudent`,
`GroupLeader`, group CRUD, and the roster-assignment grid. This domain owns
`SeasonEnrollment` — but **`group-actions.ts` writes `SeasonEnrollment` rows
harder than anything in this domain does** (R38–R41), so the enrollment
lifecycle cannot be specified without citing it. Rules R38–R41 are *stated*
here because they are enrollment-state rules; the code that performs them is
domain 5's to change.

**Boundary with domain 9 (Notes).** `EngagementNote` rows are loaded by
`loadStudentDetail` and filtered by `filterVisibleNotes`
(`src/lib/students-query.ts:387-403,486-498`). Both live in this domain's file.
The note *model*, its authoring, and its visibility semantics belong to domain
9; this spec states only what the student payload must and must not carry
(R60–R63, §7).

**Boundary with domain 11 (Invites & users).** Creating a student creates a
`User` (R14). Password, invite and role promotion are domain 11's. What this
domain fixes is that v1's create writes a **hard-coded shared password** and
sends nothing (R16–R17).

---

## 1. v1 source

| File | Holds |
|---|---|
| `src/lib/students-query.ts` | All four reads: `listStudentsForScope`, `listAlumni`, `listDroppedStudents`, `loadStudentDetail`, plus the post-query `filterVisibleNotes` |
| `src/lib/student-actions.ts` | `createStudentAction`, `updateStudentProfileAction`, `softDeleteStudentAction`, `uploadStudentPhotoAction`, `uploadStudentDocumentAction`, `deleteStudentDocumentAction`; the server-side profile Zod schema |
| `src/lib/enrollment-actions.ts` | `graduateStudentAction` and `dropEnrollmentAction` — the only two enrollment *status* transitions in the repo |
| `src/lib/auth/permissions.ts:359-403` | `canViewStudent`, `canEditStudent` — the two row-scoped student gates |
| `src/lib/auth/permissions.ts:405-427` | `canWriteNote` (domain 9's gate, consumed by all four detail pages) |
| `src/lib/auth/permissions.ts:198-248` | `getVisibleStudents` — a *fifth*, near-duplicate student-scoping implementation used by other domains' pickers |
| `src/lib/auth/permissions.ts:255-267` | `getStudentSeasonAccess` — declared, never called anywhere (R80) |
| `src/lib/rbac.ts:20-22,53-55` | `isAlumnus` (the alumnus definition) and `canReadAllStudents` |
| `src/lib/engagement.ts:21-43` | `computeEngagementForStudent` — the engagement card on every detail page |
| `src/lib/group-actions.ts:55-76,134-151,168-176,225-244` | The four places `SeasonEnrollment` rows are created, deleted, or re-parented outside this domain |
| `src/lib/groups-query.ts:143-163` | `listSeasonRoster` — the season roster, driven by `activeSeasonId`, **not** by enrollment (R11) |
| `src/lib/student-import.ts:231-292` | The CSV path; the only code that creates an enrollment with an explicit `status` (R37) |
| `src/components/students/students-list.tsx` | The active-student table: client-side season/group filter, four sort keys, sort direction |
| `src/components/students/alumni-list.tsx` | Alumni table (3 columns) |
| `src/components/students/dropped-students-list.tsx` | Dropped table (4 columns, incl. free-text drop reason) |
| `src/components/students/student-detail.tsx` | The one detail component all four roles render; the six tabs and the `showDocumentsTab` / `canEdit` / `canGraduate` props |
| `src/components/students/student-form.tsx` | Create/edit form; client mirror of the server schema; the `isSelf` field hiding |
| `src/components/students/graduate-student-button.tsx` | Graduation modal; the client-side year bound |
| `src/components/students/drop-enrollment-button.tsx` | Drop modal; the reason field |
| `src/components/students/season-history.tsx` | Shared history card (owned by domain 2) |
| `src/app/super/students/page.tsx` | SUPER active list + search box |
| `src/app/super/students/new/page.tsx` | Create form host (`requireRole(["SUPER","ADMIN"])`) |
| `src/app/super/students/[id]/page.tsx` | SUPER detail — the only page passing `canGraduate` |
| `src/app/super/students/[id]/edit/page.tsx` | Edit form host (SUPER only) |
| `src/app/super/students/alumni/page.tsx`, `dropped/page.tsx` | SUPER alumni / dropped lists |
| `src/app/admin/students/page.tsx` | ADMIN active list |
| `src/app/admin/students/[id]/page.tsx` | ADMIN detail |
| `src/app/admin/students/alumni/page.tsx`, `dropped/page.tsx` | ADMIN alumni / dropped lists |
| `src/app/mentor/students/page.tsx` | MENTOR active list (labelled "read-only") |
| `src/app/mentor/students/[id]/page.tsx` | MENTOR detail (`showDocumentsTab={false}`) |
| `src/app/leader/students/[id]/page.tsx` | LEADER detail — **there is no leader student *list* page** (R28) |
| `src/app/student/profile/page.tsx` | The student's own profile, editing through the same form and the same action |
| `src/app/alumni/profile/page.tsx` | The alumnus's read-only profile card |
| `apps/backend/prisma/schema.prisma` | Verbatim copy of v1's; all model citations below are to this file |

v1 has **no test files**; the source above is the entire statement of intent.

---

## 2. Data model

### `User` (`prisma/schema.prisma:103-148`)

| Field | Meaning / rule dependency |
|---|---|
| `email` | `@unique`. Login identity. Editable by the student themselves (R22). |
| `name` | **`String`, NOT nullable** (`:106`) — yet every type in this domain declares it `string \| null` and every screen renders `name ?? email` (`src/lib/students-query.ts:10,101,113,204`; `src/components/students/student-detail.tsx:34-40`). See §10 D9. |
| `role` | `UserRole`. `STUDENT` is the identity for this domain. Graduation does **not** change it (R44). |
| `graduationYear` | Nullable `Int`. **This is the alumnus marker** (`:109-111`, `src/lib/rbac.ts:20-22`). Non-null ⇒ alumnus ⇒ removed from the active list (R24) and added to the alumni list (R29). |
| `avatarPath` | Self-service avatar (domain 11's `updateAvatarAction`), distinct from `StudentProfile.photoPath`. Both exist; see R70. |
| `deletedAt` | Soft delete. Filtered by the active list (R23), the alumni list (R29) and the detail read (R47) — **not** by the dropped list (R33). |
| `passwordHash` | Nullable. `null` for CSV-imported students (`src/lib/student-import.ts:260`); a bcrypt hash of a fixed literal for form-created ones (R16). |

### `StudentProfile` (`:214-236`)

| Field | Meaning / rule dependency |
|---|---|
| `userId` | `@unique`, `onDelete: Cascade`. One profile per user. |
| `activeSeasonId` | Nullable FK, relation `"StudentActiveSeason"` (`:220-221`). **The operational "which season is this student in" pointer** — it drives the season roster, group assignment eligibility, `canEditStudent`, `canWriteNote` and the engagement card. It is *not* the enrollment. See R9–R12. |
| `university`, `year` | Free text. `year` is a label ("3rd · Engineering"), not a number (`src/components/students/student-form.tsx:173`). |
| `phone`, `dateOfBirth` | Personal data. Delivered to LEADER and MENTOR today (R57). |
| `spiritualBackground` | Free text ≤4000. Religious-belief data — the most sensitive field in the schema. Delivered to every staff role (R57). |
| `gifts` | Free text ≤2000. |
| `notes` | **Staff-only internal notes.** The form labels it "Visible to leaders, mentors, and admins. The student does not see these." (`src/components/students/student-form.tsx:221`). Distinct from `EngagementNote`. |
| `photoPath` | Written only by `uploadStudentPhotoAction`, which **has no caller** (R71). Read by the list query (`src/lib/students-query.ts:76,93`) but rendered nowhere — the list renders `avatarPath` instead (`src/components/students/students-list.tsx:108`). |
| `deletedAt` | Soft delete, written by `softDeleteStudentAction` — which also has no caller (R71). |

### `SeasonEnrollment` (`:339-357`)

Schema comment calls it "Append-only history: which students were in which
seasons (and groups)" (`:338`). It is **not** append-only in practice — see
R38–R39.

| Field | Meaning / rule dependency |
|---|---|
| `studentUserId` + `seasonId` | `@@unique([studentUserId, seasonId])` (`:355`). One enrollment per student per season, ever. |
| `groupId` | Nullable FK, `onDelete: SetNull`. The *historic* group for that season. Written by group assignment (`src/lib/group-actions.ts:73,148,238`) and read by `loadStudentDetail` (`src/lib/students-query.ts:317,450`) and by `loadSeasonHistory` (domain 2). Contrast domain 7's R31, which found the *assignment-visibility* path never consults it. Both are true: **this domain reads it, the targeting domains do not.** |
| `status` | `EnrollmentStatus` — `ACTIVE \| COMPLETED \| WITHDRAWN` (`:38-42`). `@default(ACTIVE)`. See R34–R43. |
| `enrolledAt` | `@default(now())`. Ordering key for the detail's Seasons tab (R49) and for domain 2's history. Reset by group reassignment (R39). |
| `completedAt` | Written only by graduation (`src/lib/enrollment-actions.ts:60`). Read nowhere. |
| `droppedAt` | Written only by drop (`:109`). Ordering key for the dropped list; **read with a non-null assertion** (`src/lib/students-query.ts:196`) — see R36. |
| `dropReason` | Free text ≤500. Rendered verbatim in the dropped list (`src/components/students/dropped-students-list.tsx:50`). Personal data. |
| `seasonId` relation | `onDelete: Restrict` (`:344`) — a season with enrollments cannot be hard-deleted. |
| `studentUserId` relation | `onDelete: Restrict` (`:342`) — a student with enrollments cannot be hard-deleted either. Soft delete is the only delete. |

### `GroupStudent` (`:327-336`)

`studentUserId` is `@unique` (`:330`) — **one group globally, not per season**.
Domain 5 owns this rule; this domain only consumes it, at
`src/lib/students-query.ts:80-82,299-302`, where the student's group is read
with no season filter at all (R51).

### `StudentDocument` (`:625-638`)

`studentUserId` (`Cascade`), `uploadedById` (`SetNull`), `originalName`,
`storagePath`, `mimeType`, `sizeBytes`, `uploadedAt`. Hard-deleted, not soft
(R74). No `deletedAt`.

### Enums

`EnrollmentStatus` (`:38-42`) and `UserRole` (`:23-29`). `NoteVisibility`
(`:57-61`) is read by `filterVisibleNotes` but owned by domain 9.

### Nullable-in-schema, treated-as-required-in-code (and the reverse)

- `User.name` is **non-null in the schema and nullable in every type here** — the reverse of the usual defect. `packages/shared/src/auth.ts:19` already models it as `z.string()` (correct); `packages/shared/src/group.ts:15` models it as `string | null` (incorrect). Pick one in v2 — §10 D9.
- `SeasonEnrollment.droppedAt` is nullable but asserted non-null at `src/lib/students-query.ts:196`. The query filters `status: "WITHDRAWN"` and only `dropEnrollmentAction` sets that status *together with* `droppedAt`, so the assertion holds — **unless** a row reaches `WITHDRAWN` any other way. Nothing does today; a v2 bulk-withdraw would break it silently.
- `StudentProfile` is optional on `User` (`:118`) and every read uses `?.` — but `updateStudentProfileAction` calls `tx.studentProfile.update` unconditionally (`src/lib/student-actions.ts:121`), which throws for a `STUDENT` user with no profile row. Import and create both make one, so no such row exists today.

---

## 3. Business rules

### The three identities: `User`, `StudentProfile.activeSeasonId`, `SeasonEnrollment`

- **R1.** The identity of a student is a `User` row with `role: "STUDENT"`; every read in this domain filters on it — `src/lib/students-query.ts:26,122,278`.
- **R2.** A student's per-season fact is a `SeasonEnrollment` row, unique on `(studentUserId, seasonId)` — `prisma/schema.prisma:355`.
- **R3.** A student's current group is a `GroupStudent` row, unique on `studentUserId` alone — one group globally across all seasons — `prisma/schema.prisma:330`.
- **R4.** *(implicit)* The detail page's "current group" badge is read with **no season filter**, so it shows whatever group the student is in now even when the viewer is looking at a past season's row — `src/lib/students-query.ts:299-302,437-439`.
- **R5.** `SeasonEnrollment.groupId` records the group the student was in *for that season* and **is** read by this domain — it is the `groupName` on each row of the detail's Seasons tab — `src/lib/students-query.ts:317,450`. (Domain 7's R31 correctly reports that *assignment targeting* ignores it. The two statements do not conflict.)
- **R6.** Consequently a student's Seasons tab can show group "Alpha" for season 2025 while the header badge shows group "Beta", and after a group reassignment the historic value is overwritten — `src/lib/group-actions.ts:236-240` upserts `groupId` onto the existing enrollment row.
- **R7.** A student may hold at most one enrollment per season but any number across seasons; the detail lists all of them regardless of status — `src/lib/students-query.ts:306-308`.
- **R8.** Nothing in v1 ends a season's enrollments when the season ends. An enrollment stays `ACTIVE` until a human graduates or drops the student — see R34.

### `activeSeasonId` versus enrollment — the split definition of "in this season"

- **R9.** `StudentProfile.activeSeasonId` is a **separate, independently written** pointer. Setting it does not create an enrollment and creating an enrollment does not set it — `src/lib/student-actions.ts:79` writes only the profile field; `src/lib/group-actions.ts:69-75` writes only enrollments.
- **R10.** *(implicit)* The **student list** for an ADMIN is scoped by `SeasonEnrollment`, so a student with `activeSeasonId` set but no enrollment row is invisible to their own season's admin — `src/lib/students-query.ts:44-49`.
- **R11.** *(implicit)* The **season roster** (the group-assignment grid) is scoped by `activeSeasonId`, so a student with an enrollment but no `activeSeasonId` cannot be assigned to a group — `src/lib/groups-query.ts:143-148`.
- **R12.** *(implicit)* Group assignment silently skips any student whose `activeSeasonId` is not the target season — `src/lib/group-actions.ts:215-223,228`. No error is returned; the row is dropped from the batch.
- **R13.** The two definitions disagree in both directions and nothing reconciles them. A student created through the form (R14) has `activeSeasonId` and **no** enrollment; a student added to a group has an enrollment and **no** `activeSeasonId` unless one was already set — `src/lib/student-actions.ts:71-91` versus `src/lib/group-actions.ts:66-75`.

### Student creation

- **R14.** Creating a student creates a `User` **and** a nested `StudentProfile` in one Prisma call — `src/lib/student-actions.ts:71-91`. Role is forced to `"STUDENT"` (`:75`); it is not an input.
- **R15.** **Creation does not create a `SeasonEnrollment` row** — the create `data` object has no enrollment write (`:71-91`), despite the page telling the operator "Create the user, profile, and enrollment" (`src/app/super/students/new/page.tsx:25`). See §10 D1.
- **R16.** The new user's password is the **hard-coded literal `ChangeMe123!`**, bcrypt-hashed at cost 10, identical for every student ever created this way — `src/lib/student-actions.ts:58-60`.
- **R17.** That password is then written to the server log in plaintext alongside the student's email — `src/lib/student-actions.ts:93-95`. No invite is issued, no email is sent, no reset is forced.
- **R18.** Create rejects a duplicate email with a field-level error rather than throwing — `src/lib/student-actions.ts:62-69`. The check is a separate `findUnique` from the `create`, with no transaction, so a concurrent create raises an uncaught Prisma `P2002`.
- **R19.** The uniqueness check has **no `deletedAt: null` filter**, so a soft-deleted student permanently reserves their email address — `src/lib/student-actions.ts:62`.
- **R20.** Field bounds: `name` 2–120, `email` must parse as an email, `university` ≤160, `year` ≤40, `phone` ≤60, `spiritualBackground` ≤4000, `gifts` ≤2000, `notes` ≤4000, `dateOfBirth` coerced date, `activeSeasonId` optional int — `src/lib/student-actions.ts:23-34`.
- **R21.** *(implicit)* The client form declares **none** of those maxima and no date bound — `src/components/students/student-form.tsx:21-32`. Every over-length field fails server-side only, and `phone`/`dateOfBirth` have no format validation on either side.

### Profile update

- **R22.** Update writes `name` and `email` on `User` and the eight profile fields on `StudentProfile`, inside one `$transaction` — `src/lib/student-actions.ts:116-138`. **`email` is writable by the student themselves**, changing their own login identity (R25). No verification step exists.
- **R23.** `notes` and `activeSeasonId` are written **only when the actor is not the subject** — `src/lib/student-actions.ts:113-114,130-135`. This is an explicit server-side check on `user.userId === studentUserId`, not a UI convention, and it is the one privacy rule in this domain that a port cannot lose by accident.
- **R24.** The `isSelf` guard is field-level, not request-level: a student who posts `notes` gets a silent no-op, not a rejection — `src/lib/student-actions.ts:130-135`.
- **R25.** The student's own profile screen renders the same form with `isSelf`, hiding the "Admin only" fieldset client-side — `src/app/student/profile/page.tsx:117-135`, `src/components/students/student-form.tsx:198-227`. The server guard (R23) is what actually enforces it.
- **R26.** Every optional string is coerced `"" → null` on the way in — `src/components/students/student-form.tsx:104-111` — and again `undefined → null` server-side — `src/lib/student-actions.ts:124-135`. A cleared field is stored `null`, never `""`.
- **R27.** Update performs no existence check: a non-existent `studentUserId` that passes `canEditStudent` throws a raw Prisma error rather than returning `{ ok: false }` — `src/lib/student-actions.ts:117-137`.

### The active-student list

- **R28.** Three roles have an active-student **list** page — SUPER, ADMIN, MENTOR (`src/app/super/students/page.tsx:20`, `src/app/admin/students/page.tsx:19`, `src/app/mentor/students/page.tsx:18`). **LEADER has only a detail page** (`src/app/leader/students/[id]/page.tsx`); there is no `src/app/leader/students/page.tsx`. All three list pages call the **same** function with the same arguments — `listStudentsForScope(user, q)`.
- **R29.** *(implicit)* The list's base filter is `role: STUDENT` **and** `deletedAt: null` **and** `graduationYear: null` — alumni are excluded by design — `src/lib/students-query.ts:26-28`.
- **R30.** *(implicit)* Scope is applied as an `id: { in: [...] }` narrowing computed per role, **not** as a gate: SUPER and MENTOR skip it entirely (`canReadAllStudents`), ADMIN gets the distinct `studentUserId`s of every enrollment in `token.seasonAdminIds` **regardless of enrollment status**, LEADER gets the `studentUserId`s of every `GroupStudent` row in `token.groupLeaderIds`, every other role gets `[]` — `src/lib/students-query.ts:41-61` with `src/lib/rbac.ts:53-55`.
- **R31.** *(implicit)* Because the ADMIN scope ignores `EnrollmentStatus`, an admin sees students whose enrollment in their season is `WITHDRAWN` or `COMPLETED` — `src/lib/students-query.ts:44-46`. The list is "ever enrolled in one of my seasons", not "currently in one of my seasons".
- **R32.** *(implicit)* SUPER's and MENTOR's list is every non-deleted, non-graduated `STUDENT` user in the database — including students who have never been enrolled in anything — `src/lib/students-query.ts:42,63-84`. The same screen therefore means something different per role.
- **R33.** Search matches `name`, `email` or `studentProfile.university`, case-insensitive `contains`, OR'd — `src/lib/students-query.ts:29-37`. It is applied **before** the scope narrowing and combined with it by `AND`, so it cannot widen scope.
- **R34.** The list is ordered `name asc` and **hard-capped at 200 rows with no pagination and no total count** — `src/lib/students-query.ts:65-66`. The header then reports `rows.length` as if it were the population (`src/app/super/students/page.tsx:35`), so a 250-student database reads "200 students".
- **R35.** *(implicit)* Season and group filtering, and all four sort keys, are **client-side over the fetched 200** — `src/components/students/students-list.tsx:64-99`. The filter dropdowns are built from the rows present, so a season with no student in the first 200 is not offerable.
- **R36.** Each row carries `id, name, email, avatarPath, university, year, photoPath, activeSeasonTitle, groupName` — `src/lib/students-query.ts:86-96`. `photoPath` is selected and returned but rendered nowhere (R70).
- **R37.** *(implicit)* The list page then resolves one storage URL **per row**, serially awaited via `Promise.all` — up to 200 storage calls per page render — `src/app/super/students/page.tsx:24-29`, duplicated at `src/app/admin/students/page.tsx:23-28` and `src/app/mentor/students/page.tsx:22-27`.

### The alumni list

- **R38.** *(implicit)* Alumni are `role: STUDENT`, `deletedAt: null`, `graduationYear: { not: null }` — `src/lib/students-query.ts:121-125`. The marker is the year, not the role.
- **R39.** Scope: SUPER and MENTOR see all; ADMIN sees alumni who **ever** held an enrollment in one of their seasons; every other role gets `[]` — `src/lib/students-query.ts:127-141`. Unlike the active list, ADMIN's empty-scope case returns early (`:129`).
- **R40.** Ordered `graduationYear desc, name asc`; row shape is `studentUserId, name, email, graduationYear, university` — `src/lib/students-query.ts:143-161`.
- **R41.** *(implicit)* There is **no cap and no search** on the alumni list — `src/lib/students-query.ts:143-153`. It grows without bound.
- **R42.** *(implicit)* `graduationYear` is asserted non-null at `src/lib/students-query.ts:159`; the `not: null` filter is what makes it safe.

### The dropped list

- **R43.** The dropped list is a list of **enrollments**, not of students: its row key is `enrollmentId` — `src/lib/students-query.ts:176-198`, `src/components/students/dropped-students-list.tsx:61`. A student dropped from three seasons appears three times.
- **R44.** *(implicit)* Its only filter is `status: "WITHDRAWN"`. It does **not** filter `studentUser.deletedAt: null` and does **not** filter `role: "STUDENT"` — `src/lib/students-query.ts:166`. A soft-deleted student stays on the dropped list forever, with their name and email, and clicking through 404s because the detail read *does* filter `deletedAt` (R47).
- **R45.** Scope: SUPER and MENTOR see every withdrawn enrollment in the database; ADMIN is narrowed to `seasonId in seasonAdminIds`; every other role gets `[]` — `src/lib/students-query.ts:167-174`.
- **R46.** Ordered `droppedAt desc`; row shape is `enrollmentId, studentUserId, name, email, seasonId, seasonProgram, seasonYear, droppedAt, dropReason` — `src/lib/students-query.ts:176-198`. The free-text `dropReason` is rendered in full in the table (`src/components/students/dropped-students-list.tsx:48-53`).

### The enrollment state machine

`EnrollmentStatus` = `ACTIVE | COMPLETED | WITHDRAWN` (`prisma/schema.prisma:38-42`).

- **R47.** **Entry is always `ACTIVE`.** Every creation path either relies on the schema default (`src/lib/group-actions.ts:69-75,144-150,236-240`) or writes it explicitly (`src/lib/student-import.ts:269`). Nothing creates a `COMPLETED` or `WITHDRAWN` enrollment directly.
- **R48.** **`ACTIVE → COMPLETED`** happens in exactly one place: `graduateStudentAction`, and only for the enrollment matching the student's `activeSeasonId` — `src/lib/enrollment-actions.ts:56-61`. A student enrolled in three seasons graduates with two of them left `ACTIVE`.
- **R49.** **`ACTIVE → WITHDRAWN`** happens in exactly one place: `dropEnrollmentAction`, which refuses any source status other than `ACTIVE` with a returned error, not a throw — `src/lib/enrollment-actions.ts:96-98`.
- **R50.** **There is no transition out of `COMPLETED` or `WITHDRAWN`.** No un-drop, no re-activate, no "re-enroll for next season" action exists in the repo — the only `seasonEnrollment.update`/`updateMany` call sites are `src/lib/enrollment-actions.ts:58,105` and `src/lib/group-actions.ts:171`.
- **R51.** **…except by destruction.** Adding a student to a group `deleteMany`s their enrollment for that season and `createMany`s a fresh one — `src/lib/group-actions.ts:66-75` (group create) and `:141-150` (group update). This resets `status` to the `ACTIVE` default and discards `enrolledAt`, `completedAt`, `droppedAt`, `dropReason` and the row's `id`. **A withdrawn student silently becomes active again, their drop reason is destroyed, and they vanish from the dropped list.** The third path, `assignStudentsToGroupsAction`, correctly `upsert`s and preserves status — `src/lib/group-actions.ts:236-240`. See §10 D2.
- **R52.** Deleting a group nulls `groupId` on that season's enrollments but leaves `status` alone — `src/lib/group-actions.ts:171-174`. This is the only enrollment write that is correctly non-destructive.
- **R53.** *(implicit)* Nothing consults enrollment `status` when deciding whether a student may act. `canAccessSeason`'s student branch matches **any** enrollment row (`src/lib/auth/permissions.ts:63-67`), so a `WITHDRAWN` student keeps season access indefinitely. That is domain 2's gate; recorded here because this domain owns the status that ought to feed it.
- **R54.** `completedAt` and `droppedAt` are written but `completedAt` is read nowhere in the repo; `droppedAt` is read only as the dropped list's sort key — `src/lib/enrollment-actions.ts:60,109`, `src/lib/students-query.ts:178,196`.

### Graduation and alumni status

- **R55.** Graduation is SUPER-only — `src/lib/enrollment-actions.ts:33`. It is the only action in this domain gated on `isSuper` alone.
- **R56.** Graduation writes `User.graduationYear`, closes the `ACTIVE` enrollment for `activeSeasonId` as `COMPLETED` with `completedAt`, and clears `activeSeasonId` — all in one `$transaction` — `src/lib/enrollment-actions.ts:50-67`.
- **R57.** **Graduation does not change `User.role`.** The alumnus remains `STUDENT`; `graduationYear` is the entire marker — `src/lib/enrollment-actions.ts:21-27` (documented intent), `src/lib/rbac.ts:20-22` (`isAlumnus`), `packages/shared/src/navigation.ts:175-179` (`navFor`). This is why `ALUMNI` is a nav shape and not a `UserRole`, and why `ALL_NAV_HREFS` must be built through `hrefUnion`, not `navByRole` (`packages/shared/src/navigation.ts:192-200`).
- **R58.** `graduationYear` is validated as an integer between `1990` and the current year — `src/lib/enrollment-actions.ts:15-19`. `CURRENT_YEAR` is captured **at module load**, so a long-lived process rejects the new year until it restarts (`:15`).
- **R59.** The client repeats the same bound with its own hand-written check and defaults the input to the current year — `src/components/students/graduate-student-button.tsx:28,71-73`.
- **R60.** *(implicit)* When the student has no `activeSeasonId`, graduation writes only `graduationYear` and touches no enrollment — `src/lib/enrollment-actions.ts:56-66`. Their still-`ACTIVE` enrollments stay `ACTIVE`.
- **R61.** Graduation is not reversible. Nothing in the repo clears `graduationYear`.
- **R62.** *(implicit)* Graduating removes the student from the active list (R29) and adds them to the alumni list (R38) with no other write — the two lists are the same table filtered on the same column.
- **R63.** The Graduate control renders only when `canGraduate` is passed **and** `graduationYear == null` — `src/components/students/student-detail.tsx:88-93`. Only the SUPER detail page passes it (`src/app/super/students/[id]/page.tsx:40`).

### Dropping

- **R64.** Drop is gated on `isAdminOfSeason(user, enrollment.seasonId)` — the *enrollment's* season, resolved by a database read before the check — `src/lib/enrollment-actions.ts:90-95`. SUPER passes through `isAdminOfSeason`'s first clause (`src/lib/rbac.ts:28-30`).
- **R65.** The gate runs **after** the enrollment lookup, so a caller learns whether an arbitrary enrollment id exists before being refused — `src/lib/enrollment-actions.ts:90-95`.
- **R66.** `reason` is optional, ≤500 chars, and `""` is stored as `null` — `src/lib/enrollment-actions.ts:75-77,110`.
- **R67.** Drop writes `status`, `droppedAt` and `dropReason` in a single update. It does **not** clear `activeSeasonId`, does **not** remove the `GroupStudent` row, and does **not** notify anyone — `src/lib/enrollment-actions.ts:105-112`. A dropped student therefore still appears on the season roster (R11) and in their group.
- **R68.** *(implicit)* The Drop control renders for any enrollment row when `canEdit` is true and that row is `ACTIVE` — `src/components/students/student-detail.tsx:192-194`. `canEdit` is `canEditStudent`, which tests only the student's **active** season (`src/lib/auth/permissions.ts:394-401`), so an admin is shown Drop buttons for seasons they do not administer. The action correctly refuses (R64), so this is a broken button rather than a leak — but it proves the UI and the action disagree about scope.

### The detail read

- **R69.** `loadStudentDetail(studentUserId, options)` resolves the student with `role: "STUDENT", deletedAt: null` and calls Next's `notFound()` (404) when it misses — `src/lib/students-query.ts:277-304`.
- **R70.** *(implicit)* `loadStudentDetail` itself performs **no authorization**. All four detail pages call `canViewStudent` first and redirect on failure — `src/app/super/students/[id]/page.tsx:20`, `admin/students/[id]/page.tsx:20`, `mentor/students/[id]/page.tsx:20`, `leader/students/[id]/page.tsx:20`. The function is safe only by call-site convention.
- **R71.** **The returned object is identical for every role.** The `options` parameter is `{ viewerRole?, forStudentSelfView? }` (`src/lib/students-query.ts:275`) and **no call site anywhere passes either** — verified across the whole repo. The privacy filter documented at `:268-272` is dead code: `forStudentSelfView` would restrict submissions to the active season (`:361-366`), suppress notes entirely (`:388`) and null out `profile.notes` (`:431`), and none of that ever runs. See §10 D3.
- **R72.** Enrollments are loaded for **all** the student's seasons, ordered `enrolledAt desc`, with the season's `id/title/code/status/startDate/endDate` and the historic group name — `src/lib/students-query.ts:306-318`.
- **R73.** Attendance is the student's **last 100** attendance rows across every season they were ever enrolled in, ordered `session.startsAt desc` — `src/lib/students-query.ts:323-334`.
- **R74.** Per-season attendance % = (`PRESENT` + `LATE` rows in that season) ÷ (sessions in that season with `startsAt <= now`), rounded, 0 when the denominator is 0 — `src/lib/students-query.ts:346-358,452`.
- **R75.** That denominator differs from domain 2's history percentage, which divides by **every** session in the season regardless of date (`src/lib/season-history-query.ts:38-42`). The same student's same season shows two different percentages on two screens. See §10 D8.
- **R76.** *(implicit)* The percentage is computed with **two extra queries per enrollment** in a `for` loop — `src/lib/students-query.ts:346-358`. A student with six seasons costs 12 round trips for 6 numbers. Lines `:336-344` are dead: a `Map` is pre-seeded and a `for` loop over `attendanceRows` does nothing but `void a`, with a comment conceding the approach ("Easier: separate aggregate query per season", `:345`).
- **R77.** Submissions are the student's **last 100** submissions across all enrolled seasons, ordered `createdAt desc`, carrying `publicId, assignmentTitle, status, submittedAt, reviewedAt, seasonTitle` — `src/lib/students-query.ts:367-385`.
- **R78.** Notes are the student's **last 100** `EngagementNote` rows, **unfiltered by visibility or by viewer**, carrying body, visibility, author id/name/role and season — `src/lib/students-query.ts:387-403`. Filtering happens afterwards, in memory, in the page (R79).
- **R79.** `filterVisibleNotes(notes, viewer)` returns everything for SUPER; otherwise keeps a note if the viewer authored it, or if `visibility` matches the viewer's role (`ADMINS`→ADMIN, `MENTORS`→MENTOR, `LEADERS`→LEADER) — `src/lib/students-query.ts:486-498`. Default visibility is `LEADERS` (`prisma/schema.prisma:581`), so an ADMIN does **not** see a leader's default note.
- **R80.** Documents are **every** `StudentDocument` for the student, ordered `uploadedAt desc`, with **no `take` limit** — `src/lib/students-query.ts:405-416`. Names, sizes and MIME types only; `storagePath` is deliberately not selected, and v1 renders no download link (`src/components/students/student-detail.tsx:352-368`), so documents cannot actually be retrieved anywhere in v1.
- **R81.** `profile.photoPath` is returned by both the list and the detail (`src/lib/students-query.ts:93,432`) and rendered by neither — both surfaces use `User.avatarPath` (`src/components/students/students-list.tsx:108`). `StudentProfile.photoPath` is effectively a dead column with a live writer that has no caller (R84).
- **R82.** The engagement card is computed separately, only when `activeSeasonId` is set, as `attendance% × 0.5 + submission% × 0.5` — `src/lib/engagement.ts:13-20,21-43`, invoked identically by all four detail pages (e.g. `src/app/super/students/[id]/page.tsx:23-25`).
- **R83.** *(implicit)* No write occurs during any read in this domain. `loadStudentDetail` and the three list queries are pure. (Recorded because the migration brief expects read-time writes; this domain has none, which matters under React Query's refetch-on-focus.)
- **R84.** `getStudentSeasonAccess` (`src/lib/auth/permissions.ts:255-267`) computes `{ canViewSubmissions, isReadOnly }` from whether a season is the student's active one. **It has no caller.** Do not port it without deciding what it was for.

### Photos, documents and soft delete

- **R85.** `softDeleteStudentAction`, `uploadStudentPhotoAction`, `uploadStudentDocumentAction` and `deleteStudentDocumentAction` **have no caller anywhere in v1** — verified across `src/`. They are `"use server"` exports, so they remain invocable as Next server actions; they are simply unreachable through the UI.
- **R86.** Soft delete is SUPER-only and stamps `deletedAt` on `User` **and** `StudentProfile` in **two separate un-transacted statements** — `src/lib/student-actions.ts:147-158`. A failure between them leaves a live user with a deleted profile.
- **R87.** Soft delete cascades to nothing: enrollments, group membership, attendance, submissions, notes and documents all survive — `src/lib/student-actions.ts:151-158`. The dropped list keeps showing the person (R44).
- **R88.** There is no un-delete. `deletedAt` is written at `src/lib/student-actions.ts:153,157` and cleared nowhere.
- **R89.** Photo upload accepts any `image/*` up to 5 MB and overwrites `photoPath` without deleting the previous object — `src/lib/student-actions.ts:171-187`. Gate is `canEditStudent`, so **a student could set their own `photoPath`**.
- **R90.** Document upload is gated on `(SUPER or ADMIN) and canViewStudent`, accepts any MIME type up to 25 MB, and defaults an empty `file.type` to `application/octet-stream` — `src/lib/student-actions.ts:198-224`.
- **R91.** Document **delete** is gated on `SUPER or ADMIN` **and nothing else** — the `canViewStudent` check present on upload is absent — `src/lib/student-actions.ts:231-241`. Any admin of any season may delete any student's document. It is a hard delete, and the storage removal failure is swallowed (`:240`), so a failed unlink orphans the object.

---

## 4. Authorization

Role gates are pure functions over token claims (`src/lib/rbac.ts`); row-scoped
gates read the database (`src/lib/auth/permissions.ts`).

### 4.1 Operations

| Operation | Roles | Row-scoped condition | v1 citation |
|---|---|---|---|
| List active students | SUPER, ADMIN, MENTOR (pages); LEADER branch exists but has no page | none for SUPER/MENTOR; ADMIN → `id ∈ distinct studentUserId of enrollments in seasonAdminIds`; LEADER → `id ∈ studentUserId of GroupStudent in groupLeaderIds` | `src/lib/students-query.ts:41-61`; pages `super/students/page.tsx:20`, `admin/students/page.tsx:19`, `mentor/students/page.tsx:18` |
| List alumni | SUPER, ADMIN (pages); MENTOR passes the gate, has no page | ADMIN → ever-enrolled in one of their seasons | `src/lib/students-query.ts:127-141`; `super/students/alumni/page.tsx:13`, `admin/students/alumni/page.tsx:12` |
| List dropped | SUPER, ADMIN (pages); MENTOR passes the gate, has no page | ADMIN → `seasonId ∈ seasonAdminIds` | `src/lib/students-query.ts:167-174`; `super/students/dropped/page.tsx:13`, `admin/students/dropped/page.tsx:12` |
| Read student detail | SUPER, ADMIN, MENTOR, LEADER, self | `canViewStudent`: SUPER/MENTOR always; self always; ADMIN if any enrollment in `seasonAdminIds`; LEADER if the student's single `GroupStudent` row is one of their groups | `src/lib/auth/permissions.ts:359-386`; four pages at `:20` each |
| Read own profile | STUDENT | self | `src/app/student/profile/page.tsx:26,28-29` |
| Read own alumni profile | ALUMNI | `isAlumnus` else redirect to `/login` | `src/app/alumni/profile/page.tsx:13` |
| Create student | SUPER, ADMIN | **none — unscoped** | `src/lib/student-actions.ts:52-53`; page `src/app/super/students/new/page.tsx:13` |
| Edit student profile | SUPER, self, ADMIN | `canEditStudent`: SUPER always; self always; ADMIN only if the student's **`activeSeasonId`** ∈ `seasonAdminIds` (enrollment is not consulted) | `src/lib/auth/permissions.ts:388-403`; `src/lib/student-actions.ts:108` |
| Write `notes` / `activeSeasonId` | anyone who passes `canEditStudent` **except the subject** | `user.userId !== studentUserId` | `src/lib/student-actions.ts:113-114,130-135` |
| Soft-delete student | SUPER | none | `src/lib/student-actions.ts:149` |
| Graduate student | SUPER | none | `src/lib/enrollment-actions.ts:33` |
| Drop enrollment | SUPER, season ADMIN | `isAdminOfSeason(user, enrollment.seasonId)` | `src/lib/enrollment-actions.ts:95` |
| Upload student photo | SUPER, self, ADMIN | `canEditStudent` | `src/lib/student-actions.ts:169` |
| Upload student document | SUPER, ADMIN | `canViewStudent` **and** role check | `src/lib/student-actions.ts:199-200` |
| Delete student document | SUPER, ADMIN | **none** — no `canViewStudent`, no season scope | `src/lib/student-actions.ts:238` |
| Write engagement note | SUPER, MENTOR, season ADMIN (via `activeSeasonId`), group LEADER | `canWriteNote` | `src/lib/auth/permissions.ts:405-427` (domain 9) |

### 4.2 Field-level visibility — the rule set an API must invent

v1 has one detail query returning one object (R71). Four roles render it, and
the only per-role difference is a React prop. This table states what each role
**receives today** versus what it **may render**, because an endpoint delivers
the payload whether or not a tab is shown.

| Field | SUPER | ADMIN | MENTOR | LEADER | Student (self) | Enforced by |
|---|---|---|---|---|---|---|
| `id`, `name`, `email` | ✔ | ✔ | ✔ | ✔ | ✔ | — |
| `avatarPath`, `graduationYear` | ✔ | ✔ | ✔ | ✔ | ✔ | — |
| `profile.university`, `year`, `gifts` | ✔ | ✔ | ✔ | ✔ | ✔ | — |
| `profile.phone` | ✔ | ✔ | ✔ | ✔ | ✔ | nothing |
| `profile.dateOfBirth` | ✔ | ✔ | ✔ | ✔ | ✔ | nothing |
| `profile.spiritualBackground` | ✔ | ✔ | ✔ | ✔ | ✔ | nothing |
| **`profile.notes`** (staff-only) | ✔ | ✔ | ✔ | ✔ | **delivered, form hides it** | `isSelf` on **write** only (R23); no read guard |
| `currentGroup` | ✔ | ✔ | ✔ | ✔ | n/a | — |
| `seasons[]` — **every** season, incl. ones the viewer has no scope over | ✔ | ✔ | ✔ | ✔ | n/a | nothing |
| `attendance[]` — last 100 **across all seasons** | ✔ | ✔ | ✔ | ✔ | n/a | nothing |
| `submissions[]` — last 100 **across all seasons** | ✔ | ✔ | ✔ | ✔ | n/a | nothing |
| `notes[]` (`EngagementNote`) | ✔ | ✔ | ✔ | ✔ | ✔ *(would be suppressed by the dead `forStudentSelfView`)* | **`filterVisibleNotes` runs in the page, after the query** (R78–R79) |
| `documents[]` | ✔ rendered | ✔ rendered | **✔ delivered, tab hidden** | **✔ delivered, tab hidden** | n/a | `showDocumentsTab={false}` — a React prop (`mentor/students/[id]/page.tsx:40`, `leader/students/[id]/page.tsx:40`) |

Read the LEADER column: **a group leader currently receives the same object a
SUPER does** — phone, date of birth, spiritual background, staff-only internal
notes, the student's full submission and attendance history across seasons the
leader has nothing to do with, every unfiltered engagement note, and the
document manifest. In v1 the leader's *browser* is handed all of it and shows
some of it. `students-query.ts` is a server module, so nothing crosses the wire
that the page does not render — but the moment `GET /api/v1/students/:id`
exists, the wire *is* the boundary, and the narrowest role receives the widest
payload unless this table is implemented.

### 4.3 Where v1 enforces nothing and relies on the UI

- **`loadStudentDetail` has no authorization at all** (R70). Four pages each call `canViewStudent` immediately before it. In v2 this must be a gate inside the handler, not a convention.
- **`listStudentsForScope`'s LEADER branch is unreachable in v1** (R28, `src/lib/students-query.ts:50-55`) — no leader list page exists. The moment `/students` is one route for all roles (which the v2 nav already implies is not the case — LEADER's nav has no `/students` entry, `packages/shared/src/navigation.ts:90-106`), that branch becomes live. Decide whether leaders get a roster endpoint at all, or whether `GET /groups/:id` (domain 5) is their only student list.
- **`listAlumni` and `listDroppedStudents` grant MENTOR everything** via `canReadAllStudents` (`src/lib/students-query.ts:127,167`) but no mentor page calls them. As endpoints they immediately give MENTOR every alumnus and every drop reason in the database.
- **Document delete is gated on role alone** (R91). Any ADMIN can delete any student's document, including students in seasons they do not administer. This is a real defect today, reachable as a server action; as `DELETE /students/:id/documents/:docId` it becomes trivially exploitable. Fix in v2 — §10 D5.
- **Create is unscoped** (R14, R20): an ADMIN may create a student and set `activeSeasonId` to **any** season, including one they do not administer (`src/lib/student-actions.ts:52-53,79`). No `isAdminOfSeason` check exists on the create path.
- **`canEditStudent` and `canViewStudent` disagree about what "my student" means** — view is enrollment-based, edit is `activeSeasonId`-based (`src/lib/auth/permissions.ts:366-373` vs `:394-401`). An admin can open a past student's detail and be refused the edit; conversely an admin can edit a student who has an `activeSeasonId` in their season but **no enrollment**, whom the list never showed them (R10).
- **The ADMIN detail page's Edit button is a dead link:** it points at `/super/students/${id}/edit` (`src/app/admin/students/[id]/page.tsx:40`), which is `requireRole(["SUPER"])` (`src/app/super/students/[id]/edit/page.tsx:18`). The *action* underneath permits ADMIN (R22). So ADMIN profile editing is authorized-but-unreachable in v1 — exactly the class of latent permission that becomes live on the first `PATCH`.

---

## 5. Read surface

**`listStudentsForScope(user, search?)`** — `src/lib/students-query.ts:21-97`.
One scope query (ADMIN/LEADER only) plus one `user.findMany`. Returns ≤200 rows
of `{ id, name, email, avatarPath, university, year, photoPath,
activeSeasonTitle, groupName }` ordered `name asc`. Nested selects pull
`studentProfile.activeSeason.title` and `groupStudentMembership.group.name`, so
no N+1 in the query itself — but the *page* then makes one storage call per row
(R37). Returns `photoPath`, which nothing renders (R81). No pagination, no
total, no cursor (R34).

**`listAlumni(user)`** — `src/lib/students-query.ts:120-162`. One scope query
(ADMIN only) plus one `user.findMany`. Uncapped. `{ studentUserId, name, email,
graduationYear, university }` ordered `graduationYear desc, name asc`.

**`listDroppedStudents(user)`** — `src/lib/students-query.ts:165-199`. One
`seasonEnrollment.findMany` with two nested selects. Uncapped. Enrollment-keyed
(R43). Includes soft-deleted students (R44).

**`loadStudentDetail(studentUserId, options)`** —
`src/lib/students-query.ts:273-483`. The heavy one:

| # | Query | Note |
|---|---|---|
| 1 | `user.findFirst` with profile + group membership | 404s on miss (R69) |
| 2 | `seasonEnrollment.findMany` with season + group | all statuses (R72) |
| 3 | `attendance.findMany` take 100 | across all seasons (R73) |
| 4–(3+2n) | **two queries per enrollment**: `session.count` + `attendance.count` | the N+1 (R76) |
| next | `submission.findMany` take 100 | (R77) |
| next | `engagementNote.findMany` take 100 | unfiltered (R78) |
| next | `studentDocument.findMany` | **no take** (R80) |

For a student with 6 seasons that is 6 + 12 = 18 round trips, of which 12
produce 6 integers. Every one of the four detail pages then issues a further
3–4 queries for the engagement card (`src/lib/engagement.ts:27-58`).

**Role-shape differences in v1: none** (R71). The `options` parameter that was
designed to create them is never passed.

**`filterVisibleNotes(notes, viewer)`** —
`src/lib/students-query.ts:486-498`. Pure, post-query, in-memory. It is the
only per-role narrowing that actually executes, and it runs *after* the rows
have already left the database.

**`getVisibleStudents(user)`** — `src/lib/auth/permissions.ts:198-248`. A
fifth, near-identical scoping implementation returning `{ id, name, email }`,
used by other domains' student pickers. It differs from
`listStudentsForScope` in three ways: no `graduationYear` filter, no search, no
`take`. Two implementations of "which students may this user see" is one too
many — §10 D6.

---

## 6. Write surface

**`createStudentAction(input)`** — `src/lib/student-actions.ts:49-101`.
Inputs: the ten profile fields. Gate: `isSuper || role === "ADMIN"`, unscoped.
Validates, hashes the fixed password (R16), checks email uniqueness (R18),
creates `User` + nested `StudentProfile`. **Creates no enrollment** (R15).
Logs the password (R17). Revalidates three list paths. Returns
`{ ok: true, studentUserId }`.
*Non-atomic:* uniqueness `findUnique` and `create` are separate statements — a
concurrent create raises an uncaught `P2002`.

**`updateStudentProfileAction(studentUserId, input)`** — `:103-145`.
Gate: `canEditStudent`. One `$transaction` over `user.update` (name, email) and
`studentProfile.update` (eight fields, two of them conditional on `!isSelf`).
Atomic. No existence check (R27). Notifies nothing. Revalidates four paths.

**`softDeleteStudentAction(studentUserId)`** — `:147-162`. SUPER. **Two
un-transacted updates** (R86). No cascade (R87). Redirects to
`/super/students`. **No caller** (R85).

**`uploadStudentPhotoAction(studentUserId, formData)`** — `:164-192`.
`canEditStudent`. 5 MB, `image/*`. Writes the object, then `photoPath`. Old
object is orphaned. **No caller.**

**`uploadStudentDocumentAction(studentUserId, formData)`** — `:194-229`.
`(SUPER|ADMIN)` **and** `canViewStudent`. 25 MB, any MIME. Writes the object,
then the row. *Non-atomic:* a failed insert after a successful `put` orphans the
object. **No caller.**

**`deleteStudentDocumentAction(documentId)`** — `:231-246`. `(SUPER|ADMIN)`
only (R91). Deletes the object (failure swallowed), then hard-deletes the row.
**No caller.**

**`graduateStudentAction(studentUserId, input)`** —
`src/lib/enrollment-actions.ts:28-73`. SUPER. Validates the year (R58), reads
the student, then one `$transaction`: `graduationYear`, close the active
enrollment, clear `activeSeasonId`. Atomic. Notifies nothing. Revalidates three
paths. Returns `{ ok: true }`.

**`dropEnrollmentAction(enrollmentId, input)`** — `:84-119`. Season ADMIN or
SUPER. Reads the enrollment, gates, refuses non-`ACTIVE` (R49), one update.
Notifies nothing. Revalidates four paths.

**Cross-domain writes that mutate this domain's state:**
`createGroupAction` / `updateGroupAction` destroy and recreate enrollments
(`src/lib/group-actions.ts:66-75,141-150`, R51);
`assignStudentsToGroupsAction` upserts them safely (`:236-240`);
`deleteGroupAction` nulls `groupId` (`:171-174`);
`commitStudentImport` creates `User` + profile + `ACTIVE` enrollment in one
transaction per row (`src/lib/student-import.ts:253-273`) — notably the **only**
creation path that gets the enrollment right.

**No write in this domain sends a notification or writes an audit row.**
`User`, `StudentProfile` and `SeasonEnrollment` have no `createdById` /
`updatedById` columns, so there is no record of who graduated or dropped a
student.

---

## 7. Proposed API

Envelope per `CLAUDE.md`: `{ data }` / `{ error: { code, message } }`. Reuse the
codes already in this backend: `bad_request` 400, `forbidden` 403,
`not_found` 404, `conflict` 409, `internal_error` 500.

**Nothing in this domain exists yet.** `apps/backend/src/routes/` has no
`students.ts` or `enrollments.ts`.

| Method | Path | Status | Auth | Request | Response |
|---|---|---|---|---|---|
| GET | `/api/v1/students` | **new** | any authed; scope per R30 | `?q=&cursor=&limit=` | `{ students: StudentListItem[], nextCursor }` |
| GET | `/api/v1/students/alumni` | **new** | SUPER, ADMIN, MENTOR | `?q=&cursor=` | `{ alumni: AlumnusListItem[], nextCursor }` |
| GET | `/api/v1/students/dropped` | **new** | SUPER, ADMIN | `?cursor=` | `{ enrollments: DroppedEnrollmentItem[], nextCursor }` |
| GET | `/api/v1/students/:id` | **new** | `canViewStudent` | — | `StudentDetail`, **role-shaped per §4.2** |
| GET | `/api/v1/students/:id/enrollments` | **new** | `canViewStudent`, scoped to the viewer's seasons | — | `{ enrollments: EnrollmentItem[] }` |
| GET | `/api/v1/students/:id/attendance` | **new** | `canViewStudent` | `?seasonId=` | `{ attendance: [...] }` — domain 4 shape |
| GET | `/api/v1/students/:id/submissions` | **new** | `canViewSubmission`-equivalent scope | `?seasonId=` | `{ submissions: [...] }` — domain 8 shape |
| GET | `/api/v1/students/:id/notes` | **new — owned by domain 9** | `canViewStudent` + `filterVisibleNotes` **in the query** | — | `{ notes: [...] }` |
| GET | `/api/v1/students/:id/documents` | **new** | SUPER, ADMIN with `canViewStudent` | — | `{ documents: [...] }` |
| GET | `/api/v1/students/:id/engagement` | **new** | `canViewStudent` | `?seasonId=` | `{ engagement }` |
| POST | `/api/v1/students` | **new** | SUPER; ADMIN **scoped** — see D4 | `CreateStudentInput` | `{ student }`, 201 |
| PATCH | `/api/v1/students/:id` | **new** | `canEditStudent`; field allowlist per §4.2 | `UpdateStudentInput` | `{ student }` |
| DELETE | `/api/v1/students/:id` | **new** | SUPER | — | `{ ok: true }` (soft) |
| POST | `/api/v1/students/:id/graduate` | **new** | SUPER | `{ graduationYear }` | `{ student }` |
| POST | `/api/v1/students/:id/photo` | **new** | `canEditStudent` | multipart | `{ photoPath }` — **gated by `ENABLE_UPLOADS`** |
| POST | `/api/v1/students/:id/documents` | **new** | SUPER/ADMIN + `canViewStudent` | multipart | `{ document }` — **gated by `ENABLE_UPLOADS`** |
| DELETE | `/api/v1/students/:id/documents/:documentId` | **new** | SUPER/ADMIN + `canViewStudent` + document belongs to `:id` | — | `{ ok: true }` |
| POST | `/api/v1/enrollments` | **new — has no v1 equivalent** | season ADMIN, SUPER | `{ studentUserId, seasonId, groupId? }` | `{ enrollment }`, 201 |
| POST | `/api/v1/enrollments/:id/drop` | **new** | `isAdminOfSeason(enrollment.seasonId)` | `{ reason? }` | `{ enrollment }` |
| GET | `/api/v1/me/profile` | **new** | STUDENT / ALUMNI, self | — | `{ profile }` — **no `notes`, no `documents`** |
| PATCH | `/api/v1/me/profile` | **new** | STUDENT, self | `UpdateOwnProfileInput` | `{ profile }` |

Design notes, stated here rather than solved with more endpoints:

- **`GET /students/:id` must be role-shaped, not one payload.** §4.2 is the
  contract. The narrowest sensible cut: LEADER and MENTOR get identity,
  university/year/gifts, current group, engagement and the *scoped* season rows;
  they do **not** get `phone`, `dateOfBirth`, `spiritualBackground`,
  `profile.notes` or `documents`. ADMIN gets everything except documents outside
  their seasons. SUPER gets everything. This is a **behaviour change from v1** on
  the wire but not on any screen, because no v1 screen renders those fields for
  those roles — which is precisely why it is safe to make.
- **Split the detail into sub-resources.** v1's single 18-query read exists
  because a server component renders once. Under React Query, six tabs are six
  queries with six cache keys, five of which are never fetched until the tab is
  opened. This kills R76's N+1 as a side effect and lets `/students/:id/notes`
  carry domain 9's visibility filter in its own `where` clause instead of in
  memory (R78).
- **Do not port `?q=` as an unbounded scan.** v1's 200-row cap with no total
  (R34) misreports population. Use cursor pagination and return a `total`.
- **`POST /enrollments` has no v1 counterpart and is the fix for R15/R51.**
  Today the only ways to create an enrollment are "be added to a group" and "be
  CSV-imported". An explicit enroll endpoint is what lets group assignment stop
  deleting and recreating rows.
- **`/students/dropped` returns enrollments, not students** (R43). Name the
  response field accordingly so the mobile screen does not key on `studentId`
  and collapse duplicates.
- **Upload endpoints ship disabled.** `ENABLE_UPLOADS` defaults to `false`
  (`CLAUDE.md`), so photo and document upload return `503 uploads_disabled`.
  Mount the guard in front of `multer`, as `submissions.ts` does. Reading and
  deleting recorded documents still work.
- **`GET /me/profile` is not `GET /students/:id` with `id = self`.** The dead
  `forStudentSelfView` option (R71) is evidence someone intended one endpoint
  for both; two endpoints is safer, because a self-view that forgets a flag
  hands a student their own internal notes.

---

## 8. Proposed shared contracts

Two new files: `packages/shared/src/student.ts` and
`packages/shared/src/enrollment.ts`.

**Reuse, do not redefine:** `enrollmentStatusSchema` and its `EnrollmentStatus`
type already exist at `packages/shared/src/enums.ts:8-9`; `userRoleSchema` at
`packages/shared/src/auth.ts:3`; `GroupMember` at
`packages/shared/src/group.ts:13-17` (but see D9 on its `name` nullability);
`seasonListItemSchema` from domain 2 for the nested season on an enrollment row.
`attendanceStatusSchema` and `submissionStatusSchema` (`enums.ts:11,14`) belong
to the sub-resource payloads and must not be restated.

### `packages/shared/src/student.ts`

| Schema | Fields | Notes |
|---|---|---|
| `studentListItemSchema` | `id`, `name`, `email`, `avatarPath` (nullable), `university` (nullable), `year` (nullable), `activeSeasonTitle` (nullable), `groupName` (nullable) | Converts `StudentListRow` (`src/lib/students-query.ts:8-19`). **Drop `photoPath`** — R81 proves it is unused |
| `alumnusListItemSchema` | `studentUserId`, `name`, `email`, `graduationYear` (int), `university` (nullable) | Converts `AlumnusRow` (`:111-117`) |
| `studentProfilePublicSchema` | `university`, `year`, `gifts`, `activeSeasonId`, `activeSeasonTitle`, `activeSeasonCode` | The cut **every** staff role may read |
| `studentProfilePrivateSchema` | extends the above with `phone`, `dateOfBirth` (ISO string), `spiritualBackground` | SUPER and ADMIN only — §4.2 |
| `studentProfileInternalSchema` | extends the above with `notes` | SUPER and ADMIN only; never sent to the subject |
| `studentDetailSchema` | `id`, `name`, `email`, `avatarPath`, `graduationYear`, `profile` (one of the three above by role), `currentGroup` (nullable `{ id, name }`) | The sub-resources (`seasons`, `attendance`, `submissions`, `notes`, `documents`) move to their own endpoints (§7) and are **not** fields of this schema |
| `studentDocumentSchema` | `id`, `originalName`, `sizeBytes`, `mimeType`, `uploadedAt` | Deliberately **no `storagePath`** — v1 already withholds it (`src/lib/students-query.ts:406-415`) |
| `createStudentInputSchema` | `name` 2–120, `email` email, `university` ≤160 nullable, `year` ≤40 nullable, `phone` ≤60 nullable, `dateOfBirth` nullable date, `spiritualBackground` ≤4000 nullable, `gifts` ≤2000 nullable, `notes` ≤4000 nullable, `activeSeasonId` int nullable, **`seasonId` int optional (new — creates the enrollment, D1)** | Mirrors `src/lib/student-actions.ts:23-34`; the client form must consume **this** schema, not the looser copy at `src/components/students/student-form.tsx:21-32` (R21) |
| `updateStudentInputSchema` | same minus `seasonId`; all optional (PATCH semantics) | v1 reuses one schema for create and update; splitting lets the server reject `notes` from a self-edit instead of silently dropping it (R24) |
| `updateOwnProfileInputSchema` | `name`, `email`, `university`, `year`, `phone`, `dateOfBirth`, `spiritualBackground`, `gifts` — **`notes` and `activeSeasonId` absent by construction** | Makes R23 a type error rather than a runtime no-op |
| `graduateStudentInputSchema` | `graduationYear` int, min 1990, max **evaluated per request** | Fixes R58's module-load capture |

### `packages/shared/src/enrollment.ts`

| Schema | Fields | Notes |
|---|---|---|
| `enrollmentItemSchema` | `id`, `seasonId`, `seasonTitle`, `seasonCode`, `seasonStatus`, `startDate`, `endDate`, `groupName` (nullable), `status` (`enrollmentStatusSchema`), `enrolledAt`, `completedAt` (nullable), `droppedAt` (nullable), `attendancePct` (int 0–100) | Converts the `seasons[]` element of `StudentDetailData` (`src/lib/students-query.ts:221-232`) |
| `droppedEnrollmentItemSchema` | `enrollmentId`, `studentUserId`, `name`, `email`, `seasonId`, `seasonProgram`, `seasonYear`, `droppedAt`, `dropReason` (nullable) | Converts `DroppedStudentRow` (`:99-109`) |
| `createEnrollmentInputSchema` | `studentUserId` int, `seasonId` int, `groupId` int nullable | New (§7) |
| `dropEnrollmentInputSchema` | `reason` ≤500 optional, `""` → `null` | Mirrors `src/lib/enrollment-actions.ts:75-77,110` |

`packages/shared/src/group.ts` is still bare `interface`s
(`GroupListItem`, `GroupMember`, `GroupDetail`) and should convert to Zod as
part of domain 5, not here — but `GroupMember.name` must be reconciled with
`User.name`'s non-nullability at the same time (D9).

---

## 9. Screens

The v2 tree is flat and role-driven. v1's `/super/students/**`,
`/admin/students/**`, `/mentor/students/**` and `/leader/students/[id]`
collapse onto three list routes plus three detail/form routes.

| v1 page(s) | v2 route | Exists? | Roles | Notes |
|---|---|---|---|---|
| `super/students/page.tsx`, `admin/students/page.tsx`, `mentor/students/page.tsx` | `/students` | file exists, placeholder — `apps/mobile/app/(app)/students/index.tsx` | SUPER, ADMIN, MENTOR (all three have it in `tabs` **and** `sidebar`) | One screen, one endpoint, scope from the token. Search + season/group filter + 4 sort keys (R35) — but server-side now, per §7. LEADER's nav has **no** `/students` entry (`packages/shared/src/navigation.ts:90-106`) |
| `super/students/alumni/page.tsx`, `admin/students/alumni/page.tsx` | `/students/alumni` | file exists, placeholder — `students/alumni.tsx` | SUPER (sidebar `:54`), ADMIN | Not in ADMIN's nav today — reachable only by navigation; decide whether to add it |
| `super/students/dropped/page.tsx`, `admin/students/dropped/page.tsx` | `/students/dropped` | file exists, placeholder — `students/dropped.tsx` | SUPER (sidebar `:55`), ADMIN | Enrollment-keyed list (R43) |
| `super/students/[id]/page.tsx`, `admin/students/[id]/page.tsx`, `mentor/students/[id]/page.tsx`, `leader/students/[id]/page.tsx` | `/students/[id]` | **missing — must be created** | SUPER, ADMIN, MENTOR, LEADER | One screen, role branches. Tabs become lazily-fetched sub-queries (§7). Graduate action SUPER-only (R63); Drop action per-row and season-scoped (R64, fixing R68) |
| `super/students/new/page.tsx` | `/students/new` | **missing — must be created** | SUPER, ADMIN | Must offer a season and actually create the enrollment (D1) |
| `super/students/[id]/edit/page.tsx` | `/students/[id]/edit` | **missing — must be created** | SUPER, ADMIN (D4) | Fixes the dead ADMIN Edit link (§4.3) |
| `graduate-student-button.tsx`, `drop-enrollment-button.tsx` | bottom sheets on `/students/[id]` | **missing** | SUPER / season ADMIN | Modals become sheets per the mobile conventions in `CLAUDE.md` |
| `student/profile/page.tsx` | `/profile`, STUDENT branch | file exists, placeholder — `apps/mobile/app/(app)/profile.tsx` | STUDENT | `PATCH /me/profile`; the "Admin only" fieldset does not exist for this role at all (R25) |
| `alumni/profile/page.tsx` | `/profile`, ALUMNI branch | same file | ALUMNI | Read-only card (`src/app/alumni/profile/page.tsx:31-46`) |

`/students`, `/students/alumni` and `/students/dropped` are already in
`ALL_NAV_HREFS`; `apps/mobile/app/(app)/_layout.tsx:19` already maps the bare
`students` path to `students/index`, so the tab bar needs no change. The three
routes under `/students/[id]` and `/students/new` are new files.

`apps/mobile/src/lib/query-keys.ts` holds only a `sessions` factory
(`:22-33`); this domain adds a `students` factory with `lists()`,
`list({ q, scope })`, `detail(id)` and one leaf per sub-resource, plus an
`enrollments` factory keyed by student and by season.

---

## 10. Open questions and divergences

**D1 — Creating a student does not enroll them (R15), and the page says it
does (`src/app/super/students/new/page.tsx:25`).** The operator picks an active
season, the profile pointer is set, and no `SeasonEnrollment` row appears. That
student is then invisible to their own season's admin list (R10), absent from
every roster count, absent from `computeAtRiskStudents`
(`src/lib/engagement.ts:187-191`, which filters `status: ACTIVE`), and absent
from reports (`src/lib/reports-query.ts:99`) — while *appearing* on the
group-assignment grid, which reads `activeSeasonId` (R11).
*Recommendation:* `POST /students` accepts an optional `seasonId` and creates
the `User`, the profile **and** an `ACTIVE` enrollment in one transaction —
matching what `commitStudentImport` already does correctly
(`src/lib/student-import.ts:253-273`). Needs a product decision only on whether
`activeSeasonId` and the enrollment must always agree; recommend yes.

**D2 — Group assignment destroys enrollment history (R51). This is the most
damaging defect found in this domain.** `createGroupAction` and
`updateGroupAction` `deleteMany` then `createMany` the season's enrollments
(`src/lib/group-actions.ts:66-75,141-150`). Adding a previously-dropped student
to a group resurrects them as `ACTIVE`, discards `droppedAt` and `dropReason`,
resets `enrolledAt` to now, and removes them from the dropped list — with no
record that it happened. The third assignment path already does it right by
upserting (`:236-240`).
*Recommendation:* in v2, group membership never writes `SeasonEnrollment.status`.
Group writes may set `groupId` on an existing enrollment or create a missing one
as `ACTIVE`, never delete one. Cross-domain: **domain 5 owns the fix**; flag it
there.

**D3 — The privacy filter is dead code (R71), and the payload is
role-blind (§4.2).** `loadStudentDetail`'s `forStudentSelfView` and `viewerRole`
options are never passed by any of the seven call sites. In v1 that is
survivable because a server component only renders what the page asks for. As an
endpoint it is a full personal-data export to a group leader: phone, date of
birth, spiritual background, staff-only internal notes, cross-season attendance
and submission history, every unfiltered engagement note, and the document
manifest.
*Recommendation:* implement §4.2 as three response shapes selected by role, and
delete the `options` parameter rather than porting it. Add an integration test
per role asserting the *absence* of each withheld field — absence tests are the
only kind that catch this class of regression.

**D4 — `canViewStudent` and `canEditStudent` use different definitions of "my
student" (§4.3).** View is enrollment-based, edit is `activeSeasonId`-based.
Combined with D1 this means an ADMIN can edit a student the list never showed
them, and cannot edit a student the list did.
*Recommendation:* make both enrollment-based once D1 guarantees enrollments
exist, and require the enrollment to be `ACTIVE` for edit. Also decide whether
ADMIN keeps `POST /students` at all — v1's create is entirely unscoped (§4.3),
so an ADMIN can today create a student pointed at any season in the system.
Recommend: ADMIN may create only into a season in `seasonAdminIds`.

**D5 — Document delete has no row-scoped gate (R91).** `deleteStudentDocumentAction`
checks `isSuper || role === "ADMIN"` and nothing else — no `canViewStudent`,
though the *upload* path has one (`src/lib/student-actions.ts:200` vs `:238`).
Any admin can hard-delete any student's document, and the storage failure is
swallowed (`:240`).
*Recommendation:* `DELETE /students/:id/documents/:documentId` must verify
`canViewStudent` **and** that the document's `studentUserId` equals `:id`. Do
not accept a bare document id as the sole parameter — that shape is what allowed
the omission to go unnoticed.

**D6 — Two implementations of "which students may this user see" (§5).**
`listStudentsForScope` (`src/lib/students-query.ts:41-61`) and
`getVisibleStudents` (`src/lib/auth/permissions.ts:198-248`) compute the same
scope with different filters — the latter omits the `graduationYear` and
`take` bounds, so an alumnus appears in other domains' student pickers but not
in the student list.
*Recommendation:* one `visibleStudentIds(user)` helper in
`apps/backend/src/lib/permissions.ts`, consumed by both. Whether alumni belong
in note/quiz pickers is a product question that should be answered once, not
twice by accident.

**D7 — Hard-coded shared password and a plaintext log line (R16, R17).**
Every form-created student in the database shares the bcrypt hash of
`ChangeMe123!`, and the account's email plus that password sit in the server log
(`src/lib/student-actions.ts:58-60,93-95`). The code's own comment concedes it
("production should send invite", `:58`).
*Recommendation:* `POST /students` creates the user with `passwordHash: null` —
exactly as CSV import already does (`src/lib/student-import.ts:260`) — and
issues an invite through domain 11. Never log a credential. This is a
**cross-domain dependency**: domain 6 cannot ship its create endpoint until
domain 11's invite issuance exists, or it must ship without a login path for
new students (which import already does).

**D8 — The same student's same season shows two attendance percentages
(R74, R75).** The detail divides by sessions with `startsAt <= now`
(`src/lib/students-query.ts:348`); domain 2's history divides by every session
in the season (`src/lib/season-history-query.ts:38-42`). Mid-season the two
numbers differ by the whole remaining schedule.
*Recommendation:* standardise on the elapsed-sessions denominator (this
domain's) — it is the one that answers "how has this student done so far".
Note it in domain 2 and in domain 17 (Reports), which computes a third variant.

**D9 — `User.name` is non-nullable in the schema and nullable in every type
(§2).** `prisma/schema.prisma:106` says `String`; `StudentListRow.name`,
`AlumnusRow.name`, `DroppedStudentRow.name`, `StudentDetailData.name` and
`packages/shared/src/group.ts:15` all say `string | null`, and every screen
renders `name ?? email`. `packages/shared/src/auth.ts:19` gets it right.
*Recommendation:* the new schemas declare `name: string`, non-nullable, and the
`?? email` fallbacks disappear. Flag `GroupMember` to domain 5 for the same fix
in the same wave, so the two do not diverge again.

**D10 — Enrollment status never advances on its own (R8, R50).** A season ends;
its enrollments stay `ACTIVE` forever unless a human graduates or drops each
student individually. `ACTIVE` enrollments gate at-risk reporting, roster
counts, and (via R53) season access for withdrawn students.
*Recommendation:* do not add automatic transitions inside this domain — a
date-derived status needs a timezone the schema does not have (domain 2, D12).
Instead add a **bulk close-out** operation on the season (`POST
/seasons/:id/close-enrollments`, marking every `ACTIVE` enrollment `COMPLETED`)
and surface a "this season ended N days ago with M active enrollments" hint.
Product decision required.

**D11 — Withdrawn students keep season access (R53).** `canAccessSeason`'s
student branch matches any enrollment row regardless of status
(`src/lib/auth/permissions.ts:63-67`). A student dropped for cause retains read
access to the season's sessions, assignments and group.
*Recommendation:* add `status: { in: ["ACTIVE", "COMPLETED"] }` to that lookup.
This is **domain 2's gate** — flag it there; recorded here because this domain
owns the status it should read.

**D12 — The dropped list shows soft-deleted students and then 404s (R44).**
`listDroppedStudents` filters neither `deletedAt` nor `role`
(`src/lib/students-query.ts:166`), while `loadStudentDetail` filters both
(`:278`). A deleted student's name, email and drop reason stay listed with a
link that fails.
*Recommendation:* filter `studentUser: { deletedAt: null, role: "STUDENT" }` on
the dropped endpoint. Purely a defect fix; no product decision.

**D13 — Four write actions and one permission helper have no caller (R84,
R85).** `softDeleteStudentAction`, `uploadStudentPhotoAction`,
`uploadStudentDocumentAction`, `deleteStudentDocumentAction` and
`getStudentSeasonAccess` are unreachable through the UI. Documents can be
uploaded by no one and downloaded by no one (R80), yet the Documents tab renders
for SUPER and ADMIN.
*Recommendation:* decide per item rather than porting blind. Recommend: **keep**
document upload/list/delete (behind `ENABLE_UPLOADS`) and add the download route
v1 never had; **keep** soft delete as `DELETE /students/:id`; **drop**
`StudentProfile.photoPath` and `uploadStudentPhotoAction` entirely in favour of
`User.avatarPath`, which is the one the UI actually renders (R81); **drop**
`getStudentSeasonAccess`.

**D14 — The 200-row cap misreports the population (R34).** Every list header
prints `rows.length` as the student count. With 200+ students the number is
simply wrong, and the client-side season/group filters (R35) silently operate on
a truncated set.
*Recommendation:* cursor pagination plus a separate `total`, and move the
season/group filters into the query. This changes a visible number — flag it.

**D15 — No audit trail on any student or enrollment write (§6).** `User`,
`StudentProfile` and `SeasonEnrollment` carry no `createdById`/`updatedById`,
unlike `Season`, `Assignment` and `Submission`. There is no record of who
graduated a student, who dropped them, or who wrote their internal notes.
*Recommendation:* this is the domain where an audit trail matters most, but it
needs schema columns, and `prisma/migrations/` is frozen while both systems
share the database (`CLAUDE.md`). Record it as a post-cutover migration; in the
meantime, log actor + subject + operation server-side for the four
state-changing endpoints (graduate, drop, soft-delete, document-delete) —
**without** logging any field value.

**D16 — Engagement note bodies are rendered with `dangerouslySetInnerHTML`**
(`src/components/students/student-detail.tsx:328-331`). Stored HTML authored by
one staff user executes in another's browser. React Native does not have an
equivalent hazard, so the port removes it by accident — but the *stored* data is
still unsanitised HTML and any future web surface reintroduces it.
*Cross-domain:* flag to domain 9 (Notes); do not fix here.

---

## Rule and citation summary

91 numbered rules (R1–R91); **22** marked `(implicit)` — enforced by a query's
`where` clause, by which page renders a control, or by a React prop, rather
than by an explicit check. Every one of those 22 is a candidate for silent loss
during the port, and the field-level table in §4.2 is where the most expensive
ones live: it is the only place in this spec where the enforcing mechanism is a
React prop (`showDocumentsTab`) or nothing at all.
