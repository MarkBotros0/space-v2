# Plan 16 — Role Dashboards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every role's Home tab (`/dashboard`) shows that role's v1 dashboard, rebuilt on numbers the server computes once: SUPER sees organisation tiles, ADMIN and LEADER see a season (or their groups) at a glance, MENTOR sees the at-risk list and a real activity feed, STUDENT sees progress, budget, streak and what is due, ALUMNI sees a greeting and their history link. All six show the upcoming-events card.

**Architecture:** One new read, `GET /api/v1/me/dashboard`, returns a discriminated union on `variant` (`STUDENT`, `SEASON_STAFF`, `MENTOR`) for the figures no existing endpoint serves (spec 19 §7, D1). It is assembled by **calling** the server functions earlier plans define — `computeEngagementForSeasons` (Plan 12 → 11), `isAtRisk` (Plan 12), `visibleStudentIdsForQuiz` (Plan 8), the submission-queue scope (extracted here from `routes/submissions.ts`), `listAssignmentsForStudent`'s query plus `isLate`/`isOverdue` (`lib/queries/assignments.ts`), `isAssignmentOutstanding` (Plan 1), `orgDayKey`/`orgWallTime` (Plans 4/5) — never re-deriving them (ruling C4). Everything else is composed on the device from endpoints that already exist: `GET /reports/organisation` (Plan 15, SUPER tiles), `GET /reports/engagement` (Plan 15, mentor at-risk), `GET /events?upcoming=true&limit=4` (Plan 14, the card on all six), `GET /me/attendance` (Plan 11, budget and streak), `GET /notifications/unread-count` (Plan 13, the bell). On mobile, `app/(app)/dashboard.tsx` becomes a switch over six branch components in `src/components/dashboard/`; the bell (Plan 13) is kept; Plan 1's `AssignmentsSummary` is retired, because its counts now come from the server (spec D15). Mutations that move a dashboard number invalidate `queryKeys.dashboard.all` through one `MutationCache` hook keyed on a `meta` tag (spec §7 "Invalidation", D24).

**Tech Stack:** Express 5 + Prisma 7 (backend), Zod 3 contracts in `packages/shared`, Expo SDK 54 / expo-router 6 (typed routes), React Query 5, Zustand 5, RNTL 13 via `renderWithProviders`, Jest + supertest (integration suite against the shared staging DB, serial).

**Spec:** `docs/superpowers/specs/domains/19-dashboards.md` (whole document; §7 API, §8 contracts, §9 screens, §10 D1–D25 as accepted by ruling **X17**), `docs/superpowers/specs/domains/_DECISIONS.md` (**C2, C3, C4, C5, C6, C7, C8, C9**), the coordinator's rulings X5, X8, X10, X12, X13, X16, X17. v1 reference (read-only): `jpc-space/src/app/{super,admin,leader,mentor,alumni,student}/dashboard/page.tsx`, `jpc-space/src/components/events/upcoming-events-card.tsx`.

**Depends on** (execution order 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14 → 15 → **16** → 17 → 18; only plans before this one):

| Plan | What this plan consumes (exact names) |
|---|---|
| 1 | `isAssignmentOutstanding` (`packages/shared/src/assignment.ts`); `makeSession`/`makeUser`/`makeScopes` (`src/__tests__/helpers/session.ts`); `useSaveSubmission` (`src/hooks/use-submission.ts`); route `/assignment/[id]` (moved to `assignment/[id]/index.tsx` by Plan 5) |
| 2 | `useReviewSubmission` (`src/hooks/use-submission-queue.ts`), `useSaveAttendance` (`src/hooks/use-attendance.ts`); routes `/submission/[publicId]`, `/submissions`, `/groups` |
| 3 | `lib/org-time.ts`, `config.orgTimezone` (`ORG_TIMEZONE`, default `Africa/Cairo`) |
| 4 | `useCurrentSeasonId()` (`src/hooks/use-seasons.ts`, X8); `orgDayKey` (`lib/org-time.ts`); `formatDayKey` (`src/lib/format.ts`); `apiErrorMessage` (`src/lib/api-error.ts`); route `/session/[id]` (`session/[id]/index.tsx`) |
| 5 | `isoDaySchema`, `wallTimeSchema` (`packages/shared/src/org-time.ts`); `orgWallTime` (`lib/org-time.ts`); `useCreateAssignment`/`useUpdateAssignment`/`useDeleteAssignment` (`src/hooks/use-assignment-writes.ts`) |
| 6 | `useCreateSession`/`useUpdateSession`/`useDeleteSession` (`src/hooks/use-session-writes.ts`), `useSaveGroupAssignments`/`useDeleteGroup` (`src/hooks/use-group-admin.ts`) |
| 7 / 10 | route `/student/[id]` (directory form after Plan 10); `useCreateStudent`, `useGraduateStudent`, `useDeleteStudent`, `useDropEnrollment` (`src/hooks/use-students.ts`) |
| 8 | `visibleStudentIdsForQuiz(user, seasonId)` (`lib/quiz-scope.ts`), the per-kind graded counter inside `GET /quizzes` (extracted here), `useSubmitAttempt`/`useSaveQuizGrades`/`useGradeEssays`/`useReopenAttempt` (`src/hooks/use-quizzes.ts`), `useCreateQuiz`/`usePublishQuiz` (`src/hooks/use-quiz-authoring.ts`); route `/quizzes` |
| 11 | `useMyAttendance(seasonId)` (`src/hooks/use-self-service.ts`), `myAttendanceResponseSchema` (`budget.remainingPct`, `streak`); `loadMySeason` (`lib/queries/me.ts`); `useCheckIn` (`src/hooks/use-check-in.ts`); routes `/attendance`, `/history`, `/profile` |
| 12 | `computeEngagementForSeason(s)`, `EngagementCohortOptions` (`lib/queries/engagement.ts`); `engagementRowSchema`, `EngagementRow`, `EngagementScore`, `isAtRisk`, `AT_RISK_PCT` (`packages/shared/src/note.ts`) |
| 13 | `<NotificationBell />` (`src/components/NotificationBell.tsx`), `useUnreadCount` |
| 14 | `useUpcomingEvents(limit)`, `queryKeys.events.upcoming(limit)` (`src/hooks/use-events.ts`), `jpcEventListResponseSchema` `{ events, total }`, `JpcEventListItem` (`dayKey`, `endDayKey`, `time`, `url`); route `/event/[id]`; `useSubmitForumResponse` (`src/hooks/use-forum.ts`) |
| 15 | `computeEngagementForSeasons` (`lib/queries/engagement.ts`), `byScoreThenId` (`lib/queries/reports.ts`, exported here), `useOrganisationReport(enabled)`, `useEngagementReport(seasonId, enabled)` (`src/hooks/use-reports.ts`), `organisationReportSchema`, `engagementSummarySchema`, `EngagementReportRow`; quiz rows in `cleanupTestData` (Plan 15 Task 2) |

If any of these is missing when this plan starts, **stop** — do not stub it and do not work around a missing route with `as Href` (spec §9).

**Supersedes:** Plan 1 Task 5's dashboard card (`AssignmentsSummary`) and its two `dashboard.test.tsx` cases ("3 to do · 1 overdue", "pull-to-refresh refetches the assignments as well as the sessions"), plus Phase 0's five session-list cases in the same file, are **replaced** by Task 7 here. Plan 1's mutation-checklist item 6 now breaks the backend unit test in Task 2 instead of a dashboard screen test. Plan 13 Task 8's three bell cases are **kept**, re-pointed at a signed-in session (Task 7 Step 1). `isAssignmentOutstanding` itself stays exactly as Plan 1 wrote it.

---

## Global Constraints

- Relative imports only — no `@/` alias. Backend **value** imports from shared use the relative path (`../../../../packages/shared/src/index` from `src/lib/` and `src/routes/`, `../../../../../packages/shared/src/index` from `src/lib/queries/` and `src/__tests__/integration/`) — ruling X12. Never `@prisma/client`; never `process.env` outside `lib/config.ts`. No migrations, no schema edits (C1/X14).
- `requireAuth` is attached **per route** on `meRouter` (X5). Unknown `/api/v1/me/*` paths stay `not_found` 404.
- A GET never writes (C6). Every figure is derived once, server-side (C4). Wall-clock values (which day, what time) come from the server as `dayKey`/`time`/`dueOrgDay` in the org timezone and are rendered with `formatDayKey` — the device never formats an instant into a day or clock time (C2/X13). Relative labels ("2 hours ago") may be computed on the device from instants (spec D23).
- No query count in `GET /me/dashboard` may depend on cohort size, group count or season count (spec §7 "Query budget").
- Every response is **parsed** with a Zod schema from `@space/shared` — queries and mutations — never cast (X10). Each dashboard hook parses against **its own variant arm**, so a server that answers the wrong variant fails at the boundary.
- Dependent queries pass `enabled`; manual `refetch()` is guarded the same way. Map states to `LoadingState` / `ErrorState` (with `onRetry`) / `EmptyState`. Cards fail independently — a failed events read never blanks the budget tile.
- Tab screens pass `edges={["top", "left", "right"]}` to `Screen`. Tests use `renderWithProviders`; `jest.mock` factories close only over `mock*` consts; session fixtures come from `makeSession` (X11).
- Typed routes: never `as Href` / `as any`. This plan adds **no route file** (the branches are components), so `DETAIL_ROUTE_NAMES` and the placeholder list are untouched (X9).
- Integration suites hit the shared staging DB and are **run by the coordinator, serially** (`--runInBand`, `jest.integration.config.js` has `maxWorkers: 1`). Subagents run unit suites only.

**Execution shape:** Task 1 (contracts) first. Then Tasks 2 and 3 (backend pure figures; backend extractions) in parallel — they touch disjoint files. Task 4 (the endpoint) needs 1–3 and is finished by the coordinator, who runs its integration suite. Task 5 (mobile foundation) needs only Task 1 and may run beside Tasks 2–4. Task 6 needs 5; Task 7 needs 6; Task 8 needs 5 and edits nine hook files that no other task touches. Task 9 is the coordinator's closing gate.

---

## Divergence ledger — what changes value relative to v1, on purpose

| # | v1 behaviour (spec 19 rule) | v2 | Ruling |
|---|---|---|---|
| 1 | Admin/leader "attendance below 70 %" callout and 70/85 colour tiers (R30, R31, R41) | **v1, kept:** a red callout "Students below 70% attendance" lists the names of every roster student with `attendancePct < 70` (`attendanceTotal > 0`), hidden when none; the list comes from the server (no client threshold). The season/group average and every roster row's attendance are coloured red < 70, amber < 85, green otherwise by one shared `ATTENDANCE_TIERS` helper (`jpc-space/src/app/admin/dashboard/page.tsx:132-138`, `:270-276`, `:364-377`; leader identical, `leader/dashboard/page.tsx:90-134`). The `isAtRisk` preview card leaves the admin/leader Home *(v1 parity 2026-10-09: was "isAtRisk preview as the callout; neutral ring and rows, no tiers")* | v1 parity (R30, R31, R41) |
| 2 | Per-student attendance divides by every past session, can exceed 100 (R24–R26) | `attendancePct` from Plan 12's engagement row: denominator starts at `enrolledAt`, past sessions only. Each restored roster row (row 5) shows it, rendered "—" when `attendanceTotal = 0` (v1's `null`, `admin/dashboard/page.tsx:91-96`, `:270-276`) *(v1 parity 2026-10-09: was "per-student attendance shown only on at-risk rows")* | D3 (R25/R26 kept as fixes); R24 v1 parity |
| 3 | Per-student "pending" = season assignments − completed, untargeted (R27) | The restored roster column (row 5) shows "{n} pending" when > 0, with `n = submissionsExpected − submissionsCompleted` computed **server-side** from the engagement row (targeted, C5) (`admin/dashboard/page.tsx:281-285`) *(v1 parity 2026-10-09: was "Not shown; at-risk rows show N of M submitted")* | D4 (targeted formula kept, R27); column restored with R35 |
| 4 | Mean attendance counts "no data" as 0 % (R29) | `meanAttendancePct` over students with `attendanceTotal > 0`, else `null` ("—") | D5 |
| 5 | Full unpaged roster on Home (R35) | **v1, kept:** an "All students" card lists every roster student (name, attendance % with tiers, pending), sorted `attendancePct` asc with `attendanceTotal = 0` rows last (R28), each row → `/student/[id]`, "View all" → `/students` (leader `/groups`), empty "No students enrolled" (leader "No students yet") (`admin/dashboard/page.tsx:101-102`, `:225-293`). Rows come from the same `computeEngagementForSeasons` call (constant query count) *(v1 parity 2026-10-09: was "At-risk preview (≤ 10) + View all")* | v1 parity (R28, R35, R41) |
| 6 | Leader: `groups[0]`'s season, `GroupStudent` flattened (R37–R40) | Season from `useCurrentSeasonId`; groups from `staffScopeForSeason`; students = ACTIVE `SeasonEnrollment` in those groups; every group named | D7, C9 |
| 7 | Admin roster = `StudentProfile.activeSeasonId` (R20) | ACTIVE `SeasonEnrollment` | D8, C9 |
| 8 | Quiz "pending" never reads `QuizAttempt`, counts drafts (R32) | Plan 8's per-kind graded count over `visibleStudentIdsForQuiz`; unpublished ONLINE quizzes reported as `drafts` | D10 |
| 9 | Review counts = every submission in the season (R34) | The review queue's own scope, so the tile equals the queue it opens; a leader sees their students only | D11 |
| 10 | "Week N of M" counts sessions (R22, R68) | **v1, kept:** staff hero "{n} students · Week {held} of {total}" (week part omitted when total = 0) plus the "Progress" tile "{pct ?? 0}%" / "Week {held}/{total}"; student ring "{pct ?? 0}% done" with "Week N of M · K week(s) to go" or "· complete" (`admin/dashboard/page.tsx:55-56`, `:156`, `:171`; `student/dashboard/page.tsx:69-72`, `:132-159`). The count stays sessions held/total *(v1 parity 2026-10-09: was "Session N of M, K sessions to go, no Progress tile or %")* | v1 parity (R22, R68) |
| 11 | "Next session" hides the one in progress; "Watch recording" on future sessions (R21, R64, R74) | **v1, kept:** next = first session with `startsAt >= now`, `startsAt` asc (no `isInProgress`); the card reads "Next session" and shows day · time · "{durationMinutes} min" · location, a device-computed relative badge ("in 3 hours", D23), and "Watch recording" whenever `youtubeUrl` is set (`admin/dashboard/page.tsx:43-54`, `:183-222`; `student/dashboard/page.tsx:42-53`, `:200-243`) *(v1 parity 2026-10-09: was "in-progress session first; Happening now; Join stream only while live")* | v1 parity (R21, R64, R74) |
| 12 | Student "Absence budget" tile inverts on the page (R69) | `remainingPct` from `GET /me/attendance` (server value, C4), labelled **"Absence budget"** with caption "this season", → `/attendance` (`student/dashboard/page.tsx:85-87`, `:163-168`) *(v1 parity 2026-10-09: was "labelled Absence budget left")* | v1 parity (R69) |
| 13 | Outstanding = `PENDING \| DRAFT` (R66) — Plan 1 had briefly used `+ RETURNED` | `isAssignmentOutstanding`, server-side | D15, C5 |
| 14 | Late count re-derives `submittedAt > dueAt`, untargeted (R72) | **v1, kept:** banner "{n} assignment{s} submitted late this season" counting every turned-in submission of the student on any live season assignment with `isLate` (not only targeted rows) (`student/dashboard/page.tsx:57-68`, `:79-81`, `:190-197`); the comparison is the exported `isLate` *(v1 parity 2026-10-09: was "isLate over targeted assignments; You submitted N assignments late")* | v1 parity (R72) |
| 15 | Mentor "Flagged for follow-up", 4N fan-out, cohort = has `activeSeasonId` (R45–R49) | List from `GET /reports/engagement` (same cache as Reports; cohort fix R45 kept), `isAtRisk`, score asc, ≤ 10, **no "N of M" caption**; card titled "Flagged for follow-up" with an "All students" link → `/students`; empty "Nobody flagged" / "All students above the 60% engagement threshold." (`mentor/dashboard/page.tsx:57-64`, `:108-122`) *(v1 parity 2026-10-09: was "At risk heading, 10 of N caption, Nobody at risk copy")* | D17 (R45 kept); v1 parity (R47–R49) |
| 16 | Mentor activity: two unmerged lists, reviews by `submittedAt`, no filters, links to `/forbidden` (R51–R55) | **v1, kept:** two blocks — the 4 newest attendance marks (`markedAt` desc), then the 4 newest submissions with status SUBMITTED \| REVIEWED (`submittedAt` desc, RETURNED excluded), one row per submission labelled "received feedback on" (REVIEWED) or "submitted", timed at `submittedAt`; graduated students included (`mentor/dashboard/page.tsx:67-91`, `:161-210`). Kept as fixes: soft-deleted student/assignment/season rows stay out; links go to `/student/[id]` and `/submission/[publicId]` (R55) *(v1 parity 2026-10-09: was "one merged feed ≤ 8, reviews at reviewedAt, RETURNED in, graduated out")* | v1 parity (R51–R54); R55 fix |
| 17 | Events card renders nothing when empty; filter in host zone, in memory (R8–R10) | Server window + cap; **when no event qualifies the card renders nothing** (returns `null`, no heading) (`jpc-space/src/components/events/upcoming-events-card.tsx:30`); loading/error states stay (no v1 equivalent for a client fetch) *(v1 parity 2026-10-09: was "Server window + cap; EmptyState")* | D19; v1 parity (R10) |
| 18 | SUPER "Upcoming events" tile counts `date >= now` with no visibility (R15) | **v1, kept:** the tile is a separate server count `jpcEvent.count({ where: { date: { gte: now } } })` — all visibilities, no upper bound, no `endDate` — served as `upcomingEventCount` on `GET /reports/organisation`, no caption (`super/dashboard/page.tsx:18`, `:33-34`). The card below keeps its own window *(v1 parity 2026-10-09: was "total from the card's GET /events response; 12-month caption")* | v1 parity (R15) |
| 19 | SUPER "Students" label | **v1, kept:** label "Students" (value stays `totalStudentsNotGraduated`, same population, `super/dashboard/page.tsx:16`, `:30`); "Seasons" stays all non-deleted, any status (`seasons.length`) *(v1 parity 2026-10-09: was "Students (not graduated)")* | v1 parity (R13) |
| 20 | Alumni redirect to `/login`; greetings disagree on empty names (R58, R59) | `/me/dashboard` answers an alumnus 403. **Greetings as v1:** alumni "Welcome back, {first}" with `name.trim().split(/\s+/)[0]`, "there" only when the name is null; student "Hi, {first} 👋" with `name.split(" ")[0]` (`alumni/dashboard/page.tsx:21`, `:33`; `student/dashboard/page.tsx:88`, `:93-95`) *(v1 parity 2026-10-09: was "one firstName formatter, there on null and empty; Welcome back for students")* | D21; v1 parity (R59) |
| 21 | Student greeting "all caught up **this week**" while counting the season (R67) | **v1, kept:** "{n} assignment needs / assignments need your attention." else "You're all caught up this week." (trailing periods) (`student/dashboard/page.tsx:98-101`) *(v1 parity 2026-10-09: was "You're all caught up (no this week, no period)")* | v1 parity (R67) |

**Not taken (recorded):** spec D19's suggestion that MENTOR see SEASON events — Plan 14 deliberately kept v1 parity (`jpc-space/src/lib/jpc-events-query.ts:24-37`), so the mentor's card still lacks SEASON events. Open decision, below.

