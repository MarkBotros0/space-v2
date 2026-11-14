# Community model, Build 1 (owner rulings, 2026-11-06)

> Owner ruling, moved verbatim from the root `CLAUDE.md` (2026-11-10). Backend paths are under
> `apps/backend/src/`, mobile paths under `apps/mobile/src/`, unless written in full.

Design: `docs/superpowers/specs/2026-11-06-community-model-design.md`. Three TestFlight builds; Build 1
and Build 2 (see `docs/rules/roles.md`) and Build 3 (see `docs/rules/community-wide-seasons.md`) are written.

- **One active role.** Every user has zero or one active role: a student in one ACTIVE season, or
  serving (admin and/or leader of one group) in one ACTIVE season; Super and Mentor are permanent
  roles and hold no season role. A DRAFT season's roles don't count until it starts. Build 1 only
  *checked* it; Build 2 enforces it on every seat write (see `docs/rules/roles.md`). The check lives in
  `pnpm preflight:community` (read-only by default; prints the host and every violation: a leader
  with two groups or in two seasons, an admin of two ACTIVE seasons, admin in one season and leader
  in another (the same season is allowed), a student in two ACTIVE seasons, a Super or Mentor with
  season rows, staff who also hold an ACTIVE enrolment; `--apply` refuses while any exist, or once
  any enrolment has a `result` so it can't run twice, else backfills results in one transaction; on
  a database not migrated yet it prints the violations and says what is unknown).
  Build 2 added review lists (information only, never blocking `--apply`): stored ADMIN/LEADER
  without a `graduationYear`; live seat holders who aren't alumni; seat rows in DRAFT seasons
  (reported apart, not violations); stored STUDENTs holding live seats, split by `graduationYear`;
  alumni holding an ACTIVE enrolment in an ACTIVE regular season (a community-wide season's alumni are
  not listed).
  Run it against any database a release will reach before it; the backfill is not part of a
  migration because the old Neon database is kept and v1 writes it.
- **Season lifecycle.** DRAFT -> ACTIVE -> COMPLETED (-> ARCHIVED). **End season** (`POST
  /seasons/:id/end`; that season's admin, or Super) is refused with `season_unfinished` while any
  blocker stands: a SUBMITTED submission or quiz attempt not graded, a finished session with an
  ACTIVE student unmarked (only students enrolled by the time it started). `GET /seasons/:id/end-check` lists them with the students; the app shows
  blockers, else the review list where each student is **pre-selected Passed when their weighted
  score reaches the pass mark** (`docs/rules/season-passing.md`; the admin decides, the score only
  pre-selects). The POST carries `notPassed` (optional staff-only reason), `passedNotes`, the criteria
  and `reviewed`, which now also holds each score shown: the server recomputes and refuses
  (`season_unfinished`) when one differs. One transaction completes every ACTIVE
  enrolment with its `result`, WITHDRAWN ones are untouched, and the season's people's sessions go
  stale. A super or anyone with a SeasonAdmin row for the season reads and corrects results (`/seasons/:id/results`; owner 2026-11-12 "everything can be overridden by an admin or a super"); a current mentor never does. `GET /seasons/overdue`
  feeds the Today callout for ACTIVE seasons past their end date. **Finished seasons are locked and
  never reopen**; their students still read their own work, read-only (responses carry `readOnly`).
  A status change on an existing season is only DRAFT -> ACTIVE or COMPLETED <-> ARCHIVED; nothing
  enrols into a finished season (`season_finished`). A draft's roster is not live: `readOnly`, no
  submitting and no notifications until it starts, and being taken off one isn't History. Former staff
  aren't listed the season (a leader's `GET /seasons`) or notified about its students.
- **Who a roster lists.** After End every enrolment is COMPLETED, so a staff roster, count, report or
  export filtering on `status: "ACTIVE"` blanks out every finished season. Use `seasonParticipant`
  (`lib/queries/season-participants.ts`): ACTIVE in a live season, ACTIVE and COMPLETED in a finished
  one, never WITHDRAWN. "Is this student live?" (`hasActiveEnrollment`, the token, check-in), who to
  notify and who holds End open stay on ACTIVE in an ACTIVE season, and must not match COMPLETED.
  What the group form and roster grid list, and all they may write, is `seasonRosterMember` (those
  participants who are live STUDENT users): a former student who now serves or a deleted account
  keeps their group. On `PATCH /groups/:id` an absent `leaderIds` or `studentIds` leaves it alone.
- **A rate limit never signs anyone out.** Only 400, 401 or 403 from refresh ends a session. When
  `/me` answers 429, or 401 with a refresh that couldn't answer, boot keeps the tokens and shows
  `BootRetry` (status `retry`) instead of sign-in, with Try again and a Sign out that works with no
  network (it clears the tokens on the phone; the refresh token isn't revoked server-side). Other indeterminate failures (offline, 5xx) still
  land on sign-in with the tokens kept.
- **A lost refresh reply never signs anyone out** (2026-11-14, "signed out without doing
  anything"). A refresh keeps the token it was given good, for at most 7 days, until the new one
  is itself used; a retry with the old token gets a fresh pair and the unused one is deleted.
  Sign-out and every revocation end both. The phone's refresh call times out after 15 s, as an
  unknown answer.
- **`activeSeasonId` is a derived claim.** `lib/auth/scopes.ts` computes it on every token from the
  newest ACTIVE enrolment in an ACTIVE, non-deleted season; `seasonAdminIds` / `groupLeaderIds`
  likewise cover DRAFT or ACTIVE seasons only. The claim keeps its name, so the mobile app and
  tests are unchanged. The old `StudentProfile.activeSeasonId` column is
  gone (refactor Wave 6, DB-001). Ending a season marks its people's sessions stale
  (`sessionsValidFrom`), so the change lands on their next refresh, not at the next login.
- **Former staff are cut off.** Once a season ends, its admins and leaders lose it with their
  scopes: no access to it and no History entry; only Super (and Mentors) read finished
  seasons, and Mentors never open Results.
  Their role is derived from season rows (Build 2), so it ends with the season.
  One exception (owner, 2026-11-07): Reports' History. An ADMIN's report scope
  (`reportScopeFor`) is every season they hold or held a SeasonAdmin row in, so a serving admin
  can read the engagement report of a season they ran before; its at-risk rows don't open
  student pages they can no longer read. Reports open on the current season, else the last one
  (`defaultReportSeason`).
  Second exception (owner, 2026-11-12): a finished season's Results (`canCorrectSeasonResults`) stay
  open to its former admins and to a super, never to a mentor; they reach it from Reports.
- **Students between seasons** (no `activeSeasonId`) get Today, Calendar, History and More, with
  Today telling finished, dropped and first-time apart; the finished season has a read-only page
  with its assignments, quizzes and attendance. Alumni keep their own nav.
