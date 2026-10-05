# Migration roadmap — the remaining plans, in order

Eighteen plans. Each is sized to be taken as one instruction ("do plan N"),
ends with something verifiable, and states its subagent fan-out up front.
Ordering is by dependency and by value-on-a-device, not by domain number.

State when this was written (main `371404d`): 32 endpoints live (19 read,
13 write) with 143 integration tests; 9 of 18 domains have no endpoint; 20 of
23 mobile route files are placeholders; no dynamic route exists; all 17 domain
specs and the 12 cross-cutting rulings (`_DECISIONS.md`) are in place.

**All eighteen plans are now written** (thirteen on 2026-08-24; on 2026-10-05
a coverage audit against v1's 104 pages and every `lib/*-actions.ts` /
`*-query.ts` export found 23 gaps — 37 pages had no plan — so Plans 14–18 were
added, a new spec `specs/domains/19-dashboards.md` was written, and Plans 1–13
were reviewed and revised; each revised plan ends with a "Revision 2026-10-05"
section). No execution has begun. The sections below are the scope statements
the plans were written against; the files are the instructions.

## Execution order

Numbers are identities, not order. Plans run in this order, and each plan's
header lists only plans earlier in it:

**1 → 2 → 3 → 4 → 15 → 16 → 5 → 6 → 7 → 17 → 14 → 8 → 9 → 10 → 11 → 18 → 12 → 13**

| Order | # | Plan | File |
|---|---|---|---|
| 1 | 1 | Student path on a device (+ `/more`) | `2026-08-24-plan-01-student-path.md` |
| 2 | 2 | Leader path on a device | `2026-08-24-plan-02-leader-path.md` |
| 3 | 3 | Season & session writes | `2026-08-24-plan-03-season-session-writes.md` |
| 4 | 4 | Admin core screens | `2026-08-24-plan-04-admin-core-screens.md` |
| 5 | 15 | Assignment authoring | `2026-10-05-plan-15-assignment-authoring.md` |
| 6 | 16 | Season, session & group admin screens | `2026-10-05-plan-16-season-admin-screens.md` |
| 7 | 5 | Students & enrollment | `2026-08-24-plan-05-students-enrollment.md` |
| 8 | 6 | Quizzes (+ authoring UI) | `2026-08-24-plan-06-quizzes.md` |
| 9 | 7 | Invites, users & settings | `2026-08-24-plan-07-invites-users-settings.md` |
| 10 | 17 | Students & accounts follow-up | `2026-10-05-plan-17-students-accounts-followup.md` |
| 11 | 14 | Student self-service | `2026-10-05-plan-14-student-self-service.md` |
| 12 | 8 | Notes & engagement | `2026-08-24-plan-08-notes-engagement.md` |
| 13 | 9 | Notifications & push | `2026-08-24-plan-09-notifications-push.md` |
| 14 | 10 | Video quizzes, forum, events | `2026-08-24-plan-10-video-forum-events.md` |
| 15 | 11 | Reports & exports | `2026-08-24-plan-11-reports-exports.md` |
| 16 | 18 | Role dashboards | `2026-10-05-plan-18-role-dashboards.md` |
| 17 | 12 | Imports | `2026-08-24-plan-12-imports.md` |
| 18 | 13 | Cutover | `2026-08-24-plan-13-cutover.md` |

Hard dependencies worth knowing: 16 builds the season route and roster that
12's group import hangs off; 17 needs 7's users/invites/rate-limit; 18 composes
8, 10, 11 and 14; 13 depends on everything.

## Cross-plan rulings (2026-10-05)

Decided once so no plan re-decides them. They bind every plan.

- **X1 Notification links** are written in v1's exact format. Plan 9's
  `NOTIFICATION_LINK_PATTERNS` holds v1's five shapes (`/student/assignments/:id`,
  `/student/quizzes`, `/student/calendar`, `/admin/students/:id`,
  `/leader/students/:id`); Plan 13's link backfill maps the same set. A new
  producer must use one of them or extend both explicitly.
- **X2/X3 One HTML module.** `packages/shared/src/html-text.ts` (Plan 8) holds
  `htmlToPlainText`, `plainTextToHtml`, `escapeHtml`; the backend's
  `lib/html.ts` re-exports. No other converter or escaper exists.
