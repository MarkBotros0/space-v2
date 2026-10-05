# Domain 19 — Role dashboards

> Status: draft · Phase: 5 (Plan 18, runs after Plan 11 per the cross-plan
> execution order) · v1 API status: **none** (no `/api/v1` route in v1 serves a
> dashboard; `apps/mobile/app/(app)/dashboard.tsx` renders the active season's
> session list, plus Plan 1's assignment-count card and Plan 9's bell once those
> land)

v1 has six dashboards, one per landing role: `super`, `admin`, `leader`,
`mentor`, `alumni`, `student`. They are server components that query the
database directly. None of them goes through a query module that any other
page shares, apart from `computeEngagementForStudent`,
`computeAttendanceBudget`, `computeAttendanceStreak`,
`listAssignmentsForStudent` and `listJpcEvents`. So every dashboard metric is
a **private re-derivation** of a number that another domain also computes
elsewhere, and the two versions usually disagree. This spec exists mostly
because of that.

**Owns.** The six landing screens, the per-role summary figures that no other
domain owns (season progress, "next session", submission review counts,
dashboard quiz roll-ups, the student late-count, the mentor activity feed),
and the composition rules that say which endpoint each tile reads.

**Does not own, and only cross-references:**

- **Engagement, at-risk and the score.** These belong to domain 9 (spec
  `09-notes.md` R53–R77, D7–D10). They are implemented by Plan 8
  (`computeEngagementForSeason`, `isAtRisk`, `AT_RISK_PCT`) and generalised by
  Plan 11 (`computeEngagementForSeasons`, `bandFor`).
- **Per-student "submission %".** Ruling C5 defines it. Plan 11 D-17.1 names
  domain 9's `submissionPct` as the only per-student figure. This domain
  defines no new submission percentage.
- **The absence budget and the streak.** Both belong to domain 4 (spec
  `04-attendance.md` R88–R96, D1/D2/D14). Ruling C3 explains why their values
  change in v2.
- **The upcoming-events card.** This belongs to domain 15 (spec `15-events.md`
  R44, R45, R74–R79) and is implemented by Plan 10 (`GET /api/v1/events`,
  `eventVisibilityFilter`, `useEvents`).
- **Quiz grading progress.** This belongs to domain 12 (spec `12-quizzes.md`
  R114, D10) and is implemented by Plan 6 (`quizSummarySchema.gradedCount` and
  `studentCount`).
- **The "current season" rule for staff.** This belongs to domain 2 (spec
  `02-seasons.md` R22). Plan 4 implements it as `useCurrentSeasonId`, and
  rulings X8 make that hook binding.
- **The organisation roll-up.** This belongs to domain 17 (spec
  `17-reports.md` D4). Plan 11 serves it as `GET /api/v1/reports/organisation`.

Citations are paths under `/home/mark/projects/JPC/jpc-space` unless prefixed
`apps/`, `packages/` or `docs/`, which are this repository. v1 has no test
files, so the source is the only statement of intent.

---

## 1. v1 source

| File | Holds |
|---|---|
| `src/app/super/dashboard/page.tsx` (40 lines) | Four `count` queries (`:14-19`), four stat tiles (`:29-34`), the events card (`:37`) |
| `src/app/admin/dashboard/page.tsx` (380 lines) | Season resolution (`:20-31`), eight parallel queries (`:36-71`), per-student attendance and "pending" (`:75-99`), sort (`:101-102`), mean attendance (`:104-109`), quiz pending (`:111-115`), review counts (`:117-118`), the attendance ring (`:123-160`), stat row (`:166-180`), next session (`:183-222`), full roster (`:225-293`), assignment and quiz panels (`:296-361`), the `< 70 %` callout (`:364-377`) |
| `src/app/leader/dashboard/page.tsx` (390 lines) | The same page as admin with a different scope: groups come from token claims (`:20-34`), season comes from the first group (`:36-37`), students come from `GroupStudent` (`:38-39`), queries (`:43-88`), the same formulas (`:90-134`) and the same layout (`:136-389`) |
| `src/app/mentor/dashboard/page.tsx` (240 lines) | The cohort (`:24-41`), the 4N engagement fan-out (`:44-55`), the at-risk filter (`:17`, `:57-64`), recent attendance and submissions (`:67-91`), cards (`:102-219`), quick links (`:221-226`) |
| `src/app/alumni/dashboard/page.tsx` (49 lines) | `isAlumnus` gate (`:15`), name and graduation year (`:17-21`), greeting card (`:25-44`), events card (`:46`) |
| `src/app/student/dashboard/page.tsx` (294 lines) | Season from token and from database (`:23-38`), seven parallel reads (`:40-74`), "pending" (`:76-78`), late count (`:79-81`), progress (`:83-84`), the budget tile value (`:85-87`), greeting (`:93-104`), not-enrolled state (`:107-126`), progress ring (`:132-159`), stat row (`:162-189`), late banner (`:190-197`), next session (`:200-243`), events (`:246`), due soon (`:249-288`) |
| `src/components/events/upcoming-events-card.tsx` | The card on all six dashboards. Its visibility flag (`:23`), window (`:20`, `:27`), cap of four (`:28`), render-nothing-when-empty (`:30`) and date label (`:7-16`) |
| `src/lib/jpc-events-query.ts` | `viewerSeasonIds` (`:24-37`). `listJpcEvents` (`:39-79`) is unbounded and resolves a storage URL for every row (`:71-78`) |
| `src/lib/engagement.ts` | `computeEngagementForStudent` (`:21-88`, mentor), `computeAttendanceBudget` (`:109-157`, student), `computeAttendanceStreak` (`:250-273`, student) |
| `src/lib/assignments-query.ts` | `listAssignmentsForStudent` (`:197-241`, student). It reads `GroupStudent` (`:203-206`) and takes `submissions[0]` (`:232`) |
| `src/components/students/stat-card.tsx` | The tile primitive. `href` makes the whole tile a link (`:8`, `:21-23`) |
| `src/lib/auth/post-login.ts` | `dashboardPathForRole` (`:8-25`) and `rolePrefixAllowed` (`:27-43`) |
| `src/proxy.ts` | Applies `rolePrefixAllowed` and redirects a mismatch to `/forbidden` (`:27-32`) |
| `src/components/layout/role-layout.tsx` | Sends an alumnus to `/alumni/dashboard` from any active-student page (`:25-29`); bounces a wrong role to its own dashboard (`:30-32`) |
| `src/app/{super,admin,leader,mentor,student,alumni}/layout.tsx` | `allowedRoles`: super `[SUPER]`; admin `[SUPER, ADMIN]`; leader `[SUPER, ADMIN, LEADER]`; mentor `[SUPER, MENTOR]`; student `[STUDENT]`; alumni `[STUDENT]` + `alumniArea` |
| `src/lib/navigation.ts` | Every role's "Dashboard" and "Home" entry points at its own dashboard (`:38`, `:52`, `:60`, `:73`, `:81`, `:91`, `:99`, `:111`, `:119`, `:127`, `:136`, `:145`) |
| `src/lib/attendance-actions.ts:78` | The only dashboard revalidation in v1: `revalidatePath("/leader/dashboard")` |

v2 files this domain touches or consumes:

| File | Holds |
|---|---|
| `apps/mobile/app/(app)/dashboard.tsx` | The single `/dashboard` route. Today it lists sessions only. Plan 1 Task 5 adds `AssignmentsSummary`; Plan 9 Task 8 adds `NotificationBell` |
| `packages/shared/src/navigation.ts:47-157` | `/dashboard` is a tab in all six navs ("Home") |
| `apps/backend/src/routes/me.ts:9-37` | `GET /api/v1/me`: name and `scopes.graduationYear`, which the greeting and the alumni header need |
| `apps/backend/src/lib/queries/assignments.ts:29-35`, `:185-226` | `isOverdue` and `isLate` (module-private today) and `listAssignmentsForStudent` (already season-scoped via `groupIdInSeason`) |
| `apps/backend/src/routes/submissions.ts:82-130` | The review-queue scope builder that the dashboard's review counts must share |
| `apps/backend/src/lib/permissions.ts:88-102` | `staffScopeForSeason`, which the leader branch narrows with |

---

## 2. Data model

