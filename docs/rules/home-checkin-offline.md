# Home, check-in and offline (owner, 2026-11-08)

> Owner ruling, moved verbatim from the root `CLAUDE.md` (2026-11-10). Backend paths are under
> `apps/backend/src/`, mobile paths under `apps/mobile/src/`, unless written in full.

- **Home order, every role with a season:** the season ring (`SeasonPulse`) first, always; then
  `AnnouncementsHomeCard` (one compact row); then the session (live or next), callouts, work, people,
  events. Roles without a ring (mentor, alumni, between seasons) lead with the announcements row.
  Super is the exception: its Community tiles come first, then the overdue End prompt, then one
  Seasons list (a row per running season with a small ring, owner 2026-11-09), then announcements.
  The admin's overdue End prompt sits right under the ring (2026-11-09).
  Student Home has no late-submissions note.
- **Home tiles and rows** (owner, 2026-11-09): `CountGrid` shows only counts above zero, and all
  zero is one "All caught up" row; tones are `info` for ordinary work waiting, `warn` for late or
  due, `bad` for people at risk. Where the students at risk are named in a list, they get no tile
  (`NeedsActionList atRiskTile={false}` on Home). The ring card says what is left ("3 to go", "5 of 8
  sessions held"), and a student's figure is "Absences left" (full absences the budget still
  allows, rounded down). Upcoming events are grouped rows with a chevron. The leader's ring is the
  season's (the header names the group); the alumni Home never lists the "Your last season"
  season again under Your history; a mentor's note rows name the author only when it is someone else.
- **One session card on every Home** (owner, 2026-11-09): `SessionHomeCard` (`screens/home/session-card.tsx`)
  for the student, leader and admin. The eyebrow carries the day cue, the title opens the session (no
  "Open session" button), and buttons show only for what can be done now (check in, Mark attendance,
  Join stream). It is the brand hero only while the session runs or carries an action; otherwise a
  plain card, so it never outweighs the season ring. The light `hero` token is a soft navy tint.
- **Check-in for students opens an hour before the session** (`isCheckInOpenForStudent`,
  `lib/check-in.ts`). An admin may open it earlier; until the hour, a student reads `checkInOpen`
  false and a scan answers 409 `not_open`. Staff see the real state.
- **Offline:** `OfflineScreen` (`design/layout/offline-screen.tsx`, mounted in `app/_layout.tsx`) covers
  the app after 1.5 s without a connection and leaves by itself on reconnect.
- **Assignments always go to the whole season:** the form has no "Assign to" (`docs/rules/assignments.md`).
- **Pull to refresh:** `design/lib/pull-refresh.ts` drops a pull on blur and remounts the
  RefreshControl on focus, because iOS leaves the spinner hanging if `refreshing` turns false while the
  screen is off the window. No input auto-focuses on open.
