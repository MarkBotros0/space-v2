# Roles (Build 2, owner rulings 2026-11-07)

> Owner ruling, moved verbatim from the root `CLAUDE.md` (2026-11-10). Backend paths are under
> `apps/backend/src/`, mobile paths under `apps/mobile/src/`, unless written in full.

- **The role claim is derived.** `loadScopes` (`lib/auth/scopes.ts`) computes `role` on every token
  from live season rows: a SeasonAdmin row means ADMIN, a GroupLeader row means LEADER, in a DRAFT
  or ACTIVE, non-deleted season (someone serving or enrolled in an ACTIVE season gets nothing from
  a DRAFT one until it starts). Stored `User.role` means **SUPER, MENTOR or STUDENT only**; SUPER
  and MENTOR are permanent and ignore season rows. Never gate on the stored role for staff.
- **`lib/roles` guards every seat write**: `activeRolesFor` reads a person's one active role,
  `lockPeople` / `lockSeason` take the row locks, and the refusal helpers (`seatRefusal`,
  `seatStudents`, `newPersonRefusal`, ...) answer 409 with the reason in words. Lock order is **Season, then
  People, then rows**, always; a new seat-writing path takes them in that order inside its
  transaction. That covers every enrolment-status write: a drop refuses a finished season
  (`season_finished`) and a draft (`season_draft`; Remove is the way off a draft), and updates only
  `where status ACTIVE`. End locks People before it writes a row and graduates only those whose row
  it completed. `deleteSeason` checks and deletes under the Season lock, and marks its staff stale.
  Staff must be alumni (`graduationYear` set), with no override; a student in a regular season must
  not be.
- **Your own record is the private view.** `GET /students/<own id>` answers private for everyone but
  SUPER, a serving alumnus included, so the staff note and drop reasons stay out; `useStudentDetail`
  parses it with the private schema.
- **Season role changes sign nobody out.** Assigning or removing a season role calls
  `markSessionsStale`, so the new claim arrives on the next silent refresh;
  `revokeAllRefreshTokensForUser` is not used on these paths. Changing a stored role
  (SUPER/MENTOR/STUDENT) or deactivating an account still signs them out.
- **`pnpm roles:convert`** (`scripts/convert-stored-roles.ts`) moves stored ADMIN/LEADER accounts
  to STUDENT. Read-only by default; `--apply` refuses while a live account lacks a `graduationYear`
  (a deactivated one is left alone and printed apart), else converts in one transaction. It is a script, not a migration, because no migration may change
  `User.role` values. Run it on a database the owner names, after `preflight:community`.
- **Graduation.** Super marks a season Graduating (`Season.graduatesOnPass`). Passing it graduates
  the student automatically at End (see `docs/rules/graduating-seasons.md`), in the class of the season's
  own `year` whenever it ends; the app shows it as "JPCS-YY" (`classLabel`, owner 2026-11-10), and graduating someone who
  passed by hand with any other year is refused (`wrong_class`). Super may graduate an
  exception without a pass via `POST /students/:id/graduate` with `override: true`, which needs
  a reason and a tick (stored on the user, shown to SUPER only); it is audited without the reason. `PATCH /users` can't set or clear a stored STUDENT's year (409
  `use_graduate`); changing one year to another corrects a typo, audited and marked stale. Graduating deletes a place on a draft's roster, under Remove's rule
  (with work recorded on it, the row completes instead), and completes the rest of their regular-season places. **A community-wide season is never touched** (owner 2026-11-07): the graduate stays in it, draft or live, as an alumnus, keeps their group and gets a result at End.