**Nothing in this domain writes.** All six pages are pure reads, and no read
mutates. Ruling C6 is easy to satisfy here and must stay that way: v2
dashboard endpoints are reads with no side effects.

Models read, with the fields that carry meaning:

| Model | Fields | Used by |
|---|---|---|
| `User` | `role`, `graduationYear`, `deletedAt`, `name`, `email` | super counts, mentor cohort, greetings |
| `StudentProfile` | `activeSeasonId`, `deletedAt`, `activeSeason` | admin roster (`admin:39-41`), mentor cohort (`mentor:28`), student season title (`student:27-31`) |
| `Season` | `status`, `startDate`, `deletedAt`, `title`, `code`, `absenceBudgetMinutes`, `absenceWeightMinutes` | admin season resolution, budget |
| `Session` | `startsAt`, `durationMinutes`, `location`, `youtubeUrl`, `title` | progress, next session, streak |
| `Attendance` | `status` (`PRESENT\|ABSENT\|LATE`, `prisma/schema.prisma:44-48`), `markedAt`, `lateMinutes` | admin/leader attendance %, mentor feed, budget |
| `Submission` | `status` (`DRAFT\|SUBMITTED\|REVIEWED\|RETURNED`), `submittedAt`, `publicId`; `@@unique([assignmentId, studentUserId])` | review counts, "pending", late count, mentor feed |
| `Assignment` | `seasonId`, `deletedAt`, `dueAt`, `isAllGroups`, `targets` | "pending", due soon, late count |
| `Quiz` / `QuizGrade` | `Quiz.seasonId`; `QuizGrade.score` (nullable) | quiz "pending" |
| `Group` / `GroupLeader` / `GroupStudent` | `Group.seasonId`, `Group.name`; `GroupStudent.studentUserId` (**globally `@unique`**) | leader scope, student assignment targeting |
| `JpcEvent` | `date`, `endDate`, `visibility`, `seasonId`, `url`, `imagePath` | events card, super tile |

**`SeasonEnrollment` is read by none of the six dashboards.** Every
"students in this season" question in v1's dashboards resolves through
`StudentProfile.activeSeasonId` (admin, mentor, student) or `GroupStudent`
(leader). Ruling C9 forbids both for season-scoped membership. This is the
single largest structural change in this domain (§10 D7, D8).

`QuizAttempt` is not read either. That is why every ONLINE quiz is
permanently "pending" (spec 12 R114).

---

## 3. Business rules

### Routing and gates — shared by all six

- **R1.** After login each role lands on its own dashboard. An alumnus is a `STUDENT` with a non-null `graduationYear`, and lands on `/alumni/dashboard` ahead of the role switch — `src/lib/auth/post-login.ts:4-6`, `:8-25`; `src/lib/rbac.ts:20-22`.
- **R2.** The path prefix is gated at the edge. SUPER may open any prefix. `/admin`, `/leader` and `/mentor` admit only their exact role. `/alumni` admits only an alumnus. `/student` admits only a non-graduated student. A mismatch redirects to `/forbidden` — `src/lib/auth/post-login.ts:27-43`, `src/proxy.ts:27-32`.
- **R3.** *(implicit)* An alumnus who reaches any active-student page is redirected to `/alumni/dashboard` by the layout, not by the page — `src/components/layout/role-layout.tsx:25-29`.
- **R4.** *(implicit)* SUPER may open `/admin/dashboard`. The layout admits SUPER and so does the page's own `requireRole(["SUPER","ADMIN"])`, and the page then resolves an **unscoped** season (R18) — `src/app/admin/layout.tsx`, `src/app/admin/dashboard/page.tsx:18`, `:20`. SUPER passes the layouts of `/leader/dashboard` and `/mentor/dashboard` but those pages' `requireRole` throws `ForbiddenError` — `leader/dashboard/page.tsx:18`, `mentor/dashboard/page.tsx:21`, `src/lib/auth/permissions.ts:25-35`.
- **R5.** All six dashboards render `UpcomingEventsCard` — `super:37`, `admin:163`, `leader:238`, `mentor:100`, `alumni:46`, `student:246` (spec 15 R78).

### The upcoming-events card — on all six

Domain 15 owns these rules. They are restated here only because the
dashboards are where they bite.

- **R6.** `ALUMNI_ONLY` events are included when `user.role !== "STUDENT"`. An alumnus is role `STUDENT`, so **the alumni dashboard never shows an `ALUMNI_ONLY` event**, while every staff dashboard does — `src/components/events/upcoming-events-card.tsx:23` (spec 15 R44, R45).
- **R7.** `SEASON` events are included for the viewer's seasons: their active season, plus the seasons they administer, plus the seasons of the groups they lead. SUPER sees all — `src/lib/jpc-events-query.ts:24-37`. *(implicit)* A **MENTOR** has none of the three, so the mentor dashboard shows **no `SEASON` events at all**, even though a mentor can read every student.
- **R8.** The card keeps events where `(endDate ?? date) >= startOfDay(now)`, with the start of day taken in the server's zone. It then takes the first four in `date` ascending order — `upcoming-events-card.tsx:20`, `:27-28`; `jpc-events-query.ts:55` (spec 15 R74).
- **R9.** *(implicit)* The filter and the cap run **in memory** after `listJpcEvents` fetches every visible event ever created and resolves a storage URL for each one — `jpc-events-query.ts:43-78`. Every dashboard render therefore pays for the whole events table.
- **R10.** The card renders **nothing** when no event qualifies (no heading, no empty state) — `upcoming-events-card.tsx:30` (spec 15 R75).
- **R11.** The label omits the time when the instant reads as midnight in the server's zone, and collapses a same-day range — `upcoming-events-card.tsx:7-16`. When `url` is set, the whole row is an external link — `:52-58`.

### SUPER — `src/app/super/dashboard/page.tsx`

- **R12.** "Seasons" counts every non-deleted season of **any status**: DRAFT, ACTIVE, COMPLETED and ARCHIVED — `:15`.
- **R13.** "Students" counts every non-deleted `User` with role `STUDENT` and no `graduationYear`. That includes students never enrolled anywhere and students withdrawn from everything — `:16`. This is the same population as reports' `totalStudents`, which spec 17 D4 renames to `totalStudentsNotGraduated`.
- **R14.** "Alumni" counts non-deleted `STUDENT`s with a `graduationYear` — `:17`.
- **R15.** "Upcoming events" is a raw `jpcEvent.count` with `date >= now`. It ignores visibility, ignores `endDate`, and compares to `now` rather than start of day. A multi-day event already in progress is therefore not counted, while the card below it lists that event (R8) — `:18` (spec 15 R79).
- **R16.** Each tile links to its list: `/super/students`, `/super/students/alumni`, `/super/seasons`, `/super/events` — `:30-33`.
- **R17.** There is no empty state. Every tile renders a number, including `0` — `:29-34`.

### ADMIN — `src/app/admin/dashboard/page.tsx`

