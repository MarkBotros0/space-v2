# Domain 17 — Reports & exports

> Status: draft · Phase: 5 · v1 API status: **none** (no `/api/v1` route in v1
> touches any file in this domain — both exports live outside `/api/v1`;
> nothing is ported in `apps/backend/src/routes/`;
> `apps/mobile/app/(app)/reports.tsx` is a placeholder)

This domain owns the four screens that read the database and show a number
nobody typed in, and the two routes that hand a file to the user. It owns
**no writes at all** — §6 is a single paragraph — and that is the whole point:
everything here is a derived figure whose definition must survive the port
byte-for-byte, because v1 and v2 will quote these numbers off the same database
during the transition.

There are **three separate report models** in v1, not one with filters:

1. **`reports-query.ts`** — the engagement report. Attendance trend, submission
   completion, engagement banding, at-risk list, and a per-student CSV.
   Consumed by `/mentor/reports` (all seasons) and
   `/admin/season/[code]/reports` (one season).
2. **`super-reports-query.ts`** — the organisation roll-up. Enrolment counts
   per season and alumni by graduation year. **Not a superset** of the above
   and shares no metric with it (R61). Consumed by `/super/reports` only.
3. **`season-export.ts`** — the season workbook. A three-sheet XLSX of every
   active student's attendance, quiz grades and assignment statuses.

**Boundary with domain 9 (Notes & engagement).** `src/lib/engagement.ts` is
domain 9's file. `computeEngagementForStudent` supplies three of the six
columns in this domain's CSV and every input to the engagement pie and the
at-risk list. Its arithmetic — the 50/50 composite, the `PRESENT|LATE`
numerator, the denominator that counts sessions from before a student enrolled,
the ignored due dates — is domain 9 R53–R62 and is **cross-referenced, not
restated**. So is the fact that it is recomputed on read at four queries per
student (domain 9 R79–R82) and that "at risk" already means three
mutually-inconsistent things (domain 9 R71–R76, D7). What this domain owns is
what `reports-query.ts` *does* with those numbers: the banding, the cap, the
CSV columns, and the two additional metrics (attendance trend, submission
completion) that engagement does not produce.

**Boundary with domain 4 (Attendance & check-in).** Domain 4 establishes that
the attendance numbers are unsound at source: `lateMinutes` is measured from
`checkInOpenAt` — when an admin pressed a button — rather than from
`session.startsAt`, with no threshold applied, so `LATE` is a function of staff
behaviour (domain 4 R63, R64, D1); and the absence budget consumes those raw
minutes (domain 4 R88, D2). **Every attendance-derived metric in this domain
inherits that defect.** §3 marks each one with how it inherits: the trend and
both attendance percentages pool `PRESENT` with `LATE` and are therefore
insensitive to *which* of the two a row is (R14, R73); the workbook's per-cell
`LATE` value prints the defective minute count raw and is the only place in the
product where a reader sees it cell-by-cell (R70). No number in this domain
is more trustworthy than domain 4's `Attendance` rows, and one of them is
strictly less.

**Boundary with domain 16 (Imports).** Domain 16 owns `spreadsheet.ts` and both
importers. It flagged (16 D14) that this domain's exports cannot be fed back
into the student importer. §10 D8 verifies that claim and records the exact
mechanism.

**Boundary with domain 2 (Seasons).** Season identity, `code`, `status` and the
soft-delete rule are domain 2's. This domain owns only which seasons a report
resolves to (R1, R53, R81).

---

## 1. v1 source

| File | Holds |
|---|---|
| `src/lib/reports-query.ts` | The engagement report: `ReportFilters`/`ReportsData` shapes (`:6-45`), the banding table (`:47-59`), `loadReportsData` (`:61-175`) computing attendance trend, submission rates, engagement buckets and at-risk, and `toCsv` (`:177-190`) |
| `src/lib/super-reports-query.ts` | The organisation roll-up: `loadSuperReports` (`:29-95`) — student/alumni totals, per-season enrolment tallies, distinct leader counts, alumni by graduation year |
| `src/lib/season-export.ts` | The season workbook: `attendanceCell` (`:9-13`), the submission label map and turned-in set (`:15-21`), header styling and freeze panes (`:32-40`), and `buildSeasonExportWorkbook` (`:42-182`) producing the Attendance / Grades / Assignments sheets |
| `src/lib/chart-colors.ts` | Token hexes mirrored from the CSS `@theme` block (`:4-26`) and the ordered `categoricalPalette` (`:29-35`). Nothing semantic — see R90, R96 |
| `src/lib/engagement.ts` | **Domain 9's file.** `computeEngagementForStudent` (`:21-88`) is called once per active enrolment by `loadReportsData` (`src/lib/reports-query.ts:144`) |
| `src/components/ui/charts.tsx` | The three Recharts wrappers — `LineChartCard` (`:37-95`), `BarChartCard` (`:103-152`), `PieChartCard` (`:158-202`) — plus an unused `ChartLegend` (`:209-220`) |
| `src/components/reports/reports-view.tsx` | The shared engagement-report layout: export buttons (`:35-44`), the two chart rows (`:46-62`, `:64-69`), the at-risk card (`:70-108`), and the whole-report empty state (`:23-31`) |
| `src/components/ui/attendance-pill.tsx` | Not this domain's, but the only place a status→colour mapping exists (`:10-26`) — see R96 |
| `src/app/mentor/reports/page.tsx` | MENTOR entry point: `requireRole(["MENTOR"])`, all-season scope, CSV button only (`:10-26`) |
| `src/app/admin/reports/page.tsx` | Not a report — a redirect to the admin's most recent season's report (`:9-21`) |
| `src/app/admin/season/[code]/reports/page.tsx` | Per-season engagement report for ADMIN/SUPER; the only page that renders the XLSX button (`:19-42`) |
| `src/app/super/reports/page.tsx` | The organisation roll-up screen: three stat cards, two pies, one table (`:17-134`) |
| `src/app/api/reports/export/route.ts` | The CSV download: scope resolution from role (`:12-29`), `text/csv` response (`:33-39`) |
| `src/app/api/season/export/route.ts` | The XLSX download: season parameter validation (`:15-18`), role gate (`:20-22`), binary response (`:25-31`) |
| `src/lib/navigation.ts` | Which roles see a "Reports" item at all (`:46`, `:67`, `:121`, `:126`) |
| `src/lib/auth/permissions.ts` | `requireRole` (`:25-35`), `canEditSeason` (`:41-43`) — the two gates above this domain |
| `src/lib/rbac.ts` | `isSuper` (`:12-14`), `isMentor` (`:24-26`), `isAdminOfSeason` (`:28-30`) — the predicates both export routes use |

---

## 2. Data model

This domain **reads eight models and writes none**. It defines no model of its
own: there is no `Report`, no cached figure, no export record.

| Model | Fields that carry meaning here | Read by |
|---|---|---|
| `Season` (`prisma/schema.prisma:242-278`) | `id`, `code`, `title`, `program`, `year`, `status`, `deletedAt`, `startDate` | Scope resolution (`reports-query.ts:64-67`), season rows (`super-reports-query.ts:33-45`), workbook filename (`season-export.ts:46-49`), the admin redirect's ordering (`admin/reports/page.tsx:16`) |
| `SeasonEnrollment` (`:339-361`) | `studentUserId`, `seasonId`, `groupId`, `status` | Trend denominator (`reports-query.ts:99`), submission denominator (`:125`), the per-student row set (`:134-141`), workbook rows (`season-export.ts:51-58`), per-season tallies (`super-reports-query.ts:42`) |
| `Session` (`:363-390`) | `id`, `seasonId`, `title`, `startsAt` | Trend points (`reports-query.ts:79-94`), workbook session columns (`season-export.ts:68-77`) |
| `Attendance` (`:440-462`) | `studentUserId`, `status`, `lateMinutes` | Trend numerator (`reports-query.ts:104`), workbook cells (`season-export.ts:75`, `:117-120`) |
| `Assignment` (`:464-500`) | `id`, `seasonId`, `title`, `isAllGroups`, `deletedAt`, `createdAt` | Submission bars (`reports-query.ts:110-121`), workbook assignment columns (`season-export.ts:90-98`) |
| `AssignmentTarget` (`:502-511`) | `groupId` | Non-`isAllGroups` denominator (`reports-query.ts:118`, `:126`) |
| `Submission` (`:513-537`) | `studentUserId`, `status` | Filtered `_count` (`reports-query.ts:119`), workbook cells (`season-export.ts:96`, `:162-173`) |
| `GroupStudent` (`:327-337`) | `groupId`, `studentUserId` | Non-`isAllGroups` denominator (`reports-query.ts:126`) |
| `Group` / `GroupLeader` (`:297-325`) | `name`; `userId` | Workbook `Group` column (`season-export.ts:56`), distinct leader count (`super-reports-query.ts:44`) |
| `Quiz` (`:644-667`) | `id`, `seasonId`, `title`, `maxScore`, `publishedAt` | Workbook Grades columns (`season-export.ts:79-88`) |
| `QuizGrade` (`:669-687`) | `studentUserId`, `score` | Workbook grade cells (`season-export.ts:86`, `:134-149`) |
| `User` (`:103-164`) | `name`, `email`, `role`, `graduationYear`, `deletedAt` | CSV identity columns (`reports-query.ts:139`), workbook identity columns (`season-export.ts:55`), student/alumni totals (`super-reports-query.ts:31-32`, `:47-50`) |

Enums constrained against: `AttendanceStatus` (`:44-48`) — `PRESENT`/`ABSENT`
pooled with `LATE` in every percentage here; `SubmissionStatus` (`:50-55`) —
`DRAFT` is the only one that never counts as turned in; `EnrollmentStatus`
(`:38-42`) — all three members are tallied on the SUPER page (R54);
`SeasonStatus` (`:31-36`) — only `ACTIVE` is counted (R52).

Fields worth flagging:

- **`Quiz.publishedAt` is read by the schema comment's contract and ignored
  here.** `prisma/schema.prisma:653-654` documents it as the draft marker
  ("students only see published quizzes"); the workbook query has no
  `publishedAt` clause (`season-export.ts:79-83`), so a draft ONLINE quiz
  becomes a Grades column (R74).
- **`Season.deletedAt` is honoured by one of the three report models and not
  the other two.** `loadReportsData` filters it (R1); `loadSuperReports` filters
  it (R53); `buildSeasonExportWorkbook` does not (R81).
- **`SeasonEnrollment.groupId` and `GroupStudent.groupId` are two different
  answers to "which group is this student in".** The workbook uses the former
  (R66); the submission denominator and engagement use the latter (R21, domain
  9 R59). `GroupStudent.studentUserId` is `@unique`
  (`prisma/schema.prisma:329`) — a student has at most one group ever, across
  all seasons.
- **`Attendance.lateMinutes` is nullable and treated as meaningful when
  present.** The workbook prints it verbatim (R69); domain 4 R32 records that a
  routine leader edit silently nulls it.