- **X4 One rate-limit handler:** `lib/rate-limit.ts` (Plan 7); never copied.
- **X5 `requireAuth` per route,** or on a prefix the router owns exclusively —
  unknown paths must stay `not_found` 404 (Plan 16 converts `seasons.ts`).
- **X6 Health check** is `curl -fsS localhost:4000/health` (root, not `/api/v1`).
- **X7 Directory form for dynamic routes with children:** `x/[id]/index.tsx` +
  `x/[id]/child.tsx`, never `x/[id].tsx` beside `x/[id]/`. Moves: `session/[id]`
  (Plan 4), `assignment/[id]` (15), `seasons`, `group/[id]` (16), `student/[id]` (17).
- **X8 Staff season** comes from Plan 4's `useCurrentSeasonId` (latest-starting
  ACTIVE season, as v1), never `scopes.activeSeasonId`.
- **X9 Route-count tests derive their counts** (Plan 1 Task 0). A new detail
  route appends to `DETAIL_ROUTE_NAMES`; a built placeholder deletes its
  `PLACEHOLDER_SCREENS` row. No plan edits a count.
- **X10 Parse, never cast,** every API response with its shared Zod schema.
- **X11** Test fixtures carry every required field (`avatarPath`, `hasPassword`…).
- **X12 Shared value imports in any backend file** use the relative path, not
  `@space/shared`; build checks grep all of `dist/`.
- **X13 Org timezone everywhere** (`lib/org-time.ts`: Plan 3, extended by 4, 15,
  10). Day grouping uses `dayKey`; recurrence steps are DST-safe calendar weeks.
- **X14** No migrations before Plan 13; no `process.env` outside `config.ts`;
  no `@/`; no `@prisma/client`.
- **X17 Dashboards** (spec 19 §10): v1's 70%-attendance callout is replaced by
  the shared `isAtRisk`; "outstanding" is `isAssignmentOutstanding`
  (PENDING|DRAFT, C5); no full roster on Home.

## How subagents are used in every plan

Constraints learned the hard way, restated once so each plan doesn't:

- **Integration tests are coordinator-only.** `cleanupTestData` is
  prefix-global and safe only under `--runInBand`. Subagents *write* tests,
  never run them; the coordinator runs the suite serially after merging.
- **Single-file contention is coordinator-only:** `src/docs/openapi.ts`,
  `packages/shared/src/index.ts`, `lib/permissions.ts`. Agents hand back
  fragments; the coordinator applies them.
- **Screens parallelize by destination, never by role** (decision D1: one
  route file per destination, role branches inside). Backend parallelizes by
  domain with disjoint route files.
- **Fan-outs stay small (2–3 agents).** The five-agent Wave B launch died on
  session limits; two or three concurrent implementers with the coordinator
  verifying is the sustainable shape.
- **Everything the coordinator merges gets mutation-tested**, not just run
  green: revert the load-bearing behaviour, confirm the matching test fails,
  restore.
- The binding context for every agent brief: `_DECISIONS.md`, the domain's
  spec in `docs/superpowers/specs/domains/`, and `CLAUDE.md`.

---

## Plan 1 — Student path on a device

**Goal:** a student can log in, see their assignments, open one, write and
submit work, and see feedback — end to end against the live backend. This is
the migration's first visible product and it forces the two unmade design
decisions: the first dynamic route (`assignment/[id]`) and the hooks pattern
at scale.

- Task 0 (revision): route-count tests derive their counts (ruling X9).
- Coordinator first: create `app/(app)/assignment/[id].tsx` (the route-tree
  change is one file plus typed-routes regen, not parallelizable; Plan 15
  later moves it to `assignment/[id]/index.tsx`), extend
  `query-keys.ts`, and write `use-assignments.ts` / `use-submission.ts` hooks
  as the worked example.
