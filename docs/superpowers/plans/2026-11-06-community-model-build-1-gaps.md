# Community model, Build 1: Gaps — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seasons end through a real flow with pass results, and "between seasons" becomes a normal state: the current season is derived, finished seasons lock, former staff lose access, and students keep read-only access to their own work.

**Architecture:** Everything hangs off `loadScopes`, the one place token claims are built. It derives `activeSeasonId` from live enrolments and drops finished seasons from `seasonAdminIds` and `groupLeaderIds`, so existing `rbac` gates cut off former staff with no route-by-route change. Students are already write-gated by `hasActiveEnrollment`, so completing enrolments at End locks them too; this plan pins that with tests rather than adding a second lock. A new `seasons/end.ts` owns the End flow and writes `sessionsValidFrom` so changes take effect at once.

**Tech Stack:** Express 5, Prisma 7, Zod (`packages/shared`), Expo + expo-router, React Query, NativeWind, Jest.

**Spec:** `docs/superpowers/specs/2026-11-06-community-model-design.md`. Build 1 only. Builds 2 and 3 get their own plans.

## Global Constraints

- Work on branch `community-model`. Commits are authored by the repo-local `jesusprojectcommunity` config; never override it. End every commit message with:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_016bpCTuvMRmKUfFfPhax16c`
- Migrations are additive. `activeSeasonId` stays as a column but nothing reads or writes it. Each migration commit says which environments it reached.
- Token claims stay `jose` HS256, audience `jpc-mobile`, 900s TTL. The claim keeps the name `activeSeasonId`, so mobile code and its tests keep working.
- Never import `@prisma/client`; use `src/generated/prisma`. No `process.env` outside `src/lib/config.ts`. No `@/` alias. A value import of `packages/shared` from a route folder uses a relative path (see `CLAUDE.md`).
- Every response uses the `{data}` / `{error:{code,message}}` envelope. Update `src/docs/` in the same commit as a route. Keep every file at or under 400 lines.
- Mobile: parse every response with a shared Zod schema. Use `src/design/ui` components and semantic tokens, with no hex, `shadow-` or raw font sizes, and no new animations. Never use colour alone, or an alpha-dimmed label. Routes are typed; never use `as Href`.
- **UI:** apply the `ui-ux-pro-max` skill to all screen work, with `references/pro-rules.md` as the pre-delivery check. Repo rules in `CLAUDE.md` win where they differ. Run the `ui-sweep` skill before calling a screen done.
- Long test runs go in tmux with output tee'd to `~/logs/`. Integration tests run serially on the staging database.
- Commands: one backend integration file: `pnpm --filter @space/backend exec jest --config jest.integration.config.js --runInBand --testPathPattern <file>`. One unit file: `pnpm --filter @space/backend exec jest <file>`, or `@space/mobile` / `@space/shared`.

## Review Focus

1. Two staff press End at the same moment: one succeeds, the other gets 409, and results aren't overwritten (Task 4).
2. Soft-deleted students and assignments must not block End forever, and deleted students don't appear on the review list (Task 3).
3. A student enrolled in a DRAFT season has no current season, and the draft isn't in their History (Tasks 2, 6).
4. An alumnus opens their own past assignment and quiz: the server allows it and the app's alumni guard doesn't bounce them (Tasks 5, 7).
5. Correcting a result on a dropped student or an unfinished season is refused, not silently written (Task 4).

---

### Task 1: Schema, shared contracts and the preflight script

**Files:**
- Modify: `apps/backend/prisma/schema.prisma`
- Create: `apps/backend/prisma/migrations/20261106120000_enrollment_result/migration.sql`
- Create: `packages/shared/src/season-lifecycle.ts`; Modify: `packages/shared/src/index.ts`, `packages/shared/src/season.ts`
- Create: `apps/backend/scripts/community-preflight.ts`
- Test: `packages/shared/src/__tests__/season-lifecycle.test.ts`, `apps/backend/src/__tests__/integration/community-preflight.test.ts`

**Interfaces:**
- Produces, Prisma: `enum EnrollmentResult { PASSED NOT_PASSED }`; on `SeasonEnrollment`: `result EnrollmentResult?`, `resultReason String?`, `resultSetAt DateTime?`.
- Produces, shared:
  - `seasonOutcomeSchema = z.enum(["PASSED","NOT_PASSED","COMPLETED","DROPPED"])`, `seasonOutcomeLabel(o)`: `Passed`, `Did not pass`, `Completed`, `Did not finish`.
  - `seasonEndCheckSchema`: `{ blockers: { submissions: {publicId,assignmentTitle,studentName}[], quizAttempts: {quizId,attemptId,quizTitle,studentName}[], attendance: {sessionId,title,startsAt,missing:number}[] }, students: {userId,name,groupName:string|null,attendancePct:number}[] }`
  - `endSeasonRequestSchema` (strict): `{ notPassed: {userId:number, reason:string|null}[] }`
  - `seasonResultRowSchema`: `{userId,name,groupName,attendancePct,result:"PASSED"|"NOT_PASSED"|null,reason:string|null}`
  - `updateSeasonResultRequestSchema` (strict): `{ result:"PASSED"|"NOT_PASSED", reason:string|null }`
  - `overdueSeasonsResponseSchema`: `{ seasons: {id,code,title,endDate}[] }`
  - `seasonRecordSchema` (strict): `{ season:{id,code,title,startDate,endDate}, outcome, groupName, attendancePct, assignments: studentAssignmentListItem[], quizzes: {id,title,kind,status:"NOT_TAKEN"|"IN_PROGRESS"|"SUBMITTED"|"GRADED",score:number|null}[], attendance: {sessionId,title,startsAt,status:AttendanceStatus|null}[] }`
  - `seasonHistoryRowSchema` gains `code: string` and `outcome: SeasonOutcome`; it stays strict. Update its comment: attendance %, curriculum and outcome only.
- Produces, script: package script `preflight:community` = `ts-node --transpile-only scripts/community-preflight.ts`, run as `pnpm --filter @space/backend preflight:community [--apply]`, plus exported `findRoleRuleViolations(): Promise<Violations>` and `backfillResults(): Promise<{markedPassed:number, completedStale:number}>`.

- [ ] **Step 1: Write failing tests.** Shared: `seasonOutcomeLabel("DROPPED") === "Did not finish"`, and `endSeasonRequestSchema` rejects an unknown key. Integration: in a seeded world, `findRoleRuleViolations()` reports a leader with two groups in one ACTIVE season, an ADMIN in two ACTIVE seasons and a MENTOR with a `SeasonAdmin` row in an ACTIVE season. `backfillResults()` turns a COMPLETED enrolment into `result: "PASSED"`, turns an ACTIVE enrolment in a COMPLETED season into `status: "COMPLETED", result: "PASSED"`, leaves WITHDRAWN untouched and a live season's ACTIVE enrolment untouched, and a second run changes 0 rows.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement the schema, the migration (`CREATE TYPE`, three `ADD COLUMN`, nothing else), shared contracts and script.** Without `--apply` the script is read-only: it prints the database host, violations and what would change. `--apply` refuses to run if violations exist, then backfills in one transaction. `completedAt` for a stale enrolment is the season's `endDate`. Don't put the backfill in the migration: `migrate deploy` also reaches Neon, which v1 still writes.
- [ ] **Step 4: Apply the migration to the test database** with `pnpm --filter @space/backend db:migrate:deploy` and `db:generate`. It is additive only.
- [ ] **Step 5: Run the tests and confirm they pass.**
- [ ] **Step 6: Commit** `feat(backend): enrollment results, season lifecycle contracts, preflight script`, stating the environment migrated.

### Task 2: Derived current season and scopes

**Files:**
- Modify: `apps/backend/src/lib/auth/scopes.ts`, `apps/backend/src/lib/auth/session-validity.ts`
- Modify (stop pointer use): `lib/queries/students/writes.ts:89,141-144`, `lib/queries/students/detail.ts:48,138`, `routes/students/lifecycle.ts:61`, `routes/seasons/crud.ts:219`, `routes/students/profile.ts`, `routes/students/enrollments.ts`, `src/docs/paths/students.ts`, `src/docs/paths/seasons.ts`, `scripts/seed-sweep/people.ts`
- Modify: `packages/shared/src/student/writes.ts`, `packages/shared/src/student/profile.ts`, `packages/shared/src/student/detail.ts`, `apps/mobile/src/lib/student-form.ts`, `apps/mobile/src/lib/student-actions.ts`
- Modify: `apps/backend/src/__tests__/integration/fixtures.ts` and the integration tests that set the pointer
- Test: `apps/backend/src/__tests__/integration/scopes-derived.test.ts`

**Interfaces:**
- Produces: `loadScopes(userId)` keeps its return type, with new meanings. `activeSeasonId` is the season of the most recent `enrolledAt` enrolment with `status: "ACTIVE"` in a season with `status: "ACTIVE", deletedAt: null`, else null. `seasonAdminIds` and `groupLeaderIds` include only DRAFT or ACTIVE, non-deleted seasons.
- Produces: `markSessionsStale(tx: Prisma.TransactionClient, userIds: number[], now?: Date): Promise<void>`, writes `sessionsValidFrom`.

- [ ] **Step 1: Write the failing test.**

```ts
it("derives the current season from live enrolments", async () => {
  // ACTIVE enrolment + ACTIVE season
  expect((await loadScopes(a)).activeSeasonId).toBe(activeSeason.id);
  // ACTIVE enrolment + DRAFT season, stale pointer on the profile
  expect((await loadScopes(b)).activeSeasonId).toBeNull();
  // COMPLETED enrolment + ACTIVE season; WITHDRAWN + ACTIVE season
  expect((await loadScopes(c)).activeSeasonId).toBeNull();
  expect((await loadScopes(d)).activeSeasonId).toBeNull();
});
it("drops finished seasons from staff grants, keeps draft ones", async () => {
  expect((await loadScopes(admin)).seasonAdminIds).toEqual([activeSeason.id, draftSeason.id]);
  expect((await loadScopes(leader)).groupLeaderIds).toEqual([activeGroup.id]);
});
```

- [ ] **Step 2: Run it and confirm it fails.**
- [ ] **Step 3: Implement `loadScopes` and `markSessionsStale`, and remove every read and write of the pointer.** `PATCH /students/:id` now refuses an `activeSeasonId` key with the existing `forbidden_field` 403 for everyone. Remove it from the shared schemas and mobile forms. `students/detail` returns the derived value. Enrolling, dropping, completing and graduating call `markSessionsStale` for that student, in the same transaction.
- [ ] **Step 4: Fix the fixtures.** Test students who relied on the pointer get a real ACTIVE enrolment. `grep -rn activeSeasonId apps/backend/src/__tests__` should show only token-claim assertions.
- [ ] **Step 5: Run the backend suite** in tmux: `tmux new -d -s jpc-int "pnpm --filter @space/backend test:integration --runInBand 2>&1 | tee ~/logs/jpc-int.log"`, and `pnpm --filter @space/backend test:unit`, `pnpm typecheck`. Expected: all pass.
- [ ] **Step 6: Commit** `feat(backend): derive current season and staff grants from live seasons`.

### Task 3: Season status rules and the end check

**Files:**
- Modify: `apps/backend/src/routes/seasons/crud.ts`, `routes/seasons/index.ts`, `routes/students/enrollments.ts`, `src/docs/paths/seasons.ts`
- Create: `apps/backend/src/lib/queries/season-end.ts`, `apps/backend/src/routes/seasons/end.ts`
- Test: `apps/backend/src/__tests__/integration/season-end-check-routes.test.ts`

**Interfaces:**
- Produces: `loadSeasonEndCheck(seasonId: number, now: Date): Promise<SeasonEndCheck>`, `getSeasonEndCheck` handler, `GET /seasons/:id/end-check`. Register it before `/:id`-only routes, keeping table order.

- [ ] **Step 1: Write failing tests.**
  - `end-check`: 403 for a leader, a student, a mentor and an admin of another season. 200 for the season's admin and super. 409 `season_not_active` on a DRAFT or COMPLETED season.
  - Blockers include a SUBMITTED submission, a SUBMITTED quiz attempt, and a past session with `missing: 2` when two ACTIVE students have no attendance row.
  - **Not** blockers: DRAFT and RETURNED submissions, IN_PROGRESS attempts, a session whose `startsAt + durationMinutes` is after `now`, attendance for WITHDRAWN students, a submission on a soft-deleted assignment, anything from a soft-deleted student.
  - `students` lists ACTIVE, non-deleted students with `groupName` (null if ungrouped) and `attendancePct` 0 for a season with no sessions, using the same formula as `loadSeasonHistory`.
  - `PATCH /seasons/:id` as super: ACTIVE→COMPLETED is 409 `use_end_season`; ACTIVE→ARCHIVED is 409 `use_end_season`; COMPLETED→ACTIVE and COMPLETED→DRAFT are 409 `season_finished`; DRAFT→ACTIVE and COMPLETED↔ARCHIVED succeed; DRAFT→ACTIVE marks sessions stale for the season's enrolled students and staff.
  - `POST /students/:id/enrollments` into a COMPLETED season is 409 `season_finished`, even for super.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.** Extract the attendance formula from `loadSeasonHistory` into one shared helper rather than a second copy.
- [ ] **Step 4: Run the tests and confirm they pass.**
- [ ] **Step 5: Commit** `feat(backend): season status rules and end check`.

### Task 4: End season, result corrections and the overdue list

**Files:**
- Modify: `apps/backend/src/routes/seasons/end.ts`, `routes/seasons/index.ts`, `lib/queries/season-end.ts`, `src/docs/paths/seasons.ts`
- Test: `apps/backend/src/__tests__/integration/season-end-routes.test.ts`

**Interfaces:**
- Consumes: `loadSeasonEndCheck`, `markSessionsStale`.
- Produces:
  - `POST /seasons/:id/end`, body `endSeasonRequestSchema`, response `{ season: {id, code, status} }`
  - `GET /seasons/:id/results`, super only, `{ results: SeasonResultRow[] }`
  - `PATCH /seasons/:id/results/:studentUserId`, super only, body `updateSeasonResultRequestSchema`
  - `GET /seasons/overdue`, `overdueSeasonsResponseSchema`. Register before `/:id`.

- [ ] **Step 1: Write failing tests.**

```ts
it("ends a season in one step", async () => {
  const res = await post(`/seasons/${id}/end`, admin, { notPassed: [{ userId: sara, reason: "Attendance" }] });
  expect(res.status).toBe(200);
  // Season COMPLETED. Peter: COMPLETED + PASSED + resultSetAt.
  // Sara: COMPLETED + NOT_PASSED + the reason. A WITHDRAWN student untouched.
  // sessionsValidFrom set for students, admin and leader; loadScopes shows the season gone.
});
```

  Also:
  - 403 for a leader and other-season admin; 409 `season_not_active` if not ACTIVE; 409 `season_unfinished` while any blocker exists, nothing changed; 400 if `notPassed` names someone without an ACTIVE enrolment, nothing changed.
  - **Two concurrent `POST`s:** exactly one 200, the other 409, and Sara's result is as first written. Claim the season with a conditional `updateMany` on `status: "ACTIVE"` inside the transaction, and re-run the blocker check there.
  - `PATCH` result: super changes NOT_PASSED→PASSED with reason cleared; 403 for the season's admin; 409 `not_finished` on an active season; 409 `no_result` on a WITHDRAWN enrolment.
  - `overdue`: super sees every ACTIVE season whose `endDate` has passed; an admin sees only theirs; a leader and a student get an empty list; a future end date and a DRAFT season never appear.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement the handlers.** Write an audit line with ids only, as `students/lifecycle.ts` does. Never log a reason or name.
- [ ] **Step 4: Run the tests and confirm they pass.**
- [ ] **Step 5: Commit** `feat(backend): end season with results, corrections and overdue list`.

### Task 5: The lock and read access to past work

**Files:**
- Modify: `apps/backend/src/routes/assignments.ts:49-60`, `routes/quizzes/` read handlers, `routes/forum.ts`, `lib/queries/assignments*`
- Test: `apps/backend/src/__tests__/integration/season-lock-routes.test.ts`

**Interfaces:**
- Produces: `readOnly: boolean` on the assignment detail and student quiz detail responses (Zod schemas in `packages/shared`): for a STUDENT, `!hasActiveEnrollment(user, seasonId)`; false for everyone else.

- [ ] **Step 1: Write the failing table-driven test.** Using `seedModuleWorld`, end the season via the API, then log in again:
  - **Former admin and leader get 403** on: `PATCH /seasons/:id`, `POST /seasons/:id/groups`, `POST /seasons/:id/assignments`, `PUT /seasons/:id/group-assignments`, `POST /seasons/:id/imports/groups/commit`, `PATCH /groups/:id`, `POST /sessions`, `POST /sessions/:id/attendance`, `POST /sessions/:id/check-in-open`, `PATCH /assignments/:id`, `POST /submissions/:publicId/review`, `POST /quizzes`, `POST /quizzes/:id/grades`, `POST /sessions/:id/video-questions`, `POST /students/:id/notes`, and on reads: `GET /seasons/:id`, `/seasons/:id/roster`, `/groups/:id`, `/sessions/:id/attendance`.
  - **Former student gets 403 or 409** on: `PUT /submissions/by-assignment/:id`, `PATCH /submissions/:publicId`, `PUT /quizzes/:id/attempt`, `POST /quizzes/:id/attempt/submit`, `PUT /assignments/:id/forum/response`, `POST` forum comment, `POST /sessions/:id/video-quiz/answers`, `POST /sessions/check-in`.
  - **Former student and alumnus get 200** on `GET /assignments/:id` and `GET /submissions/:publicId` for their own, with `readOnly: true`, and on `GET /quizzes/:id`. A leader's private notes are never in those bodies.
  - **Dropped student** mid-season: the same reads return 200 with `readOnly: true`, and writes are refused.
  - **Another student** still gets 403 on someone else's submission.
  - **Super** still gets 200 on `PATCH /assignments/:id` and `POST /sessions/:id/attendance` in the finished season. **Mentor** still reads it.
- [ ] **Step 2: Run it and see which lines fail.**
- [ ] **Step 3: Fix only what fails.** In `assignments.ts`, a student's read now needs an enrolment of any status, replacing the "current or ACTIVE" rule; update that comment. Keep `studentCanSeeAssignment` for targeting. Add `hasActiveEnrollment` to any student write it shows is ungated. Remove staff read paths that keep a former staff member in, if any.
- [ ] **Step 4: Run the test and confirm it passes.**
- [ ] **Step 5: Commit** `feat(backend): lock finished seasons, keep students' own work readable`.