- **Nothing here is stored.** No engagement score, no report snapshot, no
  export receipt. Every figure is recomputed per request (domain 9 R78) and
  every export is rebuilt from scratch (R89).

---

## 3. Business rules

### Scope resolution and filters — `loadReportsData`

- **R1.** `loadReportsData` resolves its scope to every `Season` with
  `deletedAt = null`, narrowed by `id in filters.seasonIds` **only when that
  array is non-empty**; an empty array means every season in the database —
  `src/lib/reports-query.ts:63-67`.
- **R2.** When the resolved season set is empty the function returns all five
  collections empty rather than throwing — `src/lib/reports-query.ts:69-71`.
- **R3.** *(implicit)* `loadReportsData` performs **no authorization of any
  kind**. It takes a list of season ids and returns their data. Every gate is
  above it, in the page or route that calls it —
  `src/lib/reports-query.ts:61-63`. This is the same shape as
  `computeEngagementForStudent` (domain 9 R64), and in this domain the payload
  is an organisation-wide student export rather than one score.
- **R4.** `ReportFilters.from` and `.to` narrow the attendance-trend session
  window and nothing else — `src/lib/reports-query.ts:75-83`.
- **R5.** **No caller ever passes `from` or `to`.** The three call sites pass
  `seasonIds` only — `src/app/mentor/reports/page.tsx:12`,
  `src/app/admin/season/[code]/reports/page.tsx:26`,
  `src/app/api/reports/export/route.ts:31`. The date window is dead code.
- **R6.** *(implicit)* There is no filter UI anywhere in this domain.
  `ReportsView` renders two export buttons and four cards, no controls —
  `src/components/reports/reports-view.tsx:33-44` — while its own empty state
  tells the reader to "Adjust the filters" — `:28`. The scope is fixed by
  which page you are on.
- **R7.** Only the attendance trend is date-bounded even in principle.
  Submission rates, engagement buckets, at-risk and `rawStudents` always cover
  the season's entire history — `src/lib/reports-query.ts:110-121`, `:134-141`.

### Attendance trend — the line chart

- **R8.** One point per `Session` in the resolved seasons with
  `startsAt <= now`, ordered by `startsAt` ascending —
  `src/lib/reports-query.ts:79-84`.
- **R9.** `pct = round(present / enrolled × 100)`, where `present` counts the
  session's attendance rows whose status is `PRESENT` **or** `LATE` —
  `src/lib/reports-query.ts:104-105`.
- **R10.** `enrolled` is the count of `SeasonEnrollment` rows with
  `status = ACTIVE` for that session's season **as of the request**, fetched
  with one `count` per season in a sequential `for … await` loop —
  `src/lib/reports-query.ts:95-101`, `:103`.
- **R11.** The denominator is therefore a present-tense number applied to a
  historical session: a session from the first week of a season is divided by
  today's active roster — `src/lib/reports-query.ts:99`, `:103`.
- **R12.** The numerator counts every attendance row on the session regardless
  of the student's enrolment status, so a student who has since withdrawn still
  contributes to `present` while being absent from `enrolled`. `pct` is **not
  clamped** and can exceed 100 — `src/lib/reports-query.ts:104-105`.
- **R13.** `pct` is `0`, not null, when the season has no active enrolments —
  `src/lib/reports-query.ts:105`.
- **R14.** This series **pools `PRESENT` with `LATE`** (R9) and never reads
  `lateMinutes`, so it is insensitive to domain 4's lateness defect in the same
  way `computeEngagementForStudent` is (domain 9 R67). It still inherits
  everything upstream of the status: a missing attendance row counts as an
  absence, and domain 4 owns whether a row exists at all.
- **R15.** The x-axis label is `format(startsAt, "MMM d")` — month and day,
  **no year, no season, no time** — `src/lib/reports-query.ts:106`. In the
  mentor's all-season scope, sessions from different years collapse onto the
  same label.
- **R16.** The point carries no season id, so the mentor's chart draws one line
  interleaving sessions from every season, each point divided by its own
  season's roster — `src/lib/reports-query.ts:102-107` rendered as a single
  series at `src/components/reports/reports-view.tsx:47-54`.
- **R17.** `_count: { select: { attendance: true } }` is selected on every
  session and **never read** — `src/lib/reports-query.ts:89`. The full
  `attendance` relation is loaded beside it (`:90-93`) and filtered in JS
  (`:104`), so the query pays for a count it discards and returns every
  attendance row in the scope to compute one integer per session.

### Submission completion — the bar chart

- **R18.** One bar per `Assignment` in scope with `deletedAt = null`, ordered
  by `createdAt` ascending — `src/lib/reports-query.ts:110-121`.
- **R19.** `submitted` is a filtered relation count: submissions on that
  assignment whose status is **not** `DRAFT` —
  `src/lib/reports-query.ts:119`, `:127`.
- **R20.** `expected` is the count of `ACTIVE` `SeasonEnrollment` rows in the
  assignment's season when `isAllGroups` is true, otherwise the count of
  `GroupStudent` rows in the assignment's target groups —
  `src/lib/reports-query.ts:124-126`.
- **R21.** `GroupStudent` is a global, singular membership
  (`studentUserId @unique`, `prisma/schema.prisma:329`), so the non-`isAllGroups`
  denominator means "students currently in these groups" — independent of
  enrolment status and of any season.
- **R22.** A targeted assignment with no `AssignmentTarget` rows produces
  `groupId: { in: [] }`, hence `expected = 0` and `submittedPct = 0` —
  `src/lib/reports-query.ts:126`, `:128`.
- **R23.** Numerator and denominator come from different populations, so
  `submitted` can exceed `expected` and `submittedPct` can exceed 100. Neither
  is clamped — `src/lib/reports-query.ts:119` versus `:124-126`, `:128`.
- **R24.** `expected` costs one query per assignment, issued concurrently via
  `Promise.all` — an N+1 in the number of assignments in scope —
  `src/lib/reports-query.ts:122-131`.
- **R25.** Due dates are ignored: an assignment created today with a due date
  next month is already counted against the cohort — `src/lib/reports-query.ts:110-121`
  has no date clause. This matches engagement (domain 9 R60).
- **R26.** This bar's arithmetic is **not** the same as engagement's
  `submissionPct` (domain 9 R57–R59) nor the workbook's "Submitted %" (R80).
  Three denominators, one concept — see §10 D2.

### Engagement banding and the at-risk list

- **R27.** One row is produced per `ACTIVE` `SeasonEnrollment` in scope, so a
  student enrolled in two in-scope seasons produces two rows —
  `src/lib/reports-query.ts:134-154` (domain 9 R77).
- **R28.** Each row's `attendancePct`, `submissionPct` and `score` are taken
  verbatim from `computeEngagementForStudent(studentUserId, seasonId)` —
  `src/lib/reports-query.ts:144`. The formulas are domain 9 R53–R62 and are not
  restated here; note in particular R55 (the denominator counts sessions from
  before the student enrolled) and R56 (a season with no past sessions scores
  everyone at 0 % attendance and therefore bands them all "At risk").
- **R29.** The call sits in a `for … await` loop — four **sequential** queries
  per enrolment (domain 9 R79, R81) — `src/lib/reports-query.ts:143-154`.
  For the mentor's unscoped view that is four queries per active enrolment in
  the entire organisation, in series.
- **R30.** Banding: `High` when `score >= 80`, `Medium` when `>= 60`, `Low`
  when `>= 40`, otherwise `At risk` — `src/lib/reports-query.ts:47-59`
  (domain 9 R75). The constant is named `AT_RISK_BUCKETS` although only its
  last entry concerns risk.
- **R31.** The four buckets are seeded in the order High, Medium, Low, At risk
  and emitted in insertion order, including zero-count buckets —
  `src/lib/reports-query.ts:155-168`.
- **R32.** Bucket counts count **enrolments, not students** (R27), so a
  two-season student is counted twice and may land in two different buckets.
  The pie's total therefore exceeds the headcount.
- **R33.** The at-risk list is `score < 60` — the *composite* — sorted
  ascending, capped at 10 — `src/lib/reports-query.ts:169-172` (domain 9 R74).
  This disagrees with the mentor dashboard's live definition (either component
  below 60, domain 9 R73) and with the dead absence-budget definition (domain 9
  R71–R72). A student at 55/55 is "Low" here and at-risk there.
- **R34.** *(implicit)* `loadReportsData` returns `rawStudents` — the full,
  uncapped, per-student list of names, emails, season titles and three scores —
  to **every** caller, including the two screens that render at most ten rows
  of it — `src/lib/reports-query.ts:44`, `:174`. In v1 that array never leaves
  the server; the confidentiality of the other rows is enforced by server
  rendering, not by a query. An endpoint returning `ReportsData` verbatim ships
  the whole cohort to the device.
- **R35.** *(implicit)* Each at-risk row links to
  `${studentDetailBase}/${studentUserId}` where the base is a string chosen by
  the page — `/mentor/students` or `/admin/students` —
  `src/components/reports/reports-view.tsx:86-88`,
  `src/app/mentor/reports/page.tsx:25`,
  `src/app/admin/season/[code]/reports/page.tsx:38`. Which detail surface the
  reader lands on is decided by a literal, not a check.
- **R36.** An at-risk row shows the student's `name`, falling back to their
  `email` when the name is null — `src/components/reports/reports-view.tsx:91`.
- **R37.** The whole report renders a single empty state when the attendance
  trend, the submission rates **and** `rawStudents` are all empty; any one of
  the three being non-empty renders all four cards —
  `src/components/reports/reports-view.tsx:23-31`.

### CSV export — `toCsv` and `/api/reports/export`

- **R38.** Columns, in order: `Student, Email, Season, Attendance %,
  Submission %, Score` — `src/lib/reports-query.ts:178`.
- **R39.** One line per row of `rawStudents` — one per `ACTIVE` enrolment in
  scope (R27) — in whatever order the enrolment query returned them. There is
  no `orderBy` — `src/lib/reports-query.ts:179-189`, `:134-141`.
- **R40.** Text cells are quoted with `JSON.stringify`, which is JSON escaping,
  not RFC 4180 CSV escaping: an embedded `"` is emitted as `\"` rather than
  `""`, and a backslash is doubled — `src/lib/reports-query.ts:181-183`.
- **R41.** Numeric cells are emitted bare, rows are joined with `\n` (LF, not
  CRLF), and no UTF-8 BOM is written — `src/lib/reports-query.ts:184-189`,
  `src/app/api/reports/export/route.ts:36`.
- **R42.** The filename is `engagement-<epoch-milliseconds>.csv`; it carries no
  season, no scope and no human-readable date —
  `src/app/api/reports/export/route.ts:37`.
- **R43.** An explicit `season` query parameter must parse as a finite number,
  otherwise the route returns 400 — `src/app/api/reports/export/route.ts:14-18`.
- **R44.** With an explicit `season`, SUPER and MENTOR pass unconditionally;
  any other role must hold that id in `seasonAdminIds`, else 403 —
  `src/app/api/reports/export/route.ts:19-22`.