**Handed to Plan 18 (deferred by C1, named per spec §10 "Deferred to cutover"):** the C3 `lateMinutes` backfill and threshold column (they move the student's "Absence budget" tile *(v1 parity 2026-10-09: was "Absence budget left")*); the materialised engagement score (spec 09 D10), needed only if the cohort call is slow at real cohort sizes.

---

## Tasks

1. Shared contracts — `packages/shared/src/dashboard.ts`
2. Backend pure figures — `lib/dashboard-figures.ts`
3. Backend extractions — queue scope, graded counter, `byScoreThenId`, assignment states, session progress
4. `GET /api/v1/me/dashboard` — integration tests, assembly, route, OpenAPI
5. Mobile foundation — query keys, hooks, format helpers, branch picker, invalidation hook
6. Mobile shared cards — `UpcomingEventsCard`, `StatTile`, `DashboardFrame`
7. Mobile branches and the `/dashboard` switch
8. Tag every dashboard-moving mutation
9. Closing gate (coordinator)

---
### Task 1: Shared contracts — `packages/shared/src/dashboard.ts`

**Files:**
- Create: `packages/shared/src/dashboard.ts`
- Modify: `packages/shared/src/index.ts` (add `export * from "./dashboard";`)
- Test: `packages/shared/src/__tests__/dashboard.test.ts`

**Interfaces:**
- Consumes: `engagementRowSchema`, `EngagementScore` (`./note`, Plan 12); `studentAssignmentListItemSchema` (`./assignment`); `isoDaySchema`, `wallTimeSchema` (`./org-time`, Plan 5); `attendanceStatusSchema`, `seasonStatusSchema` (`./enums`).
- Produces (exact names later tasks import):
  - constants `DASHBOARD_AT_RISK_PREVIEW = 10`, `DUE_SOON_LIMIT = 3`, `UPCOMING_EVENTS_LIMIT = 4`, `RECENT_ACTIVITY_LIMIT = 8`
  - `meanAttendancePct(rows): number | null`
  - `seasonProgressSchema`/`SeasonProgress`, `dashboardSessionSchema`/`DashboardSession`, `dashboardSeasonSchema`, `staffCohortSummarySchema`, `reviewCountsSchema`, `quizRollupSchema`, `staffSeasonDashboardSchema`/`StaffSeasonDashboard`, `dashboardDueItemSchema`/`DashboardDueItem`, `studentAssignmentSummarySchema`, `studentDashboardSchema`/`StudentDashboard`, `activityItemSchema`/`ActivityItem`, `mentorDashboardSchema`/`MentorDashboard`, `dashboardSchema`/`Dashboard`

- [ ] **Step 1: Write the failing test**

> **v1 parity 2026-10-09:** Update this test to the reverted contracts in Step 2: the mentor fixture becomes `{ variant: "MENTOR", recentAttendance: [], recentSubmissions: [] }` and the cap test asserts each list refuses a 5th item (v1 shows 4 + 4, `jpc-space/src/app/mentor/dashboard/page.tsx:161-210`); add a case for `attendanceTier` (69 → low, 70 → mid, 84 → mid, 85 → ok, `admin/dashboard/page.tsx:132-138`, `:270-276`); `RECENT_ACTIVITY_LIMIT` becomes 4 per block.

```ts
// packages/shared/src/__tests__/dashboard.test.ts
import {
  DASHBOARD_AT_RISK_PREVIEW,
  DUE_SOON_LIMIT,
  RECENT_ACTIVITY_LIMIT,
  UPCOMING_EVENTS_LIMIT,
  dashboardSchema,
  meanAttendancePct,
  studentDashboardSchema,
} from "../index";

const score = (attendancePct: number, attendanceTotal: number) => ({ attendancePct, attendanceTotal });

describe("meanAttendancePct (spec 19 D5)", () => {
  it("averages only students who have had a session, rounded", () => {
    expect(meanAttendancePct([score(67, 3), score(33, 3), score(0, 3)])).toBe(33);
    // The 0 % row with attendanceTotal 0 is "no data", not "never came".
    expect(meanAttendancePct([score(80, 5), score(0, 0)])).toBe(80);
  });

  it("is null — rendered '—' — when nobody has had a session yet (v1 showed a red 0 %, R29)", () => {
    expect(meanAttendancePct([score(0, 0), score(0, 0)])).toBeNull();
    expect(meanAttendancePct([])).toBeNull();
  });
});

describe("limits (spec 19 §8)", () => {
  it("keeps v1's caps", () => {
    expect([DASHBOARD_AT_RISK_PREVIEW, DUE_SOON_LIMIT, UPCOMING_EVENTS_LIMIT, RECENT_ACTIVITY_LIMIT]).toEqual([10, 3, 4, 8]);
  });
});

const notEnrolled = { variant: "STUDENT", season: null, progress: null, nextSession: null, assignments: null };

describe("studentDashboardSchema (ruling C8 #2)", () => {
  it("accepts the not-enrolled shape (R63)", () => {
    expect(studentDashboardSchema.parse(notEnrolled)).toEqual(notEnrolled);
  });

  it("refuses any extra field, so a leaked cohort figure fails at the client", () => {
    expect(studentDashboardSchema.safeParse({ ...notEnrolled, cohort: { studentCount: 3 } }).success).toBe(false);
  });
});

describe("dashboardSchema", () => {
  it("discriminates on variant", () => {
    expect(dashboardSchema.parse({ variant: "MENTOR", recentActivity: [] }).variant).toBe("MENTOR");
    expect(dashboardSchema.safeParse({ variant: "ALUMNI" }).success).toBe(false);
  });

  it("caps the mentor feed at RECENT_ACTIVITY_LIMIT", () => {
    const item = {
      key: "att:1",
      kind: "attendance",
      at: "2099-05-01T09:00:00.000Z",
      studentUserId: 1,
      studentName: "Sara",
      subjectTitle: "Week 1",
      attendanceStatus: "PRESENT",
      submissionPublicId: null,
    };
    const nine = Array.from({ length: 9 }, (_, i) => ({ ...item, key: `att:${i}` }));
    expect(dashboardSchema.safeParse({ variant: "MENTOR", recentActivity: nine }).success).toBe(false);
  });
});
```

Run: `cd packages/shared && pnpm exec jest src/__tests__/dashboard.test.ts` → FAIL (exports missing).

- [ ] **Step 2: Write the module**

> **v1 parity 2026-10-09:** Edit the contracts (v2 `packages/shared/src/dashboard.ts:67`, `:82-84`, `:131`, mentor schema): (a) `dashboardSessionSchema` drops `isInProgress` — next session is the first `startsAt >= now` (R21/R64, `admin/dashboard/page.tsx:43-54`); (b) add `ATTENDANCE_TIERS = { low: 70, mid: 85 } as const` and `attendanceTier(pct): "low" | "mid" | "ok"` (R30); (c) `staffCohortSummarySchema` replaces `atRiskTotal`/`atRisk` with `roster: z.array({ studentUserId, name, attendancePct: int | null (null when attendanceTotal = 0), pending: int })` sorted `attendancePct` asc, nulls last, uncapped (R24, R27, R28, R35, `admin/dashboard/page.tsx:91-102`) and `belowThreshold: z.array({ studentUserId, name })` = roster rows with `attendancePct < 70` (R31, `:364-377`); `meanAttendancePct` stays (R29 KEEP-FIX); (d) `studentAssignmentSummarySchema.lateSubmittedCount` is documented as "turned-in submissions on every live season assignment, `isLate`", not targeted only (R72, `student/dashboard/page.tsx:57-68`); `overdueCount` is no longer rendered (R71) and may be dropped; (e) `activityItemSchema`/`recentActivity` are replaced by `recentAttendance: z.array(attendanceActivitySchema).max(4)` and `recentSubmissions: z.array(submissionActivitySchema).max(4)`, where a submission item carries `kind: "submitted" | "reviewed"` taken from its status (SUBMITTED / REVIEWED) and `at = submittedAt` (R53, R54, `mentor/dashboard/page.tsx:79-91`, `:195-207`).

```ts
// packages/shared/src/dashboard.ts
import { z } from "zod";

import { studentAssignmentListItemSchema } from "./assignment";
import { attendanceStatusSchema, seasonStatusSchema } from "./enums";
import { engagementRowSchema, type EngagementScore } from "./note";
import { isoDaySchema, wallTimeSchema } from "./org-time";

// ---------------------------------------------------------------------------
// Role dashboards — spec 19 §8. One definition of each figure (ruling C4); the
// server computes, the client renders. Engagement rows, the at-risk predicate,
// the budget and the events rows are REUSED from their owning domains, never
// restated here.
// ---------------------------------------------------------------------------

/** v1's cap on the at-risk list (spec 19 R47). */
export const DASHBOARD_AT_RISK_PREVIEW = 10;
/** v1's "due soon" length (R73). */
export const DUE_SOON_LIMIT = 3;
/** v1's events-card cap (R8). */
export const UPCOMING_EVENTS_LIMIT = 4;
/** The merged mentor feed (D18). */
export const RECENT_ACTIVITY_LIMIT = 8;

/**
 * Mean attendance over the students who have actually had a session.
 *
 * v1 counted a student with no past sessions as 0 %, so a season's first day
 * showed a red "0 %" (R29). Same guard as `isAtRisk` (spec 09 R56). Lives here
 * so the Reports screen can never grow a second definition; called only on the
 * server.
 */
export function meanAttendancePct(
  rows: readonly Pick<EngagementScore, "attendancePct" | "attendanceTotal">[],
): number | null {
  const counted = rows.filter((r) => r.attendanceTotal > 0);
  if (counted.length === 0) return null;
  return Math.round(counted.reduce((sum, r) => sum + r.attendancePct, 0) / counted.length);
}

const count = z.number().int().min(0);

/** Sessions, never weeks (D12): held = `startsAt <= now`. */
export const seasonProgressSchema = z
  .object({
    sessionsHeld: count,
    sessionsTotal: count,
    /** Null when the season has no sessions — there is no percentage of nothing. */
    pct: z.number().int().min(0).max(100).nullable(),
  })
  .strict();
export type SeasonProgress = z.infer<typeof seasonProgressSchema>;

/** The session in progress, else the next one (D13). Day and time are org wall-clock (X13). */
export const dashboardSessionSchema = z
  .object({
    id: z.number().int(),
    title: z.string(),
    /** The instant — for ordering and relative labels only. */
    startsAt: z.string(),
    dayKey: isoDaySchema,
    time: wallTimeSchema,
    durationMinutes: z.number().int(),
    location: z.string().nullable(),
    youtubeUrl: z.string().nullable(),
    /** Server-derived: `startsAt <= now < startsAt + durationMinutes`. */
    isInProgress: z.boolean(),
  })
  .strict();
export type DashboardSession = z.infer<typeof dashboardSessionSchema>;

export const dashboardSeasonSchema = z
  .object({ id: z.number().int(), code: z.string(), title: z.string(), status: seasonStatusSchema })
  .strict();
export type DashboardSeason = z.infer<typeof dashboardSeasonSchema>;

export const staffCohortSummarySchema = z
  .object({
    /** ACTIVE enrolments in scope (C9, D8). */
    studentCount: count,
    meanAttendancePct: z.number().int().min(0).max(100).nullable(),
    atRiskTotal: count,
    /** `isAtRisk` rows, score asc then studentUserId (Plan 15's `byScoreThenId`). */
    atRisk: z.array(engagementRowSchema).max(DASHBOARD_AT_RISK_PREVIEW),
  })
  .strict();
export type StaffCohortSummary = z.infer<typeof staffCohortSummarySchema>;

/** The review queue's own scope (D11): SUBMITTED, and REVIEWED | RETURNED. */
export const reviewCountsSchema = z.object({ pendingReview: count, reviewed: count }).strict();

/** D10: Plan 8's per-kind graded count; unpublished ONLINE quizzes are `drafts`, not pending. */
export const quizRollupSchema = z
  .object({ total: count, pending: count, fullyGraded: count, drafts: count })
  .strict();
export type QuizRollup = z.infer<typeof quizRollupSchema>;

export const staffSeasonDashboardSchema = z
  .object({
    variant: z.literal("SEASON_STAFF"),
    scope: z.enum(["season", "groups"]),
    season: dashboardSeasonSchema,
    /** Every group the leader leads in this season (D7); empty for `"season"`. */
    groups: z.array(z.object({ id: z.number().int(), name: z.string() }).strict()),
    progress: seasonProgressSchema,
    nextSession: dashboardSessionSchema.nullable(),
    cohort: staffCohortSummarySchema,
    submissions: reviewCountsSchema,
    quizzes: quizRollupSchema,
  })
  .strict();
export type StaffSeasonDashboard = z.infer<typeof staffSeasonDashboardSchema>;

/**
 * A due-soon row: the student list row plus its org-calendar due day, so the
 * label never formats `dueAt` in the device zone (X13). The student list
 * endpoint itself is unchanged (Plan 5 note 7).
 */
export const dashboardDueItemSchema = studentAssignmentListItemSchema.extend({
  dueOrgDay: isoDaySchema.nullable(),
});
export type DashboardDueItem = z.infer<typeof dashboardDueItemSchema>;

export const studentAssignmentSummarySchema = z
  .object({
    /** `isAssignmentOutstanding` (PENDING | DRAFT), targeted assignments only. */
    outstandingCount: count,
    /** Outstanding and `isOverdue`. */
    overdueCount: count,
    /** Turned-in rows with `isLate` (D16). */
    lateSubmittedCount: count,
    /** Outstanding only, `dueAt` asc nulls last, overdue included (R73). */
    dueSoon: z.array(dashboardDueItemSchema).max(DUE_SOON_LIMIT),
  })
  .strict();
export type StudentAssignmentSummary = z.infer<typeof studentAssignmentSummarySchema>;

/**
 * The student's own figures and nothing else (C8 #2). `.strict()` so a server
 * that starts leaking a cohort figure, another student, or `score` fails at
 * the client boundary. Every field is null together when `season` is null
 * (R63) — the server states "not enrolled", the client does not guess it.
 */
export const studentDashboardSchema = z
  .object({
    variant: z.literal("STUDENT"),
    season: dashboardSeasonSchema.nullable(),
    progress: seasonProgressSchema.nullable(),
    nextSession: dashboardSessionSchema.nullable(),
    assignments: studentAssignmentSummarySchema.nullable(),
  })
  .strict();
export type StudentDashboard = z.infer<typeof studentDashboardSchema>;

export const activityItemSchema = z
  .object({
    /** Stable list key: `att:<id>`, `sub:<id>`, `rev:<id>`. */
    key: z.string(),
    kind: z.enum(["attendance", "submitted", "reviewed"]),
    /** `markedAt`, `submittedAt` or `reviewedAt` respectively (D18). */
    at: z.string(),
    studentUserId: z.number().int(),
    studentName: z.string(),
    /** Session title for attendance, assignment title otherwise. */
    subjectTitle: z.string(),
    attendanceStatus: attendanceStatusSchema.nullable(),
    submissionPublicId: z.string().nullable(),
  })
  .strict();
export type ActivityItem = z.infer<typeof activityItemSchema>;

export const mentorDashboardSchema = z
  .object({
    variant: z.literal("MENTOR"),
    recentActivity: z.array(activityItemSchema).max(RECENT_ACTIVITY_LIMIT),
  })
  .strict();
export type MentorDashboard = z.infer<typeof mentorDashboardSchema>;

/** `GET /api/v1/me/dashboard`. An alumnus gets 403 and composes `/me` + `/events` instead. */
export const dashboardSchema = z.discriminatedUnion("variant", [
  staffSeasonDashboardSchema,
  studentDashboardSchema,
  mentorDashboardSchema,
]);
export type Dashboard = z.infer<typeof dashboardSchema>;
```

Append `export * from "./dashboard";` to `packages/shared/src/index.ts` (after the `note`, `org-time` and `assignment` exports that earlier plans added).

- [ ] **Step 3: Run**

Run: `cd packages/shared && pnpm exec jest src/__tests__/dashboard.test.ts` → PASS.
Run: `pnpm turbo typecheck --filter=@space/shared` → clean.

- [ ] **Step 4: Commit**

```bash
git add packages/shared && git commit -m "feat(shared): role-dashboard contracts — one mean, one variant union, student arm strict"
```

---

### Task 2: Backend pure figures — `lib/dashboard-figures.ts`

Pure functions only — no `db` import — so the arithmetic is unit-tested without
a database (`pnpm test:unit` needs none, CLAUDE.md).

**Files:**
- Create: `apps/backend/src/lib/dashboard-figures.ts`
- Test: `apps/backend/src/__tests__/dashboard-figures.test.ts`

**Interfaces:**
- Consumes: `isAssignmentOutstanding`, `AssignmentStudentStatus` (shared, relative path — X12); `type StudentAssignmentStateRow` from `./queries/assignments` (Task 3; a type-only import, erased at emit, so no `db` load).
- Produces: `isSessionInProgress(startsAt, durationMinutes, now)`, `progressFrom(held, total)`, `summarizeStudentAssignments(rows, limit)`, `isQuizDraft(q)`, `quizRollupFrom(quizzes, gradedBy, studentCount)`, `mergeActivity(rows, limit)`, and the types `ProgressFigures`, `StudentAssignmentSummaryRow`, `ActivityRow`.

> Task 2 and Task 3 run in parallel. Task 2's typecheck needs Task 3's
> `StudentAssignmentStateRow` export; if Task 3 has not landed, declare the
> same interface locally in the test-first step and replace the local copy
> with the import before committing. Do not commit a duplicate interface.

- [ ] **Step 1: Write the failing test**

> **v1 parity 2026-10-09:** Delete the `isSessionInProgress` cases (no caller once the next session is `startsAt >= now`, R21) and the `mergeActivity (D18)` cases (two unmerged blocks, R53). In the `summarizeStudentAssignments` case, `lateSubmittedCount` is no longer derived from the targeted rows: it takes a separate input (see Step 2).

```ts
// apps/backend/src/__tests__/dashboard-figures.test.ts
import {
  isQuizDraft,
  isSessionInProgress,
  mergeActivity,
  progressFrom,
  quizRollupFrom,
  summarizeStudentAssignments,
  type ActivityRow,
} from "../lib/dashboard-figures";
import type { StudentAssignmentStateRow } from "../lib/queries/assignments";

const now = new Date("2099-03-01T18:30:00.000Z");

describe("isSessionInProgress (spec 19 D13)", () => {
  const start = new Date("2099-03-01T18:00:00.000Z");
  it("is true from the start instant up to, not including, the end", () => {
    expect(isSessionInProgress(start, 60, new Date("2099-03-01T18:00:00.000Z"))).toBe(true);
    expect(isSessionInProgress(start, 60, now)).toBe(true);
    expect(isSessionInProgress(start, 60, new Date("2099-03-01T19:00:00.000Z"))).toBe(false);
  });
  it("is false before the start", () => {
    expect(isSessionInProgress(start, 60, new Date("2099-03-01T17:59:59.000Z"))).toBe(false);
  });
});

describe("progressFrom (D12 — sessions, never weeks)", () => {
  it("rounds held over total", () => {
    expect(progressFrom(3, 4)).toEqual({ sessionsHeld: 3, sessionsTotal: 4, pct: 75 });
    expect(progressFrom(1, 3)).toEqual({ sessionsHeld: 1, sessionsTotal: 3, pct: 33 });
  });
  it("has no percentage for a season with no sessions", () => {
    expect(progressFrom(0, 0)).toEqual({ sessionsHeld: 0, sessionsTotal: 0, pct: null });
  });
});

const row = (over: Partial<StudentAssignmentStateRow>): StudentAssignmentStateRow => ({
  id: 1,
  title: "A",
  dueAt: null,
  dueOrgDay: null,
  isOverdue: false,
  isLate: false,
  status: "PENDING",
  reviewedAt: null,
  ...over,
});

describe("summarizeStudentAssignments (C5, D15, D16, R73)", () => {
  const rows = [
    row({ id: 1, status: "PENDING", dueAt: new Date("2099-04-01T10:00:00.000Z"), dueOrgDay: "2099-04-01" }),
    row({ id: 2, status: "PENDING", isOverdue: true, dueAt: new Date("2020-01-05T10:00:00.000Z"), dueOrgDay: "2020-01-05" }),
    row({ id: 3, status: "DRAFT" }),
    // RETURNED is completed under C5: its overdue flag must not count.
    row({ id: 4, status: "RETURNED", isOverdue: true, isLate: true, dueAt: new Date("2020-01-01T10:00:00.000Z") }),
    row({ id: 5, status: "SUBMITTED", isLate: true }),
    row({ id: 6, status: "REVIEWED" }),
    row({ id: 7, status: "PENDING", dueAt: new Date("2099-02-01T10:00:00.000Z"), dueOrgDay: "2099-02-01" }),
  ];

  it("counts outstanding = PENDING | DRAFT, overdue among them, late among turned-in rows", () => {
    const s = summarizeStudentAssignments(rows, 3);
    expect(s.outstandingCount).toBe(4);
    expect(s.overdueCount).toBe(1);
    expect(s.lateSubmittedCount).toBe(2);
  });

  it("lists outstanding rows by dueAt ascending, nulls last, overdue included, capped", () => {
    const s = summarizeStudentAssignments(rows, 3);
    expect(s.dueSoon.map((r) => r.id)).toEqual([2, 7, 1]);
    expect(summarizeStudentAssignments(rows, 10).dueSoon.map((r) => r.id)).toEqual([2, 7, 1, 3]);
  });

  it("never ships isLate on a due-soon row (the wire row is the student list row)", () => {
    expect(summarizeStudentAssignments(rows, 3).dueSoon[0]).not.toHaveProperty("isLate");
  });
});

describe("quizRollupFrom (D10)", () => {
  const quizzes = [
    { id: 1, kind: "PAPER" as const, publishedAt: null },
    { id: 2, kind: "ONLINE" as const, publishedAt: new Date() },
    { id: 3, kind: "ONLINE" as const, publishedAt: null },
  ];
  it("treats only unpublished ONLINE quizzes as drafts", () => {
    expect(quizzes.map(isQuizDraft)).toEqual([false, false, true]);
  });
  it("is pending while fewer graded than students; drafts are separate", () => {
    expect(quizRollupFrom(quizzes, new Map([[1, 2], [2, 3]]), 3)).toEqual({
      total: 2,
      pending: 1,
      fullyGraded: 1,
      drafts: 1,
    });
  });
  it("is never pending with no students in scope", () => {
    expect(quizRollupFrom(quizzes, new Map(), 0)).toEqual({ total: 2, pending: 0, fullyGraded: 2, drafts: 1 });
  });
});

describe("mergeActivity (D18)", () => {
  const a = (key: string, at: string): ActivityRow => ({
    key,
    kind: "attendance",
    at: new Date(at),
    studentUserId: 1,
    studentName: "S",
    subjectTitle: "T",
    attendanceStatus: "PRESENT",
    submissionPublicId: null,
  });
  it("is one list, newest first, ties by key, capped", () => {
    const merged = mergeActivity(
      [a("att:1", "2099-01-01"), a("rev:1", "2099-01-03"), a("sub:2", "2099-01-02"), a("sub:1", "2099-01-02")],
      3,
    );
    expect(merged.map((r) => r.key)).toEqual(["rev:1", "sub:1", "sub:2"]);
  });
});
```

Run: `cd apps/backend && pnpm exec jest src/__tests__/dashboard-figures.test.ts` → FAIL (module missing).

- [ ] **Step 2: Write the module**

> **v1 parity 2026-10-09:** Remove `isSessionInProgress`, `mergeActivity` and `ActivityRow` (v2 `apps/backend/src/lib/dashboard-figures.ts:123-127`). `summarizeStudentAssignments` stops computing `lateSubmittedCount` from targeted rows (`dashboard-figures.ts:65`); the count comes from Task 4's untargeted query (R72, `jpc-space/src/app/student/dashboard/page.tsx:57-68`, `:79-81`). Add `rosterRowsFrom(rows)`: map each engagement row to `{ studentUserId, name, attendancePct: attendanceTotal > 0 ? attendancePct : null, pending: max(0, submissionsExpected − submissionsCompleted) }`, sort `attendancePct ?? 101` asc then `studentUserId` (R24, R27, R28; `admin/dashboard/page.tsx:91-102`).

```ts
// apps/backend/src/lib/dashboard-figures.ts
import {
  isAssignmentOutstanding,
} from "../../../../packages/shared/src/index";
import type { StudentAssignmentStateRow } from "./queries/assignments";

/*
 * The dashboard's own arithmetic (spec 19 §7) — pure, so it is unit-tested
 * without a database. Every predicate it needs is imported from its owner;
 * nothing here re-states "outstanding", "late" or "overdue" (ruling C4).
 */

/** D13: a session is in progress from its start instant until start + duration. */
export function isSessionInProgress(startsAt: Date, durationMinutes: number, now: Date): boolean {
  const start = startsAt.getTime();
  return start <= now.getTime() && now.getTime() < start + durationMinutes * 60_000;
}

export interface ProgressFigures {
  sessionsHeld: number;
  sessionsTotal: number;
  pct: number | null;
}

/** D12: sessions held over sessions scheduled. No percentage of an empty season. */
export function progressFrom(held: number, total: number): ProgressFigures {
  return {
    sessionsHeld: held,
    sessionsTotal: total,
    pct: total > 0 ? Math.round((held / total) * 100) : null,
  };
}

export type StudentAssignmentSummaryRow = Omit<StudentAssignmentStateRow, "isLate">;

export interface StudentAssignmentSummaryFigures {
  outstandingCount: number;
  overdueCount: number;
  lateSubmittedCount: number;
  dueSoon: StudentAssignmentSummaryRow[];
}

/**
 * The student's assignment figures over their TARGETED rows (the rows come
 * from `listAssignmentStatesForStudent`, which applies C9 targeting).
 *
 * Outstanding is the one shared predicate (C5, D15). Late is the row's
 * `isLate`, computed by the exported `isLate` in lib/queries/assignments.ts
 * (D16) — counted only on turned-in rows, so a DRAFT can never be "late".
 */
export function summarizeStudentAssignments(
  rows: readonly StudentAssignmentStateRow[],
  limit: number,
): StudentAssignmentSummaryFigures {
  const outstanding = rows.filter((r) => isAssignmentOutstanding(r.status));
  const dueKey = (r: StudentAssignmentStateRow) => (r.dueAt === null ? Number.POSITIVE_INFINITY : r.dueAt.getTime());
  const dueSoon = [...outstanding]
    .sort((a, b) => dueKey(a) - dueKey(b) || a.id - b.id)
    .slice(0, limit)
    .map(({ isLate: _isLate, ...wire }) => wire);

  return {
    outstandingCount: outstanding.length,
    overdueCount: outstanding.filter((r) => r.isOverdue).length,
    lateSubmittedCount: rows.filter((r) => !isAssignmentOutstanding(r.status) && r.isLate).length,
    dueSoon,
  };
}

export interface QuizForRollup {
  id: number;
  kind: "PAPER" | "ONLINE";
  publishedAt: Date | null;
}

/** An ONLINE quiz nobody can take yet. PAPER quizzes have no publish step. */
export function isQuizDraft(q: QuizForRollup): boolean {
  return q.kind === "ONLINE" && q.publishedAt === null;
}

export interface QuizRollupFigures {
  total: number;
  pending: number;
  fullyGraded: number;
  drafts: number;
}

/**
 * D10. `gradedBy` is Plan 8's per-kind graded count (`countGradedByQuiz`) over
 * the caller's `visibleStudentIdsForQuiz` population; `studentCount` is that
 * population's size — the same two numbers `GET /quizzes` serves per row.
 */
export function quizRollupFrom(
  quizzes: readonly QuizForRollup[],
  gradedBy: ReadonlyMap<number, number>,
  studentCount: number,
): QuizRollupFigures {
  const live = quizzes.filter((q) => !isQuizDraft(q));
  const pending = live.filter((q) => studentCount > 0 && (gradedBy.get(q.id) ?? 0) < studentCount).length;
  return {
    total: live.length,
    pending,
    fullyGraded: live.length - pending,
    drafts: quizzes.length - live.length,
  };
}

export interface ActivityRow {
  key: string;
  kind: "attendance" | "submitted" | "reviewed";
  at: Date;
  studentUserId: number;
  studentName: string;
  subjectTitle: string;
  attendanceStatus: "PRESENT" | "ABSENT" | "LATE" | null;
  submissionPublicId: string | null;
}

/**
 * D18: one feed, newest first. v1 rendered four attendance rows then four
 * submission rows, so its "recent activity" was not in time order (R53).
 */
export function mergeActivity(rows: readonly ActivityRow[], limit: number): ActivityRow[] {
  return [...rows]
    .sort((a, b) => b.at.getTime() - a.at.getTime() || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .slice(0, limit);
}
```

- [ ] **Step 3: Run**

Run: `cd apps/backend && pnpm exec jest src/__tests__/dashboard-figures.test.ts` → PASS.
Run: `pnpm turbo lint typecheck --filter=@space/backend` → clean (after Task 3's `StudentAssignmentStateRow` exists).

- [ ] **Step 4: Commit**

```bash
git add apps/backend && git commit -m "feat(backend): pure dashboard figures — progress, in-progress, assignment summary, quiz roll-up, merged feed"
```

---

### Task 3: Backend extractions — one definition each, reused by the dashboard

Five behaviour-preserving moves, so the dashboard **calls** the code its
neighbours already run instead of copying it (spec 19 §7 "reuse, never
re-derive"; D10, D11). Each is proven by the existing suite of the code it
moves staying green — no new assertion is needed for a pure move, and Task 4's
integration tests then pin the dashboard's use of each.

**Files:**
- Modify: `apps/backend/src/lib/permissions.ts` (add `submissionQueueScopeFor`)
- Modify: `apps/backend/src/routes/submissions.ts` (queue `GET /` calls it)
- Modify: `apps/backend/src/lib/quiz-scope.ts` (Plan 8 — add `countGradedByQuiz`)
- Modify: `apps/backend/src/routes/quizzes.ts` (Plan 8's staff list calls it)
- Modify: `apps/backend/src/lib/queries/reports.ts` (Plan 15 — export `byScoreThenId`)
- Modify: `apps/backend/src/lib/queries/assignments.ts` (add `listAssignmentStatesForStudent`; `listAssignmentsForStudent` delegates)
- Modify: `apps/backend/src/lib/queries/sessions.ts` (add `loadSeasonProgress`, `loadCurrentOrNextSession`)
- Modify: `apps/backend/src/lib/queries/me.ts` (Plan 11's `loadMySeason` uses `loadSeasonProgress`)

**Interfaces:**
- Consumes: `isSuper`, `isMentor` (`lib/rbac.ts`); `isLate`, `isOverdue`, `orgDayKey`; `progressFrom`, `isSessionInProgress` (Task 2).
- Produces:
  - `submissionQueueScopeFor(user: SessionUser): Promise<Prisma.SubmissionWhereInput | null>` — `null` = nothing in the queue
  - `countGradedByQuiz(quizzes: { id: number; kind: QuizKind }[], studentIds: number[]): Promise<Map<number, number>>`
  - `byScoreThenId(a: ScoreOrderKey, b: ScoreOrderKey): number`, `ScoreOrderKey`
  - `StudentAssignmentStateRow` (= `StudentAssignmentRow` + `dueOrgDay`, `isLate`), `listAssignmentStatesForStudent(studentUserId, seasonId, now?)`
  - `loadSeasonProgress(seasonId, now): Promise<ProgressFigures>`, `CurrentOrNextSession`, `loadCurrentOrNextSession(seasonId, now): Promise<CurrentOrNextSession | null>`

- [ ] **Step 1: The review-queue scope (D11)**

Append to `apps/backend/src/lib/permissions.ts` (add `import type { Prisma } from "../generated/prisma/client";` and `isMentor` to the existing `./rbac` import):

```ts
/**
 * Whose submissions sit in this caller's review queue.
 *
 * Extracted verbatim from `GET /api/v1/submissions` so the dashboard's
 * "pending review" / "reviewed" counts are computed over exactly the rows the
 * tile opens (spec 19 D11). A second hand-written scope would let the count
 * and the queue disagree.
 *
 * A LEADER's scope cannot be one Prisma filter: the constraint is "the
 * student's enrolment *in this assignment's season* names a group I lead",
 * which relates two branches of the query. The pairs are resolved first and
 * expanded into an OR, bounded by the leader's own roster (C9).
 *
 * Returns null when the queue is empty by construction (a STUDENT, or a leader
 * with no enrolments in their groups).
 */
export async function submissionQueueScopeFor(
  user: SessionUser,
): Promise<Prisma.SubmissionWhereInput | null> {
  if (isSuper(user) || isMentor(user)) return {};
  if (user.role === "ADMIN") return { assignment: { seasonId: { in: user.seasonAdminIds } } };
  if (user.role !== "LEADER") return null;

  const groups = await db.group.findMany({
    where: { id: { in: user.groupLeaderIds } },
    select: { id: true },
  });
  const enrollments = await db.seasonEnrollment.findMany({
    where: { groupId: { in: groups.map((g) => g.id) } },
    select: { studentUserId: true, seasonId: true },
  });
  if (enrollments.length === 0) return null;
  return {
    OR: enrollments.map((e) => ({
      studentUserId: e.studentUserId,
      assignment: { seasonId: e.seasonId },
    })),
  };
}
```

In `apps/backend/src/routes/submissions.ts`, `submissionsRouter.get("/", …)`:
replace the whole block from `let scope: Prisma.SubmissionWhereInput | null = null;`
through the closing `}` of the `else if (user.role === "LEADER") { … }` branch with

```ts
  const scope = await submissionQueueScopeFor(user);
```

and add `submissionQueueScopeFor` to the `../lib/permissions` import. Keep the
STUDENT 403 above it and the `if (scope === null) return apiOk(res, { items: [], nextCursor: null });`
line below it unchanged. Remove `isMentor`/`isSuper` from the `../lib/rbac`
import only if nothing else in the file still uses them (`pnpm turbo lint` will say).

- [ ] **Step 2: Plan 8's graded counter, exported (D10)**

Append to `apps/backend/src/lib/quiz-scope.ts` (add `import type { QuizKind } from "../generated/prisma/enums";`):

```ts
/**
 * How many of `studentIds` are graded on each quiz — THE definition of
 * "graded" (ruling C4, spec 12 D10), moved here from `GET /quizzes` so the
 * dashboard's quiz roll-up uses it instead of a copy (spec 19 D10).
 *
 * PAPER: a QuizGrade row with a real score. ONLINE: an attempt that reached
 * GRADED. v1's dashboards never consulted QuizAttempt, so every ONLINE quiz
 * read as permanently pending (spec 12 R114). Two groupBys, whatever the
 * number of quizzes or students.
 */
export async function countGradedByQuiz(
  quizzes: readonly { id: number; kind: QuizKind }[],
  studentIds: readonly number[],
): Promise<Map<number, number>> {
  if (quizzes.length === 0 || studentIds.length === 0) return new Map();
  const quizIds = quizzes.map((q) => q.id);
  const [paperGraded, onlineGraded] = await Promise.all([
    db.quizGrade.groupBy({
      by: ["quizId"],
      where: { quizId: { in: quizIds }, studentUserId: { in: [...studentIds] }, score: { not: null } },
      _count: { _all: true },
    }),
    db.quizAttempt.groupBy({
      by: ["quizId"],
      where: { quizId: { in: quizIds }, studentUserId: { in: [...studentIds] }, status: "GRADED" },
      _count: { _all: true },
    }),
  ]);
  const paperBy = new Map(paperGraded.map((g) => [g.quizId, g._count._all]));
  const onlineBy = new Map(onlineGraded.map((g) => [g.quizId, g._count._all]));
  return new Map(
    quizzes.map((q) => [q.id, (q.kind === "PAPER" ? paperBy.get(q.id) : onlineBy.get(q.id)) ?? 0]),
  );
}
```

(Use the same `_count` shape Plan 8 settled on — Plan 8 Task 2 notes that the
generated client may want `_count: true`; match whatever `routes/quizzes.ts`
compiles with today.)

In `apps/backend/src/routes/quizzes.ts`'s staff list, replace the block from
`const [paperGraded, onlineGraded] = await Promise.all([` through
`const onlineBy = new Map(…);` with

```ts
  const gradedBy = await countGradedByQuiz(page, studentIds);
```

change the row field to `gradedCount: gradedBy.get(q.id) ?? 0,`, delete the
now-unused `const quizIds = page.map((q) => q.id);` if nothing else reads it,
and import `countGradedByQuiz` beside `visibleStudentIdsForQuiz` from
`../lib/quiz-scope`.

- [ ] **Step 3: Plan 15's at-risk order, exported**

In `apps/backend/src/lib/queries/reports.ts`, replace

```ts
/** score ascending, then studentUserId, then seasonId — total and stable. */
function byScoreThenId(a: ScoredReportRow, b: ScoredReportRow): number {
```

with

```ts
/** The fields the at-risk order reads — satisfied by report rows and EngagementRow alike. */
export interface ScoreOrderKey {
  score: number;
  studentUserId: number;
  seasonId: number;
}

/**
 * score ascending, then studentUserId, then seasonId — total and stable.
 * Exported so the dashboard's at-risk preview (spec 19 §8) sorts exactly as
 * the Reports list does; one order, two screens.
 */
export function byScoreThenId(a: ScoreOrderKey, b: ScoreOrderKey): number {
```

(the body is unchanged).

- [ ] **Step 4: Assignment states for the student — one query path**

In `apps/backend/src/lib/queries/assignments.ts`, after `export interface StudentAssignmentRow { … }`, add:

```ts
/**
 * The student list row plus two server-derived facts the dashboard needs:
 * the org-calendar due day (X13) and `isLate` (D16). Kept off
 * StudentAssignmentRow so `GET /seasons/:id/assignments` — which returns those
 * rows as-is — does not change shape.
 */
export interface StudentAssignmentStateRow extends StudentAssignmentRow {
  dueOrgDay: string | null;
  isLate: boolean;
}
```

Replace the whole `listAssignmentsForStudent` function with:

```ts
/**
 * Every assignment targeted at this student in this season, with their state.
 * The ONE query behind both the student list and the student dashboard, so
 * the two cannot disagree about which assignments a student was given (C9).
 */
export async function listAssignmentStatesForStudent(
  studentUserId: number,
  seasonId: number | null,
  now: Date = new Date(),
): Promise<StudentAssignmentStateRow[]> {
  if (!seasonId) return [];

  const groupId = await groupIdInSeason(studentUserId, seasonId);

  const assignments = await db.assignment.findMany({
    where: {
      seasonId,
      deletedAt: null,
      OR: [
        { isAllGroups: true },
        ...(groupId !== null ? [{ targets: { some: { groupId } } }] : []),
      ],
    },
    orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      title: true,
      dueAt: true,
      submissions: {
        where: { studentUserId },
        select: { status: true, reviewedAt: true, submittedAt: true },
      },
    },
  });

  return assignments.map((a) => {
    const sub = a.submissions[0];
    return {
      id: a.id,
      title: a.title,
      dueAt: a.dueAt,
      dueOrgDay: a.dueAt ? orgDayKey(a.dueAt) : null,
      isOverdue: isOverdue(a.dueAt, now),
      isLate: isLate(sub?.submittedAt ?? null, a.dueAt),
      status: sub?.status ?? "PENDING",
      reviewedAt: sub?.reviewedAt ?? null,
    };
  });
}

export async function listAssignmentsForStudent(
  studentUserId: number,
  seasonId: number | null,
): Promise<StudentAssignmentRow[]> {
  const rows = await listAssignmentStatesForStudent(studentUserId, seasonId);
  // The list endpoint's wire shape is unchanged: drop the dashboard-only fields.
  return rows.map(({ dueOrgDay: _day, isLate: _late, ...row }) => row);
}
```

`orgDayKey` is already imported in this file by Plan 5 Task 2
(`import { orgDayKey, orgWallTime } from "../org-time";`); add it if not.

- [ ] **Step 5: Season progress and the current-or-next session**

> **v1 parity 2026-10-09:** `loadCurrentOrNextSession` becomes `loadNextSession(seasonId, now)`: one `findFirst({ where: { seasonId, startsAt: { gte: now } }, orderBy: [{ startsAt: "asc" }, { id: "asc" }] })`, no `isInProgress`, no latest-started read (v2 `apps/backend/src/lib/queries/sessions.ts:179-215`; v1 `jpc-space/src/app/admin/dashboard/page.tsx:43-54`, `student/dashboard/page.tsx:42-53`). `CurrentOrNextSession` loses `isInProgress`. `loadSeasonProgress` is unchanged.

Append to `apps/backend/src/lib/queries/sessions.ts` (imports: `isSessionInProgress`, `progressFrom`, `type ProgressFigures` from `../dashboard-figures`):

```ts
/**
 * Sessions held (`startsAt <= now`) over sessions scheduled — the ONE
 * definition of season progress (spec 19 §7; D12: sessions, never weeks).
 * Plan 11's `GET /me/season` and the dashboard both call it.
 */
export async function loadSeasonProgress(seasonId: number, now: Date): Promise<ProgressFigures> {
  const [held, total] = await Promise.all([
    db.session.count({ where: { seasonId, startsAt: { lte: now } } }),
    db.session.count({ where: { seasonId } }),
  ]);
  return progressFrom(held, total);
}

export interface CurrentOrNextSession {
  id: number;
  title: string;
  startsAt: Date;
  durationMinutes: number;
  location: string | null;
  youtubeUrl: string | null;
  isInProgress: boolean;
}

const CARD_SESSION_SELECT = {
  id: true,
  title: true,
  startsAt: true,
  durationMinutes: true,
  location: true,
  youtubeUrl: true,
} as const;

/**
 * D13: the session happening now, else the next one. v1 took the first
 * session with `startsAt >= now`, so the session a student needs to check in
 * to vanished from Home the minute it started (R21, R64). Two bounded reads.
 */
export async function loadCurrentOrNextSession(
  seasonId: number,
  now: Date,
): Promise<CurrentOrNextSession | null> {
  const [latestStarted, next] = await Promise.all([
    db.session.findFirst({
      where: { seasonId, startsAt: { lte: now } },
      orderBy: [{ startsAt: "desc" }, { id: "desc" }],
      select: CARD_SESSION_SELECT,
    }),
    db.session.findFirst({
      where: { seasonId, startsAt: { gt: now } },
      orderBy: [{ startsAt: "asc" }, { id: "asc" }],
      select: CARD_SESSION_SELECT,
    }),
  ]);
  if (latestStarted && isSessionInProgress(latestStarted.startsAt, latestStarted.durationMinutes, now)) {
    return { ...latestStarted, isInProgress: true };
  }
  return next ? { ...next, isInProgress: false } : null;
}
```

In Plan 11's `loadMySeason` (`apps/backend/src/lib/queries/me.ts`), in the
`Promise.all`, replace the two entries

```ts
    db.session.count({ where: { seasonId } }),
    db.session.count({ where: { seasonId, startsAt: { lte: now } } }),
```

with `loadSeasonProgress(seasonId, now),`, rename the destructuring to
`const [enrollment, upcoming, progress] = await Promise.all([`, and replace the
returned `progress: { … }` object with

```ts
    // Plan 11's contract keeps its names and its 0 for an empty season; the
    // count itself is the shared definition (spec 19 §7).
    progress: {
      completedSessions: progress.sessionsHeld,
      totalSessions: progress.sessionsTotal,
      pct: progress.pct ?? 0,
    },
```

Import `loadSeasonProgress` from `./sessions`.

- [ ] **Step 6: Prove nothing moved**

Run: `cd apps/backend && pnpm exec jest src/__tests__/dashboard-figures.test.ts` → PASS.
Run: `pnpm turbo lint typecheck test:unit --filter=@space/backend` → clean.
Coordinator, serially (shared DB):

```bash
cd apps/backend && npx jest --config jest.integration.config.js --runInBand \
  --testPathPattern 'submissions-routes|quizzes-routes|assignments-routes|me-self-service-routes|reports-queries|reports-routes'
```

→ PASS, with no test edited. A failure here means a move changed behaviour —
fix the move, never the old test.

- [ ] **Step 7: Commit**

```bash
git add apps/backend && git commit -m "refactor(backend): extract queue scope, graded counter, at-risk order, assignment states and season progress for reuse"
```

---

### Task 4: `GET /api/v1/me/dashboard` — integration tests, assembly, route, OpenAPI

**Files:**
- Create: `apps/backend/src/lib/queries/dashboard.ts`
- Modify: `apps/backend/src/routes/me.ts` (one route, `requireAuth` per route — X5)
- Modify: `apps/backend/src/docs/openapi.ts`
- Test: `apps/backend/src/__tests__/integration/dashboard-routes.test.ts` (new)

**Interfaces:**
- Consumes: Task 1 constants/schemas; Task 2 figures; Task 3 extractions; `computeEngagementForSeasons` (Plan 15), `staffScopeForSeason`/`AttendanceScope` (`lib/permissions.ts`), `visibleStudentIdsForQuiz` (Plan 8), `isAlumnus` (`lib/rbac.ts`), `orgDayKey`, `orgWallTime` (`lib/org-time.ts`), `parseId`, `apiOk`/`apiError`, `requireAuth`/`requireUser`.
- Produces: `loadStudentDashboard(user, now)`, `loadSeasonStaffDashboard(user, seasonId, scope, now)`, `loadMentorDashboard()`; `GET /api/v1/me/dashboard`.

Variant rules (spec 19 §7, verbatim): STUDENT (not graduated) → `STUDENT`, season from the **token's** `activeSeasonId`, any `?seasonId=` ignored (D22). Alumnus → **403 `forbidden`**. ADMIN/SUPER/LEADER → `SEASON_STAFF`, `?seasonId=` **required** (400 `bad_request` if missing or malformed), gated by `staffScopeForSeason` (403 when null — an ADMIN outside `seasonAdminIds`, a LEADER with no group in that season), 404 `not_found` only when a season the caller may name does not exist or is soft-deleted. MENTOR → `MENTOR`, `?seasonId=` ignored.

- [ ] **Step 1: Write the failing integration suite**

> **v1 parity 2026-10-09:** Update the integration expectations: STUDENT — `nextSession` is the first future session (`isInProgress` gone; the live session has `startsAt < now`, so next = the 2099 session; progress stays 3 of 4), and `lateSubmittedCount` counts a late submission on a live season assignment the student was **not** targeted by (R72). SEASON_STAFF — assert `cohort.roster` (every cohort row, sorted, null attendance last) and `cohort.belowThreshold` instead of `atRisk`/`atRiskTotal`. MENTOR (L1428-1447) — rename the case to "two blocks: 4 newest marks, 4 newest SUBMITTED|REVIEWED by submittedAt"; the graduated student's mark **is** included (R51, `mentor/dashboard/page.tsx:67-78`), RETURNED and DRAFT rows are excluded, a REVIEWED row is timed at `submittedAt` (R52, R54); deleted-season/assignment/student rows stay excluded (kept).

Fixture arithmetic, so every expected number below can be checked by hand.
Season S has four sessions: two in 2020, one **live** (started 10 minutes ago,
90 minutes long), one in 2099 → held 3 of 4 (75 %), next session = the live one.
Students s1, s2 (group A) and s3 (group B) enrolled 2019-12-01 ACTIVE; sW in
group A WITHDRAWN. Attendance over the three held sessions: s1 2/3 = 67 %, s2
1/3 = 33 %, s3 0/3 = 0 % → mean 33 (admin), 50 (leader, A only). Assignments:
`aAll` (all groups, due 2020-01-10), `aA` (group A, due 2099-06-01), `aOld`
(group A, due 2020-01-05), `aDeleted` (soft-deleted). Completed: s1 `aAll`
SUBMITTED late, s2 `aAll` REVIEWED, s3 `aAll` RETURNED → s1 1/3 = 33 %, s2 1/3 =
33 %, s3 1/1 = 100 %. Scores: s1 round(33.5 + 16.5) = 50, s2 33, s3 50 → all three
at risk, ordered s2, then s1 and s3 tied at 50 broken by `studentUserId` (s1
created first). Quizzes: PAPER graded for s1, s2 (s3's score null); ONLINE
published with GRADED attempts for s1, s2 and a SUBMITTED one for s3; one
unpublished ONLINE draft.

```ts
// apps/backend/src/__tests__/integration/dashboard-routes.test.ts
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { newPublicId } from "../../lib/public-id";
import {
  mentorDashboardSchema,
  staffSeasonDashboardSchema,
  studentDashboardSchema,
} from "../../../../../packages/shared/src/index";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

// The shared Neon staging Postgres autosuspends; the first query after idle has
// been measured around 18s.
jest.setTimeout(60000);

const app = createApp();
const at = (iso: string) => new Date(iso);

let seasonId: number;
let otherSeasonId: number;
let groupAId: number;
let s1: number;
let s2: number;
let s3: number;
let liveSessionId: number;
let aOldId: number;
let aAId: number;
let m1: number;
let m2: number;
let graduatedId: number;
const tokens: Record<string, string> = {};

function get(path: string, token?: string) {
  const req = request(app).get(path);
  return token ? req.set("authorization", `Bearer ${token}`) : req;
}

beforeAll(async () => {
  await cleanupTestData();

  // ---- Season S and its neighbours -----------------------------------------
  seasonId = (await createTestSeason()).id;
  otherSeasonId = (await createTestSeason()).id;
  groupAId = (await db.group.create({ data: { seasonId, name: "Group A" }, select: { id: true } })).id;
  const groupBId = (await db.group.create({ data: { seasonId, name: "Group B" }, select: { id: true } })).id;
  const otherGroupId = (
    await db.group.create({ data: { seasonId: otherSeasonId, name: "Other group" }, select: { id: true } })
  ).id;

  // Created in this order so s1.id < s3.id (the tie-break assertion relies on it).
  s1 = (await createTestUser("dash-s1", "STUDENT")).id;
  s2 = (await createTestUser("dash-s2", "STUDENT")).id;
  s3 = (await createTestUser("dash-s3", "STUDENT")).id;
  const sW = (await createTestUser("dash-withdrawn", "STUDENT")).id;
  const studentNone = await createTestUser("dash-none", "STUDENT");
  const student = await db.user.findUniqueOrThrow({ where: { id: s1 }, select: { email: true } });
  const admin = await createTestUser("dash-admin", "ADMIN");
  const adminOther = await createTestUser("dash-admin-other", "ADMIN");
  const leader = await createTestUser("dash-leader", "LEADER");
  const leaderNone = await createTestUser("dash-leader-none", "LEADER");
  const superUser = await createTestUser("dash-super", "SUPER");
  const mentor = await createTestUser("dash-mentor", "MENTOR");
  const alumnus = await createTestUser("dash-alumnus", "STUDENT");
  await db.user.update({ where: { id: alumnus.id }, data: { graduationYear: 2020 } });

  // Claims are read at login, so every grant exists before the logins below.
  await db.seasonAdmin.create({ data: { seasonId, userId: admin.id } });
  await db.seasonAdmin.create({ data: { seasonId: otherSeasonId, userId: adminOther.id } });
  await db.groupLeader.create({ data: { groupId: groupAId, userId: leader.id } });
  await db.groupLeader.create({ data: { groupId: otherGroupId, userId: leaderNone.id } });
  await db.studentProfile.create({ data: { userId: s1, activeSeasonId: seasonId } });

  const enrolledAt = at("2019-12-01T00:00:00.000Z");
  await db.seasonEnrollment.createMany({
    data: [
      { seasonId, studentUserId: s1, groupId: groupAId, status: "ACTIVE", enrolledAt },
      { seasonId, studentUserId: s2, groupId: groupAId, status: "ACTIVE", enrolledAt },
      { seasonId, studentUserId: s3, groupId: groupBId, status: "ACTIVE", enrolledAt },
      {
        seasonId,
        studentUserId: sW,
        groupId: groupAId,
        status: "WITHDRAWN",
        enrolledAt,
        droppedAt: at("2020-01-02T00:00:00.000Z"),
      },
    ],
  });

  const session = (title: string, startsAt: Date, youtubeUrl: string | null = null) =>
    db.session.create({ data: { seasonId, title, startsAt, durationMinutes: 90, youtubeUrl }, select: { id: true } });
  const p1 = (await session("Past one", at("2020-01-01T16:00:00.000Z"))).id;
  const p2 = (await session("Past two", at("2020-01-08T16:00:00.000Z"))).id;
  liveSessionId = (await session("Live now", new Date(Date.now() - 10 * 60_000), "https://youtu.be/live")).id;
  await session("Far future", at("2099-01-01T16:00:00.000Z"));

  await db.attendance.createMany({
    data: [
      { sessionId: p1, studentUserId: s1, status: "PRESENT" },
      { sessionId: p1, studentUserId: s2, status: "PRESENT" },
      { sessionId: p1, studentUserId: s3, status: "ABSENT" },
      { sessionId: p1, studentUserId: sW, status: "PRESENT" },
      { sessionId: p2, studentUserId: s1, status: "LATE", lateMinutes: 5 },
      { sessionId: p2, studentUserId: s2, status: "ABSENT" },
      { sessionId: p2, studentUserId: s3, status: "ABSENT" },
    ],
  });

  const aAll = await db.assignment.create({
    data: { seasonId, title: "For everyone", isAllGroups: true, dueAt: at("2020-01-10T10:00:00.000Z") },
    select: { id: true },
  });
  aAId = (
    await db.assignment.create({
      data: {
        seasonId,
        title: "Group A essay",
        dueAt: at("2099-06-01T10:00:00.000Z"),
        targets: { create: { groupId: groupAId } },
      },
      select: { id: true },
    })
  ).id;
  aOldId = (
    await db.assignment.create({
      data: {
        seasonId,
        title: "Group A old",
        dueAt: at("2020-01-05T10:00:00.000Z"),
        targets: { create: { groupId: groupAId } },
      },
      select: { id: true },
    })
  ).id;
  const aDeleted = await db.assignment.create({
    data: { seasonId, title: "Deleted", isAllGroups: true, deletedAt: new Date() },
    select: { id: true },
  });

  await db.submission.createMany({
    data: [
      // Late: submitted 2020-01-12, due 2020-01-10.
      { publicId: newPublicId(), assignmentId: aAll.id, studentUserId: s1, status: "SUBMITTED", submittedAt: at("2020-01-12T10:00:00.000Z") },
      { publicId: newPublicId(), assignmentId: aAId, studentUserId: s1, status: "DRAFT" },
      { publicId: newPublicId(), assignmentId: aAll.id, studentUserId: s2, status: "REVIEWED", submittedAt: at("2020-01-09T10:00:00.000Z"), reviewedAt: at("2020-01-11T10:00:00.000Z") },
      { publicId: newPublicId(), assignmentId: aAll.id, studentUserId: s3, status: "RETURNED", submittedAt: at("2020-01-09T10:00:00.000Z"), reviewedAt: at("2020-01-11T10:00:00.000Z") },
      // On a soft-deleted assignment: must count nowhere.
      { publicId: newPublicId(), assignmentId: aDeleted.id, studentUserId: s2, status: "SUBMITTED", submittedAt: at("2020-01-09T10:00:00.000Z") },
    ],
  });

  const paper = await db.quiz.create({ data: { seasonId, title: "Paper", kind: "PAPER" }, select: { id: true } });
  const online = await db.quiz.create({
    data: { seasonId, title: "Online", kind: "ONLINE", publishedAt: new Date() },
    select: { id: true },
  });
  await db.quiz.create({ data: { seasonId, title: "Draft", kind: "ONLINE" } });
  await db.quizGrade.createMany({
    data: [
      { quizId: paper.id, studentUserId: s1, score: 8 },
      { quizId: paper.id, studentUserId: s2, score: 7 },
      { quizId: paper.id, studentUserId: s3, score: null },
    ],
  });
  await db.quizAttempt.createMany({
    data: [
      { quizId: online.id, studentUserId: s1, status: "GRADED", totalScore: 2 },
      { quizId: online.id, studentUserId: s2, status: "GRADED", totalScore: 1 },
      { quizId: online.id, studentUserId: s3, status: "SUBMITTED" },
    ],
  });

  // ---- The mentor feed: dated 2099 so these are the newest rows in the DB ----
  const feedSeasonId = (await createTestSeason()).id;
  const deletedSeasonId = (await createTestSeason()).id;
  await db.season.update({ where: { id: deletedSeasonId }, data: { deletedAt: new Date() } });
  const feedSession = await db.session.create({
    data: { seasonId: feedSeasonId, title: "Feed session", startsAt: at("2099-04-01T16:00:00.000Z") },
    select: { id: true },
  });
  const deletedSession = await db.session.create({
    data: { seasonId: deletedSeasonId, title: "Gone session", startsAt: at("2099-04-01T16:00:00.000Z") },
    select: { id: true },
  });
  const feedAssignment = await db.assignment.create({
    data: { seasonId: feedSeasonId, title: "Feed essay", isAllGroups: true },
    select: { id: true },
  });
  m1 = (await createTestUser("dash-m1", "STUDENT")).id;
  m2 = (await createTestUser("dash-m2", "STUDENT")).id;
  const m3 = (await createTestUser("dash-m3", "STUDENT")).id;
  graduatedId = (await createTestUser("dash-graduated", "STUDENT")).id;
  await db.user.update({ where: { id: graduatedId }, data: { graduationYear: 2020 } });

  await db.attendance.createMany({
    data: [
      { sessionId: feedSession.id, studentUserId: m1, status: "PRESENT", markedAt: at("2099-05-01T09:00:00.000Z") },
      // Graduated student — excluded (D18 recommendation).
      { sessionId: feedSession.id, studentUserId: graduatedId, status: "PRESENT", markedAt: at("2099-06-02T09:00:00.000Z") },
      // Soft-deleted season — excluded.
      { sessionId: deletedSession.id, studentUserId: m1, status: "PRESENT", markedAt: at("2099-06-03T09:00:00.000Z") },
    ],
  });
  await db.submission.createMany({
    data: [
      { publicId: newPublicId(), assignmentId: feedAssignment.id, studentUserId: m1, status: "SUBMITTED", submittedAt: at("2099-05-02T09:00:00.000Z") },
      { publicId: newPublicId(), assignmentId: feedAssignment.id, studentUserId: m2, status: "REVIEWED", submittedAt: at("2099-04-01T09:00:00.000Z"), reviewedAt: at("2099-05-03T09:00:00.000Z") },
      // DRAFT never appears (spec 08 D8), whatever its timestamps.
      { publicId: newPublicId(), assignmentId: feedAssignment.id, studentUserId: m3, status: "DRAFT", submittedAt: at("2099-06-01T09:00:00.000Z") },
    ],
  });

  tokens.admin = await login(app, admin.email);
  tokens.adminOther = await login(app, adminOther.email);
  tokens.leader = await login(app, leader.email);
  tokens.leaderNone = await login(app, leaderNone.email);
  tokens.super = await login(app, superUser.email);
  tokens.mentor = await login(app, mentor.email);
  tokens.alumnus = await login(app, alumnus.email);
  tokens.student = await login(app, student.email);
  tokens.studentNone = await login(app, studentNone.email);
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("GET /api/v1/me/dashboard — gates", () => {
  it("401s without a token, and an unknown /me path is still a 404 (X5)", async () => {
    expect((await get("/api/v1/me/dashboard")).status).toBe(401);
    const unknown = await get("/api/v1/me/no-such-thing");
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe("not_found");
  });

  it("403s an alumnus — the alumni Home composes /me and /events (spec 19 §7)", async () => {
    const res = await get("/api/v1/me/dashboard", tokens.alumnus);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("forbidden");
  });

  it("400s a season-staff caller with no seasonId or a malformed one", async () => {
    for (const token of [tokens.admin, tokens.leader, tokens.super]) {
      const res = await get("/api/v1/me/dashboard", token);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("bad_request");
    }
    expect((await get("/api/v1/me/dashboard?seasonId=abc", tokens.admin)).status).toBe(400);
  });

  it("403s an admin of another season and a leader with no group in it (C7, C8)", async () => {
    expect((await get(`/api/v1/me/dashboard?seasonId=${seasonId}`, tokens.adminOther)).status).toBe(403);
    expect((await get(`/api/v1/me/dashboard?seasonId=${seasonId}`, tokens.leaderNone)).status).toBe(403);
  });

  it("404s a season that does not exist", async () => {
    const res = await get("/api/v1/me/dashboard?seasonId=2147483000", tokens.super);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });
});

describe("SEASON_STAFF", () => {
  it("gives an admin the season-wide figures, every one server-derived", async () => {
    const res = await get(`/api/v1/me/dashboard?seasonId=${seasonId}`, tokens.admin);
    expect(res.status).toBe(200);
    const d = staffSeasonDashboardSchema.parse(res.body.data);

    expect(d.scope).toBe("season");
    expect(d.groups).toEqual([]);
    expect(d.season).toMatchObject({ id: seasonId, status: "ACTIVE" });
    expect(d.progress).toEqual({ sessionsHeld: 3, sessionsTotal: 4, pct: 75 });
    expect(d.nextSession).toMatchObject({
      id: liveSessionId,
      isInProgress: true,
      youtubeUrl: "https://youtu.be/live",
    });
    // ACTIVE enrolments only — the withdrawn student is not on the cohort (C9, D8).
    expect(d.cohort.studentCount).toBe(3);
    expect(d.cohort.meanAttendancePct).toBe(33);
    expect(d.cohort.atRiskTotal).toBe(3);
    expect(d.cohort.atRisk.map((r) => r.studentUserId)).toEqual([s2, s1, s3]);
    // The queue's scope: one SUBMITTED, REVIEWED + RETURNED; the deleted assignment's row nowhere (D11).
    expect(d.submissions).toEqual({ pendingReview: 1, reviewed: 2 });
    // s3 is ungraded on both live quizzes; the draft is reported separately (D10).
    expect(d.quizzes).toEqual({ total: 2, pending: 2, fullyGraded: 0, drafts: 1 });
  });

  it("gives SUPER the same season-scoped figures when it names the season", async () => {
    const res = await get(`/api/v1/me/dashboard?seasonId=${seasonId}`, tokens.super);
    expect(res.status).toBe(200);
    const d = staffSeasonDashboardSchema.parse(res.body.data);
    expect(d.scope).toBe("season");
    expect(d.cohort.studentCount).toBe(3);
  });

  it("narrows a leader to their groups through SeasonEnrollment and names every group (D7, C9)", async () => {
    const res = await get(`/api/v1/me/dashboard?seasonId=${seasonId}`, tokens.leader);
    expect(res.status).toBe(200);
    const d = staffSeasonDashboardSchema.parse(res.body.data);

    expect(d.scope).toBe("groups");
    expect(d.groups).toEqual([{ id: groupAId, name: "Group A" }]);
    expect(d.cohort.studentCount).toBe(2);
    expect(d.cohort.meanAttendancePct).toBe(50);
    expect(d.cohort.atRisk.map((r) => r.studentUserId)).toEqual([s2, s1]);
    expect(d.cohort.atRiskTotal).toBe(2);
    // Their students' work only: s1's SUBMITTED and s2's REVIEWED; s3 is group B.
    expect(d.submissions).toEqual({ pendingReview: 1, reviewed: 1 });
    // s1 and s2 are graded on both, so nothing is pending for this leader.
    expect(d.quizzes).toEqual({ total: 2, pending: 0, fullyGraded: 2, drafts: 1 });
  });
});

describe("STUDENT", () => {
  it("carries only the caller's own figures and ignores ?seasonId= (C8 #2, D22)", async () => {
    const res = await get(`/api/v1/me/dashboard?seasonId=${otherSeasonId}`, tokens.student);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.data).sort()).toEqual(["assignments", "nextSession", "progress", "season", "variant"]);
    const d = studentDashboardSchema.parse(res.body.data);

    expect(d.season?.id).toBe(seasonId);
    expect(d.progress).toEqual({ sessionsHeld: 3, sessionsTotal: 4, pct: 75 });
    expect(d.nextSession).toMatchObject({ id: liveSessionId, isInProgress: true });
    expect(d.nextSession?.dayKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(d.nextSession?.time).toMatch(/^\d{2}:\d{2}$/);
    // Outstanding: aOld (PENDING, overdue) and aA (DRAFT). Late: aAll. Deleted: nowhere.
    expect(d.assignments).toMatchObject({ outstandingCount: 2, overdueCount: 1, lateSubmittedCount: 1 });
    expect(d.assignments?.dueSoon.map((a) => [a.id, a.status, a.isOverdue, a.dueOrgDay])).toEqual([
      [aOldId, "PENDING", true, "2020-01-05"],
      [aAId, "DRAFT", false, "2099-06-01"],
    ]);
  });

  it("states 'not enrolled' itself: season null and everything else null (R63)", async () => {
    const res = await get("/api/v1/me/dashboard", tokens.studentNone);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      variant: "STUDENT",
      season: null,
      progress: null,
      nextSession: null,
      assignments: null,
    });
  });
});

describe("MENTOR", () => {
  it("is one merged feed, newest first, reviews at reviewedAt, without DRAFT, graduated or deleted-season rows (D18)", async () => {
    const res = await get(`/api/v1/me/dashboard?seasonId=${seasonId}`, tokens.mentor);
    expect(res.status).toBe(200);
    const d = mentorDashboardSchema.parse(res.body.data);

    expect(d.recentActivity.length).toBeLessThanOrEqual(8);
    expect(d.recentActivity.slice(0, 4).map((i) => [i.kind, i.at, i.studentUserId])).toEqual([
      ["reviewed", "2099-05-03T09:00:00.000Z", m2],
      ["submitted", "2099-05-02T09:00:00.000Z", m1],
      ["attendance", "2099-05-01T09:00:00.000Z", m1],
      ["submitted", "2099-04-01T09:00:00.000Z", m2],
    ]);
    expect(d.recentActivity[0]?.submissionPublicId).toEqual(expect.any(String));
    expect(d.recentActivity[2]?.attendanceStatus).toBe("PRESENT");
    expect(d.recentActivity.some((i) => i.at >= "2099-06-01")).toBe(false);
    expect(d.recentActivity.some((i) => i.studentUserId === graduatedId)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Coordinator: `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern dashboard-routes`
Expected: FAIL — every `/api/v1/me/dashboard` case 404s (`not_found`); only the unknown-path assertion passes.

- [ ] **Step 3: The assembly**

> **v1 parity 2026-10-09:** In this block (v2 `apps/backend/src/lib/queries/dashboard.ts`): (1) call `loadNextSession` and drop `isInProgress` from `toDashboardSession` (`dashboard.ts:33-44`, `:70`, `:123`); (2) STUDENT: add one count — `db.submission.findMany({ where: { studentUserId, status: { in: ["SUBMITTED","REVIEWED","RETURNED"] }, submittedAt: { not: null }, assignment: { seasonId, deletedAt: null, dueAt: { not: null } } }, select: { submittedAt, assignment: { dueAt } } })` filtered with the exported `isLate` → `lateSubmittedCount` (R72, `jpc-space/src/app/student/dashboard/page.tsx:57-68`); (3) SEASON_STAFF: replace `atRiskAll` (`dashboard.ts:142-155`) with `roster = rosterRowsFrom(rows)` and `belowThreshold = roster.filter(r => r.attendancePct !== null && r.attendancePct < ATTENDANCE_TIERS.low)` (R31, R35, `admin/dashboard/page.tsx:101-102`, `:364-377`); same for the leader scope (R41); (4) MENTOR: `FEED_STUDENT` drops `graduationYear: null` (`dashboard.ts:163`, R51); the submission read is `status: { in: ["SUBMITTED","REVIEWED"] }`, `submittedAt` desc, take 4, the `reviewedRows` read is deleted (`dashboard.ts:187-222`, R52, R54); attendance read takes 4; return `{ variant: "MENTOR", recentAttendance, recentSubmissions }` with no merge (`dashboard.ts:252-273`, R53; v1 `mentor/dashboard/page.tsx:67-91`, `:161-210`). Soft-delete filters stay. (5) SUPER tile: add `upcomingEventCount = db.jpcEvent.count({ where: { date: { gte: now } } })` (no visibility, no upper bound) to Plan 15's `GET /reports/organisation` (`organisationReportSchema` + its loader) — new work owned here (R15, `jpc-space/src/app/super/dashboard/page.tsx:18`).

```ts
// apps/backend/src/lib/queries/dashboard.ts
import { db } from "../../db/client";
import type { SessionUser } from "../auth/tokens";
import {
  mergeActivity,
  quizRollupFrom,
  summarizeStudentAssignments,
  type ActivityRow,
} from "../dashboard-figures";
import { orgDayKey, orgWallTime } from "../org-time";
import { submissionQueueScopeFor, type AttendanceScope } from "../permissions";
import { countGradedByQuiz, visibleStudentIdsForQuiz } from "../quiz-scope";
import { listAssignmentStatesForStudent } from "./assignments";
import { computeEngagementForSeasons } from "./engagement";
import { byScoreThenId } from "./reports";
import { loadCurrentOrNextSession, loadSeasonProgress, type CurrentOrNextSession } from "./sessions";
import {
  DASHBOARD_AT_RISK_PREVIEW,
  DUE_SOON_LIMIT,
  RECENT_ACTIVITY_LIMIT,
  meanAttendancePct,
} from "../../../../../packages/shared/src/index";

/*
 * GET /api/v1/me/dashboard — spec 19 §7. Every figure here is a CALL to the
 * function that owns it; nothing is re-derived (ruling C4). The query count
 * is constant per variant: it does not grow with the cohort, the number of
 * groups, or the number of seasons (spec §7 "Query budget").
 */

/** Org wall-clock day and time ride beside the instant (C2/X13). */
function toDashboardSession(s: CurrentOrNextSession) {
  return {
    id: s.id,
    title: s.title,
    startsAt: s.startsAt,
    dayKey: orgDayKey(s.startsAt),
    time: orgWallTime(s.startsAt),
    durationMinutes: s.durationMinutes,
    location: s.location,
    youtubeUrl: s.youtubeUrl,
    isInProgress: s.isInProgress,
  };
}

const SEASON_SELECT = { id: true, code: true, title: true, status: true } as const;

/**
 * The student's own Home. Season from the TOKEN's activeSeasonId — the same
 * value /me exposes — for both the title and the figures (D22; v1 mixed the
 * token's id with the database's title, R62). Roughly six queries.
 */
export async function loadStudentDashboard(user: SessionUser, now: Date) {
  const notEnrolled = {
    variant: "STUDENT" as const,
    season: null,
    progress: null,
    nextSession: null,
    assignments: null,
  };
  const seasonId = user.activeSeasonId;
  if (seasonId === null) return notEnrolled;

  const season = await db.season.findFirst({ where: { id: seasonId, deletedAt: null }, select: SEASON_SELECT });
  if (!season) return notEnrolled;

  const [progress, next, rows] = await Promise.all([
    loadSeasonProgress(seasonId, now),
    loadCurrentOrNextSession(seasonId, now),
    listAssignmentStatesForStudent(user.userId, seasonId, now),
  ]);

  return {
    variant: "STUDENT" as const,
    season,
    progress,
    nextSession: next ? toDashboardSession(next) : null,
    assignments: summarizeStudentAssignments(rows, DUE_SOON_LIMIT),
  };
}

/**
 * ADMIN / SUPER (scope "season") and LEADER (scope "groups"). The caller has
 * already passed `staffScopeForSeason`; `scope` is its answer. Returns null
 * when the season does not exist or is soft-deleted.
 */
export async function loadSeasonStaffDashboard(
  user: SessionUser,
  seasonId: number,
  scope: AttendanceScope,
  now: Date,
) {
  const season = await db.season.findFirst({ where: { id: seasonId, deletedAt: null }, select: SEASON_SELECT });
  if (!season) return null;

  // The leader's cohort: ACTIVE enrolments of THIS season in the groups they
  // lead (C9) — never GroupStudent, never another season's group (D7).
  const [groups, leaderEnrollments] =
    scope.kind === "groups"
      ? await Promise.all([
          db.group.findMany({
            where: { id: { in: scope.groupIds } },
            orderBy: [{ name: "asc" }, { id: "asc" }],
            select: { id: true, name: true },
          }),
          db.seasonEnrollment.findMany({
            where: { seasonId, status: "ACTIVE", groupId: { in: scope.groupIds } },
            select: { studentUserId: true },
          }),
        ])
      : [[], null];

  const queueScope = await submissionQueueScopeFor(user);
  const inSeason = { assignment: { seasonId, deletedAt: null } };

  const [rows, progress, next, pendingReview, reviewed, quizzes, studentIds] = await Promise.all([
    computeEngagementForSeasons(
      [seasonId],
      leaderEnrollments ? { studentUserIds: leaderEnrollments.map((e) => e.studentUserId) } : {},
    ),
    loadSeasonProgress(seasonId, now),
    loadCurrentOrNextSession(seasonId, now),
    queueScope === null
      ? Promise.resolve(0)
      : db.submission.count({ where: { AND: [queueScope, inSeason, { status: "SUBMITTED" }] } }),
    queueScope === null
      ? Promise.resolve(0)
      : db.submission.count({
          where: { AND: [queueScope, inSeason, { status: { in: ["REVIEWED", "RETURNED"] } }] },
        }),
    db.quiz.findMany({ where: { seasonId }, select: { id: true, kind: true, publishedAt: true } }),
    visibleStudentIdsForQuiz(user, seasonId),
  ]);

  const visible = studentIds ?? [];
  const live = quizzes.filter((q) => !(q.kind === "ONLINE" && q.publishedAt === null));
  const gradedBy = await countGradedByQuiz(live, visible);

  // The one at-risk predicate (isAtRisk, already on each row) and the one
  // order (Plan 15's byScoreThenId). No 70 % rule, no colour tiers (D2).
  const atRiskAll = rows.filter((r) => r.atRisk).sort(byScoreThenId);

  return {
    variant: "SEASON_STAFF" as const,
    scope: scope.kind,
    season,
    groups,
    progress,
    nextSession: next ? toDashboardSession(next) : null,
    cohort: {
      studentCount: rows.length,
      meanAttendancePct: meanAttendancePct(rows),
      atRiskTotal: atRiskAll.length,
      atRisk: atRiskAll.slice(0, DASHBOARD_AT_RISK_PREVIEW),
    },
    submissions: { pendingReview, reviewed },
    quizzes: quizRollupFrom(quizzes, gradedBy, visible.length),
  };
}

/** Active, non-graduated, non-deleted students — the at-risk cohort's people (D17, D18). */
const FEED_STUDENT = { role: "STUDENT" as const, deletedAt: null, graduationYear: null };

/**
 * The mentor's feed: cross-season by design (a mentor reads every student,
 * `canReadAllStudents`), stated here rather than inherited from a page that
 * forgot to filter (spec §4 item 3). Three bounded reads, merged in memory.
 * The at-risk list is NOT here: it is GET /reports/engagement (D17).
 */
export async function loadMentorDashboard() {
  const liveAssignment = { deletedAt: null, season: { deletedAt: null } };
  const [marks, submitted, reviewedRows] = await Promise.all([
    db.attendance.findMany({
      where: { studentUser: FEED_STUDENT, session: { season: { deletedAt: null } } },
      orderBy: [{ markedAt: "desc" }, { id: "desc" }],
      take: RECENT_ACTIVITY_LIMIT,
      select: {
        id: true,
        status: true,
        markedAt: true,
        studentUserId: true,
        studentUser: { select: { name: true } },
        session: { select: { title: true } },
      },
    }),
    db.submission.findMany({
      where: {
        status: { in: ["SUBMITTED", "REVIEWED", "RETURNED"] },
        submittedAt: { not: null },
        studentUser: FEED_STUDENT,
        assignment: liveAssignment,
      },
      orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
      take: RECENT_ACTIVITY_LIMIT,
      select: {
        id: true,
        publicId: true,
        submittedAt: true,
        studentUserId: true,
        studentUser: { select: { name: true } },
        assignment: { select: { title: true } },
      },
    }),
    db.submission.findMany({
      where: {
        status: { in: ["REVIEWED", "RETURNED"] },
        reviewedAt: { not: null },
        studentUser: FEED_STUDENT,
        assignment: liveAssignment,
      },
      orderBy: [{ reviewedAt: "desc" }, { id: "desc" }],
      take: RECENT_ACTIVITY_LIMIT,
      select: {
        id: true,
        publicId: true,
        reviewedAt: true,
        studentUserId: true,
        studentUser: { select: { name: true } },
        assignment: { select: { title: true } },
      },
    }),
  ]);

  const rows: ActivityRow[] = [
    ...marks.map((m) => ({
      key: `att:${m.id}`,
      kind: "attendance" as const,
      at: m.markedAt,
      studentUserId: m.studentUserId,
      studentName: m.studentUser.name,
      subjectTitle: m.session.title,
      attendanceStatus: m.status,
      submissionPublicId: null,
    })),
    ...submitted.flatMap((s) =>
      s.submittedAt === null
        ? []
        : [
            {
              key: `sub:${s.id}`,
              kind: "submitted" as const,
              at: s.submittedAt,
              studentUserId: s.studentUserId,
              studentName: s.studentUser.name,
              subjectTitle: s.assignment.title,
              attendanceStatus: null,
              submissionPublicId: s.publicId,
            },
          ],
    ),
    // A review is its own event at reviewedAt (D18). v1 showed "received
    // feedback" at submittedAt, so a review written today on an old
    // submission never surfaced (R54).
    ...reviewedRows.flatMap((s) =>
      s.reviewedAt === null
        ? []
        : [
            {
              key: `rev:${s.id}`,
              kind: "reviewed" as const,
              at: s.reviewedAt,
              studentUserId: s.studentUserId,
              studentName: s.studentUser.name,
              subjectTitle: s.assignment.title,
              attendanceStatus: null,
              submissionPublicId: s.publicId,
            },
          ],
    ),
  ];

  return { variant: "MENTOR" as const, recentActivity: mergeActivity(rows, RECENT_ACTIVITY_LIMIT) };
}
```

- [ ] **Step 4: The route**

In `apps/backend/src/routes/me.ts` add imports:

```ts
import { apiError } from "../lib/api-response"; // beside apiOk
import { parseId } from "../lib/parse-id";
import { staffScopeForSeason } from "../lib/permissions";
import {
  loadMentorDashboard,
  loadSeasonStaffDashboard,
  loadStudentDashboard,
} from "../lib/queries/dashboard";
import { isAlumnus } from "../lib/rbac";
```

(`isAlumnus` is already imported here by Plan 11 — do not import it twice.) Append:

```ts
/**
 * The role dashboard's server-derived figures (spec 19 §7). A read with no
 * side effects (C6); requireAuth per route because /api/v1/me is shared with
 * the other self-service routes (X5).
 */
meRouter.get("/dashboard", requireAuth, async (req, res) => {
  const user = requireUser(req);
  const now = new Date();

  // An alumnus's Home is /me + /events; this endpoint has nothing for them.
  if (isAlumnus(user)) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }
  // A student's season is their token's, never a parameter (D22, C8).
  if (user.role === "STUDENT") return apiOk(res, await loadStudentDashboard(user, now));
  if (user.role === "MENTOR") return apiOk(res, await loadMentorDashboard());

  const raw = req.query.seasonId;
  const seasonId = parseId(typeof raw === "string" ? raw : undefined);
  if (seasonId === null) {
    return apiError(res, "bad_request", "seasonId is required.", 400);
  }

  // The gate, not a where clause (spec §4 item 1): SUPER and the season's
  // admins get "season"; a LEADER gets their groups in it; everyone else null.
  const scope = await staffScopeForSeason(user, seasonId);
  if (scope === null) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const dashboard = await loadSeasonStaffDashboard(user, seasonId, scope, now);
  if (!dashboard) return apiError(res, "not_found", "Season not found.", 404);
  return apiOk(res, dashboard);
});
```

- [ ] **Step 5: Run**

Coordinator: `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern dashboard-routes` → PASS.
Run: `pnpm turbo lint typecheck test:unit --filter=@space/backend` → clean.
Run: `pnpm --filter @space/backend build && ! grep -rn 'require("@space/shared")' apps/backend/dist` → exits 0: no runtime `require("@space/shared")` anywhere in `dist/` (X12).

- [ ] **Step 6: OpenAPI, same commit**

> **v1 parity 2026-10-09:** Mirror the Step 2/3 contract changes in the OpenAPI document: no `isInProgress`; `cohort.roster`/`cohort.belowThreshold` instead of `atRisk`/`atRiskTotal`; MENTOR `recentAttendance`/`recentSubmissions` (each `maxItems: 4`) instead of `recentActivity`; `upcomingEventCount` on `/reports/organisation`.

In `apps/backend/src/docs/openapi.ts`, add after the `"/api/v1/me"` entry:

```ts
    "/api/v1/me/dashboard": {
      get: {
        tags: ["Me"],
        summary: "The caller's role dashboard figures",
        description: [
          "A discriminated union on `variant` (spec 19 §7). Every figure is derived once, server-side (ruling C4); clients render, never recompute.",
          "",
          "- **STUDENT** (not graduated): the caller's own figures only — no cohort, no other student, no score (C8). Season from the token's `activeSeasonId`; `seasonId` is ignored. With no active season every field but `variant` is null.",
          "- **SEASON_STAFF**: `seasonId` required. ADMIN must administer it, SUPER may name any, a LEADER gets `scope: \"groups\"` over the ACTIVE enrolments of the groups they lead in it. Attendance % starts at each student's enrolment and never exceeds 100; `atRisk` is the shared `isAtRisk` (either component below 60), not v1's 70 % rule; review counts use the review queue's own scope; ONLINE quiz drafts are counted as `drafts`.",
          "- **MENTOR**: the eight most recent attendance marks, submissions and reviews across all seasons, merged and newest first (reviews at `reviewedAt`), excluding DRAFT work, graduated or deleted students and deleted assignments or seasons. The mentor's at-risk list is `GET /api/v1/reports/engagement`.",
          "- An alumnus gets 403.",
          "",
          "`nextSession` is the session in progress (`isInProgress: true`) if there is one, else the next; `dayKey`/`time` are the organisation's calendar day and wall-clock time.",
        ].join("\n"),
        parameters: [
          {
            name: "seasonId",
            in: "query",
            required: false,
            description: "Required for ADMIN, LEADER and SUPER; ignored for STUDENT and MENTOR.",
            schema: { type: "integer", minimum: 1 },
          },
        ],
        responses: {
          200: ok(
            {
              oneOf: [
                {
                  type: "object",
                  description: "variant STUDENT",
                  properties: {
                    variant: { const: "STUDENT" },
                    season: { type: ["object", "null"] },
                    progress: {
                      type: ["object", "null"],
                      properties: {
                        sessionsHeld: { type: "integer" },
                        sessionsTotal: { type: "integer" },
                        pct: { type: ["integer", "null"] },
                      },
                    },
                    nextSession: { type: ["object", "null"] },
                    assignments: {
                      type: ["object", "null"],
                      properties: {
                        outstandingCount: { type: "integer", description: "PENDING or DRAFT, targeted assignments only." },
                        overdueCount: { type: "integer" },
                        lateSubmittedCount: { type: "integer" },
                        dueSoon: { type: "array", maxItems: 3, items: { type: "object" } },
                      },
                    },
                  },
                },
                {
                  type: "object",
                  description: "variant SEASON_STAFF",
                  properties: {
                    variant: { const: "SEASON_STAFF" },
                    scope: { enum: ["season", "groups"] },
                    season: { type: "object" },
                    groups: { type: "array", items: { type: "object" } },
                    progress: { type: "object" },
                    nextSession: { type: ["object", "null"] },
                    cohort: {
                      type: "object",
                      properties: {
                        studentCount: { type: "integer" },
                        meanAttendancePct: { type: ["integer", "null"], description: "Mean over students with at least one past session; null when none." },
                        atRiskTotal: { type: "integer" },
                        atRisk: { type: "array", maxItems: 10, items: { type: "object" } },
                      },
                    },
                    submissions: {
                      type: "object",
                      properties: { pendingReview: { type: "integer" }, reviewed: { type: "integer" } },
                    },
                    quizzes: {
                      type: "object",
                      properties: {
                        total: { type: "integer" },
                        pending: { type: "integer" },
                        fullyGraded: { type: "integer" },
                        drafts: { type: "integer" },
                      },
                    },
                  },
                },
                {
                  type: "object",
                  description: "variant MENTOR",
                  properties: {
                    variant: { const: "MENTOR" },
                    recentActivity: { type: "array", maxItems: 8, items: { type: "object" } },
                  },
                },
              ],
            },
            "The caller's dashboard variant.",
          ),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
        },
      },
    },
```

- [ ] **Step 7: Commit**

```bash
git add apps/backend && git commit -m "feat(backend): GET /me/dashboard — student, season-staff and mentor variants composed from the owning computations"
```

---

### Task 5: Mobile foundation — query keys, hooks, format helpers, branch picker, invalidation hook

**Files:**
- Modify: `apps/mobile/src/lib/query-keys.ts` (add `dashboard`)
- Create: `apps/mobile/src/hooks/use-dashboard.ts`
- Modify: `apps/mobile/src/lib/format.ts` (add `firstName`, `formatEventWhen`, `formatTimeAgo`)
- Create: `apps/mobile/src/lib/dashboard-branch.ts`
- Create: `apps/mobile/src/lib/dashboard-invalidation.ts`
- Modify: `apps/mobile/src/lib/query-client.ts` (a `MutationCache` that honours the tag)
- Test: `apps/mobile/src/__tests__/use-dashboard.test.tsx` (new), `apps/mobile/src/__tests__/format.test.ts` (append), `apps/mobile/src/__tests__/dashboard-branch.test.ts` (new), `apps/mobile/src/__tests__/query-client.test.ts` (append)

**Interfaces:**
- Consumes: Task 1 schemas; `apiClient`; `formatDayKey` (Plan 4); `JpcEventListItem` (Plan 14).
- Produces:
  - `queryKeys.dashboard.all`, `queryKeys.dashboard.me(seasonId: number | null)`
  - `DASHBOARD_STALE_TIME = 60_000`; `useStudentDashboard(activeSeasonId)`, `useSeasonStaffDashboard(seasonId)`, `useMentorDashboard()`
  - `firstName(name)`, `formatEventWhen(event)`, `formatTimeAgo(iso)`
  - `DashboardBranch`, `dashboardBranchFor({ role, graduationYear })`
  - `DASHBOARD_META` (the mutation tag Task 8 applies)

- [ ] **Step 1: Failing tests**

> **v1 parity 2026-10-09:** Replace the `firstName` cases: alumni `firstName("  Nour Adel ")` → "Nour", `firstName(null)` → "there", and an empty/blank name returns `""` (v1 `alumni/dashboard/page.tsx:21`); add `studentFirstName("Sara Mansour")` → "Sara" using `name.split(" ")[0]`, "there" only on null (`student/dashboard/page.tsx:88`) (R59).

```ts
// apps/mobile/src/__tests__/dashboard-branch.test.ts
import { dashboardBranchFor } from "../lib/dashboard-branch";

describe("dashboardBranchFor — navFor's audience rule (spec 19 §9)", () => {
  it("maps each role to its branch, and a graduated student to ALUMNI", () => {
    expect(dashboardBranchFor({ role: "SUPER", graduationYear: null })).toBe("SUPER");
    expect(dashboardBranchFor({ role: "ADMIN", graduationYear: null })).toBe("ADMIN");
    expect(dashboardBranchFor({ role: "LEADER", graduationYear: 2020 })).toBe("LEADER");
    expect(dashboardBranchFor({ role: "MENTOR", graduationYear: null })).toBe("MENTOR");
    expect(dashboardBranchFor({ role: "STUDENT", graduationYear: null })).toBe("STUDENT");
    expect(dashboardBranchFor({ role: "STUDENT", graduationYear: 2024 })).toBe("ALUMNI");
  });
});
```

Append to `apps/mobile/src/__tests__/format.test.ts` (merge the import):

```ts
import { firstName, formatEventWhen } from "../lib/format";

describe("firstName (spec 19 D21 — one formatter for STUDENT and ALUMNI)", () => {
  it("takes the first whitespace-separated token of the trimmed name", () => {
    expect(firstName("  Sara   Mansour ")).toBe("Sara");
  });
  it("falls back to 'there' on null AND on empty (v1 rendered 'Welcome back, ')", () => {
    expect(firstName(null)).toBe("there");
    expect(firstName("   ")).toBe("there");
  });
});

describe("formatEventWhen (spec 19 R11, X13 — server day keys and wall time only)", () => {
  it("shows the day and the org wall time", () => {
    expect(formatEventWhen({ dayKey: "2099-03-05", endDayKey: null, time: "18:30" })).toBe("Mar 5, 2099 · 18:30");
  });
  it("omits the time for an all-day event and collapses a same-day range", () => {
    expect(formatEventWhen({ dayKey: "2099-03-05", endDayKey: "2099-03-05", time: null })).toBe("Mar 5, 2099");
  });
  it("shows a multi-day range", () => {
    expect(formatEventWhen({ dayKey: "2099-03-05", endDayKey: "2099-03-07", time: null })).toBe(
      "Mar 5, 2099 – Mar 7, 2099",
    );
  });
});
```

```tsx
// apps/mobile/src/__tests__/use-dashboard.test.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn() },
}));

import { apiClient } from "../lib/api-client";
import { useMentorDashboard, useSeasonStaffDashboard, useStudentDashboard } from "../hooks/use-dashboard";

const get = apiClient.get as jest.Mock;

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

const notEnrolled = { variant: "STUDENT", season: null, progress: null, nextSession: null, assignments: null };

beforeEach(() => jest.clearAllMocks());

describe("dashboard hooks", () => {
  it("useSeasonStaffDashboard does not fire without a season (enabled guard)", () => {
    renderHook(() => useSeasonStaffDashboard(null), { wrapper: makeWrapper() });
    expect(get).not.toHaveBeenCalled();
  });

  it("useSeasonStaffDashboard sends the season", async () => {
    get.mockReturnValue(new Promise(() => {}));
    renderHook(() => useSeasonStaffDashboard(7), { wrapper: makeWrapper() });
    await waitFor(() => expect(get).toHaveBeenCalledWith("/api/v1/me/dashboard?seasonId=7"));
  });

  it("useStudentDashboard parses its own arm — and never sends a seasonId", async () => {
    get.mockResolvedValue({ data: { data: notEnrolled } });
    const { result } = renderHook(() => useStudentDashboard(null), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(notEnrolled);
    expect(get).toHaveBeenCalledWith("/api/v1/me/dashboard");
  });

  it("fails at the boundary when the server answers another variant (X10)", async () => {
    get.mockResolvedValue({ data: { data: { variant: "MENTOR", recentActivity: [] } } });
    const { result } = renderHook(() => useStudentDashboard(7), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("useMentorDashboard parses the MENTOR arm", async () => {
    get.mockResolvedValue({ data: { data: { variant: "MENTOR", recentActivity: [] } } });
    const { result } = renderHook(() => useMentorDashboard(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.data?.recentActivity).toEqual([]));
  });
});
```

Append to `apps/mobile/src/__tests__/query-client.test.ts`:

```ts
import { DASHBOARD_META } from "../lib/dashboard-invalidation";
import { queryKeys } from "../lib/query-keys";

describe("dashboard invalidation (spec 19 §7, D24)", () => {
  it("invalidates every dashboard query after a mutation tagged DASHBOARD_META, and only then", async () => {
    const client = createQueryClient();
    const key = queryKeys.dashboard.me(7);
    client.setQueryData(key, { stub: true });

    await client.getMutationCache().build(client, { mutationFn: async () => "ok" }).execute(undefined);
    expect(client.getQueryState(key)?.isInvalidated).toBe(false);

    await client
      .getMutationCache()
      .build(client, { mutationFn: async () => "ok", meta: DASHBOARD_META })
      .execute(undefined);
    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  });
});
```

Run: `cd apps/mobile && pnpm jest src/__tests__/dashboard-branch.test.ts src/__tests__/format.test.ts src/__tests__/use-dashboard.test.tsx src/__tests__/query-client.test.ts` → the new cases FAIL (modules/exports missing).

- [ ] **Step 2: Query keys**

Inside the `queryKeys` object in `apps/mobile/src/lib/query-keys.ts`:

```ts
  dashboard: {
    // Every dashboard query sits under `all`, so one invalidation after any
    // dashboard-moving mutation refreshes whichever variant is mounted
    // (spec 19 §7 "Invalidation").
    all: ["dashboard"] as const,
    // The season is part of the key: a staff user's current season, or the
    // student's token season — a refreshed token pointing elsewhere never
    // serves the old season's figures. null for the mentor.
    me: (seasonId: number | null) => [...queryKeys.dashboard.all, "me", { seasonId }] as const,
  },
```

- [ ] **Step 3: Hooks**

```ts
// apps/mobile/src/hooks/use-dashboard.ts
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import {
  mentorDashboardSchema,
  staffSeasonDashboardSchema,
  studentDashboardSchema,
  type MentorDashboard,
  type StaffSeasonDashboard,
  type StudentDashboard,
} from "@space/shared";

import { apiClient } from "../lib/api-client";
import { queryKeys } from "../lib/query-keys";

/**
 * Home is every role's most-refetched screen; a minute of freshness absorbs
 * focus/remount churn without letting the at-risk list go stale beyond that
 * (spec 19 §7, spec 09 §5 item 3).
 */
export const DASHBOARD_STALE_TIME = 60_000;

/*
 * One hook per variant, each parsing against ITS arm, not the union: a server
 * that answers a student with the staff shape fails here (X10, C8 #2) instead
 * of rendering. The role picks the hook; the hook never trusts the response
 * to say who the caller is.
 */

/** The server resolves the season from the token; the id is only the cache key. */
export function useStudentDashboard(activeSeasonId: number | null): UseQueryResult<StudentDashboard> {
  return useQuery({
    queryKey: queryKeys.dashboard.me(activeSeasonId),
    queryFn: async () => {
      const res = await apiClient.get("/api/v1/me/dashboard");
      return studentDashboardSchema.parse(res.data.data);
    },
    staleTime: DASHBOARD_STALE_TIME,
  });
}

/** ADMIN / LEADER. Gated: no current season → no request (the screen says "No season yet"). */
export function useSeasonStaffDashboard(seasonId: number | null): UseQueryResult<StaffSeasonDashboard> {
  return useQuery({
    queryKey: queryKeys.dashboard.me(seasonId),
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/me/dashboard?seasonId=${seasonId}`);
      return staffSeasonDashboardSchema.parse(res.data.data);
    },
    enabled: seasonId !== null,
    staleTime: DASHBOARD_STALE_TIME,
  });
}

export function useMentorDashboard(): UseQueryResult<MentorDashboard> {
  return useQuery({
    queryKey: queryKeys.dashboard.me(null),
    queryFn: async () => {
      const res = await apiClient.get("/api/v1/me/dashboard");
      return mentorDashboardSchema.parse(res.data.data);
    },
    staleTime: DASHBOARD_STALE_TIME,
  });
}
```

- [ ] **Step 4: Format helpers**

> **v1 parity 2026-10-09:** `firstName` becomes `name == null ? "there" : name.trim().split(/\s+/)[0]` (no empty fallback), and a second helper `studentFirstName(name)` = `name == null ? "there" : name.split(" ")[0]` serves the student greeting (v2 `apps/mobile/src/lib/format.ts:93-100`; v1 `alumni/dashboard/page.tsx:21`, `student/dashboard/page.tsx:88`) (R59). Also add `formatTimeUntil(iso)` (= `formatDistanceToNowStrict(date, { addSuffix: true })` on a future instant) for the next-session badge and the "Due in …" label (D23); `formatTimeAgo` can serve both if it is renamed `formatRelative`.

Add `formatDistanceToNowStrict` to the `date-fns` import in `apps/mobile/src/lib/format.ts` and append:

```ts
/**
 * The greeting's first name (spec 19 D21): first whitespace token of the
 * trimmed name, "there" when the name is null OR empty. v1's student and
 * alumni pages disagreed on exactly this.
 */
export function firstName(name: string | null | undefined): string {
  const first = (name ?? "").trim().split(/\s+/)[0];
  return first ? first : "there";
}

/**
 * An event's when-label from the server's org-calendar fields only (X13): the
 * day key(s) and the `HH:mm` wall time, which is null for an all-day event.
 * A same-day range collapses (spec 19 R11). Never formats `date`/`endDate`.
 */
export function formatEventWhen(e: { dayKey: string; endDayKey: string | null; time: string | null }): string {
  const start = formatDayKey(e.dayKey);
  const range =
    e.endDayKey !== null && e.endDayKey !== e.dayKey ? `${start} – ${formatDayKey(e.endDayKey)}` : start;
  return e.time !== null ? `${range} · ${e.time}` : range;
}

/**
 * "2 hours ago" — a RELATIVE label from an instant. The one thing the device
 * clock is good for (spec 19 D23); it buckets nothing by day.
 */
export function formatTimeAgo(iso: string | null): string {
  if (iso == null) return PLACEHOLDER;
  const date = parseISO(iso);
  if (!isValid(date)) return PLACEHOLDER;
  return formatDistanceToNowStrict(date, { addSuffix: true });
}
```

- [ ] **Step 5: Branch picker and the invalidation tag**

```ts
// apps/mobile/src/lib/dashboard-branch.ts
import type { NavAudience, UserRole } from "@space/shared";

export type DashboardBranch = UserRole | "ALUMNI";

/**
 * Which Home a user sees — the same audience rule as `navFor` (an alumnus is a
 * STUDENT with a graduationYear). One route, six branches (spec 19 §9).
 */
export function dashboardBranchFor(audience: NavAudience): DashboardBranch {
  if (audience.role === "STUDENT" && audience.graduationYear != null) return "ALUMNI";
  return audience.role;
}
```

```ts
// apps/mobile/src/lib/dashboard-invalidation.ts
/**
 * Tag for every mutation that moves a number on some role's Home (spec 19 §7
 * "Invalidation", D24): attendance marking and check-in, submission submit and
 * review, quiz grading and attempts, assignment writes, enrolment changes,
 * session writes, group assignment. `createQueryClient`'s MutationCache
 * invalidates `queryKeys.dashboard.all` after any successful mutation carrying
 * it — one handler, so a hook cannot invalidate the wrong key.
 *
 * Usage, inside a hook: `useMutation({ mutationFn, meta: DASHBOARD_META, ... })`.
 */
export const DASHBOARD_META = { invalidatesDashboard: true } as const;
```

Replace the body of `createQueryClient` in `apps/mobile/src/lib/query-client.ts`
(import `MutationCache` beside `QueryClient`, and `queryKeys` from `./query-keys`):

```ts
export function createQueryClient(): QueryClient {
  const client: QueryClient = new QueryClient({
    // Spec 19 D24: a mutation tagged DASHBOARD_META refreshes every role's
    // Home. Keyed on meta, not on mutation keys, so the tag is visible at the
    // hook that writes and greppable (Task 8's guard test reads it).
    mutationCache: new MutationCache({
      onSuccess: (_data, _variables, _context, mutation) => {
        if (mutation.meta?.invalidatesDashboard === true) {
          void client.invalidateQueries({ queryKey: queryKeys.dashboard.all });
        }
      },
    }),
    defaultOptions: {
      queries: {
        retry: 1,
        staleTime: 30_000,
        refetchOnWindowFocus: false,
      },
    },
  });
  return client;
}
```

(Keep the file's doc comment; add one line to it naming the mutation cache.)

- [ ] **Step 6: Run**

Run: `cd apps/mobile && pnpm jest src/__tests__/dashboard-branch.test.ts src/__tests__/format.test.ts src/__tests__/use-dashboard.test.tsx src/__tests__/query-client.test.ts` → PASS.
Run: `pnpm turbo lint typecheck --filter=@space/mobile` → clean.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile && git commit -m "feat(mobile): dashboard hooks per variant, format helpers, branch picker, tagged invalidation"
```

---

### Task 6: Mobile shared cards — `UpcomingEventsCard`, `StatTile`, `DashboardFrame`

**Files:**
- Create: `apps/mobile/src/components/dashboard/UpcomingEventsCard.tsx`
- Create: `apps/mobile/src/components/dashboard/StatTile.tsx` (`StatTile`, `TileRow`)
- Create: `apps/mobile/src/components/dashboard/DashboardFrame.tsx`
- Test: `apps/mobile/src/__tests__/upcoming-events-card.test.tsx`

**Interfaces:**
- Consumes: `useUpcomingEvents` result type (`UseQueryResult<JpcEventListResponse>`, Plan 14); `formatEventWhen` (Task 5); `NotificationBell` (Plan 13); `Screen`, `Card`, `Text`, state primitives.
- Produces: `<UpcomingEventsCard query={…} />` — takes the query result rather than owning it, so the branch that renders it can refetch it on pull-to-refresh and (SUPER) read `total` from the same response; `<StatTile label value caption? onPress? tone? />`, `<TileRow>`; `<DashboardFrame onRefresh refreshing>` — `Screen` with tab-screen edges and the bell first, which every branch renders.

- [ ] **Step 1: Failing test**

> **v1 parity 2026-10-09:** Replace the case "renders an EmptyState, not nothing, when no event qualifies (v1 R10)" with "renders nothing when no event qualifies (v1 R10)": `expect(screen.queryByText("Upcoming events")).toBeNull()` and no "No upcoming events" text (v1 `jpc-space/src/components/events/upcoming-events-card.tsx:30`).

```tsx
// apps/mobile/src/__tests__/upcoming-events-card.test.tsx
import { fireEvent, screen } from "@testing-library/react-native";
import { Linking } from "react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn() },
}));

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: (...args: unknown[]) => mockPush(...args) }),
}));

import { apiClient } from "../lib/api-client";
import { UpcomingEventsCard } from "../components/dashboard/UpcomingEventsCard";
import { useUpcomingEvents } from "../hooks/use-events";
import { renderWithProviders } from "./helpers/render";

const get = apiClient.get as jest.Mock;

const event = {
  id: 3,
  title: "Open day",
  date: "2099-03-05T16:30:00.000Z",
  endDate: null,
  dayKey: "2099-03-05",
  endDayKey: null,
  time: "18:30",
  allDay: false,
  url: null,
  visibility: "ALL",
  seasonId: null,
  seasonCode: null,
};

function Harness() {
  return <UpcomingEventsCard query={useUpcomingEvents(4)} />;
}

beforeEach(() => jest.clearAllMocks());

describe("UpcomingEventsCard (spec 19 R5–R11, D19)", () => {
  it("reads today-onwards, capped at four, from the server", async () => {
    get.mockResolvedValue({ data: { data: { events: [event], total: 1 } } });
    renderWithProviders(<Harness />);
    expect(await screen.findByText("Open day")).toBeTruthy();
    expect(screen.getByText("Mar 5, 2099 · 18:30")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/events?upcoming=true&limit=4");
  });

  it("renders an EmptyState, not nothing, when no event qualifies (v1 R10)", async () => {
    get.mockResolvedValue({ data: { data: { events: [], total: 0 } } });
    renderWithProviders(<Harness />);
    expect(await screen.findByText("No upcoming events")).toBeTruthy();
  });

  it("opens the event detail, or the external link when the event has one", async () => {
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    get.mockResolvedValue({
      data: { data: { events: [event, { ...event, id: 4, title: "Gala", url: "https://jpc.example/gala" }], total: 2 } },
    });
    renderWithProviders(<Harness />);

    fireEvent.press(await screen.findByLabelText("Open day, Mar 5, 2099 · 18:30"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/event/[id]", params: { id: "3" } });

    fireEvent.press(screen.getByLabelText("Gala, Mar 5, 2099 · 18:30"));
    expect(openURL).toHaveBeenCalledWith("https://jpc.example/gala");
  });

  it("fails on its own with a retry", async () => {
    get.mockRejectedValueOnce(new Error("down"));
    renderWithProviders(<Harness />);
    expect(await screen.findByText("Couldn't load upcoming events.")).toBeTruthy();
    get.mockResolvedValueOnce({ data: { data: { events: [event], total: 1 } } });
    fireEvent.press(screen.getByText("Try again"));
    expect(await screen.findByText("Open day")).toBeTruthy();
  });
});
```

Run: `cd apps/mobile && pnpm jest src/__tests__/upcoming-events-card.test.tsx` → FAIL (module missing).

- [ ] **Step 2: The components**

> **v1 parity 2026-10-09:** In `UpcomingEventsCard`, return `null` (before the `Card`) when `query.data?.events.length === 0`; delete the `EmptyState` arm (v2 `apps/mobile/src/components/dashboard/UpcomingEventsCard.tsx:25-27`; v1 `upcoming-events-card.tsx:30`). Loading and error arms stay.

```tsx
// apps/mobile/src/components/dashboard/UpcomingEventsCard.tsx
import type { UseQueryResult } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Linking, Pressable } from "react-native";
import type { JpcEventListResponse } from "@space/shared";

import { formatEventWhen } from "../../lib/format";
import { useTheme } from "../../theme";
import { Card, EmptyState, ErrorState, LoadingState, Text } from "../../ui";

/**
 * The card on all six dashboards (spec 19 R5). The window (today onwards in
 * the org zone), the cap and the visibility rule are the server's (Plan 14);
 * this renders rows. Unlike v1 it says so when there is nothing (R10).
 */
export function UpcomingEventsCard({ query }: { query: UseQueryResult<JpcEventListResponse> }) {
  const theme = useTheme();
  const router = useRouter();

  return (
    <Card style={{ marginBottom: theme.spacing.sm }}>
      <Text variant="heading">Upcoming events</Text>
      {query.isPending ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState message="Couldn't load upcoming events." onRetry={() => void query.refetch()} />
      ) : query.data.events.length === 0 ? (
        <EmptyState title="No upcoming events" message="Nothing is scheduled from today onwards." />
      ) : (
        query.data.events.map((e) => {
          const when = formatEventWhen(e);
          return (
            <Pressable
              key={e.id}
              accessibilityRole={e.url ? "link" : "button"}
              accessibilityLabel={`${e.title}, ${when}`}
              onPress={() => {
                // v1: an event with a url is an external link as a whole row (R11).
                if (e.url) void Linking.openURL(e.url);
                else router.push({ pathname: "/event/[id]", params: { id: String(e.id) } });
              }}
              style={{ paddingVertical: theme.spacing.sm }}
            >
              <Text variant="label">{e.title}</Text>
              <Text variant="caption" color={theme.colors.neutral[600]}>
                {when}
              </Text>
            </Pressable>
          );
        })
      )}
    </Card>
  );
}
```

```tsx
// apps/mobile/src/components/dashboard/StatTile.tsx
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";

import { useTheme } from "../../theme";
import { Card, Text } from "../../ui";

export interface StatTileProps {
  label: string;
  value: string;
  caption?: string;
  onPress?: () => void;
  /** "warning" highlights a count that needs attention (v1 R71). No red tiers (spec 19 D2). */
  tone?: "neutral" | "warning";
}

/** v1's stat-card: the whole tile is the link when it has a destination. */
export function StatTile({ label, value, caption, onPress, tone = "neutral" }: StatTileProps) {
  const theme = useTheme();
  const body = (
    <Card style={{ flex: 1 }}>
      <Text variant="caption" color={theme.colors.neutral[600]}>
        {label}
      </Text>
      <Text variant="title" color={tone === "warning" ? theme.colors.warning[700] : theme.colors.neutral[900]}>
        {value}
      </Text>
      {caption ? (
        <Text variant="caption" color={theme.colors.neutral[600]}>
          {caption}
        </Text>
      ) : null}
    </Card>
  );
  const a11yLabel = `${label}: ${value}`;

  return onPress ? (
    <Pressable accessibilityRole="button" accessibilityLabel={a11yLabel} onPress={onPress} style={{ flexBasis: "47%", flexGrow: 1 }}>
      {body}
    </Pressable>
  ) : (
    <View accessible accessibilityLabel={a11yLabel} style={{ flexBasis: "47%", flexGrow: 1 }}>
      {body}
    </View>
  );
}

export function TileRow({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm, marginBottom: theme.spacing.sm }}>
      {children}
    </View>
  );
}
```

```tsx
// apps/mobile/src/components/dashboard/DashboardFrame.tsx
import type { ReactNode } from "react";

import { Screen } from "../../ui";
import { NotificationBell } from "../NotificationBell";

/**
 * Every branch's outer frame: a tab screen (the tab bar owns the bottom inset)
 * with Plan 13's bell first — the dashboard is the one href in all six navs,
 * which is why the bell lives here (spec 10 D3). Each branch owns its queries
 * and therefore its own pull-to-refresh.
 */
export function DashboardFrame({
  children,
  onRefresh,
  refreshing = false,
}: {
  children: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  return (
    <Screen edges={["top", "left", "right"]} onRefresh={onRefresh} refreshing={refreshing}>
      <NotificationBell />
      {children}
    </Screen>
  );
}
```

- [ ] **Step 3: Run**

Run: `cd apps/mobile && pnpm jest src/__tests__/upcoming-events-card.test.tsx` → PASS.
Run: `pnpm turbo lint typecheck --filter=@space/mobile` → clean (typed routes: `/event/[id]` exists from Plan 14).

- [ ] **Step 4: Commit**

```bash
git add apps/mobile && git commit -m "feat(mobile): upcoming-events card with an empty state, stat tile, dashboard frame"
```

---

### Task 7: Mobile branches and the `/dashboard` switch

`dashboard.tsx` today (after Plans 1 and 13) renders Plan 13's `NotificationBell`,
Plan 1's `AssignmentsSummary`, and Phase 0's session list for
`scopes.activeSeasonId`. This task replaces the whole file: the bell moves into
`DashboardFrame` (kept, not dropped — spec D25 #3), `AssignmentsSummary` and
the `useStudentAssignments` import are **deleted** (its counts are now the
server's `assignments` summary — D15), and the session list leaves Home (it
lives on `/calendar`, Plan 4; the student's next session is a card here).

**Files:**
- Create: `apps/mobile/src/components/dashboard/SuperDashboard.tsx`
- Create: `apps/mobile/src/components/dashboard/SeasonStaffDashboard.tsx`
- Create: `apps/mobile/src/components/dashboard/MentorDashboard.tsx`
- Create: `apps/mobile/src/components/dashboard/StudentDashboard.tsx`
- Create: `apps/mobile/src/components/dashboard/AlumniDashboard.tsx`
- Modify (replace): `apps/mobile/app/(app)/dashboard.tsx`
- Test (replace): `apps/mobile/src/__tests__/dashboard.test.tsx`

**Interfaces:**
- Consumes: Task 5 hooks/helpers; Task 6 cards; `useCurrentSeasonId` (Plan 4); `useOrganisationReport`, `useEngagementReport` (Plan 15); `useUpcomingEvents` (Plan 14); `useMyAttendance` (Plan 11); `apiErrorMessage` (Plan 4); `AT_RISK_PCT`, `UPCOMING_EVENTS_LIMIT` (shared); `useSessionStore`.
- Produces: the six branch components; `/dashboard` as a role switch.

**Which test cases this replaces (say so in the commit body):** Phase 0's five
session-list cases ("distinct empty state when there is no active season",
"LoadingState while in flight", "ErrorState with onRetry", "EmptyState when the
season has no sessions", "renders session rows"); Plan 1 Task 5's "shows
pending and overdue assignment counts for a student" and "pull-to-refresh
refetches the assignments as well as the sessions". Their intent survives:
loading/error/empty mapping and pull-to-refresh are re-asserted per branch
below; the outstanding/overdue arithmetic is now pinned server-side by Task 2's
`summarizeStudentAssignments` test and Task 4's STUDENT case. Plan 13 Task 8's
three bell cases are **kept**, re-pointed at an ALUMNI session (the branch
with the fewest requests).

- [ ] **Step 1: Replace the test file (failing first)**

> **v1 parity 2026-10-09:** Update the expectations to v1 copy and layout: STUDENT — "Hi, Sara 👋", "2 assignments need your attention.", "Week 3 of 4 · 1 week to go" with "75% done", `Absence budget: 42%`, `Assignments: 2` with caption "pending" (no overdue caption), banner "1 assignment submitted late this season", "Next session" with "… · {durationMinutes} min · Hall" and a relative badge, "Watch recording" opens `youtubeUrl` (fixture session in the future), due-soon labels "Due Jan 5, 2020" (overdue) / "Due in …" and a "See all" → `/assignments` (R59, R64, R67–R69, R71–R74). ADMIN — hero "{n} students · Week 3 of 4", a "Progress" tile "75%" / "Week 3/4", an "All students" card listing every roster row (tap → `/student/[id]`, "View all" → `/students`), the "Students below 70% attendance" callout, an Assignments panel with "View all" → `/assignments`, a Quizzes panel "View all" → `/quizzes`; no at-risk preview, no "1 of 12" (R21, R22, R30, R31, R35, R36). LEADER — the same layout, "Group average attendance", "View all" → `/groups`, "Pending review" → `/submissions` (R41, R43). MENTOR — heading "Flagged for follow-up", "All students" → `/students`, no "1 of 34", empty "Nobody flagged" / "All students above the 60% engagement threshold.", activity as two blocks (marks then submissions), quick links Students / My notes / Reports / Settings (R47–R49, R53, R57). SUPER — `Students: 40`, `Upcoming events: <organisation.upcomingEventCount>` with no caption (R13, R15).

```tsx
// apps/mobile/src/__tests__/dashboard.test.tsx
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { AxiosError } from "axios";
import { Linking, ScrollView } from "react-native";

// `jest.mock` factories may only close over `mock*` consts (CLAUDE.md).
jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn() },
}));

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: (...args: unknown[]) => mockPush(...args) }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";