### Task 6: History outcomes and the student's season record

**Files:**
- Modify: `apps/backend/src/lib/queries/me.ts` (split into `lib/queries/me/` if it passes 400 lines), `routes/me.ts`, `src/docs/`
- Test: extend `apps/backend/src/__tests__/integration/alumni-module.test.ts`; Create: `apps/backend/src/__tests__/integration/season-record-routes.test.ts`

**Interfaces:**
- Produces: `GET /me/seasons/:seasonId`, returns `{ record: SeasonRecord }`. `loadSeasonRecord(user, seasonId, now)`. Outcome rule, one function `outcomeOf(status, result)`: WITHDRAWN→DROPPED; COMPLETED with PASSED→PASSED; COMPLETED with NOT_PASSED→NOT_PASSED; COMPLETED with null→COMPLETED.

- [ ] **Step 1: Write failing tests.**
  - `GET /me/season-history` lists only non-ACTIVE enrolments, so a current season and a DRAFT enrolment are absent, and each row has `code` and `outcome`.
  - `GET /me/seasons/:id`: 404 `not_found` with no enrolment and for a soft-deleted season. Role other than STUDENT is 403. 404 for an enrolment that's still ACTIVE, so this page only ever shows past work.
  - The body parses with the strict `seasonRecordSchema`. It never includes `resultReason`, `dropReason` or notes: assert `JSON.stringify(body)` doesn't contain the seeded reason text.
  - Quizzes: not-taken, in-progress and graded each map to the right `status`, and `score` is null until graded.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.** Reuse `listAssignmentStatesForStudent` for assignments. Remove the `excludeSeasonId` logic: filtering on `status: { not: "ACTIVE" }` replaces it for students and alumni alike.