- **R45.** Without a `season` parameter, SUPER and MENTOR get **every season in
  the database**, an ADMIN gets exactly their `seasonAdminIds`, and every other
  role is 403 — `src/app/api/reports/export/route.ts:23-29` (domain 9 R88).
- **R46.** The route checks that the requested season id is a number and in
  scope, but never that it names an existing or non-deleted season. An unknown
  id resolves to an empty season set (R1, R2) and returns a header-only CSV
  with HTTP 200 — `src/app/api/reports/export/route.ts:14-22` with
  `src/lib/reports-query.ts:63-71`.
- **R47.** The route is not under `/api/v1`, so no existing client contract
  requires parity — `src/app/api/reports/export/route.ts`.
- **R48.** There is no rate limit and no audit record. One unparameterised GET
  by a MENTOR returns every active student in the organisation with their
  email, season, two percentages and a composite score —
  `src/app/api/reports/export/route.ts:7-39`.

### The organisation roll-up — `loadSuperReports`

- **R49.** `loadSuperReports` takes **no arguments and applies no scope**; it
  always covers the whole database — `src/lib/super-reports-query.ts:29-30`.
- **R50.** *(implicit)* It performs no authorization. The only gate is
  `requireRole(user, ["SUPER"])` on the single page that calls it —
  `src/app/super/reports/page.tsx:19`, `:21`.
- **R51.** `totalStudents` counts `User` rows with `role = STUDENT`,
  `deletedAt = null` and `graduationYear = null` —
  `src/lib/super-reports-query.ts:31`. It is **not** an enrolment count: a
  student who has never been enrolled, or who was withdrawn from every season,
  is counted. It is labelled "Current students" —
  `src/app/super/reports/page.tsx:70`.
- **R52.** `totalAlumni` is the same population with `graduationYear` not null
  — `src/lib/super-reports-query.ts:32`. An alumnus is role `STUDENT` plus a
  graduation year (`src/lib/rbac.ts:20-22`), so R51 and R52 partition the
  non-deleted student table exactly.
- **R53.** Season rows cover every `Season` with `deletedAt = null`, ordered by
  `year` descending then `program` ascending —
  `src/lib/super-reports-query.ts:33-36`.
- **R54.** Per season, `activeCount` / `completedCount` / `droppedCount` tally
  `SeasonEnrollment.status` values `ACTIVE` / `COMPLETED` / `WITHDRAWN` —
  `src/lib/super-reports-query.ts:57-61`. The enum has exactly those three
  members (`prisma/schema.prisma:38-42`), so nothing is silently dropped;
  `droppedCount` is a display rename of `WITHDRAWN`.
- **R55.** That tally is computed in JS over **every enrolment row of every
  season**, loaded as `enrollments: { select: { status } }` —
  `src/lib/super-reports-query.ts:42`, `:57-61`. There is no aggregate and no
  bound.
- **R56.** `leaderCount` is the size of the distinct set of `GroupLeader.userId`
  across the season's groups, computed in JS from a nested fetch of every
  leader join row in every season —
  `src/lib/super-reports-query.ts:44`, `:62-65`, `:75`. A leader of two groups
  in one season counts once.
- **R57.** `alumniByYear` loads one row per alumnus (selecting only
  `graduationYear`), tallies them into a `Map` in JS, then sorts by year
  descending — `src/lib/super-reports-query.ts:47-50`, `:79-86`. There is no
  `groupBy`.
- **R58.** The tally skips a null `graduationYear` —
  `src/lib/super-reports-query.ts:81` — although the query's own `where`
  already excludes them (`:48`), so the guard is unreachable.
- **R59.** `activeSeasonCount` counts seasons whose `status = ACTIVE`, in JS,
  from the already-fetched list — `src/lib/super-reports-query.ts:91`.
- **R60.** The students-per-season pie drops seasons with `activeCount === 0`;
  the table below it does not — `src/app/super/reports/page.tsx:24-26` versus
  `:128`.
- **R61.** *(implicit)* `loadSuperReports` shares **no metric** with
  `loadReportsData`: no attendance, no submissions, no assignments, no
  engagement score, no per-student row and no season filter. It is a different
  report model, not a superset — `src/lib/super-reports-query.ts:20-26` versus
  `src/lib/reports-query.ts:39-45`. There is consequently **no cross-season
  engagement roll-up for SUPER anywhere in v1**; SUPER reaches
  `loadReportsData` only through `/admin/season/[code]/reports`, one season at a
  time (R109).
- **R62.** Each season row links to `/super/seasons/${seasonId}` — the integer
  id — `src/app/super/reports/page.tsx:37`. The route is
  `src/app/super/seasons/[code]/page.tsx`, which calls `loadSeasonByCode` and
  `notFound()`s when no season has that `code`
  (`src/lib/seasons-query.ts:7-8`, `:33`). Every link on this table 404s unless
  a season's `code` happens to be the decimal string of its own id. See §10 D13.

### The season workbook — `buildSeasonExportWorkbook`

- **R63.** The workbook has exactly three sheets, in order: `Attendance`,
  `Grades`, `Assignments` — `src/lib/season-export.ts:105`, `:129`, `:157`.
  `workbook.creator` is the literal `"JPC Space"` and `created` is the build
  time — `:101-102`.
- **R64.** Every sheet's first three columns are `Student`, `Email`, `Group`;
  the final column is a per-student percentage; the columns between are one per
  session / quiz / assignment — `src/lib/season-export.ts:106`, `:130`, `:158`.
- **R65.** Rows are the season's `ACTIVE` enrolments only, sorted by
  `name.localeCompare(name)` with no locale argument, so ordering across mixed
  scripts follows the server's default collation —
  `src/lib/season-export.ts:51-58`, `:59-66`.
- **R66.** The `Group` column is `SeasonEnrollment.group.name`, empty string
  when the enrolment has no group — `src/lib/season-export.ts:56`, `:64`. This
  is the *enrolment's* group, not the global `GroupStudent` membership that the
  submission denominator (R21) and engagement (domain 9 R59) use. The two can
  disagree for the same student.
- **R67.** Every sheet freezes row 1 and the first three columns, and fills the
  header row solid `FF0B2447` with bold white text —
  `src/lib/season-export.ts:23`, `:32-40`, `:125-126`, `:153-154`, `:177-178`.
  Column widths are fixed: 22 / 28 / 22 for the identity columns, then 16, 18
  or 20 per sheet — `:108`, `:132`, `:160`.
- **R68.** Session columns are every session in the season with
  `startsAt <= now`, ascending, headed `"<MMM d> · <title>"` — no year —
  `src/lib/season-export.ts:68-77`, `:106`.
- **R69.** An attendance cell is `"P"` for `PRESENT`, `"A"` for `ABSENT`, and
  for `LATE` the numeric `lateMinutes` — or the string `"L"` when
  `lateMinutes` is null. A student with no attendance row for that session gets
  an empty cell — `src/lib/season-export.ts:9-13`, `:117-120`.
- **R70.** **The `LATE` cell prints domain 4's defective number raw.**
  `lateMinutes` is measured from `checkInOpenAt` rather than
  `session.startsAt`, with no threshold applied (domain 4 R63, R64, D1), so
  this column reports how long after an admin pressed a button a student
  scanned. It is the only surface in the product where that number is exposed
  cell-by-cell rather than pooled into a `PRESENT|LATE` count, and it is
  exported to a spreadsheet where a reader will treat it as minutes late.
- **R71.** Because `LATE` yields a number and the other statuses yield strings,
  the session columns hold mixed cell types — `src/lib/season-export.ts:9-13`.
  A spreadsheet sorts, filters and charts such a column unpredictably.
- **R72.** `Attendance %` = `round(presentCount / sessions.length × 100)`,
  `presentCount` counting `PRESENT` or `LATE`; a session with no record for
  that student counts against them; 0 when the season has no past sessions —
  `src/lib/season-export.ts:116-122`.
- **R73.** R72 is **arithmetically identical** to engagement's `attendancePct`
  (domain 9 R54–R56) for the same student and season — same numerator statuses,
  same denominator of all past sessions in the season. The two agree, and both
  inherit domain 9 R55: the denominator includes sessions that ran before the
  student enrolled. This is the only pair of same-named metrics in the domain
  that does agree.
- **R74.** Quiz columns are every `Quiz` in the season ordered `createdAt`
  ascending, headed `"<title> (/<maxScore>)"` —
  `src/lib/season-export.ts:79-88`, `:130`. There is **no `publishedAt`
  filter**, so an unpublished ONLINE quiz (`prisma/schema.prisma:653-654`)
  becomes a column of blanks.
- **R75.** A grade cell is the raw `QuizGrade.score`; a null score or a missing
  grade row yields an empty cell — `src/lib/season-export.ts:141-149`.
- **R76.** `Average %` = `round(mean, over quizzes with maxScore > 0 and a
  non-null score, of score / maxScore × 100)`, and the empty string when
  nothing qualifies — `src/lib/season-export.ts:141-150`. It is an unweighted
  mean of percentages, not total-scored over total-available.
- **R77.** A quiz with `maxScore = 0` still prints its score in the cell but is
  excluded from the average — `src/lib/season-export.ts:143-149`.
- **R78.** Assignment columns are every `Assignment` in the season with
  `deletedAt = null`, ordered `createdAt` ascending —
  `src/lib/season-export.ts:90-98`, `:158`. **Group targeting is ignored**: an
  assignment aimed at one group becomes a column for every student in the
  season.
- **R79.** An assignment cell is the submission's status label — `Draft`,
  `Submitted`, `Reviewed`, `Returned` — and an em dash `"—"` when the student
  has no submission — `src/lib/season-export.ts:15-20`, `:168-173`.
- **R80.** `Submitted %` = `round(turnedIn / assignments.length × 100)`, where
  `turnedIn` counts `SUBMITTED`, `REVIEWED` or `RETURNED` —
  `src/lib/season-export.ts:21`, `:166-174`. The denominator is **every
  assignment in the season**, whereas engagement's `submissionPct` counts only
  assignments that are `isAllGroups` or target the student's group (domain 9
  R58). For any season containing a group-targeted assignment the two numbers
  differ, and both are labelled a submission percentage. See §10 D2.
- **R81.** The season is fetched with `findUniqueOrThrow` on `id` alone,
  **without `deletedAt: null`** — a soft-deleted season is still fully
  exportable — `src/lib/season-export.ts:46-49`. `loadReportsData` does filter
  it (R1).
- **R82.** A blank cell and an em dash both mean "no row found"; there is no
  distinction between "not applicable to this student" and "data missing" —
  `src/lib/season-export.ts:118`, `:143`, `:170`.
- **R83.** The workbook is materialised as one `Buffer`
  (`src/lib/season-export.ts:180`) and copied again into a `Uint8Array` by the
  route (`src/app/api/season/export/route.ts:25`) — two full in-memory copies
  of a students × (sessions + quizzes + assignments) matrix, with no streaming.
