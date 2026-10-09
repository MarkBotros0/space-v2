# Plan 6 — Season, Session & Group Admin Screens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An admin runs any season, not just the current one, from the phone. That means:
- a code-addressed season detail screen, plus a SUPER edit screen covering identity, status and delete;
- session create/edit/delete with a recurrence scope selector and a series-impact preview;
- season group management with a delete that warns about consequences first;
- a roster grid for bulk group assignment;
- a multi-season, windowed calendar;
- check-in token regeneration and a narrow check-in state read;
- the session's quiz card for staff.

This plan closes coverage-audit gaps G4, G5, G6, G7, G17, G18 (the quiz card), G19 and G20.

**Architecture:** One shared-contract task, then three backend tasks that the coordinator runs one after another, then a mobile foundation task, then four parallel mobile streams.

*Backend.* Every new endpoint reuses an existing gate in `lib/rbac.ts` or `lib/permissions.ts`. Recurrence siblings resolve through Plan 3's season-fenced `resolveSeriesTargets` (ruling C10). Group membership writes go through one function, `assignStudentsToGroups`. Plan 17's importer later calls that same function and adds no second copy. Wall-clock values follow ruling X13 / C2:
- the server derives `dayKey` and `startTime` on every session row and on the session detail;
- session writes may send org wall-clock fields `startDay` (`YYYY-MM-DD`) and `startTime` (`HH:mm`), split the same way as Plan 5's `dueDay`/`dueTime`. The server converts them to an instant in `ORG_TIMEZONE`.

The mobile app therefore never reads or composes a time in the device zone.

*Mobile.* Season screens are addressed by code (`/seasons/[code]`, spec 02 §9). Where a dynamic route has children, it uses the directory form (ruling X7): `/seasons` becomes `seasons/index.tsx`, and `group/[id].tsx` becomes `group/[id]/index.tsx`.

**Tech Stack:** Express 5, Prisma 7 (`src/generated/prisma`), Zod 3 contracts in `packages/shared`, jest + supertest against the shared staging DB; Expo SDK 54 / expo-router 6 (typed routes), React Query 5, RNTL 13.

**Spec:**
- `docs/superpowers/specs/domains/02-seasons.md` — §7 `by-code`, §9 rows 1–5, §10 D3, D8, D9, D10.
- `03-sessions.md` — §7 `GET /sessions`, `GET /sessions/:id/series`; §9 calendar role table; §10 items 1, 2, 3, 9, 10.
- `04-attendance.md` — §7 `check-in-regenerate`, `GET /sessions/:id/check-in`; R40; §9 row 2.
- `05-groups.md` — §7, §8, §9; §10 items 1, 5, 6, 7.
- `16-imports.md` §9, only for the route Plan 17 hangs off the roster.
- `_DECISIONS.md` — C1, C2, C4, C7, C8, C9, C10, C12.

v1 sources:
- `jpc-space/src/lib/group-actions.ts:159-248`
- `lib/groups-query.ts:143-163`
- `lib/sessions-query.ts:64-116`
- `lib/session-actions.ts:275-295`
- `lib/quiz-query.ts:141-170`
- `app/super/seasons/[code]/{page,edit/page}.tsx`
- `app/admin/season/[code]/{page,groups/**,roster/page,sessions/[id]/{page,edit/page}}.tsx`
- `app/admin/season/[code]/calendar/new/page.tsx`
- `app/{super,leader,admin}/calendar/page.tsx`
- `app/leader/sessions/[id]/page.tsx`

**Depends on** (execution order 1 → 2 → 3 → 4 → 5 → **6** → 7 → …):
- **Plan 1:** `DETAIL_ROUTE_NAMES`, `ALL_ROUTE_NAMES`, `routeNameForHref` exported from `app/(app)/_layout.tsx`; `makeSession`/`makeUser`/`makeScopes`; `listRouteNames`/`ambiguousRouteSiblings`; `/more`.
- **Plan 2:** `groups.tsx`, `group/[id].tsx`, `use-groups.ts` (`useMyGroups`, `useGroupDetail`, `MY_GROUPS_ROLES`), `queryKeys.groups`, `session/[id]/attendance.tsx`.
- **Plan 3:**
  - `lib/org-time.ts` (`orgWallClock`, `fromOrgWallClock`, `addWeeksInOrgTime`, `formatInOrgTime`) and `config.orgTimezone`;
  - season and session write endpoints and schemas;
  - `resolveSeriesTargets` (module-local in `routes/sessions.ts`);
  - error codes `code_taken`, `invalid_code`, `forbidden_field`, `season_in_use`, `has_student_records`;
  - `isUniqueViolation`; `testSeasonCode()` (26 chars).
- **Plan 4:**
  - `orgDayKey`; `dayKey` on session list rows; `canManageCheckIn`;
  - `sessionDetailSchema`, `checkInOpenResponseSchema`, `checkInCloseResponseSchema`, `seasonRefResponseSchema`, `seasonDeletedResponseSchema`, `apiErrorBodySchema`;
  - `useSeasons`, `useSeasonDetail`, `useCurrentSeasonId`, `pickCurrentSeasonId`, `apiErrorMessage`, `formatDayKey`;
  - `use-season-writes.ts`, `use-session-detail.ts`, `calendar.tsx`, `seasons.tsx`, `season.tsx`, `session/[id]/index.tsx`.
- **Plan 5** (assignment authoring):
  - shared `isoDaySchema` / `wallTimeSchema` (`packages/shared/src/org-time.ts`);
  - backend `orgWallTime(date)` / `orgWallClockToInstant(day, time | null)` (`lib/org-time.ts`);
  - mobile `useSeasonGroups(seasonId)` (`use-groups.ts`), `queryKeys.groups.bySeason`, `formatWallTime` (`format.ts`);
  - Plan 5's own `POST /seasons/:id/assignments` handler in `routes/seasons.ts`, which Task 2's X5 conversion covers along with every other handler.

  This plan reuses every one of those names and redefines none. It only *reads* `Assignment` / `AssignmentTarget` rows, to warn about them before a group is deleted.

**Consumed later — stable names this plan guarantees:**
- **Plan 17:**
  - backend: `assignStudentsToGroups(tx, seasonId, assignments)` and `GroupOutsideSeasonError` in `apps/backend/src/lib/queries/groups.ts`;
  - mobile: route files `app/(app)/seasons/[code]/index.tsx` (href `/seasons/[code]`) and `app/(app)/seasons/[code]/roster/index.tsx` (href `/seasons/[code]/roster`), so Plan 17 adds `seasons/[code]/roster/import.tsx` beside the roster;
  - hooks and keys: `useSeasonByCode`, `useSeasonRoster`, `queryKeys.groups.roster`.
- **Plan 14:** its calendar merge targets the restructured `calendar.tsx` (Task 9) and its `groupSessionsByDay` helper. Session rows now carry `startTime` (org `HH:mm`), so Plan 14 buckets sessions by `dayKey` and needs no device-zone formatting.
- **Plan 8:** the session quiz card (`SessionQuizzesCard`) has no navigation; Plan 8 wires a row press to its quiz routes. Plan 8's `quizKindSchema` may replace the inline enum in `sessionQuizItemSchema`.
- **Plan 16:** it can link a season to `/seasons/[code]` and use `useSeasonByCode`, `useStaffSeasonSelection`, `SeasonSwitcher` and `useSessionRange`.

## Global Constraints

- **No migrations, no schema edits** (X14, C1). There are no edits under `apps/backend/prisma/`. No `process.env` outside `lib/config.ts`. No `@/` alias. Never import `@prisma/client`.
- **Shared value imports** in any backend `src` file use the relative path `../../../../packages/shared/src/index` (adjust the depth for `lib/queries/*`: `../../../../../packages/shared/src/index`). Never use `"@space/shared"` for a value import (X12). Type-only imports may use the package name.
- **Envelope:** `{ data }` / `{ error: { code, message } }` via `apiOk`/`apiError`.
- **Auth mounting (X5):**
  - Every route this plan adds attaches `requireAuth` the way its router already does.
  - Task 2 **converts `seasonsRouter` to per-route `requireAuth`**, because `/api/v1/seasons` is a shared prefix (Plans 12, 15 and 17 mount routers on it).
  - `sessionsRouter` and `groupsRouter` own their prefixes and keep router-level auth.
- **Client parsing:** every response is parsed with a shared Zod schema on the client, mutations included (X10). There is no `as T` on an API response.
- **Org timezone (X13 / C2):**
  - The server derives every org day and wall-clock time (`dayKey`, `startTime`, `fromDayKey`, `toDayKey`, `expiresAtTime`).
  - Mobile renders these with `formatDayKey` or verbatim, and never calls `formatDate` / `formatSessionTime` on a session instant in code this plan writes.
  - Session writes from mobile send `startDay: "YYYY-MM-DD"` and `startTime: "HH:mm"`, validated by Plan 5's `isoDaySchema` / `wallTimeSchema`.
  - Mobile renders an org time with Plan 5's `formatWallTime`.
- **Membership (C9):** season membership resolves through `SeasonEnrollment`, never `GroupStudent`. `GroupStudent` is written only as a mirror.
- **Mobile conventions:**
  - relative imports; Zod-parse everything; `enabled` plus a guarded `refetch`;
  - `LoadingState`/`ErrorState`/`EmptyState`; tab screens pass `edges={["top","left","right"]}`;
  - `renderWithProviders` for anything rendering `Screen`; `jest.mock` factories close over `mock*` names only;
  - typed routes — never `as Href`; run `pnpm turbo routes:generate --filter=@space/mobile` after adding route files.
- **Route-count tests are derived** (X9). Adding a detail route appends to `DETAIL_ROUTE_NAMES`, and no count literal is edited. Test session fixtures use `makeSession` or carry `avatarPath: null` (X11).
- **`src/docs/openapi.ts`** changes in the same commit as its route. This is possible because the coordinator runs backend Tasks 2–4 serially.
- **Integration tests are coordinator-run, serially:** `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern <suite>`. No subagent runs an integration suite. Every new suite calls `cleanupTestData()` in both `beforeAll` and `afterAll` and sets `jest.setTimeout(60000)`. The suites assume the default `ORG_TIMEZONE=Africa/Cairo`, and the first test of the session suite asserts that.

## Decisions this plan makes (read before implementing)

- **D-16.1 — Routes.**
  - *Season routes.* Spec 02 §9 addresses seasons by code at `/seasons/[code]`. `seasons.tsx` already exists as the SUPER tab. Its new children mean it moves to `seasons/index.tsx`, the precedent `students/index.tsx` already set, and `routeNameForHref` learns `seasons` as a directory href. New season routes are `seasons/[code]/index.tsx`, `seasons/[code]/edit.tsx` and `seasons/[code]/roster/index.tsx`. The roster uses the directory form because Plan 17 adds `roster/import.tsx`.
  - *Group routes.* Plan 2's `group/[id].tsx` moves to `group/[id]/index.tsx` and gains `group/[id]/edit.tsx`. Group creation is `group/new.tsx?seasonId=`.
  - *Session routes.* Session creation is `session/new.tsx?seasonId=`, and session edit is `session/[id]/edit.tsx` (Plan 4 already uses the directory form there).
  - *Why the singular `group`/`session` prefixes stay.* They are Plan 2/4's detail namespaces. Spec 05/03's `/groups/[id]`, `/sessions/[id]` spellings would collide with the `groups.tsx` tab file.
- **D-16.2 — `GET /api/v1/seasons/by-code/:code`.** This is spec 02 §7's resolution step, and it never overloads `:id` (a numeric code is a legal slug). It is registered **before** every `/:id/*` route: otherwise `/by-code/roster` would match `/:id/roster`. Per spec D8, the API stays canonical on `id`. The detail screen keys its query by code, and every child screen calls id-addressed endpoints with the resolved `id`. After a SUPER renames the code, the edit screen `router.replace`s to the new code.
- **D-16.3 — Season detail gains `absenceBudgetMinutes`, `absenceWeightMinutes`, `canAdminister`** (C4: the server says whether this caller administers the season). SUPER's PATCH is a full body whose budget fields *default* to 180/90 (Plan 3), so an edit form that did not carry the stored values would silently reset them. The fields are therefore required on the contract.
- **D-16.4 — Status is a free four-way selector, v1 R17.** The SUPER edit screen shows DRAFT / ACTIVE / COMPLETED / ARCHIVED as one control, the same as v1's free `Select`. v2 adds no state machine, because v1 has none and spec 02 D11 says not to invent one here. DRAFT→ACTIVE→ARCHIVED is the expected path, and the control makes each step one tap.
- **D-16.5 — Seasons list grouped by program, plus SUPER by-program / by-year screens, as v1** (G20; spec 02 R43, R45, R47). `/seasons` renders the role-scoped list grouped under **program headings** sorted with `localeCompare`, the seasons inside each program sorted `year` desc (v1 `src/components/seasons/seasons-list.tsx:112-123`). There is no program filter chip row. Each program heading links to the by-program screen. SUPER also gets two screens, `seasons/program/[program].tsx` and `seasons/year/[year].tsx` (v1 `src/app/super/seasons/program/[program]/page.tsx`, `.../year/[year]/page.tsx`). By-program matches `program` by exact string (v1 R44), excludes deleted seasons and sorts `year` desc (v1 program page:27). By-year sorts `program` asc and regroups by program the way the list does (v1 year page:27). A non-integer year shows the not-found state, and so does a filter that matches no seasons (v1 program page:40, year page:24,41). Both read the already-loaded role-scoped list client-side; no `?program=` parameter is added. *(v1 parity 2026-10-09: was "client-side program filter chips over a year-grouped list; no by-program/by-year routes")*
- **D-16.6 — Session wall clock, using Plan 5's split.**
  - `createSessionRequestSchema` and `updateSessionRequestSchema` accept **exactly one of** two forms. One is `startsAt`, an instant: Plan 3's original field, still accepted. The other is the pair `startDay` (`isoDaySchema`) + `startTime` (`wallTimeSchema`), which mirrors Plan 5's `dueDay`/`dueTime`.
  - The server converts the pair with Plan 5's `orgWallClockToInstant`.
  - Session list rows gain `startTime` (`HH:mm` on the org clock). The session detail gains `dayKey` and `startTime`.
  - The edit form is pre-filled from those two fields. Nothing on the device converts zones.
- **D-16.7 — `GET /api/v1/sessions` is windowed and role-scoped** (G17, spec 03 §7, §10 item 10).
  - *Query.* `?from&to&seasonId`, all optional.
  - *Window.* The window is optional. With no `from`/`to`, the response holds **every** session of the scoped seasons, unbounded, ordered `startsAt` asc, as v1's SUPER calendar did (v1 `src/lib/sessions-query.ts:64-81`, spec 03 R75). With only `from`, the window is open-ended `[from, ∞)`. With only `to`, it is `(-∞, to)`. With both, it is `[from, to)`. There is no default 8-week window and no `SESSION_RANGE_MAX_DAYS` cap. Only an inverted window (`to <= from`) is `400 bad_request`. Week/Month views keep sending both bounds. *(v1 parity 2026-10-09: was "default org-midnight today + 8 weeks; one bound → 8 weeks; span ≤ 120 days")*
  - *Season set by role.*
    - SUPER: every ACTIVE, non-deleted season (v1 R23), or any one live season via `seasonId`.
    - ADMIN: their live seasons, or one of them via `seasonId`. A season outside the set is 403; the parameter is never a widener.
    - LEADER: every live season in which they lead a group (replacing v1's N+1). Same `seasonId` rule as ADMIN.
    - STUDENT and MENTOR: 403. Students keep Plan 4's pinned-season path.
  - *Response.* `{ sessions, from, to, fromDayKey, toDayKey, todayDayKey }`. `from`/`fromDayKey` and `to`/`toDayKey` are `null` on an open side. `todayDayKey` is the server-derived org day for today (C2). The Upcoming (agenda) view sends no bounds and shows only rows with `dayKey >= todayDayKey`: everything from the start of today onward, with no upper bound and no "Earlier"/"Later" paging. Past sessions are reached only through Week/Month (v1 `src/components/sessions/season-calendar.tsx:236-251`, spec 03 R98). *(v1 parity 2026-10-09: was "Upcoming is an 8-week window paged with Earlier (`to = from`) / Later (`from = to`)")*
  - *Check-in tokens.* `checkInToken` is served only on rows of seasons the caller administers (spec 04 §7 narrowing). Leaders get `null`.
- **D-16.8 — `GET /api/v1/sessions/:id/series?scope=`** (spec 03 §7). It is admin-only. It reuses `resolveSeriesTargets`, so the preview and the write select the identical set (C10 fence included). It returns each target's `dayKey`, `startTime`, `isAnchor` and `attendanceCount`, plus the totals `attendanceCount` and `videoProgressCount` (the two things Plan 3's delete guards). "future" means the anchor and every sibling at or after its **stored** start, evaluated before any move. That is v1's semantics (spec 03 §10 item 3), and the preview and PATCH agree by construction.
- **D-16.9 — Check-in endpoints use spec 04's names.**
  - `POST /sessions/:id/check-in-regenerate` (spec 04 §7) is chosen over spec 03's `check-in-token`, because it sits beside `check-in-open`/`-close`.
  - `GET /sessions/:id/check-in` returns `{ state, isOpen, checkInToken, checkInOpenAt, checkInClosedAt, expiresAt, expiresAtTime }`, derived through `lib/check-in.ts` (one rule).
  - Regenerate leaves both timestamps alone (v1 R40). A code shown on screen stops working, so the console asks for a second press while check-in is open (spec 03 §10 item 9).
  - Plan 4's console now reads its token from this narrow endpoint instead of the season-wide session list.
- **D-16.10 — Session quiz card through `GET /sessions/:id/quizzes`** (G18 rest).
  - Plan 8's `GET /quizzes?sessionId=` runs **after** this plan, so the card cannot depend on it. This narrow read ports v1's `listQuizzesForSession` (`quiz-query.ts:141-170`): ordered `createdAt asc`, gated by `attendanceScopeFor` (season admins plus leaders in the season — v1's admin and leader session pages).
  - The card renders only when there is at least one quiz (v1 leader page).
  - Rows are not pressable in this plan: Plan 8 (Task 11b) adds the press, opening `/quiz/[id]`, because typed routes forbid linking a route that does not exist yet.
- **D-16.11 — Roster.**
  - *The endpoint.* `GET /seasons/:id/roster` returns the season's **ACTIVE enrolments of live STUDENT users** (C9; v1 used `activeSeasonId`, R81). Each row carries the per-season group from `SeasonEnrollment.groupId`.
  - *Cross-season membership.* The row carries **no** `otherSeasonGroup`. A student whose only `GroupStudent` membership is in another season's group shows as unassigned here, as in v1 (v1 `src/lib/groups-query.ts:151-155,161`, spec 05 R82). *(v1 parity 2026-10-09: was "each row carries `otherSeasonGroup`, shown as a caption on grid and form")*
  - *Not the group form's picker.* The group form's student picker lists **every live STUDENT user** (`{ id, name, email }`, name asc), not this roster. v1 did this on purpose so an admin can enrol a new student while building a group (v1 `src/lib/groups-query.ts:112-121`, spec 05 R18/R78). The roster remains the source of the group's current members for pre-selection on edit. *(v1 parity 2026-10-09: was "the season roster is the group form's picker")*
  - *No pagination* (divergence from spec 05 §7). The group form must know a group's full membership to send its `studentIds`, and a season is hundreds of rows at most. The screen filters client-side with a search field.
- **D-16.12 — `PUT /seasons/:id/group-assignments`.**
  - *Request.* `{ assignments: [{ studentUserId, groupId | null }] }`: at most `GROUP_ASSIGNMENTS_MAX` (**2000**, v1 `src/lib/group-actions.ts:183-190`, spec 05 R48), unique students. A null group unassigns. The writes are **batched** so 2000 rows finish inside the transaction (KEEP-FIX R56): one `deleteMany`, one `createMany` and one `updateMany` per target group in `assignStudentsToGroups` / `unassignStudentsFromGroups`, never a per-row loop. *(v1 parity 2026-10-09: was "at most 500 (spec 05 §8), written row by row")*
  - *Write.* Non-null entries go through **`assignStudentsToGroups(tx, seasonId, assignments)`**, with the exact signature and the two documented divergences Plan 17 relies on: (1) eligibility is an **ACTIVE** `SeasonEnrollment` of a live STUDENT, never `activeSeasonId`; (2) it returns what it **applied**. Null entries go through `unassignStudentsFromGroups`, which deletes only **this season's** `GroupStudent` row and nulls `SeasonEnrollment.groupId`.
  - *Failure.* Any group outside the season refuses the whole batch with `400 group_outside_season` (`GroupOutsideSeasonError`). Everything runs in one transaction.
  - *Response.* `{ assigned, unassigned, skippedStudentIds }`. That is Plan 17's `skippedStudentIds` form, not spec 05's `skipped: [{studentUserId, reason}]`, because the two writers must report alike.
- **D-16.13 — Group delete is designed, not ported** (C12; v1's `deleteGroupAction` has no caller, R46).
  - `GET /groups/:id/impact` returns `{ studentCount, leaderCount, soleTargetAssignments }`.
  - `DELETE /groups/:id` **refuses with `409 group_has_sole_targets`** while any live, non-all-groups assignment targets only this group. That is spec 05 §10 item 5's recommendation: otherwise the assignment becomes visible to nobody (R44).
  - Otherwise it deletes the group, leaders, memberships and target rows, and nulls **every** `SeasonEnrollment.groupId` pointing at the group, in one interactive transaction that re-checks the targets.
  - It returns `{ deleted: true, orphanedStudentIds }`. Spec 05's `untargetedAssignmentIds` is omitted because blocking makes it always empty.
- **D-16.14 — Leader picker: `GET /api/v1/groups/leader-options`.** It is an interim read: live LEADER users, `{ id, name, email }`. *(v1 parity 2026-10-09, spec 05 R18/R78:)* A sibling `GET /api/v1/groups/student-options` returns every live STUDENT user, `{ id, name, email }` name asc, for the group form, with the same gate (v1 `src/lib/groups-query.ts:112-121`). Gate: new `isAdminOfAnySeason` predicate in `lib/rbac.ts` (C7: claims only through predicates). Spec 05 §7 wants the domain-11 `GET /users?role=` endpoint, which arrives with Plan 9, *after* this plan. Plan 9 may repoint `useLeaderOptions` to it and delete this route.
- **D-16.15 — Group detail gains `canManage`** (`isAdminOfSeason`, C4), which drives the Edit button. Plan 2's two fixtures gain the field.
- **D-16.16 — `/groups` admin branch and calendar ADMIN branch follow v1's redirect rules.**
  - *Calendar (ADMIN).* There is **no season switcher**. The screen opens the newest ACTIVE administered season by `startDate` desc, or failing that the newest non-deleted one: `pickCurrentSeasonId` over the role-scoped list. It renders that season's full calendar. With none it shows "No active season found." Other seasons' calendars are reached from their season workspace (v1 `src/app/admin/calendar/page.tsx:16-40`, spec 03 R86). *(v1 parity 2026-10-09: was "ADMIN calendar has a SeasonSwitcher over all their seasons")*
  - *`/groups` (ADMIN, SUPER).* The default season is the newest non-deleted administered season by `startDate` desc, with **no ACTIVE preference** (v1 `src/app/admin/groups/page.tsx:25-40`, spec 05 R91). `useStaffSeasonSelection` therefore takes the default picker as a parameter: `/groups` passes a `pickNewestSeasonId` (latest `startDate`, any status). The `SeasonSwitcher` stays on `/groups` only as the mobile stand-in for v1's per-season groups URL. `/groups` also accepts an optional `seasonId` param as the initial pick, so group create/edit can return to that season's list (R97). *(v1 parity 2026-10-09: was "both default to `pickCurrentSeasonId` (ACTIVE first) with a switcher")*
  - SUPER uses the same branch on `/groups` (v1 rejected SUPER there, R92; not ported).
- **D-16.17 — MENTOR on `/calendar` gets "not available for your role"** (spec 03 §9: not in the mentor nav, so it needs a graceful state).

**Error codes this plan defines:** `group_outside_season` 400, `group_has_sole_targets` 409. It reuses `bad_request` 400, `forbidden` 403, `not_found` 404, and Plan 3's `has_student_records` / `season_in_use` / `code_taken`.

**Execution shape:**

```
Task 1 (coordinator)            shared contracts + backend org wall-clock start
Task 5 (coordinator)            mobile foundation: route moves, stubs, layout, keys, fixtures, switcher
then in parallel:
  coordinator, serially:        Task 2 (seasons backend) → Task 3 (sessions backend) → Task 4 (groups backend)
  agent M1:                     Task 6 (season screens)
  agent M2:                     Task 7 (session screens)
  agent M3:                     Task 8 (group + roster screens)
  agent M4:                     Task 9 (calendar)
Task 10 (coordinator)           closing gate
```

**Ordering and file ownership:**
- Task 1 changes contracts, which turns mobile fixtures red. Task 5 Step 1 repairs them, and Tasks 1 and 5 are committed before any stream starts.
- The backend tasks run on the coordinator so that their integration suites run serially, and fail-first, against the shared DB. They touch only `apps/backend`.
- M1–M4 touch disjoint files, listed per task. Only Task 5 edits `_layout.tsx`, `query-keys.ts`, `api-error.ts`, `app-layout.test.tsx` and test fixtures.
- Mobile tests mock `apiClient`, so no stream needs the backend running.

---

### Task 1: Shared contracts + org wall-clock start *(coordinator)*

**Files:**
- Modify: `packages/shared/src/session.ts`, `packages/shared/src/season.ts`, `packages/shared/src/group.ts`
- Modify: `apps/backend/src/routes/sessions.ts` (`sessionStartFrom` at Plan 3's two start sites only)
- Test: `packages/shared/src/__tests__/season-admin-contracts.test.ts`

**Interfaces:**
- Consumes: Plan 5's `isoDaySchema`, `wallTimeSchema` (`./org-time`) and backend `orgWallClockToInstant`; Plan 3's `sessionWriteBase`, `recurrenceScopeSchema`, `seasonDetailSchema`; Plan 4's `sessionDetailSchema`, `sessionListItemSchema.dayKey`; Plan 2's `groupDetailSchema`.
- Produces (exact names):
  - **Session contract changes:** `sessionListItemSchema.startTime`; `sessionDetailSchema.dayKey` and `.startTime`; `createSessionRequestSchema` / `updateSessionRequestSchema` accept `startDay` + `startTime`; `CreateSessionInput` and `UpdateSessionInput` (`z.input`).
  - **Session write responses:** `sessionCreatedResponseSchema`, `sessionUpdatedResponseSchema`, `sessionDeletedResponseSchema`.
  - **Series and calendar range:** `sessionSeriesItemSchema` / `SessionSeriesItem`, `sessionSeriesResponseSchema` / `SessionSeries`; `sessionRangeQuerySchema` (v1 parity 2026-10-09: `SESSION_RANGE_DEFAULT_WEEKS` / `SESSION_RANGE_MAX_DAYS` dropped, R75), `sessionRangeResponseSchema` / `SessionRange`.
  - **Check-in and quizzes:** `checkInStateValueSchema`, `checkInStateSchema` / `CheckInStateResponse`; `sessionQuizItemSchema` / `SessionQuizItem`.
  - **Season and group detail fields:** `seasonDetailSchema` gains `absenceBudgetMinutes`, `absenceWeightMinutes`, `canAdminister`; `groupDetailSchema` gains `canManage`.
  - **Backend:** module-local `sessionStartFrom(body)` in `routes/sessions.ts`. It uses Plan 5's `orgWallClockToInstant` and defines no wall-clock helper of its own.
  - **Group admin:** `groupRefResponseSchema`, `leaderOptionSchema` / `LeaderOption`, `groupImpactSchema` / `GroupImpact`, `groupDeleteResponseSchema`, `seasonRosterRowSchema` / `SeasonRosterRow`, `GROUP_ASSIGNMENTS_MAX`, `groupAssignmentsRequestSchema` / `GroupAssignmentsRequest`, `groupAssignmentsResponseSchema` / `GroupAssignmentsResult`.

- [ ] **Step 1: Failing test**

```ts
// packages/shared/src/__tests__/season-admin-contracts.test.ts
import {
  checkInStateSchema,
  createSessionRequestSchema,
  groupAssignmentsRequestSchema,
  groupDetailSchema,
  seasonDetailSchema,
  sessionDetailSchema,
  sessionListItemSchema,
  sessionRangeQuerySchema,
  updateSessionRequestSchema,
} from "../index";

const base = { title: "Week one", durationMinutes: 90 };

describe("session start — exactly one of startsAt / (startDay + startTime) (D-16.6)", () => {
  it("accepts org wall-clock fields", () => {
    const parsed = createSessionRequestSchema.parse({
      ...base, seasonId: 1, startDay: "2099-07-03", startTime: "19:30",
    });
    expect(parsed).toMatchObject({ startDay: "2099-07-03", startTime: "19:30", repeatWeeks: 1 });
  });

  it("still accepts Plan 3's instant", () => {
    expect(
      createSessionRequestSchema.safeParse({ ...base, seasonId: 1, startsAt: "2099-03-01T18:00:00.000Z" }).success,
    ).toBe(true);
  });

  it("refuses both, and refuses neither", () => {
    expect(
      createSessionRequestSchema.safeParse({
        ...base, seasonId: 1, startsAt: "2099-03-01T18:00:00.000Z",
        startDay: "2099-03-01", startTime: "20:00",
      }).success,
    ).toBe(false);
    expect(updateSessionRequestSchema.safeParse({ ...base, scope: "one" }).success).toBe(false);
  });

  it("refuses half a wall-clock pair, and malformed halves (Plan 5's schemas)", () => {
    expect(updateSessionRequestSchema.safeParse({ ...base, scope: "one", startDay: "2099-03-01" }).success).toBe(false);
    expect(
      updateSessionRequestSchema.safeParse({ ...base, scope: "one", startDay: "2099-02-31", startTime: "20:00" }).success,
    ).toBe(false);
    expect(
      updateSessionRequestSchema.safeParse({ ...base, scope: "one", startDay: "2099-03-01", startTime: "24:00" }).success,
    ).toBe(false);
  });
});

describe("server-derived fields are required on the wire (C4)", () => {
  const row = {
    id: 1, title: "S", startsAt: "2099-03-01T18:00:00.000Z", dayKey: "2099-03-01",
    durationMinutes: 60, location: null, recurrenceGroupId: null, attendanceMarked: false,
    seasonId: 7, seasonCode: "s7", seasonTitle: "Spring", checkInToken: null,
    checkInOpenAt: null, checkInClosedAt: null,
  };
  it("list rows carry startTime", () => {
    expect(sessionListItemSchema.safeParse(row).success).toBe(false);
    expect(sessionListItemSchema.safeParse({ ...row, startTime: "20:00" }).success).toBe(true);
  });

  it("session detail carries dayKey and startTime", () => {
    const detail = {
      id: 1, title: "S", description: null, startsAt: "2099-03-01T18:00:00.000Z", durationMinutes: 60,
      location: null, youtubeUrl: null, recurrenceGroupId: null, seasonId: 7, seasonCode: "s7",
      seasonTitle: "Spring", checkInOpen: false, myAttendance: null, canMarkAttendance: false,
      canManageCheckIn: false,
    };
    expect(sessionDetailSchema.safeParse(detail).success).toBe(false);
    expect(sessionDetailSchema.safeParse({ ...detail, dayKey: "2099-03-01", startTime: "20:00" }).success).toBe(true);
  });

  it("season detail carries the budget fields and canAdminister (D-16.3)", () => {
    const detail = {
      id: 7, code: "s7", title: "T", program: "TEST", year: 2099, status: "ACTIVE",
      startDate: "2099-01-01T00:00:00.000Z", endDate: "2099-12-31T00:00:00.000Z",
      description: null, sessionCount: 0, studentCount: 0, groups: [],
    };
    expect(seasonDetailSchema.safeParse(detail).success).toBe(false);
    expect(
      seasonDetailSchema.safeParse({ ...detail, absenceBudgetMinutes: 180, absenceWeightMinutes: 90, canAdminister: true }).success,
    ).toBe(true);
  });

  it("group detail carries canManage (D-16.15)", () => {
    const detail = {
      id: 3, name: "A", description: null, seasonId: 7, seasonCode: "s7", seasonTitle: "T",
      leaders: [], students: [],
    };
    expect(groupDetailSchema.safeParse(detail).success).toBe(false);
    expect(groupDetailSchema.safeParse({ ...detail, canManage: false }).success).toBe(true);
  });

  it("check-in state carries the derived expiry time", () => {
    expect(
      checkInStateSchema.safeParse({
        state: "open", isOpen: true, checkInToken: "tok", checkInOpenAt: "2099-03-01T18:00:00.000Z",
        checkInClosedAt: null, expiresAt: "2099-03-01T21:00:00.000Z", expiresAtTime: "23:00",
      }).success,
    ).toBe(true);
  });
});

describe("sessionRangeQuerySchema (D-16.7)", () => {
  it("coerces seasonId from a query string and accepts an empty query", () => {
    expect(sessionRangeQuerySchema.parse({ seasonId: "7" })).toEqual({ seasonId: 7 });
    expect(sessionRangeQuerySchema.parse({})).toEqual({});
  });
  it("refuses a non-numeric seasonId and a non-ISO bound", () => {
    expect(sessionRangeQuerySchema.safeParse({ seasonId: "abc" }).success).toBe(false);
    expect(sessionRangeQuerySchema.safeParse({ from: "yesterday" }).success).toBe(false);
  });
});

describe("groupAssignmentsRequestSchema (D-16.12)", () => {
  it("accepts null as 'unassign'", () => {
    expect(
      groupAssignmentsRequestSchema.safeParse({ assignments: [{ studentUserId: 1, groupId: null }] }).success,
    ).toBe(true);
  });
  it("refuses a student listed twice", () => {
    expect(
      groupAssignmentsRequestSchema.safeParse({
        assignments: [{ studentUserId: 1, groupId: 2 }, { studentUserId: 1, groupId: null }],
      }).success,
    ).toBe(false);
  });
  // v1 parity 2026-10-09 (spec 05 R48): v1's cap of 2000, group-actions.ts:183-190.
  it("accepts 2000 rows and refuses 2001", () => {
    const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ studentUserId: i + 1, groupId: null }));
    expect(groupAssignmentsRequestSchema.safeParse({ assignments: rows(2000) }).success).toBe(true);
    expect(groupAssignmentsRequestSchema.safeParse({ assignments: rows(2001) }).success).toBe(false);
  });
});
```

Run: `cd packages/shared && pnpm exec jest src/__tests__/season-admin-contracts.test.ts`. Expected: FAIL, because the exports are missing.

- [ ] **Step 2: `session.ts`.** Make four changes.

**(a)** Change the enums import area to also import Plan 5's wire schemas:

```ts
import { isoDaySchema, wallTimeSchema } from "./org-time";
```

**(b)** In `sessionListItemSchema`, after Plan 4's `dayKey`, add:

```ts
  /** `startsAt` on the org clock, "HH:mm" (X13). Render this — never format `startsAt` on the device. */
  startTime: wallTimeSchema,
```

In `sessionDetailSchema`, after `startsAt`, add:

```ts
  /** Org-calendar day of `startsAt` (X13). */
  dayKey: isoDaySchema,
  /** `startsAt` on the org clock, "HH:mm" (X13); also the edit form's pre-fill. */
  startTime: wallTimeSchema,
```

**(c)** In Plan 3's `sessionWriteBase`, replace the `startsAt` line with:

```ts
  /** An instant (Plan 3). Send this OR startDay + startTime, never both. */
  startsAt: z.string().datetime({ offset: true }).optional(),
  /**
   * Org wall-clock start (Plan 6 D-16.6) — the same day/time split as Plan
   * 15's dueDay/dueTime. The server composes the instant in ORG_TIMEZONE, so
   * a phone in another zone can never shift a session by entering "20:00".
   */
  startDay: isoDaySchema.optional(),
  startTime: wallTimeSchema.optional(),
```

Then replace Plan 3's two exported request schemas with:

```ts
function exactlyOneStart(
  v: { startsAt?: string; startDay?: string; startTime?: string },
  ctx: z.RefinementCtx,
): void {
  const hasWallClock = v.startDay !== undefined || v.startTime !== undefined;
  if (hasWallClock && (v.startDay === undefined || v.startTime === undefined)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [v.startDay === undefined ? "startDay" : "startTime"],
      message: "Send both a start day and a start time.",
    });
    return;
  }
  if ((v.startsAt === undefined) === !hasWallClock) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["startsAt"],
      message: "Send exactly one of startsAt or startDay + startTime.",
    });
  }
}

export const createSessionRequestSchema = sessionWriteBase
  .extend({
    seasonId: z.number().int().positive(),
    /** Weekly siblings sharing one recurrenceGroupId. v1 clamped to 26 silently; refusing is honest. */
    repeatWeeks: z.number().int().min(1).max(26).default(1),
  })
  .superRefine(exactlyOneStart);
export type CreateSessionBody = z.output<typeof createSessionRequestSchema>;
export type CreateSessionInput = z.input<typeof createSessionRequestSchema>;

export const updateSessionRequestSchema = sessionWriteBase
  .extend({ scope: recurrenceScopeSchema })
  .superRefine(exactlyOneStart);
export type UpdateSessionBody = z.output<typeof updateSessionRequestSchema>;
export type UpdateSessionInput = z.input<typeof updateSessionRequestSchema>;
```

The `recurrenceScopeSchema` declaration must precede these. It already does in Plan 3's layout.

**(d)** Append:

```ts
/** POST /sessions (Plan 3). `id` is the first session of the series. */
export const sessionCreatedResponseSchema = z.object({
  id: z.number(),
  recurrenceGroupId: z.string().nullable(),
});
/** PATCH /sessions/:id (Plan 3): how many sessions the scope touched. */
export const sessionUpdatedResponseSchema = z.object({ updated: z.number().int().nonnegative() });
/** DELETE /sessions/:id (Plan 3). */
export const sessionDeletedResponseSchema = z.object({ deleted: z.number().int().nonnegative() });

/** One target of a scoped edit/delete, as GET /sessions/:id/series previews it (D-16.8). */
export const sessionSeriesItemSchema = z.object({
  id: z.number(),
  title: z.string(),
  startsAt: z.string(),
  dayKey: isoDaySchema,
  startTime: wallTimeSchema,
  isAnchor: z.boolean(),
  attendanceCount: z.number().int().nonnegative(),
});
export type SessionSeriesItem = z.infer<typeof sessionSeriesItemSchema>;

export const sessionSeriesResponseSchema = z.object({
  scope: recurrenceScopeSchema,
  sessions: z.array(sessionSeriesItemSchema),
  /** Totals across the targets — what Plan 3's delete refuses without `force`. */
  attendanceCount: z.number().int().nonnegative(),
  videoProgressCount: z.number().int().nonnegative(),
});
export type SessionSeries = z.infer<typeof sessionSeriesResponseSchema>;

/**
 * GET /api/v1/sessions window (D-16.7). v1 parity 2026-10-09 (spec 03 R75):
 * optional and uncapped — no SESSION_RANGE_DEFAULT_WEEKS / SESSION_RANGE_MAX_DAYS.
 */

/** Parses `req.query` — every value arrives as a string. */
export const sessionRangeQuerySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  seasonId: z.coerce.number().int().positive().optional(),
});

export const sessionRangeResponseSchema = z.object({
  sessions: z.array(sessionListItemSchema),
  /** The effective window, half-open [from, to); null on an open side (v1 parity 2026-10-09, R75). */
  from: z.string().nullable(),
  to: z.string().nullable(),
  /** Org-calendar days of the first and last instant in the window (X13); null on an open side. */
  fromDayKey: isoDaySchema.nullable(),
  toDayKey: isoDaySchema.nullable(),
  /** The org's today (C2) — the Upcoming view shows rows with dayKey >= this (v1 R98). */
  todayDayKey: isoDaySchema,
});
export type SessionRange = z.infer<typeof sessionRangeResponseSchema>;

export const checkInStateValueSchema = z.enum(["not_open", "open", "expired", "closed"]);

/** GET /sessions/:id/check-in — admin-only (D-16.9). One derivation: lib/check-in.ts. */
export const checkInStateSchema = z.object({
  state: checkInStateValueSchema,
  isOpen: z.boolean(),
  checkInToken: z.string().nullable(),
  checkInOpenAt: z.string().nullable(),
  checkInClosedAt: z.string().nullable(),
  /** Only while open: when the 3-hour window ends. */
  expiresAt: z.string().nullable(),
  /** `expiresAt` on the org clock, "HH:mm" (X13). */
  expiresAtTime: wallTimeSchema.nullable(),
});
export type CheckInStateResponse = z.infer<typeof checkInStateSchema>;

/**
 * A quiz linked to a session (v1 listQuizzesForSession). `kind` is inlined
 * because Plan 8, which owns quiz contracts, runs after this plan; Plan 8 may
 * swap in its own quizKindSchema.
 */
export const sessionQuizItemSchema = z.object({
  id: z.number(),
  title: z.string(),
  kind: z.enum(["PAPER", "ONLINE"]),
  maxScore: z.number(),
  questionCount: z.number().int().nonnegative(),
  publishedAt: z.string().nullable(),
});
export type SessionQuizItem = z.infer<typeof sessionQuizItemSchema>;
```

- [ ] **Step 3: `season.ts`.** Extend Plan 3/4's `seasonDetailSchema`:

```ts
export const seasonDetailSchema = seasonListItemSchema.extend({
  description: z.string().nullable(),
  sessionCount: z.number(),
  studentCount: z.number(),
  /** Needed by the SUPER edit form: its PATCH is a full body whose budget fields default (D-16.3). */
  absenceBudgetMinutes: z.number().int(),
  absenceWeightMinutes: z.number().int(),
  /** isAdminOfSeason for the caller (C4) — drives the roster / new-group / new-session actions. */
  canAdminister: z.boolean(),
  groups: z.array(seasonDetailGroupSchema),
});
```

- [ ] **Step 4: `group.ts`.** Add to `groupDetailSchema`, after `students`:

```ts
  /** isAdminOfSeason for the caller (C4, D-16.15): may edit or delete this group. */
  canManage: z.boolean(),
```

Append:

```ts
/** POST /seasons/:id/groups (201) and PATCH /groups/:id. */
export const groupRefResponseSchema = z.object({ id: z.number() });

/** GET /groups/leader-options (D-16.14) — interim until domain 11's user directory. */
export const leaderOptionSchema = z.object({
  id: z.number(),
  name: z.string().nullable(),
  email: z.string(),
});
export type LeaderOption = z.infer<typeof leaderOptionSchema>;

/** GET /groups/:id/impact — the confirmation v1 never had (spec 05 R45, D-16.13). */
export const groupImpactSchema = z.object({
  /** ACTIVE enrolments that would lose their group. */
  studentCount: z.number().int().nonnegative(),
  leaderCount: z.number().int().nonnegative(),
  /** Live assignments targeted at this group ONLY. Non-empty → delete is refused. */
  soleTargetAssignments: z.array(z.object({ id: z.number(), title: z.string() })),
});
export type GroupImpact = z.infer<typeof groupImpactSchema>;

export const groupDeleteResponseSchema = z.object({
  deleted: z.literal(true),
  orphanedStudentIds: z.array(z.number()),
});

/** GET /seasons/:id/roster (D-16.11). */
export const seasonRosterRowSchema = z.object({
  userId: z.number(),
  name: z.string().nullable(),
  email: z.string(),
  /** This season's group, from SeasonEnrollment.groupId (C9). */
  groupId: z.number().nullable(),
  groupName: z.string().nullable(),
  // v1 parity 2026-10-09 (spec 05 R82): no otherSeasonGroup — a student whose
  // group is in another season shows as unassigned, as v1 groups-query.ts:151-161.
});
export type SeasonRosterRow = z.infer<typeof seasonRosterRowSchema>;

/**
 * v1's cap, group-actions.ts:183-190 (v1 parity 2026-10-09, spec 05 R48). v1 could
 * not finish 2000 inside its 20 s timeout (R56), so the writes are batched (Task 2 Step 6).
 */
export const GROUP_ASSIGNMENTS_MAX = 2000;

export const groupAssignmentsRequestSchema = z.object({
  assignments: z
    .array(
      z.object({
        studentUserId: z.number().int().positive(),
        /** null = unassign from this season's group. */
        groupId: z.number().int().positive().nullable(),
      }),
    )
    .max(GROUP_ASSIGNMENTS_MAX)
    .refine((rows) => new Set(rows.map((r) => r.studentUserId)).size === rows.length, {
      message: "Each student may appear only once.",
    }),
});
export type GroupAssignmentsRequest = z.infer<typeof groupAssignmentsRequestSchema>;

/** Counts of what was WRITTEN (spec 05 R57) — the same shape Plan 17's group importer reports. */
export const groupAssignmentsResponseSchema = z.object({
  assigned: z.number().int().nonnegative(),
  unassigned: z.number().int().nonnegative(),
  skippedStudentIds: z.array(z.number()),
});
export type GroupAssignmentsResult = z.infer<typeof groupAssignmentsResponseSchema>;
```

- [ ] **Step 5: Run the shared tests.** `cd packages/shared && pnpm exec jest` → PASS (the new file plus Plan 3's `write-schemas.test.ts`, unchanged and green).

- [ ] **Step 6: Backend compile fix — `sessionStartFrom`.** Optional `startsAt` breaks Plan 3's two `new Date(body.startsAt)` sites. The backend must compile before Task 2 starts, so the conversion lands here. It uses Plan 5's `orgWallClockToInstant`; this plan adds no wall-clock helper of its own.

In `apps/backend/src/routes/sessions.ts`, add `orgWallClockToInstant` to the existing `../lib/org-time` import and add this helper above the routes:

```ts
/**
 * A session write's start as an instant. Plan 6 D-16.6: the mobile form
 * sends org wall-clock fields (startDay + startTime — Plan 5's dueDay/dueTime
 * split) and the conversion happens HERE, in ORG_TIMEZONE; the device never
 * composes an instant. The shared schema guarantees exactly one form is present.
 */
function sessionStartFrom(body: { startsAt?: string; startDay?: string; startTime?: string }): Date {
  if (body.startDay !== undefined && body.startTime !== undefined) {
    return orgWallClockToInstant(body.startDay, body.startTime);
  }
  if (body.startsAt !== undefined) return new Date(body.startsAt);
  throw new Error("unreachable: the session write schema requires a start");
}
```

Then make the two replacements:
- in `POST "/"`: `const start = new Date(body.startsAt);` becomes `const start = sessionStartFrom(body);`;
- in `PATCH "/:id"`: `const newStart = new Date(body.startsAt);` becomes `const newStart = sessionStartFrom(body);`.

Task 3's integration suite pins the conversion: a DST-crossing series created from `startDay`/`startTime` must land on `16:30Z` in July.

- [ ] **Step 7: Run.** Run `pnpm turbo lint typecheck test:unit --filter=@space/shared --filter=@space/backend` → clean. Plan 3's sessions integration suite still sends `startsAt`, and `sessionStartFrom` accepts it unchanged.

Mobile is expected to be red at this point: fixtures lack the new fields. Task 5 Step 1 repairs them, and the coordinator runs Task 5 next, before anything else.

- [ ] **Step 8: Commit.** `git add packages/shared apps/backend && git commit -m "feat(shared,backend): season/session/group admin contracts; org wall-clock session starts"`

---
### Task 2: Seasons backend — per-route auth, by-code, detail fields, roster, bulk assignment *(coordinator)*

**Files:**
- Modify: `apps/backend/src/routes/seasons.ts`
- Create: `apps/backend/src/lib/queries/seasons.ts`
- Modify: `apps/backend/src/lib/queries/groups.ts` (append only: `listSeasonRoster`, `GroupOutsideSeasonError`, `assignStudentsToGroups`, `unassignStudentsFromGroups`)
- Modify: `apps/backend/src/docs/openapi.ts`
- Test: `apps/backend/src/__tests__/integration/seasons-admin-routes.test.ts` (new), `apps/backend/src/__tests__/integration/roster-routes.test.ts` (new — the suite Plan 17 runs as `--testPathPattern roster`)

**Interfaces:**
- Consumes: Task 1's `seasonDetailSchema` fields, `groupAssignmentsRequestSchema`; existing `canAccessSeason`, `isAdminOfSeason`, `parseId`, `requireAuth`/`requireUser`.
- Produces:
  - `loadSeasonDetail(user, id): Promise<SeasonDetailRow | null>` in `lib/queries/seasons.ts`;
  - `listSeasonRoster(seasonId): Promise<SeasonRosterRow[]>`;
  - **`GroupOutsideSeasonError`**, **`assignStudentsToGroups(tx: Prisma.TransactionClient, seasonId: number, assignments: { studentUserId: number; groupId: number }[]): Promise<{ assigned: number; skippedStudentIds: number[] }>`** (Plan 17 consumes this exact signature);
  - `unassignStudentsFromGroups(tx, seasonId, studentIds: number[]): Promise<{ unassigned: number; skippedStudentIds: number[] }>`;
  - endpoints `GET /api/v1/seasons/by-code/:code`, `GET /api/v1/seasons/:id/roster`, `PUT /api/v1/seasons/:id/group-assignments`;
  - error code `group_outside_season` 400.

- [ ] **Step 1: Failing integration tests — seasons**

```ts
// apps/backend/src/__tests__/integration/seasons-admin-routes.test.ts
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

jest.setTimeout(60000);

const app = createApp();

let seasonId: number;
let seasonCode: string;
let deletedCode: string;
let superToken: string;
let adminToken: string;
let leaderToken: string;
let outsiderToken: string;

beforeAll(async () => {
  await cleanupTestData();

  const season = await createTestSeason();
  seasonId = season.id;
  seasonCode = season.code;
  const other = await createTestSeason();
  const deleted = await createTestSeason();
  deletedCode = deleted.code;
  await db.season.update({ where: { id: deleted.id }, data: { deletedAt: new Date() } });
  await db.season.update({ where: { id: seasonId }, data: { absenceBudgetMinutes: 240 } });

  const superUser = await createTestUser("super", "SUPER");
  const admin = await createTestUser("admin", "ADMIN");
  const leader = await createTestUser("leader", "LEADER");
  const outsider = await createTestUser("outsider", "STUDENT");
  await db.seasonAdmin.create({ data: { seasonId, userId: admin.id } });
  await db.group.create({ data: { seasonId, name: "Led group", leaders: { create: { userId: leader.id } } } });
  await db.seasonEnrollment.create({ data: { seasonId: other.id, studentUserId: outsider.id, status: "ACTIVE" } });

  superToken = await login(app, superUser.email);
  adminToken = await login(app, admin.email);
  leaderToken = await login(app, leader.email);
  outsiderToken = await login(app, outsider.email);
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("seasonsRouter mounting (ruling X5)", () => {
  it("answers an unknown anonymous path under /api/v1/seasons with not_found, not 401", async () => {
    // A router-level use(requireAuth) would answer 401 before the catch-all —
    // and would do so for every router Plans 12, 15 and 17 mount on this prefix.
    const res = await request(app).get(`/api/v1/seasons/${seasonId}/space-v2-no-such-route`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });

  it("still requires auth on every real route", async () => {
    expect((await request(app).get("/api/v1/seasons")).status).toBe(401);
    expect((await request(app).get(`/api/v1/seasons/${seasonId}`)).status).toBe(401);
    expect((await request(app).get(`/api/v1/seasons/by-code/${seasonCode}`)).status).toBe(401);
    expect((await request(app).get(`/api/v1/seasons/${seasonId}/roster`)).status).toBe(401);
    expect((await request(app).put(`/api/v1/seasons/${seasonId}/group-assignments`).send({ assignments: [] })).status).toBe(401);
  });
});

describe("GET /api/v1/seasons/by-code/:code (spec 02 §7, D-16.2)", () => {
  it("resolves a code to the same detail GET /:id serves, with the D-16.3 fields", async () => {
    const res = await request(app)
      .get(`/api/v1/seasons/by-code/${seasonCode}`)
      .set("authorization", `Bearer ${superToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: seasonId,
      code: seasonCode,
      absenceBudgetMinutes: 240,
      absenceWeightMinutes: 90,
      canAdminister: true,
    });

    const byId = await request(app)
      .get(`/api/v1/seasons/${seasonId}`)
      .set("authorization", `Bearer ${superToken}`);
    expect(byId.body.data).toEqual(res.body.data);
  });

  it("reports canAdminister per caller (C4)", async () => {
    const admin = await request(app)
      .get(`/api/v1/seasons/by-code/${seasonCode}`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(admin.body.data.canAdminister).toBe(true);
    const leader = await request(app)
      .get(`/api/v1/seasons/by-code/${seasonCode}`)
      .set("authorization", `Bearer ${leaderToken}`);
    expect(leader.status).toBe(200);
    expect(leader.body.data.canAdminister).toBe(false);
  });

  it("is 403 for a caller who cannot see the season, 404 for an unknown or deleted code", async () => {
    const outsider = await request(app)
      .get(`/api/v1/seasons/by-code/${seasonCode}`)
      .set("authorization", `Bearer ${outsiderToken}`);
    expect(outsider.status).toBe(403);

    const unknown = await request(app)
      .get("/api/v1/seasons/by-code/space-v2-test-no-such-code")
      .set("authorization", `Bearer ${superToken}`);
    expect(unknown.status).toBe(404);

    const deleted = await request(app)
      .get(`/api/v1/seasons/by-code/${deletedCode}`)
      .set("authorization", `Bearer ${superToken}`);
    expect(deleted.status).toBe(404);
  });

  it("is not shadowed by an /:id child route — a code may be any slug, even 'roster'", async () => {
    // Registered before every /:id/* route: /by-code/roster must not reach /:id/roster.
    const res = await request(app)
      .get("/api/v1/seasons/by-code/roster")
      .set("authorization", `Bearer ${superToken}`);
    expect(res.status).toBe(404);
    expect(res.body.error.message).toMatch(/season not found/i);
  });
});
```

Run: `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern seasons-admin-routes`. Expected: FAIL. The X5 case returns 401, the `by-code` cases return 400 (`parseId("by-code")`), and the detail fields are undefined.

- [ ] **Step 2: Failing integration tests — roster + bulk assignment**

```ts
// apps/backend/src/__tests__/integration/roster-routes.test.ts
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