import DashboardScreen from "../../app/(app)/dashboard";

const get = apiClient.get as jest.Mock;
const UNREAD = "/api/v1/notifications/unread-count";
const EVENTS = "/api/v1/events?upcoming=true&limit=4";

/** Answer exactly these URLs; anything else rejects, so a stray request shows up as a failure. */
function serve(routes: Record<string, unknown>) {
  get.mockImplementation((url: string) =>
    url in routes
      ? Promise.resolve({ data: { data: routes[url] } })
      : Promise.reject(new Error(`not served: ${url}`)),
  );
}
const requested = () => get.mock.calls.map(([url]) => url as string);

const event = {
  id: 3,
  title: "Open day",
  date: "2099-03-05T16:30:00.000Z",
  endDate: null,
  dayKey: "2099-03-05",
  endDayKey: null,
  time: "18:30",
  allDay: false,
  url: null,
  visibility: "ALL",
  seasonId: null,
  seasonCode: null,
};
const events = { events: [event], total: 9 };

const liveSession = {
  id: 11,
  title: "Week 6",
  startsAt: "2099-03-01T16:00:00.000Z",
  dayKey: "2099-03-01",
  time: "18:00",
  durationMinutes: 90,
  location: "Hall",
  youtubeUrl: "https://youtu.be/live",
  isInProgress: true,
};