- **R84.** The download filename is `"<Season.code>-attendance-grades.xlsx"`,
  interpolated unescaped into the `Content-Disposition` header —
  `src/app/api/season/export/route.ts:29`. `Season.code` is an admin-set unique
  slug (`prisma/schema.prisma:244`).
- **R85.** The XLSX route requires a `season` parameter that parses as a finite
  number (400 otherwise), then allows SUPER, MENTOR, or a user holding that
  season id in `seasonAdminIds` — `src/app/api/season/export/route.ts:15-22`.
  **MENTOR passes for any season id**, so a mentor may pull any season's full
  workbook: every active student's name, email, group, per-session attendance,
  every quiz score and every assignment status.
- **R86.** *(implicit)* The only thing preventing that in v1 is that
  `/mentor/reports` does not pass `exportXlsxHref`, so the button is never
  rendered — `src/app/mentor/reports/page.tsx:22-26` versus
  `src/components/reports/reports-view.tsx:36-40`. The endpoint itself allows
  it (R85). This is the domain's clearest example of the implicit gate: the
  authorization is the absence of a button.
- **R87.** Both export routes call `getCurrentUserOrRedirect`, so an
  unauthenticated request is answered with a redirect rather than a 401 —
  `src/app/api/reports/export/route.ts:8`,
  `src/app/api/season/export/route.ts:11`.
- **R88.** Neither export is under `/api/v1`, neither is rate-limited, and
  neither records who exported what, when, or over which scope —
  `src/app/api/reports/export/route.ts:7-39`,
  `src/app/api/season/export/route.ts:10-32`.
- **R89.** The season workbook has **no N+1**: five queries total — season,
  enrolments, sessions with attendance, quizzes with grades, assignments with
  submissions — `src/lib/season-export.ts:46`, `:51`, `:68`, `:79`, `:90`. It
  is the best-behaved read in the domain and the shape the report queries
  should copy.

### Charts and colours

- **R90.** `chart-colors.ts` is a flat mirror of the CSS `@theme` hexes plus
  one ordered array. It holds **no semantics** — no status→colour map, no
  threshold→colour map, no named role for any value —
  `src/lib/chart-colors.ts:1-35`.
- **R91.** `categoricalPalette` is
  `[success-500, brandTeal-500, warning-500, error-500, brandNavy-500]` and is
  applied to pie slices **by array index modulo its length** —
  `src/lib/chart-colors.ts:29-35`, `src/components/ui/charts.tsx:192-194`.
- **R92.** *(implicit)* The engagement pie is therefore semantic **by
  coincidence**: R31's fixed bucket order (High, Medium, Low, At risk) aligns
  with green, teal, amber, red. Nothing declares that mapping. Re-ordering the
  `Map` seed at `src/lib/reports-query.ts:155-160` would silently recolour the
  chart and paint "High" red. **This ordering is the one thing in
  `chart-colors.ts` that must survive the React Native swap**, and it must
  survive as an explicit band→colour map, not as an index.
- **R93.** The same palette by the same index rule colours the SUPER page's
  seasons pie and its alumni-by-year pie, where green / amber / red carry no
  meaning at all and imply a severity that does not exist; a fifth slice wraps
  back to green — `src/app/super/reports/page.tsx:90-95`, `:111-116`,
  `src/components/ui/charts.tsx:193`.
- **R94.** Line charts are a fixed `brandTeal-700`, bars a fixed
  `brandTeal-500`, grid and axes `neutral-200` / `neutral-600`. There is no
  per-series colouring — `src/components/ui/charts.tsx:57-69`, `:84-87`,
  `:122-135`, `:145`.
- **R95.** Tooltips are the only theme-aware surface: they read
  `var(--color-card)`, `--color-foreground` and `--color-border` at runtime,
  while every other colour is a baked hex that does not respond to dark mode —
  `src/components/ui/charts.tsx:72-80` versus `:57-69`.
- **R96.** **Absence recorded.** The semantic attendance-status colours *do*
  exist in v1 — `PRESENT` → success, `ABSENT` → error, `LATE` → warning — but
  in `src/components/ui/attendance-pill.tsx:10-26` as Tailwind class strings,
  **not** in `chart-colors.ts`, and **no chart in v1 is coloured by attendance
  status**. `grep -rn "chartColors\.\|categoricalPalette" src` returns
  `src/components/ui/charts.tsx` only. Note the collision risk: `AttendancePill`
  reads green / red / amber for Present / Absent / Late, while
  `categoricalPalette` indices 0–2 are green / **teal** / amber — colouring an
  attendance chart from the palette by index would paint `ABSENT` teal.
- **R97.** `PieChartCard` labels every slice with its `name` and disables
  leader lines — `src/components/ui/charts.tsx:189-190`. With one slice per
  season (R60) the labels overlap on any narrow viewport.
- **R98.** All three chart cards default to a fixed pixel height of 240 inside
  a 100 %-width `ResponsiveContainer` — `src/components/ui/charts.tsx:27`,
  `:54`, `:119`, `:172`.
- **R99.** `ChartLegend` is exported and never used —
  `src/components/ui/charts.tsx:204-220`; `grep -rn "ChartLegend" src` matches
  only its definition. The pies rely on per-slice labels instead (R97).

### Time

- **R100.** Every "past" boundary in the domain is a bare server-side
  `new Date()` — `src/lib/reports-query.ts:82`, `src/lib/season-export.ts:69`,
  and via engagement `src/lib/engagement.ts:26-28`. There is no timezone
  handling anywhere in v1 (domain 9 R89).
- **R101.** Every date **label** is produced by `date-fns` `format` executing on
  the server, so a reader always sees the server's calendar day rather than
  their own — `src/lib/reports-query.ts:106`, `src/lib/season-export.ts:106`.
- **R102.** There is nothing in the schema to bucket by other than the raw
  instant: `Session.startsAt` is a bare `DateTime` with no zone column and
  `Season` carries no timezone field — `prisma/schema.prisma:363-390`,
  `:242-278`.

### Where the reports are reachable, and by whom

- **R103.** *(implicit)* `/admin/reports` is not a report. It is a redirect
  that picks the ADMIN's most recent non-deleted season by `startDate`
  descending and forwards to `/admin/season/<code>/reports` —
  `src/app/admin/reports/page.tsx:14-20`. An admin of several seasons can reach
  only the newest one through navigation.
- **R104.** An ADMIN with an empty `seasonAdminIds`, or whose seasons are all
  soft-deleted, is redirected to `/admin/dashboard` —
  `src/app/admin/reports/page.tsx:13`, `:19`.
- **R105.** *(implicit)* `/admin/season/[code]/reports` is linked from nowhere.
  `grep -rn "reports" src/app/admin src/app/super src/app/mentor src/components
  --include=*.tsx` returns only the mentor dashboard's quick link
  (`src/app/mentor/dashboard/page.tsx:224`) and the two nav icon maps, so the
  per-season report is reachable only via the R103 redirect or by typing the
  URL.
- **R106.** `/mentor/reports` is gated `requireRole(user, ["MENTOR"])` —
  `src/app/mentor/reports/page.tsx:10` — so **SUPER cannot open the
  cross-season engagement screen at all**, even though the CSV route hands
  SUPER exactly that data (R45).
- **R107.** `/super/reports` is gated `requireRole(user, ["SUPER"])` —
  `src/app/super/reports/page.tsx:19`.
- **R108.** `/admin/season/[code]/reports` is gated
  `requireRole(user, ["ADMIN", "SUPER"])` and then
  `canEditSeason(user, season.id)`, which is `isAdminOfSeason` and returns true
  for any SUPER regardless of `seasonAdminIds` —
  `src/app/admin/season/[code]/reports/page.tsx:21`, `:24`,
  `src/lib/auth/permissions.ts:41-43`, `src/lib/rbac.ts:28-30`.