- [ ] **Step 4: Run the tests and confirm they pass.**
- [ ] **Step 5: Commit** `feat(backend): season outcomes in history and a student season record`.

### Task 7: Mobile navigation between seasons

**Files:**
- Modify: `packages/shared/src/navigation.ts`, `apps/mobile/src/store/session.ts:42`, `apps/mobile/src/lib/alumni-guard.ts`
- Modify: every `navFor(`/`isAlumnus` caller that the type error names, `apps/mobile/src/lib/dashboard-branch.ts` if needed
- Test: `apps/mobile/src/__tests__/role-tabs.test.tsx`, `alumni-guard.test.ts`, `nav-routes.test.ts`, `packages/shared/src/__tests__/` navigation test

**Interfaces:**
- Produces: `NavAudience` gains required `activeSeasonId: number | null`. New const `STUDENT_BETWEEN: RoleNav`, added to `ALL_NAVS`. `navFor` returns it for a non-alumnus STUDENT with null `activeSeasonId`.

- [ ] **Step 1: Write failing tests.**

```ts
const hrefs = (a: NavAudience) => navFor(a).tabs.map((t) => t.href);
expect(hrefs({ role: "STUDENT", graduationYear: null, activeSeasonId: 1 }))
  .toEqual(["/dashboard", "/calendar", "/work", "/submitted", "/more"]);
expect(hrefs({ role: "STUDENT", graduationYear: null, activeSeasonId: null }))
  .toEqual(["/dashboard", "/calendar", "/history", "/more"]);
expect(hrefs({ role: "STUDENT", graduationYear: 2024, activeSeasonId: null }))
  .toEqual(["/dashboard", "/calendar", "/history", "/profile", "/more"]);
expect(isBlockedForAlumni(["(app)", "assignment", "[id]"])).toBe(false);
expect(isBlockedForAlumni(["(app)", "quiz", "[id]"])).toBe(false);
expect(isBlockedForAlumni(["(app)", "past-season", "[seasonId]"])).toBe(false);
expect(isBlockedForAlumni(["(app)", "(tabs)", "work"])).toBe(true);
```

  `STUDENT_BETWEEN.sidebar`: Dashboard, Calendar, History, Profile, Notifications, Settings. No Current Season, To do, Submitted or Attendance.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.** In the guard, `navFor` for the student side passes a non-null `activeSeasonId`. Remove `assignment` and `quiz` from `STUDENT_ONLY_SEGMENTS`: the server refuses alumni writes (Task 5) and detail screens are read-only (Task 9). Keep `assignments` and `quizzes`.