jest.setTimeout(60000);

const app = createApp();

let seasonId: number;
let otherSeasonCode: string;
let groupOneId: number;
let groupTwoId: number;
let foreignGroupId: number;
let studentAId: number;
let studentBId: number;
let withdrawnId: number;
let removedId: number;
let adminToken: string;
let superToken: string;
let leaderToken: string;

beforeAll(async () => {
  await cleanupTestData();

  const season = await createTestSeason();
  seasonId = season.id;
  const other = await createTestSeason();
  otherSeasonCode = other.code;

  const admin = await createTestUser("admin", "ADMIN");
  const superUser = await createTestUser("super", "SUPER");
  const leader = await createTestUser("leader", "LEADER");
  const a = await createTestUser("roster-a", "STUDENT");
  const b = await createTestUser("roster-b", "STUDENT");
  const withdrawn = await createTestUser("roster-withdrawn", "STUDENT");
  const removed = await createTestUser("roster-removed", "STUDENT");
  studentAId = a.id;
  studentBId = b.id;
  withdrawnId = withdrawn.id;
  removedId = removed.id;

  await db.seasonAdmin.create({ data: { seasonId, userId: admin.id } });
  groupOneId = (
    await db.group.create({
      data: { seasonId, name: "Group One", leaders: { create: { userId: leader.id } } },
      select: { id: true },
    })
  ).id;
  groupTwoId = (await db.group.create({ data: { seasonId, name: "Group Two" }, select: { id: true } })).id;
  foreignGroupId = (
    await db.group.create({ data: { seasonId: other.id, name: "Foreign Group" }, select: { id: true } })
  ).id;

  // A: in Group One this season.
  await db.seasonEnrollment.create({ data: { seasonId, studentUserId: a.id, groupId: groupOneId, status: "ACTIVE" } });
  await db.groupStudent.create({ data: { groupId: groupOneId, studentUserId: a.id } });
  // B: unassigned here, but currently in ANOTHER season's group (spec 05 R82).
  await db.seasonEnrollment.create({ data: { seasonId, studentUserId: b.id, status: "ACTIVE" } });
  await db.seasonEnrollment.create({ data: { seasonId: other.id, studentUserId: b.id, groupId: foreignGroupId, status: "ACTIVE" } });
  await db.groupStudent.create({ data: { groupId: foreignGroupId, studentUserId: b.id } });
  // Withdrawn and soft-deleted students are not on the roster (C9 + live users only).
  await db.seasonEnrollment.create({ data: { seasonId, studentUserId: withdrawn.id, status: "WITHDRAWN" } });
  await db.seasonEnrollment.create({ data: { seasonId, studentUserId: removed.id, status: "ACTIVE" } });
  await db.user.update({ where: { id: removed.id }, data: { deletedAt: new Date() } });

  adminToken = await login(app, admin.email);
  superToken = await login(app, superUser.email);
  leaderToken = await login(app, leader.email);
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("GET /api/v1/seasons/:id/roster (D-16.11)", () => {
  it("lists ACTIVE enrolments of live students with this season's group; another season's group reads as unassigned (v1 R82)", async () => {
    const res = await request(app)
      .get(`/api/v1/seasons/${seasonId}/roster`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const byId = new Map(res.body.data.roster.map((r: { userId: number }) => [r.userId, r]));
    expect([...byId.keys()].sort()).toEqual([studentAId, studentBId].sort());
    expect(byId.get(studentAId)).toMatchObject({ groupId: groupOneId, groupName: "Group One" });
    // v1 parity 2026-10-09: studentB's Foreign Group membership is not reported.
    expect(byId.get(studentBId)).toMatchObject({ groupId: null, groupName: null });
    expect(byId.get(studentBId)).not.toHaveProperty("otherSeasonGroup");
  });

  it("is season-admin only — a leader in the season is refused (spec 05 §4)", async () => {
    const res = await request(app)
      .get(`/api/v1/seasons/${seasonId}/roster`)
      .set("authorization", `Bearer ${leaderToken}`);
    expect(res.status).toBe(403);
  });

  it("is 404 for a season that does not exist", async () => {
    const res = await request(app)
      .get("/api/v1/seasons/2147480000/roster")
      .set("authorization", `Bearer ${superToken}`);
    expect(res.status).toBe(404);
  });
});

describe("PUT /api/v1/seasons/:id/group-assignments (D-16.12)", () => {
  it("assigns, unassigns, skips non-ACTIVE, and reports what it WROTE", async () => {
    const res = await request(app)
      .put(`/api/v1/seasons/${seasonId}/group-assignments`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({
        assignments: [
          { studentUserId: studentAId, groupId: groupTwoId },
          { studentUserId: studentBId, groupId: null },
          { studentUserId: withdrawnId, groupId: groupOneId },
          { studentUserId: removedId, groupId: groupOneId },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.data.assigned).toBe(1);
    expect(res.body.data.unassigned).toBe(1);
    expect([...res.body.data.skippedStudentIds].sort()).toEqual([withdrawnId, removedId].sort());

    const a = await db.seasonEnrollment.findUnique({
      where: { studentUserId_seasonId: { studentUserId: studentAId, seasonId } },
      select: { groupId: true, status: true },
    });
    expect(a).toEqual({ groupId: groupTwoId, status: "ACTIVE" });
    expect(await db.groupStudent.findUnique({ where: { studentUserId: studentAId }, select: { groupId: true } }))
      .toEqual({ groupId: groupTwoId });

    // Unassigning B here must NOT touch B's membership in the other season's
    // group: only this season's GroupStudent row is removed.
    expect(await db.groupStudent.findUnique({ where: { studentUserId: studentBId }, select: { groupId: true } }))
      .toEqual({ groupId: foreignGroupId });

    expect(await db.groupStudent.count({ where: { studentUserId: withdrawnId } })).toBe(0);
    const w = await db.seasonEnrollment.findUnique({
      where: { studentUserId_seasonId: { studentUserId: withdrawnId, seasonId } },
      select: { groupId: true, status: true },
    });
    // Skipped, and its history untouched (v1's form would have resurrected it — spec 05 R21).
    expect(w).toEqual({ groupId: null, status: "WITHDRAWN" });
  });

  it("assigning a student who sits in another season's group moves their GroupStudent row (R1, Plan 18 item)", async () => {
    const res = await request(app)
      .put(`/api/v1/seasons/${seasonId}/group-assignments`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ assignments: [{ studentUserId: studentBId, groupId: groupOneId }] });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ assigned: 1, unassigned: 0, skippedStudentIds: [] });
    expect(await db.groupStudent.findUnique({ where: { studentUserId: studentBId }, select: { groupId: true } }))
      .toEqual({ groupId: groupOneId });
  });

  it("refuses the WHOLE batch when any group is outside the season — nothing partial lands", async () => {
    const before = await db.seasonEnrollment.findUnique({
      where: { studentUserId_seasonId: { studentUserId: studentAId, seasonId } },
      select: { groupId: true },
    });
    const res = await request(app)
      .put(`/api/v1/seasons/${seasonId}/group-assignments`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({
        assignments: [
          { studentUserId: studentAId, groupId: groupOneId },
          { studentUserId: studentBId, groupId: foreignGroupId },
        ],
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("group_outside_season");
    const after = await db.seasonEnrollment.findUnique({
      where: { studentUserId_seasonId: { studentUserId: studentAId, seasonId } },
      select: { groupId: true },
    });
    expect(after).toEqual(before);
  });

  it("is idempotent", async () => {
    const body = { assignments: [{ studentUserId: studentAId, groupId: groupOneId }] };
    const first = await request(app)
      .put(`/api/v1/seasons/${seasonId}/group-assignments`)
      .set("authorization", `Bearer ${adminToken}`)
      .send(body);
    const second = await request(app)
      .put(`/api/v1/seasons/${seasonId}/group-assignments`)
      .set("authorization", `Bearer ${adminToken}`)
      .send(body);
    expect(first.body.data.assigned).toBe(1);
    expect(second.body.data.assigned).toBe(1);
    expect(await db.groupStudent.count({ where: { studentUserId: studentAId } })).toBe(1);
  });

  it("refuses a leader, a duplicate student, and a malformed body", async () => {
    const leader = await request(app)
      .put(`/api/v1/seasons/${seasonId}/group-assignments`)
      .set("authorization", `Bearer ${leaderToken}`)
      .send({ assignments: [] });
    expect(leader.status).toBe(403);

    const dup = await request(app)
      .put(`/api/v1/seasons/${seasonId}/group-assignments`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ assignments: [{ studentUserId: studentAId, groupId: null }, { studentUserId: studentAId, groupId: groupOneId }] });
    expect(dup.status).toBe(400);

    const junk = await request(app)
      .put(`/api/v1/seasons/${seasonId}/group-assignments`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ assignments: "everyone" });
    expect(junk.status).toBe(400);
  });
});
```

Run: `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern roster-routes`. Expected: FAIL (404 from the catch-all).

- [ ] **Step 3: X5 — convert `seasonsRouter` to per-route auth.** In `apps/backend/src/routes/seasons.ts`:

```bash
cd apps/backend
sed -i '/^seasonsRouter\.use(requireAuth);$/d' src/routes/seasons.ts
sed -i -E 's/^seasonsRouter\.(get|post|patch|put|delete)\(("[^"]*"), async/seasonsRouter.\1(\2, requireAuth, async/' src/routes/seasons.ts
# Every handler must now carry requireAuth; the two counts must be equal and non-zero:
grep -cE '^seasonsRouter\.(get|post|patch|put|delete)\(' src/routes/seasons.ts
grep -cE '^seasonsRouter\.(get|post|patch|put|delete)\("[^"]*", requireAuth, async' src/routes/seasons.ts
grep -n 'seasonsRouter.use(requireAuth)' src/routes/seasons.ts   # → no output
```

If the counts differ, a handler is declared across several lines. Add `requireAuth,` as its first handler by hand, then re-check. Above the first route, add this comment:

```ts
// requireAuth is attached per route (ruling X5): /api/v1/seasons is a shared
// prefix — Plans 12, 15 and 17 mount their own routers on it — so a router-level
// use(requireAuth) here would answer their requests, and every unknown path,
// with 401 instead of the not_found envelope.
```

Every route this task adds below lists `requireAuth` first.

- [ ] **Step 4: `lib/queries/seasons.ts`.** Extract the detail read that `GET /:id` performs today, adding D-16.3's fields:

```ts
// apps/backend/src/lib/queries/seasons.ts
import type { SeasonStatus } from "@space/shared";

import { db } from "../../db/client";
import type { SessionUser } from "../auth/tokens";
import { isAdminOfSeason } from "../rbac";

export interface SeasonDetailRow {
  id: number;
  code: string;
  title: string;
  program: string;
  year: number;
  description: string | null;
  status: SeasonStatus;
  startDate: Date;
  endDate: Date;
  absenceBudgetMinutes: number;
  absenceWeightMinutes: number;
  sessionCount: number;
  studentCount: number;
  canAdminister: boolean;
  groups: { id: number; name: string; studentCount: number; leaderNames: string[] }[];
}

/**
 * The season detail every season screen renders. Null when no live season
 * has this id. Authorization is the CALLER's job (canAccessSeason) — this is
 * shared by GET /:id and GET /by-code/:code so the two can never drift.
 */
export async function loadSeasonDetail(user: SessionUser, id: number): Promise<SeasonDetailRow | null> {
  const season = await db.season.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      code: true,
      title: true,
      program: true,
      year: true,
      description: true,
      status: true,
      startDate: true,
      endDate: true,
      absenceBudgetMinutes: true,
      absenceWeightMinutes: true,
      _count: { select: { sessions: true, enrollments: true } },
      groups: {
        // Students may only see their own group.
        where: user.role === "STUDENT" ? { students: { some: { studentUserId: user.userId } } } : {},
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          _count: { select: { students: true } },
          leaders: { select: { user: { select: { name: true } } } },
        },
      },
    },
  });
  if (!season) return null;

  return {
    id: season.id,
    code: season.code,
    title: season.title,
    program: season.program,
    year: season.year,
    description: season.description,
    status: season.status,
    startDate: season.startDate,
    endDate: season.endDate,
    absenceBudgetMinutes: season.absenceBudgetMinutes,
    absenceWeightMinutes: season.absenceWeightMinutes,
    sessionCount: season._count.sessions,
    studentCount: season._count.enrollments,
    canAdminister: isAdminOfSeason(user, season.id),
    groups: season.groups.map((g) => ({
      id: g.id,
      name: g.name,
      studentCount: g._count.students,
      leaderNames: g.leaders.map((l) => l.user.name).filter((n): n is string => Boolean(n)),
    })),
  };
}
```

If `SeasonStatus` is not exported as a type from `@space/shared` under that name, use the generated Prisma enum type (`import type { SeasonStatus } from "../../generated/prisma/enums";`). Both are type-only imports and are erased.

In `routes/seasons.ts`, replace the body of `GET "/:id"` after its `canAccessSeason` check with:

```ts
  const season = await loadSeasonDetail(user, id);
  if (!season) return apiError(res, "not_found", "Season not found.", 404);
  return apiOk(res, season);
```

and add `import { loadSeasonDetail } from "../lib/queries/seasons";`.

- [ ] **Step 5: `by-code`.** Register this **directly after `GET "/"`**, before any `/:id` route (D-16.2):

```ts
/**
 * Resolve a season code (spec 02 §7, Plan 6 D-16.2). The mobile app is
 * code-addressed (/seasons/[code]); the API stays canonical on id (spec 02
 * D8). Never overload /:id with codes — a numeric code is a legal slug.
 * Registered before every /:id/* route, or /by-code/roster would match
 * /:id/roster with id "by-code".
 */
seasonsRouter.get("/by-code/:code", requireAuth, async (req, res) => {
  const user = requireUser(req);
  const code = String(req.params.code);
  if (code.length === 0 || code.length > 200) return apiError(res, "bad_request", "Invalid season code.", 400);

  const found = await db.season.findFirst({ where: { code, deletedAt: null }, select: { id: true } });
  if (!found) return apiError(res, "not_found", "Season not found.", 404);
  if (!(await canAccessSeason(user, found.id))) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const season = await loadSeasonDetail(user, found.id);
  if (!season) return apiError(res, "not_found", "Season not found.", 404);
  return apiOk(res, season);
});
```

- [ ] **Step 6: `lib/queries/groups.ts` — append** (below `setGroupStudents`; nothing existing changes):

```ts
export interface SeasonRosterRow {
  userId: number;
  name: string | null;
  email: string;
  groupId: number | null;
  groupName: string | null;
}

/**
 * The season's roster for the bulk-assign grid and the group form (D-16.11).
 *
 * Population: ACTIVE enrolments of live STUDENT users (ruling C9). v1 used
 * `StudentProfile.activeSeasonId` (spec 05 R81), which hides an enrolled
 * student whose pointer has moved on. The group shown is this season's, from
 * `SeasonEnrollment.groupId`. A student whose only membership is in a
 * DIFFERENT season's group reads as plain "unassigned", as v1 did (spec 05
 * R82; v1 parity 2026-10-09).
 */
export async function listSeasonRoster(seasonId: number): Promise<SeasonRosterRow[]> {
  const enrolments = await db.seasonEnrollment.findMany({
    where: { seasonId, status: "ACTIVE", studentUser: { role: "STUDENT", deletedAt: null } },
    select: {
      studentUserId: true,
      groupId: true,
      group: { select: { name: true } },
      studentUser: { select: { name: true, email: true } },
    },
    orderBy: { studentUser: { name: "asc" } },
  });
  return enrolments.map((e) => ({
    userId: e.studentUserId,
    name: e.studentUser.name,
    email: e.studentUser.email,
    groupId: e.groupId,
    groupName: e.group?.name ?? null,
  }));
}

/**
 * A target group does not belong to the season. Refuses the WHOLE batch
 * (spec 05 R75) — a partially-applied bulk move is worse than a refused one,
 * because the operator cannot tell which half happened.
 */
export class GroupOutsideSeasonError extends Error {
  constructor() {
    super("A selected group does not belong to this season.");
    this.name = "GroupOutsideSeasonError";
  }
}

/** ACTIVE enrolments of live STUDENT users among `studentIds` — the one eligibility rule (C9). */
async function eligibleStudentIds(
  tx: Prisma.TransactionClient,
  seasonId: number,
  studentIds: number[],
): Promise<Set<number>> {
  if (studentIds.length === 0) return new Set();
  const rows = await tx.seasonEnrollment.findMany({
    where: {
      seasonId,
      status: "ACTIVE",
      studentUserId: { in: studentIds },
      studentUser: { role: "STUDENT", deletedAt: null },
    },
    select: { studentUserId: true },
  });
  return new Set(rows.map((r) => r.studentUserId));
}

/**
 * Move a set of students into named groups of one season, without disturbing
 * anyone the caller did not name. The roster grid (PUT
 * /seasons/:id/group-assignments) and Plan 17's group importer both write
 * through this — one home for bulk membership writes.
 *
 * Deliberately NOT `setGroupStudents`: that one means "this is now the
 * group's whole roster", which would empty every group a bulk move happened
 * not to list in full.
 *
 * Two divergences from v1's `assignStudentsToGroupsAction`
 * (`jpc-space/src/lib/group-actions.ts:192-248`), both required:
 *
 * 1. Eligibility is an ACTIVE `SeasonEnrollment` in this season held by a
 *    live STUDENT, not `StudentProfile.activeSeasonId` (ruling C9; v1 at
 *    :215-223). v1 gated on the pointer in both its roster query and this
 *    write, which is what produces spec 05/16's silent skips; and v1 upserted
 *    an enrolment for anyone it accepted, resurrecting WITHDRAWN students.
 *    Here a non-ACTIVE or unknown student is skipped and reported.
 * 2. It returns what it APPLIED. v1 returned nothing and its callers reported
 *    the requested length (spec 05 R57, spec 16 R80/D5).
 */
export async function assignStudentsToGroups(
  tx: Prisma.TransactionClient,
  seasonId: number,
  assignments: { studentUserId: number; groupId: number }[],
): Promise<{ assigned: number; skippedStudentIds: number[] }> {
  const groupIds = [...new Set(assignments.map((a) => a.groupId))];
  if (groupIds.length > 0) {
    const valid = new Set(
      (await tx.group.findMany({ where: { id: { in: groupIds }, seasonId }, select: { id: true } })).map((g) => g.id),
    );
    if (groupIds.some((id) => !valid.has(id))) throw new GroupOutsideSeasonError();
  }

  const eligible = await eligibleStudentIds(tx, seasonId, [...new Set(assignments.map((a) => a.studentUserId))]);

  const skippedStudentIds: number[] = [];
  let assigned = 0;
  for (const a of assignments) {
    if (!eligible.has(a.studentUserId)) {
      skippedStudentIds.push(a.studentUserId);
      continue;
    }
    // GroupStudent.studentUserId is @unique STANDALONE (schema.prisma:330): a
    // student is in at most one group across the whole database, so the
    // existing row — whichever season's group it is — has to go first. The
    // fix is a composite key, which is a migration (Plan 18). Meanwhile the
    // per-season truth is SeasonEnrollment.groupId below, and every v2 read
    // uses that (C9).
    await tx.groupStudent.deleteMany({ where: { studentUserId: a.studentUserId } });
    await tx.groupStudent.create({ data: { groupId: a.groupId, studentUserId: a.studentUserId } });
    await tx.seasonEnrollment.update({
      where: { studentUserId_seasonId: { studentUserId: a.studentUserId, seasonId } },
      data: { groupId: a.groupId },
    });
    assigned += 1;
  }
  return { assigned, skippedStudentIds };
}

/**
 * Take students out of their group IN THIS SEASON. Only this season's
 * GroupStudent row is removed — v1 deleted the student's membership unscoped
 * (spec 05 R3), so unassigning in one season could silently empty their
 * current group in another. Same eligibility as assignStudentsToGroups.
 */
export async function unassignStudentsFromGroups(
  tx: Prisma.TransactionClient,
  seasonId: number,
  studentIds: number[],
): Promise<{ unassigned: number; skippedStudentIds: number[] }> {
  const eligible = await eligibleStudentIds(tx, seasonId, studentIds);
  const skippedStudentIds: number[] = [];
  let unassigned = 0;
  for (const studentUserId of studentIds) {
    if (!eligible.has(studentUserId)) {
      skippedStudentIds.push(studentUserId);
      continue;
    }
    await tx.groupStudent.deleteMany({ where: { studentUserId, group: { seasonId } } });
    await tx.seasonEnrollment.update({
      where: { studentUserId_seasonId: { studentUserId, seasonId } },
      data: { groupId: null },
    });
    unassigned += 1;
  }
  return { unassigned, skippedStudentIds };
}
```

(`Prisma` is already imported as a type in this file for `setGroupStudents`.)

> **v1 parity 2026-10-09:** With `GROUP_ASSIGNMENTS_MAX` back at 2000 (spec 05 R48, v1 `src/lib/group-actions.ts:183-190`), the per-row loops above must be batched so a full batch finishes inside the transaction (KEEP-FIX R56). The code is now `apps/backend/src/lib/queries/groups.ts:360-426`. In `assignStudentsToGroups`, after the eligibility split, run one `groupStudent.deleteMany({ studentUserId: { in: eligibleIds } })` and one `groupStudent.createMany`, then one `seasonEnrollment.updateMany({ seasonId, studentUserId: { in: idsForGroup } }, { groupId })` per target group. In `unassignStudentsFromGroups`, run one `deleteMany` and one `updateMany` over the eligible ids. Eligibility, the skipped report and the counts are unchanged. Add a 2000-row case to `roster-routes`.

- [ ] **Step 7: Roster routes.** In `routes/seasons.ts`, add these to the existing imports:
- `groupAssignmentsRequestSchema` in the relative shared import;
- `assignStudentsToGroups`, `GroupOutsideSeasonError`, `listSeasonRoster`, `unassignStudentsFromGroups` in the `../lib/queries/groups` import.

Then append:

```ts
/** Season-admin only (spec 05 §4 — v1's roster page required canEditSeason). */
async function requireLiveSeasonAdmin(
  req: Request,
  res: Response,
): Promise<number | null> {
  const user = requireUser(req);
  const seasonId = parseId(req.params.id);
  if (seasonId === null) {
    apiError(res, "bad_request", "Invalid season id.", 400);
    return null;
  }
  if (!isAdminOfSeason(user, seasonId)) {
    apiError(res, "forbidden", "You don't have access to this.", 403);
    return null;
  }
  const season = await db.season.findFirst({ where: { id: seasonId, deletedAt: null }, select: { id: true } });
  if (!season) {
    apiError(res, "not_found", "Season not found.", 404);
    return null;
  }
  return seasonId;
}