- **R109.** *(implicit)* No LEADER surface exists in this domain: there is no
  leader reports page and no leader branch in either export route.
  `src/lib/navigation.ts` has a "Reports" entry for SUPER (`:46`), ADMIN
  (`:67`) and MENTOR (`:121`, `:126`) only — a leader's exclusion is by absence
  of a route, which is exactly the shape that gets lost in a port (compare
  domain 4's already-fixed leader attendance leak).
- **R110.** *(implicit)* No STUDENT surface exists. A student's own figures
  reach them only through domains 9 and 4, and in a different and disagreeing
  form (domain 9 R86–R87).

**Total: 110 rules, 12 of them marked `(implicit)`** — R3, R6, R34, R35, R50,
R61, R86, R92, R103, R105, R109, R110. Three of those carry the domain's
weight: **R3** (the query has no gate at all), **R34** (the whole cohort is
returned to a screen that renders ten rows) and **R86** (the mentor's XLSX
authorization is the absence of a button). A report endpoint that reproduces
R3 without adding the gate is a whole-organisation data export.

---

## 4. Authorization

`loadReportsData`, `loadSuperReports` and `buildSeasonExportWorkbook` are all
**ungated library functions** (R3, R50, and `season-export.ts:42-45` takes an
integer and returns everyone in that season). Every row below describes a gate
that lives in the page or route *above* those functions. In v2 they must move
into the endpoint, and — for the season-scoped ones — into the query's `where`
clause, not only into an `if`.

| Operation | Roles | Row-scoped condition | v1 citation |
|---|---|---|---|
| View cross-season engagement report | MENTOR **only** | none — all non-deleted seasons | `src/app/mentor/reports/page.tsx:10`, `:12` |
| View per-season engagement report | ADMIN, SUPER | `canEditSeason` → `isAdminOfSeason`; SUPER always true | `src/app/admin/season/[code]/reports/page.tsx:21`, `:24`; `src/lib/rbac.ts:28-30` |
| Reach the per-season report from navigation | ADMIN | redirect to the admin's newest season by `startDate` | `src/app/admin/reports/page.tsx:11-20` |
| View organisation roll-up | SUPER | none — whole database | `src/app/super/reports/page.tsx:19`, `:21` |
| Download engagement CSV, one season | SUPER, MENTOR, ADMIN | SUPER/MENTOR unconditional; other roles need the id in `seasonAdminIds` | `src/app/api/reports/export/route.ts:19-22` |
| Download engagement CSV, all seasons | SUPER, MENTOR | none — every season in the database | `src/app/api/reports/export/route.ts:23-24` |
| Download engagement CSV, admin's own seasons | ADMIN | implicit — `seasonIds = user.seasonAdminIds` becomes the query filter | `src/app/api/reports/export/route.ts:25-26` |
| Download engagement CSV, anyone else | — | 403 | `src/app/api/reports/export/route.ts:27-28` |
| Download season XLSX workbook | SUPER, MENTOR, ADMIN | SUPER/MENTOR **any season**; other roles need the id in `seasonAdminIds` | `src/app/api/season/export/route.ts:20-22` |
| Compute an engagement score for the report | — | **none** | `src/lib/engagement.ts:21-24` (domain 9 R64) |
| Load report data for arbitrary season ids | — | **none** | `src/lib/reports-query.ts:61-63` (R3) |
| Build a season workbook for an arbitrary season id | — | **none**, and not even a soft-delete check | `src/lib/season-export.ts:42-49` (R81) |

### Where v1 enforces nothing and relies on the UI

Five of these become real gates in v2, and every one of them is a bulk export
of student personal data:

1. **`loadReportsData` has no gate (R3).** Its `seasonWhere` is built from
   whatever integers the caller passed. In v1 the two pages and one route above
   it each check first. In v2 the season-id list arrives from a client. **The
   endpoint must intersect the requested season ids with the caller's
   permitted set and use the intersection as the query filter** — not check the
   request and then run the query on the request. A `403` on mismatch is
   acceptable for a single-season request; for a multi-season request,
   intersecting is safer than rejecting, because it cannot be turned into an
   existence oracle.
2. **`rawStudents` is returned to every caller (R34).** In v1 that array is
   consumed by a server component that renders ten rows of it. A v2 endpoint
   returning `ReportsData` verbatim would deliver the entire cohort's names,
   emails and scores to the device on every screen mount. **Split it:** the
   summary endpoint returns charts and the capped at-risk list; the full
   per-student list is a separate, separately-gated, paged endpoint (§7).
3. **The mentor's XLSX gate is a missing button (R86).** The endpoint already
   allows MENTOR for any season (R85). In v2 the screen is one route with role
   branches (`packages/shared/src/navigation.ts:132-138` puts `/reports` in the
   MENTOR nav), so "the button is not rendered for this role" is even weaker
   than it was. **Decide explicitly whether a mentor may export a season
   workbook** and encode the answer in the endpoint; do not port the button's
   absence.
4. **MENTOR is unscoped by design and that design is now a network call
   (R45, R48).** A mentor's remit is read-all-students (`src/lib/rbac.ts:53-55`),
   so an all-season engagement CSV is arguably intended. What is not intended is
   that it is unlogged, unlimited and one URL away. §10 D17.
5. **LEADER's exclusion is the absence of a route (R109).** The v2 tree is flat
   and role-driven; `/reports` exists as a file regardless of role and is
   hidden by `navFor`. The endpoint must refuse LEADER explicitly. Domain 4
   already found and fixed exactly this shape — a ported endpoint that trusted
   the caller's `groupLeaderIds` without checking the target.

`getCurrentUserOrRedirect` on both export routes (R87) also has to become a
real 401 in the v2 envelope; a redirect is not a usable answer for a mobile
client fetching a file.

---

## 5. Read surface

Everything in this domain is a read. There are five.

### `loadReportsData(filters)` — `src/lib/reports-query.ts:61-175`

Returns `{ attendanceTrend, submissionRates, engagementBuckets, atRisk,
rawStudents }`. Shape does **not** vary by role — the caller decides the scope
and how much to render (R34).

**Query cost, in the order they are issued:**

| # | Query | Bound |
|---|---|---|
| 1 | `season.findMany` over the scope | seasons in scope |
| 2 | `session.findMany` with the full `attendance` relation and an unused `_count` (R17) | **every attendance row in every past session in scope** |
| 3…3+S | `seasonEnrollment.count` — one per season, **sequential** (R10) | S seasons |
| 4 | `assignment.findMany` with targets and a filtered `_count` | assignments in scope |
| 5…5+A | one `count` per assignment, concurrent (R24) | A assignments |
| 6 | `seasonEnrollment.findMany` with the student's name and email | E active enrolments |
| 7…7+4E | `computeEngagementForStudent` — **four sequential queries per enrolment** (R29, domain 9 R79) | 4E, in series |

Total: `1 + 1 + S + 1 + A + 1 + 4E` round trips, of which `S + 4E` are strictly
sequential. For the mentor's unscoped view, `S` is every season ever and `E` is
every active enrolment in the organisation. This is the heaviest read in the
product and it is the one on the MENTOR tab bar
(`packages/shared/src/navigation.ts:137`).

**What should be an aggregate and is not:**

- The attendance trend is `COUNT(*) FILTER (WHERE status IN ('PRESENT','LATE'))
  GROUP BY sessionId` — a single `groupBy` on `Attendance`. v1 fetches every
  row and filters in JS (R17).
- The active-enrolment counts are one `groupBy` on `SeasonEnrollment` by
  `seasonId`. v1 loops (R10).
- The submission denominators are two `groupBy`s — one on `SeasonEnrollment`
  by season, one on `GroupStudent` by group — joined in memory. v1 issues one
  query per assignment (R24).
- Engagement collapses to two cohort-wide `groupBy`s, exactly as domain 9 §5
  prescribes and as `computeAtRiskStudents` already demonstrates
  (`src/lib/engagement.ts:203-212`). v1 issues 4E (R29).

A faithful port that keeps the shape would be `S + A + 4E + 4` round trips per
pull-to-refresh on a phone. The rewrite target is **four queries, none of them
per-row**.

### `loadSuperReports()` — `src/lib/super-reports-query.ts:29-95`

Returns `{ totalStudents, totalAlumni, activeSeasonCount, seasons[],
alumniByYear[] }`. No arguments, no scope, no role variation (R49).

Four queries issued concurrently (`:30`), but two of them are unbounded
row-fetches whose only purpose is a JS tally:

- `season.findMany` pulls `enrollments: { select: { status } }` and
  `groups: { leaders: { select: { userId } } }` for **every season** —
  i.e. every enrolment row and every group-leader row in the database (R55,
  R56).
- `user.findMany` pulls one row per alumnus to count them by year (R57).

Both are `groupBy`s. The two `count`s (R51, R52) are already correct.

The table renders every season (R53); the pie renders a subset (R60). Nothing
is paged.

### `buildSeasonExportWorkbook(seasonId)` — `src/lib/season-export.ts:42-182`

Five queries, no N+1 (R89). Returns a `Buffer` and the season `code`. It is the
one read here whose *query* shape is worth porting unchanged; its *memory*
shape is not (R83).

It returns more than any screen renders because it is not a screen — but note
that it also returns more than it needs: `quizzes.grades` and
`assignments.submissions` are fetched for every student in the season including
non-enrolled ones, then indexed by `studentUserId` and looked up per active
enrolment (`:110-112`, `:134-136`, `:162-164`).

### `computeEngagementForStudent` — domain 9's, called from here

`src/lib/reports-query.ts:144`. Four queries per call, no authorization, no
caching. Documented at domain 9 R79–R82 and §5.

### The two export routes

Both are reads with a binary body. `/api/reports/export` re-runs the entire
`loadReportsData` pipeline to use one of its five outputs (R39) — the four
chart datasets are computed and thrown away on every CSV download.

---

## 6. Write surface

**This domain performs no writes.** There is no action file, no `"use server"`
function, no `db.*.create`/`update`/`delete` in `reports-query.ts`,
`super-reports-query.ts`, `season-export.ts` or `chart-colors.ts`, and neither
export route mutates anything.

Two consequences worth stating because they will be assumed otherwise:

- **There is no export record.** Nothing is written when a workbook or CSV is
  produced (R88), so there is no answer to "who exported the cohort, and when".
  §10 D17.
- **There is nothing to make atomic.** The only non-atomicity risk in the
  domain is *read* skew: `loadReportsData` issues up to `4E + A + S + 3`
  queries outside any transaction, so a workbook or report built while an
  enrolment changes can contain a denominator from before the change and a
  numerator from after. In v1 this is invisible; in v2, where the same data
  will be pulled repeatedly by React Query, an intermittently-inconsistent
  total is a support ticket. Wrapping the report read in a single
  read-only transaction (or, better, collapsing it to four queries per §5) is
  the fix.

---

## 7. Proposed API

Envelope per `CLAUDE.md`: `{ data }` / `{ error: { code, message } }`.
**Nothing in this domain exists in `apps/backend/src/routes/`** — every row
below is **new**. Neither v1 export is under `/api/v1` (R47, R88), so there is
no contract to preserve and the shapes below are free to be better than v1's.

Three design decisions drive the table:

**(a) The summary and the cohort list are different endpoints.** v1 returns
both from one function and relies on server rendering to keep the cohort list
off the wire (R34). Splitting them makes the expensive, sensitive one
separately gated, paged, and absent from the screen's first paint.

**(b) The engagement report and the organisation roll-up stay separate.** They
share no metric (R61); merging them behind one `/reports` endpoint with a mode
flag would invent a relationship v1 does not have and make one gate serve two
very different scopes.

**(c) Exports are a synchronous authenticated binary stream, not a link.** The
mobile client must send an `Authorization` header, so the URL cannot be handed
to the system browser and a signed query-string URL is ruled out (it would put
a credential in a URL). See §10 D10.

| Method | Path | Status | Auth | Request | Response |
|---|---|---|---|---|---|
| GET | `/api/v1/reports/engagement` | **new** | MENTOR, SUPER; ADMIN intersected to `seasonAdminIds` | `?seasonId=` (repeatable, omit = permitted scope), `?from=`, `?to=`, `?tz=` | `{ scope, attendanceTrend[], submissionRates[], engagementBands[], atRisk[], cohortSize }` |
| GET | `/api/v1/reports/engagement/students` | **new** | same, **separately gated** | `?seasonId=`, `?band=`, `?cursor=`, `?limit=` (default 50, max 200) | `{ rows[], nextCursor }` — one row per active enrolment |
| GET | `/api/v1/reports/organisation` | **new** | SUPER only | — | `{ totalStudents, totalAlumni, activeSeasonCount, seasons[], alumniByYear[] }` |
| GET | `/api/v1/reports/engagement/export` | **new** | as the CSV rules (R44, R45) | `?seasonId=` repeatable, `?format=csv` | `text/csv` stream + `Content-Disposition`; errors are JSON envelope |
| GET | `/api/v1/seasons/:id/exports/workbook` | **new** | `isAdminOfSeason` from the **path** id; MENTOR per D6's decision | — | `application/vnd.openxmlformats-…sheet` stream + `Content-Disposition` |
| GET | `/api/v1/seasons/:id/exports/manifest` | **new** | same as the workbook | — | `{ filename, mimeType, sheets[], columnCounts, rowCount, estimatedBytes }` |

Notes on shape and where this deliberately diverges:

- **`seasonId` moves into the path for the workbook.** v1 takes it as a query
  parameter on a route that lives outside any season namespace
  (`src/app/api/season/export/route.ts:13`); a path parameter matches the
  existing `seasons.ts` router and makes the row-scoped gate the obvious one.
- **`?tz=` is new and required in effect.** Every bucketed figure in v1 is cut
  on the server's calendar day (R100, R101). The endpoint must take the
  caller's IANA zone and bucket in it, or return raw instants and let the
  client bucket. §10 D12 picks one.
- **`engagementBands` replaces `engagementBuckets`.** Same four counts, but
  each row carries an explicit `band` enum member rather than a display string,
  so the colour mapping can be declared instead of inferred from array position
  (R92).
- **`attendanceTrend` points carry `sessionId`, `seasonId` and the raw
  `startsAt` instant**, plus `presentCount` and `expectedCount` alongside
  `pct`. v1 returns a pre-formatted label and a percentage (R15), which makes
  the chart unfixable on the client and hides that the percentage can exceed
  100 (R12).
- **`submissionRates` rows carry `assignmentId` and a `targeting` discriminator**
  (`all_groups` | `targeted`), because the denominator means two different
  things (R20) and a reader currently cannot tell which they are looking at.
- **`cohortSize` is new** and is a headcount, not an enrolment count — the one
  number that lets a reader notice R32's double counting.
- **`/exports/manifest` is new** and exists for mobile: it lets the client show
  a size and a sheet list, and warn before a multi-megabyte download on a
  cellular connection, without building the workbook.
- **A binary response breaks the `{ data }` envelope by design.** State it in
  the route and in `src/docs/openapi.ts`: success is bytes plus
  `Content-Disposition`; **every error on that path is still the JSON
  envelope**, so the client can distinguish a 403 from a file.
- **`ENABLE_UPLOADS` does not apply.** `CLAUDE.md` is explicit that the flag
  gates `POST /api/v1/submissions/:publicId/files` only — "Only uploading is
  gated — reading and deleting recorded files still work." These endpoints
  produce a file from database rows and touch no `Storage` driver. Do not put
  them behind that flag, and do not let a reader assume they are already
  covered by it.
- **Rate-limit both export paths.** They are the two most expensive
  authenticated reads in the system and the two that return the most personal
  data per request (R48, R85). The login limiter's envelope
  (`too_many_requests` 429) already exists to copy.
- **Both export endpoints must write an audit row.** §10 D17.

---

## 8. Proposed shared contracts

New file `packages/shared/src/reports.ts`. Zod, per the convention in
`CLAUDE.md`; Wave B writes the code.

### Reuse, do not redefine

- `enrollmentStatusSchema`, `seasonStatusSchema`, `attendanceStatusSchema`,
  `submissionStatusSchema` from `packages/shared/src/enums.ts:5-18`.
- **The engagement score shape is domain 9's.** Domain 9 §8 proposes
  `engagementScoreSchema` and the at-risk row; this domain's per-student report
  row must be built from it (extended with `seasonId`/`seasonTitle`/`band`),
  not defined afresh. Two definitions of the same six fields is exactly how
  the two systems end up quoting different numbers.
- Season identity fields belong to domain 2's `season.ts`. The organisation
  report's season row references a season by `id` **and `code`** (R62 is the
  reason) but must not redefine `SeasonListItem`.

