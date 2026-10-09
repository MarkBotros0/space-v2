# Plan 17 — Imports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Domain 16 — bulk data entry, paste-first. A SUPER pastes a
spreadsheet selection into the app, sees a row-by-row preview classified
against the live database, and commits it; the commit creates students,
profiles and enrolments **row by row, each row in its own transaction** (v1,
`jpc-space/src/lib/student-import.ts:238-291`) *(v1 parity 2026-10-09: was "one
transaction, all-or-nothing")*, and is
**idempotent by email** — re-running the same paste creates zero duplicate
rows. A season ADMIN gets the same three-step flow for bulk group assignment.
Neither importer exists in v2 in any form.

**Architecture:** One new backend route file (`routes/imports.ts`, exporting
two routers — `/api/v1/imports/*` for the SUPER student importer and a
season-scoped `/api/v1/seasons/:id/imports/groups/*` for the ADMIN group
importer) over three new pure-ish modules under `lib/imports/`
(`delimited.ts` — the RFC-4180/TSV scanner; `students.ts` — header mapping,
row validation, classification and commit; `groups.ts` — roster matching and
classification). The write itself is **not new code**: student creation is
extracted out of Plan 7's `POST /api/v1/students` handler into
`createStudentRows()` in `lib/queries/students.ts` and both callers use it, so
a form-created student and an imported student are byte-for-byte the same kind
of account. Group membership is written by Plan 6's `assignStudentsToGroups()`
in `lib/queries/groups.ts` — the same function behind Plan 6's roster grid
(`PUT /seasons/:id/group-assignments`), consumed here, never copied.
On mobile, two routes, each a three-step state machine (paste → preview →
result) in local state: `app/(app)/users/import.tsx` (students, SUPER) and
`app/(app)/seasons/[code]/roster/import.tsx` (groups, season ADMIN / SUPER),
the latter hanging off Plan 6's season detail and roster screens.

**Tech Stack:** Express 5, Prisma 7 (`src/generated/prisma`, never
`@prisma/client`), Zod contracts in `packages/shared`, `express-rate-limit`,
jest + supertest integration suite against the shared staging DB; Expo SDK 54
/ expo-router 6 (typed routes), React Query 5 (`useMutation` for preview and
commit), Zustand 5, RNTL 13 via `renderWithProviders`. **No new dependency is
added to either app** — no `exceljs`, no `multer` use, no document picker, no
clipboard package.

**Spec:** `docs/superpowers/specs/domains/16-imports.md` (84 rules R1–R84,
§10 D1–D19), `docs/superpowers/specs/domains/_DECISIONS.md` (C1, C4, C6, C8,
C9, C11, C12 bind), scope from
`docs/superpowers/plans/2026-08-24-migration-roadmap.md` § Plan 17.

**Depends on** (execution order 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 →
11 → 12 → 13 → 14 → 15 → 16 → **17** → 18; only plans before this one — nothing
from Plan 16 is consumed):
**Plan 4** (`useSeasons`, the seasons query keys); **Plan 7** (the student write
path and its contracts — `POST /students` and `POST /students/:id/enrollments`,
both refactored here onto shared functions rather than duplicated; Plan 7's
enrolment rules are what `enrollStudentInSeason` encodes); **Plan 9**
(credentials come from invites and nowhere else; the real `/users` screen this
plan adds an entry point to; `lib/rate-limit.ts` / `rateLimitHandler`, ruling
X4); **Plan 6** (the season detail route `seasons/[code]/index.tsx`, the roster
screen `seasons/[code]/roster/index.tsx`, `assignStudentsToGroups` /
`GroupOutsideSeasonError` in `lib/queries/groups.ts` — consumed, not created;
the `DIRECTORY_ROUTE_HREFS` set in `_layout.tsx`; per-route `requireAuth` on
`seasonsRouter`); **Plan 10** (already made `users/` a directory for
`/users/new` and added `"users"` to `DIRECTORY_ROUTE_HREFS` — Task 6 Step 0
only verifies; `POST /students` now mints an invite in its transaction, which
Task 4 Step 4 keeps; graduation completes **all** ACTIVE enrolments, sets
`graduationYear` and clears `activeSeasonId` — the same end state this
importer's `alumni` mode writes for a new student: `graduationYear` set, no
ACTIVE enrolment, no pointer). Plan 18 follows and picks up
"Deferred to cutover".

**Not in scope** (each named so nothing drops silently):

- **File upload of `.csv`/`.xlsx`.** Intake is paste-only until the CMS lands
  (D-16.2). The capability is surfaced honestly on the wire (`fileUpload:
  false`) so the screen can say so instead of rendering a dead button.
- **A durable import session / import history / audit trail.** Both need a
  table; `prisma/migrations/` is frozen (C1). See "Deferred to cutover".
- **Inline row editing** (`PATCH /imports/:importId/rows/:rowNumber`, spec §7
  and §10d). It presupposes the server-owned session this plan does not build
  (D-16.4). The mobile screen mitigates by letting the operator edit the paste
  text and re-preview without losing the mode/target selection.
- **Bulk invites after an import.** R55 is preserved — the import sends
  nothing. Bulk (re)sending of invites is **Plan 10's** (ruling X15; it runs
  before this plan) and lives on the users screen. The result step reports "no
  invites were sent" and points at `/users`; it does not add a second invite
  action of its own.
- **Bulk unassign in the group importer** (spec D10). A blank group cell stays
  `no_group`. Recorded as a design in D-16.19 for whoever wants it.
- **An importer for staff, leaders, sessions, attendance or grades.** Spec D16:
  do not invent one during the port. Role is hard-coded `STUDENT`.
- **The roster grid itself** and `PUT /seasons/:id/group-assignments` — Plan
  16's. This plan's group-import screen (Task 6b) hangs off Plan 6's roster
  screen and its commit reuses Plan 6's `assignStudentsToGroups`.
- **`/users` itself.** Plan 9 Task 7 owns the users list and Plan 10 Task 9
  moved it to `users/index.tsx`. This plan adds one header button and the
  `users/import` child route (D-16.17); it moves nothing.

---

## Subagent fan-out

Two implementer agents maximum, plus the coordinator. The roadmap's standing
constraints (`2026-08-24-migration-roadmap.md` § "How subagents are used")
apply and are restated here because this plan has an unusually sharp
integration-test hazard.

**Coordinator-only, never delegated:**

| Work | Why |
|---|---|
| **Task 1** — `packages/shared/src/import.ts` + `packages/shared/src/index.ts` | `index.ts` is a single-file contention point; both agents consume Task 1's output, so it must land before either starts. |
| **Every OpenAPI edit** (`apps/backend/src/docs/openapi.ts`) | Single-file contention point. Agent A hands back a fragment per endpoint; the coordinator applies all of them. |
| **`apps/backend/src/app.ts`** router mounts | Single file, three lines, touched by no one else. |
| **`apps/mobile/app/(app)/_layout.tsx`** + `app-layout.test.tsx` + `role-tabs.test.tsx` + `placeholder-screens.test.tsx` | The route-tree change (D-16.17) is one file plus three test files that every other mobile plan also touches. |
| **Running any integration suite** | `cleanupTestData()` is prefix-**global** — it deletes every `space-v2-test-` row in the shared staging database, not just the calling suite's. Two suites interleaving destroys each other's in-flight fixtures. Agents *write* integration tests and leave them unrun; the coordinator runs them serially with `--runInBand`. |
| **Task 7** — closing gate, mutation pass, device checklist | By definition. |

**Not a contention point in this plan:** `apps/backend/src/lib/permissions.ts`
is **not modified**. Both importers gate on pure predicates that already exist
in `lib/rbac.ts` (`isSuper`, `isAdminOfSeason`) plus a season-liveness read
done inline in the handler, exactly as v1 did. No new database-backed gate is
needed, so the file nobody may touch concurrently is untouched. Do not add one.

**Agent A — backend (Tasks 2 → 3 → 4 → 5, sequential).** Owns
`apps/backend/src/lib/imports/*`, `apps/backend/src/routes/imports.ts`,
`apps/backend/src/lib/queries/students.ts`, `apps/backend/src/lib/queries/groups.ts`,
`apps/backend/src/routes/students.ts` (one refactor, Task 4 Step 2), and both
new test files. These four tasks share `routes/imports.ts` and one integration
suite, so they are one stream and must not be split across agents. Agent A
**may** run `pnpm turbo lint typecheck test:unit --filter=@space/backend`
(no database) and **must not** run anything matching `--testPathPattern
integration`.

**Agent B — mobile (Tasks 6 → 6b, sequential).** Owns
`apps/mobile/app/(app)/users/import.tsx`,
`apps/mobile/app/(app)/seasons/[code]/roster/import.tsx`,
`apps/mobile/src/hooks/use-import.ts`, `apps/mobile/src/lib/query-keys.ts`,
`apps/mobile/src/components/ImportRowCard.tsx`, and the
`student-import.test.tsx` / `group-import.test.tsx` suites. Screens mock `apiClient`,
so Agent B never needs the backend and may run its own jest suite freely.
Agent B does **not** touch `_layout.tsx` — it declares its dependency on the
route existing and the coordinator creates it (Task 6 Step 0).

**Order:** coordinator does Task 1 → Agents A and B run in parallel → the
coordinator merges, applies the OpenAPI fragments, mounts the routers, then
runs Task 7.

---

## Global Constraints

- **No migrations, ever.** No edits under `apps/backend/prisma/`. The staging
  database is shared with a live v1 (ruling C1). Every column this plan writes
  is verified to exist: `User { email @unique, name, role, passwordHash String?,
  graduationYear Int?, deletedAt DateTime? }` (schema.prisma:103–164),
  `StudentProfile { activeSeasonId Int?, university, year, phone, dateOfBirth,
  spiritualBackground, gifts, notes }` (:214–236), `SeasonEnrollment` with
  `@@unique([studentUserId, seasonId])` (:355), `GroupStudent.studentUserId
  @unique` standalone (:330). Anything this plan cannot fix inside that schema
  goes to **Plan 18** (`docs/superpowers/plans/2026-10-05-plan-18-cutover.md`)
  — see "Deferred to cutover" below, and do not overload an existing column to
  work around a missing one.
- **No credential is ever created by an import.** Every account this plan
  creates has `passwordHash: null`. v1's `student-actions.ts:59` hard-codes
  `ChangeMe123!` for form-created students; Plan 7 D7 and Plan 9 (invites are the only credential path)
  already ruled that out of v2, and an importer is the last place it may
  sneak back in. **There is no shared default password anywhere in v2**, and
  an invite is the only way a UI-created user gets credentials (Plan 9). An
  imported account exists and cannot be logged into until an invite is
  accepted — which is what v1's importer already did right
  (`src/lib/student-import.ts:260`). No code in this plan hashes anything;
  **where a password is set at all in this repo it is bcryptjs**, and that
  code lives in Plan 9's invite-acceptance route, not here. Never log a
  credential; never print `AUTH_SECRET`, `DATABASE_URL`, `GMAIL_APP_PASSWORD`,
  a token or a hash in a message, a log line or a test fixture.
- Response envelope `{ data }` / `{ error: { code, message } }` via
  `apiOk`/`apiError` from `lib/api-response`.
- **Value imports from `@space/shared` in backend files use the relative path**
  `"../../../../packages/shared/src/index"` (from `src/routes/`) or
  `"../../../../../packages/shared/src/index"` (from `src/lib/imports/`).
  Bare `"@space/shared"` is valid **only** in `import type`. This is the
  `rootDir: "../.."` emit trap documented in `CLAUDE.md`: `tsc` does not
  rewrite bare specifiers, so at runtime `require("@space/shared")` resolves
  through `node_modules` back to the TypeScript *source* instead of the
  compiled sibling in `dist/packages/shared/src/`, and the built server dies
  with `ERR_MODULE_NOT_FOUND`. Three files in this plan carry value imports
  from shared — `routes/imports.ts`, `lib/imports/students.ts`,
  `lib/imports/groups.ts` — and all three must use the relative form. Task 7
  Step 3 greps the build output to prove it.
- **Prisma client is imported from `src/generated/prisma`**, never
  `@prisma/client`. Types: `import type { Prisma } from "../../generated/prisma/client"`.
  The `Prisma` **value** (for `Prisma.PrismaClientKnownRequestError`) is
  exported from the same module (`generated/prisma/client.ts` ends with
  `export { Prisma }`).
- `src/docs/openapi.ts` changes in the same commit as the route it documents.
- **Integration fixtures carry the `space-v2-test-` prefix, and this suite
  enforces it in code.** Every fixture email comes from `testEmail()` in
  `__tests__/integration/fixtures.ts`, which yields
  `space-v2-test-<label>-<uuid>@jpc.test`; every season comes from
  `createTestSeason()`. This is the only suite in the repo that asks the API
  to *create users out of free text*, so Task 3 adds a `sheet()` helper that
  **throws** if any email in a paste is not deletable by `cleanupTestData` —
  see Task 3 Step 1 and D-16.16. Never hand-build a paste string.
- **Integration tests are serial.** Every command in this plan that runs them
  passes `--runInBand`:
  `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern imports`.
  `jest.integration.config.js` also pins `maxWorkers: 1`; do not run this
  suite through any other invocation.
- Mobile: relative imports only (no `@/` alias); every response parsed with a
  Zod schema from `@space/shared`, never cast; states map to
  `LoadingState`/`ErrorState` (with `onRetry`)/`EmptyState`; tab screens pass
  `edges={["top","left","right"]}`; tests use `renderWithProviders`, query
  `Input` fields with `getByLabelText` and assert errors via
  `accessibilityHint`; `jest.mock` factories close only over consts named
  `mock*`; typed routes — never `as Href`/`as any`; run
  `pnpm turbo routes:generate --filter=@space/mobile` after adding a route file.
- **C11:** nothing renders as HTML. Imported free text (`notes`,
  `spiritualBackground`, `gifts`) is stored as the operator typed it and
  rendered by React Native as text. No import field is ever interpolated into
  mail by this plan — the import sends no mail at all (R55/R82).

---

## Decisions

Every ruling below states the question, the answer, and the reason. Where a
decision diverges from v1 it says so; where it diverges from spec 16's own §10
recommendation it says that too, because a silent divergence from the spec is
the failure mode this section exists to prevent.

### D-16.1 — Domain 16 ships both importers, backend and screen. (Revised: the group screen was deferred while its ancestors did not exist; Plan 6 now builds them first.)

*Question.* Spec 16 owns two importers (student/profile and group-assignment).
The roadmap's Plan 17 entry names "the three-step import screen", singular.

*Ruling.* Both importers' **endpoints** ship here — they share the parser, the
header vocabulary, the preview/commit protocol and the rate limiters, and
splitting them across plans would duplicate all four. **Both screens ship
too**: the student importer at `/users/import` (Task 6) and the group importer
at `/seasons/[code]/roster/import` (Task 6b).

*Reason.* The earlier draft deferred the group screen because its ancestors
(`/seasons/[code]`, the roster screen) did not exist. Plan 6 — which now runs
before this plan — builds both, plus `GET /seasons/:id/roster`,
`PUT /seasons/:id/group-assignments` and the `assignStudentsToGroups` write
this plan's commit reuses. Nothing is invented: the screen hangs off routes
Plan 6 owns and is reached from its roster's header action, as in v1.

### D-16.2 — Intake is pasted text only. There is no file upload, no `multer`, no `exceljs`, and no second env flag.

*Question.* Spec §10a and §10b: how do bytes get in, and is import intake
gated by `ENABLE_UPLOADS`?

*Ruling.* The only intake is a JSON body `{ text, delimiter }`. `.xlsx` cannot
be pasted and is therefore **not supported at all** in this plan. Import
intake is **not** gated by `ENABLE_UPLOADS` and never touches the `Storage`
interface. **No `ENABLE_IMPORTS` flag is added** either, despite spec §10a
offering it.

*Reason.* Three parts. (1) `ENABLE_UPLOADS` is off because *persisted* files —
submission attachments — need a storage driver, a retention story and a
serving route, and that work waits on the CMS. An import paste is the
opposite: read once, parsed in memory, and it must **never** be stored,
because it is a sheet of students' names, phone numbers, birth dates and
pastoral notes. Sharing the flag would make two unlike things look like one,
and the shared flag would then *enforce* the confusion. (2) A second flag that
defaults on and that nothing ever turns off is dead config; the honest
alternative is a comment at the top of `routes/imports.ts` saying exactly why
the upload flag does not apply, which the next reader will actually see.
(3) `exceljs` earns its place only when `.xlsx` intake lands; adding a
spreadsheet library to a backend that cannot receive a spreadsheet is cost
without capability. v1's `cellText()` (`src/lib/spreadsheet.ts:6-22`), which
exists purely to flatten ExcelJS's seven cell shapes, has no counterpart here
and must not be ported.

### D-16.3 — The capability is surfaced on the wire, not implied by a missing button.

*Ruling.* `GET /api/v1/imports/students/template` returns
`capabilities: { pasteText: true, fileUpload: false }`, sourced from a named
constant `IMPORT_FILE_UPLOAD_SUPPORTED = false` in `routes/imports.ts`. The
screen renders "Pasting is the only way in right now — file upload arrives
with the CMS" from that flag.

*Reason.* The roadmap's standing item says Plans 1 and 17 "surface
`canUploadFiles` so screens degrade honestly". A screen that simply omits a
picker teaches the operator the feature was forgotten; a screen that says why
teaches them to wait for it. Flipping the constant to `true` is the whole
client-side change when intake lands.

### D-16.4 — The preview stays in the client and is resubmitted; the **commit** is what makes that safe, by re-deriving every fact server-side.

*Question.* Spec §7 and D1 recommend a server-owned import session under an
opaque `importId`, because v1's "post the rows back" protocol (R32, R34, R73)
makes the preview advisory — a commit can carry rows that were never parsed,
never validated by the server's classifier and never seen by an operator.

