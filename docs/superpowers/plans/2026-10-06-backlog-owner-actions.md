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

## 10. Plans 17 and 18 (imports, cutover prep)

- **Imports:** device-check the student import (SUPER, Users screen) and the
  group import (season admin, Roster screen): paste, preview, commit, re-paste
  creates zero duplicates. Paste-only by design; file intake waits for the CMS.
- **Cutover register needs your signature.** The parity audit
  (`docs/superpowers/audits/2026-cutover/`) ledgered all 1550 spec rules.
  `DROPPED.md` holds the seeded entries plus 48 PROPOSED, unsigned entries
  (REG-70 to REG-117) covering 87 rules v2 drops or changes with no recorded
  decision. Read, accept or reject each; nothing in Plan 18 Part 2 (the
  migrations) may start until you sign. Rows for the four defects fixed after
  the audit (08-R45, 08-R20, 11-R60, 16-R83) can be withdrawn once re-checked.
- **The audit could not read the v1 repo** (not in the build environment).
  Run Plan 18 Task 1.6 (page parity, 104 v1 pages) and the migrations `diff -r`
  on a machine that has `jpc-space`.
- **Open product decisions found by the audit:** PATCH `/users/:id` editing a
  soft-deleted user (11-R52); scope rows left behind on deactivation
  (11-R53/R56); export of an unknown season id returns a header-only workbook
  (17-R46); MENTOR refused the dropped-students list (06-R45); withdrawn
  students opening a session (04-R74); alumni not blocked client-side from
  student destinations (19-R3); lost per-student history/percentage/submission
  lists (06-R73/R74/R77).
- **READ_ONLY mode** (`READ_ONLY=true`) is merged but off by default. Deploy
  `main` with it unset, then record the deployed SHA as `PRE_CUTOVER_SHA` in the
  audit README (Plan 18 Task 2.0b Step 6).
- **Not started, and yours to run:** Plan 18 Part 2 (migration authoring, after
  you sign) and Part 3 (the production runbook R1-R21).

## 11. Audit-fixes branch (`claude/audit-fixes`): follow-ups and decisions

Owner-approved fixes from the cutover register are on `claude/audit-fixes`
(backend REG-77, 82-85, 89-91, 97, 104, 111; mobile REG-70, 72-76, 78-85, 87,
89, 92, 117). Nothing in this section blocks merging that branch.

### v1-parity work (was: Fix after cutover)

Under the 2026-10-09 v1-parity ruling these are no longer "fix after cutover";
they are v1-parity changes written into the plans *(v1 parity 2026-10-09: was
"Ruled: fix after cutover")*.

- **REG-71** - the seasons list is ordered newest year first then title, not by
  status then start date (v1 `src/app/super/seasons/page.tsx:20`). No authority
  was found for the v2 ordering. Now Plan 18 Task 2b.P Step 1 (02-seasons R24:
  `apps/backend/src/routes/seasons.ts:80` → status asc, startDate desc).
- **REG-116** - Reports screen: one season picker is the only filter, empty
  states replace redirects for admins with no seasons, completion rows no
  longer count towards emptiness, and an at-risk row opens the single flat
  student route. Now Plan 15 Task 8's v1-parity revision (17-reports R6, R37,
  R103, R104; R35 and R105 stay as they are).

### Open owner decisions

1. **Attendance remarks shown to students.** `GET /sessions/:id` and
   `GET /me/attendance` return the attendance `notes` (remark) to the student
   it is about. The REG-97 privacy rule covers the profile notes and pastoral
   notes only, so these were left as they are. Decide whether a student should
   see staff remarks on their own attendance.
2. **Submission text and feedback sanitisation.** Submission text/feedback is
   sanitised on the read side only; the stored value is the raw input. Decide
   whether it should also be sanitised on write.

### Owner decisions recorded 2026-10-10

Applied to the plans in place, marked *(v1 parity 2026-10-09; owner decision 2026-10-10)*.