- [ ] **Step 4: Run the tests and `pnpm typecheck`; confirm they pass.**
- [ ] **Step 5: Commit** `feat(mobile): student tabs follow whether they are in a season`.

### Task 8: Between-seasons Today

**Files:**
- Create: `apps/mobile/src/screens/today/between-seasons.tsx`, `apps/mobile/src/lib/between-seasons.ts`, `apps/mobile/src/screens/today/finished-season-card.tsx`
- Modify: `apps/mobile/src/screens/today/student-today.tsx:128-140`, `apps/mobile/src/components/dashboard/AlumniDashboard.tsx`, `apps/mobile/src/hooks/use-self-service.ts` if needed
- Test: `apps/mobile/src/__tests__/between-seasons.test.tsx`; update `student-today.test.tsx`, `alumni-today.test.tsx`

**Interfaces:**
- Consumes: `useSeasonHistory`, `seasonOutcomeLabel`, `SeasonHistoryRow.outcome`, route `/past-season/[seasonId]` (Task 9).
- Produces: `betweenSeasonsState(rows: SeasonHistoryRow[]): { kind: "first" } | { kind: "finished"; row: SeasonHistoryRow } | { kind: "dropped"; row: SeasonHistoryRow }`, using the newest row, since the server orders by `enrolledAt` desc.