*Ruling.* **The roadmap binds: preview state is held client-side and
resubmitted on commit.** No session store is built. The integrity hole is
closed from the other end: the commit body carries only cell **values**
(`{ rowNumber, values }`), never a client-computed `status`, and
`commitStudentImport` re-runs the commit validator (D-16.9) and the *same* database
existence lookup the preview ran, row by row, before writing that row (D-16.5). The
preview is a forecast; the commit is authoritative. *(v1 parity 2026-10-09: was "same
validator, inside one transaction, before writing anything")*

*Reason.* Spec D9 is explicit that the session model has nowhere to live: an
`ImportBatch` table is a migration (C1), and the in-process TTL store it
proposes as a transition does not survive a restart and is wrong behind more
than one instance — an import that silently loses its session on a redeploy is
a worse failure than the one it fixes. Re-deriving at commit gets the *whole*
integrity benefit D1 asks for (the server commits only rows it has itself
classified) at the cost of one extra classification pass, with no state to
lose. The durable session and the audit trail it would carry go to Plan 18.

*Consequence, stated rather than hidden.* Spec D19 recommends paging the
preview so a phone does not hold 2000 students' personal data. Paging is
**incompatible** with client-held state — the client must hold every row it
intends to resubmit. The mitigations are therefore: a smaller cap (D-16.10),
and a hard rule that the preview is never persisted to disk on the device
(D-16.18).

### D-16.5 — The commit is v1's sequential per-row loop, each row in its own transaction.

*Ruling (v1, `jpc-space/src/lib/student-import.ts:238-291`).* `commitStudentImport`
walks the rows in order. For each row it validates (D-16.9; a failure is reported
`failed` "Invalid name or email." and the loop continues, R42), re-checks existence
by email (D-16.6; a hit is `skipped` "Already in the system.", R44), then writes that
one row — `User`, `StudentProfile` and, in season mode, an ACTIVE `SeasonEnrollment` —
in **its own** `db.$transaction` through `createStudentRows(tx, [row], target)` (R45,
R46). A unique-violation (`P2002`) on that insert is recorded `skipped` "Already in
the system." (R52); any other error is logged by row number (D-16.18) and recorded
`failed` "Could not create this account." (R53). Earlier rows stay committed when a
later one fails. The result is the per-row list of `created` / `skipped` / `failed`
outcomes (with `userId` on `created`) plus the three tallies `created`, `skipped`,
`failed` (R54, `student-import.ts:181-196`, `:286-291`); `rowNumber` may ride along
as a display aid. *(v1 parity 2026-10-09: was "one all-or-nothing transaction; 422 import_rows_invalid / 409 import_conflict; created/skipped/enrolled tallies")*

*Reason.* Owner ruling 2026-10-09: v2 behaves as v1 unless v1 is a defect. v1's
per-row commit is a design choice, not a bug: every row's outcome is reported, and a
re-run is safe because of D-16.6's idempotence by email. The `ImportRowsInvalidError`
422 branch and the `409 import_conflict` branch (`routes/imports.ts:165-188`) are
removed; there is no `enrolled` outcome (D-16.7).

### D-16.6 — Idempotence is by email, matched case-insensitively, stored verbatim. This is the plan's load-bearing rule.

*Question.* v1's student importer matches existing users by exact string
against a case-sensitive Postgres column (R28, R43), while its *group*
importer lower-cases both sides (R60). `User.email` is a plain `String @unique`
with no `citext` and no normalisation anywhere in v1 (spec D2, verified at
`prisma/schema.prisma:105`).

*Ruling.* Change the **comparison**, not the storage.

1. The existence lookup at preview **and** at commit matches on
   `lower(email)`.
2. In-paste duplicate detection matches on `lower(email)` too — so
   `Foo@x.com` and `foo@x.com` in one paste are one person, not two accounts
   (v1 created two, R25).
3. The address is **stored exactly as the operator typed it**, so v1's
   case-sensitive `verifyCredentials` lookup keeps working for every row
   already in the shared database.

*Reason.* Actually normalising stored emails is a coordinated change across
domain 11 (users) and domain 1 (auth) and must not be made unilaterally from
an importer, and must not be made at all while v1 is live (spec D2). Changing
only the comparison cannot mint a duplicate and cannot break an existing
login. **On a match the importer never updates and never duplicates** — R44,
kept, and this is what makes "a re-run of the same paste creates zero new
rows" true. The branch that implements it is marked in the source with a
banner comment and is mutation 1 in Task 7.

### D-16.7 — An existing user is always skipped; the import never updates or enrols an existing person.

*Ruling (v1, `jpc-space/src/lib/student-import.ts:248-251`).* Every row whose email
matches an existing user (D-16.6) is reported `skipped` "Already in the system." and
nothing about that user is written. There is no `onExisting` field on the commit
body, no `enroll` arm, and no enrol confirmation on the screen. *(v1 parity 2026-10-09: was "onExisting: skip | enroll required; enroll enrols existing students via enrollStudentInSeason")*

*Reason.* Owner ruling 2026-10-09 (v1 parity). Spec D4's returning-student gap is a
product request, not a v1 defect; bringing a returning student into a new season
stays Plan 7's single-student enrolment action.

### D-16.8 — The importer reuses Plan 7's student write path. There is exactly one way to create a student.

*Question.* v1's importer reaches the database directly and bypasses domain
6's own `createStudentAction` (spec R46), and the two paths produce
differently-initialised accounts — the form's gets `ChangeMe123!`, the
importer's gets `passwordHash: null`.

*Ruling.* Plan 7's `POST /api/v1/students` handler body is **extracted** into
`createStudentRows(tx, inputs, target)` in
`apps/backend/src/lib/queries/students.ts`, and both the route and the
importer call it. The importer does **not** enrol existing students (D-16.7), so
it does not call Plan 7's `POST /students/:id/enrollments` path; Task 4 Step 4b's
`enrollStudentInSeason` extraction is not needed by this plan. *(v1 parity
2026-10-09: was "importer's enroll arm calls enrollStudentInSeason")*

*Not* the only `STUDENT` writer, and the earlier draft's grep claiming so was
false: Plan 9's `POST /api/v1/users` creates a `User` of any role — `STUDENT`
included — with an empty profile and an invite, and its role-change `PATCH`
creates a profile on a promotion to `STUDENT`. That path is invite-first,
creates no enrolment and is not routed through `createStudentRows` (it would
drag the invite flow into the students module). The invariant that matters is
the **credential** one, and it holds on every path: `passwordHash: null`.
Task 7 checks it as a review item, not a grep.

*Reason.* Two write paths for one fact is how the two v1 paths came to
disagree about credentials. Extracting rather than re-implementing also means
Plan 7's rulings — `role` forced not accepted, `passwordHash: null`, the
profile pointer and the enrolment agreeing by construction — apply to the
importer for free and cannot drift. The function takes a batch because the
importer needs a batch; the single-row route passes an array of one.

### D-16.9 — Preview and commit validate in two stages, as v1.

*Ruling (v1, `jpc-space/src/lib/student-import.ts:129` versus `:71-87`).* The preview
classifier checks only that the name is at least 2 characters and the email parses
(plus D-16.11's date-of-birth rule, KEEP-FIX R50); an over-long value previews `new`.
The commit validates each row against `studentImportRowSchema`, which is defined in
`packages/shared/src/import.ts` with **v1's import bounds**: name 2–120, phone 50,
university 200, year 50, date of birth 40, spiritual background 2000, gifts 2000,
notes 2000 — not derived from `createStudentRequestSchema`. A row failing it is
reported `failed` "Invalid name or email." and the loop continues (D-16.5). *(v1 parity 2026-10-09: was "one validator, createStudentRequestSchema.omit({ seasonId }), full bounds at preview")*

*Reason.* Owner ruling 2026-10-09 (v1 parity, R24, R41). The preview reports what
v1's preview reported; an over-long cell surfaces as that row's `failed` outcome.

### D-16.10 — The row shape is flat, and the caps are 2000 rows / 5 MB of text.

*Ruling.* An import row is `{ name, email, university, year, phone,
dateOfBirth, spiritualBackground, gifts, notes }` — flat. v1's nested
`profile` object (`ImportProfileFields`, `student-import.ts:11-19`) is not
ported. Caps: `IMPORT_MAX_ROWS = 2000` (v1's, R35, kept) and
`IMPORT_MAX_PASTE_CHARS = 5 * 1024 * 1024` — v1's 5 MB import ceiling
(`jpc-space/src/lib/student-import-actions.ts:18`, `group-import-actions.ts:12`, R3);
`config.importBodyLimit` (`importJsonParser`, `routes/imports.ts:85`) is raised so a
5 MB paste and its 2000-row commit body fit. *(v1 parity 2026-10-09: was "256 KB paste cap")*

*Reason.* The nesting existed only because v1's importer had a schema of its
own. The ceiling is v1's (owner ruling 2026-10-09). Both constants live in
`packages/shared` so the screen refuses an oversized paste before spending a
request on it (v1 refuses over 5 MB client-side too, `src/components/ui/file-upload.tsx:32-38`,
R4), and the server re-checks.

### D-16.11 — Date of birth is ISO-only, real-date-checked, stored as UTC midnight, and a bad value fails its row.

*Question.* Spec D8/R50: v1 parses with the bare `new Date(string)`
constructor (`student-import.ts:209-210`) and drops an `Invalid Date`
silently.

*Ruling.* A non-empty date-of-birth cell must match `^\d{4}-\d{2}-\d{2}$`
**and** round-trip through `Date` unchanged (so `2003-02-30` is rejected
rather than rolled to 3 March). It is stored as `T00:00:00.000Z`. Anything
else classifies the row `invalid` with the message
`"Date of birth must be written as YYYY-MM-DD."` — the row does not import.

*Reason.* Three defects in one line, all named by D8. `new Date("01/02/2003")`
is 2 January in V8, so a European sheet transposes every birthday. A bare date
resolves to **local** midnight, and v1 has no timezone handling anywhere, so
on a UTC+2 server the stored instant lands on the previous day in UTC — which
ruling C2 forbids: wall-clock derivations resolve server-side against one
organisation timezone, never an incidental one. And silently dropping the
value means the operator sees "created" and a missing birth date. Strictness
costs the operator one find-and-replace and buys correctness for every row.

### D-16.12 — Unrecognised columns are silently ignored, as v1.

*Ruling (v1, `jpc-space/src/lib/student-import.ts:100-103`).* A header cell that
matches no alias is ignored; the preview carries no `unrecognisedColumns` and the
screen shows no "column(s) not recognised" warning. `detectedColumns` (R19) stays. *(v1 parity 2026-10-09: was "unrecognisedColumns reported and shown as a warning")*

*Reason.* Owner ruling 2026-10-09 (v1 parity, R18).

### D-16.13 — `student` is a `name` alias.

*Ruling.* The accepted name headers are `name` and `student`.

*Reason.* Spec D14: every season export sheet's first column is headed
`"Student"` (`jpc-space/src/lib/season-export.ts:106,130,158`), and v1's
student importer rejects such a file outright with R15's message — which, to
an operator holding a file this system just produced, reads like a bug. One
word.

### D-16.14 — A soft-deleted user reads `exists`, as v1; there is no fifth status.

*Ruling (v1, `jpc-space/src/lib/student-import.ts:9`, `:157-167`).* Four statuses
only — `new`, `exists`, `duplicate`, `invalid`. The existence lookup stays unfiltered
by `deletedAt`, so a soft-deleted user's email previews `exists` "Already in the
system." and commits `skipped` with the same message. It is never resurrected. *(v1 parity 2026-10-09: was "fifth status previously_removed with a restore message")*

*Reason.* Owner ruling 2026-10-09 (v1 parity, R22).

### D-16.15 — Format-dependent value mangling cannot happen, because there is only one format.

*Ruling.* No cell is ever coerced to a number. `parseDelimited` produces
strings and nothing else.

*Reason.* Spec D7/R7/R8: v1's CSV branch forces raw text with an identity
`map` specifically to protect a leading `+` and leading zeros in phone
numbers, with the reason in a comment at `spreadsheet.ts:30-32` — and its
XLSX branch has no such protection, so the same data gives two different
answers depending on which accepted format it was saved in. Paste-only intake
plus a string-only scanner closes this by construction rather than by patching
half a code path. When `.xlsx` intake lands it must read formatted text, not
values; record that in the route file so the next author does not reintroduce
D7.

### D-16.16 — Every fixture email in the integration suite is machine-checked against `cleanupTestData`'s filter.

*Ruling.* The suite builds every paste through a `sheet()` helper that
**throws** on any email not matching `^space-v2-test-.*@jpc\.test$`, a test
asserts the helper actually throws, and `afterAll` asserts the database holds
zero prefixed rows after cleanup. Any season an import targets is created by
`createTestSeason()` — never a real one.

*Reason.* This is the sharpest hazard in the plan and the reason the rule is
mechanical rather than advisory. `cleanupTestData` finds users by
`{ email: { startsWith: "space-v2-test-", endsWith: "@jpc.test" } }`, so a
single mistyped fixture address mints a real-looking account in a database
`jpc-space` is live against and nothing will ever delete it. And it finds
`SeasonEnrollment` rows by *test season id* — so an enrolment written into a
**real** season would survive cleanup, and then `user.deleteMany` would throw
(`SeasonEnrollment.studentUser` is `onDelete: Restrict`) and strand the whole
fixture set. See the model-coverage audit in Task 3 Step 1.

### D-16.17 — `users/import` lives in the `users/` directory Plan 10 created, and `routeNameForHref` stays the generalised set.

*Ruling.* Plan 10 Task 9 (earlier in the order) already converted
`app/(app)/users.tsx` to `app/(app)/users/index.tsx` and added `"users"` to
the `DIRECTORY_ROUTE_HREFS` set that Plan 6 introduced
(`["students", "seasons", "users"]`). This plan only verifies that, then
appends `"users/import"` to `DETAIL_ROUTE_NAMES`.

*Reason.* Spec §9 puts the screen at `/users/import`, and expo-router needs a
directory for that — which Plan 10 already provides for `users/new`.
`routeNameForHref` consults one set (Plan 6's mechanism) rather than
hard-coded branches, so no edit to it is needed here. `DETAIL_ROUTE_NAMES` is the existing mechanism for a
route file that must be declared to `Tabs` but hidden with `href: null` —
without a declaration, `Tabs` auto-registers the file and it *appears in the
tab bar*.

### D-16.18 — The preview never touches device storage, and the server never logs an email address.

*Ruling.* The preview lives in React state and nowhere else — no
`expo-secure-store`, no `AsyncStorage`, no React Query cache (preview and
commit are `useMutation`, not `useQuery`). On the server, a failed import logs
the row number, never the address; v1 logs the email
(`student-import.ts:280`).

*Reason.* Spec D19. A 2000-row preview is a complete roster with phone
numbers, birth dates and pastoral notes. Holding it in memory for the duration
of one screen is the unavoidable cost of D-16.4; writing it to disk, or into a
query cache that outlives the screen, is not. `useMutation` also gives the
right semantics anyway: preview is a request that changes what the operator
sees, not a cacheable read.

### D-16.19 — The group importer refuses ambiguity instead of guessing, reports what it actually wrote, and resolves the roster through `SeasonEnrollment`.

Four rulings in one, all on the group importer:

1. **A row naming an ambiguous group is refused; the rest of the paste imports.**
   The whole-paste refusal is withdrawn (v1 never refuses the file for this,
   `jpc-space/src/lib/group-import.ts:59`, R65): the preview builds the season's
   name index and every other row classifies exactly as v1. A row whose trimmed,
   lower-cased group cell matches **more than one** group of the season classifies
   `no_group` (v1's existing status, no new enum member) with the message
   `Several groups in this season are named "X". Rename one of them, then import
   again.`, carries no `groupId`, and so can never reach the commit. v1 instead
   lets the **last** same-named group silently receive every such row
   (`new Map(groups.map(...))`, `group-import.ts:59`) — kept as a fix, because
   with Plan 18's `@@unique([seasonId, name])` (M2) dropped (05-R15 reverts to
   v1: duplicate group names are allowed) that guess writes students into an
   arbitrary group and reports it as success. This row-level refusal is what
   replaces M2. *(v1 parity 2026-10-09: was "whole paste refused when two season
   groups share a name; uniqueness constraint → Plan 18")*
2. **`assigned` is the number written, and `skippedStudentIds` comes back.**
   v1 returns the *requested* array length (spec D5/R80), so "Assigned 40
   students" can mean 12 were written — reported as success.
3. **Eligibility is an enrolment in this season, not `StudentProfile.activeSeasonId`.**
   Ruling C9 governs: "is this student in this season" resolves through
   `SeasonEnrollment`. v1 gates on the active-season pointer in both the
   roster query (R61) and the write (R76), which is precisely what produces
   D5's silent skips. Consequence: the preview's candidate set and the write's
   accept set are now derived from **the same fact**, so a row that previews
   `assign` is a row that will be written.
4. **A blank group cell stays `no_group`.** Bulk unassign is not built (spec
   D10). The design, if wanted later: a reserved literal (`-` or `none`) means
   unassign, a blank cell keeps meaning `no_group` so an accidentally empty
   column cannot wipe a season's groupings, and unassigns get their own
   preview count.

### D-16.20 — Route shapes: `seasonId` in the path; both importers' routes in one file; the group commit still posts ids.

*Ruling.* Group import paths are
`POST /api/v1/seasons/:id/imports/groups/preview|commit`, with `seasonId`
taken **only** from the path. Both routers live in `routes/imports.ts`.
`seasonImportsRouter` is mounted at `/api/v1/seasons` **before** the global
JSON parser (and so before `seasonsRouter`) because it parses its own bodies
with a larger limit (Task 3 Step 4a); it defines only the two POSTs and carries
no router-level middleware, so every other `/api/v1/seasons/*` request falls
through untouched, and `requireAuth` is attached per route (ruling X5). The
group commit body carries resolved `{ studentUserId, groupId }` pairs, as v1's
did.

*Reason.* v1 takes `seasonId` as an argument on **both** calls
(`group-import-actions.ts:20,59`), so preview and commit could in principle
target different seasons; a path parameter removes the possibility and matches
the existing `seasons.ts` router shape. Keeping both routers in one file means
neither agent touches `routes/seasons.ts`, removing a contention point with
any other in-flight plan; two routers mounted on the same prefix are fine
because the first simply `next()`s a path it does not match. Posting ids is
safe here for the reason spec §4 gives: unlike the student importer, the
group importer's **write independently re-derives every scope it needs** —
every target group must belong to the season (whole batch refused if not) and
every student must hold an enrolment in it. A caller who fabricates ids
achieves nothing they could not already do from the roster grid.

### D-16.21 — The import endpoints are not rate-limited, as v1.

*Ruling (v1, `jpc-space/src/lib/student-import.ts:247-278`; `src/lib/group-actions.ts:225-244`).*
No limiter on either preview or either commit: `previewLimiter`, `commitLimiter`,
`importLimiter` and the `IMPORT_PREVIEW_RATE_LIMIT` / `IMPORT_COMMIT_RATE_LIMIT` config
are removed (`routes/imports.ts:66-72`, `:116`, `:140`, `:244`, `:268`). Two
concurrent commits of the same rows resolve per row: the loser's rows hit the unique
index and are reported `skipped` "Already in the system." (D-16.5, R52). *(v1 parity 2026-10-09: was "preview 30/15 min, commit 10/15 min limiters; a race answered 409 import_conflict")*

*Reason.* Owner ruling 2026-10-09 (v1 parity, R84).

### D-16.22 — Duplicate recognised headers: v1's asymmetric rule, ported as-is.

*Ruling (v1, `jpc-space/src/lib/student-import.ts:96-103`).* If two columns are
`name` (or both email headers), the **last** one wins — `nameCol`/`emailCol` are
assigned unconditionally; if two columns map to the same profile field, the **first**
wins (`students.ts:69-79`: drop the `=== -1` guards on name and email, keep the
profile guard). *(v1 parity 2026-10-09: was "first wins, uniformly")*

*Reason.* Owner ruling 2026-10-09 (v1 parity, R17).

---

## Deferred to cutover

Everything here needs a schema change and therefore belongs to **Plan 18**
(`docs/superpowers/plans/2026-10-05-plan-18-cutover.md`), per ruling C1. None
of it is worked around by overloading an existing column.

| # | What | Column(s) needed | Source |
|---|---|---|---|
| 1 | **A durable import session** — parsed rows held server-side under an `importId`, so a commit sends an id rather than a payload, the flow is resumable, and inline row correction (`PATCH /imports/:importId/rows/:rowNumber`) becomes possible | new `ImportBatch` + `ImportBatchRow` tables | spec D9, D1, §10d |
| 2 | **An import audit trail** — which operator imported which batch, when, in what mode, with what per-row outcome. Today `User.createdAt` is the only trace | folded into #1's tables; plus `User.createdById` / `User.updatedById`, which do not exist (`schema.prisma:103-164`) | spec D15 |
| 3 | **Email normalisation** — `citext` on `User.email`, or a lowercase backfill, so storage and comparison finally agree. v2 changes only the comparison (D-16.6); the stored values are v1's and must stay readable by v1's case-sensitive login | `User.email` type change + backfill, coordinated with domains 1 and 11 | spec D2 |
| 4 | **Freeing a soft-deleted user's address** so a removed person can be re-imported. `User.email` is `@unique` regardless of `deletedAt`, so the address is reserved forever and the row reads `exists` "Already in the system." permanently (D-16.14) *(v1 parity 2026-10-09: was "reads previously_removed")* | partial unique index on `(email) WHERE "deletedAt" IS NULL` | spec D6, D-16.14 |
| 5 | **`Group.name` uniqueness per season — dropped.** Duplicate group names stay allowed, as v1 (05-R15); the importer refuses only the ambiguous **row** (D-16.19.1), so no constraint is needed *(v1 parity 2026-10-09: was "v2 refuses the file; @@unique([seasonId, name]) deferred to Plan 18")* | none | spec D17; 05-R15, 16-R65 |
| 6 | **`GroupStudent` per-season uniqueness + backfill from enrolments.** `studentUserId` is `@unique` standalone, so assigning a student to a group deletes their membership in *every other season's* group. v2 keeps writing it that way because it must; the fact is recorded on `SeasonEnrollment.groupId`, which is what every read in this plan uses | composite key on `GroupStudent` | ruling C9, spec R70/R77 — already on Plan 18's list |
| 7 | **A functional index for the case-insensitive email lookup.** `lower(email) IN (...)` is a sequential scan on `User`; acceptable at this table's size and behind a rate limiter, but it is the one query in this plan that does not use an index | `CREATE INDEX ON "User" (lower(email))` | D-16.6, Task 3 |

---

### Task 1: Contracts — `packages/shared/src/import.ts` *(coordinator)*

**Files:**
- Create: `packages/shared/src/import.ts`
- Modify: `packages/shared/src/index.ts` (add `export * from "./import";`)
- Test: `packages/shared/src/__tests__/import-schemas.test.ts`

**Interfaces:**
- Consumes: `createStudentRequestSchema` from `./student` (Plan 7 Task 1).
- Produces (exact names later tasks import): `IMPORT_MAX_ROWS`, `IMPORT_MAX_PASTE_CHARS`, `IMPORT_MAX_CELL_CHARS`, `IMPORT_NAME_HEADERS`, `IMPORT_EMAIL_HEADERS`, `IMPORT_GROUP_HEADERS`, `IMPORT_PROFILE_FIELDS`, `ImportProfileFieldKey`, `IMPORT_PROFILE_ALIASES`, `IMPORT_FIELD_LABELS`, `importRowStatusSchema` / `ImportRowStatus`, `importCellValuesSchema` / `ImportCellValues`, `studentImportRowSchema` / `StudentImportRow`, `studentImportPreviewRowSchema`, `studentImportCountsSchema`, `studentImportPreviewSchema` / `StudentImportPreview`, `importOnExistingSchema` / `ImportOnExisting`, `studentImportCommitRowSchema`, `studentImportCommitInputSchema` / `StudentImportCommitInput`, `importCommitOutcomeSchema`, `studentImportResultRowSchema` / `StudentImportResultRow`, `studentImportResultSchema` / `StudentImportResult`, `importColumnSpecSchema`, `importTemplateSchema` / `ImportTemplate`, `pastedSheetInputSchema` / `PastedSheetInput`, `groupImportRowStatusSchema`, `groupImportPreviewRowSchema`, `groupImportPreviewSchema` / `GroupImportPreview`, `groupImportCommitInputSchema`, `groupImportResultSchema` / `GroupImportResult`.

Plan 7 runs before this plan in the execution order, so `createStudentRequestSchema`
always exists here; derive from it (`.omit({ seasonId: true })`) — never restate its maxima (D-16.9).

- [ ] **Step 1: Write the failing test**

> **v1 parity 2026-10-09:** Update the contract tests to the reverted shapes in Step 3: `IMPORT_MAX_PASTE_CHARS === 5 * 1024 * 1024`; the row-status enum is exactly `new | exists | duplicate | invalid` (no `previously_removed`); the preview has no `unrecognisedColumns`; `studentImportRowSchema` refuses phone 51, university 201, year 51, date of birth 41, spiritual background / gifts / notes 2001 chars and accepts each at the bound; the commit input has no `onExisting`; the outcome enum is `created | skipped | failed` and the result tallies are `created`, `skipped`, `failed`.

```ts
// packages/shared/src/__tests__/import-schemas.test.ts
import {
  IMPORT_MAX_ROWS,
  IMPORT_PROFILE_ALIASES,
  IMPORT_NAME_HEADERS,
  importCellValuesSchema,
  pastedSheetInputSchema,
  studentImportCommitInputSchema,
  studentImportRowSchema,
} from "../index";

describe("studentImportRowSchema", () => {
  const valid = { name: "Test Student", email: "space-v2-test-x@jpc.test" };

  it("has no password, passwordHash, role or seasonId field at all", () => {
    // D-16.8/Plan 9: an import issues no credentials and cannot choose a
    // role. Structural, not a default — the schema must not know the words.
    for (const key of ["password", "passwordHash", "role", "seasonId", "graduationYear"]) {
      expect(key in studentImportRowSchema.shape).toBe(false);
    }
  });

  it("enforces the SAME maxima at preview time as the student create schema (D-16.9 / spec D12)", () => {
    // v1 checked lengths only on the commit side, so a 300-character name
    // previewed green and came back `failed` after the operator committed.
    expect(studentImportRowSchema.safeParse({ ...valid, name: "x".repeat(300) }).success).toBe(false);
    expect(studentImportRowSchema.safeParse({ ...valid, name: "x" }).success).toBe(false);
    expect(studentImportRowSchema.safeParse({ ...valid, email: "not-an-email" }).success).toBe(false);
  });

  it("coerces an empty optional cell to null, never \"\"", () => {
    expect(studentImportRowSchema.parse({ ...valid, phone: "" }).phone).toBeNull();
  });
});

describe("importCellValuesSchema", () => {
  it("carries the nine flat cells the preview echoes back for resubmission", () => {
    const parsed = importCellValuesSchema.parse({
      name: "A Student", email: "a@jpc.test", university: null, year: null,
      phone: null, dateOfBirth: null, spiritualBackground: null, gifts: null, notes: null,
    });
    expect(parsed.name).toBe("A Student");
    // v1's nested `profile` object does not port (D-16.10).
    expect("profile" in parsed).toBe(false);
  });
});

describe("studentImportCommitInputSchema", () => {
  const rows = [{ rowNumber: 2, values: { name: "A", email: "a@jpc.test", university: null, year: null, phone: null, dateOfBirth: null, spiritualBackground: null, gifts: null, notes: null } }];

  it("requires onExisting — no default may be inherited by accident (D-16.7)", () => {
    const missing = studentImportCommitInputSchema.safeParse({ mode: "season", seasonId: 1, rows });
    expect(missing.success).toBe(false);
  });

  it("refuses onExisting=enroll in alumni mode — there is no season to enrol into", () => {
    expect(
      studentImportCommitInputSchema.safeParse({
        mode: "alumni", graduationYear: 2020, onExisting: "enroll", rows,
      }).success,
    ).toBe(false);
  });

  it("caps the graduation year against THIS YEAR, evaluated per parse (spec R38)", () => {
    // v1 captured CURRENT_YEAR at module load in both the server action
    // (student-import-actions.ts:49) and the client (:54), so a long-lived
    // process caps the year at whenever it booted.
    const thisYear = new Date().getUTCFullYear();
    const ok = studentImportCommitInputSchema.safeParse({ mode: "alumni", graduationYear: thisYear, onExisting: "skip", rows });
    const future = studentImportCommitInputSchema.safeParse({ mode: "alumni", graduationYear: thisYear + 1, onExisting: "skip", rows });
    expect(ok.success).toBe(true);
    expect(future.success).toBe(false);
  });

  it("caps the batch at IMPORT_MAX_ROWS", () => {
    const many = Array.from({ length: IMPORT_MAX_ROWS + 1 }, (_, i) => ({ ...rows[0], rowNumber: i + 2 }));
    expect(
      studentImportCommitInputSchema.safeParse({ mode: "season", seasonId: 1, onExisting: "skip", rows: many }).success,
    ).toBe(false);
  });

  it("never accepts a client-computed status — the server re-derives it (D-16.4)", () => {
    const parsed = studentImportCommitInputSchema.parse({
      mode: "season", seasonId: 1, onExisting: "skip",
      rows: [{ ...rows[0], status: "new" }],
    });
    expect("status" in parsed.rows[0]).toBe(false);
  });
});

describe("pastedSheetInputSchema", () => {
  it("defaults the delimiter to auto and refuses an empty paste", () => {
    expect(pastedSheetInputSchema.parse({ text: "name\temail\nA\ta@jpc.test" }).delimiter).toBe("auto");
    expect(pastedSheetInputSchema.safeParse({ text: "" }).success).toBe(false);
  });
});

describe("the header vocabulary", () => {
  it("accepts \"student\" as a name header so a season export round-trips (spec D14)", () => {
    // Every export sheet's first column is headed "Student"
    // (jpc-space/src/lib/season-export.ts:106,130,158); v1 rejected such a
    // file outright with the "needs a header row" message.
    expect(IMPORT_NAME_HEADERS).toContain("student");
    expect(IMPORT_NAME_HEADERS).toContain("name");
  });

  it("keeps v1's profile aliases", () => {
    expect(IMPORT_PROFILE_ALIASES["mobile no."]).toBe("phone");
    expect(IMPORT_PROFILE_ALIASES["spiritual gifts"]).toBe("gifts");
    expect(IMPORT_PROFILE_ALIASES.college).toBe("university");
    expect(IMPORT_PROFILE_ALIASES.dob).toBe("dateOfBirth");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter @space/shared jest src/__tests__/import-schemas.test.ts`
Expected: FAIL with `Cannot find module '../index'`-level resolution success
but `TypeError: Cannot read properties of undefined (reading 'shape')` /
`studentImportRowSchema is not defined` — i.e. every export is missing. That
is the right failure: it proves the test is exercising the real barrel export,
not a local stub.

- [ ] **Step 3: Write the contracts**

> **v1 parity 2026-10-09:** In `packages/shared/src/import.ts`: `IMPORT_MAX_PASTE_CHARS = 5 * 1024 * 1024` (v2 `:21`; v1 `src/lib/student-import-actions.ts:18`, R3); remove `previously_removed` from the status enum and the counts (`:93-104`, `:168`; v1 `jpc-space/src/lib/student-import.ts:9`, R22); remove `unrecognisedColumns` (`:182`, R18); define `studentImportRowSchema` with v1's import bounds — name 2–120, email, phone 50, university 200, year 50, dateOfBirth 40 (+ D-16.11's ISO rule), spiritualBackground 2000, gifts 2000, notes 2000 — instead of `createStudentRequestSchema.omit(...)` (`:145`; v1 `jpc-space/src/lib/student-import.ts:71-87`, R41); drop `importOnExistingSchema` and the `onExisting` fields from the commit input (`:239`, `:248`, R44); outcome enum `["created", "skipped", "failed"]` and result tallies `created/skipped/failed`, `enrolled` removed (`:255-279`; v1 `jpc-space/src/lib/student-import.ts:181-196`, R42, R54).

```ts
// packages/shared/src/import.ts
import { z } from "zod";

import { createStudentRequestSchema } from "./student";

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

/** v1's cap (spec R35), kept. */
export const IMPORT_MAX_ROWS = 2000;

/**
 * 256 KB of pasted text. This REPLACES v1's 5 MB file ceiling (R3), which was
 * a file-size limit checked after the whole file had already reached the
 * server. 5 MB of text is not a realistic paste, it is a request body; 256 KB
 * comfortably holds 2000 rows with eight populated columns. The client checks
 * it before spending a request and the server checks it again, because a
 * client-side limit is a courtesy and not a control.
 */
export const IMPORT_MAX_PASTE_CHARS = 256 * 1024;

/**
 * Per-cell ceiling on the RAW value echoed back for resubmission. Deliberately
 * larger than any field's real maximum so an over-long cell fails
 * `studentImportRowSchema` with a message naming the column, instead of being
 * swallowed by the body schema with a generic "invalid request".
 */
export const IMPORT_MAX_CELL_CHARS = 5000;

// ---------------------------------------------------------------------------
// Header vocabulary — pure data, shared so the mobile screen can render
// "columns we recognise" without a round trip (spec §8).
// ---------------------------------------------------------------------------

/**
 * `student` is v2's addition (spec D14): every season export's first column is
 * headed "Student", and v1's importer rejected the file this system had just
 * produced.
 */
export const IMPORT_NAME_HEADERS = ["name", "student"] as const;
export const IMPORT_EMAIL_HEADERS = ["email", "e-mail"] as const;
export const IMPORT_GROUP_HEADERS = ["group"] as const;

export const IMPORT_PROFILE_FIELDS = [
  "phone",
  "university",
  "year",
  "dateOfBirth",
  "spiritualBackground",
  "gifts",
  "notes",
] as const;
export type ImportProfileFieldKey = (typeof IMPORT_PROFILE_FIELDS)[number];

/** v1's table verbatim (`jpc-space/src/lib/student-import.ts:24-42`). */
export const IMPORT_PROFILE_ALIASES: Readonly<Record<string, ImportProfileFieldKey>> = {
  phone: "phone",
  mobile: "phone",
  "mobile no": "phone",
  "mobile no.": "phone",
  "mobile number": "phone",
  "phone number": "phone",
  university: "university",
  college: "university",
  year: "year",
  "date of birth": "dateOfBirth",
  dob: "dateOfBirth",
  birthdate: "dateOfBirth",
  "birth date": "dateOfBirth",
  "spiritual background": "spiritualBackground",
  gifts: "gifts",
  "spiritual gifts": "gifts",
  notes: "notes",
};

/** Display labels (`student-import.ts:44-52`), used by `detectedColumns`. */
export const IMPORT_FIELD_LABELS: Readonly<Record<ImportProfileFieldKey, string>> = {
  phone: "Mobile No",
  university: "University",
  year: "Year",
  dateOfBirth: "Date of birth",
  spiritualBackground: "Spiritual background",
  gifts: "Gifts",
  notes: "Notes",
};

// ---------------------------------------------------------------------------
// Student importer — preview
// ---------------------------------------------------------------------------

/**
 * v1 has four (`student-import.ts:9`). `previously_removed` is v2's fifth
 * (spec D6 / D-16.14): the existence lookup deliberately does NOT filter
 * `deletedAt` — un-deleted matching would let an import resurrect an account
 * somebody removed on purpose — but reporting a soft-deleted row as "Already
 * in the system" is a lie the operator cannot act on.
 */
export const importRowStatusSchema = z.enum([
  "new",
  "exists",
  "duplicate",
  "invalid",
  "previously_removed",
]);
export type ImportRowStatus = z.infer<typeof importRowStatusSchema>;

const cell = z.string().max(IMPORT_MAX_CELL_CHARS);

/**
 * The RAW trimmed cell text of one row, exactly as the preview read it. Flat,
 * not v1's nested `profile` object (D-16.10) — flatness is what lets
 * `studentImportRowSchema` be derived from the student create schema instead
 * of restated.
 *
 * These values are echoed to the client and resubmitted on commit (D-16.4),
 * so they must survive being invalid: a 300-character name is exactly what
 * this carries, and `studentImportRowSchema` is what refuses it.
 */
export const importCellValuesSchema = z.object({
  name: cell,
  email: cell,
  university: cell.nullable(),
  year: cell.nullable(),
  phone: cell.nullable(),
  /** Raw text as typed; `YYYY-MM-DD` is the only accepted form (D-16.11). */
  dateOfBirth: cell.nullable(),
  spiritualBackground: cell.nullable(),
  gifts: cell.nullable(),
  notes: cell.nullable(),
});
export type ImportCellValues = z.infer<typeof importCellValuesSchema>;

/**
 * ONE definition of "is this row importable", used by the preview classifier
 * and by the commit (D-16.9, fixing spec D12/R24).
 *
 * Derived, not restated: `createStudentRequestSchema` is the student domain's
 * own create contract, so an imported student and a form-created student
 * accept exactly the same data and there is no second set of maxima to drift.
 * `seasonId` is omitted because the target comes from the commit's mode and
 * applies to every row uniformly (spec R37) — a single paste can never mix
 * seasons.
 */
export const studentImportRowSchema = createStudentRequestSchema.omit({ seasonId: true });
export type StudentImportRow = z.output<typeof studentImportRowSchema>;

export const studentImportPreviewRowSchema = z.object({
  /**
   * The operator's line number: the header is line 1, data starts at line 2
   * (spec R11). NOT contiguous — a blank line keeps its number and is skipped
   * (R20), so "row 41" points at line 41 of what they pasted.
   */
  rowNumber: z.number().int().positive(),
  name: z.string(),
  email: z.string(),
  status: importRowStatusSchema,
  message: z.string().nullable(),
  /** Echoed back so the client can resubmit exactly what the server parsed. */
  values: importCellValuesSchema,
});

export const studentImportCountsSchema = z.object({
  new: z.number(),
  exists: z.number(),
  duplicate: z.number(),
  invalid: z.number(),
  previously_removed: z.number(),
  /** Blank rows skipped by R20 are excluded, exactly as v1 excludes them. */
  total: z.number(),
});

export const studentImportPreviewSchema = z.object({
  rows: z.array(studentImportPreviewRowSchema),
  /** "Name", "Email", then each matched profile column's label, in sheet order (R19). */
  detectedColumns: z.array(z.string()),
  /**
   * v2's addition (spec D11 / D-16.12). v1 silently ignores an unknown header
   * (R18), so `Phone No` or `Uni` vanishes without a word. Echoed as typed,
   * trimmed — matching trims too, so whitespace alone never causes a miss.
   */
  unrecognisedColumns: z.array(z.string()),
  /** What auto-sniffing chose, so the screen can say "read as tab-separated". */
  delimiter: z.enum(["comma", "tab"]),
  counts: studentImportCountsSchema,
});
export type StudentImportPreview = z.infer<typeof studentImportPreviewSchema>;

// ---------------------------------------------------------------------------
// Student importer — commit
// ---------------------------------------------------------------------------

/**
 * `skip` reproduces v1 exactly (R44). `enroll` is spec D4's fix for the
 * domain's highest-value gap: a returning student bulk-imported into a new
 * season currently ends the import with their old activeSeasonId and no new
 * enrolment, and the operator's only signal is a "Skip · exists" badge.
 *
 * `enroll` writes TWO things and nothing else — the SeasonEnrollment and the
 * activeSeasonId pointer. It never touches a User or profile field, because a
 * mode that overwrote profile data from a spreadsheet is how a stale export
 * erases a year of pastoral notes.
 */
export const importOnExistingSchema = z.enum(["skip", "enroll"]);
export type ImportOnExisting = z.infer<typeof importOnExistingSchema>;

/**
 * What the client posts per row. Cell VALUES only — no `status`. v1 posted
 * the client's own classification and the server never re-checked it (spec
 * R34: "the preview is advisory"). Here the server re-derives every status
 * itself before writing (D-16.4), so sending one would be meaningless; the
 * schema strips it.
 */
export const studentImportCommitRowSchema = z.object({
  rowNumber: z.number().int().positive(),
  values: importCellValuesSchema,
});

const commitRowsSchema = z.array(studentImportCommitRowSchema).min(1).max(IMPORT_MAX_ROWS);

/**
 * Evaluated per parse, not at module load. v1 captured `CURRENT_YEAR` once at
 * import time in BOTH the server action (`student-import-actions.ts:49`) and
 * the client (`student-import-form.tsx:54`), so a long-lived process caps the
 * alumni year at the year it booted (spec R38).
 */
const graduationYearSchema = z
  .number()
  .int()
  .min(1990)
  .refine((y) => y <= new Date().getUTCFullYear(), {
    message: "Graduation year cannot be in the future.",
  });

export const studentImportCommitInputSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("season"),
    seasonId: z.number().int().positive(),
    onExisting: importOnExistingSchema,
    rows: commitRowsSchema,
  }),
  z.object({
    mode: z.literal("alumni"),
    graduationYear: graduationYearSchema,
    // Alumni mode creates no enrolment at all (spec R48), so there is nothing
    // for `enroll` to mean. Narrowing the literal here is what makes that a
    // 400 rather than a silently ignored field.
    onExisting: z.literal("skip"),
    rows: commitRowsSchema,
  }),
]);
export type StudentImportCommitInput = z.output<typeof studentImportCommitInputSchema>;

/**
 * `failed` does not exist. The commit is all-or-nothing (D-16.5): a row that
 * cannot be written aborts the whole request with `422 import_rows_invalid`
 * and nothing is written, so no result can contain a failure. `enrolled` is
 * `onExisting: "enroll"` landing on an existing student.
 */
export const importCommitOutcomeSchema = z.enum(["created", "skipped", "enrolled"]);

export const studentImportResultRowSchema = z.object({
  /**
   * v1 omits the row number here (`student-import.ts:183-189`), which makes a
   * report impossible to map back to the sheet. Added (spec §8).
   */
  rowNumber: z.number().int().positive(),
  name: z.string(),
  email: z.string(),
  outcome: importCommitOutcomeSchema,
  message: z.string().nullable(),
  userId: z.number().nullable(),
});
export type StudentImportResultRow = z.infer<typeof studentImportResultRowSchema>;

export const studentImportResultSchema = z.object({
  created: z.number(),
  skipped: z.number(),
  enrolled: z.number(),
  rows: z.array(studentImportResultRowSchema),
});
export type StudentImportResult = z.infer<typeof studentImportResultSchema>;

// ---------------------------------------------------------------------------
// Intake + template
// ---------------------------------------------------------------------------

/**
 * The one intake shape (D-16.2). Spreadsheet apps put TAB-separated text on
 * the clipboard and a CSV export is comma-separated, so both must work;
 * `delimiter` exists so a comma-containing name in a TSV can never be
 * misread by a sniffer that guessed wrong.
 */
export const pastedSheetInputSchema = z.object({
  text: z.string().min(1).max(IMPORT_MAX_PASTE_CHARS),
  delimiter: z.enum(["comma", "tab", "auto"]).default("auto"),
});
export type PastedSheetInput = z.output<typeof pastedSheetInputSchema>;

export const importColumnSpecSchema = z.object({
  label: z.string(),
  acceptedHeaders: z.array(z.string()),
  required: z.boolean(),
  maxLength: z.number().nullable(),
  target: z.string(),
  note: z.string().nullable(),
});

export const importTemplateSchema = z.object({
  columns: z.array(importColumnSpecSchema),
  /** A ready-made tab-separated header line the operator can copy. */
  headerRow: z.string(),
  maxRows: z.number(),
  maxPasteChars: z.number(),
  /**
   * D-16.3. `fileUpload` is a hard `false` today; the screen renders the
   * reason rather than omitting a picker and letting the operator conclude
   * the feature was forgotten. It flips when .xlsx intake lands with the CMS.
   */
  capabilities: z.object({
    pasteText: z.boolean(),
    fileUpload: z.boolean(),
  }),
});
export type ImportTemplate = z.infer<typeof importTemplateSchema>;

// ---------------------------------------------------------------------------
// Group importer
// ---------------------------------------------------------------------------

/** v1's five (`jpc-space/src/lib/group-import.ts:6`), unchanged. */
export const groupImportRowStatusSchema = z.enum([
  "assign",
  "unchanged",
  "no_student",
  "no_group",
  "invalid",
]);

export const groupImportPreviewRowSchema = z.object({
  rowNumber: z.number().int().positive(),
  /** Read for display only — never written, never validated (spec R56). */
  name: z.string(),
  email: z.string(),
  group: z.string(),
  status: groupImportRowStatusSchema,
  message: z.string().nullable(),
  studentUserId: z.number().nullable(),
  groupId: z.number().nullable(),
});

export const groupImportPreviewSchema = z.object({
  rows: z.array(groupImportPreviewRowSchema),
  delimiter: z.enum(["comma", "tab"]),
  counts: z.object({
    assign: z.number(),
    unchanged: z.number(),
    no_student: z.number(),
    no_group: z.number(),
    invalid: z.number(),
    total: z.number(),
  }),
});
export type GroupImportPreview = z.infer<typeof groupImportPreviewSchema>;

/**
 * `seasonId` is NOT here: it comes from the path (D-16.20). v1 took it as an
 * argument on both the preview and the commit
 * (`group-import-actions.ts:20,59`), so the two calls could target different
 * seasons.
 */
export const groupImportCommitInputSchema = z.object({
  assignments: z
    .array(
      z.object({
        studentUserId: z.number().int().positive(),
        groupId: z.number().int().positive(),
      }),
    )
    .min(1)
    .max(IMPORT_MAX_ROWS),
});

export const groupImportResultSchema = z.object({
  /**
   * The number actually WRITTEN. v1 returns the requested array length
   * (spec R80/D5) while the underlying write silently skips anyone whose
   * eligibility check fails — "Assigned 40 students" could mean 12.
   */
  assigned: z.number(),
  skipped: z.number(),
  /** Who was not applied, so the screen can say which rows to look at. */
  skippedStudentIds: z.array(z.number()),
});
export type GroupImportResult = z.infer<typeof groupImportResultSchema>;
```

Then add to `packages/shared/src/index.ts`, after the existing nine lines:

```ts
export * from "./import";
```

- [ ] **Step 4: Run the test and the workspace checks**

```bash
pnpm --filter @space/shared jest src/__tests__/import-schemas.test.ts
pnpm turbo lint typecheck --filter=@space/shared
```
Both green.

- [ ] **Step 5: Commit**

```bash
git add packages/shared && git commit -m "feat(shared): import contracts derived from the student create schema"
```

---

### Task 2: The delimited-text parser *(Agent A)*

**Files:**
- Create: `apps/backend/src/lib/imports/delimited.ts`
- Test: `apps/backend/src/__tests__/delimited-parser.test.ts`

**Interfaces:**
- Consumes: nothing. This module has no imports at all — no database, no Zod, no shared package. That is deliberate: it is the only piece of the domain that is trivially unit-testable, and every rule it holds is one the integration suite would otherwise have to reach through HTTP.
- Produces: `ImportParseError`, `ImportDelimiter`, `ParsedRow`, `ParsedSheet`, `sniffDelimiter(firstLine)`, `parseDelimited(text, requested, maxRows)`.

This is the module that replaces v1's `src/lib/spreadsheet.ts` (37 lines,
`SpreadsheetParseError` / `cellText` / `loadFirstWorksheet`). None of it
ports: `cellText` exists purely to flatten ExcelJS's seven cell shapes and
must stay out of `packages/shared` anyway (spec §8), and `loadFirstWorksheet`
is the branch that produced spec D7's format-dependent mangling.

- [ ] **Step 1: Write the failing test**

> **v1 parity 2026-10-09:** Add a student-preview test (Task 3) rather than a parser test for R20: a row whose only non-blank cell is in an unrecognised column is skipped as blank, not classified `invalid` (v1 `jpc-space/src/lib/student-import.ts:120-127`). The parser's own all-blank filter and its numbering stay.

```ts
// apps/backend/src/__tests__/delimited-parser.test.ts
import { ImportParseError, parseDelimited, sniffDelimiter } from "../lib/imports/delimited";

describe("sniffDelimiter", () => {
  it("reads a tab in the HEADER line as tab-separated (what a spreadsheet paste is)", () => {
    expect(sniffDelimiter("name\temail\tphone")).toBe("tab");
    expect(sniffDelimiter("name,email,phone")).toBe("comma");
  });
});

describe("parseDelimited", () => {
  it("numbers data rows from 2 — the header is line 1 (spec R11)", () => {
    const sheet = parseDelimited("name,email\nA,a@jpc.test\nB,b@jpc.test", "auto", 2000);
    expect(sheet.header).toEqual(["name", "email"]);
    expect(sheet.rows.map((r) => r.rowNumber)).toEqual([2, 3]);
  });

  it("skips a blank line WITHOUT renumbering the rows after it (spec R20)", () => {
    // "row 4" in a message must point at line 4 of what the operator pasted.
    const sheet = parseDelimited("name,email\nA,a@jpc.test\n\nC,c@jpc.test", "auto", 2000);
    expect(sheet.rows.map((r) => r.rowNumber)).toEqual([2, 4]);
  });

  it("never coerces a cell to a number — this is spec D7 closed by construction", () => {
    // v1's CSV branch forces raw text with an identity map specifically to
    // protect a leading "+" and leading zeros in phone numbers
    // (spreadsheet.ts:29-34); its XLSX branch does not, so the same data
    // imports differently depending on the file format. There is one format
    // here and it is text.
    const sheet = parseDelimited("name,phone\nA,+201234567\nB,00201234567", "auto", 2000);
    expect(sheet.rows[0].cells[1]).toBe("+201234567");
    expect(sheet.rows[1].cells[1]).toBe("00201234567");
  });

  it("honours RFC-4180 quoting, including a delimiter and a newline inside a value", () => {
    const sheet = parseDelimited('name,notes\n"Doe, Jane","line one\nline two"', "auto", 2000);
    expect(sheet.rows).toHaveLength(1);
    expect(sheet.rows[0].cells).toEqual(["Doe, Jane", "line one\nline two"]);
  });

  it("unescapes a doubled quote", () => {
    const sheet = parseDelimited('name,notes\nA,"she said ""hi"""', "auto", 2000);
    expect(sheet.rows[0].cells[1]).toBe('she said "hi"');
  });

  it("handles CRLF, a lone CR, a trailing newline and a leading BOM", () => {
    const sheet = parseDelimited("﻿name,email\r\nA,a@jpc.test\r\n", "auto", 2000);
    expect(sheet.header).toEqual(["name", "email"]);
    expect(sheet.rows).toHaveLength(1);
  });

  it("respects an explicit delimiter over the sniffer", () => {
    // A TSV whose header happens to contain no tab must not be read as CSV
    // just because the sniffer guessed; that is why `delimiter` exists.
    const sheet = parseDelimited("name\nA,B", "tab", 2000);
    expect(sheet.rows[0].cells).toEqual(["A,B"]);
  });

  it("fails loudly on an unclosed quote instead of swallowing the rest of the paste", () => {
    expect(() => parseDelimited('name,notes\nA,"oops', "auto", 2000)).toThrow(ImportParseError);
    expect(() => parseDelimited('name,notes\nA,"oops', "auto", 2000)).toThrow(/unclosed/i);
  });

  it("refuses a paste with a header and no data rows", () => {
    expect(() => parseDelimited("name,email", "auto", 2000)).toThrow(/no data rows/i);
  });

  it("refuses more than maxRows, naming the count the operator actually pasted", () => {
    const text = ["name,email", ...Array.from({ length: 4 }, (_, i) => `A${i},a${i}@jpc.test`)].join("\n");
    expect(() => parseDelimited(text, "auto", 3)).toThrow(/4 rows/);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd apps/backend && npx jest --testPathPattern delimited-parser`
Expected: FAIL — `Cannot find module '../lib/imports/delimited'`. That message
is the proof the test targets the real module path rather than an inline
helper; nothing else can produce it.

- [ ] **Step 3: Write the parser**

> **v1 parity 2026-10-09:** Keep the all-blank filter here (L1545) for line numbering only; the student importer's v1 blank-row rule is applied after header mapping in `buildStudentImportPreview` — skip a row when name, email and every **mapped** profile cell are blank (v2 `apps/backend/src/lib/imports/students.ts:266-268`; v1 `jpc-space/src/lib/student-import.ts:120-127`, R20, REG-115).

```ts
// apps/backend/src/lib/imports/delimited.ts

/**
 * Delimited-text parsing for the paste-first importer.
 *
 * This module replaces v1's `src/lib/spreadsheet.ts`, and none of that file
 * ports. `cellText()` there exists only to flatten ExcelJS's seven cell
 * shapes (string / number / Date / {text} / {hyperlink} / {result} /
 * {richText}) back into a string; with a paste there is nothing to flatten.
 * `loadFirstWorksheet()` is the branch that produced spec D7 — its CSV path
 * forces raw text to protect a leading "+" and leading zeros in phone
 * numbers, with the reason spelled out in a comment, and its XLSX path has no
 * such protection, so the same data imports differently depending on which
 * accepted format it was saved in.
 *
 * Here every cell is, and stays, a string. D7 cannot happen. When .xlsx
 * intake lands with the CMS it must read each cell's FORMATTED TEXT rather
 * than its value, or D7 comes straight back.
 *
 * `exceljs` is deliberately not a dependency of this backend (D-16.2).
 */

export type ImportDelimiter = "comma" | "tab";

/**
 * An error whose message was written for the operator and is safe to surface
 * verbatim (spec R14). Anything else thrown out of this module is a bug and
 * the route replaces it with a generic message.
 *
 * v1 used two different classes for this one job — `ImportParseError`
 * (student-import.ts:7) and `SpreadsheetParseError` (spreadsheet.ts:4). One.
 */
export class ImportParseError extends Error {}

export interface ParsedRow {
  /**
   * The operator's own line number. The header is line 1 and data starts at
   * line 2 (spec R11); a blank line KEEPS its number and is dropped, so these
   * are not contiguous (R20) and "row 41" points at line 41 of the paste.
   */
  rowNumber: number;
  cells: string[];
}

export interface ParsedSheet {
  delimiter: ImportDelimiter;
  header: string[];
  rows: ParsedRow[];
}

const DELIMITER_CHAR: Record<ImportDelimiter, string> = { comma: ",", tab: "\t" };

/**
 * Sniffing looks at the FIRST LINE ONLY.
 *
 * A header row is the one line in a sheet least likely to contain a comma
 * inside a value, and counting delimiters across the whole paste would let a
 * single "Cairo, Egypt" in row 900 flip the delimiter for every row. Spec
 * §10b: spreadsheet apps put tab-separated text on the clipboard, a CSV
 * export is comma-separated, and an explicit `delimiter` exists precisely so
 * the caller can overrule this when they know better.
 */
export function sniffDelimiter(firstLine: string): ImportDelimiter {
  return firstLine.includes("\t") ? "tab" : "comma";
}

/**
 * RFC-4180 scanner. Handles quoted fields containing the delimiter, a
 * newline, or a doubled quote; CRLF, LF and lone-CR line endings.
 *
 * Blank records are RETAINED here and dropped by the caller, after numbering
 * — dropping them in the scanner would renumber every row after a blank line
 * and make every message point at the wrong place.
 */
function splitRecords(text: string, delimiter: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  const endField = (): void => {
    record.push(field);
    field = "";
  };
  const endRecord = (): void => {
    endField();
    records.push(record);
    record = [];
  };

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    // A quote only opens a quoted field at the START of one; a stray quote
    // mid-value is data ( O"Brien ), not syntax.
    if (ch === '"' && field === "") {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === delimiter) {
      endField();
      i += 1;
      continue;
    }
    if (ch === "\r") {
      endRecord();
      i += text[i + 1] === "\n" ? 2 : 1;
      continue;
    }
    if (ch === "\n") {
      endRecord();
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }

  // A lenient scanner silently swallows everything after a stray quote into
  // one enormous field, and the operator sees "1 row" for a 400-row paste.
  if (inQuotes) {
    throw new ImportParseError(
      'There is an unclosed " in that paste. Remove or double it, then paste again.',
    );
  }
  // A trailing newline already closed the last record; only an unterminated
  // final line needs closing here.
  if (field !== "" || record.length > 0) endRecord();

  return records;
}

export function parseDelimited(
  text: string,
  requested: "comma" | "tab" | "auto",
  maxRows: number,
): ParsedSheet {
  // A clipboard round-trip through Windows or Excel routinely prefixes a BOM,
  // which would otherwise become part of the first header cell and make
  // "name" fail to match "name".
  const body = text.replace(/^﻿/, "");

  const firstBreak = body.search(/\r\n|\n|\r/);
  const firstLine = firstBreak === -1 ? body : body.slice(0, firstBreak);
  const delimiter = requested === "auto" ? sniffDelimiter(firstLine) : requested;

  const records = splitRecords(body, DELIMITER_CHAR[delimiter]);
  if (records.length === 0) {
    throw new ImportParseError("There is nothing to import.");
  }

  const [headerRecord, ...dataRecords] = records;

  const rows = dataRecords
    .map((cells, index) => ({ rowNumber: index + 2, cells }))
    // R20's blank-row skip, applied AFTER numbering so the numbers stay the
    // operator's own.
    .filter((row) => row.cells.some((c) => c.trim() !== ""));

  if (rows.length === 0) {
    throw new ImportParseError("That paste has a header row but no data rows.");
  }
  if (rows.length > maxRows) {
    throw new ImportParseError(
      `That paste has ${rows.length} rows. Import at most ${maxRows} at a time.`,
    );
  }

  return {
    delimiter,
    header: headerRecord.map((c) => c.trim()),
    rows,
  };
}
```

- [ ] **Step 4: Verification**

```bash
cd apps/backend && npx jest --testPathPattern delimited-parser
pnpm turbo lint typecheck --filter=@space/backend
```
The first must report all 11 cases passing; the second must be clean.

- [ ] **Step 5: Commit**

```bash
git add apps/backend && git commit -m "feat(backend): delimited-text parser for the paste-first importer"
```

---

### Task 3: Student import preview + template endpoints *(Agent A)*

**Files:**
- Create: `apps/backend/src/lib/imports/students.ts`
- Create: `apps/backend/src/routes/imports.ts`
- Modify: `apps/backend/src/lib/config.ts` (three import settings — Step 4a)
- Modify: `apps/backend/jest.setup.ts` (lift the import rate limits under test — Step 4a)
- Modify: `apps/backend/src/middleware/error-handler.ts` (`entity.too.large` → 413 — Step 4a)
- Test: create `apps/backend/src/__tests__/import-limits.test.ts` (unit, no database — Step 4a)
- Modify: `apps/backend/src/app.ts` — **coordinator applies this**; Agent A writes the fragment into its handback note
- Modify: `apps/backend/src/docs/openapi.ts` — **coordinator applies**; Agent A hands back the fragment
- Test: create `apps/backend/src/__tests__/integration/imports-routes.test.ts` (**written, not run**, by Agent A)

**Interfaces:**
- Consumes: `parseDelimited` / `ImportParseError` / `ParsedSheet` (Task 2); `importCellValuesSchema`, `studentImportRowSchema`, `pastedSheetInputSchema`, `IMPORT_*` constants (Task 1); `db` from `../../db/client`; `isSuper` from `../rbac`; `apiOk`/`apiError`; `requireAuth`/`requireUser`; `rateLimitHandler` from `../lib/rate-limit` (Plan 9, ruling X4 — imported, never copied).
- Produces: `config.importBodyLimit`, `config.importPreviewRateLimit`, `config.importCommitRateLimit`; `importLimiter(limit)` and `importJsonParser` in `routes/imports.ts`; the `payload_too_large` 413 mapping; `mapStudentHeaders(header)`, `toCellValues(map, cells)`, `normaliseEmail(email)`, `validateImportRow(values)`, `findExistingByEmail(client, emails)`, `buildStudentImportPreview(sheet)`, `studentImportTemplate()` in `lib/imports/students.ts`; `importsRouter` and `seasonImportsRouter` in `routes/imports.ts`; the endpoints `POST /api/v1/imports/students/preview` and `GET /api/v1/imports/students/template`; and the integration suite's shared fixture block, which Tasks 4 and 5 extend.

#### Fixture-safety audit — do this before writing a line of the test

Every Prisma model the import fixtures can touch, checked against
`cleanupTestData()` in `apps/backend/src/__tests__/integration/fixtures.ts`:

| Model an import writes | Reached by cleanup how | Safe? |
|---|---|---|
| `User` | `db.user.deleteMany({ where: testUserFilter })` — `email startsWith "space-v2-test-"` **and** `endsWith "@jpc.test"` | ✅ **only if every fixture email satisfies both halves** — hence the `sheet()` guard |
| `StudentProfile` | `deleteMany({ where: { user: testUserFilter } })`, plus `{ activeSeasonId: { in: seasonIds } }` | ✅ both the season-mode and alumni-mode (`activeSeasonId: null`) rows are covered by the first filter |
| `SeasonEnrollment` | `deleteMany({ where: { seasonId: { in: seasonIds } } })` — **test seasons only** | ⚠️ **only if the import targets a `createTestSeason()` season.** An enrolment written into a real season survives cleanup, and `User.deleteMany` then throws (`SeasonEnrollment.studentUser` is `onDelete: Restrict`, schema.prisma:342), stranding every fixture row in a live database. **Never pass a real season id to a commit in this suite.** |
| `GroupStudent` | `deleteMany({ where: { group: { seasonId: { in: seasonIds } } } })` | ✅ Task 5's group fixtures use `createTestSeason()` groups only |
| `Group`, `Season`, `SeasonAdmin`, `GroupLeader` | all by test-season id | ✅ |
| `RefreshToken` | `deleteMany({ where: { user: testUserFilter } })` | ✅ created by `login()` |
| `InviteToken` | `deleteMany({ where: { invitedBy: testUserFilter } })` | ✅ **not written at all** — the importer sends no invite (spec R55/R82) |
| `EngagementNote` | by author/subject prefix | ✅ not written |

Nothing this plan writes falls outside that list. The two rules that follow
are non-negotiable and are enforced in code below: **every fixture email comes
from `testEmail()`**, and **every season an import targets comes from
`createTestSeason()`**.

- [ ] **Step 1: Create the integration suite — the prefix guard first, then the failing preview tests**

> **v1 parity 2026-10-09:** Change these preview expectations: no `unrecognisedColumns` assertion (R18); a soft-deleted user's address previews `exists` "Already in the system." (R22); a 300-character name or an over-long profile cell previews `new` (only name ≥ 2 and a valid email are checked at preview, R24; the date-of-birth rule stays, R50 KEEP-FIX); two `name` columns → the **last** is used, two columns for one profile field → the first (R17); a row with text only in an ignored column is skipped (R20); delete the preview rate-limit case (R84); a paste over 256 KB but under 5 MB is accepted (R3).

```ts
// apps/backend/src/__tests__/integration/imports-routes.test.ts
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import {
  TEST_PREFIX,
  cleanupTestData,
  createTestSeason,
  createTestUser,
  login,
  testEmail,
} from "./fixtures";

jest.setTimeout(60000);

const app = createApp();

/**
 * ── THE PREFIX GUARD ──────────────────────────────────────────────────────
 *
 * This is the only suite in the repo that asks the API to CREATE USERS OUT OF
 * FREE TEXT, against a staging database jpc-space is live on. `cleanupTestData`
 * finds users with `{ email: { startsWith: "space-v2-test-", endsWith:
 * "@jpc.test" } }` and nothing else — so a single mistyped fixture address
 * mints a real-looking account that nothing will ever delete.
 *
 * `sheet()` therefore REFUSES to build a paste containing an email cleanup
 * could not reach. Every paste in this file goes through it. Never build one
 * by hand, and never inline a literal address.
 * ──────────────────────────────────────────────────────────────────────────
 */
function sheet(header: string, ...lines: string[]): string {
  for (const line of [header, ...lines]) {
    for (const cell of line.split(/[\t,]/)) {
      const value = cell.trim();
      if (!value.includes("@")) continue;
      // Compared lower-cased: the case-insensitivity tests deliberately paste
      // `testEmail(...).toUpperCase()`, which is still a fixture address. Any
      // uppercase variant the importer wrongly stored is swept by the
      // case-insensitive delete in afterAll below.
      const lower = value.toLowerCase();
      if (!(lower.startsWith(TEST_PREFIX) && lower.endsWith("@jpc.test"))) {
        throw new Error(
          `Fixture paste contains "${value}", which cleanupTestData cannot delete. ` +
            `Every fixture email must come from testEmail().`,
        );
      }
    }
  }
  return [header, ...lines].join("\n");
}

/** Post-commit assertion helper — reads back exactly the rows a paste named. */
async function usersByEmail(emails: string[]) {
  return db.user.findMany({
    where: { email: { in: emails } },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      passwordHash: true,
      graduationYear: true,
      studentProfile: { select: { activeSeasonId: true, phone: true, university: true, dateOfBirth: true, notes: true } },
      seasonEnrollments: { select: { seasonId: true, status: true, groupId: true } },
    },
  });
}

let seasonId: number;
let otherSeasonId: number;
let superToken: string;
let adminToken: string;
let studentToken: string;

beforeAll(async () => {
  await cleanupTestData();

  // EVERY season here is a test season. See the fixture-safety audit: an
  // enrolment written into a real season survives cleanup and then blocks the
  // user delete behind SeasonEnrollment's onDelete: Restrict.
  seasonId = (await createTestSeason()).id;
  otherSeasonId = (await createTestSeason()).id;

  const superUser = await createTestUser("super", "SUPER");
  const admin = await createTestUser("admin", "ADMIN");
  await db.seasonAdmin.create({ data: { seasonId, userId: admin.id } });
  const student = await createTestUser("student", "STUDENT");

  superToken = await login(app, superUser.email);
  adminToken = await login(app, admin.email);
  studentToken = await login(app, student.email);
});

afterAll(async () => {
  await cleanupTestData();
  // cleanupTestData's filter is case-SENSITIVE. This suite pastes uppercase
  // variants of fixture addresses on purpose; if a regression ever stored one,
  // the shared filter would miss it. Sweep case-insensitively before asserting.
  const anyCase = {
    email: { startsWith: TEST_PREFIX, endsWith: "@jpc.test", mode: "insensitive" as const },
  };
  await db.studentProfile.deleteMany({ where: { user: anyCase } });
  await db.user.deleteMany({ where: anyCase });
  // Belt and braces on a shared database: prove the suite left nothing.
  const strays = await db.user.count({
    where: { email: { startsWith: TEST_PREFIX, mode: "insensitive" } },
  });
  if (strays !== 0) {
    throw new Error(`imports suite left ${strays} prefixed users behind — cleanupTestData did not reach them`);
  }
  await db.$disconnect();
});

describe("the fixture guard itself", () => {
  it("refuses a paste whose emails cleanupTestData could not delete", () => {
    // If this ever stops throwing, the safety net is gone and the next typo
    // writes a real-looking account into a live database.
    expect(() => sheet("name\temail", "A Real Person\treal.person@gmail.com")).toThrow(/cannot delete/);
    expect(() => sheet("name\temail", `A Test\t${testEmail("ok")}`)).not.toThrow();
    // An uppercase fixture address is still a fixture address.
    expect(() =>
      sheet("name\temail", `A Test\t${testEmail("shout").toUpperCase()}`),
    ).not.toThrow();
  });
});

describe("POST /api/v1/imports/students/preview", () => {
  it("classifies new / exists / duplicate / invalid and reports the counts", async () => {
    const fresh = testEmail("fresh");
    const dupe = testEmail("dupe");
    const existingUser = await createTestUser("already-here", "STUDENT");

    const text = sheet(
      "name\temail\tMobile No\tYear",
      `Fresh Student\t${fresh}\t+201234567\t3rd`,
      `Dupe One\t${dupe}\t\t`,
      `Dupe Two\t${dupe}\t\t`,
      `Existing Student\t${existingUser.email}\t\t`,
      `X\t${testEmail("short-name")}\t\t`,
      `Bad Email Row\tnot-an-email\t\t`,
    );

    const res = await request(app)
      .post("/api/v1/imports/students/preview")
      .set("authorization", `Bearer ${superToken}`)
      .send({ text });

    expect(res.status).toBe(200);
    expect(res.body.data.delimiter).toBe("tab");
    expect(res.body.data.counts).toMatchObject({
      new: 1,
      duplicate: 1,
      exists: 1,
      invalid: 2,
      previously_removed: 0,
      total: 6,
    });
    // R7/D7: a leading "+" survives, because nothing here ever coerces a cell.
    const freshRow = res.body.data.rows.find((r: { email: string }) => r.email === fresh);
    expect(freshRow).toMatchObject({ rowNumber: 2, status: "new" });
    expect(freshRow.values.phone).toBe("+201234567");
    // Second occurrence is the duplicate; the first stays importable.
    expect(res.body.data.rows.filter((r: { status: string }) => r.status === "duplicate")).toHaveLength(1);
  });

  it("matches an existing address case-insensitively (D-16.6 / spec D2)", async () => {
    // v1 compares raw strings against a case-sensitive unique column
    // (student-import.ts:158), so an operator whose sheet capitalises an
    // address creates a SECOND account for a person already in the system.
    const existing = await createTestUser("case-test", "STUDENT");
    const shouted = existing.email.toUpperCase();

    const res = await request(app)
      .post("/api/v1/imports/students/preview")
      .set("authorization", `Bearer ${superToken}`)
      .send({ text: sheet("name\temail", `Case Test\t${shouted}`) });

    expect(res.status).toBe(200);
    expect(res.body.data.rows[0].status).toBe("exists");
  });

  it("treats two casings of one address in the same paste as one person", async () => {
    const base = testEmail("in-file-case");
    const res = await request(app)
      .post("/api/v1/imports/students/preview")
      .set("authorization", `Bearer ${superToken}`)
      .send({ text: sheet("name\temail", `One\t${base}`, `Two\t${base.toUpperCase()}`) });

    expect(res.body.data.counts).toMatchObject({ new: 1, duplicate: 1 });
  });

  it("gives a soft-deleted address its own status and a message that says what to do (D-16.14)", async () => {
    const removed = await createTestUser("soft-deleted", "STUDENT");
    await db.user.update({ where: { id: removed.id }, data: { deletedAt: new Date() } });

    const res = await request(app)
      .post("/api/v1/imports/students/preview")
      .set("authorization", `Bearer ${superToken}`)
      .send({ text: sheet("name\temail", `Removed Person\t${removed.email}`) });

    expect(res.body.data.rows[0].status).toBe("previously_removed");
    expect(res.body.data.rows[0].message).toMatch(/restore/i);
  });

  it("accepts a season export's \"Student\" header (spec D14)", async () => {
    const res = await request(app)
      .post("/api/v1/imports/students/preview")
      .set("authorization", `Bearer ${superToken}`)
      .send({ text: sheet("Student\tEmail\tGroup", `Export Row\t${testEmail("export")}\tGroup A`) });

    expect(res.status).toBe(200);
    expect(res.body.data.rows[0].status).toBe("new");
    expect(res.body.data.detectedColumns).toEqual(["Name", "Email"]);
    // D-16.12: the column that matched nothing is named, not swallowed.
    expect(res.body.data.unrecognisedColumns).toEqual(["Group"]);
  });

  it("names an unrecognised column as typed (trimmed)", async () => {
    const res = await request(app)
      .post("/api/v1/imports/students/preview")
      .set("authorization", `Bearer ${superToken}`)
      .send({ text: sheet("name,email,Phone No,Uni", `A,${testEmail("unrec")},1,2`) });

    expect(res.body.data.delimiter).toBe("comma");
    expect(res.body.data.unrecognisedColumns).toEqual(["Phone No", "Uni"]);
  });

  it("refuses a paste with no name or email column, naming both", async () => {
    const res = await request(app)
      .post("/api/v1/imports/students/preview")
      .set("authorization", `Bearer ${superToken}`)
      .send({ text: "phone,university\n1,2" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("bad_request");
    expect(res.body.error.message).toMatch(/"name" and "email"/);
  });

  it("rejects a date of birth that is not YYYY-MM-DD, instead of silently dropping it (D-16.11)", async () => {
    // v1 parses with `new Date(string)` and drops an Invalid Date without
    // failing the row (student-import.ts:209-210), so the operator sees
    // "created" and a missing birth date — and 01/02/2003 imports as
    // 2 January in V8 regardless.
    const res = await request(app)
      .post("/api/v1/imports/students/preview")
      .set("authorization", `Bearer ${superToken}`)
      .send({
        text: sheet(
          "name\temail\tdob",
          `Euro Date\t${testEmail("eurodate")}\t01/02/2003`,
          `Impossible\t${testEmail("impossible")}\t2003-02-30`,
          `Good Date\t${testEmail("gooddate")}\t2003-02-28`,
        ),
      });

    expect(res.body.data.counts).toMatchObject({ invalid: 2, new: 1 });
    expect(res.body.data.rows[0].message).toMatch(/YYYY-MM-DD/);
  });

  it("applies the SAME length rules at preview as at commit (D-16.9 / spec D12)", async () => {
    const res = await request(app)
      .post("/api/v1/imports/students/preview")
      .set("authorization", `Bearer ${superToken}`)
      .send({ text: sheet("name\temail", `${"x".repeat(300)}\t${testEmail("longname")}`) });

    // v1 previews this green and returns `failed` after the operator commits.
    expect(res.body.data.rows[0].status).toBe("invalid");
  });

  it("refuses a non-SUPER caller (D3 — the gate stays SUPER-only)", async () => {
    for (const token of [adminToken, studentToken]) {
      const res = await request(app)
        .post("/api/v1/imports/students/preview")
        .set("authorization", `Bearer ${token}`)
        .send({ text: sheet("name\temail", `A\t${testEmail("gate")}`) });
      expect(res.status).toBe(403);
    }
  });

  it("401s an anonymous caller", async () => {
    const res = await request(app).post("/api/v1/imports/students/preview").send({ text: "x" });
    expect(res.status).toBe(401);
  });
});

describe("GET /api/v1/imports/students/template", () => {
  it("declares that file upload is not available, rather than leaving the client to guess (D-16.3)", async () => {
    const res = await request(app)
      .get("/api/v1/imports/students/template")
      .set("authorization", `Bearer ${superToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.capabilities).toEqual({ pasteText: true, fileUpload: false });
    expect(res.body.data.headerRow.split("\t")).toContain("email");
    expect(res.body.data.maxRows).toBe(2000);
    const nameCol = res.body.data.columns.find((c: { label: string }) => c.label === "Name");
    expect(nameCol).toMatchObject({ required: true, maxLength: 120 });
    expect(nameCol.acceptedHeaders).toContain("student");
  });
});
```

- [ ] **Step 2: Note the failure for the coordinator (Agent A does not run this)**

Expected when the coordinator runs it after merge: every case in these two
describes returns **404** from the catch-all `notFoundHandler` — the router
does not exist yet — except the fixture-guard describe, which passes
immediately because it exercises the helper only. A 404 rather than a 500 is
the right first failure: it proves the tests are hitting the real Express app
through the real mount path, not a stub.

- [ ] **Step 3: Write `lib/imports/students.ts` (preview half)**

> **v1 parity 2026-10-09:** In this block (v2 `apps/backend/src/lib/imports/students.ts`): assign `nameCol`/`emailCol` unconditionally (last wins) and keep the first-wins guard only for profile columns (`:69-79`; v1 `jpc-space/src/lib/student-import.ts:96-103`, R17); delete `unrecognisedColumns` (`:62`, `:82`, `:98`, R18); add the v1 blank-row skip after mapping (`:266-268`, R20); the preview classifier checks only `name.length >= 2` and the email (plus D-16.11) instead of the full commit schema (`:174-202`, `:270`; v1 `jpc-space/src/lib/student-import.ts:129`, R24); a deleted match classifies `exists` "Already in the system." — remove the `previously_removed` branch (`:291-293`, `:305`; v1 `jpc-space/src/lib/student-import.ts:157-167`, R22).

```ts
// apps/backend/src/lib/imports/students.ts
import {
  IMPORT_EMAIL_HEADERS,
  IMPORT_FIELD_LABELS,
  IMPORT_MAX_PASTE_CHARS,
  IMPORT_MAX_ROWS,
  IMPORT_NAME_HEADERS,
  IMPORT_PROFILE_ALIASES,
  studentImportRowSchema,
  // NOTE: a VALUE import from @space/shared in a backend file MUST use this
  // relative path. `tsc` emits this file to dist/apps/backend/src/lib/imports/
  // without rewriting bare specifiers, and a runtime `require("@space/shared")`
  // then resolves through node_modules back to the TypeScript SOURCE instead
  // of the compiled sibling in dist/packages/shared/src/ — the built server
  // dies with ERR_MODULE_NOT_FOUND. See CLAUDE.md; routes/auth.ts documents
  // the same trap in place. Do not "tidy" it back to the package name.
} from "../../../../../packages/shared/src/index";
import type {
  ImportCellValues,
  ImportProfileFieldKey,
  ImportTemplate,
  StudentImportPreview,
  StudentImportRow,
} from "@space/shared";

