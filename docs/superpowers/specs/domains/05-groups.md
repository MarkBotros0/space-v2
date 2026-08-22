# Domain 05 — Groups

> Status: draft · Phase: 2 (leader read) / 3 (admin writes) · v1 API status: read done (literally true, misleading — see §7)

A group is a named subdivision of a season, holding some students and some
leaders. This domain owns the group's own lifecycle — create, edit, delete —
plus **membership** (which student is in which group), **leadership** (which
user leads which group, and therefore the `groupLeaderIds` claim every other
domain's authorization depends on), and the bulk **roster assignment** surface.

**Boundary.** This domain owns `GroupStudent` and `GroupLeader` outright. It
**writes** `SeasonEnrollment` but does not own it — enrollment status, drop,
graduation and `StudentProfile.activeSeasonId` are **domain 6**. Assignment
targeting (`AssignmentTarget`) is **domain 7**; the group roster shown on an
attendance screen is **domain 4**; the group-membership CSV import is
**domain 16**, though the action it commits through lives here (§6). Section 3
names the boundary at each point.

The single most consequential fact in this domain is R1: **a student belongs to
at most one group globally, not one per season.** It is the root cause of items
1, 3, 7 and 10 in section 10, and of domain 7's item 7.

---

## 1. v1 source

All paths relative to `D:\Projects\JPC\jpc-space`.

| File | Holds |
|---|---|
| `src/lib/group-actions.ts` | Every write. 257 lines. Create, update, delete, and the bulk `assignStudentsToGroupsAction`. Also the only place `SeasonEnrollment` rows are created outside the student import. |
| `src/lib/groups-query.ts` | Every read. 163 lines. Season list, detail, two user pickers, a select-options list, and the season roster. |
| `src/components/groups/group-form.tsx` | Create/edit form. Carries the name-length rule the server disagrees with, and is the only thing constraining *who* may be named a leader or a student. |
| `src/components/groups/groups-list.tsx` | The admin list table — three columns, empty state. |
| `src/components/groups/roster-grid.tsx` | The bulk-assignment screen: per-student group `Select`, dirty tracking, one batched save. |
| `src/components/groups/group-import-form.tsx` | CSV/XLSX preview + commit UI. **Domain 16**, listed because it commits through this domain's bulk action. |
| `src/lib/group-import.ts` | Preview builder: header detection, email→student and name→group matching. **Domain 16.** |
| `src/lib/group-import-actions.ts` | `previewGroupImportAction`, `commitGroupImportAction`. **Domain 16**; `commitGroupImportAction:64` calls `assignStudentsToGroupsAction`. |
| `src/lib/rbac.ts` | `isAdminOfSeason` (pure, `:28-30`), `isLeaderOfGroup` (pure, `:32-34`), `isLeaderInSeason` (database-backed, `:36-51`). |
| `src/lib/auth/permissions.ts` | `canEditSeason` (`:41-43`), `canAccessSeason` (`:45-71`), `canAccessGroup` (`:73-96`). Also `getVisibleStudents` (`:198-253`) and `canViewStudent` (`:359-386`), which resolve "the leader's students" through `GroupStudent` — domain 6's rules, driven by this domain's data. |
| `src/lib/auth/scopes.ts` | `loadScopes` — where `groupLeaderIds` comes from (`:13`, `:22`). |
| `src/lib/auth.ts` | The JWT callback that caches the claim (`:76-82`) and the session callback that surfaces it (`:89`). |
| `src/lib/season-actions.ts:296-303` | `duplicateSeasonAction` creates groups. Name and description only — no leaders, no students. See §10 item 12. |
| `src/lib/enrollment-actions.ts` | `graduateStudentAction` (`:28-73`), `dropEnrollmentAction` (`:84-119`). **Domain 6**, cited here because neither touches `GroupStudent` (R7). |
| `src/app/api/v1/seasons/[id]/groups/route.ts` | v1's REST season-group list. |
| `src/app/api/v1/groups/[id]/route.ts` | v1's REST group detail. |

Pages that consume it:

| Page | Role gate | What it reads |
|---|---|---|
| `src/app/admin/groups/page.tsx` | ADMIN (`:12`) | Not a page — a redirect to the newest non-deleted season the user administers (`:25-40`). |
| `src/app/admin/season/[code]/groups/page.tsx` | ADMIN, SUPER + `canEditSeason` (`:23,26`) | `listGroupsForSeason(season.id)` (`:28`) — unscoped, full season list |
| `src/app/admin/season/[code]/groups/new/page.tsx` | ADMIN, SUPER + `canEditSeason` (`:22,25`) | `listLeadersForPicker()` + `listStudentsForPicker(season.id)` (`:27-30`) |
| `src/app/admin/season/[code]/groups/[id]/page.tsx` | ADMIN, SUPER + `canEditSeason` (`:23,26`) | `loadGroupById` (`:28`) plus a second `seasonId` check (`:29`) |
| `src/app/admin/season/[code]/groups/[id]/edit/page.tsx` | ADMIN, SUPER + `canEditSeason` (`:22,26`) | `loadGroupById` + both pickers (`:28-32`), same second check (`:33`) |
| `src/app/admin/season/[code]/roster/page.tsx` | ADMIN, SUPER + `canEditSeason` (`:23,26`) | `listSeasonRoster` + `listGroupsForSelect` (`:28-31`) |
| `src/app/admin/season/[code]/roster/import/page.tsx` | ADMIN, SUPER | Domain 16. |
| `src/app/leader/groups/page.tsx` | LEADER (`:14`) | A **hand-rolled query** (`:32-47`) narrowed by `user.groupLeaderIds` — not in `groups-query.ts` |
| `src/app/student/season/page.tsx` | STUDENT (`:23`) | A **hand-rolled** `groupStudent.findUnique` (`:63-83`). v1 has no student "my group" page; the group card lives inside the season page. |

v1 has **zero test files**. The source above is the only statement of intent.

---

## 2. Data model

### `Group` — `apps/backend/prisma/schema.prisma:297-312`

| Field | Type | Meaning / rule it carries |
|---|---|---|
| `seasonId` | `Int`, FK → `Season`, **`onDelete: Restrict`** (`:300`) | The only owning scope. Immutable — no code path writes it after create (R26). `Restrict` means a season row cannot be hard-deleted while it holds groups; v1 soft-deletes seasons, so this never fires. |
| `name` | `String` | Required, 2–80 (R10). **No unique constraint of any kind** — see R13. |
| `description` | `String?` | Nullable, ≤2000 (R11). Rendered on the admin detail page and the student's group card. |
| `createdAt` / `updatedAt` | `DateTime` | **Never read anywhere in v1.** |
| `@@index([seasonId])` | | Backs the per-season list. There is no index on `name`. |

There is **no `deletedAt`** on `Group` — deletion is a hard delete, unlike
`User` / `Season` / `StudentProfile` / `Assignment`.

There is **no capacity, size limit, colour, order, or code field.** A group is
a name, a description and a season. Anything the mobile design wants beyond
that is new.

### `GroupLeader` — `apps/backend/prisma/schema.prisma:314-323`

| Field | Type | Meaning / rule it carries |
|---|---|---|
| `@@id([groupId, userId])` (`:321`) | | Composite PK. A group may have **any number** of leaders and a user may lead **any number** of groups, in any number of seasons (R58, R59). |
| `groupId` | FK → `Group`, `onDelete: Cascade` (`:316`) | Deleting a group destroys its leader rows at DB level; v1 also deletes them explicitly first (R36). |
| `userId` | FK → `User`, **`onDelete: Restrict`** (`:318`) | A user row cannot be hard-deleted while they lead a group. |
| `assignedAt` | `DateTime @default(now())` | **Written by the default, read by nothing.** Additionally *destroyed on every group edit* — R27. |

`GroupLeader` carries **no role constraint**. Nothing at the schema or action
level requires `user.role === "LEADER"` (R16).

### `GroupStudent` — `apps/backend/prisma/schema.prisma:327-336`

| Field | Type | Meaning / rule it carries |
|---|---|---|
| `studentUserId` | `Int` **`@unique`** (`:330`) | **The defining constraint of this domain.** Standalone unique, not part of a composite with `groupId` or a season. See R1. |
| `groupId` | FK → `Group`, `onDelete: Cascade` (`:329`) | Deleting a group destroys memberships. |
| `studentUser` | FK → `User`, **`onDelete: Restrict`** (`:331`) | A user row cannot be hard-deleted while in a group. |
| `@@id([groupId, studentUserId])` (`:334`) | | Redundant given the standalone `@unique` — the unique is what enforces the rule. |
| `enrolledAt` | `DateTime @default(now())` | **Written by the default, read by nothing.** |

The mirror on `User` confirms it: `groupStudentMembership GroupStudent?`
(`:123`) — a **singular optional** relation, not a list.

### `SeasonEnrollment` — `apps/backend/prisma/schema.prisma:339-357`

Written by this domain, owned by domain 6. Fields this domain touches:

| Field | Type | Meaning / rule it carries |
|---|---|---|
| `groupId` | `Int?`, FK → `Group`, `onDelete: SetNull` (`:345-346`) | The **historic, per-season** group. Written by all three write paths (R4), read by nothing except two display sites (R5). |
| `status` | `EnrollmentStatus @default(ACTIVE)` (`:347`) | Reset to the default by create/update (R19); preserved by the bulk action (R52). |
| `enrolledAt` / `completedAt` / `droppedAt` / `dropReason` | | Destroyed by the same delete-and-recreate (R19). |
| `@@unique([studentUserId, seasonId])` (`:355`) | | What makes the bulk action's `upsert` possible (R52). |

The schema comment above the model reads "Append-only history"
(`:338`). `createGroupAction` and `updateGroupAction` violate that (R19).

### `AssignmentTarget` — `apps/backend/prisma/schema.prisma:502-511`

Not written here, but `group` is `onDelete: Cascade` (`:506`), so deleting a
group silently removes it from every assignment that targeted it (R38).
Domain 7 owns the consequence.

### Relations traversed

- `Group.season` → `Season` for `code` / `title` on every list and detail row.
- `Group.leaders` → `GroupLeader` → `User` for `id` / `name` / `email`.
- `Group.students` → `GroupStudent` → `User` for `id` / `name` / `email`.
- `Group._count.students` → the studentCount on the list row (R68).
- `StudentProfile.activeSeasonId` (`:220`) — the sole definition of "who is in
  this season's roster" (R73) and the sole eligibility check in the bulk
  action (R48).

### Enums

This domain writes **no enum** directly. It writes `SeasonEnrollment.status`
only by allowing it to default to `EnrollmentStatus.ACTIVE` (R19, R53) — which
is precisely the problem. `UserRole` is read only by the two pickers (R71).

### Schema/code mismatches

- **`User.name` is non-nullable `String`** (`apps/backend/prisma/schema.prisma:106`),
  yet this domain treats it as nullable throughout: `GroupDetailData.leaders`
  and `.students` type it `string | null` (`src/lib/groups-query.ts:59-60`),
  every render falls back to the email (`groups/[id]/page.tsx:62,84`), and
  `leaderNames` filters falsy values out (`src/lib/groups-query.ts:46`). v2
  inherited it — `GroupMember.name` is `string | null`
  (`packages/shared/src/group.ts:15`). See R67 and §10 item 11.
- **`Group.createdAt`/`updatedAt`, `GroupLeader.assignedAt` and
  `GroupStudent.enrolledAt` are written by defaults and read by nothing** —
  grep across `src/**` outside the generated client returns no reader for any
  of them (R87).

---

## 3. Business rules

`(implicit)` marks a rule enforced by a query's `where`, by which page renders
a control, or by which options a picker offers — not by an explicit check.
Those are the ones a port silently drops.

### The one-group-globally rule — read this first

- **R1.** `GroupStudent.studentUserId` is `@unique` **standalone**, so a student belongs to at most one group across the whole database — not one per season, not one per active season. — `apps/backend/prisma/schema.prisma:330`, confirmed by the singular `groupStudentMembership GroupStudent?` on `User` at `:123`
- **R2.** Every write path enforces R1 by *deleting the student's existing membership first*, never by catching the constraint violation. — `src/lib/group-actions.ts:57-59`, `:135-137`, `:230`
- **R3.** Those deletes are keyed on `studentUserId` alone with **no season or group filter**, so adding a student to a group in season B silently destroys their membership in season A's group. No warning, no count, nothing in the return value. — `src/lib/group-actions.ts:58`, `:136`, `:230`
- **R4.** `SeasonEnrollment.groupId` records the per-season group and is written by all three write paths. — `src/lib/group-actions.ts:73`, `:148`, `:238-239`
- **R5.** `SeasonEnrollment.groupId` is **never consulted** for membership, visibility or authorization anywhere in v1. Its only two readers render a historic group *name*: the student's season-history list and the season export. — `src/lib/season-history-query.ts:31`, `src/lib/season-export.ts:56`
- **R6.** *(implicit)* Consequence: once a student moves to a new season's group, every consumer that resolves "their group" through `GroupStudent` — assignment visibility, the forum peer feed, engagement, submission review scope, `canViewStudent` — sees only the *new* group and nothing of the old one. — `src/lib/assignments-query.ts:203-206`, `src/lib/forum-query.ts:74-81`, `src/lib/engagement.ts:46-49`, `src/lib/auth/permissions.ts:377-381`, `src/lib/auth/permissions.ts:88-93`. Cross-reference **domain 7 R29/R31 and its §10 item 7**, which found the same root cause from the assignment side. Do not re-decide it here; see §10 item 1.
- **R7.** Nothing clears `GroupStudent` when a student leaves a season. `graduateStudentAction` marks the enrollment `COMPLETED` and nulls `activeSeasonId` but leaves the membership row intact. — `src/lib/enrollment-actions.ts:50-67`
- **R8.** Same for withdrawal: `dropEnrollmentAction` sets `WITHDRAWN` / `droppedAt` / `dropReason` and touches nothing else. — `src/lib/enrollment-actions.ts:105-112`
- **R9.** Same for a plain season move: an admin changing a student's `activeSeasonId` on their profile, or the student import setting it, writes only `StudentProfile` — the old `GroupStudent` row survives. — `src/lib/student-actions.ts:126-136`, `src/lib/student-import.ts:212`
- **R10.** *(implicit)* Therefore a graduated, dropped or moved-on student still counts in their old group's `studentCount`, still appears in its detail roster, and is still listed on their leader's "My groups" page. — R7–R9 combined with `src/lib/groups-query.ts:36` and `src/app/leader/groups/page.tsx:40-46`

### Creation — `createGroupAction`

- **R11.** Requires season-admin scope on the target season; SUPER short-circuits true. — `src/lib/group-actions.ts:33` + `src/lib/rbac.ts:28-30`
- **R12.** `name` must be 2–80 characters. — `src/lib/group-actions.ts:17`
- **R13.** `description` is optional, nullable and capped at 2000 characters; `undefined` is normalised to `null`, but an empty string is stored as `""`. — `src/lib/group-actions.ts:18`, `:45`
- **R14.** **`leaderIds` and `studentIds` are never validated.** `groupSchema` covers `name` and `description` only, and the two arrays are read straight off the raw `input`, bypassing the parse entirely. — `src/lib/group-actions.ts:16-19` (schema) vs `:49`, `:55-56`, `:61-62` (raw `input.*`)
- **R15.** *(implicit)* There is **no uniqueness on group name within a season**, no index on `name`, and no duplicate check in the action. Two groups called "Alpha" in the same season are legal. — no unique at `apps/backend/prisma/schema.prisma:297-312`, no check at `src/lib/group-actions.ts:40-78`
- **R16.** *(implicit)* There is **no capacity, quota or size limit** on a group anywhere — not in the schema, not in the actions, not in the form. — `apps/backend/prisma/schema.prisma:297-312`, `src/lib/group-actions.ts:16-19`, `src/components/groups/group-form.tsx:20-25`
- **R17.** *(implicit)* Nothing requires a `leaderId` to belong to a user whose role is `LEADER`, or to a user who is not soft-deleted. The **only** thing enforcing it is which options the picker offers. — `src/lib/groups-query.ts:106` (`role: "LEADER", deletedAt: null`) vs the absence of any check at `src/lib/group-actions.ts:49-54`
- **R18.** *(implicit)* Nothing requires a `studentId` to belong to a `STUDENT`, to a live user, or to a student enrolled in — or even aware of — this season. The picker is the only constraint, and it is **global**, not season-scoped. — `src/lib/groups-query.ts:112-121` vs the absence of any check at `src/lib/group-actions.ts:55-76`
- **R19.** Leader rows are inserted with `skipDuplicates`, so a repeated id in the array is tolerated silently. — `src/lib/group-actions.ts:50-53`
- **R20.** Student rows are **not** inserted with `skipDuplicates`; a duplicate id in `studentIds` throws a unique-constraint error and rolls the whole transaction back. — `src/lib/group-actions.ts:60-65`
- **R21.** Adding students **deletes and recreates** their `SeasonEnrollment` for this season rather than updating it, so `status`, `enrolledAt`, `completedAt`, `droppedAt` and `dropReason` are all reset to their defaults. A `WITHDRAWN` student silently becomes `ACTIVE` again. — `src/lib/group-actions.ts:66-75`
- **R22.** Creation with an empty `studentIds` writes no enrollment at all — the whole block is conditional. — `src/lib/group-actions.ts:55`
- **R23.** Everything runs in one interactive transaction. — `src/lib/group-actions.ts:40-78`
- **R24.** Returns `{ ok: true, groupId }`. — `src/lib/group-actions.ts:83`
- **R25.** Revalidates `/admin/season`, `/admin/groups` and `/super/seasons`; update revalidates only the first two and delete only the first two. The `/super/seasons` revalidation is unique to create. — `src/lib/group-actions.ts:80-82` vs `:154-155` vs `:178-179`
- **R26.** Creating a group notifies nobody — not the leaders named on it, not the students moved into it. — no notification call anywhere in `src/lib/group-actions.ts`

### Update — `updateGroupAction`

- **R27.** A missing group returns `{ ok: false, error: "Group not found." }` rather than throwing. — `src/lib/group-actions.ts:95`
- **R28.** Authorization is checked against the **stored** `seasonId`. — `src/lib/group-actions.ts:91-96`
- **R29.** Only `name` and `description` are written to the `Group` row. `seasonId` is never updated by this or any other code path, so **a group cannot be moved between seasons.** — `src/lib/group-actions.ts:102-108`; grep for `group.update` across `src/**` returns only this call and `src/lib/season-actions.ts:298`'s `group.create`
- **R30.** Leaders are replaced **wholesale**: every `GroupLeader` row is deleted and the submitted set is recreated, on every save, even when the set is unchanged. `assignedAt` is therefore reset for every retained leader. — `src/lib/group-actions.ts:110-116`
- **R31.** Submitting an empty `leaderIds` removes every leader with no confirmation — a group with no leaders is a valid state. — `src/lib/group-actions.ts:110-111` + `src/app/admin/season/[code]/groups/[id]/page.tsx:56-57` (which renders "No leaders assigned.")
- **R32.** Students are **diffed**, not replaced: the current membership is read inside the transaction and only the symmetric difference is written. — `src/lib/group-actions.ts:119-127`
- **R33.** Removing a student deletes their `GroupStudent` row and **leaves `SeasonEnrollment.groupId` pointing at the group they just left.** The enrollment is never touched on the remove path. — `src/lib/group-actions.ts:129-133`
- **R34.** Adding a student repeats the create path verbatim: unscoped membership delete (R3), then the enrollment delete-and-recreate that destroys history (R21). — `src/lib/group-actions.ts:134-150`
- **R35.** All of it is one interactive transaction. — `src/lib/group-actions.ts:101-152`
- **R36.** Returns `{ ok: true }` only — no ids, no counts, no indication of how many students were moved out of other groups. — `src/lib/group-actions.ts:156`
- **R37.** Editing a group notifies nobody. — no notification call in `src/lib/group-actions.ts`

### Delete — `deleteGroupAction`

- **R38.** A missing group returns silently — no error, no redirect. — `src/lib/group-actions.ts:165`
- **R39.** Requires season-admin scope on the stored season. — `src/lib/group-actions.ts:166`
- **R40.** Deletion is a four-statement array transaction: drop leaders, drop memberships, null `SeasonEnrollment.groupId` **for this season only**, delete the group. — `src/lib/group-actions.ts:168-176`
- **R41.** Deletion is a **hard** delete; `Group` has no `deletedAt`. — `src/lib/group-actions.ts:175` + `apps/backend/prisma/schema.prisma:297-312`
- **R42.** Students are **orphaned, not reassigned and not blocked** — they end up with no `GroupStudent` row and a null `SeasonEnrollment.groupId`, and no screen tells anyone. — `src/lib/group-actions.ts:170-174`
- **R43.** Any `SeasonEnrollment` in *another* season still pointing at this group (possible under R3) is missed by the season-scoped `updateMany` and is nulled by the FK's `onDelete: SetNull` instead. Net effect is the same; the explicit statement is redundant. — `src/lib/group-actions.ts:171-174` vs `apps/backend/prisma/schema.prisma:346`
- **R44.** Deleting a group **cascade-deletes its `AssignmentTarget` rows**, so an assignment targeted only at that group ends up with `isAllGroups: false` and zero targets — visible to nobody, with no error. — `apps/backend/prisma/schema.prisma:506`; domain 7's §10 item 6 describes the same end state reached a different way
- **R45.** No confirmation, no impact count, no notification; the action redirects to the season's group list. — `src/lib/group-actions.ts:178-180`
- **R46.** *(implicit)* **`deleteGroupAction` has no caller anywhere in v1.** No page, component or route imports it; no UI renders a delete control. Its behaviour has never run in production. — grep for `deleteGroupAction` across `src/**` returns only its own definition at `src/lib/group-actions.ts:159`

### Bulk assignment — `assignStudentsToGroupsAction`

- **R47.** Requires season-admin scope on the target season. — `src/lib/group-actions.ts:197`
- **R48.** The payload is an array of `{ studentUserId, groupId | null }`, capped at **2000** entries; `groupId` may be null to unassign. — `src/lib/group-actions.ts:183-190`
- **R49.** An empty array returns `{ ok: true }` without writing. — `src/lib/group-actions.ts:201`
- **R50.** Every non-null `groupId` must belong to the target season, checked in one query; a single foreign group rejects the **whole batch**. — `src/lib/group-actions.ts:203-213`
- **R51.** A student is eligible only if their `StudentProfile.activeSeasonId` equals the target season. This is the **only** season-eligibility check in the entire domain — the group form has none (R18). — `src/lib/group-actions.ts:216-223`
- **R52.** Ineligible students are **silently skipped** inside the loop and the action still returns `{ ok: true }`, so a batch that wrote nothing is indistinguishable from one that wrote everything. — `src/lib/group-actions.ts:228`, `:247`
- **R53.** Per student: delete their membership unscoped (R3), then create the new one if `groupId` is non-null. — `src/lib/group-actions.ts:230-235`
- **R54.** The enrollment write is an **`upsert` keyed on `(studentUserId, seasonId)` that updates only `groupId`** — status, `enrolledAt` and drop history survive. This is the opposite of the group form's behaviour (R21). — `src/lib/group-actions.ts:236-240`
- **R55.** That `upsert` **creates** a `SeasonEnrollment` with the default `ACTIVE` status when none exists, so assigning a group is also an enrollment mechanism. — `src/lib/group-actions.ts:239` + `apps/backend/prisma/schema.prisma:347`. Cross-reference **domain 6**.
- **R56.** The whole batch is one interactive transaction with an explicit **20-second** timeout, issuing 2–3 sequential round-trips per student. At the 2000-entry cap that is up to 6000 sequential statements. — `src/lib/group-actions.ts:225-244`
- **R57.** Returns `{ ok: true }` — no count of what was written or skipped. Only the *client* knows how many rows it sent. — `src/lib/group-actions.ts:247` vs `src/components/groups/roster-grid.tsx:85-87`
- **R58.** Revalidates `/admin/season` only — not `/admin/groups`, so a stale group list can survive a bulk reassignment. — `src/lib/group-actions.ts:246`
- Boundary: `commitGroupImportAction` (`src/lib/group-import-actions.ts:55-67`) re-checks `isAdminOfSeason` and then delegates here with `groupId` constrained to positive ints — the import can assign but never unassign. **Domain 16.**

### Leadership and the `groupLeaderIds` claim

- **R59.** `groupLeaderIds` is exactly the set of `GroupLeader.groupId` values for the user — **every season, every season status, no role filter, no ordering**. — `src/lib/auth/scopes.ts:13`, `:22`
- **R60.** v1 loads the scopes into the JWT only on sign-in, on an explicit session `update`, or when the claim is missing entirely — so **adding or removing a leader has no effect on a signed-in user's access until they sign in again.** — `src/lib/auth.ts:76-82`
- **R61.** v2 already fixes that: `rotateRefreshToken` re-issues through `issueSession`, which calls `loadScopes` on every refresh. With a 900-second access-token TTL, a removed leader retains access for at most 15 minutes rather than indefinitely. — `apps/backend/src/lib/auth/tokens.ts:96`, `:110-121`
- **R62.** A group may have any number of leaders and a user may lead groups across many seasons — both follow from the composite PK. — `apps/backend/prisma/schema.prisma:321`
- **R63.** `isLeaderOfGroup` is a **pure claim check** with no database read — it trusts `groupLeaderIds` completely. — `src/lib/rbac.ts:32-34`
- **R64.** `isLeaderInSeason` is database-backed and returns true for SUPER and for season admins as well as actual leaders, so its name understates it. — `src/lib/rbac.ts:36-51`
- **R65.** `canAccessGroup` returns true on `isLeaderOfGroup` **before any role check**, so a `GroupLeader` row grants group-detail access regardless of the holder's `UserRole`. Combined with R17 this is a privilege path. — `src/lib/auth/permissions.ts:77-78`; v2 ported it verbatim at `apps/backend/src/lib/permissions.ts:32-33`
- **R66.** `canAccessGroup` also returns true unconditionally for MENTOR, for **every group in the database**. — `src/lib/auth/permissions.ts:77`
- **R67.** *(implicit)* MENTOR has no group screen: `/leader/groups` is LEADER-gated and the mentor nav has no groups entry — so R66's breadth is invisible on the web and fully exposed the moment an API exists. — `src/lib/navigation.ts:82,89` (only LEADER) and the absence of a groups entry in the mentor nav
- **R68.** *(implicit)* For a STUDENT, `canAccessGroup` resolves membership through the unscoped `GroupStudent` row (R1), so a student who has moved seasons can still read their **old** group's full detail and is denied their **new** season's group list row. — `src/lib/auth/permissions.ts:87-92` vs `src/lib/groups-query.ts:27-29`

### Reads and ordering

- **R69.** `listGroupsForSeason` returns every group of the season ordered by `name` ascending, with **no pagination and no limit**. — `src/lib/groups-query.ts:24-40`, `:31`
- **R70.** *(implicit)* The student narrowing is applied as a `where` on the query (`students: { some: { studentUserId } }`), not as a post-filter — and **the caller decides whether to pass it**. The web page never does; the REST route does, keyed on `user.role === "STUDENT"`. — `src/lib/groups-query.ts:26-30` vs `src/app/admin/season/[code]/groups/page.tsx:28` vs `src/app/api/v1/seasons/[id]/groups/route.ts:23-25`
- **R71.** `studentCount` is `_count.students`, i.e. live `GroupStudent` rows — unfiltered by enrollment status, by `deletedAt`, and by season (R10). — `src/lib/groups-query.ts:36`
- **R72.** `leaderNames` filters out falsy names, so a leader whose `name` is the empty string vanishes from the list row and `leaderNames.length` can be smaller than the true leader count. `studentCount` uses `_count` and is unaffected. — `src/lib/groups-query.ts:46`
- **R73.** The list row carries **no leader ids and no student ids** — names only for leaders, a bare count for students. Any screen needing more must call the detail endpoint. — `src/lib/groups-query.ts:41-49`
- **R74.** `loadGroupById` performs **no authorization at all** and `notFound()`s on a missing row; all five callers gate separately. — `src/lib/groups-query.ts:63-96`, `:84`
- **R75.** Detail orders leaders and students by user `name` ascending and returns each member's `id`, `name` **and `email`**. — `src/lib/groups-query.ts:72-81`, `:93-94`
- **R76.** *(implicit)* Both admin group pages perform a **second** check that `group.seasonId === season.id` and redirect on mismatch, because `loadGroupById` ignores the season code in the URL (R74). — `src/app/admin/season/[code]/groups/[id]/page.tsx:29`, `src/app/admin/season/[code]/groups/[id]/edit/page.tsx:33`
- **R77.** `listLeadersForPicker` returns **every** live `LEADER` in the database, unscoped by season, unbounded, ordered by name. — `src/lib/groups-query.ts:104-110`
- **R78.** `listStudentsForPicker` takes a `seasonId` and **explicitly discards it** (`void seasonId`), returning every live `STUDENT` in the database. The comment says this is deliberate, "so admins can enroll new students into a group when creating it". — `src/lib/groups-query.ts:112-121`, `:115`
- **R79.** *(implicit)* The picker's promise that "UI shows current group membership separately" (`groups-query.ts:113-114`) is **not kept** — `MultiSelect` receives only `id`, `name` and `email`, so an admin cannot see that a student they are about to add is already in another season's group. — `src/components/groups/group-form.tsx:62-66`
- **R80.** `listGroupsForSelect` returns `{ id, name }` for the season, name-ascending — a strict subset of `listGroupsForSeason`. — `src/lib/groups-query.ts:128-134`
- **R81.** `listSeasonRoster` defines "this season's students" as **`StudentProfile.activeSeasonId === seasonId`**, not as `SeasonEnrollment` — excluding soft-deleted profiles and soft-deleted users, ordered by name. A student enrolled in the season whose active season has moved on does not appear. — `src/lib/groups-query.ts:143-148`
- **R82.** The roster's membership lookup is scoped `group: { seasonId }`, so a student whose (global, R1) group belongs to another season is reported as **`groupId: null` — unassigned** — even though a `GroupStudent` row exists. — `src/lib/groups-query.ts:151-155`, `:161`
- **R83.** The roster is two sequential queries joined in memory — not an N+1, but not one round trip either. It early-returns before the second query when there are no students. — `src/lib/groups-query.ts:144-155`, `:149`
- **R84.** *(implicit)* The leader's "My groups" page uses a **hand-rolled query narrowed by `user.groupLeaderIds`** — the narrowing *is* the authorization; there is no gate function and no action underneath. This is the exact pattern the migration brief warns about, and it is the pattern that produced the attendance defect in domain 4. — `src/app/leader/groups/page.tsx:32-33`
- **R85.** *(implicit)* That query applies **no season filter and no season-status filter**, so a leader sees groups from archived and completed seasons alongside the current one, ordered by group name across all of them. — `src/app/leader/groups/page.tsx:32-34`
- **R86.** It returns each group's full student list with `id`, `name` and `email`, ordered by student name, and links each student to `/leader/students/[id]`. — `src/app/leader/groups/page.tsx:40-46`, `:77-79`
- **R87.** A leader with an empty `groupLeaderIds` sees an empty state and **no query is issued**. — `src/app/leader/groups/page.tsx:16-30`
- **R88.** *(implicit)* The student's group card reads `groupStudent.findUnique({ where: { studentUserId } })` with **no season filter**, on a page titled "Current season" that renders that group beside the current season's progress. A student who moved seasons sees their previous group presented as their current one. — `src/app/student/season/page.tsx:63-83`, `:91`, `:113`
- **R89.** *(implicit)* That card shows each **leader's email** (as a `mailto:` link, but only when the leader has a name) and each **peer's name and id but not their email** — a narrower shape than `loadGroupById` serves to the same student over REST (R75). — `src/app/student/season/page.tsx:163-183` vs `:194-214` vs `src/lib/groups-query.ts:75-79`
- **R90.** *(implicit)* That card's leader and student relations carry **no `orderBy`** — the order is whatever Postgres returns, unlike the detail read (R75). — `src/app/student/season/page.tsx:71-77`
- **R91.** `/admin/groups` is a **redirect**, not a page: it resolves the newest non-deleted season the user administers by `startDate` descending and redirects to that season's group list, rendering a bare header when there is none. Unlike the equivalent calendar redirect it does **not** filter on `status: ACTIVE` and is **not** open to SUPER. — `src/app/admin/groups/page.tsx:12`, `:25-40`
- **R92.** *(implicit)* Only `deletedAt: null` is filtered there, and only `ADMIN` passes `requireRole` — a SUPER user hitting `/admin/groups` is rejected outright. — `src/app/admin/groups/page.tsx:12`, `:26`

### Form-level rules the server does not repeat

- **R93.** *(implicit)* The form requires a name of 2 or more characters with **no upper bound**, while the action caps it at 80 — an 81-character name passes client validation and is rejected by the server. — `src/components/groups/group-form.tsx:21` vs `src/lib/group-actions.ts:17`
- **R94.** *(implicit)* The form's description cap (2000) matches the server's. — `src/components/groups/group-form.tsx:22` vs `src/lib/group-actions.ts:18`
- **R95.** *(implicit)* The form places **no minimum and no maximum** on the number of leaders or students. Zero leaders and zero students is a valid submission in both modes. — `src/components/groups/group-form.tsx:23-24`
- **R96.** *(implicit)* Ids round-trip through the form as **strings** and are cast back with `Number` on submit; a non-numeric option value would become `NaN` and reach the unvalidated arrays (R14). — `src/components/groups/group-form.tsx:58,63,79-80,90-91`
- **R97.** *(implicit)* Both create and edit redirect to the season's **group list**, not to the group just saved — so an admin who creates a group never lands on it. — `src/components/groups/group-form.tsx:107`
- **R98.** *(implicit)* The only warning that R3 exists anywhere in the product is one line of form helper text: "Adding a student here will move them out of any other group." It does not say which group, or that the enrollment is rewritten. — `src/components/groups/group-form.tsx:148`
- **R99.** *(implicit)* Server-side field errors are mapped back onto the form by dotted path, first issue per field wins. Since only `name` and `description` are validated (R14), the two arrays can never produce a field error. — `src/lib/group-actions.ts:250-257` + `src/components/groups/group-form.tsx:100-104`

### Roster-grid rules

- **R100.** *(implicit)* The grid submits only the students whose selection differs from the baseline, so an unchanged roster sends nothing. — `src/components/groups/roster-grid.tsx:46`, `:75-77`
- **R101.** *(implicit)* On success the client advances its own baseline and reports `changed.length` as "Updated N students" — a count of what it *sent*, not of what the server wrote (R52). — `src/components/groups/roster-grid.tsx:84-87`
- **R102.** *(implicit)* "Unassigned" is a sentinel string `"none"` mapped to `null` on the way out. — `src/components/groups/roster-grid.tsx:28`, `:72`
- **R103.** *(implicit)* With zero students the grid renders an empty state that names `activeSeasonId` as the cause; with students but zero groups it renders a different empty state linking to group creation. — `src/components/groups/roster-grid.tsx:48-56`, `:58-69`
- **R104.** The whole grid is unpaginated — every student in the season is rendered at once, each with a `Select` of every group. — `src/components/groups/roster-grid.tsx:104-137`

### Time

- **R105.** This domain stores four timestamps (`Group.createdAt`/`updatedAt`, `GroupLeader.assignedAt`, `GroupStudent.enrolledAt`) and **reads none of them**. No group screen renders a date, and no group rule depends on one. — grep across `src/**` outside the generated client returns no reader
- **R106.** Consequently the timezone problem that cuts across domains 3 and 4 **does not apply here**. The only time-shaped rule this domain touches is the season-window rule it inherits by writing `SeasonEnrollment.enrolledAt` via a default (R21, R55) — evaluated in the **server's** clock, and never displayed by this domain. Cross-reference **domain 6**, which does render enrollment dates (`src/lib/season-history-query.ts:27`).

### Writes performed during a GET

- **R107.** **None found in this domain.** Every group page is a pure read; the one v1 read-time write the brief warns about (`ensureDraftSubmission`) is domain 7/8's. — `src/app/admin/season/[code]/groups/**`, `src/app/leader/groups/page.tsx`, `src/app/student/season/page.tsx:63-83` contain no `create`/`update`/`upsert` call

**107 numbered rules, of which 29 are `(implicit)`:** R6, R10, R15, R16, R17,
R18, R46, R67, R68, R70, R76, R79, R84, R85, R88, R89, R90, R92, R93, R94, R95,
R96, R97, R98, R99, R100, R101, R102, R103.

---

## 4. Authorization

Role gates are pure functions over token claims (`rbac.ts`); row-scoped gates
need a database read (`permissions.ts`).

| Operation | Roles | Row-scoped condition | v1 citation |
|---|---|---|---|
| Create group | ADMIN, SUPER | `isAdminOfSeason(user, seasonId)` — SUPER short-circuits true | `src/lib/group-actions.ts:33`, `src/lib/rbac.ts:28-30` |
| Update group | ADMIN, SUPER | `isAdminOfSeason` on the group's **stored** season | `src/lib/group-actions.ts:96` |
| Delete group | ADMIN, SUPER | `isAdminOfSeason` on the stored season | `src/lib/group-actions.ts:166` |
| Bulk-assign students | ADMIN, SUPER | `isAdminOfSeason` on the path season, **plus** every group in the payload belonging to it (R50) **plus** every student's `activeSeasonId` matching it (R51) | `src/lib/group-actions.ts:197`, `:203-213`, `:216-223` |
| Import group assignments | ADMIN, SUPER | `isAdminOfSeason`, checked twice — once in the preview action, once in the commit — then again by the bulk action | `src/lib/group-import-actions.ts:24`, `:59` |
| Choose a leader | — | **nothing** — any `userId` is accepted (R17) | absent from `src/lib/group-actions.ts:49-54` |
| Choose a student | — | **nothing** — any `userId` is accepted (R18) | absent from `src/lib/group-actions.ts:55-76` |
| Read season group list (web) | ADMIN, SUPER | `canEditSeason` — page-level, redirects to `/admin/season` | `src/app/admin/season/[code]/groups/page.tsx:23,26` |
| Read season group list (REST) | any authenticated | `canAccessSeason` — SUPER, MENTOR, season admin, leader of a group in the season, or a student with **any** enrollment; students are additionally narrowed to their own group | `src/app/api/v1/seasons/[id]/groups/route.ts:19`, `:23-25` + `src/lib/auth/permissions.ts:45-71` |
| Read group detail (lib) | — | **none** — `loadGroupById` is ungated (R74) | `src/lib/groups-query.ts:63-96` |
| Read group detail (admin page) | ADMIN, SUPER | `canEditSeason` **plus** an explicit `group.seasonId === season.id` check that redirects on mismatch (R76) | `src/app/admin/season/[code]/groups/[id]/page.tsx:23,26,29` |
| Read group detail (REST) | any authenticated | `canAccessGroup` — SUPER, MENTOR (any group, R66), anyone holding a `GroupLeader` row for it regardless of role (R65), the season's admins, or the student whose global membership matches (R68) | `src/app/api/v1/groups/[id]/route.ts:16` + `src/lib/auth/permissions.ts:73-96` |
| Read own led groups | LEADER | `where: { id: { in: user.groupLeaderIds } }` — **the query is the gate** (R84) | `src/app/leader/groups/page.tsx:14,32-33` |
| Read own group (student) | STUDENT | `groupStudent.findUnique` on own id, **unscoped by season** (R88) | `src/app/student/season/page.tsx:23,63-64` |
| Read season roster | ADMIN, SUPER | `canEditSeason` | `src/app/admin/season/[code]/roster/page.tsx:23,26` |
| Read leader / student pickers | ADMIN, SUPER | `canEditSeason` on the page; the queries themselves are **global and ungated** (R77, R78) | `src/app/admin/season/[code]/groups/new/page.tsx:22,25` + `src/lib/groups-query.ts:104-121` |

### Where v1 enforces nothing and relies on the UI

These become real gates in v2:

1. **`loadGroupById` has no authorization** (R74). Five callers gate
   independently and two need a *second* check because the loader ignores the
   season code in the URL (R76). In v2 the season-scope check belongs inside
   the endpoint. The already-shipped `GET /api/v1/groups/:id`
   (`apps/backend/src/routes/groups.ts:13-52`) does gate — on `canAccessGroup`,
   which is a *different and much broader* rule than the admin page's
   `canEditSeason` + season match.
2. **The leader's group list is authorized by a `where` clause and nothing
   else** (R84). There is no `canListMyGroups`, no action, no gate function —
   the claim is spliced into the query. When this becomes `GET /api/v1/groups`,
   the narrowing must move *inside* the handler and be non-optional. If it is
   ever expressed as a caller-supplied filter (the shape `listGroupsForSeason`
   already uses for students, R70), a leader can drop it and enumerate every
   group in the database.
3. **Leader eligibility is enforced by a `<MultiSelect>`'s option list**
   (R17). `listLeadersForPicker`'s `role: "LEADER", deletedAt: null` filter is
   the *only* thing preventing an admin — or any client posting to the action —
   from writing a `GroupLeader` row for a STUDENT. That row then populates
   `groupLeaderIds` (R59), and `canAccessGroup` honours it **before checking
   the role** (R65). v2 must validate the target user's role server-side.
4. **Student eligibility is enforced by a picker that does not even filter by
   season** (R18, R78). The bulk action has the season check (R51); the group
   form does not. Two write paths, two different rules, one of which is empty.
5. **MENTOR can read any group in the database** (R66) and no v1 screen ever
   exercises it (R67). The moment `/groups/:id` is a real endpoint — and it
   already is — that breadth is live.
6. **`/admin/groups` rejects SUPER** (R92). Harmless as a web redirect;
   in a flat v2 route tree where `/groups` serves both roles, it must not be
   ported.

---

## 5. Read surface

### `listGroupsForSeason(seasonId, { onlyStudentUserId })` — `src/lib/groups-query.ts:20-50`

Returns `GroupListRow[]`: `id`, `name`, `description`, `studentCount`,
`leaderNames`, `seasonCode`, `seasonTitle`.

- Ordering: `name` ascending (`:31`), backed by no index.
- Window: none. Every group of the season, no pagination (R69).
- Per-role shape: **identical for every role** — the only variation is *which
  rows* come back, via `onlyStudentUserId` (R70).
- Not an N+1: `_count`, `leaders` and the `season` join are one query.
- Lossy: `leaderNames` drops empty names (R72) and carries no leader ids, so a
  screen cannot link a leader's name to their profile (R73).
- Ported verbatim to v2 at `apps/backend/src/lib/queries/groups.ts:18-46`.

### `loadGroupById(id)` — `src/lib/groups-query.ts:63-96`

Returns `GroupDetailData`: the list fields minus `studentCount`/`leaderNames`,
plus `seasonId` and full `leaders[]` / `students[]` arrays of
`{ id, name, email }`, each name-ascending (R75). `notFound()` on a missing
row. **No authorization** (R74). Ported to v2 as an inline query in
`apps/backend/src/routes/groups.ts:22-51` rather than a shared query module —
the only read in the domain that v2 did not lift into `lib/queries/`.

### `listLeadersForPicker()` — `src/lib/groups-query.ts:104-110`

Every live `LEADER` in the database, `{ id, name, email }`, name-ascending. No
season scope, no limit (R77). This is a **user-directory read** and belongs to
domain 11 in v2, not here — see §7.

### `listStudentsForPicker(seasonId)` — `src/lib/groups-query.ts:112-121`

Every live `STUDENT` in the database. The `seasonId` argument is accepted and
discarded (`void seasonId`, `:115`) — deliberately, per the comment (R78).
Also a user-directory read.

### `listGroupsForSelect(seasonId)` — `src/lib/groups-query.ts:128-134`

`{ id, name }` for the season, name-ascending. A strict subset of
`listGroupsForSeason` (R80) — in v2 it should not be a second endpoint.

### `listSeasonRoster(seasonId)` — `src/lib/groups-query.ts:143-163`

`{ userId, name, email, groupId }[]` for every student whose `activeSeasonId`
is this season (R81), name-ascending. Two sequential queries joined by a `Map`
(R83). The second is scoped `group: { seasonId }`, which is what makes a
cross-season membership read back as unassigned (R82). **Not ported to v2.**

### The leader's hand-rolled query — `src/app/leader/groups/page.tsx:32-47`

Groups whose `id` is in `groupLeaderIds`, each with `season.title`/`code` and
the full student list (`id`, `name`, `email`, name-ascending). No season
filter, no status filter, no pagination (R85, R86). **Not ported to v2**, and
it is what the LEADER `/groups` tab needs.

### The student's hand-rolled query — `src/app/student/season/page.tsx:63-83`

One `groupStudent.findUnique` on the caller's own id, unscoped by season
(R88), returning the group with its leaders (name + email) and peers
(id + name), both unordered (R89, R90). **Not ported to v2.**

---

## 6. Write surface

### `createGroupAction(seasonId, input)` — `src/lib/group-actions.ts:28-84`

- **Inputs:** `name`, `description?`, `leaderIds: number[]`, `studentIds: number[]`.
- **Validation:** R12–R13 only. The two arrays are unvalidated (R14).
- **Writes:** one `Group`; up to N `GroupLeader` (`skipDuplicates`); up to M
  `GroupStudent`; up to M `SeasonEnrollment` — the last two preceded by
  `deleteMany`s (R2, R21).
- **Cascades:** destroys any existing membership of every listed student, in
  any season (R3), and destroys their enrollment history for this season (R21).
- **Notifies:** nothing (R26).
- **Returns:** `{ ok: true, groupId }`.
- **Atomicity:** good — one interactive transaction (R23).

### `updateGroupAction(groupId, input)` — `src/lib/group-actions.ts:86-157`

- **Inputs:** the same four fields; `groupId` from the path.
- **Validation:** identical to create; still no validation of the arrays.
- **Writes:** one `Group` update (name/description only, R29); **all**
  `GroupLeader` rows deleted and recreated (R30); the student **diff** applied
  (R32–R34).
- **Cascades:** removals leave `SeasonEnrollment.groupId` stale (R33);
  additions repeat create's two destructive steps (R34).
- **Notifies:** nothing (R37).
- **Returns:** `{ ok: true }` — no ids, no counts (R36).
- **Atomicity:** good, one transaction (R35). But note the read-inside-write
  at `:119-122`: the current membership is read and diffed inside the
  transaction, which under Postgres's default `READ COMMITTED` does not prevent
  a concurrent bulk assignment from interleaving.

### `deleteGroupAction(groupId)` — `src/lib/group-actions.ts:159-181`

- **Inputs:** id only.
- **Writes:** four statements in an array transaction (R40).
- **Cascades:** `AssignmentTarget` rows cascade away silently (R44); students
  are orphaned (R42).
- **Notifies:** nothing.
- **Returns:** `void`, then `redirect()` (R45).
- **Unreachable in v1** (R46).

### `assignStudentsToGroupsAction(seasonId, assignments)` — `src/lib/group-actions.ts:192-248`

- **Inputs:** season id and up to 2000 `{ studentUserId, groupId | null }`.
- **Validation:** R48, R50, R51 — the most validated write in the domain.
- **Writes:** per eligible student, a `deleteMany` + optional `create` on
  `GroupStudent` and an `upsert` on `SeasonEnrollment` (R53, R54).
- **Cascades:** cross-season memberships destroyed (R3).
- **Notifies:** nothing.
- **Returns:** `{ ok: true }` with no counts, even when every entry was
  skipped (R52, R57).
- **Atomicity:** one transaction with a 20s timeout, but a **sequential
  per-row loop** rather than batched statements — the least scalable write in
  the domain (R56).

### Group writes outside this module

`duplicateSeasonAction` (`src/lib/season-actions.ts:296-303`) creates groups
directly inside the season-duplication transaction, copying **name and
description only** — no leaders, no students, no enrollments. It bypasses
`groupSchema` entirely. Unlike its treatment of `recurrenceGroupId` (domain 3
§10 item 1) this is the *safe* choice; see §10 item 12.

---

## 7. Proposed API

Envelope per `CLAUDE.md`: `{ "data": ... }` / `{ "error": { "code", "message" } }`.

### Verdict on the "read done" claim

**Literally true, and misleading.** The design doc defines "read done" as "the
`/api/v1` GET endpoints exist from the completed port"
(`docs/superpowers/specs/2026-08-21-full-migration-design.md:135-136`). v1 had
exactly two group GETs under `/api/v1` — `src/app/api/v1/seasons/[id]/groups/route.ts`
and `src/app/api/v1/groups/[id]/route.ts` — and both are ported:
`apps/backend/src/routes/seasons.ts:121-133` and
`apps/backend/src/routes/groups.ts:13-52`. By the doc's own definition the
claim holds. Unlike domains where a sibling author found the equivalent claim
false, nothing here is missing *relative to what v1's REST surface was*.

What it does not mean is that the domain's reads are done. v1 has **seven**
distinct group reads (§5); two have endpoints. The five without one are
`listSeasonRoster`, `listGroupsForSelect`, `listLeadersForPicker`,
`listStudentsForPicker`, and the leader's hand-rolled "my groups" query. That
last omission is load-bearing: **`packages/shared/src/navigation.ts:93,100`
already gives LEADER a `/groups` tab, and no endpoint in v2 can serve it.**
`GET /seasons/:id/groups` requires a season id a leader does not have and
returns rows without student lists; `GET /groups/:id` serves one group at a
time. The leader's primary destination is unbuildable today.

Two defects also shipped inside the two ported reads — see "Gaps in the
existing shapes" below.

### Endpoints

| Method | Path | Status | Auth | Request | Response |
|---|---|---|---|---|---|
| GET | `/api/v1/seasons/:id/groups` | **exists** — `apps/backend/src/routes/seasons.ts:121-133` | `canAccessSeason`; students narrowed to their own group | — | `{ groups: GroupListItem[] }` |
| GET | `/api/v1/groups/:id` | **exists** — `apps/backend/src/routes/groups.ts:13-52` | `canAccessGroup` | — | `GroupDetail`; see gaps below |
| GET | `/api/v1/groups` | **new** | any authenticated; result set derived from role, **never from a query param** | `?seasonId` (optional filter, never a widener) | `{ groups: LeaderGroup[] }` — group + season + full member list. Serves the LEADER `/groups` tab (R84–R86) and the STUDENT "my group" card (R88–R90) |
| POST | `/api/v1/seasons/:id/groups` | **new** | `isAdminOfSeason` | `name`, `description?`, `leaderIds`, `studentIds` | `{ group: GroupDetail, movedFromOtherGroups: MembershipMove[] }` — the moves are what R3/R98 never surfaced |
| PATCH | `/api/v1/groups/:id` | **new** | `isAdminOfSeason` on the stored season | same body | `{ group: GroupDetail, movedFromOtherGroups: MembershipMove[] }` |
| DELETE | `/api/v1/groups/:id` | **new** | `isAdminOfSeason` | — | `{ orphanedStudentIds: number[], untargetedAssignmentIds: number[] }` — R42 and R44 made visible |
| GET | `/api/v1/groups/:id/impact` | **new** | `isAdminOfSeason` | — | `{ studentCount, leaderCount, assignmentsTargetingOnlyThisGroup }` — powers the delete confirmation v1 never had (R45) |
| GET | `/api/v1/seasons/:id/roster` | **new** | `isAdminOfSeason` | `?page`, `?q` | `{ students: SeasonRosterRow[] }` — ports `listSeasonRoster` (R81–R83); paginated, unlike v1 (R104) |
| PUT | `/api/v1/seasons/:id/group-assignments` | **new** | `isAdminOfSeason` | `{ assignments: [{ studentUserId, groupId \| null }] }`, ≤500 | `{ assigned: number, unassigned: number, skipped: [{ studentUserId, reason }] }` — fixes R52 and R57 |

### Where the existing shapes do not match what the screens need

Two gaps in `GET /api/v1/groups/:id` (`apps/backend/src/routes/groups.ts:13-52`).
Both are faithful ports of v1's own REST route, which itself is more permissive
than v1's web pages — so fixing them is a deliberate divergence, not a port
error.

1. **Every member's email is returned to every caller who passes
   `canAccessGroup`** (`apps/backend/src/routes/groups.ts:35`). Since
   `canAccessGroup` admits the group's own students (R68), a student calling
   this endpoint receives **their peers' email addresses** — which v1's student
   group card deliberately withheld (R89). Withhold `email` on the `students[]`
   array when the caller is a STUDENT, mirroring the `includeCheckInToken`
   pattern domain 3 established (`packages/shared/src/session.ts:18-22`).
   Leader emails may stay: v1 showed those to students (R89).
2. **`canAccessGroup` trusts a `GroupLeader` row over the caller's role**
   (`apps/backend/src/lib/permissions.ts:32-33`, R65) and admits MENTOR to
   every group in the database (`:32`, R66). Neither was observable on the web
   (R67). Add `user.role === "LEADER"` to the leader branch, and decide whether
   MENTOR's read-all-students scope should extend to group *rosters* — it is a
   product question, not a port question.

One gap in `GET /api/v1/seasons/:id/groups`
(`apps/backend/src/routes/seasons.ts:130-131`): the student narrowing is
correct, but it is expressed as an **option the caller supplies**
(`onlyStudentUserId: user.role === "STUDENT" ? user.userId : undefined`,
inherited from `src/lib/groups-query.ts:22`). It happens to be derived from the
token here, which is safe. Keep it that way and never expose it as a query
parameter — R70 is one refactor away from becoming a leak.

### Why `GET /api/v1/groups` is new rather than reusing the season route

The leader's list is a union across seasons resolved from a token claim (R84,
R85), and the student's is a single row resolved from their own membership
(R88) — neither has a season id to put in a path, and the season route returns
list rows without member lists (R73), which is exactly what both screens
render. One role-derived list endpoint replaces both hand-rolled queries and
removes the last two places where a `where` clause *is* the authorization.

