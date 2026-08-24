# Plan 11 — Reports & Exports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every derived figure in domain 17 computed once on the server, from
**one** definition per metric held in `packages/shared`, with the season scope
resolved by intersection with the caller's permissions rather than by trusting
the query string — and both exports delivered to a phone as a server-generated
XLSX streamed under an `Authorization` header, written straight to disk by
`expo-file-system` and handed to the OS share sheet.

v1 has three disagreeing computations of "submission %", an attendance
percentage that can exceed 100, a cohort-wide personal-data export behind no
gate at all, and a spreadsheet cell that prints "minutes since an admin pressed
a button" under the header of a session date. This plan fixes all four, and
says in the file itself where v2's numbers will differ from v1's.

**Architecture:** Two backend layers and one screen. `lib/queries/reports.ts`
and `lib/queries/organisation-report.ts` hold the aggregations — constant query
counts, nothing per row, nothing per season. `lib/exports/` holds the two
workbook builders, which consume the *same* aggregation functions the screens
consume, so a number in a spreadsheet cannot disagree with the number on the
chart above it. `routes/reports.ts` holds the three JSON reads;
`routes/exports.ts` holds the two binary streams and the manifest. On the
mobile side `/reports` is one route with role branches, charts drawn on
`react-native-svg` primitives we own, and a download layer that never puts
bytes through JS memory.

**The one rule this plan exists to enforce:** a metric is defined in
`packages/shared` **once**, and both the JSON endpoint and the XLSX builder
call the same function. v1's failure mode was not that any single formula was
wrong — it was that the same name meant three arithmetics in three files, and
operators quoted whichever one they had open.

**Tech Stack:** Express 5, Prisma 7 (`src/generated/prisma`), Zod 3, `exceljs`
4.4 (new backend dependency), jest + supertest integration suite against the
shared staging DB; Expo SDK 54 / expo-router 6 (typed routes), React Query 5,
`react-native-svg` (already present from Plan 4), `expo-file-system` +
`expo-sharing` (new), RNTL 13 via `renderWithProviders`.

**Spec:** `docs/superpowers/specs/domains/17-reports.md` (110 rules; §4, §7 and
§10 D1–D17 are load-bearing),
`docs/superpowers/specs/domains/_DECISIONS.md` (**C1, C2, C3, C4, C5, C6, C7,
C8, C9, C11, C12** all bind here), and
`docs/superpowers/specs/domains/09-notes.md` for the engagement arithmetic this
domain consumes — **cited, never restated**. Scope from
`docs/superpowers/plans/2026-08-24-migration-roadmap.md` § Plan 11.

**Depends on:** **Plan 4** — it installs `react-native-svg` (as the peer of
`react-native-qrcode-svg`) *and* adds it to the Jest transform allow-list;
without that step the chart primitives in Task 9 have no renderer and the
component tests fail to transform. **Plan 8** — the per-student submission
percentage with the C5 targeted denominator is domain 9's field, consumed here
unchanged; this plan does not compute it and must not grow a second copy.
Starting this plan before either one is a wasted run, not a slow one.

Handed forward to **Plan 13** (`2026-08-24-plan-13-cutover.md`): the LATE-minute
number, the `ExportAudit` table, the `GroupStudent` uniqueness fix, the season
timezone column, and the materialised score — each blocked by C1, each listed in
the divergence ledger below with the migration that discharges it.

---

## Not in scope

- **No new screen route.** `/reports/students` (spec §9 row 2) is **not**
  built. The paged cohort endpoint ships — it is the fix for R34 — and the
  `/reports` screen pages through it inline with a "Show more" under the
  at-risk card. Adding a second route file widens the roadmap's "mobile:
  reports screen" to two screens for ten more rows.
- **No `/seasons/[code]` detail route** and no link from the organisation
  roll-up's season rows. The rows carry `code` on the contract (fixing R62/D13
  at the data layer) so wiring the link is one line when domain 2 lands the
  route. Linking to a route that does not exist would need `as Href`, which
  `CLAUDE.md` forbids.