const studentDashboard = {
  variant: "STUDENT",
  season: { id: 7, code: "spring-2099", title: "Spring 2099", status: "ACTIVE" },
  progress: { sessionsHeld: 3, sessionsTotal: 4, pct: 75 },
  nextSession: liveSession,
  assignments: {
    outstandingCount: 2,
    overdueCount: 1,
    lateSubmittedCount: 1,
    dueSoon: [
      { id: 41, title: "Old essay", dueAt: "2020-01-05T10:00:00.000Z", dueOrgDay: "2020-01-05", isOverdue: true, status: "PENDING", reviewedAt: null },
      { id: 42, title: "New essay", dueAt: "2099-06-01T10:00:00.000Z", dueOrgDay: "2099-06-01", isOverdue: false, status: "DRAFT", reviewedAt: null },
    ],
  },
};

const myAttendance = {
  season: { id: 7, title: "Spring 2099", absenceBudgetMinutes: 180, absenceWeightMinutes: 90 },
  budget: { minutesUsed: 105, budgetMinutes: 180, budgetPct: 58, remainingPct: 42, absentCount: 1, lateCount: 1 },
  streak: 2,
  sessions: [],
};

const engagementRow = (studentUserId: number, studentName: string, score: number) => ({
  score,
  attendancePct: 33,
  submissionPct: 33,
  attendanceTotal: 3,
  attendancePresent: 1,
  submissionsExpected: 3,
  submissionsCompleted: 1,
  studentUserId,
  seasonId: 7,
  seasonTitle: "Spring 2099",
  atRisk: true,
  studentName,
  groupId: 5,
  groupName: "Group A",
});