import { db } from "../../db/client";
import { ImportParseError, type ParsedSheet } from "./delimited";

// ---------------------------------------------------------------------------
// Header mapping
// ---------------------------------------------------------------------------

export interface StudentHeaderMap {
  nameCol: number;
  emailCol: number;
  profileCols: { col: number; field: ImportProfileFieldKey }[];
  detectedColumns: string[];
  unrecognisedColumns: string[];
}

/**
 * Match a header cell by `trim().toLowerCase()` exact equality against a fixed
 * vocabulary — no fuzzy matching, no punctuation stripping (spec R12). What is
 * new is that a header matching NOTHING is collected and reported (R18/D11):
 * v1 drops it silently, which is the most common real-world silent data loss
 * in this domain.
 *
 * Columns are recorded by their true index, so an empty header cell shifts
 * nothing (R13). On a duplicate recognised header the FIRST wins, uniformly —
 * v1 is asymmetric here by accident (last wins for name/email, first for
 * profile columns, R17), and an artefact of an if/else chain is not a
 * specification (the reasoning behind ruling C12).
 */
export function mapStudentHeaders(header: string[]): StudentHeaderMap {
  let nameCol = -1;
  let emailCol = -1;
  const profileCols: { col: number; field: ImportProfileFieldKey }[] = [];
  const unrecognisedColumns: string[] = [];

  header.forEach((raw, col) => {
    const label = raw.trim();
    if (label === "") return;
    const key = label.toLowerCase();

    if ((IMPORT_NAME_HEADERS as readonly string[]).includes(key)) {
      if (nameCol === -1) nameCol = col;
      return;
    }
    if ((IMPORT_EMAIL_HEADERS as readonly string[]).includes(key)) {
      if (emailCol === -1) emailCol = col;
      return;
    }
    const field = IMPORT_PROFILE_ALIASES[key];
    if (field !== undefined) {
      if (!profileCols.some((p) => p.field === field)) profileCols.push({ col, field });
      return;
    }
    unrecognisedColumns.push(label);
  });

  if (nameCol === -1 || emailCol === -1) {
    throw new ImportParseError(
      'The first line must be a header row with "name" and "email" columns.',
    );
  }

  return {
    nameCol,
    emailCol,
    profileCols,
    // Display only (R19): the two literals, then each matched profile
    // column's canonical label in sheet order.
    detectedColumns: ["Name", "Email", ...profileCols.map((p) => IMPORT_FIELD_LABELS[p.field])],
    unrecognisedColumns,
  };
}

/**
 * One row's raw cells. Every value is trimmed, and an empty optional cell
 * becomes `null` rather than `""` (spec R21/R51 — a cleared field is stored
 * NULL, never an empty string).
 */
export function toCellValues(map: StudentHeaderMap, cells: string[]): ImportCellValues {
  const at = (col: number): string => (cells[col] ?? "").trim();

  const values: ImportCellValues = {
    name: at(map.nameCol),
    email: at(map.emailCol),
    university: null,
    year: null,
    phone: null,
    dateOfBirth: null,
    spiritualBackground: null,
    gifts: null,
    notes: null,
  };
  for (const { col, field } of map.profileCols) {
    const v = at(col);
    values[field] = v === "" ? null : v;
  }
  return values;
}

// ---------------------------------------------------------------------------
// Validation — ONE standard for preview and commit (D-16.9)
// ---------------------------------------------------------------------------

/**
 * The single normalisation used for EVERY email comparison in this domain.
 *
 * Comparison only — the address is stored exactly as the operator typed it
 * (D-16.6). `User.email` is a plain unique column with no citext
 * (prisma/schema.prisma:105) and v1's `verifyCredentials` looks it up
 * verbatim, so lower-casing what we STORE would lock existing users out. But
 * comparing case-sensitively is how v1's importer mints a second account for
 * someone already in the system (spec D2/R25/R28).
 *
 * Reverting this to `email.trim()` is Task 7's mutation 2.
 */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type RowValidation =
  | { ok: true; row: StudentImportRow }
  | { ok: false; message: string };

const FIELD_MESSAGE: Record<string, string> = {
  name: "Name is missing or too short.",
  email: "Email is not valid.",
  university: "University is too long.",
  year: "Year is too long.",
  phone: "Mobile No is too long.",
  spiritualBackground: "Spiritual background is too long.",
  gifts: "Gifts is too long.",
  notes: "Notes is too long.",
};

/**
 * Is this row importable? Called by the preview classifier AND by the commit,
 * which is the whole of D-16.9: v1 validated names and emails at preview and
 * lengths only at commit, so an over-long value previewed green and came back
 * `failed` after the operator had already committed (spec R24/R41/D12).
 *
 * `studentImportRowSchema` is `createStudentRequestSchema.omit({ seasonId })`,
 * so this is literally the same standard `POST /api/v1/students` applies.
 */
export function validateImportRow(values: ImportCellValues): RowValidation {
  if (values.dateOfBirth !== null) {
    // D-16.11 / spec D8. `new Date("01/02/2003")` is 2 January in V8, so a
    // European sheet transposes every birthday; a bare date resolves to LOCAL
    // midnight, which on a UTC+2 server stores the previous day (ruling C2
    // forbids deriving wall-clock facts from an incidental zone); and v1 drops
    // an unparseable value without failing the row.
    if (!ISO_DATE.test(values.dateOfBirth)) {
      return { ok: false, message: "Date of birth must be written as YYYY-MM-DD." };
    }
    const asUtc = new Date(`${values.dateOfBirth}T00:00:00.000Z`);
    // Catches 2003-02-30, which passes the regex and which Date silently
    // rolls forward to 2 March.
    if (Number.isNaN(asUtc.getTime()) || asUtc.toISOString().slice(0, 10) !== values.dateOfBirth) {
      return { ok: false, message: "Date of birth is not a real date. Use YYYY-MM-DD." };
    }
  }

  const parsed = studentImportRowSchema.safeParse({
    ...values,
    dateOfBirth:
      values.dateOfBirth === null ? null : `${values.dateOfBirth}T00:00:00.000Z`,
  });
  if (parsed.success) return { ok: true, row: parsed.data };

  const first = parsed.error.issues[0];
  const key = typeof first?.path[0] === "string" ? first.path[0] : "";
  return { ok: false, message: FIELD_MESSAGE[key] ?? "This row is not valid." };
}

// ---------------------------------------------------------------------------
// Existence lookup
// ---------------------------------------------------------------------------

export interface ExistingUser {
  id: number;
  email: string;
  role: string;
  deletedAt: Date | null;
}

/** `db` and a `$transaction` client both satisfy this. */
type Queryable = Pick<typeof db, "$queryRaw">;

/**
 * Every candidate address in one statement, matched on `lower(email)`.
 *
 * Raw SQL because Prisma's `mode: "insensitive"` would need one OR branch per
 * address — a 2000-branch WHERE for a full paste. `deletedAt` is deliberately
 * NOT filtered (spec R27/R43, kept): un-deleted matching would let an import
 * resurrect an account somebody removed on purpose. The caller distinguishes
 * the two cases and reports `previously_removed` (D-16.14).
 *
 * This is a sequential scan on User — there is no functional index on
 * `lower(email)` and creating one is a migration (ruling C1), so it is on
 * Plan 18's list. Acceptable here: the table is small, and both preview and
 * commit are rate-limited (D-16.21).
 */
export async function findExistingByEmail(
  client: Queryable,
  emails: string[],
): Promise<Map<string, ExistingUser>> {
  const keys = [...new Set(emails.map(normaliseEmail))];
  if (keys.length === 0) return new Map();

  const rows = await client.$queryRaw<ExistingUser[]>`
    SELECT id, email, role::text AS role, "deletedAt"
    FROM "User"
    WHERE lower(email) = ANY(${keys}::text[])
  `;
  return new Map(rows.map((r) => [normaliseEmail(r.email), r]));
}

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

/**
 * Classify every row against the file and against the database.
 *
 * Order is invalid → duplicate → (exists | previously_removed) → new, with
 * existence resolved by ONE batched lookup after the row loop, so the preview
 * is not N+1 (spec R26). Counts tally the final statuses; blank rows the
 * parser dropped are excluded from `total` (R30).
 */
export async function buildStudentImportPreview(sheet: ParsedSheet): Promise<StudentImportPreview> {
  const map = mapStudentHeaders(sheet.header);

  const rows: StudentImportPreview["rows"] = [];
  const seen = new Set<string>();
  const candidates: string[] = [];

  for (const parsedRow of sheet.rows) {
    const values = toCellValues(map, parsedRow.cells);
    const base = { rowNumber: parsedRow.rowNumber, name: values.name, email: values.email, values };

    const validation = validateImportRow(values);
    if (!validation.ok) {
      rows.push({ ...base, status: "invalid", message: validation.message });
      continue;
    }

    const key = normaliseEmail(values.email);
    if (seen.has(key)) {
      rows.push({ ...base, status: "duplicate", message: "Repeated earlier in this paste." });
      continue;
    }
    seen.add(key);
    candidates.push(values.email);
    rows.push({ ...base, status: "new", message: null });
  }

  const existing = await findExistingByEmail(db, candidates);
  for (const row of rows) {
    if (row.status !== "new") continue;
    const match = existing.get(normaliseEmail(row.email));
    if (!match) continue;
    if (match.deletedAt !== null) {
      row.status = "previously_removed";
      row.message = "Previously removed — restore this account from the users screen.";
    } else {
      row.status = "exists";
      row.message = "Already in the system.";
    }
  }

  const counts = {
    new: 0,
    exists: 0,
    duplicate: 0,
    invalid: 0,
    previously_removed: 0,
    total: rows.length,
  };
  for (const row of rows) counts[row.status] += 1;

  return {
    rows,
    detectedColumns: map.detectedColumns,
    unrecognisedColumns: map.unrecognisedColumns,
    delimiter: sheet.delimiter,
    counts,
  };
}