- **No student or leader surface.** Both are refused explicitly by the
  endpoints (R109, R110, D6 #4). A leader-scoped "my group's engagement"
  report is a reasonable future feature and must not arrive by accident.
- **No attendance or engagement arithmetic.** `computeEngagementForSeason` is
  domain 9's (Plan 8). This plan *generalises its signature* to take a season
  list and consumes it; it does not reimplement a single line of the formula.
  The absence budget is domain 4's and is not rendered here at all.
- **No `ExportAudit` table, no `lateThresholdMinutes`, no `GroupStudent`
  uniqueness fix.** All three need a migration; see "Deferred to cutover".
- **No chart library.** See D-17.20.

---

## Subagent fan-out

Six waves. **Maximum two agents in flight at a time.** Integration tests are
**coordinator-only**: agents write the suites but do **not** run them, because
`cleanupTestData` is prefix-global and two suites running concurrently delete
each other's fixtures mid-test. The coordinator runs every integration suite
serially with `--runInBand` after merging each wave.

| Wave | Who | Tasks | Notes |
|---|---|---|---|
| 1 | **Coordinator only** | Task 1 (shared contracts), Task 2 (fixture cleanup) | Both touch files every later task imports: `packages/shared/src/index.ts` and `__tests__/integration/fixtures.ts`. Nothing else can start until these land. |
| 2 | **Agent A** ∥ **Agent B** | Task 3 (engagement aggregates + the `engagement.ts` generalisation), Task 4 (organisation aggregates) | Disjoint files. Agent A hands the coordinator a **fragment** for `lib/permissions.ts` — it does not edit that file. Both write their integration suites unrun. |
| 3 | **Coordinator** ∥ **Agent C** | Task 5 (the three JSON routes + `app.ts` + `openapi.ts`), Task 6 (the two workbook builders) | Task 5 touches two contention files and mounts routers, so the coordinator owns it. Task 6 touches only new files under `lib/exports/`. |
| 4 | **Coordinator only** | Task 7 (export routes, rate limit, audit log, manifest) | Mounts routers, edits `app.ts` and `openapi.ts`. Runs the full backend integration set serially for the first time. |
| 5 | **Agent D** ∥ **Agent E** | Task 8 (the `/reports` screen + hooks), Task 9 (the download/share layer + `ExportMenu`) | Both are mobile, both write unit tests they *may* run (`pnpm jest` in `apps/mobile` needs no database). They share one interface — `ExportMenu`'s props, fixed in Task 9's **Interfaces** block — and Task 8 imports it. The coordinator merges Task 9 first so Task 8's import resolves. |
| 6 | **Coordinator only** | Task 10 (closing gate: full suite, mutation pass, emit check, device pass) | |

**Contention files — coordinator applies these edits, always:**
`packages/shared/src/index.ts`, `apps/backend/src/lib/permissions.ts`,
`apps/backend/src/docs/openapi.ts`, `apps/backend/src/app.ts`,
`apps/backend/src/__tests__/integration/fixtures.ts`,
`apps/mobile/src/lib/query-keys.ts`,
`apps/mobile/src/__tests__/placeholder-screens.test.tsx`.
An agent that needs a change in one of these writes the exact fragment into its
report; it does not open the file.

---

## Global Constraints

- **`D:\Projects\JPC\jpc-space` is READ-ONLY.** Read it constantly; never
  write to it, never create a file in it, never run `git` there.
- **No migrations, ever.** Nothing under `apps/backend/prisma/` may be edited.
  The database is shared live with v1 (C1). This domain writes **no rows at
  all** (spec §6) and adds no model — which makes C1 easy here, except for the
  three defects whose clean fix is a column. Those go to Plan 13
  (`docs/superpowers/plans/2026-08-24-plan-13-cutover.md`), never into this
  plan's tasks.
- **A GET never writes (C6).** Every endpoint in this plan is a read. The
  export audit trail is an **application log line**, not a row — say so in the
  code comment, because "audit" reads like a table.
- **Never print a secret.** No `AUTH_SECRET`, `DATABASE_URL`,
  `GMAIL_APP_PASSWORD`, token, or password hash in a log line, a test, a
  fixture, an OpenAPI example, or a spreadsheet cell. The export audit line
  logs a user **id and role**, never an email; the workbooks contain student
  emails by design (that is what they are for) and are therefore rate-limited
  and gated.
- **Integration fixtures:** every id/name/email/code carries the
  `space-v2-test-` prefix; every `deleteMany` filters on that prefix. Use
  `createTestSeason` / `createTestUser` / `login` / `cleanupTestData` from
  `apps/backend/src/__tests__/integration/fixtures.ts`; `jest.setTimeout(60000)`
  (the shared Neon staging Postgres autosuspends and the first query after idle
  has been measured around 18 s).
- **Integration tests cannot run concurrently.** Every command in this plan
  that runs them carries `--runInBand`. There is no exception and no "just this
  once".
- **Backend *value* imports of `@space/shared` must use the relative path.** A
  bare `"@space/shared"` in a value position emits a `require("@space/shared")`
  that resolves at runtime to the TypeScript *source* rather than the compiled
  sibling under `dist/packages/shared/src/`, and the built server dies with
  `ERR_MODULE_NOT_FOUND` (`CLAUDE.md`). **The depth differs per directory** —
  count from the file to the repo root:
  - `apps/backend/src/routes/*.ts` → `"../../../../packages/shared/src/index"`
  - `apps/backend/src/lib/queries/*.ts` → `"../../../../../packages/shared/src/index"`
  - `apps/backend/src/lib/exports/*.ts` → `"../../../../../packages/shared/src/index"`

  `import type { … } from "@space/shared"` is erased at emit and stays legal.
  This plan adds value imports in **four** files (`lib/queries/reports.ts`,
  `lib/exports/season-workbook.ts`, `lib/exports/engagement-workbook.ts`,
  `routes/exports.ts`); each one names the trap in a comment.
- **Prisma client is `../generated/prisma/client`, never `@prisma/client`.**
- **No `process.env` outside `src/lib/config.ts`.** The organisation timezone
  is read as `config.orgTimezone` (Plan 3 adds it).
- **No `@/` path alias** in either app. Relative imports only.
- Response envelope `{ data }` / `{ error: { code, message } }` via
  `apiOk` / `apiError` — **including on the binary paths**: success is bytes,
  every failure is still the JSON envelope (spec §7).
- `src/docs/openapi.ts` changes in the **same commit** as the route it
  documents.
- Mobile: relative imports only; every response parsed with a Zod schema from
  `@space/shared`, never cast; dependent queries pass `enabled` and guard
  manual `refetch()`; tab screens pass `edges={["top","left","right"]}` to
  `Screen`; states map to `LoadingState` / `ErrorState` (`onRetry` wired to
  `refetch`) / `EmptyState`; tests use `renderWithProviders`; `jest.mock`
  factories may only close over consts named `mock*`; never `as Href` /
  `as any`.

---

## Prerequisites

This plan sits after Plans 3, 4, 5, 6 and 8 in the roadmap and consumes work
from all five. If any of these is missing, **stop and say so** rather than
reimplementing it — a second copy of any of them is exactly the drift C4 and
C8 exist to prevent.

| From | What | Used by |
|---|---|---|
| Plan 3 | `config.orgTimezone` and `apps/backend/src/lib/org-time.ts` (`formatInOrgTime`) | Task 6 extends that file with `formatDayInOrgTime` for workbook column headers (C2) |
| Plan 4 | `react-native-svg` in `apps/mobile/package.json` **and** in `jest.config.js`'s `transformIgnorePatterns` allow-list | Task 8's chart primitives. If absent: `cd apps/mobile && npx expo install react-native-svg` |
| Plan 5 | `canViewStudent` in `lib/permissions.ts`; the `/student/[id]` route file | Task 8's at-risk rows navigate to `{ pathname: "/student/[id]", params: { id } }` |
| Plan 6 | quiz routes and, critically, whether `cleanupTestData` already deletes quiz rows | Task 2 checks and adds it if not |
| **Plan 8** | `packages/shared/src/note.ts`: `engagementScoreSchema`, `EngagementScore`, `isAtRisk`, `AT_RISK_PCT`, `engagementRowSchema`, `EngagementRow`. And `apps/backend/src/lib/queries/engagement.ts`: `computeEngagementForSeason` | **Task 1 and Task 3 both build directly on these.** Task 3 generalises the query function's signature |

### A defect to fix in passing, from Plan 8

Plan 8's Task 4 writes `import { isAtRisk } from "@space/shared";` at the top
of `apps/backend/src/lib/queries/engagement.ts`. That is a **value** import
through the bare specifier — the exact `ERR_MODULE_NOT_FOUND` trap `CLAUDE.md`
documents, and it will not surface until someone runs the built server. Task 3
edits that file anyway; **fix the import to
`"../../../../../packages/shared/src/index"` in the same commit** and say so in
the report. Task 10's emit check greps for it.

---

## Divergence ledger — what this plan adopts, and what it refuses

Every row cites the rule or ruling it answers to. Read this before Task 1; the
tasks assume it. The **Decisions** section below expands the rows that need
argument rather than assertion.

| # | v1 behaviour | v2 | Authority |
|---|---|---|---|
| 1 | Three different arithmetics are all called "submission %" (bar chart per-assignment, engagement per-student, workbook per-student-over-every-assignment) | **Two** numbers, each defined once and named for what it is: per-student `submissionPct` (domain 9's, targeted denominator) and per-assignment `completionRate` | ruling **C5**, spec D2, R19–R26, R80 |
| 2 | Attendance trend divides a historic session by *today's* active roster and does not clamp, so `pct` exceeds 100 | Denominator is the roster **as it stood at that session's instant** (`enrolledAt <= startsAt` and `droppedAt` null-or-later); the numerator is restricted to that same set, so `pct <= 100` by construction and needs no clamp | spec D3, R10–R13 |
| 3 | Bar-chart numerator counts submissions from *any* student while the denominator counts targeted students, so the bar can exceed 100 | Numerator is intersected with the expected set | R23 |
| 4 | Assignment targeting reads `GroupStudent` (globally `@unique` — one group per student in the entire database) | Targeting resolves through `SeasonEnrollment.groupId` | ruling **C9**, R21 |
| 5 | `lateMinutes` measured from `checkInOpenAt`; the workbook prints it raw, per student per session | The workbook prints `"L"` for **every** `LATE` cell. The number returns at cutover, after the backfill | ruling **C3**, spec D1, R69–R71 |
| 6 | `loadReportsData` has **no authorization of any kind** and takes whatever season ids the caller passed | The endpoint **intersects** the requested ids with the caller's permitted set and queries the intersection. Never check-then-run | ruling **C8**, spec §4, D6 #1, R3 |
| 7 | `rawStudents` — every active student's name, email and scores — is returned to every caller including screens that render ten rows | The summary carries the capped at-risk list and counts only. The cohort is a separate, separately-gated, cursor-paged endpoint | spec D6 #2, R34 |
| 8 | MENTOR may pull any season's full workbook; the only thing stopping them is that one page does not render the button | **MENTOR is refused the workbook** in the endpoint. MENTOR keeps the engagement export, which is data v1 shows them on screen | spec D6 #3, R85, R86 |
| 9 | LEADER is excluded by the absence of a route | LEADER is refused **explicitly**, 403, before any query | spec D6 #4, R109 |
| 10 | SUPER cannot open the cross-season engagement screen, but the CSV route hands SUPER exactly that data | SUPER gets the engagement view. The inconsistency resolves toward what the export already permits | spec D17, R45 vs R106 — **deliberate divergence** |
| 11 | A soft-deleted season is fully exportable (`findUniqueOrThrow` on id alone) | `deletedAt: null` on the workbook's season lookup; `not_found` otherwise | spec D14, R81 |
| 12 | Two export formats; the CSV quotes with `JSON.stringify` (JSON escaping, not RFC 4180), joins with bare LF, and writes no BOM | **One format: XLSX.** `?format=csv` returns a legible 400 rather than a 404 | spec D7, D10, R40, R41 |
| 13 | The workbook is materialised as a `Buffer` and copied again into a `Uint8Array` | `workbook.xlsx.write(res)` — one materialisation, streamed | R83 |
| 14 | `Content-Disposition` interpolates `Season.code` unescaped | Percent-encoded, with an ASCII fallback plus `filename*=UTF-8''…` | spec D16, R84 |
| 15 | CSV filename is `engagement-<epoch-ms>.csv` | `engagement-<scope>-<yyyy-MM-dd>.xlsx`, built by **one** function in `packages/shared` that the server and the client both call | spec D16, R42 |
| 16 | Unpublished ONLINE quizzes become columns of blanks; `maxScore = 0` quizzes print a score but are excluded from the average | Both are excluded from the workbook entirely | spec D16, R74, R77 |
| 17 | A blank cell and an em dash both mean "no row"; nothing distinguishes "not applicable" from "missing" | Blank = "assigned, nothing submitted"; `n/a` = "not assigned to this student"; a **Key** sheet says so | spec D16, R82 |
| 18 | The at-risk cap of 10 is invisible — a reader cannot tell whether ten is all of them | `atRiskTotal` is returned; the screen renders "10 of 34" | spec D16, R33 |
| 19 | Bucket counts count enrolments, not students, so the pie's total exceeds the headcount | `cohortSize` (distinct students) ships beside `enrollmentCount`; the donut is labelled "enrolments" whenever the scope spans more than one season | spec D16, R32 |
| 20 | The engagement pie is semantic **by coincidence** — palette index order happens to line up with bucket seed order | An explicit `Record<EngagementBand, string>` keyed off the enum. Reordering the bands cannot repaint "High" red | spec D11, R92 |
| 21 | Every date label is `format(startsAt, "MMM d")` on the server — no year, and the reader sees the server's calendar day | Chart data carries raw ISO instants and the client formats; the **workbook** (whose headers the server writes) formats in `config.orgTimezone`. Year added everywhere | ruling **C2**, spec D12, R15, R68, R100, R101 |
| 22 | `ReportFilters.from`/`.to` exist and no caller passes them | Implemented, and joined by `trendLimit` — a windowed trend is what a phone needs | spec R4, R5, D9 |
| 23 | `totalStudents` counts student accounts and is labelled "Current students" | Field renamed `totalStudentsNotGraduated`; the query is unchanged so nobody's headline number moves | spec D4, R51 |
| 24 | `droppedCount` is a display rename of `WITHDRAWN` on the contract | `withdrawnCount` on the contract, "Dropped" on the label | spec §8, R54 |
| 25 | Neither export is rate-limited and neither records who exported what | Both are rate-limited per **user** and both log an audit line. The table is a cutover task | spec D15, R48, R88 |
| 26 | Both export routes answer an unauthenticated request with a **redirect** | 401 in the JSON envelope | spec §4, R87 |
| 27 | `_count: { attendance: true }` is selected on every session and never read | Deleted | R17 |
| 28 | Season links on the SUPER page point at `/super/seasons/<integer id>` and every one 404s | The contract carries `code` beside `id` | spec D13, R62 |
| 29 | `ChartLegend` is exported and never used; `computeEngagementBulk` is dead | Neither is ported | ruling **C12**, R99 |
| 30 | The export header `"Student"` cannot be re-imported by v1's own student importer, which matches the exact string `"name"` | **The header does not change.** `"Student"` is right for a human reading a spreadsheet. The importer alias is domain 16's half | spec D8, D16 |

---

## Decisions

Numbered `D-17.n`. Each states the question, the ruling, and the reason.
Deliberate divergence from v1 is expected and correct here — v1's report layer
is the least trustworthy code in the product. Silent divergence is not.

### D-17.1 — "Submission %" becomes two names, and the per-student one is domain 9's

**Question.** v1 computes three different numbers and calls all three a
submission percentage (spec D2). Which one wins, where is it defined, and what
happens to the other two?

**Ruling.**

1. **The per-student number is domain 9's `submissionPct`**, computed by
   `computeEngagementForSeasons` in `apps/backend/src/lib/queries/engagement.ts`
   (Plan 8). Denominator: assignments that are `isAllGroups` **or** target the
   student's group *for that season*, resolved through `SeasonEnrollment`
   (C9). This plan defines **no second per-student submission metric**. The
   engagement export, the at-risk list, the cohort endpoint and the workbook's
   `Submitted %` column all read this one field.
2. **The per-assignment number is renamed `completionRate`** and lives in
   `packages/shared/src/reports.ts` as `assignmentCompletionRowSchema`. It is a
   different unit — a property of an assignment, not of a student — and giving
   it a distinct name is the point. Its denominator is the count of `ACTIVE`
   enrolments the assignment targets; its numerator is non-`DRAFT` submissions
   **from students in that set**.
3. **v1's workbook denominator is abandoned.** v1 divided each student's
   turned-in count by *every* assignment in the season, targeting ignored
   (R78, R80). Under C5 an assignment a student was never given must not count
   against them.

**Where v2's numbers will differ from v1's, and why.**

| Figure | v1 | v2 | Who notices |
|---|---|---|---|
| Workbook `Submitted %` | `turnedIn ÷ every assignment in the season` | `completed ÷ assignments assigned to that student` | **Every student in a season containing at least one group-targeted assignment goes up.** In a season where every assignment is `isAllGroups`, nothing moves |
| Bar chart percentage | can exceed 100 (numerator from a different population than the denominator) | capped at 100 by construction | Anyone who saw a 130 % bar |
| CSV/export `Submission %` | already the targeted denominator (v1's engagement) | unchanged | nobody |

**Reason.** C5 is explicit: "completed submissions ÷ assignments targeted at
that student", and "any percentage that can exceed 100 is a bug, not a display
quirk — clamp is not the fix, the denominator is." The workbook's column header
becomes `Submitted % (assigned to student)` so a reader with a v1 file and a v2
file side by side can tell which is which without reading this document, and
the **Key** sheet spells out the change (D-17.14).

### D-17.2 — The at-risk list and the `AT_RISK` band are the same set, by construction

**Question.** Plan 8 ruled that "at risk" is one definition, component-wise:
`attendancePct < 60 || submissionPct < 60`, with zero-denominator guards. v1's
reports screen instead bands the *composite* into High ≥ 80 / Medium ≥ 60 /
Low ≥ 40 / At risk < 40 (R30) and lists `score < 60` as at-risk (R33). Those
are three thresholds and two definitions on one screen.

**Ruling.** `bandFor` in `packages/shared/src/reports.ts` evaluates
`isAtRisk` **first**:

```
AT_RISK   when isAtRisk(score)                    — domain 9's one definition
HIGH      when score.score >= 80
MEDIUM    when score.score >= 60
LOW       otherwise
```

The at-risk list is then literally `rows.filter(r => r.band === "AT_RISK")`.
Band membership and list membership cannot disagree because there is only one
predicate. The row contract carries `band` and **not** a separate `atRisk`
boolean — two fields meaning one thing is how this domain got into trouble.

**Reason.** Ruling C4 ("when two domains need the same derived value, it is
defined in one place and both consume it") and spec D5 ("whatever threshold is
chosen, the two screens must not be able to disagree"). Under v1 a student at
55 attendance / 95 submissions is "Medium" on `/reports` and at-risk on
`/mentor/dashboard`, reachable from the same tab bar.

**Consequence to state out loud:** the AT_RISK slice of v2's donut will be
**larger** than v1's, because a component-wise test catches students the
composite hides. That is the intended behaviour, not a regression.

**Edge case, decided:** a student with no past sessions *and* no targeted
assignments has both denominators zero, `isAtRisk` returns false (Plan 8's
guard, fixing R56), the composite is 0, and they band `LOW`. "Low" is a weak
label for "no data yet", but inventing a fifth band changes the pie's category
count and the contract; the Key sheet and the screen's method note say that a
season with no activity bands everyone `LOW`.

### D-17.3 — The attendance trend's denominator is historical, so the chart cannot exceed its own axis

**Question.** v1 divides a session from week one by today's `ACTIVE` roster
(R10, R11) while counting attendance rows from students who have since
withdrawn (R12), and clamps nothing.

**Ruling.** For each session, the denominator is the set of `SeasonEnrollment`
rows in that session's season with `enrolledAt <= session.startsAt` **and**
(`droppedAt` is null **or** `droppedAt > session.startsAt`), regardless of
current `status`. The numerator counts `PRESENT`/`LATE` attendance rows whose
`studentUserId` is in that set. `presentCount <= expectedCount` therefore holds
by construction and **no clamp is applied** — a clamp would hide the next bug.

`pct` is **`null`**, not `0`, when `expectedCount === 0` (fixing R13): a
session that ran before anybody enrolled has no attendance percentage, and
plotting it at zero draws a cliff that never happened.

**Reason.** Spec D3. Both columns exist already (`prisma/schema.prisma:346-348`
— `enrolledAt`, `droppedAt`), so this needs no migration and C1 is satisfied.
"A chart that exceeds its own axis destroys trust in every other number on the
page."

**Deliberate divergence to record:** v2's trend will read **lower** than v1's
for a season that has lost students and **higher** for one that has grown.
Neither system is right about the past for the other's reason; v2 is right.

### D-17.4 — Season scope is an intersection, never a check followed by an unfiltered query

**Question.** `loadReportsData` takes an integer array and returns those
seasons' data with no gate (R3). In v2 that array arrives from a phone.

**Ruling.** `reportScopeFor(user)` in `lib/permissions.ts` returns the caller's
**permitted** scope — `{ kind: "all" }` for SUPER and MENTOR,
`{ kind: "seasons", seasonIds: user.seasonAdminIds }` for ADMIN, and `null` for
LEADER and STUDENT. `resolveReportScope(scope, requestedIds)` then queries
`Season` with `deletedAt: null` **plus** the permitted filter, and intersects
the result with `requestedIds`. The intersection is what the aggregations
receive. There is no code path in which a requested id reaches a `where`
clause without having survived that intersection.

A requested id the caller may not see, or that does not exist, or that is
soft-deleted, is **silently dropped** and `resolvedScope.truncated` is set
true. It is not a 403 and not a 404.

**Reason.** Spec §4 item 1: "for a multi-season request, intersecting is safer
than rejecting, because it cannot be turned into an existence oracle." A 403
distinguishing "exists but not yours" from "does not exist" lets any admin
enumerate the season table. `truncated` gives the screen enough to say "some
seasons you asked for are not in your scope" without saying which.

This also fixes R46: v1 answered an unknown season id with a **header-only CSV
and HTTP 200**, which reads as "this season has no students".

### D-17.5 — The summary and the cohort are different endpoints, and the cohort is paged

**Ruling.** `GET /api/v1/reports/engagement` returns the charts, the band
counts, the **capped** at-risk list (10), `atRiskTotal`, `cohortSize` and
`enrollmentCount`. `GET /api/v1/reports/engagement/students` returns the full
per-enrolment rows, cursor-paged, default 50, max 200, gated separately by the
same `reportScopeFor`.

The cursor is an opaque base64 of a numeric **offset** into a stable ordering
(`score` ascending, then `studentUserId`, then `seasonId`). The underlying row
set is computed whole in a constant number of queries either way, so an offset
cursor costs nothing and a keyset cursor would buy nothing — say that in the
code comment so a future reader does not "fix" it into a keyset.

**Reason.** Spec D6 #2, R34. In v1 `rawStudents` never leaves the server; the
confidentiality of the other rows is enforced by server rendering, not by a
query. An endpoint returning `ReportsData` verbatim ships the whole cohort to
the device on every screen mount — and React Query mounts on focus and on
reconnect.

### D-17.6 — MENTOR is refused the season workbook; SUPER is granted the engagement report

Two role changes, in opposite directions, both deliberate.

**MENTOR loses the workbook.** v1's endpoint allows MENTOR any season's
workbook (R85) and the only thing preventing it is that `/mentor/reports` does
not render the button (R86). A mentor's remit is read-all-**students**; a
season workbook is also every quiz score and every assignment status, which is
nearer a leader's remit. `canExportSeasonWorkbook` is `isAdminOfSeason` and
nothing else — which admits SUPER (it short-circuits inside `rbac.ts`) and the
season's own ADMIN. Spec D6 #3.

**SUPER gains the engagement report.** v1 gates `/mentor/reports` to MENTOR
only (R106), so SUPER cannot open the cross-season engagement screen — while
the CSV route hands SUPER exactly that data with no season parameter (R45) and
`/admin/season/[code]/reports` shows SUPER any single season's version (R108).
That is an artefact of a per-role page tree, not a policy.
`packages/shared/src/navigation.ts:57` already puts `/reports` in SUPER's
sidebar. Spec D17.

**Both are divergences from v1 and must be stated in the implementation
report**, because someone diffing the two systems will otherwise read the
second one as a leak.

Full matrix, as implemented:

| Endpoint | SUPER | MENTOR | ADMIN | LEADER | STUDENT |
|---|---|---|---|---|---|
| `GET /reports/engagement` | all seasons | all seasons | ∩ `seasonAdminIds` | **403** | **403** |
| `GET /reports/engagement/students` | all seasons | all seasons | ∩ `seasonAdminIds` | **403** | **403** |
| `GET /reports/organisation` | yes | **403** | **403** | **403** | **403** |
| `GET /reports/engagement/export` | all seasons | all seasons | ∩ `seasonAdminIds` | **403** | **403** |
| `GET /seasons/:id/exports/workbook` | yes | **403** | own season only | **403** | **403** |
| `GET /seasons/:id/exports/manifest` | yes | **403** | own season only | **403** | **403** |

### D-17.7 — One export format. CSV is not ported

**Ruling.** Both exports are XLSX. `exportFormatSchema` is `z.enum(["xlsx"])`
— a one-member enum on purpose, so `?format=csv` produces
`bad_request` 400 with a message naming XLSX, rather than a 404 that reads as
"the export is broken".

**Reason.** Spec D7 + D10. v1's `toCsv` quotes with `JSON.stringify`, which
emits `\"` for an embedded quote — no CSV parser accepts that — doubles
backslashes, joins with bare LF, and writes no BOM, so Excel on Windows decodes
the file as the system codepage and mangles every non-ASCII name. For this
organisation's roster that is most of them. Fixing CSV means quoting, line
endings, BOM, and a test with a quote and a non-Latin script; **or** we use the
`exceljs` path that has to exist anyway for the workbook and get all of it
free. One format, one MIME type, one UTI, one share flow, one code path.

### D-17.8 — Delivery on a phone: `downloadResumable` with an `Authorization` header, then the share sheet

**Ruling.** `apps/mobile/src/lib/export-download.ts`:

1. `FileSystem.createDownloadResumable(url, fileUri, { headers: { Authorization } }, onProgress)` from **`expo-file-system/legacy`**, then `.downloadAsync()`. The response body goes straight to disk; the bytes never enter the JS heap.
2. On HTTP 401 exactly once: `refreshAccessToken()` and retry. A second 401 throws `ExportAuthError`.
3. On any other non-2xx: read the (small) written file, parse the JSON envelope, throw with the server's `error.code`, delete the file.
4. `Sharing.isAvailableAsync()` → `Sharing.shareAsync(uri, { mimeType, UTI, dialogTitle })`.
5. `finally`: `deleteAsync(uri, { idempotent: true })`.

**Never fetch-then-base64.** Fetching an `arraybuffer` and base64-encoding it
to write costs ~1.33× the file size in JS heap *on top of* the buffer itself,
for a students × (sessions + quizzes + assignments) matrix. This is the
roadmap's stated done-criterion for Plan 11 and Task 10 mutation-tests it.

**The legacy import path is pinned deliberately.** Expo SDK 54 ships a new
`File`/`Directory` API as `expo-file-system` with the previous one at
`expo-file-system/legacy`. `createDownloadResumable` — the only API here that
gives both request headers and progress callbacks — is the legacy one. A
half-migrated file layer is a class of bug that only appears on a real device,
so the import path is written once, in one module, and every other file goes
through that module. Spec D10.

**The token travels as a header, never in the URL.** A signed query-string
download URL opened in the system browser would work and is forbidden: it puts
a credential in a URL. This is why the export is a normal authenticated `GET`
and the client does the download.

**The cache directory is a courier, not a record.** The file is deleted after
the share sheet dismisses and there is no "previous exports" list.

**`ENABLE_UPLOADS` does not gate any of this.** `CLAUDE.md` is explicit that
the flag gates `POST /api/v1/submissions/:publicId/files` only — "Only
uploading is gated — reading and deleting recorded files still work." These
endpoints produce bytes from database rows and touch no `Storage` driver. Say
so in the route comment, because the obvious wrong assumption is that a flag
named "uploads" covers all file movement.

### D-17.9 — Timezone: instants on the wire, `config.orgTimezone` on the server, and no `?tz=`

**Question.** Spec §7 proposes a `?tz=` parameter carrying the caller's IANA
zone. Ruling C2 says every wall-clock derivation resolves against a single
organisation timezone read from config, "never the device's zone".

**Ruling.** **C2 wins; `?tz=` is not implemented.**

- Chart data carries raw ISO instants (`startsAt`) plus the session title. The
  client formats for display with `formatDate` and derives nothing.
- The **workbook** has no client-side formatting step — the server writes the
  header text — so its date columns are formatted with
  `formatDayInOrgTime(date)`, which is `Intl.DateTimeFormat` pinned to
  `config.orgTimezone`.
- The `startsAt <= now` boundary is an instant comparison and is
  zone-independent; it is unaffected either way.
- **The year is added to every date label.** `MMM d` alone is ambiguous across
  seasons (R15, R68) and this is the moment to fix it.

**Reason.** C2 exists precisely so that "a student in a different timezone
[does not see] a different deadline from their leader". A `?tz=` parameter
means two operators exporting the same season on the same day get workbooks
whose columns are labelled with different dates — the failure C2 forbids,
re-introduced by a query parameter. Flag for domain 2: if a season ever gains
its own timezone column, the report should prefer it over the organisation's.
That is a cutover-era change, not this plan's.

**Divergence from the spec, not from v1** — record it as such in the report.

### D-17.10 — The `LATE` cell prints `"L"`, and the number returns at cutover

**Question.** Ruling C3 corrects the lateness *instant* (`session.startsAt`,
not `checkInOpenAt`) and accepts that v1-era and v2-era rows will mean
different things in the same column while both systems run. The workbook is the
only surface in the product that exposes `lateMinutes` cell-by-cell (R69, R70).

**Ruling.** Every `LATE` attendance cell renders the literal string `"L"`,
matching the null fallback v1 already has. The minute count is **withheld**,
and the Key sheet says why in one sentence an operator can act on.

**Reason.** C3's closing line: "Reports must not present v1-era and v2-era
`lateMinutes` as one series without saying so." There is no column that
distinguishes the eras — adding one is a migration, which C1 forbids — so the
workbook *cannot* say so per cell. The alternative is a spreadsheet column
where some numbers mean "minutes after the session started" and others mean
"minutes after an admin pressed a button", with no way to tell which, exported
to a tool where a reader will sort, average and chart them. Spec D1's own
option (ii).

Two things fall out for free: the session columns stop holding mixed cell types
(R71 — a spreadsheet sorts and filters such a column unpredictably), and the
percentage columns are unaffected, because they pool `PRESENT` with `LATE` and
never read `lateMinutes` (R14, R73).

**Cutover task, Plan 13:** backfill `lateMinutes` against `session.startsAt`
and add `lateThresholdMinutes`; then restore the numeric cell **and** change
the column header in the same release. An export that changes meaning between
releases without changing its header is worse than one that never had the
column.

### D-17.11 — Query budget: constant in cohort size **and** in season count

v1 costs `1 + 1 + S + 1 + A + 1 + 4E` round trips per report load, of which
`S + 4E` are strictly **sequential** (R10, R24, R29), plus two unbounded
row-fetches on the SUPER page (R55, R57) and one on the engagement page (R17).
It is already the slowest page in v1; under React Query it becomes the slowest
page *repeatedly*, on cellular, for the role whose tab bar it sits in.

**Ruling.** The engagement summary costs **eleven** queries — six of its own
plus the five inside `computeEngagementForSeasons` — and none of them is per
row, per student, or per season. The organisation roll-up costs **four**, in
two concurrent waves. The season workbook costs **ten** (its own five, plus one
`computeEngagementForSeasons` call).

Spec §5 asks for four and three. This lands higher, and the reason is worth
stating rather than hiding:

- It computes strictly more than v1 did: per-session historical rosters (D-17.3)
  and per-assignment expected sets (D-17.1) are extra data, not extra loops.
- It **reuses** domain 9's function rather than duplicating its arithmetic
  inline to save a round trip. Five queries that agree with the engagement
  screen beat four that quietly do not (C4).

The load-bearing property is not the number; it is that **the number does not
move when the cohort grows**. A mentor's unscoped view costs the same eleven
queries for four hundred students as for four.

Replaced, per spec D9's table:

| v1 | v2 |
|---|---|
| `session.findMany` + JS filter over every attendance row in scope (R17) | one `attendance.findMany` bounded by the **trend window** (≤ `trendLimit` sessions), selecting two columns |
| sequential `seasonEnrollment.count` per season (R10) | one `seasonEnrollment.findMany` over the scope, reused for the roster windows, the targeting map and the cohort size |
| one `count` per assignment (R24) | in-memory set intersection against that same enrolment fetch |
| four queries per enrolment (R29) | `computeEngagementForSeasons` — five, total |
| every enrolment row fetched to tally three statuses (R55) | `seasonEnrollment.groupBy({ by: ["seasonId", "status"] })` |
| every alumnus row fetched to count by year (R57) | `user.groupBy({ by: ["graduationYear"] })` — which yields **both** headline counts and the by-year table from one query |
| unused `_count: { attendance }` (R17) | deleted |

The one row-fetch that remains is `GroupLeader` for the distinct-leader count
(R56): "distinct users per season" is not expressible as a Prisma `groupBy`
across the `Group` join. It is bounded by leader assignments, which is small,
and the code says so.

### D-17.12 — The trend is windowed, and `from`/`to` are implemented rather than deleted

v1's `from`/`to` are dead code — no caller passes them (R5). Spec D9 notes that
a date window is precisely what the mobile screen needs, so this is "a feature
to implement, not to remove".

**Ruling.** `?from=` / `?to=` (ISO datetimes) narrow the attendance trend and
nothing else — v1's intended semantics (R4). In addition, `?trendLimit=`
(default **26**, max 200) takes the **most recent** N sessions in the window,
ordered ascending for display. `resolvedScope.truncated` does not cover this;
the trend carries no flag, because "most recent 26" is the documented default
rather than a silent truncation.

26 is one point per week for a two-term season and fits a 375 px axis.

**Implementation trap, called out because it is easy to write and hard to see:**
the `to` bound and the `startsAt <= now` bound are both `lte` on the same
field. Spreading them into one object silently drops `now`:

```ts
// WRONG — `to` overwrites `lte: now`, so a future `to` un-bounds the query.
startsAt: { lte: now, ...(to ? { lte: to } : {}) }
```

Take the minimum first (see Task 3, Step 3).

### D-17.13 — `expectedCount === 0` yields `null`, not `0`

Three places in v1 return `0` where the honest answer is "there is nothing to
divide by": the trend when a season has no active enrolments (R13), a targeted
assignment with no `AssignmentTarget` rows (R22), and the workbook's averages.

**Ruling.** `attendancePoint.pct` and `assignmentCompletion.completionRate` are
`number | null`. `null` renders as `—`. The workbook's `Average %` stays the
empty string when nothing qualifies (v1's behaviour, R76 — correct already).

**Reason.** `0 %` is a claim about the cohort; `null` is a statement about the
data. R22's case is the sharpest: a targeted assignment with no target rows
shows "0 % submitted", which reads as total cohort failure and is actually a
mis-configured assignment.

### D-17.14 — The workbook grows a fourth sheet: `Key`

**Question.** Spec D16 says keep one symbol for "no row" and put its meaning in
a legend row. R63 says the workbook has exactly three sheets.

**Ruling.** Four sheets: `Attendance`, `Grades`, `Assignments`, `Key`. A legend
row inside a data sheet breaks sorting and filtering — the two things an
operator opens a spreadsheet to do. The `Key` sheet carries:

- the cell symbols (`P`, `A`, `L`, blank, `n/a`) and exactly what each means;
- `REPORT_METRIC_NOTES` from `packages/shared` — the same sentences the mobile
  screen's "How these numbers are calculated" disclosure renders, so the
  spreadsheet and the app cannot describe the same metric differently;
- the season, the scope, and the generation instant formatted in
  `config.orgTimezone`.

`REPORT_METRIC_NOTES` living in `packages/shared` and being rendered by both a
Node XLSX builder and a React Native `<Text>` is the same C4 discipline applied
to prose: one definition, two renderers.

This is a **deliberate divergence from R63** and is recorded as such.

### D-17.15 — The Assignments sheet distinguishes "not assigned" from "nothing submitted"

**Ruling.** Columns stay one per assignment in the season (a spreadsheet's
column set must be uniform across rows). The cell is:

| Cell | Meaning |
|---|---|
| `Submitted` / `Reviewed` / `Returned` / `Draft` | the submission's status |
| *(blank)* | assigned to this student, nothing submitted |
| `n/a` | **not** assigned to this student |

`Submitted % (assigned to student)` divides by the non-`n/a` count — which is
exactly domain 9's `submissionPct` (D-17.1), and is read from the engagement
row rather than recomputed, so the two cannot drift.

**Reason.** Spec D16/R82: "a blank cell and an em dash both mean 'no row
found'; there is no distinction between 'not applicable to this student' and
'data missing'." v1's em dash is dropped because `—` and blank were the same
claim; the em-dash glyph is reused for nothing.

### D-17.16 — Filenames are built by one function that both sides call

**Ruling.** `exportFilename(kind, scopeLabel, isoDay)` lives in
`packages/shared/src/reports.ts`. The server uses it for
`Content-Disposition`; the client uses it for the local cache filename it must
choose **before** it can see a response header. They cannot diverge because
there is one function.

`Content-Disposition` carries both an ASCII-sanitised `filename=` and an
RFC 5987 `filename*=UTF-8''<percent-encoded>` (fixing R84's unescaped
interpolation of `Season.code`).

On a phone the filename is what the user sees in the share sheet and later in
Files, and it is the only label the file will ever carry — so
`engagement-<scope>-2026-08-24.xlsx`, never `engagement-1756012800000.csv`.

### D-17.17 — The workbook streams, and nothing tries to send an envelope after the first byte

**Ruling.** `await workbook.xlsx.write(res)` then `res.end()`. Every
authorization, existence and soft-delete check completes **before** a single
response header is set. After headers are sent, a thrown error destroys the
socket and logs; it does **not** attempt a JSON envelope, because a JSON
fragment appended to a partial XLSX is a corrupt file that a client cannot
distinguish from a truncated download.

**Reason.** R83: v1 materialises a `Buffer` and copies it again into a
`Uint8Array` — two full in-memory copies of the matrix. One materialisation
inside `exceljs` is unavoidable without the streaming writer; the second copy
is not.

### D-17.18 — Rate limit per **user**, audit to the application log

**Ruling.** `exportLimiter` — `windowMs: 15 * 60 * 1000, limit: 10` — mounted
**after** `requireAuth` and keyed on `req.user.userId`, reusing
`rateLimitHandler`'s `too_many_requests` 429 envelope.

Keying on IP would bucket an entire office behind one NAT together, and would
drag in express-rate-limit's IPv6 key normalisation for no benefit. Mounting
after `requireAuth` guarantees the key exists.

Every successful export logs one line:

```json
{"event":"export.completed","actorId":42,"actorRole":"ADMIN","kind":"season-workbook","seasonIds":[7],"rowCount":38}
```

**No names, no emails, no filename.** The line answers "who exported the
cohort, and when" (spec §6) without becoming a second copy of the data.

**Cutover task, Plan 13:** the `ExportAudit` table (actor, scope, format, row
count, timestamp). Spec D15: "Do not let 'we cannot add a table yet' become
'we shipped bulk personal-data export with no record of it'."

### D-17.19 — Band → colour is an explicit map keyed off the enum

**Ruling.** `apps/mobile/src/lib/report-colors.ts` exports
`bandColor(theme, band)` backed by a `Record<EngagementBand, string>` reading
theme tokens. No index-keyed palette anywhere.

**Reason.** R92: v1's engagement pie is semantic **by coincidence** —
`categoricalPalette`'s array order happens to line up with the `Map` seed order
in `reports-query.ts:155-160`, so reordering the seed would silently paint
"High" red. Spec D11 names this "the one thing in `chart-colors.ts` that must
survive the React Native swap, and it must survive as an explicit band→colour
map, not as an index."

Note the collision v1 left behind (R96): `AttendancePill` reads green / red /
amber for Present / Absent / Late while `categoricalPalette` indices 0–2 are
green / **teal** / amber, so colouring an attendance chart from the palette by
index would paint `ABSENT` teal. Nothing in this plan colours anything by
attendance status; if a later domain does, it must build its own explicit map.

Every colour comes from the theme, not a baked hex — v1's only theme-aware
chart surface is the tooltip (R95), and on mobile dark mode is the norm.

### D-17.20 — No chart library

**Question.** Spec D11 recommends `react-native-gifted-charts`.

**Ruling.** **No chart dependency.** Three small components under
`apps/mobile/src/components/charts/`, built on `react-native-svg` (already a
dependency and already in the Jest transform allow-list from Plan 4):

- `TrendLine` — polyline + dots, ~80 lines.
- `BandDonut` — four `strokeDasharray` arcs on one circle, ~70 lines.
- `RankedBars` — plain `View`s with proportional widths. **Not SVG at all.**

**Reason.** Of v1's four charts, §9 already replaces two with lists: the
submission bar chart becomes a horizontal bar list (free-text assignment titles
will not fit an axis at 375 px) and the seasons pie becomes a ranked bar list
(one labelled slice per season on a 240 px square is unreadable past four
seasons, and the palette wraps back to green on the fifth — R93, R97). That
leaves one line and one four-slice donut. Against that:

- `react-native-gifted-charts` pulls `react-native-linear-gradient`, a native
  module that must be added to the dev client, for gradients we do not use;
- every colour must come from the theme (D-17.19), which is a fight with a
  library's prop surface and trivial in our own component;
- `transformIgnorePatterns` has to be extended for each new RN package, and a
  Jest transform failure on a chart library is a bad first experience for the
  next agent;
- our own components can carry `accessibilityLabel`s describing the data, so
  the screen test asserts on **values** rather than on SVG geometry.

Revisit only if a later domain needs something Skia-shaped.

### D-17.21 — `name` is not nullable

v1's `AtRiskRow.name` is `string | null` and `reports-view.tsx:91` falls back
to the email (R36). `User.name` is `String` **NOT NULL**
(`prisma/schema.prisma:106`). The contract uses `z.string()` and the screen
renders the name directly. A `.nullable()` here would invent a case the
database cannot produce, and every consumer would then carry a fallback for it.

### D-17.22 — Unpublished and zero-max quizzes are excluded from the workbook

`Quiz.publishedAt` is documented in the schema as the draft marker for ONLINE
quizzes ("students only see published quizzes",
`prisma/schema.prisma:653-654`) and the export ignores it (R74), so an
unpublished quiz becomes a column of blanks that reads as a cohort-wide failure
to sit it. A `maxScore = 0` quiz prints its score but is excluded from the
average (R77) — a denominator of zero is not a grade.

**Ruling.** The workbook's quiz query filters
`OR: [{ kind: "PAPER" }, { kind: "ONLINE", publishedAt: { not: null } }]` and
`maxScore: { gt: 0 }`. Both exclusions are in the `where`, not in a JS filter,
so the column never exists rather than existing and being ignored. Spec D16.

### D-17.23 — Season row ordering and collation are pinned

v1 sorts workbook rows with `a.name.localeCompare(b.name)` and **no locale
argument** (R65), so ordering across mixed scripts follows whatever collation
the server's ICU default happens to be — which differs between a developer
laptop and a container.

**Ruling.** One module-level `new Intl.Collator("en", { sensitivity: "base" })`,
reused. Two servers exporting the same season produce byte-identical row order.

### D-17.24 — The export header stays `"Student"`

Spec D8 verified that this domain's own export cannot be fed back into this
system's student importer: every sheet's first column is headed `"Student"`,
the importer lower-cases each header and matches the exact string `"name"`, so
`nameCol` stays `-1` and the import throws *"The file needs a header row with
'name' and 'email' columns"* — naming a column that is plainly there under a
different label.

**Ruling.** **The header does not change.** `"Student"` is the right label for
a human reading a spreadsheet, and a file produced for reading should not be
contorted into a file produced for machine round-tripping. The one-word fix
(adding `student` to the importer's aliases) is domain 16's, per its D14.

Recorded here so a future reader does not "fix" the export instead.

---

## Deferred to cutover — needs a schema column (C1)

Each of these is blocked by the migration freeze while v1 writes to the shared
database. They belong to
`docs/superpowers/plans/2026-08-24-plan-13-cutover.md`, not to any task below.

| # | What | Column(s) needed | Why it is blocked here |
|---|---|---|---|
| 1 | **Restore the numeric `LATE` cell in the workbook** (D-17.10) | a backfill of `Attendance.lateMinutes` against `session.startsAt`, plus `Season.lateThresholdMinutes` | Until v1 stops writing `checkInOpenAt`-relative minutes, the column holds two incompatible meanings with nothing to distinguish them (C3). Restore the number **and** change the column header in the same release |
| 2 | **`ExportAudit` table** (D-17.18) | a new model: `actorUserId`, `kind`, `scope`, `rowCount`, `createdAt` | C1 forbids a new table. Until then the audit is an application log line at info severity |
| 3 | **`GroupStudent` per-season uniqueness** | drop `@unique` on `GroupStudent.studentUserId`, add `(studentUserId, seasonId)`, backfill from `SeasonEnrollment` | This plan never reads `GroupStudent` — every targeting question resolves through `SeasonEnrollment` (C9) — so nothing here depends on the fix. Recorded because v1's bar-chart denominator (R20, R21) does, and the two systems will therefore disagree on that one figure until cutover |
| 4 | **A season timezone** (D-17.9) | `Season.timezone` | The report would prefer a season's own zone over the organisation's, so a cohort's numbers do not change depending on who is looking. Flagged to domain 2, not specced here |
| 5 | **A materialised engagement score** | a stored score column or a snapshot table | Ship the aggregation now (D-17.11); materialise only if real cohort sizes demand it, post-freeze. Spec D9, domain 9 D10 |

Nothing else in domain 17 is schema-blocked. Every other defect in the spec's
110 rules is fixed inside the current schema by the tasks below, or is
explicitly refused with a reason.

---

### Task 1: Contracts — `packages/shared/src/reports.ts`

**Wave 1 · Coordinator only** (touches `packages/shared/src/index.ts`).

**Files:**
- Create: `packages/shared/src/reports.ts`
- Modify: `packages/shared/src/index.ts` (one export line)
- Test: `packages/shared/src/__tests__/report-schemas.test.ts`

**Interfaces:**
- Consumes: `seasonStatusSchema` from `./enums`; `engagementScoreSchema`,
  `isAtRisk`, `AT_RISK_PCT`, `type EngagementScore` from `./note` (Plan 8).
- Produces (exact names every later task imports): `engagementBandSchema` /
  `EngagementBand`; `BAND_ORDER`; `BAND_LABEL`; `bandFor`;
  `reportScopeQuerySchema` / `ReportScopeQuery`; `resolvedScopeSchema` /
  `ResolvedScope`; `attendancePointSchema` / `AttendancePoint`;
  `assignmentCompletionRowSchema` / `AssignmentCompletionRow`;
  `engagementBandCountSchema`; `engagementReportRowSchema` /
  `EngagementReportRow`; `engagementSummarySchema` / `EngagementSummary`;
  `engagementStudentPageSchema` / `EngagementStudentPage`;
  `engagementStudentsQuerySchema`; `seasonEnrollmentCountSchema`;
  `alumniByYearRowSchema`; `organisationReportSchema` / `OrganisationReport`;
  `exportFormatSchema`; `exportKindSchema` / `ExportKind`; `XLSX_MIME`;
  `XLSX_UTI`; `exportFilename`; `exportManifestSchema` / `ExportManifest`;
  `REPORT_METRIC_NOTES`.

**One file, and it is not domain 9's.** Spec §8 is explicit that the engagement
score shape belongs to domain 9 and "this domain's per-student report row must
be built from it … not defined afresh. Two definitions of the same six fields
is exactly how the two systems end up quoting different numbers." So
`engagementReportRowSchema` is `engagementScoreSchema.extend({ … })` and this
file declares **no** percentage arithmetic of its own except `bandFor`, which
delegates its only interesting branch to `isAtRisk`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/__tests__/report-schemas.test.ts
import {
  BAND_ORDER,
  attendancePointSchema,
  assignmentCompletionRowSchema,
  bandFor,
  engagementBandSchema,
  engagementReportRowSchema,
  exportFilename,
  exportFormatSchema,
  organisationReportSchema,
  reportScopeQuerySchema,
} from "../index";

/** A perfect score, cloned and dented per case. */
const perfect = {
  score: 100,
  attendancePct: 100,
  submissionPct: 100,
  attendanceTotal: 10,
  attendancePresent: 10,
  submissionsExpected: 10,
  submissionsCompleted: 10,
};

describe("engagementBandSchema", () => {
  it("has exactly the four bands, as enum members and not display strings", () => {
    expect(engagementBandSchema.parse("AT_RISK")).toBe("AT_RISK");
    // v1 emitted "At risk" — a display string used as a map key, which is why
    // the pie's colours were positional (R30, R92).
    expect(engagementBandSchema.safeParse("At risk").success).toBe(false);
  });

  it("orders the bands High → Medium → Low → At risk, including empty ones", () => {
    expect([...BAND_ORDER]).toEqual(["HIGH", "MEDIUM", "LOW", "AT_RISK"]);
  });
});

describe("bandFor — the at-risk band IS the at-risk list (D-17.2)", () => {
  it("bands a component-weak student AT_RISK even though the composite says Medium", () => {
    // 55% attendance, 95% submissions → composite 75. v1's reports screen
    // called this student "Medium" and listed them nowhere, while the mentor
    // dashboard called them at-risk from the same tab bar (spec D5, R33).
    expect(bandFor({ ...perfect, attendancePct: 55, submissionPct: 95, score: 75 })).toBe(
      "AT_RISK",
    );
  });

  it("bands on the composite once the at-risk test has been passed", () => {
    expect(bandFor({ ...perfect, score: 100 })).toBe("HIGH");
    expect(bandFor({ ...perfect, attendancePct: 70, submissionPct: 70, score: 70 })).toBe(
      "MEDIUM",
    );
    expect(bandFor({ ...perfect, attendancePct: 60, submissionPct: 60, score: 60 })).toBe(
      "MEDIUM",
    );
  });

  it("does not flag a season that has not started yet (zero denominators)", () => {
    // v1 scored a season with no past sessions at 0% attendance and banded the
    // entire cohort "At risk" on day one (R56). Plan 8's guard covers it, and
    // banding must inherit the guard rather than re-testing the percentage.
    expect(
      bandFor({
        score: 0,
        attendancePct: 0,
        submissionPct: 0,
        attendanceTotal: 0,
        attendancePresent: 0,
        submissionsExpected: 0,
        submissionsCompleted: 0,
      }),
    ).toBe("LOW");
  });
});

describe("engagementReportRowSchema", () => {
  it("carries band and NOT a separate atRisk boolean", () => {
    const row = {
      ...perfect,
      studentUserId: 5,
      name: "Test student",
      email: "space-v2-test-a@jpc.test",
      seasonId: 7,
      seasonTitle: "Spring 2099",
      band: "HIGH" as const,
    };
    const parsed = engagementReportRowSchema.parse({ ...row, atRisk: true });
    // Two fields meaning one thing is how this domain got into trouble; the
    // list is `band === "AT_RISK"` and nothing else.
    expect("atRisk" in parsed).toBe(false);
    expect(parsed.band).toBe("HIGH");
  });

  it("requires a name — User.name is NOT NULL (D-17.21)", () => {
    expect(
      engagementReportRowSchema.safeParse({
        ...perfect,
        studentUserId: 5,
        name: null,
        email: "space-v2-test-a@jpc.test",
        seasonId: 7,
        seasonTitle: "Spring 2099",
        band: "HIGH",
      }).success,
    ).toBe(false);
  });
});

describe("attendancePointSchema", () => {
  it("carries the raw instant, both counts, and a nullable pct", () => {
    const point = {
      sessionId: 3,
      seasonId: 7,
      seasonTitle: "Spring 2099",
      title: "Week 1",
      startsAt: "2099-03-01T18:00:00.000Z",
      presentCount: 8,
      expectedCount: 10,
      pct: 80,
    };
    expect(attendancePointSchema.parse(point).startsAt).toBe("2099-03-01T18:00:00.000Z");
    // A session with no roster yet has no percentage. v1 returned 0 (R13),
    // which draws a cliff that never happened.
    expect(
      attendancePointSchema.parse({ ...point, presentCount: 0, expectedCount: 0, pct: null }).pct,
    ).toBeNull();
  });

  it("refuses a pct above 100 — the denominator is the fix, not a clamp (C5)", () => {
    // v1's trend divided a historic session by today's roster and could exceed
    // 100 (R12). If a server ever emits one again, the client must not render it.
    expect(
      attendancePointSchema.safeParse({
        sessionId: 3,
        seasonId: 7,
        seasonTitle: "Spring 2099",
        title: "Week 1",
        startsAt: "2099-03-01T18:00:00.000Z",
        presentCount: 12,
        expectedCount: 10,
        pct: 120,
      }).success,
    ).toBe(false);
  });
});

describe("assignmentCompletionRowSchema", () => {
  it("is named completionRate, not a submission percentage (D-17.1)", () => {
    const row = assignmentCompletionRowSchema.parse({
      assignmentId: 2,
      seasonId: 7,
      title: "Reflection 1",
      targeting: "targeted",
      completed: 4,
      expected: 8,
      completionRate: 50,
    });
    expect(row.completionRate).toBe(50);
    expect("submittedPct" in row).toBe(false);
  });

  it("distinguishes an all-groups assignment from a targeted one", () => {
    expect(assignmentCompletionRowSchema.shape.targeting.parse("all_groups")).toBe("all_groups");
    expect(assignmentCompletionRowSchema.shape.targeting.safeParse("group").success).toBe(false);
  });
});

describe("reportScopeQuerySchema", () => {
  it("accepts a repeated seasonId, a single one, and none", () => {
    expect(reportScopeQuerySchema.parse({ seasonId: ["3", "4"] }).seasonIds).toEqual([3, 4]);
    expect(reportScopeQuerySchema.parse({ seasonId: "3" }).seasonIds).toEqual([3]);
    // Empty means "my whole permitted scope" — resolved server-side, never
    // "every season in the database" as v1's empty array meant (R1).
    expect(reportScopeQuerySchema.parse({}).seasonIds).toEqual([]);
  });

  it("defaults the trend window to 26 points and caps it", () => {
    expect(reportScopeQuerySchema.parse({}).trendLimit).toBe(26);
    expect(reportScopeQuerySchema.safeParse({ trendLimit: "500" }).success).toBe(false);
  });
});

describe("exportFormatSchema and exportFilename", () => {
  it("accepts xlsx only, so ?format=csv is a legible 400 (D-17.7)", () => {
    expect(exportFormatSchema.parse("xlsx")).toBe("xlsx");
    expect(exportFormatSchema.safeParse("csv").success).toBe(false);
  });

  it("builds a filename a human can read in a share sheet (R42)", () => {
    // v1: engagement-1756012800000.csv — no season, no scope, no readable date.
    expect(exportFilename("engagement", "All seasons", "2026-08-24")).toBe(
      "engagement-all-seasons-2026-08-24.xlsx",
    );
    expect(exportFilename("season-workbook", "gbv-2026", "2026-08-24")).toBe(
      "gbv-2026-attendance-grades-2026-08-24.xlsx",
    );
  });

  it("slugs anything a season code or title could contain", () => {
    expect(exportFilename("engagement", 'Winter "24" / أ', "2026-08-24")).toBe(
      "engagement-winter-24-2026-08-24.xlsx",
    );
  });
});

describe("organisationReportSchema", () => {
  it("renames the two fields v1 mislabelled (D4, R54)", () => {
    const parsed = organisationReportSchema.parse({
      totalStudentsNotGraduated: 40,
      totalAlumni: 12,
      activeSeasonCount: 2,
      generatedAt: "2026-08-24T00:00:00.000Z",
      seasons: [
        {
          seasonId: 7,
          code: "gbv-2026",
          program: "GBV",
          year: 2026,
          title: "GBV 2026",
          status: "ACTIVE",
          activeCount: 20,
          completedCount: 3,
          withdrawnCount: 1,
          leaderCount: 2,
        },
      ],
      alumniByYear: [{ year: 2025, count: 12 }],
    });
    // "Current students" counted student ACCOUNTS, including students never
    // enrolled in anything (R51). The field name must not restate the claim.
    expect(parsed.totalStudentsNotGraduated).toBe(40);
    // R62/D13: the row carries `code`, so a screen can navigate by the segment
    // the season route actually resolves.
    expect(parsed.seasons[0]!.code).toBe("gbv-2026");
    expect(parsed.seasons[0]!.withdrawnCount).toBe(1);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

```bash
cd packages/shared && npx jest src/__tests__/report-schemas.test.ts
```

Expected: **FAIL** — `Cannot find module '../index'`-level failure resolving
the new exports, reported as `TypeError: (0 , _index.bandFor) is not a
function` on the first `bandFor` case. That message proves the test is bound to
the real module rather than to a local helper.

- [ ] **Step 3: Write the contracts**

```ts
// packages/shared/src/reports.ts
import { z } from "zod";

import { seasonStatusSchema } from "./enums";
import { engagementScoreSchema, isAtRisk, type EngagementScore } from "./note";

// ---------------------------------------------------------------------------
// Engagement bands
// ---------------------------------------------------------------------------

/**
 * The four bands of v1's AT_RISK_BUCKETS (reports-query.ts:47-59), as enum
 * members rather than the display strings v1 used as Map keys.
 *
 * v1's pie was semantic BY COINCIDENCE: `categoricalPalette`'s array order
 * (green, teal, amber, red) happened to line up with the Map seed order, so
 * reordering the seed would have silently painted "High" red (R92). An enum
 * lets the colour map be declared instead of inferred from array position —
 * see apps/mobile/src/lib/report-colors.ts.
 */
export const engagementBandSchema = z.enum(["HIGH", "MEDIUM", "LOW", "AT_RISK"]);
export type EngagementBand = z.infer<typeof engagementBandSchema>;

/** Seed order for the band counts — every band is emitted, including zeroes (R31). */
export const BAND_ORDER = ["HIGH", "MEDIUM", "LOW", "AT_RISK"] as const satisfies readonly EngagementBand[];

export const BAND_LABEL: Record<EngagementBand, string> = {
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
  AT_RISK: "At risk",
};

/**
 * The ONE banding function, and the reason the at-risk list cannot disagree
 * with the at-risk band.
 *
 * v1 had three thresholds on one screen: bands cut the composite at 80/60/40
 * (R30) while the at-risk list took `score < 60` (R33), and the mentor
 * dashboard tested each component against 60 (domain 9 R73). A student at
 * 55 attendance / 95 submissions was "Medium" here and at-risk there.
 *
 * AT_RISK is evaluated FIRST and delegates entirely to domain 9's `isAtRisk`,
 * so band membership is that predicate by construction (ruling C4, spec D5).
 * The remaining three bands are a presentational split of the composite.
 *
 * A student with both denominators zero — a season that has not started —
 * scores 0, is not at risk (Plan 8's guard, fixing R56), and bands LOW. "Low"
 * is a weak label for "no data yet"; the Key sheet and the screen's method
 * note say so, and a fifth band would change the pie's category count.
 */
export function bandFor(score: EngagementScore): EngagementBand {
  if (isAtRisk(score)) return "AT_RISK";
  if (score.score >= 80) return "HIGH";
  if (score.score >= 60) return "MEDIUM";
  return "LOW";
}

// ---------------------------------------------------------------------------
// Request scope
// ---------------------------------------------------------------------------

/**
 * Express hands a repeated query parameter as `string[]` and a single one as
 * `string`, so both shapes normalise to an array before coercion.
 *
 * An EMPTY array means "my whole permitted scope", resolved server-side — not
 * v1's "every season in the database" (R1), which was only safe because the
 * caller was a server component that had already checked.
 */
const seasonIdsParam = z.preprocess(
  (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]),
  z.array(z.coerce.number().int().positive()).max(50),
);

export const reportScopeQuerySchema = z.object({
  seasonId: seasonIdsParam.default([]),
  /**
   * v1 declared `from`/`to` and no caller ever passed them (R5). They narrow
   * the attendance-trend session window and nothing else (R4) — implemented
   * here rather than deleted, because a date window is exactly what a phone
   * needs (spec D9, §9).
   */
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  /** Most-recent-N sessions inside the window. 26 ≈ one point per week for a two-term season. */
  trendLimit: z.coerce.number().int().min(1).max(200).default(26),
});
export type ReportScopeQuery = z.output<typeof reportScopeQuerySchema>;

// `seasonId` is the wire name (repeatable); `seasonIds` is what every consumer
// wants to read. Renamed on parse so no handler re-derives it.
export const reportScopeQuerySchemaWithIds = reportScopeQuerySchema.transform((q) => ({
  seasonIds: q.seasonId,
  from: q.from,
  to: q.to,
  trendLimit: q.trendLimit,
}));

export const resolvedScopeSchema = z.object({
  /** The intersection actually queried — never the request (ruling C8, spec D6 #1). */
  seasonIds: z.array(z.number().int()),
  seasons: z.array(
    z.object({ id: z.number().int(), code: z.string(), title: z.string() }),
  ),
  /**
   * True when the request named more seasons than the caller got. Deliberately
   * does NOT say which were dropped: a per-id answer turns the endpoint into an
   * existence oracle over the season table (spec §4 item 1).
   */
  truncated: z.boolean(),
  /** "All seasons" | "GBV 2026" | "3 seasons" — used in filenames and headings. */
  label: z.string(),
});
export type ResolvedScope = z.infer<typeof resolvedScopeSchema>;

// ---------------------------------------------------------------------------
// The engagement report
// ---------------------------------------------------------------------------

/**
 * One point per past session in the window.
 *
 * v1 returned a pre-formatted `MMM d` label and a percentage (R15), which made
 * the chart unfixable on the client, collapsed sessions from different years
 * onto one label, and hid that the percentage could exceed 100 (R12). This
 * carries the raw instant (the client formats — ruling C2, spec D12), both
 * counts, and the season so a multi-season chart can be split.
 *
 * `pct` is capped at 100 by the CONTRACT as well as by the query: the
 * denominator is the roster as it stood at `startsAt` and the numerator is
 * restricted to that same set (D-17.3), so a value above 100 means a bug
 * upstream and must fail at the boundary rather than render.
 *
 * `pct` is null — not 0 — when nobody was enrolled yet (fixing R13).
 */
export const attendancePointSchema = z.object({
  sessionId: z.number().int(),
  seasonId: z.number().int(),
  seasonTitle: z.string(),
  title: z.string(),
  startsAt: z.string(),
  presentCount: z.number().int().min(0),
  expectedCount: z.number().int().min(0),
  pct: z.number().int().min(0).max(100).nullable(),
});
export type AttendancePoint = z.infer<typeof attendancePointSchema>;

/**
 * One row per assignment. `completionRate` is NOT a submission percentage —
 * it is a property of an assignment, and v1 calling both by one name is spec
 * D2's most consequential ambiguity (D-17.1).
 *
 * `targeting` exists because the denominator means two different things (R20)
 * and a reader currently cannot tell which they are looking at.
 *
 * `completionRate` is null when `expected` is 0 — a targeted assignment with no
 * AssignmentTarget rows. v1 showed 0 %, which reads as total cohort failure and
 * is actually a mis-configured assignment (R22, D-17.13).
 */
export const assignmentCompletionRowSchema = z.object({
  assignmentId: z.number().int(),
  seasonId: z.number().int(),
  title: z.string(),
  targeting: z.enum(["all_groups", "targeted"]),
  completed: z.number().int().min(0),
  expected: z.number().int().min(0),
  completionRate: z.number().int().min(0).max(100).nullable(),
});
export type AssignmentCompletionRow = z.infer<typeof assignmentCompletionRowSchema>;

export const engagementBandCountSchema = z.object({
  band: engagementBandSchema,
  count: z.number().int().min(0),
});

/**
 * One row per ACTIVE enrolment (R27) — a student in two in-scope seasons
 * produces two rows, which is why `cohortSize` exists beside `enrollmentCount`
 * (R32, spec D16).
 *
 * Built from domain 9's engagementScoreSchema, never redefined (spec §8).
 * `.strip()` is Zod's default and is what drops a stray `atRisk`: the band IS
 * the at-risk answer, and a second field for it would be a second definition.
 */
export const engagementReportRowSchema = engagementScoreSchema.extend({
  studentUserId: z.number().int(),
  name: z.string(),
  email: z.string(),
  seasonId: z.number().int(),
  seasonTitle: z.string(),
  band: engagementBandSchema,
});
export type EngagementReportRow = z.infer<typeof engagementReportRowSchema>;

/**
 * The summary. Deliberately does NOT carry the cohort.
 *
 * v1's `loadReportsData` returned `rawStudents` — every active student's name,
 * email and three scores — to every caller including the two screens that
 * render ten rows of it (R34). In v1 that array never leaves the server. An
 * endpoint returning it verbatim ships the whole cohort to the device on every
 * screen mount, and React Query mounts on focus and on reconnect.
 */
export const engagementSummarySchema = z.object({
  scope: resolvedScopeSchema,
  attendanceTrend: z.array(attendancePointSchema),
  completion: z.array(assignmentCompletionRowSchema),
  bands: z.array(engagementBandCountSchema),
  /** Capped at 10, ascending by score. */
  atRisk: z.array(engagementReportRowSchema),
  /** The uncapped count, so a reader can be told "10 of 34" (spec D16, R33). */
  atRiskTotal: z.number().int().min(0),
  /** Distinct students. */
  cohortSize: z.number().int().min(0),
  /** Enrolments — the number the band counts actually count (R32). */
  enrollmentCount: z.number().int().min(0),
  generatedAt: z.string(),
});
export type EngagementSummary = z.infer<typeof engagementSummarySchema>;

export const engagementStudentsQuerySchema = reportScopeQuerySchema.extend({
  band: engagementBandSchema.optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const engagementStudentPageSchema = z.object({
  scope: resolvedScopeSchema,
  rows: z.array(engagementReportRowSchema),
  nextCursor: z.string().nullable(),
  total: z.number().int().min(0),
});
export type EngagementStudentPage = z.infer<typeof engagementStudentPageSchema>;

// ---------------------------------------------------------------------------
// The organisation roll-up
// ---------------------------------------------------------------------------

/**
 * `withdrawnCount` names the enum member it counts. v1's `droppedCount` was a
 * display rename applied at the data layer (R54); the label stays "Dropped".
 *
 * `code` rides beside `id` because every season link on v1's SUPER reports page
 * points at `/super/seasons/<integer id>` while the route resolves by `code`,
 * so every row 404s (R62, spec D13).
 */
export const seasonEnrollmentCountSchema = z.object({
  seasonId: z.number().int(),
  code: z.string(),
  program: z.string(),
  year: z.number().int(),
  title: z.string(),
  status: seasonStatusSchema,
  activeCount: z.number().int().min(0),
  completedCount: z.number().int().min(0),
  withdrawnCount: z.number().int().min(0),
  leaderCount: z.number().int().min(0),
});

export const alumniByYearRowSchema = z.object({
  year: z.number().int(),
  count: z.number().int().min(0),
});

/**
 * `totalStudentsNotGraduated` renames v1's `totalStudents`, which counted every
 * non-deleted STUDENT with no graduationYear — including students never
 * enrolled in anything and students withdrawn from everything — and was
 * labelled "Current students" (R51, spec D4).
 *
 * The QUERY is unchanged. Renaming is the safer half: changing the query would
 * move a headline number somebody has been quoting.
 */
export const organisationReportSchema = z.object({
  totalStudentsNotGraduated: z.number().int().min(0),
  totalAlumni: z.number().int().min(0),
  activeSeasonCount: z.number().int().min(0),
  seasons: z.array(seasonEnrollmentCountSchema),
  alumniByYear: z.array(alumniByYearRowSchema),
  generatedAt: z.string(),
});
export type OrganisationReport = z.infer<typeof organisationReportSchema>;

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/**
 * One member on purpose (spec D7, D-17.7).
 *
 * v1's CSV quotes with JSON.stringify — an embedded `"` becomes `\"`, which no
 * CSV parser accepts, and a backslash is doubled (R40) — joins rows with bare
 * LF and writes no BOM, so Excel on Windows decodes it as the system codepage
 * and mangles every non-ASCII name (R41). Rather than fix four things, v2 uses
 * the exceljs path the workbook needs anyway. A one-member enum means
 * `?format=csv` is a 400 that names XLSX, not a 404 that reads as "broken".
 */
export const exportFormatSchema = z.enum(["xlsx"]);

export const exportKindSchema = z.enum(["engagement", "season-workbook"]);
export type ExportKind = z.infer<typeof exportKindSchema>;

export const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
/** iOS needs a UTI as well as a MIME type or the share sheet offers the wrong apps (spec D10). */
export const XLSX_UTI = "org.openxmlformats.spreadsheetml.sheet";

/**
 * The ONE filename builder.
 *
 * The server needs it for Content-Disposition; the client needs it for the
 * local cache path, which it must choose BEFORE it can see a response header
 * (downloadResumable writes to a path you name up front). Two implementations
 * would drift, and on a phone the filename is the only label the file ever
 * carries — it is what the user sees in the share sheet and later in Files.
 *
 * v1: `engagement-<epoch-milliseconds>.csv` (R42).
 */
export function exportFilename(kind: ExportKind, scopeLabel: string, isoDay: string): string {
  const slug =
    scopeLabel
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
      .replace(/-+$/g, "") || "export";
  const stem = kind === "engagement" ? `engagement-${slug}` : `${slug}-attendance-grades`;
  return `${stem}-${isoDay}.xlsx`;
}

export const exportManifestSchema = z.object({
  filename: z.string(),
  mimeType: z.string(),
  sheets: z.array(
    z.object({
      name: z.string(),
      columnCount: z.number().int().min(0),
      rowCount: z.number().int().min(0),
    }),
  ),
  /** A heuristic, not a promise — see the route. Lets the client warn before a large cellular download. */
  estimatedBytes: z.number().int().min(0),
  generatedAt: z.string(),
  scopeDescription: z.string(),
});
export type ExportManifest = z.infer<typeof exportManifestSchema>;

/**
 * The method note, rendered in two places and written once.
 *
 * The XLSX Key sheet (a Node builder) and the mobile screen's "How these
 * numbers are calculated" disclosure (a React Native <Text>) render the same
 * strings, so a spreadsheet and the app cannot describe the same metric
 * differently. Same C4 discipline as the metrics themselves, applied to prose.
 *
 * Every line here is a deliberate divergence from v1 that a reader comparing
 * the two systems during the transition needs to know about.
 */
export const REPORT_METRIC_NOTES: readonly string[] = [
  "Attendance % counts PRESENT and LATE alike, over the sessions that ran on or after the student enrolled. A student who joined mid-season is not scored against the weeks before they arrived.",
  "Submission % counts only assignments assigned to that student — all-groups assignments plus those targeting their group for this season. An assignment a student was never given does not count against them.",
  "The per-session attendance figure divides by the students enrolled at the time of that session, not by today's roster, so it cannot exceed 100%.",
  "“At risk” means either component is below 60%. A student who has stopped attending but is still submitting is at risk, even though the combined score may look healthy.",
  "Late arrivals show as “L”. Recorded minutes are withheld because the older system measured them from when staff opened check-in rather than from the session start; they return once the historic records have been corrected.",
  "Blank means no record. “n/a” on the Assignments sheet means the assignment was not assigned to that student.",
] as const;
```

- [ ] **Step 4: Export it (coordinator)**

In `packages/shared/src/index.ts`, append below the existing lines:

```ts
export * from "./reports";
```

`./note` (Plan 8) must already be exported above it; `reports.ts` imports from
it directly by path, so export order does not matter, but the missing file
will show up as a TypeScript error rather than at runtime.

- [ ] **Step 5: Verification**

```bash
cd packages/shared && npx jest src/__tests__/report-schemas.test.ts
cd "$(git rev-parse --show-toplevel)" && pnpm turbo lint typecheck --filter=@space/shared
```

Expect: 15 passing, lint and typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add packages/shared && git commit -m "feat(shared): report contracts with one band definition and one filename builder"
```

---

### Task 2: Fixture cleanup for quiz rows

**Wave 1 · Coordinator only** (`fixtures.ts` is shared by every integration
suite in the repo).

**Files:**
- Modify: `apps/backend/src/__tests__/integration/fixtures.ts`

**Interfaces:** no new exports. `cleanupTestData` gains four deletes.

**Why this is its own task.** This plan is the first to write a *workbook*
integration test, which means the first fixture set containing `Quiz` and
`QuizGrade` rows. `cleanupTestData`'s delete order is explicit precisely
because relying on cascades has bitten this repo before (see its own header
comment: two `Season` relations are `onDelete: Restrict`, so a bare
`season.deleteMany` fails and leaves rows behind **in a database jpc-space is
live against**).

For quizzes the cascade *should* work — `Quiz.season` is `onDelete: Cascade`,
`QuizGrade.quiz` is `onDelete: Cascade`, and `season.deleteMany` runs before
`user.deleteMany` — but `QuizGrade.studentUserId` and
`QuizAttempt.studentUserId` are `onDelete: Restrict` against `User`, so if the
cascade ever does *not* fire (a future `relationMode`, a migration that dropped
the FK action, a grade whose quiz was moved), `user.deleteMany` throws a
foreign-key error and every subsequent suite in the run fails on stranded
fixtures. Being explicit costs four lines.

**Check first.** Plan 6 may already have added these. Run:

```bash
grep -n "quizGrade\|quizAttempt\|quizAnswer\|quiz\." apps/backend/src/__tests__/integration/fixtures.ts
```

If the four deletes are already present, tick this task and move on — do not
add a second copy.

- [ ] **Step 1: Add the deletes**

In `cleanupTestData`, inside the `if (seasonIds.length > 0)` block, **above**
the `db.session.deleteMany` line (quizzes may reference a session via
`Quiz.sessionId`, which is `SetNull` — deleting sessions first is harmless, but
grouping the quiz graph above it keeps the file readable as a dependency
order):

```ts
    // Quiz graph. Quiz.season is onDelete: Cascade so season.deleteMany below
    // would usually reach these, but QuizGrade.studentUserId and
    // QuizAttempt.studentUserId are onDelete: Restrict against User — if the
    // cascade ever fails to fire, user.deleteMany at the end of this function
    // throws a foreign-key error and strands test rows in a database
    // jpc-space is live against. Explicit, like every other line here.
    await db.quizAnswer.deleteMany({ where: { attempt: { quiz: inSeasons } } });
    await db.quizAttempt.deleteMany({ where: { quiz: inSeasons } });
    await db.quizGrade.deleteMany({ where: { quiz: inSeasons } });
    await db.quizQuestion.deleteMany({ where: { quiz: inSeasons } });
    await db.quiz.deleteMany({ where: inSeasons });
```

`inSeasons` is the `{ seasonId: { in: seasonIds } }` const already declared
above in that block, and `seasonIds` came from a `code: { startsWith:
TEST_PREFIX }` query — so every one of these five deletes is prefix-scoped and
cannot reach a real row.

- [ ] **Step 2: Verification**

The cheapest proof is an existing suite that creates a season and a user:

```bash
cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern seasons-routes
```

Expect: PASS, and `afterAll` completes without a foreign-key error. Then
confirm nothing survived:

```bash
cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern integration
```

Expect: the whole existing integration set green, serially. **This is the
baseline run** — record its suite and test counts in the implementation report,
because Task 10 compares against them.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/__tests__/integration/fixtures.ts && \
  git commit -m "test(backend): clean up quiz rows explicitly in cleanupTestData"
```

---

### Task 3: The engagement aggregation — scope, trend, completion, bands

**Wave 2 · Agent A.** Writes its integration suite but **does not run it**.
Hands the coordinator a `lib/permissions.ts` fragment; does not open that file.

**Files:**
- Modify: `apps/backend/src/lib/queries/engagement.ts` (generalise the signature to a season list; fix Plan 8's bare-specifier import)
- Create: `apps/backend/src/lib/queries/reports.ts`
- **Fragment for the coordinator:** `apps/backend/src/lib/permissions.ts` (add `ReportScope`, `reportScopeFor`, `canExportSeasonWorkbook`)
- Test: `apps/backend/src/__tests__/integration/reports-queries.test.ts`

**Interfaces:**
- Consumes: `db` from `../../db/client`; `Prisma` type from
  `../../generated/prisma/client`; `bandFor`, `BAND_ORDER`,
  `type EngagementBand`, `type EngagementReportRow`,
  `type AttendancePoint`, `type AssignmentCompletionRow`,
  `type ResolvedScope` (Task 1); `isSuper`, `isMentor`, `isAdminOfSeason` from
  `../rbac`; `type SessionUser` from `../auth/tokens`.
- Produces:
  - in `lib/queries/engagement.ts`:
    `computeEngagementForSeasons(seasonIds: number[], opts?): Promise<EngagementRow[]>`,
    with `computeEngagementForSeason(seasonId, opts?)` kept as a one-element
    delegate so Plan 8's callers do not change.
  - in `lib/queries/reports.ts`: `resolveReportScope(scope, requestedIds)`,
    `buildEngagementSummary(scope, options)`, `listEngagementRows(scope, options)`,
    `encodeCursor` / `decodeCursor`.
  - in `lib/permissions.ts`: `type ReportScope`, `reportScopeFor(user)`,
    `canExportSeasonWorkbook(user, seasonId)`.

**Query budget.** `buildEngagementSummary` costs **six** queries of its own plus
the **five** inside `computeEngagementForSeasons` — eleven, and eleven whether
the cohort is four students or four hundred, across one season or twenty. See
D-17.11 for why that is higher than spec §5's target and why the target is the
wrong thing to optimise.

- [ ] **Step 1: Write the failing integration test**

This suite exercises the arithmetic directly against the staging database. The
*authorization* is Task 5's; splitting them means a red test tells you which of
the two broke.

```ts
// apps/backend/src/__tests__/integration/reports-queries.test.ts
import { db } from "../../db/client";
import { newPublicId } from "../../lib/public-id";
import {
  buildEngagementSummary,
  listEngagementRows,
  resolveReportScope,
} from "../../lib/queries/reports";
import { cleanupTestData, createTestSeason, createTestUser } from "./fixtures";

// The shared Neon staging Postgres autosuspends; the first query after idle has
// been measured around 18s.
jest.setTimeout(60000);

let seasonId: number;
let otherSeasonId: number;
let deletedSeasonId: number;
let groupAId: number;
let groupBId: number;
let earlyId: number;   // enrolled before session 1, present at 2 of 4
let lateId: number;    // enrolled after session 2
let withdrawnId: number; // enrolled, attended session 1, dropped before session 3
let groupBStudentId: number;
let allGroupsAssignmentId: number;
let groupAAssignmentId: number;
let untargetedAssignmentId: number;

const S = ["2020-01-01", "2020-01-08", "2020-01-15", "2020-01-22"] as const;
const at = (d: string) => new Date(`${d}T18:00:00.000Z`);
let sessionIds: number[];

beforeAll(async () => {
  await cleanupTestData();

  const season = await createTestSeason();
  seasonId = season.id;
  otherSeasonId = (await createTestSeason()).id;

  const deleted = await createTestSeason();
  deletedSeasonId = deleted.id;
  await db.season.update({ where: { id: deletedSeasonId }, data: { deletedAt: new Date() } });

  const early = await createTestUser("rep-early", "STUDENT");
  const late = await createTestUser("rep-late", "STUDENT");
  const gone = await createTestUser("rep-gone", "STUDENT");
  const groupB = await createTestUser("rep-groupb", "STUDENT");
  earlyId = early.id;
  lateId = late.id;
  withdrawnId = gone.id;
  groupBStudentId = groupB.id;

  const gA = await db.group.create({ data: { seasonId, name: "Group A" }, select: { id: true } });
  const gB = await db.group.create({ data: { seasonId, name: "Group B" }, select: { id: true } });
  groupAId = gA.id;
  groupBId = gB.id;

  const sessions = [];
  for (const d of S) {
    sessions.push(
      await db.session.create({
        data: { seasonId, title: `Session ${d}`, startsAt: at(d), durationMinutes: 60 },
        select: { id: true },
      }),
    );
  }
  sessionIds = sessions.map((s) => s.id);

  await db.seasonEnrollment.createMany({
    data: [
      {
        seasonId,
        studentUserId: early.id,
        groupId: gA.id,
        status: "ACTIVE",
        enrolledAt: new Date("2019-12-01T00:00:00.000Z"),
      },
      {
        seasonId,
        studentUserId: late.id,
        groupId: gA.id,
        status: "ACTIVE",
        enrolledAt: new Date("2020-01-10T00:00:00.000Z"),
      },
      {
        // On the roster for sessions 1 and 2, gone by session 3.
        seasonId,
        studentUserId: gone.id,
        groupId: gA.id,
        status: "WITHDRAWN",
        enrolledAt: new Date("2019-12-01T00:00:00.000Z"),
        droppedAt: new Date("2020-01-12T00:00:00.000Z"),
      },
      {
        seasonId,
        studentUserId: groupB.id,
        groupId: gB.id,
        status: "ACTIVE",
        enrolledAt: new Date("2019-12-01T00:00:00.000Z"),
      },
    ],
  });

  await db.attendance.createMany({
    data: [
      // Session 1 (2020-01-01): roster = early, gone, groupB (late has not joined).
      { sessionId: sessionIds[0]!, studentUserId: early.id, status: "PRESENT" },
      { sessionId: sessionIds[0]!, studentUserId: gone.id, status: "LATE", lateMinutes: 7 },
      { sessionId: sessionIds[0]!, studentUserId: groupB.id, status: "ABSENT" },
      // Session 2: early LATE, others absent/unrecorded.
      { sessionId: sessionIds[1]!, studentUserId: early.id, status: "LATE", lateMinutes: 3 },
      // Session 3: roster = early, late, groupB. `gone` has dropped but STILL
      // has a row — v1 counted it in the numerator while excluding them from
      // the denominator, which is how pct exceeded 100 (R12).
      { sessionId: sessionIds[2]!, studentUserId: gone.id, status: "PRESENT" },
      { sessionId: sessionIds[2]!, studentUserId: late.id, status: "PRESENT" },
      { sessionId: sessionIds[2]!, studentUserId: groupB.id, status: "PRESENT" },
      // Session 4: nobody.
    ],
  });

  const allGroups = await db.assignment.create({
    data: { seasonId, title: "For everyone", isAllGroups: true },
    select: { id: true },
  });
  allGroupsAssignmentId = allGroups.id;

  const groupAOnly = await db.assignment.create({
    data: {
      seasonId,
      title: "Group A only",
      isAllGroups: false,
      targets: { create: { groupId: gA.id } },
    },
    select: { id: true },
  });
  groupAAssignmentId = groupAOnly.id;

  // Targeted at nothing at all — v1 reported 0 % submitted for this (R22).
  const untargeted = await db.assignment.create({
    data: { seasonId, title: "Targeted at nobody", isAllGroups: false },
    select: { id: true },
  });
  untargetedAssignmentId = untargeted.id;

  await db.submission.createMany({
    data: [
      { assignmentId: allGroups.id, studentUserId: early.id, publicId: newPublicId(), status: "SUBMITTED" },
      { assignmentId: groupAOnly.id, studentUserId: early.id, publicId: newPublicId(), status: "REVIEWED" },
      // A DRAFT never counts as turned in (R19).
      { assignmentId: allGroups.id, studentUserId: late.id, publicId: newPublicId(), status: "DRAFT" },
      // A withdrawn student's submission: v1 counted it in the bar chart's
      // numerator while the denominator counted only current students (R23).
      { assignmentId: allGroups.id, studentUserId: gone.id, publicId: newPublicId(), status: "SUBMITTED" },
      { assignmentId: allGroups.id, studentUserId: groupB.id, publicId: newPublicId(), status: "RETURNED" },
    ],
  });
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("resolveReportScope — intersect, never check-then-run (ruling C8)", () => {
  it("returns the caller's whole permitted scope when nothing is requested", async () => {
    const scope = await resolveReportScope({ kind: "seasons", seasonIds: [seasonId, otherSeasonId] }, []);
    expect(scope.seasonIds.sort()).toEqual([seasonId, otherSeasonId].sort());
    expect(scope.truncated).toBe(false);
  });

  it("drops a requested season the caller may not see, and flags truncated", async () => {
    const scope = await resolveReportScope({ kind: "seasons", seasonIds: [seasonId] }, [
      seasonId,
      otherSeasonId,
    ]);
    // THE test this task exists for. v1's loadReportsData took whatever
    // integers the caller passed and queried them (R3); the only protection was
    // which server component called it. Here the request never reaches a where
    // clause — the intersection does.
    expect(scope.seasonIds).toEqual([seasonId]);
    expect(scope.truncated).toBe(true);
  });

  it("drops a soft-deleted season silently rather than 404ing it", async () => {
    // No existence oracle: "not yours" and "does not exist" must look the same
    // to a caller enumerating ids (spec §4 item 1).
    const scope = await resolveReportScope({ kind: "all" }, [deletedSeasonId]);
    expect(scope.seasonIds).toEqual([]);
    expect(scope.truncated).toBe(true);
  });

  it("labels a single season by title and a multi-season scope by count", async () => {
    const one = await resolveReportScope({ kind: "seasons", seasonIds: [seasonId] }, []);
    expect(one.label).toBe("Test Season");
    const many = await resolveReportScope({ kind: "seasons", seasonIds: [seasonId, otherSeasonId] }, []);
    expect(many.label).toBe("2 seasons");
  });
});

describe("buildEngagementSummary — attendance trend", () => {
  it("divides each session by the roster AS IT STOOD, so pct never exceeds 100 (D3)", async () => {
    const scope = await resolveReportScope({ kind: "seasons", seasonIds: [seasonId] }, []);
    const summary = await buildEngagementSummary(scope, { trendLimit: 26 });

    const byId = new Map(summary.attendanceTrend.map((p) => [p.sessionId, p]));

    // Session 1: roster is early + gone + groupB (late enrolled 2020-01-10).
    // Present: early PRESENT, gone LATE → 2 of 3 → 67.
    expect(byId.get(sessionIds[0]!)).toMatchObject({
      expectedCount: 3,
      presentCount: 2,
      pct: 67,
    });

    // Session 3: roster is early + late + groupB — `gone` dropped 2020-01-12.
    // `gone` still has a PRESENT row on this session; v1 counted it in the
    // numerator while excluding them from the denominator, giving 3/3 here and
    // >100% on a season that had lost more students (R12).
    expect(byId.get(sessionIds[2]!)).toMatchObject({
      expectedCount: 3,
      presentCount: 2,
      pct: 67,
    });

    for (const p of summary.attendanceTrend) {
      expect(p.pct === null || p.pct <= 100).toBe(true);
      expect(p.presentCount).toBeLessThanOrEqual(p.expectedCount);
    }
  });

  it("carries the raw instant and the season, not a pre-formatted MMM d label (C2, R15)", async () => {
    const scope = await resolveReportScope({ kind: "seasons", seasonIds: [seasonId] }, []);
    const summary = await buildEngagementSummary(scope, { trendLimit: 26 });
    const first = summary.attendanceTrend[0]!;
    expect(first.startsAt).toBe(at(S[0]).toISOString());
    expect(first.seasonId).toBe(seasonId);
    expect(first.title).toBe(`Session ${S[0]}`);
  });

  it("windows to the most recent trendLimit sessions, still ascending", async () => {
    const scope = await resolveReportScope({ kind: "seasons", seasonIds: [seasonId] }, []);
    const summary = await buildEngagementSummary(scope, { trendLimit: 2 });
    expect(summary.attendanceTrend.map((p) => p.sessionId)).toEqual([
      sessionIds[2]!,
      sessionIds[3]!,
    ]);
  });

  it("honours from/to — v1 declared them and no caller ever passed them (R5)", async () => {
    const scope = await resolveReportScope({ kind: "seasons", seasonIds: [seasonId] }, []);
    const summary = await buildEngagementSummary(scope, {
      trendLimit: 26,
      from: at("2020-01-08"),
      to: at("2020-01-15"),
    });
    expect(summary.attendanceTrend.map((p) => p.sessionId)).toEqual([
      sessionIds[1]!,
      sessionIds[2]!,
    ]);
  });

  it("never includes a future session even when `to` is far in the future", async () => {
    const future = await db.session.create({
      data: {
        seasonId,
        title: "Not yet",
        startsAt: new Date("2999-01-01T00:00:00.000Z"),
        durationMinutes: 60,
      },
      select: { id: true },
    });
    const scope = await resolveReportScope({ kind: "seasons", seasonIds: [seasonId] }, []);
    const summary = await buildEngagementSummary(scope, {
      trendLimit: 26,
      to: new Date("3000-01-01T00:00:00.000Z"),
    });
    // `to` and `startsAt <= now` are both `lte` on one field. Spreading them
    // into one object silently drops `now` and un-bounds the query (D-17.12).
    expect(summary.attendanceTrend.map((p) => p.sessionId)).not.toContain(future.id);
  });
});

describe("buildEngagementSummary — assignment completion", () => {
  it("intersects the numerator with the expected set, so a bar cannot exceed 100 (R23)", async () => {
    const scope = await resolveReportScope({ kind: "seasons", seasonIds: [seasonId] }, []);
    const summary = await buildEngagementSummary(scope, { trendLimit: 26 });
    const byId = new Map(summary.completion.map((r) => [r.assignmentId, r]));

    // isAllGroups: expected = the 3 ACTIVE enrolments (the withdrawn student is
    // not expected). Non-DRAFT submissions exist from early, gone and groupB —
    // but `gone` is not in the expected set, so 2 of 3.
    expect(byId.get(allGroupsAssignmentId)).toMatchObject({
      targeting: "all_groups",
      expected: 3,
      completed: 2,
      completionRate: 67,
    });
  });

  it("resolves targeting through SeasonEnrollment, not GroupStudent (ruling C9)", async () => {
    const scope = await resolveReportScope({ kind: "seasons", seasonIds: [seasonId] }, []);
    const summary = await buildEngagementSummary(scope, { trendLimit: 26 });
    const row = summary.completion.find((r) => r.assignmentId === groupAAssignmentId)!;
    // Group A's ACTIVE enrolments are early and late. GroupStudent has no rows
    // at all in this fixture — v1's denominator would have been 0 here, and
    // GroupStudent is unique on studentUserId across the whole database anyway,
    // so it can never answer a per-season question (R21).
    expect(row).toMatchObject({ targeting: "targeted", expected: 2, completed: 1, completionRate: 50 });
  });

  it("returns null, not 0 %, for an assignment targeted at nobody (R22)", async () => {
    const scope = await resolveReportScope({ kind: "seasons", seasonIds: [seasonId] }, []);
    const summary = await buildEngagementSummary(scope, { trendLimit: 26 });
    const row = summary.completion.find((r) => r.assignmentId === untargetedAssignmentId)!;
    // "0 % submitted" reads as total cohort failure; it is a mis-configured
    // assignment. null renders as "—".
    expect(row).toMatchObject({ expected: 0, completed: 0, completionRate: null });
  });
});

describe("buildEngagementSummary — bands, at-risk and counts", () => {
  it("emits all four bands in order including empty ones (R31)", async () => {
    const scope = await resolveReportScope({ kind: "seasons", seasonIds: [seasonId] }, []);
    const summary = await buildEngagementSummary(scope, { trendLimit: 26 });
    expect(summary.bands.map((b) => b.band)).toEqual(["HIGH", "MEDIUM", "LOW", "AT_RISK"]);
    expect(summary.bands.reduce((n, b) => n + b.count, 0)).toBe(summary.enrollmentCount);
  });

  it("caps the at-risk list at 10 and returns the uncapped total (R33, D16)", async () => {
    const scope = await resolveReportScope({ kind: "seasons", seasonIds: [seasonId] }, []);
    const summary = await buildEngagementSummary(scope, { trendLimit: 26 });
    expect(summary.atRisk.length).toBeLessThanOrEqual(10);
    expect(summary.atRiskTotal).toBeGreaterThanOrEqual(summary.atRisk.length);
    // The list IS the band — there is one predicate (D-17.2).
    expect(summary.atRisk.every((r) => r.band === "AT_RISK")).toBe(true);
    const atRiskBand = summary.bands.find((b) => b.band === "AT_RISK")!;
    expect(atRiskBand.count).toBe(summary.atRiskTotal);
  });

  it("counts enrolments and students separately (R32)", async () => {
    const scope = await resolveReportScope({ kind: "seasons", seasonIds: [seasonId] }, []);
    const summary = await buildEngagementSummary(scope, { trendLimit: 26 });
    // Three ACTIVE enrolments, three distinct students, one season.
    expect(summary.enrollmentCount).toBe(3);
    expect(summary.cohortSize).toBe(3);
  });

  it("does NOT carry the cohort — the summary is not a student export (R34)", async () => {
    const scope = await resolveReportScope({ kind: "seasons", seasonIds: [seasonId] }, []);
    const summary = await buildEngagementSummary(scope, { trendLimit: 26 });
    expect("rawStudents" in summary).toBe(false);
    // Only the capped at-risk rows carry an email, and there are at most ten.
    const emails = JSON.stringify(summary).match(/@jpc\.test/g) ?? [];
    expect(emails.length).toBeLessThanOrEqual(10);
  });

  it("returns empty collections rather than throwing on an empty scope (R2)", async () => {
    const scope = await resolveReportScope({ kind: "seasons", seasonIds: [] }, []);
    const summary = await buildEngagementSummary(scope, { trendLimit: 26 });
    expect(summary).toMatchObject({
      attendanceTrend: [],
      completion: [],
      atRisk: [],
      atRiskTotal: 0,
      cohortSize: 0,
      enrollmentCount: 0,
    });
    expect(summary.bands.map((b) => b.count)).toEqual([0, 0, 0, 0]);
  });
});

describe("listEngagementRows — the cohort, paged", () => {
  it("pages a stable ordering and stops with a null cursor", async () => {
    const scope = await resolveReportScope({ kind: "seasons", seasonIds: [seasonId] }, []);
    const first = await listEngagementRows(scope, { limit: 2 });
    expect(first.rows).toHaveLength(2);
    expect(first.total).toBe(3);
    expect(first.nextCursor).not.toBeNull();

    const second = await listEngagementRows(scope, { limit: 2, cursor: first.nextCursor! });
    expect(second.rows).toHaveLength(1);
    expect(second.nextCursor).toBeNull();

    const ids = [...first.rows, ...second.rows].map((r) => r.studentUserId);
    expect(new Set(ids).size).toBe(3);
    // Ascending by score: the students who need attention are on page one.
    const scores = [...first.rows, ...second.rows].map((r) => r.score);
    expect([...scores].sort((a, b) => a - b)).toEqual(scores);
  });

  it("filters to a band", async () => {
    const scope = await resolveReportScope({ kind: "seasons", seasonIds: [seasonId] }, []);
    const page = await listEngagementRows(scope, { limit: 50, band: "AT_RISK" });
    expect(page.rows.every((r) => r.band === "AT_RISK")).toBe(true);
  });

  it("ignores a malformed cursor instead of throwing", async () => {
    const scope = await resolveReportScope({ kind: "seasons", seasonIds: [seasonId] }, []);
    const page = await listEngagementRows(scope, { limit: 50, cursor: "not-a-cursor" });
    expect(page.rows).toHaveLength(3);
  });
});
```

**What the failure proves.** Run before implementing and the suite fails at
import with `Cannot find module '../../lib/queries/reports'`. That is the wrong
kind of red — it proves nothing. The *meaningful* first red is after the module
exists but before the historical-roster denominator lands: the case
`"divides each session by the roster AS IT STOOD"` reports
`Expected: 3, Received: 4` on `expectedCount` for session 1 (today's four
enrolments instead of the three that existed on 2020-01-01) and
`Expected: 67, Received: 50`. That message names the exact defect (R11).

- [ ] **Step 2: Run it to see it fail** *(agent writes only; the coordinator runs this)*

```bash
cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern reports-queries
```

- [ ] **Step 3: Generalise the engagement aggregation to a season list**

Replace the body of `apps/backend/src/lib/queries/engagement.ts`'s exported
function pair. **The formula is untouched** — every change below is a `seasonId`
becoming a `seasonIds`, plus the per-row `seasonId` now coming from the
enrolment instead of the argument.

```ts
// apps/backend/src/lib/queries/engagement.ts
import type { EngagementRow } from "@space/shared";
// Relative, not "@space/shared": this is a VALUE import, and tsc's rootDir here
// is the repo root, so it emits without rewriting bare specifiers. A
// require("@space/shared") at runtime resolves via node_modules back to the
// TypeScript source instead of the compiled sibling in dist/packages/shared/src/
// and the built server dies with ERR_MODULE_NOT_FOUND (CLAUDE.md). Five levels
// up from src/lib/queries/, not four — routes/ is one shallower.
import { isAtRisk } from "../../../../../packages/shared/src/index";

import { db } from "../../db/client";

export interface EngagementCohortOptions {
  /** Restrict to these students (a leader's roster, or a single detail view). */
  studentUserIds?: number[];
  /** Restrict to one group's students. */
  groupId?: number;
}

/**
 * Engagement for a whole cohort across one or more seasons, in a constant
 * number of queries.
 *
 * Plan 11 widened this from a single seasonId to a list. The reports screen's
 * MENTOR branch spans every season in the organisation; calling the
 * single-season version once per season would reintroduce a per-season fan-out
 * one layer up, which is the shape spec D9 exists to remove. The alternative —
 * a second, near-identical aggregation inside lib/queries/reports.ts — is
 * exactly the duplication that gave v1 three "submission %" arithmetics
 * (ruling C4, spec D2). One function, one formula, one place to fix it.
 *
 * Formula, ported verbatim from jpc-space/src/lib/engagement.ts:
 *   score = round(attendancePct * 0.5 + submissionPct * 0.5)   (domain 9 R53)
 *   attendance counts PRESENT and LATE alike                   (domain 9 R54)
 *   a submission counts as done at SUBMITTED|REVIEWED|RETURNED (domain 9 R57)
 *   assignment due dates are ignored                           (domain 9 R60)
 *
 * Two deliberate corrections, both Plan 8's:
 *   - the attendance denominator starts at the student's own enrolledAt
 *     (domain 9 R55, spec D8 #1);
 *   - targeting resolves through SeasonEnrollment.groupId, not GroupStudent
 *     (domain 9 R59, ruling C9).
 *
 * Nothing below reads Attendance.lateMinutes, so the score is untouched by
 * ruling C3's wrong-instant lateness defect (domain 9 R67). The surfaces that
 * DO inherit it are domain 4's, plus this domain's workbook cell — see
 * apps/backend/src/lib/exports/season-workbook.ts.
 */
export async function computeEngagementForSeasons(
  seasonIds: number[],
  opts: EngagementCohortOptions = {},
): Promise<EngagementRow[]> {
  if (seasonIds.length === 0) return [];

  // 1 — the cohort.
  const enrollments = await db.seasonEnrollment.findMany({
    where: {
      seasonId: { in: seasonIds },
      status: "ACTIVE",
      ...(opts.studentUserIds ? { studentUserId: { in: opts.studentUserIds } } : {}),
      ...(opts.groupId ? { groupId: opts.groupId } : {}),
    },
    select: {
      studentUserId: true,
      seasonId: true,
      enrolledAt: true,
      groupId: true,
      group: { select: { name: true } },
      studentUser: { select: { name: true, email: true } },
      season: { select: { title: true } },
    },
  });
  if (enrollments.length === 0) return [];
  const ids = [...new Set(enrollments.map((e) => e.studentUserId))];

  // 2 — every past session in scope, with its season and instant, so each
  // student's denominator can be cut at their own enrolment date in memory.
  const now = new Date();
  const pastSessions = await db.session.findMany({
    where: { seasonId: { in: seasonIds }, startsAt: { lte: now } },
    select: { id: true, seasonId: true, startsAt: true },
  });

  // 3 — the cohort's present-marks over those sessions. Rows rather than a
  // groupBy, because the per-student enrolment cutoff cannot be expressed as
  // one grouped aggregate. Still one query.
  const attendance =
    pastSessions.length === 0
      ? []
      : await db.attendance.findMany({
          where: {
            studentUserId: { in: ids },
            sessionId: { in: pastSessions.map((s) => s.id) },
            status: { in: ["PRESENT", "LATE"] },
          },
          select: { studentUserId: true, sessionId: true },
        });

  // 4 — the scope's assignments and their targets.
  const assignments = await db.assignment.findMany({
    where: { seasonId: { in: seasonIds }, deletedAt: null },
    select: {
      id: true,
      seasonId: true,
      isAllGroups: true,
      targets: { select: { groupId: true } },
    },
  });

  // 5 — the cohort's completed submissions against them.
  const submissions =
    assignments.length === 0
      ? []
      : await db.submission.findMany({
          where: {
            studentUserId: { in: ids },
            assignmentId: { in: assignments.map((a) => a.id) },
            status: { in: ["SUBMITTED", "REVIEWED", "RETURNED"] },
          },
          select: { studentUserId: true, assignmentId: true },
        });
  const completed = new Set(submissions.map((s) => `${s.studentUserId}:${s.assignmentId}`));

  const presentBy = new Map<number, Set<number>>();
  for (const row of attendance) {
    const set = presentBy.get(row.studentUserId) ?? new Set<number>();
    set.add(row.sessionId);
    presentBy.set(row.studentUserId, set);
  }

  // Sessions and assignments bucketed by season once, so the per-enrolment loop
  // below is linear in its own season's rows rather than in the whole scope's.
  const sessionsBySeason = new Map<number, typeof pastSessions>();
  for (const s of pastSessions) {
    const list = sessionsBySeason.get(s.seasonId) ?? [];
    list.push(s);
    sessionsBySeason.set(s.seasonId, list);
  }
  const assignmentsBySeason = new Map<number, typeof assignments>();
  for (const a of assignments) {
    const list = assignmentsBySeason.get(a.seasonId) ?? [];
    list.push(a);
    assignmentsBySeason.set(a.seasonId, list);
  }

  return enrollments.map((e) => {
    const eligibleSessions = (sessionsBySeason.get(e.seasonId) ?? []).filter(
      (s) => s.startsAt.getTime() >= e.enrolledAt.getTime(),
    );
    const attendanceTotal = eligibleSessions.length;
    const present = presentBy.get(e.studentUserId) ?? new Set<number>();
    const attendancePresent = eligibleSessions.filter((s) => present.has(s.id)).length;
    const attendancePct =
      attendanceTotal > 0 ? Math.round((attendancePresent / attendanceTotal) * 100) : 0;

    const expectedAssignments = (assignmentsBySeason.get(e.seasonId) ?? []).filter(
      (a) =>
        a.isAllGroups ||
        (e.groupId !== null && a.targets.some((t) => t.groupId === e.groupId)),
    );
    const submissionsExpected = expectedAssignments.length;
    const submissionsCompleted = expectedAssignments.filter((a) =>
      completed.has(`${e.studentUserId}:${a.id}`),
    ).length;
    const submissionPct =
      submissionsExpected > 0 ? Math.round((submissionsCompleted / submissionsExpected) * 100) : 0;

    const score = Math.round(attendancePct * 0.5 + submissionPct * 0.5);
    const base = {
      score,
      attendancePct,
      submissionPct,
      attendanceTotal,
      attendancePresent,
      submissionsExpected,
      submissionsCompleted,
    };

    return {
      ...base,
      studentUserId: e.studentUserId,
      studentName: e.studentUser.name,
      seasonId: e.seasonId,
      seasonTitle: e.season.title,
      groupId: e.groupId,
      groupName: e.group?.name ?? null,
      atRisk: isAtRisk(base),
    };
  });
}

/** Plan 8's callers keep this signature; it is one season's worth of the above. */
export async function computeEngagementForSeason(
  seasonId: number,
  opts: EngagementCohortOptions = {},
): Promise<EngagementRow[]> {
  return computeEngagementForSeasons([seasonId], opts);
}
```

> **Note for the agent.** Plan 8's `EngagementRow` does not carry `email`.
> Task 3 needs it for the CSV-replacement export and the cohort endpoint, so
> `studentUser: { select: { name: true, email: true } }` is selected above.
> If `engagementRowSchema` in `packages/shared/src/note.ts` lacks
> `studentEmail`, **add it there** (`studentEmail: z.string()`) rather than
> re-fetching users here, and map it in the return (`studentEmail:
> e.studentUser.email`). Put the change in your report as a fragment — it is
> domain 9's contract file, and one extra field is cheaper than a second query
> or a second row type.

- [ ] **Step 4: The permissions fragment** *(hand to the coordinator; do not edit the file)*

Append to `apps/backend/src/lib/permissions.ts`:

```ts
/**
 * Which seasons a caller may see report data for.
 *
 * `null` means "this surface is not theirs at all" — the caller gets 403
 * before any query runs. That is deliberate for LEADER: v1 excluded leaders
 * from this domain by not having a leader route (R109), and the v2 route tree
 * is flat and role-driven, so `/reports` exists as a file regardless of role
 * and is hidden only by navFor. Domain 4 already found one ported endpoint
 * that trusted groupLeaderIds without checking the target; a leader-scoped
 * report is a reasonable future feature and must not arrive by accident as
 * "the whole season, filtered on the client" (spec D6 #4).
 *
 * An ADMIN with no seasons returns an EMPTY permitted list, not null: they may
 * open the screen, it is simply empty (R2). Distinguishing the two matters —
 * 403 would tell an admin their account is broken.
 */
export type ReportScope = { kind: "all" } | { kind: "seasons"; seasonIds: number[] };

export function reportScopeFor(user: SessionUser): ReportScope | null {
  // MENTOR's remit is read-all-students (rbac.ts:41-43) and v1 gives them an
  // unscoped engagement CSV (R45), so "all" here is a port, not a widening.
  // SUPER gains the engagement view that v1's per-role page tree denied them
  // while its export route handed them the same data (spec D17) — a deliberate
  // divergence, recorded in this plan's ledger row 10.
  if (isSuper(user) || isMentor(user)) return { kind: "all" };
  if (user.role === "ADMIN") return { kind: "seasons", seasonIds: user.seasonAdminIds };
  return null;
}

/**
 * Who may download a season's full workbook.
 *
 * MENTOR is refused. v1's endpoint allows MENTOR any season id (R85) and the
 * only thing preventing it is that /mentor/reports never renders the button
 * (R86) — the domain's clearest example of authorization by absence of a
 * control. A mentor's remit is read-all-STUDENTS; a season workbook is also
 * every quiz score and every assignment status, which is nearer a leader's
 * remit than a mentor's (spec D6 #3).
 *
 * isAdminOfSeason short-circuits for SUPER and pairs the ADMIN role with the
 * seasonAdminIds claim (ruling C7), so a stray SeasonAdmin row naming a
 * student grants nothing.
 */
export function canExportSeasonWorkbook(user: SessionUser, seasonId: number): boolean {
  return isAdminOfSeason(user, seasonId);
}
```

- [ ] **Step 5: Write the report aggregation**

```ts
// apps/backend/src/lib/queries/reports.ts
import type {
  AssignmentCompletionRow,
  AttendancePoint,
  EngagementBand,
  EngagementReportRow,
  ResolvedScope,
} from "@space/shared";
// VALUE import — relative, five levels up (see the note in engagement.ts).
import { BAND_ORDER, bandFor } from "../../../../../packages/shared/src/index";

import { db } from "../../db/client";
import type { ReportScope } from "../permissions";
import { computeEngagementForSeasons } from "./engagement";

export interface EngagementSummaryOptions {
  trendLimit: number;
  from?: Date;
  to?: Date;
}

export interface EngagementListOptions {
  limit: number;
  cursor?: string;
  band?: EngagementBand;
}

/**
 * Turn "what the caller asked for" into "what the caller may have", by
 * INTERSECTION.
 *
 * v1's loadReportsData built its season filter from whatever integers the
 * caller passed and performed no authorization of any kind (R3); the gate lived
 * in whichever page called it. In v2 the ids arrive from a phone, so the
 * permitted set is a `where` clause and the request is a filter applied to the
 * result — never the other way round (ruling C8, spec §4 item 1).
 *
 * A requested id that is unknown, soft-deleted, or outside the caller's scope
 * is dropped silently and `truncated` is set. It is NOT a 403 and NOT a 404:
 * an error that distinguishes "exists but not yours" from "does not exist"
 * turns this endpoint into an existence oracle over the season table. It also
 * fixes R46, under which v1 answered an unknown id with a header-only CSV and
 * HTTP 200 — indistinguishable from "this season has no students".
 */
export async function resolveReportScope(
  scope: ReportScope,
  requestedIds: number[],
): Promise<ResolvedScope> {
  const permitted = await db.season.findMany({
    where: {
      deletedAt: null,
      ...(scope.kind === "seasons" ? { id: { in: scope.seasonIds } } : {}),
    },
    orderBy: [{ year: "desc" }, { title: "asc" }],
    select: { id: true, code: true, title: true },
  });

  const requested = new Set(requestedIds);
  const seasons = requestedIds.length > 0 ? permitted.filter((s) => requested.has(s.id)) : permitted;
  const truncated = requestedIds.length > 0 && seasons.length < requested.size;

  const label =
    seasons.length === 0
      ? "No seasons"
      : seasons.length === 1
        ? seasons[0]!.title
        : requestedIds.length === 0 && scope.kind === "all"
          ? "All seasons"
          : `${seasons.length} seasons`;

  return { seasonIds: seasons.map((s) => s.id), seasons, truncated, label };
}

export interface EngagementSummaryResult {
  scope: ResolvedScope;
  attendanceTrend: AttendancePoint[];
  completion: AssignmentCompletionRow[];
  bands: Array<{ band: EngagementBand; count: number }>;
  atRisk: EngagementReportRow[];
  atRiskTotal: number;
  cohortSize: number;
  enrollmentCount: number;
  generatedAt: string;
}

const EMPTY_BANDS = () => BAND_ORDER.map((band) => ({ band, count: 0 }));

/**
 * The engagement report, in eleven queries — six here plus the five inside
 * computeEngagementForSeasons — and eleven whether the cohort is four students
 * or four hundred, across one season or twenty.
 *
 * v1 cost `1 + 1 + S + 1 + A + 1 + 4E` round trips of which `S + 4E` were
 * strictly sequential (R10, R24, R29), and fetched every attendance row in
 * every past session in scope to compute one integer per session (R17). It is
 * the heaviest read in the product and it sits on the MENTOR tab bar. Under
 * React Query — which refetches on mount, on focus and on reconnect — that
 * shape re-issues the whole fan-out every time the app returns to the
 * foreground.
 */
export async function buildEngagementSummary(
  scope: ResolvedScope,
  options: EngagementSummaryOptions,
): Promise<EngagementSummaryResult> {
  const generatedAt = new Date().toISOString();
  const seasonIds = scope.seasonIds;
  if (seasonIds.length === 0) {
    return {
      scope,
      attendanceTrend: [],
      completion: [],
      bands: EMPTY_BANDS(),
      atRisk: [],
      atRiskTotal: 0,
      cohortSize: 0,
      enrollmentCount: 0,
      generatedAt,
    };
  }

  const now = new Date();
  // `to` and the "past sessions only" cut are BOTH `lte` on startsAt. Spreading
  // them into one object silently drops whichever comes first, so a `to` in the
  // future would un-bound the query and plot sessions that have not happened.
  // Take the minimum once, explicitly.
  const upper = options.to && options.to.getTime() < now.getTime() ? options.to : now;

  // Q1 — the trend window: the most recent N sessions, fetched descending and
  // reversed for display. v1 fetched every past session in scope and every
  // attendance row hanging off it (R17).
  const windowed = await db.session.findMany({
    where: {
      seasonId: { in: seasonIds },
      startsAt: { lte: upper, ...(options.from ? { gte: options.from } : {}) },
    },
    orderBy: { startsAt: "desc" },
    take: options.trendLimit,
    select: { id: true, seasonId: true, title: true, startsAt: true },
  });
  const sessions = [...windowed].reverse();

  // Q2 — EVERY enrolment in scope, whatever its status, with the two columns
  // that make a historical roster possible. Withdrawn and completed students
  // were on the roster at the time and must count in a past session's
  // denominator (spec D3). This one fetch also serves the targeting map and the
  // cohort counts below — the replacement for v1's per-season count loop (R10)
  // and per-assignment count fan-out (R24).
  const enrollments = await db.seasonEnrollment.findMany({
    where: { seasonId: { in: seasonIds } },
    select: {
      seasonId: true,
      studentUserId: true,
      groupId: true,
      status: true,
      enrolledAt: true,
      droppedAt: true,
    },
  });

  // Q3 — present-marks on the windowed sessions only, two columns.
  const attendance =
    sessions.length === 0
      ? []
      : await db.attendance.findMany({
          where: {
            sessionId: { in: sessions.map((s) => s.id) },
            status: { in: ["PRESENT", "LATE"] },
          },
          select: { sessionId: true, studentUserId: true },
        });
  const presentBySession = new Map<number, Set<number>>();
  for (const row of attendance) {
    const set = presentBySession.get(row.sessionId) ?? new Set<number>();
    set.add(row.studentUserId);
    presentBySession.set(row.sessionId, set);
  }

  const enrollmentsBySeason = new Map<number, typeof enrollments>();
  for (const e of enrollments) {
    const list = enrollmentsBySeason.get(e.seasonId) ?? [];
    list.push(e);
    enrollmentsBySeason.set(e.seasonId, list);
  }
  const seasonTitleById = new Map(scope.seasons.map((s) => [s.id, s.title]));

  const attendanceTrend: AttendancePoint[] = sessions.map((s) => {
    // The roster AS IT STOOD at this session's instant. v1 divided by today's
    // ACTIVE count (R10, R11) while counting attendance rows from students who
    // have since withdrawn (R12), so pct could exceed 100 and nothing clamped
    // it. Restricting the numerator to the same set makes presentCount <=
    // expectedCount hold by construction — no clamp, which would only hide the
    // next bug (ruling C5's closing line).
    const eligible = new Set<number>();
    for (const e of enrollmentsBySeason.get(s.seasonId) ?? []) {
      const joined = e.enrolledAt.getTime() <= s.startsAt.getTime();
      const stillOn = e.droppedAt === null || e.droppedAt.getTime() > s.startsAt.getTime();
      if (joined && stillOn) eligible.add(e.studentUserId);
    }
    const present = presentBySession.get(s.id) ?? new Set<number>();
    let presentCount = 0;
    for (const id of present) if (eligible.has(id)) presentCount += 1;

    return {
      sessionId: s.id,
      seasonId: s.seasonId,
      seasonTitle: seasonTitleById.get(s.seasonId) ?? "",
      title: s.title,
      startsAt: s.startsAt.toISOString(),
      presentCount,
      expectedCount: eligible.size,
      // null, not 0: a session that ran before anybody enrolled has no
      // percentage, and plotting it at zero draws a cliff that never happened
      // (fixes R13).
      pct: eligible.size > 0 ? Math.round((presentCount / eligible.size) * 100) : null,
    };
  });

  // Q4 — assignments and their targets.
  const assignments = await db.assignment.findMany({
    where: { seasonId: { in: seasonIds }, deletedAt: null },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      seasonId: true,
      title: true,
      isAllGroups: true,
      targets: { select: { groupId: true } },
    },
  });

  // Q5 — non-DRAFT submissions on them. Two columns; the studentUserId is what
  // makes the numerator intersectable with the expected set.
  const submissions =
    assignments.length === 0
      ? []
      : await db.submission.findMany({
          where: {
            assignmentId: { in: assignments.map((a) => a.id) },
            status: { not: "DRAFT" },
          },
          select: { assignmentId: true, studentUserId: true },
        });
  const submittedBy = new Map<number, Set<number>>();
  for (const row of submissions) {
    const set = submittedBy.get(row.assignmentId) ?? new Set<number>();
    set.add(row.studentUserId);
    submittedBy.set(row.assignmentId, set);
  }

  const completion: AssignmentCompletionRow[] = assignments.map((a) => {
    // Ruling C9: the expected set is ACTIVE enrolments in this assignment's
    // season, narrowed by the enrolment's group when the assignment is
    // targeted. v1 counted GroupStudent rows (R20) — a table unique on
    // studentUserId across the ENTIRE database (R21), so it holds one group per
    // student regardless of season and can never answer a per-season question.
    const expectedIds = new Set<number>();
    for (const e of enrollmentsBySeason.get(a.seasonId) ?? []) {
      if (e.status !== "ACTIVE") continue;
      if (a.isAllGroups || (e.groupId !== null && a.targets.some((t) => t.groupId === e.groupId))) {
        expectedIds.add(e.studentUserId);
      }
    }
    // Intersecting the numerator is the fix for R23: v1 counted submissions
    // from ANY student against a denominator of targeted students, so the bar
    // could exceed 100 and neither end was clamped.
    const submitters = submittedBy.get(a.id) ?? new Set<number>();
    let completed = 0;
    for (const id of submitters) if (expectedIds.has(id)) completed += 1;

    return {
      assignmentId: a.id,
      seasonId: a.seasonId,
      title: a.title,
      targeting: a.isAllGroups ? "all_groups" : "targeted",
      completed,
      expected: expectedIds.size,
      // null for a targeted assignment with no AssignmentTarget rows. v1 showed
      // 0 %, which reads as total cohort failure and is a mis-configured
      // assignment (R22).
      completionRate:
        expectedIds.size > 0 ? Math.round((completed / expectedIds.size) * 100) : null,
    };
  });

  // Q6..Q10 — domain 9's aggregation, called once for the whole scope.
  const rows = toReportRows(await computeEngagementForSeasons(seasonIds));

  const bandCounts = new Map<EngagementBand, number>(BAND_ORDER.map((b) => [b, 0]));
  for (const r of rows) bandCounts.set(r.band, (bandCounts.get(r.band) ?? 0) + 1);

  const atRiskAll = rows.filter((r) => r.band === "AT_RISK").sort(byScoreThenId);

  return {
    scope,
    attendanceTrend,
    completion,
    bands: BAND_ORDER.map((band) => ({ band, count: bandCounts.get(band) ?? 0 })),
    // The cap is v1's (R33). What is new is atRiskTotal beside it: a reader
    // currently cannot tell whether ten is all of them (spec D16).
    atRisk: atRiskAll.slice(0, 10),
    atRiskTotal: atRiskAll.length,
    // Two numbers, because they differ and v1 conflated them: bucket counts
    // count ENROLMENTS, so a two-season student is counted twice and the pie's
    // total exceeds the headcount (R27, R32).
    cohortSize: new Set(rows.map((r) => r.studentUserId)).size,
    enrollmentCount: rows.length,
    generatedAt,
  };
}

/** score ascending, then studentUserId, then seasonId — total and stable. */
function byScoreThenId(a: EngagementReportRow, b: EngagementReportRow): number {
  return a.score - b.score || a.studentUserId - b.studentUserId || a.seasonId - b.seasonId;
}

/**
 * Domain 9's row plus this domain's band. The band is computed HERE and
 * nowhere else, from the shared `bandFor`, so the at-risk list and the AT_RISK
 * slice are one predicate (D-17.2). Note the row deliberately drops domain 9's
 * `atRisk` boolean: `band === "AT_RISK"` is the same answer, and shipping both
 * is how a client ends up trusting the wrong one.
 */
function toReportRows(rows: Awaited<ReturnType<typeof computeEngagementForSeasons>>): EngagementReportRow[] {
  return rows.map((r) => ({
    score: r.score,
    attendancePct: r.attendancePct,
    submissionPct: r.submissionPct,
    attendanceTotal: r.attendanceTotal,
    attendancePresent: r.attendancePresent,
    submissionsExpected: r.submissionsExpected,
    submissionsCompleted: r.submissionsCompleted,
    studentUserId: r.studentUserId,
    name: r.studentName,
    email: r.studentEmail,
    seasonId: r.seasonId,
    seasonTitle: r.seasonTitle ?? "",
    band: bandFor(r),
  }));
}

/**
 * The cursor is an opaque base64 of a numeric OFFSET into the ordering above.
 *
 * The row set is computed whole in a constant number of queries either way, so
 * an offset costs nothing here and a keyset cursor would buy nothing — there is
 * no LIMIT/OFFSET being pushed to Postgres to be slow. Do not "fix" this into a
 * keyset cursor; it would only add a compound comparator to maintain.
 */
export function encodeCursor(offset: number): string {
  return Buffer.from(String(offset), "utf8").toString("base64url");
}

export function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  const n = Number(Buffer.from(cursor, "base64url").toString("utf8"));
  // A malformed cursor restarts the list rather than 400ing: it is a cache
  // artefact on the client, not user input worth an error screen.
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

export interface EngagementListResult {
  scope: ResolvedScope;
  rows: EngagementReportRow[];
  nextCursor: string | null;
  total: number;
}

/**
 * The cohort, paged and separately gated.
 *
 * v1 returned this array — every active student's name, email, season and three
 * scores — from the SAME function that fed the charts, to every caller,
 * including the two screens that render at most ten rows of it (R34). In v1 it
 * never leaves the server. Splitting it makes the expensive, sensitive half
 * separately gated, paged, and absent from the screen's first paint
 * (spec D6 #2).
 */
export async function listEngagementRows(
  scope: ResolvedScope,
  options: EngagementListOptions,
): Promise<EngagementListResult> {
  if (scope.seasonIds.length === 0) {
    return { scope, rows: [], nextCursor: null, total: 0 };
  }

  const all = toReportRows(await computeEngagementForSeasons(scope.seasonIds))
    .filter((r) => (options.band ? r.band === options.band : true))
    .sort(byScoreThenId);

  const offset = decodeCursor(options.cursor);
  const rows = all.slice(offset, offset + options.limit);
  const next = offset + rows.length;

  return {
    scope,
    rows,
    nextCursor: next < all.length ? encodeCursor(next) : null,
    total: all.length,
  };
}
```

- [ ] **Step 6: Verification** *(coordinator)*

```bash
cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern reports-queries
cd "$(git rev-parse --show-toplevel)" && pnpm turbo lint typecheck --filter=@space/backend
```

Expect: 17 passing, lint and typecheck clean. Then confirm Plan 8's own suite
still passes against the generalised function — its `computeEngagementForSeason`
delegate is the whole point of keeping the old name:

```bash
cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern engagement-routes
```

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/lib apps/backend/src/__tests__/integration/reports-queries.test.ts && \
  git commit -m "feat(backend): engagement report aggregation with an intersected scope and historical rosters"
```

---

### Task 4: The organisation roll-up

**Wave 2 · Agent B.** Runs in parallel with Task 3; disjoint files. Writes its
integration suite but does not run it.

**Files:**
- Create: `apps/backend/src/lib/queries/organisation-report.ts`
- Test: `apps/backend/src/__tests__/integration/organisation-report.test.ts`

**Interfaces:**
- Consumes: `db`; `type OrganisationReport` (Task 1).
- Produces: `buildOrganisationReport(): Promise<OrganisationReport>`.

**Query budget: four, in two concurrent waves.** v1 issues four too (R49), but
two of them are unbounded row-fetches whose only purpose is a JS tally: every
enrolment row of every season to count three statuses (R55), and one row per
alumnus to count them by year (R57). Both become `groupBy`s. The
`graduationYear` `groupBy` is the pleasing one — it yields *both* headline
counts **and** the by-year table from a single query, because Prisma emits a
`null` group for the not-graduated bucket.

- [ ] **Step 1: Write the failing integration test**

```ts
// apps/backend/src/__tests__/integration/organisation-report.test.ts
import { db } from "../../db/client";
import { buildOrganisationReport } from "../../lib/queries/organisation-report";
import { cleanupTestData, createTestSeason, createTestUser } from "./fixtures";

jest.setTimeout(60000);

let seasonId: number;
let deletedSeasonId: number;

beforeAll(async () => {
  await cleanupTestData();

  const season = await createTestSeason({ status: "ACTIVE", year: 2099 });
  seasonId = season.id;

  const deleted = await createTestSeason({ status: "ACTIVE", year: 2098 });
  deletedSeasonId = deleted.id;
  await db.season.update({ where: { id: deletedSeasonId }, data: { deletedAt: new Date() } });

  const active = await createTestUser("org-active", "STUDENT");
  const completed = await createTestUser("org-completed", "STUDENT");
  const withdrawn = await createTestUser("org-withdrawn", "STUDENT");
  const neverEnrolled = await createTestUser("org-never", "STUDENT");
  const alumnusA = await createTestUser("org-alum-a", "STUDENT");
  const alumnusB = await createTestUser("org-alum-b", "STUDENT");
  const alumnusC = await createTestUser("org-alum-c", "STUDENT");
  const leaderOne = await createTestUser("org-leader-1", "LEADER");
  const leaderTwo = await createTestUser("org-leader-2", "LEADER");

  await db.user.update({ where: { id: alumnusA.id }, data: { graduationYear: 2098 } });
  await db.user.update({ where: { id: alumnusB.id }, data: { graduationYear: 2098 } });
  await db.user.update({ where: { id: alumnusC.id }, data: { graduationYear: 2097 } });

  // leaderOne leads BOTH groups in this season and must be counted once (R56).
  const groupA = await db.group.create({
    data: {
      seasonId,
      name: "Group A",
      leaders: { create: [{ userId: leaderOne.id }, { userId: leaderTwo.id }] },
    },
    select: { id: true },
  });
  await db.group.create({
    data: { seasonId, name: "Group B", leaders: { create: { userId: leaderOne.id } } },
    select: { id: true },
  });

  await db.seasonEnrollment.createMany({
    data: [
      { seasonId, studentUserId: active.id, groupId: groupA.id, status: "ACTIVE" },
      { seasonId, studentUserId: completed.id, groupId: groupA.id, status: "COMPLETED" },
      { seasonId, studentUserId: withdrawn.id, groupId: groupA.id, status: "WITHDRAWN" },
    ],
  });

  expect(neverEnrolled.id).toBeGreaterThan(0);
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("buildOrganisationReport", () => {
  it("tallies the three enrolment statuses with one groupBy, naming WITHDRAWN honestly", async () => {
    const report = await buildOrganisationReport();
    const row = report.seasons.find((s) => s.seasonId === seasonId)!;
    // v1 loaded EVERY enrolment row of EVERY season and counted them in JS,
    // with no aggregate and no bound (R55).
    expect(row).toMatchObject({ activeCount: 1, completedCount: 1, withdrawnCount: 1 });
    // The contract names the enum member; the display label stays "Dropped" (R54).
    expect("droppedCount" in row).toBe(false);
  });

  it("counts a leader of two groups in one season once (R56)", async () => {
    const report = await buildOrganisationReport();
    const row = report.seasons.find((s) => s.seasonId === seasonId)!;
    expect(row.leaderCount).toBe(2);
  });

  it("carries code beside id so the season link can resolve (R62, D13)", async () => {
    const report = await buildOrganisationReport();
    const row = report.seasons.find((s) => s.seasonId === seasonId)!;
    // v1 linked to /super/seasons/<integer id> while the route resolves by
    // `code`, so every row on that table 404s.
    expect(row.code).toMatch(/^space-v2-test-/);
  });

  it("excludes soft-deleted seasons (R53)", async () => {
    const report = await buildOrganisationReport();
    expect(report.seasons.map((s) => s.seasonId)).not.toContain(deletedSeasonId);
  });

  it("splits students from alumni on graduationYear, from ONE groupBy (R51, R52, R57)", async () => {
    const report = await buildOrganisationReport();
    const testAlumni = report.alumniByYear.filter((a) => a.year === 2098 || a.year === 2097);
    expect(testAlumni).toEqual([
      { year: 2098, count: 2 },
      { year: 2097, count: 1 },
    ]);
    // Descending by year, as v1 sorted (R57).
    const years = report.alumniByYear.map((a) => a.year);
    expect([...years].sort((a, b) => b - a)).toEqual(years);
  });

  it("names the headline count after what it counts (R51, D4)", async () => {
    const report = await buildOrganisationReport();
    // v1 called this "Current students" while counting student ACCOUNTS —
    // including one enrolled in nothing (org-never above). The QUERY is
    // unchanged; only the field name stops restating the wrong claim.
    expect(report.totalStudentsNotGraduated).toBeGreaterThanOrEqual(4);
    expect("totalStudents" in report).toBe(false);
  });

  it("counts active seasons from the already-fetched list (R59)", async () => {
    const report = await buildOrganisationReport();
    expect(report.activeSeasonCount).toBe(
      report.seasons.filter((s) => s.status === "ACTIVE").length,
    );
  });
});
```

**What the failure proves.** After the module exists but before the `groupBy`
lands, the first case fails with `Expected: 1, Received: 0` on
`withdrawnCount` — the field name itself is the assertion, so a copy of v1's
`droppedCount` cannot pass it.

- [ ] **Step 2: Write the aggregation**

```ts
// apps/backend/src/lib/queries/organisation-report.ts
import type { OrganisationReport } from "@space/shared";

import { db } from "../../db/client";

/**
 * The organisation roll-up — student and alumni totals, per-season enrolment
 * tallies, distinct leader counts, alumni by graduation year.
 *
 * This shares NO metric with the engagement report: no attendance, no
 * submissions, no assignments, no engagement score, no per-student row, no
 * season filter (R61). It is a different report model, not a superset, and
 * merging the two behind one endpoint with a mode flag would invent a
 * relationship v1 does not have (spec §7 note (b)).
 *
 * Four queries in two waves, against v1's four of which two were unbounded
 * row-fetches whose only purpose was a JS tally (R55, R57).
 */
export async function buildOrganisationReport(): Promise<OrganisationReport> {
  const generatedAt = new Date().toISOString();

  const [studentTally, seasons] = await Promise.all([
    // ONE query for three figures. Prisma emits a `null` group for students
    // with no graduationYear, which is exactly v1's totalStudents population
    // (R51); every other group is an alumni year (R52, R57). v1 issued two
    // counts plus a row-per-alumnus fetch to tally in JS, with an unreachable
    // null guard inside the loop because the where clause already excluded
    // them (R58).
    db.user.groupBy({
      by: ["graduationYear"],
      where: { role: "STUDENT", deletedAt: null },
      _count: { _all: true },
    }),
    db.season.findMany({
      where: { deletedAt: null },
      orderBy: [{ year: "desc" }, { program: "asc" }],
      select: { id: true, code: true, title: true, program: true, year: true, status: true },
    }),
  ]);

  const seasonIds = seasons.map((s) => s.id);

  const [enrolmentTally, leaderRows] = await Promise.all([
    db.seasonEnrollment.groupBy({
      by: ["seasonId", "status"],
      where: { seasonId: { in: seasonIds } },
      _count: { _all: true },
    }),
    // The one row-fetch left in this file. "Distinct leaders per season" is not
    // expressible as a Prisma groupBy across the Group join, and it is bounded
    // by leader assignments (a handful per group), not by anything that grows
    // with the cohort. v1 fetched the same rows nested inside every season and
    // deduped in JS (R56); this is the same dedupe over a flat, filtered set.
    db.groupLeader.findMany({
      where: { group: { seasonId: { in: seasonIds } } },
      select: { userId: true, group: { select: { seasonId: true } } },
    }),
  ]);

  let totalStudentsNotGraduated = 0;
  let totalAlumni = 0;
  const alumniByYear: Array<{ year: number; count: number }> = [];
  for (const row of studentTally) {
    const n = row._count._all;
    if (row.graduationYear === null) {
      totalStudentsNotGraduated += n;
    } else {
      totalAlumni += n;
      alumniByYear.push({ year: row.graduationYear, count: n });
    }
  }
  alumniByYear.sort((a, b) => b.year - a.year);

  const counts = new Map<number, { active: number; completed: number; withdrawn: number }>();
  for (const row of enrolmentTally) {
    const entry = counts.get(row.seasonId) ?? { active: 0, completed: 0, withdrawn: 0 };
    if (row.status === "ACTIVE") entry.active = row._count._all;
    else if (row.status === "COMPLETED") entry.completed = row._count._all;
    else if (row.status === "WITHDRAWN") entry.withdrawn = row._count._all;
    counts.set(row.seasonId, entry);
  }

  const leadersBySeason = new Map<number, Set<number>>();
  for (const row of leaderRows) {
    const set = leadersBySeason.get(row.group.seasonId) ?? new Set<number>();
    set.add(row.userId);
    leadersBySeason.set(row.group.seasonId, set);
  }

  return {
    totalStudentsNotGraduated,
    totalAlumni,
    // From the list already in hand — the one JS tally v1 did that costs
    // nothing (R59).
    activeSeasonCount: seasons.filter((s) => s.status === "ACTIVE").length,
    seasons: seasons.map((s) => {
      const c = counts.get(s.id) ?? { active: 0, completed: 0, withdrawn: 0 };
      return {
        seasonId: s.id,
        code: s.code,
        program: s.program,
        year: s.year,
        title: s.title,
        status: s.status,
        activeCount: c.active,
        completedCount: c.completed,
        // Named for the enum member it counts. v1's `droppedCount` renamed
        // WITHDRAWN at the data layer, so a reader of the type could not tell
        // which enum value it meant (R54).
        withdrawnCount: c.withdrawn,
        leaderCount: leadersBySeason.get(s.id)?.size ?? 0,
      };
    }),
    alumniByYear,
    generatedAt,
  };
}
```

- [ ] **Step 3: Verification** *(coordinator)*

```bash
cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern organisation-report
cd "$(git rev-parse --show-toplevel)" && pnpm turbo lint typecheck --filter=@space/backend
```

Expect: 7 passing.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/lib/queries/organisation-report.ts \
        apps/backend/src/__tests__/integration/organisation-report.test.ts && \
  git commit -m "feat(backend): organisation roll-up as aggregates, with honest field names"
```

---

### Task 5: The three JSON read routes

**Wave 3 · Coordinator only** (mounts routers; edits `app.ts` and
`openapi.ts`).

**Files:**
- Create: `apps/backend/src/routes/reports.ts`
- Modify: `apps/backend/src/app.ts` (one import, one mount)
- Modify: `apps/backend/src/docs/openapi.ts`
- Test: `apps/backend/src/__tests__/integration/reports-routes.test.ts`

**Interfaces:**
- Consumes: `apiOk` / `apiError`; `requireAuth` / `requireUser`;
  `reportScopeFor` (Task 3 fragment); `resolveReportScope`,
  `buildEngagementSummary`, `listEngagementRows` (Task 3);
  `buildOrganisationReport` (Task 4);
  `reportScopeQuerySchema`, `engagementStudentsQuerySchema` (Task 1 — **value**
  imports, relative path, four levels up from `routes/`).
- Produces: `reportsRouter`; `GET /api/v1/reports/engagement`,
  `GET /api/v1/reports/engagement/students`,
  `GET /api/v1/reports/organisation`.

**Task 3 tested the arithmetic. This task tests only the gate.** A red here
means an authorization defect; a red there means a formula defect. Keeping them
apart is the difference between "something is wrong with reports" and a
diagnosis.

- [ ] **Step 1: Write the failing integration test**

```ts
// apps/backend/src/__tests__/integration/reports-routes.test.ts
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

jest.setTimeout(60000);

const app = createApp();

let mySeasonId: number;
let otherSeasonId: number;
let superToken: string;
let mentorToken: string;
let adminToken: string;
let emptyAdminToken: string;
let leaderToken: string;
let studentToken: string;

beforeAll(async () => {
  await cleanupTestData();

  const mine = await createTestSeason();
  const other = await createTestSeason();
  mySeasonId = mine.id;
  otherSeasonId = other.id;

  const superUser = await createTestUser("rr-super", "SUPER");
  const mentor = await createTestUser("rr-mentor", "MENTOR");
  const admin = await createTestUser("rr-admin", "ADMIN");
  const emptyAdmin = await createTestUser("rr-admin-empty", "ADMIN");
  const leader = await createTestUser("rr-leader", "LEADER");
  const student = await createTestUser("rr-student", "STUDENT");

  await db.seasonAdmin.create({ data: { seasonId: mySeasonId, userId: admin.id } });

  const group = await db.group.create({
    data: { seasonId: mySeasonId, name: "Group A", leaders: { create: { userId: leader.id } } },
    select: { id: true },
  });
  await db.seasonEnrollment.create({
    data: { seasonId: mySeasonId, studentUserId: student.id, groupId: group.id, status: "ACTIVE" },
  });

  superToken = await login(app, superUser.email);
  mentorToken = await login(app, mentor.email);
  adminToken = await login(app, admin.email);
  emptyAdminToken = await login(app, emptyAdmin.email);
  leaderToken = await login(app, leader.email);
  studentToken = await login(app, student.email);
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("GET /api/v1/reports/engagement — the gate", () => {
  it("401s an unauthenticated request in the JSON envelope, never a redirect (R87)", async () => {
    const res = await request(app).get("/api/v1/reports/engagement");
    // v1's export routes call getCurrentUserOrRedirect, so an unauthenticated
    // request is answered with a 307 to the login page — not a usable answer
    // for a mobile client fetching data.
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBeDefined();
  });

  it("refuses a LEADER explicitly (R109, D6 #4)", async () => {
    const res = await request(app)
      .get("/api/v1/reports/engagement")
      .set("authorization", `Bearer ${leaderToken}`);
    // v1 excluded leaders by not having a leader route. The v2 tree is flat and
    // /reports exists as a file for every role, so the endpoint must say no.
    expect(res.status).toBe(403);
  });

  it("refuses a STUDENT explicitly (R110)", async () => {
    const res = await request(app)
      .get("/api/v1/reports/engagement")
      .set("authorization", `Bearer ${studentToken}`);
    expect(res.status).toBe(403);
  });

  it("gives an ADMIN only their own seasons, and drops the rest silently", async () => {
    const res = await request(app)
      .get(`/api/v1/reports/engagement?seasonId=${mySeasonId}&seasonId=${otherSeasonId}`)
      .set("authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    // THE test this task exists for. v1's loadReportsData queried whatever ids
    // it was handed (R3); the route above it checked, and then ran the query on
    // the REQUEST rather than on the check's result. Here the response can only
    // contain what the intersection allowed.
    expect(res.body.data.scope.seasonIds).toEqual([mySeasonId]);
    expect(res.body.data.scope.truncated).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain(`"seasonId":${otherSeasonId}`);
  });

  it("does not distinguish 'not yours' from 'does not exist'", async () => {
    const nonexistent = 2147483646;
    const a = await request(app)
      .get(`/api/v1/reports/engagement?seasonId=${otherSeasonId}`)
      .set("authorization", `Bearer ${adminToken}`);
    const b = await request(app)
      .get(`/api/v1/reports/engagement?seasonId=${nonexistent}`)
      .set("authorization", `Bearer ${adminToken}`);
    // Anything else is an existence oracle over the season table.
    expect(a.status).toBe(b.status);
    expect(a.body.data.scope).toEqual(b.body.data.scope);
  });

  it("gives an ADMIN with no seasons an empty report, not a 403", async () => {
    const res = await request(app)
      .get("/api/v1/reports/engagement")
      .set("authorization", `Bearer ${emptyAdminToken}`);
    // 403 would tell an admin their account is broken. R2: an empty scope
    // returns empty collections rather than throwing.
    expect(res.status).toBe(200);
    expect(res.body.data.scope.seasonIds).toEqual([]);
    expect(res.body.data.bands).toHaveLength(4);
  });

  it("gives MENTOR every season (R45)", async () => {
    const res = await request(app)
      .get("/api/v1/reports/engagement")
      .set("authorization", `Bearer ${mentorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.scope.seasonIds).toEqual(
      expect.arrayContaining([mySeasonId, otherSeasonId]),
    );
  });

  it("gives SUPER the engagement view v1 denied them (spec D17 — deliberate divergence)", async () => {
    const res = await request(app)
      .get("/api/v1/reports/engagement")
      .set("authorization", `Bearer ${superToken}`);
    // v1 gates /mentor/reports to MENTOR only (R106) while its CSV route hands
    // SUPER exactly this data with no season parameter (R45). The restriction
    // was an artefact of the per-role page tree, not a policy.
    expect(res.status).toBe(200);
    expect(res.body.data.scope.seasonIds.length).toBeGreaterThan(0);
  });

  it("rejects a malformed trendLimit rather than silently defaulting", async () => {
    const res = await request(app)
      .get("/api/v1/reports/engagement?trendLimit=nope")
      .set("authorization", `Bearer ${superToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("bad_request");
  });

  it("never carries the cohort in the summary payload (R34)", async () => {
    const res = await request(app)
      .get("/api/v1/reports/engagement")
      .set("authorization", `Bearer ${superToken}`);
    expect(res.body.data.rawStudents).toBeUndefined();
    expect(res.body.data.atRisk.length).toBeLessThanOrEqual(10);
    expect(res.body.data.atRiskTotal).toBeDefined();
  });
});

describe("GET /api/v1/reports/engagement/students — separately gated", () => {
  it("applies the same refusals as the summary", async () => {
    for (const token of [leaderToken, studentToken]) {
      const res = await request(app)
        .get("/api/v1/reports/engagement/students")
        .set("authorization", `Bearer ${token}`);
      expect(res.status).toBe(403);
    }
  });

  it("pages, and intersects the scope exactly as the summary does", async () => {
    const res = await request(app)
      .get(`/api/v1/reports/engagement/students?seasonId=${otherSeasonId}&limit=1`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.scope.seasonIds).toEqual([]);
    expect(res.body.data.rows).toEqual([]);
    expect(res.body.data.nextCursor).toBeNull();
  });

  it("caps limit at 200", async () => {
    const res = await request(app)
      .get("/api/v1/reports/engagement/students?limit=1000")
      .set("authorization", `Bearer ${superToken}`);
    expect(res.status).toBe(400);
  });
});

describe("GET /api/v1/reports/organisation — SUPER only", () => {
  it("admits SUPER", async () => {
    const res = await request(app)
      .get("/api/v1/reports/organisation")
      .set("authorization", `Bearer ${superToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.totalStudentsNotGraduated).toBeGreaterThanOrEqual(0);
  });

  it("refuses MENTOR, ADMIN, LEADER and STUDENT alike (R50, R107)", async () => {
    for (const token of [mentorToken, adminToken, leaderToken, studentToken]) {
      const res = await request(app)
        .get("/api/v1/reports/organisation")
        .set("authorization", `Bearer ${token}`);
      // loadSuperReports takes no arguments and covers the whole database with
      // no gate; its only protection is requireRole(["SUPER"]) on the one page
      // that calls it. That gate moves into the endpoint here.
      expect(res.status).toBe(403);
    }
  });
});
```

**What the failure proves.** Before the router is mounted every case fails with
`404` and `res.body.error.code === "not_found"` from the catch-all handler. The
first *meaningful* red is the ADMIN intersection case: with a naive
check-then-run handler it returns `200` and
`scope.seasonIds: [mySeasonId, otherSeasonId]`, failing on
`Expected: [<mySeasonId>] Received: [<mySeasonId>, <otherSeasonId>]` — the exact
shape of R3.

- [ ] **Step 2: Run it to see it fail**

```bash
cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern reports-routes
```

- [ ] **Step 3: Write the routes**

```ts
// apps/backend/src/routes/reports.ts
import { Router } from "express";

// Relative, not "@space/shared": these are VALUE imports (Zod schemas), and
// tsc's rootDir here is the repo root, so a bare specifier emits a
// require("@space/shared") that resolves back to the TypeScript source at
// runtime and crashes the built server with ERR_MODULE_NOT_FOUND (CLAUDE.md).
// Four levels up from src/routes/.
import {
  engagementStudentsQuerySchema,
  reportScopeQuerySchema,
} from "../../../../packages/shared/src/index";

import { apiError, apiOk } from "../lib/api-response";
import { reportScopeFor } from "../lib/permissions";
import { buildOrganisationReport } from "../lib/queries/organisation-report";
import {
  buildEngagementSummary,
  listEngagementRows,
  resolveReportScope,
} from "../lib/queries/reports";
import { isSuper } from "../lib/rbac";
import { requireAuth, requireUser } from "../middleware/require-auth";

export const reportsRouter = Router();

reportsRouter.use(requireAuth);

/**
 * The engagement summary.
 *
 * Everything in this domain is a read; nothing here writes a row (ruling C6,
 * spec §6). The three gates that matter all live above the query and none of
 * them is inherited from v1, because v1 had none: loadReportsData performs no
 * authorization of any kind and its only protection is which server component
 * calls it (R3).
 */
reportsRouter.get("/engagement", async (req, res) => {
  const user = requireUser(req);

  const scope = reportScopeFor(user);
  // LEADER and STUDENT, explicitly. Not an empty list — an empty list is
  // indistinguishable from "there is no data", which is exactly the accident
  // v1 relied on (spec D6 #4, R109, R110).
  if (scope === null) return apiError(res, "forbidden", "You don't have access to this.", 403);

  const parsed = reportScopeQuerySchema.safeParse(req.query);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid report filters.", 400);

  const resolved = await resolveReportScope(scope, parsed.data.seasonId);
  const summary = await buildEngagementSummary(resolved, {
    trendLimit: parsed.data.trendLimit,
    ...(parsed.data.from ? { from: new Date(parsed.data.from) } : {}),
    ...(parsed.data.to ? { to: new Date(parsed.data.to) } : {}),
  });

  return apiOk(res, summary);
});

/**
 * The cohort, paged and separately gated (spec D6 #2, R34).
 *
 * The gate is written out again rather than shared with the summary above on
 * purpose: "separately gated" is the requirement, and a helper that both routes
 * call is one edit away from being loosened for both at once.
 */
reportsRouter.get("/engagement/students", async (req, res) => {
  const user = requireUser(req);

  const scope = reportScopeFor(user);
  if (scope === null) return apiError(res, "forbidden", "You don't have access to this.", 403);

  const parsed = engagementStudentsQuerySchema.safeParse(req.query);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid report filters.", 400);

  const resolved = await resolveReportScope(scope, parsed.data.seasonId);
  const page = await listEngagementRows(resolved, {
    limit: parsed.data.limit,
    ...(parsed.data.cursor ? { cursor: parsed.data.cursor } : {}),
    ...(parsed.data.band ? { band: parsed.data.band } : {}),
  });

  return apiOk(res, page);
});

/**
 * The organisation roll-up.
 *
 * Shares no metric with the engagement report (R61) and is therefore its own
 * endpoint with its own gate rather than a mode flag on the one above.
 * loadSuperReports takes no arguments and covers the whole database with no
 * authorization (R49, R50); requireRole(["SUPER"]) on its single calling page
 * is the entire protection in v1, and it moves here.
 */
reportsRouter.get("/organisation", async (req, res) => {
  const user = requireUser(req);
  if (!isSuper(user)) return apiError(res, "forbidden", "You don't have access to this.", 403);

  return apiOk(res, await buildOrganisationReport());
});
```

- [ ] **Step 4: Mount it**

In `apps/backend/src/app.ts`, beside the other route imports:

```ts
import { reportsRouter } from "./routes/reports";
```

and with the other mounts, **after** `/api/v1/submissions`:

```ts
  app.use("/api/v1/reports", reportsRouter);
```

Order is not load-bearing here — `/api/v1/reports` collides with nothing — but
keeping the mounts in one block keeps the file readable.

- [ ] **Step 5: OpenAPI, same commit**

Add three paths to `apps/backend/src/docs/openapi.ts`, following the file's
existing `ok(...)` / `errRef(...)` idiom. The prose is not decoration; these
four claims are the contract the mobile client is written against and the next
reader's only warning about the v1 divergences:

```ts
    "/api/v1/reports/engagement": {
      get: {
        tags: ["Reports"],
        summary: "Engagement summary for the caller's permitted seasons",
        description:
          "Charts, band counts and the capped at-risk list. The cohort is NOT included — " +
          "see /api/v1/reports/engagement/students.\n\n" +
          "Scope: `seasonId` may repeat. The requested ids are INTERSECTED with the " +
          "caller's permitted set (SUPER/MENTOR: every non-deleted season; ADMIN: their " +
          "seasonAdminIds); ids outside it are dropped silently and `scope.truncated` is " +
          "set. LEADER and STUDENT are refused.\n\n" +
          "Metrics: `attendanceTrend[].pct` divides by the roster as it stood at that " +
          "session's instant, so it cannot exceed 100 and is `null` when nobody was " +
          "enrolled yet. `completion[].completionRate` is a per-ASSIGNMENT figure and is " +
          "not the same unit as a per-student submission percentage. A row's `band` is " +
          "the at-risk answer: `AT_RISK` means either engagement component is below 60, " +
          "and the at-risk list is exactly the rows in that band.\n\n" +
          "Times: `startsAt` is a raw UTC instant; the client formats it. The server " +
          "performs no wall-clock derivation for this endpoint.",
        parameters: [
          { name: "seasonId", in: "query", required: false, schema: { type: "array", items: { type: "integer" } }, style: "form", explode: true },
          { name: "from", in: "query", required: false, schema: { type: "string", format: "date-time" } },
          { name: "to", in: "query", required: false, schema: { type: "string", format: "date-time" } },
          { name: "trendLimit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 200, default: 26 } },
        ],
        responses: {
          200: ok(engagementSummarySchemaDoc, "Engagement summary"),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
        },
      },
    },
```

…and the same treatment for `/api/v1/reports/engagement/students` (note in its
description that it is **separately gated** and returns one row per active
enrolment, so a student in two in-scope seasons appears twice) and
`/api/v1/reports/organisation` (note that `totalStudentsNotGraduated` counts
student **accounts**, not enrolments, and that `withdrawnCount` is the
`WITHDRAWN` enum member displayed as "Dropped").

Declare `engagementSummarySchemaDoc`, `engagementStudentPageSchemaDoc` and
`organisationReportSchemaDoc` as `const` objects alongside the file's existing
response shapes. They are hand-authored TypeScript interfaces, like every other
response in this document — there is nothing to generate from.

- [ ] **Step 6: Verification**

```bash
cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern reports-routes
cd "$(git rev-parse --show-toplevel)" && pnpm turbo lint typecheck --filter=@space/backend
```

Expect: 14 passing. Then eyeball the document renders:

```bash
cd apps/backend && npx ts-node -e "import('./src/docs/openapi').then(m => console.log(Object.keys(m.openApiDocument.paths).filter(p => p.includes('reports'))))"
```

Expect three paths listed.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/routes/reports.ts apps/backend/src/app.ts \
        apps/backend/src/docs/openapi.ts \
        apps/backend/src/__tests__/integration/reports-routes.test.ts && \
  git commit -m "feat(backend): report read endpoints with an intersected season scope"
```

---

### Task 6: The two workbook builders

**Wave 3 · Agent C.** Runs in parallel with Task 5; touches only new files
under `lib/exports/` plus one addition to Plan 3's `lib/org-time.ts`. Writes its
integration suite but does not run it.

**Files:**
- Modify: `apps/backend/package.json` (add `exceljs`)
- Modify: `apps/backend/src/lib/org-time.ts` (add `formatDayInOrgTime`)
- Create: `apps/backend/src/lib/exports/workbook-style.ts`
- Create: `apps/backend/src/lib/exports/season-workbook.ts`
- Create: `apps/backend/src/lib/exports/engagement-workbook.ts`
- Test: `apps/backend/src/__tests__/integration/season-workbook.test.ts`

**Interfaces:**
- Consumes: `db`; `computeEngagementForSeasons` (Task 3);
  `formatDayInOrgTime` / `formatInOrgTime` (Plan 3);
  `REPORT_METRIC_NOTES`, `XLSX_MIME`, `type EngagementReportRow` (Task 1 —
  **value** import, relative path, **five** levels up from `lib/exports/`).
- Produces:
  - `workbook-style.ts`: `HEADER_FILL`, `styleHeader(row)`,
    `freezeFirstRowAndColumns(sheet, xSplit)`, `identityWidths`,
    `addKeySheet(workbook, lines)`, `COLLATOR`.
  - `season-workbook.ts`: `buildSeasonWorkbook(seasonId): Promise<SeasonWorkbookResult | null>`
    where `SeasonWorkbookResult = { workbook: ExcelJS.Workbook; seasonCode: string; rowCount: number; sheets: SheetSummary[] }`;
    `summariseSeasonWorkbook(seasonId): Promise<SeasonWorkbookSummary | null>` (the manifest's counts, without building anything).
  - `engagement-workbook.ts`: `buildEngagementWorkbook(rows, scopeLabel): ExcelJS.Workbook`.

- [ ] **Step 1: Install exceljs**

```bash
cd apps/backend && pnpm add exceljs@^4.4.0
```

Same major as v1 (`jpc-space/package.json:34`), so the `Workbook` / `Worksheet`
API this code uses is the API v1's file is written against and a reader can diff
the two.

- [ ] **Step 2: Write the failing integration test**

```ts
// apps/backend/src/__tests__/integration/season-workbook.test.ts
import { db } from "../../db/client";
import { newPublicId } from "../../lib/public-id";
import { buildSeasonWorkbook, summariseSeasonWorkbook } from "../../lib/exports/season-workbook";
import { cleanupTestData, createTestSeason, createTestUser } from "./fixtures";

jest.setTimeout(60000);

let seasonId: number;
let deletedSeasonId: number;
let groupAId: number;
let aliceId: number;
let bobId: number;

/** Read a sheet's rows as arrays of cell values, header first. */
function sheetRows(workbook: import("exceljs").Workbook, name: string): unknown[][] {
  const sheet = workbook.getWorksheet(name);
  if (!sheet) throw new Error(`missing sheet ${name}`);
  const out: unknown[][] = [];
  sheet.eachRow((row) => {
    // row.values is 1-indexed with a leading undefined.
    out.push((row.values as unknown[]).slice(1));
  });
  return out;
}

beforeAll(async () => {
  await cleanupTestData();

  const season = await createTestSeason();
  seasonId = season.id;
  const deleted = await createTestSeason();
  deletedSeasonId = deleted.id;
  await db.season.update({ where: { id: deletedSeasonId }, data: { deletedAt: new Date() } });

  const alice = await createTestUser("wb-alice", "STUDENT");
  const bob = await createTestUser("wb-bob", "STUDENT");
  aliceId = alice.id;
  bobId = bob.id;

  const gA = await db.group.create({ data: { seasonId, name: "Group A" }, select: { id: true } });
  const gB = await db.group.create({ data: { seasonId, name: "Group B" }, select: { id: true } });
  groupAId = gA.id;

  const s1 = await db.session.create({
    data: {
      seasonId,
      title: "Opening",
      startsAt: new Date("2020-03-01T18:00:00.000Z"),
      durationMinutes: 60,
    },
    select: { id: true },
  });
  const s2 = await db.session.create({
    data: {
      seasonId,
      title: "Week two",
      startsAt: new Date("2020-03-08T18:00:00.000Z"),
      durationMinutes: 60,
    },
    select: { id: true },
  });
  await db.session.create({
    data: {
      seasonId,
      title: "Not yet",
      startsAt: new Date("2999-01-01T00:00:00.000Z"),
      durationMinutes: 60,
    },
  });

  await db.seasonEnrollment.createMany({
    data: [
      {
        seasonId,
        studentUserId: alice.id,
        groupId: gA.id,
        status: "ACTIVE",
        enrolledAt: new Date("2020-01-01T00:00:00.000Z"),
      },
      {
        seasonId,
        studentUserId: bob.id,
        groupId: gB.id,
        status: "ACTIVE",
        enrolledAt: new Date("2020-01-01T00:00:00.000Z"),
      },
    ],
  });

  await db.attendance.createMany({
    data: [
      { sessionId: s1.id, studentUserId: alice.id, status: "PRESENT" },
      // A LATE row WITH minutes recorded. v1 printed the 12 into the cell.
      { sessionId: s2.id, studentUserId: alice.id, status: "LATE", lateMinutes: 12 },
      { sessionId: s1.id, studentUserId: bob.id, status: "ABSENT" },
      // bob has no row at all for s2 — the blank case.
    ],
  });

  // A published PAPER quiz, an UNPUBLISHED ONLINE quiz, and a zero-max quiz.
  const paper = await db.quiz.create({
    data: { seasonId, title: "Paper one", kind: "PAPER", maxScore: 20 },
    select: { id: true },
  });
  await db.quiz.create({
    data: { seasonId, title: "Draft online", kind: "ONLINE", maxScore: 10, publishedAt: null },
  });
  await db.quiz.create({
    data: { seasonId, title: "Zero max", kind: "PAPER", maxScore: 0 },
  });
  await db.quizGrade.create({
    data: { quizId: paper.id, studentUserId: alice.id, score: 15 },
  });

  const allGroups = await db.assignment.create({
    data: { seasonId, title: "For everyone", isAllGroups: true },
    select: { id: true },
  });
  const groupAOnly = await db.assignment.create({
    data: {
      seasonId,
      title: "Group A only",
      isAllGroups: false,
      targets: { create: { groupId: gA.id } },
    },
    select: { id: true },
  });

  await db.submission.createMany({
    data: [
      { assignmentId: allGroups.id, studentUserId: alice.id, publicId: newPublicId(), status: "SUBMITTED" },
      { assignmentId: groupAOnly.id, studentUserId: alice.id, publicId: newPublicId(), status: "DRAFT" },
    ],
  });
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("buildSeasonWorkbook", () => {
  it("returns null for a soft-deleted season (D14)", async () => {
    // v1 fetched the season with findUniqueOrThrow on id alone (R81), so
    // anyone holding a deleted season's id could export its complete
    // attendance and grade history.
    expect(await buildSeasonWorkbook(deletedSeasonId)).toBeNull();
  });

  it("has four sheets: the three data sheets plus a Key (D-17.14)", async () => {
    const result = (await buildSeasonWorkbook(seasonId))!;
    expect(result.workbook.worksheets.map((w) => w.name)).toEqual([
      "Attendance",
      "Grades",
      "Assignments",
      "Key",
    ]);
  });

  it("prints 'L' for a LATE cell and never the recorded minutes (ruling C3)", async () => {
    const result = (await buildSeasonWorkbook(seasonId))!;
    const rows = sheetRows(result.workbook, "Attendance");
    const alice = rows.find((r) => r[0] === "Test wb-alice")!;
    // Columns: Student, Email, Group, <session 1>, <session 2>, Attendance %.
    expect(alice[3]).toBe("P");
    // v1 printed 12 here — minutes measured from when an admin pressed the
    // check-in button, not from the session start, exported to a spreadsheet
    // where a reader treats it as minutes late (R69, R70). Withheld until the
    // cutover backfill.
    expect(alice[4]).toBe("L");
    expect(alice[4]).not.toBe(12);
  });

  it("keeps the session columns a single cell type (R71)", async () => {
    const result = (await buildSeasonWorkbook(seasonId))!;
    const rows = sheetRows(result.workbook, "Attendance");
    for (const row of rows.slice(1)) {
      for (const cell of row.slice(3, -1)) {
        expect(typeof cell).toBe("string");
      }
    }
  });

  it("excludes future sessions and labels past ones with the year (R68, D12)", async () => {
    const result = (await buildSeasonWorkbook(seasonId))!;
    const header = sheetRows(result.workbook, "Attendance")[0]!;
    expect(header).toEqual([
      "Student",
      "Email",
      "Group",
      "Mar 1, 2020 · Opening",
      "Mar 8, 2020 · Week two",
      "Attendance %",
    ]);
    // v1's header was `MMM d` with no year, so sessions from different seasons
    // collapsed onto the same label.
    expect(header.join(" ")).not.toContain("Not yet");
  });

  it("uses the enrolment's group, not GroupStudent (R66, ruling C9)", async () => {
    const result = (await buildSeasonWorkbook(seasonId))!;
    const rows = sheetRows(result.workbook, "Attendance");
    expect(rows.find((r) => r[0] === "Test wb-alice")![2]).toBe("Group A");
    expect(rows.find((r) => r[0] === "Test wb-bob")![2]).toBe("Group B");
    expect(groupAId).toBeGreaterThan(0);
  });

  it("drops an unpublished ONLINE quiz and a zero-max quiz from Grades (D16)", async () => {
    const result = (await buildSeasonWorkbook(seasonId))!;
    const header = sheetRows(result.workbook, "Grades")[0]!;
    expect(header).toEqual(["Student", "Email", "Group", "Paper one (/20)", "Average %"]);
    // v1 had no publishedAt filter (R74), so a draft quiz became a column of
    // blanks that looks like a cohort-wide failure to sit it; and a maxScore=0
    // quiz printed a score while being excluded from the average (R77).
    expect(header.join(" ")).not.toContain("Draft online");
    expect(header.join(" ")).not.toContain("Zero max");
  });

  it("marks an assignment a student was never given as n/a, not as a miss (D-17.15)", async () => {
    const result = (await buildSeasonWorkbook(seasonId))!;
    const rows = sheetRows(result.workbook, "Assignments");
    const header = rows[0]!;
    expect(header).toEqual([
      "Student",
      "Email",
      "Group",
      "For everyone",
      "Group A only",
      "Submitted % (assigned to student)",
    ]);

    const bob = rows.find((r) => r[0] === "Test wb-bob")!;
    // bob is in Group B; "Group A only" was never his to do. v1 gave every
    // student a column for every assignment and divided by all of them (R78,
    // R80), so bob was marked down for work nobody assigned him.
    expect(bob[4]).toBe("n/a");
    expect(bob[3]).toBe("");
  });

  it("divides Submitted % by the assignments assigned to that student (ruling C5)", async () => {
    const result = (await buildSeasonWorkbook(seasonId))!;
    const rows = sheetRows(result.workbook, "Assignments");
    const alice = rows.find((r) => r[0] === "Test wb-alice")!;
    const bob = rows.find((r) => r[0] === "Test wb-bob")!;
    // alice: 2 assigned, 1 turned in (the other is a DRAFT) → 50.
    expect(alice[5]).toBe(50);
    // bob: 1 assigned, 0 turned in → 0. v1 divided by 2 for both.
    expect(bob[5]).toBe(0);
  });

  it("agrees with the engagement report cell-for-cell (ruling C4)", async () => {
    const { computeEngagementForSeasons } = await import("../../lib/queries/engagement");
    const rows = await computeEngagementForSeasons([seasonId]);
    const alice = rows.find((r) => r.studentUserId === aliceId)!;

    const result = (await buildSeasonWorkbook(seasonId))!;
    const attendance = sheetRows(result.workbook, "Attendance").find(
      (r) => r[0] === "Test wb-alice",
    )!;
    const assignments = sheetRows(result.workbook, "Assignments").find(
      (r) => r[0] === "Test wb-alice",
    )!;

    // The workbook reads these two columns from the SAME function the report
    // does. v1 computed them independently and they disagreed for any season
    // with a group-targeted assignment (spec D2).
    expect(attendance[5]).toBe(alice.attendancePct);
    expect(assignments[5]).toBe(alice.submissionPct);
    expect(bobId).toBeGreaterThan(0);
  });

  it("sorts rows by a pinned collator, not the server's incidental default (R65)", async () => {
    const result = (await buildSeasonWorkbook(seasonId))!;
    const names = sheetRows(result.workbook, "Attendance")
      .slice(1)
      .map((r) => String(r[0]));
    expect(names).toEqual([...names].sort(new Intl.Collator("en", { sensitivity: "base" }).compare));
  });

  it("puts the method notes and the symbol legend on the Key sheet, not in a data row", async () => {
    const result = (await buildSeasonWorkbook(seasonId))!;
    const key = sheetRows(result.workbook, "Key")
      .flat()
      .map((c) => String(c ?? ""))
      .join("\n");
    expect(key).toContain("n/a");
    expect(key).toContain("Late arrivals show as");
    // A legend row inside a data sheet breaks sorting and filtering — the two
    // things an operator opens a spreadsheet to do.
    const attendanceCells = sheetRows(result.workbook, "Attendance").flat().map(String);
    expect(attendanceCells.some((c) => c.includes("Late arrivals show as"))).toBe(false);
  });
});

describe("summariseSeasonWorkbook", () => {
  it("reports the sheet shape without building the workbook", async () => {
    const summary = (await summariseSeasonWorkbook(seasonId))!;
    expect(summary.rowCount).toBe(2);
    expect(summary.sheets.map((s) => s.name)).toEqual([
      "Attendance",
      "Grades",
      "Assignments",
      "Key",
    ]);
    // 3 identity columns + 2 past sessions + 1 percentage.
    expect(summary.sheets[0]!.columnCount).toBe(6);
    expect(summary.estimatedBytes).toBeGreaterThan(0);
  });

  it("returns null for a soft-deleted season, like the builder", async () => {
    expect(await summariseSeasonWorkbook(deletedSeasonId)).toBeNull();
  });
});
```

**What the failure proves.** The `LATE` case is the load-bearing one: with a
verbatim port of `attendanceCell` it fails with
`Expected: "L" Received: 12` — the exact number C3 says must not ship as though
it meant minutes late.

- [ ] **Step 3: Extend `org-time.ts`** *(Plan 3's file)*

```ts
/**
 * A calendar day in the organisation's zone — "Mar 1, 2020".
 *
 * Used for spreadsheet column headers and filenames, which the SERVER writes
 * and no client can reformat. Ruling C2: every wall-clock derivation resolves
 * against one configured organisation timezone, never the host's incidental
 * one and never the reader's device.
 *
 * The YEAR is deliberate. v1 formatted these as `MMM d` (reports-query.ts:106,
 * season-export.ts:106), so sessions from different years collapsed onto the
 * same label and a mentor's all-season chart interleaved them silently
 * (R15, R68, spec D12).
 */
const dayFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: config.orgTimezone,
  year: "numeric",
  month: "short",
  day: "numeric",
});

export function formatDayInOrgTime(date: Date): string {
  return dayFormatter.format(date);
}

/** "2026-08-24" in the organisation's zone — for filenames, which must sort. */
export function isoDayInOrgTime(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: config.orgTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  return parts; // en-CA formats as YYYY-MM-DD
}
```

- [ ] **Step 4: Shared workbook styling**

```ts
// apps/backend/src/lib/exports/workbook-style.ts
import type ExcelJS from "exceljs";

// VALUE import — relative, FIVE levels up from src/lib/exports/ (routes/ is
// four; getting this wrong is ERR_MODULE_NOT_FOUND at runtime, CLAUDE.md).
import { REPORT_METRIC_NOTES } from "../../../../../packages/shared/src/index";

import { formatInOrgTime } from "../org-time";

/** brand-navy-900, ported verbatim from jpc-space/src/lib/season-export.ts:23. */
export const HEADER_FILL = "FF0B2447";

/**
 * Pinned collation.
 *
 * v1 sorted with `a.name.localeCompare(b.name)` and NO locale argument
 * (season-export.ts:66, R65), so row order followed whatever ICU default the
 * host happened to have — which differs between a laptop and a container. Two
 * servers exporting the same season now produce identical row order.
 */
export const COLLATOR = new Intl.Collator("en", { sensitivity: "base" });

export function styleHeader(row: ExcelJS.Row): void {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
  row.alignment = { vertical: "middle" };
}

export function freezeFirstRowAndColumns(sheet: ExcelJS.Worksheet, xSplit: number): void {
  sheet.views = [{ state: "frozen", xSplit, ySplit: 1 }];
}

/** 22 / 28 / 22 for Student / Email / Group, then a per-sheet width (R67). */
export function columnWidths(headerLength: number, dataWidth: number): Array<{ width: number }> {
  return Array.from({ length: headerLength }, (_, i) => ({
    width: i < 3 ? (i === 1 ? 28 : 22) : dataWidth,
  }));
}

export interface KeySheetContext {
  scopeDescription: string;
  symbols: Array<[string, string]>;
}

/**
 * The fourth sheet.
 *
 * Spec D16 asks for a legend row; a legend row inside a data sheet breaks
 * sorting and filtering, which are the two things an operator opens a
 * spreadsheet to do. So it is its own sheet — a deliberate divergence from
 * R63's "exactly three sheets".
 *
 * REPORT_METRIC_NOTES comes from packages/shared and is rendered verbatim by
 * the mobile screen's method disclosure too, so the spreadsheet and the app
 * cannot describe the same metric differently (ruling C4 applied to prose).
 */
export function addKeySheet(workbook: ExcelJS.Workbook, ctx: KeySheetContext): void {
  const sheet = workbook.addWorksheet("Key");
  sheet.columns = [{ width: 18 }, { width: 110 }];

  sheet.addRow(["Key", ""]);
  styleHeader(sheet.getRow(1));

  sheet.addRow(["Scope", ctx.scopeDescription]);
  sheet.addRow(["Generated", formatInOrgTime(new Date())]);
  sheet.addRow(["", ""]);

  sheet.addRow(["Symbol", "Meaning"]);
  for (const [symbol, meaning] of ctx.symbols) sheet.addRow([symbol, meaning]);
  sheet.addRow(["", ""]);

  sheet.addRow(["How these numbers are calculated", ""]);
  for (const note of REPORT_METRIC_NOTES) sheet.addRow(["", note]);
}
```

- [ ] **Step 5: The season workbook**

```ts
// apps/backend/src/lib/exports/season-workbook.ts
import ExcelJS from "exceljs";

import type { SubmissionStatus } from "../../generated/prisma/enums";
import { db } from "../../db/client";
import { formatDayInOrgTime } from "../org-time";
import { computeEngagementForSeasons } from "../queries/engagement";
import {
  COLLATOR,
  addKeySheet,
  columnWidths,
  freezeFirstRowAndColumns,
  styleHeader,
} from "./workbook-style";

const SUBMISSION_LABEL: Record<SubmissionStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  REVIEWED: "Reviewed",
  RETURNED: "Returned",
};

/** Blank means "assigned, nothing submitted"; n/a means "not assigned" (D-17.15). */
const NOT_ASSIGNED = "n/a";

const KEY_SYMBOLS: Array<[string, string]> = [
  ["P", "Present"],
  ["A", "Absent"],
  ["L", "Late — see the note about recorded minutes below"],
  ["(blank)", "No record for this student and session / assignment"],
  [NOT_ASSIGNED, "This assignment was not assigned to this student"],
];

export interface SheetSummary {
  name: string;
  columnCount: number;
  rowCount: number;
}

export interface SeasonWorkbookSummary {
  seasonCode: string;
  seasonTitle: string;
  rowCount: number;
  sheets: SheetSummary[];
  estimatedBytes: number;
}

export interface SeasonWorkbookResult extends SeasonWorkbookSummary {
  workbook: ExcelJS.Workbook;
}

/**
 * The season's active students × (sessions, quizzes, assignments) matrix.
 *
 * Returns null when the season does not exist OR is soft-deleted. v1 fetched
 * it with findUniqueOrThrow on `id` alone (R81), while both of its report
 * queries filtered deletedAt (R1, R53) — so anyone who could name a deleted
 * season's id could still export its complete attendance and grade history.
 * That is a data-retention hole v1 has by oversight; leaving it out of v2 is a
 * one-line divergence nobody will miss (spec D14).
 *
 * Ten queries: five for the grid (the shape v1 already had right — R89, the
 * best-behaved read in the domain) plus the five inside
 * computeEngagementForSeasons, which supplies the two percentage columns. Five
 * extra round trips buy the guarantee that a spreadsheet cell and the chart on
 * the screen above it are the same number (ruling C4). v1's five queries
 * produced percentages that disagreed with its own reports page for any season
 * containing a group-targeted assignment (spec D2).
 */
export async function buildSeasonWorkbook(seasonId: number): Promise<SeasonWorkbookResult | null> {
  const data = await loadSeasonExportData(seasonId);
  if (!data) return null;
  const { season, students, sessions, quizzes, assignments, engagementBy } = data;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "JPC Space";
  workbook.created = new Date();

  // --- Attendance -----------------------------------------------------------
  const attendance = workbook.addWorksheet("Attendance");
  const attHeader = [
    "Student",
    "Email",
    "Group",
    ...sessions.map((s) => `${formatDayInOrgTime(s.startsAt)} · ${s.title}`),
    "Attendance %",
  ];
  attendance.addRow(attHeader);
  attendance.columns = columnWidths(attHeader.length, 16);

  const attendanceBySession = sessions.map(
    (s) => new Map(s.attendance.map((a) => [a.studentUserId, a])),
  );

  for (const student of students) {
    const cells = sessions.map((_, i) => {
      const record = attendanceBySession[i]!.get(student.studentUserId);
      if (!record) return "";
      if (record.status === "PRESENT") return "P";
      if (record.status === "ABSENT") return "A";
      // Ruling C3. v1 printed `lateMinutes ?? "L"` — minutes measured from when
      // an admin opened check-in rather than from session.startsAt, with no
      // threshold, exported to a spreadsheet where a reader sorts and averages
      // them as "minutes late" (R69, R70). There is no column distinguishing
      // v1-era rows from v2-era ones and adding one is a migration (C1), so the
      // workbook cannot annotate per cell — it withholds the number instead.
      // The Key sheet says so. Restored at cutover after the backfill.
      return "L";
    });
    // Read, not recomputed: the same attendancePct the report shows, whose
    // denominator starts at this student's enrolledAt (domain 9 R55, spec D8).
    // v1's own workbook percentage happened to agree with engagement (R73);
    // this makes that agreement structural instead of coincidental.
    const pct = engagementBy.get(student.studentUserId)?.attendancePct ?? 0;
    attendance.addRow([student.name, student.email, student.groupName, ...cells, pct]);
  }
  styleHeader(attendance.getRow(1));
  freezeFirstRowAndColumns(attendance, 3);

  // --- Grades ---------------------------------------------------------------
  const grades = workbook.addWorksheet("Grades");
  const gradeHeader = [
    "Student",
    "Email",
    "Group",
    ...quizzes.map((q) => `${q.title} (/${q.maxScore})`),
    "Average %",
  ];
  grades.addRow(gradeHeader);
  grades.columns = columnWidths(gradeHeader.length, 18);

  const scoreByQuiz = quizzes.map((q) => new Map(q.grades.map((g) => [g.studentUserId, g.score])));

  for (const student of students) {
    let pctSum = 0;
    let gradedCount = 0;
    const cells = quizzes.map((q, i) => {
      const score = scoreByQuiz[i]!.get(student.studentUserId);
      if (score === null || score === undefined) return "";
      // maxScore > 0 is guaranteed by the query (D16 / R77), so every graded
      // quiz contributes and there is no "prints a score but is excluded from
      // the average" case left to explain.
      pctSum += (score / q.maxScore) * 100;
      gradedCount += 1;
      return score;
    });
    // Unweighted mean of percentages, not total-scored over total-available.
    // v1's arithmetic (R76), kept: changing it would move a number without
    // anyone asking.
    const avg = gradedCount > 0 ? Math.round(pctSum / gradedCount) : "";
    grades.addRow([student.name, student.email, student.groupName, ...cells, avg]);
  }
  styleHeader(grades.getRow(1));
  freezeFirstRowAndColumns(grades, 3);

  // --- Assignments ----------------------------------------------------------
  const assignmentSheet = workbook.addWorksheet("Assignments");
  const assignmentHeader = [
    "Student",
    "Email",
    "Group",
    ...assignments.map((a) => a.title),
    // The header names the denominator. A file produced under one arithmetic
    // and a file produced under another must be distinguishable by a reader
    // holding both, without this document (ruling C5, spec D2).
    "Submitted % (assigned to student)",
  ];
  assignmentSheet.addRow(assignmentHeader);
  assignmentSheet.columns = columnWidths(assignmentHeader.length, 20);

  const statusByAssignment = assignments.map(
    (a) => new Map(a.submissions.map((s) => [s.studentUserId, s.status])),
  );

  for (const student of students) {
    const cells = assignments.map((a, i) => {
      const assigned =
        a.isAllGroups ||
        (student.groupId !== null && a.targets.some((t) => t.groupId === student.groupId));
      // Ruling C9: the enrolment's group for THIS season, never GroupStudent.
      if (!assigned) return NOT_ASSIGNED;
      const status = statusByAssignment[i]!.get(student.studentUserId);
      // Blank, not v1's em dash: "—" and blank both meant "no row found" and
      // nothing distinguished "not applicable" from "missing" (R79, R82).
      return status ? SUBMISSION_LABEL[status] : "";
    });
    const pct = engagementBy.get(student.studentUserId)?.submissionPct ?? 0;
    assignmentSheet.addRow([student.name, student.email, student.groupName, ...cells, pct]);
  }
  styleHeader(assignmentSheet.getRow(1));
  freezeFirstRowAndColumns(assignmentSheet, 3);

  addKeySheet(workbook, {
    scopeDescription: `${season.title} (${season.code})`,
    symbols: KEY_SYMBOLS,
  });

  const sheets: SheetSummary[] = [
    { name: "Attendance", columnCount: attHeader.length, rowCount: students.length },
    { name: "Grades", columnCount: gradeHeader.length, rowCount: students.length },
    { name: "Assignments", columnCount: assignmentHeader.length, rowCount: students.length },
    { name: "Key", columnCount: 2, rowCount: KEY_SYMBOLS.length + 8 },
  ];

  return {
    workbook,
    seasonCode: season.code,
    seasonTitle: season.title,
    rowCount: students.length,
    sheets,
    estimatedBytes: estimateBytes(sheets),
  };
}

/**
 * The manifest's numbers, without building anything.
 *
 * Four counts and a season lookup. The point is that a phone can be told "38
 * students × 14 sessions, about 40 kB" before it commits to a download on a
 * cellular connection (spec §7).
 */
export async function summariseSeasonWorkbook(
  seasonId: number,
): Promise<SeasonWorkbookSummary | null> {
  const season = await db.season.findFirst({
    where: { id: seasonId, deletedAt: null },
    select: { code: true, title: true },
  });
  if (!season) return null;

  const now = new Date();
  const [rowCount, sessionCount, quizCount, assignmentCount] = await Promise.all([
    db.seasonEnrollment.count({ where: { seasonId, status: "ACTIVE" } }),
    db.session.count({ where: { seasonId, startsAt: { lte: now } } }),
    db.quiz.count({ where: quizWhere(seasonId) }),
    db.assignment.count({ where: { seasonId, deletedAt: null } }),
  ]);

  const sheets: SheetSummary[] = [
    { name: "Attendance", columnCount: 4 + sessionCount, rowCount },
    { name: "Grades", columnCount: 4 + quizCount, rowCount },
    { name: "Assignments", columnCount: 4 + assignmentCount, rowCount },
    { name: "Key", columnCount: 2, rowCount: KEY_SYMBOLS.length + 8 },
  ];

  return {
    seasonCode: season.code,
    seasonTitle: season.title,
    rowCount,
    sheets,
    estimatedBytes: estimateBytes(sheets),
  };
}

/**
 * A heuristic, and labelled as one on the contract.
 *
 * XLSX is a zip of XML, so the only honest way to know the size is to build the
 * file — which is the thing the manifest exists to avoid. ~12 bytes of
 * compressed XML per cell plus a fixed overhead has been close enough to warn a
 * user before a multi-megabyte download, which is all it is for.
 */
function estimateBytes(sheets: SheetSummary[]): number {
  const cells = sheets.reduce((n, s) => n + s.columnCount * (s.rowCount + 1), 0);
  return 8 * 1024 + cells * 12;
}

/**
 * Quizzes worth a column.
 *
 * publishedAt is documented in the schema as the draft marker for ONLINE
 * quizzes ("students only see published quizzes",
 * prisma/schema.prisma:653-654) and v1's export ignored it (R74), so an
 * unpublished quiz became a column of blanks that reads as a cohort-wide
 * failure to sit it. PAPER quizzes have no publish concept and stay.
 * maxScore = 0 is not a grade (R77). Both exclusions live in the `where` so the
 * column never exists, rather than existing and being skipped.
 */
function quizWhere(seasonId: number) {
  return {
    seasonId,
    maxScore: { gt: 0 },
    OR: [{ kind: "PAPER" as const }, { kind: "ONLINE" as const, publishedAt: { not: null } }],
  };
}

async function loadSeasonExportData(seasonId: number) {
  // 1 — the season, with the soft-delete check v1 omitted.
  const season = await db.season.findFirst({
    where: { id: seasonId, deletedAt: null },
    select: { code: true, title: true },
  });
  if (!season) return null;

  // 2 — the roster. groupId comes from the ENROLMENT (R66, ruling C9); the
  // group NAME comes with it so the sheet needs no second lookup.
  const enrollments = await db.seasonEnrollment.findMany({
    where: { seasonId, status: "ACTIVE" },
    select: {
      studentUserId: true,
      groupId: true,
      studentUser: { select: { name: true, email: true } },
      group: { select: { name: true } },
    },
  });
  const students = enrollments
    .map((e) => ({
      studentUserId: e.studentUserId,
      name: e.studentUser.name,
      email: e.studentUser.email,
      groupId: e.groupId,
      groupName: e.group?.name ?? "",
    }))
    .sort((a, b) => COLLATOR.compare(a.name, b.name));

  const now = new Date();

  // 3 — past sessions with their attendance rows.
  const sessions = await db.session.findMany({
    where: { seasonId, startsAt: { lte: now } },
    orderBy: { startsAt: "asc" },
    select: {
      id: true,
      title: true,
      startsAt: true,
      // lateMinutes is deliberately NOT selected. Nothing in v2 renders it, and
      // not fetching it is the cheapest possible guarantee that nobody
      // "restores" the cell by reaching for a field that is already in hand.
      attendance: { select: { studentUserId: true, status: true } },
    },
  });

  // 4 — quizzes worth a column, with their grades.
  const quizzes = await db.quiz.findMany({
    where: quizWhere(seasonId),
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      title: true,
      maxScore: true,
      grades: { select: { studentUserId: true, score: true } },
    },
  });

  // 5 — assignments with their targets and submissions.
  const assignments = await db.assignment.findMany({
    where: { seasonId, deletedAt: null },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      title: true,
      isAllGroups: true,
      targets: { select: { groupId: true } },
      submissions: { select: { studentUserId: true, status: true } },
    },
  });

  // 6..10 — the two percentage columns, from the one definition.
  const engagement = await computeEngagementForSeasons([seasonId]);
  const engagementBy = new Map(engagement.map((r) => [r.studentUserId, r]));

  return { season, students, sessions, quizzes, assignments, engagementBy };
}
```

- [ ] **Step 6: The engagement workbook (the CSV's replacement)**

```ts
// apps/backend/src/lib/exports/engagement-workbook.ts
import ExcelJS from "exceljs";

import type { EngagementReportRow } from "@space/shared";
// VALUE import — relative, five levels up.
import { BAND_LABEL } from "../../../../../packages/shared/src/index";

import { addKeySheet, columnWidths, freezeFirstRowAndColumns, styleHeader } from "./workbook-style";

/**
 * The per-student engagement export — v1's CSV, as a spreadsheet.
 *
 * v1's toCsv quoted with JSON.stringify, so a name containing a double quote
 * came out as \" (which no CSV parser accepts) and a backslash was doubled
 * (R40); rows joined with bare LF and no BOM, so Excel on Windows decoded the
 * file as the system codepage and mangled every non-ASCII name (R41). For this
 * organisation's roster that is most of them. exceljs handles encoding, and the
 * workbook path has to exist anyway (spec D7, D10).
 *
 * Rows are sorted ascending by score — v1 had no orderBy at all (R39), so the
 * file came out in whatever order Postgres returned the enrolments. Ascending
 * puts the students who need attention on the first screen.
 *
 * `Band` is a column because the enum is the contract; a reader can filter on
 * "AT_RISK" without knowing the threshold.
 */
export function buildEngagementWorkbook(
  rows: EngagementReportRow[],
  scopeLabel: string,
): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "JPC Space";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Engagement");
  const header = [
    "Student",
    "Email",
    "Season",
    "Attendance %",
    // The denominator, in the header — the same discipline as the season
    // workbook's Assignments sheet (ruling C5).
    "Submission % (assigned to student)",
    "Score",
    "Band",
  ];
  sheet.addRow(header);
  sheet.columns = columnWidths(header.length, 20);

  for (const row of [...rows].sort((a, b) => a.score - b.score || a.studentUserId - b.studentUserId)) {
    sheet.addRow([
      row.name,
      row.email,
      row.seasonTitle,
      row.attendancePct,
      row.submissionPct,
      row.score,
      BAND_LABEL[row.band],
    ]);
  }

  styleHeader(sheet.getRow(1));
  freezeFirstRowAndColumns(sheet, 3);

  addKeySheet(workbook, {
    scopeDescription: scopeLabel,
    symbols: [
      ["At risk", "Either component is below 60%"],
      ["Low / Medium / High", "Combined score bands, applied after the at-risk test"],
    ],
  });

  return workbook;
}
```

- [ ] **Step 7: Verification** *(coordinator)*

```bash
cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern season-workbook
cd "$(git rev-parse --show-toplevel)" && pnpm turbo lint typecheck --filter=@space/backend
```

Expect: 14 passing.

- [ ] **Step 8: Commit**

```bash
git add apps/backend/package.json apps/backend/src/lib \
        apps/backend/src/__tests__/integration/season-workbook.test.ts && \
  git commit -m "feat(backend): season and engagement workbooks with one metric definition and a Key sheet"
```

---

### Task 7: The export routes — streamed, rate-limited, audited

**Wave 4 · Coordinator only** (mounts two routers, edits `app.ts` and
`openapi.ts`, and runs the whole backend integration set serially for the first
time).

**Files:**
- Create: `apps/backend/src/lib/rate-limit.ts` *(if Plan 8 has not already extracted it)*
- Create: `apps/backend/src/lib/exports/audit.ts`
- Create: `apps/backend/src/routes/exports.ts`
- Modify: `apps/backend/src/app.ts` (two mounts)
- Modify: `apps/backend/src/docs/openapi.ts`
- Test: `apps/backend/src/__tests__/integration/exports-routes.test.ts`

**Interfaces:**
- Consumes: `buildSeasonWorkbook`, `summariseSeasonWorkbook`,
  `buildEngagementWorkbook` (Task 6); `reportScopeFor`,
  `canExportSeasonWorkbook` (Task 3 fragment); `resolveReportScope`,
  `listEngagementRows` (Task 3); `isoDayInOrgTime` (Task 6);
  `exportFilename`, `exportFormatSchema`, `XLSX_MIME` (Task 1 — **value**
  imports, relative, four levels up from `routes/`).
- Produces: `rateLimitHandler`; `logExport`; `reportExportsRouter`,
  `seasonExportsRouter`;
  `GET /api/v1/reports/engagement/export`,
  `GET /api/v1/seasons/:id/exports/workbook`,
  `GET /api/v1/seasons/:id/exports/manifest`.

**Mounting note.** `seasonExportsRouter` mounts at `/api/v1/seasons`, **after**
`seasonsRouter`. That router defines `/:id`, `/:id/groups`, `/:id/sessions` and
`/:id/assignments` — none of which match `/:id/exports/workbook`, so the request
falls through. Same fall-through pattern Plan 8 uses for
`/students/:id/engagement`. Keeping this domain's routes in this domain's file
is what stops `seasons.ts` from accumulating four unrelated concerns.

- [ ] **Step 1: Write the failing integration test**

```ts
// apps/backend/src/__tests__/integration/exports-routes.test.ts
import ExcelJS from "exceljs";
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

jest.setTimeout(60000);

const app = createApp();

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

let seasonId: number;
let otherSeasonId: number;
let deletedSeasonId: number;
let superToken: string;
let mentorToken: string;
let adminToken: string;
let leaderToken: string;
let studentToken: string;

beforeAll(async () => {
  await cleanupTestData();

  seasonId = (await createTestSeason()).id;
  otherSeasonId = (await createTestSeason()).id;
  const deleted = await createTestSeason();
  deletedSeasonId = deleted.id;
  await db.season.update({ where: { id: deletedSeasonId }, data: { deletedAt: new Date() } });

  const superUser = await createTestUser("ex-super", "SUPER");
  const mentor = await createTestUser("ex-mentor", "MENTOR");
  const admin = await createTestUser("ex-admin", "ADMIN");
  const leader = await createTestUser("ex-leader", "LEADER");
  const student = await createTestUser("ex-student", "STUDENT");

  await db.seasonAdmin.create({ data: { seasonId, userId: admin.id } });
  const group = await db.group.create({
    data: { seasonId, name: "Group A", leaders: { create: { userId: leader.id } } },
    select: { id: true },
  });
  await db.seasonEnrollment.create({
    data: { seasonId, studentUserId: student.id, groupId: group.id, status: "ACTIVE" },
  });
  await db.session.create({
    data: {
      seasonId,
      title: "Opening",
      startsAt: new Date("2020-03-01T18:00:00.000Z"),
      durationMinutes: 60,
    },
  });

  superToken = await login(app, superUser.email);
  mentorToken = await login(app, mentor.email);
  adminToken = await login(app, admin.email);
  leaderToken = await login(app, leader.email);
  studentToken = await login(app, student.email);
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("GET /api/v1/seasons/:id/exports/workbook", () => {
  it("streams XLSX bytes with a Content-Disposition to a season admin", async () => {
    const res = await request(app)
      .get(`/api/v1/seasons/${seasonId}/exports/workbook`)
      .set("authorization", `Bearer ${adminToken}`)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on("data", (c: Buffer) => chunks.push(c));
        r.on("end", () => cb(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain(XLSX_MIME);
    expect(res.headers["content-disposition"]).toContain("attachment;");
    expect(res.headers["content-disposition"]).toContain("filename*=UTF-8''");

    // Real bytes, not a JSON envelope: PK is the zip magic every XLSX starts with.
    const body = res.body as Buffer;
    expect(body.subarray(0, 2).toString("ascii")).toBe("PK");

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(body);
    expect(workbook.worksheets.map((w) => w.name)).toEqual([
      "Attendance",
      "Grades",
      "Assignments",
      "Key",
    ]);
  });

  it("REFUSES a MENTOR — v1 allowed any mentor any season's workbook (R85, D6 #3)", async () => {
    const res = await request(app)
      .get(`/api/v1/seasons/${seasonId}/exports/workbook`)
      .set("authorization", `Bearer ${mentorToken}`);
    // In v1 the only thing preventing this is that /mentor/reports does not
    // render the button (R86). The endpoint itself allows it: every active
    // student's name, email, group, per-session attendance, every quiz score
    // and every assignment status.
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("forbidden");
  });

  it("refuses an ADMIN a season they do not administer", async () => {
    const res = await request(app)
      .get(`/api/v1/seasons/${otherSeasonId}/exports/workbook`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
  });

  it("refuses LEADER and STUDENT", async () => {
    for (const token of [leaderToken, studentToken]) {
      const res = await request(app)
        .get(`/api/v1/seasons/${seasonId}/exports/workbook`)
        .set("authorization", `Bearer ${token}`);
      expect(res.status).toBe(403);
    }
  });

  it("404s a soft-deleted season even for SUPER (D14, R81)", async () => {
    const res = await request(app)
      .get(`/api/v1/seasons/${deletedSeasonId}/exports/workbook`)
      .set("authorization", `Bearer ${superToken}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });

  it("401s an unauthenticated request in the envelope, never a redirect (R87)", async () => {
    const res = await request(app).get(`/api/v1/seasons/${seasonId}/exports/workbook`);
    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
  });

  it("answers every failure with JSON even though success is bytes", async () => {
    const res = await request(app)
      .get(`/api/v1/seasons/${seasonId}/exports/workbook`)
      .set("authorization", `Bearer ${leaderToken}`);
    expect(res.headers["content-type"]).toContain("application/json");
    // The client must be able to tell a 403 from a file (spec §7).
    expect(res.body.error.code).toBe("forbidden");
  });

  it("400s a non-numeric season id", async () => {
    const res = await request(app)
      .get("/api/v1/seasons/not-a-number/exports/workbook")
      .set("authorization", `Bearer ${superToken}`);
    expect(res.status).toBe(400);
  });
});

describe("GET /api/v1/seasons/:id/exports/manifest", () => {
  it("describes the workbook without building it", async () => {
    const res = await request(app)
      .get(`/api/v1/seasons/${seasonId}/exports/manifest`)
      .set("authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.mimeType).toBe(XLSX_MIME);
    expect(res.body.data.filename).toMatch(/\.xlsx$/);
    expect(res.body.data.sheets.map((s: { name: string }) => s.name)).toEqual([
      "Attendance",
      "Grades",
      "Assignments",
      "Key",
    ]);
    expect(res.body.data.estimatedBytes).toBeGreaterThan(0);
  });

  it("carries exactly the workbook's gate — a mentor gets neither", async () => {
    const res = await request(app)
      .get(`/api/v1/seasons/${seasonId}/exports/manifest`)
      .set("authorization", `Bearer ${mentorToken}`);
    // A manifest a caller cannot act on is a size oracle over a season they
    // may not read.
    expect(res.status).toBe(403);
  });
});

describe("GET /api/v1/reports/engagement/export", () => {
  it("streams an engagement workbook to a MENTOR (R45 — kept)", async () => {
    const res = await request(app)
      .get("/api/v1/reports/engagement/export")
      .set("authorization", `Bearer ${mentorToken}`)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on("data", (c: Buffer) => chunks.push(c));
        r.on("end", () => cb(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain(XLSX_MIME);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(res.body as Buffer);
    expect(workbook.worksheets.map((w) => w.name)).toEqual(["Engagement", "Key"]);
    const header = workbook.getWorksheet("Engagement")!.getRow(1).values as unknown[];
    expect(header.slice(1)).toEqual([
      "Student",
      "Email",
      "Season",
      "Attendance %",
      "Submission % (assigned to student)",
      "Score",
      "Band",
    ]);
  });

  it("intersects the scope exactly as the summary does", async () => {
    const res = await request(app)
      .get(`/api/v1/reports/engagement/export?seasonId=${otherSeasonId}`)
      .set("authorization", `Bearer ${adminToken}`)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on("data", (c: Buffer) => chunks.push(c));
        r.on("end", () => cb(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(res.body as Buffer);
    // Empty scope → header only. v1 returned a header-only CSV with HTTP 200
    // for an unknown id too (R46) — the difference is that here it is the
    // intersection's honest answer rather than a query that silently matched
    // nothing.
    expect(workbook.getWorksheet("Engagement")!.rowCount).toBe(1);
  });

  it("rejects ?format=csv with a message naming XLSX (D-17.7)", async () => {
    const res = await request(app)
      .get("/api/v1/reports/engagement/export?format=csv")
      .set("authorization", `Bearer ${superToken}`);
    // A 404 would read as "the export is broken"; v1's CSV endpoint existed and
    // somebody will have bookmarked it.
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("bad_request");
    expect(res.body.error.message).toMatch(/xlsx/i);
  });

  it("refuses LEADER and STUDENT", async () => {
    for (const token of [leaderToken, studentToken]) {
      const res = await request(app)
        .get("/api/v1/reports/engagement/export")
        .set("authorization", `Bearer ${token}`);
      expect(res.status).toBe(403);
    }
  });

  it("names the file after the scope and the day, not an epoch (R42)", async () => {
    const res = await request(app)
      .get(`/api/v1/reports/engagement/export?seasonId=${seasonId}`)
      .set("authorization", `Bearer ${adminToken}`)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on("data", (c: Buffer) => chunks.push(c));
        r.on("end", () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.headers["content-disposition"]).toMatch(
      /filename="engagement-[a-z0-9-]+-\d{4}-\d{2}-\d{2}\.xlsx"/,
    );
  });

  it("logs an audit line carrying no personal data (D15)", async () => {
    const spy = jest.spyOn(console, "info").mockImplementation(() => {});
    await request(app)
      .get(`/api/v1/reports/engagement/export?seasonId=${seasonId}`)
      .set("authorization", `Bearer ${adminToken}`)
      .buffer(true)
      .parse((r, cb) => {
        r.on("data", () => {});
        r.on("end", () => cb(null, Buffer.alloc(0)));
      });

    const lines = spy.mock.calls.map((c) => String(c[0]));
    const audit = lines.find((l) => l.includes("export.completed"));
    expect(audit).toBeDefined();
    const parsed = JSON.parse(audit!);
    expect(parsed).toMatchObject({ event: "export.completed", kind: "engagement" });
    expect(parsed.actorId).toEqual(expect.any(Number));
    // Never a name, never an email, never a filename — the line answers "who
    // exported what, when", not "what was in it".
    expect(audit).not.toContain("@jpc.test");
    spy.mockRestore();
  });
});
```

**What the failure proves.** Before the routers are mounted every case is a
`404 not_found` from the catch-all. The first meaningful red, once the routes
exist but the gate is a verbatim port of
`src/app/api/season/export/route.ts:20-22`, is
`"REFUSES a MENTOR"` failing with `Expected: 403 Received: 200` — v1's own gate,
faithfully ported, hands a mentor the whole season.

- [ ] **Step 2: Run it to see it fail**

```bash
cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern exports-routes
```

- [ ] **Step 3: Extract the rate-limit handler** *(skip if Plan 8 already did)*

```bash
ls apps/backend/src/lib/rate-limit.ts
```

If absent:

```ts
// apps/backend/src/lib/rate-limit.ts
import type { Options as RateLimitOptions } from "express-rate-limit";

import { apiError } from "./api-response";

/**
 * express-rate-limit's default 429 body is plain text, which breaks the
 * envelope every other path in this API keeps. routes/auth.ts has had this
 * handler inline since the port; it moves here the first time a second domain
 * needs a limiter.
 */
export const rateLimitHandler: RateLimitOptions["handler"] = (_req, res) => {
  apiError(res, "too_many_requests", "Too many requests. Please try again later.", 429);
};
```

Then replace the local `const rateLimitHandler = …` in
`apps/backend/src/routes/auth.ts` with an import of this one — same behaviour,
one definition.

- [ ] **Step 4: The audit log**

```ts
// apps/backend/src/lib/exports/audit.ts
import type { ExportKind } from "@space/shared";

export interface ExportAuditEntry {
  actorId: number;
  actorRole: string;
  kind: ExportKind;
  seasonIds: number[];
  rowCount: number;
}

/**
 * One line per successful export.
 *
 * NOT a database write. Ruling C6 is that a GET never writes, and an export is
 * a GET; more practically, an ExportAudit TABLE needs a migration, which the
 * shared-database freeze forbids while v1 runs (C1). Spec D15 stages it: log
 * now, table at cutover — "do not let 'we cannot add a table yet' become 'we
 * shipped bulk personal-data export with no record of it'". See
 * docs/superpowers/plans/2026-08-24-plan-13-cutover.md.
 *
 * The line carries an actor ID and role, a scope and a row count. It carries NO
 * names, NO emails and NO filename: an audit trail that reproduces the payload
 * is a second copy of the payload, sitting in a log aggregator with weaker
 * access control than the database it came from.
 *
 * Emitted after the last byte is written, so a failed or aborted download does
 * not record a successful export.
 */
export function logExport(entry: ExportAuditEntry): void {
  console.info(JSON.stringify({ event: "export.completed", ...entry }));
}
```

- [ ] **Step 5: The export routes**

```ts
// apps/backend/src/routes/exports.ts
import { Router } from "express";
import type { Response } from "express";
import rateLimit from "express-rate-limit";

// VALUE imports — relative, four levels up from src/routes/ (CLAUDE.md's
// rootDir trap; the emitted file sits at dist/apps/backend/src/routes/).
import {
  XLSX_MIME,
  exportFilename,
  exportFormatSchema,
  reportScopeQuerySchema,
} from "../../../../packages/shared/src/index";

import { apiError, apiOk } from "../lib/api-response";
import { logExport } from "../lib/exports/audit";
import { buildEngagementWorkbook } from "../lib/exports/engagement-workbook";
import { buildSeasonWorkbook, summariseSeasonWorkbook } from "../lib/exports/season-workbook";
import { isoDayInOrgTime } from "../lib/org-time";
import { parseId } from "../lib/parse-id";
import { canExportSeasonWorkbook, reportScopeFor } from "../lib/permissions";
import { listEngagementRows, resolveReportScope } from "../lib/queries/reports";
import { rateLimitHandler } from "../lib/rate-limit";
import { requireAuth, requireUser } from "../middleware/require-auth";

export const reportExportsRouter = Router();
export const seasonExportsRouter = Router();

reportExportsRouter.use(requireAuth);
seasonExportsRouter.use(requireAuth);

/**
 * Ten exports per fifteen minutes, per USER.
 *
 * These are the two most expensive authenticated reads in the system and the
 * two that return the most personal data per request (R48, R85); v1 rate-limits
 * neither (R88). Keyed on the user id rather than the IP because an office
 * behind one NAT would otherwise share a bucket — and because keying on IP
 * drags in IPv6 normalisation for no benefit. Mounted AFTER requireAuth so the
 * key always exists.
 *
 * The 429 body is the same `too_many_requests` envelope the login limiter
 * already returns.
 */
const exportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  handler: rateLimitHandler,
  keyGenerator: (req) => String(requireUser(req).userId),
});

/**
 * Success is bytes; every failure is still the JSON envelope (spec §7).
 *
 * Headers are set only once every check has passed, so there is no path on
 * which a JSON fragment is appended to a partial XLSX. After the first byte a
 * thrown error destroys the socket rather than trying to explain itself: a
 * truncated file the client can retry beats a corrupt file it cannot detect.
 *
 * NOTE: ENABLE_UPLOADS does not gate this. That flag gates
 * POST /api/v1/submissions/:publicId/files only — CLAUDE.md: "Only uploading is
 * gated — reading and deleting recorded files still work." These endpoints
 * produce bytes from database rows and touch no Storage driver at all.
 */
function setDownloadHeaders(res: Response, filename: string): void {
  res.setHeader("Content-Type", XLSX_MIME);
  // v1 interpolated Season.code straight into the header (R84). The value is an
  // admin-set slug so the risk is low, but a route should not rely on
  // validation two domains away. ASCII fallback plus RFC 5987 for the real name.
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\;]/g, "_");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
  );
  // A cohort export must not sit in an intermediary cache.
  res.setHeader("Cache-Control", "no-store");
}

/** The engagement export — v1's CSV, as a workbook (spec D7). */
reportExportsRouter.get("/engagement/export", exportLimiter, async (req, res) => {
  const user = requireUser(req);

  const scope = reportScopeFor(user);
  if (scope === null) return apiError(res, "forbidden", "You don't have access to this.", 403);

  if (req.query.format !== undefined) {
    const format = exportFormatSchema.safeParse(req.query.format);
    if (!format.success) {
      // Somebody has bookmarked v1's /api/reports/export, which returned CSV.
      // A legible 400 beats a 404 that reads as "the export is broken".
      return apiError(res, "bad_request", "Exports are XLSX only. Drop ?format or pass xlsx.", 400);
    }
  }

  const parsed = reportScopeQuerySchema.safeParse(req.query);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid report filters.", 400);

  const resolved = await resolveReportScope(scope, parsed.data.seasonId);
  // limit is the cap the contract allows; an export is the one caller that
  // legitimately wants every row, and it is rate-limited and audited for it.
  const page = await listEngagementRows(resolved, { limit: Number.MAX_SAFE_INTEGER });

  const filename = exportFilename("engagement", resolved.label, isoDayInOrgTime(new Date()));
  const workbook = buildEngagementWorkbook(page.rows, resolved.label);

  setDownloadHeaders(res, filename);
  await workbook.xlsx.write(res);
  res.end();

  logExport({
    actorId: user.userId,
    actorRole: user.role,
    kind: "engagement",
    seasonIds: resolved.seasonIds,
    rowCount: page.rows.length,
  });
});

/**
 * The season workbook.
 *
 * seasonId moves into the PATH. v1 takes it as a query parameter on a route
 * living outside any season namespace (src/app/api/season/export/route.ts:13);
 * a path parameter matches the existing seasons router and makes the row-scoped
 * gate the obvious one (spec §7).
 */
seasonExportsRouter.get("/:id/exports/workbook", exportLimiter, async (req, res) => {
  const user = requireUser(req);
  const seasonId = parseId(req.params.id);
  if (seasonId === null) return apiError(res, "bad_request", "Invalid season id.", 400);

  // MENTOR is refused here and admitted by the engagement export above — see
  // lib/permissions.ts and spec D6 #3. This is a deliberate divergence from
  // v1, whose endpoint allows any mentor any season (R85) and whose only
  // protection is an unrendered button (R86).
  if (!canExportSeasonWorkbook(user, seasonId)) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  // null covers "does not exist" AND "soft-deleted" — v1 checked neither
  // (R81, spec D14). One answer for both, so this cannot become an existence
  // oracle either.
  const built = await buildSeasonWorkbook(seasonId);
  if (!built) return apiError(res, "not_found", "Season not found.", 404);

  const filename = exportFilename(
    "season-workbook",
    built.seasonCode,
    isoDayInOrgTime(new Date()),
  );

  setDownloadHeaders(res, filename);
  // One materialisation, streamed. v1 built a Buffer and copied it again into a
  // Uint8Array (R83) — two full in-memory copies of a students × (sessions +
  // quizzes + assignments) matrix.
  await built.workbook.xlsx.write(res);
  res.end();

  logExport({
    actorId: user.userId,
    actorRole: user.role,
    kind: "season-workbook",
    seasonIds: [seasonId],
    rowCount: built.rowCount,
  });
});

/**
 * The manifest.
 *
 * Exists for mobile: it lets the client show a size and a sheet list, and warn
 * before a multi-megabyte download on a cellular connection, without building
 * the workbook (spec §7). Same gate as the workbook, deliberately — a manifest
 * a caller cannot act on is a size oracle over a season they may not read.
 */
seasonExportsRouter.get("/:id/exports/manifest", async (req, res) => {
  const user = requireUser(req);
  const seasonId = parseId(req.params.id);
  if (seasonId === null) return apiError(res, "bad_request", "Invalid season id.", 400);

  if (!canExportSeasonWorkbook(user, seasonId)) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const summary = await summariseSeasonWorkbook(seasonId);
  if (!summary) return apiError(res, "not_found", "Season not found.", 404);

  return apiOk(res, {
    filename: exportFilename("season-workbook", summary.seasonCode, isoDayInOrgTime(new Date())),
    mimeType: XLSX_MIME,
    sheets: summary.sheets,
    estimatedBytes: summary.estimatedBytes,
    generatedAt: new Date().toISOString(),
    scopeDescription: `${summary.seasonTitle} (${summary.seasonCode})`,
  });
});
```

- [ ] **Step 6: Mount them**

In `apps/backend/src/app.ts`:

```ts
import { reportExportsRouter, seasonExportsRouter } from "./routes/exports";
```

```ts
  app.use("/api/v1/reports", reportsRouter);
  // Mounted alongside the reports router so /reports/engagement/export sits
  // beside /reports/engagement. Express tries reportsRouter first; it defines
  // no /engagement/export, so the request falls through.
  app.use("/api/v1/reports", reportExportsRouter);
  // Fall-through mounting after seasonsRouter: that router's /:id, /:id/groups,
  // /:id/sessions and /:id/assignments cannot match /:id/exports/*, and keeping
  // this domain's routes in this domain's file stops seasons.ts accumulating a
  // fourth unrelated concern.
  app.use("/api/v1/seasons", seasonExportsRouter);
```

- [ ] **Step 7: OpenAPI, same commit**

Three more paths. Each **must** state, in prose:

- success is **bytes plus `Content-Disposition`**, and every error on the path
  is still the JSON envelope, so a client can distinguish a 403 from a file;
- `ENABLE_UPLOADS` does **not** gate these endpoints — they read database rows
  and touch no `Storage` driver;
- both export paths are rate-limited to 10 per 15 minutes per user and answer
  `too_many_requests` 429 in the envelope;
- **MENTOR may take the engagement export and may not take the season
  workbook**, and that this is a deliberate divergence from v1;
- the workbook's `Submitted %` column divides by the assignments assigned to
  that student, which **changes its value relative to v1** for any season
  containing a group-targeted assignment;
- `LATE` cells render `"L"` and the recorded minutes are withheld until the
  cutover backfill, with a pointer to ruling C3.

For the binary responses use a raw content type rather than the `ok()` helper:

```ts
        responses: {
          200: {
            description: "XLSX workbook",
            headers: {
              "Content-Disposition": {
                schema: { type: "string" },
                description: 'attachment; filename="…"; filename*=UTF-8\'\'…',
              },
            },
            content: {
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
                schema: { type: "string", format: "binary" },
              },
            },
          },
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
          429: errRef("TooManyRequests"),
        },
```

If `TooManyRequests` is not already in `components.responses`, add it beside the
others using the same `errorResponse` shape.

- [ ] **Step 8: Verification — the whole backend, serially**

```bash
cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern exports-routes
```

Expect: 15 passing. Then the full set, which is the first time every suite in
this plan runs together:

```bash
cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern integration
cd "$(git rev-parse --show-toplevel)" && pnpm turbo lint typecheck test:unit build
```

`--runInBand` is not optional. `cleanupTestData` is prefix-global: two suites
running concurrently delete each other's fixtures mid-test, and the failure
looks like a flaky assertion rather than a harness problem.

Then prove the emit is clean, because this task added three files with value
imports from shared:

```bash
grep -rn 'require("@space/shared")' apps/backend/dist/apps/backend/src/ || echo "clean"
```

Expect `clean`.

- [ ] **Step 9: Commit**

```bash
git add apps/backend/src && git commit -m "feat(backend): streamed XLSX exports, rate-limited, audited, mentor-refused for workbooks"
```

---

### Task 8: Mobile — the `/reports` screen

**Wave 5 · Agent D**, in parallel with Task 9. **The coordinator merges Task 9
first**, because this screen imports `ExportMenu` from it. Agent D writes
against the props declared in Task 9's Interfaces block and may stub the module
locally while working; it must not commit a stub.

**Files:**
- Create: `apps/mobile/src/lib/report-colors.ts`
- Create: `apps/mobile/src/components/charts/TrendLine.tsx`
- Create: `apps/mobile/src/components/charts/BandDonut.tsx`
- Create: `apps/mobile/src/components/charts/RankedBars.tsx`
- Create: `apps/mobile/src/hooks/use-reports.ts`
- Modify: `apps/mobile/app/(app)/reports.tsx` (replace the placeholder)
- **Fragment for the coordinator:** `apps/mobile/src/lib/query-keys.ts`
- **Fragment for the coordinator:** `apps/mobile/src/__tests__/placeholder-screens.test.tsx`
- Test: `apps/mobile/src/__tests__/reports-screen.test.tsx`

**Interfaces:**
- Consumes: `apiClient`; `useSessionStore`; `engagementSummarySchema`,
  `engagementStudentPageSchema`, `organisationReportSchema`, `BAND_LABEL`,
  `BAND_ORDER`, `REPORT_METRIC_NOTES`, and the row/point types from
  `@space/shared` (mobile may use the package name — Metro resolves it, and the
  `rootDir` emit trap is backend-only); `formatDate` from `../lib/format`;
  `Card`, `EmptyState`, `ErrorState`, `LoadingState`, `Screen`, `Text` from
  `../ui`; `useTheme` from `../theme`; `ExportMenu` from
  `../components/ExportMenu` (Task 9).
- Produces: `queryKeys.reports.*`; `useEngagementReport(params, enabled)`;
  `useEngagementStudents(params, enabled)`; `useOrganisationReport(enabled)`;
  `bandColor(theme, band)`; `TrendLine`, `BandDonut`, `RankedBars`.

**Layout, and why it is not v1's.** v1 renders a two-column grid of four charts
with the at-risk card last (`reports-view.tsx:46`, `:64`). Four charts stacked
is four screens of scrolling before the only actionable element on the page, so
on mobile the order is: header → export row → **at-risk list** → band donut →
attendance trend → completion list → method note (spec §9). The submission bar
chart becomes a horizontal bar *list* (free-text assignment titles do not fit an
axis at 375 px) and the seasons pie is dropped entirely in favour of a ranked
list (R93, R97).

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/__tests__/reports-screen.test.tsx
import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn() },
}));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));
// Task 9's module reaches native file/share APIs that do not exist under Jest.
// The screen only needs it to render a button.
jest.mock("../components/ExportMenu", () => ({
  ExportMenu: () => null,
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";

import ReportsScreen from "../../app/(app)/reports";

const get = apiClient.get as jest.Mock;

const emptyScopes = {
  seasonAdminIds: [] as number[],
  groupLeaderIds: [] as number[],
  activeSeasonId: null as number | null,
  graduationYear: null as number | null,
};
const sessionFor = (role: "SUPER" | "MENTOR" | "ADMIN" | "LEADER" | "STUDENT") => ({
  user: { id: 1, name: `Test ${role}`, email: `${role}@jpc.test`, role },
  scopes: emptyScopes,
});

const row = {
  score: 40,
  attendancePct: 50,
  submissionPct: 30,
  attendanceTotal: 8,
  attendancePresent: 4,
  submissionsExpected: 10,
  submissionsCompleted: 3,
  studentUserId: 21,
  name: "Sara Student",
  email: "sara@jpc.test",
  seasonId: 7,
  seasonTitle: "Spring 2099",
  band: "AT_RISK" as const,
};

const summary = {
  scope: {
    seasonIds: [7, 8],
    seasons: [
      { id: 7, code: "spring-2099", title: "Spring 2099" },
      { id: 8, code: "autumn-2099", title: "Autumn 2099" },
    ],
    truncated: false,
    label: "All seasons",
  },
  attendanceTrend: [
    {
      sessionId: 1,
      seasonId: 7,
      seasonTitle: "Spring 2099",
      title: "Opening",
      startsAt: "2099-03-01T18:00:00.000Z",
      presentCount: 8,
      expectedCount: 10,
      pct: 80,
    },
    {
      sessionId: 2,
      seasonId: 7,
      seasonTitle: "Spring 2099",
      title: "Week two",
      startsAt: "2099-03-08T18:00:00.000Z",
      presentCount: 5,
      expectedCount: 10,
      pct: 50,
    },
  ],
  completion: [
    {
      assignmentId: 3,
      seasonId: 7,
      title: "Reflection one",
      targeting: "targeted" as const,
      completed: 4,
      expected: 8,
      completionRate: 50,
    },
    {
      assignmentId: 4,
      seasonId: 7,
      title: "Targeted at nobody",
      targeting: "targeted" as const,
      completed: 0,
      expected: 0,
      completionRate: null,
    },
  ],
  bands: [
    { band: "HIGH" as const, count: 3 },
    { band: "MEDIUM" as const, count: 5 },
    { band: "LOW" as const, count: 2 },
    { band: "AT_RISK" as const, count: 34 },
  ],
  atRisk: [row],
  atRiskTotal: 34,
  cohortSize: 40,
  enrollmentCount: 44,
  generatedAt: "2099-03-10T00:00:00.000Z",
};

const organisation = {
  totalStudentsNotGraduated: 40,
  totalAlumni: 12,
  activeSeasonCount: 2,
  seasons: [
    {
      seasonId: 7,
      code: "spring-2099",
      program: "GBV",
      year: 2099,
      title: "Spring 2099",
      status: "ACTIVE" as const,
      activeCount: 20,
      completedCount: 3,
      withdrawnCount: 1,
      leaderCount: 2,
    },
  ],
  alumniByYear: [{ year: 2098, count: 12 }],
  generatedAt: "2099-03-10T00:00:00.000Z",
};

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

/** Answer whichever endpoints a given branch calls. */
function mockEndpoints({ withOrg = false }: { withOrg?: boolean } = {}) {
  get.mockImplementation((url: string) => {
    if (url.startsWith("/api/v1/reports/organisation")) {
      return Promise.resolve({ data: { data: organisation } });
    }
    if (url.startsWith("/api/v1/reports/engagement/students")) {
      return Promise.resolve({
        data: { data: { scope: summary.scope, rows: [row], nextCursor: null, total: 34 } },
      });
    }
    if (url.startsWith("/api/v1/reports/engagement")) {
      return Promise.resolve({ data: { data: summary } });
    }
    return Promise.reject(new Error(`unexpected ${url}`));
  });
  return withOrg;
}

describe("ReportsScreen — role branches", () => {
  it("shows a LEADER nothing and issues no request (R109)", async () => {
    useSessionStore.setState(sessionFor("LEADER"));
    mockEndpoints();

    renderWithProviders(<ReportsScreen />);

    expect(await screen.findByText("Reports")).toBeTruthy();
    // The API refuses leaders explicitly. A query that fires only to be refused
    // surfaces as an error state on a screen that should simply say the surface
    // is not theirs.
    expect(get).not.toHaveBeenCalled();
  });

  it("shows a STUDENT nothing and issues no request (R110)", async () => {
    useSessionStore.setState(sessionFor("STUDENT"));
    mockEndpoints();
    renderWithProviders(<ReportsScreen />);
    expect(await screen.findByText("Reports")).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  });

  it("gives a MENTOR the engagement report and NOT the organisation roll-up", async () => {
    useSessionStore.setState(sessionFor("MENTOR"));
    mockEndpoints();

    renderWithProviders(<ReportsScreen />);

    expect(await screen.findByText("Sara Student")).toBeTruthy();
    const urls = get.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.startsWith("/api/v1/reports/engagement"))).toBe(true);
    // /reports/organisation is SUPER-only; asking for it as a mentor earns a
    // 403 and an error card for a section that is not theirs.
    expect(urls.some((u) => u.includes("organisation"))).toBe(false);
  });

  it("gives SUPER both the roll-up and the engagement view (spec D17)", async () => {
    useSessionStore.setState(sessionFor("SUPER"));
    mockEndpoints({ withOrg: true });

    renderWithProviders(<ReportsScreen />);

    // v1 gates /mentor/reports to MENTOR only, so SUPER cannot open the
    // cross-season engagement screen at all (R106) — while the CSV route hands
    // them exactly that data (R45).
    expect(await screen.findByText("Sara Student")).toBeTruthy();
    expect(screen.getByText("Student accounts")).toBeTruthy();
    expect(screen.getByText("40")).toBeTruthy();
  });
});

describe("ReportsScreen — the at-risk card comes first and tells the truth", () => {
  it('renders "1 of 34" so the cap is visible (spec D16, R33)', async () => {
    useSessionStore.setState(sessionFor("MENTOR"));
    mockEndpoints();

    renderWithProviders(<ReportsScreen />);

    // v1 sliced to ten and said nothing, so a reader could not tell whether ten
    // was all of them.
    expect(await screen.findByText("Students at risk (1 of 34)")).toBeTruthy();
  });

  it("navigates to the student on press", async () => {
    useSessionStore.setState(sessionFor("MENTOR"));
    mockEndpoints();

    renderWithProviders(<ReportsScreen />);
    fireEvent.press(await screen.findByText("Sara Student"));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/student/[id]",
      params: { id: "21" },
    });
  });

  it("pages more at-risk rows inline rather than pushing a second route", async () => {
    useSessionStore.setState(sessionFor("MENTOR"));
    mockEndpoints();

    renderWithProviders(<ReportsScreen />);
    fireEvent.press(await screen.findByText("Show more"));

    await waitFor(() => {
      const urls = get.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes("/reports/engagement/students"))).toBe(true);
      expect(urls.some((u) => u.includes("band=AT_RISK"))).toBe(true);
    });
  });
});

describe("ReportsScreen — the numbers it renders", () => {
  it("takes the band from the contract, never from a local threshold (C4)", async () => {
    useSessionStore.setState(sessionFor("MENTOR"));
    get.mockImplementation((url: string) => {
      if (url.startsWith("/api/v1/reports/engagement/students")) {
        return Promise.resolve({
          data: { data: { scope: summary.scope, rows: [], nextCursor: null, total: 0 } },
        });
      }
      // Composite 75 — "Medium" if the client re-derived it — with attendance
      // at 50. The server says AT_RISK (either component under 60) and the
      // client must render what it is given.
      return Promise.resolve({
        data: {
          data: {
            ...summary,
            atRisk: [{ ...row, score: 75, attendancePct: 50, submissionPct: 100, band: "AT_RISK" }],
            atRiskTotal: 1,
          },
        },
      });
    });

    renderWithProviders(<ReportsScreen />);

    expect(await screen.findByText("Students at risk (1 of 1)")).toBeTruthy();
    expect(screen.getByText("50% attendance · 100% submissions")).toBeTruthy();
  });

  it("labels the band donut by enrolments when the scope spans seasons (R32)", async () => {
    useSessionStore.setState(sessionFor("MENTOR"));
    mockEndpoints();

    renderWithProviders(<ReportsScreen />);

    // Bucket counts count ENROLMENTS, so the total exceeds the headcount and a
    // reader comparing the donut to "40 students" is looking at two numbers.
    expect(await screen.findByText("44 enrolments · 40 students")).toBeTruthy();
  });

  it("renders a completion row with no cohort as — rather than 0% (R22)", async () => {
    useSessionStore.setState(sessionFor("MENTOR"));
    mockEndpoints();

    renderWithProviders(<ReportsScreen />);

    expect(await screen.findByText("Reflection one")).toBeTruthy();
    expect(screen.getByLabelText("Targeted at nobody: no students targeted")).toBeTruthy();
  });

  it("describes the trend for a screen reader from the served values", async () => {
    useSessionStore.setState(sessionFor("MENTOR"));
    mockEndpoints();

    renderWithProviders(<ReportsScreen />);

    expect(
      await screen.findByLabelText("Attendance trend, 2 sessions, from 80% to 50%"),
    ).toBeTruthy();
  });

  it("shows the method note, from the shared constant", async () => {
    useSessionStore.setState(sessionFor("MENTOR"));
    mockEndpoints();

    renderWithProviders(<ReportsScreen />);

    expect(await screen.findByText("How these numbers are calculated")).toBeTruthy();
    expect(
      screen.getByText(/Submission % counts only assignments assigned to that student/),
    ).toBeTruthy();
  });

  it("warns when the requested scope was narrowed", async () => {
    useSessionStore.setState(sessionFor("ADMIN"));
    get.mockResolvedValue({
      data: { data: { ...summary, scope: { ...summary.scope, truncated: true } } },
    });

    renderWithProviders(<ReportsScreen />);

    expect(
      await screen.findByText("Some seasons you asked for aren't in your scope."),
    ).toBeTruthy();
  });

  it("maps an error to ErrorState with a working retry", async () => {
    useSessionStore.setState(sessionFor("MENTOR"));
    get.mockRejectedValue(new Error("boom"));

    renderWithProviders(<ReportsScreen />);

    fireEvent.press(await screen.findByText("Try again"));
    await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(1));
  });

  it("shows an empty state when the scope has no data", async () => {
    useSessionStore.setState(sessionFor("ADMIN"));
    get.mockResolvedValue({
      data: {
        data: {
          ...summary,
          scope: { seasonIds: [], seasons: [], truncated: false, label: "No seasons" },
          attendanceTrend: [],
          completion: [],
          bands: [
            { band: "HIGH", count: 0 },
            { band: "MEDIUM", count: 0 },
            { band: "LOW", count: 0 },
            { band: "AT_RISK", count: 0 },
          ],
          atRisk: [],
          atRiskTotal: 0,
          cohortSize: 0,
          enrollmentCount: 0,
        },
      },
    });

    renderWithProviders(<ReportsScreen />);

    expect(await screen.findByText("No data in this scope")).toBeTruthy();
  });
});

describe("ReportsScreen — the season picker", () => {
  it("seeds itself from the scope the API returned, not from a second request", async () => {
    useSessionStore.setState(sessionFor("SUPER"));
    mockEndpoints({ withOrg: true });

    renderWithProviders(<ReportsScreen />);

    expect(await screen.findByText("All seasons")).toBeTruthy();
    expect(screen.getByText("Spring 2099")).toBeTruthy();
    // The permitted set is already on scope.seasons; asking GET /seasons again
    // would be a second round trip for data the first response carried.
    expect(get.mock.calls.map((c) => String(c[0]))).not.toContain("/api/v1/seasons");
  });

  it("refetches scoped to one season on press", async () => {
    useSessionStore.setState(sessionFor("SUPER"));
    mockEndpoints({ withOrg: true });

    renderWithProviders(<ReportsScreen />);
    fireEvent.press(await screen.findByText("Autumn 2099"));

    await waitFor(() => {
      const urls = get.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes("seasonId=8"))).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

```bash
cd apps/mobile && pnpm jest src/__tests__/reports-screen.test.tsx
```

Expected: **FAIL** — the placeholder renders
`This screen isn't built yet.`, so the first case fails on
`Unable to find an element with text: Sara Student`. That message proves the
test imports the real route file rather than a component defined in the test.

- [ ] **Step 3: Query-key fragment** *(for the coordinator)*

Add inside the existing `queryKeys` object in
`apps/mobile/src/lib/query-keys.ts`, following the file's spreading pattern:

```ts
  reports: {
    all: ["reports"] as const,
    // The scope is part of the key: two seasons' summaries are different
    // cached documents, and invalidating `reports.all` catches both.
    engagement: (seasonId: number | null) =>
      [...queryKeys.reports.all, "engagement", { seasonId }] as const,
    engagementStudents: (seasonId: number | null, band: string | null) =>
      [...queryKeys.reports.all, "engagement", "students", { seasonId, band }] as const,
    organisation: () => [...queryKeys.reports.all, "organisation"] as const,
    exportManifest: (seasonId: number) =>
      [...queryKeys.reports.all, "export-manifest", { seasonId }] as const,
  },
```

- [ ] **Step 4: Band colours**

```ts
// apps/mobile/src/lib/report-colors.ts
import type { EngagementBand } from "@space/shared";

import type { Theme } from "../theme";

/**
 * The one thing from v1's chart-colors.ts that has to survive the React Native
 * swap, and it survives as a MAP rather than as an index.
 *
 * v1's engagement pie was semantic by coincidence: `categoricalPalette` is
 * [success, teal, warning, error] and the bucket Map happened to be seeded
 * High, Medium, Low, At risk (chart-colors.ts:29-35 against
 * reports-query.ts:155-160), so slices were coloured by array position.
 * Reordering the seed would have silently painted "High" red and nothing
 * anywhere declared the mapping (R92, spec D11).
 *
 * Colours come from the theme, not from baked hexes: v1's only theme-aware
 * chart surface is the tooltip (R95) and on a phone dark mode is the norm.
 *
 * Note the trap v1 left next door (R96): AttendancePill reads green / red /
 * amber for Present / Absent / Late while the palette's indices 0-2 are green /
 * TEAL / amber, so colouring an attendance chart from the palette by index
 * paints ABSENT teal. Nothing here is coloured by attendance status; anything
 * that later is must build its own explicit map, not reuse this one.
 */
export function bandColor(theme: Theme, band: EngagementBand): string {
  const map: Record<EngagementBand, string> = {
    HIGH: theme.colors.success[500],
    MEDIUM: theme.colors.brand.teal[600],
    LOW: theme.colors.warning[500],
    AT_RISK: theme.colors.error[500],
  };
  return map[band];
}
```

- [ ] **Step 5: The three chart primitives**

```tsx
// apps/mobile/src/components/charts/TrendLine.tsx
import { View } from "react-native";
import Svg, { Circle, Line, Polyline } from "react-native-svg";

import { useTheme } from "../../theme";

export interface TrendPoint {
  label: string;
  pct: number | null;
}

export interface TrendLineProps {
  points: TrendPoint[];
  height?: number;
}

/**
 * A line, drawn on react-native-svg.
 *
 * Not a chart library (D-17.20): of v1's four Recharts cards, spec §9 already
 * replaces two with lists, leaving one line and one four-slice donut. A
 * library would add react-native-linear-gradient — a native module — to the dev
 * client for gradients nothing here uses, and would put every colour behind a
 * prop surface when they must all come from the theme.
 *
 * `accessibilityLabel` describes the SERVED values, so a screen reader gets the
 * data and the screen test can assert on numbers rather than on SVG geometry.
 *
 * Points with a null pct (nobody enrolled yet — D-17.13) are skipped rather
 * than plotted at zero; the line closes over the gap and the label says how
 * many sessions carried a figure.
 */
export function TrendLine({ points, height = 160 }: TrendLineProps) {
  const theme = useTheme();
  const plotted = points
    .map((p, i) => ({ ...p, i }))
    .filter((p): p is TrendPoint & { i: number; pct: number } => p.pct !== null);

  const width = 320;
  const pad = 8;
  const x = (i: number) =>
    points.length <= 1 ? width / 2 : pad + (i / (points.length - 1)) * (width - pad * 2);
  const y = (pct: number) => pad + (1 - pct / 100) * (height - pad * 2);

  const label =
    plotted.length === 0
      ? "Attendance trend, no data"
      : `Attendance trend, ${plotted.length} session${plotted.length === 1 ? "" : "s"}, from ${plotted[0]!.pct}% to ${plotted[plotted.length - 1]!.pct}%`;

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label}>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        {[0, 50, 100].map((tick) => (
          <Line
            key={tick}
            x1={pad}
            x2={width - pad}
            y1={y(tick)}
            y2={y(tick)}
            stroke={theme.colors.neutral[200]}
            strokeWidth={1}
          />
        ))}
        {plotted.length > 1 ? (
          <Polyline
            points={plotted.map((p) => `${x(p.i)},${y(p.pct)}`).join(" ")}
            fill="none"
            stroke={theme.colors.brand.teal[700]}
            strokeWidth={2}
          />
        ) : null}
        {plotted.map((p) => (
          <Circle
            key={p.i}
            cx={x(p.i)}
            cy={y(p.pct)}
            r={3}
            fill={theme.colors.brand.teal[700]}
          />
        ))}
      </Svg>
    </View>
  );
}
```

```tsx
// apps/mobile/src/components/charts/BandDonut.tsx
import { View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import type { EngagementBand } from "@space/shared";
import { BAND_LABEL } from "@space/shared";

import { bandColor } from "../../lib/report-colors";
import { useTheme } from "../../theme";

export interface BandDonutProps {
  bands: Array<{ band: EngagementBand; count: number }>;
  size?: number;
}

/**
 * Four arcs on one circle, coloured from the explicit band map (R92).
 *
 * A donut is kept only because this category count is FIXED at four. v1's other
 * two pies — one slice per season, one per graduation year — are replaced by
 * ranked lists: labelled slices overlap on a 240 px square past four categories
 * and the palette wraps back to green on the fifth, implying a severity ranking
 * that does not exist (R93, R97, spec §9).
 */
export function BandDonut({ bands, size = 160 }: BandDonutProps) {
  const theme = useTheme();
  const total = bands.reduce((n, b) => n + b.count, 0);
  const r = size / 2 - 12;
  const c = 2 * Math.PI * r;

  let offset = 0;
  const label =
    total === 0
      ? "Engagement bands, no data"
      : `Engagement bands: ${bands.map((b) => `${BAND_LABEL[b.band]} ${b.count}`).join(", ")}`;

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={theme.colors.neutral[200]}
          strokeWidth={16}
        />
        {total > 0
          ? bands.map((b) => {
              const dash = (b.count / total) * c;
              const el = (
                <Circle
                  key={b.band}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke={bandColor(theme, b.band)}
                  strokeWidth={16}
                  strokeDasharray={`${dash} ${c - dash}`}
                  strokeDashoffset={-offset}
                  // Start at 12 o'clock rather than 3.
                  transform={`rotate(-90 ${size / 2} ${size / 2})`}
                />
              );
              offset += dash;
              return el;
            })
          : null}
      </Svg>
    </View>
  );
}
```

```tsx
// apps/mobile/src/components/charts/RankedBars.tsx
import { View } from "react-native";

import { useTheme } from "../../theme";
import { Text } from "../../ui";

export interface RankedBar {
  key: string;
  label: string;
  /** null renders as an em dash — "no cohort to measure", not "0%". */
  value: number | null;
  caption?: string;
}

/**
 * A horizontal bar LIST, not a bar chart, and not SVG.
 *
 * v1 puts one bar per assignment on a vertical axis labelled with the
 * assignment title (R18, reports-view.tsx:55-61). Titles are free text; they do
 * not fit at 375 px. Spec §9: "Use a horizontal bar list with the title as a
 * row label, not an axis."
 */
export function RankedBars({ bars }: { bars: RankedBar[] }) {
  const theme = useTheme();

  return (
    <View style={{ gap: theme.spacing.sm }}>
      {bars.map((bar) => (
        <View
          key={bar.key}
          accessible
          accessibilityLabel={
            bar.value === null
              ? `${bar.label}: no students targeted`
              : `${bar.label}: ${bar.value}%${bar.caption ? `, ${bar.caption}` : ""}`
          }
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text variant="body">{bar.label}</Text>
            <Text variant="body">{bar.value === null ? "—" : `${bar.value}%`}</Text>
          </View>
          <View
            style={{
              height: 6,
              borderRadius: 3,
              backgroundColor: theme.colors.neutral[200],
              overflow: "hidden",
            }}
          >
            <View
              style={{
                width: `${bar.value ?? 0}%`,
                height: 6,
                backgroundColor: theme.colors.brand.teal[600],
              }}
            />
          </View>
          {bar.caption ? (
            <Text variant="caption" color={theme.colors.neutral[600]}>
              {bar.caption}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}
```

- [ ] **Step 6: The hooks**

```ts
// apps/mobile/src/hooks/use-reports.ts
import { useInfiniteQuery, useQuery, type UseQueryResult } from "@tanstack/react-query";
import {
  engagementStudentPageSchema,
  engagementSummarySchema,
  organisationReportSchema,
  type EngagementBand,
  type EngagementSummary,
  type OrganisationReport,
} from "@space/shared";

import { apiClient } from "../lib/api-client";
import { queryKeys } from "../lib/query-keys";

function scopeQuery(seasonId: number | null): string {
  return seasonId === null ? "" : `?seasonId=${seasonId}`;
}

/**
 * The engagement summary.
 *
 * `enabled` is passed by the screen rather than derived here: the two roles
 * that must NOT call this (LEADER, STUDENT) get a 403, and a query that fires
 * only to be refused surfaces as an error card on a screen that should simply
 * say the surface is not theirs (spec D6 #4).
 *
 * The response is PARSED, not cast, so a backend drift fails at this boundary
 * rather than handing a malformed summary to four charts. That matters more
 * here than elsewhere: every value on this screen is a number with no
 * independent source of truth on the device.
 */
export function useEngagementReport(
  seasonId: number | null,
  enabled: boolean,
): UseQueryResult<EngagementSummary> {
  return useQuery({
    queryKey: queryKeys.reports.engagement(seasonId),
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/reports/engagement${scopeQuery(seasonId)}`);
      return engagementSummarySchema.parse(res.data.data);
    },
    enabled,
  });
}

/**
 * More at-risk rows, paged, on the same screen.
 *
 * The summary caps its at-risk list at 10 (R33) and the cohort lives behind a
 * separately-gated endpoint (spec D6 #2). Rather than a second route file, the
 * card grows a "Show more" that pages this in place — mobile users should not
 * have to download a spreadsheet to read ten more rows (spec §9), and a route
 * for it would widen this plan's screen scope.
 */
export function useEngagementStudents(
  seasonId: number | null,
  band: EngagementBand | null,
  enabled: boolean,
) {
  return useInfiniteQuery({
    queryKey: queryKeys.reports.engagementStudents(seasonId, band),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      if (seasonId !== null) params.set("seasonId", String(seasonId));
      if (band !== null) params.set("band", band);
      if (pageParam) params.set("cursor", pageParam);
      params.set("limit", "50");
      const res = await apiClient.get(`/api/v1/reports/engagement/students?${params.toString()}`);
      return engagementStudentPageSchema.parse(res.data.data);
    },
    getNextPageParam: (last) => last.nextCursor,
    enabled,
  });
}

/** SUPER only — the endpoint refuses everyone else (R50, R107). */
export function useOrganisationReport(enabled: boolean): UseQueryResult<OrganisationReport> {
  return useQuery({
    queryKey: queryKeys.reports.organisation(),
    queryFn: async () => {
      const res = await apiClient.get("/api/v1/reports/organisation");
      return organisationReportSchema.parse(res.data.data);
    },
    enabled,
  });
}
```

- [ ] **Step 7: The screen**

Replace `apps/mobile/app/(app)/reports.tsx` entirely:

```tsx
import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import {
  BAND_LABEL,
  BAND_ORDER,
  REPORT_METRIC_NOTES,
  type EngagementReportRow,
} from "@space/shared";

import { BandDonut } from "../../src/components/charts/BandDonut";
import { RankedBars } from "../../src/components/charts/RankedBars";
import { TrendLine } from "../../src/components/charts/TrendLine";
import { ExportMenu } from "../../src/components/ExportMenu";
import {
  useEngagementReport,
  useEngagementStudents,
  useOrganisationReport,
} from "../../src/hooks/use-reports";
import { formatDate } from "../../src/lib/format";
import { bandColor } from "../../src/lib/report-colors";
import { useSessionStore } from "../../src/store/session";
import { useTheme } from "../../src/theme";
import { Card, EmptyState, ErrorState, LoadingState, Screen, Text } from "../../src/ui";

function AtRiskRow({ row }: { row: EngagementReportRow }) {
  const theme = useTheme();
  const router = useRouter();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() =>
        router.push({ pathname: "/student/[id]", params: { id: String(row.studentUserId) } })
      }
      style={{ paddingVertical: theme.spacing.xs }}
    >
      {/* User.name is NOT NULL in the schema, so v1's name-or-email fallback
          (reports-view.tsx:91) has no case to cover and is not ported. */}
      <Text variant="body">{row.name}</Text>
      <Text variant="caption" color={theme.colors.neutral[600]}>
        {row.seasonTitle}
      </Text>
      {/* Server-derived, every one of them (ruling C4). The client renders what
          it is given and computes no threshold of its own. */}
      <Text variant="caption" color={bandColor(theme, row.band)}>
        {`${row.attendancePct}% attendance · ${row.submissionPct}% submissions`}
      </Text>
    </Pressable>
  );
}

function SeasonPicker({
  seasons,
  selected,
  onSelect,
}: {
  seasons: Array<{ id: number; title: string }>;
  selected: number | null;
  onSelect: (id: number | null) => void;
}) {
  const theme = useTheme();
  const chip = (active: boolean) => ({
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radii.sm,
    marginRight: theme.spacing.xs,
    backgroundColor: active ? theme.colors.brand.navy[900] : theme.colors.neutral[100],
  });

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <Pressable accessibilityRole="button" onPress={() => onSelect(null)} style={chip(selected === null)}>
        <Text
          variant="label"
          color={selected === null ? theme.colors.neutral[50] : theme.colors.neutral[900]}
        >
          All seasons
        </Text>
      </Pressable>
      {seasons.map((s) => (
        <Pressable
          key={s.id}
          accessibilityRole="button"
          onPress={() => onSelect(s.id)}
          style={chip(selected === s.id)}
        >
          <Text
            variant="label"
            color={selected === s.id ? theme.colors.neutral[50] : theme.colors.neutral[900]}
          >
            {s.title}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function OrganisationSection() {
  const theme = useTheme();
  const { data, isPending, isError, refetch } = useOrganisationReport(true);

  if (isPending) return <LoadingState />;
  if (isError) {
    return <ErrorState message="Couldn't load the organisation roll-up." onRetry={() => void refetch()} />;
  }

  return (
    <Card style={{ marginBottom: theme.spacing.md }}>
      <Text variant="heading">Organisation</Text>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: theme.spacing.sm }}>
        {/* "Current students" in v1 counted student ACCOUNTS, including
            students never enrolled in anything (R51, spec D4). The label says
            what the number is. */}
        <View>
          <Text variant="caption">Student accounts</Text>
          <Text variant="heading">{String(data.totalStudentsNotGraduated)}</Text>
        </View>
        <View>
          <Text variant="caption">Alumni</Text>
          <Text variant="heading">{String(data.totalAlumni)}</Text>
        </View>
        <View>
          <Text variant="caption">Active seasons</Text>
          <Text variant="heading">{String(data.activeSeasonCount)}</Text>
        </View>
      </View>

      <View style={{ marginTop: theme.spacing.md }}>
        <Text variant="label">Active members per season</Text>
        {/* v1 drew a pie with one labelled slice per season on a 240px square
            (R60, R97) and coloured it by palette index, implying a severity
            ranking that does not exist (R93). A ranked list carries the same
            information and reads at 375px. */}
        <RankedBars
          bars={[...data.seasons]
            .sort((a, b) => b.activeCount - a.activeCount)
            .map((s) => ({
              key: String(s.seasonId),
              label: s.title,
              value:
                data.seasons.reduce((n, x) => Math.max(n, x.activeCount), 0) > 0
                  ? Math.round(
                      (s.activeCount /
                        data.seasons.reduce((n, x) => Math.max(n, x.activeCount), 0)) *
                        100,
                    )
                  : null,
              caption: `${s.activeCount} active · ${s.completedCount} completed · ${s.withdrawnCount} dropped · ${s.leaderCount} leaders`,
            }))}
        />
      </View>

      <View style={{ marginTop: theme.spacing.md }}>
        <Text variant="label">Alumni by year</Text>
        {data.alumniByYear.map((a) => (
          <Text key={a.year} variant="body">{`${a.year}: ${a.count}`}</Text>
        ))}
      </View>
    </Card>
  );
}

export default function ReportsScreen() {
  const theme = useTheme();
  const role = useSessionStore((s) => s.user?.role ?? null);

  // LEADER and STUDENT have no surface in this domain (R109, R110) and the API
  // refuses them explicitly. The screen does not ask.
  const canView = role === "SUPER" || role === "ADMIN" || role === "MENTOR";
  const isSuper = role === "SUPER";

  const [seasonId, setSeasonId] = useState<number | null>(null);
  const [showAllAtRisk, setShowAllAtRisk] = useState(false);

  const summary = useEngagementReport(seasonId, canView);
  const more = useEngagementStudents(seasonId, "AT_RISK", canView && showAllAtRisk);

  // The picker's options come from the FIRST unscoped response's scope, which
  // already lists exactly the seasons this caller is permitted. A separate
  // GET /api/v1/seasons would be a second round trip for data in hand.
  const [permitted, setPermitted] = useState<Array<{ id: number; title: string }>>([]);
  // useEffect, not useMemo: this sets state. A useMemo that calls a setter
  // renders-during-render and React 19 will warn (and in StrictMode run it
  // twice). The guard on `seasonId === null` is what keeps the option list from
  // collapsing to one entry after the user picks a season.
  useEffect(() => {
    if (seasonId === null && summary.data) {
      setPermitted(summary.data.scope.seasons.map((s) => ({ id: s.id, title: s.title })));
    }
  }, [seasonId, summary.data]);

  if (!canView) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <EmptyState title="Reports" message="This screen is for mentors and season admins." />
      </Screen>
    );
  }

  const handleRefresh = () => {
    void summary.refetch();
  };

  const extraRows = more.data?.pages.flatMap((p) => p.rows) ?? [];
  const atRiskRows = showAllAtRisk && extraRows.length > 0 ? extraRows : (summary.data?.atRisk ?? []);

  return (
    <Screen
      edges={["top", "left", "right"]}
      onRefresh={handleRefresh}
      refreshing={summary.isRefetching}
    >
      <Text variant="heading">Reports</Text>

      {summary.isPending ? (
        <LoadingState />
      ) : summary.isError ? (
        <ErrorState message="Couldn't load reports." onRetry={() => void summary.refetch()} />
      ) : (
        <>
          {isSuper ? <OrganisationSection /> : null}

          <SeasonPicker seasons={permitted} selected={seasonId} onSelect={setSeasonId} />

          {summary.data.scope.truncated ? (
            <Text variant="caption" color={theme.colors.warning[600]}>
              Some seasons you asked for aren&apos;t in your scope.
            </Text>
          ) : null}

          <ExportMenu
            seasonId={seasonId}
            scopeLabel={summary.data.scope.label}
            canExportWorkbook={
              seasonId !== null && (role === "SUPER" || role === "ADMIN")
            }
          />

          {summary.data.enrollmentCount === 0 && summary.data.attendanceTrend.length === 0 ? (
            <EmptyState
              title="No data in this scope"
              message="Pick a season with activity, or wait until the first session has run."
            />
          ) : (
            <>
              {/* The at-risk list comes FIRST on mobile. v1 puts it in the
                  fourth card of a two-by-two grid (reports-view.tsx:64-108);
                  stacked, that is four screens of scrolling before the only
                  actionable element on the page (spec §9). */}
              <Card style={{ marginTop: theme.spacing.md }}>
                <Text variant="heading">
                  {`Students at risk (${atRiskRows.length} of ${summary.data.atRiskTotal})`}
                </Text>
                {atRiskRows.length === 0 ? (
                  <Text variant="body" color={theme.colors.neutral[600]}>
                    Nobody flagged in this scope.
                  </Text>
                ) : (
                  atRiskRows.map((row) => (
                    <AtRiskRow key={`${row.studentUserId}-${row.seasonId}`} row={row} />
                  ))
                )}
                {summary.data.atRiskTotal > atRiskRows.length ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setShowAllAtRisk(true);
                      if (more.hasNextPage) void more.fetchNextPage();
                    }}
                  >
                    <Text variant="label" color={theme.colors.brand.teal[700]}>
                      Show more
                    </Text>
                  </Pressable>
                ) : null}
              </Card>

              <Card style={{ marginTop: theme.spacing.md }}>
                <Text variant="heading">Engagement</Text>
                {/* Bucket counts count ENROLMENTS, so a student in two in-scope
                    seasons is counted twice and the total exceeds the headcount
                    (R27, R32). Both numbers, side by side. */}
                <Text variant="caption" color={theme.colors.neutral[600]}>
                  {`${summary.data.enrollmentCount} enrolments · ${summary.data.cohortSize} students`}
                </Text>
                <BandDonut bands={summary.data.bands} />
                {BAND_ORDER.map((band) => {
                  const entry = summary.data.bands.find((b) => b.band === band);
                  return (
                    <Text key={band} variant="body" color={bandColor(theme, band)}>
                      {`${BAND_LABEL[band]}: ${entry?.count ?? 0}`}
                    </Text>
                  );
                })}
              </Card>

              <Card style={{ marginTop: theme.spacing.md }}>
                <Text variant="heading">Attendance trend</Text>
                <TrendLine
                  points={summary.data.attendanceTrend.map((p) => ({
                    // Formatted on the DEVICE from a raw instant. v1 formatted
                    // on the server with date-fns and no year, so a reader saw
                    // the server's calendar day and sessions from different
                    // years collapsed onto one label (R15, R101, C2, D12).
                    label: formatDate(p.startsAt),
                    pct: p.pct,
                  }))}
                />
                {summary.data.attendanceTrend.length > 0 ? (
                  <Text variant="caption" color={theme.colors.neutral[600]}>
                    {`${formatDate(summary.data.attendanceTrend[0]!.startsAt)} – ${formatDate(
                      summary.data.attendanceTrend[summary.data.attendanceTrend.length - 1]!.startsAt,
                    )}`}
                  </Text>
                ) : null}
              </Card>

              <Card style={{ marginTop: theme.spacing.md }}>
                {/* Named "Completion rate", not "Submission %": it is a
                    property of an assignment, and v1 calling both by one name
                    is spec D2's most consequential ambiguity (D-17.1). */}
                <Text variant="heading">Completion rate</Text>
                <RankedBars
                  bars={summary.data.completion.map((r) => ({
                    key: String(r.assignmentId),
                    label: r.title,
                    value: r.completionRate,
                    caption:
                      r.expected === 0
                        ? "No students targeted"
                        : `${r.completed} of ${r.expected} ${
                            r.targeting === "all_groups" ? "in the season" : "in the target groups"
                          }`,
                  }))}
                />
              </Card>

              <Card style={{ marginTop: theme.spacing.md }}>
                <Text variant="heading">How these numbers are calculated</Text>
                {/* The same strings the workbook's Key sheet renders. One
                    definition, two renderers — the C4 discipline applied to
                    prose, so a spreadsheet and the app cannot describe the same
                    metric differently. */}
                {REPORT_METRIC_NOTES.map((note) => (
                  <Text key={note} variant="caption" color={theme.colors.neutral[600]}>
                    {note}
                  </Text>
                ))}
              </Card>
            </>
          )}
        </>
      )}
    </Screen>
  );
}
```

- [ ] **Step 8: Placeholder-guard fragment** *(for the coordinator)*

In `apps/mobile/src/__tests__/placeholder-screens.test.tsx`: remove the
`ReportsScreen` import and the `["reports", ReportsScreen, "Reports"]` row, and
decrement the `toHaveLength(...)` assertion by one. It reads `18` on the branch
this plan starts from; decrement whatever number is actually there, since Plans
8–10 also removed entries.

- [ ] **Step 9: Verification**

```bash
cd apps/mobile && pnpm jest src/__tests__/reports-screen.test.tsx \
  src/__tests__/placeholder-screens.test.tsx src/__tests__/role-tabs.test.tsx
cd "$(git rev-parse --show-toplevel)" && pnpm turbo lint typecheck --filter=@space/mobile
```

Expect: 16 passing in the reports suite; `role-tabs` stays green because
`/reports` was already in `navigation.ts` for all three roles (`:57`, `:78`,
`:132`, `:137`) and no nav entry changes here.

If the suite fails on `import Svg from "react-native-svg"`, extend
`transformIgnorePatterns` in `apps/mobile/jest.config.js` — Plan 4 already added
`react-native-svg` to the allow-list, so this should not fire.

- [ ] **Step 10: Commit**

```bash
git add apps/mobile/app apps/mobile/src && \
  git commit -m "feat(mobile): reports screen with server-derived bands and an at-risk-first layout"
```

---

### Task 9: Mobile — the download and share layer

**Wave 5 · Agent E**, in parallel with Task 8. **Merged first**, because Task
8's screen imports `ExportMenu`.

**Files:**
- Modify: `apps/mobile/package.json` (add `expo-file-system`, `expo-sharing`)
- Create: `apps/mobile/src/lib/export-download.ts`
- Create: `apps/mobile/src/hooks/use-report-export.ts`
- Create: `apps/mobile/src/components/ExportMenu.tsx`
- Test: `apps/mobile/src/__tests__/export-download.test.ts`
- Test: `apps/mobile/src/__tests__/export-menu.test.tsx`

**Interfaces — fixed, because Task 8 codes against them:**

```ts
export interface ExportMenuProps {
  /** null = the caller's whole permitted scope. */
  seasonId: number | null;
  /** From `summary.scope.label` — used in the filename and the dialog title. */
  scopeLabel: string;
  /** Whether to offer the season workbook. False for MENTOR and for the all-seasons scope. */
  canExportWorkbook: boolean;
}
export function ExportMenu(props: ExportMenuProps): JSX.Element;
```

- Consumes: `apiClient` (for its `baseURL` only), `loadAccessToken` and
  `refreshAccessToken` from `../lib/api-client` / `../lib/token-storage`;
  `exportFilename`, `XLSX_MIME`, `XLSX_UTI`, `exportManifestSchema` from
  `@space/shared`.
- Produces: `downloadAndShare(options): Promise<void>`;
  `ExportAuthError`, `ExportShareUnavailableError`, `ExportServerError`;
  `useSeasonWorkbookManifest(seasonId, enabled)`; `useReportExport()`;
  `ExportMenu`.

- [ ] **Step 1: Install the file and share modules**

```bash
cd apps/mobile && npx expo install expo-file-system expo-sharing
```

`npx expo install`, not `pnpm add`: it resolves the versions that match SDK 54,
and a mismatched native module is a runtime crash on a device rather than a
build error.

- [ ] **Step 2: Write the failing unit tests**

```ts
// apps/mobile/src/__tests__/export-download.test.ts
const mockDownloadAsync = jest.fn();
const mockCreateDownloadResumable = jest.fn(() => ({ downloadAsync: mockDownloadAsync }));
const mockDeleteAsync = jest.fn();
const mockMakeDirectoryAsync = jest.fn();
const mockReadAsStringAsync = jest.fn();
const mockIsAvailableAsync = jest.fn();
const mockShareAsync = jest.fn();
const mockLoadAccessToken = jest.fn();
const mockRefreshAccessToken = jest.fn();

jest.mock("expo-file-system/legacy", () => ({
  cacheDirectory: "file:///cache/",
  createDownloadResumable: mockCreateDownloadResumable,
  deleteAsync: mockDeleteAsync,
  makeDirectoryAsync: mockMakeDirectoryAsync,
  readAsStringAsync: mockReadAsStringAsync,
}));
jest.mock("expo-sharing", () => ({
  isAvailableAsync: mockIsAvailableAsync,
  shareAsync: mockShareAsync,
}));
jest.mock("../lib/token-storage", () => ({
  loadAccessToken: mockLoadAccessToken,
}));
jest.mock("../lib/api-client", () => ({
  apiClient: { defaults: { baseURL: "http://localhost:4000" } },
  refreshAccessToken: mockRefreshAccessToken,
}));

import {
  ExportAuthError,
  ExportServerError,
  ExportShareUnavailableError,
  downloadAndShare,
} from "../lib/export-download";

beforeEach(() => {
  jest.clearAllMocks();
  mockLoadAccessToken.mockResolvedValue("access-token");
  mockIsAvailableAsync.mockResolvedValue(true);
  mockDownloadAsync.mockResolvedValue({ uri: "file:///cache/exports/x.xlsx", status: 200 });
});

describe("downloadAndShare", () => {
  it("writes the body straight to disk with the token in a HEADER", async () => {
    await downloadAndShare({
      path: "/api/v1/seasons/7/exports/workbook",
      filename: "gbv-2026-attendance-grades-2026-08-24.xlsx",
      dialogTitle: "GBV 2026",
    });

    const [url, fileUri, options] = mockCreateDownloadResumable.mock.calls[0]!;
    expect(url).toBe("http://localhost:4000/api/v1/seasons/7/exports/workbook");
    expect(fileUri).toBe("file:///cache/exports/gbv-2026-attendance-grades-2026-08-24.xlsx");
    // A signed query-string URL handed to the system browser would work and is
    // forbidden: it puts a credential in a URL (spec D10).
    expect(url).not.toContain("token");
    expect((options as { headers: Record<string, string> }).headers.Authorization).toBe(
      "Bearer access-token",
    );
  });

  it("never fetches the body into JS memory or base64-encodes it", async () => {
    const fetchSpy = jest.spyOn(global, "fetch" as never);
    await downloadAndShare({
      path: "/api/v1/reports/engagement/export",
      filename: "engagement-all-seasons-2026-08-24.xlsx",
      dialogTitle: "All seasons",
    });
    // THE test the roadmap names. Fetching an arraybuffer and base64-encoding
    // it to write costs ~1.33x the file size in JS heap on top of the buffer
    // itself, for a students x (sessions + quizzes + assignments) matrix.
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockCreateDownloadResumable).toHaveBeenCalledTimes(1);
    fetchSpy.mockRestore();
  });

  it("hands the file to the share sheet with a mimeType AND a UTI", async () => {
    await downloadAndShare({
      path: "/api/v1/reports/engagement/export",
      filename: "engagement-all-seasons-2026-08-24.xlsx",
      dialogTitle: "All seasons",
    });

    expect(mockShareAsync).toHaveBeenCalledWith("file:///cache/exports/x.xlsx", {
      // iOS needs the UTI or the sheet offers the wrong apps, or refuses the
      // file outright (spec D10).
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      UTI: "org.openxmlformats.spreadsheetml.sheet",
      dialogTitle: "All seasons",
    });
  });

  it("deletes the cached file after sharing — it is a courier, not a record", async () => {
    await downloadAndShare({
      path: "/api/v1/reports/engagement/export",
      filename: "engagement-all-seasons-2026-08-24.xlsx",
      dialogTitle: "All seasons",
    });
    expect(mockDeleteAsync).toHaveBeenCalledWith("file:///cache/exports/x.xlsx", {
      idempotent: true,
    });
  });

  it("deletes the cached file even when the share sheet throws", async () => {
    mockShareAsync.mockRejectedValueOnce(new Error("user cancelled"));
    await expect(
      downloadAndShare({
        path: "/api/v1/reports/engagement/export",
        filename: "x.xlsx",
        dialogTitle: "All seasons",
      }),
    ).rejects.toThrow();
    expect(mockDeleteAsync).toHaveBeenCalled();
  });

  it("refreshes once on a 401 and retries — the access token is 900s", async () => {
    mockDownloadAsync
      .mockResolvedValueOnce({ uri: "file:///cache/exports/x.xlsx", status: 401 })
      .mockResolvedValueOnce({ uri: "file:///cache/exports/x.xlsx", status: 200 });
    mockReadAsStringAsync.mockResolvedValue(
      JSON.stringify({ error: { code: "invalid_token", message: "expired" } }),
    );
    mockRefreshAccessToken.mockResolvedValue("fresh-token");

    await downloadAndShare({
      path: "/api/v1/reports/engagement/export",
      filename: "x.xlsx",
      dialogTitle: "All seasons",
    });

    // A large workbook on a slow connection can outlive the token; a mid-flight
    // 401 is retryable, not a permission failure (spec D10).
    expect(mockRefreshAccessToken).toHaveBeenCalledTimes(1);
    expect(mockDownloadAsync).toHaveBeenCalledTimes(2);
    expect(mockShareAsync).toHaveBeenCalled();
  });

  it("gives up after ONE refresh, exactly like the axios interceptor", async () => {
    mockDownloadAsync.mockResolvedValue({ uri: "file:///cache/exports/x.xlsx", status: 401 });
    mockReadAsStringAsync.mockResolvedValue(
      JSON.stringify({ error: { code: "invalid_token", message: "expired" } }),
    );
    mockRefreshAccessToken.mockResolvedValue("fresh-token");

    await expect(
      downloadAndShare({ path: "/x", filename: "x.xlsx", dialogTitle: "s" }),
    ).rejects.toBeInstanceOf(ExportAuthError);
    expect(mockRefreshAccessToken).toHaveBeenCalledTimes(1);
  });

  it("surfaces the server's error code from the written body on a 403", async () => {
    mockDownloadAsync.mockResolvedValue({ uri: "file:///cache/exports/x.xlsx", status: 403 });
    mockReadAsStringAsync.mockResolvedValue(
      JSON.stringify({ error: { code: "forbidden", message: "You don't have access to this." } }),
    );

    // downloadResumable writes the body whatever the status, so the JSON
    // envelope lands in the file. Reading it back is how the client tells a 403
    // from a spreadsheet (spec §7).
    await expect(
      downloadAndShare({ path: "/x", filename: "x.xlsx", dialogTitle: "s" }),
    ).rejects.toMatchObject({ code: "forbidden" });
    expect(mockDeleteAsync).toHaveBeenCalled();
  });

  it("reports a rate limit as itself rather than as a generic failure", async () => {
    mockDownloadAsync.mockResolvedValue({ uri: "file:///cache/exports/x.xlsx", status: 429 });
    mockReadAsStringAsync.mockResolvedValue(
      JSON.stringify({ error: { code: "too_many_requests", message: "Too many requests." } }),
    );
    await expect(
      downloadAndShare({ path: "/x", filename: "x.xlsx", dialogTitle: "s" }),
    ).rejects.toBeInstanceOf(ExportServerError);
  });

  it("refuses to start when sharing is unavailable, rather than downloading first", async () => {
    mockIsAvailableAsync.mockResolvedValue(false);
    await expect(
      downloadAndShare({ path: "/x", filename: "x.xlsx", dialogTitle: "s" }),
    ).rejects.toBeInstanceOf(ExportShareUnavailableError);
    // expo-sharing is not available on every platform (notably web). Checking
    // first means the user is not made to wait for a download that can only end
    // in an error (spec D10).
    expect(mockCreateDownloadResumable).not.toHaveBeenCalled();
  });

  it("reports progress against the manifest's estimate when one is given", async () => {
    const onProgress = jest.fn();
    await downloadAndShare({
      path: "/x",
      filename: "x.xlsx",
      dialogTitle: "s",
      estimatedBytes: 1000,
      onProgress,
    });
    const callback = mockCreateDownloadResumable.mock.calls[0]![3] as (p: {
      totalBytesWritten: number;
      totalBytesExpectedToWrite: number;
    }) => void;
    // A plain downloadAsync gives no progress at all; downloadResumable does,
    // and the manifest supplies the denominator when the server sends no
    // Content-Length (spec D10).
    callback({ totalBytesWritten: 500, totalBytesExpectedToWrite: -1 });
    expect(onProgress).toHaveBeenCalledWith(0.5);
  });
});
```

```tsx
// apps/mobile/src/__tests__/export-menu.test.tsx
const mockDownloadAndShare = jest.fn();
jest.mock("../lib/export-download", () => ({
  downloadAndShare: mockDownloadAndShare,
  ExportShareUnavailableError: class extends Error {},
}));
jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), defaults: { baseURL: "http://localhost:4000" } },
}));

import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import { apiClient } from "../lib/api-client";
import { ExportMenu } from "../components/ExportMenu";
import { renderWithProviders } from "./helpers/render";

const get = apiClient.get as jest.Mock;

const manifest = {
  filename: "gbv-2026-attendance-grades-2026-08-24.xlsx",
  mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  sheets: [
    { name: "Attendance", columnCount: 8, rowCount: 38 },
    { name: "Grades", columnCount: 6, rowCount: 38 },
    { name: "Assignments", columnCount: 7, rowCount: 38 },
    { name: "Key", columnCount: 2, rowCount: 13 },
  ],
  estimatedBytes: 40960,
  generatedAt: "2026-08-24T00:00:00.000Z",
  scopeDescription: "GBV 2026 (gbv-2026)",
};

beforeEach(() => {
  jest.clearAllMocks();
  get.mockResolvedValue({ data: { data: manifest } });
  mockDownloadAndShare.mockResolvedValue(undefined);
});

describe("ExportMenu", () => {
  it("offers the engagement export in every scope", async () => {
    renderWithProviders(
      <ExportMenu seasonId={null} scopeLabel="All seasons" canExportWorkbook={false} />,
    );
    fireEvent.press(await screen.findByText("Export engagement"));

    await waitFor(() =>
      expect(mockDownloadAndShare).toHaveBeenCalledWith(
        expect.objectContaining({
          path: "/api/v1/reports/engagement/export",
          filename: expect.stringMatching(/^engagement-all-seasons-\d{4}-\d{2}-\d{2}\.xlsx$/),
        }),
      ),
    );
  });

  it("hides the workbook button when the caller may not take one", async () => {
    renderWithProviders(
      <ExportMenu seasonId={null} scopeLabel="All seasons" canExportWorkbook={false} />,
    );
    expect(await screen.findByText("Export engagement")).toBeTruthy();
    // v1's ONLY mentor protection was a button that was never rendered (R86).
    // Hiding it here is courtesy; the endpoint refuses regardless, and the
    // integration suite proves that.
    expect(screen.queryByText("Export season workbook")).toBeNull();
    expect(get).not.toHaveBeenCalled();
  });

  it("shows the manifest's size before a workbook download", async () => {
    renderWithProviders(
      <ExportMenu seasonId={7} scopeLabel="GBV 2026" canExportWorkbook />,
    );
    expect(await screen.findByText("Export season workbook (~40 KB)")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/seasons/7/exports/manifest");
  });

  it("uses the manifest's filename verbatim so the share sheet and the header agree", async () => {
    renderWithProviders(<ExportMenu seasonId={7} scopeLabel="GBV 2026" canExportWorkbook />);
    fireEvent.press(await screen.findByText("Export season workbook (~40 KB)"));

    await waitFor(() =>
      expect(mockDownloadAndShare).toHaveBeenCalledWith(
        expect.objectContaining({
          path: "/api/v1/seasons/7/exports/workbook",
          filename: manifest.filename,
          estimatedBytes: 40960,
        }),
      ),
    );
  });

  it("surfaces a failure as text rather than swallowing it", async () => {
    mockDownloadAndShare.mockRejectedValue(
      Object.assign(new Error("nope"), { code: "forbidden" }),
    );
    renderWithProviders(
      <ExportMenu seasonId={null} scopeLabel="All seasons" canExportWorkbook={false} />,
    );
    fireEvent.press(await screen.findByText("Export engagement"));

    expect(await screen.findByText("Couldn't export. You don't have access to this.")).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run them to see them fail**

```bash
cd apps/mobile && pnpm jest src/__tests__/export-download.test.ts src/__tests__/export-menu.test.tsx
```

Expected: **FAIL** — `Cannot find module '../lib/export-download'`. The
meaningful first red is the "never fetches the body into JS memory" case: a
naive implementation written with `fetch` + `FileSystem.writeAsStringAsync(...,
{ encoding: Base64 })` fails it with
`expect(jest.fn()).not.toHaveBeenCalled()`, which is precisely the shape the
roadmap forbids.

- [ ] **Step 4: The download layer**

```ts
// apps/mobile/src/lib/export-download.ts
//
// expo-file-system's LEGACY API, pinned deliberately.
//
// Expo SDK 54 ships a new File/Directory API as `expo-file-system` with the
// previous one at `expo-file-system/legacy`. `createDownloadResumable` is the
// only API that gives BOTH request headers and progress callbacks, and it is
// the legacy one. A half-migrated file layer is a class of bug that only shows
// up on a real device, so the import lives here, once, and every caller goes
// through this module (spec D10).
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { XLSX_MIME, XLSX_UTI } from "@space/shared";

import { apiClient, refreshAccessToken } from "./api-client";
import { loadAccessToken } from "./token-storage";

export class ExportAuthError extends Error {
  readonly code = "invalid_token";
}

export class ExportShareUnavailableError extends Error {
  readonly code = "share_unavailable";
}

export class ExportServerError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface DownloadAndShareOptions {
  /** API path, relative to the client's baseURL. */
  path: string;
  /** Local filename — also what the user sees in the share sheet and later in Files. */
  filename: string;
  dialogTitle: string;
  /** From the manifest, when there is one. Used as the progress denominator. */
  estimatedBytes?: number;
  onProgress?: (fraction: number) => void;
}

const EXPORT_DIR = `${FileSystem.cacheDirectory ?? ""}exports/`;

/**
 * Download an export and hand it to the OS share sheet.
 *
 * v1 delivers both exports as <Link>s to a GET returning
 * Content-Disposition: attachment, and the browser does the rest — credentials
 * ride on a cookie, the file lands in the OS download folder, the user opens it
 * from there. React Native has none of those three things (spec D10).
 *
 * The bytes go straight from the socket to a file: they never enter JS memory.
 * The alternative — fetching an arraybuffer and base64-encoding it to write —
 * costs roughly 1.33x the file size in heap ON TOP of the buffer itself, for a
 * students x (sessions + quizzes + assignments) matrix.
 *
 * The token travels as a header. A signed query-string URL opened in the system
 * browser would also work and is forbidden: it puts a credential in a URL.
 *
 * The cache directory is not storage — the OS may evict it. The file is a
 * courier, not a record: it is deleted once the share sheet is done and there
 * is no "previous exports" list backed by it. Android's public Downloads folder
 * is deliberately NOT a target: reaching it needs the Storage Access Framework
 * and a directory the user picks every single time, which is worse than the
 * share sheet.
 */
export async function downloadAndShare(options: DownloadAndShareOptions): Promise<void> {
  // Checked BEFORE downloading. expo-sharing is unavailable on some platforms
  // (notably web); making the user wait for a download that can only end in an
  // error is the worse failure.
  if (!(await Sharing.isAvailableAsync())) {
    throw new ExportShareUnavailableError("Sharing isn't available on this device.");
  }

  await FileSystem.makeDirectoryAsync(EXPORT_DIR, { intermediates: true });
  const fileUri = `${EXPORT_DIR}${options.filename}`;
  const url = `${apiClient.defaults.baseURL ?? ""}${options.path}`;

  try {
    let token = await loadAccessToken();
    let result = await run(url, fileUri, token, options);

    if (result.status === 401) {
      // The access token is 900s and a large workbook on a slow connection can
      // outlive it. One retry, exactly like the axios interceptor's `_retried`
      // discipline — a second 401 is a real permission failure.
      const fresh = await refreshAccessToken();
      if (!fresh) throw new ExportAuthError("Your session expired. Sign in again.");
      token = fresh;
      result = await run(url, fileUri, token, options);
    }

    if (result.status === 401) {
      throw new ExportAuthError("Your session expired. Sign in again.");
    }
    if (result.status < 200 || result.status >= 300) {
      // downloadResumable writes the response body whatever the status, so the
      // JSON envelope is sitting in the file. Reading it back is how the client
      // tells a 403 from a spreadsheet (spec §7). The body is a few hundred
      // bytes on every error path.
      throw await toServerError(fileUri, result.status);
    }

    await Sharing.shareAsync(fileUri, {
      mimeType: XLSX_MIME,
      // iOS needs the UTI as well or the sheet offers the wrong apps.
      UTI: XLSX_UTI,
      dialogTitle: options.dialogTitle,
    });
  } finally {
    await FileSystem.deleteAsync(fileUri, { idempotent: true });
  }
}

async function run(
  url: string,
  fileUri: string,
  token: string | null,
  options: DownloadAndShareOptions,
): Promise<{ uri: string; status: number }> {
  const resumable = FileSystem.createDownloadResumable(
    url,
    fileUri,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} },
    (progress) => {
      if (!options.onProgress) return;
      // The server streams the workbook, so there is no Content-Length and
      // totalBytesExpectedToWrite comes back as -1. The manifest's estimate is
      // the denominator in that case (spec §7).
      const expected =
        progress.totalBytesExpectedToWrite > 0
          ? progress.totalBytesExpectedToWrite
          : (options.estimatedBytes ?? 0);
      if (expected > 0) {
        options.onProgress(Math.min(1, progress.totalBytesWritten / expected));
      }
    },
  );

  const result = await resumable.downloadAsync();
  if (!result) throw new ExportServerError("download_failed", "The download didn't complete.");
  return { uri: result.uri, status: result.status };
}

async function toServerError(fileUri: string, status: number): Promise<ExportServerError> {
  try {
    const body = await FileSystem.readAsStringAsync(fileUri);
    const parsed = JSON.parse(body) as { error?: { code?: string; message?: string } };
    if (parsed.error?.code) {
      return new ExportServerError(parsed.error.code, parsed.error.message ?? "Export failed.");
    }
  } catch {
    // Not JSON, or unreadable — fall through to the status-only error.
  }
  return new ExportServerError("export_failed", `The export failed (${status}).`);
}
```

- [ ] **Step 5: The hooks**

```ts
// apps/mobile/src/hooks/use-report-export.ts
import { useMutation, useQuery, type UseQueryResult } from "@tanstack/react-query";
import { exportManifestSchema, type ExportManifest } from "@space/shared";

import { apiClient } from "../lib/api-client";
import { downloadAndShare, type DownloadAndShareOptions } from "../lib/export-download";
import { queryKeys } from "../lib/query-keys";

/**
 * The workbook's shape, without building it.
 *
 * Only the season workbook gets a manifest. It is a students x (sessions +
 * quizzes + assignments) matrix and can be multi-megabyte; the engagement
 * export is one row per enrolment and its size is already predictable from the
 * summary's `enrollmentCount`.
 */
export function useSeasonWorkbookManifest(
  seasonId: number | null,
  enabled: boolean,
): UseQueryResult<ExportManifest> {
  return useQuery({
    queryKey: queryKeys.reports.exportManifest(seasonId ?? -1),
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/seasons/${seasonId}/exports/manifest`);
      return exportManifestSchema.parse(res.data.data);
    },
    enabled: enabled && seasonId !== null,
  });
}

/**
 * A mutation, not a query: an export is an action with a side effect (the share
 * sheet), it must not be re-run on focus or reconnect, and its result is not
 * cacheable — the file is deleted the moment the sheet closes.
 */
export function useReportExport() {
  return useMutation({
    mutationFn: (options: DownloadAndShareOptions) => downloadAndShare(options),
  });
}
```

- [ ] **Step 6: `ExportMenu`**

```tsx
// apps/mobile/src/components/ExportMenu.tsx
import { View } from "react-native";
import { exportFilename } from "@space/shared";

import { useReportExport, useSeasonWorkbookManifest } from "../hooks/use-report-export";
import { useTheme } from "../theme";
import { Button, Text } from "../ui";

export interface ExportMenuProps {
  seasonId: number | null;
  scopeLabel: string;
  canExportWorkbook: boolean;
}

function kb(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${Math.round(bytes / (1024 * 1024))} MB`
    : `${Math.round(bytes / 1024)} KB`;
}

/**
 * Two buttons, and both are courtesy rather than security.
 *
 * v1's entire protection against a mentor pulling any season's workbook is that
 * /mentor/reports does not pass exportXlsxHref, so the button is not rendered
 * (R86) — "the authorization is the absence of a button". Here the endpoint
 * refuses on its own (lib/permissions.ts, spec D6 #3) and the integration suite
 * proves it; hiding the control just avoids offering a user something that can
 * only fail.
 */
export function ExportMenu({ seasonId, scopeLabel, canExportWorkbook }: ExportMenuProps) {
  const theme = useTheme();
  const exportMutation = useReportExport();
  const manifest = useSeasonWorkbookManifest(seasonId, canExportWorkbook);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <View style={{ gap: theme.spacing.xs, marginTop: theme.spacing.sm }}>
      <Button
        title="Export engagement"
        variant="secondary"
        onPress={() =>
          exportMutation.mutate({
            path:
              seasonId === null
                ? "/api/v1/reports/engagement/export"
                : `/api/v1/reports/engagement/export?seasonId=${seasonId}`,
            // The SAME builder the server uses for Content-Disposition, so the
            // name in the share sheet and the name in the header cannot drift
            // (D-17.16). The local path must be chosen before any header is
            // visible, which is why this is shared code and not a header parse.
            filename: exportFilename("engagement", scopeLabel, today),
            dialogTitle: `Engagement — ${scopeLabel}`,
          })
        }
      />

      {canExportWorkbook && manifest.data ? (
        <Button
          title={`Export season workbook (~${kb(manifest.data.estimatedBytes)})`}
          variant="secondary"
          onPress={() =>
            exportMutation.mutate({
              path: `/api/v1/seasons/${seasonId}/exports/workbook`,
              filename: manifest.data!.filename,
              dialogTitle: manifest.data!.scopeDescription,
              estimatedBytes: manifest.data!.estimatedBytes,
            })
          }
        />
      ) : null}

      {exportMutation.isPending ? (
        <Text variant="caption" color={theme.colors.neutral[600]}>
          Preparing your file…
        </Text>
      ) : null}

      {exportMutation.isError ? (
        <Text variant="caption" color={theme.colors.error[600]}>
          {errorText(exportMutation.error)}
        </Text>
      ) : null}
    </View>
  );
}

function errorText(error: unknown): string {
  const code = (error as { code?: string } | null)?.code;
  if (code === "forbidden") return "Couldn't export. You don't have access to this.";
  if (code === "too_many_requests") return "Couldn't export. Too many exports — try again shortly.";
  if (code === "share_unavailable") return "Couldn't export. Sharing isn't available here.";
  if (code === "invalid_token") return "Couldn't export. Your session expired — sign in again.";
  return "Couldn't export. Please try again.";
}
```

- [ ] **Step 7: Verification**

```bash
cd apps/mobile && pnpm jest src/__tests__/export-download.test.ts src/__tests__/export-menu.test.tsx
cd "$(git rev-parse --show-toplevel)" && pnpm turbo lint typecheck --filter=@space/mobile
```

Expect: 11 + 5 passing.

If Jest cannot resolve `expo-file-system/legacy`, confirm the package installed
(`ls apps/mobile/node_modules/expo-file-system/legacy`) — the subpath export
exists from SDK 53 onward. The suites mock it, so a missing module is a
resolution problem, not a runtime one.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/package.json apps/mobile/src && \
  git commit -m "feat(mobile): stream exports to disk with an auth header and hand them to the share sheet"
```

---

### Task 10: Closing gate (coordinator)

**Wave 6 · Coordinator only.** No files created — verification.

- [ ] **Step 1: Full suite**

```bash
cd "$(git rev-parse --show-toplevel)" && pnpm turbo lint typecheck test:unit build
cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern integration
```

Both green. Record the suite and test counts against the baseline taken in Task
2, Step 2.

- [ ] **Step 2: Emit check**

```bash
grep -rn 'require("@space/shared")' apps/backend/dist/apps/backend/src/ || echo "clean"
```

Expect `clean`. This plan adds value imports from shared in four backend files
(`lib/queries/reports.ts`, `lib/exports/season-workbook.ts` — via
`workbook-style.ts` —, `lib/exports/engagement-workbook.ts`,
`routes/exports.ts`) plus the fix to Plan 8's `lib/queries/engagement.ts`, and
the depth differs between `routes/` (four levels) and `lib/**/` (five). A wrong
depth is a TypeScript error; a bare specifier is not, and only shows up as
`ERR_MODULE_NOT_FOUND` when the built server starts. Belt and braces:

```bash
cd apps/backend && node dist/apps/backend/src/server.js &
sleep 4 && curl -s localhost:4000/api/v1/health && kill %1
```

- [ ] **Step 3: Mutation pass**

Eight mutations, **one at a time, restoring after each**. Each must make the
named test fail. A mutation the suite survives is a test that is not testing
what it claims.

1. **Drop the scope intersection.** In `lib/queries/reports.ts`'s
   `resolveReportScope`, replace the `seasons` line with
   `const seasons = permitted;` — i.e. ignore `requestedIds` and return
   everything permitted, then let the caller pass the request through.
   *Better still, the faithful-port version:* build the season `where` from
   `requestedIds` directly. →
   `reports-routes.test.ts` **"gives an ADMIN only their own seasons, and drops
   the rest silently"** must fail with the other season present in
   `scope.seasonIds`. *(This is R3, the domain's headline finding.)*

2. **Restore v1's present-tense trend denominator.** In
   `buildEngagementSummary`, replace the per-session `eligible` computation with
   the count of `ACTIVE` enrolments in that season:
   `const eligible = new Set((enrollmentsBySeason.get(s.seasonId) ?? []).filter(e => e.status === "ACTIVE").map(e => e.studentUserId));`
   → `reports-queries.test.ts` **"divides each session by the roster AS IT
   STOOD, so pct never exceeds 100 (D3)"** must fail on session 1's
   `expectedCount` (3 → 4) and `pct` (67 → 50).

3. **Un-intersect the completion numerator.** In `buildEngagementSummary`,
   replace the intersection with `const completed = submitters.size;`
   → `reports-queries.test.ts` **"intersects the numerator with the expected
   set, so a bar cannot exceed 100 (R23)"** must fail (`completed` 2 → 3).

4. **Restore v1's workbook submission denominator.** In
   `lib/exports/season-workbook.ts`'s Assignments loop, replace
   `engagementBy.get(...)?.submissionPct` with
   `Math.round((turnedIn / assignments.length) * 100)` computed over every
   assignment (and make every cell render a status rather than `n/a`).
   → `season-workbook.test.ts` **"divides Submitted % by the assignments
   assigned to that student (ruling C5)"** must fail: bob reads 0 out of 2
   instead of 0 out of 1 and alice's cell for "Group A only" stops being
   `n/a`. *(This is ruling C5, the plan's central metric decision.)*

5. **Restore the raw `LATE` minutes.** In `season-workbook.ts`, change the
   `return "L";` branch to `return record.lateMinutes ?? "L";` (and re-select
   `lateMinutes` in `loadSeasonExportData`).
   → `season-workbook.test.ts` **"prints 'L' for a LATE cell and never the
   recorded minutes (ruling C3)"** must fail with `Received: 12`.

6. **Admit MENTOR to the workbook.** In `lib/permissions.ts`, change
   `canExportSeasonWorkbook` to
   `isSuper(user) || isMentor(user) || isAdminOfSeason(user, seasonId)` — v1's
   gate, verbatim (`src/app/api/season/export/route.ts:20-22`).
   → `exports-routes.test.ts` **"REFUSES a MENTOR"** must fail with
   `Received: 200`.

7. **Export a soft-deleted season.** In
   `season-workbook.ts`'s `loadSeasonExportData`, drop `deletedAt: null` from
   the season lookup (and switch to `findUnique`), matching v1's
   `findUniqueOrThrow` on id alone.
   → `season-workbook.test.ts` **"returns null for a soft-deleted season
   (D14)"** and `exports-routes.test.ts` **"404s a soft-deleted season even for
   SUPER"** must both fail.

8. **Fetch-then-base64 on the client.** In
   `apps/mobile/src/lib/export-download.ts`, replace the `createDownloadResumable`
   call with `fetch(url, { headers })` → `arrayBuffer()` →
   `FileSystem.writeAsStringAsync(fileUri, base64, { encoding: "base64" })`.
   → `export-download.test.ts` **"never fetches the body into JS memory or
   base64-encodes it"** must fail. *(This is the roadmap's stated
   done-criterion for Plan 11's mobile half.)*

Optionally also: **collapse the band to the composite.** In
`packages/shared/src/reports.ts`, reorder `bandFor` so the composite thresholds
run before `isAtRisk` and the last branch returns `"AT_RISK"` for `< 40` (v1's
R30). → `report-schemas.test.ts` **"bands a component-weak student AT_RISK even
though the composite says Medium"** must fail with `Received: "MEDIUM"`.

- [ ] **Step 4: Manual device pass**

Backend running against staging, `apiClient` pointed at it:

1. **As a MENTOR:** `/reports` shows the at-risk card first, with "N of M". No
   organisation section. The band donut's colours are green / teal / amber /
   red, top to bottom, matching the legend below it.
2. **As that MENTOR:** "Export engagement" produces a share sheet; save to Files
   and open the file — sheet one is `Engagement`, sheet two is `Key`, the fifth
   column header reads `Submission % (assigned to student)`. There is **no**
   "Export season workbook" button.
3. **As an ADMIN of one season:** pick that season in the picker; the numbers
   change. "Export season workbook" appears with an estimated size. Download it
   — four sheets, `LATE` cells read `L`, a student outside a targeted
   assignment's groups reads `n/a`, and the `Attendance %` column matches what
   the student's detail screen shows for the same season.
4. **As that ADMIN:** try `curl` on another admin's season workbook with the
   ADMIN's token → `403` in the JSON envelope.
5. **As a LEADER and as a STUDENT:** `/reports` is not in the tab bar or the
   `/more` sidebar, and opening the route directly shows the "for mentors and
   season admins" state with **no network request** (check the backend log).
6. **Rate limit:** hit the engagement export eleven times in a row → the
   eleventh answers `429 too_many_requests` in the envelope, and the app shows
   "Too many exports — try again shortly."
7. **Airplane mode mid-download:** the error text appears and no partial file is
   left in the cache directory.

- [ ] **Step 5: Report**

The implementation report must state, explicitly:

1. Suite and test counts before and after.
2. All eight mutation outcomes.
3. The device pass result.
4. **The deliberate divergences from v1, by name**, so a reviewer diffing the
   two systems does not read any of them as a leak or a regression:
   - the workbook's `Submitted %` changes value for any season containing a
     group-targeted assignment (C5);
   - the attendance trend changes value for any season that has gained or lost
     students (D3);
   - the `AT_RISK` band is larger than v1's, because it is component-wise (D5);
   - **MENTOR loses** the season workbook (D6 #3);
   - **SUPER gains** the engagement report (D17);
   - `LATE` cells no longer carry minutes (C3);
   - CSV is gone (D7).
5. The five **deferred-to-cutover** items, restated so they are carried forward
   into `docs/superpowers/plans/2026-08-24-plan-13-cutover.md` rather than
   rediscovered.
6. Anything found while implementing that this plan got wrong.

---

## Done means

Objectively checkable. Every line is a command or an observation, not a
judgement.

**Contracts**
- [ ] `packages/shared/src/reports.ts` exists and is exported from `index.ts`; `cd packages/shared && npx jest` is green.
- [ ] `bandFor` is the only banding function in the repo: `grep -rn "score >= 80" packages apps --include=*.ts --include=*.tsx` returns exactly one hit.
- [ ] `grep -rn "AT_RISK_PCT\|< 60" apps/mobile/src apps/mobile/app` returns **no** threshold comparison — the client never re-derives a band.
- [ ] `exportFilename` is called from both `apps/backend/src/routes/exports.ts` and `apps/mobile/src/components/ExportMenu.tsx`.

**Backend**
- [ ] Six new endpoints answer under `/api/v1`: `reports/engagement`, `reports/engagement/students`, `reports/organisation`, `reports/engagement/export`, `seasons/:id/exports/workbook`, `seasons/:id/exports/manifest`.
- [ ] All six appear in `/api/docs.json`; the two binary ones declare a binary 200 and a JSON 4xx.
- [ ] The role matrix in D-17.6 is proven by `exports-routes.test.ts` and `reports-routes.test.ts` — every cell has a test.
- [ ] `grep -rn "GroupStudent\|groupStudent" apps/backend/src/lib/queries/reports.ts apps/backend/src/lib/exports/` is empty (ruling C9).
- [ ] `grep -rn "lateMinutes" apps/backend/src/lib/exports/` is empty (ruling C3 — the column is not even selected).
- [ ] No `db.*.create|update|delete` anywhere under `src/lib/queries/reports.ts`, `src/lib/queries/organisation-report.ts`, `src/lib/exports/`, `src/routes/reports.ts`, `src/routes/exports.ts` (ruling C6):
      `grep -rn "\.create(\|\.update(\|\.delete(\|\.upsert(\|deleteMany\|updateMany" <those paths>` → empty.
- [ ] Nothing under `apps/backend/prisma/` changed: `git diff --name-only main -- apps/backend/prisma` is empty (ruling C1).
- [ ] `grep -rn 'require("@space/shared")' apps/backend/dist/apps/backend/src/` is empty after `pnpm build`.
- [ ] The built server starts and answers `/api/v1/health`.

**Numbers**
- [ ] A season workbook's `Attendance %` and `Submitted %` columns equal the values `GET /api/v1/students/:id/engagement` returns for the same student and season — asserted by `season-workbook.test.ts`'s "agrees with the engagement report cell-for-cell".
- [ ] No `attendancePoint.pct` in any response exceeds 100 — asserted by a loop over the whole trend.
- [ ] No `completionRate` exceeds 100, and a targeted assignment with no targets returns `null`.
- [ ] `bands` always has four entries in `HIGH, MEDIUM, LOW, AT_RISK` order and their counts sum to `enrollmentCount`.
- [ ] `atRiskTotal` equals the `AT_RISK` band count.

**Exports**
- [ ] Both export responses begin with the bytes `PK` and load through `ExcelJS.Workbook.xlsx.load`.
- [ ] Every failure on an export path is `application/json` in the `{ error: { code, message } }` envelope.
- [ ] `Content-Disposition` carries both `filename="…"` and `filename*=UTF-8''…`.
- [ ] The eleventh export within 15 minutes answers `429 too_many_requests`.
- [ ] A successful export emits one `export.completed` log line containing no `@` character.
- [ ] The season workbook has exactly the sheets `Attendance`, `Grades`, `Assignments`, `Key`; the engagement export has `Engagement`, `Key`.
- [ ] `grep -rn "csv\|text/csv" apps/backend/src apps/mobile/src` returns only the `?format=csv` rejection message.

**Mobile**
- [ ] `apps/mobile/app/(app)/reports.tsx` no longer renders "This screen isn't built yet."; `placeholder-screens.test.tsx`'s count is decremented and green.
- [ ] `cd apps/mobile && pnpm jest` is green.
- [ ] `grep -rn "expo-file-system" apps/mobile/src apps/mobile/app` matches **only** `src/lib/export-download.ts`, and that import is `expo-file-system/legacy`.
- [ ] `grep -rn "base64\|arrayBuffer" apps/mobile/src/lib/export-download.ts` is empty.
- [ ] `grep -rn "categoricalPalette\|#10B981\|#EF4444" apps/mobile/src/components/charts apps/mobile/src/lib/report-colors.ts` is empty — every colour comes from the theme.
- [ ] No `as Href` / `as any` added: `git diff main -- apps/mobile | grep -n "as Href\|as any"` is empty.
- [ ] `pnpm turbo lint typecheck --filter=@space/mobile` is clean.

**Process**
- [ ] Every integration command run in this plan carried `--runInBand`.
- [ ] The full integration set is green in one serial run.
- [ ] All eight mutations were applied one at a time, each turned the named test red, and each was reverted.
- [ ] The implementation report names the seven deliberate divergences and the five cutover deferrals, and the deferrals appear in `docs/superpowers/plans/2026-08-24-plan-13-cutover.md`.