- **R18.** The season is the most recent **ACTIVE**, non-deleted season by `startDate desc` within `seasonAdminIds`, which is unscoped for SUPER. If there is none, it is the most recent non-deleted season of any status. Two sequential queries — `:20-31` (spec 02 R22).
- **R19.** With no season, every figure is zero or empty and the hero reads "No active season" — `:71`, `:152`.
- **R20.** *(implicit)* The roster is `StudentProfile` rows with `activeSeasonId = season` and `profile.deletedAt = null` — `:39-41`. It does **not** read `SeasonEnrollment`. A withdrawn student whose pointer was never cleared stays on the roster, and an enrolled student whose pointer moved to a newer season drops off it. `User.deletedAt` is never checked.
- **R21.** "Next session" is the first session in the season with `startsAt >= now`, ordered `startsAt asc` — `:43-54`. *(implicit)* A session already in progress has `startsAt < now`, so it disappears from the card the minute it starts.
- **R22.** "Week N of M": `N` counts sessions with `startsAt <= now` and `M` counts all sessions in the season — `:55-56`, `:156`, `:171`. **Both count sessions, not weeks.** A season with two sessions a week reports "Week 8 of 20" in its fourth week.
- **R23.** "Progress" is `round(N / M × 100)`, or `0` when `M = 0` — `:170`.
- **R24.** A student's attendance % is `round((PRESENT + LATE) / N × 100)`, or `null` when `N = 0` — `:75-96`. `LATE` counts as fully present.
- **R25.** *(implicit)* The denominator `N` is every past session in the season, **regardless of when the student enrolled**. A mid-season joiner is measured against sessions that ran before they existed (the same defect as spec 09 R55).
- **R26.** *(implicit)* The numerator counts attendance rows for **any** session in the season with no date filter (`:57-60`). A row marked on a session whose `startsAt` is still in the future (check-in opened early) counts in the numerator but not the denominator, so the percentage **can exceed 100**, and nothing clamps it.
- **R27.** A student's "pending" is `max(0, totalAssignments − completed)` — `:97`. `totalAssignments` counts **every** non-deleted assignment in the season, **ignoring targeting and due dates** (`:65`). `completed` counts that student's `SUBMITTED | REVIEWED | RETURNED` rows (`:84-89`). This is a fourth "submission" arithmetic, alongside the three in spec 17 D2, and it violates ruling C5: a student is charged for assignments their group was never given.
- **R28.** The roster sorts lowest attendance first, with `null` last — `:101-102`.
- **R29.** The hero's average attendance is the mean of per-student percentages with **`null` counted as 0**, or `null` only when the roster is empty — `:104-109`. *(implicit)* A season with students and no past sessions therefore shows **"0 %" in the red tier**, not "—".
- **R30.** The ring and the per-row figure are coloured red below 70, amber below 85 and green otherwise — `:132-138`, `:270-276`. These thresholds appear nowhere else in v1.
- **R31.** A red callout lists every student with attendance below 70 — `:364-377`. **This is a fourth definition of "at risk".** The other three are spec 09 R71 (budget, dead code), R73 (mentor, either component < 60) and R74 (reports, composite < 60), and this one disagrees with all of them.
- **R32.** "Quizzes pending": a quiz is pending when the roster is non-empty and the number of its grade rows with a non-null score is below the roster size — `:111-115`. *(implicit)* Grade rows are **not** filtered to the roster (`:66-69`), so a withdrawn student's grade counts. `QuizAttempt` is never read, so every ONLINE quiz is permanently pending (spec 12 R114). Unpublished ONLINE drafts count too.
- **R33.** The quiz tile shows `0` when the season has no quizzes. The quiz panel is hidden in that case — `:175`, `:327`.
- **R34.** "Pending review" counts `SUBMITTED` and "Reviewed" counts `REVIEWED | RETURNED` over **every submission on a non-deleted assignment in the season, from any student**. They are not roster-scoped — `:61-64`, `:117-118`.
- **R35.** The roster renders **every** student, unpaged — `:257-289`. With no students it shows "No students enrolled" — `:236-243`.
- **R36.** Links: `/admin/students` (`:167`, `:230`), `/admin/quizzes` (`:177`, `:333`), `/admin/season/:code/sessions/:id` (`:193`), `/admin/students/:id` (`:261`), `/admin/assignments` (`:301`).

### LEADER — `src/app/leader/dashboard/page.tsx`

- **R37.** Groups are the token's `groupLeaderIds`, fetched with **no `orderBy`** — `:20-34`.
- **R38.** *(implicit)* The season is `groups[0].seasonId` and the heading is `groups[0].name` — `:36-37`. A leader of two groups gets an arbitrary one as "their" season and name. If the groups are in different seasons, the other season's students are measured against the first season's sessions and assignments.
- **R39.** *(implicit)* Students are the `GroupStudent` rows of **all** led groups, flattened — `:38-39`. That violates ruling C9: `GroupStudent` is global and singular.
- **R40.** Attendance, submissions and quiz grades are filtered to those students and the first group's season — `:61-86`. `totalAssignments` counts every assignment in that season, **including ones not targeted at the leader's group** — `:76`.
- **R41.** Every formula from R22–R32 applies verbatim — `:90-134`. The averaged figure is labelled "Group average attendance" — `:145`.
- **R42.** With no groups: every figure is zero, the hero reads "No active season" and "Your group", and the roster empty state reads "No students yet" — `:88`, `:165`, `:168`, `:252-258`.
- **R43.** Links: `/leader/groups` (`:180`, `:246`), `/leader/quizzes` (`:190`, `:343`), `/leader/sessions/:id` (`:206`), `/leader/students/:id` (`:271`), `/leader/submissions` (`:311`).
- **R44.** v1's only dashboard cache invalidation is attendance marking revalidating `/leader/dashboard`. Nothing revalidates the admin, student or mentor dashboards, and they stay fresh only because they render dynamically — `src/lib/attendance-actions.ts:78`.

### MENTOR — `src/app/mentor/dashboard/page.tsx`

- **R45.** *(implicit)* The cohort is every non-deleted `STUDENT` whose profile has a non-null `activeSeasonId` — `:24-41`. Enrolment status, season status, season soft-deletion and `graduationYear` are all ignored.
- **R46.** Each student is scored by `computeEngagementForStudent(id, activeSeasonId)`, with all N calls in flight at once. That is 4N queries per render (`:44-55`; spec 09 R79, R80).
- **R47.** A student is at risk when `attendancePct < 60` **or** `submissionPct < 60`. The list is sorted by composite `score` ascending and cut to 10, with no total shown — `:17`, `:57-64` (spec 09 R73).
- **R48.** *(implicit)* The card is titled **"Flagged for follow-up"** (`:108`). That is the vocabulary of the note `followUpFlagged` flag (spec 09 R13, R22), but the card lists engagement at-risk students, not flagged notes.
- **R49.** The empty state reads "All students above the 60% engagement threshold". That describes the composite, while the filter tests each component — `:117-120` (spec 09 R76).
- **R50.** Each row shows `name ?? email`, the season title, attendance % and submission % — `:131-140`.
- **R51.** Recent attendance is the **8** most recent `Attendance` rows by `markedAt` across every student with role `STUDENT`. There is no season, enrolment, soft-delete or graduation filter — `:67-78`.
- **R52.** Recent submissions are the **8** most recent `SUBMITTED | REVIEWED` rows by `submittedAt desc` across every student and season. There is no soft-delete filter on assignment or student — `:79-91` (spec 08 R57).
- **R53.** *(implicit)* Only **4 of each 8** are rendered: first the attendance block, then the submission block. They are not merged into one timeline, so the "recent activity" card is not in time order — `:161-210`.
- **R54.** *(implicit)* A `REVIEWED` row renders as "received feedback on …" but shows and sorts by **`submittedAt`**, not `reviewedAt`. A review written today on an old submission never surfaces — `:195`, `:204-207`.
- **R55.** *(implicit)* Each submission row links to `/leader/submissions/:publicId` (`:198`). The edge gate admits only LEADER to `/leader` (R2), so **every submission link on the mentor dashboard lands on `/forbidden`**, even though the target page itself admits MENTOR (`src/app/leader/submissions/[publicId]/page.tsx:26`).
- **R56.** The two activity queries are sequential awaits that run after the fan-out — `:67`, `:79`. The empty state reads "No recent activity." — `:211-215`.
- **R57.** Quick links to `/mentor/students`, `/mentor/notes`, `/mentor/reports` and `/mentor/settings` — `:221-226`.

### ALUMNI — `src/app/alumni/dashboard/page.tsx`

- **R58.** A caller who is not an alumnus is redirected to **`/login`** (`:15`), even though they are signed in. The layout normally catches them first (R3, `role-layout.tsx:20-21`).
- **R59.** The greeting uses the first whitespace-separated token of the trimmed name. The fallback "there" applies only when `name` is null, so an empty string renders "Welcome back, " — `:21`, `:33`.
- **R60.** The header reads "JPCS Alumnus · Class of {graduationYear}", read from the database rather than the token — `:17-20`, `:29`.
- **R61.** One action, "View my history", goes to `/alumni/history` — `:40-42`. The page has no other data.

### STUDENT — `src/app/student/dashboard/page.tsx`

