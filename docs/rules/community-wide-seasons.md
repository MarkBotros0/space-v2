# Community-wide seasons (Build 3, owner rulings 2026-11-07)

> Owner ruling, moved verbatim from the root `CLAUDE.md` (2026-11-10). Backend paths are under
> `apps/backend/src/`, mobile paths under `apps/mobile/src/`, unless written in full.

- **The flag.** `Season.isCommunityWide`: set on create, then changed only by Super and only while the
  season is a DRAFT (`season_started` after). It is refused together with `graduatesOnPass` or a
  `requiredProgram` (409 `community_wide_rules`): such a season graduates nobody, requires no program and
  keeps pass results. The season form hides both options once it is on.
- **It runs alone.** Start refuses (`start_blocked`) a community-wide draft while any other season is
  ACTIVE, and a regular draft while a community-wide one is. `GET /seasons/:id/start-check` lists them as
  `seasonsInTheWay` (id, code, title, message) and `ready` is false while any stands. `startSeason` takes
  `lockSeasonStart` (an advisory transaction lock on one fixed key) before anything else, so every start is
  serialised; lock order is global start lock (Start only), Season, People, rows. One person both serving
  and a student in one draft is a single `already_in_role` item in the student seat.
- **The picker.** `GET /seasons/:id/people-candidates` rows carry a `pool` (`student` | `alumni`); a
  community-wide season lists alumni, never Super or Mentor, and a regular one lists none. The mobile
  picker shows a Students and an Alumni tab, and **Select all available ticks both tabs** at once and
  shows the count (`Select all available (186)`); unticking is by hand. With no required program nobody
  is blocked, so an alumnus who did not pass an earlier community-wide season is simply `available`.
- **`isStudyingAlumnus` against `isAlumnus`** (`packages/shared/src/navigation.ts`, mirrored over a token in
  `lib/rbac.ts`). `isAlumnus` (role STUDENT and `graduationYear` set) is the permanent fact: the Alumni
  list, alumni-only events, the class "School of N" and the 403s on student pages. `isStudyingAlumnus`
  (an alumnus whose token has `activeSeasonId`, i.e. an ACTIVE enrolment in an ACTIVE season, only a
  community-wide one can seat them) decides the **experience**: `navFor`, Today's branch, the student
  dashboard, quizzes, submissions, check-in and profile edits behave as a student's. Gates read
  `isAlumnus(u) && !isStudyingAlumnus(u)` to refuse.
- **Where a studying alumnus is listed.** They stay under the Alumni list (`status=alumni`) and off the
  global active Students list, which filters on `graduationYear: null`. A list of one season's people
  (`seasonId`, a `groupId` of it, or a staff member's own roster) also holds them when that season is
  community-wide, via `graduationFilter` in `lib/queries/students/list.ts`; so do the season roster,
  attendance, trackers, reports and End's review. A regular season's graduates never appear. A dropped alumnus stays on their season's own list, as any
  dropped student does (`seasonId` matches any status).
- **Ending.** End-check students carry `graduationYear` (the review shows "School of N"), the confirm says
  how many people it ends the season for, and End graduates nobody and keeps every class. Alumni return to
  the alumni portal on their next refresh (`activeSeasonId` null), and their old attempts are refused.
- **Preflight.** `pnpm preflight:community` reports `communityWideNotAlone` (one row per ACTIVE
  community-wide season with another ACTIVE season alongside, `otherActiveSeasons`): a violation that blocks
  `--apply`, and "unknown" on a database without the `isCommunityWide` column. Alumni in a community-wide
  season are not listed as a review item; listed alumni are labelled as seeing the student app.