seasonsRouter.get("/:id/roster", requireAuth, async (req, res) => {
  const seasonId = await requireLiveSeasonAdmin(req, res);
  if (seasonId === null) return;
  return apiOk(res, { roster: await listSeasonRoster(seasonId) });
});

/**
 * Bulk group assignment (spec 05 §7, Plan 6 D-16.12). Non-null groupIds go
 * through assignStudentsToGroups — the same function Plan 17's importer
 * commits through — and nulls through unassignStudentsFromGroups, in ONE
 * transaction: a group outside the season refuses everything.
 */
seasonsRouter.put("/:id/group-assignments", requireAuth, async (req, res) => {
  const seasonId = await requireLiveSeasonAdmin(req, res);
  if (seasonId === null) return;

  const parsed = groupAssignmentsRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid assignments.", 400);

  const toAssign: { studentUserId: number; groupId: number }[] = [];
  const toUnassign: number[] = [];
  for (const a of parsed.data.assignments) {
    if (a.groupId === null) toUnassign.push(a.studentUserId);
    else toAssign.push({ studentUserId: a.studentUserId, groupId: a.groupId });
  }

  try {
    const result = await db.$transaction(
      async (tx) => {
        const assigned = await assignStudentsToGroups(tx, seasonId, toAssign);
        const unassigned = await unassignStudentsFromGroups(tx, seasonId, toUnassign);
        return {
          assigned: assigned.assigned,
          unassigned: unassigned.unassigned,
          skippedStudentIds: [...assigned.skippedStudentIds, ...unassigned.skippedStudentIds],
        };
      },
      // Batched writes, 2000 students max (spec 05 R48/R56; v1 parity 2026-10-09).
      { timeout: 30_000 },
    );
    return apiOk(res, result);
  } catch (err) {
    if (err instanceof GroupOutsideSeasonError) {
      return apiError(res, "group_outside_season", err.message, 400);
    }
    throw err;
  }
});
```

Add `Request` to the `express` type import (Plan 3 already imports `type Response`).

- [ ] **Step 8: Run both suites.**
- `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern "seasons-admin-routes|roster-routes|seasons-routes"` → PASS. Plan 3/4's `seasons-routes` must stay green unchanged: the X5 conversion and the `loadSeasonDetail` extraction are behaviour-preserving apart from the added fields.
- `pnpm turbo lint typecheck test:unit --filter=@space/backend` → clean.

- [ ] **Step 9: OpenAPI (same commit).** In `src/docs/openapi.ts`:

(a) Add to `SeasonDetail.properties`:

```ts
          absenceBudgetMinutes: { type: "integer" },
          absenceWeightMinutes: { type: "integer" },
          canAdminister: { type: "boolean", description: "isAdminOfSeason for the caller (C4)." },
```

(b) Add components beside `GroupListItem`:

```ts
      SeasonRosterRow: {
        type: "object",
        properties: {
          userId: { type: "integer" },
          name: { type: ["string", "null"] },
          email: { type: "string" },
          groupId: { type: ["integer", "null"], description: "This season's group, from SeasonEnrollment.groupId (C9)." },
          groupName: { type: ["string", "null"] },
          // v1 parity 2026-10-09 (spec 05 R82): no otherSeasonGroup.
        },
      },
      GroupAssignmentsRequest: {
        type: "object",
        required: ["assignments"],
        properties: {
          assignments: {
            type: "array",
            maxItems: 2000,
            items: {
              type: "object",
              required: ["studentUserId", "groupId"],
              properties: {
                studentUserId: { type: "integer" },
                groupId: { type: ["integer", "null"], description: "null unassigns from this season's group." },
              },
            },
          },
        },
      },