### New schemas — the engagement report

| Schema | Fields |
|---|---|
| `reportScopeSchema` | `seasonIds` (int array, may be empty = permitted scope), `from`/`to` (optional ISO datetime), `timezone` (IANA string) |
| `resolvedScopeSchema` | `seasonIds` actually used after intersection with the caller's permissions, `seasonTitles`, `truncated` (true when the request asked for more than it got) |
| `attendancePointSchema` | `sessionId`, `seasonId`, `startsAt` (ISO instant), `title`, `presentCount`, `expectedCount`, `pct` (int, may exceed 100 in v1 — see D3) |
| `submissionRateRowSchema` | `assignmentId`, `seasonId`, `title`, `targeting` (`"all_groups"` \| `"targeted"`), `submitted`, `expected`, `pct` |
| `engagementBandSchema` | `z.enum(["HIGH","MEDIUM","LOW","AT_RISK"])` — the four bands of R30, as enum members not display strings |
| `engagementBandCountSchema` | `band`, `count` |
| `engagementReportRowSchema` | domain 9's score fields plus `studentUserId`, `name` (nullable), `email`, `seasonId`, `seasonTitle`, `band` |
| `engagementSummarySchema` | `scope`, `attendanceTrend[]`, `submissionRates[]`, `engagementBands[]`, `atRisk[]` (capped), `cohortSize`, `enrollmentCount` |
| `engagementStudentPageSchema` | `rows[]`, `nextCursor` (nullable) |

### New schemas — the organisation roll-up

| Schema | Fields |
|---|---|
| `seasonEnrollmentCountSchema` | `seasonId`, `code`, `program`, `year`, `title`, `status` (reuse `seasonStatusSchema`), `activeCount`, `completedCount`, `withdrawnCount`, `leaderCount` |
| `alumniByYearRowSchema` | `year`, `count` |
| `organisationReportSchema` | `totalStudentsNotGraduated`, `totalAlumni`, `activeSeasonCount`, `seasons[]`, `alumniByYear[]` |

`withdrawnCount` renames v1's `droppedCount` to the enum member it actually
counts (R54); the display label stays "Dropped".
`totalStudentsNotGraduated` renames `totalStudents` for the reason in §10 D4 —
the field name must not claim more than R51 delivers.

### New schemas — exports

| Schema | Fields |
|---|---|
| `exportFormatSchema` | `z.enum(["csv","xlsx"])` |
| `exportManifestSchema` | `filename`, `mimeType`, `sheets` (name + column count + row count), `estimatedBytes`, `generatedAt`, `scopeDescription` |

The response body of an export is bytes, so there is no schema for it; the
manifest is what the client parses.

### Bare interfaces this domain converts to Zod

None of this domain's v1 interfaces exist in `packages/shared` yet, so there is
nothing to convert — but note that `packages/shared/src/season.ts:10`, `:21`,
`:28` are still bare `interface`s (`SeasonListItem`, `SeasonDetailGroup`,
`SeasonDetail`). The organisation report needs a season shape; if domain 2 has
not converted them by the time this lands, reference them by field rather than
importing a bare interface into a Zod-parsed response, and flag it to domain 2.

---

## 9. Screens

The v2 tree is flat and role-driven. Four v1 pages collapse into one
destination with role branches, exactly as `packages/shared/src/navigation.ts`
already assumes — `/reports` is in the sidebar and tabs for SUPER (`:57`),
ADMIN (`:78`) and MENTOR (`:132`, `:137`), and in neither for LEADER or
STUDENT.