- [ ] **Step 1: Write failing tests.** Exact copy:
  - **finished:** card `GBV 2026 finished`, `Passed - 92% attendance` (or `Did not pass - 40% attendance`), link `View your season`, then `You'll see your next season here when you're added.`
  - **dropped:** `You're not in a season right now`, `You'll see your next season here when you're added.`, and no reason shown.
  - **first:** `Welcome to JPC Space`, `You'll see your first season here when you're added.`, plus the existing Complete your profile row.
  - Nothing renders `Contact your leader` or `Not enrolled yet`. `UpcomingEventsCard` still renders. A failed history read shows `InlineError` with retry, not a false first-time message.
  - Alumnus Today: `FinishedSeasonCard` above the existing content for the latest row, without the "next season" line.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Load `ui-ux-pro-max` and implement**, with `HeroCard` / `GroupedList` / `EmptyState`. Result in words, tone `ok` for Passed and `neutral` otherwise.
- [ ] **Step 4: Run the tests and confirm they pass.**
- [ ] **Step 5: Commit** `feat(mobile): between-seasons Today`.

### Task 9: Finished season page and read-only detail screens

**Files:**
- Create: `apps/mobile/app/(app)/past-season/[seasonId]/index.tsx`, `assignments.tsx`, `quizzes.tsx`, `attendance.tsx`
- Modify: `apps/mobile/src/screens/alumni/alumni-history.tsx` (`SeasonGroup`), `apps/mobile/src/hooks/use-self-service.ts`, `apps/mobile/src/lib/query-keys.ts`, `apps/mobile/app/(app)/_layout.tsx` (`DETAIL_ROUTE_NAMES`)
- Modify: `apps/mobile/src/screens/assignment-detail/student-assignment.tsx`, `apps/mobile/src/screens/quiz-detail/student-quiz-runner.tsx`, and the forum response control on assignment detail
- Test: `apps/mobile/src/__tests__/past-season.test.tsx`; update `alumni-history.test.tsx`, `history-screen.test.tsx`, `assignment-detail.test.tsx`, `quiz-runner.test.tsx`, `deep-links` tests

