# Community model, Build 2: Roles — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A person's role comes from their season rows, nobody can hold two active roles, and staff build a season by hand with pickers that show who can't join and why.

**Architecture:** `loadScopes` already builds every token's claims, so it also derives the `role` claim: SUPER and MENTOR stay stored, anyone else is ADMIN, LEADER or STUDENT according to live season rows. Existing `user.role === "ADMIN"` checks across both apps keep working. One new module, `lib/roles/`, answers "what active role does this person hold?" and "may this person take this seat?", and every write path goes through it inside its transaction with the person's `User` row locked.

**Tech Stack:** Express 5, Prisma 7, Zod (`packages/shared`), Expo + expo-router, React Query, NativeWind, Jest.

**Spec:** `docs/superpowers/specs/2026-11-06-community-model-design.md`, Build 2 only. Community-wide seasons, the Alumni tab of the picker and Select all for alumni are Build 3.

## Global Constraints

- Work on branch `community-model` in `/home/mark/projects/JPC/space-v2-community`, from `ac1cb208`. Never touch the shared checkout. Commits are authored by the repo-local `jesusprojectcommunity` config. End every commit message with:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_016bpCTuvMRmKUfFfPhax16c`
- No push, deploy, or migration on the Prisma test database without the owner saying so at the time. Local `.env` points at Neon, which integration tests use. Never print `DATABASE_URL`.
- Migrations are schema-additive and say which environments they reached. **No migration changes `User.role` values**, since v1 still reads Neon's: Task 1's script does that, on a database the owner names.
- Token claims stay `jose` HS256, audience `jpc-mobile`, 900s TTL. A role change takes effect through `markSessionsStale`, which refreshes silently. **Assigning or removing a season role no longer signs anyone out**, so `revokeAllRefreshTokensForUser` leaves those paths and the "They'll be signed out" dialog copy goes.
- Never import `@prisma/client`. No `process.env` outside `src/lib/config.ts`. No `@/` alias. A value import of `packages/shared` from a route folder uses the relative path. Envelope `{data}` / `{error:{code,message}}`. Update `src/docs/` in the same commit as a route. Files stay at or under 400 lines.
- Refusals are `409` with the reason in words, never a silent move: exact form `"Mina is already leading a group in GBV 2026"`.
- UI: load `ui-ux-pro-max` before UI work; this repo's `CLAUDE.md` rules win where they differ. Use `design/ui` and `Screen`, with a pinned `SaveBar` in `footer`. Unavailable rows are never dimmed and reasons are in words, not colour. No new animations. **The owner moved the `ui-sweep` to the end of Build 3**; don't run it, but add new component states to the design catalogue.
- **Never source `apps/backend/.env`** in a shell: its unquoted `&` echoes the database URL. Jest loads it itself.
- One integration file: from `apps/backend`, `npx jest --config jest.integration.config.js --testPathPattern integration/<name>`. `pnpm --filter @space/backend test:integration -- <name>` does NOT filter; it starts the whole suite.
- Integration tests run serially on staging. Run only the files a task names; the full suite runs once, in Task 13.
- Build 3's flag doesn't exist yet, so "regular season" is every season here. Put the regular-season rule in one place so Build 3 changes one function.

## Review Focus

1. A person added to a season at the same moment by two admins: the `User` row lock means one is refused. Pinned in Task 2.
2. A student removed from a draft while on Start's checklist must not show "Did not finish" later, and can be re-added. Pinned in Task 5.
3. An admin who also leads a group in the same season: derived ADMIN, and leader-only actions on their own group still work. Pinned in Task 1.
4. Someone still serving elsewhere who is appointed to a draft: no draft access until the other role ends, then access arrives without a new sign-in. Pinned in Tasks 1 and 3.
5. A student whose only attempt at the required program was a drop, or a completed row with no result: drop blocks as "never finished", null result doesn't block. Pinned in Task 4.

---

### Task 1: Derive the role from season rows

**Files:**
- Modify: `apps/backend/src/lib/auth/scopes.ts`, `lib/auth/tokens.ts`, `lib/rbac.ts`, `routes/auth.ts`, `routes/me.ts`, `routes/dev.ts`
- Create: `apps/backend/scripts/convert-stored-roles.ts` (package script `roles:convert`)
- Test: `src/__tests__/integration/derived-role.test.ts`, `src/__tests__/convert-stored-roles.test.ts`, `src/__tests__/rbac.test.ts` (update)

**Interfaces:**
- Produces: `loadScopes(userId): Promise<Scopes & { role: UserRole }>`; pure `deriveRole(storedRole, { adminIds, leaderIds })` exported from `lib/auth/scopes.ts`.

Rules for `loadScopes`:
- Stored SUPER or MENTOR is the role, with empty `seasonAdminIds`/`groupLeaderIds`/`activeSeasonId`, whatever rows exist.
- Otherwise read grants in DRAFT or ACTIVE seasons. **If the person holds any role in an ACTIVE season (admin, leader, or ACTIVE enrolment), drop their DRAFT grants.**
- Then `seasonAdminIds` non-empty → ADMIN, else `groupLeaderIds` non-empty → LEADER, else STUDENT. A stored ADMIN or LEADER with no rows is STUDENT.

- [ ] **Step 1: Write failing tests**

`derived-role.test.ts`, each signing in or calling `loadScopes` on rows it creates:
- `SeasonAdmin` in an ACTIVE season on a stored-STUDENT alumnus → `role: "ADMIN"`; `GroupLeader` → `"LEADER"`; nothing → `"STUDENT"`, `graduationYear` kept.
- stored `ADMIN` with no rows → `"STUDENT"`.
- admin and leader in the same season → `"ADMIN"`, both id lists filled, `isLeaderOfGroup` true (Review Focus 3).
- SUPER and MENTOR with stray rows → unchanged role and empty lists.
- leader in ACTIVE season A plus admin of DRAFT B → `"LEADER"`, `seasonAdminIds: []`; End season A, then refresh → `"ADMIN"`, `seasonAdminIds: [B]`, with no new sign-in (Review Focus 4).
- `GET /me` and login both return the derived role.

`convert-stored-roles.test.ts`: `planConversion(rows)` turns ADMIN and LEADER into STUDENT, and lists any without a `graduationYear` under `refused`.

- [ ] **Step 2: Run them; expect failures**

`derived-role` (integration command in Global Constraints) and `pnpm --filter @space/backend test:unit -- convert-stored-roles`.

- [ ] **Step 3: Implement**

- `rbac.ts`: `isAdminOfSeason`, `isLeaderOfGroup` and `isAdminOfAnySeason` test the claim lists plus "not MENTOR", dropping the role pairing. Rewrite the C7 comment: the rows are now the identity, and Task 2 guards their writes.
- Every session issuer takes `role` from `loadScopes`. `routes/me.ts` returns it instead of `row.role`. `dev.ts` lists people by derived role.
- `convert-stored-roles.ts`: read-only by default; `--apply` refuses when `refused` is non-empty, otherwise sets ADMIN and LEADER to STUDENT and upserts their `StudentProfile` in one transaction. It's idempotent. It prints the database host's type (direct or pooled), never the URL.

- [ ] **Step 4: Audit stored-role reads**

Run `grep -rnE 'role: "(ADMIN|LEADER)"|role: \{|\.role\b' apps/backend/src --include=*.ts`, excluding tests and generated code. Decide each hit: a **token** `user.role` stays; a **database** `User.role` read of ADMIN or LEADER moves to season rows. Known hits: `groups.ts:95` and `membership.ts:40` (Task 3 replaces them), `users/views.ts` and the `/users?role=` filter (ADMIN means has a `seasonAdmins` row in a DRAFT or ACTIVE season, LEADER likewise; rows report the derived role), `notes.ts` author role, `routes/me.ts:205`. Students lists filtering `role: "STUDENT"` stay, now including alumni who serve. Paste the decisions into the task report.

- [ ] **Step 5: Run the focused tests, `rbac` unit tests, typecheck; commit**

---

### Task 2: The one-role rule

**Files:**
- Create: `apps/backend/src/lib/roles/active-role.ts`, `lib/roles/seat-rules.ts`, `lib/roles/index.ts`
- Test: `src/__tests__/integration/one-role-rule.test.ts`

**Interfaces:**
- Produces:
  - `type ActiveRole = { kind: "admin" | "leader" | "student"; seasonId: number; seasonCode: string; seasonTitle: string; groupName: string | null }`
  - `activeRolesFor(tx, userIds: number[]): Promise<Map<number, ActiveRole>>` — roles in ACTIVE, non-deleted seasons; admin wins over leader when both are in one season.
  - `lockPeople(tx, userIds: number[]): Promise<void>` — `SELECT id FROM "User" WHERE id = ANY(...) ORDER BY id FOR UPDATE`.
  - `type Seat = { kind: "admin" | "leader" | "student"; season: { id: number; status: SeasonStatus } }`
  - `seatRefusal(tx, person: { id, name, role, graduationYear, deletedAt }, seat: Seat, active: ActiveRole | undefined): Promise<{ code: string; message: string } | null>`
  - `describeActiveRole(name: string, role: ActiveRole): string`

`seatRefusal`, first match wins:

| Check | Code | Message |
|---|---|---|
| Deleted account | `user_inactive` | `"That account is deactivated."` |
| Stored SUPER or MENTOR | `permanent_role` | `"{name} is a super admin and can't take a season role."` (or `a mentor`) |
| Admin or leader seat, no `graduationYear` | `not_alumnus` | `"Only alumni can serve. {name} hasn't graduated."` |
| Student seat, has `graduationYear` | `is_alumnus` | `"{name} is an alumnus and can't join as a student."` (the Build 3 change point) |
| Season finished | `season_finished` | `"This season has finished."` |
| Season ACTIVE and an active role in **another** season, or as a student in this one when the seat is staff | `already_in_role` | `describeActiveRole` |
| Leader seat, already leads another group in this season (any status) | `leader_has_group` | `"{name} already leads a group in this season."` |

A DRAFT season skips only the `already_in_role` line. Admin and leader in the same season stays allowed.

`describeActiveRole` copy: `"Mina is already leading a group in GBV 2026"`, `"Mina is already an admin of GBV 2026"`, `"Mina is already a student in GBV 2026"`.

- [ ] **Step 1: Write failing tests**, one per table row plus:
  - `admin and leader in one season is allowed`; `a draft seat is allowed while active elsewhere`; `a finished season's role doesn't count`; `a deleted season's role doesn't count`.
  - `two concurrent seats: exactly one wins` — two transactions run through `lockPeople` then a helper that checks and writes, assert one refusal (Review Focus 1).
- [ ] **Step 2: Run; expect failure.** `one-role-rule` (integration command in Global Constraints)
- [ ] **Step 3: Implement; run; commit.**

---

### Task 3: Enforce the rule on staff writes and stored roles

**Files:**
- Modify: `routes/seasons/admins.ts`, `lib/queries/groups/membership.ts`, `routes/groups.ts`, `routes/users/accounts.ts`, `packages/shared/src/user.ts`, `src/docs/`
- Create: `routes/seasons/staff-candidates.ts`; register `GET /seasons/:id/staff-candidates` in `routes/seasons/index.ts`
- Test: `src/__tests__/integration/staff-seats.test.ts`, updates to existing `season-admins` and `groups` tests

**Interfaces:**
- Consumes: Task 2's module.
- Produces: `GET /seasons/:id/staff-candidates` → `{ people: [{ id, name, lastSeason: { title } | null }] }`: live alumni with no active role, name order, name and last season only. Super or that season's admin. Replaces `GET /groups/leader-options`, which is removed along with `useLeaderOptions`.

- [ ] **Step 1: Write failing tests**
  - Add admin: non-alumnus → 409 `not_alumnus`; leading in another ACTIVE season, target ACTIVE → 409 with `"Mina is already leading a group in GBV 2026"`; same person, target DRAFT → 201; old `not_an_admin` gone; response keeps the refresh token valid and bumps `sessionsValidFrom`.
  - Group form: same refusals via `leaderIds`; a leader already on another group of this season → 409 `leader_has_group`; a person listed under another group's `leaderIds` in the same request path can't pass; a season's own admin may be leader; the parked `invalid_leader` for a former leader is gone: **saving a group whose existing leader is unchanged never re-checks that leader**, so an old row can't block the form.
  - Admin (not super) may add and remove leaders; a leader can't; an admin still can't add admins.
  - Candidates: excludes active-role holders, non-alumni, SUPER, MENTOR; a season admin gets name and last season and no attendance or result fields; a leader gets 403.
  - Users: `POST`/`PATCH /users` with role `ADMIN` or `LEADER` → 400 `role_from_seasons` `"Admin and leader come from seasons, not from the account."`; changing someone holding season rows in a DRAFT or ACTIVE season to SUPER or MENTOR → 409 `has_season_role`. The old cascade delete of season rows on role change is removed.
- [ ] **Step 2: Run; expect failure.**
- [ ] **Step 3: Implement.** Each write runs `lockPeople`, `activeRolesFor`, `seatRefusal` in its transaction, checking only newly added people. Replace token revocation with `markSessionsStale` for added and removed people. `userWriteRoleSchema` in `packages/shared/src/user.ts` allows SUPER, MENTOR and STUDENT; read schemas keep all five. Fix the parked `PATCH {name}` clearing `description` (`routes/groups.ts:69`) and the OpenAPI wording (`docs/components/people.ts:142,149`), and make explicit `studentIds` refuse WITHDRAWN or role-changed members with `not_enrolled`.
- [ ] **Step 4: Run; update docs; commit.**

---

### Task 4: Required program and standing

**Files:**
- Modify: `apps/backend/prisma/schema.prisma` (`Season.requiredProgram String?`, `SeasonEnrollment.overrideById Int?` with relation, `SeasonEnrollment.overrideAt DateTime?`), new migration; `packages/shared/src/season.ts`, `routes/seasons/crud.ts`, `routes/seasons/roster.ts` or its sibling, `src/docs/`
- Create: `packages/shared/src/standing.ts`, `apps/backend/src/lib/roles/standing.ts`, `routes/seasons/people-candidates.ts`; register `GET /seasons/:id/people-candidates`
- Test: `packages/shared/src/__tests__/standing.test.ts`, `src/__tests__/integration/people-candidates.test.ts`

**Interfaces:**
- Produces:
  - `type Standing = { kind: "ok" | "blocked" | "already_passed"; reason: "did_not_pass" | "never_finished" | null; programSeasonTitle: string | null }`
  - `standingFor({ requiredProgram, targetProgram }, history: { program, seasonTitle, finishedAt, enrollmentStatus, result }[]): Standing`, pure, in shared.
  - `loadStandings(tx, userIds, season): Promise<Map<number, Standing>>`
  - `GET /seasons/:id/people-candidates` → `{ season: { id, title, requiredProgram }, people: PeopleCandidate[] }`, where `PeopleCandidate = { id, name, last: { seasonTitle, outcome: "PASSED" | "NOT_PASSED" | "DROPPED" | "COMPLETED", attendancePct: number | null } | null, availability: "available" | "already_passed" | "did_not_pass" | "never_finished" | "in_role" | "in_season", reason: string | null, selectable: boolean, overridable: boolean }`
  - Sorted available, then already passed, then the rest, by name in each. No paging: about 200 rows, virtualised on the phone. Non-alumni STUDENT accounts only (the Alumni tab is Build 3).

`standingFor` rules, from the spec:
- Finished means a COMPLETED enrolment in a COMPLETED or ARCHIVED season. Latest by `finishedAt`.
- `requiredProgram` null → `ok`. Latest finished row in it with result NOT_PASSED → blocked `did_not_pass`. No finished row (a drop doesn't count) → blocked `never_finished`. A finished row with null result → `ok` (Review Focus 5).
- If not blocked and the latest finished row in `targetProgram` is PASSED → `already_passed`.
- Schema refuses `requiredProgram === program` (`"A season can't require its own program."`), so a retake never requires itself. `requiredProgram` is a Super-only field, editable only while DRAFT.

`selectable`: `available` and `already_passed` are true. `in_role` is true on a DRAFT season, with the label kept. Blocked is false unless an override is on record. `overridable`: blocked and the caller is SUPER. `in_season` is false.

Reason copy: `"Did not pass GBV 2026"`, `"Hasn't finished GBV yet"`, `"Already passed GBV 2026"`, `describeActiveRole(...)`, `"Already in this season"`.

- [ ] **Step 1: Write failing tests.** `standing.test.ts`: each rule above, including retake (`did_not_pass` GBV 2026 → `ok` for GBV 2027 with null required, blocked for LEAD 2027 requiring GBV), latest result wins (failed then passed → ok), drop only → `never_finished`. `people-candidates.test.ts`: ordering; a season admin gets the same fields as a super on their own season, 403 on another; `overridable` false for an admin; a dropped-in-this-season person is `in_season` with `"Dropped - only a super admin can bring them back"`; a season with no required program shows the last result and blocks nobody; a query-count check that attendance isn't per person in a loop (use `attendancePctByEnrollment`'s batching or a single grouped query).
- [ ] **Step 2: Run; expect failure.**
- [ ] **Step 3: Implement; apply the migration to Neon** with `pnpm --filter @space/backend db:migrate:deploy` (additive, tests need it). Say so in the commit.
- [ ] **Step 4: Run; docs; commit.**

---

### Task 5: Adding and removing people

**Files:**
- Modify: `routes/students/enrollments.ts`, `lib/queries/students/writes.ts`, `routes/imports.ts`, `lib/imports/students/commit.ts`, `routes/students/profile.ts`, `routes/seasons/index.ts`, `packages/shared/src/` (season or enrollment contract), `src/docs/`
- Create: `routes/seasons/enrollments.ts`
- Test: `src/__tests__/integration/season-enrollments.test.ts`

**Interfaces:**
- Consumes: Tasks 2 and 4.
- Produces:
  - `POST /seasons/:id/enrollments` body `{ userIds: number[] (1..500, unique), overrideUserIds?: number[] }` → `{ added: number }`. All or nothing, because a half-applied batch can't be read by the operator. Refusal: 409 `people_unavailable`, message names the first and counts the rest: `"Mina is already leading a group in GBV 2026, and 2 others can't join."`
  - `DELETE /seasons/:id/enrollments/:userId`: DRAFT only, super or that season's admin. Hard-deletes the enrolment and its `GroupStudent` row, refusing 409 `has_work` if any submission or attempt exists. A draft row is a plan, not history.
  - `POST /seasons/:id/enrollments/:userId/override`: SUPER only, records `overrideById`/`overrideAt` on a person already on a draft's roster, for Start's checklist.
  - `checkStudentSeat(tx, person, season, { overridden: boolean, actorIsSuper: boolean })` in `lib/roles`: `seatRefusal` plus standing. A blocked student is refused `not_eligible` unless `overridden` and the actor is SUPER. Non-super sending `overrideUserIds` → 403.

- [ ] **Step 1: Write failing tests.** Bulk add success, stale marked; refuses whole batch with the message form above; `already_passed` allowed; blocked refused, then allowed for super with `overrideUserIds` and `overrideById`/`overrideAt` recorded; admin override 403; another season's admin 403; in-role person on DRAFT added, on ACTIVE refused; existing row refused as `in_season`. Override route: super only, and it clears the block from Task 6's check. Delete: removed student absent from `GET /me/season-history` and re-addable (Review Focus 2); ACTIVE season 409; `has_work` 409. `createEnrollment`, the student CSV import and `routes/students/profile.ts` all refuse an in-role or blocked person; a refused import row names the reason in that row's result.
- [ ] **Step 2: Run; expect failure.**
- [ ] **Step 3: Implement.** `enrollStudentInSeason` stays the one creator; its callers run the checks in their transaction, after `lockPeople`.
- [ ] **Step 4: Run; docs; commit.**

---

### Task 6: Starting a season

**Files:**
- Modify: `routes/seasons/crud.ts`, `routes/seasons/index.ts`, `packages/shared/src/season-lifecycle.ts`, `src/docs/`
- Create: `routes/seasons/start.ts`, `lib/queries/season-start.ts`
- Test: `src/__tests__/integration/season-start.test.ts`

**Interfaces:**
- Produces, SUPER only:
  - `GET /seasons/:id/start-check` → `{ ready: boolean, items: StartIssue[] }`, `StartIssue = { userId, name, seat: "admin" | "leader" | "student", reason: "already_in_role" | "not_alumnus" | "is_alumnus" | "permanent_role" | "user_inactive" | "did_not_pass" | "never_finished", message: string, otherSeasonCode: string | null }`.
  - `POST /seasons/:id/start`: re-runs the check under `lockPeople` for everyone in the season, in one transaction. Not ready → 409 `start_blocked`; otherwise sets ACTIVE and marks everyone stale. Not DRAFT → 409 `not_draft`.
  - `PATCH` to ACTIVE → 409 `use_start_season` `"Start the season from its Start button."`; `allowedSeasonStatuses` in mobile follows.

- [ ] **Step 1: Write failing tests.** One item per reason; a recorded override removes a block from the list but not an in-role block; a person in role elsewhere and listed in two drafts: starting one succeeds once clear, then the second reports them; two starts racing leave nobody with two roles; a non-super gets 403; after Start the derived role lands on refresh with no re-login; a season with no people still starts.
- [ ] **Step 2: Run; expect failure.**
- [ ] **Step 3: Implement; run; docs; commit.**

---

### Task 7: Bring back, drop, bulk graduation, earlier seasons

**Files:**
- Modify: `routes/students/enrollments.ts`, `routes/students/lifecycle.ts`, `routes/seasons/index.ts`, `lib/queries/students/detail.ts`, `lib/queries/students/history.ts`, `lib/permissions/student.ts`, `src/docs/`
- Create: `routes/seasons/graduate.ts`
- Test: `src/__tests__/integration/bring-back.test.ts`, `season-graduate.test.ts`, `staff-earlier-seasons.test.ts`

**Interfaces:**
- Produces:
  - `POST /students/:id/enrollments/:seasonId/restore`: SUPER only; WITHDRAWN to ACTIVE; clears `droppedAt`, keeps `dropReason` in the audit log; season must be DRAFT or ACTIVE, else 409 `season_finished`; checks `checkStudentSeat` as if adding (the rule is re-checked on the way back); marks stale.
  - `POST /seasons/:id/graduate` body `{ userIds: number[], graduationYear: number }`: SUPER only; season must be finished; each id must be enrolled there and not graduated, else whole-batch 409; shares one `graduatePerson(tx, id, year)` extracted from `graduateStudent`.
  - `PATCH /students/:id/enrollments/:seasonId` with COMPLETED becomes 409 `use_end_season` for everyone (resolves the Build 1 ruling: individually completing skips pass/fail). Graduation still completes with no result, per spec.

- [ ] **Step 1: Write failing tests.** Restore: admin 403; super OK; refused with reason if now in a role or blocked; finished season refused. Graduate: batch success with enrolments unchanged in the finished season; in a live season 409; a bad id refuses all; a non-super 403. Earlier seasons: an admin of season B reading `GET /students/:id` for a student who was also in A sees only B's row, no A attendance, submissions or notes; a leader likewise; SUPER and MENTOR see all; the picker still shows the admin A's title and result (the one exception).
- [ ] **Step 2: Run; expect failure.**
- [ ] **Step 3: Implement.** Filter `detail.ts` history and `canReadEnrollmentHistory` to the caller's live scope. Check `routes/notes.ts:175` and the submission and attendance reads for season-scoped notes against the same rule.
- [ ] **Step 4: Run; docs; commit.**

---

### Task 8: Mobile follows the derived role

**Files:**
- Modify: `apps/mobile/src/components/season/SeasonAdmins.tsx`, the user form under `app/(app)/users/`, `src/lib/student-actions.ts`, `src/hooks/use-group-admin.ts`, `src/screens/groups-admin/*`, `packages/shared/src/navigation.ts` (tests)
- Test: `src/__tests__/` alongside each, `packages/shared/src/__tests__/navigation.test.ts`

- [ ] **Step 1: Write failing tests**
  - `navFor` for the spec's Tabs table: derived ADMIN with `graduationYear` gets admin tabs, not alumni; serving ended (derived STUDENT with `graduationYear`) gets alumni tabs.
  - A token that changes role on refresh (STUDENT to LEADER) re-renders tabs with no navigation error and queries keyed by role refetch.
  - User form offers Super, Mentor, Student only; a person's detail shows their current season role as read-only text.
  - An `already_in_role` error on add admin or save group shows the server's message.
- [ ] **Step 2: Run; expect failure.** `pnpm --filter @space/mobile test:unit -- <file>`
- [ ] **Step 3: Implement.** Remove "They'll be signed out" copy. Hide "Complete" on a student's season row; keep Drop. Keep every `role ===` branch: they read the derived claim. Use Task 3's candidates in the group form.
- [ ] **Step 4: Run mobile tests and typecheck; commit.**

---

### Task 9: People picker

**Files:**
- Create: `apps/mobile/app/(app)/seasons/[code]/people.tsx`, `src/screens/season-people/{candidate-row,people-filters,people-list}.tsx`, `src/hooks/use-season-people.ts`, `src/lib/query-keys.ts` entries
- Modify: `src/screens/design-catalogue/*`, `packages/shared/src/navigation.ts` (`DETAIL_ROUTE_NAMES`)
- Test: `src/__tests__/season-people.test.tsx`

**Interfaces:**
- Consumes: Task 4's candidates; Task 5's bulk add. All parsed with Zod schemas from `packages/shared`.

Layout follows the spec's mock:
- Title `Add people to LEAD 2027`, subtitle `Requires GBV`.
- `SearchField`, then a "Last season" `Select` (Any plus the titles present) and an "Available" `ChoiceChip`.
- `Select all available` ticks the visible `available` rows only: skips already passed, blocked and in-role. The spec's Students/Alumni control waits for Build 3.
- A `FlatList` with a first line of name, second line `GBV 2026 - Passed - 88%`.
- A selectable row has a `Checkbox`. An unselectable one has no tick box, a section header (`Did not pass`, `Already in a role`, ...), and the reason in full contrast text. An `overridable` row has an `Override` button opening a `ConfirmDialog`: `"Add Sara even though they did not pass GBV 2026?"`; confirmed, it ticks them and adds them to `overrideUserIds`.
- `SaveBar` footer: `Add 12 people`, disabled at 0.
- On 409 `people_unavailable`: toast the message, refetch, drop anyone no longer selectable from the selection and say so.

- [ ] **Step 1: Write failing tests:** select-all skips each unavailable kind; search and filters compose; an unavailable row exposes its reason through its accessibility label and has no checkbox; `Override` only for super; add posts `userIds` and `overrideUserIds`; the 409 path keeps the rest selected; empty, loading and error states use `EmptyState`, `RouteSkeleton`, `RouteError`; a selection survives filtering.
- [ ] **Step 2: Run; expect failure.**
- [ ] **Step 3: Implement; add catalogue states; run; commit.**

---

### Task 10: Staff picker and season setup entry points

**Files:**
- Create: `apps/mobile/src/screens/season-people/staff-picker-sheet.tsx`
- Modify: `src/components/season/SeasonAdmins.tsx`, `src/screens/groups-admin/*`, `app/(app)/seasons/[code]/index.tsx`, `app/(app)/seasons/[code]/edit.tsx`, `app/(app)/seasons/new.tsx`, roster screen for draft removal
- Test: `src/__tests__/staff-picker.test.tsx`, `season-setup-entry.test.tsx`

- [ ] **Step 1: Write failing tests:** the sheet lists name and last season only; add admin (super only) and add leader (admin and super) both use it and show server reasons; a leader can be removed; the season screen shows `Add people` and, on a draft for a super, `Start season`, and neither on a finished season; the required program `Select` shows on create and draft edit for a super, is read-only otherwise, lists existing programs, and excludes the season's own; a draft roster row has `Remove from season` (Task 5's delete) with a confirm.
- [ ] **Step 2: Run; expect failure.**
- [ ] **Step 3: Implement; run; commit.**

---

### Task 11: Start checklist

**Files:**
- Create: `apps/mobile/app/(app)/seasons/[code]/start.tsx`, `src/screens/season-start/issue-list.tsx`, `src/hooks/use-season-start.ts`
- Modify: `packages/shared/src/navigation.ts` (`DETAIL_ROUTE_NAMES`), `src/screens/design-catalogue/*`
- Test: `src/__tests__/season-start.test.tsx`

Copy: title `Start {season}`. Ready: `Everyone's clear. Starting makes this season live for {n} people.`, with a pinned `Start season` and a `ConfirmDialog`. Not ready: `Sort these out first`, then issues grouped by seat, each with the message and its action: `Remove` (students: Task 5 delete; staff: the existing remove routes), `Open {season}` when `otherSeasonCode` is set, and `Override` for a super on a program block (Task 5's override route). The list refetches after each action, and Start appears when it's empty.

- [ ] **Step 1: Write failing tests:** ready and not-ready states; each action calls its route and refetches; a 409 `start_blocked` (someone changed meanwhile) reloads the list with a toast; on success `replace` to the season.
- [ ] **Step 2: Run; expect failure.**
- [ ] **Step 3: Implement; run; commit.**

---

### Task 12: Bring back and bulk graduation screens

**Files:**
- Modify: `apps/mobile/src/screens/student-admin/*`, `src/lib/student-actions.ts`, `app/(app)/seasons/[code]/results.tsx`, `src/screens/season-end/*`
- Create: `src/hooks/use-season-graduate.ts`
- Test: `src/__tests__/bring-back.test.tsx`, `season-graduate.test.tsx`

- [ ] **Step 1: Write failing tests:** `Bring back` only for a super on a WITHDRAWN row of a live season, confirms, shows the server's reason on refusal, refreshes; a finished season's results screen, for a super, has `Graduate people`: multi-select with a graduation year field, excludes people already graduated, `SaveBar` `Graduate 12 people`, a `ConfirmDialog` that says it can't be undone.
- [ ] **Step 2: Run; expect failure.**
- [ ] **Step 3: Implement; run; commit.**

---

### Task 13: Preflight, docs, full run

**Files:**
- Modify: `apps/backend/scripts/community-preflight.ts`, `CLAUDE.md`, `apps/backend/README.md`, `packages/shared/src/user.ts` comments
- Test: existing preflight tests extended

- [ ] **Step 1:** Extend the preflight's report: stored ADMIN or LEADER lacking `graduationYear`; staff who aren't alumni; DRAFT rows are reported separately and don't count as violations. Add a read-only list of stored STUDENTs holding live `SeasonAdmin` or `GroupLeader` rows, split by whether they have a `graduationYear`, for the owner to review before any deploy.
- [ ] **Step 2:** `CLAUDE.md`: add a "Roles" section (derived claim, stored role means SUPER, MENTOR or STUDENT only, `lib/roles` on every seat write, no signing people out on role changes, `roles:convert`), and remove statements Build 2 made false.
- [ ] **Step 3:** The controller runs `pnpm lint`, `pnpm typecheck`, `pnpm build` and `pnpm test` in tmux, and fixes what breaks. Existing tests that set a stored `ADMIN` or `LEADER` with no rows are expected to need rows.
- [ ] **Step 4:** Commit. Release stays with the owner: on their word, run preflight read-only, migrate, `preflight:community --apply`, `roles:convert --apply`, push both remotes, verify `/health`, build TestFlight. The sweep waits for Build 3.