| v1 page(s) | v2 route | Exists? | Roles | Notes |
|---|---|---|---|---|
| `/mentor/reports`, `/admin/season/[code]/reports`, `/admin/reports` (redirect), `/super/reports` | `/reports` | **placeholder** — `apps/mobile/app/(app)/reports.tsx` renders an `EmptyState` | SUPER, ADMIN, MENTOR | One destination. MENTOR branch = all-season engagement; ADMIN branch = engagement scoped to a season picker seeded from `seasonAdminIds` (replacing R103's redirect); SUPER branch = organisation roll-up **plus** a season picker into the engagement view, which v1 denies SUPER entirely (R106) |
| — (no v1 equivalent screen; v1 only exports it) | `/reports/students` | **no** | SUPER, ADMIN, MENTOR | The paged cohort table. v1 has no such screen — the ten-row at-risk card (R33) and the CSV are the only ways to see per-student rows. Needed so mobile users are not forced through a file download to read ten more rows |
| `/super/reports` season table rows → `/super/seasons/[code]` | `/seasons/[code]` | **no** | SUPER | Detail route absent from `apps/mobile/app/(app)/`. Flag to domain 2 — and fix R62's broken link while porting |
| At-risk row → `/{mentor,admin}/students/[id]` | `/students/[id]` | **no** | SUPER, ADMIN, MENTOR, LEADER | Detail route absent (only `students/index.tsx`, `students/alumni.tsx`, `students/dropped.tsx` exist). Flag to domain 6 |

**What the screen must drop or restructure at 375 px:**

- **The two-column chart grid** (`src/components/reports/reports-view.tsx:46`,
  `:64`) becomes a vertical stack. Four charts stacked is four screens of
  scrolling before the at-risk list — the list should come **first** on mobile,
  since it is the only actionable element.
- **The attendance trend line** has one point per past session with a
  `MMM d` label (R8, R15). A twelve-week season is ~12 points; the mentor's
  unscoped view is every session ever. On a phone this must be scoped to one
  season by default and paged or windowed by date — which is what R4's dead
  `from`/`to` parameters were for.
- **The submission bar chart** has one bar per assignment with the assignment
  title as the x label (R18). Titles are free text; they will not fit. Use a
  horizontal bar list with the title as a row label, not an axis.
- **The season table on the SUPER page** has six columns (`src/app/super/reports/page.tsx:32-60`).
  Six columns do not fit at 375 px. It becomes a card list: title + status as
  the header, the four counts as a compact row.
- **The seasons pie** (R60, R97) puts one labelled slice per season on a 240 px
  square. With more than four or five seasons it is unreadable and the labels
  overlap. Replace with a ranked bar list; keep the pie only for the four
  engagement bands, where the category count is fixed.

---

## 10. Open questions and divergences

### D1 — Every attendance-derived number here inherits domain 4's defect, and one of them exposes it raw

Domain 4 established that lateness is measured from `checkInOpenAt` — when an
admin pressed a button — rather than from `session.startsAt`, with no threshold
applied (domain 4 R63, R64, D1), and that the absence budget consumes those raw
minutes (domain 4 R88, D2). This domain's inheritance is not uniform and the
difference matters for what to fix first:

| Metric | Exposure |
|---|---|
| Attendance trend `pct` (R9) | **Pooled.** `PRESENT` and `LATE` are added together, so mis-classifying a punctual student as `LATE` does not move the number. Still depends on a row existing at all |
| Engagement `attendancePct` (domain 9 R54) | **Pooled**, identically (domain 9 R67) |
| Workbook `Attendance %` (R72) | **Pooled**, and arithmetically identical to the above (R73) |
| Workbook `LATE` cell (R69, R70) | **Raw.** The defective minute count is printed per student per session into a spreadsheet a human will read as "minutes late" |
| Anything budget-derived | Not rendered in this domain; domain 4 and domain 9 own those surfaces |

So the domain's *percentages* are insulated, and its *export* is not. That is
the worst possible split: the number an operator scrutinises cell-by-cell in
Excel is the unsound one, and the number they glance at on a chart is the sound
one.

*Recommendation:* the workbook's `LATE` cell must not ship as a bare integer in
v2 until domain 4 D1 is decided. Two options, in order: (i) if D1's
recommendation lands — measure from `session.startsAt` with a 15-minute grace —
the cell becomes meaningful and can stay a number; (ii) if it has not landed,
render `"L"` for every `LATE` regardless of `lateMinutes`, matching the null
fallback that already exists (R69), and add the minutes back when they mean
something. **Do not port the raw number and the fix separately** — an export
that changes meaning between releases without changing its column header is
worse than one that never had the column.

### D2 — "Submission %" is three different numbers with one name

| Where | Numerator | Denominator | Citation |
|---|---|---|---|
| Reports bar chart | submissions on the assignment with status ≠ `DRAFT`, **from any student** | active enrolments in the season (`isAllGroups`) or `GroupStudent` rows in the target groups | R19, R20 |
| Engagement / CSV `Submission %` | this student's assignments whose first submission is `SUBMITTED`/`REVIEWED`/`RETURNED` | assignments that are `isAllGroups` **or** target this student's group | domain 9 R57, R58 |
| Workbook `Submitted %` | this student's `SUBMITTED`/`REVIEWED`/`RETURNED` submissions | **every** assignment in the season, targeting ignored | R80, R78 |

For a season where every assignment is `isAllGroups`, the second and third
agree. Introduce one group-targeted assignment and they diverge for every
student — and both appear, unqualified, in files handed to the same people.
The first is a different unit entirely (per-assignment, not per-student) and
can exceed 100 % (R23).

This is the most consequential ambiguity in the domain, because it is the one
that will produce two different figures from two systems reading one database
during the transition.

*Recommendation:* **the targeted denominator wins** — an assignment a student
was never given must not count against them. That makes the workbook's
`Submitted %` change value at cutover, which is exactly the kind of change that
must be decided now and announced, not discovered. Give the workbook column an
explicit header (`Submitted % (assigned to student)`), and give the bar chart's
figure a distinct name (`Completion rate`) so it stops colliding with a
per-student percentage. **Decide before code is written.**

### D3 — The attendance trend's denominator is present-tense and the result is not clamped

`enrolled` is today's `ACTIVE` enrolment count applied to a session from any
point in the season's past (R10, R11), while the numerator counts every
attendance row on that session including students who have since withdrawn
(R12). A season that has lost students shows historic attendance above 100 %;
a season that has gained them shows it artificially low. Nothing clamps it, so
the line chart will draw above its axis.

*Recommendation:* compute the denominator per session as the number of
enrolments that existed at that session's date — `SeasonEnrollment.enrolledAt <=
session.startsAt` and (`droppedAt` is null or `> session.startsAt`); both
columns exist (`prisma/schema.prisma:346-348`), so this needs no migration.
Failing that, clamp at 100 and say so. **Do not port the unclamped
present-tense version** — a chart that exceeds its own axis destroys trust in
every other number on the page.

### D4 — "Current students" is not a count of current students

`totalStudents` counts every non-deleted `User` with `role = STUDENT` and no
`graduationYear` (R51) — including students never enrolled in anything and
students withdrawn from everything. The card is labelled "Current students"
(`src/app/super/reports/page.tsx:70`) and links to `/super/students`.

*Recommendation:* either rename the figure to what it counts
(`Student accounts`) or change the query to count distinct students with an
`ACTIVE` enrolment. **Renaming is the safer default** — changing the query
changes a headline number that someone has been quoting. §8 renames the field
`totalStudentsNotGraduated` so the contract cannot restate the wrong claim.

### D5 — "At risk" is defined three ways; reports uses the third

Cross-reference domain 9 D7 and R71–R76: the absence-budget definition is dead
code, the mentor dashboard tests each component against 60, and this domain
tests the composite against 60 (R33) while also banding everyone into four
buckets with an "At risk" band at `< 40` (R30). So `/reports` calls a student
at 45 "Low" and lists them nowhere, while `/mentor/dashboard` — reachable from
the same tab bar — calls a student at 65/55 at-risk.

*Recommendation:* one definition, owned by domain 9's contract, consumed here.
The band enum (§8 `engagementBandSchema`) is the natural home: `AT_RISK` is a
band, the at-risk list is "students in the `AT_RISK` band", and the dashboard
and the report render the same set. Whatever threshold is chosen, the two
screens must not be able to disagree.

### D6 — A report endpoint without a scope check is a whole-organisation export

This is the domain's version of the finding every sibling spec has hit, and it
is the highest-stakes instance of it: `loadReportsData` takes a list of season
ids and returns names, emails and engagement scores for every active student in
them, with **no gate at all** (R3). `loadSuperReports` returns the whole
organisation with no gate (R50). `buildSeasonExportWorkbook` returns a season's
entire attendance and grade history with no gate and no soft-delete check
(R81). In v1 all three are protected by which server component calls them.

Concretely, the shapes to get right in v2:

1. **Intersect, don't check-then-run.** `?seasonId=` arrives from a client.
   The permitted set comes from the token's `seasonAdminIds`, or "all" for
   SUPER/MENTOR. The query filter must be the intersection (§4).
2. **`rawStudents` is a separate endpoint** (R34). The summary must not carry
   the cohort.
3. **The mentor XLSX question must be answered, not inherited** (R85, R86).
   A mentor's remit is read-all-*students*; a season workbook is also every
   quiz score and every assignment status, which is nearer to a leader's remit
   than a mentor's. *Recommendation:* allow MENTOR the engagement CSV (v1 shows
   them that data on screen) and **refuse MENTOR the season workbook**,
   restoring in the endpoint what v1 achieved by not rendering a button.
4. **LEADER must be refused explicitly** (R109). Domain 4 already found a
   ported endpoint that trusted `groupLeaderIds` without checking the target;
   a leader-scoped report ("my group's engagement") is a reasonable future
   feature and must not arrive by accident as "the whole season, filtered on
   the client".

### D7 — The CSV is not RFC 4180 and Excel will not read it correctly

`toCsv` quotes with `JSON.stringify` (R40): a name containing `"` produces
`\"`, which no CSV parser accepts, and a backslash is doubled. Rows are joined
with bare LF (R41) and there is no UTF-8 BOM, so Excel on Windows decodes the
file as the system codepage and mangles every non-ASCII name — which, for this
organisation's roster, is most of them.

*Recommendation:* proper RFC 4180 quoting (double the quote character), CRLF
line endings, and a UTF-8 BOM. Better still: **make the engagement export an
XLSX too**, using the `exceljs` path that already exists and already handles
encoding, and drop CSV entirely. One export format, one code path, no encoding
question. If CSV must stay for a downstream tool, fix the quoting and the BOM
and add a test with a name containing a quote and a non-Latin script.

### D8 — Verified: the export this system produces is rejected by this system's own importer

Domain 16 D14 flagged it; confirmed here. Every export sheet's first column is
headed `"Student"` — `src/lib/season-export.ts:106`, `:130`, `:158` — and the
CSV's header row begins `Student,Email,…` — `src/lib/reports-query.ts:178`.
The student importer lower-cases each header cell and matches the **exact**
string `"name"`; `"Student"` lower-cases to `"student"`, which is not in the
alias table, so `nameCol` stays `-1` and the import throws
`'The file needs a header row with "name" and "email" columns.'` —
`src/lib/student-import.ts:96-107`. The `Email` header does match (`:99`).

The group importer is unaffected: it requires only `email` and `group`, both
present in the workbook's Attendance sheet, and treats the name column as
optional — `src/lib/group-import.ts:45-51`, `:64`.

So an operator who exports a season, edits it, and tries to re-import the
students gets an error message telling them their file lacks a column that is
plainly there under a different label.

*Recommendation:* the one-word fix (add `student` to the importer's name
aliases) belongs to domain 16, per its D14. **This domain's half is to decide
whether the export header changes too.** It should not: `"Student"` is the
right label for a human reading a spreadsheet, and a file produced for reading
should not be contorted into a file produced for machine round-tripping. If a
genuine round-trip is wanted, add it as a separate concern — an export mode, or
importer aliases — not by degrading the header. Record the decision so a future
reader does not "fix" the export instead.

### D9 — Query cost: what must not be ported faithfully

Per §5, a faithful port costs `S + A + 4E + 4` round trips per report load, of
which `S + 4E` are sequential (R10, R24, R29), plus two unbounded row-fetches
on the SUPER page (R55, R57) and one on the engagement page (R17). This is
already the slowest page in v1; under React Query — which refetches on mount,
on focus and on reconnect — it becomes the slowest page **repeatedly**, on a
cellular connection, for the role whose tab bar it sits in.

The complete list of things to replace with aggregates:

| v1 | Replace with |
|---|---|
| `session.findMany` + JS filter over every attendance row (R17) | one `groupBy` on `Attendance` by `sessionId` with a filtered count |
| Sequential `seasonEnrollment.count` per season (R10) | one `groupBy` on `SeasonEnrollment` by `seasonId` |
| One `count` per assignment (R24) | two `groupBy`s (enrolments by season, `GroupStudent` by group), joined in memory |
| 4 queries per enrolment (R29) | two cohort-wide `groupBy`s — the shape `computeAtRiskStudents` already uses (`src/lib/engagement.ts:203-212`) and domain 9 §5 prescribes |
| Every enrolment row fetched to tally three statuses (R55) | `groupBy` on `SeasonEnrollment` by `(seasonId, status)` |
| Every group-leader row fetched to count distinct users (R56) | `groupBy` / distinct count on `GroupLeader` joined to `Group` |
| Every alumnus row fetched to count by year (R57) | `groupBy` on `User` by `graduationYear` |
| Unused `_count: { attendance }` (R17) | delete |

Target: **four queries for the engagement report, three for the organisation
roll-up, five for the workbook (already correct — R89).** None per row.

Also delete on the way past: `ReportFilters.from`/`.to` are unreachable (R5) —
but note that a date window is precisely what the mobile screen needs (§9), so
this is a feature to *implement*, not to remove. `computeEngagementBulk` is
dead and would not have helped (domain 9 R82). `ChartLegend` is dead (R99).

### D10 — Delivering a file on a phone: the hard problem, and a recommendation

The migration design names this domain as one of the two worst fits for mobile:
*"reports/exports (render tables and charts, produce a spreadsheet, hand it to
the user) … They are possible; they are not cheap"*
(`docs/superpowers/specs/2026-08-21-full-migration-design.md:103-106`). The
charting half is D11. This is the file half.

**What v1 does and why none of it transfers.** Both exports are `<Link>`s to a
`GET` returning `Content-Disposition: attachment`
(`src/components/reports/reports-view.tsx:36-43`,
`src/app/api/season/export/route.ts:27-30`). The browser handles the rest:
credentials ride on a cookie, the file lands in the OS download folder, and the
user opens it from there. **React Native has none of those three things** — no
cookie-bearing navigation, no download folder, and no default handler for an
XLSX.

**Where the file must be generated: the server.** `exceljs` needs Node streams
and `Buffer`; it is not a React Native library. Generating a workbook on-device
would also mean shipping the entire cohort's data to the phone to reassemble
it, which is the opposite of D6's direction. **Keep `buildSeasonExportWorkbook`
server-side, unchanged in shape** (R89).

**Recommended delivery: `expo-file-system` download → `expo-sharing` share
sheet.**

1. `FileSystem.downloadAsync(url, fileUri, { headers: { Authorization } })`
   writes the response body straight to a file in the app's cache directory.
   The bytes never enter JS memory, which matters: a season workbook is a
   students × (sessions + quizzes + assignments) matrix (R83), and the
   alternative — fetching an `arraybuffer` and base64-encoding it to write —
   costs roughly 1.33× the file size in JS heap on top of the buffer itself.
   **Do not fetch-then-encode.**