**Interfaces:**
- Consumes: `GET /me/seasons/:seasonId`, `readOnly`.
- Produces: `useSeasonRecord(seasonId: number): UseQueryResult<SeasonRecord>`; `queryKeys.me.seasonRecord(seasonId)`.

- [ ] **Step 1: Write failing tests.**
  - Page shows the title, dates, `Finished`, `Passed - 92% attendance`, `Group: Group A`, and rows `Assignments (12)`, `Quizzes (4)`, `Attendance (18 sessions)`, using the data's counts.
  - Tapping an assignment in the list pushes `/assignment/[id]`, a quiz `/quiz/[id]`. Back returns to the season page.
  - `SeasonGroup` shows the outcome chip instead of `Participated`, and a `View your season` row pushing `/past-season/[seasonId]`.
  - With `readOnly: true`: no Save, Submit, file delete or forum post controls; submission text, status and feedback still show; with no submission, `You didn't submit this.`; on an untaken quiz, `You didn't take this quiz.` and no Start; a graded quiz shows the result.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Load `ui-ux-pro-max` and implement.** Register in `DETAIL_ROUTE_NAMES`, following `seasons/[code]`. Every state maps to `RouteSkeleton`, `RouteError` with `onRetry`, `EmptyState`. Update the comments citing R34/R40 to match the new contract.