// ---------------------------------------------------------------------------
// Template
// ---------------------------------------------------------------------------

/**
 * The column schema as data, so the mobile screen can render "columns we
 * recognise" and a copyable header row natively.
 *
 * Deliberately JSON and not a downloadable .xlsx (spec §7): a file download
 * would need the very upload/CMS machinery this domain is avoiding, and the
 * phone has nowhere useful to put a file anyway.
 */
export function studentImportTemplate(): ImportTemplate {
  const columns: ImportTemplate["columns"] = [
    {
      label: "Name",
      acceptedHeaders: [...IMPORT_NAME_HEADERS],
      required: true,
      maxLength: 120,
      target: "User.name",
      note: null,
    },
    {
      label: "Email",
      acceptedHeaders: [...IMPORT_EMAIL_HEADERS],
      required: true,
      maxLength: null,
      target: "User.email",
      note: "Matching is case-insensitive; someone already in the system is skipped, never duplicated.",
    },
    { label: "Mobile No", acceptedHeaders: ["phone", "mobile", "mobile no", "mobile no.", "mobile number", "phone number"], required: false, maxLength: 60, target: "StudentProfile.phone", note: null },
    { label: "University", acceptedHeaders: ["university", "college"], required: false, maxLength: 160, target: "StudentProfile.university", note: null },
    { label: "Year", acceptedHeaders: ["year"], required: false, maxLength: 40, target: "StudentProfile.year", note: "Stored as text — \"3rd\" and \"Year 3\" are both fine." },
    { label: "Date of birth", acceptedHeaders: ["date of birth", "dob", "birthdate", "birth date"], required: false, maxLength: null, target: "StudentProfile.dateOfBirth", note: "YYYY-MM-DD only. Anything else fails the row rather than being guessed at." },
    { label: "Spiritual background", acceptedHeaders: ["spiritual background"], required: false, maxLength: 4000, target: "StudentProfile.spiritualBackground", note: null },
    { label: "Gifts", acceptedHeaders: ["gifts", "spiritual gifts"], required: false, maxLength: 2000, target: "StudentProfile.gifts", note: null },
    { label: "Notes", acceptedHeaders: ["notes"], required: false, maxLength: 4000, target: "StudentProfile.notes", note: "Staff-internal. Never shown to the student." },
  ];

  return {
    columns,
    headerRow: ["name", "email", "Mobile No", "University", "Year", "Date of birth", "Spiritual background", "Gifts", "Notes"].join("\t"),
    maxRows: IMPORT_MAX_ROWS,
    maxPasteChars: IMPORT_MAX_PASTE_CHARS,
    capabilities: { pasteText: true, fileUpload: false },
  };
}
```

- [ ] **Step 4: Write `routes/imports.ts` (preview + template)**

> **v1 parity 2026-10-09:** Remove `previewLimiter` from the student preview route (v2 `apps/backend/src/routes/imports.ts:71`, `:116`; v1 has none, R84).

```ts
// apps/backend/src/routes/imports.ts
import express, { Router } from "express";
import rateLimit from "express-rate-limit";

import { apiError, apiOk } from "../lib/api-response";
import { config } from "../lib/config";
import { ImportParseError, parseDelimited } from "../lib/imports/delimited";
// The one 429 handler (ruling X4: Plan 9 extracted it; no copies anywhere).
import { rateLimitHandler } from "../lib/rate-limit";
import { buildStudentImportPreview, studentImportTemplate } from "../lib/imports/students";
import { isSuper } from "../lib/rbac";
// Value import — relative path is mandatory here (CLAUDE.md's rootDir emit
// trap). `import type` may use "@space/shared"; this line may not.
import {
  IMPORT_MAX_ROWS,
  pastedSheetInputSchema,
} from "../../../../packages/shared/src/index";
import { requireAuth, requireUser } from "../middleware/require-auth";

/**
 * Import intake is NOT gated by `ENABLE_UPLOADS`, and nothing in this file
 * touches the `Storage` interface. Read this before "fixing" that.
 *
 * `ENABLE_UPLOADS` is off because *persisted* files — submission attachments —
 * need a storage driver, a retention story and a serving route, and that work
 * waits on the CMS. An import paste is the opposite: it is read once, parsed
 * in memory, and must NEVER be stored, because it is a sheet of students'
 * names, phone numbers, birth dates and pastoral notes. Sharing one flag
 * between the two would make them look like one concern and then enforce the
 * confusion (spec 16 §10a, decision D-16.2).
 */

/**
 * Flipped to `true` when .xlsx/CSV file intake lands with the CMS. Until then
 * the client is TOLD there is no picker rather than left to infer it from an
 * absent button (D-16.3).
 *
 * When it flips: the .xlsx reader must take each cell's FORMATTED TEXT, never
 * its value, or spec D7 comes straight back — a phone number typed into Excel
 * becomes a number and loses the leading "+" the CSV path went out of its way
 * to protect.
 */
const IMPORT_FILE_UPLOAD_SUPPORTED = false;

/**
 * Spec D18/R84: neither importer is rate-limited in v1, where the
 * server-action transport makes that hard to notice. As HTTP endpoints taking
 * a 256 KB paste and a 2000-row commit, both want one.
 *
 * A factory, and the limits come from config (defaults 30 / 10 per 15 min):
 * the integration suite commits ~22 times from one IP, so jest.setup.ts lifts
 * both limits under test, and the 429 behaviour itself is proven by a unit
 * test that builds `importLimiter(1)` directly (import-limits.test.ts).
 */
export function importLimiter(limit: number) {
  return rateLimit({ windowMs: 15 * 60 * 1000, limit, handler: rateLimitHandler });
}
const previewLimiter = importLimiter(config.importPreviewRateLimit);
const commitLimiter = importLimiter(config.importCommitRateLimit);

/**
 * This router's own JSON parser, with an explicit limit.
 *
 * The global `express.json()` in app.ts keeps body-parser's 100 KB default,
 * which a legal 256 KB paste — and a 2000-row commit that resubmits every cell
 * — both exceed; the overflow would surface as an unmapped `entity.too.large`
 * and a 500. These routers are therefore mounted in app.ts BEFORE the global
 * parser, and every POST lists `importJsonParser` itself, AFTER its limiter so
 * a throttled request is refused before its body is read. Nothing else in the
 * API gets the larger limit.
 */
export const importJsonParser = express.json({ limit: config.importBodyLimit });

// /api/v1/imports is this router's exclusive prefix, so router-level auth is
// permitted (ruling X5).
export const importsRouter = Router();
importsRouter.use(requireAuth);

/**
 * SUPER only, and it stays that way (spec D3).
 *
 * v1's commit checks that the target season exists but NOT that the caller
 * administers it (R40) — correct today solely because the action is
 * SUPER-gated. If a future product decision lets a season ADMIN import their
 * own roster, the row-scoped check goes in THE SAME change as the widened
 * role gate, never after it (ruling C8).
 */
function requireSuper(req: Parameters<typeof requireUser>[0], res: Parameters<typeof apiError>[0]): boolean {
  const user = requireUser(req);
  if (isSuper(user)) return true;
  apiError(res, "forbidden", "Only a super user can import students.", 403);
  return false;
}

importsRouter.get("/students/template", async (req, res) => {
  if (!requireSuper(req, res)) return;
  return apiOk(res, studentImportTemplate());
});

importsRouter.post("/students/preview", previewLimiter, importJsonParser, async (req, res) => {
  if (!requireSuper(req, res)) return;

  const parsed = pastedSheetInputSchema.safeParse(req.body);
  if (!parsed.success) {
    return apiError(res, "bad_request", "Paste a header row and at least one data row.", 400);
  }

  try {
    const sheet = parseDelimited(parsed.data.text, parsed.data.delimiter, IMPORT_MAX_ROWS);
    return apiOk(res, await buildStudentImportPreview(sheet));
  } catch (err) {
    // The importer's own error type carries a message written for the
    // operator and is safe to surface verbatim (spec R14). Anything else is a
    // bug and goes to the terminal error handler as a 500 with no detail.
    //
    // Note what is NOT logged: v1 logs the email address on failure
    // (student-import.ts:280). The row number is what a support conversation
    // actually needs, and a log full of student addresses is not (spec D19).
    if (err instanceof ImportParseError) return apiError(res, "bad_request", err.message, 400);
    throw err;
  }
});

/**
 * Season-scoped import routes, mounted at /api/v1/seasons. That prefix is
 * SHARED with seasonsRouter (and Plan 15's seasonExportsRouter), so there is
 * no `seasonImportsRouter.use(requireAuth)` — each route lists requireAuth
 * first (ruling X5). It is mounted ahead of the global JSON parser (see
 * importJsonParser), so it sits before seasonsRouter too; it defines only
 * POST /:id/imports/groups/*, so every other request falls through untouched
 * and `routes/seasons.ts` stays unmodified (D-16.20).
 */
export const seasonImportsRouter = Router();

export { commitLimiter, previewLimiter, IMPORT_FILE_UPLOAD_SUPPORTED };
```

- [ ] **Step 4a: Config, the test-time limits, the 413 mapping, and a unit test for the limiter**

> **v1 parity 2026-10-09:** Remove `importLimiter`, `previewLimiter`/`commitLimiter`, `config.importPreviewRateLimit`/`importCommitRateLimit` (`IMPORT_*_RATE_LIMIT`), their `jest.setup.ts` lift and the limit-1 unit test (`routes/imports.ts:66-72`, R84). Raise `config.importBodyLimit` so a 5 MB paste (JSON-escaped) and a 2000-row commit fit (`routes/imports.ts:85`, R3); the 413 mapping stays.

In `apps/backend/src/lib/config.ts`, add to `envSchema`:

```ts
  // Body limit for the import routes only (routes/imports.ts). The global
  // parser keeps body-parser's 100 KB default; a 256 KB paste and a 2000-row
  // commit resubmitting every cell need more. Any body-parser size string.
  IMPORT_BODY_LIMIT: z.string().default("2mb"),
  // Import rate limits per 15 minutes (spec D18). Configurable so the
  // integration suite, which commits ~22 times from one IP, can lift them.
  IMPORT_PREVIEW_RATE_LIMIT: z.coerce.number().int().positive().default(30),
  IMPORT_COMMIT_RATE_LIMIT: z.coerce.number().int().positive().default(10),
```

and to the exported `config`:

```ts
  importBodyLimit: parsed.data.IMPORT_BODY_LIMIT,
  importPreviewRateLimit: parsed.data.IMPORT_PREVIEW_RATE_LIMIT,
  importCommitRateLimit: parsed.data.IMPORT_COMMIT_RATE_LIMIT,
```

Document the three keys in `apps/backend/.env.example` (commented, defaults
shown) and in `apps/backend/README.md`'s environment table.

In `apps/backend/jest.setup.ts`, after the `ENABLE_UPLOADS` line — forced, like
it, so a developer's `.env` cannot reintroduce the 429s:

```ts
// The imports suite commits ~22 times and previews ~30 times from one IP in
// one run; the production limits (10 / 30 per 15 min) would 429 it halfway.
// The limiter's own behaviour is covered by import-limits.test.ts, which
// builds a limit-1 instance directly.
process.env.IMPORT_COMMIT_RATE_LIMIT = "1000";
process.env.IMPORT_PREVIEW_RATE_LIMIT = "1000";
```

In `apps/backend/src/middleware/error-handler.ts`, beside `isBodyParseError`:

```ts
/** body-parser rejects a body over its `limit` with this `type`. */
function isBodyTooLargeError(err: unknown): boolean {
  return (err as { type?: string } | null)?.type === "entity.too.large";
}
```

and in `errorHandler`, directly after the `isBodyParseError` branch:

```ts
  // An over-limit body is the client's error and must say so — without this it
  // falls through to the generic 500 (the import routes accept up to
  // config.importBodyLimit; every other route keeps the 100 KB default).
  if (isBodyTooLargeError(err)) {
    apiError(res, "payload_too_large", "Request body is too large.", 413);
    return;
  }
```

Unit test, no database:

```ts
// apps/backend/src/__tests__/import-limits.test.ts
import express from "express";
import request from "supertest";

import { errorHandler } from "../middleware/error-handler";
import { importLimiter } from "../routes/imports";

describe("importLimiter", () => {
  it("answers the 429 envelope once the limit is spent", async () => {
    const app = express();
    app.post("/x", importLimiter(1), (_req, res) => {
      res.json({ data: { ok: true } });
    });
    expect((await request(app).post("/x")).status).toBe(200);
    const second = await request(app).post("/x");
    expect(second.status).toBe(429);
    expect(second.body.error.code).toBe("too_many_requests");
  });
});

describe("body limits", () => {
  it("maps an over-limit JSON body to 413 payload_too_large, not 500", async () => {
    const app = express();
    app.post("/x", express.json({ limit: "1kb" }), (_req, res) => {
      res.json({ data: {} });
    });
    app.use(errorHandler);
    const res = await request(app)
      .post("/x")
      .set("content-type", "application/json")
      .send(JSON.stringify({ text: "x".repeat(4096) }));
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe("payload_too_large");
  });
});
```

Run: `cd apps/backend && npx jest src/__tests__/import-limits.test.ts` → FAIL
first (no `importLimiter`, no 413 branch), PASS after Steps 4–4a.

And append to the integration suite (`imports-routes.test.ts`, run by the
coordinator):

```ts
describe("the import body limit", () => {
  it("accepts a paste larger than the global 100 KB parser limit", async () => {
    // ~150 KB: under IMPORT_MAX_PASTE_CHARS, over body-parser's default. Before
    // the route-level parser this was an unmapped entity.too.large → 500.
    const rows = Array.from(
      { length: 900 },
      (_, i) => `Bulk Student ${i}\t${testEmail(`bulk-${i}`)}\t${"x".repeat(80)}`,
    );
    const text = sheet("name\temail\tNotes", ...rows);
    expect(text.length).toBeGreaterThan(100 * 1024);
    const res = await request(app)
      .post("/api/v1/imports/students/preview")
      .set("authorization", `Bearer ${superToken}`)
      .send({ text });
    expect(res.status).toBe(200);
    expect(res.body.data.rows).toHaveLength(900);
  });
});
```
```

> `requireSuper`'s parameter types are spelled through `Parameters<typeof …>`
> only to avoid importing `Request`/`Response` for two lines; if the ambient
> `Express` types are already imported in a sibling route file you are
> matching, use `(req: Request, res: Response)` directly — `routes/seasons.ts`
> is the file to copy from.

- [ ] **Step 5: Hand back the `app.ts` fragment (coordinator applies)**

```ts
// apps/backend/src/app.ts — with the other route imports
import { importsRouter, seasonImportsRouter } from "./routes/imports";

// …and BEFORE the global `app.use(express.json())`, directly after cors():
//
// The import routes parse their own bodies with a larger, explicit limit
// (routes/imports.ts → importJsonParser). body-parser skips a body that is
// already parsed but NOT one that already failed, so these must run before
// the global 100 KB parser can reject a legal 256 KB paste.
app.use("/api/v1/imports", importsRouter);
app.use("/api/v1/seasons", seasonImportsRouter);
app.use(express.json());
```

`seasonImportsRouter` therefore sits ahead of `seasonsRouter`; it defines only
`POST /:id/imports/groups/{preview,commit}` and carries no router-level
middleware, so every other `/api/v1/seasons/*` request falls through to
`seasonsRouter` exactly as before.

- [ ] **Step 6: Hand back the OpenAPI fragment (coordinator applies)**

> **v1 parity 2026-10-09:** OpenAPI: no `unrecognisedColumns`, four row statuses, no 429 response on the import routes, paste `maxLength` 5242880.

Add `POST /api/v1/imports/students/preview` and
`GET /api/v1/imports/students/template` to `apps/backend/src/docs/openapi.ts`
in the house style (hand-authored, prose `description`, `ok()` /
`errRef()` helpers), plus components for `StudentImportPreview` and
`ImportTemplate`. The description must state:

- SUPER-only, and that this is deliberate (spec D3), not an oversight.
- The body is `{ text, delimiter? }` — **pasted text, not multipart** — with
  the reason: an import file is read once and must never be stored, so it is
  not an "upload" and is not gated by `ENABLE_UPLOADS`.
- The five row statuses and what each means, including that
  `previously_removed` is v2's addition for a soft-deleted address.
- That `unrecognisedColumns` echoes headers that matched nothing.
- That the response carries every row's values so the client can resubmit
  them, and that the commit re-derives every status itself.
- 400 `bad_request` for a parse failure with the operator-facing message;
  429 `too_many_requests`.

Follow the shape of the existing `"/api/v1/groups"` entry (openapi.ts:849) —
one `paths` key per URL, `tags: ["Imports"]`, and a `#/components/schemas/…`
`$ref` for each response body.

- [ ] **Step 7: Verification (Agent A runs the first two only)**

```bash
pnpm turbo lint typecheck test:unit --filter=@space/backend
pnpm turbo lint typecheck --filter=@space/shared
```

Coordinator, after merge — serial, never parallel:

```bash
cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern imports
```
The `preview` and `template` describes must pass; Task 4's and Task 5's
describes do not exist yet.

- [ ] **Step 8: Commit**

```bash
git add apps/backend && git commit -m "feat(backend): student import preview and template endpoints (paste-only intake)"
```

---

### Task 4: Student import commit — one transaction, idempotent by email *(Agent A)*

This is the task the plan exists for. Everything load-bearing lives here.

> **v1 parity 2026-10-09:** the commit is no longer "one transaction": it is v1's per-row loop, one transaction per row, with `failed` outcomes (D-16.5; `jpc-space/src/lib/student-import.ts:238-291`). The title is kept for traceability; Steps 1, 2, 5, 6 and 7 carry the changes.

**Files:**
- Modify: `apps/backend/src/lib/queries/students.ts` (add `createStudentRows`, `enrollStudentInSeason`)
- Modify: `apps/backend/src/routes/students.ts` (Plan 7's `POST /` calls `createStudentRows`; Plan 7's `POST /:id/enrollments` calls `enrollStudentInSeason`)
- Modify: `apps/backend/src/lib/imports/students.ts` (add the commit half)
- Modify: `apps/backend/src/routes/imports.ts` (add the commit route)
- Modify: `apps/backend/src/docs/openapi.ts` — **coordinator applies the fragment**
- Test: extend `apps/backend/src/__tests__/integration/imports-routes.test.ts`
- Test: create `apps/backend/src/__tests__/import-commit.test.ts` (**unit**, no database — Agent A runs this one)

**Interfaces:**
- Consumes: `validateImportRow`, `normaliseEmail`, `findExistingByEmail` (Task 3); `studentImportCommitInputSchema`, `ImportOnExisting`, `StudentImportResult` (Task 1); `Prisma` as a value from `../generated/prisma/client`.
- Produces: `NewStudentInput`, `StudentCreateTarget`, `createStudentRows(tx, inputs, target)`, `enrollStudentInSeason(tx, studentUserId, seasonId): Promise<"enrolled" | "already_enrolled">` in `lib/queries/students.ts`; `StudentImportTarget`, `ImportRowsInvalidError`, `commitStudentImport(rows, target, onExisting)` in `lib/imports/students.ts`; the endpoint `POST /api/v1/imports/students/commit`.

Plan 7 runs long before this plan in the execution order, so
`lib/queries/students.ts` and `routes/students.ts` exist. If they do not, stop:
this task refactors Plan 7's handlers and must not recreate them.

- [ ] **Step 1: Write the failing tests — integration first**

> **v1 parity 2026-10-09:** Rewrite the commit expectations to v1's per-row loop (`jpc-space/src/lib/student-import.ts:238-291`): an invalid row is reported `failed` "Invalid name or email." and the valid rows around it are created (replaces "refuses the WHOLE batch when any row is invalid", R42); an existing or soft-deleted match is `skipped` "Already in the system." (R22, R44 — delete the `onExisting: "enroll"` cases and "skips a soft-deleted address even under enroll"); a forced row error after earlier rows leaves those rows committed and reports the row `failed` "Could not create this account." (R45, R53); a unique-violation race on one row reports it `skipped` and the rest continue — no 409 (R52); the result is `{ created, skipped, failed, rows }` (R54). The re-run-creates-zero-rows case stays (D-16.6).

Append to `apps/backend/src/__tests__/integration/imports-routes.test.ts`:

```ts
describe("POST /api/v1/imports/students/commit — season mode", () => {
  it("creates User + StudentProfile + ACTIVE SeasonEnrollment with NO credentials", async () => {
    const email = testEmail("committed");
    const res = await request(app)
      .post("/api/v1/imports/students/commit")
      .set("authorization", `Bearer ${superToken}`)
      .send({
        mode: "season",
        seasonId,
        onExisting: "skip",
        rows: [
          {
            rowNumber: 2,
            values: {
              name: "Committed Student",
              email,
              university: "Test University",
              year: "3rd",
              phone: "+201234567",
              dateOfBirth: "2003-02-28",
              spiritualBackground: null,
              gifts: null,
              notes: "Internal staff note",
            },
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ created: 1, skipped: 0, enrolled: 0 });
    expect(res.body.data.rows[0]).toMatchObject({ rowNumber: 2, outcome: "created" });
    expect(res.body.data.rows[0].userId).toEqual(expect.any(Number));

    const [row] = await usersByEmail([email]);
    expect(row).toMatchObject({
      role: "STUDENT",
      // THE credential rule. v1's student-actions.ts:59 hard-codes
      // "ChangeMe123!" for form-created students; v2 has no shared default
      // password anywhere, and an invite is the only way an account gets
      // credentials (Plan 9). An imported account exists and cannot be
      // logged into until that invite is accepted.
      passwordHash: null,
      graduationYear: null,
    });
    expect(row.email).toBe(email); // stored EXACTLY as pasted (D-16.6)
    expect(row.studentProfile).toMatchObject({
      activeSeasonId: seasonId,
      university: "Test University",
      // R7/D7: the leading "+" survives — nothing coerced this cell.
      phone: "+201234567",
      notes: "Internal staff note",
    });
    // D-16.11: UTC midnight, not local midnight, not a transposed month.
    expect(row.studentProfile?.dateOfBirth?.toISOString()).toBe("2003-02-28T00:00:00.000Z");
    // The profile pointer and the enrolment agree by construction.
    expect(row.seasonEnrollments).toEqual([
      expect.objectContaining({ seasonId, status: "ACTIVE", groupId: null }),
    ]);
  });

  /**
   * ── THE IDEMPOTENCE TEST ────────────────────────────────────────────────
   * This is the roadmap's done-condition for Plan 17: "a re-run of the same
   * import creates zero duplicate rows against staging." It is Task 7's
   * mutation 1 target and it must go RED when the email-match branch in
   * commitStudentImport is deleted.
   */
  it("re-running the same paste creates ZERO new rows (D-16.6 / spec R44)", async () => {
    const a = testEmail("rerun-a");
    const b = testEmail("rerun-b");
    const rows = [
      { rowNumber: 2, values: { name: "Rerun A", email: a, university: null, year: null, phone: null, dateOfBirth: null, spiritualBackground: null, gifts: null, notes: null } },
      { rowNumber: 3, values: { name: "Rerun B", email: b, university: null, year: null, phone: null, dateOfBirth: null, spiritualBackground: null, gifts: null, notes: null } },
    ];
    const body = { mode: "season" as const, seasonId, onExisting: "skip" as const, rows };

    const first = await request(app)
      .post("/api/v1/imports/students/commit")
      .set("authorization", `Bearer ${superToken}`)
      .send(body);
    expect(first.status).toBe(200);
    expect(first.body.data).toMatchObject({ created: 2, skipped: 0 });

    const second = await request(app)
      .post("/api/v1/imports/students/commit")
      .set("authorization", `Bearer ${superToken}`)
      .send(body);

    expect(second.status).toBe(200);
    expect(second.body.data).toMatchObject({ created: 0, skipped: 2, enrolled: 0 });
    expect(second.body.data.rows.every((r: { outcome: string }) => r.outcome === "skipped")).toBe(true);

    // The assertion that cannot be satisfied by a lucky status code: count
    // the rows. Two addresses in, two users out, after two identical runs.
    expect(await db.user.count({ where: { email: { in: [a, b] } } })).toBe(2);
    expect(await db.seasonEnrollment.count({ where: { seasonId, studentUser: { email: { in: [a, b] } } } })).toBe(2);
    expect(await db.studentProfile.count({ where: { user: { email: { in: [a, b] } } } })).toBe(2);
  });

  it("matches an existing user whose stored address differs only in case", async () => {
    // Mutation 2's target. Without lower-casing the comparison, this attempts
    // an insert that the @unique index refuses, the transaction rolls back,
    // and the response is 409 instead of 200 — red either way.
    const existing = await createTestUser("commit-case", "STUDENT");
    const res = await request(app)
      .post("/api/v1/imports/students/commit")
      .set("authorization", `Bearer ${superToken}`)
      .send({
        mode: "season",
        seasonId,
        onExisting: "skip",
        rows: [{ rowNumber: 2, values: { name: "Shouted Case", email: existing.email.toUpperCase(), university: null, year: null, phone: null, dateOfBirth: null, spiritualBackground: null, gifts: null, notes: null } }],
      });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ created: 0, skipped: 1 });
    expect(await db.user.count({ where: { email: existing.email.toUpperCase() } })).toBe(0);
  });

  it("collapses two casings of one address in the same batch to a single account", async () => {
    const email = testEmail("batch-case");
    const res = await request(app)
      .post("/api/v1/imports/students/commit")
      .set("authorization", `Bearer ${superToken}`)
      .send({
        mode: "season",
        seasonId,
        onExisting: "skip",
        rows: [
          { rowNumber: 2, values: { name: "First Casing", email, university: null, year: null, phone: null, dateOfBirth: null, spiritualBackground: null, gifts: null, notes: null } },
          { rowNumber: 3, values: { name: "Second Casing", email: email.toUpperCase(), university: null, year: null, phone: null, dateOfBirth: null, spiritualBackground: null, gifts: null, notes: null } },
        ],
      });

    // v1 creates TWO accounts here (spec R25).
    expect(res.body.data).toMatchObject({ created: 1, skipped: 1 });
    expect(await db.user.count({ where: { email: { in: [email, email.toUpperCase()] } } })).toBe(1);
  });

  it("refuses the WHOLE batch when any row is invalid, and writes nothing (D-16.5)", async () => {
    const good = testEmail("allornothing-good");
    const alsoGood = testEmail("allornothing-also");
    const res = await request(app)
      .post("/api/v1/imports/students/commit")
      .set("authorization", `Bearer ${superToken}`)
      .send({
        mode: "season",
        seasonId,
        onExisting: "skip",
        rows: [
          { rowNumber: 2, values: { name: "Good One", email: good, university: null, year: null, phone: null, dateOfBirth: null, spiritualBackground: null, gifts: null, notes: null } },
          // A client that filtered its own preview badly, or lied.
          { rowNumber: 3, values: { name: "x".repeat(300), email: testEmail("allornothing-bad"), university: null, year: null, phone: null, dateOfBirth: null, spiritualBackground: null, gifts: null, notes: null } },
          { rowNumber: 4, values: { name: "Also Good", email: alsoGood, university: null, year: null, phone: null, dateOfBirth: null, spiritualBackground: null, gifts: null, notes: null } },
        ],
      });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("import_rows_invalid");
    expect(res.body.error.message).toMatch(/\b3\b/); // names the offending row number
    // v1 would have written rows 2 and 4 and reported row 3 `failed` (R45).
    expect(await db.user.count({ where: { email: { in: [good, alsoGood] } } })).toBe(0);
  });

  it("re-derives status server-side — a client's own classification is never trusted (D-16.4)", async () => {
    // The commit body has no `status` field at all, so the only way a client
    // can assert "this row is fine" is by sending it. The server disagrees.
    const res = await request(app)
      .post("/api/v1/imports/students/commit")
      .set("authorization", `Bearer ${superToken}`)
      .send({
        mode: "season",
        seasonId,
        onExisting: "skip",
        rows: [{ rowNumber: 2, status: "new", values: { name: "N", email: "definitely-not-an-email", university: null, year: null, phone: null, dateOfBirth: null, spiritualBackground: null, gifts: null, notes: null } }],
      });
    expect(res.status).toBe(422);
  });

  it("404s a soft-deleted season and writes nothing (spec R39)", async () => {
    const doomed = await createTestSeason();
    await db.season.update({ where: { id: doomed.id }, data: { deletedAt: new Date() } });
    const email = testEmail("dead-season");

    const res = await request(app)
      .post("/api/v1/imports/students/commit")
      .set("authorization", `Bearer ${superToken}`)
      .send({ mode: "season", seasonId: doomed.id, onExisting: "skip", rows: [{ rowNumber: 2, values: { name: "Orphan Row", email, university: null, year: null, phone: null, dateOfBirth: null, spiritualBackground: null, gifts: null, notes: null } }] });

    expect(res.status).toBe(404);
    expect(await db.user.count({ where: { email } })).toBe(0);
  });

  it("refuses ADMIN and STUDENT (spec D3 — SUPER-only, and it stays that way)", async () => {
    for (const token of [adminToken, studentToken]) {
      const res = await request(app)
        .post("/api/v1/imports/students/commit")
        .set("authorization", `Bearer ${token}`)
        .send({ mode: "season", seasonId, onExisting: "skip", rows: [{ rowNumber: 2, values: { name: "Nope", email: testEmail("nope"), university: null, year: null, phone: null, dateOfBirth: null, spiritualBackground: null, gifts: null, notes: null } }] });
      expect(res.status).toBe(403);
    }
  });
});

describe("POST /api/v1/imports/students/commit — onExisting", () => {
  it("enrols an existing student into the target season without touching their profile (D-16.7 / spec D4)", async () => {
    const returning = await createTestUser("returning", "STUDENT");
    await db.studentProfile.create({
      data: { userId: returning.id, activeSeasonId: otherSeasonId, notes: "A year of pastoral notes", university: "Old University" },
    });
    await db.seasonEnrollment.create({ data: { studentUserId: returning.id, seasonId: otherSeasonId, status: "COMPLETED", completedAt: new Date() } });

    const res = await request(app)
      .post("/api/v1/imports/students/commit")
      .set("authorization", `Bearer ${superToken}`)
      .send({
        mode: "season",
        seasonId,
        onExisting: "enroll",
        rows: [{ rowNumber: 2, values: { name: "A COMPLETELY DIFFERENT NAME", email: returning.email, university: "Stale Export University", year: null, phone: null, dateOfBirth: null, spiritualBackground: null, gifts: null, notes: "stale export note" } }],
      });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ created: 0, skipped: 0, enrolled: 1 });

    const [row] = await usersByEmail([returning.email]);
    // The enrolment was created…
    expect(row.seasonEnrollments.map((e) => e.seasonId).sort()).toEqual([otherSeasonId, seasonId].sort());
    // …but the pointer, already held by another season, was NOT stolen —
    // Plan 7's rule (POST /students/:id/enrollments), now the same function.
    expect(row.studentProfile?.activeSeasonId).toBe(otherSeasonId);
    // …and nothing else did. A spreadsheet must never erase pastoral notes.
    expect(row.name).toBe("Test returning");
    expect(row.studentProfile?.notes).toBe("A year of pastoral notes");
    expect(row.studentProfile?.university).toBe("Old University");
  });

  it("leaves an existing enrolment for that same season completely alone", async () => {
    const withdrawn = await createTestUser("withdrawn", "STUDENT");
    await db.studentProfile.create({ data: { userId: withdrawn.id } });
    await db.seasonEnrollment.create({
      data: { studentUserId: withdrawn.id, seasonId, status: "WITHDRAWN", droppedAt: new Date("2099-01-01T00:00:00.000Z"), dropReason: "Moved away" },
    });

    await request(app)
      .post("/api/v1/imports/students/commit")
      .set("authorization", `Bearer ${superToken}`)
      .send({ mode: "season", seasonId, onExisting: "enroll", rows: [{ rowNumber: 2, values: { name: "Withdrawn Person", email: withdrawn.email, university: null, year: null, phone: null, dateOfBirth: null, spiritualBackground: null, gifts: null, notes: null } }] });

    const enrolment = await db.seasonEnrollment.findUnique({
      where: { studentUserId_seasonId: { studentUserId: withdrawn.id, seasonId } },
      select: { status: true, dropReason: true },
    });
    // A resurrected WITHDRAWN enrolment with its reason erased is the most
    // damaging thing a bulk write can do (spec 06 D2). It must not happen.
    expect(enrolment).toMatchObject({ status: "WITHDRAWN", dropReason: "Moved away" });
  });

  it("reports an existing enrolment as skipped, and points an UNSET pointer (Plan 7's rules)", async () => {
    const already = await createTestUser("already-enrolled", "STUDENT");
    await db.studentProfile.create({ data: { userId: already.id } });
    await db.seasonEnrollment.create({
      data: { studentUserId: already.id, seasonId, status: "ACTIVE" },
    });
    const fresh = await createTestUser("pointer-unset", "STUDENT");
    await db.studentProfile.create({ data: { userId: fresh.id } });

    const blank = { university: null, year: null, phone: null, dateOfBirth: null, spiritualBackground: null, gifts: null, notes: null };
    const res = await request(app)
      .post("/api/v1/imports/students/commit")
      .set("authorization", `Bearer ${superToken}`)
      .send({
        mode: "season",
        seasonId,
        onExisting: "enroll",
        rows: [
          { rowNumber: 2, values: { name: "Already Here", email: already.email, ...blank } },
          { rowNumber: 3, values: { name: "Pointer Unset", email: fresh.email, ...blank } },
        ],
      });

    expect(res.body.data).toMatchObject({ created: 0, skipped: 1, enrolled: 1 });
    expect(res.body.data.rows[0]).toMatchObject({ outcome: "skipped", message: expect.stringMatching(/already enrolled/i) });
    const [freshRow] = await usersByEmail([fresh.email]);
    expect(freshRow.studentProfile?.activeSeasonId).toBe(seasonId);
  });

  it("skips a soft-deleted address even under enroll, with a message that says why", async () => {
    const removed = await createTestUser("commit-removed", "STUDENT");
    await db.user.update({ where: { id: removed.id }, data: { deletedAt: new Date() } });

    const res = await request(app)
      .post("/api/v1/imports/students/commit")
      .set("authorization", `Bearer ${superToken}`)
      .send({ mode: "season", seasonId, onExisting: "enroll", rows: [{ rowNumber: 2, values: { name: "Removed Person", email: removed.email, university: null, year: null, phone: null, dateOfBirth: null, spiritualBackground: null, gifts: null, notes: null } }] });

    expect(res.body.data).toMatchObject({ created: 0, skipped: 1, enrolled: 0 });
    expect(res.body.data.rows[0].message).toMatch(/restore/i);
    expect(await db.seasonEnrollment.count({ where: { studentUserId: removed.id, seasonId } })).toBe(0);
  });

  it("skips an address that belongs to a staff account rather than enrolling it", async () => {
    const leader = await createTestUser("commit-leader", "LEADER");
    const res = await request(app)
      .post("/api/v1/imports/students/commit")
      .set("authorization", `Bearer ${superToken}`)
      .send({ mode: "season", seasonId, onExisting: "enroll", rows: [{ rowNumber: 2, values: { name: "A Leader", email: leader.email, university: null, year: null, phone: null, dateOfBirth: null, spiritualBackground: null, gifts: null, notes: null } }] });

    expect(res.body.data).toMatchObject({ created: 0, skipped: 1, enrolled: 0 });
    expect(await db.seasonEnrollment.count({ where: { studentUserId: leader.id } })).toBe(0);
  });
});

describe("POST /api/v1/imports/students/commit — alumni mode", () => {
  it("sets graduationYear and creates NEITHER an active season NOR an enrolment (spec R48)", async () => {
    const email = testEmail("alumnus");
    const res = await request(app)
      .post("/api/v1/imports/students/commit")
      .set("authorization", `Bearer ${superToken}`)
      .send({ mode: "alumni", graduationYear: 2020, onExisting: "skip", rows: [{ rowNumber: 2, values: { name: "An Alumnus", email, university: null, year: null, phone: null, dateOfBirth: null, spiritualBackground: null, gifts: null, notes: null } }] });

    expect(res.status).toBe(200);
    const [row] = await usersByEmail([email]);
    expect(row).toMatchObject({ graduationYear: 2020, passwordHash: null, role: "STUDENT" });
    expect(row.studentProfile?.activeSeasonId).toBeNull();
    expect(row.seasonEnrollments).toEqual([]);
  });

  it("rejects onExisting=enroll in alumni mode — there is no season to enrol into", async () => {
    const res = await request(app)
      .post("/api/v1/imports/students/commit")
      .set("authorization", `Bearer ${superToken}`)
      .send({ mode: "alumni", graduationYear: 2020, onExisting: "enroll", rows: [{ rowNumber: 2, values: { name: "A", email: testEmail("alumni-enroll"), university: null, year: null, phone: null, dateOfBirth: null, spiritualBackground: null, gifts: null, notes: null } }] });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Write the failing unit test for atomicity (Agent A runs this one)**

> **v1 parity 2026-10-09:** Replace the all-or-nothing unit test with a per-row isolation test: each row's writes go through its own `db.$transaction` call (one call per created row), and a throw inside row 2's transaction does not prevent row 3's (R45).

The transaction's rollback path cannot be triggered deterministically through
HTTP — every failure the integration suite can stage is caught by validation
before a write happens. So atomicity is pinned where it *is* observable: that
the writes are issued on the transaction client and never on `db` itself.
This is mutation 3's target.

```ts
// apps/backend/src/__tests__/import-commit.test.ts
//
// A unit test with the database module mocked. It exists for one assertion
// the integration suite structurally cannot make: that every write in
// commitStudentImport happens INSIDE the $transaction callback. Replace the
// $transaction with sequential db.* calls (Task 7 mutation 3) and the
// top-level spies below fire.