2. `Sharing.isAvailableAsync()` then `Sharing.shareAsync(uri, { mimeType, UTI,
   dialogTitle })` hands the file to the OS share sheet. On iOS "Save to Files"
   is a share target, so the user can still land it in Files or iCloud; on
   Android the sheet offers Drive, Gmail, and any spreadsheet app installed.

**Its limits, all of which must be handled rather than discovered:**

- **`expo-sharing` is not available on every platform** (notably web).
  `isAvailableAsync()` must be checked and a fallback offered, not assumed.
- **iOS needs a `UTI` as well as a `mimeType`** — `org.openxmlformats.spreadsheetml.sheet`
  for XLSX, `public.comma-separated-values-text` for CSV — or the sheet offers
  the wrong apps or refuses the file.
- **The cache directory is not storage.** The OS may evict it under pressure.
  The file is a courier, not a record; delete it after the share sheet
  dismisses, and never present a list of "previous exports" backed by it.
- **Android's public Downloads folder is not writable directly.** Reaching it
  needs the Storage Access Framework and a directory the user picks *every
  time*, which is worse UX than the share sheet. The share sheet is the answer;
  do not build a "save to Downloads" button.
- **The auth token must travel as a header, never in the URL.** A signed
  query-string download URL opened in the system browser would work, and is
  forbidden — it puts a credential in a URL. This is why §7 makes the export a
  normal authenticated `GET` and the client does the download.
- **The access token is 900 s** (`CLAUDE.md`). A large workbook on a slow
  connection can outlive it. Refresh before starting the download, and treat a
  401 mid-download as retryable rather than as a permission failure.
- **There is no progress bar for free.** `downloadResumable` gives progress
  callbacks; a plain `downloadAsync` does not. For a workbook of unknown size
  the `/exports/manifest` endpoint (§7) supplies the estimate, and the
  resumable API supplies the progress. Use both.
- **The `expo-file-system` API changed.** Recent Expo SDKs ship a new
  `File`/`Directory` API with the previous one available as
  `expo-file-system/legacy`. Pick one deliberately and pin it — a half-migrated
  file layer is a class of bug that only appears on a real device.

**`ENABLE_UPLOADS=false` does not gate this.** The flag gates
`POST /api/v1/submissions/:publicId/files` only; `CLAUDE.md` states plainly
that "Only uploading is gated — reading and deleting recorded files still
work." Exports read database rows and produce bytes; they touch no `Storage`
driver and are outside the CMS migration entirely. Say so in the route comment,
because the obvious wrong assumption is that a flag named "uploads" covers all
file movement.

**What to do about the CSV specifically.** Given D7, the simplest coherent
outcome is a **single XLSX export path** with two scopes (engagement, season
workbook), one MIME type, one UTI, one share flow, and no encoding question.
That is less code than porting v1's two formats and produces files that open
correctly.

### D11 — Charts on React Native: what must survive the library swap

`recharts` (`package.json:51`) is DOM-based and cannot run in React Native. The
replacement must be `react-native-svg`-based. Practical candidates and their
costs:

| Option | Cost |
|---|---|
| `react-native-gifted-charts` | `react-native-svg` + `react-native-linear-gradient`; line/bar/pie all present; the closest drop-in for these four charts |
| `victory-native` (v41+) | Now Skia-based (`@shopify/react-native-skia`), not pure SVG — a heavier native dependency, better performance, more setup |
| `react-native-svg-charts` / `react-native-chart-kit` | Pure SVG, minimal, but thin maintenance; acceptable for four static charts, risky as the app grows |

*Recommendation:* `react-native-gifted-charts` for parity, because this domain
needs exactly one line, one bar and two pies with no interaction beyond a
tooltip. Revisit only if a later domain needs something Skia-shaped.

**What must survive the swap, and it is only one thing.** `chart-colors.ts`
holds **no semantics** (R90, R96): no status→colour map, no threshold→colour
map. The semantic attendance colours live in `attendance-pill.tsx:10-26` as
Tailwind classes and no chart uses them. So the hex values themselves are
restyling material, not contract — with a single exception:

**The engagement band → colour mapping is real and is currently accidental**
(R92). Green/teal/amber/red maps onto High/Medium/Low/At risk only because
`categoricalPalette`'s array order happens to line up with the `Map` seed order
in `reports-query.ts:155-160`. In v2 this must be an explicit
`Record<EngagementBand, string>` keyed off `engagementBandSchema`'s members
(§8), so that reordering the bands cannot repaint "High" red. Everything else —
line colour, bar colour, grid, axes (R94) — is free to be restyled to the
mobile design system.

Two further notes for the port:

- **Only the tooltip is theme-aware today** (R95). Every other colour is a
  baked hex that ignores dark mode. On mobile, where dark mode is the norm,
  every chart colour must come from the theme, not from a hex constant.
- **Do not carry `categoricalPalette` over as an index-keyed array** (R93). Its
  only correct use is the four fixed bands; applying it by index to seasons and
  graduation years implies a severity ranking that does not exist, and wraps
  back to green on the fifth item. Replace those two pies per §9.

### D12 — Timezones move every bucket boundary

Every "past session" cut and every date label in this domain is decided on the
server with a bare `new Date()` and a server-side `format` (R100, R101), and
there is no timezone column anywhere to consult (R102). In v1 this is invisible
because the server renders the page. In v2 the reader holds the device, and a
session at 21:00 local can fall on either side of a day boundary depending on
where the server is.

Everything in this domain is bucketed: the attendance trend is one point per
session labelled by day (R15), the workbook's session columns are labelled by
day (R68), and the `startsAt <= now` cut decides which sessions exist at all
(R8, R68).

*Recommendation:* **the API returns instants; the client formats.** Every
`attendancePoint` carries a raw ISO `startsAt` (§8) and the label is produced
on the device in the device's zone. For the workbook — which has no client-side
formatting step, since the server writes the header text — the export endpoint
takes the caller's IANA zone (`?tz=`) and formats headers in it. The
`startsAt <= now` boundary stays UTC-comparable and is therefore unaffected.
Add the year to every date label while doing this: `MMM d` alone is ambiguous
across seasons (R15, R68) and this is the moment to fix it.

Cross-domain: if domain 2 ever adds a season timezone, the report should prefer
it over the reader's, so that a cohort's numbers do not change depending on who
is looking. Flag, do not spec here.

### D13 — Every season link on the SUPER reports page is broken

`src/app/super/reports/page.tsx:37` links to `/super/seasons/${r.seasonId}` —
an integer. The route is `src/app/super/seasons/[code]/page.tsx`, which passes
the segment to `loadSeasonByCode` and calls `notFound()` when no season has
that `code` (`src/lib/seasons-query.ts:7-8`, `:33`). `Season.code` is a
human-readable slug (`prisma/schema.prisma:244`), so every row on this table
404s.

*Recommendation:* the roll-up's season row carries **both** `id` and `code`
(§8), and the screen navigates by `code`. Trivial, but record it — it is a live
bug in production v1 and a reviewer diffing v2 against v1 would otherwise
"preserve" it.

### D14 — A soft-deleted season is still fully exportable

`buildSeasonExportWorkbook` fetches the season with `findUniqueOrThrow` on `id`
alone (R81), while both report queries filter `deletedAt: null` (R1, R53).
Anyone who can name a deleted season's id — an admin who still holds it in
`seasonAdminIds`, or any SUPER or MENTOR — can export its complete attendance
and grade history.

*Recommendation:* add `deletedAt: null` to the workbook's season lookup and
return `not_found` otherwise. This is a one-line divergence from v1 that
nobody will miss, and leaving it out means the v2 endpoint ships a
data-retention hole that v1 only had by oversight.

### D15 — Two exports, no audit trail, no rate limit

Neither export writes anything (§6), neither is rate-limited, and neither
records who exported what (R48, R88). The unparameterised CSV returns every
active student in the organisation to any MENTOR or SUPER (R45); the workbook
returns a season's complete attendance and grade history to any MENTOR (R85).
Domain 9 D15 records the same gap for note reads and reaches the same
conclusion.

*Recommendation:* an `ExportAudit` row per successful export — actor, scope,
format, row count, timestamp — plus a rate limit on both paths reusing the
login limiter's `too_many_requests` envelope. **The table needs a migration,
which the shared-database freeze forbids while v1 runs**, so stage it: log to
the application log at cutover-blocking severity now, add the table at cutover.
Do not let "we cannot add a table yet" become "we shipped bulk personal-data
export with no record of it".

### D16 — Small, decided cheaply

- **Unpublished quizzes appear in the Grades sheet** (R74). `Quiz.publishedAt`
  is the draft marker for ONLINE quizzes and the export ignores it, so an
  unpublished quiz becomes a column of blanks that looks like a cohort-wide
  failure to sit it. *Recommendation:* exclude `publishedAt: null` ONLINE
  quizzes; `PAPER` quizzes have no publish concept and stay.
- **`maxScore = 0` quizzes print a score but are excluded from the average**
  (R77). *Recommendation:* exclude such a quiz's column entirely; a
  denominator of zero is not a grade.
- **Blank and `"—"` both mean "no row"** (R82). *Recommendation:* keep one
  symbol and put its meaning in a legend row; an operator currently cannot tell
  a missing attendance record from an inapplicable one.
- **Bucket counts count enrolments, not students** (R32). The pie's total does
  not equal the headcount. *Recommendation:* expose `cohortSize` (§7) beside
  the pie and label the pie "enrolments" when the scope spans more than one
  season.
- **The at-risk cap of 10 is invisible** (R33). A reader cannot tell whether
  ten is all of them. *Recommendation:* return the unclipped count and render
  "10 of 34".
- **The CSV filename is an epoch timestamp** (R42). *Recommendation:*
  `engagement-<season-code-or-"all">-<yyyy-MM-dd>.csv`; on mobile the filename
  is what the user sees in the share sheet and later in Files, and it is the
  only label the file will ever carry.
- **`Content-Disposition` interpolates `Season.code` unescaped** (R84). The
  value is an admin-set unique slug, so this is low risk, but the v2 route
  should percent-encode it rather than rely on slug validation two domains
  away.

### D17 — Should SUPER be able to see the engagement report at all?

v1 says no: `/mentor/reports` is `requireRole(["MENTOR"])` (R106), so the
cross-season engagement view is a mentor-only screen — while the CSV route
hands SUPER exactly that data with no season parameter (R45), and
`/admin/season/[code]/reports` lets SUPER see any single season's version of it
(R108). The restriction is therefore not a policy; it is an artefact of the
per-role page tree, and it survives only because nobody noticed SUPER could
download what they could not view.

In v2 there is one `/reports` route with role branches, and
`packages/shared/src/navigation.ts:57` already puts it in SUPER's sidebar.

*Recommendation:* give SUPER the engagement view with a season picker
(defaulting to all), i.e. resolve the inconsistency in favour of what the
export already permits rather than in favour of what the page happens to
render. Note this as a **deliberate divergence from v1**, not a port —
someone diffing the two will otherwise read it as a leak.