- [ ] **Step 4: Run the tests and confirm they pass.**
- [ ] **Step 5: Commit** `feat(mobile): finished season page and read-only work`.

### Task 10: Staff: End season, results and reminder

**Files:**
- Create: `apps/mobile/app/(app)/seasons/[code]/end.tsx`, `apps/mobile/app/(app)/seasons/[code]/results.tsx`, `apps/mobile/src/screens/season-end/blockers-list.tsx`, `review-list.tsx`, `result-sheet.tsx`, `overdue-callout.tsx`, `apps/mobile/src/hooks/use-season-end.ts`
- Modify: `apps/mobile/app/(app)/seasons/[code]/index.tsx` (manage items), `apps/mobile/src/screens/staff-today/admin-today.tsx`, `super-today.tsx`, `apps/mobile/src/components/season/SeasonForm.tsx:210-225`, `apps/mobile/src/lib/query-keys.ts`, design catalogue if a reusable component is added
- Test: `apps/mobile/src/__tests__/season-end.test.tsx`, `season-form` test

**Interfaces:**
- Consumes: Task 4 endpoints.
- Produces: `allowedSeasonStatuses(current: SeasonStatus): SeasonStatus[]` in `SeasonForm`: DRAFT→[DRAFT, ACTIVE], ACTIVE→[ACTIVE], COMPLETED→[COMPLETED, ARCHIVED], ARCHIVED→[ARCHIVED, COMPLETED]; new seasons as today.

