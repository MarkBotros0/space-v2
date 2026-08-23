# Migration roadmap — the remaining plans, in order

Thirteen plans. Each is sized to be taken as one instruction ("do plan N"),
ends with something verifiable, and states its subagent fan-out up front.
Ordering is by dependency and by value-on-a-device, not by domain number.

State when this was written (main `371404d`): 32 endpoints live (19 read,
13 write) with 143 integration tests; 9 of 18 domains have no endpoint; 20 of
23 mobile route files are placeholders; no dynamic route exists; all 17 domain
specs and the 12 cross-cutting rulings (`_DECISIONS.md`) are in place.

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

- Coordinator first: create `app/(app)/assignment/[id].tsx` (the route-tree
  change is one file plus typed-routes regen, not parallelizable), extend
  `query-keys.ts`, and write `use-assignments.ts` / `use-submission.ts` hooks
  as the worked example.
- Then 3 agents on disjoint screens: **assignments list** (`assignments.tsx`),
  **assignment detail + submission form** (`assignment/[id].tsx`),
  **dashboard upgrade** (real pending/overdue counts from the new contracts).
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

**Goal:** the admin can run a season from the phone: season overview,
calendar, session detail (open/close check-in, QR display), attendance
marking, group management.

- Coordinator: dynamic routes `season/[code].tsx`, `session/[id].tsx`.
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
  (`student/[id].tsx`).
- Done: mentor/admin/super each see their own narrowing of the same endpoint;
  enrollment history is append-only in every path (C9 discipline).

## Plan 6 — Quizzes (backend + screens)

**Goal:** domain 12, the largest single domain (12 v1 actions, 120 rules).

- 2 backend agents: **authoring + lifecycle** (create/edit/publish; D3's
  mutable-live-quiz corruption not ported — editing a published quiz with
  attempts is refused) and **attempts + grading** (the answer key never
  travels to a student client — spec D2 makes the contract split explicit;
  `saveQuizGradesAction`'s missing season check from D1 is fixed, not ported).
- Then 2 screen agents: **quiz list + runner** (`quiz/[id].tsx`), **grading
  screen** for staff.
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
  **events** (SUPER-gated writes, merged into the Plan 4 calendar).
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
  (the three-step import screen).
- Done: a re-run of the same import creates zero duplicate rows against
  staging.

## Plan 13 — Cutover

**Goal:** retire jpc-space.

1. **Parity audit:** 3 read-only agents sweep the 17 specs' rules against v2,
   reporting every rule not demonstrably preserved; coordinator triages.
2. **Migration thaw:** the deferred-to-cutover list executes at last —
   `GroupStudent` per-season uniqueness + backfill from enrolments,
   `lateThresholdMinutes`/`lateWeightMinutes`, notification `link` format,
   soft-delete columns, name uniqueness on groups. Each is a migration
   written *now*, applied only when v1 stops writing.
3. Freeze v1 writes, run the backfills, point everything at v2, watch, then
   switch v1 off.
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