const staffDashboard = (scope: "season" | "groups") => ({
  variant: "SEASON_STAFF",
  scope,
  season: { id: 7, code: "spring-2099", title: "Spring 2099", status: "ACTIVE" },
  groups: scope === "groups" ? [{ id: 5, name: "Group A" }, { id: 6, name: "Group B" }] : [],
  progress: { sessionsHeld: 3, sessionsTotal: 4, pct: 75 },
  nextSession: liveSession,
  cohort: {
    studentCount: 3,
    meanAttendancePct: 33,
    atRiskTotal: 12,
    atRisk: [engagementRow(21, "Sara Student", 33)],
  },
  submissions: { pendingReview: 1, reviewed: 2 },
  quizzes: { total: 2, pending: 2, fullyGraded: 0, drafts: 1 },
});

// Same row shape as Plan 4's use-seasons.test.tsx.
const seasonRow = {
  id: 7,
  code: "s7",
  title: "Spring 2099",
  program: "TEST",
  year: 2099,
  status: "ACTIVE",
  startDate: "2099-01-01T00:00:00.000Z",
  endDate: "2099-12-31T00:00:00.000Z",
};

const engagementSummary = {
  scope: { seasonIds: [7], seasons: [{ id: 7, code: "spring-2099", title: "Spring 2099" }], truncated: false, label: "All seasons" },
  attendanceTrend: [],
  completion: [],
  bands: [
    { band: "HIGH", count: 3 },
    { band: "MEDIUM", count: 5 },
    { band: "LOW", count: 2 },
    { band: "AT_RISK", count: 34 },
  ],
  atRisk: [
    {
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
      band: "AT_RISK",
    },
  ],
  atRiskTotal: 34,
  cohortSize: 40,
  enrollmentCount: 44,
  generatedAt: "2099-03-10T00:00:00.000Z",
  exportDay: "2099-03-10",
};