const mockTx = {
  user: { createManyAndReturn: jest.fn() },
  studentProfile: { createMany: jest.fn(), upsert: jest.fn() },
  seasonEnrollment: { createMany: jest.fn(), upsert: jest.fn() },
  $queryRaw: jest.fn(),
};
const mockDb = {
  $transaction: jest.fn(),
  $queryRaw: jest.fn(),
  user: { createManyAndReturn: jest.fn(), create: jest.fn() },
  studentProfile: { createMany: jest.fn(), upsert: jest.fn() },
  seasonEnrollment: { createMany: jest.fn(), upsert: jest.fn() },
};

jest.mock("../db/client", () => ({ db: mockDb }));

import { commitStudentImport, ImportRowsInvalidError } from "../lib/imports/students";

const values = (name: string, email: string) => ({
  name, email,
  university: null, year: null, phone: null, dateOfBirth: null,
  spiritualBackground: null, gifts: null, notes: null,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx));
  mockTx.$queryRaw.mockResolvedValue([]); // nobody exists yet
  mockTx.user.createManyAndReturn.mockImplementation(async ({ data }: { data: { email: string }[] }) =>
    data.map((d, i) => ({ id: 100 + i, email: d.email })),
  );
  mockTx.studentProfile.createMany.mockResolvedValue({ count: 0 });
  mockTx.seasonEnrollment.createMany.mockResolvedValue({ count: 0 });
});

describe("commitStudentImport", () => {
  it("issues every write on the transaction client and none on db itself", async () => {
    await commitStudentImport(
      [
        { rowNumber: 2, values: values("A Student", "space-v2-test-a@jpc.test") },
        { rowNumber: 3, values: values("B Student", "space-v2-test-b@jpc.test") },
      ],
      { kind: "season", seasonId: 7 },
      "skip",
    );

    expect(mockDb.$transaction).toHaveBeenCalledTimes(1);
    expect(mockTx.user.createManyAndReturn).toHaveBeenCalledTimes(1);
    // Three statements for the whole batch — not three PER ROW, which is what
    // makes an all-or-nothing 2000-row import affordable (D-16.5).
    expect(mockTx.studentProfile.createMany).toHaveBeenCalledTimes(1);
    expect(mockTx.seasonEnrollment.createMany).toHaveBeenCalledTimes(1);
    // The mutation detector:
    expect(mockDb.user.createManyAndReturn).not.toHaveBeenCalled();
    expect(mockDb.user.create).not.toHaveBeenCalled();
    expect(mockDb.studentProfile.createMany).not.toHaveBeenCalled();
    expect(mockDb.seasonEnrollment.createMany).not.toHaveBeenCalled();
  });

  it("throws before opening a transaction when any row is invalid", async () => {
    await expect(
      commitStudentImport(
        [
          { rowNumber: 2, values: values("Fine", "space-v2-test-fine@jpc.test") },
          { rowNumber: 9, values: values("Bad", "nope") },
        ],
        { kind: "season", seasonId: 7 },
        "skip",
      ),
    ).rejects.toBeInstanceOf(ImportRowsInvalidError);

    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  it("reports the offending row NUMBERS, never the addresses (spec D19)", async () => {
    const err = await commitStudentImport(
      [{ rowNumber: 41, values: values("Bad", "nope") }],
      { kind: "season", seasonId: 7 },
      "skip",
    ).catch((e: unknown) => e as ImportRowsInvalidError);

    expect(err).toBeInstanceOf(ImportRowsInvalidError);
    expect((err as ImportRowsInvalidError).rowNumbers).toEqual([41]);
  });

  it("writes one user per distinct address, case-insensitively", async () => {
    await commitStudentImport(
      [
        { rowNumber: 2, values: values("One", "space-v2-test-dup@jpc.test") },
        { rowNumber: 3, values: values("Two", "SPACE-V2-TEST-DUP@JPC.TEST") },
      ],
      { kind: "alumni", graduationYear: 2020 },
      "skip",
    );

    const created = mockTx.user.createManyAndReturn.mock.calls[0][0].data;
    expect(created).toHaveLength(1);
    // Stored verbatim, compared lower-cased (D-16.6).
    expect(created[0].email).toBe("space-v2-test-dup@jpc.test");
    // No credential, ever.
    expect(created[0].passwordHash).toBeNull();
    expect(created[0].role).toBe("STUDENT");
    // Alumni mode creates no enrolment at all (spec R48).
    expect(mockTx.seasonEnrollment.createMany).not.toHaveBeenCalled();
  });
});
```

Run: `cd apps/backend && npx jest --testPathPattern import-commit`
Expected: FAIL — `Cannot find module '../lib/imports/students'`'s
`commitStudentImport` export, reported as
`TypeError: (0 , students_1.commitStudentImport) is not a function`. That
message proves the test binds to the real module rather than a local double.

- [ ] **Step 3: Extract the student write path into `lib/queries/students.ts`**

Append to `apps/backend/src/lib/queries/students.ts` (add
`import type { Prisma } from "../../generated/prisma/client";` if the file
does not already have it — it does, for `Prisma.UserWhereInput`):

```ts
export interface NewStudentInput {
  name: string;
  email: string;
  university: string | null;
  year: string | null;
  phone: string | null;
  dateOfBirth: Date | null;
  spiritualBackground: string | null;
  gifts: string | null;
  notes: string | null;
}

export type StudentCreateTarget =
  | { kind: "season"; seasonId: number }
  | { kind: "alumni"; graduationYear: number }
  | { kind: "none" };

/**
 * The ONE write path that creates students. `POST /api/v1/students` and the
 * bulk importer both call it, so a form-created student and an imported
 * student are the same kind of account (decision D-16.8).
 *
 * v1 has two paths that disagree: `createStudentAction` sets a temporary
 * password (`jpc-space/src/lib/student-actions.ts:59`, the hard-coded
 * `ChangeMe123!`) while `commitStudentImport` writes `passwordHash: null`
 * (`student-import.ts:260`) — the spec records this at R46 as "the two paths
 * produce differently-initialised accounts". v2 has one path and it issues no
 * credential of any kind. There is no shared default password in this
 * codebase; credentials arrive when an invite is accepted (Plan 9), and that
 * is the only place a hash is ever written — with bcryptjs. Nothing here
 * hashes anything, and nothing here may ever log one.
 *
 * `role` is forced, never taken from input: no importer and no form can
 * create anything but a STUDENT (spec R47).
 *
 * THREE STATEMENTS FOR THE WHOLE BATCH — createManyAndReturn, then one
 * createMany for profiles and one for enrolments. v1 issued two or three
 * statements per row, each in its own transaction (R45/R46), which is why its
 * commit could not be atomic. This shape is what makes D-16.5's
 * all-or-nothing 2000-row import affordable inside one transaction.
 *
 * The caller is responsible for having de-duplicated `inputs` by email: a
 * batch containing the same address twice violates `User.email @unique` and
 * takes the whole transaction down.
 */
export async function createStudentRows(
  tx: Prisma.TransactionClient,
  inputs: NewStudentInput[],
  target: StudentCreateTarget,
): Promise<{ id: number; email: string }[]> {
  if (inputs.length === 0) return [];

  const created = await tx.user.createManyAndReturn({
    data: inputs.map((i) => ({
      name: i.name,
      // Stored EXACTLY as given. Comparison is case-insensitive (D-16.6);
      // storage is not, because v1's login looks the address up verbatim.
      email: i.email,
      role: "STUDENT" as const,
      graduationYear: target.kind === "alumni" ? target.graduationYear : null,
      passwordHash: null,
    })),
    select: { id: true, email: true },
  });

  // Map back by email rather than by array position: createManyAndReturn's
  // ordering is not part of its contract, and a silent misalignment here
  // would attach one student's pastoral notes to another student's account.
  const idByEmail = new Map(created.map((c) => [c.email.toLowerCase(), c.id]));
  const idFor = (email: string): number => {
    const id = idByEmail.get(email.toLowerCase());
    if (id === undefined) {
      // Unreachable unless the insert silently dropped a row; failing here
      // aborts the transaction, which is the correct outcome.
      throw new Error("createStudentRows: no created row for an input email");
    }
    return id;
  };

  await tx.studentProfile.createMany({
    data: inputs.map((i) => ({
      userId: idFor(i.email),
      // The pointer and the enrolment below name the same season by
      // construction — the two definitions of "in this season" cannot drift.
      activeSeasonId: target.kind === "season" ? target.seasonId : null,
      university: i.university,
      year: i.year,
      phone: i.phone,
      dateOfBirth: i.dateOfBirth,
      spiritualBackground: i.spiritualBackground,
      gifts: i.gifts,
      notes: i.notes,
    })),
  });

  if (target.kind === "season") {
    await tx.seasonEnrollment.createMany({
      data: inputs.map((i) => ({
        studentUserId: idFor(i.email),
        seasonId: target.seasonId,
        status: "ACTIVE" as const,
      })),
    });
  }

  return created;
}
```

- [ ] **Step 4: Point Plan 7's `POST /api/v1/students` at it — keeping Plan 10's invite**

By now **Plan 10 Task 2 Step 3** has rewritten this handler's tail: inside the
`db.$transaction` it writes the user/profile/enrollment rows **and then**
calls `issueInvite(tx, student.id, user.userId)`; after commit it sends the
invite mail best-effort. Only the **row-writing block** moves into
`createStudentRows`. The `issueInvite` line, the `let created` / `let invite`
declarations, the `P2002 → email_taken` catch, the post-commit
`sendInviteEmail` and the `apiOk(res, created, 201)` all stay exactly as Plan
17 wrote them — the importer calls `createStudentRows` without `issueInvite`,
which is precisely how it keeps sending nothing (spec R55). Verify first:
`grep -n "issueInvite(tx, student.id" apps/backend/src/routes/students.ts` → one hit;
if absent, stop — Plan 10 has not run.

In `apps/backend/src/routes/students.ts`, inside that transaction, replace
everything from `const student = await tx.user.create({` through the closing
brace of the `if (body.seasonId != null) { … }` enrollment block with:

```ts
      // One writer for these rows (D-16.8): the bulk importer calls exactly
      // this function, so the two paths cannot drift apart the way v1's did.
      // Plan 10's invite stays below, in the route — the importer never mints one.
      const [student] = await createStudentRows(
        tx,
        [
          {
            name: body.name,
            email: body.email,
            university: body.university ?? null,
            year: body.year ?? null,
            phone: body.phone ?? null,
            dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : null,
            spiritualBackground: body.spiritualBackground ?? null,
            gifts: body.gifts ?? null,
            notes: body.notes ?? null,
          },
        ],
        body.seasonId != null ? { kind: "season", seasonId: body.seasonId } : { kind: "none" },
      );
      if (!student) throw new Error("createStudentRows returned no row for one input");
```

leaving Plan 10's next lines —
`const issued = await issueInvite(tx, student.id, user.userId); return { student, issued };` —
untouched. `createStudentRows` returns `{ id, email }[]`, the same `select`
Plan 10's `tx.user.create` used, so `created` keeps its type and the 201 body
(`{ data: { id, email } }`) is unchanged.

Add `createStudentRows` to the existing
`import { … } from "../lib/queries/students";`. Plan 7's whole
`students-routes.test.ts` suite — including the invite cases Plan 10 Task 2
added to it — must
still pass unchanged; that is the proof the extraction was
behaviour-preserving, and Task 7 Step 1 runs it.

- [ ] **Step 4b: Extract Plan 7's enrolment write into `enrollStudentInSeason`**

> **v1 parity 2026-10-09:** The importer no longer calls `enrollStudentInSeason` (R44, v1 `jpc-space/src/lib/student-import.ts:248-251`); keep this extraction only if Plan 7's `POST /students/:id/enrollments` already uses it, otherwise skip the step.

Append to `apps/backend/src/lib/queries/students.ts`:

```ts
/**
 * Enrol one student in one season — Plan 7's `POST /students/:id/enrollments`
 * rules, in the one place both that route and the bulk importer call
 * (D-16.7/D-16.8; spec 06 D1/R2):
 *
 *  - one enrolment per student per season, EVER: an existing row of any
 *    status is "already_enrolled" and is not touched (a WITHDRAWN row is
 *    history, not an obstacle — re-admission is not invented here);
 *  - entry is always ACTIVE (R47);
 *  - the profile pointer is set only when UNSET — never stolen from a season
 *    that already holds it. updateMany so a student with no profile row is a
 *    no-op rather than a throw, exactly as Plan 7's guarded update behaved.
 *
 * A concurrent caller can still lose the unique-index race (P2002); the
 * caller's existing P2002 handling answers it (409 already_enrolled on the
 * route, 409 import_conflict on the importer, whose transaction rolls back).
 */
export async function enrollStudentInSeason(
  tx: Prisma.TransactionClient,
  studentUserId: number,
  seasonId: number,
): Promise<"enrolled" | "already_enrolled"> {
  const existing = await tx.seasonEnrollment.findUnique({
    where: { studentUserId_seasonId: { studentUserId, seasonId } },
    select: { id: true },
  });
  if (existing) return "already_enrolled";

  await tx.seasonEnrollment.create({
    data: { studentUserId, seasonId, status: "ACTIVE" },
  });
  await tx.studentProfile.updateMany({
    where: { userId: studentUserId, activeSeasonId: null },
    data: { activeSeasonId: seasonId },
  });
  return "enrolled";
}
```

In `apps/backend/src/routes/students.ts`'s `POST /:id/enrollments`, replace
the pre-transaction `existing` lookup and the transaction body with:

```ts
  try {
    const outcome = await db.$transaction((tx) => enrollStudentInSeason(tx, id, seasonId));
    if (outcome === "already_enrolled") {
      return apiError(res, "already_enrolled", "This student already has an enrollment in that season.", 409);
    }
    const enrollment = await db.seasonEnrollment.findUniqueOrThrow({
      where: { studentUserId_seasonId: { studentUserId: id, seasonId } },
      select: { id: true, seasonId: true, status: true },
    });
    return apiOk(res, enrollment, 201);
  } catch (err) { /* the existing P2002 → 409 already_enrolled branch, unchanged */ }
```

The gate, the season and student lookups and the P2002 branch are unchanged.
Plan 7's enrolment tests (`describe("POST /api/v1/students/:id/enrollments")`)
must pass unchanged — they are the proof the rules moved without changing.

- [ ] **Step 5: Write the commit half of `lib/imports/students.ts`**

> **v1 parity 2026-10-09:** Rewrite `commitStudentImport(rows, target)` (no `onExisting`) as v1's loop (v2 `apps/backend/src/lib/imports/students.ts:430-605`; v1 `jpc-space/src/lib/student-import.ts:238-291`): for each row — validate with `studentImportRowSchema` (fail → `failed` "Invalid name or email.", continue); `findExistingByEmail` (hit, deleted or not → `skipped` "Already in the system.", continue); `db.$transaction((tx) => createStudentRows(tx, [row], target))` → `created` with `userId`; catch `P2002` → `skipped` "Already in the system."; any other error → log the row number (never the email, D-16.18) and `failed` "Could not create this account.". Delete `ImportRowsInvalidError` and the `enroll` arm (`:472-489`, `:513-536`, `:600-605`). Return the per-row list and `created/skipped/failed` tallies (`:544-553`).

Append:

```ts
import type { StudentImportResult, StudentImportResultRow } from "@space/shared";

import {
  createStudentRows,
  enrollStudentInSeason,
  type NewStudentInput,
} from "../queries/students";

export type StudentImportTarget =
  | { kind: "season"; seasonId: number }
  | { kind: "alumni"; graduationYear: number };

export interface StudentImportCommitRow {
  rowNumber: number;
  values: ImportCellValues;
}

/**
 * Some rows the client asked to commit are not importable. The batch is
 * all-or-nothing (D-16.5), so this aborts everything and carries the row
 * NUMBERS — never the addresses (spec D19).
 */
export class ImportRowsInvalidError extends Error {
  constructor(readonly rowNumbers: number[]) {
    super("Some import rows are not valid.");
    this.name = "ImportRowsInvalidError";
  }
}

function toNewStudentInput(row: StudentImportRow): NewStudentInput {
  return {
    name: row.name,
    email: row.email,
    university: row.university ?? null,
    year: row.year ?? null,
    phone: row.phone ?? null,
    // Already normalised to `YYYY-MM-DDT00:00:00.000Z` by validateImportRow,
    // so this is UTC midnight and not the server's local midnight (D-16.11).
    dateOfBirth: row.dateOfBirth ? new Date(row.dateOfBirth) : null,
    spiritualBackground: row.spiritualBackground ?? null,
    gifts: row.gifts ?? null,
    notes: row.notes ?? null,
  };
}

/**
 * Commit a whole batch: one transaction, all-or-nothing, idempotent by email.
 *
 * The preview lives in the client and is resubmitted (roadmap Plan 17), which
 * in v1 made the preview purely advisory — its commit accepted any rows the
 * shape schema admitted, never checked a preview had happened, and never
 * re-ran the classifier (spec R34, "the preview is advisory"). Here the
 * client sends cell VALUES and no status, and this function re-derives every
 * fact it needs: it re-validates each row against the same schema the preview
 * used, re-deduplicates the batch, and re-runs the existence lookup inside
 * the transaction. That re-derivation IS the integrity control (D-16.4).
 */
export async function commitStudentImport(
  input: StudentImportCommitRow[],
  target: StudentImportTarget,
  onExisting: ImportOnExisting,
): Promise<StudentImportResult> {
  // 1 ─ Re-validate everything BEFORE opening a transaction. A batch with any
  //     unimportable row writes nothing at all (D-16.5): v1 would have
  //     written rows 1–39, recorded row 40 `failed` and carried on to row 100.
  const validated: { rowNumber: number; row: StudentImportRow }[] = [];
  const invalidRowNumbers: number[] = [];
  for (const item of input) {
    const result = validateImportRow(item.values);
    if (!result.ok) {
      invalidRowNumbers.push(item.rowNumber);
      continue;
    }
    validated.push({ rowNumber: item.rowNumber, row: result.row });
  }
  if (invalidRowNumbers.length > 0) throw new ImportRowsInvalidError(invalidRowNumbers);

  // 2 ─ In-batch duplicates: the first occurrence wins, the rest are reported
  //     skipped. Case-insensitive — v1 compares raw strings, so "Foo@x.com"
  //     and "foo@x.com" in one file become TWO accounts (spec R25).
  const seen = new Set<string>();
  const unique: typeof validated = [];
  const outcomes = new Map<number, StudentImportResultRow>();

  for (const item of validated) {
    const key = normaliseEmail(item.row.email);
    if (seen.has(key)) {
      outcomes.set(item.rowNumber, {
        rowNumber: item.rowNumber,
        name: item.row.name,
        email: item.row.email,
        outcome: "skipped",
        message: "Repeated earlier in this import.",
        userId: null,
      });
      continue;
    }
    seen.add(key);
    unique.push(item);
  }

  await db.$transaction(
    async (tx) => {
      const existing = await findExistingByEmail(tx, unique.map((u) => u.row.email));

      const toCreate: typeof unique = [];
      const toEnroll: { rowNumber: number; userId: number }[] = [];

      for (const item of unique) {
        // ── THE IDEMPOTENCE BRANCH ────────────────────────────────────────
        // Everything from `const match` to the `continue` is what makes
        // "re-running the same paste creates zero new rows" true (spec R44,
        // decision D-16.6). On a match the importer skips: it never updates
        // and never duplicates.
        //
        // Deleting these lines is Task 7's mutation 1. The test that must go
        // red is "re-running the same paste creates ZERO new rows" in
        // imports-routes.test.ts.
        const match = existing.get(normaliseEmail(item.row.email));
        if (match) {
          const outcome = existingOutcome(item, match, target, onExisting);
          outcomes.set(item.rowNumber, outcome);
          if (outcome.outcome === "enrolled") {
            toEnroll.push({ rowNumber: item.rowNumber, userId: match.id });
          }
          continue;
        }
        // ── END IDEMPOTENCE BRANCH ────────────────────────────────────────
        toCreate.push(item);
      }

      if (toCreate.length > 0) {
        const created = await createStudentRows(
          tx,
          toCreate.map((t) => toNewStudentInput(t.row)),
          target,
        );
        const idByEmail = new Map(created.map((c) => [normaliseEmail(c.email), c.id]));
        for (const item of toCreate) {
          outcomes.set(item.rowNumber, {
            rowNumber: item.rowNumber,
            name: item.row.name,
            email: item.row.email,
            outcome: "created",
            message: null,
            userId: idByEmail.get(normaliseEmail(item.row.email)) ?? null,
          });
        }
      }

      if (target.kind === "season") {
        for (const e of toEnroll) {
          // D-16.7, on Plan 7's rules (one writer — enrollStudentInSeason):
          //  - one enrolment per student per season, ever. An existing row —
          //    ACTIVE, WITHDRAWN or COMPLETED — is left entirely alone and the
          //    row is reported `skipped`, the bulk form of Plan 7's 409
          //    already_enrolled. A spreadsheet can never resurrect a WITHDRAWN
          //    enrolment or erase why somebody left;
          //  - the profile pointer is set only when it is UNSET; a pointer
          //    another season already holds is never stolen;
          //  - nothing else on the profile is written.
          const result = await enrollStudentInSeason(tx, e.userId, target.seasonId);
          if (result === "already_enrolled") {
            const prior = outcomes.get(e.rowNumber);
            if (prior) {
              outcomes.set(e.rowNumber, {
                ...prior,
                outcome: "skipped",
                message: "Already enrolled in this season — left unchanged.",
              });
            }
          }
        }
      }
    },
    // Generous but bounded. The create path is three statements regardless of
    // size; only the `enroll` loop scales with the number of EXISTING
    // students in the batch, which is the smaller number in practice.
    { timeout: 30_000 },
  );

  const rows = input
    .map((item) => outcomes.get(item.rowNumber))
    .filter((r): r is StudentImportResultRow => r !== undefined);

  return {
    created: rows.filter((r) => r.outcome === "created").length,
    skipped: rows.filter((r) => r.outcome === "skipped").length,
    enrolled: rows.filter((r) => r.outcome === "enrolled").length,
    rows,
  };
}

/**
 * What happens to a row whose address is already in the database.
 *
 * The deleted and non-student cases come FIRST, so `enroll` can never reach
 * them: enrolling a soft-deleted account would quietly undo a deliberate
 * removal, and enrolling a LEADER's address as a student would put staff on
 * a roster.
 */
function existingOutcome(
  item: { rowNumber: number; row: StudentImportRow },
  match: ExistingUser,
  target: StudentImportTarget,
  onExisting: ImportOnExisting,
): StudentImportResultRow {
  const base = {
    rowNumber: item.rowNumber,
    name: item.row.name,
    email: item.row.email,
    userId: match.id,
  };

  if (match.deletedAt !== null) {
    // D-16.14 / spec D6. The lookup is deliberately unfiltered by deletedAt,
    // so this row can never be re-imported — the address stays reserved by
    // User.email @unique. Freeing it is a partial unique index, which is a
    // migration, which is Plan 18.
    return {
      ...base,
      // No id for a removed or staff account: the import screen has no use
      // for it, and it would hand the operator a handle on a row they
      // reached only by typing its address.
      userId: null,
      outcome: "skipped",
      message: "Previously removed — restore this account from the users screen.",
    };
  }
  if (match.role !== "STUDENT") {
    return {
      ...base,
      userId: null,
      outcome: "skipped",
      message: "That address already belongs to a staff account.",
    };
  }
  if (onExisting === "enroll" && target.kind === "season") {
    // Provisional: the enrol loop below may downgrade this to `skipped` when
    // the student already holds an enrolment in the target season (Plan 7's
    // already_enrolled rule, applied per row).
    return { ...base, outcome: "enrolled", message: "Already in the system — enrolled in this season." };
  }
  return { ...base, outcome: "skipped", message: "Already in the system." };
}
```

Add the missing type imports at the top of the file:
`ImportOnExisting`, `StudentImportResult`, `StudentImportResultRow` to the
`import type { … } from "@space/shared"` list. `ImportCellValues` and
`StudentImportRow` are already there.

- [ ] **Step 6: Add the commit route**

> **v1 parity 2026-10-09:** The commit route has no `commitLimiter` and no 422 `import_rows_invalid` / 409 `import_conflict` branches (v2 `apps/backend/src/routes/imports.ts:140`, `:165-188`); unexpected errors are per-row `failed`, so the route answers 200 with the report (R42, R52, R53, R84).

Append to `apps/backend/src/routes/imports.ts` (extend the existing shared
value import with `studentImportCommitInputSchema`, and add
`import { Prisma } from "../generated/prisma/client";` — a **value** import,
which that module exports at the end of `client.ts`):

```ts
importsRouter.post("/students/commit", commitLimiter, importJsonParser, async (req, res) => {
  if (!requireSuper(req, res)) return;

  const parsed = studentImportCommitInputSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid import request.", 400);
  const body = parsed.data;

  let target: StudentImportTarget;
  if (body.mode === "season") {
    // Liveness, not scope (spec R39/R40). This endpoint is SUPER-only and
    // stays that way (D3); if it is ever opened to a season ADMIN, the
    // row-scoped check goes in the SAME change as the widened gate (C8).
    const season = await db.season.findFirst({
      where: { id: body.seasonId, deletedAt: null },
      select: { id: true },
    });
    if (!season) return apiError(res, "not_found", "That season no longer exists.", 404);
    target = { kind: "season", seasonId: season.id };
  } else {
    target = { kind: "alumni", graduationYear: body.graduationYear };
  }

  try {
    return apiOk(res, await commitStudentImport(body.rows, target, body.onExisting));
  } catch (err) {
    if (err instanceof ImportRowsInvalidError) {
      const shown = err.rowNumbers.slice(0, 10).join(", ");
      const more = err.rowNumbers.length > 10 ? ` and ${err.rowNumbers.length - 10} more` : "";
      return apiError(
        res,
        "import_rows_invalid",
        `${err.rowNumbers.length} row(s) are not valid — rows ${shown}${more}. Nothing was imported. Preview again and fix them.`,
        422,
      );
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      // Somebody else created one of these addresses between this request's
      // existence lookup and its insert. The whole transaction rolled back,
      // so nothing partial landed — and because the commit is idempotent,
      // re-running the same paste is safe. Say exactly that: v1 downgraded
      // this race to a silent per-row "skipped" (R52), which made a genuine
      // conflict indistinguishable from a clean no-op.
      return apiError(
        res,
        "import_conflict",
        "Someone else added one of these people while this import was running. Nothing was written — run it again.",
        409,
      );
    }
    throw err;
  }
});
```

Add `db` (`import { db } from "../db/client";`) and the new imports from
`../lib/imports/students` (`commitStudentImport`, `ImportRowsInvalidError`,
and `type StudentImportTarget`) to the route file's import block.

- [ ] **Step 7: Hand back the OpenAPI fragment (coordinator applies)**

> **v1 parity 2026-10-09:** OpenAPI: commit body without `onExisting`; result outcomes `created | skipped | failed` and `failed` tally; remove the 409/422/429 responses.

Add `POST /api/v1/imports/students/commit`. The description must state:

- SUPER-only.
- The body carries cell **values and a row number, never a status** — and why:
  the server re-derives every classification itself, so a client cannot commit
  a row the server would have refused.
- **All-or-nothing.** Any unimportable row → `422 import_rows_invalid`, naming
  the rows, and nothing is written. Deliberate divergence from v1, which
  committed row-by-row and left partial imports behind.
- **Idempotent by email, matched case-insensitively.** A re-run creates
  nothing. The address is stored exactly as sent.
- `onExisting` is required. `skip` reproduces v1; `enroll` (season mode only)
  adds the enrolment and moves `activeSeasonId` and writes **no other field**.
- Outcomes are `created` / `skipped` / `enrolled` — there is no `failed`.
- `404 not_found` for a soft-deleted season; `409 import_conflict` for a
  concurrent create, with the note that re-running is safe; `429`.

- [ ] **Step 8: Verification**

Agent A:
```bash
cd apps/backend && npx jest --testPathPattern import-commit
pnpm turbo lint typecheck test:unit --filter=@space/backend
```

Coordinator, after merge:
```bash
cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern imports
cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern students
```
The second command is the extraction's regression gate: Plan 7's suite must
pass **unchanged** after `POST /api/v1/students` was rewired through
`createStudentRows`.

- [ ] **Step 9: Commit**

```bash
git add apps/backend && git commit -m "feat(backend): transactional, email-idempotent student import commit"
```

---

### Task 5: Group-assignment import — preview + commit *(Agent A)*

**Files:**
- Create: `apps/backend/src/lib/imports/groups.ts`
- (Not modified: `apps/backend/src/lib/queries/groups.ts` — `assignStudentsToGroups` and `GroupOutsideSeasonError` are **Plan 6's**, consumed here)
- Modify: `apps/backend/src/routes/imports.ts` (fill in `seasonImportsRouter`)
- Modify: `apps/backend/src/docs/openapi.ts` — **coordinator applies the fragment**
- Test: extend `apps/backend/src/__tests__/integration/imports-routes.test.ts`

**Interfaces:**
- Consumes: `parseDelimited` / `ImportParseError` (Task 2); `normaliseEmail` (Task 3); `groupImportCommitInputSchema`, `pastedSheetInputSchema`, `IMPORT_GROUP_HEADERS`, `IMPORT_EMAIL_HEADERS`, `IMPORT_NAME_HEADERS` (Task 1); `isAdminOfSeason` from `../lib/rbac`; `parseId`; **Plan 6's** `assignStudentsToGroups(tx, seasonId, assignments)` and `GroupOutsideSeasonError` from `lib/queries/groups.ts`.
- Produces: `buildGroupImportPreview(sheet, seasonId)` in `lib/imports/groups.ts`; the endpoints `POST /api/v1/seasons/:id/imports/groups/preview` and `.../commit`.

`lib/queries/groups.ts` is domain 5's file and Plan 6 already added the bulk
write there. This task does not edit it.

- [ ] **Step 1: Append the failing tests**

> **v1 parity 2026-10-09:** Replace the "refuses the file when two groups share a name" case with: two groups of the season named "Alpha" and "alpha " → the row naming `ALPHA` previews `no_group` with `Several groups in this season are named "ALPHA". Rename one of them, then import again.` and no `groupId`, while another row naming a unique group in the same paste previews `assign` and commits (D-16.19.1; v1 `jpc-space/src/lib/group-import.ts:59`, R65). Delete the group-import rate-limit cases (R84).

```ts
describe("POST /api/v1/seasons/:id/imports/groups/preview", () => {
  let groupAId: number;
  let groupBId: number;
  let enrolledId: number;
  let enrolledEmail: string;
  let inGroupAId: number;
  let inGroupAEmail: string;
  let unenrolledEmail: string;

  beforeAll(async () => {
    const groupA = await db.group.create({ data: { seasonId, name: "Group A" }, select: { id: true } });
    const groupB = await db.group.create({ data: { seasonId, name: "Group B" }, select: { id: true } });
    groupAId = groupA.id;
    groupBId = groupB.id;

    const enrolled = await createTestUser("grp-enrolled", "STUDENT");
    enrolledId = enrolled.id;
    enrolledEmail = enrolled.email;
    await db.studentProfile.create({ data: { userId: enrolledId, activeSeasonId: seasonId } });
    await db.seasonEnrollment.create({ data: { studentUserId: enrolledId, seasonId, status: "ACTIVE" } });

    const inGroupA = await createTestUser("grp-already", "STUDENT");
    inGroupAId = inGroupA.id;
    inGroupAEmail = inGroupA.email;
    await db.studentProfile.create({ data: { userId: inGroupAId, activeSeasonId: seasonId } });
    await db.seasonEnrollment.create({
      data: { studentUserId: inGroupAId, seasonId, groupId: groupAId, status: "ACTIVE" },
    });

    const unenrolled = await createTestUser("grp-outsider", "STUDENT");
    unenrolledEmail = unenrolled.email;
  });

  it("classifies assign / unchanged / no_student / no_group / invalid", async () => {
    const res = await request(app)
      .post(`/api/v1/seasons/${seasonId}/imports/groups/preview`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({
        text: sheet(
          "name\temail\tgroup",
          `Enrolled Student\t${enrolledEmail}\tGroup B`,
          `Already There\t${inGroupAEmail}\tgroup a`,
          `Outsider\t${unenrolledEmail}\tGroup A`,
          `No Group Named\t${enrolledEmail}\tGroup Z`,
          `Blank Group\t${inGroupAEmail}\t`,
          `Bad Email\tnope\tGroup A`,
        ),
      });

    expect(res.status).toBe(200);
    expect(res.body.data.counts).toMatchObject({
      assign: 1,
      unchanged: 1,
      no_student: 1,
      no_group: 2,
      invalid: 1,
      total: 6,
    });
    const assigned = res.body.data.rows.find((r: { status: string }) => r.status === "assign");
    expect(assigned).toMatchObject({ studentUserId: enrolledId, groupId: groupBId });
    // Group names match case-insensitively (spec R64): "group a" found "Group A".
    expect(res.body.data.rows[1]).toMatchObject({ status: "unchanged", groupId: groupAId });
    // A blank cell is no_group, NOT an unassign (spec R69 / D-16.19.4).
    expect(res.body.data.rows[4]).toMatchObject({ status: "no_group" });
    expect(res.body.data.rows[3].message).toMatch(/Group Z/);
  });

  it("resolves the roster through SeasonEnrollment, not the activeSeasonId pointer (ruling C9)", async () => {
    // v1's roster is `StudentProfile.activeSeasonId = seasonId`
    // (groups-query.ts:143-148), so a student holding an ACTIVE enrolment in
    // this season whose pointer happens to name another one is INVISIBLE to
    // the importer (spec R61) — and worse, the write gates on the same
    // pointer and silently skips them (R76/D5).
    const pointerElsewhere = await createTestUser("grp-pointer", "STUDENT");
    await db.studentProfile.create({ data: { userId: pointerElsewhere.id, activeSeasonId: otherSeasonId } });
    await db.seasonEnrollment.create({ data: { studentUserId: pointerElsewhere.id, seasonId, status: "ACTIVE" } });

    const res = await request(app)
      .post(`/api/v1/seasons/${seasonId}/imports/groups/preview`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ text: sheet("email\tgroup", `${pointerElsewhere.email}\tGroup A`) });

    expect(res.body.data.rows[0]).toMatchObject({ status: "assign", groupId: groupAId });
  });

  it("refuses the file when two groups in the season share a name (D-16.19.1 / spec D17)", async () => {
    const clash = await createTestSeason();
    await db.seasonAdmin.create({ data: { seasonId: clash.id, userId: (await db.user.findFirstOrThrow({ where: { email: { startsWith: `${TEST_PREFIX}admin-` } }, select: { id: true } })).id } });
    await db.group.create({ data: { seasonId: clash.id, name: "Group A" } });
    await db.group.create({ data: { seasonId: clash.id, name: "group a" } });

    const fresh = await login(app, (await db.user.findFirstOrThrow({ where: { email: { startsWith: `${TEST_PREFIX}admin-` } }, select: { email: true } })).email);
    const res = await request(app)
      .post(`/api/v1/seasons/${clash.id}/imports/groups/preview`)
      .set("authorization", `Bearer ${fresh}`)
      .send({ text: sheet("email\tgroup", `${enrolledEmail}\tGroup A`) });

    // v1 builds a Map by iteration and lets the LAST duplicate silently win
    // every row (spec R65).
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/more than one group named/i);
  });

  it("refuses an ADMIN of a different season, and a STUDENT (C8 — the row gate)", async () => {
    const outside = await request(app)
      .post(`/api/v1/seasons/${otherSeasonId}/imports/groups/preview`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ text: sheet("email\tgroup", `${enrolledEmail}\tGroup A`) });
    expect(outside.status).toBe(403);

    const student = await request(app)
      .post(`/api/v1/seasons/${seasonId}/imports/groups/preview`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ text: sheet("email\tgroup", `${enrolledEmail}\tGroup A`) });
    expect(student.status).toBe(403);
  });

  it("admits SUPER to any season", async () => {
    const res = await request(app)
      .post(`/api/v1/seasons/${seasonId}/imports/groups/preview`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ text: sheet("email\tgroup", `${enrolledEmail}\tGroup A`) });
    expect(res.status).toBe(200);
  });

  describe("POST /api/v1/seasons/:id/imports/groups/commit", () => {
    it("writes the memberships, sets SeasonEnrollment.groupId, and reports what it ACTUALLY wrote (D5)", async () => {
      const outsider = await db.user.findFirstOrThrow({ where: { email: unenrolledEmail }, select: { id: true } });

      const res = await request(app)
        .post(`/api/v1/seasons/${seasonId}/imports/groups/commit`)
        .set("authorization", `Bearer ${adminToken}`)
        .send({
          assignments: [
            { studentUserId: enrolledId, groupId: groupBId },
            // Not enrolled in this season — must NOT be counted as assigned.
            { studentUserId: outsider.id, groupId: groupBId },
          ],
        });

      expect(res.status).toBe(200);
      // v1 returns the REQUESTED length here (spec R80), so this would read 2.
      expect(res.body.data).toMatchObject({ assigned: 1, skipped: 1, skippedStudentIds: [outsider.id] });

      const enrolment = await db.seasonEnrollment.findUnique({
        where: { studentUserId_seasonId: { studentUserId: enrolledId, seasonId } },
        select: { groupId: true, status: true },
      });
      expect(enrolment).toMatchObject({ groupId: groupBId, status: "ACTIVE" });
      expect(await db.groupStudent.count({ where: { studentUserId: enrolledId, groupId: groupBId } })).toBe(1);
      expect(await db.groupStudent.count({ where: { studentUserId: outsider.id } })).toBe(0);
    });

    it("refuses the WHOLE batch when any group is outside the season (spec R75)", async () => {
      const foreign = await db.group.create({ data: { seasonId: otherSeasonId, name: "Foreign Group" }, select: { id: true } });

      const res = await request(app)
        .post(`/api/v1/seasons/${seasonId}/imports/groups/commit`)
        .set("authorization", `Bearer ${adminToken}`)
        .send({
          assignments: [
            { studentUserId: inGroupAId, groupId: groupBId },
            { studentUserId: enrolledId, groupId: foreign.id },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("group_outside_season");
      // Nothing partial: the first, legal assignment must not have landed.
      const stillA = await db.seasonEnrollment.findUnique({
        where: { studentUserId_seasonId: { studentUserId: inGroupAId, seasonId } },
        select: { groupId: true },
      });
      expect(stillA?.groupId).toBe(groupAId);
    });

    it("takes seasonId from the PATH — preview and commit cannot target different seasons (D-16.20)", async () => {
      const res = await request(app)
        .post(`/api/v1/seasons/${otherSeasonId}/imports/groups/commit`)
        .set("authorization", `Bearer ${adminToken}`)
        .send({ assignments: [{ studentUserId: enrolledId, groupId: groupAId }] });
      // adminToken administers `seasonId`, not `otherSeasonId`.
      expect(res.status).toBe(403);
    });

    it("is idempotent — committing the same assignments twice changes nothing", async () => {
      const body = { assignments: [{ studentUserId: enrolledId, groupId: groupAId }] };
      const first = await request(app)
        .post(`/api/v1/seasons/${seasonId}/imports/groups/commit`)
        .set("authorization", `Bearer ${adminToken}`)
        .send(body);
      const second = await request(app)
        .post(`/api/v1/seasons/${seasonId}/imports/groups/commit`)
        .set("authorization", `Bearer ${adminToken}`)
        .send(body);

      expect(first.body.data.assigned).toBe(1);
      expect(second.body.data.assigned).toBe(1);
      expect(await db.groupStudent.count({ where: { studentUserId: enrolledId } })).toBe(1);
    });
  });
});
```

- [ ] **Step 2: Consume Plan 6's bulk write — do not create one**

Plan 6 (season admin screens, earlier in the execution order) ships
`assignStudentsToGroups(tx, seasonId, assignments)` and `GroupOutsideSeasonError`
in `apps/backend/src/lib/queries/groups.ts`, behind its
`PUT /api/v1/seasons/:id/group-assignments`. The group-import commit calls that
same function — one home for group-membership writes, so the roster grid and
the importer cannot disagree.

```bash
grep -n "export async function assignStudentsToGroups\|export class GroupOutsideSeasonError" \
  apps/backend/src/lib/queries/groups.ts
```

Expect both. If either is missing, Plan 6 has not landed — stop and report;
do not write a second copy here. The contract this task relies on, pinned by the
Step 1 commit tests (they fail against an implementation that drifts):

- signature `assignStudentsToGroups(tx: Prisma.TransactionClient, seasonId: number,
  assignments: { studentUserId: number; groupId: number }[]):
  Promise<{ assigned: number; skippedStudentIds: number[] }>`;
- throws `GroupOutsideSeasonError` — refusing the **whole** batch — when any
  `groupId` is not in `seasonId` (spec R75; "refuses the WHOLE batch");
- eligibility is an **ACTIVE** `SeasonEnrollment` in this season held by a
  live STUDENT, not `StudentProfile.activeSeasonId` (ruling C9; v1's pointer
  gate is what produced spec D5's silent skips) — "writes the memberships…",
  "skips a WITHDRAWN enrolment";
- it returns what it **applied**, not the requested length (spec R80/D5) —
  "reports what it ACTUALLY wrote";
- it writes both `GroupStudent` (delete-then-create, because
  `GroupStudent.studentUserId` is `@unique` standalone — Plan 18 item) and
  `SeasonEnrollment.groupId`.

If Plan 6's function admits a non-ACTIVE enrolment, the WITHDRAWN test below
fails: fix it **in Plan 6's function** (one `status: "ACTIVE"` in its
enrolment lookup), so the roster grid gets the same rule.

Add the WITHDRAWN case to the commit describe in Step 1:

```ts
    it("skips a WITHDRAWN enrolment — only ACTIVE students are placed (C9)", async () => {
      const gone = await createTestUser("grp-withdrawn", "STUDENT");
      await db.seasonEnrollment.create({
        data: { studentUserId: gone.id, seasonId, status: "WITHDRAWN" },
      });

      const res = await request(app)
        .post(`/api/v1/seasons/${seasonId}/imports/groups/commit`)
        .set("authorization", `Bearer ${adminToken}`)
        .send({ assignments: [{ studentUserId: gone.id, groupId: groupAId }] });

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ assigned: 0, skippedStudentIds: [gone.id] });
      expect(await db.groupStudent.count({ where: { studentUserId: gone.id } })).toBe(0);
    });
```

and to the preview describe:

```ts
  it("classifies a WITHDRAWN student no_student, not assign", async () => {
    const gone = await createTestUser("grp-withdrawn-preview", "STUDENT");
    await db.seasonEnrollment.create({
      data: { studentUserId: gone.id, seasonId, status: "WITHDRAWN" },
    });
    const res = await request(app)
      .post(`/api/v1/seasons/${seasonId}/imports/groups/preview`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ text: sheet("email\tgroup", `${gone.email}\tGroup A`) });
    expect(res.status).toBe(200);
    expect(res.body.data.rows[0].status).toBe("no_student");
  });