```

(c) Add the paths:

```ts
    "/api/v1/seasons/by-code/{code}": {
      get: {
        tags: ["Seasons"],
        summary: "Season detail by code",
        description:
          "Resolves a season code (the mobile app's address) to the same SeasonDetail GET /seasons/{id} serves. 404 for an unknown or soft-deleted code; 403 when the caller cannot see the season. The API stays canonical on id (spec 02 D8).",
        parameters: [{ name: "code", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: ok({ $ref: "#/components/schemas/SeasonDetail" }, "The season."),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
        },
      },
    },
    "/api/v1/seasons/{id}/roster": {
      get: {
        tags: ["Groups"],
        summary: "Season roster for bulk group assignment",
        description:
          "Season-admin only. ACTIVE enrolments of live students (C9 — v1 used StudentProfile.activeSeasonId), name-ordered, unpaginated (a season is hundreds of rows; the group form needs full membership).",
        parameters: [idParam],
        responses: {
          200: ok(
            { type: "object", properties: { roster: { type: "array", items: { $ref: "#/components/schemas/SeasonRosterRow" } } } },
            "The roster.",
          ),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
        },
      },
    },
    "/api/v1/seasons/{id}/group-assignments": {
      put: {
        tags: ["Groups"],
        summary: "Bulk-assign students to this season's groups",
        description:
          "Season-admin only; at most 2000 rows (v1's cap), each student once. Eligibility is an ACTIVE enrolment of a live student in THIS season (v1 gated on activeSeasonId and upserted enrolments, resurrecting withdrawn students). Non-eligible rows are skipped and returned in skippedStudentIds; counts are what was WRITTEN (v1 reported the requested length). A null groupId removes only this season's membership. Any groupId outside the season refuses the whole batch (400 group_outside_season). One transaction. Plan 17's group importer writes through the same function.",
        parameters: [idParam],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/GroupAssignmentsRequest" } } } },
        responses: {
          200: ok(
            {
              type: "object",
              properties: {
                assigned: { type: "integer" },
                unassigned: { type: "integer" },
                skippedStudentIds: { type: "array", items: { type: "integer" } },
              },
            },
            "What was written.",
          ),
          400: {
            description: "`bad_request` or `group_outside_season`.",
            content: { "application/json": { schema: errorResponse } },
          },
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
        },
      },
    },
```

- [ ] **Step 10: Commit** — `git add apps/backend && git commit -m "feat(backend): seasons by-code, per-route auth (X5), season roster and bulk group assignment"`

---

### Task 3: Sessions backend — calendar range, series preview, check-in state/regenerate, session quizzes *(coordinator)*

**Files:**
- Modify: `apps/backend/src/routes/sessions.ts`, `apps/backend/src/lib/queries/sessions.ts`, `apps/backend/src/lib/permissions.ts` (append `calendarScopeFor`), `apps/backend/src/docs/openapi.ts`
- Test: `apps/backend/src/__tests__/integration/session-admin-routes.test.ts` (new)

**Interfaces:**
- Consumes:
  - Plan 5's `orgWallTime`, `orgWallClockToInstant`; Task 1's `sessionRangeQuerySchema`, `recurrenceScopeSchema` (v1 parity 2026-10-09: no range constants, R75);
  - Plan 3's `addWeeksInOrgTime`, `resolveSeriesTargets`;
  - Plan 4's `orgDayKey`;
  - `checkInState`, `CHECK_IN_WINDOW_MS` (`lib/check-in.ts`); `attendanceScopeFor`, `isAdminOfSeason`, `isSuper`, `newPublicId`.
- Produces:
  - `CalendarScope` and `calendarScopeFor(user, seasonId | null)` in `lib/permissions.ts`;
  - `listSessionsInRange(scope, window, includeTokenFor)` in `lib/queries/sessions.ts`;
  - `startTime` on every session list row; `dayKey`/`startTime` on `GET /sessions/:id`;
  - endpoints `GET /api/v1/sessions`, `GET /api/v1/sessions/:id/series`, `GET /api/v1/sessions/:id/check-in`, `POST /api/v1/sessions/:id/check-in-regenerate`, `GET /api/v1/sessions/:id/quizzes`.

- [ ] **Step 1: Failing integration tests**

```ts
// apps/backend/src/__tests__/integration/session-admin-routes.test.ts
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { config } from "../../lib/config";
import { newPublicId } from "../../lib/public-id";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

jest.setTimeout(60000);

const app = createApp();

let seasonId: number;
let draftSeasonId: number;
let otherSeasonId: number;
let sessionId: number; // in seasonId, 2099-03-01T18:00Z (20:00 Cairo)
let draftSessionId: number;
let otherSessionId: number;
let token: string;
let superToken: string;
let adminToken: string;
let leaderToken: string;
let studentToken: string;

const WINDOW = { from: "2099-02-25T00:00:00.000Z", to: "2099-03-10T00:00:00.000Z" };
const ids = (res: request.Response) => res.body.data.sessions.map((s: { id: number }) => s.id);

beforeAll(async () => {
  await cleanupTestData();

  seasonId = (await createTestSeason()).id;
  draftSeasonId = (await createTestSeason({ status: "DRAFT" })).id;
  otherSeasonId = (await createTestSeason()).id;

  const superUser = await createTestUser("super", "SUPER");
  const admin = await createTestUser("admin", "ADMIN");
  const leader = await createTestUser("leader", "LEADER");
  const student = await createTestUser("student", "STUDENT");
  await db.seasonAdmin.create({ data: { seasonId, userId: admin.id } });
  await db.group.create({ data: { seasonId, name: "Led", leaders: { create: { userId: leader.id } } } });
  await db.seasonEnrollment.create({ data: { seasonId, studentUserId: student.id, status: "ACTIVE" } });

  token = newPublicId();
  sessionId = (
    await db.session.create({
      data: { seasonId, title: "Main", startsAt: new Date("2099-03-01T18:00:00.000Z"), durationMinutes: 90, checkInToken: token },
      select: { id: true },
    })
  ).id;
  draftSessionId = (
    await db.session.create({
      data: { seasonId: draftSeasonId, title: "Draft", startsAt: new Date("2099-03-02T18:00:00.000Z"), durationMinutes: 60 },
      select: { id: true },
    })
  ).id;
  otherSessionId = (
    await db.session.create({
      data: { seasonId: otherSeasonId, title: "Other", startsAt: new Date("2099-03-03T18:00:00.000Z"), durationMinutes: 60 },
      select: { id: true },
    })
  ).id;

  superToken = await login(app, superUser.email);
  adminToken = await login(app, admin.email);
  leaderToken = await login(app, leader.email);
  studentToken = await login(app, student.email);
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

it("runs against the Cairo org timezone these expectations assume", () => {
  expect(config.orgTimezone).toBe("Africa/Cairo");
});

describe("org wall clock on session writes and reads (D-16.6)", () => {
  it("composes startDay + startTime in ORG_TIMEZONE, across DST, for every weekly sibling", async () => {
    const res = await request(app)
      .post("/api/v1/sessions")
      .set("authorization", `Bearer ${adminToken}`)
      .send({ seasonId, title: "Summer series", startDay: "2099-07-03", startTime: "19:30", durationMinutes: 60, repeatWeeks: 2 });
    expect(res.status).toBe(201);
    const rows = await db.session.findMany({
      where: { recurrenceGroupId: res.body.data.recurrenceGroupId },
      orderBy: { startsAt: "asc" },
      select: { startsAt: true },
    });
    // 19:30 at UTC+3 (Egyptian summer time) is 16:30Z.
    expect(rows.map((r) => r.startsAt.toISOString())).toEqual([
      "2099-07-03T16:30:00.000Z",
      "2099-07-10T16:30:00.000Z",
    ]);
  });

  it("refuses a body carrying both startsAt and startDay/startTime", async () => {
    const res = await request(app)
      .post("/api/v1/sessions")
      .set("authorization", `Bearer ${adminToken}`)
      .send({
        seasonId, title: "Both", durationMinutes: 60,
        startsAt: "2099-07-03T16:30:00.000Z", startDay: "2099-07-03", startTime: "19:30",
      });
    expect(res.status).toBe(400);
  });

  it("serves dayKey and startTime on the detail and on list rows (X13, C4)", async () => {
    const detail = await request(app)
      .get(`/api/v1/sessions/${sessionId}`)
      .set("authorization", `Bearer ${studentToken}`);
    expect(detail.body.data).toMatchObject({ dayKey: "2099-03-01", startTime: "20:00" });

    const list = await request(app)
      .get(`/api/v1/seasons/${seasonId}/sessions`)
      .set("authorization", `Bearer ${adminToken}`);
    const row = list.body.data.sessions.find((s: { id: number }) => s.id === sessionId);
    expect(row).toMatchObject({ dayKey: "2099-03-01", startTime: "20:00" });
  });
});

describe("GET /api/v1/sessions — windowed, role-scoped (D-16.7, G17)", () => {
  it("gives SUPER every ACTIVE season's sessions in the window, never a DRAFT season's", async () => {
    const res = await request(app)
      .get("/api/v1/sessions")
      .query(WINDOW)
      .set("authorization", `Bearer ${superToken}`);
    expect(res.status).toBe(200);
    expect(ids(res)).toEqual(expect.arrayContaining([sessionId, otherSessionId]));
    expect(ids(res)).not.toContain(draftSessionId);
    expect(res.body.data).toMatchObject({ fromDayKey: "2099-02-25", toDayKey: "2099-03-10" });
  });

  it("lets SUPER open one season of any status with seasonId", async () => {
    const res = await request(app)
      .get("/api/v1/sessions")
      .query({ ...WINDOW, seasonId: draftSeasonId })
      .set("authorization", `Bearer ${superToken}`);
    expect(ids(res)).toEqual([draftSessionId]);
  });

  it("scopes ADMIN to their seasons; seasonId never widens", async () => {
    const own = await request(app)
      .get("/api/v1/sessions")
      .query({ ...WINDOW, seasonId })
      .set("authorization", `Bearer ${adminToken}`);
    expect(ids(own)).toEqual([sessionId]);
    expect(own.body.data.sessions[0].checkInToken).toBe(token);

    const all = await request(app).get("/api/v1/sessions").query(WINDOW).set("authorization", `Bearer ${adminToken}`);
    expect(ids(all)).toEqual([sessionId]);

    const foreign = await request(app)
      .get("/api/v1/sessions")
      .query({ ...WINDOW, seasonId: otherSeasonId })
      .set("authorization", `Bearer ${adminToken}`);
    expect(foreign.status).toBe(403);
  });

  it("gives LEADER every led season, and no check-in token (spec 04 §7 narrowing)", async () => {
    const res = await request(app).get("/api/v1/sessions").query(WINDOW).set("authorization", `Bearer ${leaderToken}`);
    expect(ids(res)).toEqual([sessionId]);
    expect(res.body.data.sessions[0].checkInToken).toBeNull();
  });

  it("refuses STUDENT (they keep the pinned-season route)", async () => {
    const res = await request(app).get("/api/v1/sessions").query(WINDOW).set("authorization", `Bearer ${studentToken}`);
    expect(res.status).toBe(403);
  });

  // v1 parity 2026-10-09 (spec 03 R75/R98): the window is optional and uncapped, as v1's
  // listSessionsForAllActiveSeasons (sessions-query.ts:64-81); only an inverted window is refused.
  it("refuses an inverted window, and accepts a long one", async () => {
    const inverted = await request(app)
      .get("/api/v1/sessions")
      .query({ from: WINDOW.to, to: WINDOW.from })
      .set("authorization", `Bearer ${superToken}`);
    expect(inverted.status).toBe(400);
    const long = await request(app)
      .get("/api/v1/sessions")
      .query({ from: "2099-01-01T00:00:00.000Z", to: "2099-06-01T00:00:00.000Z" })
      .set("authorization", `Bearer ${superToken}`);
    expect(long.status).toBe(200);
  });

  it("with no window returns every session of the scoped seasons, unbounded, plus the org today", async () => {
    const res = await request(app).get("/api/v1/sessions").set("authorization", `Bearer ${superToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ from: null, to: null, fromDayKey: null, toDayKey: null });
    expect(res.body.data.todayDayKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(ids(res)).toEqual(expect.arrayContaining([sessionId, otherSessionId]));
  });

  it("a window given only `from` is open-ended", async () => {
    const res = await request(app)
      .get("/api/v1/sessions")
      .query({ from: WINDOW.from })
      .set("authorization", `Bearer ${superToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.from).toBe(WINDOW.from);
    expect(res.body.data.to).toBeNull();
    expect(ids(res)).toEqual(expect.arrayContaining([sessionId]));
  });
});

describe("GET /api/v1/sessions/:id/series (D-16.8)", () => {
  let anchorId: number;

  beforeAll(async () => {
    const created = await request(app)
      .post("/api/v1/sessions")
      .set("authorization", `Bearer ${adminToken}`)
      .send({ seasonId, title: "Weekly", startDay: "2099-04-03", startTime: "19:00", durationMinutes: 60, repeatWeeks: 3 });
    const series = await db.session.findMany({
      where: { recurrenceGroupId: created.body.data.recurrenceGroupId },
      orderBy: { startsAt: "asc" },
      select: { id: true },
    });
    const second = series[1];
    if (!second) throw new Error("series fixture did not create three sessions");
    anchorId = second.id;
    const student = await db.seasonEnrollment.findFirstOrThrow({ where: { seasonId }, select: { studentUserId: true } });
    await db.attendance.create({ data: { sessionId: anchorId, studentUserId: student.studentUserId, status: "PRESENT" } });
  });

  it("previews 'future' as the anchor and every later sibling, with attendance counts", async () => {
    const res = await request(app)
      .get(`/api/v1/sessions/${anchorId}/series`)
      .query({ scope: "future" })
      .set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.sessions).toHaveLength(2);
    expect(res.body.data.sessions[0]).toMatchObject({ id: anchorId, isAnchor: true, attendanceCount: 1, startTime: "19:00" });
    expect(res.body.data).toMatchObject({ scope: "future", attendanceCount: 1, videoProgressCount: 0 });
  });

  it("previews 'all' as the whole season-fenced series", async () => {
    const res = await request(app)
      .get(`/api/v1/sessions/${anchorId}/series`)
      .query({ scope: "all" })
      .set("authorization", `Bearer ${adminToken}`);
    expect(res.body.data.sessions).toHaveLength(3);
  });

  it("requires a scope and a season admin", async () => {
    expect(
      (await request(app).get(`/api/v1/sessions/${anchorId}/series`).set("authorization", `Bearer ${adminToken}`)).status,
    ).toBe(400);
    expect(
      (await request(app).get(`/api/v1/sessions/${anchorId}/series`).query({ scope: "all" }).set("authorization", `Bearer ${leaderToken}`)).status,
    ).toBe(403);
  });
});

describe("check-in state and regeneration (D-16.9, G19)", () => {
  it("reads the state back — admin only", async () => {
    const before = await request(app)
      .get(`/api/v1/sessions/${sessionId}/check-in`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(before.status).toBe(200);
    expect(before.body.data).toMatchObject({ state: "not_open", isOpen: false, checkInToken: token, expiresAt: null });

    await request(app).post(`/api/v1/sessions/${sessionId}/check-in-open`).set("authorization", `Bearer ${adminToken}`);
    const open = await request(app)
      .get(`/api/v1/sessions/${sessionId}/check-in`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(open.body.data).toMatchObject({ state: "open", isOpen: true, checkInToken: token });
    const opened = new Date(open.body.data.checkInOpenAt).getTime();
    expect(new Date(open.body.data.expiresAt).getTime() - opened).toBe(3 * 3_600_000);
    expect(open.body.data.expiresAtTime).toMatch(/^\d{2}:\d{2}$/);

    for (const t of [leaderToken, studentToken]) {
      expect(
        (await request(app).get(`/api/v1/sessions/${sessionId}/check-in`).set("authorization", `Bearer ${t}`)).status,
      ).toBe(403);
    }
  });

  it("regenerates the token, keeps the window open, and kills the old code (v1 R40)", async () => {
    const res = await request(app)
      .post(`/api/v1/sessions/${sessionId}/check-in-regenerate`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.checkInToken).not.toBe(token);

    const row = await db.session.findUniqueOrThrow({
      where: { id: sessionId },
      select: { checkInToken: true, checkInOpenAt: true, checkInClosedAt: true },
    });
    expect(row.checkInToken).toBe(res.body.data.checkInToken);
    expect(row.checkInOpenAt).not.toBeNull();
    expect(row.checkInClosedAt).toBeNull();

    const stale = await request(app)
      .post("/api/v1/sessions/check-in")
      .set("authorization", `Bearer ${studentToken}`)
      .send({ token });
    expect(stale.status).toBe(404);
    expect(stale.body.error.code).toBe("invalid_token");

    expect(
      (await request(app).post(`/api/v1/sessions/${sessionId}/check-in-regenerate`).set("authorization", `Bearer ${leaderToken}`)).status,
    ).toBe(403);
  });
});

describe("GET /api/v1/sessions/:id/quizzes (D-16.10, G18)", () => {
  beforeAll(async () => {
    await db.quiz.create({ data: { seasonId, sessionId, title: "Paper quiz", kind: "PAPER", maxScore: 20 } });
    await db.quiz.create({ data: { seasonId, sessionId, title: "Online draft", kind: "ONLINE", maxScore: 10 } });
  });

  it("lists the session's quizzes for a leader in the season, oldest first", async () => {
    const res = await request(app)
      .get(`/api/v1/sessions/${sessionId}/quizzes`)
      .set("authorization", `Bearer ${leaderToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.quizzes).toEqual([
      { id: expect.any(Number), title: "Paper quiz", kind: "PAPER", maxScore: 20, questionCount: 0, publishedAt: null },
      { id: expect.any(Number), title: "Online draft", kind: "ONLINE", maxScore: 10, questionCount: 0, publishedAt: null },
    ]);
  });

  it("refuses a student and 404s an unknown session", async () => {
    expect(
      (await request(app).get(`/api/v1/sessions/${sessionId}/quizzes`).set("authorization", `Bearer ${studentToken}`)).status,
    ).toBe(403);
    expect(
      (await request(app).get("/api/v1/sessions/2147480000/quizzes").set("authorization", `Bearer ${adminToken}`)).status,
    ).toBe(404);
  });
});
```

Run: `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern session-admin-routes`. Expected: FAIL. The wall-clock write cases already pass after Task 1; every other new case fails.

- [ ] **Step 2: `lib/queries/sessions.ts`.** Replace the `SessionListRow` interface and `listSessionsForSeason`. Leave everything from `AttendanceRosterEntry` down untouched.

```ts
import { db } from "../../db/client";
import type { Prisma } from "../../generated/prisma/client";
import { orgDayKey, orgWallTime } from "../org-time";
import type { CalendarScope } from "../permissions";

export interface SessionListRow {
  id: number;
  title: string;
  startsAt: Date;
  /** Org-calendar day of startsAt (Plan 4, X13). */
  dayKey: string;
  /** Org wall-clock "HH:mm" of startsAt (Plan 6, X13). */
  startTime: string;
  durationMinutes: number;
  location: string | null;
  recurrenceGroupId: string | null;
  attendanceMarked: boolean;
  seasonId: number;
  seasonCode: string;
  seasonTitle: string;
  checkInToken: string | null;
  checkInOpenAt: Date | null;
  checkInClosedAt: Date | null;
}

const SESSION_LIST_SELECT = {
  id: true,
  title: true,
  startsAt: true,
  durationMinutes: true,
  location: true,
  recurrenceGroupId: true,
  checkInToken: true,
  checkInOpenAt: true,
  checkInClosedAt: true,
  _count: { select: { attendance: true } },
  season: { select: { id: true, code: true, title: true } },
} as const satisfies Prisma.SessionSelect;

type SessionListSource = Prisma.SessionGetPayload<{ select: typeof SESSION_LIST_SELECT }>;

/**
 * Possession of `checkInToken` is what authorises a check-in, so it is
 * masked unless the caller may run check-in for that row's season — every
 * list path masks through here.
 */
function toSessionListRow(s: SessionListSource, includeToken: boolean): SessionListRow {
  return {
    id: s.id,
    title: s.title,
    startsAt: s.startsAt,
    dayKey: orgDayKey(s.startsAt),
    startTime: orgWallTime(s.startsAt),
    durationMinutes: s.durationMinutes,
    location: s.location,
    recurrenceGroupId: s.recurrenceGroupId,
    attendanceMarked: s._count.attendance > 0,
    seasonId: s.season.id,
    seasonCode: s.season.code,
    seasonTitle: s.season.title,
    checkInToken: includeToken ? (s.checkInToken ?? null) : null,
    checkInOpenAt: s.checkInOpenAt,
    checkInClosedAt: s.checkInClosedAt,
  };
}

/** Unchanged contract (Phase 0 / Plan 4): token for every non-student caller. */
export async function listSessionsForSeason(
  seasonId: number,
  { includeCheckInToken = true }: { includeCheckInToken?: boolean } = {},
): Promise<SessionListRow[]> {
  const rows = await db.session.findMany({
    where: { seasonId },
    orderBy: { startsAt: "asc" },
    select: SESSION_LIST_SELECT,
  });
  return rows.map((s) => toSessionListRow(s, includeCheckInToken));
}

/**
 * The multi-season calendar (Plan 6 D-16.7; v1 sessions-query.ts:64-116).
 * `active` is v1's "all ACTIVE, non-deleted seasons" (R23); `seasons` is an
 * explicit, already-authorized set. The window is half-open [from, to).
 */
export async function listSessionsInRange(
  scope: CalendarScope,
  window: { from: Date | null; to: Date | null },
  includeTokenFor: (seasonId: number) => boolean,
): Promise<SessionListRow[]> {
  // v1 parity 2026-10-09 (spec 03 R75): either side may be open; no bounds = every session.
  const where: Prisma.SessionWhereInput = {
    ...(window.from || window.to
      ? { startsAt: { ...(window.from ? { gte: window.from } : {}), ...(window.to ? { lt: window.to } : {}) } }
      : {}),
    ...(scope.kind === "active"
      ? { season: { status: "ACTIVE", deletedAt: null } }
      : { seasonId: { in: scope.seasonIds } }),
  };
  const rows = await db.session.findMany({ where, orderBy: { startsAt: "asc" }, select: SESSION_LIST_SELECT });
  return rows.map((s) => toSessionListRow(s, includeTokenFor(s.season.id)));
}
```

- [ ] **Step 3: `calendarScopeFor`.** Append to `lib/permissions.ts`:

```ts
/** Which seasons a calendar request may read (Plan 6 D-16.7). */
export type CalendarScope = { kind: "active" } | { kind: "seasons"; seasonIds: number[] };

/**
 * The season set behind GET /api/v1/sessions, derived from the role — never
 * from the query. `seasonId` NARROWS within the caller's set; outside it the
 * answer is "forbidden", never a widened read (C8).
 */
export async function calendarScopeFor(
  user: SessionUser,
  seasonId: number | null,
): Promise<CalendarScope | "forbidden" | "not_found"> {
  if (seasonId !== null) {
    const live = await db.season.findFirst({ where: { id: seasonId, deletedAt: null }, select: { id: true } });
    if (!live) return "not_found";
  }

  if (isSuper(user)) {
    return seasonId !== null ? { kind: "seasons", seasonIds: [seasonId] } : { kind: "active" };
  }

  if (user.role === "ADMIN") {
    if (seasonId !== null) {
      return isAdminOfSeason(user, seasonId) ? { kind: "seasons", seasonIds: [seasonId] } : "forbidden";
    }
    const live = await db.season.findMany({
      where: { id: { in: user.seasonAdminIds }, deletedAt: null },
      select: { id: true },
    });
    return { kind: "seasons", seasonIds: live.map((s) => s.id) };
  }

  if (user.role === "LEADER") {
    // One query instead of v1's per-season N+1 (spec 03 R85).
    const groups = await db.group.findMany({
      where: { id: { in: user.groupLeaderIds }, season: { deletedAt: null } },
      select: { seasonId: true },
    });
    const led = [...new Set(groups.map((g) => g.seasonId))];
    if (seasonId !== null) {
      return led.includes(seasonId) ? { kind: "seasons", seasonIds: [seasonId] } : "forbidden";
    }
    return { kind: "seasons", seasonIds: led };
  }

  // STUDENT keeps the pinned-season route; MENTOR has no calendar (spec 03 §9).
  return "forbidden";
}
```

(`isSuper` joins the existing `./rbac` import.)

- [ ] **Step 4: Routes.** In `routes/sessions.ts`, make these import changes:
- add to the relative shared import: `recurrenceScopeSchema`, `sessionRangeQuerySchema` (v1 parity 2026-10-09: the range constants are gone, R75);
- extend the `../lib/org-time` import with `addWeeksInOrgTime`, `orgDayKey`, `orgWallTime` (beside the `orgWallClockToInstant` Task 1 already imported);
- extend the `../lib/check-in` import with `checkInState`, `CHECK_IN_WINDOW_MS`;
- extend the `../lib/permissions` import with `calendarScopeFor`;
- import `listSessionsInRange` from `../lib/queries/sessions`.

(a) Add `GET "/"` directly below Plan 3's `POST "/"`:

```ts
/**
 * The multi-season calendar (Plan 6 D-16.7, G17). The season set comes from
 * the role (calendarScopeFor). The window is optional and uncapped, as v1's
 * super calendar was every session of every ACTIVE season, unbounded (spec
 * 03 R75; v1 parity 2026-10-09). Day boundaries are org midnights (C2).
 */
sessionsRouter.get("/", async (req, res) => {
  const user = requireUser(req);
  const parsed = sessionRangeQuerySchema.safeParse(req.query);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid calendar window.", 400);
  const q = parsed.data;

  const from = q.from ? new Date(q.from) : null;
  const to = q.to ? new Date(q.to) : null;
  if (from && to && to.getTime() <= from.getTime()) {
    return apiError(res, "bad_request", "The window must end after it starts.", 400);
  }

  const scope = await calendarScopeFor(user, q.seasonId ?? null);
  if (scope === "not_found") return apiError(res, "not_found", "Season not found.", 404);
  if (scope === "forbidden") return apiError(res, "forbidden", "You don't have access to this.", 403);

  // Tokens only for seasons the caller can actually run check-in for (spec
  // 04 §7): v1 handed them to every non-student, leaders included.
  const sessions = await listSessionsInRange(scope, { from, to }, (sid) => isAdminOfSeason(user, sid));
  return apiOk(res, {
    sessions,
    from,
    to,
    fromDayKey: from ? orgDayKey(from) : null,
    toDayKey: to ? orgDayKey(new Date(to.getTime() - 1)) : null,
    todayDayKey: orgDayKey(new Date()),
  });
});
```

(b) In `GET "/:id"`'s response object, after `startsAt: session.startsAt,`, add:

```ts
    dayKey: orgDayKey(session.startsAt),
    startTime: orgWallTime(session.startsAt),
```

(c) Append the four session-scoped routes at the end of the file:

```ts
/**
 * What a scoped edit/delete would touch (spec 03 §7, Plan 6 D-16.8). Uses
 * resolveSeriesTargets — the SAME season-fenced selection PATCH and DELETE
 * use — so the preview cannot disagree with the write. A GET: writes nothing (C6).
 */
sessionsRouter.get("/:id/series", async (req, res) => {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid session id.", 400);

  const anchor = await db.session.findUnique({
    where: { id },
    select: { id: true, seasonId: true, recurrenceGroupId: true, startsAt: true },
  });
  if (!anchor) return apiError(res, "not_found", "Session not found.", 404);
  if (!isAdminOfSeason(user, anchor.seasonId)) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const scope = recurrenceScopeSchema.safeParse(req.query.scope);
  if (!scope.success) return apiError(res, "bad_request", "Pass scope=one|future|all.", 400);

  const targetIds = (await resolveSeriesTargets(anchor, scope.data)).map((t) => t.id);
  const inTargets = { sessionId: { in: targetIds } };
  const [rows, attendanceCount, videoProgressCount] = await Promise.all([
    db.session.findMany({
      where: { id: { in: targetIds } },
      orderBy: { startsAt: "asc" },
      select: { id: true, title: true, startsAt: true, _count: { select: { attendance: true } } },
    }),
    db.attendance.count({ where: inTargets }),
    db.sessionVideoProgress.count({ where: inTargets }),
  ]);

  return apiOk(res, {
    scope: scope.data,
    sessions: rows.map((r) => ({
      id: r.id,
      title: r.title,
      startsAt: r.startsAt,
      dayKey: orgDayKey(r.startsAt),
      startTime: orgWallTime(r.startsAt),
      isAnchor: r.id === anchor.id,
      attendanceCount: r._count.attendance,
    })),
    attendanceCount,
    videoProgressCount,
  });
});

/**
 * Read the check-in state back (spec 04 §7, Plan 6 D-16.9). The narrow,
 * admin-only way to recover the token after an app restart — so the console
 * no longer depends on the season-wide session list for it.
 */
sessionsRouter.get("/:id/check-in", async (req, res) => {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid session id.", 400);

  const session = await db.session.findUnique({
    where: { id },
    select: { seasonId: true, checkInToken: true, checkInOpenAt: true, checkInClosedAt: true },
  });
  if (!session) return apiError(res, "not_found", "Session not found.", 404);
  if (!isAdminOfSeason(user, session.seasonId)) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const state = checkInState(session);
  const expiresAt =
    state === "open" && session.checkInOpenAt
      ? new Date(session.checkInOpenAt.getTime() + CHECK_IN_WINDOW_MS)
      : null;
  return apiOk(res, {
    state,
    isOpen: state === "open",
    checkInToken: session.checkInToken,
    checkInOpenAt: session.checkInOpenAt,
    checkInClosedAt: session.checkInClosedAt,
    expiresAt,
    expiresAtTime: expiresAt ? orgWallTime(expiresAt) : null,
  });
});

/**
 * Replace the check-in token (v1 regenerateCheckInTokenAction,
 * session-actions.ts:275-295, R40): both timestamps are left alone, so an
 * open window stays open under the new code and the old one stops working.
 */
sessionsRouter.post("/:id/check-in-regenerate", async (req, res) => {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid session id.", 400);

  const session = await db.session.findUnique({ where: { id }, select: { seasonId: true } });
  if (!session) return apiError(res, "not_found", "Session not found.", 404);
  if (!isAdminOfSeason(user, session.seasonId)) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const checkInToken = newPublicId();
  await db.session.update({ where: { id }, data: { checkInToken } });
  return apiOk(res, { checkInToken });
});

/**
 * The session's quizzes for staff (v1 listQuizzesForSession, quiz-query.ts:
 * 141-170; Plan 6 D-16.10). Gated like the attendance roster: season
 * admins and leaders with a group in the season.
 */
sessionsRouter.get("/:id/quizzes", async (req, res) => {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid session id.", 400);

  const exists = await db.session.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return apiError(res, "not_found", "Session not found.", 404);
  if ((await attendanceScopeFor(user, id)) === null) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const quizzes = await db.quiz.findMany({
    where: { sessionId: id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      title: true,
      kind: true,
      maxScore: true,
      publishedAt: true,
      _count: { select: { questions: true } },
    },
  });
  return apiOk(res, {
    quizzes: quizzes.map((q) => ({
      id: q.id,
      title: q.title,
      kind: q.kind,
      maxScore: q.maxScore,
      questionCount: q._count.questions,
      publishedAt: q.publishedAt,
    })),
  });
});
```

`resolveSeriesTargets` is Plan 3's module-local function in this same file. If Plan 3 placed it below the routes, move it above `GET "/:id/series"`, since function declarations hoist and the move is cosmetic.

- [ ] **Step 5: Run.**
- `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern "session-admin-routes|sessions-routes|check-in-routes|attendance-routes"` → PASS. The three existing suites stay green unchanged: list rows only gained `startTime`, and the token rule for `GET /seasons/:id/sessions` is untouched.
- `pnpm turbo lint typecheck test:unit --filter=@space/backend` → clean.

- [ ] **Step 6: OpenAPI (same commit).**

(a) Add `startTime: { type: "string", pattern: "^\\d{2}:\\d{2}$", description: "Org wall-clock start (X13)." }` to `SessionListItem.properties`. Add the same plus `dayKey` to `SessionDetail.properties`.

(b) In the `POST /api/v1/sessions` and `PATCH /api/v1/sessions/{id}` request schemas, document `startDay: { type: "string", description: "YYYY-MM-DD on the org calendar" }` and `startTime: { type: "string", description: "HH:mm on the org clock" }` with the description: "Org wall-clock start (D-16.6, Plan 5's day/time split); send exactly one of startsAt, or startDay + startTime."

(c) Add these paths:

```ts
    "/api/v1/sessions": {
      // keep Plan 3's `post` here; add:
      get: {
        tags: ["Sessions"],
        summary: "Calendar sessions across seasons, windowed",
        description:
          "Season set by role: SUPER all ACTIVE seasons (or any one live season via seasonId); ADMIN their seasons; LEADER every season they lead a group in; STUDENT/MENTOR 403. seasonId narrows within that set and is 403 outside it. Window [from, to) defaults to org-midnight today + 8 calendar weeks; one bound alone extends 8 weeks; span ≤ 120 days. checkInToken only on rows of seasons the caller administers.",
        parameters: [
          { name: "from", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "to", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "seasonId", in: "query", schema: { type: "integer" } },
        ],
        responses: {
          200: ok(
            {
              type: "object",
              properties: {
                sessions: { type: "array", items: { $ref: "#/components/schemas/SessionListItem" } },
                from: { type: "string", format: "date-time" },
                to: { type: "string", format: "date-time" },
                fromDayKey: { type: "string" },
                toDayKey: { type: "string" },
              },
            },
            "Sessions in the window.",
          ),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
        },
      },
    },
    "/api/v1/sessions/{id}/series": {
      get: {
        tags: ["Sessions"],
        summary: "Preview the sessions a scoped edit or delete would touch",
        description:
          "Season-admin only. Same season-fenced selection PATCH/DELETE use (C10). 'future' = the anchor and every sibling at or after its stored start. Totals are what DELETE refuses without force.",
        parameters: [idParam, { name: "scope", in: "query", required: true, schema: { type: "string", enum: ["one", "future", "all"] } }],
        responses: {
          200: ok({ type: "object" }, "The targets with dayKey, startTime, isAnchor, attendanceCount; totals attendanceCount, videoProgressCount."),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
        },
      },
    },
    "/api/v1/sessions/{id}/check-in": {
      get: {
        tags: ["Sessions"],
        summary: "Check-in state for the admin console",
        description: "Season-admin only. state ∈ not_open|open|expired|closed (lib/check-in.ts — the same rule the scan enforces); expiresAt/expiresAtTime only while open.",
        parameters: [idParam],
        responses: {
          200: ok({ type: "object" }, "The state."),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
        },
      },
    },
    "/api/v1/sessions/{id}/check-in-regenerate": {
      post: {
        tags: ["Sessions"],
        summary: "Replace the check-in token",
        description: "Season-admin only. Timestamps untouched: an open window stays open under the new code, and the old code is rejected with invalid_token (v1 R40).",
        parameters: [idParam],
        responses: {
          200: ok({ type: "object", properties: { checkInToken: { type: "string" } } }, "The new token."),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
        },
      },
    },
    "/api/v1/sessions/{id}/quizzes": {
      get: {
        tags: ["Sessions"],
        summary: "Quizzes linked to a session",
        description: "Season admins and leaders with a group in the season. Oldest first (v1 listQuizzesForSession).",
        parameters: [idParam],
        responses: {
          200: ok({ type: "object" }, "{ quizzes: [{ id, title, kind, maxScore, questionCount, publishedAt }] }"),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
        },
      },
    },
```

- [ ] **Step 7: Commit** — `git add apps/backend && git commit -m "feat(backend): windowed multi-season calendar, series preview, check-in state/regenerate, session quizzes"`

---

### Task 4: Groups backend — leader options, impact, delete, `canManage` *(coordinator)*

**Files:**
- Modify: `apps/backend/src/routes/groups.ts`, `apps/backend/src/lib/queries/groups.ts` (append `loadGroupImpact`), `apps/backend/src/lib/rbac.ts` (append `isAdminOfAnySeason`), `apps/backend/src/docs/openapi.ts`
- Test: `apps/backend/src/__tests__/rbac.test.ts` (extend), `apps/backend/src/__tests__/integration/group-admin-routes.test.ts` (new)

**Interfaces:**
- Consumes: `isAdminOfSeason`, `isSuper`; `AssignmentTarget`/`Assignment` rows (read-only).
- Produces: `isAdminOfAnySeason(u)`; `loadGroupImpact(groupId)`; endpoints `GET /api/v1/groups/leader-options`, `GET /api/v1/groups/:id/impact`, `DELETE /api/v1/groups/:id`; `canManage` on `GET /groups/:id`; error code `group_has_sole_targets` 409.

- [ ] **Step 1: Failing unit test.** Append to `apps/backend/src/__tests__/rbac.test.ts`. Use that file's own user-fixture helper. If it has none, build `SessionUser` literals the same way its existing cases do.

```ts
describe("isAdminOfAnySeason (Plan 6 D-16.14)", () => {
  const base = { userId: 1, seasonAdminIds: [] as number[], groupLeaderIds: [] as number[], activeSeasonId: null, graduationYear: null };
  it("is true for SUPER and for an ADMIN holding a season", () => {
    expect(isAdminOfAnySeason({ ...base, role: "SUPER" })).toBe(true);
    expect(isAdminOfAnySeason({ ...base, role: "ADMIN", seasonAdminIds: [3] })).toBe(true);
  });
  it("is false for an ADMIN with no season and for a stray grant on another role (C7)", () => {
    expect(isAdminOfAnySeason({ ...base, role: "ADMIN" })).toBe(false);
    expect(isAdminOfAnySeason({ ...base, role: "STUDENT", seasonAdminIds: [3] })).toBe(false);
  });
});
```

Spread whatever extra required `SessionUser` fields the file's existing fixtures carry. Run: `cd apps/backend && npx jest src/__tests__/rbac.test.ts`. Expected: FAIL.

- [ ] **Step 2: Implement.** Append to `lib/rbac.ts`:

```ts
/**
 * May act as a season admin somewhere — e.g. read the leader picker for a
 * group form. The role is tested with the claim (C7): a stray SeasonAdmin row
 * on a STUDENT grants nothing.
 */
export function isAdminOfAnySeason(u: SessionUser): boolean {
  if (u.role === "SUPER") return true;
  return u.role === "ADMIN" && u.seasonAdminIds.length > 0;
}
```

Run the unit test → PASS.

- [ ] **Step 3: Failing integration tests**

```ts
// apps/backend/src/__tests__/integration/group-admin-routes.test.ts
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

jest.setTimeout(60000);

const app = createApp();

let seasonId: number;
let groupId: number;
let otherGroupId: number;
let soleAssignmentId: number;
let leaderId: number;
let studentIds: number[];
let superToken: string;
let adminToken: string;
let idleAdminToken: string;
let leaderToken: string;

beforeAll(async () => {
  await cleanupTestData();
  seasonId = (await createTestSeason()).id;

  const superUser = await createTestUser("super", "SUPER");
  const admin = await createTestUser("admin", "ADMIN");
  const idleAdmin = await createTestUser("idle-admin", "ADMIN");
  const leader = await createTestUser("leader", "LEADER");
  leaderId = leader.id;
  await db.seasonAdmin.create({ data: { seasonId, userId: admin.id } });

  groupId = (
    await db.group.create({
      data: { seasonId, name: "Doomed", leaders: { create: { userId: leader.id } } },
      select: { id: true },
    })
  ).id;
  otherGroupId = (await db.group.create({ data: { seasonId, name: "Survivor" }, select: { id: true } })).id;

  studentIds = [];
  for (const label of ["g-a", "g-b"]) {
    const s = await createTestUser(label, "STUDENT");
    studentIds.push(s.id);
    await db.seasonEnrollment.create({ data: { seasonId, studentUserId: s.id, groupId, status: "ACTIVE" } });
    await db.groupStudent.create({ data: { groupId, studentUserId: s.id } });
  }

  soleAssignmentId = (
    await db.assignment.create({
      data: { seasonId, title: "Only for Doomed", isAllGroups: false, targets: { create: { groupId } } },
      select: { id: true },
    })
  ).id;
  await db.assignment.create({
    data: { seasonId, title: "Shared", isAllGroups: false, targets: { create: [{ groupId }, { groupId: otherGroupId }] } },
  });
  await db.assignment.create({ data: { seasonId, title: "Everyone", isAllGroups: true } });
  await db.assignment.create({
    data: { seasonId, title: "Deleted sole", isAllGroups: false, deletedAt: new Date(), targets: { create: { groupId } } },
  });

  superToken = await login(app, superUser.email);
  adminToken = await login(app, admin.email);
  idleAdminToken = await login(app, idleAdmin.email);
  leaderToken = await login(app, leader.email);
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("GET /api/v1/groups/leader-options (D-16.14)", () => {
  it("lists live LEADER users for a season admin and a SUPER", async () => {
    for (const t of [adminToken, superToken]) {
      const res = await request(app).get("/api/v1/groups/leader-options").set("authorization", `Bearer ${t}`);
      expect(res.status).toBe(200);
      const ids = res.body.data.leaders.map((l: { id: number }) => l.id);
      expect(ids).toContain(leaderId);
      expect(ids).not.toEqual(expect.arrayContaining(studentIds));
    }
  });

  it("refuses an ADMIN with no season and a LEADER", async () => {
    for (const t of [idleAdminToken, leaderToken]) {
      expect((await request(app).get("/api/v1/groups/leader-options").set("authorization", `Bearer ${t}`)).status).toBe(403);
    }
  });
});

describe("canManage on GET /api/v1/groups/:id (D-16.15)", () => {
  it("is true for the season admin and false for the group's own leader", async () => {
    const admin = await request(app).get(`/api/v1/groups/${groupId}`).set("authorization", `Bearer ${adminToken}`);
    expect(admin.body.data.canManage).toBe(true);
    const leader = await request(app).get(`/api/v1/groups/${groupId}`).set("authorization", `Bearer ${leaderToken}`);
    expect(leader.body.data.canManage).toBe(false);
  });
});

describe("group delete (D-16.13)", () => {
  it("previews the impact — live, sole-target assignments only", async () => {
    const res = await request(app).get(`/api/v1/groups/${groupId}/impact`).set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      studentCount: 2,
      leaderCount: 1,
      soleTargetAssignments: [{ id: soleAssignmentId, title: "Only for Doomed" }],
    });
  });

  it("refuses to delete while an assignment would be left targeting nobody (spec 05 R44)", async () => {
    const res = await request(app).delete(`/api/v1/groups/${groupId}`).set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("group_has_sole_targets");
    expect(await db.group.count({ where: { id: groupId } })).toBe(1);
  });

  it("refuses a leader — even of this group", async () => {
    expect((await request(app).get(`/api/v1/groups/${groupId}/impact`).set("authorization", `Bearer ${leaderToken}`)).status).toBe(403);
    expect((await request(app).delete(`/api/v1/groups/${groupId}`).set("authorization", `Bearer ${leaderToken}`)).status).toBe(403);
  });

  it("deletes once retargeted: unassigns every enrolment, drops memberships and targets, keeps the others", async () => {
    await db.assignment.update({ where: { id: soleAssignmentId }, data: { isAllGroups: true } });

    const res = await request(app).delete(`/api/v1/groups/${groupId}`).set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.deleted).toBe(true);
    expect([...res.body.data.orphanedStudentIds].sort()).toEqual([...studentIds].sort());

    expect(await db.group.count({ where: { id: groupId } })).toBe(0);
    expect(await db.groupStudent.count({ where: { studentUserId: { in: studentIds } } })).toBe(0);
    const enrolments = await db.seasonEnrollment.findMany({
      where: { seasonId, studentUserId: { in: studentIds } },
      select: { groupId: true, status: true },
    });
    expect(enrolments).toEqual([
      { groupId: null, status: "ACTIVE" },
      { groupId: null, status: "ACTIVE" },
    ]);
    // The shared assignment keeps its other target.
    const shared = await db.assignment.findFirstOrThrow({ where: { seasonId, title: "Shared" }, select: { targets: { select: { groupId: true } } } });
    expect(shared.targets).toEqual([{ groupId: otherGroupId }]);
  });

  it("is 404 the second time", async () => {
    expect((await request(app).delete(`/api/v1/groups/${groupId}`).set("authorization", `Bearer ${adminToken}`)).status).toBe(404);
  });
});
```

Run: `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern group-admin-routes`. Expected: FAIL.

- [ ] **Step 4: `loadGroupImpact`.** Append to `lib/queries/groups.ts`:

```ts
/**
 * What deleting a group would do (spec 05 §10 item 5, Plan 6 D-16.13).
 * `soleTargetAssignments`: live assignments that are not "all groups" and
 * whose ONLY target is this group — deleting it would cascade their last
 * AssignmentTarget away and leave them visible to nobody (R44).
 */
export async function loadGroupImpact(groupId: number): Promise<{
  studentCount: number;
  leaderCount: number;
  soleTargetAssignments: { id: number; title: string }[];
}> {
  const [studentCount, leaderCount, targeted] = await Promise.all([
    db.seasonEnrollment.count({ where: { groupId, status: "ACTIVE" } }),
    db.groupLeader.count({ where: { groupId } }),
    db.assignment.findMany({
      where: { deletedAt: null, isAllGroups: false, targets: { some: { groupId } } },
      orderBy: { id: "asc" },
      select: { id: true, title: true, _count: { select: { targets: true } } },
    }),
  ]);
  return {
    studentCount,
    leaderCount,
    soleTargetAssignments: targeted.filter((a) => a._count.targets === 1).map((a) => ({ id: a.id, title: a.title })),
  };
}
```

- [ ] **Step 5: Routes.** In `routes/groups.ts`:
- add `loadGroupImpact` to the `../lib/queries/groups` import;
- add `isAdminOfAnySeason` to the `../lib/rbac` import.

(a) Register **before** `groupsRouter.patch("/:id", …)` (a literal segment must precede the parameter route that would shadow it):

```ts
/**
 * Leader picker for the group form (Plan 6 D-16.14). Interim: spec 05 §7
 * puts this behind domain 11's GET /users?role=, which lands in Plan 9 — it
 * may replace this route and repoint useLeaderOptions.
 */
groupsRouter.get("/leader-options", async (req, res) => {
  const user = requireUser(req);
  if (!isAdminOfAnySeason(user)) return apiError(res, "forbidden", "You don't have access to this.", 403);
  const leaders = await db.user.findMany({
    where: { role: "LEADER", deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true },
  });
  return apiOk(res, { leaders });
});
```

(b) In `GET "/:id"`'s `apiOk` payload, add after `students`:

```ts
    canManage: isAdminOfSeason(user, group.seasonId),
```

(c) Append:

```ts
async function loadManagedGroup(req: Request, res: Response): Promise<number | null> {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) {
    apiError(res, "bad_request", "Invalid group id.", 400);
    return null;
  }
  const group = await db.group.findUnique({ where: { id }, select: { seasonId: true } });
  if (!group) {
    apiError(res, "not_found", "Group not found.", 404);
    return null;
  }
  if (!isAdminOfSeason(user, group.seasonId)) {
    apiError(res, "forbidden", "You don't have access to this.", 403);
    return null;
  }
  return id;
}

groupsRouter.get("/:id/impact", async (req, res) => {
  const id = await loadManagedGroup(req, res);
  if (id === null) return;
  return apiOk(res, await loadGroupImpact(id));
});

class GroupHasSoleTargetsError extends Error {
  constructor(readonly count: number) {
    super("group has sole-target assignments");
  }
}

/**
 * Delete a group — designed, not ported (ruling C12: v1's deleteGroupAction
 * has no caller, spec 05 R46). Refuses while any live assignment targets
 * only this group (R44 — it would become visible to nobody). Otherwise, in
 * one interactive transaction that RE-CHECKS that condition: leaders,
 * memberships and target rows go; every SeasonEnrollment pointing at the
 * group loses the pointer (all seasons — R43's FK SetNull made explicit);
 * the group is hard-deleted (Group has no deletedAt).
 */
groupsRouter.delete("/:id", async (req, res) => {
  const id = await loadManagedGroup(req, res);
  if (id === null) return;

  try {
    const orphanedStudentIds = await db.$transaction(async (tx) => {
      const sole = await tx.assignment.findMany({
        where: { deletedAt: null, isAllGroups: false, targets: { some: { groupId: id } } },
        select: { _count: { select: { targets: true } } },
      });
      const soleCount = sole.filter((a) => a._count.targets === 1).length;
      if (soleCount > 0) throw new GroupHasSoleTargetsError(soleCount);

      const orphaned = await tx.seasonEnrollment.findMany({ where: { groupId: id }, select: { studentUserId: true } });
      await tx.groupLeader.deleteMany({ where: { groupId: id } });
      await tx.groupStudent.deleteMany({ where: { groupId: id } });
      await tx.seasonEnrollment.updateMany({ where: { groupId: id }, data: { groupId: null } });
      await tx.assignmentTarget.deleteMany({ where: { groupId: id } });
      await tx.group.delete({ where: { id } });
      return orphaned.map((o) => o.studentUserId);
    });
    return apiOk(res, { deleted: true, orphanedStudentIds });
  } catch (err) {
    if (err instanceof GroupHasSoleTargetsError) {
      return apiError(
        res,
        "group_has_sole_targets",
        `${err.count} assignment(s) target only this group. Retarget them before deleting it.`,
        409,
      );
    }
    throw err;
  }
});
```

Add `import type { Request, Response } from "express";` (merge with the existing `Router` import).

> **v1 parity 2026-10-09:** Group create/edit writes, in pre-plan code (commit 371404d) that this task does not otherwise touch, change in three places:
> - Add `GET /groups/student-options` beside `leader-options`: live `role: "STUDENT"` users, `{ id, name, email }`, `orderBy: { name: "asc" }`, gate `isAdminOfAnySeason` (spec 05 R18/R78, v1 `src/lib/groups-query.ts:112-121`). Add it to OpenAPI in Step 7 and give it an integration case here.
> - `validateGroupWrite` must accept any live role-STUDENT user, not only one already enrolled in the season. Drop the `not_enrolled` 409 at `apps/backend/src/lib/queries/groups.ts:155-168` (v1 `src/lib/group-actions.ts:55-76`, spec 05 R18). `setGroupStudents` (`groups.ts:210-213`) must **upsert** the enrolment: create an ACTIVE `SeasonEnrollment` with this `groupId` when none exists, otherwise set `groupId` only. Status, dates and drop reason are preserved (KEEP-FIX R21/R34). This is the group form's path only. `assignStudentsToGroups` (roster grid, Plan 17 importer) keeps refusing non-enrolled students (KEEP-FIX R51/R55; 16-imports R78).
> - `groupWriteRequestSchema` (`packages/shared/src/group.ts:40-41`) keeps `int().positive()` on `leaderIds`/`studentIds` but drops `.max(20)` and `.max(500)`, so any number is accepted as in v1 (v1 `src/lib/group-actions.ts:16-19,49`, spec 05 R14).

- [ ] **Step 6: Run.**
- `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern "group-admin-routes|groups-routes"` → PASS. Plan 2's `groups-routes` uses `toEqual` only on `leaders`/`students` arrays, so `canManage` does not disturb it.
- `pnpm turbo lint typecheck test:unit --filter=@space/backend` → clean.

- [ ] **Step 7: OpenAPI (same commit).**
- Add `canManage: { type: "boolean", description: "isAdminOfSeason for the caller." }` to `GroupDetail.properties`.
- Add `get "/api/v1/groups/leader-options"`, `get "/api/v1/groups/{id}/impact"` and `delete` on `"/api/v1/groups/{id}"`, using the same `ok`/`errRef` pattern as Task 2.
- The DELETE description must state:
  - season-admin only;
  - `409 group_has_sole_targets` while any live non-all-groups assignment targets only this group;
  - it unassigns every enrolment pointing at the group, deletes leaders, memberships and target rows, and hard-deletes the group;
  - it returns `{ deleted: true, orphanedStudentIds }`;
  - it is designed rather than ported, because v1's action was unreachable (C12).

- [ ] **Step 8: Commit** — `git add apps/backend && git commit -m "feat(backend): group delete with impact preview and sole-target guard; leader options; canManage"`

---
### Task 5: Mobile foundation — route moves, stubs, layout, keys, helpers, season switcher *(coordinator)*

This is the only mobile task that edits shared files: `_layout.tsx`, `query-keys.ts`, `api-error.ts`, `app-layout.test.tsx` and other plans' test fixtures. After it lands, Tasks 6–9 touch disjoint files.

**Files:**
- Move: `apps/mobile/app/(app)/seasons.tsx` → `apps/mobile/app/(app)/seasons/index.tsx`
- Move: `apps/mobile/app/(app)/group/[id].tsx` → `apps/mobile/app/(app)/group/[id]/index.tsx`
- Create (stubs, replaced by Tasks 6–8): `app/(app)/seasons/[code]/index.tsx`, `app/(app)/seasons/[code]/edit.tsx`, `app/(app)/seasons/[code]/roster/index.tsx`, `app/(app)/group/new.tsx`, `app/(app)/group/[id]/edit.tsx`, `app/(app)/session/new.tsx`, `app/(app)/session/[id]/edit.tsx`
- Modify: `apps/mobile/app/(app)/_layout.tsx` (`routeNameForHref`, `DETAIL_ROUTE_NAMES`)
- Modify: `apps/mobile/src/lib/query-keys.ts`, `apps/mobile/src/lib/api-error.ts` (add `apiErrorCode`)
- Create: `apps/mobile/src/lib/form-errors.ts`, `apps/mobile/src/lib/params.ts`, `apps/mobile/src/hooks/use-season-selection.ts`, `apps/mobile/src/components/SeasonSwitcher.tsx`
- Modify (fixtures only): every mobile test building a `SessionListItem`, `SessionDetail`, `SeasonDetail` or `GroupDetail`; the import paths in `season-screens.test.tsx` and `groups-screens.test.tsx`
- Test: `apps/mobile/src/__tests__/app-layout.test.tsx` (extend), `apps/mobile/src/__tests__/season-admin-foundation.test.tsx` (new)

**Interfaces:**
- Consumes: Task 1 schemas; Plan 1's `DETAIL_ROUTE_NAMES` / `routeNameForHref`; Plan 4's `useSeasons`, `pickCurrentSeasonId`, `apiErrorBodySchema`.
- Produces:
  - **Routes:** `/seasons` (now `seasons/index`), `/seasons/[code]`, `/seasons/[code]/edit`, `/seasons/[code]/roster`, `/group/new`, `/group/[id]` (now `group/[id]/index`), `/group/[id]/edit`, `/session/new`, `/session/[id]/edit`.
  - **Query keys:** `queryKeys.seasons.byCode(code)`; `queryKeys.sessions.range(params)`, `.series(id, scope)`, `.checkIn(id)`, `.quizzes(id)`; `queryKeys.groups.impact(id)`, `.leaderOptions()`, `.roster(seasonId)`.
  - **Helpers:** `apiErrorCode(err): string | null`; `firstErrorByField(error: ZodError): Record<string, string>`; `parsePositiveInt(raw): number | null`.
  - **Season selection:** `useStaffSeasonSelection(enabled): StaffSeasonSelection`; `SeasonSwitcher`.

- [ ] **Step 1: Fixture repair** (fixes the red Task 1 left on mobile). Find the fixtures:

```bash
cd apps/mobile
grep -rln "checkInClosedAt" src/__tests__      # SessionListItem fixtures
grep -rln "canMarkAttendance" src/__tests__    # SessionDetail fixtures
grep -rln "sessionCount" src/__tests__         # SeasonDetail fixtures
grep -rln "seasonTitle: \"" src/__tests__ | xargs grep -ln "leaders: \["   # GroupDetail fixtures
```

Edit every fixture object those files build:
- **`SessionListItem`:** add `startTime: "20:00"`. Every existing fixture is an evening UTC instant; any valid `HH:mm` satisfies the schema, and the screens render the field verbatim.
- **`SessionDetail`:** add `dayKey: "<the date part of its startsAt>"` and `startTime: "20:00"`. Plan 4's `baseDetail` in `session-detail.test.tsx` gets `dayKey: "2099-03-15", startTime: "20:00"`.
- **`SeasonDetail`:** add `absenceBudgetMinutes: 180, absenceWeightMinutes: 90, canAdminister: true`. Plan 4's `detail` in `season-screens.test.tsx` is shared by its ADMIN and STUDENT cases. `season.tsx` gates on role, not on this field, so `true` is harmless there.
- **`GroupDetail`:** add `canManage: false`. Plan 2's two fixtures in `groups-screens.test.tsx` are a leader's and a student's views.

Run `cd apps/mobile && pnpm jest` → green again. Every earlier suite passes; nothing new is tested yet.

- [ ] **Step 2: Failing layout assertions.** In `app-layout.test.tsx`:
- change Plan 2's assertion list entry `"group/[id]"` to `"group/[id]/index"`;
- add `routeNameForHref` to the `_layout` import;
- append inside the `describe`:

```tsx
  it("registers Plan 6's detail routes, in the directory form where they have children (X7)", () => {
    for (const name of [
      "seasons/[code]/index",
      "seasons/[code]/edit",
      "seasons/[code]/roster/index",
      "group/new",
      "group/[id]/index",
      "group/[id]/edit",
      "session/new",
      "session/[id]/edit",
    ]) {
      expect(DETAIL_ROUTE_NAMES).toContain(name);
    }
    expect(DETAIL_ROUTE_NAMES).not.toContain("group/[id]");
  });

  it("maps the /seasons tab to its directory route, like /students", () => {
    expect(routeNameForHref("/seasons")).toBe("seasons/index");
    expect(routeNameForHref("/students")).toBe("students/index");
    expect(routeNameForHref("/calendar")).toBe("calendar");
  });
```

Run `cd apps/mobile && pnpm jest src/__tests__/app-layout.test.tsx` → FAIL.

- [ ] **Step 3: Move, stub, register.**

```bash
cd apps/mobile
mkdir -p "app/(app)/seasons" "app/(app)/group/[id]"
git mv "app/(app)/seasons.tsx" "app/(app)/seasons/index.tsx"
git mv "app/(app)/group/[id].tsx" "app/(app)/group/[id]/index.tsx"
# One directory deeper → one more "../" on every relative import.
sed -i 's#"\.\./\.\./src/#"../../../src/#g' "app/(app)/seasons/index.tsx"
sed -i 's#"\.\./\.\./\.\./src/#"../../../../src/#g' "app/(app)/group/[id]/index.tsx"
grep -n 'from "\.\./' "app/(app)/seasons/index.tsx" "app/(app)/group/[id]/index.tsx"   # every import resolves one level deeper
```

Fix the two test imports:
- `season-screens.test.tsx`: `import SeasonsScreen from "../../app/(app)/seasons";` → `"../../app/(app)/seasons/index"`.
- `groups-screens.test.tsx`: `"../../app/(app)/group/[id]"` → `"../../app/(app)/group/[id]/index"`.

Create the seven stubs. Each renders a heading only and never the placeholder message: they are detail routes, not `PLACEHOLDER_SCREENS` rows.

```tsx
// apps/mobile/app/(app)/seasons/[code]/index.tsx — replaced in Task 6
import { useLocalSearchParams } from "expo-router";

import { Screen, Text } from "../../../../src/ui";

export default function SeasonDetailScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  return (
    <Screen edges={["top", "left", "right"]}>
      <Text variant="heading">{`Season ${code}`}</Text>
    </Screen>
  );
}
```

The other six follow the same shape. Each has its own component name, heading and import depth:

| File | Component | Heading | `src` import |
|---|---|---|---|
| `seasons/[code]/edit.tsx` | `SeasonEditScreen` | `` `Edit season ${code}` `` | `../../../../src/ui` |
| `seasons/[code]/roster/index.tsx` | `SeasonRosterScreen` | `` `Roster ${code}` `` | `../../../../../src/ui` |
| `group/new.tsx` | `NewGroupScreen` | `"New group"` (no params) | `../../../src/ui` |
| `group/[id]/edit.tsx` | `EditGroupScreen` | `` `Edit group ${id}` `` (`{ id: string }`) | `../../../../src/ui` |
| `session/new.tsx` | `NewSessionScreen` | `"New session"` (no params) | `../../../src/ui` |
| `session/[id]/edit.tsx` | `EditSessionScreen` | `` `Edit session ${id}` `` (`{ id: string }`) | `../../../../src/ui` |

In `_layout.tsx`, replace `routeNameForHref` with:

```tsx
/**
 * Hrefs whose route is a directory (`x/index.tsx`) because the destination
 * has child routes (ruling X7): `students` (alumni, dropped) and `seasons`
 * (Plan 6's `seasons/[code]/…`). Without the mapping the tab bar looks for
 * a file named "seasons" and silently omits the tab.
 */
const DIRECTORY_ROUTE_HREFS = new Set(["students", "seasons"]);

export function routeNameForHref(href: string): string {
  const path = href.slice(1);
  return DIRECTORY_ROUTE_HREFS.has(path) ? `${path}/index` : path;
}
```

The set is named `DIRECTORY_ROUTE_HREFS` because Plan 10 Task 9 (adds
`"users"`) and Plan 17 Task 6 Step 0 use that name; they extend this set and
must keep `"seasons"` in it.

In `DETAIL_ROUTE_NAMES`, replace `"group/[id]"` with `"group/[id]/index"` and append `"seasons/[code]/index"`, `"seasons/[code]/edit"`, `"seasons/[code]/roster/index"`, `"group/new"`, `"group/[id]/edit"`, `"session/new"`, `"session/[id]/edit"`. Keep every other entry. No count changes (X9).

```bash
pnpm turbo routes:generate --filter=@space/mobile
cd apps/mobile && pnpm jest src/__tests__/app-layout.test.tsx src/__tests__/role-tabs.test.tsx src/__tests__/placeholder-screens.test.tsx
```

Expected: PASS.
- The disk-derived "every route file is declared" check sees exactly the new names.
- `ambiguousRouteSiblings()` stays empty: there is no `seasons.tsx`, `group/[id].tsx`, `seasons/[code].tsx` or `roster.tsx` beside a same-named directory.
- `routeNameForHref` resolves `seasons/index.tsx` on disk.

- [ ] **Step 4: Failing helper tests**

```tsx
// apps/mobile/src/__tests__/season-admin-foundation.test.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, renderHook, screen, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { z } from "zod";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn() } }));

import { apiClient } from "../lib/api-client";
import { apiErrorCode } from "../lib/api-error";
import { firstErrorByField } from "../lib/form-errors";
import { parsePositiveInt } from "../lib/params";
import { useStaffSeasonSelection } from "../hooks/use-season-selection";
import { SeasonSwitcher } from "../components/SeasonSwitcher";
import { renderWithProviders } from "./helpers/render";

const get = apiClient.get as jest.Mock;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const row = (id: number, startDate: string, status: "DRAFT" | "ACTIVE") => ({
  id, code: `s${id}`, title: `Season ${id}`, program: "TEST", year: 2099, status,
  startDate, endDate: "2099-12-31T00:00:00.000Z",
});

beforeEach(() => jest.clearAllMocks());

describe("apiErrorCode", () => {
  it("returns the envelope's code, or null when there is none", () => {
    const err = Object.assign(new Error("409"), {
      isAxiosError: true,
      response: { status: 409, data: { error: { code: "has_student_records", message: "m" } } },
    });
    expect(apiErrorCode(err)).toBe("has_student_records");
    expect(apiErrorCode(new Error("boom"))).toBeNull();
  });
});

describe("firstErrorByField", () => {
  it("keys each issue by its LAST path segment and keeps the first", () => {
    const schema = z.object({ title: z.string().min(2), start: z.object({ time: z.string().regex(/^\d\d:\d\d$/) }) });
    const parsed = schema.safeParse({ title: "x", start: { time: "8pm" } });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const errors = firstErrorByField(parsed.error);
      expect(Object.keys(errors).sort()).toEqual(["time", "title"]);
    }
  });
});

describe("parsePositiveInt", () => {
  it("accepts a positive integer string only", () => {
    expect(parsePositiveInt("7")).toBe(7);
    expect(parsePositiveInt(["8", "9"])).toBe(8);
    expect(parsePositiveInt("0")).toBeNull();
    expect(parsePositiveInt("7a")).toBeNull();
    expect(parsePositiveInt(undefined)).toBeNull();
  });
});

describe("useStaffSeasonSelection", () => {
  it("defaults to pickCurrentSeasonId, switches on request, and ignores an unknown id", async () => {
    get.mockResolvedValue({
      data: { data: { seasons: [row(8, "2099-09-01T00:00:00.000Z", "DRAFT"), row(7, "2099-02-01T00:00:00.000Z", "ACTIVE")] } },
    });
    const { result } = renderHook(() => useStaffSeasonSelection(true), { wrapper });
    await waitFor(() => expect(result.current.seasonId).toBe(7));
    act(() => result.current.setSeasonId(8));
    expect(result.current.seasonId).toBe(8);
    expect(result.current.season?.code).toBe("s8");
    act(() => result.current.setSeasonId(999));
    expect(result.current.seasonId).toBe(7);
  });

  it("fetches nothing when disabled", () => {
    const { result } = renderHook(() => useStaffSeasonSelection(false), { wrapper });
    expect(result.current).toMatchObject({ seasonId: null, isPending: false });
    expect(get).not.toHaveBeenCalled();
  });
});

describe("SeasonSwitcher", () => {
  it("renders one chip per season and reports a press", () => {
    const onSelect = jest.fn();
    renderWithProviders(
      <SeasonSwitcher
        seasons={[row(7, "2099-02-01T00:00:00.000Z", "ACTIVE"), row(8, "2099-09-01T00:00:00.000Z", "DRAFT")]}
        selectedId={7}
        onSelect={onSelect}
      />,
    );
    fireEvent.press(screen.getByText("Season 8"));
    expect(onSelect).toHaveBeenCalledWith(8);
  });

  it("renders nothing when there is nothing to switch between", () => {
    renderWithProviders(
      <SeasonSwitcher seasons={[row(7, "2099-02-01T00:00:00.000Z", "ACTIVE")]} selectedId={7} onSelect={jest.fn()} />,
    );
    expect(screen.queryByText("Season 7")).toBeNull();
  });
});
```

Run: `cd apps/mobile && pnpm jest src/__tests__/season-admin-foundation.test.tsx`. Expected: FAIL (modules missing).

- [ ] **Step 5: Implement.**

`src/lib/api-error.ts` — append:

```ts
/** The envelope's machine code (e.g. "has_student_records"), or null. Screens branch on this, never on message text. */
export function apiErrorCode(err: unknown): string | null {
  if (!axios.isAxiosError(err)) return null;
  const parsed = apiErrorBodySchema.safeParse(err.response?.data);
  return parsed.success ? parsed.data.error.code : null;
}
```

```ts
// apps/mobile/src/lib/form-errors.ts
import type { ZodError } from "zod";

/**
 * First message per field, keyed by the issue path's LAST segment
 * ("start.time" → "time"), for `Input`'s `error` prop. Forms validate
 * with the SAME shared schema the server uses (spec 02 §8), so a client
 * error and a server 400 can never disagree about what is valid.
 */
export function firstErrorByField(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[issue.path.length - 1] ?? "form");
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}
```

```ts
// apps/mobile/src/lib/params.ts
/** A route/search param that must be a positive integer id; null otherwise. */
export function parsePositiveInt(raw: string | string[] | undefined): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === undefined || !/^\d+$/.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}
```

```ts
// apps/mobile/src/hooks/use-season-selection.ts
import { useState } from "react";
import type { SeasonListItem } from "@space/shared";

import { pickCurrentSeasonId, useSeasons } from "./use-seasons";

export interface StaffSeasonSelection {
  seasons: SeasonListItem[];
  seasonId: number | null;
  season: SeasonListItem | null;
  setSeasonId: (id: number) => void;
  isPending: boolean;
  isError: boolean;
  refetch: () => void;
}

/**
 * v1's /admin/groups redirect target (v1 parity 2026-10-09, spec 05 R91; v1
 * src/app/admin/groups/page.tsx:25-40): the newest season by startDate, any status.
 */
export function pickNewestSeasonId(seasons: SeasonListItem[]): number | null {
  const latestFirst = [...seasons].sort((a, b) => (a.startDate < b.startDate ? 1 : a.startDate > b.startDate ? -1 : 0));
  return latestFirst[0]?.id ?? null;
}

/**
 * A staff screen's chosen season (Plan 6 D-16.16). The default is `pick`
 * (Plan 4's pickCurrentSeasonId unless the screen passes v1's own rule, e.g.
 * /groups passes pickNewestSeasonId), and `initialId` (a route param) wins
 * when it is in the list. The user may then pick any season the role-scoped
 * list holds. A picked id that is no longer in the list falls back to the default.
 * v1 parity 2026-10-09: the ADMIN calendar no longer uses this (R86).
 */
export function useStaffSeasonSelection(
  enabled: boolean,
  opts: { pick?: (seasons: SeasonListItem[]) => number | null; initialId?: number | null } = {},
): StaffSeasonSelection {
  const query = useSeasons(enabled);
  const [picked, setPicked] = useState<number | null>(opts.initialId ?? null);
  const seasons = query.data ?? [];
  const seasonId =
    picked !== null && seasons.some((s) => s.id === picked) ? picked : (opts.pick ?? pickCurrentSeasonId)(seasons);

  return {
    seasons,
    seasonId,
    season: seasons.find((s) => s.id === seasonId) ?? null,
    setSeasonId: setPicked,
    isPending: enabled && query.isPending,
    isError: enabled && query.isError,
    refetch: () => {
      if (enabled) void query.refetch();
    },
  };
}
```

```tsx
// apps/mobile/src/components/SeasonSwitcher.tsx
import { ScrollView } from "react-native";
import type { SeasonListItem } from "@space/shared";

import { useTheme } from "../theme";
import { Button } from "../ui";

export interface SeasonSwitcherProps {
  seasons: SeasonListItem[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}

/** Horizontal season chips. Renders nothing when there is only one season to show. */
export function SeasonSwitcher({ seasons, selectedId, onSelect }: SeasonSwitcherProps) {
  const theme = useTheme();
  if (seasons.length < 2) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: theme.spacing.sm, paddingBottom: theme.spacing.sm }}
    >
      {seasons.map((s) => (
        <Button
          key={s.id}
          title={s.title}
          variant={s.id === selectedId ? "primary" : "secondary"}
          onPress={() => onSelect(s.id)}
        />
      ))}
    </ScrollView>
  );
}
```

`src/lib/query-keys.ts`:
- add `import type { RecurrenceScope } from "@space/shared";` at the top;
- add `byCode: (code: string | null) => [...queryKeys.seasons.all, "byCode", { code }] as const,` to `seasons`;
- add these four entries to `sessions`:

```ts
    /** GET /sessions windows (D-16.7). Under lists(), so invalidating sessions.all refreshes them. */
    range: (params: { seasonId: number | null; from: string | null; to: string | null }) =>
      [...queryKeys.sessions.lists(), "range", params] as const,
    series: (id: number | null, scope: RecurrenceScope) =>
      [...queryKeys.sessions.all, "series", { id, scope }] as const,
    checkIn: (id: number | null) => [...queryKeys.sessions.all, "checkIn", { id }] as const,
    quizzes: (id: number | null) => [...queryKeys.sessions.all, "quizzes", { id }] as const,
```

- and these three to `groups` (Plan 5 already added `groups.bySeason`; reuse it):

```ts
    impact: (id: number | null) => [...queryKeys.groups.all, "impact", { id }] as const,
    leaderOptions: () => [...queryKeys.groups.all, "leaderOptions"] as const,
    /**
     * Under groups.all ON PURPOSE: every group write (create, edit, delete,
     * bulk assign) can change any roster row — GroupStudent is globally unique
     * (spec 05 R3) — so they all invalidate groups.all and this goes with it.
     */
    roster: (seasonId: number | null) => [...queryKeys.groups.all, "roster", { seasonId }] as const,
```

Run the foundation test → PASS. Run `pnpm turbo lint typecheck test:unit --filter=@space/mobile` → clean.

- [ ] **Step 6: Commit** — `git add apps/mobile && git commit -m "feat(mobile): season/group/session admin routes (directory form), keys, season switcher, form helpers"`

**Dispatch point.** Tasks 1 and 5 are committed. Start agents M1–M4 on Tasks 6–9 in parallel. The coordinator proceeds with Tasks 2 → 3 → 4.

---

### Task 6: Season screens — detail by code, SUPER edit, program filter *(agent M1)*

**Files (exclusive to M1):**
- Modify: `apps/mobile/src/hooks/use-seasons.ts` (append `useSeasonByCode`), `apps/mobile/src/hooks/use-season-writes.ts` (append `useUpdateSeasonAsSuper`, `SeasonIdentityInput`)
- Modify: `apps/mobile/app/(app)/seasons/index.tsx`
- Replace: `apps/mobile/app/(app)/seasons/[code]/index.tsx`, `apps/mobile/app/(app)/seasons/[code]/edit.tsx`
- Test: `apps/mobile/src/__tests__/season-detail-screens.test.tsx` (new), `apps/mobile/src/__tests__/season-screens.test.tsx` (append)
- *(v1 parity 2026-10-09, spec 02 R45/R47)* Create: `apps/mobile/app/(app)/seasons/program/[program].tsx` and `apps/mobile/app/(app)/seasons/year/[year].tsx`, both SUPER-only. Append both to `DETAIL_ROUTE_NAMES` (X9) and run `routes:generate`.

**Interfaces:**
- Consumes:
  - Task 1's `seasonDetailSchema`, `seasonWriteRequestSchema`, `seasonStatusSchema`, `slugifySeasonCode`;
  - Plan 4's `seasonRefResponseSchema`, `useDeleteSeason`, `apiErrorMessage`, `formatDayKey`;
  - Phase 0's `useSeasonSessions`; Plan 5's `formatWallTime`;
  - Task 5's `firstErrorByField`, `queryKeys.seasons.byCode`;
  - routes `/seasons/[code]/roster`, `/group/new`, `/session/new`, `/group/[id]`, `/session/[id]`, which exist as stubs.
- Produces: `useSeasonByCode(code: string | null): UseQueryResult<SeasonDetail>` (Plan 17 and Plan 16 use it); `useUpdateSeasonAsSuper(id)`; screens `/seasons/[code]` and `/seasons/[code]/edit`.

- [ ] **Step 1: Failing tests**

```tsx
// apps/mobile/src/__tests__/season-detail-screens.test.tsx
import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockParams: Record<string, string> = { code: "s7" };
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn() }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";
import SeasonDetailScreen from "../../app/(app)/seasons/[code]/index";
import SeasonEditScreen from "../../app/(app)/seasons/[code]/edit";

const get = apiClient.get as jest.Mock;
const patch = apiClient.patch as jest.Mock;
const del = apiClient.delete as jest.Mock;

const detail = (over: Record<string, unknown> = {}) => ({
  id: 7, code: "s7", title: "TEST 2099", program: "TEST", year: 2099, status: "DRAFT",
  startDate: "2099-01-01T00:00:00.000Z", endDate: "2099-12-31T00:00:00.000Z",
  description: "Spring.", sessionCount: 1, studentCount: 4,
  absenceBudgetMinutes: 240, absenceWeightMinutes: 90, canAdminister: true,
  groups: [{ id: 3, name: "Group A", studentCount: 4, leaderNames: ["Lina"] }],
  ...over,
});
const sessionRow = {
  id: 12, title: "Kickoff", startsAt: "2099-03-01T18:00:00.000Z", dayKey: "2099-03-01", startTime: "20:00",
  durationMinutes: 90, location: null, recurrenceGroupId: null, attendanceMarked: false,
  seasonId: 7, seasonCode: "s7", seasonTitle: "TEST 2099", checkInToken: null, checkInOpenAt: null, checkInClosedAt: null,
};

function routeGets(d: ReturnType<typeof detail>) {
  get.mockImplementation((url: string) => {
    if (url === "/api/v1/seasons/by-code/s7") return Promise.resolve({ data: { data: d } });
    if (url === "/api/v1/seasons/7/sessions") return Promise.resolve({ data: { data: { sessions: [sessionRow] } } });
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { code: "s7" };
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("SeasonDetailScreen (/seasons/[code])", () => {
  it("gives SUPER edit plus the admin workspace actions", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    routeGets(detail());
    renderWithProviders(<SeasonDetailScreen />);

    expect(await screen.findByText("TEST 2099")).toBeTruthy();
    expect(screen.getByText("s7 · DRAFT")).toBeTruthy();
    expect(screen.getByText("Jan 1, 2099 – Dec 31, 2099")).toBeTruthy();
    expect(await screen.findByText("Kickoff")).toBeTruthy();
    expect(screen.getByText("Mar 1, 2099 · 8:00 PM")).toBeTruthy();

    fireEvent.press(screen.getByText("Edit season"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/seasons/[code]/edit", params: { code: "s7" } });
    fireEvent.press(screen.getByText("Roster"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/seasons/[code]/roster", params: { code: "s7" } });
    fireEvent.press(screen.getByText("New group"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/group/new", params: { seasonId: "7" } });
    fireEvent.press(screen.getByText("New session"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/session/new", params: { seasonId: "7" } });
  });

  it("gives a season ADMIN the workspace but not the SUPER edit", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    routeGets(detail());
    renderWithProviders(<SeasonDetailScreen />);
    expect(await screen.findByText("Roster")).toBeTruthy();
    expect(screen.queryByText("Edit season")).toBeNull();
  });

  it("is read-only when the server says the caller does not administer the season (C4)", async () => {
    useSessionStore.setState(makeSession("LEADER", { groupLeaderIds: [3] }));
    routeGets(detail({ canAdminister: false }));
    renderWithProviders(<SeasonDetailScreen />);
    expect(await screen.findByText("TEST 2099")).toBeTruthy();
    expect(screen.queryByText("Roster")).toBeNull();
    expect(screen.queryByText("New session")).toBeNull();
  });

  it("opens a group and a session", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    routeGets(detail());
    renderWithProviders(<SeasonDetailScreen />);
    fireEvent.press(await screen.findByText("Group A"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/group/[id]", params: { id: "3" } });
    fireEvent.press(await screen.findByText("Kickoff"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/session/[id]", params: { id: "12" } });
  });
});

describe("SeasonEditScreen (/seasons/[code]/edit) — SUPER only", () => {
  it("saves identity AND status through the full-body PATCH, keeping the stored budgets, and follows a code change", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    routeGets(detail());
    patch.mockResolvedValue({ data: { data: { id: 7, code: "gbv-2099" } } });
    renderWithProviders(<SeasonEditScreen />);

    await screen.findByLabelText("Code");
    fireEvent.changeText(screen.getByLabelText("Code"), "GBV 2099");
    fireEvent.press(screen.getByText("ACTIVE"));
    fireEvent.press(screen.getByText("Save season"));

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/api/v1/seasons/7", {
        code: "GBV 2099",
        program: "TEST",
        year: 2099,
        description: "Spring.",
        startDate: "2099-01-01T00:00:00.000Z",
        endDate: "2099-12-31T00:00:00.000Z",
        status: "ACTIVE",
        absenceBudgetMinutes: 240,
        absenceWeightMinutes: 90,
      }),
    );
    expect(mockReplace).toHaveBeenCalledWith({ pathname: "/seasons/[code]", params: { code: "gbv-2099" } });
  });

  it("previews the slug and blocks an invalid code client-side with the server's own schema", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    routeGets(detail());
    renderWithProviders(<SeasonEditScreen />);
    await screen.findByLabelText("Code");
    fireEvent.changeText(screen.getByLabelText("Code"), "x");
    expect(screen.getByText("Saved as: x")).toBeTruthy();
    fireEvent.press(screen.getByText("Save season"));
    expect(screen.getByLabelText("Code").props.accessibilityHint).toMatch(/2–40/);
    expect(patch).not.toHaveBeenCalled();
  });

  it("deletes on a second press and shows season_in_use verbatim", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    routeGets(detail());
    del.mockRejectedValueOnce(
      Object.assign(new Error("409"), {
        isAxiosError: true,
        response: { status: 409, data: { error: { code: "season_in_use", message: "This season has sessions or enrollments; archive it instead." } } },
      }),
    );
    renderWithProviders(<SeasonEditScreen />);
    fireEvent.press(await screen.findByText("Delete season"));
    expect(del).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText("Really delete?"));
    await waitFor(() => expect(del).toHaveBeenCalledWith("/api/v1/seasons/7"));
    expect(await screen.findByText("This season has sessions or enrollments; archive it instead.")).toBeTruthy();

    del.mockResolvedValueOnce({ data: { data: { deleted: true } } });
    fireEvent.press(screen.getByText("Delete season"));
    fireEvent.press(screen.getByText("Really delete?"));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/seasons"));
  });

  it("refuses a non-SUPER without fetching", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    renderWithProviders(<SeasonEditScreen />);
    expect(await screen.findByText("Only a super admin can edit a season's identity.")).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  });
});
```

Append to Plan 4's `season-screens.test.tsx`:

```tsx
describe("SeasonsScreen — navigation and program filter (Plan 6, G20)", () => {
  beforeEach(() => {
    useSessionStore.setState(superSession);
    get.mockResolvedValue({
      data: { data: { seasons: [
        seasonRow(8, 2027, "DRAFT", "Spring 2027"),
        { ...seasonRow(9, 2027, "ACTIVE", "GBV 2027"), program: "GBV" },
      ] } },
    });
  });

  it("opens a season by code", async () => {
    renderWithProviders(<SeasonsScreen />);
    fireEvent.press(await screen.findByText("Spring 2027"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/seasons/[code]", params: { code: "s8" } });
  });

  it("filters by program with exact matching (v1 R44), client-side (D-16.5)", async () => {
    renderWithProviders(<SeasonsScreen />);
    await screen.findByText("Spring 2027");
    fireEvent.press(screen.getByText("GBV"));
    expect(screen.queryByText("Spring 2027")).toBeNull();
    expect(screen.getByText("GBV 2027")).toBeTruthy();
    fireEvent.press(screen.getByText("All programs"));
    expect(screen.getByText("Spring 2027")).toBeTruthy();
    expect(get).toHaveBeenCalledTimes(1);
  });
});
```

Run: `cd apps/mobile && pnpm jest src/__tests__/season-detail-screens.test.tsx src/__tests__/season-screens.test.tsx`. Expected: FAIL.

> **v1 parity 2026-10-09:** Replace the "filters by program" case with v1's grouping. Three cases are needed. (1) `/seasons` renders program headings in `localeCompare` order, with each program's seasons `year` desc, and has no "All programs" control. Pressing a program heading pushes `/seasons/program/[program]` (v1 `src/components/seasons/seasons-list.tsx:112-123`, spec 02 R43). (2) The by-program screen lists only the exact-match program (`"GBV"` ≠ `"gbv"`, v1 R44), `year` desc, and shows a not-found state for a program with no seasons (v1 `src/app/super/seasons/program/[program]/page.tsx:27,40`). (3) The by-year screen lists that year's seasons regrouped by program, `program` asc. It shows not-found for a year with no seasons or a non-integer year (v1 `.../year/[year]/page.tsx:24,27,41`). Spec 02 R45, R47.

- [ ] **Step 2: Hooks.** Append to `src/hooks/use-seasons.ts`:

```ts
/**
 * A season by its code (GET /seasons/by-code/:code, spec 02 §7). The query is
 * keyed by code because that is the screen's address; children then use the
 * resolved `id` for every id-addressed endpoint (spec 02 D8).
 */
export function useSeasonByCode(code: string | null): UseQueryResult<SeasonDetail> {
  return useQuery({
    queryKey: queryKeys.seasons.byCode(code),
    queryFn: async () => {
      if (code === null) throw new Error("useSeasonByCode ran without a code");
      const res = await apiClient.get(`/api/v1/seasons/by-code/${encodeURIComponent(code)}`);
      return seasonDetailSchema.parse(res.data.data);
    },
    enabled: code !== null,
  });
}
```

Append to `src/hooks/use-season-writes.ts` (add `seasonWriteRequestSchema` to its `@space/shared` import, plus `import type { z } from "zod";`):

```ts
/** SUPER's full-body PATCH input (Plan 3: whole SeasonWriteRequest, title re-derived). */
export type SeasonIdentityInput = z.input<typeof seasonWriteRequestSchema>;

export function useUpdateSeasonAsSuper(id: number) {
  const invalidate = useInvalidateSeasons();
  return useMutation({
    mutationFn: async (body: SeasonIdentityInput) => {
      const res = await apiClient.patch(`/api/v1/seasons/${id}`, body);
      return seasonRefResponseSchema.parse(res.data.data);
    },
    onSuccess: invalidate,
  });
}
```

- [ ] **Step 3: `seasons/index.tsx`.** Make three edits to the moved Plan 4 file:
1. Add `import { useRouter } from "expo-router";`.
2. In `SeasonRow`, add `const router = useRouter();` and give its outer `Card` an `onPress`. The buttons inside keep their own handlers, so the nearest handler wins:

```tsx
    <Card
      style={{ marginTop: theme.spacing.sm }}
      onPress={() => router.push({ pathname: "/seasons/[code]", params: { code: season.code } })}
    >
```

3. Add the filter component above `SeasonsScreen`:

```tsx
/**
 * Program filter (G20; spec 02 §9 — "filters, not routes"). Client-side over
 * the role-scoped list already loaded (Plan 6 D-16.5). Exact string match,
 * v1 R44: "GBV" and "gbv" are different programs.
 */
function ProgramFilter({
  programs,
  value,
  onChange,
}: {
  programs: string[];
  value: string | null;
  onChange: (program: string | null) => void;
}) {
  const theme = useTheme();
  if (programs.length < 2) return null;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm, marginBottom: theme.spacing.md }}>
      <Button title="All programs" variant={value === null ? "primary" : "secondary"} onPress={() => onChange(null)} />
      {programs.map((p) => (
        <Button key={p} title={p} variant={value === p ? "primary" : "secondary"} onPress={() => onChange(p)} />
      ))}
    </View>
  );
}
```

In `SeasonsScreen`, add `const [program, setProgram] = useState<string | null>(null);` and replace the `years` line with:

```tsx
  const programs = seasons.data
    ? Array.from(new Set(seasons.data.map((s) => s.program))).sort((a, b) => a.localeCompare(b))
    : [];
  const visible = seasons.data ? seasons.data.filter((s) => program === null || s.program === program) : [];
  const years = Array.from(new Set(visible.map((s) => s.year)));
```

In the success branch, render `<ProgramFilter programs={programs} value={program} onChange={setProgram} />` before the year groups, and iterate `visible` instead of `seasons.data` in the year filter.

> **v1 parity 2026-10-09:** Edit 3 is reverted. Drop `ProgramFilter`, the `program` state and the year headings, now `apps/mobile/app/(app)/seasons/index.tsx:170-236`. Instead, group the list into program sections: a `Map` keyed by `program`, sections sorted `a.program.localeCompare(b.program)`, rows sorted `b.year - a.year`. Each section heading presses to `/seasons/program/[program]`. This matches v1 `src/components/seasons/seasons-list.tsx:112-123` (spec 02 R43). Extract that grouping as a shared helper. The new `seasons/program/[program].tsx` (exact `===` match, year desc) and `seasons/year/[year].tsx` (`Number.isInteger` check, program asc, regrouped with the same helper) both use it over `useSeasons`. Each shows `EmptyState` "Not found" when its filter matches nothing (v1 `program/[program]/page.tsx:27,40`; `year/[year]/page.tsx:24,27,41`; spec 02 R45, R47).

- [ ] **Step 4: `seasons/[code]/index.tsx`** (replace the stub):

```tsx
import type { ReactNode } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { SeasonDetail } from "@space/shared";

import { useSeasonByCode } from "../../../../src/hooks/use-seasons";
import { useSeasonSessions } from "../../../../src/hooks/use-sessions";
import { formatDayKey, formatWallTime } from "../../../../src/lib/format";
import { useSessionStore } from "../../../../src/store/session";
import { useTheme } from "../../../../src/theme";
import { Button, Card, EmptyState, ErrorState, LoadingState, Screen, Text } from "../../../../src/ui";

/**
 * Season dates are timezone-naive calendar days stored as UTC midnight (spec
 * 02 D12); the ISO date part IS the day. Formatting the instant in the
 * device zone would show Dec 31 west of UTC.
 */
const seasonDay = (iso: string) => formatDayKey(iso.slice(0, 10));

function Actions({ season, isSuper }: { season: SeasonDetail; isSuper: boolean }) {
  const theme = useTheme();
  const router = useRouter();
  if (!isSuper && !season.canAdminister) return null;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm, marginTop: theme.spacing.md }}>
      {isSuper ? (
        <Button
          title="Edit season"
          variant="secondary"
          onPress={() => router.push({ pathname: "/seasons/[code]/edit", params: { code: season.code } })}
        />
      ) : null}
      {season.canAdminister ? (
        <>
          <Button
            title="Roster"
            variant="secondary"
            onPress={() => router.push({ pathname: "/seasons/[code]/roster", params: { code: season.code } })}
          />
          <Button
            title="New group"
            variant="secondary"
            onPress={() => router.push({ pathname: "/group/new", params: { seasonId: String(season.id) } })}
          />
          <Button
            title="New session"
            variant="secondary"
            onPress={() => router.push({ pathname: "/session/new", params: { seasonId: String(season.id) } })}
          />
        </>
      ) : null}
    </View>
  );
}

function SessionsCard({ seasonId }: { seasonId: number }) {
  const theme = useTheme();
  const router = useRouter();
  const sessions = useSeasonSessions(seasonId);
  let body: ReactNode;
  if (sessions.isPending) body = <LoadingState />;
  else if (sessions.isError) body = <ErrorState message="Couldn't load sessions." onRetry={() => void sessions.refetch()} />;
  else if (sessions.data.length === 0) body = <Text variant="body" color={theme.colors.neutral[600]}>No sessions yet.</Text>;
  else
    body = sessions.data.map((s) => (
      <Card
        key={s.id}
        style={{ marginTop: theme.spacing.sm }}
        onPress={() => router.push({ pathname: "/session/[id]", params: { id: String(s.id) } })}
      >
        <Text variant="body">{s.title}</Text>
        {/* Server-derived org day and time (X13) — never the device's reading of startsAt. */}
        <Text variant="label" color={theme.colors.neutral[600]}>{`${formatDayKey(s.dayKey)} · ${formatWallTime(s.startTime)}`}</Text>
      </Card>
    ));
  return (
    <Card style={{ marginTop: theme.spacing.md }}>
      <Text variant="heading">Sessions</Text>
      {body}
    </Card>
  );
}

/**
 * /seasons/[code] — any season, any role that may see it (spec 02 §9; G4).
 * One screen, role branches by data: SUPER gets Edit; whoever the server
 * says administers the season (canAdminister, C4) gets the workspace; others
 * read. Groups come pre-narrowed by the server for students.
 */
export default function SeasonDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { code: raw } = useLocalSearchParams<{ code: string }>();
  const code = typeof raw === "string" && raw.length > 0 ? raw : null;
  const isSuper = useSessionStore((s) => s.user?.role === "SUPER");
  const detail = useSeasonByCode(code);

  let body: ReactNode;
  if (code === null) body = <EmptyState title="Not found" message="That season link isn't valid." />;
  else if (detail.isPending) body = <LoadingState />;
  else if (detail.isError)
    body = <ErrorState message="Couldn't load this season." onRetry={() => void detail.refetch()} />;
  else {
    const s = detail.data;
    body = (
      <>
        <Card>
          <Text variant="title">{s.title}</Text>
          <Text variant="label" color={theme.colors.neutral[600]}>{`${s.code} · ${s.status}`}</Text>
          <Text variant="label" color={theme.colors.neutral[600]}>{`${seasonDay(s.startDate)} – ${seasonDay(s.endDate)}`}</Text>
          {s.description ? <Text variant="body">{s.description}</Text> : null}
          <Text variant="label">{`${s.sessionCount} sessions · ${s.studentCount} students`}</Text>
        </Card>
        <Actions season={s} isSuper={isSuper} />
        <Card style={{ marginTop: theme.spacing.md }}>
          <Text variant="heading">Groups</Text>
          {s.groups.length === 0 ? (
            <Text variant="body" color={theme.colors.neutral[600]}>No groups yet.</Text>
          ) : (
            s.groups.map((g) => (
              <Card
                key={g.id}
                style={{ marginTop: theme.spacing.sm }}
                onPress={() => router.push({ pathname: "/group/[id]", params: { id: String(g.id) } })}
              >
                <Text variant="body">{g.name}</Text>
                <Text variant="caption" color={theme.colors.neutral[600]}>
                  {g.leaderNames.length > 0 ? `${g.studentCount} students · ${g.leaderNames.join(", ")}` : `${g.studentCount} students`}
                </Text>
              </Card>
            ))
          )}
        </Card>
        <SessionsCard seasonId={s.id} />
      </>
    );
  }

  return (
    <Screen
      edges={["top", "left", "right"]}
      scroll
      onRefresh={() => {
        if (code !== null) void detail.refetch();
      }}
      refreshing={detail.isRefetching}
    >
      {body}
    </Screen>
  );
}
```

- [ ] **Step 5: `seasons/[code]/edit.tsx`** (replace the stub):

```tsx
import { useState, type ReactNode } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  seasonStatusSchema,
  seasonWriteRequestSchema,
  slugifySeasonCode,
  type SeasonDetail,
  type SeasonStatus,
} from "@space/shared";

import { useSeasonByCode } from "../../../../src/hooks/use-seasons";
import { useDeleteSeason, useUpdateSeasonAsSuper } from "../../../../src/hooks/use-season-writes";
import { apiErrorMessage } from "../../../../src/lib/api-error";
import { firstErrorByField } from "../../../../src/lib/form-errors";
import { useSessionStore } from "../../../../src/store/session";
import { useTheme } from "../../../../src/theme";
import { Button, Card, EmptyState, ErrorState, Input, LoadingState, Screen, Text } from "../../../../src/ui";

/**
 * SUPER's season edit (v1 /super/seasons/[code]/edit; spec 02 §9; G4). Every
 * identity field AND the status — v1's free four-way select (R17, Plan 6
 * D-16.4): DRAFT → ACTIVE → ARCHIVED is one tap each. Also hosts delete
 * (spec 02 §9). The PATCH is Plan 3's SUPER full body, so the stored budget
 * values are pre-filled and always sent (D-16.3).
 */
function SeasonEditForm({ season }: { season: SeasonDetail }) {
  const theme = useTheme();
  const router = useRouter();
  const update = useUpdateSeasonAsSuper(season.id);
  const remove = useDeleteSeason();

  const [code, setCode] = useState(season.code);
  const [program, setProgram] = useState(season.program);
  const [year, setYear] = useState(String(season.year));
  const [description, setDescription] = useState(season.description ?? "");
  // Season dates are calendar days stored as UTC midnight (spec 02 D12).
  const [startDay, setStartDay] = useState(season.startDate.slice(0, 10));
  const [endDay, setEndDay] = useState(season.endDate.slice(0, 10));
  const [status, setStatus] = useState<SeasonStatus>(season.status);
  const [budget, setBudget] = useState(String(season.absenceBudgetMinutes));
  const [weight, setWeight] = useState(String(season.absenceWeightMinutes));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);

  const body = () => ({
    code,
    program,
    year: Number(year),
    description: description.trim() === "" ? null : description,
    startDate: `${startDay}T00:00:00.000Z`,
    endDate: `${endDay}T00:00:00.000Z`,
    status,
    absenceBudgetMinutes: Number(budget),
    absenceWeightMinutes: Number(weight),
  });

  const save = () => {
    setMessage(null);
    // The server's own schema (spec 02 §8): slug rules, bounds, date order.
    const parsed = seasonWriteRequestSchema.safeParse(body());
    if (!parsed.success) {
      setErrors(firstErrorByField(parsed.error));
      return;
    }
    setErrors({});
    update.mutate(body(), {
      // The code may have changed — every URL addressing the season moves (spec 02 D8).
      onSuccess: (ref) => router.replace({ pathname: "/seasons/[code]", params: { code: ref.code } }),
      onError: (err) => setMessage(apiErrorMessage(err, "Couldn't save the season.")),
    });
  };

  const onDelete = () => {
    if (!armed) {
      setArmed(true);
      return;
    }
    setMessage(null);
    remove.mutate(season.id, {
      onSuccess: () => router.replace("/seasons"),
      onError: (err) => {
        setArmed(false);
        setMessage(apiErrorMessage(err, "Couldn't delete the season."));
      },
    });
  };

  return (
    <>
      <Card style={{ gap: theme.spacing.sm }}>
        <Text variant="heading">{`Edit ${season.title}`}</Text>
        <Input label="Code" value={code} onChangeText={setCode} autoCapitalize="none" error={errors.code} />
        <Text variant="caption" color={theme.colors.neutral[600]}>
          {`Saved as: ${slugifySeasonCode(code || `${program} ${year}`)}`}
        </Text>
        <Input label="Program" value={program} onChangeText={setProgram} error={errors.program} />
        <Input label="Year" value={year} onChangeText={setYear} keyboardType="number-pad" error={errors.year} />
        <Input label="Description" value={description} onChangeText={setDescription} multiline error={errors.description} />
        <Input label="Start date (YYYY-MM-DD)" value={startDay} onChangeText={setStartDay} autoCapitalize="none" error={errors.startDate} />
        <Input label="End date (YYYY-MM-DD)" value={endDay} onChangeText={setEndDay} autoCapitalize="none" error={errors.endDate} />
        <Input label="Absence budget (minutes)" value={budget} onChangeText={setBudget} keyboardType="number-pad" error={errors.absenceBudgetMinutes} />
        <Input label="Absence weight (minutes)" value={weight} onChangeText={setWeight} keyboardType="number-pad" error={errors.absenceWeightMinutes} />
        <Text variant="label">Status</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
          {seasonStatusSchema.options.map((s) => (
            <Button key={s} title={s} variant={status === s ? "primary" : "secondary"} onPress={() => setStatus(s)} />
          ))}
        </View>
        {message ? <Text variant="label" color={theme.colors.error[500]}>{message}</Text> : null}
        <Button title="Save season" onPress={save} loading={update.isPending} />
      </Card>
      <Card style={{ marginTop: theme.spacing.md, gap: theme.spacing.sm }}>
        <Text variant="heading">Delete</Text>
        <Text variant="caption" color={theme.colors.neutral[600]}>
          A season with sessions or enrollments can't be deleted — archive it instead.
        </Text>
        <Button title={armed ? "Really delete?" : "Delete season"} variant="ghost" onPress={onDelete} loading={remove.isPending} />
      </Card>
    </>
  );
}

export default function SeasonEditScreen() {
  const { code: raw } = useLocalSearchParams<{ code: string }>();
  const isSuper = useSessionStore((s) => s.user?.role === "SUPER");
  const code = isSuper && typeof raw === "string" && raw.length > 0 ? raw : null;
  const detail = useSeasonByCode(code);

  let body: ReactNode;
  if (!isSuper) {
    body = <EmptyState title="Not available" message="Only a super admin can edit a season's identity." />;
  } else if (code === null) {
    body = <EmptyState title="Not found" message="That season link isn't valid." />;
  } else if (detail.isPending) {
    body = <LoadingState />;
  } else if (detail.isError) {
    body = <ErrorState message="Couldn't load this season." onRetry={() => void detail.refetch()} />;
  } else {
    // key: a refetch after save must not keep the old form state.
    body = <SeasonEditForm key={`${detail.data.id}-${detail.data.code}`} season={detail.data} />;
  }

  return (
    <Screen edges={["top", "left", "right"]} scroll>
      {body}
    </Screen>
  );
}
```

- [ ] **Step 6: Run.**
- `cd apps/mobile && pnpm jest src/__tests__/season-detail-screens.test.tsx src/__tests__/season-screens.test.tsx` → PASS. Plan 4's season-screens cases stay green.
- `pnpm turbo lint typecheck --filter=@space/mobile` → clean. Typed routes check every `pathname` above.

- [ ] **Step 7: Commit** — `git add apps/mobile && git commit -m "feat(mobile): season detail by code, SUPER identity/status edit with delete, program filter"`

---
### Task 7: Session screens — create, edit/delete with scope and preview, console upgrades, quiz card *(agent M2)*

**Files (exclusive to M2):**
- Create: `apps/mobile/src/hooks/use-session-writes.ts`, `apps/mobile/src/hooks/use-check-in.ts`, `apps/mobile/src/hooks/use-session-quizzes.ts`
- Create: `apps/mobile/src/components/SessionForm.tsx`, `apps/mobile/src/components/SessionQuizzesCard.tsx`
- Replace: `apps/mobile/app/(app)/session/new.tsx`, `apps/mobile/app/(app)/session/[id]/edit.tsx`, `apps/mobile/app/(app)/session/[id]/index.tsx`
- Replace: `apps/mobile/src/__tests__/session-detail.test.tsx` (Plan 4's cases are kept and adapted, and new ones added)
- Test: `apps/mobile/src/__tests__/session-forms.test.tsx` (new)

**Interfaces:**
- Consumes:
  - Task 1's `createSessionRequestSchema`, `updateSessionRequestSchema`, `CreateSessionInput`, `UpdateSessionInput`, `RecurrenceScope`, `sessionCreatedResponseSchema`, `sessionUpdatedResponseSchema`, `sessionDeletedResponseSchema`, `sessionSeriesResponseSchema`, `checkInStateSchema`, `sessionQuizItemSchema`;
  - Plan 4's `useSessionDetail`, `useOpenCheckIn`, `useCloseCheckIn`, `checkInOpenResponseSchema`, `LIVE_ROSTER_REFRESH_MS` behaviour, `apiErrorMessage`, `formatDayKey`;
  - Plan 2's `useAttendanceRoster`; Plan 5's `formatWallTime`;
  - Task 5's `apiErrorCode`, `firstErrorByField`, `parsePositiveInt`, `queryKeys.sessions.{series,checkIn,quizzes}`.
- Produces:
  - Session writes: `useCreateSession()`, `useUpdateSession(id)`, `useDeleteSession(id)`, `useSessionSeries(id, scope, enabled)`.
  - Check-in: `useCheckInState(id, enabled)`, `useRegenerateCheckIn(id)`.
  - Quizzes: `useSessionQuizzes(id, enabled)`; `SessionQuizzesCard` (Plan 8 adds its row press).
  - Form pieces: `SessionFields`, `ScopeSelector`, `SessionFormValues`, `emptySessionValues`, `sessionWriteFields`, `SCOPE_LABELS`.
  - Screens: `/session/new?seasonId=`, `/session/[id]/edit`.

- [ ] **Step 1: Failing tests — session detail.** Replace `apps/mobile/src/__tests__/session-detail.test.tsx` with the file below. Plan 4's five cases are kept, with two adaptations:
- `routeGets` serves the two new endpoints;
- the "already-open" case reads its token from `GET /check-in`, not the season list (D-16.9).

```tsx
// apps/mobile/src/__tests__/session-detail.test.tsx
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn(), post: jest.fn() } }));
jest.mock("react-native-qrcode-svg", () => "QRCode");
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "12" }),
  useRouter: () => ({ push: mockPush }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";
import SessionDetailScreen from "../../app/(app)/session/[id]/index";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;

const baseDetail = {
  id: 12, title: "Week 3", description: "Bring your notebook.",
  startsAt: "2099-03-15T18:00:00.000Z", dayKey: "2099-03-15", startTime: "20:00",
  durationMinutes: 90, location: "Hall B", youtubeUrl: null, recurrenceGroupId: null,
  seasonId: 7, seasonCode: "s7", seasonTitle: "Spring",
  checkInOpen: false, myAttendance: null, canMarkAttendance: false, canManageCheckIn: false,
};

const checkInState = (over: Record<string, unknown> = {}) => ({
  state: "not_open", isOpen: false, checkInToken: null, checkInOpenAt: null,
  checkInClosedAt: null, expiresAt: null, expiresAtTime: null, ...over,
});

interface RouteState {
  detail: typeof baseDetail;
  checkIn?: ReturnType<typeof checkInState>;
  roster?: unknown[];
  quizzes?: unknown[];
}

const ok = (data: unknown) => Promise.resolve({ data: { data } });

/** Routes GETs by URL; state is read at call time so a test can change it mid-flight. */
function routeGets(state: RouteState) {
  get.mockImplementation((url: string) => {
    if (url === "/api/v1/sessions/12") return ok(state.detail);
    if (url === "/api/v1/sessions/12/check-in") return ok(state.checkIn ?? checkInState());
    if (url === "/api/v1/sessions/12/attendance") return ok({ roster: state.roster ?? [] });
    if (url === "/api/v1/sessions/12/quizzes") return ok({ quizzes: state.quizzes ?? [] });
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

const admin = () => makeSession("ADMIN", { seasonAdminIds: [7] }, { id: 2 });
const leader = () => makeSession("LEADER", { groupLeaderIds: [3] }, { id: 5 });

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

it("shows a student the org-time header and their attendance, and no staff cards (C4)", async () => {
  useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }, { id: 9 }));
  routeGets({
    detail: { ...baseDetail, myAttendance: { status: "LATE", notes: null, lateMinutes: 10, checkedInAt: null } },
  });

  renderWithProviders(<SessionDetailScreen />);

  expect(await screen.findByText("Week 3")).toBeTruthy();
  // Server-derived day and wall-clock time (X13) — not the device's reading of startsAt.
  expect(screen.getByText("Mar 15, 2099 · 8:00 PM · 90 min")).toBeTruthy();
  expect(screen.getByText("Your attendance: Late (10 min)")).toBeTruthy();
  expect(screen.queryByText("Check-in")).toBeNull();
  expect(screen.queryByText("Edit session")).toBeNull();
  expect(screen.queryByText("Mark attendance")).toBeNull();
  expect(get).not.toHaveBeenCalledWith("/api/v1/sessions/12/quizzes");
});

it("lets a season admin open check-in and shows the QR from the open response", async () => {
  useSessionStore.setState(admin());
  const state: RouteState = { detail: { ...baseDetail, canMarkAttendance: true, canManageCheckIn: true } };
  routeGets(state);
  post.mockImplementation((url: string) => {
    if (url === "/api/v1/sessions/12/check-in-open") {
      state.detail = { ...state.detail, checkInOpen: true };
      return ok({ checkInToken: "tok123" });
    }
    return Promise.reject(new Error(`unexpected POST ${url}`));
  });

  renderWithProviders(<SessionDetailScreen />);

  fireEvent.press(await screen.findByText("Open check-in"));
  await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/sessions/12/check-in-open"));
  expect(await screen.findByText("Code: tok123")).toBeTruthy();
  expect(await screen.findByText("Close check-in")).toBeTruthy();
});

it("recovers an open session's QR from GET /check-in — not the season-wide list (D-16.9)", async () => {
  useSessionStore.setState(admin());
  routeGets({
    detail: { ...baseDetail, checkInOpen: true, canMarkAttendance: true, canManageCheckIn: true },
    checkIn: checkInState({ state: "open", isOpen: true, checkInToken: "tokABC", expiresAtTime: "23:00" }),
  });
  post.mockResolvedValue({ data: { data: { closed: true } } });

  renderWithProviders(<SessionDetailScreen />);

  expect(await screen.findByText("Code: tokABC")).toBeTruthy();
  expect(screen.getByText("Closes at 11:00 PM")).toBeTruthy();
  expect(get).not.toHaveBeenCalledWith("/api/v1/seasons/7/sessions");
  fireEvent.press(screen.getByText("Close check-in"));
  await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/sessions/12/check-in-close"));

  fireEvent.press(screen.getByText("Mark attendance"));
  expect(mockPush).toHaveBeenCalledWith({ pathname: "/session/[id]/attendance", params: { id: "12" } });
});

it("regenerates an OPEN session's code only on a confirming second press (spec 03 §10 item 9)", async () => {
  useSessionStore.setState(admin());
  const state: RouteState = {
    detail: { ...baseDetail, checkInOpen: true, canMarkAttendance: true, canManageCheckIn: true },
    checkIn: checkInState({ state: "open", isOpen: true, checkInToken: "tokOLD" }),
  };
  routeGets(state);
  post.mockImplementation((url: string) => {
    if (url === "/api/v1/sessions/12/check-in-regenerate") {
      state.checkIn = checkInState({ state: "open", isOpen: true, checkInToken: "tokNEW" });
      return ok({ checkInToken: "tokNEW" });
    }
    return Promise.reject(new Error(`unexpected POST ${url}`));
  });

  renderWithProviders(<SessionDetailScreen />);

  fireEvent.press(await screen.findByText("Regenerate code"));
  expect(post).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText("Replace the code? The current one stops working."));
  await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/sessions/12/check-in-regenerate"));
  expect(await screen.findByText("Code: tokNEW")).toBeTruthy();
});

it("gives a season admin Edit session", async () => {
  useSessionStore.setState(admin());
  routeGets({ detail: { ...baseDetail, canMarkAttendance: true, canManageCheckIn: true } });
  renderWithProviders(<SessionDetailScreen />);
  fireEvent.press(await screen.findByText("Edit session"));
  expect(mockPush).toHaveBeenCalledWith({ pathname: "/session/[id]/edit", params: { id: "12" } });
});

it("gives a leader a read-only live roster — no open/close/regenerate/edit (spec 04 §9 row 2)", async () => {
  useSessionStore.setState(leader());
  routeGets({
    detail: { ...baseDetail, checkInOpen: true, canMarkAttendance: true, canManageCheckIn: false },
    roster: [
      { studentUserId: 21, name: "Sara Student", email: "sara@jpc.test", groupName: "Group A", status: "PRESENT", notes: null, lateMinutes: null },
      { studentUserId: 22, name: "Omar Student", email: "omar@jpc.test", groupName: "Group A", status: null, notes: null, lateMinutes: null },
    ],
  });

  renderWithProviders(<SessionDetailScreen />);

  expect(await screen.findByText("Sara Student")).toBeTruthy();
  expect(screen.getByText("Check-in is open")).toBeTruthy();
  expect(screen.getByText("Present")).toBeTruthy();
  expect(screen.getByText("Not checked in")).toBeTruthy();
  for (const label of ["Open check-in", "Close check-in", "Regenerate code", "Edit session"]) {
    expect(screen.queryByText(label)).toBeNull();
  }
  expect(screen.queryByText(/Code:/)).toBeNull();
  // The leader never asks for the token in any form.
  expect(get).not.toHaveBeenCalledWith("/api/v1/sessions/12/check-in");
  expect(get).not.toHaveBeenCalledWith("/api/v1/seasons/7/sessions");
  expect(screen.getByText("Mark attendance")).toBeTruthy();
});

it("refreshes the leader's roster every 10 seconds while check-in is open", async () => {
  jest.useFakeTimers();
  try {
    useSessionStore.setState(leader());
    routeGets({ detail: { ...baseDetail, checkInOpen: true, canMarkAttendance: true, canManageCheckIn: false }, roster: [] });
    const rosterCalls = () => get.mock.calls.filter(([url]) => url === "/api/v1/sessions/12/attendance").length;

    renderWithProviders(<SessionDetailScreen />);
    expect(await screen.findByText("Check-in is open")).toBeTruthy();
    await waitFor(() => expect(rosterCalls()).toBe(1));

    await act(async () => {
      jest.advanceTimersByTime(10_000);
    });
    await waitFor(() => expect(rosterCalls()).toBe(2));
  } finally {
    jest.useRealTimers();
  }
});

it("shows staff the session's quizzes (G18; v1 leader/sessions/[id])", async () => {
  useSessionStore.setState(leader());
  routeGets({
    detail: { ...baseDetail, canMarkAttendance: true, canManageCheckIn: false },
    quizzes: [
      { id: 40, title: "Paper quiz", kind: "PAPER", maxScore: 20, questionCount: 0, publishedAt: null },
      { id: 41, title: "Online quiz", kind: "ONLINE", maxScore: 10, questionCount: 4, publishedAt: null },
    ],
  });
  renderWithProviders(<SessionDetailScreen />);
  expect(await screen.findByText("Quizzes")).toBeTruthy();
  expect(screen.getByText("Paper quiz")).toBeTruthy();
  expect(screen.getByText("Max score: 20")).toBeTruthy();
  expect(screen.getByText("Max score: 10 · Draft")).toBeTruthy();
});

it("hides the quiz card when the session has none", async () => {
  useSessionStore.setState(leader());
  routeGets({ detail: { ...baseDetail, canMarkAttendance: true, canManageCheckIn: false }, quizzes: [] });
  renderWithProviders(<SessionDetailScreen />);
  expect(await screen.findByText("Week 3")).toBeTruthy();
  await waitFor(() => expect(get).toHaveBeenCalledWith("/api/v1/sessions/12/quizzes"));
  expect(screen.queryByText("Quizzes")).toBeNull();
});
```

- [ ] **Step 2: Failing tests — session forms**

```tsx
// apps/mobile/src/__tests__/session-forms.test.tsx
import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
const mockReplace = jest.fn();
const mockBack = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ push: jest.fn(), replace: mockReplace, back: mockBack }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";
import NewSessionScreen from "../../app/(app)/session/new";
import EditSessionScreen from "../../app/(app)/session/[id]/edit";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;
const patch = apiClient.patch as jest.Mock;
const del = apiClient.delete as jest.Mock;

const detail = (over: Record<string, unknown> = {}) => ({
  id: 12, title: "Week 3", description: null,
  startsAt: "2099-03-15T18:00:00.000Z", dayKey: "2099-03-15", startTime: "20:00",
  durationMinutes: 90, location: "Hall B", youtubeUrl: null, recurrenceGroupId: "rg1",
  seasonId: 7, seasonCode: "s7", seasonTitle: "Spring",
  checkInOpen: false, myAttendance: null, canMarkAttendance: true, canManageCheckIn: true,
  ...over,
});
const seriesItem = (id: number, dayKey: string, attendanceCount: number, isAnchor = false) => ({
  id, title: "Week 3", startsAt: `${dayKey}T18:00:00.000Z`, dayKey, startTime: "20:00", isAnchor, attendanceCount,
});
const conflict = (code: string, message: string) =>
  Object.assign(new Error("409"), { isAxiosError: true, response: { status: 409, data: { error: { code, message } } } });

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
});

describe("NewSessionScreen (/session/new?seasonId=)", () => {
  beforeEach(() => {
    mockParams = { seasonId: "7" };
  });

  it("sends org wall-clock fields — never a device-composed instant (X13, D-16.6)", async () => {
    post.mockResolvedValue({ data: { data: { id: 55, recurrenceGroupId: "rgX" } } });
    renderWithProviders(<NewSessionScreen />);

    fireEvent.changeText(screen.getByLabelText("Title"), "Kickoff");
    fireEvent.changeText(screen.getByLabelText("Day (YYYY-MM-DD)"), "2099-07-03");
    fireEvent.changeText(screen.getByLabelText("Start time (HH:mm)"), "19:30");
    fireEvent.changeText(screen.getByLabelText("Repeat weekly for (weeks)"), "3");
    fireEvent.press(screen.getByText("Create session"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/sessions", {
        seasonId: 7,
        title: "Kickoff",
        startDay: "2099-07-03",
        startTime: "19:30",
        durationMinutes: 90,
        location: null,
        youtubeUrl: null,
        description: null,
        repeatWeeks: 3,
      }),
    );
    expect(mockReplace).toHaveBeenCalledWith({ pathname: "/session/[id]", params: { id: "55" } });
  });

  it("validates with the server's schema before sending", async () => {
    renderWithProviders(<NewSessionScreen />);
    fireEvent.changeText(screen.getByLabelText("Title"), "Kickoff");
    fireEvent.changeText(screen.getByLabelText("Day (YYYY-MM-DD)"), "2099-07-03");
    fireEvent.changeText(screen.getByLabelText("Start time (HH:mm)"), "25:00");
    fireEvent.press(screen.getByText("Create session"));
    expect(screen.getByLabelText("Start time (HH:mm)").props.accessibilityHint).toMatch(/HH:mm/);
    expect(post).not.toHaveBeenCalled();
  });

  it("explains a missing season instead of rendering a dead form", () => {
    mockParams = {};
    renderWithProviders(<NewSessionScreen />);
    expect(screen.getByText("Open a season first, then add a session to it.")).toBeTruthy();
  });
});

describe("EditSessionScreen (/session/[id]/edit)", () => {
  beforeEach(() => {
    mockParams = { id: "12" };
  });

  function routeGets(d: ReturnType<typeof detail>) {
    get.mockImplementation((url: string, config?: { params?: { scope?: string } }) => {
      if (url === "/api/v1/sessions/12") return Promise.resolve({ data: { data: d } });
      if (url === "/api/v1/sessions/12/series") {
        const scope = config?.params?.scope;
        const sessions =
          scope === "future"
            ? [seriesItem(12, "2099-03-15", 1, true), seriesItem(13, "2099-03-22", 0)]
            : [seriesItem(11, "2099-03-08", 0), seriesItem(12, "2099-03-15", 1, true), seriesItem(13, "2099-03-22", 0)];
        return Promise.resolve({ data: { data: { scope, sessions, attendanceCount: 1, videoProgressCount: 0 } } });
      }
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
  }

  it("pre-fills from the server's org day/time, previews the scope, and saves with it", async () => {
    routeGets(detail());
    patch.mockResolvedValue({ data: { data: { updated: 2 } } });
    renderWithProviders(<EditSessionScreen />);

    expect((await screen.findByLabelText("Day (YYYY-MM-DD)")).props.value).toBe("2099-03-15");
    expect(screen.getByLabelText("Start time (HH:mm)").props.value).toBe("20:00");

    fireEvent.press(screen.getByText("This and following"));
    expect(await screen.findByText("This affects 2 sessions, 1 with attendance recorded.")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/sessions/12/series", { params: { scope: "future" } });

    fireEvent.changeText(screen.getByLabelText("Start time (HH:mm)"), "19:00");
    fireEvent.press(screen.getByText("Save changes"));
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/api/v1/sessions/12", {
        title: "Week 3",
        startDay: "2099-03-15",
        startTime: "19:00",
        durationMinutes: 90,
        location: "Hall B",
        youtubeUrl: null,
        description: null,
        scope: "future",
      }),
    );
    // v1 parity 2026-10-09 (spec 03 R30): edit returns to the session's detail, v1 session-form.tsx:138.
    expect(mockReplace).toHaveBeenCalledWith({ pathname: "/session/[id]", params: { id: "12" } });
  });

  it("hides the scope selector for a one-off session (spec 03 R29)", async () => {
    routeGets(detail({ recurrenceGroupId: null }));
    renderWithProviders(<EditSessionScreen />);
    await screen.findByLabelText("Title");
    expect(screen.queryByText("This and following")).toBeNull();
  });

  it("deletes on a second press; a has_student_records 409 offers the forced delete", async () => {
    routeGets(detail({ recurrenceGroupId: null }));
    del
      .mockRejectedValueOnce(conflict("has_student_records", "Attendance or video progress has been recorded; pass force to delete it too."))
      .mockResolvedValueOnce({ data: { data: { deleted: 1 } } });
    renderWithProviders(<EditSessionScreen />);

    fireEvent.press(await screen.findByText("Delete session"));
    expect(del).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText("Really delete?"));
    await waitFor(() => expect(del).toHaveBeenCalledWith("/api/v1/sessions/12", { data: { scope: "one", force: false } }));

    fireEvent.press(await screen.findByText("Delete including attendance"));
    fireEvent.press(screen.getByText("Really delete, including attendance?"));
    await waitFor(() => expect(del).toHaveBeenLastCalledWith("/api/v1/sessions/12", { data: { scope: "one", force: true } }));
    expect(mockReplace).toHaveBeenCalledWith({ pathname: "/seasons/[code]", params: { code: "s7" } });
  });

  it("refuses a caller who cannot manage the session", async () => {
    routeGets(detail({ canManageCheckIn: false }));
    renderWithProviders(<EditSessionScreen />);
    expect(await screen.findByText("Only this season's admins can edit its sessions.")).toBeTruthy();
  });
});
```

Run: `cd apps/mobile && pnpm jest src/__tests__/session-detail.test.tsx src/__tests__/session-forms.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Hooks**

```ts
// apps/mobile/src/hooks/use-session-writes.ts
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import {
  sessionCreatedResponseSchema,
  sessionDeletedResponseSchema,
  sessionSeriesResponseSchema,
  sessionUpdatedResponseSchema,
  type CreateSessionInput,
  type RecurrenceScope,
  type SessionSeries,
  type UpdateSessionInput,
} from "@space/shared";

import { apiClient } from "../lib/api-client";
import { queryKeys } from "../lib/query-keys";

/**
 * A series write touches N sessions across any number of cached lists and
 * the season detail's counts — invalidate the roots, never a leaf (spec 03 §8).
 */
function useInvalidateSessionData() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.seasons.all });
  };
}

export function useCreateSession() {
  const invalidate = useInvalidateSessionData();
  return useMutation({
    mutationFn: async (body: CreateSessionInput) => {
      const res = await apiClient.post("/api/v1/sessions", body);
      return sessionCreatedResponseSchema.parse(res.data.data);
    },
    onSuccess: invalidate,
  });
}

export function useUpdateSession(id: number) {
  const invalidate = useInvalidateSessionData();
  return useMutation({
    mutationFn: async (body: UpdateSessionInput) => {
      const res = await apiClient.patch(`/api/v1/sessions/${id}`, body);
      return sessionUpdatedResponseSchema.parse(res.data.data);
    },
    onSuccess: invalidate,
  });
}

export function useDeleteSession(id: number) {
  const invalidate = useInvalidateSessionData();
  return useMutation({
    mutationFn: async (body: { scope: RecurrenceScope; force: boolean }) => {
      // Plan 3's DELETE reads a JSON body; axios sends one on DELETE only via `data`.
      const res = await apiClient.delete(`/api/v1/sessions/${id}`, { data: body });
      return sessionDeletedResponseSchema.parse(res.data.data);
    },
    onSuccess: invalidate,
  });
}

/** The scope preview (D-16.8). Pass enabled=false for scope "one" — nothing to preview. */
export function useSessionSeries(
  id: number,
  scope: RecurrenceScope,
  enabled: boolean,
): UseQueryResult<SessionSeries> {
  return useQuery({
    queryKey: queryKeys.sessions.series(id, scope),
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/sessions/${id}/series`, { params: { scope } });
      return sessionSeriesResponseSchema.parse(res.data.data);
    },
    enabled,
  });
}
```

```ts
// apps/mobile/src/hooks/use-check-in.ts
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { checkInOpenResponseSchema, checkInStateSchema, type CheckInStateResponse } from "@space/shared";

import { apiClient } from "../lib/api-client";
import { queryKeys } from "../lib/query-keys";

/** Admin-only check-in state (D-16.9) — the console's token source after a restart. */
export function useCheckInState(id: number, enabled: boolean): UseQueryResult<CheckInStateResponse> {
  return useQuery({
    queryKey: queryKeys.sessions.checkIn(id),
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/sessions/${id}/check-in`);
      return checkInStateSchema.parse(res.data.data);
    },
    enabled,
  });
}

/** Same `{ checkInToken }` payload check-in-open returns, so the same schema parses it. */
export function useRegenerateCheckIn(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.post(`/api/v1/sessions/${id}/check-in-regenerate`);
      return checkInOpenResponseSchema.parse(res.data.data);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all }),
  });
}
```

```ts
// apps/mobile/src/hooks/use-session-quizzes.ts
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { z } from "zod";
import { sessionQuizItemSchema, type SessionQuizItem } from "@space/shared";

import { apiClient } from "../lib/api-client";
import { queryKeys } from "../lib/query-keys";

const quizListSchema = z.array(sessionQuizItemSchema);

export function useSessionQuizzes(id: number, enabled: boolean): UseQueryResult<SessionQuizItem[]> {
  return useQuery({
    queryKey: queryKeys.sessions.quizzes(id),
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/sessions/${id}/quizzes`);
      return quizListSchema.parse(res.data.data.quizzes);
    },
    enabled,
  });
}
```

- [ ] **Step 4: Components**

```tsx
// apps/mobile/src/components/SessionForm.tsx
import { View } from "react-native";
import type { RecurrenceScope } from "@space/shared";

import { useTheme } from "../theme";
import { Button, Input } from "../ui";

export interface SessionFormValues {
  title: string;
  /** Org-calendar day, "YYYY-MM-DD". */
  day: string;
  /** Org wall-clock time, "HH:mm". */
  time: string;
  durationMinutes: string;
  location: string;
  youtubeUrl: string;
  description: string;
}

export const emptySessionValues: SessionFormValues = {
  title: "",
  day: "",
  time: "",
  durationMinutes: "90",
  location: "",
  youtubeUrl: "",
  description: "",
};

const orNull = (v: string): string | null => (v.trim() === "" ? null : v.trim());

/**
 * The write fields both create and update share. The start travels as org
 * wall-clock fields startDay + startTime (Plan 6 D-16.6 — Plan 5's
 * dueDay/dueTime split): the server composes the instant in ORG_TIMEZONE, so
 * the phone's own zone never enters the calculation (X13).
 */
export function sessionWriteFields(v: SessionFormValues) {
  return {
    title: v.title.trim(),
    startDay: v.day.trim(),
    startTime: v.time.trim(),
    durationMinutes: Number(v.durationMinutes),
    location: orNull(v.location),
    youtubeUrl: orNull(v.youtubeUrl),
    description: orNull(v.description),
  };
}

export function SessionFields({
  values,
  onChange,
  errors,
}: {
  values: SessionFormValues;
  onChange: (next: SessionFormValues) => void;
  errors: Record<string, string>;
}) {
  const set = (key: keyof SessionFormValues) => (text: string) => onChange({ ...values, [key]: text });
  return (
    <>
      <Input label="Title" value={values.title} onChangeText={set("title")} error={errors.title} />
      <Input label="Day (YYYY-MM-DD)" value={values.day} onChangeText={set("day")} autoCapitalize="none" error={errors.startDay} />
      <Input
        label="Start time (HH:mm)"
        value={values.time}
        onChangeText={set("time")}
        autoCapitalize="none"
        error={errors.startTime ?? errors.startsAt}
      />
      <Input
        label="Duration (minutes)"
        value={values.durationMinutes}
        onChangeText={set("durationMinutes")}
        keyboardType="number-pad"
        error={errors.durationMinutes}
      />
      <Input label="Location" value={values.location} onChangeText={set("location")} error={errors.location} />
      <Input label="YouTube URL" value={values.youtubeUrl} onChangeText={set("youtubeUrl")} autoCapitalize="none" error={errors.youtubeUrl} />
      <Input label="Description" value={values.description} onChangeText={set("description")} multiline error={errors.description} />
    </>
  );
}

export const SCOPE_LABELS: Record<RecurrenceScope, string> = {
  one: "This session",
  future: "This and following",
  all: "All in series",
};

/** Rendered only for a session with a recurrenceGroupId (spec 03 R29). */
export function ScopeSelector({ value, onChange }: { value: RecurrenceScope; onChange: (s: RecurrenceScope) => void }) {
  const theme = useTheme();
  const scopes: RecurrenceScope[] = ["one", "future", "all"];
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
      {scopes.map((s) => (
        <Button key={s} title={SCOPE_LABELS[s]} variant={value === s ? "primary" : "secondary"} onPress={() => onChange(s)} />
      ))}
    </View>
  );
}
```

```tsx
// apps/mobile/src/components/SessionQuizzesCard.tsx
import { View } from "react-native";

import { useSessionQuizzes } from "../hooks/use-session-quizzes";
import { useTheme } from "../theme";
import { Card, ErrorState, Text } from "../ui";

/**
 * The session's quizzes for staff (G18; v1 leader/sessions/[id] shows the
 * card only when there are quizzes). Rows are not pressable yet: the quiz
 * routes are Plan 8's, which runs after this plan — Plan 8 adds the press
 * (D-16.10). Renders nothing while loading or when empty.
 */
export function SessionQuizzesCard({ sessionId }: { sessionId: number }) {
  const theme = useTheme();
  const quizzes = useSessionQuizzes(sessionId, true);
  if (quizzes.isPending) return null;
  if (quizzes.isError) {
    return (
      <Card style={{ marginTop: theme.spacing.md }}>
        <ErrorState message="Couldn't load this session's quizzes." onRetry={() => void quizzes.refetch()} />
      </Card>
    );
  }
  if (quizzes.data.length === 0) return null;
  return (
    <Card style={{ marginTop: theme.spacing.md, gap: theme.spacing.sm }}>
      <Text variant="heading">Quizzes</Text>
      {quizzes.data.map((q) => (
        <View key={q.id}>
          <Text variant="body">{q.title}</Text>
          <Text variant="caption" color={theme.colors.neutral[600]}>
            {q.kind === "ONLINE" && q.publishedAt === null ? `Max score: ${q.maxScore} · Draft` : `Max score: ${q.maxScore}`}
          </Text>
        </View>
      ))}
    </Card>
  );
}
```

- [ ] **Step 5: `session/new.tsx`** (replace the stub):

```tsx
import { useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { createSessionRequestSchema, type CreateSessionInput } from "@space/shared";

import { SessionFields, emptySessionValues, sessionWriteFields, type SessionFormValues } from "../../../src/components/SessionForm";
import { useCreateSession } from "../../../src/hooks/use-session-writes";
import { apiErrorMessage } from "../../../src/lib/api-error";
import { firstErrorByField } from "../../../src/lib/form-errors";
import { parsePositiveInt } from "../../../src/lib/params";
import { useTheme } from "../../../src/theme";
import { Button, Card, EmptyState, Input, Screen, Text } from "../../../src/ui";

/**
 * Create a session or weekly series (v1 /admin/season/[code]/calendar/new;
 * spec 03 §9; G5). Reached from the season detail's "New session" with
 * ?seasonId=. The server enforces isAdminOfSeason; a refusal shows its message.
 */
export default function NewSessionScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { seasonId: raw } = useLocalSearchParams<{ seasonId: string }>();
  const seasonId = parsePositiveInt(raw);
  const create = useCreateSession();
  const [values, setValues] = useState<SessionFormValues>(emptySessionValues);
  const [repeat, setRepeat] = useState("1");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  if (seasonId === null) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <EmptyState title="No season" message="Open a season first, then add a session to it." />
      </Screen>
    );
  }

  const submit = () => {
    setMessage(null);
    const body: CreateSessionInput = { seasonId, ...sessionWriteFields(values), repeatWeeks: Number(repeat) };
    const parsed = createSessionRequestSchema.safeParse(body);
    if (!parsed.success) {
      setErrors(firstErrorByField(parsed.error));
      return;
    }
    setErrors({});
    create.mutate(body, {
      onSuccess: (created) => router.replace({ pathname: "/session/[id]", params: { id: String(created.id) } }),
      onError: (err) => setMessage(apiErrorMessage(err, "Couldn't create the session.")),
    });
  };

  return (
    <Screen edges={["top", "left", "right"]} scroll>
      <Card style={{ gap: theme.spacing.sm }}>
        <Text variant="heading">New session</Text>
        <SessionFields values={values} onChange={setValues} errors={errors} />
        <Input
          label="Repeat weekly for (weeks)"
          value={repeat}
          onChangeText={setRepeat}
          keyboardType="number-pad"
          error={errors.repeatWeeks}
        />
        {message ? <Text variant="label" color={theme.colors.error[500]}>{message}</Text> : null}
        <Button title="Create session" onPress={submit} loading={create.isPending} />
      </Card>
    </Screen>
  );
}
```

> **v1 parity 2026-10-09:** On create success, go to the season's calendar, not to the new session's detail (v1 `src/components/sessions/session-form.tsx:125`, spec 03 R30). Edit `apps/mobile/app/(app)/session/new.tsx:47` to `router.replace` to `/calendar` with this `seasonId` selected (or to the season workspace's calendar once one exists). The Step 2 create test's expectation (`mockReplace` with `/session/[id]` `55`) changes to match.

- [ ] **Step 6: `session/[id]/edit.tsx`** (replace the stub):

```tsx
import { useState, type ReactNode } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  updateSessionRequestSchema,
  type RecurrenceScope,
  type SessionDetail,
  type UpdateSessionInput,
} from "@space/shared";

import { ScopeSelector, SessionFields, sessionWriteFields, type SessionFormValues } from "../../../../src/components/SessionForm";
import { useSessionDetail } from "../../../../src/hooks/use-session-detail";
import { useDeleteSession, useSessionSeries, useUpdateSession } from "../../../../src/hooks/use-session-writes";
import { apiErrorCode, apiErrorMessage } from "../../../../src/lib/api-error";
import { firstErrorByField } from "../../../../src/lib/form-errors";
import { formatDayKey, formatWallTime } from "../../../../src/lib/format";
import { parsePositiveInt } from "../../../../src/lib/params";
import { useTheme } from "../../../../src/theme";
import { Button, Card, EmptyState, ErrorState, LoadingState, Screen, Text } from "../../../../src/ui";

/** "This will change N sessions" before submitting (spec 03 §9, R59 — v1 never said). */
function SeriesImpact({ sessionId, scope }: { sessionId: number; scope: RecurrenceScope }) {
  const theme = useTheme();
  const series = useSessionSeries(sessionId, scope, scope !== "one");
  if (scope === "one") return <Text variant="caption">Only this session.</Text>;
  if (series.isPending) return <LoadingState />;
  if (series.isError) return <ErrorState message="Couldn't preview the series." onRetry={() => void series.refetch()} />;
  const n = series.data.sessions.length;
  const withAttendance = series.data.sessions.filter((s) => s.attendanceCount > 0).length;
  return (
    <View style={{ gap: theme.spacing.xs }}>
      <Text variant="label">
        {`This affects ${n} session${n === 1 ? "" : "s"}${withAttendance > 0 ? `, ${withAttendance} with attendance recorded` : ""}.`}
      </Text>
      {series.data.videoProgressCount > 0 ? (
        <Text variant="caption">Video progress has been recorded on some of them.</Text>
      ) : null}
      {series.data.sessions.map((s) => (
        <Text key={s.id} variant="caption" color={theme.colors.neutral[600]}>
          {`${formatDayKey(s.dayKey)} · ${formatWallTime(s.startTime)}${s.isAnchor ? " (this one)" : ""}`}
        </Text>
      ))}
    </View>
  );
}

function EditSessionForm({ detail }: { detail: SessionDetail }) {
  const theme = useTheme();
  const router = useRouter();
  const update = useUpdateSession(detail.id);
  const remove = useDeleteSession(detail.id);
  // Pre-filled from the server's org day and time (X13) — nothing converts zones here.
  const [values, setValues] = useState<SessionFormValues>({
    title: detail.title,
    day: detail.dayKey,
    time: detail.startTime,
    durationMinutes: String(detail.durationMinutes),
    location: detail.location ?? "",
    youtubeUrl: detail.youtubeUrl ?? "",
    description: detail.description ?? "",
  });
  const isSeries = detail.recurrenceGroupId !== null;
  const [scope, setScope] = useState<RecurrenceScope>("one");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);
  const [needsForce, setNeedsForce] = useState(false);

  const save = () => {
    setMessage(null);
    const body: UpdateSessionInput = { ...sessionWriteFields(values), scope };
    const parsed = updateSessionRequestSchema.safeParse(body);
    if (!parsed.success) {
      setErrors(firstErrorByField(parsed.error));
      return;
    }
    setErrors({});
    update.mutate(body, {
      // v1 parity 2026-10-09 (spec 03 R30): v1 session-form.tsx:138 pushes the session's detail page.
      onSuccess: () => router.replace({ pathname: "/session/[id]", params: { id: String(detail.id) } }),
      onError: (err) => setMessage(apiErrorMessage(err, "Couldn't save the session.")),
    });
  };

  const onDelete = (force: boolean) => {
    if (!armed) {
      setArmed(true);
      return;
    }
    setArmed(false);
    setMessage(null);
    remove.mutate(
      { scope, force },
      {
        onSuccess: () => router.replace({ pathname: "/seasons/[code]", params: { code: detail.seasonCode } }),
        onError: (err) => {
          // Plan 3 refuses to destroy attendance/video progress without force (C12).
          if (apiErrorCode(err) === "has_student_records") setNeedsForce(true);
          setMessage(apiErrorMessage(err, "Couldn't delete."));
        },
      },
    );
  };

  const deleteTitle = needsForce
    ? armed
      ? "Really delete, including attendance?"
      : "Delete including attendance"
    : armed
      ? "Really delete?"
      : scope === "one"
        ? "Delete session"
        : "Delete sessions";

  return (
    <>
      <Card style={{ gap: theme.spacing.sm }}>
        <Text variant="heading">Edit session</Text>
        <SessionFields values={values} onChange={setValues} errors={errors} />
        {isSeries ? (
          <>
            <Text variant="label">Apply to</Text>
            <ScopeSelector
              value={scope}
              onChange={(s) => {
                setScope(s);
                setArmed(false);
                setNeedsForce(false);
              }}
            />
            <SeriesImpact sessionId={detail.id} scope={scope} />
          </>
        ) : null}
        {message ? <Text variant="label" color={theme.colors.error[500]}>{message}</Text> : null}
        <Button title="Save changes" onPress={save} loading={update.isPending} />
      </Card>
      <Card style={{ marginTop: theme.spacing.md, gap: theme.spacing.sm }}>
        <Text variant="heading">Delete</Text>
        <Button title={deleteTitle} variant="ghost" onPress={() => onDelete(needsForce)} loading={remove.isPending} />
      </Card>
    </>
  );
}

export default function EditSessionScreen() {
  const { id: raw } = useLocalSearchParams<{ id: string }>();
  const id = parsePositiveInt(raw);
  const detail = useSessionDetail(id);

  let body: ReactNode;
  if (id === null) body = <EmptyState title="Not found" message="That session doesn't exist." />;
  else if (detail.isPending) body = <LoadingState />;
  else if (detail.isError) body = <ErrorState message="Couldn't load this session." onRetry={() => void detail.refetch()} />;
  else if (!detail.data.canManageCheckIn)
    // canManageCheckIn IS isAdminOfSeason (Plan 4) — the same gate PATCH/DELETE enforce.
    body = <EmptyState title="Not available" message="Only this season's admins can edit its sessions." />;
  else body = <EditSessionForm key={detail.data.id} detail={detail.data} />;

  return (
    <Screen edges={["top", "left", "right"]} scroll>
      {body}
    </Screen>
  );
}
```

- [ ] **Step 7: `session/[id]/index.tsx`.** Replace Plan 4's file with the version below. The changes from Plan 4:
- the header uses the server's `dayKey` and `startTime`;
- the console reads its token from `GET /check-in` and gains Regenerate and the expiry line;
- an "Edit session" button is added;
- the quiz card is added.

The leader's live roster is Plan 4's, unchanged.

> **v1 parity 2026-10-09:** The QR must encode the full check-in URL `<public base URL>/checkin/<token>`, not the bare token. A phone's own camera then opens check-in directly (v1 `src/app/admin/season/[code]/sessions/[id]/page.tsx:58-60`, spec 03 R68, REG-10). Change `<QRCode value={token} …/>` below, now `apps/mobile/app/(app)/session/[id]/index.tsx:79`, to `value={checkInUrl(token)}`. The host comes from config, not a literal. The `Code:` caption keeps the bare token. The in-app scanner already accepts the URL form. Universal/app links for `/checkin/*` are un-deferred with REG-10 (Plan 11 owns that part).

```tsx
import { useEffect, useState } from "react";
import { View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { AttendanceRosterRow, MyAttendance, SessionDetail } from "@space/shared";

import { SessionQuizzesCard } from "../../../../src/components/SessionQuizzesCard";
import { useAttendanceRoster } from "../../../../src/hooks/use-attendance";
import { useCheckInState, useRegenerateCheckIn } from "../../../../src/hooks/use-check-in";
import { useCloseCheckIn, useOpenCheckIn, useSessionDetail } from "../../../../src/hooks/use-session-detail";
import { apiErrorMessage } from "../../../../src/lib/api-error";
import { formatDayKey, formatWallTime } from "../../../../src/lib/format";
import { parsePositiveInt } from "../../../../src/lib/params";
import { useTheme } from "../../../../src/theme";
import { Button, Card, EmptyState, ErrorState, LoadingState, Screen, Text } from "../../../../src/ui";

/** v1's leader page refreshed every 10s while check-in was open (check-in-attendance-list.tsx:58). */
export const LIVE_ROSTER_REFRESH_MS = 10_000;

function attendanceLine(a: MyAttendance): string {
  if (a.status === "PRESENT") return "Your attendance: Present";
  if (a.status === "LATE") {
    return a.lateMinutes !== null ? `Your attendance: Late (${a.lateMinutes} min)` : "Your attendance: Late";
  }
  return "Your attendance: Absent";
}

function rosterStatus(row: AttendanceRosterRow): string {
  if (row.status === "PRESENT") return "Present";
  if (row.status === "LATE") return "Late";
  if (row.status === "ABSENT") return "Absent";
  return "Not checked in";
}

/** Season admins only (canManageCheckIn): open/close/regenerate and the QR. */
function CheckInConsole({ detail }: { detail: SessionDetail }) {
  const theme = useTheme();
  const open = useOpenCheckIn(detail.id);
  const close = useCloseCheckIn(detail.id);
  const regenerate = useRegenerateCheckIn(detail.id);
  // The narrow admin-only read (D-16.9) — after an app restart, the open
  // session's QR comes back without a reopen and without the season-wide list.
  const checkIn = useCheckInState(detail.id, true);
  const token = checkIn.data?.checkInToken ?? open.token;
  const [error, setError] = useState<string | null>(null);
  const [regenArmed, setRegenArmed] = useState(false);

  const onOpen = () => {
    setError(null);
    open.mutate(undefined, { onError: (err) => setError(apiErrorMessage(err, "Couldn't open check-in.")) });
  };
  const onClose = () => {
    setError(null);
    close.mutate(undefined, { onError: (err) => setError(apiErrorMessage(err, "Couldn't close check-in.")) });
  };
  const onRegenerate = () => {
    // While open, a code on the room screen stops working — confirm (spec 03 §10 item 9).
    if (detail.checkInOpen && !regenArmed) {
      setRegenArmed(true);
      return;
    }
    setRegenArmed(false);
    setError(null);
    regenerate.mutate(undefined, { onError: (err) => setError(apiErrorMessage(err, "Couldn't replace the code.")) });
  };

  return (
    <Card style={{ marginTop: theme.spacing.md, gap: theme.spacing.sm }}>
      <Text variant="heading">Check-in</Text>
      {detail.checkInOpen ? (
        <>
          {token ? (
            <View style={{ alignItems: "center", gap: theme.spacing.sm }}>
              <QRCode value={token} size={220} />
              <Text variant="caption">{`Code: ${token}`}</Text>
              {checkIn.data?.expiresAtTime ? (
                <Text variant="caption">{`Closes at ${formatWallTime(checkIn.data.expiresAtTime)}`}</Text>
              ) : null}
              {/* Spec 04 D3's risk, stated until the rotating-code upgrade lands. */}
              <Text variant="caption" color={theme.colors.neutral[600]}>
                Anyone with this code can check in — keep it on the room screen only.
              </Text>
            </View>
          ) : (
            <Text variant="label">Loading the check-in code…</Text>
          )}
          <Button title="Close check-in" variant="secondary" onPress={onClose} loading={close.isPending} />
        </>
      ) : (
        <Button title="Open check-in" onPress={onOpen} loading={open.isPending} />
      )}
      {token ? (
        <Button
          title={regenArmed ? "Replace the code? The current one stops working." : "Regenerate code"}
          variant="ghost"
          onPress={onRegenerate}
          loading={regenerate.isPending}
        />
      ) : null}
      {error ? <Text variant="label" color={theme.colors.error[500]}>{error}</Text> : null}
    </Card>
  );
}

/**
 * Group leaders (canMarkAttendance && !canManageCheckIn): who has checked in,
 * read-only — v1 /leader/sessions/[id]. The roster endpoint narrows to the
 * leader's own groups server-side.
 */
function LiveCheckInRoster({ detail }: { detail: SessionDetail }) {
  const theme = useTheme();
  const roster = useAttendanceRoster(detail.id);
  const { refetch } = roster;

  useEffect(() => {
    if (!detail.checkInOpen) return undefined;
    const timer = setInterval(() => void refetch(), LIVE_ROSTER_REFRESH_MS);
    return () => clearInterval(timer);
  }, [detail.checkInOpen, refetch]);

  return (
    <Card style={{ marginTop: theme.spacing.md, gap: theme.spacing.sm }}>
      <Text variant="heading">Check-in</Text>
      <Text variant="label">{detail.checkInOpen ? "Check-in is open" : "Check-in is closed"}</Text>
      {roster.isPending ? (
        <LoadingState />
      ) : roster.isError ? (
        <ErrorState message="Couldn't load the roster." onRetry={() => void refetch()} />
      ) : roster.data.length === 0 ? (
        <Text variant="body" color={theme.colors.neutral[600]}>No students in your groups.</Text>
      ) : (
        roster.data.map((row) => (
          <View key={row.studentUserId} style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text variant="body">{row.name ?? row.email}</Text>
            <Text variant="label" color={theme.colors.neutral[600]}>{rosterStatus(row)}</Text>
          </View>
        ))
      )}
    </Card>
  );
}

function SessionDetailBody({ id }: { id: number }) {
  const theme = useTheme();
  const router = useRouter();
  const { data, isPending, isError, refetch, isRefetching } = useSessionDetail(id);

  if (isPending) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <LoadingState />
      </Screen>
    );
  }
  if (isError) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <ErrorState message="Couldn't load this session." onRetry={() => void refetch()} />
      </Screen>
    );
  }

  return (
    <Screen edges={["top", "left", "right"]} scroll onRefresh={() => void refetch()} refreshing={isRefetching}>
      <Card>
        <Text variant="title">{data.title}</Text>
        {/* Org day and time from the server (X13) — the device zone never re-reads startsAt. */}
        <Text variant="label" color={theme.colors.neutral[600]}>
          {`${formatDayKey(data.dayKey)} · ${formatWallTime(data.startTime)} · ${data.durationMinutes} min`}
        </Text>
        {data.location ? <Text variant="body">{data.location}</Text> : null}
        {data.description ? <Text variant="body">{data.description}</Text> : null}
        {data.myAttendance ? <Text variant="label">{attendanceLine(data.myAttendance)}</Text> : null}
      </Card>

      {data.canManageCheckIn ? (
        <Button
          title="Edit session"
          variant="secondary"
          style={{ marginTop: theme.spacing.md }}
          onPress={() => router.push({ pathname: "/session/[id]/edit", params: { id: String(id) } })}
        />
      ) : null}

      {/* Student check-in (scanner / enter code) is Plan 11 (ruling X15). */}
      {data.canManageCheckIn ? (
        <CheckInConsole detail={data} />
      ) : data.canMarkAttendance ? (
        <LiveCheckInRoster detail={data} />
      ) : null}

      {data.canMarkAttendance ? <SessionQuizzesCard sessionId={data.id} /> : null}

      {data.canMarkAttendance ? (
        <Button
          title="Mark attendance"
          variant="secondary"
          style={{ marginTop: theme.spacing.md }}
          onPress={() => router.push({ pathname: "/session/[id]/attendance", params: { id: String(id) } })}
        />
      ) : null}
    </Screen>
  );
}

export default function SessionDetailScreen() {
  const { id: raw } = useLocalSearchParams<{ id: string }>();
  const id = parsePositiveInt(raw);
  if (id === null) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <EmptyState title="Not found" message="That session doesn't exist." />
      </Screen>
    );
  }
  return <SessionDetailBody id={id} />;
}
```

If Plan 4's `Button` lacks a `style` prop, wrap each of those buttons in `<View style={{ marginTop: theme.spacing.md }}>`, exactly as Plan 4's own file resolves it.

- [ ] **Step 8: Run.**
- `cd apps/mobile && pnpm jest src/__tests__/session-detail.test.tsx src/__tests__/session-forms.test.tsx` → PASS.
- `pnpm turbo lint typecheck --filter=@space/mobile` → clean.
- `grep -n "formatSessionTime\|formatDate(" "apps/mobile/app/(app)/session"` → no output (X13).

- [ ] **Step 9: Commit** — `git add apps/mobile && git commit -m "feat(mobile): session create/edit/delete with scope preview, check-in state and regenerate, session quiz card"`

---
### Task 8: Group screens — `/groups` admin branch, group create/edit/delete, roster grid *(agent M3)*

**Files (exclusive to M3):**
- Create: `apps/mobile/src/hooks/use-group-admin.ts`, `apps/mobile/src/components/GroupForm.tsx`
- Replace: `apps/mobile/app/(app)/groups.tsx`, `apps/mobile/app/(app)/group/new.tsx`, `apps/mobile/app/(app)/group/[id]/edit.tsx`, `apps/mobile/app/(app)/seasons/[code]/roster/index.tsx`
- Modify: `apps/mobile/app/(app)/group/[id]/index.tsx` (Edit button)
- Modify: `apps/mobile/src/__tests__/groups-screens.test.tsx` (delete Plan 2's admin "not-yet state" case)
- Test: `apps/mobile/src/__tests__/group-admin-screens.test.tsx` (new)

**Interfaces:**
- Consumes:
  - Task 1's `groupWriteRequestSchema`, `groupRefResponseSchema`, `leaderOptionSchema`, `groupImpactSchema`, `groupDeleteResponseSchema`, `seasonRosterRowSchema`, `groupAssignmentsResponseSchema`, `GroupAssignmentsRequest`, `groupDetailSchema.canManage`;
  - Plan 2's `useMyGroups`, `useGroupDetail`, `MY_GROUPS_ROLES`;
  - Plan 5's `useSeasonGroups`;
  - Task 5's `useStaffSeasonSelection`, `SeasonSwitcher`, `queryKeys.groups.{impact,leaderOptions,roster}`, `parsePositiveInt`, `firstErrorByField`;
  - Task 6's `useSeasonByCode` (imported from `use-seasons.ts`, which M1 owns; M3 only imports it). If M3 runs before M1 lands, M3 adds that exact function to `use-seasons.ts` and M1 then skips its Step 2 for it. The coordinator resolves the merge.
- Produces:
  - Hooks: `SEASON_GROUPS_ROLES`, `useLeaderOptions(enabled)`, `useSeasonRoster(seasonId)` (Plan 17's import screen uses it), `useGroupImpact(id)`, `useCreateGroup(seasonId)`, `useUpdateGroup(id)`, `useDeleteGroup()`, `useSaveGroupAssignments(seasonId)`.
  - Components: `GroupForm`, `GroupFormValues`.
  - Screens: `/group/new?seasonId=`, `/group/[id]/edit`, `/seasons/[code]/roster` (Plan 17 adds an "Import from a sheet" button to it).

- [ ] **Step 1: Failing tests.** In `groups-screens.test.tsx`, delete the case "does not pretend an admin has no groups: explicit not-yet state, no request". This task replaces it. Then create:

```tsx
// apps/mobile/src/__tests__/group-admin-screens.test.tsx
import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn() }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";
import GroupsScreen from "../../app/(app)/groups";
import NewGroupScreen from "../../app/(app)/group/new";
import EditGroupScreen from "../../app/(app)/group/[id]/edit";
import SeasonRosterScreen from "../../app/(app)/seasons/[code]/roster/index";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;
const patch = apiClient.patch as jest.Mock;
const put = apiClient.put as jest.Mock;
const del = apiClient.delete as jest.Mock;

const ok = (data: unknown) => Promise.resolve({ data: { data } });
const seasonRow = (id: number, status: "DRAFT" | "ACTIVE", startDate: string) => ({
  id, code: `s${id}`, title: `Season ${id}`, program: "TEST", year: 2099, status, startDate, endDate: "2099-12-31T00:00:00.000Z",
});
const groupRow = (id: number, name: string, seasonId: number) => ({
  id, name, description: null, studentCount: 1, leaderNames: ["Lina"], seasonId, seasonCode: `s${seasonId}`, seasonTitle: `Season ${seasonId}`,
});
const roster = [
  // v1 parity 2026-10-09 (spec 05 R82): no otherSeasonGroup on roster rows.
  { userId: 21, name: "Sara", email: "sara@jpc.test", groupId: 3, groupName: "Group A" },
  { userId: 22, name: "Omar", email: "omar@jpc.test", groupId: null, groupName: null },
];
const seasonDetail = {
  id: 7, code: "s7", title: "Season 7", program: "TEST", year: 2099, status: "ACTIVE",
  startDate: "2099-01-01T00:00:00.000Z", endDate: "2099-12-31T00:00:00.000Z", description: null,
  sessionCount: 0, studentCount: 2, absenceBudgetMinutes: 180, absenceWeightMinutes: 90, canAdminister: true, groups: [],
};

function routeGets(extra: Record<string, unknown> = {}) {
  get.mockImplementation((url: string) => {
    const table: Record<string, unknown> = {
      "/api/v1/seasons": { seasons: [seasonRow(8, "DRAFT", "2099-09-01T00:00:00.000Z"), seasonRow(7, "ACTIVE", "2099-02-01T00:00:00.000Z")] },
      "/api/v1/seasons/7/groups": { groups: [groupRow(3, "Group A", 7), groupRow(4, "Group B", 7)] },
      "/api/v1/seasons/8/groups": { groups: [groupRow(9, "Autumn group", 8)] },
      "/api/v1/seasons/7/roster": { roster },
      "/api/v1/seasons/by-code/s7": seasonDetail,
      "/api/v1/groups/leader-options": { leaders: [{ id: 5, name: "Lina", email: "lina@jpc.test" }, { id: 6, name: "Karim", email: "karim@jpc.test" }] },
      "/api/v1/groups/3": {
        id: 3, name: "Group A", description: null, seasonId: 7, seasonCode: "s7", seasonTitle: "Season 7",
        leaders: [{ id: 5, name: "Lina", email: "lina@jpc.test" }], students: [{ id: 21, name: "Sara", email: "sara@jpc.test" }],
        canManage: true,
      },
      "/api/v1/groups/3/impact": { studentCount: 1, leaderCount: 1, soleTargetAssignments: [{ id: 70, title: "Only A" }] },
      ...extra,
    };
    return url in table ? ok(table[url]) : Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("/groups — ADMIN/SUPER season branch (G6, D-16.16)", () => {
  it("lists the current season's groups and switches season", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7, 8] }));
    routeGets();
    renderWithProviders(<GroupsScreen />);

    expect(await screen.findByText("Group A")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/seasons/7/groups");
    expect(get).not.toHaveBeenCalledWith("/api/v1/groups");

    fireEvent.press(screen.getByText("Season 8"));
    expect(await screen.findByText("Autumn group")).toBeTruthy();

    fireEvent.press(screen.getByText("New group"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/group/new", params: { seasonId: "8" } });
    fireEvent.press(screen.getByText("Roster"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/seasons/[code]/roster", params: { code: "s8" } });
    fireEvent.press(screen.getByText("Autumn group"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/group/[id]", params: { id: "9" } });
  });

  it("serves SUPER too (v1 rejected SUPER here, spec 05 R92 — not ported)", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    routeGets();
    renderWithProviders(<GroupsScreen />);
    expect(await screen.findByText("Group A")).toBeTruthy();
  });

  it("gives MENTOR a graceful state and fetches nothing (spec 05 §9)", async () => {
    useSessionStore.setState(makeSession("MENTOR"));
    renderWithProviders(<GroupsScreen />);
    expect(await screen.findByText("Groups aren't available for your role.")).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  });
});

describe("/group/new", () => {
  it("creates a group with picked leaders and students and opens it", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    mockParams = { seasonId: "7" };
    routeGets();
    post.mockResolvedValue({ data: { data: { id: 30 } } });
    renderWithProviders(<NewGroupScreen />);

    fireEvent.changeText(await screen.findByLabelText("Name"), "Group C");
    fireEvent.press(await screen.findByLabelText("Karim"));
    fireEvent.press(await screen.findByLabelText("Omar"));
    // v1 parity 2026-10-09 (spec 05 R79): no per-student caption; one static helper line.
    expect(screen.getByText("Adding a student here will move them out of any other group.")).toBeTruthy();
    fireEvent.press(screen.getByText("Create group"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/seasons/7/groups", {
        name: "Group C", description: null, leaderIds: [6], studentIds: [22],
      }),
    );
    // v1 parity 2026-10-09 (spec 05 R97): back to the season's group list, v1 group-form.tsx:107.
    expect(mockReplace).toHaveBeenCalledWith({ pathname: "/groups", params: { seasonId: "7" } });
  });

  it("validates the name with the server's schema", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    mockParams = { seasonId: "7" };
    routeGets();
    renderWithProviders(<NewGroupScreen />);
    fireEvent.changeText(await screen.findByLabelText("Name"), "C");
    fireEvent.press(screen.getByText("Create group"));
    expect(screen.getByLabelText("Name").props.accessibilityHint).toMatch(/at least 2/);
    expect(post).not.toHaveBeenCalled();
  });
});

describe("/group/[id]/edit", () => {
  it("pre-selects members from the ROSTER (SeasonEnrollment, C9) and saves the full lists", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    mockParams = { id: "3" };
    routeGets();
    patch.mockResolvedValue({ data: { data: { id: 3 } } });
    renderWithProviders(<EditGroupScreen />);

    expect((await screen.findByLabelText("Name")).props.value).toBe("Group A");
    fireEvent.press(await screen.findByLabelText("Omar"));
    fireEvent.press(screen.getByText("Save group"));
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/api/v1/groups/3", {
        name: "Group A", description: null, leaderIds: [5], studentIds: [21, 22],
      }),
    );
  });

  it("shows the delete impact, and the server's refusal while an assignment targets only this group", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    mockParams = { id: "3" };
    routeGets();
    del.mockRejectedValueOnce(
      Object.assign(new Error("409"), {
        isAxiosError: true,
        response: { status: 409, data: { error: { code: "group_has_sole_targets", message: "1 assignment(s) target only this group. Retarget them before deleting it." } } },
      }),
    );
    renderWithProviders(<EditGroupScreen />);

    expect(await screen.findByText("Deleting unassigns 1 student and removes 1 leader.")).toBeTruthy();
    expect(screen.getByText("Only A")).toBeTruthy();
    fireEvent.press(screen.getByText("Delete group"));
    expect(del).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText("Really delete?"));
    await waitFor(() => expect(del).toHaveBeenCalledWith("/api/v1/groups/3"));
    expect(await screen.findByText("1 assignment(s) target only this group. Retarget them before deleting it.")).toBeTruthy();
  });

  it("deletes and returns to /groups", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    mockParams = { id: "3" };
    routeGets({ "/api/v1/groups/3/impact": { studentCount: 1, leaderCount: 1, soleTargetAssignments: [] } });
    del.mockResolvedValue({ data: { data: { deleted: true, orphanedStudentIds: [21] } } });
    renderWithProviders(<EditGroupScreen />);
    fireEvent.press(await screen.findByText("Delete group"));
    fireEvent.press(screen.getByText("Really delete?"));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/groups"));
  });
});

describe("/seasons/[code]/roster (G7)", () => {
  it("sends only the rows that changed and reports what was WRITTEN", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    mockParams = { code: "s7" };
    routeGets();
    put.mockResolvedValue({ data: { data: { assigned: 0, unassigned: 1, skippedStudentIds: [] } } });
    renderWithProviders(<SeasonRosterScreen />);

    fireEvent.press(await screen.findByLabelText("Sara: Unassigned"));
    fireEvent.press(screen.getByLabelText("Omar: Group B"));
    // Pressing a row back to its original group drops it from the batch.
    fireEvent.press(screen.getByLabelText("Omar: Group A"));
    fireEvent.press(screen.getByLabelText("Omar: Unassigned"));
    fireEvent.press(screen.getByText("Save 1 change"));

    await waitFor(() =>
      expect(put).toHaveBeenCalledWith("/api/v1/seasons/7/group-assignments", {
        assignments: [{ studentUserId: 21, groupId: null }],
      }),
    );
    // v1 parity 2026-10-09 (spec 05 R101): v1 roster-grid.tsx:84-87's wording.
    expect(await screen.findByText("Updated 1 student.")).toBeTruthy();
  });

  it("refuses a caller the server says does not administer the season (C4)", async () => {
    useSessionStore.setState(makeSession("LEADER", { groupLeaderIds: [3] }));
    mockParams = { code: "s7" };
    routeGets({ "/api/v1/seasons/by-code/s7": { ...seasonDetail, canAdminister: false } });
    renderWithProviders(<SeasonRosterScreen />);
    expect(await screen.findByText("Only this season's admins can manage its roster.")).toBeTruthy();
    expect(get).not.toHaveBeenCalledWith("/api/v1/seasons/7/roster");
  });
});
```

Run: `cd apps/mobile && pnpm jest src/__tests__/group-admin-screens.test.tsx src/__tests__/groups-screens.test.tsx`. Expected: FAIL.

> **v1 parity 2026-10-09:** Three changes to the cases above. (1) "/groups — ADMIN/SUPER season branch" must open the newest season by `startDate` whatever its status: here season 8 (DRAFT, 2099-09-01), so the first read is `/api/v1/seasons/8/groups`. It must also honour a `seasonId` param as the initial pick (v1 `src/app/admin/groups/page.tsx:25-40`, spec 05 R91). (2) The group-form cases read students from `/api/v1/groups/student-options` (every live student) instead of the roster. Add that URL to `routeGets` (spec 05 R18/R78). (3) The create/edit cases expect `mockReplace` with `{ pathname: "/groups", params: { seasonId: "7" } }` (spec 05 R97; the create case is already edited).

- [ ] **Step 2: Hooks**

```ts
// apps/mobile/src/hooks/use-group-admin.ts
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { z } from "zod";
import {
  groupAssignmentsResponseSchema,
  groupDeleteResponseSchema,
  groupImpactSchema,
  groupRefResponseSchema,
  groupWriteRequestSchema,
  leaderOptionSchema,
  seasonRosterRowSchema,
  type GroupAssignmentsRequest,
  type GroupImpact,
  type LeaderOption,
  type SeasonRosterRow,
  type UserRole,
} from "@space/shared";

import { apiClient } from "../lib/api-client";
import { queryKeys } from "../lib/query-keys";

/** Roles that browse groups by season (D-16.16). LEADER/STUDENT keep Plan 2's MY_GROUPS_ROLES branch. */
export const SEASON_GROUPS_ROLES: readonly UserRole[] = ["ADMIN", "SUPER"];

export type GroupWriteInput = z.input<typeof groupWriteRequestSchema>;

const leaderListSchema = z.array(leaderOptionSchema);
const rosterSchema = z.array(seasonRosterRowSchema);

/**
 * A membership write can change groups the caller never touched
 * (GroupStudent is globally unique, spec 05 R3) and the season detail's
 * group cards — invalidate both roots (spec 05 §8), never a leaf.
 */
function useInvalidateGroupData() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.groups.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.seasons.all });
  };
}

export function useLeaderOptions(enabled: boolean): UseQueryResult<LeaderOption[]> {
  return useQuery({
    queryKey: queryKeys.groups.leaderOptions(),
    queryFn: async () => {
      const res = await apiClient.get("/api/v1/groups/leader-options");
      return leaderListSchema.parse(res.data.data.leaders);
    },
    enabled,
  });
}

/** GET /seasons/:id/roster (D-16.11) — the grid, the group form's picker, and Plan 17's import screen. */
export function useSeasonRoster(seasonId: number | null): UseQueryResult<SeasonRosterRow[]> {
  return useQuery({
    queryKey: queryKeys.groups.roster(seasonId),
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/seasons/${seasonId}/roster`);
      return rosterSchema.parse(res.data.data.roster);
    },
    enabled: seasonId !== null,
  });
}

export function useGroupImpact(id: number | null): UseQueryResult<GroupImpact> {
  return useQuery({
    queryKey: queryKeys.groups.impact(id),
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/groups/${id}/impact`);
      return groupImpactSchema.parse(res.data.data);
    },
    enabled: id !== null,
  });
}

export function useCreateGroup(seasonId: number) {
  const invalidate = useInvalidateGroupData();
  return useMutation({
    mutationFn: async (body: GroupWriteInput) => {
      const res = await apiClient.post(`/api/v1/seasons/${seasonId}/groups`, body);
      return groupRefResponseSchema.parse(res.data.data);
    },
    onSuccess: invalidate,
  });
}

export function useUpdateGroup(id: number) {
  const invalidate = useInvalidateGroupData();
  return useMutation({
    mutationFn: async (body: GroupWriteInput) => {
      const res = await apiClient.patch(`/api/v1/groups/${id}`, body);
      return groupRefResponseSchema.parse(res.data.data);
    },
    onSuccess: invalidate,
  });
}

export function useDeleteGroup() {
  const invalidate = useInvalidateGroupData();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await apiClient.delete(`/api/v1/groups/${id}`);
      return groupDeleteResponseSchema.parse(res.data.data);
    },
    onSuccess: invalidate,
  });
}

export function useSaveGroupAssignments(seasonId: number) {
  const invalidate = useInvalidateGroupData();
  return useMutation({
    mutationFn: async (body: GroupAssignmentsRequest) => {
      const res = await apiClient.put(`/api/v1/seasons/${seasonId}/group-assignments`, body);
      return groupAssignmentsResponseSchema.parse(res.data.data);
    },
    onSuccess: invalidate,
  });
}
```

- [ ] **Step 3: `GroupForm`**

```tsx
// apps/mobile/src/components/GroupForm.tsx
import { useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { groupWriteRequestSchema } from "@space/shared";

import { useLeaderOptions, useSeasonRoster, type GroupWriteInput } from "../hooks/use-group-admin";
import { firstErrorByField } from "../lib/form-errors";
import { useTheme } from "../theme";
import { Button, Card, ErrorState, Input, LoadingState, Text } from "../ui";

export interface GroupFormValues {
  name: string;
  description: string;
  leaderIds: number[];
  studentIds: number[];
}

const toggle = (ids: number[], id: number) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);

function CheckRow({ label, caption, checked, onPress }: { label: string; caption?: string | null; checked: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel={label} onPress={onPress}>
      <View style={{ paddingVertical: theme.spacing.xs }}>
        <Text variant="body">{`${checked ? "☑" : "☐"} ${label}`}</Text>
        {caption ? <Text variant="caption" color={theme.colors.neutral[600]}>{caption}</Text> : null}
      </View>
    </Pressable>
  );
}

/**
 * Create/edit a group (v1 group-form.tsx; spec 05 §9). v1 parity 2026-10-09
 * (spec 05 R18/R78): students are picked from EVERY live STUDENT user, as v1's
 * listStudentsForPicker (groups-query.ts:112-121), and saving enrols any of
 * them into the season. The server validates leaders are LEADERs (Plan 2's
 * validateGroupWrite) and returns name_taken / invalid_leader, shown verbatim
 * via `message`. Saving REPLACES the group's
 * leader and student lists (spec 05 R30) — the form says so.
 */
export function GroupForm({
  seasonId,
  groupId,
  initial,
  submitLabel,
  submitting,
  message,
  onSubmit,
}: {
  seasonId: number;
  groupId: number | null;
  initial: GroupFormValues;
  submitLabel: string;
  submitting: boolean;
  message: string | null;
  onSubmit: (body: GroupWriteInput) => void;
}) {
  const theme = useTheme();
  const leaders = useLeaderOptions(true);
  const roster = useSeasonRoster(seasonId);
  const [values, setValues] = useState(initial);
  const [query, setQuery] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = () => {
    const body: GroupWriteInput = {
      name: values.name.trim(),
      description: values.description.trim() === "" ? null : values.description,
      leaderIds: values.leaderIds,
      studentIds: values.studentIds,
    };
    const parsed = groupWriteRequestSchema.safeParse(body);
    if (!parsed.success) {
      setErrors(firstErrorByField(parsed.error));
      return;
    }
    setErrors({});
    onSubmit(body);
  };

  let leaderList: ReactNode;
  if (leaders.isPending) leaderList = <LoadingState />;
  else if (leaders.isError) leaderList = <ErrorState message="Couldn't load leaders." onRetry={() => void leaders.refetch()} />;
  else
    leaderList = leaders.data.map((l) => (
      <CheckRow
        key={l.id}
        label={l.name ?? l.email}
        checked={values.leaderIds.includes(l.id)}
        onPress={() => setValues({ ...values, leaderIds: toggle(values.leaderIds, l.id) })}
      />
    ));

  const q = query.trim().toLowerCase();
  let studentList: ReactNode;
  if (roster.isPending) studentList = <LoadingState />;
  else if (roster.isError) studentList = <ErrorState message="Couldn't load the roster." onRetry={() => void roster.refetch()} />;
  else
    studentList = roster.data
      .filter((r) => q === "" || (r.name ?? "").toLowerCase().includes(q) || r.email.toLowerCase().includes(q))
      // v1 parity 2026-10-09 (spec 05 R79): name/email only, no per-student caption
      // (v1 group-form.tsx:62-66); the one helper line below replaces them.
      .map((r) => (
        <CheckRow
          key={r.userId}
          label={r.name ?? r.email}
          checked={values.studentIds.includes(r.userId)}
          onPress={() => setValues({ ...values, studentIds: toggle(values.studentIds, r.userId) })}
        />
      ));

  return (
    <Card style={{ gap: theme.spacing.sm }}>
      <Input label="Name" value={values.name} onChangeText={(name) => setValues({ ...values, name })} error={errors.name} />
      <Input
        label="Description"
        value={values.description}
        onChangeText={(description) => setValues({ ...values, description })}
        multiline
        error={errors.description}
      />
      <Text variant="heading">Leaders</Text>
      {leaderList}
      <Text variant="heading">Students</Text>
      <Text variant="caption" color={theme.colors.neutral[600]}>
        Adding a student here will move them out of any other group.
      </Text>
      <Input label="Search students" value={query} onChangeText={setQuery} autoCapitalize="none" />
      {studentList}
      <Text variant="caption" color={theme.colors.neutral[600]}>
        Saving replaces this group's leaders and its student list.
      </Text>
      {message ? <Text variant="label" color={theme.colors.error[500]}>{message}</Text> : null}
      <Button title={submitLabel} onPress={submit} loading={submitting} />
    </Card>
  );
}
```

> **v1 parity 2026-10-09:** The student picker must list **every live STUDENT user** (`{ id, name, email }`, name asc), not `useSeasonRoster(seasonId)` (v1 `src/lib/groups-query.ts:112-121`, spec 05 R18/R78). Add a global student-options read beside `GET /groups/leader-options`: `GET /groups/student-options`, behind the same `isAdminOfAnySeason` gate, with a `useStudentOptions(enabled)` hook. Iterate it in `studentList`, now `apps/mobile/src/components/GroupForm.tsx:93-115`. The edit screen keeps pre-selecting from the roster, i.e. the group's current members. The per-row captions at `GroupForm.tsx:100-105` are removed in the block above, and v1's single helper line is rendered instead (v1 `src/components/groups/group-form.tsx:62-66,148`, spec 05 R79). Backend side: see the Task 4 note on `validateGroupWrite` / `setGroupStudents`.

- [ ] **Step 4: Screens.**

`group/new.tsx`:

```tsx
import { useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";

import { GroupForm } from "../../../src/components/GroupForm";
import { useCreateGroup } from "../../../src/hooks/use-group-admin";
import { apiErrorMessage } from "../../../src/lib/api-error";
import { parsePositiveInt } from "../../../src/lib/params";
import { EmptyState, Screen } from "../../../src/ui";

function NewGroupForm({ seasonId }: { seasonId: number }) {
  const router = useRouter();
  const create = useCreateGroup(seasonId);
  const [message, setMessage] = useState<string | null>(null);
  return (
    <GroupForm
      seasonId={seasonId}
      groupId={null}
      initial={{ name: "", description: "", leaderIds: [], studentIds: [] }}
      submitLabel="Create group"
      submitting={create.isPending}
      message={message}
      onSubmit={(body) => {
        setMessage(null);
        create.mutate(body, {
          // v1 parity 2026-10-09 (spec 05 R97): v1 group-form.tsx:107 returns to the season's groups.
          onSuccess: () => router.replace({ pathname: "/groups", params: { seasonId: String(seasonId) } }),
          onError: (err) => setMessage(apiErrorMessage(err, "Couldn't create the group.")),
        });
      }}
    />
  );
}

/** v1 admin/season/[code]/groups/new (spec 05 §9). Reached with ?seasonId= from /groups or the season detail. */
export default function NewGroupScreen() {
  const { seasonId: raw } = useLocalSearchParams<{ seasonId: string }>();
  const seasonId = parsePositiveInt(raw);
  return (
    <Screen edges={["top", "left", "right"]} scroll>
      {seasonId === null ? (
        <EmptyState title="No season" message="Open a season first, then add a group to it." />
      ) : (
        <NewGroupForm seasonId={seasonId} />
      )}
    </Screen>
  );
}
```

`group/[id]/edit.tsx`:

```tsx
import { useState, type ReactNode } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { GroupDetail, SeasonRosterRow } from "@space/shared";

import { GroupForm } from "../../../../src/components/GroupForm";
import { useDeleteGroup, useGroupImpact, useSeasonRoster, useUpdateGroup } from "../../../../src/hooks/use-group-admin";
import { useGroupDetail } from "../../../../src/hooks/use-groups";
import { apiErrorMessage } from "../../../../src/lib/api-error";
import { parsePositiveInt } from "../../../../src/lib/params";
import { useTheme } from "../../../../src/theme";
import { Button, Card, EmptyState, ErrorState, LoadingState, Screen, Text } from "../../../../src/ui";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** The confirmation v1 never had (spec 05 R45, Plan 6 D-16.13). */
function DeleteGroup({ groupId }: { groupId: number }) {
  const theme = useTheme();
  const router = useRouter();
  const impact = useGroupImpact(groupId);
  const remove = useDeleteGroup();
  const [armed, setArmed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const onDelete = () => {
    if (!armed) {
      setArmed(true);
      return;
    }
    setArmed(false);
    setMessage(null);
    remove.mutate(groupId, {
      onSuccess: () => router.replace("/groups"),
      onError: (err) => setMessage(apiErrorMessage(err, "Couldn't delete the group.")),
    });
  };

  return (
    <Card style={{ marginTop: theme.spacing.md, gap: theme.spacing.sm }}>
      <Text variant="heading">Delete</Text>
      {impact.isPending ? (
        <LoadingState />
      ) : impact.isError ? (
        <ErrorState message="Couldn't check what deleting would do." onRetry={() => void impact.refetch()} />
      ) : (
        <>
          <Text variant="body">
            {`Deleting unassigns ${plural(impact.data.studentCount, "student")} and removes ${plural(impact.data.leaderCount, "leader")}.`}
          </Text>
          {impact.data.soleTargetAssignments.length > 0 ? (
            <View style={{ gap: theme.spacing.xs }}>
              <Text variant="label">These assignments target only this group — retarget them first:</Text>
              {impact.data.soleTargetAssignments.map((a) => (
                <Text key={a.id} variant="caption">{a.title}</Text>
              ))}
            </View>
          ) : null}
        </>
      )}
      {message ? <Text variant="label" color={theme.colors.error[500]}>{message}</Text> : null}
      <Button title={armed ? "Really delete?" : "Delete group"} variant="ghost" onPress={onDelete} loading={remove.isPending} />
    </Card>
  );
}

function EditGroupLoaded({ detail, roster }: { detail: GroupDetail; roster: SeasonRosterRow[] }) {
  const router = useRouter();
  const update = useUpdateGroup(detail.id);
  const [message, setMessage] = useState<string | null>(null);
  return (
    <>
      <GroupForm
        seasonId={detail.seasonId}
        groupId={detail.id}
        initial={{
          name: detail.name,
          description: detail.description ?? "",
          leaderIds: detail.leaders.map((l) => l.id),
          // Membership from the season roster (SeasonEnrollment.groupId, C9) —
          // the same set the server's setGroupStudents keeps or removes.
          studentIds: roster.filter((r) => r.groupId === detail.id).map((r) => r.userId),
        }}
        submitLabel="Save group"
        submitting={update.isPending}
        message={message}
        onSubmit={(body) => {
          setMessage(null);
          update.mutate(body, {
            // v1 parity 2026-10-09 (spec 05 R97): v1 group-form.tsx:107 returns to the season's groups.
            onSuccess: () => router.replace({ pathname: "/groups", params: { seasonId: String(detail.seasonId) } }),
            onError: (err) => setMessage(apiErrorMessage(err, "Couldn't save the group.")),
          });
        }}
      />
      <DeleteGroup groupId={detail.id} />
    </>
  );
}

export default function EditGroupScreen() {
  const { id: raw } = useLocalSearchParams<{ id: string }>();
  const id = parsePositiveInt(raw);
  const detail = useGroupDetail(id);
  const roster = useSeasonRoster(detail.data?.canManage ? detail.data.seasonId : null);

  let body: ReactNode;
  if (id === null) body = <EmptyState title="Not found" message="That group link isn't valid." />;
  else if (detail.isPending) body = <LoadingState />;
  else if (detail.isError) body = <ErrorState message="Couldn't load this group." onRetry={() => void detail.refetch()} />;
  else if (!detail.data.canManage)
    body = <EmptyState title="Not available" message="Only this season's admins can edit its groups." />;
  else if (roster.isPending) body = <LoadingState />;
  else if (roster.isError) body = <ErrorState message="Couldn't load the roster." onRetry={() => void roster.refetch()} />;
  else body = <EditGroupLoaded key={detail.data.id} detail={detail.data} roster={roster.data} />;

  return (
    <Screen edges={["top", "left", "right"]} scroll>
      {body}
    </Screen>
  );
}
```

`group/[id]/index.tsx` (Plan 2's screen, moved by Task 5): import `useRouter` and `Button`, then render the Edit button under the season title when the server allows it:

```tsx
          {data.canManage ? (
            <Button
              title="Edit group"
              variant="secondary"
              onPress={() => router.push({ pathname: "/group/[id]/edit", params: { id: String(data.id) } })}
            />
          ) : null}
```

(`const router = useRouter();` at the top of `GroupDetailScreen`.) Add to `group-admin-screens.test.tsx`:

```tsx
import GroupDetailScreen from "../../app/(app)/group/[id]/index";

describe("/group/[id] — Edit for managers only (D-16.15)", () => {
  it("shows Edit when canManage", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    mockParams = { id: "3" };
    routeGets();
    renderWithProviders(<GroupDetailScreen />);
    fireEvent.press(await screen.findByText("Edit group"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/group/[id]/edit", params: { id: "3" } });
  });
});
```

Plan 2's fixtures carry `canManage: false` (Task 5), so its leader and student cases assert no Edit implicitly. Add `expect(screen.queryByText("Edit group")).toBeNull();` to Plan 2's "shows members with emails for a staff caller" case.

`groups.tsx` (replace; Plan 2's leader/student branch is kept verbatim as `MyGroups`):

```tsx
import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import type { GroupListItem } from "@space/shared";

import { SeasonSwitcher } from "../../src/components/SeasonSwitcher";
import { SEASON_GROUPS_ROLES } from "../../src/hooks/use-group-admin";
import { MY_GROUPS_ROLES, useMyGroups, useSeasonGroups } from "../../src/hooks/use-groups";
import { pickNewestSeasonId, useStaffSeasonSelection } from "../../src/hooks/use-season-selection";
import { parsePositiveInt } from "../../src/lib/params";
import { useSessionStore } from "../../src/store/session";
import { useTheme } from "../../src/theme";
import { Button, Card, EmptyState, ErrorState, LoadingState, Screen, Text } from "../../src/ui";

function GroupRow({ group, subtitle }: { group: GroupListItem; subtitle: string }) {
  const theme = useTheme();
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: "/group/[id]", params: { id: String(group.id) } })}
    >
      <Card style={{ marginBottom: theme.spacing.sm }}>
        <Text variant="heading">{group.name}</Text>
        <Text variant="label" color={theme.colors.neutral[600]}>{subtitle}</Text>
      </Card>
    </Pressable>
  );
}

/** LEADER / STUDENT — Plan 2's branch, unchanged in behaviour. */
function MyGroups() {
  const { data, isPending, isError, refetch, isRefetching } = useMyGroups(true);
  return (
    <Screen edges={["top", "left", "right"]} onRefresh={() => void refetch()} refreshing={isRefetching}>
      {isPending ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState message="Couldn't load your groups. Check your connection and try again." onRetry={refetch} />
      ) : data.length === 0 ? (
        <EmptyState title="No groups" message="You aren't in any groups yet." />
      ) : (
        <>
          {data.map((group) => (
            <GroupRow key={group.id} group={group} subtitle={`${group.seasonTitle} · ${group.studentCount} students`} />
          ))}
        </>
      )}
    </Screen>
  );
}

/**
 * ADMIN / SUPER — a season's groups with a season switcher (Plan 6
 * D-16.16; spec 05 §9). v1 parity 2026-10-09 (R91): the default is v1's
 * redirect target, the newest administered season by startDate with no
 * ACTIVE preference; the switcher stands in for v1's per-season URL.
 * v1 refused SUPER (R92); that is not ported.
 */
function SeasonGroups() {
  const theme = useTheme();
  const router = useRouter();
  // v1 parity 2026-10-09 (spec 05 R91/R97): newest-by-startDate default, and an
  // optional `seasonId` param (sent by group create/edit) as the initial pick.
  const { seasonId: seasonParam } = useLocalSearchParams<{ seasonId?: string }>();
  const selection = useStaffSeasonSelection(true, { pick: pickNewestSeasonId, initialId: parsePositiveInt(seasonParam) });
  const groups = useSeasonGroups(selection.seasonId);

  let body;
  if (selection.isPending) body = <LoadingState />;
  else if (selection.isError) body = <ErrorState message="Couldn't load your seasons." onRetry={selection.refetch} />;
  else if (selection.season === null)
    body = <EmptyState title="No season" message="You aren't assigned to a season yet." />;
  else {
    const season = selection.season;
    body = (
      <>
        <SeasonSwitcher seasons={selection.seasons} selectedId={season.id} onSelect={selection.setSeasonId} />
        <View style={{ flexDirection: "row", gap: theme.spacing.sm, marginBottom: theme.spacing.md }}>
          <Button
            title="New group"
            variant="secondary"
            onPress={() => router.push({ pathname: "/group/new", params: { seasonId: String(season.id) } })}
          />
          <Button
            title="Roster"
            variant="secondary"
            onPress={() => router.push({ pathname: "/seasons/[code]/roster", params: { code: season.code } })}
          />
        </View>
        {groups.isPending ? (
          <LoadingState />
        ) : groups.isError ? (
          <ErrorState message="Couldn't load this season's groups." onRetry={() => void groups.refetch()} />
        ) : groups.data.length === 0 ? (
          <EmptyState title="No groups" message="This season has no groups yet." />
        ) : (
          groups.data.map((g) => (
            <GroupRow
              key={g.id}
              group={g}
              subtitle={g.leaderNames.length > 0 ? `${g.studentCount} students · ${g.leaderNames.join(", ")}` : `${g.studentCount} students`}
            />
          ))
        )}
      </>
    );
  }

  return (
    <Screen
      edges={["top", "left", "right"]}
      scroll
      onRefresh={() => {
        if (selection.seasonId !== null) void groups.refetch();
        else selection.refetch();
      }}
      refreshing={groups.isRefetching}
    >
      {body}
    </Screen>
  );
}

export default function GroupsScreen() {
  const role = useSessionStore((s) => s.user?.role ?? null);
  if (role !== null && SEASON_GROUPS_ROLES.includes(role)) return <SeasonGroups />;
  if (role !== null && MY_GROUPS_ROLES.includes(role)) return <MyGroups />;
  // MENTOR: no /groups in its nav, reachable by deep link (spec 05 §9).
  return (
    <Screen edges={["top", "left", "right"]}>
      <EmptyState title="Groups" message="Groups aren't available for your role." />
    </Screen>
  );
}
```

`seasons/[code]/roster/index.tsx`:

```tsx
import { useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import type { GroupListItem, SeasonRosterRow } from "@space/shared";

import { useSaveGroupAssignments, useSeasonRoster } from "../../../../../src/hooks/use-group-admin";
import { useSeasonGroups } from "../../../../../src/hooks/use-groups";
import { useSeasonByCode } from "../../../../../src/hooks/use-seasons";
import { apiErrorMessage } from "../../../../../src/lib/api-error";
import { useTheme } from "../../../../../src/theme";
import { Button, Card, EmptyState, ErrorState, Input, LoadingState, Screen, Text } from "../../../../../src/ui";

export const ROSTER_UNASSIGNED_LABEL = "Unassigned";

function GroupChip({ label, selected, onPress, a11yLabel }: { label: string; selected: boolean; onPress: () => void; a11yLabel: string }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={a11yLabel}
      onPress={onPress}
      style={{
        paddingVertical: theme.spacing.xs,
        paddingHorizontal: theme.spacing.sm,
        borderRadius: theme.radii.sm,
        borderWidth: theme.borderWidths.thin,
        borderColor: selected ? theme.colors.primary[600] : theme.colors.neutral[300],
      }}
    >
      <Text variant="caption">{label}</Text>
    </Pressable>
  );
}

/**
 * The bulk-assign grid (v1 roster-grid.tsx; spec 05 §9; G7). Sends only the
 * rows whose choice differs from the server's (v1 R100) and reports the
 * server's WRITTEN counts, not the number sent (R101/D-16.12). Rows are ACTIVE
 * enrolments (C9); a student sitting in another season's group says so (R82).
 */
function RosterGrid({ seasonId }: { seasonId: number }) {
  const theme = useTheme();
  const roster = useSeasonRoster(seasonId);
  const groups = useSeasonGroups(seasonId);
  const save = useSaveGroupAssignments(seasonId);
  const [draft, setDraft] = useState<Record<number, number | null>>({});
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  if (roster.isPending || groups.isPending) return <LoadingState />;
  if (roster.isError) return <ErrorState message="Couldn't load the roster." onRetry={() => void roster.refetch()} />;
  if (groups.isError) return <ErrorState message="Couldn't load the groups." onRetry={() => void groups.refetch()} />;
  if (roster.data.length === 0) {
    return <EmptyState title="No active students" message="Nobody is actively enrolled in this season yet." />;
  }
  if (groups.data.length === 0) {
    return <EmptyState title="No groups" message="Create a group first, then assign students to it." />;
  }

  const choice = (r: SeasonRosterRow) => (r.userId in draft ? (draft[r.userId] ?? null) : r.groupId);
  const pick = (r: SeasonRosterRow, groupId: number | null) => {
    setMessage(null);
    setDraft((d) => {
      const next = { ...d };
      if (groupId === r.groupId) delete next[r.userId];
      else next[r.userId] = groupId;
      return next;
    });
  };
  // Roster order, so the batch is deterministic.
  const changes = roster.data
    .filter((r) => r.userId in draft)
    .map((r) => ({ studentUserId: r.userId, groupId: draft[r.userId] ?? null }));

  const onSave = () => {
    save.mutate(
      { assignments: changes },
      {
        onSuccess: (result) => {
          setDraft({});
          const skipped = result.skippedStudentIds.length;
          // v1 parity 2026-10-09 (spec 05 R101): v1's "Updated N student(s)." (roster-grid.tsx:84-87);
          // N is what the server wrote (KEEP-FIX R57), the skipped note is KEEP-FIX R52.
          const n = result.assigned + result.unassigned;
          setMessage(
            `Updated ${n} student${n === 1 ? "" : "s"}.` +
              (skipped > 0 ? ` ${skipped} skipped — no longer active in this season.` : ""),
          );
        },
        onError: (err) => setMessage(apiErrorMessage(err, "Couldn't save the roster.")),
      },
    );
  };

  const q = query.trim().toLowerCase();
  const rows = roster.data.filter(
    (r) => q === "" || (r.name ?? "").toLowerCase().includes(q) || r.email.toLowerCase().includes(q),
  );
  const options: (GroupListItem | null)[] = [null, ...groups.data];

  return (
    <>
      <Input label="Search students" value={query} onChangeText={setQuery} autoCapitalize="none" />
      {rows.map((r) => {
        const label = r.name ?? r.email;
        const current = choice(r);
        return (
          <Card key={r.userId} style={{ marginTop: theme.spacing.sm, gap: theme.spacing.xs }}>
            <Text variant="body">{label}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.xs }}>
              {options.map((g) => {
                const name = g?.name ?? ROSTER_UNASSIGNED_LABEL;
                return (
                  <GroupChip
                    key={g?.id ?? "none"}
                    label={name}
                    a11yLabel={`${label}: ${name}`}
                    selected={current === (g?.id ?? null)}
                    onPress={() => pick(r, g?.id ?? null)}
                  />
                );
              })}
            </View>
          </Card>
        );
      })}
      {message ? <Text variant="label" style={{ marginTop: theme.spacing.md }}>{message}</Text> : null}
      <Button
        title={`Save ${changes.length} change${changes.length === 1 ? "" : "s"}`}
        onPress={onSave}
        disabled={changes.length === 0}
        loading={save.isPending}
        style={{ marginTop: theme.spacing.md }}
      />
    </>
  );
}

/** /seasons/[code]/roster — Plan 17 adds `roster/import.tsx` beside this and a link to it here. */
export default function SeasonRosterScreen() {
  const { code: raw } = useLocalSearchParams<{ code: string }>();
  const code = typeof raw === "string" && raw.length > 0 ? raw : null;
  const season = useSeasonByCode(code);

  let body: ReactNode;
  if (code === null) body = <EmptyState title="Not found" message="That season link isn't valid." />;
  else if (season.isPending) body = <LoadingState />;
  else if (season.isError) body = <ErrorState message="Couldn't load this season." onRetry={() => void season.refetch()} />;
  else if (!season.data.canAdminister)
    body = <EmptyState title="Not available" message="Only this season's admins can manage its roster." />;
  else body = <RosterGrid seasonId={season.data.id} />;

  return (
    <Screen edges={["top", "left", "right"]} scroll>
      {body}
    </Screen>
  );
}
```

The theme tokens `primary[600]`, `radii.sm` and `borderWidths.thin` are used by Plan 0's `Input` / `Button`. If `primary` is named differently in `tokens.ts`, use the key `Button`'s primary variant uses. If `Button` has no `style` prop, wrap it in a `View` with that margin.

- [ ] **Step 5: Run.**
- `cd apps/mobile && pnpm jest src/__tests__/group-admin-screens.test.tsx src/__tests__/groups-screens.test.tsx` → PASS.
- `pnpm turbo lint typecheck --filter=@space/mobile` → clean.

- [ ] **Step 6: Commit** — `git add apps/mobile && git commit -m "feat(mobile): season groups for admins, group create/edit/delete with impact, roster grid"`

---

### Task 9: Calendar — multi-season, windowed, ADMIN switcher *(agent M4)*

**Files (exclusive to M4):**
- Modify: `apps/mobile/src/hooks/use-sessions.ts` (append `useSessionRange`)
- Create: `apps/mobile/src/lib/day-groups.ts`
- Replace: `apps/mobile/app/(app)/calendar.tsx`
- Modify: `apps/mobile/src/__tests__/calendar-screen.test.tsx` (delete Plan 4's ADMIN case, "renders an admin's calendar from their first ACTIVE season — same route file"; append the cases below)

**Interfaces:**
- Consumes: Task 1's `sessionRangeResponseSchema`; Plan 4's `useCurrentSeasonId`, `formatDayKey`; Plan 5's `formatWallTime`; Phase 0's `useSeasonSessions`; Task 5's `useStaffSeasonSelection`, `SeasonSwitcher`, `queryKeys.sessions.range`.
- Produces: `useSessionRange(params, enabled)`; `groupSessionsByDay(sessions): DayGroup[]` (Plan 14's events merge buckets around it); the role-branched calendar (G17).

- [ ] **Step 1: Failing tests.** Delete Plan 4's ADMIN case, then append to `calendar-screen.test.tsx`. Reuse that file's `session(...)` helper, which Task 5 gave `startTime`; its `seasonRow`, `studentSession` and `adminSession`; and its `get` and `mockPush`. Add `import { makeSession } from "./helpers/session";`.

```tsx
const range = (sessions: unknown[]) => ({
  data: { data: { sessions, from: "2099-02-28T22:00:00.000Z", to: "2099-04-25T22:00:00.000Z", fromDayKey: "2099-03-01", toDayKey: "2099-04-25" } },
});

describe("calendar — staff branches (G17, D-16.7)", () => {
  it("gives ADMIN the current season through GET /sessions, with a season switcher", async () => {
    useSessionStore.setState(adminSession);
    get.mockImplementation((url: string, config?: { params?: { seasonId?: number } }) => {
      if (url === "/api/v1/seasons") {
        return Promise.resolve({ data: { data: { seasons: [seasonRow(8, 2027, "DRAFT"), seasonRow(7, 2026, "ACTIVE")] } } });
      }
      if (url === "/api/v1/sessions") {
        const title = config?.params?.seasonId === 8 ? "Draft season session" : "Kickoff";
        return Promise.resolve(range([session(1, title, "2099-03-01T18:00:00.000Z", "2099-03-01")]));
      }
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });

    renderWithProviders(<CalendarScreen />);

    expect(await screen.findByText("Kickoff")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/sessions", { params: { seasonId: 7 } });
    fireEvent.press(screen.getByText("Season 8"));
    expect(await screen.findByText("Draft season session")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/sessions", { params: { seasonId: 8 } });
  });

  it("gives SUPER every ACTIVE season in one window, labels each row's season, and pages", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    get.mockResolvedValue(
      range([
        { ...session(1, "Spring kickoff", "2099-03-01T18:00:00.000Z", "2099-03-01"), seasonTitle: "Spring 2099" },
        { ...session(2, "Autumn kickoff", "2099-03-01T19:00:00.000Z", "2099-03-01"), seasonId: 9, seasonTitle: "Autumn 2099" },
      ]),
    );

    renderWithProviders(<CalendarScreen />);

    expect(await screen.findByText("Spring kickoff")).toBeTruthy();
    expect(screen.getByText("Spring 2099")).toBeTruthy();
    expect(screen.getByText("Autumn 2099")).toBeTruthy();
    expect(screen.getByText("Mar 1, 2099 – Apr 25, 2099")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/sessions", { params: {} });

    fireEvent.press(screen.getByText("Later"));
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith("/api/v1/sessions", { params: { from: "2099-04-25T22:00:00.000Z" } }),
    );
    fireEvent.press(screen.getByText("Earlier"));
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith("/api/v1/sessions", { params: { to: "2099-02-28T22:00:00.000Z" } }),
    );
  });

  it("renders the server's org time, not the device's reading of startsAt (X13)", async () => {
    useSessionStore.setState(makeSession("LEADER", { groupLeaderIds: [3] }));
    get.mockResolvedValue(range([{ ...session(1, "Kickoff", "2099-03-01T18:00:00.000Z", "2099-03-01"), startTime: "20:00" }]));
    renderWithProviders(<CalendarScreen />);
    expect(await screen.findByText("8:00 PM")).toBeTruthy();
  });

  it("tells a leader with no groups so, and fetches nothing (spec 03 R84)", async () => {
    useSessionStore.setState(makeSession("LEADER", { groupLeaderIds: [] }));
    renderWithProviders(<CalendarScreen />);
    expect(await screen.findByText("You don't lead any groups yet.")).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  });

  it("gives MENTOR a graceful state (spec 03 §9)", async () => {
    useSessionStore.setState(makeSession("MENTOR"));
    renderWithProviders(<CalendarScreen />);
    expect(await screen.findByText("The calendar isn't available for your role.")).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  });
});
```

`fireEvent` and `waitFor` are imported at the top of that file; add `waitFor` to its existing import if missing. Plan 4's student cases stay as they are: the student path is unchanged.

Run: `cd apps/mobile && pnpm jest src/__tests__/calendar-screen.test.tsx`. Expected: FAIL.

> **v1 parity 2026-10-09:** Two of these cases change. (1) The ADMIN case drops the switcher. It asserts the newest ACTIVE season (`seasonId: 7`) is requested, that no `Season 8` control renders, and that an admin with no seasons sees "No active season found." (v1 `src/app/admin/calendar/page.tsx:16-40`, spec 03 R86). (2) The SUPER case drops the "Earlier"/"Later" presses and the window header. The Upcoming view requests `/api/v1/sessions` with no bounds and renders only rows with `dayKey >= todayDayKey`. The `range()` fixture gains `todayDayKey`, and its `to`/`toDayKey` may be `null` (v1 `src/components/sessions/season-calendar.tsx:236-251`, spec 03 R98). Mutation 20 in Task 10 changes with case (1).

- [ ] **Step 2: Hook + helper.** Append to `src/hooks/use-sessions.ts` (add `sessionRangeResponseSchema, type SessionRange` to its shared import):

```ts
export interface SessionRangeParams {
  seasonId: number | null;
  from: string | null;
  to: string | null;
}

/**
 * GET /api/v1/sessions (Plan 6 D-16.7): the role decides which seasons. With
 * no bounds the server returns every session, unbounded (v1 parity 2026-10-09,
 * spec 03 R75). Week/Month pass both bounds. The Upcoming view passes none and
 * filters on the server's `todayDayKey` (R98), so the server still owns every
 * org-day boundary (C2).
 */
export function useSessionRange(params: SessionRangeParams, enabled: boolean): UseQueryResult<SessionRange> {
  return useQuery({
    queryKey: queryKeys.sessions.range(params),
    queryFn: async () => {
      const query: Record<string, string | number> = {};
      if (params.seasonId !== null) query.seasonId = params.seasonId;
      if (params.from !== null) query.from = params.from;
      if (params.to !== null) query.to = params.to;
      const res = await apiClient.get("/api/v1/sessions", { params: query });
      return sessionRangeResponseSchema.parse(res.data.data);
    },
    enabled,
  });
}
```

```ts
// apps/mobile/src/lib/day-groups.ts
import type { SessionListItem } from "@space/shared";

export interface DayGroup {
  dayKey: string;
  sessions: SessionListItem[];
}

/**
 * Groups by the server's `dayKey` (ruling X13) — never by formatting
 * `startsAt` on the device. Input is ordered by `startsAt`, so consecutive
 * rows sharing a key are one day. (Plan 4's calendar helper, moved here so
 * Plan 14's events merge can reuse it.)
 */
export function groupSessionsByDay(sessions: SessionListItem[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const s of sessions) {
    const last = groups[groups.length - 1];
    if (last && last.dayKey === s.dayKey) last.sessions.push(s);
    else groups.push({ dayKey: s.dayKey, sessions: [s] });
  }
  return groups;
}
```

- [ ] **Step 3: `calendar.tsx`** (replace):

> **v1 parity 2026-10-09:** In the block below, (a) `RangeSessions` (the Upcoming view, now `apps/mobile/app/(app)/calendar.tsx:200-247`) loses its window state and the "Earlier"/"Later" buttons. It calls `useSessionRange({ seasonId, from: null, to: null })` and renders `data.sessions.filter((s) => s.dayKey >= data.todayDayKey)`, which is everything from the start of today onward. Events get the same filter. `onOrgToday` reads `data.todayDayKey`. The empty state reads v1's "Nothing coming up" (v1 `season-calendar.tsx:236-251`, spec 03 R98). (b) `AdminCalendar` (now `calendar.tsx:294-314`) renders no `SeasonSwitcher`. It shows the `pickCurrentSeasonId` season's full calendar, or `EmptyState` "No active season found." when there is none (v1 `src/app/admin/calendar/page.tsx:16-40`, spec 03 R86).

```tsx
import { useState, type ReactNode } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import type { SessionListItem } from "@space/shared";

import { SeasonSwitcher } from "../../src/components/SeasonSwitcher";
import { useCurrentSeasonId } from "../../src/hooks/use-seasons";
import { useStaffSeasonSelection } from "../../src/hooks/use-season-selection";
import { useSeasonSessions, useSessionRange } from "../../src/hooks/use-sessions";
import { groupSessionsByDay } from "../../src/lib/day-groups";
import { formatDayKey, formatWallTime } from "../../src/lib/format";
import { useSessionStore } from "../../src/store/session";
import { useTheme } from "../../src/theme";
import { Button, Card, EmptyState, ErrorState, LoadingState, Screen, Text } from "../../src/ui";

/** Day-grouped session cards. Every day and time is the server's org-clock value (X13). */
function SessionDays({ sessions, showSeason }: { sessions: SessionListItem[]; showSeason: boolean }) {
  const theme = useTheme();
  const router = useRouter();
  return (
    <>
      {groupSessionsByDay(sessions).map((group) => (
        <View key={group.dayKey} style={{ marginBottom: theme.spacing.md }}>
          <Text variant="heading">{formatDayKey(group.dayKey)}</Text>
          {group.sessions.map((s) => (
            <Card
              key={s.id}
              style={{ marginTop: theme.spacing.sm }}
              onPress={() => router.push({ pathname: "/session/[id]", params: { id: String(s.id) } })}
            >
              <Text variant="body">{s.title}</Text>
              <Text variant="label" color={theme.colors.neutral[600]}>
                {s.location ? `${formatWallTime(s.startTime)} · ${s.location}` : formatWallTime(s.startTime)}
              </Text>
              {/* v1's per-season colour legend (R89) becomes a label on a phone. */}
              {showSeason ? <Text variant="caption" color={theme.colors.neutral[600]}>{s.seasonTitle}</Text> : null}
            </Card>
          ))}
        </View>
      ))}
    </>
  );
}

/** STUDENT / ALUMNI — Plan 4's pinned-season calendar (no window: one season). */
function PinnedSeasonCalendar() {
  const current = useCurrentSeasonId();
  const sessions = useSeasonSessions(current.seasonId);

  let body: ReactNode;
  if (current.isPending) body = <LoadingState />;
  else if (current.isError) body = <ErrorState message="Couldn't load your seasons." onRetry={current.refetch} />;
  else if (current.seasonId === null)
    body = <EmptyState title="No season to show" message="You aren't in a season right now, so there are no sessions on your calendar." />;
  else if (sessions.isPending) body = <LoadingState />;
  else if (sessions.isError)
    body = <ErrorState message="Couldn't load sessions. Check your connection and try again." onRetry={() => void sessions.refetch()} />;
  else if (sessions.data.length === 0) body = <EmptyState title="No sessions" message="This season doesn't have any sessions yet." />;
  else body = <SessionDays sessions={sessions.data} showSeason={false} />;

  return (
    <Screen
      edges={["top", "left", "right"]}
      scroll
      onRefresh={() => {
        if (current.seasonId !== null) void sessions.refetch();
        else current.refetch();
      }}
      refreshing={sessions.isRefetching}
    >
      {body}
    </Screen>
  );
}

/** A windowed GET /sessions view (D-16.7) with Earlier / Later paging. */
function RangeSessions({ seasonId, showSeason }: { seasonId: number | null; showSeason: boolean }) {
  const theme = useTheme();
  const [window, setWindow] = useState<{ from: string | null; to: string | null }>({ from: null, to: null });
  const range = useSessionRange({ seasonId, from: window.from, to: window.to }, true);

  if (range.isPending) return <LoadingState />;
  if (range.isError) {
    return <ErrorState message="Couldn't load sessions. Check your connection and try again." onRetry={() => void range.refetch()} />;
  }
  const data = range.data;
  return (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: theme.spacing.md }}>
        <Button title="Earlier" variant="ghost" onPress={() => setWindow({ from: null, to: data.from })} />
        <Text variant="label">{`${formatDayKey(data.fromDayKey)} – ${formatDayKey(data.toDayKey)}`}</Text>
        <Button title="Later" variant="ghost" onPress={() => setWindow({ from: data.to, to: null })} />
      </View>
      {data.sessions.length === 0 ? (
        <EmptyState title="No sessions" message="Nothing is scheduled in this window." />
      ) : (
        <SessionDays sessions={data.sessions} showSeason={showSeason} />
      )}
    </>
  );
}

/** SUPER (every ACTIVE season) and LEADER (every led season) — G17. */
function MultiSeasonCalendar() {
  return (
    <Screen edges={["top", "left", "right"]} scroll>
      <RangeSessions seasonId={null} showSeason />
    </Screen>
  );
}

/** ADMIN — one season at a time, switchable (spec 03 §9; v1 forced one via redirect, R86). */
function AdminCalendar() {
  const selection = useStaffSeasonSelection(true);
  let body: ReactNode;
  if (selection.isPending) body = <LoadingState />;
  else if (selection.isError) body = <ErrorState message="Couldn't load your seasons." onRetry={selection.refetch} />;
  else if (selection.seasonId === null) body = <EmptyState title="No season to show" message="You aren't assigned to a season yet." />;
  else
    body = (
      <>
        <SeasonSwitcher seasons={selection.seasons} selectedId={selection.seasonId} onSelect={selection.setSeasonId} />
        {/* key: switching season starts again from the default window. */}
        <RangeSessions key={selection.seasonId} seasonId={selection.seasonId} showSeason={false} />
      </>
    );
  return (
    <Screen edges={["top", "left", "right"]} scroll>
      {body}
    </Screen>
  );
}

/**
 * /calendar — one route, every role (Decision D1). STUDENT/ALUMNI keep
 * Plan 4's pinned season; ADMIN gets a season switcher; SUPER and LEADER see
 * every season the server scopes them to, in an org-day window. MENTOR has
 * no calendar in its nav (spec 03 §9).
 */
export default function CalendarScreen() {
  const role = useSessionStore((s) => s.user?.role ?? null);
  const leadsNothing = useSessionStore(
    (s) => s.user?.role === "LEADER" && (s.scopes?.groupLeaderIds.length ?? 0) === 0,
  );

  if (role === "MENTOR") {
    return (
      <Screen edges={["top", "left", "right"]}>
        <EmptyState title="Calendar" message="The calendar isn't available for your role." />
      </Screen>
    );
  }
  if (leadsNothing) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <EmptyState title="No calendar" message="You don't lead any groups yet." />
      </Screen>
    );
  }
  if (role === "SUPER" || role === "LEADER") return <MultiSeasonCalendar />;
  if (role === "ADMIN") return <AdminCalendar />;
  return <PinnedSeasonCalendar />;
}
```

- [ ] **Step 4: Run.**
- `cd apps/mobile && pnpm jest src/__tests__/calendar-screen.test.tsx` → PASS (Plan 4's student cases plus the five new ones).
- `pnpm turbo lint typecheck --filter=@space/mobile` → clean.
- `grep -n "formatSessionTime\|formatDate(" "apps/mobile/app/(app)/calendar.tsx"` → no output (X13).

- [ ] **Step 5: Commit** — `git add apps/mobile && git commit -m "feat(mobile): multi-season windowed calendar with admin season switcher"`

---

### Task 10: Closing gate *(coordinator)*

- [ ] **Step 1: Full gates.**
- `pnpm turbo lint typecheck test:unit build` → green. M1–M4 merge cleanly by construction: no two streams share a file. If M3 also created `useSeasonByCode`, keep one copy, M1's.
- Then the full serial integration run: `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern integration` → green. In particular, `seasons-admin-routes`, `roster-routes`, `session-admin-routes`, `group-admin-routes` and the unchanged `seasons-routes`, `sessions-routes`, `groups-routes`, `check-in-routes` and `attendance-routes` all pass.

- [ ] **Step 2: Mutation pass.** Apply one mutation at a time, run the named suite, and restore. Each must fail the named test.
  1. `routes/seasons.ts`: re-add `seasonsRouter.use(requireAuth);` → `seasons-admin-routes` "answers an unknown anonymous path … with not_found" fails (X5).
  2. Move `GET "/by-code/:code"` below `GET "/:id/roster"` → "is not shadowed by an /:id child route" fails (400, not 404).
  3. `eligibleStudentIds`: drop `status: "ACTIVE"` → `roster-routes` "assigns, unassigns, skips non-ACTIVE" fails (the withdrawn student gets assigned). This is the contract Plan 17 relies on.
  4. `unassignStudentsFromGroups`: drop `group: { seasonId }` from the `groupStudent.deleteMany` → the same test fails (the other-season membership is deleted).
  5. `assignStudentsToGroups`: skip the `GroupOutsideSeasonError` check → "refuses the WHOLE batch" fails.
  6. `calendarScopeFor`: for ADMIN with a `seasonId`, return `{ kind: "seasons", seasonIds: [seasonId] }` without `isAdminOfSeason` → `session-admin-routes` "scopes ADMIN … seasonId never widens" fails.
  7. `listSessionsInRange`: drop `status: "ACTIVE"` from the `active` branch → "never a DRAFT season's" fails.
  8. `GET /sessions`: pass `() => true` as `includeTokenFor` → "gives LEADER … no check-in token" fails.
  9. `sessionStartFrom`: return `new Date(\`${body.startDay}T${body.startTime}:00.000Z\`)` → "composes startDay + startTime in ORG_TIMEZONE, across DST" fails.
  10. `check-in-regenerate`: also write `checkInClosedAt: new Date()` → "regenerates the token, keeps the window open" fails.
  11. `DELETE /groups/:id`: drop the sole-target re-check → `group-admin-routes` "refuses to delete while an assignment would be left targeting nobody" fails.
  12. `loadGroupImpact`: drop `deletedAt: null` → "previews the impact — live, sole-target assignments only" fails (the deleted assignment appears).
  13. `GET /sessions/:id/quizzes`: gate on `canAccessSeason` instead of `attendanceScopeFor` → "refuses a student" fails.
  14. Mobile `session/[id]/index.tsx`: in `onRegenerate`, drop the `regenArmed` branch → `session-detail.test.tsx` "regenerates an OPEN session's code only on a confirming second press" fails.
  15. Mobile `SessionForm.sessionWriteFields`: send `startsAt: new Date(\`${v.day}T${v.time}\`).toISOString()` instead of the wall-clock pair → `session-forms.test.tsx` "sends org wall-clock fields" fails (X13).
  16. Mobile `session/[id]/edit.tsx`: render `ScopeSelector` regardless of `isSeries` → "hides the scope selector for a one-off session" fails.
  17. Mobile roster grid: send every row instead of `changes` → `group-admin-screens.test.tsx` "sends only the rows that changed" fails.
  18. Mobile `groups.tsx`: route ADMIN to `MyGroups` → "/groups — ADMIN/SUPER season branch" fails.
  19. Mobile `seasons/[code]/edit.tsx`: initialise `budget` to `"180"` instead of the stored value → "saves identity AND status … keeping the stored budgets" fails (240).
  20. Mobile `calendar.tsx`: pass `seasonId={null}` from `AdminCalendar` → "gives ADMIN the current season through GET /sessions" fails. *(v1 parity 2026-10-09: the case no longer has a season switcher, R86)*

- [ ] **Step 3: Build-output check** (X12): `grep -rn 'require("@space/shared")' apps/backend/dist/` → empty.

- [ ] **Step 4: Route-shape checks.**
- `cd apps/mobile && pnpm jest src/__tests__/role-tabs.test.tsx src/__tests__/app-layout.test.tsx` → green.
- `ls "apps/mobile/app/(app)/seasons.tsx" "apps/mobile/app/(app)/group/[id].tsx" 2>&1` → both "No such file" (X7).

- [ ] **Step 5: Health check against a built server** (X6, CLAUDE.md tmux rule):

```bash
mkdir -p ~/logs
tmux kill-session -t space-v2-plan16 2>/dev/null
tmux new -d -s space-v2-plan16 "pnpm --filter @space/backend start 2>&1 | tee ~/logs/space-v2-plan16.log"
curl -fsS localhost:4000/health
curl -s localhost:4000/api/v1/seasons/1/space-v2-no-such-route   # → {"error":{"code":"not_found",...}}
tmux kill-session -t space-v2-plan16
```

- [ ] **Step 6: Device checklist** (staging, Expo Go).
- **As SUPER:**
  1. `/seasons`: seasons appear grouped under program headings, year desc within each. Open a program heading (by-program screen) and `/seasons/year/<year>`, then open a season by tapping it. *(v1 parity 2026-10-09: was "filter by a program")*
  2. Edit it: change status DRAFT → ACTIVE and save. The detail shows ACTIVE.
  3. Rename the code. The screen follows the new code, and the old link 404s with "Couldn't load this season".
  4. Delete an in-use season. It is refused with the server's message.
  5. `/calendar`: shows several ACTIVE seasons' sessions with season labels; Upcoming lists everything from today onward with no paging, and past sessions show in Week/Month. *(v1 parity 2026-10-09: was ""Later" pages forward 8 weeks")*
- **As ADMIN:**
  1. `/calendar` shows the newest ACTIVE season they administer, with no season picker. *(v1 parity 2026-10-09: was "Switch season and the list changes")*
  2. Season detail → New session: create a 3-week series at 19:30. The detail header reads "7:30 PM" on a phone set to a non-Cairo timezone (X13, observed for real).
  3. Edit → "This and following": the preview counts the right sessions. Save, and the calendar moves them.
  4. Delete a session with attendance: refused, then forced.
  5. Open check-in: QR shows. Kill and relaunch the app: the QR is still there (from `GET /check-in`).
  6. Regenerate: needs a second press, and the student's old code is rejected.
  7. `/groups`: switch season, create a group with a leader and two students, edit it, then try to delete it while an assignment targets only it (refused, with the assignment named). Retarget the assignment and delete.
  8. Roster: move three students, save. The message reports written counts, and a student in another season's group shows the "Also in" note.
- **As LEADER:**
  1. `/calendar` shows every led season, with no QR anywhere.
  2. Session detail shows the read-only roster and, when quizzes exist, the Quizzes card.
  3. `/seasons/<code>` is read-only.
- **As MENTOR:** `/calendar` and `/groups` deep links show the graceful states.

- [ ] **Step 7: Report.** Include:
- suite counts and the twenty mutation outcomes;
- checklist results;
- any divergence from this plan;
- confirmation that `assignStudentsToGroups` / `GroupOutsideSeasonError` ship with the exact signature, so Plan 17 can consume them.

---

## Not in this plan (owner named)

- **Group import screen** `seasons/[code]/roster/import.tsx` and its link on the roster: **Plan 17**. The backend uses this plan's `assignStudentsToGroups`; the screen uses `useSeasonByCode`, `useSeasonRoster` and `useSeasonGroups`.
- **Quiz row navigation** on `SessionQuizzesCard`, and the quiz create form v1 shows on the admin session page: **Plan 8**.
- **Calendar JPC events merge:** **Plan 14**, on `calendar.tsx` / `groupSessionsByDay`.
- **Dashboard links into seasons:** **Plan 16**.
- **Leader picker via domain 11's `GET /users?role=`:** **Plan 9** may replace `GET /groups/leader-options` (D-16.14).
- **Video-question editor** on the admin session page (v1 `VideoQuestionsEditor`): **Plan 14**.
- **Student check-in scanner:** **Plan 11**.
- **Season duplicate sheet with spec 02 D6's copy:** stays Plan 4's inline form. Plan 4's DuplicateForm should say "leaders and students are not copied"; this is a one-line copy fix, recorded as a Plan 4 follow-up, not done here.
- **Spec 02 D11's "ended N days ago and still Active" hint:** it needs a server-derived field (C4). It is not added here and is recorded for Plan 16's dashboard spec.
- **Deferred to cutover (Plan 18, C1):**
  - `GroupStudent` composite key, so membership is per season (spec 05 R1; an assignment here still moves a student's other-season membership, and the roster shows it);
  - `(seasonId, lower(name))` uniqueness on `Group`;
  - a `Season.timezone` column (M6).

## Self-review against the brief and rulings

- **G4:** `/seasons/[code]` via `by-code`, SUPER edit (identity + status + delete) — Tasks 2, 6. **G20:** seasons grouped by program plus SUPER by-program / by-year screens — Task 6 *(v1 parity 2026-10-09: was "program filter")*. **G5:** session create/edit/delete, scope selector, series preview, `GET /sessions/:id/series` — Tasks 3, 7. **G6:** ADMIN/SUPER `/groups` branch, group new/edit, `DELETE /groups/:id` + `/impact` — Tasks 4, 8. **G7:** `GET /seasons/:id/roster`, `PUT /seasons/:id/group-assignments`, roster screen — Tasks 2, 8. **G17:** `GET /sessions` for SUPER/LEADER plus the ADMIN switcher — Tasks 3, 9. **G19:** `check-in-regenerate` + `GET /sessions/:id/check-in` — Tasks 3, 7. **G18 rest:** session quiz card — Tasks 3, 7.
- **X5:** `seasonsRouter` is converted to per-route auth with a 404 guard test (Task 2, mutation 1). New routes on `sessionsRouter`/`groupsRouter` keep those routers' exclusive-prefix router-level auth.
- **X7:** directory forms for `seasons/`, `seasons/[code]/`, `seasons/[code]/roster/`, `group/[id]/`, `session/[id]/`, guarded by `ambiguousRouteSiblings`.
- **X9:** routes added only by appending to `DETAIL_ROUTE_NAMES`; `"group/[id]"` → `"group/[id]/index"` is a rename, and no count literal is touched.
- **X10:** every hook parses with a shared schema, mutations included.
- **X12:** backend value imports are relative (`groupAssignmentsRequestSchema`, `sessionRangeQuerySchema`, `recurrenceScopeSchema`, constants); `lib/queries/seasons.ts` imports only a type from `@space/shared`.
- **X13:**
  - org day/time are derived server-side (`dayKey`, `startTime`, `fromDayKey`/`toDayKey`, `expiresAtTime`);
  - writes carry `startDay`/`startTime` (Plan 5's split), converted by Plan 5's `orgWallClockToInstant`;
  - the calendar's Upcoming view starts at the server's `todayDayKey` (v1 parity 2026-10-09: no default window, R75/R98);
  - mobile renders through `formatDayKey`/`formatWallTime` only.
- **X14:** no migration, no schema edit, no `process.env`, no `@/`, no `@prisma/client`.
- **Plan 5 reuse:** `isoDaySchema`, `wallTimeSchema`, `orgWallTime`, `orgWallClockToInstant`, `useSeasonGroups`, `queryKeys.groups.bySeason`, `formatWallTime` — none redefined.
- **Plan 17 contract:** `assignStudentsToGroups(tx, seasonId, assignments)` and `GroupOutsideSeasonError` live in `lib/queries/groups.ts` with the exact signature and both documented divergences (ACTIVE enrolment of a live STUDENT; returns what it applied), pinned by `roster-routes` and mutations 3–5.

## Revision 2026-10-05

Cross-plan consistency pass (execution order 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → …):
- Task 5's directory-href set is named `DIRECTORY_ROUTE_HREFS` (was `DIRECTORY_HREFS`) to match Plan 10 Task 9 and Plan 17 Step 0, which extend it; a note says they must keep `"seasons"`.

## Revision 2026-10-09 — v1 parity

Owner ruling: v2 behaves exactly like v1 except where v1's behaviour is a defect. This revision
reverts the divergences below; the edits are marked *(v1 parity 2026-10-09)* in place. The code
built from the earlier text must be changed to match. Full classification:
`docs/superpowers/audits/2026-cutover/v1-parity-classification.tsv`.

| # | Rule(s) | REG | v1 behaviour (v1 file:line) | v2 code to change (file:line) | Where in this plan |
|---|---|---|---|---|---|
| 1 | 02-seasons R43 | REG-54 (cancel) | `/seasons` grouped under program headings (`localeCompare`), seasons `year` desc within each (`src/components/seasons/seasons-list.tsx:112-123`) | `apps/mobile/app/(app)/seasons/index.tsx:170-236` (year headings + `ProgramFilter`) | D-16.5; Task 6 Files, Step 1 note, Step 3 note; Task 10 Step 6 SUPER 1; Self-review G20 |
| 2 | 02-seasons R45 | REG-54 (cancel) | SUPER by-program / by-year pages; not-found when empty (`src/app/super/seasons/program/[program]/page.tsx:40`, `.../year/[year]/page.tsx:24,41`) | new `apps/mobile/app/(app)/seasons/program/[program].tsx`, `seasons/year/[year].tsx`; `seasons/index.tsx:174-177` | D-16.5; Task 6 Files, Step 1 note, Step 3 note |
| 3 | 02-seasons R47 | REG-54 (cancel) | by-program sorts `year` desc; by-year sorts `program` asc and regroups by program (`program/[program]/page.tsx:27`, `year/[year]/page.tsx:27`) | the two new screens; `seasons/index.tsx:178-206` | D-16.5; Task 6 Step 1 note, Step 3 note |
| 4 | 03-sessions R30 | - | create → season calendar; edit → session detail (`src/components/sessions/session-form.tsx:125,138`) | `apps/mobile/app/(app)/session/new.tsx:47`; `session/[id]/edit.tsx:79` | Task 7 Step 2 edit test (edited), Step 5 note, Step 6 code (edited) |
| 5 | 03-sessions R68 | REG-10 (un-defer) | QR encodes `<AUTH_URL>/checkin/<token>` (`src/app/admin/season/[code]/sessions/[id]/page.tsx:58-60`) | `apps/mobile/app/(app)/session/[id]/index.tsx:79` | Task 7 Step 7 note |
| 6 | 03-sessions R75 | - | SUPER calendar lists every session of every ACTIVE season, unbounded (`src/lib/sessions-query.ts:64-81`) | `apps/backend/src/routes/sessions.ts:216-256` (drop 8-week default and 120-day cap); `packages/shared/src/session.ts` range constants/response | D-16.7 Window; Task 1 Step 2 schema (edited); Task 3 Step 1 tests, Step 2 `listSessionsInRange`, Step 4 route (edited) |
| 7 | 03-sessions R86 | - | ADMIN calendar opens newest ACTIVE administered season (else newest any), no picker; "No active season found." (`src/app/admin/calendar/page.tsx:16-40`) | `apps/mobile/app/(app)/calendar.tsx:294-314` (remove `SeasonSwitcher`) | D-16.16; Task 5 `useStaffSeasonSelection` doc; Task 9 Step 1 note, Step 3 note; Task 10 mutation 20, Step 6 ADMIN 1 |
| 8 | 03-sessions R98 | - | agenda shows everything from start of today onward; past only via Week/Month (`src/components/sessions/season-calendar.tsx:236-251`) | `apps/mobile/app/(app)/calendar.tsx:200-247` (drop Earlier/Later, filter on `todayDayKey`) | D-16.7 Response; Task 1 Step 2 schema (edited); Task 9 Step 1 note, Step 2 doc, Step 3 note; Task 10 Step 6 SUPER 5; Self-review X13 |
| 9 | 05-groups R14 | - | leader/student id arrays have no size limit (`src/lib/group-actions.ts:16-19,49,55-62`) | `packages/shared/src/group.ts:40-41` (drop `.max(20)`/`.max(500)`) | not found in plan text — new work (pre-plan commit 371404d); recorded as a Task 4 note |
| 10 | 05-groups R18 | - | group form offers every live student; saving enrols them (`src/lib/groups-query.ts:112-121`; `src/lib/group-actions.ts:55-76`) | `apps/backend/src/lib/queries/groups.ts:155-168` (`validateGroupWrite`), `:210-213` (`setGroupStudents` upsert); `GroupForm.tsx:93-115` | D-16.11 picker bullet; D-16.14; Task 4 note; Task 8 Step 1 note, Step 3 doc + note |
| 11 | 05-groups R48 | - | bulk roster save accepts up to 2000; null unassigns (`src/lib/group-actions.ts:183-190`) | `packages/shared/src/group.ts:118` (`GROUP_ASSIGNMENTS_MAX`); `apps/backend/src/lib/queries/groups.ts:360-426` (batch writes) | D-16.12; Task 1 Step 1 test + Step 4 schema (edited); Task 2 Step 6 note, Step 7 comment, Step 9 OpenAPI (edited) |
| 12 | 05-groups R78 | - | group-form picker lists every live STUDENT, name asc (`src/lib/groups-query.ts:112-121`) | `apps/mobile/src/components/GroupForm.tsx` (picker source); new `GET /groups/student-options` | D-16.11; D-16.14; Task 4 note; Task 8 Step 3 note |
| 13 | 05-groups R79 | - | picker shows name/email only; one static helper line (`src/components/groups/group-form.tsx:62-66,148`) | `apps/mobile/src/components/GroupForm.tsx:100-105` | Task 8 Step 1 create test (edited), Step 3 code (edited) |
| 14 | 05-groups R82 | - | a student whose group is in another season shows as unassigned (`src/lib/groups-query.ts:151-155,161`) | `apps/backend/src/lib/queries/groups.ts:286-304`; `packages/shared/src/group.ts:113`; roster grid + form captions | D-16.11; Task 1 Step 4 schema; Task 2 Step 2 test, Step 6 code, Step 9 OpenAPI; Task 8 fixtures, roster code (all edited) |
| 15 | 05-groups R91 | - | `/admin/groups` opens newest non-deleted administered season by startDate, no status filter (`src/app/admin/groups/page.tsx:25-40`) | `apps/mobile/app/(app)/groups.tsx:56-101`; `apps/mobile/src/hooks/use-seasons.ts:52-58` (`pickCurrentSeasonId` not used there) | D-16.16; Task 5 `pickNewestSeasonId` + `useStaffSeasonSelection` (edited); Task 8 Step 1 note, `groups.tsx` code (edited) |
| 16 | 05-groups R97 | - | create and edit both return to the season's group list (`src/components/groups/group-form.tsx:107`) | `apps/mobile/app/(app)/group/new.tsx:25`; `group/[id]/edit.tsx:89` | D-16.16 (`seasonId` param); Task 8 Step 1 create test + note, Step 4 `new.tsx`/`edit.tsx` (edited) |
| 17 | 05-groups R101 | - | after save the grid says "Updated N student(s)." (`src/components/groups/roster-grid.tsx:84-87`) | `apps/mobile/app/(app)/seasons/[code]/roster/index.tsx:80-87` | Task 8 Step 1 roster test, Step 4 roster code (edited) |

**Awaiting owner (not changed):** none