- Then 3 agents on disjoint screens: **assignments list** (`assignments.tsx`),
  **assignment detail + submission form** (`assignment/[id].tsx`),
  **dashboard upgrade** (real pending/overdue counts from the new contracts;
  superseded by Plan 18's role dashboards). Also builds `/more`, the role's
  sidebar renderer, which Plans 8, 9 and 11 rely on.
  Each writes its own component tests with `renderWithProviders`.
- Done: `pnpm turbo lint typecheck test:unit` green; the student flow
  demonstrated against the staging backend; `isLate`/`canUploadFiles`/
  `canReview` consumed from the contract, never re-derived (C4).

## Plan 2 — Leader path on a device

**Goal:** a leader can see their groups, open the review queue, read a
submission, and record a verdict or return it for revision.

- 3 agents by destination: **groups tab** (`groups.tsx`, consuming
  `GET /groups`), **submissions queue** (`submissions.tsx`, cursor pagination
  with `useInfiniteQuery`), **submission review screen**
  (`submission/[publicId].tsx` — second dynamic route, coordinator creates the
  file first).
- Includes the attendance marking screen (`session/[id]/attendance`) if
  capacity allows; otherwise it moves to Plan 4 with the session detail.
- Done: leader flow demonstrated end to end; queue pagination actually pages;
  `canReview` gates the verdict UI.

## Plan 3 — Season and session writes (backend)

**Goal:** the API surface Phase 3's admin screens need, and the two deliberate
divergences the specs demand: **C10** (recurrence season-scoped, fresh
`recurrenceGroupId` on duplication — a live v1 cross-season data-loss bug) and
the check-in/attendance corrections already ruled.

- 2 agents: **seasons writes** (create/update/duplicate/delete per spec 02 —
  duplicate mints fresh recurrence ids, create stops discarding the absence
  budget fields, delete blocks when children exist per D4) and **sessions
  writes** (create with recurrence, edit/delete with `one|future|all` scope,
  both sibling lookups filtered by `seasonId`; reschedule notification).
  Disjoint route files; both write their integration tests unrun.
- Coordinator: openapi + index fragments, serial suite, mutation pass on the
  season-scoping of recurrence (the whole point of C10).
- Done: an admin can build a season — season, recurring sessions, groups —
  entirely through the API; editing a series never touches another season.

## Plan 4 — Admin core screens

**Goal:** the admin can run the current season from the phone: season
overview, calendar, session detail (open/close check-in, QR display; leaders
get a read-only live roster via `canManageCheckIn`), attendance marking.

- Revised scope: the season detail route, SUPER status edit, group
  management, session create/edit screens, the multi-season calendar, token
  regeneration and the program filter moved to **Plan 16**; the student
  check-in scanner and student `/season` content to **Plan 14**.
- Coordinator: dynamic route `session/[id]/index.tsx` (X7).
- 3 agents by destination: **calendar** (all five roles' branches — the
  worked example of D1 role-branching), **season workspace + seasons list**,
  **session detail + attendance screen** (rotating-code decision from spec 04
  D3 lands here; implement the API-served state, keep the QR fallback).
- Done: admin flow demonstrated; calendar renders sessions for every role
  from one route file.

## Plan 5 — Students & enrollment (backend + screens)

**Goal:** domain 6, the largest greenfield API: student CRUD, enrollment
state machine, alumni/dropped lists, student detail.

- 2 backend agents: **reads** (list/detail with per-role payload narrowing —
  the spec's field-by-field visibility table is the contract) and **writes**
  (create/update/enrollment transitions; D7's hard-coded `ChangeMe123!`
  password is not ported — creation without an invite issues no credentials
  until Plan 7).
- Then 2 screen agents: **students list + alumni/dropped**, **student detail**
  (`student/[id].tsx`). Graduate/delete and the create/edit forms are
  Plan 17; the student's own `/me/profile` is Plan 14.
- Done: mentor/admin/super each see their own narrowing of the same endpoint;
  enrollment history is append-only in every path (C9 discipline).

## Plan 6 — Quizzes (backend + screens)

**Goal:** domain 12, the largest single domain (12 v1 actions, 120 rules).

- 2 backend agents: **authoring + lifecycle** (create/edit/publish; D3's
  mutable-live-quiz corruption not ported — editing a published quiz with
  attempts is refused) and **attempts + grading** (the answer key never
  travels to a student client — spec D2 makes the contract split explicit;
  `saveQuizGradesAction`'s missing season check from D1 is fixed, not ported).
- Then 2 screen agents: **quiz list + runner** (`quiz/[id]/index.tsx`),
  **grading screen** for staff; plus (revision) the **quiz authoring UI** —
  create, add/edit/delete/reorder questions, publish.
- Done: a student can take a quiz without the correct answers ever appearing
  in any network response (assert this in an integration test, not by
  inspection).

## Plan 7 — Invites, users & settings (backend + screens)

**Goal:** domains 11 and 18 together — they share the credential boundary.
This plan retires the worst live v1 defects rather than porting them.

- 2 backend agents: **users + invites** (invite create/accept done properly:
  hashed single-use expiring tokens, authenticated issuer from the session
  not the payload, real acceptance route; role changes revoke refresh tokens
  per C7's TTL note) and **settings + password change** (per-user
  preferences vs org config split per spec 18; bcryptjs).
- 1 screen agent: **settings screen** (all six roles' branches) + **users
  list/detail** for super.
- Forgot/reset password, `/users/new` and bulk invite resend are Plan 17.
- Done: no shared default password exists anywhere; an invite is the only way
  a UI-created user gets credentials; a demoted user's refresh stops working.

## Plan 8 — Notes & engagement (backend + screens)

**Goal:** domain 9 — pastoral notes with the visibility model actually
enforced, engagement computed server-side.

- 1 backend agent (small domain, sensitive rules — one careful agent beats
  two fast ones): notes CRUD with row-scoped visibility gates (spec D3's
  ladder decision), sanitised bodies (C11), engagement score computed once
  on the API (C4, D10) with the D7/D8 definition conflicts resolved per spec.
- 1 screen agent: mentor notes screen + engagement on student detail.
- Done: a leader-visibility note is unreadable by a leader outside the
  student's group — proven by integration test.

## Plan 9 — Notifications completed + push

**Goal:** finish the partial domain 10 and add the mobile win: inbox
endpoints (list, mark-read as explicit writes — C6), preference surface, and
expo push (token registration, the 2–3 interruptive types only, per spec D5).

- 2 agents: **backend** (inbox + prefs + push dispatch behind the existing
  best-effort seam) and **mobile** (notifications screen, permission flow,
  token lifecycle in the session store).
- Done: a review recorded on one device produces a push on the student's
  device; opening the inbox never writes (C6).

## Plan 10 — Video quizzes, forum, events

**Goal:** the three remaining engagement domains (13, 14, 15), batched
because each is small and they share consumers built earlier.

- 3 agents, one per domain, backend + screen in the same brief: **video
  quizzes** (playback gating is server-checked per spec 13's headline
  finding), **forum** (no assumption that a submission row pre-exists —
  domain 8's upsert is the entry point; author-or-staff delete only),
  **events** (SUPER-gated writes, merged into Plan 16's calendar;
  `GET /events?upcoming=true&limit=` for the dashboards).
- Done: all three visible on device; forum posting works on an assignment the
  student has never opened.

## Plan 11 — Reports & exports

**Goal:** domain 17 with the metric definitions fixed per C3/C5 — not v1's
three disagreeing "submission %"s.

- 2 agents: **backend** (report queries as database aggregates with the
  targeted denominator, one metric definition each in `packages/shared`;
  XLSX built server-side, streamed with auth header) and **mobile** (reports
  screen with an RN chart lib, export via `downloadAsync` → share sheet per
  spec D10 — never fetch-then-base64).
- Done: v2's numbers annotated where they deliberately diverge from v1's
  (raw-lateness era vs C3 era), export lands in the OS share sheet.

## Plan 12 — Imports

**Goal:** domain 16, deliberately last of the features: paste-first import
(spreadsheet paste → parse → preview → commit) with file upload joining when
the CMS lands.

- 2 agents: **backend** (parse/validate/commit endpoints; preview state held
  client-side and resubmitted, per spec; matching rules exactly as specced —
  idempotent by email; transactional commit, all-or-nothing) and **mobile**
  (the three-step import screen, plus the group-import screen on Plan 16's
  roster).
- Done: a re-run of the same import creates zero duplicate rows against
  staging.

## Plan 15 — Assignment authoring

**Goal:** domain 7's writes, which no original plan covered: create (with
targets and `ASSIGNMENT_CREATED` fan-out), full-replace edit, soft delete
blocked by submissions; staff `/assignments` list, staff assignment detail
with the tracker, new/edit form.

- Due dates travel as org-timezone `dueDay`/`dueTime` (C2); edits notify
  newly targeted students (spec 07 §10 item 5).
- Done: an admin creates, edits and deletes an assignment on device; students
  are notified with v1's link shape.

## Plan 16 — Season, session & group admin screens

**Goal:** everything an admin or super needs to manage seasons beyond the
current one: season detail by code with SUPER status transitions and delete,
program filter, session create/edit/delete with series scope and impact
preview, admin groups list/new/edit/delete with impact, roster grid and bulk
group assignment, multi-season calendar with a season switcher, check-in
state and token regeneration, the session-quiz card.

- Produces `assignStudentsToGroups` and the `seasons/[code]/roster` route that
  Plan 12 builds on; converts `seasons.ts` to per-route `requireAuth`.
- Done: a SUPER activates a season and an admin builds its sessions and groups
  entirely on device.

## Plan 17 — Students & accounts follow-up

**Goal:** the account and lifecycle screens Plans 5 and 7 deferred: student
create (invite-only credentials), edit, graduate, drop, soft delete;
`/users/new` with an explicit `confirmSuper` for SUPER grants; bulk pending
invites in bounded batches; forgot/reset password (v1's token format).

- Must precede cutover: without reset, a v1 user who forgets a password has
  no path.
- Done: a student is created, invited, graduated and deleted on device; a
  reset email round-trips.

## Plan 14 — Student self-service

**Goal:** the student's own surfaces: season history (students and alumni),
profile (`/me/profile`; self email change refused per spec 18 D8), attendance
budget, streak and history, student `/season` content, and check-in — QR
scanner, enter-code fallback and the `/checkin/[token]` deep link.

- Lands ruling C3's check-in lateness from session start.
- Done: a student checks in by scanning a session QR on device.

## Plan 18 — Role dashboards

**Goal:** the six role dashboards from spec 19 behind one
`GET /api/v1/me/dashboard` (STUDENT, SEASON_STAFF, MENTOR variants) plus the
reports, events, attendance and notifications endpoints earlier plans built.
One `/dashboard` route, a branch per role, upcoming events on all six.

- Reuses `isAssignmentOutstanding`, `isAtRisk` and Plan 11's metrics; it
  defines no new metric (C4/C5).
- Done: each role's Home shows its v1 figures, computed server-side.

## Plan 13 — Cutover

**Goal:** retire jpc-space.

1. **Parity audit:** 3 read-only agents sweep the 18 specs' rules (incl. 19
   dashboards) and all 104 v1 pages against v2,
   reporting every rule not demonstrably preserved; coordinator triages.
2. **Migration thaw:** the deferred-to-cutover list executes at last —
   `GroupStudent` per-season uniqueness + backfill from enrolments,
   `lateThresholdMinutes`/`lateWeightMinutes`, notification `link` format,
   soft-delete columns, name uniqueness on groups. Each is a migration
   written *now*, applied only when v1 stops writing.
3. Freeze v1 writes, run the backfills, point everything at v2, watch, then
   switch v1 off.
- Revision: a real v2 read-only freeze mode, the post-migration code changes,
  and a register of every deliberate divergence, deferral and drop recorded in
  Plans 1–18.
- Done: v1 serves nothing; every spec rule is either preserved, deliberately
  diverged (documented), or explicitly dropped (documented).

---

## Standing items that ride along, not plans of their own

- **Uploads stay off until the CMS decision** — Plans 1 and 12 surface
  `canUploadFiles` so screens degrade honestly.
- **Live v1 defects** (invite pair, `ChangeMe123!`, recurrence corruption,
  upload path traversal) belong to jpc-space's owner; Plans 3 and 7 remove
  v2's dependence on the broken behaviours, which is the part this repo
  controls.
- **Remaining bare interfaces** in `packages/shared` (`season.ts`,
  `session.ts`, `navigation.ts`) convert inside whichever plan first touches
  them (Plans 3 and 4).