```

- [ ] **Step 3: Write `lib/imports/groups.ts`**

> **v1 parity 2026-10-09:** Build `groupByName` as `Map<string, number[]>` (all ids per trimmed, lower-cased name) and do **not** throw (v2 `apps/backend/src/lib/imports/groups.ts:93-102`); at the row: no match → v1's `no_group` "No group named …"; more than one id → `no_group` with the D-16.19.1 message and no `groupId`; exactly one → v1's unchanged / assign logic (R65 whole-file refusal removed; ambiguous-row refusal replaces Plan 18 M2).

```ts
// apps/backend/src/lib/imports/groups.ts
import {
  IMPORT_EMAIL_HEADERS,
  IMPORT_GROUP_HEADERS,
  IMPORT_NAME_HEADERS,
  // Value import — relative path is mandatory (CLAUDE.md's rootDir emit trap).
} from "../../../../../packages/shared/src/index";
import type { GroupImportPreview } from "@space/shared";
import { z } from "zod";

import { db } from "../../db/client";
import { ImportParseError, type ParsedSheet } from "./delimited";
import { normaliseEmail } from "./students";

const emailSchema = z.string().trim().email();

interface HeaderMap {
  nameCol: number;
  emailCol: number;
  groupCol: number;
}

function mapGroupHeaders(header: string[]): HeaderMap {
  let nameCol = -1;
  let emailCol = -1;
  let groupCol = -1;

  header.forEach((raw, col) => {
    const key = raw.trim().toLowerCase();
    if (key === "") return;
    if ((IMPORT_NAME_HEADERS as readonly string[]).includes(key)) {
      if (nameCol === -1) nameCol = col;
    } else if ((IMPORT_EMAIL_HEADERS as readonly string[]).includes(key)) {
      if (emailCol === -1) emailCol = col;
    } else if ((IMPORT_GROUP_HEADERS as readonly string[]).includes(key)) {
      if (groupCol === -1) groupCol = col;
    }
  });

  if (emailCol === -1 || groupCol === -1) {
    throw new ImportParseError(
      'The first line must be a header row with "email" and "group" columns.',
    );
  }
  return { nameCol, emailCol, groupCol };
}

/**
 * Classify each pasted row against the season's roster and its groups.
 *
 * Order is invalid → no_student → no_group (blank) → no_group (unknown) →
 * unchanged → assign (spec R58). Two lookups, run in parallel, both bounded
 * by the season rather than by the paste — a 400-student season loads 400
 * rows to classify a 12-row paste, which is v1's cost too and is fine at this
 * scale.
 *
 * `name` is read for display only: never written, never validated (R56).
 */
export async function buildGroupImportPreview(
  sheet: ParsedSheet,
  seasonId: number,
): Promise<GroupImportPreview> {
  const map = mapGroupHeaders(sheet.header);

  const [enrolments, groups] = await Promise.all([
    // Ruling C9: "is this student in this season" resolves through
    // SeasonEnrollment. v1 asks StudentProfile.activeSeasonId
    // (groups-query.ts:143-148), so a student with an ACTIVE enrolment whose
    // pointer names another season is invisible here — and the write gates on
    // the same pointer and silently drops them (spec R61/R76).
    // ACTIVE only — the same population the commit (Plan 6's
    // assignStudentsToGroups) accepts, so a row that previews `assign` is a
    // row that gets written. A WITHDRAWN/COMPLETED enrolment is `no_student`.
    db.seasonEnrollment.findMany({
      where: { seasonId, status: "ACTIVE", studentUser: { role: "STUDENT", deletedAt: null } },
      select: { studentUserId: true, groupId: true, studentUser: { select: { email: true } } },
    }),
    db.group.findMany({ where: { seasonId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const studentByEmail = new Map(
    enrolments.map((e) => [
      normaliseEmail(e.studentUser.email),
      { userId: e.studentUserId, groupId: e.groupId },
    ]),
  );

  // D-16.19.1 / spec D17: Group.name has no uniqueness constraint of any kind
  // (schema.prisma:297-311). v1 builds this Map by iteration, so when two
  // groups' names are case-insensitively equal the LAST one silently wins
  // every row (R65). Refuse the file instead of guessing; the constraint that
  // would prevent the situation is a migration → Plan 18.
  const groupByName = new Map<string, number>();
  for (const g of groups) {
    const key = g.name.trim().toLowerCase();
    if (groupByName.has(key)) {
      throw new ImportParseError(
        `This season has more than one group named "${g.name.trim()}". Rename one of them, then import again.`,
      );
    }
    groupByName.set(key, g.id);
  }

  const rows: GroupImportPreview["rows"] = [];

  for (const parsedRow of sheet.rows) {
    const at = (col: number): string => (col >= 0 ? (parsedRow.cells[col] ?? "").trim() : "");
    const name = at(map.nameCol);
    const email = at(map.emailCol);
    const group = at(map.groupCol);
    const base = { rowNumber: parsedRow.rowNumber, name, email, group, studentUserId: null, groupId: null };

    // Unlike the student importer (R20), a row carrying only a name is
    // skipped: it addresses nobody and names no group (R57). The parser has
    // already dropped fully blank lines.
    if (!email && !group) continue;

    if (!emailSchema.safeParse(email).success) {
      rows.push({ ...base, status: "invalid", message: "Email is not valid." });
      continue;
    }
    const student = studentByEmail.get(normaliseEmail(email));
    if (!student) {
      rows.push({ ...base, status: "no_student", message: "No student with this email in this season." });
      continue;
    }
    if (!group) {
      // A blank cell is NOT an unassign (spec R69 / D-16.19.4): an
      // accidentally empty column must never be able to wipe a season's
      // groupings. The reserved-literal design for a real bulk unassign is
      // recorded in D-16.19.
      rows.push({ ...base, status: "no_group", message: "No group specified.", studentUserId: student.userId });
      continue;
    }
    const groupId = groupByName.get(group.toLowerCase());
    if (groupId === undefined) {
      rows.push({
        ...base,
        status: "no_group",
        message: `No group named "${group}" in this season.`,
        studentUserId: student.userId,
      });
      continue;
    }
    if (student.groupId === groupId) {
      rows.push({
        ...base,
        status: "unchanged",
        message: "Already in this group.",
        studentUserId: student.userId,
        groupId,
      });
      continue;
    }
    rows.push({ ...base, status: "assign", message: null, studentUserId: student.userId, groupId });
  }

  const counts = { assign: 0, unchanged: 0, no_student: 0, no_group: 0, invalid: 0, total: rows.length };
  for (const row of rows) counts[row.status] += 1;

  return { rows, delimiter: sheet.delimiter, counts };
}
```

- [ ] **Step 4: Fill in `seasonImportsRouter` in `routes/imports.ts`**

> **v1 parity 2026-10-09:** No `previewLimiter`/`commitLimiter` on the two group routes (v2 `apps/backend/src/routes/imports.ts:244`, `:268`, R84).

```ts
/**
 * `seasonId` comes from the PATH and nowhere else (D-16.20). v1 takes it as an
 * argument on both the preview and the commit
 * (`jpc-space/src/lib/group-import-actions.ts:20,59`), so the two calls could
 * in principle target different seasons.
 *
 * Returns the season id on success, or null having already answered.
 */
async function resolveAdministeredSeason(
  req: Parameters<typeof requireUser>[0],
  res: Parameters<typeof apiError>[0],
): Promise<number | null> {
  const user = requireUser(req);
  const seasonId = parseId((req.params as { id?: string }).id);
  if (seasonId === null) {
    apiError(res, "bad_request", "Invalid season id.", 400);
    return null;
  }
  // Claims-only, per rbac.ts — and paired with the role that may hold the
  // claim (ruling C7), so a stray SeasonAdmin row naming a student grants
  // nothing. SUPER short-circuits inside isAdminOfSeason.
  if (!isAdminOfSeason(user, seasonId)) {
    apiError(res, "forbidden", "You don't have access to this.", 403);
    return null;
  }
  const season = await db.season.findFirst({
    where: { id: seasonId, deletedAt: null },
    select: { id: true },
  });
  if (!season) {
    apiError(res, "not_found", "Season not found.", 404);
    return null;
  }
  return season.id;
}

// requireAuth per route — /api/v1/seasons is a shared prefix (ruling X5).
seasonImportsRouter.post(
  "/:id/imports/groups/preview",
  requireAuth,
  previewLimiter,
  importJsonParser,
  async (req, res) => {
  const seasonId = await resolveAdministeredSeason(req, res);
  if (seasonId === null) return;

  const parsed = pastedSheetInputSchema.safeParse(req.body);
  if (!parsed.success) {
    return apiError(res, "bad_request", "Paste a header row and at least one data row.", 400);
  }

  try {
    const sheet = parseDelimited(parsed.data.text, parsed.data.delimiter, IMPORT_MAX_ROWS);
    return apiOk(res, await buildGroupImportPreview(sheet, seasonId));
  } catch (err) {
    if (err instanceof ImportParseError) return apiError(res, "bad_request", err.message, 400);
    throw err;
  }
});

seasonImportsRouter.post(
  "/:id/imports/groups/commit",
  requireAuth,
  commitLimiter,
  importJsonParser,
  async (req, res) => {
  const seasonId = await resolveAdministeredSeason(req, res);
  if (seasonId === null) return;

  const parsed = groupImportCommitInputSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid import request.", 400);

  try {
    // v1's group import is already transactional (spec R79) and stays that
    // way. The write independently re-derives every scope it needs — every
    // group must belong to this season, every student must hold an enrolment
    // in it — which is why posting resolved ids is safe here in a way it is
    // not for the student importer (spec §4).
    const result = await db.$transaction(
      (tx) => assignStudentsToGroups(tx, seasonId, parsed.data.assignments),
      { timeout: 30_000 },
    );
    return apiOk(res, {
      assigned: result.assigned,
      skipped: result.skippedStudentIds.length,
      skippedStudentIds: result.skippedStudentIds,
    });
  } catch (err) {
    if (err instanceof GroupOutsideSeasonError) {
      return apiError(res, "group_outside_season", err.message, 400);
    }
    throw err;
  }
});
```

Extend the route file's imports with `parseId` from `../lib/parse-id`,
`isAdminOfSeason` from `../lib/rbac`, `buildGroupImportPreview` from
`../lib/imports/groups`, and `assignStudentsToGroups` /
`GroupOutsideSeasonError` from `../lib/queries/groups`; add
`groupImportCommitInputSchema` to the relative shared value import.

- [ ] **Step 5: Hand back the OpenAPI fragment (coordinator applies)**

Add both season-scoped paths. The description must state:

- `isAdminOfSeason` from the **path** id, so preview and commit cannot target
  different seasons; SUPER short-circuits.
- The five row statuses, and that a **blank** group cell is `no_group` and not
  an unassign — there is no bulk unassign.
- That the roster is resolved through `SeasonEnrollment` (ruling C9), not the
  `activeSeasonId` pointer, and that this is why a previewed `assign` is
  always written.
- That the file is **refused** when two groups in the season share a
  case-insensitive name (`400 bad_request`) rather than one silently winning.
- That `assigned` is the number **written** and `skippedStudentIds` names the
  rest — the deliberate correction of v1 reporting the requested count.
- `400 group_outside_season` refuses the whole batch.

- [ ] **Step 6: Verification**

Agent A: `pnpm turbo lint typecheck test:unit --filter=@space/backend`

Coordinator, after merge:
```bash
cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern imports
cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern groups
```
The second is the regression gate on domain 5 and Plan 6: the importer calls
Plan 6's `assignStudentsToGroups`, and any contract fix Step 2 required there
(e.g. ACTIVE-only) must not have broken the roster grid's own suite. Also run
`--testPathPattern roster` (Plan 6's group-assignments suite).

- [ ] **Step 7: Commit**

```bash
git add apps/backend && git commit -m "feat(backend): group-assignment import with enrolment-resolved roster and a true applied count"
```

---

### Task 6: Mobile — the three-step import screen *(Step 0 coordinator, Steps 1–7 Agent B)*

**Files:**
- Verify only (no move): `apps/mobile/app/(app)/users/index.tsx` and `"users"` in `DIRECTORY_ROUTE_HREFS` — **Plan 10 Task 9 already did the conversion** *(coordinator)*
- Modify: `apps/mobile/app/(app)/users/index.tsx` — Plan 9's real users screen (moved by Plan 10, which also added its bulk-invite card) gains an "Import students" action *(coordinator)*
- Modify: `apps/mobile/app/(app)/_layout.tsx` *(coordinator)*
- Modify: `apps/mobile/src/__tests__/users-screen.test.tsx` (Plan 9's, at the import path Plan 10 set; the new action only), `app-layout.test.tsx` *(coordinator)*
- Create: `apps/mobile/app/(app)/users/import.tsx` *(Agent B)*
- Create: `apps/mobile/src/hooks/use-import.ts` *(Agent B)*
- Create: `apps/mobile/src/components/ImportRowCard.tsx` *(Agent B)*
- Modify: `apps/mobile/src/lib/query-keys.ts` *(Agent B)*
- Test: `apps/mobile/src/__tests__/student-import.test.tsx` *(Agent B)*

**Interfaces:**
- Consumes: `studentImportPreviewSchema`, `studentImportResultSchema`, `importTemplateSchema`, `IMPORT_MAX_PASTE_CHARS`, `IMPORT_MAX_ROWS` and their types from `@space/shared`; Plan 4's `useSeasons(enabled)` from `src/hooks/use-seasons.ts` (the season picker — no second seasons fetch); `apiClient`; `useSessionStore`; `renderWithProviders`; the `ui` primitives (`Screen`, `Card`, `Text`, `Button`, `Input`, `LoadingState`, `ErrorState`, `EmptyState`).
- Produces: `queryKeys.imports.all/template()`; `useImportTemplate()`, `useStudentImportPreview()`, `useStudentImportCommit()` in `src/hooks/use-import.ts`; `<ImportRowCard row />`; the route `/users/import`.

- [ ] **Step 0 (coordinator): make the route exist, on the post-Plan-10 tree**

By now Plan 9 has replaced the `/users` placeholder with the real users screen,
Plan 1 Task 0 made the layout tests derive their counts (ruling X9), Plan 6
Task 5 turned `routeNameForHref`'s hard-coded `students` branch into the
`DIRECTORY_ROUTE_HREFS` set (adding `"seasons"` for `seasons/[code]/…`), and
**Plan 10 Task 9 has already done the `users/` directory conversion** for
`/users/new` (execution order … 9 → 10 → … → 17). Items 1–2 are therefore
**verification only** — never move the file or edit the set here.

1. Verify the move: `ls "apps/mobile/app/(app)/users/index.tsx" "apps/mobile/app/(app)/users/new.tsx"`
   → both exist, and `ls "apps/mobile/app/(app)/users.tsx"` → no such file.
   `users-screen.test.tsx` already imports `"../../app/(app)/users/index"`.
   If `users/index.tsx` is missing, stop — Plan 10 has not run.
2. Verify the set in `apps/mobile/app/(app)/_layout.tsx` is exactly Plan 10's:

```ts
const DIRECTORY_ROUTE_HREFS = new Set(["students", "seasons", "users"]);

export function routeNameForHref(href: string): string {
  const path = href.slice(1);
  return DIRECTORY_ROUTE_HREFS.has(path) ? `${path}/index` : path;
}
```

   `grep -n 'DIRECTORY_ROUTE_HREFS = new Set' "apps/mobile/app/(app)/_layout.tsx"`
   → one hit containing `"students"`, `"seasons"` and `"users"`. Plan 10's
   `app-layout.test.tsx` case "maps /users to its directory index and hides
   users/new (Plan 10)" already pins all three mappings. Dropping `"seasons"`
   would hide the SUPER Seasons tab, so do not "simplify" the set.
3. Append `"users/import"` to the exported `DETAIL_ROUTE_NAMES` (Plan 1).
   **Without the declaration, `Tabs` auto-registers the file and the import
   screen appears in the tab bar for every role.** `app-layout.test.tsx`
   derives its hidden-route expectations from that exported constant (X9), so
   no count is edited; add one explicit assertion in its existing style:

```tsx
it("declares users/import hidden from the tab bar", () => {
  expect(DETAIL_ROUTE_NAMES).toContain("users/import");
});
```

4. **The way in.** In `users/index.tsx`, above the search `Input` (inside the
   SUPER branch — the non-SUPER guard returns earlier), add:

```tsx
        {/* Spec 16 §9: the importer is reached from its parent list's header
            action, as in v1 (super/users/page.tsx:59). */}
        <Button
          title="Import students"
          variant="secondary"
          onPress={() => router.push("/users/import")}
        />
```

   using the `const router = useRouter();` that Plan 10 Task 9 already added
   near the top of `UsersScreen` — do not declare a second `router`. Place it beside Plan 10's `PendingInvitesCard`
   — the import button and the bulk-invite card are the two header actions
   (spec 16 R55: the import itself sends no invites). Append to
   `users-screen.test.tsx`:

```tsx
it("offers SUPER a way into the importer", async () => {
  useSessionStore.setState(superSession);
  get.mockResolvedValue({ data: { data: { users: [], nextCursor: null } } });
  renderWithProviders(<UsersScreen />);
  fireEvent.press(await screen.findByText("Import students"));
  expect(mockPush).toHaveBeenCalledWith("/users/import");
});
```

   (Use the file's existing list-response shape for the mock if it differs.)

5. `pnpm turbo routes:generate --filter=@space/mobile` then
   `pnpm turbo typecheck --filter=@space/mobile`. Typed routes are generated,
   not written — without regenerating, `Href` degrades to `string`, and
   `router.push("/users/import")` would compile against nothing.

- [ ] **Step 1: Write the failing screen test**

> **v1 parity 2026-10-09:** Change the screen-test expectations: no unrecognised-column warning (R18); no `previously_removed` row style (R22); no enrol control or enrol confirmation, and the commit body has no `onExisting` (R44); the result step lists `failed` rows with their messages and shows the `failed` tally, no `enrolled` (R42, R54); the client-side size refusal fires above `IMPORT_MAX_PASTE_CHARS` (now 5 MB, R4).

```tsx
// apps/mobile/src/__tests__/student-import.test.tsx
import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
}));
const mockBack = jest.fn();
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack, push: mockPush }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";

import ImportScreen from "../../app/(app)/users/import";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;

const emptyScopes = {
  seasonAdminIds: [] as number[],
  groupLeaderIds: [] as number[],
  activeSeasonId: null as number | null,
  graduationYear: null as number | null,
};
const superSession = {
  user: { id: 1, name: "Test super", email: "sup@jpc.test", role: "SUPER" as const, avatarPath: null, hasPassword: true },
  scopes: emptyScopes,
};
const adminSession = {
  user: { id: 2, name: "Test admin", email: "adm@jpc.test", role: "ADMIN" as const, avatarPath: null, hasPassword: true },
  scopes: emptyScopes,
};

const template = {
  data: {
    data: {
      columns: [
        { label: "Name", acceptedHeaders: ["name", "student"], required: true, maxLength: 120, target: "User.name", note: null },
        { label: "Email", acceptedHeaders: ["email", "e-mail"], required: true, maxLength: null, target: "User.email", note: null },
      ],
      headerRow: "name\temail",
      maxRows: 2000,
      maxPasteChars: 262144,
      capabilities: { pasteText: true, fileUpload: false },
    },
  },
};

// Plan 4's useSeasons parses every row with Plan 3's full seasonListItemSchema.
const seasons = {
  data: {
    data: {
      seasons: [
        {
          id: 7,
          code: "s-7",
          title: "Spring 2099",
          program: "GBV",
          year: 2099,
          status: "ACTIVE",
          startDate: "2099-01-01T00:00:00.000Z",
          endDate: "2099-06-30T00:00:00.000Z",
        },
      ],
    },
  },
};

const previewBody = (overrides: Record<string, unknown> = {}) => ({
  data: {
    data: {
      rows: [
        { rowNumber: 2, name: "Fresh Student", email: "fresh@jpc.test", status: "new", message: null, values: { name: "Fresh Student", email: "fresh@jpc.test", university: null, year: null, phone: null, dateOfBirth: null, spiritualBackground: null, gifts: null, notes: null } },
        { rowNumber: 3, name: "Bad Row", email: "nope", status: "invalid", message: "Email is not valid.", values: { name: "Bad Row", email: "nope", university: null, year: null, phone: null, dateOfBirth: null, spiritualBackground: null, gifts: null, notes: null } },
      ],
      detectedColumns: ["Name", "Email"],
      unrecognisedColumns: ["Phone No"],
      delimiter: "tab",
      counts: { new: 1, exists: 0, duplicate: 0, invalid: 1, previously_removed: 0, total: 2 },
      ...overrides,
    },
  },
});

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  get.mockImplementation((url: string) =>
    url.includes("/template") ? Promise.resolve(template) : Promise.resolve(seasons),
  );
});