### Endpoints this domain needs but should not own

The two pickers (R77, R78) are **user-directory reads**: "every live LEADER"
and "every live STUDENT". They belong to **domain 11 (Invites & users)** as a
`GET /api/v1/users?role=&q=` with pagination and search — a phone cannot render
an unbounded `MultiSelect` of every student in the database. This domain should
consume that endpoint, not define a second one. Flagged, not specced.

---

## 8. Proposed shared contracts

Target file: `packages/shared/src/group.ts` (already exists, 28 lines, **all
bare interfaces**).

### Existing bare interfaces — convert to Zod as part of this domain

Per the convention in `CLAUDE.md` ("Domain contracts are Zod, not bare
interfaces… the remaining interfaces predate this and should convert as each
domain lands"). This file has **no** Zod at all, so all three convert here.

- **`GroupListItem`** (`packages/shared/src/group.ts:3-11`) → `groupListItemSchema`.
  Same seven fields. Document R72 in the schema itself the way
  `session.ts:18-22` documents the check-in token: `leaderNames` is names only,
  drops empty names, and carries no ids.
- **`GroupMember`** (`:13-17`) → `groupMemberSchema`. `name` should become
  non-nullable to match `User.name` (`apps/backend/prisma/schema.prisma:106`) —
  but only in the same change that fixes the null-handling in the two hand-rolled
  reads. See §10 item 11. `email` becomes **nullable** so the endpoint can
  withhold it from students (§7 gap 1).
- **`GroupDetail`** (`:19-28`) → `groupDetailSchema`, composing
  `groupMemberSchema`.

### Existing schemas to reuse, not redefine

- **`UserRole`** from `packages/shared/src/enums.ts` — the leader-role check
  (§4 item 3) must use it rather than a local string literal.
- Any season-identity fields (`seasonCode`, `seasonTitle`) already carried by
  domain 2's contracts — do not re-derive their shape here.

### New schemas this domain needs

| Name | Fields | Notes |
|---|---|---|
| `groupWriteRequestSchema` | `name` (2–80), `description` (nullable, ≤2000), `leaderIds` (int array, ≤50), `studentIds` (int array, ≤200) | Serves both create and update. Closes R14 — the arrays enter the schema for the first time. The caps are **new**: v1 has none (R95). Must be refined so ids are unique within each array, replacing R19's silent `skipDuplicates` and R20's thrown constraint error with one explicit rule. |
| `groupMemberEligibilitySchema` | — | Not a schema, a **server-side rule** the endpoint applies after parsing: every `leaderId` resolves to a live user whose role is `LEADER`; every `studentId` resolves to a live `STUDENT`. Named here so it is not forgotten — it is R17 and R18 turned into code. |
| `leaderGroupSchema` | `id`, `name`, `description`, `seasonId`, `seasonCode`, `seasonTitle`, `seasonStatus`, `students: GroupMember[]` | For `GET /groups`. `seasonStatus` is **new** — v1 shows archived seasons' groups with nothing distinguishing them (R85). |
| `membershipMoveSchema` | `studentUserId`, `studentName`, `fromGroupId`, `fromGroupName`, `fromSeasonCode` | The return value R3 never had. Lets the mobile screen say "3 students were moved out of GBV-2025 / Alpha" instead of one line of static helper text (R98). |
| `seasonRosterRowSchema` | `userId`, `name`, `email`, `groupId` (nullable), `groupSeasonCode` (nullable) | Ports `listSeasonRoster`. `groupSeasonCode` is **new** and fixes R82: a student whose group is in another season currently reads back as plain "unassigned", which is a lie the admin acts on. |
| `groupAssignmentsRequestSchema` | `assignments: [{ studentUserId, groupId: int \| null }]`, ≤500 | Ports R48 with a lower cap (R56 — v1's 2000 cannot finish inside its own 20s timeout). |
| `groupAssignmentsResponseSchema` | `assigned`, `unassigned`, `skipped: [{ studentUserId, reason }]` | Fixes R52 and R57. `reason` is an enum: `not_in_season`, `group_not_in_season`, `unknown_student`. |
| `groupDeleteResponseSchema` | `orphanedStudentIds`, `untargetedAssignmentIds` | Makes R42 and R44 visible. |
| `groupImpactSchema` | `studentCount`, `leaderCount`, `assignmentsTargetingOnlyThisGroup` | Powers the delete confirmation (R45). |

### Client-side query keys

`apps/mobile/src/lib/query-keys.ts:22-33` currently has one factory,
`sessions`. This domain adds a `groups` factory: `groups.all`,
`groups.lists()`, `groups.bySeason(seasonId)`, `groups.mine()`,
`groups.detail(id)`, and `seasons.roster(seasonId)`.

Because of R3, **a group mutation can invalidate a group the client never
touched** — adding a student to group A silently changes group B's membership
and B's `studentCount`. Every group write must therefore invalidate
`queryKeys.groups.all`, never a single leaf, and the same mutation must also
invalidate whatever domain 7 keys assignment visibility on, since R6 means the
student's visible assignment set just changed. That cross-domain invalidation
is the practical cost of R1 and should be agreed with domain 7 before either
is built.

---

## 9. Screens

The v2 tree is flat: one route per destination with role branches inside.
`/groups` exists as a placeholder (`apps/mobile/app/(app)/groups.tsx:1-9`) and
is in the nav for **ADMIN and LEADER only** — SUPER, STUDENT, MENTOR and ALUMNI
have no groups entry (`packages/shared/src/navigation.ts:74,83,93,100`, and
absent from the SUPER/STUDENT/MENTOR/ALUMNI blocks at `:47-67`, `:108-126`,
`:128-142`, `:145-160`). That mirrors v1 exactly
(`src/lib/navigation.ts:63,72,82,89`).

| v1 page(s) | v2 route | Exists? | Roles | Notes |
|---|---|---|---|---|
| `admin/groups` (redirect), `admin/season/[code]/groups`, `leader/groups` | `/groups` | **placeholder** — `apps/mobile/app/(app)/groups.tsx` renders only an `EmptyState` | ADMIN, SUPER, LEADER | Three v1 files, two branches. The admin branch needs a season selector where v1 used a redirect (R91); the leader branch needs `GET /groups`, which does not exist. |
| `admin/season/[code]/groups/[id]` | `/groups/[id]` | **does not exist** | ADMIN, SUPER, LEADER, MENTOR | The season-match check (R76) moves server-side. Student email suppression per §7 gap 1. |
| `admin/season/[code]/groups/new` | `/groups/new` | **does not exist** | ADMIN, SUPER | Needs a season param; default to the admin's newest non-deleted season (R91's logic, moved server-side). The two member pickers need domain 11's paginated user endpoint — this screen is **blocked on domain 11**, not on this domain. |
| `admin/season/[code]/groups/[id]/edit` | `/groups/[id]/edit` | **does not exist** | ADMIN, SUPER | Must show the `movedFromOtherGroups` preview before submitting (R3, R98) and must warn that saving replaces every leader (R30). |
| `admin/season/[code]/roster` | `/groups/roster` | **does not exist** | ADMIN, SUPER | The bulk-assign grid. Must paginate (R104) and must distinguish "unassigned" from "in another season's group" (R82). |
| `admin/season/[code]/roster/import` | — | — | ADMIN, SUPER | **Domain 16.** Commits through this domain's bulk endpoint. |
| `student/season` (group card) | `/season` (group section) | exists as a stub — `apps/mobile/app/(app)/season.tsx` | STUDENT | Not a `/groups` destination — v1 put the group card inside the season page and v2's nav keeps it there (`navigation.ts:111`). Consumes `GET /groups` (the single-row branch). |
| — | `/groups/[id]/attendance` | — | — | **Domain 4.** Not a group screen. |

### What branches inside `/groups`

| Role | Data | Branch behaviour |
|---|---|---|
| ADMIN | `GET /seasons/:id/groups` for the chosen season | v1 forced one season via a redirect (R91). On mobile, resolve the default server-side and let the user switch, rather than porting a redirect. Rows show name, leader names, student count (R69–R73) — tapping needs the detail route, which does not exist. |
| SUPER | same, with the season unconstrained | v1 **rejected** SUPER from `/admin/groups` (R92); it reached the per-season list only through a season page. Do not port the rejection. |
| LEADER | `GET /groups` | Empty state and **no fetch** when `groupLeaderIds` is empty (R87) — pass `enabled` per the mobile convention (`apps/mobile/src/hooks/use-sessions.ts:27-32`). Groups from archived seasons must be visually separated (R85). |
| MENTOR | — | No `/groups` in the mentor nav, but `canAccessGroup` admits them to every group (R66). The route is reachable by deep link, so it needs a deliberate answer — either a real mentor branch or a "not available for your role" state, not a crash. |
| STUDENT / ALUMNI | — | No `/groups` entry. The student's group lives in `/season`. Deep-linking `/groups` needs the same graceful state. |

---

## 10. Open questions and divergences

Ordered by how much damage a faithful port would do.

### 1. One group per student, globally — **decide before writing any membership code**

R1–R10. `GroupStudent.studentUserId` is standalone `@unique`
(`apps/backend/prisma/schema.prisma:330`). A student has one group in the
entire database. `SeasonEnrollment.groupId` records the per-season group, is
written by all three write paths (R4), and is consulted for **nothing** — only
two display sites read it, both rendering a name (R5).

The consequences compound:

- Adding a student to a new season's group **silently destroys** their previous
  membership, with no warning beyond one line of form helper text (R3, R98).
- Every visibility read then resolves "their group" to the new one, so
  group-targeted assignments, the forum peer feed, engagement and leader
  visibility for the **previous** season all go dark (R6). This is domain 7's
  §10 item 7, reached from the other side.
- Nothing clears the membership when a student graduates, is dropped, or has
  their `activeSeasonId` moved (R7–R9), so the *inverse* also happens: a
  student who left months ago still counts in their old group's `studentCount`,
  still appears on the leader's page, and still shows on their own "Current
  season" card as if nothing changed (R10, R88).
- The season roster papers over it by reporting a cross-season member as
  plain "unassigned" (R82), which is what an admin then acts on.

**Recommendation.** This is a schema-shaped problem and the schema is frozen
(`CLAUDE.md`: no migrations here). The interim answer must be a **read-side
convention applied consistently across domains 5, 6 and 7**: resolve
membership from `SeasonEnrollment.groupId` for any season that is not the
student's active one, and from `GroupStudent` only for the active season. Both
this spec and domain 7's independently arrived at that shape; **it should be
ratified once, by domain 6 (Students & enrollment), and then referenced — not
decided three times.** Separately, and independently: every write that moves a
student must *return* what it moved them out of (`membershipMoveSchema`, §8),
because today nothing does.

### 2. `leaderIds` and `studentIds` bypass validation entirely — a privilege path

R14, R17, R18. `groupSchema` covers `name` and `description`; both id arrays
are read off the raw input (`src/lib/group-actions.ts:16-19` vs `:49,55,61`).
The only constraint on *who* may be named is which options the picker renders
(`src/lib/groups-query.ts:106,117`).

Writing a `GroupLeader` row for a STUDENT puts that group into their
`groupLeaderIds` at their next sign-in (R59), and `canAccessGroup` honours the
row **before checking the role** (R65) — so they can read the group's full
roster with every member's email over `GET /api/v1/groups/:id`, which is live
in v2 today (`apps/backend/src/routes/groups.ts:13-52`). Other gates
(`canMarkAttendance`, `canViewStudent`, `getVisibleStudents`) do re-check the
role, so the blast radius stops at group detail — but it stops there by
accident, not by design.

**Recommendation:** put both arrays in `groupWriteRequestSchema` with caps and
uniqueness (§8), add the server-side eligibility check
(`groupMemberEligibilitySchema`, §8), and add `user.role === "LEADER"` to
`canAccessGroup`'s leader branch in `apps/backend/src/lib/permissions.ts:33`.
The last of those is a one-line fix to already-shipped code and should not wait
for the rest of the domain.

### 3. Two write paths with opposite enrollment semantics

R21 vs R54. Adding a student through the **group form** deletes and recreates
their `SeasonEnrollment` (`src/lib/group-actions.ts:66-75`, `:141-150`),
resetting `status`, `enrolledAt`, `completedAt`, `droppedAt` and `dropReason`
to defaults — so a `WITHDRAWN` student silently becomes `ACTIVE` with a fresh
enrolment date and their drop reason erased. Adding the same student through
the **roster grid** does an `upsert` that touches only `groupId`
(`:236-240`) and preserves all of it.

The schema calls `SeasonEnrollment` "Append-only history"
(`apps/backend/prisma/schema.prisma:338`). One of the two paths ignores that.

**Recommendation:** make both paths use the `upsert` semantics. Then decide
with **domain 6** whether adding a student to a group should be able to create
an enrollment at all (R55 says it already does, silently) or whether enrollment
must precede group assignment. Today the group form can enroll a student in a
season they were never admitted to, because it has no season check at all
(R18) while the bulk path does (R51).

### 4. The LEADER `/groups` tab has no endpoint

§7. `packages/shared/src/navigation.ts:93,100` gives LEADER a `/groups`
destination as their **first tab**. The only reads that can serve it are v1's
hand-rolled query (`src/app/leader/groups/page.tsx:32-47`), which was never
ported. `GET /seasons/:id/groups` needs a season id the leader does not have
and omits the student lists the screen renders.

**Recommendation:** `GET /api/v1/groups` (§7), with the role narrowing applied
**inside the handler**. Note the trap: the season-list read already takes the
narrowing as a caller-supplied option (`onlyStudentUserId`,
`apps/backend/src/routes/seasons.ts:130-131`). Copying that shape for leaders
turns a claim-derived gate into a client-controlled filter — which is precisely
the failure domain 4 found in the ported attendance roster. **The leader
narrowing must not be an option.**

### 5. `deleteGroupAction` is unreachable, so its semantics are unproven

R46: nothing in v1 calls it. Its behaviour has therefore never run: students
are silently orphaned (R42), `AssignmentTarget` rows cascade away so an
assignment targeted only at that group becomes visible to nobody (R44), a
missing group returns silently (R38), and there is no confirmation, count or
notification (R45).

**Recommendation:** ship delete, but do not port the shape. Gate it behind
`GET /groups/:id/impact` so the confirmation can say "this unassigns 12
students and leaves 2 assignments targeting nobody", return
`groupDeleteResponseSchema`, and decide with **domain 7** whether an assignment
losing its last target should block the delete outright. Recommended: block it,
because the alternative is an invisible assignment nobody will ever notice.

### 6. There is no uniqueness on group name within a season — and the import matches by name

R15. Two groups called "Alpha" in one season are legal. The CSV import matches
rows to groups by lowercased, trimmed name into a `Map`
(`src/lib/group-import.ts:59`), so with duplicates **the last group wins
silently** and half a spreadsheet lands in the wrong group.

**Recommendation:** enforce case-insensitive uniqueness of `(seasonId, name)`
in the endpoint (a schema constraint is unavailable — the database is shared).
Flag the import's matching to **domain 16**; if the constraint lands, the
ambiguity disappears with it.

### 7. Removing a student leaves `SeasonEnrollment.groupId` stale

R33. `updateGroupAction`'s removal branch deletes the `GroupStudent` row and
never touches the enrollment (`src/lib/group-actions.ts:129-133`), while the
addition branch rewrites it and the delete path nulls it. So after a removal,
`listSeasonRoster` (which reads `GroupStudent`) says unassigned while the
season export (which reads `SeasonEnrollment.groupId`,
`src/lib/season-export.ts:56`) still names the old group. Two admin-facing
surfaces disagree about the same student.

**Recommendation:** null it on removal. This is a straightforward bug, not a
design question — but it interacts with item 1, so fix it in the same change
that ratifies the membership convention.

### 8. The bulk assignment cannot finish at its own advertised size

R56. Up to 2000 entries, 2–3 sequential round-trips each, inside a transaction
with a 20-second timeout (`src/lib/group-actions.ts:225-244`). At the cap that
is up to 6000 sequential statements. It will time out and roll the whole batch
back. It also reports success when it wrote nothing (R52, R57).

**Recommendation:** cap the request at 500 (`groupAssignmentsRequestSchema`,
§8), batch the writes (`deleteMany` over all ids, then `createMany`, then the
enrollment upserts) instead of looping, and return
`groupAssignmentsResponseSchema` so a partially-applied batch is legible.

### 9. `groupLeaderIds` staleness — mostly already fixed, with a residue

R60 vs R61. v1 caches the claim in the JWT at sign-in and effectively never
refreshes it (`src/lib/auth.ts:76-82`), so adding or removing a leader does
nothing until they sign in again. v2's refresh rotation reloads scopes
(`apps/backend/src/lib/auth/tokens.ts:96,119`), bounding the window to the
900-second access-token TTL.

**Recommendation:** none needed for the common case — note it and move on. But
the residue matters for *removal*: an admin who removes a leader in response to
a problem expects immediate effect and gets up to 15 minutes. If that is
unacceptable, `canAccessGroup`'s leader branch must do a database read rather
than trusting the claim (R63) — a real cost on every group read, and a decision
for **domain 1**, not this one.

### 10. Nothing ever cleans up a departed student's membership

R7–R10. Graduation, withdrawal and a plain `activeSeasonId` change all leave
the `GroupStudent` row in place. The group's `studentCount` (R71) counts it,
the detail roster lists it, and the leader's page shows it.

**Recommendation:** decide with **domain 6** what should happen at each
transition. Recommended: `graduateStudentAction` and `dropEnrollmentAction`
both delete the `GroupStudent` row (the historic group is already preserved in
`SeasonEnrollment.groupId`, which is exactly what that column is for). A plain
season move is item 1's territory. Until then, every count this domain reports
is an overcount, and no screen says so.

### 11. `name` is non-nullable in the schema and nullable in every contract

R72 and §2. `User.name` is `String` (`apps/backend/prisma/schema.prisma:106`),
but `GroupDetailData` types it `string | null`
(`src/lib/groups-query.ts:59-60`), every render falls back to the email, and
`leaderNames` drops empty strings (`:46`) so the list row can under-report the
leader count. v2 inherited the nullability (`packages/shared/src/group.ts:15`).

**Recommendation:** make `name` non-nullable in `groupMemberSchema` and drop
the `filter(Boolean)` so `leaderNames.length` is honest. Verify against the
staging data first — if empty-string names exist, this is domain 6's data
problem, not a contract problem, and the schema should stay permissive until
they are cleaned.

### 12. A group cannot be moved between seasons, and duplication does not carry membership

R29: no code path writes `Group.seasonId` after create. `duplicateSeasonAction`
creates fresh groups with name and description only
(`src/lib/season-actions.ts:296-303`) — no leaders, no students. Unlike its
handling of `recurrenceGroupId` (domain 3's §10 item 1), this is the correct
choice: a copied `GroupLeader` row would silently grant access to a new season.

**Recommendation:** keep both behaviours. State the immutability explicitly in
the v2 implementation so nobody adds a `seasonId` field to
`groupWriteRequestSchema` "for completeness" — under R1 a cross-season move
would relocate every member's global membership at once. If moving a cohort
forward is a real need, it is a *duplicate-then-assign* flow, not a field.

### 13. Group size is unbounded and unmeasured

R16. No capacity column, no limit in any action, no count shown while
assigning. The roster grid renders every student and every group with no
pagination (R104). On a phone this is the screen most likely to be unusable at
real data volumes.

**Recommendation:** do not invent a capacity field (the schema is frozen and
v1 never had one), but do surface the live count next to each group in the
assignment UI, and paginate the roster (`GET /seasons/:id/roster`, §7). If a
target size is genuinely wanted, propose it to domain 6 as a season-level
setting rather than a group column.

### 14. Group timestamps are dead columns

R87, R105. `Group.createdAt`/`updatedAt`, `GroupLeader.assignedAt` and
`GroupStudent.enrolledAt` are written by defaults and read by nothing.
`assignedAt` is additionally reset on every group edit by the wholesale leader
replacement (R30), so even if a screen wanted it, the value would be a lie.

**Recommendation:** leave the columns alone — the database is shared with v1
and no migration may be created here — but omit all four from every v2 contract
so they do not acquire accidental meaning. If "member since" is ever wanted,
`SeasonEnrollment.enrolledAt` is the column that survives an edit, and it is
domain 6's.