- [ ] **Step 1: Write failing tests.**
  - Manage shows `End season` only on an ACTIVE season, for an administering admin or super; `Results` only for super on a finished season.
  - With blockers: the screen lists `6 submissions not reviewed`, the quiz and attendance groups, each row opening its target, and offers no way past them. No review list renders.
  - With none: review list, every student `Passed`. Tapping one opens a sheet with `Passed` / `Did not pass` and an optional reason captioned `Staff only. The student won't see this.` The footer `SaveBar` reads `End season`; a confirm dialog says what happens (`This finishes GBV 2026 for 84 students, including 3 who did not pass. Their leaders and admins lose access.`) and the POST carries only `notPassed`.
  - On success: `back()`, a toast, and season and scope queries invalidated. A 409 `season_unfinished` reloads the check, and `season_not_active` says someone else already ended it.
  - `Results` lists each student's result, and saving a correction PATCHes it. `overdue-callout` renders on admin and super Today only when the list is non-empty, naming the season and linking to `/seasons/[code]/end`.
  - `allowedSeasonStatuses` values above.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Load `ui-ux-pro-max` and implement.** Follow `screens/season-roster/` (rows mapped in `GroupedList`, `Sheet`, `SaveBar` in `Screen`'s `footer`). The reason field must stay usable with the keyboard open, per `CLAUDE.md`.
- [ ] **Step 4: Run the tests and confirm they pass.**
- [ ] **Step 5: Commit** `feat(mobile): end season flow, result corrections and overdue reminder`.

### Task 11: Sweep, docs and whole-branch verification

**Files:**
- Modify: `apps/backend/scripts/seed-sweep/`, `apps/mobile/.maestro/sweep/` (flows for between-seasons Today in each state, finished season page, read-only assignment, End blockers, review list and result sheet), `CLAUDE.md`, `apps/backend/README.md`

- [ ] **Step 1: Add sweep seed data and flows.** Flows never save anything.
- [ ] **Step 2: Run the `ui-sweep` skill** and fix what it finds. Check every shot against `references/pro-rules.md`.
- [ ] **Step 3: Update `CLAUDE.md`:** one active role rule and season lifecycle, `activeSeasonId` as a derived claim, the unused column, former-staff cut-off, the preflight script.
- [ ] **Step 4: Run everything** in tmux: `tmux new -d -s jpc-full "(pnpm lint && pnpm typecheck && pnpm test) 2>&1 | tee ~/logs/jpc-full.log"`. Expected: all pass, with the output read rather than assumed.
- [ ] **Step 5: Commit** `docs: community model build 1`.

### Task 12: Release (owner confirms each outward step)

Nothing in this task runs without the owner saying so at the time.

- [ ] **Step 1: Run the preflight read-only against live Prisma Postgres.** Get the URL for that one command without printing it, and confirm the printed host is `db.prisma.io`, not `ep-cold-mode`. Report violations to the owner. **If any exist, stop.**
- [ ] **Step 2: With confirmation, apply** `db:migrate:deploy`, then `preflight:community --apply`, to live. Report the counts.
- [ ] **Step 3: With confirmation, merge to `main` and push to both remotes:**
```
GH_TOKEN=$(gh auth token --hostname github.com --user jesusprojectcommunity) git push jpc HEAD:main
gh auth switch --hostname github.com --user MarkBotros0 && git push origin HEAD:main
```
- [ ] **Step 4: Verify the deployment** on `https://jpc-space-be.vercel.app/health`.
- [ ] **Step 5: With confirmation, run the `release-app` skill.** Existing TestFlight builds will fail on History until replaced, because `seasonHistoryRowSchema` is strict and gains fields. Tell testers to update.