1. **Push notifications: withdrawn; the owner will add them later with Firebase.**
   Plan 13 Tasks 5 and 10 and Plan 18 M10, Task 2b.10 and M5's `pushEnabled`
   are withdrawn. The Expo push code already built (`POST /me/devices`,
   `lib/push.ts`, `expo-notifications`, …) is removed with the parity code
   changes (Plan 13 Revision 2026-10-09, row 7). The push items in section 8
   (`eas init`, the push prompt, the cutover migration) no longer apply.
2. **Uploads: a spreadsheet read in memory and never stored still counts as an
   upload.** Spreadsheet file intake (16-R1, R2, R6, R9, R10, REG-48) and
   event photos (15-R22..R29) stay off with `ENABLE_UPLOADS` until the CMS
   move; v1's rules are ported then (Plans 17 and 14).
3. **The notification email's "Open" button points at the app.** v1's "View in
   JPC Space" button and paste-able link stay, built as `AUTH_URL` + the app
   path of the notification's target (Plan 18 Task 2b.4; REG-38).
4. **Import rows whose group name matches several groups in the season keep
   the row-level refusal** (Plan 17 D-16.19.1, Task 5).

### Judgement calls made during the audit fixes (confirm or reverse)

- **ADMIN-scoped attendance and submissions endpoints.**
  `GET /students/:id/attendance` and `/submissions` are staff-only: SUPER and
  MENTOR see every season, an ADMIN only the seasons they administer, a LEADER
  only seasons whose enrolment names one of their groups; a student gets 403,
  themselves included. Drafts are never listed.
- **In-memory sorts.** The students list sort keys (name, university, season,
  group) are applied in memory over the scoped set rather than in SQL.
- **Calendar "today" uses the device date.** It needs a server-supplied today
  (organisation time zone) to be correct for a device with a wrong clock or zone.
- **Calendar events window** is limited to today minus 30 days through plus 365
  days.
- **Group filter fetches groups per season.** The students group filter loads
  the groups of each season separately rather than via one endpoint.
- **REG-72 admin one-season redirect.** The season edit card moved to
  `/seasons/[code]` as a result.

### Register entries accepted as-is (15)

karen accepted all 15 on 2026-10-08 (thread reply, on the recommendation); recorded in `DROPPED.md`. No code change.

| Id | Entry |
|---|---|
| REG-95 | One session detail route serves every role |
| REG-98 | One /students list serves SUPER, ADMIN, MENTOR and a group-scoped LEADER |
| REG-99 | Dropped-students list limited to SUPER and ADMIN (authorisation-bearing) |
| REG-100 | Notes lists page by cursor instead of a fixed 100-row cap |
| REG-101 | Notification preferences require all six keys; quiz-graded can be switched off |
| REG-102 | Users admin list: cursor paging, filters, name ordering, server-side total |
| REG-103 | Year ceilings evaluated per request, not frozen at server start |
| REG-105 | Quiz authoring: shared transaction, renumbering, paper-quiz refusal, reorder endpoint |
| REG-106 | Quiz answers validated against the question |
| REG-107 | Quiz taking autosaves in debounced batches with a visible state |
| REG-108 | Essay grading sends every essay once; reopening needs online and published |
| REG-109 | Grading notifications sent in one batch |
| REG-110 | Quiz lists: one season per request, leader-scoped, cursor paged |
| REG-112 | Video quiz answering checks role and enrolment first; transactional progress |
| REG-113 | Event form validates on the device with the server schema |

## 12. Still to build

Nothing in Plans 1-17. Plan 18 Parts 2 and 3 wait on the signature above.

Plans 1–17 now carry "Revision 2026-10-09 — v1 parity" sections (the owner's
ruling that v2 behaves exactly like v1 unless v1's behaviour is a defect); the
code changes those revisions describe are **not built yet**. Plan 18's own
revision withdraws most migrations, adds Task 2b.P (v1-parity fixes with no
other owning plan) and holds push and the email "Open" button for your
decision. Full classification:
`docs/superpowers/audits/2026-cutover/v1-parity-classification.tsv`.