const mentorDashboard = {
  variant: "MENTOR",
  recentActivity: [
    {
      key: "rev:9",
      kind: "reviewed",
      at: "2099-05-03T09:00:00.000Z",
      studentUserId: 22,
      studentName: "Omar",
      subjectTitle: "Feed essay",
      attendanceStatus: null,
      submissionPublicId: "pub0000009",
    },
    {
      key: "att:4",
      kind: "attendance",
      at: "2099-05-01T09:00:00.000Z",
      studentUserId: 23,
      studentName: "Mona",
      subjectTitle: "Week 6",
      attendanceStatus: "PRESENT",
      submissionPublicId: null,
    },
  ],
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
      status: "ACTIVE",
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

describe("DashboardScreen — STUDENT", () => {
  beforeEach(() => {
    useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }, { name: "Sara Mansour" }));
  });

  it("renders the server's figures and requests only what the student branch owns (C8 #2 at the client)", async () => {
    serve({ "/api/v1/me/dashboard": studentDashboard, "/api/v1/me/attendance": myAttendance, [EVENTS]: events, [UNREAD]: { unreadCount: 0 } });
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true);

    renderWithProviders(<DashboardScreen />);

    expect(await screen.findByText("Welcome back, Sara")).toBeTruthy();
    expect(screen.getByText("2 assignments need your attention")).toBeTruthy();
    expect(screen.getByText("Session 3 of 4 · 1 session to go")).toBeTruthy();
    expect(await screen.findByLabelText("Absence budget left: 42%")).toBeTruthy();
    expect(screen.getByLabelText("Streak: 2")).toBeTruthy();
    expect(screen.getByLabelText("To do: 2")).toBeTruthy();
    expect(screen.getByText("You submitted 1 assignment late this season.")).toBeTruthy();
    expect(screen.getByText("Happening now")).toBeTruthy();
    expect(screen.getByText("Mar 1, 2099 · 18:00 · Hall")).toBeTruthy();
    expect(screen.getByText("Overdue · was due Jan 5, 2020")).toBeTruthy();
    expect(screen.getByText("Due Jun 1, 2099")).toBeTruthy();
    expect(await screen.findByText("Open day")).toBeTruthy();

    fireEvent.press(screen.getByText("Join stream"));
    expect(openURL).toHaveBeenCalledWith("https://youtu.be/live");
    fireEvent.press(screen.getByLabelText("Absence budget left: 42%"));
    expect(mockPush).toHaveBeenCalledWith("/attendance");
    fireEvent.press(screen.getByLabelText("New essay, Due Jun 1, 2099"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/assignment/[id]", params: { id: "42" } });

    expect(new Set(requested())).toEqual(new Set(["/api/v1/me/dashboard", "/api/v1/me/attendance", EVENTS, UNREAD]));
  });

  it("is told 'not enrolled' by the server and offers the profile (R63)", async () => {
    useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: null }, { name: "Sara" }));
    serve({
      "/api/v1/me/dashboard": { variant: "STUDENT", season: null, progress: null, nextSession: null, assignments: null },
      [EVENTS]: events,
      [UNREAD]: { unreadCount: 0 },
    });

    renderWithProviders(<DashboardScreen />);

    expect(await screen.findByText("Not enrolled yet")).toBeTruthy();
    expect(screen.getByText("Welcome to JPC Space")).toBeTruthy();
    fireEvent.press(screen.getByText("Complete your profile"));
    expect(mockPush).toHaveBeenCalledWith("/profile");
    // No season → the budget read is gated off (Plan 11's enabled guard).
    expect(requested()).not.toContain("/api/v1/me/attendance");
  });

  it("keeps the budget tile when the events card fails — cards fail independently", async () => {
    serve({ "/api/v1/me/dashboard": studentDashboard, "/api/v1/me/attendance": myAttendance, [UNREAD]: { unreadCount: 0 } });

    renderWithProviders(<DashboardScreen />);

    expect(await screen.findByText("Couldn't load upcoming events.")).toBeTruthy();
    expect(await screen.findByLabelText("Absence budget left: 42%")).toBeTruthy();
  });

  it("shows ErrorState wired to refetch when the dashboard read fails", async () => {
    serve({ "/api/v1/me/attendance": myAttendance, [EVENTS]: events, [UNREAD]: { unreadCount: 0 } });

    renderWithProviders(<DashboardScreen />);

    expect(await screen.findByText("Couldn't load your dashboard.")).toBeTruthy();
    serve({ "/api/v1/me/dashboard": studentDashboard, "/api/v1/me/attendance": myAttendance, [EVENTS]: events, [UNREAD]: { unreadCount: 0 } });
    fireEvent.press(screen.getAllByText("Try again")[0]!);
    expect(await screen.findByText("Session 3 of 4 · 1 session to go")).toBeTruthy();
  });

  it("pull-to-refresh refetches every query the branch owns", async () => {
    serve({ "/api/v1/me/dashboard": studentDashboard, "/api/v1/me/attendance": myAttendance, [EVENTS]: events, [UNREAD]: { unreadCount: 0 } });
    renderWithProviders(<DashboardScreen />);
    await screen.findByLabelText("Absence budget left: 42%");
    get.mockClear();

    await act(async () => {
      screen.UNSAFE_getByType(ScrollView).props.refreshControl.props.onRefresh();
    });

    await waitFor(() => {
      expect(get).toHaveBeenCalledWith("/api/v1/me/dashboard");
      expect(get).toHaveBeenCalledWith("/api/v1/me/attendance");
      expect(get).toHaveBeenCalledWith(EVENTS);
    });
  });
});

describe("DashboardScreen — ALUMNI", () => {
  it("greets by first name with the class year and never calls /me/dashboard (D21)", async () => {
    useSessionStore.setState(makeSession("STUDENT", { graduationYear: 2024 }, { name: "  Nour Adel " }));
    serve({ [EVENTS]: events, [UNREAD]: { unreadCount: 0 } });

    renderWithProviders(<DashboardScreen />);

    expect(await screen.findByText("Welcome back, Nour")).toBeTruthy();
    expect(screen.getByText("JPCS Alumnus · Class of 2024")).toBeTruthy();
    fireEvent.press(screen.getByText("View my history"));
    expect(mockPush).toHaveBeenCalledWith("/history");
    expect(await screen.findByText("Open day")).toBeTruthy();
    expect(new Set(requested())).toEqual(new Set([EVENTS, UNREAD]));
  });
});

describe("DashboardScreen — ADMIN and LEADER", () => {
  it("admin: current season from useCurrentSeasonId, the at-risk preview, no roster, no reports read", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    serve({
      "/api/v1/seasons": { seasons: [seasonRow] },
      "/api/v1/me/dashboard?seasonId=7": staffDashboard("season"),
      [EVENTS]: events,
      [UNREAD]: { unreadCount: 0 },
    });

    renderWithProviders(<DashboardScreen />);

    expect(await screen.findByText("Spring 2099")).toBeTruthy();
    expect(screen.getByText("Session 3 of 4")).toBeTruthy();
    expect(screen.getByText("Average attendance 33%")).toBeTruthy();
    expect(screen.getByText("Happening now")).toBeTruthy();
    expect(screen.getByText("1 of 12")).toBeTruthy();
    expect(screen.getByLabelText("Quizzes pending: 2")).toBeTruthy();
    expect(screen.getByText("1 quiz draft not yet published")).toBeTruthy();

    fireEvent.press(screen.getByLabelText("Sara Student, 33% attendance, 1 of 3 submitted"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/student/[id]", params: { id: "21" } });
    fireEvent.press(screen.getByLabelText("Pending review: 1"));
    expect(mockPush).toHaveBeenCalledWith("/submissions");
    fireEvent.press(screen.getByText("View all"));
    expect(mockPush).toHaveBeenCalledWith("/students");

    expect(requested().some((u) => u.startsWith("/api/v1/reports"))).toBe(false);
  });

  it("admin with no season: 'No season yet', and no dashboard request (enabled guard)", async () => {
    useSessionStore.setState(makeSession("ADMIN"));
    serve({ "/api/v1/seasons": { seasons: [] }, [EVENTS]: events, [UNREAD]: { unreadCount: 0 } });

    renderWithProviders(<DashboardScreen />);

    expect(await screen.findByText("No season yet")).toBeTruthy();
    expect(requested().some((u) => u.startsWith("/api/v1/me/dashboard"))).toBe(false);
  });

  it("leader: every group named, 'View all' goes to /groups, the attendance label says 'group'", async () => {
    useSessionStore.setState(makeSession("LEADER", { groupLeaderIds: [5, 6] }));
    serve({
      "/api/v1/seasons": { seasons: [seasonRow] },
      "/api/v1/me/dashboard?seasonId=7": staffDashboard("groups"),
      [EVENTS]: events,
      [UNREAD]: { unreadCount: 0 },
    });

    renderWithProviders(<DashboardScreen />);

    expect(await screen.findByText("Group A, Group B")).toBeTruthy();
    expect(screen.getByText("Group average attendance 33%")).toBeTruthy();
    expect(screen.getByText("Your students at risk")).toBeTruthy();
    fireEvent.press(screen.getByText("View all"));
    expect(mockPush).toHaveBeenCalledWith("/groups");
  });

  it("leader refused for the season: shows the server's message", async () => {
    useSessionStore.setState(makeSession("LEADER", { groupLeaderIds: [5] }));
    get.mockImplementation((url: string) => {
      if (url === "/api/v1/seasons") return Promise.resolve({ data: { data: { seasons: [seasonRow] } } });
      if (url === EVENTS) return Promise.resolve({ data: { data: events } });
      if (url === UNREAD) return Promise.resolve({ data: { data: { unreadCount: 0 } } });
      return Promise.reject(
        Object.assign(new AxiosError("Forbidden"), {
          response: { status: 403, data: { error: { code: "forbidden", message: "You don't have access to this." } } },
        }),
      );
    });

    renderWithProviders(<DashboardScreen />);

    expect(await screen.findByText("You don't have access to this.")).toBeTruthy();
  });
});

describe("DashboardScreen — MENTOR", () => {
  it("at-risk from Reports (same cache), a merged feed linking to students and submissions (D17, D18)", async () => {
    useSessionStore.setState(makeSession("MENTOR"));
    serve({
      "/api/v1/reports/engagement": engagementSummary,
      "/api/v1/me/dashboard": mentorDashboard,
      [EVENTS]: events,
      [UNREAD]: { unreadCount: 0 },
    });

    renderWithProviders(<DashboardScreen />);

    expect(await screen.findByText("At risk")).toBeTruthy();
    expect(await screen.findByText("1 of 34")).toBeTruthy();
    expect(screen.queryByText("Flagged for follow-up")).toBeNull();

    fireEvent.press(await screen.findByLabelText("Omar received feedback on Feed essay"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/submission/[publicId]", params: { publicId: "pub0000009" } });
    fireEvent.press(screen.getByLabelText("Mona was present at Week 6"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/student/[id]", params: { id: "23" } });

    expect(requested()).not.toContain("/api/v1/seasons");
  });

  it("names the actual rule when nobody is at risk", async () => {
    useSessionStore.setState(makeSession("MENTOR"));
    serve({
      "/api/v1/reports/engagement": { ...engagementSummary, atRisk: [], atRiskTotal: 0 },
      "/api/v1/me/dashboard": { variant: "MENTOR", recentActivity: [] },
      [EVENTS]: events,
      [UNREAD]: { unreadCount: 0 },
    });

    renderWithProviders(<DashboardScreen />);

    expect(await screen.findByText("Nobody at risk")).toBeTruthy();
    expect(screen.getByText("No student has attendance or submissions below 60%.")).toBeTruthy();
    expect(await screen.findByText("No recent activity.")).toBeTruthy();
  });
});

describe("DashboardScreen — SUPER", () => {
  it("organisation tiles share Reports' cache; the events tile reads `total` from the card's response (D19, D20)", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    serve({ "/api/v1/reports/organisation": organisation, [EVENTS]: events, [UNREAD]: { unreadCount: 0 } });

    renderWithProviders(<DashboardScreen />);

    expect(await screen.findByLabelText("Students (not graduated): 40")).toBeTruthy();
    expect(screen.getByLabelText("Alumni: 12")).toBeTruthy();
    // seasons.length (all statuses), NOT activeSeasonCount (2).
    expect(screen.getByLabelText("Seasons: 1")).toBeTruthy();
    expect(await screen.findByLabelText("Upcoming events: 9")).toBeTruthy();

    fireEvent.press(screen.getByLabelText("Alumni: 12"));
    expect(mockPush).toHaveBeenCalledWith("/students/alumni");
    expect(requested().some((u) => u.startsWith("/api/v1/me/dashboard"))).toBe(false);
  });
});

// Plan 13 Task 8's bell cases, kept; now on a signed-in ALUMNI session.
describe("NotificationBell on the dashboard", () => {
  function mockUnreadCount(unreadCount: number) {
    serve({ [UNREAD]: { unreadCount }, [EVENTS]: events });
  }
  beforeEach(() => {
    useSessionStore.setState(makeSession("STUDENT", { graduationYear: 2024 }));
  });

  it("shows the unread badge and opens the inbox", async () => {
    mockUnreadCount(3);
    renderWithProviders(<DashboardScreen />);
    expect(await screen.findByLabelText("Notifications, 3 unread")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Notifications, 3 unread"));
    expect(mockPush).toHaveBeenCalledWith("/notifications");
  });

  it("caps the badge at 9+", async () => {
    mockUnreadCount(42);
    renderWithProviders(<DashboardScreen />);
    expect(await screen.findByText("9+")).toBeTruthy();
  });

  it("renders no badge at zero unread", async () => {
    mockUnreadCount(0);
    renderWithProviders(<DashboardScreen />);
    expect(await screen.findByLabelText("Notifications")).toBeTruthy();
    expect(screen.queryByText("0")).toBeNull();
  });
});
```

Run: `cd apps/mobile && pnpm jest src/__tests__/dashboard.test.tsx` → FAIL (branches not built; the bell cases may pass already).

- [ ] **Step 2: STUDENT branch**

> **v1 parity 2026-10-09:** `StudentDashboard` (v2 `apps/mobile/src/components/dashboard/StudentDashboard.tsx`): greeting `Hi, ${studentFirstName(name)} 👋` (`:63`, R59); subtitle strings "… your attention." / "You're all caught up this week." (`:22-29`, R67); hero `${pct ?? 0}% done` ring plus "Week N of M · K week(s) to go" / "· complete" (`:84-96`, R68); budget tile label "Absence budget", caption "this season" (`:107`, R69 — not "Attendance"); tile "Assignments", caption "pending", no overdue caption (`:120-129`, R71); banner `${n} assignment${n !== 1 ? "s" : ""} submitted late this season` (`:132-142`, R72); next-session card label "Next session" always, adds "{durationMinutes} min", the location and a relative badge from `startsAt` (`:146-170`, R64); "Watch recording" whenever `youtubeUrl` is set, no `isInProgress` (`:170-177`, R74); due-soon label: overdue → `Due ${formatDayKey(dueOrgDay)}` (error colour), otherwise `Due in ${relative from dueAt}` (warning colour), none when `dueAt` is null, plus "See all" → `/assignments` (`:30-34`, `:180-202`, R73). v1: `jpc-space/src/app/student/dashboard/page.tsx:69-101`, `:132-288`.

```tsx
// apps/mobile/src/components/dashboard/StudentDashboard.tsx
import { useRouter } from "expo-router";
import { Linking, Pressable, View } from "react-native";
import { UPCOMING_EVENTS_LIMIT, type DashboardDueItem, type StudentDashboard as StudentData } from "@space/shared";

import { useStudentDashboard } from "../../hooks/use-dashboard";
import { useUpcomingEvents } from "../../hooks/use-events";
import { useMyAttendance } from "../../hooks/use-self-service";
import { firstName, formatDayKey } from "../../lib/format";
import { useSessionStore } from "../../store/session";
import { useTheme } from "../../theme";
import { Button, Card, EmptyState, ErrorState, LoadingState, Text } from "../../ui";
import { DashboardFrame } from "./DashboardFrame";
import { StatTile, TileRow } from "./StatTile";
import { UpcomingEventsCard } from "./UpcomingEventsCard";

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

function subtitle(data: StudentData | undefined): string {
  if (!data?.season || !data.assignments) return "Welcome to JPC Space";
  const n = data.assignments.outstandingCount;
  // v1 said "all caught up this week" while counting the whole season (R67).
  return n > 0
    ? `${n} ${plural(n, "assignment needs", "assignments need")} your attention`
    : "You're all caught up";
}

function dueLabel(a: DashboardDueItem): string {
  // Org-calendar day from the server (X13); "overdue" is the server's flag (C2).
  if (a.isOverdue) return `Overdue · was due ${formatDayKey(a.dueOrgDay)}`;
  return a.dueOrgDay ? `Due ${formatDayKey(a.dueOrgDay)}` : "No due date";
}

export function StudentDashboard() {
  const theme = useTheme();
  const router = useRouter();
  const name = useSessionStore((s) => s.user?.name ?? null);
  const activeSeasonId = useSessionStore((s) => s.scopes?.activeSeasonId ?? null);

  const dash = useStudentDashboard(activeSeasonId);
  // Domain 4's numbers through domain 4's endpoint and cache (spec 19 §7, D14).
  // Gated on the season inside the hook (Plan 11).
  const attendance = useMyAttendance(activeSeasonId);
  const events = useUpcomingEvents(UPCOMING_EVENTS_LIMIT);

  const refresh = () => {
    void dash.refetch();
    // `enabled` gates only the automatic run — guard the manual one too.
    if (activeSeasonId !== null) void attendance.refetch();
    void events.refetch();
  };

  const data = dash.data;

  return (
    <DashboardFrame
      onRefresh={refresh}
      refreshing={dash.isRefetching || attendance.isRefetching || events.isRefetching}
    >
      <Text variant="title">{`Welcome back, ${firstName(name)}`}</Text>
      <Text variant="body" color={theme.colors.neutral[600]} style={{ marginBottom: theme.spacing.md }}>
        {subtitle(data)}
      </Text>

      {dash.isPending ? (
        <LoadingState />
      ) : dash.isError ? (
        <ErrorState message="Couldn't load your dashboard." onRetry={() => void dash.refetch()} />
      ) : data === undefined || data.season === null ? (
        <EmptyState
          title="Not enrolled yet"
          message="You're not enrolled in a season yet. Make sure your profile is complete."
          action={<Button title="Complete your profile" onPress={() => router.push("/profile")} />}
        />
      ) : (
        <>
          {data.progress ? (
            <Card style={{ marginBottom: theme.spacing.sm }}>
              <Text variant="heading">{data.season.title}</Text>
              <Text variant="label" color={theme.colors.neutral[600]}>
                {data.progress.pct === null
                  ? "No sessions scheduled yet"
                  : data.progress.pct === 100
                    ? `Session ${data.progress.sessionsHeld} of ${data.progress.sessionsTotal} · complete`
                    : `Session ${data.progress.sessionsHeld} of ${data.progress.sessionsTotal} · ${
                        data.progress.sessionsTotal - data.progress.sessionsHeld
                      } ${plural(data.progress.sessionsTotal - data.progress.sessionsHeld, "session", "sessions")} to go`}
              </Text>
            </Card>
          ) : null}

          {attendance.isError ? (
            <ErrorState message="Couldn't load your attendance." onRetry={() => void attendance.refetch()} />
          ) : (
            <TileRow>
              <StatTile
                label="Absence budget left"
                value={attendance.data?.budget ? `${attendance.data.budget.remainingPct}%` : "—"}
                caption="this season"
                onPress={() => router.push("/attendance")}
              />
              <StatTile
                label="Streak"
                value={attendance.data ? String(attendance.data.streak) : "—"}
                caption="sessions in a row"
              />
            </TileRow>
          )}

          {data.assignments ? (
            <TileRow>
              <StatTile
                label="To do"
                value={String(data.assignments.outstandingCount)}
                caption={`${data.assignments.overdueCount} overdue`}
                tone={data.assignments.outstandingCount > 0 ? "warning" : "neutral"}
                onPress={() => router.push("/assignments")}
              />
            </TileRow>
          ) : null}

          {data.assignments && data.assignments.lateSubmittedCount > 0 ? (
            <Card style={{ marginBottom: theme.spacing.sm, backgroundColor: theme.colors.warning[50] }}>
              <Text variant="label" color={theme.colors.warning[800]}>
                {`You submitted ${data.assignments.lateSubmittedCount} ${plural(
                  data.assignments.lateSubmittedCount,
                  "assignment",
                  "assignments",
                )} late this season.`}
              </Text>
            </Card>
          ) : null}

          <Card style={{ marginBottom: theme.spacing.sm }}>
            {data.nextSession ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Session ${data.nextSession.title}`}
                onPress={() =>
                  router.push({ pathname: "/session/[id]", params: { id: String(data.nextSession?.id) } })
                }
              >
                <Text variant="caption" color={theme.colors.neutral[600]}>
                  {data.nextSession.isInProgress ? "Happening now" : "Next session"}
                </Text>
                <Text variant="heading">{data.nextSession.title}</Text>
                <Text variant="label" color={theme.colors.neutral[600]}>
                  {`${formatDayKey(data.nextSession.dayKey)} · ${data.nextSession.time}${
                    data.nextSession.location ? ` · ${data.nextSession.location}` : ""
                  }`}
                </Text>
              </Pressable>
            ) : (
              <Text variant="body">No upcoming sessions.</Text>
            )}
            {/* D13: a stream link only while the session is running; never "Watch recording" on a future one. */}
            {data.nextSession?.isInProgress && data.nextSession.youtubeUrl ? (
              <Button
                title="Join stream"
                variant="secondary"
                onPress={() => void Linking.openURL(data.nextSession?.youtubeUrl ?? "")}
              />
            ) : null}
          </Card>

          {data.assignments && data.assignments.dueSoon.length > 0 ? (
            <Card style={{ marginBottom: theme.spacing.sm }}>
              <Text variant="heading">Due soon</Text>
              {data.assignments.dueSoon.map((a) => (
                <Pressable
                  key={a.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${a.title}, ${dueLabel(a)}`}
                  onPress={() => router.push({ pathname: "/assignment/[id]", params: { id: String(a.id) } })}
                  style={{ paddingVertical: theme.spacing.sm }}
                >
                  <Text variant="label">{a.title}</Text>
                  <Text
                    variant="caption"
                    color={a.isOverdue ? theme.colors.error[600] : theme.colors.warning[700]}
                  >
                    {dueLabel(a)}
                  </Text>
                </Pressable>
              ))}
            </Card>
          ) : null}
        </>
      )}

      <View style={{ marginTop: theme.spacing.sm }}>
        <UpcomingEventsCard query={events} />
      </View>
    </DashboardFrame>
  );
}
```

(The `?.` on `data.nextSession` inside the two callbacks is for TypeScript's
closure narrowing only; the branch already rendered because it is non-null.)

- [ ] **Step 3: ALUMNI branch**

> **v1 parity 2026-10-09:** Alumni greeting uses the reverted `firstName` (no empty fallback) (R59, `jpc-space/src/app/alumni/dashboard/page.tsx:21`, `:33`).

```tsx
// apps/mobile/src/components/dashboard/AlumniDashboard.tsx
import { useRouter } from "expo-router";
import { UPCOMING_EVENTS_LIMIT } from "@space/shared";

