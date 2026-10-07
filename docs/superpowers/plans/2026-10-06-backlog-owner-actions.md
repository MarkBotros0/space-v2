# Backlog — things only the owner can do (do these at the end)

Written 2026-10-06 after Plans 1–9. Everything here was **not done** by the
implementation threads because it needs the staging database, a real device,
real credentials or an operational decision. Nothing below blocks merging a
plan PR; all of it blocks cutover from v1 (see Plan 18).

## 1. Run the integration suite against staging

Every plan so far was integration-tested on a throwaway local Postgres 16
loaded with v1's migration SQL, not on staging.

```
pnpm --filter @space/backend test:integration
```

Fixtures carry the `space-v2-test-` prefix and clean up after themselves, but
staging contains real students, so check the run's tail for leftover rows.
Expect all suites green (22 suites, 381 tests as of Plan 9). A failure that
only shows on staging usually means data shaped differently from the local
fixture (real students, soft-deleted users, more than 200 rows).

## 2. Manual device checklists (Expo Go or a dev build, staging accounts)

Each plan ends with a checklist that needs a phone and real accounts. None has
been run.

- Plan 6, season admin screens: Task "Step 6: Device checklist" in
  `2026-10-05-plan-06-season-admin-screens.md`.
- Plan 7, students: Task 8 Step 4 in `2026-10-05-plan-07-students-enrollment.md`.
- Plan 8, quizzes: Task 12 Step 4 in `2026-10-05-plan-08-quizzes.md`. Includes
  watching the network to confirm no student response contains `correctIndex`.
- Plan 9, invites, users, settings: Task 10 has no device checklist, so run
  this one by hand: (a) as SUPER open Users, invite a test user and accept the
  invite from the login screen's "I have an invite code" button; (b) change a
  role and confirm the demoted user is signed out within 15 minutes; (c) in
  Settings change a password and confirm the other session is evicted;
  (d) try to demote or deactivate the only active SUPER and confirm it is
  refused.

- Plan 10, students and accounts follow-up: Task 11's device checklist in
  `2026-10-05-plan-10-students-accounts-followup.md`. Also open a real
  `spacev2://reset-password?token=...` link on a phone: the deep link was only
  tested in Jest.

The testing thread's PR #8 (Maestro flows, seed script, web build) may replace
some of this; it had never been run when this was written.

## 3. Configuration to set on the deployed backend

- `AUTH_SECRET`: must equal v1's value so tokens stay compatible.
- `TRUST_PROXY`: the real number of proxy hops, or the auth rate limiters
  bucket every client together.
- `MOBILE_APP_ORIGIN`: defaults to `*`; tighten it.
- `GMAIL_USER` and `GMAIL_APP_PASSWORD`: without them invite emails are
  silently not sent (invites are still created). Send one real invite email
  and confirm delivery; no thread could test real mail.
- `INVITE_TOKEN_TTL_HOURS`: defaults to 168 (7 days). Confirm that suits you.
- `MOBILE_APP_SCHEME`: used to build the link in password-reset emails
  (the app's scheme is `spacev2`). Send yourself a real reset email and open
  the link on a phone.
- `ENABLE_UPLOADS` stays `false` until the CMS/storage driver exists.

## 4. Cutover operations from Plan 9 (spec 11)

These are operations on the live database, not code:

1. Null the `passwordHash` of every account still on v1's shared default
   password (`ChangeMe123!`), then invite those accounts. Until this is done
   anyone who knows the default can sign in as them.
2. Sweep used and expired `InviteToken` and `PasswordResetToken` rows.
3. Add the missing `PasswordResetToken.expiresAt` index. This is a migration,
   so it has to be made in v1's migration history, not here (no migrations are
   created in this repo).
4. Audit columns for role grants (who granted SUPER, when). Also a migration.
5. A per-invite attempts column, which would allow a short numeric invite code
   (spec 11 D10). Also a migration. Not needed unless you want short codes.

## 5. Known gaps to be aware of

- A student created through `POST /students` has no login path until Plan 10
  makes that endpoint issue an invite. Until then invite them from the Users
  screen.