describe("ImportScreen — step 1, paste", () => {
  it("shows the role gate for a non-SUPER caller and never calls the API", async () => {
    useSessionStore.setState(adminSession);
    renderWithProviders(<ImportScreen />);

    expect(await screen.findByText(/isn't available for your role/)).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  });

  it("says plainly that file upload is unavailable, rather than just omitting a picker (D-16.3)", async () => {
    useSessionStore.setState(superSession);
    renderWithProviders(<ImportScreen />);

    expect(await screen.findByText(/file upload arrives with the CMS/i)).toBeTruthy();
  });

  it("renders the recognised columns from the template, including the \"student\" alias", async () => {
    useSessionStore.setState(superSession);
    renderWithProviders(<ImportScreen />);

    expect(await screen.findByText(/name, student/i)).toBeTruthy();
  });

  it("refuses an over-long paste locally, without spending a request", async () => {
    useSessionStore.setState(superSession);
    renderWithProviders(<ImportScreen />);

    const field = await screen.findByLabelText("Paste your spreadsheet");
    fireEvent.changeText(field, "x".repeat(262145));
    fireEvent.press(screen.getByText("Preview"));

    expect(await screen.findByText(/too long/i)).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
  });

  it("posts the paste and moves to the preview step", async () => {
    useSessionStore.setState(superSession);
    post.mockResolvedValue(previewBody());
    renderWithProviders(<ImportScreen />);

    fireEvent.changeText(await screen.findByLabelText("Paste your spreadsheet"), "name\temail\nA\ta@jpc.test");
    fireEvent.press(screen.getByText("Preview"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/imports/students/preview", {
        text: "name\temail\nA\ta@jpc.test",
        delimiter: "auto",
      }),
    );
    expect(await screen.findByText("1 new")).toBeTruthy();
  });
});

describe("ImportScreen — step 1, the season picker", () => {
  it("lists the seasons from Plan 4's useSeasons and keeps Import disabled until one is chosen", async () => {
    useSessionStore.setState(superSession);
    post.mockResolvedValue(previewBody());
    renderWithProviders(<ImportScreen />);

    expect(await screen.findByLabelText("Target season: Spring 2099")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/seasons");

    fireEvent.changeText(screen.getByLabelText("Paste your spreadsheet"), "name\temail\nA\ta@jpc.test");
    fireEvent.press(screen.getByText("Preview"));
    await screen.findByText("1 new");

    // No season chosen: the commit is refused client-side (it would 400), and
    // the screen says why instead of sending `seasonId: null`.
    expect(screen.getByText("Choose a season before importing")).toBeTruthy();
    fireEvent.press(screen.getByText("Choose a season before importing"));
    expect(post).toHaveBeenCalledTimes(1);
  });
});

describe("ImportScreen — step 2, preview", () => {
  async function reachPreview(body = previewBody()) {
    useSessionStore.setState(superSession);
    post.mockResolvedValue(body);
    renderWithProviders(<ImportScreen />);
    fireEvent.press(await screen.findByLabelText("Target season: Spring 2099"));
    fireEvent.changeText(screen.getByLabelText("Paste your spreadsheet"), "name\temail\nA\ta@jpc.test");
    fireEvent.press(screen.getByText("Preview"));
    await screen.findByText(/\d+ new · /);
  }

  it("defaults the filter to the rows that need attention, not to everything", async () => {
    // A 2000-row list on a 375px screen is unusable; the operator will not
    // scroll to find row 1841 (spec §10c).
    await reachPreview();
    expect(screen.getByText("Bad Row")).toBeTruthy();
    expect(screen.queryByText("Fresh Student")).toBeNull();

    fireEvent.press(screen.getByText("All"));
    expect(await screen.findByText("Fresh Student")).toBeTruthy();
  });

  it("warns about a column it did not recognise (D-16.12)", async () => {
    await reachPreview();
    expect(screen.getByText(/Phone No/)).toBeTruthy();
    expect(screen.getByText(/not recognised/i)).toBeTruthy();
  });

  it("commits only the importable rows, sending values and no status (D-16.4)", async () => {
    await reachPreview();
    post.mockResolvedValue({ data: { data: { created: 1, skipped: 0, enrolled: 0, rows: [{ rowNumber: 2, name: "Fresh Student", email: "fresh@jpc.test", outcome: "created", message: null, userId: 55 }] } } });

    fireEvent.press(screen.getByText("Import 1 student"));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    const [url, body] = post.mock.calls[1];
    expect(url).toBe("/api/v1/imports/students/commit");
    expect(body).toMatchObject({ mode: "season", seasonId: 7, onExisting: "skip" });
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0]).toEqual({ rowNumber: 2, values: expect.objectContaining({ email: "fresh@jpc.test" }) });
    expect("status" in body.rows[0]).toBe(false);
  });

  it("requires an explicit confirmation before sending onExisting=enroll, and then SENDS the existing rows (D-16.7)", async () => {
    const existingRow = {
      rowNumber: 4,
      name: "Returning Student",
      email: "back@jpc.test",
      status: "exists",
      message: "Already in the system.",
      values: { name: "Returning Student", email: "back@jpc.test", university: null, year: null, phone: null, dateOfBirth: null, spiritualBackground: null, gifts: null, notes: null },
    };
    const base = previewBody().data.data;
    await reachPreview({
      data: {
        data: {
          ...base,
          rows: [...base.rows, existingRow],
          counts: { ...base.counts, exists: 1, total: 3 },
        },
      },
    });
    fireEvent.press(screen.getByText("Also enrol people already in the system"));

    // The control alone must not arm it — enrol changes existing records.
    expect(await screen.findByText(/will also enrol/i)).toBeTruthy();
    // Unconfirmed: the button still counts only the new row.
    expect(screen.getByText("Import 1 student")).toBeTruthy();
    fireEvent.press(screen.getByText("Yes, enrol them too"));

    post.mockResolvedValue({ data: { data: { created: 1, skipped: 0, enrolled: 1, rows: [] } } });
    // Confirmed: the existing row is now part of the commit — without it,
    // `enroll` reaches the server with nothing to enrol (D-16.7's whole point).
    fireEvent.press(screen.getByText("Import 1 student, enrol 1"));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    const body = post.mock.calls[1][1];
    expect(body.onExisting).toBe("enroll");
    expect(body.rows.map((r: { rowNumber: number }) => r.rowNumber).sort()).toEqual([2, 4]);
  });

  it("keeps the paste when the operator goes back, so a fix does not start over", async () => {
    await reachPreview();
    fireEvent.press(screen.getByText("Back"));

    const field = await screen.findByLabelText("Paste your spreadsheet");
    expect(field.props.value).toBe("name\temail\nA\ta@jpc.test");
  });

  it("surfaces the server's parse message verbatim when the paste is unreadable", async () => {
    useSessionStore.setState(superSession);
    post.mockRejectedValue({
      response: { data: { error: { code: "bad_request", message: 'There is an unclosed " in that paste. Remove or double it, then paste again.' } } },
    });
    renderWithProviders(<ImportScreen />);
    fireEvent.changeText(await screen.findByLabelText("Paste your spreadsheet"), 'name\nA,"oops');
    fireEvent.press(screen.getByText("Preview"));

    expect(await screen.findByText(/unclosed/)).toBeTruthy();
  });
});

describe("ImportScreen — step 3, result", () => {
  it("reports the counts and says plainly that no invites were sent (spec R55)", async () => {
    useSessionStore.setState(superSession);
    post
      .mockResolvedValueOnce(previewBody())
      .mockResolvedValueOnce({ data: { data: { created: 1, skipped: 1, enrolled: 0, rows: [
        { rowNumber: 2, name: "Fresh Student", email: "fresh@jpc.test", outcome: "created", message: null, userId: 55 },
        { rowNumber: 4, name: "Old Student", email: "old@jpc.test", outcome: "skipped", message: "Already in the system.", userId: 12 },
      ] } } });

    renderWithProviders(<ImportScreen />);
    fireEvent.press(await screen.findByLabelText("Target season: Spring 2099"));
    fireEvent.changeText(screen.getByLabelText("Paste your spreadsheet"), "name\temail\nA\ta@jpc.test");
    fireEvent.press(screen.getByText("Preview"));
    await screen.findByText("1 new");
    fireEvent.press(screen.getByText("Import 1 student"));

    expect(await screen.findByText(/1 created/)).toBeTruthy();
    expect(screen.getByText(/no invites were sent/i)).toBeTruthy();
    // The non-created rows are listed by ROW NUMBER — a report you cannot map
    // back to the sheet is not a report (spec §8).
    expect(screen.getByText(/Row 4/)).toBeTruthy();
    expect(screen.getByText(/Already in the system/)).toBeTruthy();
  });

  it("says re-running the same paste is safe", async () => {
    // Idempotence is worthless to an operator who does not know about it —
    // the exact gap spec D13 names.
    useSessionStore.setState(superSession);
    post
      .mockResolvedValueOnce(previewBody())
      .mockResolvedValueOnce({ data: { data: { created: 1, skipped: 0, enrolled: 0, rows: [] } } });

    renderWithProviders(<ImportScreen />);
    fireEvent.press(await screen.findByLabelText("Target season: Spring 2099"));
    fireEvent.changeText(screen.getByLabelText("Paste your spreadsheet"), "name\temail\nA\ta@jpc.test");
    fireEvent.press(screen.getByText("Preview"));
    await screen.findByText("1 new");
    fireEvent.press(screen.getByText("Import 1 student"));

    expect(await screen.findByText(/safe to run the same paste again/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd apps/mobile && pnpm jest src/__tests__/student-import.test.tsx`
Expected: FAIL — `Cannot find module '../../app/(app)/users/import'`. If it
instead fails with "No safe area value available", `renderWithProviders` was
not used; a bare `SafeAreaProvider` renders no children while `render()` still
returns a truthy tree, so assertions would pass against nothing.

- [ ] **Step 3: Add the query-key factory**

In `apps/mobile/src/lib/query-keys.ts`, add a sibling to `sessions`:

```ts
  imports: {
    all: ["imports"] as const,
    /**
     * The only cached import query. Preview and commit are MUTATIONS, not
     * queries, on purpose (D-16.18): a preview is a 2000-row roster with
     * phone numbers, birth dates and pastoral notes, and it must not outlive
     * the screen in a query cache — nor be refetched on window focus, which
     * would silently re-run a classification the operator is mid-way through
     * reading.
     */
    template: () => [...queryKeys.imports.all, "template"] as const,
  },
```

- [ ] **Step 4: Write the hooks**

> **v1 parity 2026-10-09:** `useCommitStudentImport` posts `{ rows, target }` with no `onExisting` and parses the `created/skipped/failed` result (R44, R54).

```ts
// apps/mobile/src/hooks/use-import.ts
import { useMutation, useQuery, type UseMutationResult, type UseQueryResult } from "@tanstack/react-query";
import {
  importTemplateSchema,
  studentImportPreviewSchema,
  studentImportResultSchema,
  type ImportTemplate,
  type StudentImportCommitInput,
  type StudentImportPreview,
  type StudentImportResult,
} from "@space/shared";

import { apiClient } from "../lib/api-client";
import { queryKeys } from "../lib/query-keys";

/** The column schema, so the paste step can explain itself without guessing. */
export function useImportTemplate(enabled: boolean): UseQueryResult<ImportTemplate> {
  return useQuery({
    queryKey: queryKeys.imports.template(),
    queryFn: async () => {
      const res = await apiClient.get("/api/v1/imports/students/template");
      // Parse, don't cast — a backend drift fails here, at the boundary,
      // rather than downstream in a render.
      return importTemplateSchema.parse(res.data.data);
    },
    enabled,
    staleTime: Infinity, // it is a constant on the server
  });
}

/**
 * A mutation rather than a query, deliberately. React Query refetches a query
 * on mount, on window focus and on reconnect; re-classifying a paste behind
 * the operator's back while they read the preview would be surprising, and
 * caching it would keep a roster's personal data alive after the screen is
 * gone (D-16.18).
 */
export function useStudentImportPreview(): UseMutationResult<
  StudentImportPreview,
  unknown,
  { text: string; delimiter: "auto" | "comma" | "tab" }
> {
  return useMutation({
    mutationFn: async (input) => {
      const res = await apiClient.post("/api/v1/imports/students/preview", input);
      return studentImportPreviewSchema.parse(res.data.data);
    },
  });
}

export function useStudentImportCommit(): UseMutationResult<
  StudentImportResult,
  unknown,
  StudentImportCommitInput
> {
  return useMutation({
    mutationFn: async (input) => {
      const res = await apiClient.post("/api/v1/imports/students/commit", input);
      return studentImportResultSchema.parse(res.data.data);
    },
  });
}
```

- [ ] **Step 5: Write the row card**

> **v1 parity 2026-10-09:** The row card handles four statuses (`new`, `exists`, `duplicate`, `invalid`) — no `previously_removed` (R22).

```tsx
// apps/mobile/src/components/ImportRowCard.tsx
import { View } from "react-native";
import type { ImportRowStatus, StudentImportPreview } from "@space/shared";

import { useTheme } from "../theme";
import { Card, Text } from "../ui";

type PreviewRow = StudentImportPreview["rows"][number];

const STATUS_LABEL: Record<ImportRowStatus, string> = {
  new: "New",
  exists: "Skip · already here",
  duplicate: "Skip · repeated",
  invalid: "Invalid",
  previously_removed: "Skip · removed",
};

/**
 * One row, one card. v1 renders a four-column DataTable
 * (`student-import-form.tsx:148-164`); that does not fit 375px and must not be
 * ported (spec §10c). The counts card above the list carries the meaning the
 * table was carrying by adjacency.
 */
export function ImportRowCard({ row }: { row: PreviewRow }) {
  const theme = useTheme();
  const tone =
    row.status === "new"
      ? theme.colors.success[600]
      : row.status === "invalid"
        ? theme.colors.error[600]
        : theme.colors.neutral[600];

  return (
    <Card style={{ marginBottom: theme.spacing.sm }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: theme.spacing.sm }}>
        <Text variant="heading">{row.name || "—"}</Text>
        <Text variant="label" color={tone}>
          {STATUS_LABEL[row.status]}
        </Text>
      </View>
      <Text variant="label" color={theme.colors.neutral[600]}>
        {row.email || "—"}
      </Text>
      {/* The row number is the operator's only way back to their sheet. */}
      <Text variant="caption" color={theme.colors.neutral[600]}>
        {`Row ${row.rowNumber}${row.message ? ` · ${row.message}` : ""}`}
      </Text>
    </Card>
  );
}
```

- [ ] **Step 6: Write the screen**

> **v1 parity 2026-10-09:** In `apps/mobile/app/(app)/users/import.tsx`: delete the unrecognised-columns warning block (`:213-220`, R18), the `onExisting` state, the enrol control and its confirmation (`:69-73`, `:125`, R44); the result step renders `failed` rows and the `failed` tally (R54); the size check (`:102-105`) keeps reading `IMPORT_MAX_PASTE_CHARS`, so it moves to 5 MB with the shared constant (R4). The `.csv/.xlsx` picker filter returns only with file intake (R1 — deferred with `ENABLE_UPLOADS` until the CMS move; *v1 parity 2026-10-09; owner decision 2026-10-10: was "OWNER-CALL R1"*).

```tsx
// apps/mobile/app/(app)/users/import.tsx
import { useMemo, useState } from "react";
import { FlatList, View } from "react-native";
import type {
  ImportRowStatus,
  StudentImportCommitInput,
  StudentImportPreview,
  StudentImportResult,
} from "@space/shared";
import { IMPORT_MAX_PASTE_CHARS } from "@space/shared";

import { ImportRowCard } from "../../../src/components/ImportRowCard";
import { useImportTemplate, useStudentImportCommit, useStudentImportPreview } from "../../../src/hooks/use-import";
import { useSeasons } from "../../../src/hooks/use-seasons";
import { useSessionStore } from "../../../src/store/session";
import { useTheme } from "../../../src/theme";
import { Button, Card, EmptyState, ErrorState, Input, LoadingState, Screen, Text } from "../../../src/ui";

/**
 * `/users/import` — the whole importer in one route.
 *
 * Three steps in local state rather than three routes (spec §9): the paste,
 * the preview and the result all belong to one operation, and splitting them
 * across routes would mean either passing a 2000-row preview through
 * navigation params or holding it in a store that outlives the screen.
 *
 * NOTHING here is persisted. No expo-secure-store, no AsyncStorage, no query
 * cache — a preview is a complete roster with phone numbers, birth dates and
 * pastoral notes (D-16.18). Leaving the route discards it, which is the
 * correct trade; the in-screen Back control is what an operator uses to fix a
 * paste, and it keeps the text.
 */
type Step = "paste" | "preview" | "result";
type Mode = "season" | "alumni";

/** Default the filter to the rows that need attention (spec §10c). */
const ATTENTION: ImportRowStatus[] = ["invalid", "duplicate"];

function messageFor(err: unknown): string {
  const body = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error;
  return body?.message ?? "Something went wrong. Try again.";
}

export default function ImportScreen() {
  const theme = useTheme();
  const role = useSessionStore((s) => s.user?.role ?? null);
  const isSuper = role === "SUPER";

  const [step, setStep] = useState<Step>("paste");
  const [mode, setMode] = useState<Mode>("season");
  const [seasonId, setSeasonId] = useState<number | null>(null);
  const [graduationYear, setGraduationYear] = useState<string>(String(new Date().getUTCFullYear()));
  const [text, setText] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [preview, setPreview] = useState<StudentImportPreview | null>(null);
  const [result, setResult] = useState<StudentImportResult | null>(null);
  const [filter, setFilter] = useState<"attention" | "all">("attention");
  const [enrolExisting, setEnrolExisting] = useState(false);
  const [enrolConfirmed, setEnrolConfirmed] = useState(false);

  const template = useImportTemplate(isSuper);
  // Plan 4's hook — the same cached list the seasons screen reads.
  const seasons = useSeasons(isSuper);
  const previewMutation = useStudentImportPreview();
  const commitMutation = useStudentImportCommit();

  const enrolArmed = mode === "season" && enrolExisting && enrolConfirmed;
  const newRows = useMemo(() => preview?.rows.filter((r) => r.status === "new") ?? [], [preview]);
  // D-16.7: with `enroll` confirmed, rows already in the system are SENT too —
  // the server decides per row (enrol, already enrolled, staff, removed).
  // Unconfirmed, they are never sent.
  const existingRows = useMemo(
    () => (enrolArmed ? (preview?.rows.filter((r) => r.status === "exists") ?? []) : []),
    [preview, enrolArmed],
  );
  const importable = useMemo(() => [...newRows, ...existingRows], [newRows, existingRows]);
  const needsSeason = mode === "season" && seasonId === null;
  const visibleRows = useMemo(() => {
    if (!preview) return [];
    return filter === "all" ? preview.rows : preview.rows.filter((r) => ATTENTION.includes(r.status));
  }, [preview, filter]);

  if (!isSuper) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <EmptyState
          title="Import students"
          message="This screen isn't available for your role."
        />
      </Screen>
    );
  }

  async function runPreview() {
    setLocalError(null);
    if (text.trim() === "") {
      setLocalError("Paste a header row and at least one data row first.");
      return;
    }
    // Checked here so an oversized paste never costs a request; the server
    // checks again, because a client-side limit is a courtesy (D-16.10).
    if (text.length > IMPORT_MAX_PASTE_CHARS) {
      setLocalError("That paste is too long. Import it in smaller batches.");
      return;
    }
    try {
      const next = await previewMutation.mutateAsync({ text, delimiter: "auto" });
      setPreview(next);
      setFilter("attention");
      setStep("preview");
    } catch (err) {
      setLocalError(messageFor(err));
    }
  }

  async function runCommit() {
    if (!preview) return;
    setLocalError(null);
    const rows = importable.map((r) => ({ rowNumber: r.rowNumber, values: r.values }));
    if (rows.length === 0) return;

    // `status` is deliberately not sent: the server re-derives every
    // classification itself (D-16.4), so the client's opinion is not part of
    // the contract.
    const onExisting = enrolArmed ? ("enroll" as const) : ("skip" as const);
    let body: StudentImportCommitInput;
    if (mode === "season") {
      // Narrowed, not cast: the button is disabled without a season, and this
      // guard makes the type say so (the earlier draft sent `null as number`).
      if (seasonId === null) return;
      body = { mode: "season", seasonId, onExisting, rows };
    } else {
      body = { mode: "alumni", graduationYear: Number(graduationYear), onExisting: "skip", rows };
    }

    try {
      setResult(await commitMutation.mutateAsync(body));
      setStep("result");
    } catch (err) {
      setLocalError(messageFor(err));
    }
  }

  // ── Step 3 ───────────────────────────────────────────────────────────────
  if (step === "result" && result) {
    const notCreated = result.rows.filter((r) => r.outcome !== "created");
    return (
      <Screen scroll edges={["top", "left", "right"]}>
        <Text variant="heading">Import complete</Text>
        <Text variant="body">
          {`${result.created} created · ${result.enrolled} enrolled · ${result.skipped} skipped`}
        </Text>
        {/* Spec R55: import sends nothing. Plan 9's single-target invite is
            the only invite path that exists; bulk invites are still deferred,
            so this says so rather than offering a button that 404s. */}
        <Text variant="body" color={theme.colors.neutral[600]}>
          No invites were sent. New accounts have no way to sign in until you invite them from the users screen.
        </Text>
        <Text variant="caption" color={theme.colors.neutral[600]}>
          It is safe to run the same paste again — anyone already in the system is skipped, never duplicated.
        </Text>
        {notCreated.map((r) => (
          <Card key={r.rowNumber} style={{ marginTop: theme.spacing.sm }}>
            <Text variant="label">{`Row ${r.rowNumber} · ${r.email}`}</Text>
            <Text variant="caption" color={theme.colors.neutral[600]}>
              {r.message ?? r.outcome}
            </Text>
          </Card>
        ))}
        <Button
          title="Import another"
          onPress={() => {
            setResult(null);
            setPreview(null);
            setText("");
            setEnrolExisting(false);
            setEnrolConfirmed(false);
            setStep("paste");
          }}
        />
      </Screen>
    );
  }

  // ── Step 2 ───────────────────────────────────────────────────────────────
  if (step === "preview" && preview) {
    return (
      // padded={false} + FlatList, NOT <Screen scroll>: Screen's scroll branch
      // is a ScrollView, and a FlatList inside one loses virtualisation and
      // warns. A 2000-row preview needs the virtualisation.
      <Screen edges={["top", "left", "right"]} padded={false}>
        <FlatList
          data={visibleRows}
          keyExtractor={(r) => String(r.rowNumber)}
          contentContainerStyle={{ padding: theme.spacing.md }}
          renderItem={({ item }) => <ImportRowCard row={item} />}
          ListHeaderComponent={
            <View style={{ gap: theme.spacing.sm, marginBottom: theme.spacing.md }}>
              <Card>
                <Text variant="heading">{`${preview.counts.total} rows`}</Text>
                <Text variant="body">
                  {`${preview.counts.new} new · ${preview.counts.exists} already here · ${preview.counts.duplicate} repeated · ${preview.counts.invalid} invalid`}
                </Text>
                {preview.counts.previously_removed > 0 ? (
                  <Text variant="caption" color={theme.colors.neutral[600]}>
                    {`${preview.counts.previously_removed} previously removed — restore those from the users screen.`}
                  </Text>
                ) : null}
                <Text variant="caption" color={theme.colors.neutral[600]}>
                  {`Read as ${preview.delimiter === "tab" ? "tab" : "comma"}-separated · columns: ${preview.detectedColumns.join(", ")}`}
                </Text>
              </Card>
              {preview.unrecognisedColumns.length > 0 ? (
                <Card>
                  {/* D-16.12: v1 never says what it FAILED to detect, which is
                      the half that matters. */}
                  <Text variant="label" color={theme.colors.error[600]}>
                    {`${preview.unrecognisedColumns.length} column(s) not recognised`}
                  </Text>
                  <Text variant="caption" color={theme.colors.neutral[600]}>
                    {`${preview.unrecognisedColumns.map((c) => `"${c}"`).join(", ")} — these were ignored.`}
                  </Text>
                </Card>
              ) : null}
              <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
                <Button title="Needs attention" variant={filter === "attention" ? "primary" : "secondary"} onPress={() => setFilter("attention")} />
                <Button title="All" variant={filter === "all" ? "primary" : "secondary"} onPress={() => setFilter("all")} />
              </View>
              {mode === "season" ? (
                <View style={{ gap: theme.spacing.xs }}>
                  <Button
                    title="Also enrol people already in the system"
                    variant={enrolExisting ? "primary" : "secondary"}
                    onPress={() => {
                      setEnrolExisting(!enrolExisting);
                      setEnrolConfirmed(false);
                    }}
                  />
                  {enrolExisting && !enrolConfirmed ? (
                    <View style={{ gap: theme.spacing.xs }}>
                      {/* D-16.7: `enroll` changes existing records, so it is
                          never armed by the toggle alone. */}
                      <Text variant="caption" color={theme.colors.neutral[600]}>
                        {`This will also enrol ${preview.counts.exists} existing student(s) into this season. Their names, notes and other details will not be changed.`}
                      </Text>
                      <Button title="Yes, enrol them too" onPress={() => setEnrolConfirmed(true)} />
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            <EmptyState title="Nothing to show" message="No rows match this filter." />
          }
          ListFooterComponent={
            <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.md }}>
              {localError ? <Text variant="body" color={theme.colors.error[600]}>{localError}</Text> : null}
              <Button
                title={
                  needsSeason
                    ? "Choose a season before importing"
                    : importable.length === 0
                      ? "Nothing to import"
                      : `Import ${newRows.length} student${newRows.length === 1 ? "" : "s"}${
                          existingRows.length > 0 ? `, enrol ${existingRows.length}` : ""
                        }`
                }
                onPress={runCommit}
                disabled={needsSeason || importable.length === 0 || commitMutation.isPending}
              />
              <Button title="Back" variant="secondary" onPress={() => setStep("paste")} />
            </View>
          }
        />
      </Screen>
    );
  }

  // ── Step 1 ───────────────────────────────────────────────────────────────
  if (template.isLoading) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <LoadingState />
      </Screen>
    );
  }
  if (template.isError) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <ErrorState message="Couldn't load the import columns." onRetry={() => void template.refetch()} />
      </Screen>
    );
  }

  return (
    <Screen scroll edges={["top", "left", "right"]}>
      <Text variant="heading">Import students</Text>

      <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
        <Button title="Into a season" variant={mode === "season" ? "primary" : "secondary"} onPress={() => setMode("season")} />
        <Button title="As alumni" variant={mode === "alumni" ? "primary" : "secondary"} onPress={() => setMode("alumni")} />
      </View>

      {mode === "alumni" ? (
        <Input label="Graduation year" value={graduationYear} onChangeText={setGraduationYear} keyboardType="number-pad" />
      ) : null}
      {mode === "season" ? (
        <View style={{ gap: theme.spacing.xs }}>
          <Text variant="label">Season</Text>
          {/* Preview stays enabled without a season — the target is only
              needed at commit — but the commit button is disabled until one
              is chosen. Draft and archived seasons are listed too: v1's
              picker offers every non-deleted season (spec 16 R37). */}
          {seasons.isPending ? (
            <LoadingState />
          ) : seasons.isError ? (
            <ErrorState message="Couldn't load seasons." onRetry={() => void seasons.refetch()} />
          ) : (seasons.data ?? []).length === 0 ? (
            <EmptyState title="No seasons" message="Create a season before importing into one." />
          ) : (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.xs }}>
              {(seasons.data ?? []).map((s) => (
                <Button
                  key={s.id}
                  title={s.title}
                  accessibilityLabel={`Target season: ${s.title}`}
                  variant={seasonId === s.id ? "primary" : "secondary"}
                  onPress={() => setSeasonId(s.id)}
                />
              ))}
            </View>
          )}
        </View>
      ) : null}

      <Input
        label="Paste your spreadsheet"
        value={text}
        onChangeText={setText}
        multiline
        numberOfLines={8}
        placeholder={template.data?.headerRow}
      />

      <Card>
        <Text variant="label">Columns we recognise</Text>
        {template.data?.columns.map((c) => (
          <Text key={c.label} variant="caption" color={theme.colors.neutral[600]}>
            {`${c.label}${c.required ? " (required)" : ""} — ${c.acceptedHeaders.join(", ")}`}
          </Text>
        ))}
        <Text variant="caption" color={theme.colors.neutral[600]} selectable>
          {template.data?.headerRow}
        </Text>
      </Card>

      {template.data?.capabilities.fileUpload === false ? (
        <Text variant="caption" color={theme.colors.neutral[600]}>
          Pasting is the only way in right now — file upload arrives with the CMS.
        </Text>
      ) : null}

      {localError ? <Text variant="body" color={theme.colors.error[600]}>{localError}</Text> : null}

      <Button title="Preview" onPress={runPreview} disabled={previewMutation.isPending} />
    </Screen>
  );
}
```

> The season picker consumes Plan 4's `useSeasons` (`src/hooks/use-seasons.ts`)
> — no second seasons fetch. If `Button` in `src/ui` does not forward
> `accessibilityLabel`, add the prop pass-through there (one line) rather than
> wrapping each chip in a `Pressable`; the tests query chips by that label.

- [ ] **Step 7: Verification**

```bash
cd apps/mobile && pnpm jest src/__tests__/student-import.test.tsx
pnpm turbo routes:generate --filter=@space/mobile
pnpm turbo lint typecheck test:unit --filter=@space/mobile
```
All green. `routes:generate` must run before `typecheck` or `Href` degrades to
`string` and the new route is never actually checked.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile && git commit -m "feat(mobile): three-step paste-first student import screen"
```

---

### Task 6b: Mobile — the group-import screen under Plan 6's roster *(Step 0 coordinator, Steps 1–5 Agent B, after Task 6)*

Plan 6 (earlier in the execution order) builds the season detail route
`/seasons/[code]` and the roster screen `/seasons/[code]/roster` with
`GET /seasons/:id/roster` and `PUT /seasons/:id/group-assignments`. Spec 16 §9
puts the group importer at `/seasons/[code]/roster/import`, reached from the
roster's header action (v1 `admin/season/[code]/roster/page.tsx:42`). Its
ancestors now exist, so D-16.1's deferral is lifted and the screen ships here.

**Files:**
- Verify only (no move): `apps/mobile/app/(app)/seasons/[code]/roster/index.tsx` — Plan 6 Task 5 created it in the directory form (ruling X7) and already lists `"seasons/[code]/roster/index"` in `DETAIL_ROUTE_NAMES` *(coordinator)*
- Modify: `apps/mobile/app/(app)/seasons/[code]/roster/index.tsx` — an "Import groups" action *(coordinator)*
- Modify: `apps/mobile/app/(app)/_layout.tsx` (`DETAIL_ROUTE_NAMES` gains `"seasons/[code]/roster/import"`), `app-layout.test.tsx` *(coordinator)*
- Create: `apps/mobile/app/(app)/seasons/[code]/roster/import.tsx` *(Agent B)*
- Modify: `apps/mobile/src/hooks/use-import.ts` (two mutations) *(Agent B)*
- Modify: `packages/shared/src/import.ts` (export `GroupImportCommitInput`) *(coordinator)*
- Test: `apps/mobile/src/__tests__/group-import.test.tsx` *(Agent B)*

**Interfaces:**
- Consumes: Plan 6's route files `app/(app)/seasons/[code]/index.tsx` and the
  roster screen; Plan 4's `useSeasons(enabled)` (the season is resolved from
  the route's `code` against that cached list — no new season fetch, and no
  dependency on any Plan 6 hook name); `groupImportPreviewSchema`,
  `groupImportResultSchema`, `GroupImportPreview`, `GroupImportResult`,
  `GroupImportCommitInput`, `IMPORT_MAX_PASTE_CHARS` from `@space/shared`;
  Task 5's two endpoints; Task 6's `ImportRowCard` pattern (not the component —
  the group row has different fields).
- Produces: `useGroupImportPreview(seasonId)`, `useGroupImportCommit(seasonId)`
  in `src/hooks/use-import.ts`; the route `/seasons/[code]/roster/import`
  (route name `seasons/[code]/roster/import`).

- [ ] **Step 0 (coordinator): the route and the way in**

1. Verify: `ls "apps/mobile/app/(app)/seasons/[code]/roster/index.tsx"` → exists,
   and `ls "apps/mobile/app/(app)/seasons/[code]/roster.tsx"` → no such file.
   Plan 6 Task 5 created the directory form (ruling X7) and appended
   `"seasons/[code]/roster/index"` to `DETAIL_ROUTE_NAMES`. If the index file
   is missing, stop — Plan 6 has not run. Nothing is moved here.
2. Append `"seasons/[code]/roster/import"` to `DETAIL_ROUTE_NAMES`; add to
   `app-layout.test.tsx`:

```tsx
it("declares the group importer hidden from the tab bar", () => {
  expect(DETAIL_ROUTE_NAMES).toContain("seasons/[code]/roster/import");
});
```

3. In the roster screen, for SUPER and for an ADMIN of the season (the same
   predicate the roster screen already uses for its write controls), add:

```tsx
        <Button
          title="Import groups"
          variant="secondary"
          onPress={() =>
            router.push({ pathname: "/seasons/[code]/roster/import", params: { code } })
          }
        />
```

   and one test in Plan 6's roster test file asserting the press pushes
   exactly that object for an ADMIN of the season.
4. In `packages/shared/src/import.ts`, below `groupImportCommitInputSchema`:
   `export type GroupImportCommitInput = z.infer<typeof groupImportCommitInputSchema>;`
5. `pnpm turbo routes:generate --filter=@space/mobile`, then typecheck.

- [ ] **Step 1: Write the failing screen test**

```tsx
// apps/mobile/src/__tests__/group-import.test.tsx
import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
}));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ code: "s-7" }),
  useRouter: () => ({ push: (...a: unknown[]) => mockPush(...a), back: jest.fn() }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";

import GroupImportScreen from "../../app/(app)/seasons/[code]/roster/import";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;

const season = {
  id: 7,
  code: "s-7",
  title: "Spring 2099",
  program: "GBV",
  year: 2099,
  status: "ACTIVE",
  startDate: "2099-01-01T00:00:00.000Z",
  endDate: "2099-06-30T00:00:00.000Z",
};
const scopesFor = (seasonAdminIds: number[]) => ({
  seasonAdminIds,
  groupLeaderIds: [] as number[],
  activeSeasonId: null as number | null,
  graduationYear: null as number | null,
});
const adminOf7 = {
  user: { id: 2, name: "Admin", email: "adm@jpc.test", role: "ADMIN" as const, avatarPath: null, hasPassword: true },
  scopes: scopesFor([7]),
};
const adminOfOther = { ...adminOf7, scopes: scopesFor([8]) };

const preview = {
  rows: [
    { rowNumber: 2, name: "Ann", email: "ann@jpc.test", group: "Group A", status: "assign", message: null, studentUserId: 11, groupId: 3 },
    { rowNumber: 3, name: "Bob", email: "bob@jpc.test", group: "Group A", status: "unchanged", message: null, studentUserId: 12, groupId: 3 },
    { rowNumber: 4, name: "Cy", email: "cy@jpc.test", group: "Nope", status: "no_group", message: "No group named \"Nope\".", studentUserId: 13, groupId: null },
  ],
  delimiter: "tab",
  counts: { assign: 1, unchanged: 1, no_student: 0, no_group: 1, invalid: 0, total: 3 },
};

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  get.mockResolvedValue({ data: { data: { seasons: [season] } } });
});

describe("GroupImportScreen", () => {
  it("refuses an ADMIN of another season without calling the import API", async () => {
    useSessionStore.setState(adminOfOther);
    renderWithProviders(<GroupImportScreen />);
    expect(await screen.findByText(/isn't available for this season/)).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
  });

  it("previews against the season resolved from the route's code", async () => {
    useSessionStore.setState(adminOf7);
    post.mockResolvedValue({ data: { data: preview } });
    renderWithProviders(<GroupImportScreen />);

    expect(await screen.findByText("Import groups · Spring 2099")).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText("Paste your spreadsheet"), "email\tgroup\nann@jpc.test\tGroup A");
    fireEvent.press(screen.getByText("Preview"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/seasons/7/imports/groups/preview", {
        text: "email\tgroup\nann@jpc.test\tGroup A",
        delimiter: "auto",
      }),
    );
    expect(await screen.findByText("1 to assign · 1 unchanged · 1 not matched")).toBeTruthy();
  });

  it("commits only the assign rows, as resolved id pairs, and reports what was APPLIED", async () => {
    useSessionStore.setState(adminOf7);
    post
      .mockResolvedValueOnce({ data: { data: preview } })
      .mockResolvedValueOnce({ data: { data: { assigned: 0, skipped: 1, skippedStudentIds: [11] } } });
    renderWithProviders(<GroupImportScreen />);

    fireEvent.changeText(await screen.findByLabelText("Paste your spreadsheet"), "email\tgroup\nann@jpc.test\tGroup A");
    fireEvent.press(screen.getByText("Preview"));
    fireEvent.press(await screen.findByText("Assign 1 student"));

    await waitFor(() =>
      expect(post).toHaveBeenLastCalledWith("/api/v1/seasons/7/imports/groups/commit", {
        assignments: [{ studentUserId: 11, groupId: 3 }],
      }),
    );
    // v1 reported the requested count (spec R80); the screen reports the
    // server's applied count and names the skipped row.
    expect(await screen.findByText("0 assigned · 1 skipped")).toBeTruthy();
    expect(screen.getByText(/Row 2 · ann@jpc.test/)).toBeTruthy();
  });
});
```

Run: `cd apps/mobile && pnpm jest src/__tests__/group-import.test.tsx` → FAIL
(module not found).

- [ ] **Step 2: The hooks** — append to `src/hooks/use-import.ts`:

