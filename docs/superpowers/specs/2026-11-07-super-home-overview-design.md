# Super Home: an overview, not a work queue

Date: 2026-11-07. Status: **approved by the owner 2026-11-07** (with the live session removed too).

## Why

The owner tested as Super and found Home showing a season admin's work queues. Their ruling:

> "the super user should see just an overview of the students and season. his home shouldnt have
> the students at risk for example (this is more of a season admin). also the submissions to
> review and sessions without attendance. super admin should have access to all these when he is
> trying to check a specific season for example, but not on home."

Super is a permanent, community-wide role with no season role. Their Home answers "how is the
community and each season doing?", not "what do I have to do today?". The work lives on the season.

## Today (what changes)

`SuperToday` (`apps/mobile/src/screens/staff-today/super-today.tsx`) renders, in order: the live /
next session hero, Also happening now, the overdue callout, **Needs action** (Submissions to review,
Sessions without attendance, Students at risk, Not invited yet, counted across every active
season), the Organisation figures (Students, Alumni, Seasons, Upcoming events), Upcoming events.

## Super Home, new

Top to bottom, inside `Screen` (title "Hi, {first name}", bell + avatar):

1. **Overdue callout** (`OverdueCallout`, `GET /seasons/overdue`), unchanged: shown only when an
   ACTIVE season is past its end date. It is the one prompt that stays, because ending a season is
   Super's call as much as the admin's.
2. **Seasons**: one `SeasonPulse` card per ACTIVE season, the same card a season admin sees on their
   Home: the ring for how far through it is, "N of M sessions held", Attendance and Students. It
   opens `/seasons/[code]`. A community-wide season says so in its subtitle. Under the cards, a
   **Coming up** `GroupedList` of DRAFT seasons: title, "Starts {date} · N students", Draft chip,
   chevron to the season. No ACTIVE and no DRAFT season: an `EmptyState` "No season running" with a
   New season button (`/seasons/new`).
3. **Community**: `FigureGrid` tiles, each opening the list it counts: Students
   (`totalStudentsNotGraduated` → `/students`), Alumni (→ `/students?show=alumni`), Not invited yet
   (→ `/community?status=pending`) and Upcoming events (→ `/events`). The Seasons tile goes (the
   Seasons section replaces it). *(Not invited yet moves here from Needs action: it is Super's own
   community job, not a season admin's queue. My call.)*
4. **Upcoming events** card, unchanged.

Removed from Super Home: the live / next session hero and Also happening now (owner, 2026-11-07:
"its not super responsibility but he can access it from inside"; a season's Sessions tile reaches
them), and Needs action as a whole: Submissions to review, Sessions without attendance, Students at
risk. Nothing else season-admin shaped is left on it.

Design notes (ui-ux-pro-max pass, over the owned design system): reuse the kit, add no component.
Every card is a whole-card press target (>= 44pt) with press dim, status said in words (Draft,
Community-wide) not colour alone, figures tabular, labels capped at 1.3x where tiles hold them.
Nothing animates in: no count-ups, no stagger (calm motion rules).

## The season page gets the queues

`/seasons/[code]` today has Sessions, Assignments, Quizzes, Add people, End season and the People
card, but **none of the three queues**: Super can only reach them through Assignments → review or
Reports. So, on an **ACTIVE** season, for whoever manages it (Super or its admin), a **Needs
attention** section goes between the next step and the figures/People card: the same `CountGrid`
tiles Admin Home shows (`NeedsActionList`, without the invites tile), scoped to this season:

- Submissions to review → `/submissions?seasonId=`
- Sessions without attendance → `/attention/sessions?seasonId=`
- Students at risk → `/attention/at-risk?seasonId=`

A zero reads "All clear" (as on Admin Home). Not shown on a DRAFT or finished season, nor to a
leader. Counts come from the same queries as the lists they open, as now
(`useSeasonNeeds(seasonId)`, the same keys as Admin Home's `useStaffToday`). `useStaffToday` keeps
its SUPER branch: the unscoped `/attention/sessions` list still reads it. **Season admins' Home is
unchanged.**

`index.tsx` and `season-detail.tsx` are also being edited by the season-people session; the change
here is one new slot (`attention`) on `SeasonDetailView` and one element passed to it, coordinated
with that session before it lands.

## More

Super's More drops **Students** (owner, 2026-11-07: "there's already a community tab"). `/students`
stays a route: Home's Students and Alumni figures open it.

## Backend

Super Home never called `GET /me/dashboard` without a season; the queues came from client reads.
After this, Super Home **stops** issuing the cross-season submission queue count, the cross-season
at-risk engagement read and the pending-review/unmarked tallies. It reads, all existing:
`GET /seasons` (which are ACTIVE / DRAFT; no longer the sessions of every active season), `GET /me/dashboard?seasonId=` per ACTIVE season (for
`SeasonPulse`; already called for the first one today, for the org's day), `GET /reports/organisation`
(community counts, per-season enrolment for Coming up), the pending invites count, `/seasons/overdue`
and events. **No endpoint is added or changed, so `openapi.ts` is untouched.** The SEASON_STAFF
dashboard still computes submissions/quizzes for a Super caller; it is shared with admins and
season-scoped, so it stays.

## Tests and checks

- `SuperToday` tests: no Needs action, no at-risk/review/attendance text; one pulse per ACTIVE
  season; Coming up lists drafts; community tiles route correctly; empty state.
- Season page: Needs attention shows on ACTIVE for Super and the admin, scoped tiles route with
  `seasonId`; absent on DRAFT/finished and for a leader.
- `useStaffToday` and Admin Home tests unchanged and green; the navigation pin updated for Super.
- typecheck, lint, unit tests, then `ui-sweep` on Super Home and a season page (360dp/375dp, font
  1.0/1.3, light/dark).

## Not doing

No new endpoint, no new component, no change to Admin or Leader Home, no change to Reports.