import { useUpcomingEvents } from "../../hooks/use-events";
import { firstName } from "../../lib/format";
import { useSessionStore } from "../../store/session";
import { useTheme } from "../../theme";
import { Button, Card, Text } from "../../ui";
import { DashboardFrame } from "./DashboardFrame";
import { UpcomingEventsCard } from "./UpcomingEventsCard";

/**
 * v1's alumni page: a greeting, the class year, one link (R59–R61). Its data
 * is the session (`/me`) and the events card — never `/me/dashboard`, which
 * answers an alumnus 403 (spec 19 §7).
 */
export function AlumniDashboard() {
  const theme = useTheme();
  const router = useRouter();
  const name = useSessionStore((s) => s.user?.name ?? null);
  const graduationYear = useSessionStore((s) => s.scopes?.graduationYear ?? null);
  const events = useUpcomingEvents(UPCOMING_EVENTS_LIMIT);

  return (
    <DashboardFrame onRefresh={() => void events.refetch()} refreshing={events.isRefetching}>
      <Card style={{ marginBottom: theme.spacing.sm }}>
        <Text variant="title">{`Welcome back, ${firstName(name)}`}</Text>
        <Text variant="label" color={theme.colors.neutral[600]}>
          {`JPCS Alumnus · Class of ${graduationYear ?? "—"}`}
        </Text>
        <Button title="View my history" variant="secondary" onPress={() => router.push("/history")} />
      </Card>
      <UpcomingEventsCard query={events} />
    </DashboardFrame>
  );
}
```

- [ ] **Step 4: ADMIN / LEADER branch**

> **v1 parity 2026-10-09:** `SeasonStaffDashboard` (v2 `apps/mobile/src/components/dashboard/SeasonStaffDashboard.tsx`), ADMIN and LEADER alike (R41): hero "{studentCount} students · Week {held} of {total}" (week part omitted when total = 0) and the season/group average coloured by `attendanceTier` (`:33-39`, R22, R30); a stat row Students → `/students` (leader `/groups`), "Progress" `{pct ?? 0}%` / "Week N/M", Quizzes pending → `/quizzes` (`:42-59`, R22); next-session card "Next session", day · time · "{durationMinutes} min" · location, a relative badge, "Watch recording" when `youtubeUrl` is set (`:62-81`, R21); replace the at-risk card (`:83-129`) with an "All students" card over `cohort.roster` — name, attendance % in its tier colour ("—" omitted when null), "{pending} pending" badge when > 0, row → `/student/[id]`, "View all" → `/students` (leader `/groups`), empty "No students enrolled" (leader "No students yet") (R24, R27, R28, R35); an "Assignments" panel (Pending review / Reviewed) with "View all" → `/assignments` for ADMIN, `/submissions` for LEADER (R36, R43); a "Quizzes" panel with "View all" → `/quizzes` (R36); and last, when `cohort.belowThreshold` is non-empty, a red callout "Students below 70% attendance" with the names joined by ", " (R31). v1: `jpc-space/src/app/admin/dashboard/page.tsx:132-377`, `leader/dashboard/page.tsx:90-145`, `:168`, `:256`.

```tsx
// apps/mobile/src/components/dashboard/SeasonStaffDashboard.tsx
import { useRouter } from "expo-router";
import { Pressable } from "react-native";
import { AT_RISK_PCT, UPCOMING_EVENTS_LIMIT, type StaffSeasonDashboard } from "@space/shared";

import { useSeasonStaffDashboard } from "../../hooks/use-dashboard";
import { useUpcomingEvents } from "../../hooks/use-events";
import { useCurrentSeasonId } from "../../hooks/use-seasons";
import { apiErrorMessage } from "../../lib/api-error";
import { formatDayKey } from "../../lib/format";
import { useTheme } from "../../theme";
import { Card, EmptyState, ErrorState, LoadingState, Text } from "../../ui";
import { DashboardFrame } from "./DashboardFrame";
import { StatTile, TileRow } from "./StatTile";
import { UpcomingEventsCard } from "./UpcomingEventsCard";