- The "last active SUPER" guard uses a row lock that no automated test can
  exercise (it needs two simultaneous requests on a database with exactly two
  SUPERs). It rests on the design argument in Plan 9, Decision 16. Worth one
  manual concurrency check if you are nervous about it.
- Access tokens stay valid for up to 15 minutes after a demotion or
  deactivation (only refresh tokens are revoked). The plan accepts this.

## 6. Housekeeping

- Install the Claude GitHub App on `MarkBotros0/space-v2` if you want PR
  events (CI, reviews) to reach Claude automatically.
- Plan 18's register lists every deliberate deferral; read it before cutover.

## 7. Plans 11 and 12 (built, awaiting merge)

- Device checks (Expo Go or dev build): student check-in by QR scan and by
  the `/checkin/<token>` deep link (camera permission prompt, denied state),
  the History, Attendance and Profile screens, the Season screen's student
  branch, the authored-notes screen and the engagement card on student detail.
- Plan 11 adds `expo-camera ~17.0.10` (package.json, app.json plugin,
  lockfile). `npx expo install --check` could not run here (Expo API blocked
  by the proxy); run it once on a machine with access.
- If the testing PR (#8) merges first, regenerate `pnpm-lock.yaml` with pnpm
  rather than hand-merging it.
- Note deletion answers `501 delete_unavailable` by design (Plan 12); decide
  later whether v1's delete behaviour is wanted.

## 8. Plan 13 (notifications and push)

- Run `eas init` once under your Expo account so `expo.extra.eas.projectId`
  is written to `app.json`. Until then the settings row says push "isn't set
  up for this build yet".
- Device checklist (Plan 13, Task 11 Step 3): bell and badge count, inbox
  paging, badge unchanged by merely opening the inbox, tap-through to an
  assignment, "Mark all read", six preference toggles surviving a restart
  (`quizGraded` included), and the push permission prompt.
- Push delivery itself is blocked on cutover: apply the migration in
  `docs/superpowers/cutover/2026-08-24-notifications-push.md` once v1 is
  retired. Until then `POST /me/devices` answers 503 `push_unavailable`.
- Behaviour change to accept: opted-out users now get the in-app row (only
  email and push respect the preference). v1's own inbox will show those rows
  too while both apps share the database.
- `expo-notifications ~0.32.17` was added without `expo install --check`
  (Expo API blocked here); run it once on an unrestricted machine.
- Roadmap drift: Plan 13's done criterion ("a push on the student's device")
  cannot be met before cutover; the inbox and badge half is proven, the push
  half moves to Plan 18 M10.

## 9. Plans 14, 15 and 16 (video/forum/events, reports/exports, dashboards)

- **Dev-client build needed for video quizzes:** `react-native-webview`
  does not run in Expo Go. Device checks: player stops at each question and
  cannot be dismissed, resume after killing the app, admin adds a question at
  `2:30` and sees the re-grade line, forum post-to-unlock, events on the
  calendar for every role.
- **Reports/exports device checks:** mentor `/reports` and engagement export,
  admin season workbook, admin 403 on another admin's season, leader and
  student see no tab, the 11th export in 15 minutes shows "Too many exports",
  airplane mode mid-download leaves no partial file, band donut colours.
  `expo-file-system` and `expo-sharing` were added without
  `expo install --check`.
- **Dashboards device checks:** student with and without an active season,
  alumnus, admin, leader, mentor, super, the bell, pull-to-refresh, airplane
  mode, and the timezone check (ruling X13).
- Dependencies added across these plans: `react-native-webview`,
  `react-native-youtube-iframe`, `expo-file-system`, `expo-sharing`
  (mobile) and `exceljs` (backend). Run `npx expo install --check` once on an
  unrestricted machine.
- Cutover deferrals (forum `hiddenAt`, video duration, export audit table,
  report defect fixes that need a column) are recorded in the Plan 18 file.
- One mobile test (`video-quiz-screen`, "renders the player and the score")
  timed out once under heavy parallel load and passes alone; watch for it if
  CI is ever added.

## 10. Still to build

Plans 17 and 18 (imports, cutover).