- **R62.** *(implicit)* `seasonId` comes from the **token** (`user.activeSeasonId`), while the season title comes from the **database** (`studentProfile.activeSeason`) — `:23-38`. If the pointer changed after sign-in, the card shows one season's title over another season's figures.
- **R63.** With no active season the page runs no queries. It shows "Not enrolled yet" plus a "Complete your profile" link to `/student/profile`, and the greeting subtitle reads "Welcome to JPC Space" — `:74`, `:102`, `:107-126`.
- **R64.** Next session: the same rule as R21 — `:42-53`.
- **R65.** The assignment list comes from `listAssignmentsForStudent`, which resolves targeting through `GroupStudent` and takes `submissions[0]`. A missing submission row reads as `PENDING` — `:54`; `src/lib/assignments-query.ts:197-241`.
- **R66.** "Pending" means status `PENDING` or `DRAFT`. `RETURNED` is **not** pending — `:76-78`. (No code path writes `RETURNED`, per spec 08 R21, so the distinction is latent today.)
- **R67.** The greeting reads "N assignment(s) need(s) your attention" when pending > 0, otherwise "You're all caught up **this week**" — `:98-101`. Pending counts the whole season, not the week.
- **R68.** Progress is past sessions over all sessions, rendered as "Week N of M · K weeks to go" or "· complete" at 100 %. This is the same sessions-as-weeks conflation as R22 — `:69-72`, `:83-84`, `:149-155`.
- **R69.** The budget tile shows `max(0, round(100 − budgetPct))` labelled **"Absence budget"** with sublabel "this season", or "—" when the budget is null. It links to `/student/attendance` — `:85-87`, `:163-168`. The local variable is named `attendancePct`, and spec 09 R68's description of the label as "Attendance" is **stale for this page**: the label was corrected, the variable and the inversion were not. The figure is the *remaining* budget, and it inherits domain 4's `lateMinutes` defect (ruling C3).
- **R70.** The streak tile shows `computeAttendanceStreak`, with a flame icon when > 0 — `:56`, `:170-181`. The streak walks past sessions newest-first; `ABSENT` breaks it and an unmarked session is skipped — `src/lib/engagement.ts:250-273` (spec 09 R69).
- **R71.** The assignments tile shows the pending count, highlighted when > 0, and links to `/student/assignments` — `:182-188`.
- **R72.** "Submitted late" counts the student's `SUBMITTED | REVIEWED | RETURNED` rows with non-null `submittedAt`, on non-deleted assignments in the season that have a `dueAt`, where `submittedAt > dueAt` — `:57-68`, `:79-81`. This re-derives lateness at a fifth site (spec 07 R87). *(implicit)* It is not targeting-scoped. The amber banner renders only when the count > 0 — `:190-197`.
- **R73.** "Due soon" shows the first **3** pending assignments in `dueAt asc` order (Postgres puts nulls last), **overdue ones included**. Overdue rows get a red "Due MMM d" badge and the rest an amber "Due in …" badge. The section is hidden when nothing is pending — `:249-288`.
- **R74.** The next-session card links to `/student/sessions/:id` and shows a "Watch recording" button whenever the session has a `youtubeUrl`, **including for a session that has not happened yet**. With no session it shows "No upcoming sessions." — `:200-243`.

### Time — every dashboard

- **R75.** Every comparison uses a bare `new Date()` on the server, and every label is formatted with `date-fns` in the server's zone: `"EEE, MMM d · h:mm a"` for sessions (`admin:199`, `leader:212`, `student:216`), `"MMM d"` for due dates (`student:280`), and `startOfDay` for events (`upcoming-events-card.tsx:20`). Relative labels (`formatDistanceToNowStrict`) are computed at render time on the server — `admin:204`, `mentor:178`, `student:221`.

**Total: 75 rules, 23 marked `(implicit)`.** The load-bearing ones are:

- **R20, R39, R45**: no dashboard reads `SeasonEnrollment`.
- **R27**: a fourth submission arithmetic, violating C5.
- **R31**: a fourth at-risk definition.
- **R55**: every mentor submission link is broken.
- **R6/R7**: alumni and mentors miss whole classes of events.

---

## 4. Authorization

| Operation | Roles | Row-scoped condition | v1 citation |
|---|---|---|---|
| Open the super dashboard | SUPER | none | `super/layout.tsx`; `super/dashboard/page.tsx:11` |
| Open the admin dashboard | SUPER, ADMIN | season ∈ `seasonAdminIds` (SUPER unscoped), applied as a `where` clause, **not a check** | `admin/dashboard/page.tsx:18`, `:20-31` |
| Open the leader dashboard | LEADER | groups ∈ `groupLeaderIds` from the token, **no role pairing** (C7) | `leader/dashboard/page.tsx:18`, `:20-22` |
| Open the mentor dashboard | MENTOR | none. Every active student in the system | `mentor/dashboard/page.tsx:21`, `:24-41` |
| Open the alumni dashboard | alumnus | `isAlumnus` | `alumni/dashboard/page.tsx:15` |
| Open the student dashboard | STUDENT, non-graduated | own `userId`, own token `activeSeasonId` | `student/dashboard/page.tsx:21`, `:37` |
| See events on the card | all | caller-supplied `includeAlumniOnly` (wrong for alumni) plus `viewerSeasonIds` (empty for mentors) | `upcoming-events-card.tsx:23-24` |

**Where v1 enforces nothing and relies on the page:**