```ts
import {
  groupImportPreviewSchema,
  groupImportResultSchema,
  type GroupImportCommitInput,
  type GroupImportPreview,
  type GroupImportResult,
} from "@space/shared";

/** Mutations, not queries — the same D-16.18 reasons as the student importer. */
export function useGroupImportPreview(
  seasonId: number | null,
): UseMutationResult<GroupImportPreview, unknown, { text: string; delimiter: "auto" | "comma" | "tab" }> {
  return useMutation({
    mutationFn: async (input) => {
      if (seasonId === null) throw new Error("No season.");
      const res = await apiClient.post(`/api/v1/seasons/${seasonId}/imports/groups/preview`, input);
      return groupImportPreviewSchema.parse(res.data.data);
    },
  });
}

export function useGroupImportCommit(
  seasonId: number | null,
): UseMutationResult<GroupImportResult, unknown, GroupImportCommitInput> {
  return useMutation({
    mutationFn: async (input) => {
      if (seasonId === null) throw new Error("No season.");
      const res = await apiClient.post(`/api/v1/seasons/${seasonId}/imports/groups/commit`, input);
      return groupImportResultSchema.parse(res.data.data);
    },
  });
}
```

(Merge the new names into the file's existing `@space/shared` import rather
than adding a second import statement.)

- [ ] **Step 3: The screen**

```tsx
// apps/mobile/app/(app)/seasons/[code]/roster/import.tsx
import { useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, View } from "react-native";
import type { GroupImportPreview, GroupImportResult } from "@space/shared";
import { IMPORT_MAX_PASTE_CHARS } from "@space/shared";

import { useGroupImportCommit, useGroupImportPreview } from "../../../../../src/hooks/use-import";
import { useSeasons } from "../../../../../src/hooks/use-seasons";
import { useSessionStore } from "../../../../../src/store/session";
import { useTheme } from "../../../../../src/theme";
import { Button, Card, EmptyState, ErrorState, Input, LoadingState, Screen, Text } from "../../../../../src/ui";

/**
 * `/seasons/[code]/roster/import` — bulk group assignment, three steps in
 * local state (paste → preview → result), exactly like `/users/import`.
 *
 * The season comes from the route's `code`, resolved against Plan 4's cached
 * `useSeasons` list; the endpoints take the id in the PATH (D-16.20), so
 * preview and commit cannot target different seasons. Gate: SUPER, or an
 * ADMIN of THIS season — the endpoints refuse anyone else regardless.
 */
type Step = "paste" | "preview" | "result";

function messageFor(err: unknown): string {
  const body = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error;
  return body?.message ?? "Something went wrong. Try again.";
}

export default function GroupImportScreen() {
  const theme = useTheme();
  const { code } = useLocalSearchParams<{ code: string }>();
  const role = useSessionStore((s) => s.user?.role ?? null);
  const adminIds = useSessionStore((s) => s.scopes?.seasonAdminIds ?? []);

  const seasons = useSeasons(role === "SUPER" || role === "ADMIN");
  const season = useMemo(
    () => (seasons.data ?? []).find((s) => s.code === code) ?? null,
    [seasons.data, code],
  );
  const seasonId = season?.id ?? null;
  const allowed = role === "SUPER" || (role === "ADMIN" && seasonId !== null && adminIds.includes(seasonId));

  const [step, setStep] = useState<Step>("paste");
  const [text, setText] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [preview, setPreview] = useState<GroupImportPreview | null>(null);
  const [result, setResult] = useState<GroupImportResult | null>(null);

  const previewMutation = useGroupImportPreview(seasonId);
  const commitMutation = useGroupImportCommit(seasonId);
  const toAssign = useMemo(
    () =>
      (preview?.rows ?? []).filter(
        (r): r is typeof r & { studentUserId: number; groupId: number } =>
          r.status === "assign" && r.studentUserId !== null && r.groupId !== null,
      ),
    [preview],
  );

  if (seasons.isPending) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <LoadingState />
      </Screen>
    );
  }
  if (seasons.isError) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <ErrorState message="Couldn't load the season." onRetry={() => void seasons.refetch()} />
      </Screen>
    );
  }
  if (!season || !allowed) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <EmptyState title="Import groups" message="This screen isn't available for this season." />
      </Screen>
    );
  }

  async function runPreview() {
    setLocalError(null);
    if (text.trim() === "") return setLocalError("Paste a header row and at least one data row first.");
    if (text.length > IMPORT_MAX_PASTE_CHARS) return setLocalError("That paste is too long. Import it in smaller batches.");
    try {
      setPreview(await previewMutation.mutateAsync({ text, delimiter: "auto" }));
      setStep("preview");
    } catch (err) {
      setLocalError(messageFor(err));
    }
  }

  async function runCommit() {
    setLocalError(null);
    if (toAssign.length === 0) return;
    try {
      setResult(
        await commitMutation.mutateAsync({
          assignments: toAssign.map((r) => ({ studentUserId: r.studentUserId, groupId: r.groupId })),
        }),
      );
      setStep("result");
    } catch (err) {
      setLocalError(messageFor(err));
    }
  }

  if (step === "result" && result && preview) {
    const skipped = new Set(result.skippedStudentIds);
    const skippedRows = preview.rows.filter((r) => r.studentUserId !== null && skipped.has(r.studentUserId));
    return (
      <Screen scroll edges={["top", "left", "right"]}>
        <Text variant="heading">Groups updated</Text>
        {/* The APPLIED count from the server (spec R80/D5), never the request. */}
        <Text variant="body">{`${result.assigned} assigned · ${result.skipped} skipped`}</Text>
        {skippedRows.map((r) => (
          <Card key={r.rowNumber} style={{ marginTop: theme.spacing.sm }}>
            <Text variant="label">{`Row ${r.rowNumber} · ${r.email}`}</Text>
            <Text variant="caption" color={theme.colors.neutral[600]}>
              Not placed — no active enrolment in this season.
            </Text>
          </Card>
        ))}
        <Button
          title="Import another"
          onPress={() => {
            setResult(null);
            setPreview(null);
            setText("");
            setStep("paste");
          }}
        />
      </Screen>
    );
  }

  if (step === "preview" && preview) {
    const notMatched = preview.counts.no_student + preview.counts.no_group + preview.counts.invalid;
    return (
      <Screen edges={["top", "left", "right"]} padded={false}>
        <FlatList
          data={preview.rows}
          keyExtractor={(r) => String(r.rowNumber)}
          contentContainerStyle={{ padding: theme.spacing.md }}
          renderItem={({ item }) => (
            <Card style={{ marginBottom: theme.spacing.sm }}>
              <Text variant="label">{`${item.name || item.email} → ${item.group || "—"}`}</Text>
              <Text variant="caption" color={theme.colors.neutral[600]}>
                {`Row ${item.rowNumber} · ${item.status}${item.message ? ` · ${item.message}` : ""}`}
              </Text>
            </Card>
          )}
          ListHeaderComponent={
            <Card style={{ marginBottom: theme.spacing.md }}>
              <Text variant="body">
                {`${preview.counts.assign} to assign · ${preview.counts.unchanged} unchanged · ${notMatched} not matched`}
              </Text>
            </Card>
          }
          ListFooterComponent={
            <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.md }}>
              {localError ? <Text variant="body" color={theme.colors.error[600]}>{localError}</Text> : null}
              <Button
                title={toAssign.length === 0 ? "Nothing to assign" : `Assign ${toAssign.length} student${toAssign.length === 1 ? "" : "s"}`}
                onPress={runCommit}
                disabled={toAssign.length === 0 || commitMutation.isPending}
              />
              <Button title="Back" variant="secondary" onPress={() => setStep("paste")} />
            </View>
          }
        />
      </Screen>
    );
  }

  return (
    <Screen scroll edges={["top", "left", "right"]}>
      <Text variant="heading">{`Import groups · ${season.title}`}</Text>
      <Text variant="caption" color={theme.colors.neutral[600]}>
        Paste two columns, "email" and "group". A blank group cell is left alone.
      </Text>
      <Input
        label="Paste your spreadsheet"
        value={text}
        onChangeText={setText}
        multiline
        numberOfLines={8}
        placeholder={"email\tgroup"}
      />
      {localError ? <Text variant="body" color={theme.colors.error[600]}>{localError}</Text> : null}
      <Button title="Preview" onPress={runPreview} disabled={previewMutation.isPending} />
    </Screen>
  );
}
```

- [ ] **Step 4: Verification**

```bash
cd apps/mobile && pnpm jest src/__tests__/group-import.test.tsx src/__tests__/app-layout.test.tsx
pnpm turbo routes:generate --filter=@space/mobile
pnpm turbo lint typecheck test:unit --filter=@space/mobile
```

- [ ] **Step 5: Commit**

```bash
git add apps/mobile packages/shared && git commit -m "feat(mobile): group-assignment import screen under the season roster"
```

---

### Task 7: Closing gate *(coordinator)*

**Files:** none created — verification only.

- [ ] **Step 1: Full suite**

At the repo root:
```bash
pnpm turbo lint typecheck test:unit build
```
Then the integration run — **serial, one command, never parallel**:
```bash
cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern integration
```
Green, including Plan 7's `students-routes` (the `createStudentRows`
extraction's regression gate) and domain 5's `groups-routes`.

- [ ] **Step 2: Mutation pass**

> **v1 parity 2026-10-09:** Mutations 1, 3 and 4 assume the all-or-nothing commit. Re-target them: 1 — deleting the idempotence branch now makes each re-run row hit `P2002` and report `skipped` (no new rows), so the red test is the `db.user.count`-unchanged assertion plus the `"matches … differs only in case"` case; 3 — move every row into one shared `$transaction` → the per-row isolation unit test goes red; 4 — skip the per-row validation → the over-long row is attempted and the "invalid row is reported failed" case goes red. Mutation 5 is inverted: v1's preview-only standard **is** the rule now (D-16.9), so the mutation is "run the full commit schema at preview" → the "over-long name previews new" case goes red. Add: 9 — `groupByName` keeps the last id on a name clash → the ambiguous-row case goes red.

Eight mutations, **one at a time**, each restored before the next. Every one
must turn at least one named test red; a mutation that stays green means the
rule is not actually tested and the task is not done.

1. **Idempotence — the one that matters.**
   In `apps/backend/src/lib/imports/students.ts`, inside
   `commitStudentImport`'s transaction, delete the block between the
   `── THE IDEMPOTENCE BRANCH ──` and `── END IDEMPOTENCE BRANCH ──` banners,
   i.e. the four lines beginning
   `const match = existing.get(normaliseEmail(item.row.email));` down to the
   closing `}` of `if (match) { … }`.
   **Must go red:** `"re-running the same paste creates ZERO new rows (D-16.6 / spec R44)"`
   in `apps/backend/src/__tests__/integration/imports-routes.test.ts`. Without
   the branch, every already-present address is pushed to `toCreate`, the
   insert violates `User.email @unique`, the transaction rolls back and the
   second commit answers `409 import_conflict` instead of
   `200 { created: 0, skipped: 2 }` — and the `db.user.count` assertion at the
   end of that test is what makes the failure unambiguous rather than a lucky
   status match. Also expect
   `"matches an existing user whose stored address differs only in case"` and
   `"skips a soft-deleted address even under enroll"` to fail.
2. **Case-insensitive matching.**
   Same file, `normaliseEmail`: change the body to `return email.trim();`.
   **Must go red:** `"matches an existing user whose stored address differs only in case"`
   and `"collapses two casings of one address in the same batch to a single account"`
   (integration), plus `"writes one user per distinct address, case-insensitively"`
   in `apps/backend/src/__tests__/import-commit.test.ts`.
3. **Transactionality.**
   Same file: replace `await db.$transaction(async (tx) => { … }, { timeout: 30_000 })`
   with a direct invocation of the same body against `db` (i.e. `const tx = db;`
   and drop the wrapper).
   **Must go red:** `"issues every write on the transaction client and none on db itself"`
   in `import-commit.test.ts` — the `mockDb.user.createManyAndReturn`
   `not.toHaveBeenCalled()` assertion fires.
4. **Server-side re-derivation.**
   Same file: delete the line
   `if (invalidRowNumbers.length > 0) throw new ImportRowsInvalidError(invalidRowNumbers);`.
   **Must go red:** `"refuses the WHOLE batch when any row is invalid, and writes nothing (D-16.5)"`
   and `"re-derives status server-side — a client's own classification is never trusted (D-16.4)"`.
5. **One validation standard.**
   Same file, in `buildStudentImportPreview`, replace
   `const validation = validateImportRow(values);` with v1's preview-only
   standard — `const validation = values.name.trim().length >= 2 ? { ok: true as const, row: values as never } : { ok: false as const, message: "Name is missing or too short." };`
   **Must go red:** `"applies the SAME length rules at preview as at commit (D-16.9 / spec D12)"`
   and `"rejects a date of birth that is not YYYY-MM-DD"`.
6. **The SUPER gate.**
   In `apps/backend/src/routes/imports.ts`, make `requireSuper` return `true`
   unconditionally.
   **Must go red:** `"refuses ADMIN and STUDENT (spec D3 — SUPER-only, and it stays that way)"`
   and `"refuses a non-SUPER caller (D3 — the gate stays SUPER-only)"`.
7. **The group importer's true count.** (The function is Plan 6's; the
   mutation is still this plan's, because the importer's report depends on it.)
   In `apps/backend/src/lib/queries/groups.ts`, `assignStudentsToGroups`:
   return `{ assigned: assignments.length, skippedStudentIds }`.
   **Must go red:** `"writes the memberships, sets SeasonEnrollment.groupId, and reports what it ACTUALLY wrote (D5)"`.
8. **The group importer's whole-batch refusal.**
   Same function: replace `throw new GroupOutsideSeasonError();` with a
   `continue`-style skip (drop the offending assignments instead).
   **Must go red:** `"refuses the WHOLE batch when any group is outside the season (spec R75)"`.

- [ ] **Step 3: Emit check — the `rootDir` trap**

```bash
grep -rn 'require("@space/shared")' apps/backend/dist/ ; echo "exit=$?"
```
Must print nothing (`exit=1`) — the whole of `dist/`, not one subtree
(ruling X12). This plan adds three value imports from
`@space/shared` — `routes/imports.ts`, `lib/imports/students.ts`,
`lib/imports/groups.ts` — and every one must have compiled to a relative
`require` into `dist/packages/shared/src/`. A hit here is a server that
crashes on boot with `ERR_MODULE_NOT_FOUND`.

Also confirm nothing crept in from the wrong Prisma entry point:
```bash
grep -rn "@prisma/client" apps/backend/src/lib/imports apps/backend/src/routes/imports.ts ; echo "exit=$?"
```
Must print nothing.

- [ ] **Step 4: Fixture-safety re-check**

After the full integration run, with no test in flight. The earlier draft
ran `node -e "require('./src/generated/prisma/client')"` — that cannot work:
Prisma 7's `prisma-client` generator emits **TypeScript**, which plain `node`
cannot load, and the snippet read `process.env` outside `config.ts`. The check
is a jest test instead, so it compiles through ts-jest and uses the app's own
`db` client and config:

```ts
// apps/backend/src/__tests__/integration/fixture-leak.test.ts
import { db } from "../../db/client";
import { TEST_PREFIX } from "./fixtures";

jest.setTimeout(60000);

afterAll(async () => {
  await db.$disconnect();
});

/**
 * Every integration suite cleans up in its own afterAll, so between suites —
 * and after the full run — the shared staging database must hold no prefixed
 * row. Case-insensitive on purpose: the imports suite pastes uppercase
 * variants of fixture addresses, and cleanupTestData's own filter is
 * case-sensitive.
 */
describe("no test fixture survives cleanup", () => {
  it("leaves zero prefixed users and seasons", async () => {
    const users = await db.user.count({
      where: { email: { startsWith: TEST_PREFIX, mode: "insensitive" } },
    });
    const seasons = await db.season.count({ where: { code: { startsWith: TEST_PREFIX } } });
    expect({ users, seasons }).toEqual({ users: 0, seasons: 0 });
  });
});
```

```bash
cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern fixture-leak
```

Must pass with `{ users: 0, seasons: 0 }`. Anything else means a suite
wrote rows `cleanupTestData` cannot reach — stop and fix the fixtures before
doing anything else, because those rows are sitting in a database jpc-space is
serving. The file stays in the repo: it also runs inside every full
integration run, where it checks the state between suites.

- [ ] **Step 5: Device checklist (manual, Expo Go or a dev build)**

> **v1 parity 2026-10-09:** Item 3 now reads: a column headed `Uni` is ignored with no warning (R18). Item 4: the result step shows created / skipped / failed counts. Add: a paste with one invalid row commits the other rows and reports that row `failed` (R42).

Backend running (`pnpm --filter @space/backend dev`), `apiClient` base URL
pointed at it, signed in as a staging SUPER.

1. Open `/users/import` from the users screen. The recognised-columns card
   renders, and the "file upload arrives with the CMS" line is visible.
2. Paste a **tab-separated** selection copied out of a spreadsheet (three
   rows, one with a deliberately bad email, one repeating an address already
   in staging). Preview reads it as tab-separated, the counts card matches,
   and the filter opens on "Needs attention" showing only the bad rows.
3. Add a column headed `Uni` and re-preview: the unrecognised-column warning
   names it.
4. Commit. The result step shows the counts, the skipped row **by row
   number**, and the "no invites were sent" and "safe to run again" lines.
5. Commit the **same paste again**. `created: 0`. Check the users list: no
   duplicate.
6. Paste a row with `dob` as `01/02/2003`: it previews `invalid` with the
   YYYY-MM-DD message rather than importing a transposed date.
7. Confirm the import screen does **not** appear in the tab bar for any role.
7b. As a season ADMIN, open that season's roster (Plan 6), tap "Import
   groups", paste `email`/`group` rows for two enrolled students and one
   unknown address: the preview shows 2 to assign and 1 not matched; commit;
   the result's assigned count equals what the roster grid now shows.
8. Backgrounding the app during the preview step and returning keeps the
   preview (same JS context); force-quitting loses it, which is the documented
   trade in D-16.4 — confirm the screen recovers cleanly to step 1 rather than
   rendering a half-state.

- [ ] **Step 6: Report**

Report to the user: suite counts, the eight mutation outcomes one by one, the
fixture-safety output, the device checklist results, and:

- **Flag to domain 6 (students):** `onExisting: "enroll"` now changes existing
  records against a shared production database (D-16.7 / spec D4) — bounded to
  `SeasonEnrollment` + `activeSeasonId`, never a profile field, but it is a
  product-visible behaviour change and should be reviewed rather than
  discovered.
- **Flag to domains 1 and 11:** v2 now compares emails case-insensitively
  while storing them verbatim (D-16.6 / spec D2). Normalising stored addresses
  is their coordinated change, not an importer's, and it must wait for Plan 18.
- **Flag to domain 5:** `assignStudentsToGroups` resolves eligibility through
  `SeasonEnrollment` rather than `StudentProfile.activeSeasonId` (ruling C9);
  v1's `assignStudentsToGroupsAction` still uses the pointer and still silently
  skips, and the manual roster grid shares that code path in v1.
- The seven items in **Deferred to cutover**, restated so Plan 18 can pick
  them up verbatim.
- Anything discovered while implementing that this plan got wrong.

---

## Done means

Objectively checkable, in order.

- [ ] `pnpm turbo lint typecheck test:unit build` is green at the repo root.
- [ ] `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern integration` is green, **including** Plan 7's `students-routes` suite unchanged and domain 5's `groups-routes` suite unchanged.
- [ ] `cd apps/mobile && pnpm jest` is green, including `student-import.test.tsx`, `app-layout.test.tsx` and `placeholder-screens.test.tsx`.
- [ ] **A re-run of the same paste creates zero duplicate rows against staging**, proven by the test `"re-running the same paste creates ZERO new rows (D-16.6 / spec R44)"`, whose final assertions count `User`, `StudentProfile` and `SeasonEnrollment` rows — and which goes **red** when the email-match branch is deleted (mutation 1).
- [ ] All eight mutations in Task 7 Step 2 turned at least one **named** test red, and every one was restored.
- [ ] `grep -rn 'require("@space/shared")' apps/backend/dist/` prints nothing (ruling X12).
- [ ] `grep -rn "const rateLimitHandler" apps/backend/src` prints nothing — `routes/imports.ts` imports Plan 9's (ruling X4).
- [ ] A 150 KB paste previews 200 (route-level parser), and an over-limit body answers `413 payload_too_large`, never 500.
- [ ] `grep -rn "@prisma/client" apps/backend/src/lib/imports apps/backend/src/routes/imports.ts` prints nothing.
- [ ] After the full integration run, the staging database holds **zero** rows whose `User.email` or `Season.code` starts with `space-v2-test-` (Task 7 Step 4).
- [ ] Every paste in `imports-routes.test.ts` is built by `sheet()`, and the test `"refuses a paste whose emails cleanupTestData could not delete"` passes — i.e. the guard is still a guard.
- [ ] No file under `apps/backend/prisma/` is modified; `git diff --stat main -- apps/backend/prisma` is empty.
- [ ] `grep -rn "ChangeMe123" apps/ packages/ --exclude-dir=__tests__` prints nothing (Plan 9 keeps the string in a test on purpose, asserting it is NOT accepted), and every account any code path in this plan creates has `passwordHash: null` — asserted in `"creates User + StudentProfile + ACTIVE SeasonEnrollment with NO credentials"` and in `"writes one user per distinct address, case-insensitively"`.
- [ ] `grep -rniE "AUTH_SECRET|GMAIL_APP_PASSWORD|DATABASE_URL" apps/backend/src/lib/imports apps/backend/src/routes/imports.ts` prints nothing.
- [ ] `exceljs`, `multer` and `expo-document-picker` appear in **no** new import in this plan's diff; `apps/backend/package.json` and `apps/mobile/package.json` are unchanged.
- [ ] `POST /api/v1/imports/students/preview`, `POST /api/v1/imports/students/commit`, `GET /api/v1/imports/students/template`, `POST /api/v1/seasons/{id}/imports/groups/preview` and `POST /api/v1/seasons/{id}/imports/groups/commit` all appear in `apps/backend/src/docs/openapi.ts` and render at `/api/docs`.
- [ ] Review check (not a grep — the string also appears in Plan 9's users routes and in this plan's `groups.ts` filters): the backend's student-account writers are exactly `createStudentRows` (Plan 7's form and this importer) and Plan 9's invite-first `POST /users` / role-change `PATCH`, and every one writes `passwordHash: null`. Enrolments written by the importer go through `enrollStudentInSeason`, the same function Plan 7's `POST /students/:id/enrollments` now calls.
- [ ] `/users/import` is reachable by navigation and absent from the tab bar for every role, asserted in `app-layout.test.tsx`.
- [ ] The device checklist in Task 7 Step 5 has been walked end to end, item 5 included.
- [ ] The closing report names the three cross-domain flags and the seven cutover items, and `2026-10-05-plan-18-cutover.md` has been told about them.






---

## Revision 2026-10-05

Review pass against `review-plans-07-13.md`, the cross-plan rulings, and two
coordinator addenda (Plan 6 owns the group write and the season routes).
Changes:

- **Header / order:** dependencies restated against the execution order
  (… 15 → 16 → **17** → 18). Plans 4, 6, 7, 9 and 10 named, each with what is
  consumed.
- **B1 — body size:** import routers parse their own JSON with
  `express.json({ limit: config.importBodyLimit })` (default `2mb`), mounted
  in `app.ts` **before** the global 100 KB parser; `entity.too.large` now maps
  to `413 payload_too_large`. Unit test + a >100 KB integration paste.
- **B2 — rate limits vs the suite:** `importLimiter(limit)` factory; limits
  from `config.importPreviewRateLimit` / `importCommitRateLimit`
  (`IMPORT_PREVIEW_RATE_LIMIT`, `IMPORT_COMMIT_RATE_LIMIT`), lifted in
  `jest.setup.ts`; the 429 pinned by a limit-1 unit test. **X4:** the local
  `rateLimitHandler` copy is gone — imported from Plan 9's `lib/rate-limit.ts`.
- **X5:** `seasonImportsRouter` has no router-level auth (shared
  `/api/v1/seasons` prefix); `requireAuth` per route. `importsRouter` keeps
  router-level auth on its exclusive `/api/v1/imports`.
- **B3 — season picker:** built on Plan 4's `useSeasons`; commit disabled until
  a season is chosen; the `seasonId as number` cast removed.
- **B4 — enrol existing:** with `enroll` confirmed, `exists` rows are sent with
  the new rows; tested.
- **S1 — enrolment rules:** `enrollStudentInSeason(tx, studentUserId, seasonId)`
  extracted from Plan 7's `POST /students/:id/enrollments` and used by both:
  an existing enrolment is `skipped` (Plan 7's `already_enrolled`), the pointer
  is set only when unset.
- **S2:** the "only one STUDENT writer" claim withdrawn (Plan 9's `POST /users`
  also creates students); replaced by a credential review check.
- **S3/S4/S7/S8:** case-insensitive fixture guard + afterAll sweep;
  `ChangeMe123` grep excludes `__tests__`; the "echoed verbatim" header claim
  corrected; group preview and commit accept ACTIVE enrolments only (tests).
- **Plan 6 addendum:** `assignStudentsToGroups` / `GroupOutsideSeasonError`
  are **consumed from Plan 6**, not created; Task 5's tests pin the contract
  (whole-batch refusal, applied count, ACTIVE-only).
- **D-16.1:** the group-import screen now ships (new **Task 6b**) at
  `/seasons/[code]/roster/import`, reached from Plan 6's roster.
- **Users screen:** Task 6 Step 0 rewritten for the post-Plan-9 tree (directory
  move only if Plan 10 has not done it, relative imports deepened, no
  placeholder/count edits — X9) plus an "Import students" entry point and test.
- **S9:** the fixture-leak check is a jest test (`fixture-leak.test.ts`), not
  `node -e` against Prisma 7's TypeScript client.
- **X11/X12:** `avatarPath: null` in session fixtures; emit check greps all of
  `dist/`. Nits: `student-actions.ts:59`, alias-count wording, removed/staff
  rows return `userId: null`, bulk invites → Plan 10.

Rejected: routing Plan 9's `POST /users` STUDENT branch through
`createStudentRows` (review S2's first option) — it would pull the invite flow
into the students module; the invariant that matters (`passwordHash: null`) is
checked instead. S6 (Plan 18's view of an import store) is Plan 18's to fix.

**Cross-plan consistency pass (2026-10-05, against plans 5, 6, 10 and 11 and the revised
order … 7 → 8 → 9 → 10 → 11 → … → 16 → 17 → 18):**

- **Header:** execution order corrected (17 now follows 7); states that no
  Plan 16 output is consumed; Plan 6 (route files `seasons/[code]/index.tsx`,
  `seasons/[code]/roster/index.tsx`, `DIRECTORY_ROUTE_HREFS`, per-route auth on
  `seasonsRouter`) and Plan 10 (users directory, invite-on-create, graduation
  semantics) named precisely.
- **Task 6 Step 0 is verification-only** (supersedes the "Users screen" bullet
  above): Plan 10 Task 9 always runs first and has already moved `users.tsx`
  to `users/index.tsx`; the set shown is now the real
  `["students", "seasons", "users"]` (Plan 6 added `"seasons"`; the old
  `["students", "users"]` snippet would have hidden the SUPER Seasons tab).
  D-16.17 and "Not in scope" reworded to match. The "Import students" button
  reuses Plan 10's `router` in `UsersScreen` and sits beside its
  `PendingInvitesCard`.
- **Task 4 Step 4 keeps Plan 10's invite.** The old step replaced the whole
  `POST /students` transaction body and would have deleted Plan 10's
  `issueInvite(tx, …)`; it now swaps only the row-writing block for
  `createStudentRows` and leaves the invite mint, the post-commit mail and
  the 201 body untouched. The importer still mints nothing (R55).
- **Task 6b Step 0:** the conditional `roster.tsx` → `roster/index.tsx` move is
  now a verification — Plan 6 creates the directory form directly.
- **Graduation (Plan 10):** checked — graduation completes all ACTIVE
  enrolments, sets `graduationYear` and clears `activeSeasonId`, the same end
  state as this plan's `alumni` mode; the group importer's ACTIVE-only roster
  correctly excludes graduated students; `enrollStudentInSeason`'s
  "any existing row = already_enrolled" rule is Plan 7's and unchanged.
- **X11:** inline session fixtures gain `hasPassword: true` (Plan 9's `MeUser`).


## Revision 2026-10-09 — v1 parity

Owner ruling: v2 behaves exactly like v1 except where v1's behaviour is a defect. This revision
reverts the divergences below; the edits are marked *(v1 parity 2026-10-09)* in place. The code
built from the earlier text must be changed to match. Full classification:
`docs/superpowers/audits/2026-cutover/v1-parity-classification.tsv`.

| # | Rule(s) | REG | v1 behaviour (v1 file:line) | v2 code to change (file:line) | Where in this plan |
|---|---|---|---|---|---|
| 1 | 16-R3, R4 | - | 5 MB import ceiling, checked by the client before sending and by the server (`src/lib/student-import-actions.ts:18,36`; `src/lib/group-import-actions.ts:12,32`; `src/components/ui/file-upload.tsx:32-38`) | `packages/shared/src/import.ts:21`; `apps/backend/src/routes/imports.ts:85` (`importBodyLimit`); `apps/mobile/app/(app)/users/import.tsx:102-105` (follows the constant) | D-16.10; Task 1 Steps 1, 3; Task 3 Steps 1, 4a, 6; Task 6 Steps 1, 6 |
| 2 | 16-R17 | - | Duplicate headers: last `name`/`email` column wins, first profile column wins (`src/lib/student-import.ts:96-103`) | `apps/backend/src/lib/imports/students.ts:69-76` | D-16.22; Task 3 Steps 1, 3 |
| 3 | 16-R18 | - | Unrecognised headers silently ignored (`student-import.ts:100-103`) | `students.ts:62,82,98`; `packages/shared/src/import.ts:182`; `users/import.tsx:213-220` | D-16.12; Task 1; Task 3 Steps 1, 3, 6; Task 6 Steps 1, 6; Task 7 Step 5 |
| 4 | 16-R20 | REG-115 | Row skipped as blank when name, email and every recognised profile cell are blank (`student-import.ts:120-127`) | `students.ts:266-268` (parser filter `delimited.ts:171-175` stays for numbering) | Task 2 Steps 1, 3; Task 3 Steps 1, 3 |
| 5 | 16-R22 | - | Four statuses; a soft-deleted match reads `exists` "Already in the system." (`student-import.ts:9`, `:157-167`) | `packages/shared/src/import.ts:93-104,168`; `students.ts:291-293,305,577-591` | D-16.14; Deferred row 4; Task 1; Task 3 Steps 1, 3; Task 4 Step 1; Task 6 Steps 1, 5 |
| 6 | 16-R24, R41 | - | Preview checks only name ≥ 2 and email; commit bounds name 2–120, phone 50, university 200, year 50, dob 40, spiritual background / gifts / notes 2000 (`student-import.ts:71-87`, `:129`) | `students.ts:174-202,270`; `packages/shared/src/import.ts:145` | D-16.9; D-16.4; Task 1 Steps 1, 3; Task 3 Steps 1, 3; Task 7 Step 2 |
| 7 | 16-R42, R45, R52, R53, R54 | - | Sequential per-row commit, one transaction per row; invalid → `failed` "Invalid name or email."; P2002 → `skipped`; other error → `failed` "Could not create this account."; per-row report with created/skipped/failed tallies (`student-import.ts:181-205`, `:238-291`) | `students.ts:430-553`; `apps/backend/src/routes/imports.ts:132-136,165-189`; `packages/shared/src/import.ts:255-279` | Goal; D-16.4; D-16.5; Task 4 (intro, Steps 1, 2, 5, 6, 7); Task 6 Steps 1, 4, 6; Task 7 Steps 2, 5 |
| 8 | 16-R44 | - | An existing user is always skipped; never updated or enrolled (`student-import.ts:248-251`) | `students.ts:472-489,513-536,600-605`; `packages/shared/src/import.ts:239,248`; `users/import.tsx:69-73,125` | D-16.7; D-16.8; Task 1; Task 4 Steps 1, 4b, 5, 7; Task 6 Steps 1, 4, 6 |
| 9 | 16-R65 (reconciled with 05-R15) | - | Whole paste is never refused for duplicate group names (`src/lib/group-import.ts:59`); v1's last-wins guess is **not** ported — see below | `apps/backend/src/lib/imports/groups.ts:93-102` | D-16.19.1; Deferred row 5; Task 5 Steps 1, 3; Task 7 Step 2 |
| 10 | 16-R84 | - | No rate limit on preview or commit (`student-import.ts:247-278`; `src/lib/group-actions.ts:225-244`) | `routes/imports.ts:66-72,116,140,244,268`; `lib/config.ts` `IMPORT_*_RATE_LIMIT`; `jest.setup.ts` | D-16.21; Task 3 Steps 1, 4, 4a, 6; Task 4 Steps 6, 7; Task 5 Steps 1, 4 |

**16-R65 and the dropped Plan 18 M2 — reconciliation.** R65 is about two **season groups** that share a
name (v1 `group-import.ts:59` builds `groupByName` from the season's groups, so the last one wins), not
about duplicate names inside the pasted file. It therefore covers exactly the case the requested
"refuse an ambiguous row" rule covers, and a full R65 revert (last wins, silently) would contradict it.
Resolved here as follows: the part of v2's behaviour that is not a v1 defect — refusing the **whole
paste** — is reverted, so every unambiguous row previews and commits exactly as v1; the part of v1's
behaviour that is a defect — silently writing students into an arbitrary one of two same-named groups
and reporting it as success — is not ported: such a row classifies `no_group` with "Several groups in
this season are named "X". Rename one of them, then import again." This row-level refusal is what
replaces Plan 18's `@@unique([seasonId, name])` (M2), which 05-R15 drops.

**Resolved (owner 2026-10-10): stays deferred with the uploads switch until the CMS lands; port v1's rules then.**
A spreadsheet that is read in memory and never stored still counts as an upload, so file intake
stays behind `ENABLE_UPLOADS` (off) with the rest of the uploads/CMS freeze. D-16.2, D-16.3 and
"Not in scope" bullet 1 are unchanged. The v1 rules to port when the CMS lands
*(v1 parity 2026-10-09; owner decision 2026-10-10: was "Awaiting owner (not changed)")*:
- 16-R1 (REG-48) — file intake (.csv/.xlsx picker, multipart route).
- 16-R2 (REG-48) — extension selects the parser.
- 16-R6 (REG-48) — only the first worksheet of an .xlsx is read.
- 16-R9 (REG-48) — `cellText` flattening of ExcelJS cells (D-16.2 still forbids porting it until then).
- 16-R10 (REG-48) — hyperlinked email cells resolve to the link target.

**Resolved (owner 2026-10-10): 16-R65, last-wins half — the row-level refusal stays.** A row whose
group name matches several groups in the season classifies `no_group` with the rename message
(D-16.19.1; Task 5 Steps 1 and 3), rather than v1's silent last-wins; nothing replaces M2
*(v1 parity 2026-10-09; owner decision 2026-10-10: was "Awaiting owner — confirm the refusal, or delete the ambiguity branch in Task 5 Step 3 for strict v1")*.