function StaffSummary({ data, role }: { data: StaffSeasonDashboard; role: "ADMIN" | "LEADER" }) {
  const theme = useTheme();
  const router = useRouter();
  const isLeader = role === "LEADER";
  const { progress, cohort, submissions, quizzes, nextSession } = data;
  const mean = cohort.meanAttendancePct === null ? "—" : `${cohort.meanAttendancePct}%`;

  return (
    <>
      <Card style={{ marginBottom: theme.spacing.sm }}>
        <Text variant="title">{data.season.title}</Text>
        {data.groups.length > 0 ? (
          // D7: every group the leader leads in this season, not v1's arbitrary first one.
          <Text variant="label" color={theme.colors.neutral[600]}>
            {data.groups.map((g) => g.name).join(", ")}
          </Text>
        ) : null}
        <Text variant="body">
          {progress.pct === null ? "No sessions scheduled yet" : `Session ${progress.sessionsHeld} of ${progress.sessionsTotal}`}
        </Text>
        {/* Neutral, no 70/85 colour tiers (D2); "—" when nobody has had a session (D5). */}
        <Text variant="body">{`${isLeader ? "Group average attendance" : "Average attendance"} ${mean}`}</Text>
      </Card>

      <TileRow>
        <StatTile
          label="Students"
          value={String(cohort.studentCount)}
          onPress={() => router.push(isLeader ? "/groups" : "/students")}
        />
        <StatTile
          label="Quizzes pending"
          value={String(quizzes.pending)}
          tone={quizzes.pending > 0 ? "warning" : "neutral"}
          onPress={() => router.push("/quizzes")}
        />
        <StatTile
          label="Pending review"
          value={String(submissions.pendingReview)}
          caption={`${submissions.reviewed} reviewed`}
          onPress={() => router.push("/submissions")}
        />
      </TileRow>

      <Card style={{ marginBottom: theme.spacing.sm }}>
        {nextSession ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Session ${nextSession.title}`}
            onPress={() => router.push({ pathname: "/session/[id]", params: { id: String(nextSession.id) } })}
          >
            <Text variant="caption" color={theme.colors.neutral[600]}>
              {nextSession.isInProgress ? "Happening now" : "Next session"}
            </Text>
            <Text variant="heading">{nextSession.title}</Text>
            <Text variant="label" color={theme.colors.neutral[600]}>
              {`${formatDayKey(nextSession.dayKey)} · ${nextSession.time}`}
            </Text>
          </Pressable>
        ) : (
          <Text variant="body">No upcoming sessions.</Text>
        )}
      </Card>

      <Card style={{ marginBottom: theme.spacing.sm }}>
        <Text variant="heading">{isLeader ? "Your students at risk" : "At risk"}</Text>
        {cohort.atRisk.length === 0 ? (
          <EmptyState
            title="Nobody at risk"
            message={`No student has attendance or submissions below ${AT_RISK_PCT}%.`}
          />
        ) : (
          <>
            <Text variant="caption" color={theme.colors.neutral[600]}>
              {`${cohort.atRisk.length} of ${cohort.atRiskTotal}`}
            </Text>
            {cohort.atRisk.map((r) => {
              // D4: "N of M submitted" straight from the engagement row — no client subtraction.
              const line = `${r.attendancePct}% attendance, ${r.submissionsCompleted} of ${r.submissionsExpected} submitted`;
              return (
                <Pressable
                  key={`${r.studentUserId}:${r.seasonId}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${r.studentName}, ${line}`}
                  onPress={() => router.push({ pathname: "/student/[id]", params: { id: String(r.studentUserId) } })}
                  style={{ paddingVertical: theme.spacing.sm }}
                >
                  <Text variant="label" color={theme.colors.error[600]}>
                    {r.studentName}
                  </Text>
                  <Text variant="caption" color={theme.colors.neutral[600]}>
                    {line}
                  </Text>
                </Pressable>
              );
            })}
          </>
        )}
        {/* D6: no full roster on Home — the roster screens already exist. */}
        <Pressable accessibilityRole="link" onPress={() => router.push(isLeader ? "/groups" : "/students")}>
          <Text variant="label">View all</Text>
        </Pressable>
      </Card>

      {quizzes.total > 0 || quizzes.drafts > 0 ? (
        <Card style={{ marginBottom: theme.spacing.sm }}>
          <Text variant="heading">Quizzes</Text>
          <Text variant="body">{`${quizzes.fullyGraded} of ${quizzes.total} fully graded`}</Text>
          {quizzes.drafts > 0 ? (
            <Text variant="caption" color={theme.colors.neutral[600]}>
              {`${quizzes.drafts} quiz ${quizzes.drafts === 1 ? "draft" : "drafts"} not yet published`}
            </Text>
          ) : null}
        </Card>
      ) : null}
    </>
  );
}

/**
 * ADMIN (season-wide) and LEADER (their groups). The season is
 * `useCurrentSeasonId` — the one staff "current season" rule (X8, D9) — never
 * re-resolved on the server.
 */
export function SeasonStaffDashboard({ role }: { role: "ADMIN" | "LEADER" }) {
  const current = useCurrentSeasonId();
  const dash = useSeasonStaffDashboard(current.seasonId);
  const events = useUpcomingEvents(UPCOMING_EVENTS_LIMIT);

  const refresh = () => {
    current.refetch();
    if (current.seasonId !== null) void dash.refetch();
    void events.refetch();
  };

  return (
    <DashboardFrame onRefresh={refresh} refreshing={dash.isRefetching || events.isRefetching}>
      {current.isPending ? (
        <LoadingState />
      ) : current.isError ? (
        <ErrorState message="Couldn't load your seasons." onRetry={current.refetch} />
      ) : current.seasonId === null ? (
        <EmptyState title="No season yet" message="There is no season for you to manage yet." />
      ) : dash.isPending ? (
        <LoadingState />
      ) : dash.isError ? (
        <ErrorState
          message={apiErrorMessage(dash.error, "Couldn't load the dashboard.")}
          onRetry={() => void dash.refetch()}
        />
      ) : (
        <StaffSummary data={dash.data} role={role} />
      )}
      <UpcomingEventsCard query={events} />
    </DashboardFrame>
  );
}
```

- [ ] **Step 5: MENTOR branch**

> **v1 parity 2026-10-09:** `MentorDashboard` (v2 `apps/mobile/src/components/dashboard/MentorDashboard.tsx`): heading "Flagged for follow-up" with an "All students" link → `/students` (`:55-56`, R48); delete the "{n} of {atRiskTotal}" caption (`:70-73`, R47; `isAtRisk`, score order and the cap of 10 stay); empty state title "Nobody flagged", message "All students above the 60% engagement threshold." (`:64-68`, R49); "Recent activity" renders `recentAttendance` then `recentSubmissions` as two blocks, a submission row reading "{name} received feedback on {title}" (REVIEWED) or "{name} submitted {title}", time from `submittedAt` (`:97-124`, R53, R54); add a quick-links card Students → `/students`, My notes → `/notes`, Reports → `/reports`, Settings → `/settings` in place of the "No quick links" comment (`:126`, R57). v1: `jpc-space/src/app/mentor/dashboard/page.tsx:57-226`.

```tsx
// apps/mobile/src/components/dashboard/MentorDashboard.tsx
import { useRouter } from "expo-router";
import { Pressable } from "react-native";
import { AT_RISK_PCT, UPCOMING_EVENTS_LIMIT, type ActivityItem } from "@space/shared";

import { useMentorDashboard } from "../../hooks/use-dashboard";
import { useUpcomingEvents } from "../../hooks/use-events";
import { useEngagementReport } from "../../hooks/use-reports";
import { formatTimeAgo } from "../../lib/format";
import { useTheme } from "../../theme";
import { Card, EmptyState, ErrorState, LoadingState, Text } from "../../ui";
import { DashboardFrame } from "./DashboardFrame";
import { UpcomingEventsCard } from "./UpcomingEventsCard";

function activityLine(i: ActivityItem): string {
  if (i.kind === "attendance") {
    return `${i.studentName} was ${(i.attendanceStatus ?? "marked").toLowerCase()} at ${i.subjectTitle}`;
  }
  if (i.kind === "submitted") return `${i.studentName} submitted ${i.subjectTitle}`;
  return `${i.studentName} received feedback on ${i.subjectTitle}`;
}

export function MentorDashboard() {
  const theme = useTheme();
  const router = useRouter();
  // D17: the SAME query key as the mentor's Reports tab, so Home and Reports
  // cannot show different at-risk sets. No seasonId = the mentor's whole scope.
  const engagement = useEngagementReport(null, true);
  const feed = useMentorDashboard();
  const events = useUpcomingEvents(UPCOMING_EVENTS_LIMIT);

  const refresh = () => {
    void engagement.refetch();
    void feed.refetch();
    void events.refetch();
  };

  const open = (i: ActivityItem) => {
    // D18 / R55: v2 has no role prefix to forbid these links.
    if (i.submissionPublicId !== null) {
      router.push({ pathname: "/submission/[publicId]", params: { publicId: i.submissionPublicId } });
    } else {
      router.push({ pathname: "/student/[id]", params: { id: String(i.studentUserId) } });
    }
  };

  return (
    <DashboardFrame
      onRefresh={refresh}
      refreshing={engagement.isRefetching || feed.isRefetching || events.isRefetching}
    >
      <Card style={{ marginBottom: theme.spacing.sm }}>
        {/* "At risk", not v1's "Flagged for follow-up" — that phrase belongs to notes (R48). */}
        <Text variant="heading">At risk</Text>
        {engagement.isPending ? (
          <LoadingState />
        ) : engagement.isError ? (
          <ErrorState message="Couldn't load the at-risk list." onRetry={() => void engagement.refetch()} />
        ) : engagement.data.atRisk.length === 0 ? (
          <EmptyState
            title="Nobody at risk"
            message={`No student has attendance or submissions below ${AT_RISK_PCT}%.`}
          />
        ) : (
          <>
            <Text variant="caption" color={theme.colors.neutral[600]}>
              {`${engagement.data.atRisk.length} of ${engagement.data.atRiskTotal}`}
            </Text>
            {engagement.data.atRisk.map((r) => (
              <Pressable
                key={`${r.studentUserId}:${r.seasonId}`}
                accessibilityRole="button"
                accessibilityLabel={`${r.name}, ${r.seasonTitle}, ${r.attendancePct}% attendance, ${r.submissionPct}% submissions`}
                onPress={() => router.push({ pathname: "/student/[id]", params: { id: String(r.studentUserId) } })}
                style={{ paddingVertical: theme.spacing.sm }}
              >
                <Text variant="label">{r.name}</Text>
                <Text variant="caption" color={theme.colors.neutral[600]}>
                  {`${r.seasonTitle} · ${r.attendancePct}% attendance · ${r.submissionPct}% submissions`}
                </Text>
              </Pressable>
            ))}
          </>
        )}
      </Card>

      <Card style={{ marginBottom: theme.spacing.sm }}>
        <Text variant="heading">Recent activity</Text>
        {feed.isPending ? (
          <LoadingState />
        ) : feed.isError ? (
          <ErrorState message="Couldn't load recent activity." onRetry={() => void feed.refetch()} />
        ) : feed.data.recentActivity.length === 0 ? (
          <Text variant="body">No recent activity.</Text>
        ) : (
          feed.data.recentActivity.map((i) => (
            <Pressable
              key={i.key}
              accessibilityRole="button"
              accessibilityLabel={activityLine(i)}
              onPress={() => open(i)}
              style={{ paddingVertical: theme.spacing.sm }}
            >
              <Text variant="label">{activityLine(i)}</Text>
              <Text variant="caption" color={theme.colors.neutral[600]}>
                {formatTimeAgo(i.at)}
              </Text>
            </Pressable>
          ))
        )}
      </Card>

      {/* No quick links: in v2 they are tabs (spec 19 §9). */}
      <UpcomingEventsCard query={events} />
    </DashboardFrame>
  );
}
```

- [ ] **Step 6: SUPER branch**

> **v1 parity 2026-10-09:** `SuperDashboard` (v2 `apps/mobile/src/components/dashboard/SuperDashboard.tsx`): tile label "Students" (`:40`, R13); the "Upcoming events" tile shows `org.data.upcomingEventCount` (Task 4 Step 3 item 5) with no caption, instead of `events.data.total` + "From today, next 12 months" (`:58-64`, R15). v1: `jpc-space/src/app/super/dashboard/page.tsx:16-34`.

```tsx
// apps/mobile/src/components/dashboard/SuperDashboard.tsx
import { useRouter } from "expo-router";
import { UPCOMING_EVENTS_LIMIT } from "@space/shared";

import { useUpcomingEvents } from "../../hooks/use-events";
import { useOrganisationReport } from "../../hooks/use-reports";
import { ErrorState, LoadingState, Text } from "../../ui";
import { DashboardFrame } from "./DashboardFrame";
import { StatTile, TileRow } from "./StatTile";
import { UpcomingEventsCard } from "./UpcomingEventsCard";

/**
 * Organisation tiles from Plan 15's roll-up — the same query key as the SUPER
 * Reports screen, so one cache entry and one definition (spec 19 §7). The
 * events tile reads `total` from the very response the card renders (D19).
 */
export function SuperDashboard() {
  const router = useRouter();
  const org = useOrganisationReport(true);
  const events = useUpcomingEvents(UPCOMING_EVENTS_LIMIT);

  const refresh = () => {
    void org.refetch();
    void events.refetch();
  };

  return (
    <DashboardFrame onRefresh={refresh} refreshing={org.isRefetching || events.isRefetching}>
      <Text variant="title">Organisation</Text>
      {org.isPending ? (
        <LoadingState />
      ) : org.isError ? (
        <ErrorState message="Couldn't load the organisation summary." onRetry={() => void org.refetch()} />
      ) : (
        <TileRow>
          {/* D20: student ACCOUNTS not graduated — the label says so (spec 17 D4). */}
          <StatTile
            label="Students (not graduated)"
            value={String(org.data.totalStudentsNotGraduated)}
            onPress={() => router.push("/students")}
          />
          <StatTile label="Alumni" value={String(org.data.totalAlumni)} onPress={() => router.push("/students/alumni")} />
          {/* v1 R12: every non-deleted season, any status — NOT activeSeasonCount. */}
          <StatTile
            label="Seasons"
            value={String(org.data.seasons.length)}
            caption="All statuses"
            onPress={() => router.push("/seasons")}
          />
        </TileRow>
      )}
      <TileRow>
        <StatTile
          label="Upcoming events"
          value={events.data ? String(events.data.total) : "—"}
          caption="From today, next 12 months"
          onPress={() => router.push("/events")}
        />
      </TileRow>
      <UpcomingEventsCard query={events} />
    </DashboardFrame>
  );
}
```

- [ ] **Step 7: The switch**

Replace `apps/mobile/app/(app)/dashboard.tsx` entirely:

```tsx
import { AlumniDashboard } from "../../src/components/dashboard/AlumniDashboard";
import { DashboardFrame } from "../../src/components/dashboard/DashboardFrame";
import { MentorDashboard } from "../../src/components/dashboard/MentorDashboard";
import { SeasonStaffDashboard } from "../../src/components/dashboard/SeasonStaffDashboard";
import { StudentDashboard } from "../../src/components/dashboard/StudentDashboard";
import { SuperDashboard } from "../../src/components/dashboard/SuperDashboard";
import { dashboardBranchFor } from "../../src/lib/dashboard-branch";
import { useSessionStore } from "../../src/store/session";
import { LoadingState } from "../../src/ui";

/**
 * Home — one route, one branch per audience (spec 19 §9, Phase 0 D1). Each
 * branch owns its queries, its loading/error/empty states and its
 * pull-to-refresh; every branch keeps Plan 13's bell via DashboardFrame.
 * Plan 1's AssignmentsSummary is gone on purpose: its counts are now the
 * server's (spec 19 D15).
 */
export default function DashboardScreen() {
  const role = useSessionStore((s) => s.user?.role ?? null);
  const graduationYear = useSessionStore((s) => s.scopes?.graduationYear ?? null);

  // The (app) layout only mounts for a signed-in user; this covers the frame
  // between boot and the session landing in the store.
  if (role === null) {
    return (
      <DashboardFrame>
        <LoadingState />
      </DashboardFrame>
    );
  }

  switch (dashboardBranchFor({ role, graduationYear })) {
    case "SUPER":
      return <SuperDashboard />;
    case "ADMIN":
      return <SeasonStaffDashboard role="ADMIN" />;
    case "LEADER":
      return <SeasonStaffDashboard role="LEADER" />;
    case "MENTOR":
      return <MentorDashboard />;
    case "STUDENT":
      return <StudentDashboard />;
    case "ALUMNI":
      return <AlumniDashboard />;
  }
}
```

- [ ] **Step 8: Run**

Run: `cd apps/mobile && pnpm jest src/__tests__/dashboard.test.tsx src/__tests__/upcoming-events-card.test.tsx` → PASS.
Run: `grep -rn "AssignmentsSummary" apps/mobile` → no output.
Run: `pnpm turbo lint typecheck test:unit --filter=@space/mobile` → clean (typed routes: every `pathname` used here exists — `/session/[id]`, `/student/[id]`, `/assignment/[id]`, `/submission/[publicId]`, `/event/[id]`; if `typecheck` reports one missing, **stop** — do not cast).

- [ ] **Step 9: Commit**

```bash
git add apps/mobile && git commit -m "feat(mobile): role dashboards — six branches on /dashboard, bell kept, AssignmentsSummary retired

Replaces Phase 0's five session-list cases and Plan 1 Task 5's two
assignment-count cases in dashboard.test.tsx (spec 19 D15: the counts are
now server-side). Plan 13's three bell cases are kept."
```

---

### Task 8: Tag every dashboard-moving mutation

Spec 19 §7 lists the mutations that move a Home number; D24 says Plan 16 adds
the invalidation to their hooks in one task and lists each file. Each edit is
one line in the hook's `useMutation({ … })` options — `meta: DASHBOARD_META,` —
plus the import `import { DASHBOARD_META } from "../lib/dashboard-invalidation";`.
Nothing else in those hooks changes; their own `onSuccess` invalidations stay.

**Files (all `apps/mobile/src/hooks/`):**

| File (owner plan) | Hooks to tag | Why it moves Home |
|---|---|---|
| `use-submission.ts` (1) | `useSaveSubmission` | outstanding / late counts, review queue |
| `use-submission-queue.ts` (2) | `useReviewSubmission` | pending-review / reviewed, mentor feed |
| `use-attendance.ts` (2) | `useSaveAttendance` | attendance %, at-risk, mentor feed, budget |
| `use-check-in.ts` (14) | `useCheckIn` | same as attendance |
| `use-quizzes.ts` (6) | `useSubmitAttempt`, `useSaveQuizGrades`, `useGradeEssays`, `useReopenAttempt` | quiz roll-up |
| `use-quiz-authoring.ts` (6) | `useCreateQuiz`, `usePublishQuiz` | quiz total / drafts |
| `use-assignment-writes.ts` (15) | `useCreateAssignment`, `useUpdateAssignment`, `useDeleteAssignment` | submission %, outstanding, due soon |
| `use-students.ts` (5/17) | `useCreateStudent`, `useGraduateStudent`, `useDeleteStudent`, `useDropEnrollment` | cohort size, at-risk |
| `use-session-writes.ts` (16) | `useCreateSession`, `useUpdateSession`, `useDeleteSession` | progress, next session |
| `use-group-admin.ts` (16) | `useSaveGroupAssignments`, `useDeleteGroup` | a leader's cohort, targeting |
| `use-forum.ts` (10) | `useSubmitForumResponse` | a forum post completes a submission |

Event writes need no tag: Plan 14's `useInvalidateEvents` already invalidates
`queryKeys.events.all`, which covers the card and the SUPER tile.

- [ ] **Step 1: Failing guard test**

```ts
// apps/mobile/src/__tests__/dashboard-invalidation.test.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Spec 19 §7 / D24: every mutation that moves a number on some role's Home is
 * tagged, so the MutationCache invalidates `queryKeys.dashboard.all` after it.
 * A source scan, because the alternative — rendering 27 hooks against a live
 * cache — tests React Query, not us. Adding a dashboard-moving mutation later
 * means adding a row here.
 */
const TAGGED: readonly (readonly [file: string, hook: string])[] = [
  ["use-submission.ts", "useSaveSubmission"],
  ["use-submission-queue.ts", "useReviewSubmission"],
  ["use-attendance.ts", "useSaveAttendance"],
  ["use-check-in.ts", "useCheckIn"],
  ["use-quizzes.ts", "useSubmitAttempt"],
  ["use-quizzes.ts", "useSaveQuizGrades"],
  ["use-quizzes.ts", "useGradeEssays"],
  ["use-quizzes.ts", "useReopenAttempt"],
  ["use-quiz-authoring.ts", "useCreateQuiz"],
  ["use-quiz-authoring.ts", "usePublishQuiz"],
  ["use-assignment-writes.ts", "useCreateAssignment"],
  ["use-assignment-writes.ts", "useUpdateAssignment"],
  ["use-assignment-writes.ts", "useDeleteAssignment"],
  ["use-students.ts", "useCreateStudent"],
  ["use-students.ts", "useGraduateStudent"],
  ["use-students.ts", "useDeleteStudent"],
  ["use-students.ts", "useDropEnrollment"],
  ["use-session-writes.ts", "useCreateSession"],
  ["use-session-writes.ts", "useUpdateSession"],
  ["use-session-writes.ts", "useDeleteSession"],
  ["use-group-admin.ts", "useSaveGroupAssignments"],
  ["use-group-admin.ts", "useDeleteGroup"],
  ["use-forum.ts", "useSubmitForumResponse"],
];

/** The source of one exported hook: from its declaration to the next top-level export. */
function hookSource(file: string, hook: string): string {
  const src = readFileSync(join(__dirname, "..", "hooks", file), "utf8");
  const start = src.indexOf(`export function ${hook}(`);
  if (start === -1) throw new Error(`${hook} not found in ${file}`);
  const next = src.indexOf("\nexport ", start + 1);
  return src.slice(start, next === -1 ? undefined : next);
}

describe("dashboard-moving mutations carry DASHBOARD_META (spec 19 D24)", () => {
  it.each(TAGGED)("%s → %s", (file, hook) => {
    expect(hookSource(file, hook)).toContain("meta: DASHBOARD_META");
  });
});
```

Run: `cd apps/mobile && pnpm jest src/__tests__/dashboard-invalidation.test.ts` → FAIL (23 cases, none tagged). A "not found" error instead means a hook was renamed by its owning plan — use the real name and fix this table; do not drop the row.

- [ ] **Step 2: Tag them**

For each row, add `meta: DASHBOARD_META,` as the line after `mutationFn` in that hook's `useMutation({` call, and the import once per file. Example — Plan 2's `useSaveAttendance`:

```ts
export function useSaveAttendance(sessionId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (entries: AttendanceEntry[]) => {
      // …unchanged…
    },
    // Spec 19 D24: attendance moves every staff Home's attendance %, at-risk
    // set and the mentor feed.
    meta: DASHBOARD_META,
    onSuccess: () => {
      // …unchanged…
    },
  });
}
```

- [ ] **Step 3: Run**

Run: `cd apps/mobile && pnpm jest src/__tests__/dashboard-invalidation.test.ts src/__tests__/query-client.test.ts` → PASS.
Run: `pnpm turbo lint typecheck test:unit --filter=@space/mobile` → clean (every other hook test unchanged and green).

- [ ] **Step 4: Commit**

```bash
git add apps/mobile && git commit -m "feat(mobile): every dashboard-moving mutation invalidates Home (spec 19 D24)"
```

---

### Task 9: Closing gate (coordinator)

**Files:** none created — verification only.

- [ ] **Step 1: Full suites**

Run: `pnpm turbo lint typecheck test:unit` (repo root) → green. `typecheck` depends on `routes:generate`, so typed routes are current.
Run, serially (shared DB):

```bash
cd apps/backend && npx jest --config jest.integration.config.js --runInBand \
  --testPathPattern 'dashboard-routes|submissions-routes|quizzes-routes|assignments-routes|me-self-service-routes|reports-queries|reports-routes|events'
```

→ PASS. Then `pnpm --filter @space/backend build && ! grep -rn 'require("@space/shared")' apps/backend/dist` → exits 0 (X12).
Health: `pnpm --filter @space/backend start` in tmux (`tmux new -d -s space-v2-api "pnpm --filter @space/backend start 2>&1 | tee ~/logs/space-v2-api.log"`), then `curl -fsS localhost:4000/health` (X6) and `curl -s localhost:4000/api/docs.json | grep -c '/api/v1/me/dashboard'` → `1`.

- [ ] **Step 2: Mutation pass**

> **v1 parity 2026-10-09:** Mutations 4, 6, 7, 8, 14 and 17 target removed or reverted code. Replace them with: 4 — `loadNextSession`: use `gt` instead of `gte` → a session starting exactly now disappears (STUDENT case); 6 — `rosterRowsFrom`: sort nulls first → SEASON_STAFF roster order fails; 7 — `loadMentorDashboard`: re-add `RETURNED` → MENTOR case fails; 8 — re-add `graduationYear: null` → the graduated mark disappears, MENTOR fails; 14 — `UpcomingEventsCard`: render the EmptyState again → "renders nothing" fails; 17 — `StudentDashboard`: hide "Watch recording" for future sessions → STUDENT case fails.

Apply one at a time; each must break at least the named test; restore after each.

1. `meanAttendancePct`: drop the `attendanceTotal > 0` filter → `dashboard.test.ts` (shared) "averages only students who have had a session" and "is null" fail.
2. Remove `.strict()` from `studentDashboardSchema` → shared "refuses any extra field" fails.
3. `summarizeStudentAssignments`: replace `isAssignmentOutstanding(r.status)` with `r.status !== "SUBMITTED"` → `dashboard-figures.test.ts` outstanding count fails (RETURNED/REVIEWED leak in). (Supersedes Plan 1's mutation 6, whose dashboard screen test no longer exists.)
4. `isSessionInProgress`: change `<` to `<=` on the end bound → the "up to, not including, the end" case fails.
5. `progressFrom`: return `pct: 0` for an empty season → "has no percentage" fails.
6. `mergeActivity`: sort ascending → the "newest first" case fails; integration MENTOR order fails.
7. `loadMentorDashboard`: order the reviewed query by `submittedAt` and use `s.submittedAt` as `at` → MENTOR integration case fails (`2099-04-01` where `2099-05-03` is expected).
8. `loadMentorDashboard`: drop `graduationYear: null` from `FEED_STUDENT` → the graduated row (2099-06-02) appears; MENTOR case fails.
9. `loadSeasonStaffDashboard`: call `computeEngagementForSeasons([seasonId], {})` for the groups scope → leader `studentCount` 3 ≠ 2.
10. `loadSeasonStaffDashboard`: replace `queueScope` with `{}` → leader `submissions` becomes `{1, 2}`; leader case fails.
11. `countGradedByQuiz`: return the PAPER count for every quiz → leader `quizzes.pending` becomes 1; fails.
12. Route: delete the `isAlumnus` 403 → the alumnus gate case fails (200 STUDENT variant).
13. Route: read the student's season from `req.query.seasonId` → STUDENT case (called with `otherSeasonId`) fails.
14. `UpcomingEventsCard`: return `null` when `events.length === 0` → "renders an EmptyState, not nothing" fails.
15. `SuperDashboard`: use `org.data.activeSeasonCount` for Seasons → "Seasons: 1" fails.
16. `MentorDashboard.open`: always push `/student/[id]` → mentor test's submission push fails.
17. `StudentDashboard`: show "Join stream" whenever `youtubeUrl` is set (drop `isInProgress`) — and set the test fixture's `isInProgress: false` locally to see it: the button must not render. (Run as a scratch edit to the test, then revert both.)
18. Remove `meta: DASHBOARD_META` from `useSaveAttendance` → `dashboard-invalidation.test.ts` row fails.
19. `createQueryClient`: drop the `MutationCache` → `query-client.test.ts` invalidation case fails.
20. `useStudentDashboard`: parse with `dashboardSchema` instead of `studentDashboardSchema` → `use-dashboard.test.tsx` "fails at the boundary" passes wrongly → the test fails.

- [ ] **Step 3: Device checklist (Expo Go or a dev build, backend running, staging accounts)**

> **v1 parity 2026-10-09:** Checklist items 1, 2, 5, 7 and 8 now read: STUDENT "Hi, {first} 👋", "Week N of M" with "% done", "Absence budget", Assignments pending, late banner, "Next session" with duration and relative badge, "Watch recording" when a link exists, due-soon "Due in …" and "See all"; item 2 "Assignments pending drops"; ADMIN full "All students" roster with tier colours, "Students below 70% attendance" callout when any, Assignments "View all" → `/assignments`; MENTOR "Flagged for follow-up" equals the Reports at-risk list (first 10), two activity blocks, quick links; SUPER events tile equals the count of events dated from now on, any visibility (v1 `super/dashboard/page.tsx:18`).

1. STUDENT with an active season: greeting, "Session N of M", budget left %, streak, To do / overdue, late banner (if any), next session; during a live session "Happening now" and "Join stream"; due-soon rows open the assignment; Absence budget tile opens `/attendance`.
2. Submit an assignment from the detail screen, go back to Home: To do drops without a manual refresh (D24).
3. STUDENT with no active season: "Not enrolled yet" → Complete your profile opens `/profile`.
4. ALUMNUS: "Class of YYYY", "View my history" opens `/history`; no `/me/dashboard` in the API log.
5. ADMIN: current season matches the Calendar tab's; at-risk preview "N of M"; tap a row → student detail; "Pending review" → queue whose list length equals the tile; Quizzes pending → `/quizzes`.
6. LEADER of two groups in one season: both names in the header; numbers cover only their students.
7. MENTOR: "At risk" equals the Reports tab's list; activity feed in time order; a submission row opens the submission (not a forbidden screen).
8. SUPER: four tiles; the events tile number equals the count of events on `/events` from today onwards.
9. Every role: bell badge visible; pull-to-refresh spins and settles; airplane mode → each card shows its own error with "Try again".
10. Set the device to a timezone far from `ORG_TIMEZONE` (e.g. America/Los_Angeles): every day label and session time on Home is unchanged (X13).

- [ ] **Step 4: Hand back**

Report: suite counts, the twenty mutation outcomes, device checklist results, and any divergence found while implementing (in particular any hook renamed by its owning plan in Task 8's table).

---

## Names this plan produces (for later plans)

- **Endpoint:** `GET /api/v1/me/dashboard` (variants `STUDENT`, `SEASON_STAFF`, `MENTOR`; alumnus 403).
- **Shared (`packages/shared/src/dashboard.ts`):** `DASHBOARD_AT_RISK_PREVIEW`, `DUE_SOON_LIMIT`, `UPCOMING_EVENTS_LIMIT`, `RECENT_ACTIVITY_LIMIT`, `meanAttendancePct`, `seasonProgressSchema`, `dashboardSessionSchema`, `dashboardSeasonSchema`, `staffCohortSummarySchema`, `reviewCountsSchema`, `quizRollupSchema`, `staffSeasonDashboardSchema`, `dashboardDueItemSchema`, `studentAssignmentSummarySchema`, `studentDashboardSchema`, `activityItemSchema`, `mentorDashboardSchema`, `dashboardSchema` (+ inferred types).
- **Backend:** `lib/dashboard-figures.ts` (`isSessionInProgress`, `progressFrom`, `summarizeStudentAssignments`, `isQuizDraft`, `quizRollupFrom`, `mergeActivity`, `ActivityRow`); `lib/permissions.ts` `submissionQueueScopeFor`; `lib/quiz-scope.ts` `countGradedByQuiz`; `lib/queries/reports.ts` `byScoreThenId` (now exported), `ScoreOrderKey`; `lib/queries/assignments.ts` `StudentAssignmentStateRow`, `listAssignmentStatesForStudent`; `lib/queries/sessions.ts` `loadSeasonProgress`, `CurrentOrNextSession`, `loadCurrentOrNextSession`; `lib/queries/dashboard.ts` `loadStudentDashboard`, `loadSeasonStaffDashboard`, `loadMentorDashboard`.
- **Mobile:** `queryKeys.dashboard.{all, me}`; `use-dashboard.ts` (`DASHBOARD_STALE_TIME`, `useStudentDashboard`, `useSeasonStaffDashboard`, `useMentorDashboard`); `lib/format.ts` `firstName`, `formatEventWhen`, `formatTimeAgo`; `lib/dashboard-branch.ts` `dashboardBranchFor`, `DashboardBranch`; `lib/dashboard-invalidation.ts` `DASHBOARD_META`; components `dashboard/{DashboardFrame, StatTile, TileRow, UpcomingEventsCard, SuperDashboard, SeasonStaffDashboard, MentorDashboard, StudentDashboard, AlumniDashboard}`.
- **Changed by the v1-parity revision (2026-10-09):** `isSessionInProgress`, `mergeActivity`, `ActivityRow`, `activityItemSchema` and `loadCurrentOrNextSession` are removed; `loadNextSession`, `rosterRowsFrom`, `ATTENDANCE_TIERS`/`attendanceTier`, `studentFirstName`, `cohort.roster`/`cohort.belowThreshold`, MENTOR `recentAttendance`/`recentSubmissions` and `organisationReport.upcomingEventCount` are added. *(v1 parity 2026-10-09: was "the names above only")*
- **Retired:** Plan 1's `AssignmentsSummary` (dashboard.tsx). **Any new mutation that moves a Home number** must carry `meta: DASHBOARD_META` and add a row to `dashboard-invalidation.test.ts`.

## Open decisions

1. **MENTOR and SEASON events.** Spec 19 D19 recommends treating MENTOR like SUPER for SEASON events; Plan 14 kept v1 parity, so the mentor's card omits them. Unchanged here — needs a product call, and if taken, the change belongs in Plan 14's `eventVisibilityFilter`, not on this screen.
2. **Graduated students in the mentor feed.** Closed — v1: graduated students are included in both activity lists (`jpc-space/src/app/mentor/dashboard/page.tsx:67-91` filters only `role: "STUDENT"`); soft-deleted rows stay out. *(v1 parity 2026-10-09: was "excluded per D18, matching the at-risk cohort")*
3. **`use-check-in.ts` is created by both Plan 6 (`useCheckInState`, `useRegenerateCheckIn`) and Plan 11 (`useCheckIn`).** This plan only needs `useCheckIn` to live in that file; the coordinator's reconciliation should confirm Plan 11 *appends* rather than recreates it.
4. **Due-soon labels.** Closed — v1: an overdue row reads "Due {formatDayKey(dueOrgDay)}" (red), any other row "Due in {relative from dueAt}" (amber, device-computed from the instant per D23), no label when `dueAt` is null; the card has a "See all" → `/assignments` link (`jpc-space/src/app/student/dashboard/page.tsx:249-288`). *(v1 parity 2026-10-09: was "absolute labels; Overdue · was due / Due / No due date; no See all")*
5. **Leader whose current season has no group of theirs** sees the server's 403 message. `useCurrentSeasonId` picks from the seasons the leader can list; if Plan 6's `useStaffSeasonSelection` becomes the staff season source, swap it in here — X8 currently names `useCurrentSeasonId`.

## Revision 2026-10-05

- Written from spec 19 with ruling X17's acceptances. Composes Plans 8, 11, 12, 14 and 15's server computations (extracted, not copied, in Task 3) and replaces Plan 1 Task 5's dashboard card and tests explicitly.


## Revision 2026-10-09 — v1 parity

Owner ruling: v2 behaves exactly like v1 except where v1's behaviour is a defect. This revision
reverts the divergences below; the edits are marked *(v1 parity 2026-10-09)* in place. The code
built from the earlier text must be changed to match. Full classification:
`docs/superpowers/audits/2026-cutover/v1-parity-classification.tsv`.

| # | Rule(s) | REG | v1 behaviour (v1 file:line) | v2 code to change (file:line) | Where in this plan |
|---|---|---|---|---|---|
| 1 | 19-R30, R31, R41 | REG-60 | 70/85 red/amber/green tiers on the average and each roster row; red callout "Students below 70% attendance" listing every roster student < 70, hidden when none; leader identical (`src/app/admin/dashboard/page.tsx:132-138`, `:270-276`, `:364-377`; `src/app/leader/dashboard/page.tsx:90-145`) | `apps/mobile/src/components/dashboard/SeasonStaffDashboard.tsx:38-39`, `:83-129`; `apps/backend/src/lib/queries/dashboard.ts:142-155`; `packages/shared/src/dashboard.ts:82-84` | Ledger row 1; Task 1 Step 2; Task 4 Step 3; Task 7 Step 4 |
| 2 | 19-R24, R27, R28, R35, R41 | REG-60 | "All students" card: every roster student, attendance % ("—" when no sessions held), "{n} pending", lowest attendance first with no-figure rows last, "View all", empty "No students enrolled" / leader "No students yet" (`src/app/admin/dashboard/page.tsx:91-102`, `:225-293`; `leader/dashboard/page.tsx:256`) | `SeasonStaffDashboard.tsx:83-129`; `dashboard.ts:142-155`; `packages/shared/src/dashboard.ts:76-86` | Ledger rows 2, 3, 5; Task 1 Step 2; Task 2 Step 2; Task 4 Steps 1, 3; Task 7 Steps 1, 4 |
| 3 | 19-R22, R68 | REG-60 | Staff hero "{n} students · Week N of M" + "Progress" tile "{pct}%" / "Week N/M"; student ring "{pct}% done", "Week N of M · K week(s) to go" / "· complete" (`admin/dashboard/page.tsx:55-56`, `:156`, `:171`; `student/dashboard/page.tsx:69-72`, `:132-159`) | `SeasonStaffDashboard.tsx:33-37`, `:42-59`; `StudentDashboard.tsx:84-96` | Ledger row 10; Task 7 Steps 1, 2, 4 |
| 4 | 19-R21, R64, R74 | REG-60 | Next session = first `startsAt >= now`; card "Next session", date · "N min" · location, relative badge, "Watch recording" whenever `youtubeUrl` is set (`admin/dashboard/page.tsx:43-54`, `:183-222`; `student/dashboard/page.tsx:42-53`, `:200-243`) | `apps/backend/src/lib/queries/sessions.ts:179-215`; `dashboard.ts:33-44`, `:70`, `:123`; `packages/shared/src/dashboard.ts:67`; `SeasonStaffDashboard.tsx:62-81`; `StudentDashboard.tsx:146-177` | Ledger row 11; Task 1 Step 2; Task 2 Steps 1–2; Task 3 Step 5; Task 4 Steps 1, 3; Task 7 Steps 2, 4 |
| 5 | 19-R36 | REG-60 | ADMIN "Assignments" panel (Pending review / Reviewed) "View all" → assignments; Quizzes panel "View all" → quizzes (`admin/dashboard/page.tsx:295-360`) | `SeasonStaffDashboard.tsx:52-58` | Task 7 Steps 1, 4 |
| 6 | 19-R47, R48, R49; 09-R76 | REG-61, REG-60 | Mentor card "Flagged for follow-up" + "All students" link, no "N of M" caption, empty "Nobody flagged" / "All students above the 60% engagement threshold." (`src/app/mentor/dashboard/page.tsx:57-64`, `:108-122`) | `apps/mobile/src/components/dashboard/MentorDashboard.tsx:55-73` | Ledger row 15; Task 7 Steps 1, 5 |
| 7 | 19-R51, R52, R53, R54; 08-R57 | REG-60 | Two blocks: 4 newest marks (graduated included), then 4 newest SUBMITTED\|REVIEWED by `submittedAt`, one row per submission labelled by status (`mentor/dashboard/page.tsx:67-91`, `:161-210`) | `dashboard.ts:163`, `:171-273`; `apps/backend/src/lib/dashboard-figures.ts:123-127`; `packages/shared/src/dashboard.ts` mentor schema; `MentorDashboard.tsx:97-124` | Ledger row 16; Open decision 2; Task 1 Steps 1–2; Task 2 Steps 1–2; Task 4 Steps 1, 3, 6; Task 7 Step 5; Task 9 Step 2 |
| 8 | 19-R57 | REG-01 | Quick links Students, My notes, Reports, Settings (`mentor/dashboard/page.tsx:221-226`) | `MentorDashboard.tsx:126` | Task 7 Steps 1, 5 |
| 9 | 19-R10; 15-R75 | REG-60 | Events card renders nothing when no event qualifies (`src/components/events/upcoming-events-card.tsx:30`) | `apps/mobile/src/components/dashboard/UpcomingEventsCard.tsx:25-27` | Ledger row 17; Task 6 Steps 1–2; Task 9 Step 2 |
| 10 | 19-R15; 15-R79 | REG-60 | SUPER tile = `jpcEvent.count({ date >= now })`, any visibility, no bound, no caption (`src/app/super/dashboard/page.tsx:18`, `:33-34`) | `SuperDashboard.tsx:58-64`; Plan 15's organisation report (new field `upcomingEventCount`) | Ledger row 18; Task 4 Steps 3, 6; Task 7 Step 6 |
| 11 | 19-R13 | REG-60 | SUPER tile labelled "Students" (`super/dashboard/page.tsx:16`, `:30`) | `SuperDashboard.tsx:39-41` | Ledger row 19; Task 7 Steps 1, 6 |
| 12 | 19-R59 | REG-60 | Alumni first token of trimmed name, "there" only on null; student "Hi, {name.split(' ')[0]} 👋" (`src/app/alumni/dashboard/page.tsx:21`, `:33`; `student/dashboard/page.tsx:88`, `:93-95`) | `apps/mobile/src/lib/format.ts:93-100`; `StudentDashboard.tsx:63` | Ledger row 20; Task 5 Steps 1, 4; Task 7 Steps 2–3 |
| 13 | 19-R67 | REG-60 | "… need(s) your attention." / "You're all caught up this week." (`student/dashboard/page.tsx:98-101`) | `StudentDashboard.tsx:22-29` | Ledger row 21; Task 7 Step 2 |
| 14 | 19-R69 | REG-60 | Tile "Absence budget", value `max(0, round(100 − budgetPct))%` or "—", "this season", → attendance (`student/dashboard/page.tsx:85-87`, `:163-168`) | `StudentDashboard.tsx:106-111` | Ledger row 12; "Handed to Plan 18"; Task 7 Step 2 |
| 15 | 19-R71 | REG-60 | Tile "Assignments", value pending, sublabel "pending", no overdue caption (`student/dashboard/page.tsx:182-188`) | `StudentDashboard.tsx:120-129` | Task 7 Steps 1–2 |
| 16 | 19-R72 | REG-60 | Banner "{n} assignment(s) submitted late this season" over every turned-in submission on a live season assignment (untargeted) (`student/dashboard/page.tsx:57-68`, `:79-81`, `:190-197`) | `dashboard-figures.ts:65`; `dashboard.ts` `loadStudentDashboard`; `StudentDashboard.tsx:132-142` | Ledger row 14; Task 1 Step 2; Task 2 Steps 1–2; Task 4 Steps 1, 3; Task 7 Step 2 |
| 17 | 19-R73 | REG-60 | Due soon: first 3 pending, overdue "Due MMM d" (red), others "Due in {relative}" (amber), none without `dueAt`; "See all" (`student/dashboard/page.tsx:249-288`) | `StudentDashboard.tsx:30-34`, `:180-202` | Open decision 4; Task 5 Step 4; Task 7 Steps 1–2 |

**Awaiting owner (not changed):** none in this plan. Conflicts resolved here (no behaviour beyond the rows above):
08-R57 asks for "no soft-delete filters" on the mentor activity lists while 19-R51/R52 say keep them —
this revision keeps the soft-delete filters (19 rows; soft-deleted rows are not live data). 09-R68 and
09-R87 (label "Attendance") are not applied here: v1's student **dashboard** tile is labelled "Absence
budget" (`src/app/student/dashboard/page.tsx:163`, 19-R69); the "Attendance" label is the profile
page's and belongs to Plan 11.