1. **Scope is a `where` clause, not a gate.** The admin page never checks that
   the season it renders is one the caller administers. It simply never asks
   for another one (R18). Once v2 accepts `?seasonId=` from a phone, that
   parameter must be checked with `isAdminOfSeason` / `staffScopeForSeason`.
   Narrowing the query is not enough (ruling C8 #1).
2. **The leader scope trusts `groupLeaderIds` without the role** (R37). v2 must
   go through `staffScopeForSeason` (`apps/backend/src/lib/permissions.ts:88-102`),
   which already pairs the claim with role `LEADER` (C7).
3. **The mentor's cohort-wide read is implicit** (R45, R51, R52). It is
   presumably intended, since it matches `canReadAllStudents`, but v2 should
   state it in the endpoint rather than inherit it from "the page doesn't
   filter". Mentors must not see `DRAFT` work in the feed (spec 08 D8).
4. **Payload narrowing (C8 #2).** A student must never receive a cohort figure,
   another student's name, or the staff engagement shape, which includes
   `score` and `atRisk`. Spec 09 D9 and Plan 8 Task 1's `.strict()`
   `studentSelfEngagementSchema` already establish this. The dashboard's
   student branch carries **only the caller's own rows**.

---

## 5. Read surface

Per-render cost, counting only database round-trips.

| Dashboard | Queries | Notes |
|---|---|---|
| SUPER | 4 counts, plus events: 1 unbounded `findMany` and 1 storage URL per event (R9) | Cheap apart from the events read |
| ADMIN | 2 sequential (season) + 8 parallel + events | The roster is unpaged and every row is rendered (R35). `attendance.findMany` and `submission.findMany` pull **every row in the season** to tally in JS (`:57-64`) |
| LEADER | 1 (groups) + 8 parallel + events | `quiz.findMany` with nested `grades` per quiz (`:77-86`) |
| MENTOR | 1 (cohort) + **4N concurrent** + 2 sequential + events | ~800 queries for a 200-student cohort (spec 09 R80) |
| ALUMNI | 1 + events | |
| STUDENT | 1 + 7 parallel (`listAssignmentsForStudent` is 2, budget is 3, streak is 1) + events | The streak scans every past session (spec 09 R70) |

Shape varies by role only in which page renders. There is no shared shape.
Every figure on a v1 dashboard is computed in the page component and never
leaves it.

**The mobile problem.** `/dashboard` is the screen React Query will refetch
most often: it is every role's Home tab, so it refetches on mount, on focus
and on reconnect. Any per-student or per-season fan-out on this screen is paid
every time the app comes to the foreground. The v2 design therefore has two
goals: a **constant** query count per role, and one round-trip per card rather
than one per row.

---

## 6. Write surface

None. No dashboard performs or triggers a write, in v1 or in v2 (C6). The
only "write-adjacent" concern is **invalidation**: v1 revalidates one
dashboard from one action (R44). In v2 the dashboard query key must be
invalidated by the mutations that move its numbers (§7, "Invalidation").

---

## 7. Proposed API

### Decision: compose where an endpoint already answers the question, add one summary endpoint where it does not

Composition is preferred, and these tiles can be served by endpoints that
Plans 1–17 already define, unchanged or with a small amendment:

| Tile | Endpoint (plan) | Why it is sufficient |
|---|---|---|
| Greeting, alumni "Class of" | `GET /api/v1/me` (exists, `routes/me.ts:9`; Plan 7 extends it) | `user.name`, `scopes.graduationYear` |
| SUPER: Students / Alumni / Seasons | `GET /api/v1/reports/organisation` (Plan 11 Task 5) | `totalStudentsNotGraduated` = R13's population, `totalAlumni` = R14, `seasons[]` = R12's non-deleted seasons. Same query, one definition, shared with the SUPER Reports screen |
| Upcoming events card (all six) + SUPER events tile | `GET /api/v1/events` (Plan 10 Task 9), **amended** (below) | One visibility predicate (`eventVisibilityFilter`) and one window rule, plus Plan 10's prefix invalidation on every event write |
| MENTOR at-risk list | `GET /api/v1/reports/engagement` (Plan 11 Task 5) | Returns `atRisk[]` (cap 10, `score` asc), `atRiskTotal` and the band where `AT_RISK ≡ isAtRisk`, over the mentor's permitted scope. It is **the same query key as the mentor's own Reports tab**, so Home and Reports cannot show different at-risk sets (spec 17 D5) |
| STUDENT absence budget + streak | `GET /api/v1/me/attendance` (Plan 14, from spec 04 §7), **amended** to carry `streak` | Domain 4's number on domain 4's terms. The tile links to `/attendance`, which reads the same key |
| Unread bell | `GET /api/v1/notifications/unread-count` (Plan 9 Task 8) | Already on `dashboard.tsx` |
| Staff season id | `GET /api/v1/seasons` via Plan 4's `useCurrentSeasonId` | Binding per rulings X8 |

Composition **fails** for the rest. In every case the reason is either N
round-trips, or a metric the client would have to derive, which C4 and C2
forbid:

- **Review counts** (R34). `GET /api/v1/submissions` is cursor-paged with no
  total (`routes/submissions.ts:82-191`). A count would mean paging the whole
  queue.
- **Quiz pending** (R32). `GET /api/v1/quizzes` (Plan 6) is paged. Counting
  pending quizzes means walking every page, and then comparing `gradedCount`
  to `studentCount` on the client.
- **Season progress and next session** (R21–R23, R64, R68).
  `GET /seasons/:id/sessions` returns the full list. "Held so far" and "next"
  are comparisons against now, and C2 puts those on the server ("if a screen
  needs to know whether something is overdue, the API tells it").
- **Average attendance, at-risk preview and count for a season or a leader's
  groups** (R29, R31). `GET /seasons/:id/engagement` (Plan 8) returns the rows,
  but the mean and the count are cohort metrics, and computing them on the
  client is exactly what C4 forbids.
- **Student late count** (R72). The student assignment rows carry no
  `submittedAt` and no `isLate` (`packages/shared/src/assignment.ts:59-66`).
- **Student outstanding/overdue counts and due-soon** (R66, R73). Plan 1
  Task 5 currently counts these on the client from list rows. The predicate is
  business logic (see §10 D15) and moves to the server.
- **Mentor recent activity** (R51–R56). No endpoint returns attendance marks
  or submissions as a cross-season, time-ordered feed.

### Endpoint table

| Method | Path | Status | Auth | Request | Response |
|---|---|---|---|---|---|
| GET | `/api/v1/me/dashboard` | **new** | Any authenticated role except alumnus (403). See the variant rules below | `?seasonId=` required for ADMIN and LEADER, optional for SUPER, ignored for STUDENT and MENTOR | `{ data: Dashboard }`, a discriminated union on `variant` (§8) |
| GET | `/api/v1/events` | **partial**: exists in Plan 10 Task 9, amended | unchanged (`eventVisibilityFilter`) | adds `?upcoming=true` (server sets the lower bound to `startOfDayInOrgTime(now)` on `(endDate ?? date)`, C2) and `?limit=` (1–20) | adds `total` (the count in the window before `limit`) beside `events` |
| GET | `/api/v1/me/attendance` | **partial**: Plan 14, from spec 04 §7 | STUDENT (own) | unchanged | adds `streak` (int ≥ 0), computed by the one server function (R70) |
| GET | `/api/v1/reports/organisation` | **exists** (Plan 11) | SUPER | none | reused as-is |
| GET | `/api/v1/reports/engagement` | **exists** (Plan 11) | MENTOR, SUPER, ADMIN (intersected) | none (omitted `seasonId` = permitted scope) | reused as-is. The mentor branch renders `atRisk` and `atRiskTotal` only |
| GET | `/api/v1/me` | **exists** | any | none | reused |
| GET | `/api/v1/notifications/unread-count` | **exists** (Plan 9) | any | none | reused |

`GET /api/v1/me/dashboard` mounts on the existing `meRouter`
(`app.ts:53`, which owns the `/api/v1/me` prefix exclusively) with
`requireAuth` attached **per route**, per rulings X5.

### Variant rules for `GET /api/v1/me/dashboard`

| Caller | Variant | Gate | Scope of every figure |
|---|---|---|---|
| STUDENT (not graduated) | `STUDENT` | own; `seasonId` is the token's `activeSeasonId`, and a supplied one is ignored | the caller's own rows only (C8 #2) |
| Alumnus | none: **403 `forbidden`** | — | The alumni Home composes `/me` and `/events` only |
| ADMIN | `SEASON_STAFF` with `scope: "season"` | `isAdminOfSeason(user, seasonId)`, else 403. Missing `seasonId` gives 400 | ACTIVE `SeasonEnrollment` of the season (C9) |
| SUPER | `SEASON_STAFF` with `scope: "season"` when `seasonId` is given; 400 otherwise | `isAdminOfSeason` (short-circuits for SUPER) | as ADMIN. Parity with R4; SUPER's Home does not call it |
| LEADER | `SEASON_STAFF` with `scope: "groups"` | `staffScopeForSeason(user, seasonId)` must return `kind: "groups"`, else 403 | ACTIVE `SeasonEnrollment` rows of that season whose `groupId` is in the scope's `groupIds` (C9, fixing R38–R40) |
| MENTOR | `MENTOR` | role | Cross-season feed (D18). The at-risk list comes from `/reports/engagement` |

A 404 is never used for "no season". An ADMIN or LEADER with no current
season never calls the endpoint: `useCurrentSeasonId` returns null and the
query is `enabled`-gated. A STUDENT with no active season receives the
`STUDENT` variant with `season: null` and everything else null or empty
(R63), so the empty state is a server statement rather than a client guess.

### How the server computes each figure: reuse, never re-derive

| Figure | Server function it must call | Never |
|---|---|---|
| `cohort.studentCount`, `meanAttendancePct`, `atRisk[]`, `atRiskTotal` | `computeEngagementForSeasons([seasonId], { studentUserIds? })` (Plan 8 → Plan 11) and `isAtRisk` (`packages/shared`, Plan 8 Task 1) | a second attendance formula (R24–R26) or the 70 % rule (R31) |
| `submissions.pendingReview` / `.reviewed` | the review-queue scope builder, extracted from `routes/submissions.ts:96-130` into `lib/permissions.ts` (e.g. `submissionQueueScopeFor(user)`), ANDed with `assignment.seasonId` and `assignment.deletedAt: null` | a separately written scope, which would let the count disagree with the queue it links to |
| `quizzes.*` | Plan 6's per-kind graded counter (PAPER: `QuizGrade.score` not null; ONLINE: `QuizAttempt.status = GRADED`) over Plan 6's `visibleStudentIdsForQuiz(user, seasonId)` population. Plan 18 asks Plan 6's file to export the counter rather than copying it | R32's grade-rows-versus-roster comparison |
| `progress`, `nextSession` | one helper in `lib/queries/sessions.ts`, taking `now` as an argument | client-side "is this in the past" |
| `assignments.*` (STUDENT) | `listAssignmentsForStudent` (`lib/queries/assignments.ts:185`), plus `isOverdue` and `isLate` **exported** from that same file (`:29-35`) and the shared `isAssignmentOutstanding` predicate (§8) | a second lateness comparison (spec 07 R87) |
| `recentActivity` (MENTOR) | two bounded `findMany` calls (`take: 8` each), merged in memory | the unscoped v1 queries (R51, R52) |

**Query budget.** For `SEASON_STAFF`: the five inside
`computeEngagementForSeasons`, plus two submission counts, plus the quiz page
(Plan 6's count, two `groupBy`s), plus two session reads (counts and the
next/current session), plus the scope lookup. That is roughly a dozen, and the
same dozen for 5 students or 500. For `STUDENT`: about six. For `MENTOR`: two.
**No query count may depend on cohort size, season count or group count.**

### Invalidation

New query key factory: `queryKeys.dashboard.all` / `.me(seasonId)`. These
mutations must invalidate `queryKeys.dashboard.all`, in the same plan that
introduces each mutation's screen:

- attendance marking and check-in (Plan 2, Plan 4, Plan 14)
- submission submit and review (Plans 1, 2)
- quiz grade and attempt submit (Plan 6)
- assignment create, edit and delete (Plan 15)
- enrolment and drop (Plan 5)
- session create and delete (Plans 3, 16)

Plan 10's event writes already invalidate `queryKeys.events.all`, which covers
the card. Apply `staleTime: 60_000` to the dashboard key so that focus
refetches inside a minute are served from cache. The at-risk list must not be
cached beyond that (spec 09 §5 item 3: "a stale at-risk list is worse than a
slow one").

---

## 8. Proposed shared contracts

New file: `packages/shared/src/dashboard.ts`. Wave B writes the code; field
tables only here.

### Reuse, do not redefine

- `engagementRowSchema` / `EngagementRow`, `isAtRisk`, `AT_RISK_PCT`
  (`packages/shared/src/note.ts`, Plan 8 Task 1). The staff at-risk preview
  rows are **`engagementRowSchema` rows**, not a new shape.
- `engagementSummarySchema`, `bandFor`, `organisationReportSchema`
  (`packages/shared/src/reports.ts`, Plan 11 Task 1). These are consumed by
  the MENTOR and SUPER branches through their own endpoints.
- `studentAssignmentListItemSchema` (`packages/shared/src/assignment.ts:59-66`).
  The due-soon rows are this schema.
- `jpcEventListItemSchema` (Plan 10 Task 1). The card's rows.
- `attendanceBudgetSchema` / `myAttendanceResponseSchema` (spec 04 §8, Plan 14).
  The budget tile.
- `submissionStatusSchema` and `attendanceStatusSchema` (`enums.ts`).
- `seasonStatusSchema` / season identity fields (`season.ts`). Do not restate
  `SeasonListItem`.

### New schemas

| Name | Fields |
|---|---|
| `seasonProgressSchema` | `sessionsHeld` (int ≥ 0: sessions with `startsAt <= now`), `sessionsTotal` (int ≥ 0), `pct` (int 0–100, **nullable** when `sessionsTotal = 0`). Named for sessions, never weeks (D12) |
| `dashboardSessionSchema` | `id`, `title`, `startsAt` (ISO), `durationMinutes`, `location` (nullable), `youtubeUrl` (nullable), `isInProgress` (bool, server-derived: `startsAt <= now < startsAt + durationMinutes`, D13) |
| `dashboardSeasonSchema` | `id`, `code`, `title`, `status` |
| `staffCohortSummarySchema` | `studentCount` (ACTIVE enrolments in scope), `meanAttendancePct` (int 0–100, **nullable** when no student in scope has `attendanceTotal > 0`, D5), `atRiskTotal` (int), `atRisk` (`EngagementRow[]`, ≤ `DASHBOARD_AT_RISK_PREVIEW`, ordered `score` asc then `studentUserId`, the same order as Plan 11's `byScoreThenId`) |
| `reviewCountsSchema` | `pendingReview` (`SUBMITTED`), `reviewed` (`REVIEWED \| RETURNED`), both under the queue scope (D11) |
| `quizRollupSchema` | `total` (quizzes in the season, excluding unpublished ONLINE drafts), `pending` (`studentCount > 0 && gradedCount < studentCount`), `fullyGraded` (`total − pending`), `drafts` (unpublished ONLINE count, shown separately, D10) |
| `staffSeasonDashboardSchema` | `variant: "SEASON_STAFF"`, `scope` (`"season" \| "groups"`), `season`, `groups` (`{ id, name }[]`, empty for `"season"` scope), `progress`, `nextSession` (nullable), `cohort`, `submissions`, `quizzes` |
| `studentAssignmentSummarySchema` | `outstandingCount`, `overdueCount` (outstanding and `isOverdue`), `lateSubmittedCount` (turned-in rows with `isLate`), `dueSoon` (`StudentAssignmentListItem[]`, ≤ `DUE_SOON_LIMIT`, outstanding only, `dueAt` asc nulls last, overdue included per R73) |
| `studentDashboardSchema` | `variant: "STUDENT"`, `season` (nullable), `progress` (nullable), `nextSession` (nullable), `assignments` (nullable). Every field is null together when `season` is null (R63). **No cohort field, no other student, no `score`** |
| `activityItemSchema` | `kind` (`"attendance" \| "submitted" \| "reviewed"`), `at` (ISO: `markedAt`, `submittedAt` or `reviewedAt` respectively, D18), `studentUserId`, `studentName` (nullable), `subjectTitle` (session or assignment title), `attendanceStatus` (nullable), `submissionPublicId` (nullable) |
| `mentorDashboardSchema` | `variant: "MENTOR"`, `recentActivity` (`ActivityItem[]`, ≤ `RECENT_ACTIVITY_LIMIT`, merged, `at` desc) |
| `dashboardSchema` | discriminated union of the three on `variant` |

### New constants and helpers (one definition each, C4)

| Name | Value / rule |
|---|---|
| `DASHBOARD_AT_RISK_PREVIEW` | `10` (v1's cap, R47) |
| `DUE_SOON_LIMIT` | `3` (R73) |
| `UPCOMING_EVENTS_LIMIT` | `4` (R8) |
| `RECENT_ACTIVITY_LIMIT` | `8` (D18) |
| `isAssignmentOutstanding(status)` | true for `PENDING \| DRAFT`. That is exactly the complement of C5's "completed" set (`SUBMITTED \| REVIEWED \| RETURNED`), so outstanding + completed = expected for every student. Plan 1 Task 5's client-side filter switches to this predicate (D15) |
| `meanAttendancePct(rows: EngagementScore[])` | `round(mean(attendancePct))` over rows with `attendanceTotal > 0`, else `null`. Called **only on the server**; it lives in `packages/shared` so the Reports screen can never grow a second definition |

### Bare interfaces converted

None. v1's dashboard figures are local variables, not interfaces.

---

## 9. Screens

One route, `/dashboard`, with role branches (Phase 0 decision D1). The branch
is chosen by `navFor(user)`'s audience rule: `role` plus `graduationYear`.
The branch components live in `apps/mobile/src/components/dashboard/`
(`SuperDashboard`, `SeasonStaffDashboard`, `MentorDashboard`,
`StudentDashboard`, `AlumniDashboard`, `UpcomingEventsCard`).
`dashboard.tsx` becomes a switch and keeps Plan 9's `NotificationBell`. Plan 1's
`AssignmentsSummary` is **absorbed** into `StudentDashboard`, since its counts
now come from the server (D15).

| v1 page(s) | v2 route | Exists? | Roles | Reads | Notes |
|---|---|---|---|---|---|
| `super/dashboard` | `/dashboard`, SUPER branch | route exists | SUPER | `/reports/organisation`, `/events?upcoming=true&limit=4` | Tiles: Students (not graduated) → `/students`; Alumni → `/students/alumni`; Seasons (`seasons.length`) → `/seasons`; Upcoming events (`total`) → `/events`. Shares the cache with `/reports` |
| `admin/dashboard` | `/dashboard`, ADMIN branch | route exists | ADMIN | `useCurrentSeasonId` → `/me/dashboard?seasonId`, `/events…` | Hero: season title, `progress`, `meanAttendancePct` (neutral ring, D2). Tiles: students → `/students`, progress, quizzes pending → `/quizzes`. Next session → `/session/[id]` (Plan 4). At-risk card ("N of M") → `/student/[id]` (Plan 5). Review counts → `/submissions` (Plan 2). Quiz panel when `total > 0`. **No full roster** (D6). Empty: "No season yet" when `useCurrentSeasonId` is null |
| `leader/dashboard` | `/dashboard`, LEADER branch | route exists | LEADER | same | Heading lists `groups[].name` (all groups in that season, D7). "Your students" at-risk card. "View all" → `/groups` |
| `mentor/dashboard` | `/dashboard`, MENTOR branch | route exists | MENTOR | `/reports/engagement`, `/me/dashboard`, `/events…` | Card titled **"At risk"** (D17), "10 of N" with `atRiskTotal`, empty "Nobody at risk" with copy naming *either* component under 60 %. Activity feed: merged and time-ordered, rows → `/student/[id]` and `/submission/[publicId]` (Plan 2; fixes R55). **No quick links**: they are tabs in v2 |
| `alumni/dashboard` | `/dashboard`, ALUMNI branch | route exists | alumnus | `/me`, `/events…` | Greeting from `user.name` via one `firstName` formatter in `src/lib/format.ts`; "Class of {graduationYear}" from `scopes`; "View my history" → `/history` (Plan 14) |
| `student/dashboard` | `/dashboard`, STUDENT branch | route exists | STUDENT | `/me/dashboard`, `/me/attendance`, `/events…` | Progress ring ("Session N of M"); tiles: **"Absence budget left"** (D14) → `/attendance` (Plan 14), streak, outstanding → `/assignments`; late banner; next/current session → `/session/[id]` with "Join"/"Watch" per `isInProgress` (D13); due soon → `/assignment/[id]` (Plan 1). Not-enrolled → `EmptyState` + "Complete your profile" → `/profile` (Plan 14) |
| `UpcomingEventsCard` (×6) | shared component | **new** | all | `/events?upcoming=true&limit=4` | Rows → `/event/[id]` (Plan 10) or the external `url`. **Renders an `EmptyState`, not nothing** (R10; spec 15 §9) |

**Detail routes this domain links to.** None is created here. Each must exist
first, because typed routes reject an `href` to a missing file:
`session/[id]/index.tsx` (Plan 4, directory form per rulings X7),
`student/[id].tsx` (Plan 5), `assignment/[id].tsx` (Plan 1),
`submission/[publicId].tsx` (Plan 2), `event/[id].tsx` (Plan 10),
`/attendance`, `/history` and `/profile` content (Plan 14). Plan 18 runs after
all of them in the execution order, so it can link to every one. If any is
missing at implementation time, stop. Do not work around it with `as Href`.

**States.** Every branch maps to `LoadingState`, then `ErrorState` (with
`onRetry` wired to each failed query's `refetch`, guarded where the query is
`enabled`-gated), then content. Cards fail independently: a failed events
query must not blank the student's budget. Pull-to-refresh refetches every
query the branch owns.

**Tests** use `renderWithProviders`, with one test per branch. Each asserts
that the branch issues **no** request it does not own. For example, the
STUDENT branch must never call `/reports/engagement`, and the ALUMNI branch
must never call `/me/dashboard`. This is the C8 #2 check at the client.

---

## 10. Open questions and divergences

Recommended rulings are in **bold**. Items marked *(needs ruling)* change a
number users already quote, or contradict a written plan.

### D1 — One summary endpoint plus composition, not six endpoints and not pure composition

Pure composition gives the ADMIN Home about seven calls, two of which walk
paginated lists, plus client-side progress, mean and pending arithmetic. That
breaks C4 and C2. Six per-role endpoints would duplicate the organisation
report and the engagement report, and create a second cache for numbers that
the Reports tab already holds.
**Ruling: `GET /api/v1/me/dashboard` for the three variants nothing else
serves, and reuse for everything that already exists (§7).**

### D2 — The fourth at-risk definition and the 70/85 colour tiers *(needs ruling)*

R30 and R31 add a fourth at-risk rule (attendance < 70) and a second tier
scale (70/85) to the three that spec 09 D7 already found. Plan 8 ruled one
definition (`isAtRisk`), and Plan 11 D-17.2 made the reports band agree with
it.
**Ruling: the admin and leader callout becomes the `isAtRisk` preview. The
70/85 tiers are dropped: the ring and the rows render neutral, and the only
red is `atRisk`.** Keeping the tiers would need a fifth named threshold in
`packages/shared`, and the people who read a red badge would still get a
different answer from the at-risk card beside it. Expect the flagged set to
grow: component-wise at 60 catches submission-only risk, which the v1
dashboard never showed.

### D3 — Admin and leader attendance % changes value

v1 divides by every past session (R25) and can exceed 100 (R26). v2 takes
`attendancePct` from Plan 8's engagement row. Its denominator starts at
`SeasonEnrollment.enrolledAt` (Plan 8 ledger #13) and it counts only past
sessions.
**Ruling: adopt it. A mid-season joiner's figure rises, and no figure exceeds
100.** Record this in the Plan 18 divergence ledger. It is the same divergence
Plan 8 already accepted, now visible on a second screen.

### D4 — Per-student "pending" violates C5

R27 charges students for assignments their group was never given.
**Ruling: the dashboard no longer shows per-student pending.** The at-risk
preview carries `submissionsCompleted` / `submissionsExpected` from the
engagement row, rendered as "N of M submitted", so there is no subtraction on
the client and no fourth arithmetic. As in Plan 11 D-17.1, this keeps its
denominator through to the counts: the figure is *assigned to that student*.

### D5 — Mean attendance counts "no data" as 0 %

R29 shows a red 0 % on a season's first day. **Ruling: `meanAttendancePct` is
the mean over students with `attendanceTotal > 0`, and `null` (rendered "—")
when there are none.** This matches the guard Plan 8 put in `isAtRisk` for the
same reason (spec 09 R56).

### D6 — No full roster on the mobile Home *(needs ruling)*

v1 renders every student in the season, unpaged (R35). On a phone that buries
the at-risk card under 150 rows, and it duplicates `/students` (Plan 5) and
`/groups` (Plan 2).
**Ruling: show the at-risk preview plus a "View all" link.** If product wants
the roster back, it is `GET /seasons/:id/engagement` (Plan 8), consumed as-is.
Its rows already carry everything the v1 roster showed, so no new endpoint is
needed.

### D7 — The leader's season and group are arbitrary

R37–R40: `groups[0]` with no ordering, `GroupStudent` flattened across
seasons, and students measured against the wrong season.
**Ruling: the season comes from `useCurrentSeasonId` (X8). The groups are
those `staffScopeForSeason` returns for that season, and every one of them is
named in the header. Students are ACTIVE `SeasonEnrollment` rows whose
`groupId` is in those groups (C9).** A leader with groups in two seasons sees
one season at a time, which is consistent with every other staff screen.

### D8 — The admin roster population changes

R20 reads `StudentProfile.activeSeasonId`. **Ruling: ACTIVE `SeasonEnrollment`
(C9).** This also makes `studentCount` agree with Plan 6's quiz `studentCount`
and with Plan 11's cohort. The v1 dashboard disagreed with both.

### D9 — `useCurrentSeasonId` does not implement R18's ordering *(needs ruling, affects Plan 4)*

v1 picks the ACTIVE season with the latest `startDate`. Plan 4's hook picks
the **first ACTIVE row of `GET /api/v1/seasons`**, which is ordered
`year desc, title asc` (`apps/backend/src/routes/seasons.ts:52`). An admin of
two ACTIVE seasons in the same year gets the alphabetically first one, not the
latest-starting one.
**Ruling: fix it in Plan 4. Either order the seasons list
`startDate desc` within status, or have the hook sort by `startDate` before
choosing.** Do not re-resolve the season inside `/me/dashboard`; rulings X8
make the hook the single source.

### D10 — Quiz "pending" uses Plan 6's definition, and drafts leave the count

R32 never reads `QuizAttempt`, does not narrow grades to the roster, and
counts drafts. **Ruling: Plan 6's per-kind `gradedCount` / `studentCount`
over `visibleStudentIdsForQuiz`, with unpublished ONLINE quizzes reported as
`drafts` rather than "pending".** ONLINE quizzes stop being permanently
pending, and that is the intended behaviour, not a regression.

### D11 — Review counts must equal the queue they link to

R34 counts every submission in the season. Tapping the tile lands on Plan 2's
queue, which is scoped differently. **Ruling: extract the queue's scope
builder and use it for both. `RETURNED` stays in "Reviewed".** For a LEADER
this narrows the count to their students' work, consistent with ruling C8.

### D12 — "Week N of M" counts sessions

R22 and R68. **Ruling: relabel it "Session N of M", and the student copy
"K sessions to go".** Computing real weeks would need wall-clock bucketing in
the org timezone (C2) for a figure nobody uses for anything else. The contract
field names (`sessionsHeld`, `sessionsTotal`) make the unit unmistakable.

### D13 — "Next session" hides the session that is happening now

R21 and R64. A student opening Home during a session, which is the moment they
need the check-in, sees the *following* session. **Ruling: return the session
in progress if there is one (`isInProgress: true`), otherwise the next one.**
Also, "Watch recording" on a future session (R74) becomes "Join stream" when
`isInProgress`, and the button is hidden for a session that has not started.
Whether `youtubeUrl` on a future session is a livestream or a recording is a
content question for domain 13. Flag it there.

### D14 — The student budget tile is domain 4's number, labelled correctly

R69 shows *remaining* budget, under a label that reads as *used*, and inherits
C3's `lateMinutes` correction (values change once v2 writes lateness from
`startsAt`). **Ruling: consume `budgetPct` from `GET /me/attendance`; render
`max(0, 100 − budgetPct)` server-side as a field (`remainingPct`, added to
domain 4's `attendanceBudgetSchema` by Plan 14) under the label "Absence
budget left".** No inversion on the client. Spec 09 R68 should be corrected to
say that the dashboard's label already reads "Absence budget" and that only
the inversion and the variable name are wrong.

### D15 — "Outstanding" has two definitions in the plans already *(needs ruling, contradicts Plan 1 Task 5)*

v1's dashboard says `PENDING | DRAFT` (R66). Plan 1 Task 5's client filter
says `PENDING | DRAFT | RETURNED`. C5 says `RETURNED` is *completed*, so under
Plan 1's filter a `RETURNED` assignment counts as both done (engagement) and
to do (Home).
**Ruling: `isAssignmentOutstanding` = `PENDING | DRAFT`, defined once in
`packages/shared`, applied on the server, and Plan 1's card replaced by the
server's counts.** If spec 08 D11 later gives `RETURNED` a producer meaning
"sent back for rework", that is the moment to move it, in **both** C5 and this
predicate together.

### D16 — The late count moves to the server

R72 re-derives `submittedAt > dueAt` at a fifth site. **Ruling:
`lateSubmittedCount` is computed with the exported `isLate`
(`lib/queries/assignments.ts:33-35`) over the student's targeted assignments
only.** Targeting is a small divergence: a submission on an assignment the
student was never given (possible only through v1's ungated actions) no
longer counts.

### D17 — Mentor at-risk: one list, renamed, sourced from Reports

R45–R49. **Ruling:**

1. The list is `GET /reports/engagement`'s `atRisk` / `atRiskTotal`, the same
   predicate and the same cache as the mentor's Reports tab.
2. The card title is "At risk", not "Flagged for follow-up" (R48). That
   phrase belongs to notes (spec 09 D11).
3. The empty state names the actual rule: either attendance or submissions
   below 60 %.
4. The cohort changes from "has an `activeSeasonId`" to "ACTIVE enrolment in a
   non-deleted season". It excludes withdrawn students and soft-deleted
   seasons and includes multi-season students once per enrolment. Spec 17 D16
   already exposes `cohortSize` for that.

The 4N fan-out (R46) disappears.

### D18 — Mentor activity feed: keep it, but make it a feed

R51–R56. **Ruling:**

- One list, merged and ordered by `at` desc, at most 8 items.
- Reviews ordered and labelled by `reviewedAt`.
- `DRAFT` never appears (spec 08 D8).
- Soft-deleted students, assignments and seasons are excluded.
- Rows link to `/student/[id]` and `/submission/[publicId]`. In v2 there is no
  role prefix to forbid them, which fixes R55.

Whether alumni activity belongs in a mentor's feed is a product question. The
recommendation is to exclude graduated students, matching the at-risk cohort.

### D19 — Events card: alumni, mentors, window, empty state, SUPER tile

- R6 (alumni never see `ALUMNI_ONLY`) is fixed by Plan 10's
  `eventVisibilityFilter` (`isAlumnus(user) || role !== "STUDENT"`).
- R7: Plan 10's `viewerSeasonIds` still gives a **MENTOR no `SEASON` events**.
  **Recommend Plan 10 treat MENTOR like SUPER for the `SEASON` branch**, which
  is consistent with `canReadAllStudents`. Otherwise the mentor's card is
  silently thinner than every other staff card.
- R8/R9: the window and the cap move server-side (`?upcoming=true&limit=4`, §7).
- R10: an empty state replaces "render nothing".
- R15: **the SUPER tile reads `total` from the same response**, so the tile and
  the card cannot disagree. This is a small divergence: v1 counted every future
  event with no upper bound, while Plan 10's default window ends at
  now + 365 days. State the window in the tile's caption.

### D20 — SUPER tile labels

R13's "Students" counts student *accounts* that have not graduated. **Ruling:
label it "Students (not graduated)"**, consistent with spec 17 D4's rename.
"Seasons" keeps v1's meaning (all non-deleted, any status), using
`seasons.length` from the organisation report. Do not switch it to
`activeSeasonCount`, which would silently move a headline number.

### D21 — Alumni gate and greeting

R58's redirect-to-login becomes irrelevant: the branch is chosen client-side
and `/me/dashboard` answers an alumnus with 403. **Ruling: one `firstName`
formatter (trim, split on whitespace, fall back to "there" on empty as well as
null)**, used by both the STUDENT and ALUMNI greetings, which disagree in v1
(`student:88` vs `alumni:21`).

### D22 — The student's season comes from one place

R62 mixes the token's `activeSeasonId` with the database's `activeSeason`.
**Ruling: the server resolves both from the token's `activeSeasonId`, the same
value `/me` exposes.** Ruling C7's TTL bounds the staleness (refresh
re-derives claims).

### D23 — Time and formatting

R75. **Ruling:** every "past/next/in progress/overdue/late" comparison is
server-side (C2). Absolute labels use the shared org-timezone formatter
(rulings X13). Relative labels ("in 3 days", "2 hours ago") are computed on the
device from instants. That is not a wall-clock derivation, and it is the one
thing the device clock is good for.

### D24 — Invalidation replaces revalidation

R44. v1 refreshed one dashboard from one action. **Ruling: the mutation list
in §7 invalidates `queryKeys.dashboard.all`.** Each plan that owns one of
those mutations already exists and runs earlier in the order, so Plan 18 adds
the invalidation calls to their hooks in one task, and lists each file.

### D25 — Found while reading the plans, outside this domain's scope

1. Plan 8 Task 4 mounts `studentEngagementRouter` and `seasonEngagementRouter`
   with a router-wide `use(requireAuth)` on the shared `/api/v1/students` and
   `/api/v1/seasons` prefixes. That violates rulings X5: unknown paths under
   those prefixes would answer 401 instead of `not_found` 404. This domain
   consumes those routers, so flag it to whoever applies the plan-fix pass to
   Plan 8.
2. Plan 8's `EngagementRow` carries `atRisk`, while Plan 11's report row drops
   it in favour of `band`. Both evaluate `isAtRisk`, so they cannot disagree,
   and the dashboard reads `atRisk` from Plan 8's row. No action is needed
   beyond noting it.
3. `dashboard.tsx` is edited by Plan 1 Task 5 and Plan 9 Task 8, and was
   deliberately left alone by Plan 10 to avoid a third editor. Plan 18
   restructures the file, so its first task must preserve `NotificationBell`
   and retire `AssignmentsSummary` explicitly (D15). Plan 18 must not drop
   either one silently.

### Deferred to cutover (C1)

None of this domain's fixes needs a column. Two inherited items show up on
these screens and should be named in Plan 18's report:

- The C3 `lateMinutes` backfill and threshold. These move the student's budget
  tile.
- The materialised engagement score (spec 09 D10). Needed only if the cohort
  call proves slow at real cohort sizes.
