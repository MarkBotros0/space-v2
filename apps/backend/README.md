# @space/backend

Express 5 + Prisma 7 API for space-v2. Serves the full `/api/v1` surface
ported from `jpc-space` (v1), against the same shared Postgres database.

## Endpoints

All paths below are relative to the server root. Everything except
`/health` is prefixed with `/api/v1`.

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/health` | Liveness + database round-trip. No auth, no `/api/v1` prefix. |
| POST | `/api/v1/auth/login` | |
| POST | `/api/v1/auth/google` | |
| POST | `/api/v1/auth/refresh` | |
| POST | `/api/v1/auth/logout` | |
| GET | `/api/v1/me` | |
| GET | `/api/v1/seasons` | |
| GET | `/api/v1/seasons/:id` | |
| GET | `/api/v1/seasons/:id/groups` | |
| GET | `/api/v1/seasons/:id/sessions` | |
| GET | `/api/v1/seasons/:id/assignments` | Staff: each assignment with `partsCount`, `submissionCount`, `expectedCount`. A student: their standing on each (`partsTotal`, `partsDone`, `returned`, `hasEssay`). |
| POST | `/api/v1/seasons/:id/assignments` | Season admin or SUPER. Title, due day and time, reminder, and `parts` (VIDEO / ESSAY / FORUM, at least one, at most one FORUM). Always for the whole season. |
| GET | `/api/v1/seasons/:id/admins` | SUPER only. Not a port — v1 had no way to create `SeasonAdmin` rows. |
| POST | `/api/v1/seasons/:id/admins` | SUPER only. `{ userId }`; ADMIN-role, active users only; idempotent. |
| DELETE | `/api/v1/seasons/:id/admins/:userId` | SUPER only. Idempotent. Add and remove revoke the user's refresh tokens. |
| GET | `/api/v1/seasons/overdue` | ACTIVE seasons past their end date: all for SUPER, own for ADMIN, else empty. |
| PATCH | `/api/v1/seasons/:id` (`isCommunityWide`) | SUPER only, while a DRAFT. A community-wide season runs alone, has no required program and graduates nobody: with `graduatesOnPass` or a `requiredProgram` it is 409 `community_wide_rules`. Alumni may study in it. |
| GET | `/api/v1/seasons/:id/start-check` | SUPER. `{ ready, items, seasonsInTheWay }`: who stops a draft from starting, and why, and the ACTIVE seasons that must end first (any, for a community-wide draft; a community-wide one, for a regular draft). 409 `not_draft`. |
| POST | `/api/v1/seasons/:id/start` | SUPER. Re-runs the check under locks, then ACTIVE and everyone's sessions stale. 409 `start_blocked`, `not_draft`. |
| GET | `/api/v1/seasons/:id/end-check` | What blocks ending the season, and the students it ends for. |
| POST | `/api/v1/seasons/:id/end` | Season admin or SUPER. `{ notPassed }`; 409 `season_unfinished` while blockers stand, `season_not_active` if already ended. |
| GET | `/api/v1/seasons/:id/results` | SUPER only. Pass results of a finished season. |
| PATCH | `/api/v1/seasons/:id/results/:studentUserId` | SUPER only. Correct one result. |
| GET | `/api/v1/me/season-history` | Past seasons with how each ended. |
| GET | `/api/v1/me/seasons/:seasonId` | A student's own read-only record of a season. |
| GET | `/api/v1/me/open-quiz-attempt` | `{ quizId }`: the quiz whose attempt the student has open (after the lazy close), else null; staff always null. The app's relaunch lock. |
| GET | `/api/v1/groups/:id` | |
| GET | `/api/v1/sessions/:id` | |
| GET | `/api/v1/sessions/:id/attendance` | |
| POST | `/api/v1/sessions/:id/attendance` | |
| POST | `/api/v1/sessions/:id/check-in-open` | |
| POST | `/api/v1/sessions/:id/check-in-close` | |
| POST | `/api/v1/sessions/check-in` | Student self-check-in. |
| GET | `/api/v1/assignments/:id` | The parts; a student's own work on each in `my`. |
| PATCH | `/api/v1/assignments/:id` | A full replace. A change that touches students' work answers 409 with how many; resend with `confirm: true`. |
| DELETE | `/api/v1/assignments/:id` | Soft delete. |
| GET | `/api/v1/assignments/:id/progress` | Staff: every expected student with their work on each part. |
| POST | `/api/v1/assignments/:id/submit` | A student, once every part is done (videos watched); hands in the draft essays. 409 `not_finished`, `already_submitted`. |
| PUT | `/api/v1/assignments/:id/parts/:partId/essay` | Save an essay's draft; never hands it in. |
| GET | `/api/v1/assignments/:id/parts/:partId/video` | A video part's player state, questions and the student's progress. |
| PUT | `/api/v1/assignments/:id/parts/:partId/video/progress` | Watched ranges, merged; clamped to wall-clock time. |
| POST | `/api/v1/assignments/:id/parts/:partId/video/answers` | Answer a timed question. |
| GET, POST | `/api/v1/assignments/:id/parts/:partId/video-questions` | Staff: a video part's timed questions. |
| GET | `/api/v1/assignments/:id/parts/:partId/forum` | The forum part's posts (the student's group). |
| PUT | `/api/v1/assignments/:id/parts/:partId/forum/response` | Post or edit the student's forum post. |
| GET, POST | `/api/v1/assignments/:id/parts/:partId/forum/posts/:publicId/comments` | Comments on a forum post, when the part allows them. |
| DELETE | `/api/v1/forum/comments/:commentId` | |
| GET | `/api/v1/submissions` | The review queue: one item per essay, scoped to the caller's students. |
| GET | `/api/v1/submissions/:publicId` | One essay (an essay work's publicId), with its question, limits and the org due day and time. |
| POST | `/api/v1/submissions/:publicId/hand-in` | A returned essay, handed in again. |
| POST | `/api/v1/submissions/:publicId/review` | `{ action: "reviewed" \| "return", feedback }`; Return needs a note. |
| POST | `/api/v1/submissions/:publicId/files` | **Disabled by default** — `503 uploads_disabled` unless `ENABLE_UPLOADS=true`. |
| DELETE | `/api/v1/submissions/:publicId/files` | `?fileId=` — author only. |
| GET | `/api/v1/submissions/:publicId/files/:fileId` | Streams the file. Not a port of v1 — see below. |
| GET | `/api/v1/announcements` | Announcements feed, newest first, 20 per page. `?cursor=` (`nextCursor` of the last page; a bad one is 400). `{ items, nextCursor }`. |
| GET | `/api/v1/announcements/unread` | `{ count, latest }`: visible, unread, last 30 days, newer than the caller's account. The caller's own posts never count; season posts count only for a season the caller is live in; for SUPER, only community posts count. |
| GET | `/api/v1/announcements/targets` | Where the caller may post: `{ community, communityReach, seasons[] }`. COMMUNITY is SUPER only; seasons are ACTIVE ones the caller administers. |
| GET | `/api/v1/announcements/:id` | A post with `canEdit`, `canDelete`, `seasonFinished`. 404 for one the caller can't read. |
| POST | `/api/v1/announcements/:id/read` | Mark read. Idempotent, 204. |
| POST | `/api/v1/announcements` | SUPER (community) or a season's admin (that season, ACTIVE only). 201 with the post; 409 `season_draft` / `season_finished`. Plain text; title 1-120, body 1-5000, trimmed first. Notifies the audience. |
| PATCH | `/api/v1/announcements/:id` | `{ title?, body? }`. SUPER, or the author while they still administer its season; nobody edits a finished season's post (409 `season_finished`). Trimmed before the length checks. |
| DELETE | `/api/v1/announcements/:id` | Same rule as edit, but SUPER may also delete a finished season's post. 204. |

Every response is `{ "data": ... }` on success or
`{ "error": { "code", "message" } }` on failure, including 400/401/404/429/500
paths — the envelope is enforced by terminal middleware, not per-route.

## Environment

Read once, in `src/lib/config.ts`, and nowhere else (`process.env` is not
read outside that file). See `.env.example` for the full list.

| Key | Required | Default | Notes |
| --- | --- | --- | --- |
| `DATABASE_URL` | Yes | — | Shared with v1. No default; the process fails to start without it. |
| `AUTH_SECRET` | Yes | — | Must match v1's value — tokens are cross-verified between the two backends. No default. |
| `PORT` | No | `4000` | |
| `NODE_ENV` | No | `development` | |
| `TRUST_PROXY` | No | `0` | Proxy hop count passed to Express's `trust proxy`. `0` fails closed — an unconfigured deploy trusts no `X-Forwarded-For` header, so the auth rate limiters bucket by the proxy's own IP rather than a spoofable header. Set to the real hop count behind a load balancer. |
| `MOBILE_APP_ORIGIN` | No | `"*"` | CORS origin allowed to call the API. |
| `GMAIL_USER` | No | unset | Paired with `GMAIL_APP_PASSWORD`. |
| `GMAIL_APP_PASSWORD` | No | unset | |
| `APP_STORE_URL` | No | unset | The app's App Store page. Once set, every email ends with "Don't have the app yet?" and a button to it. Leave unset until the app is published. |
| `PLAY_STORE_URL` | No | unset | The app's Google Play page, shown beside the App Store button the same way. |
| `STORAGE_DRIVER` | No | `local` | `"local"` writes to `LOCAL_UPLOADS_DIR`; the only driver today. |
| `LOCAL_UPLOADS_DIR` | No | `./uploads` | Only used when `STORAGE_DRIVER=local`. |
| `MAX_UPLOAD_BYTES` | No | `26214400` (25 MB) | Hard ceiling multer enforces before the per-assignment `maxFileSizeMb` check runs. |
| `ENABLE_UPLOADS` | No | **`false`** | Accept file uploads. Off while file handling moves to a CMS — see below. |
| `ENABLE_API_DOCS` | No | `true` | Serves Swagger UI at `/api/docs` and the OpenAPI document at `/api/docs.json`. Set `false` to withhold them. |
| `IMPORT_BODY_LIMIT` | No | `2mb` | JSON body limit for the import routes only; every other route keeps the 100 KB default. |
| `IMPORT_PREVIEW_RATE_LIMIT` | No | `30` | Import preview requests per 15 minutes per IP. |
| `IMPORT_COMMIT_RATE_LIMIT` | No | `10` | Import commit requests per 15 minutes per IP. |
| `RATE_LIMIT_STORE` | No | `postgres` (`memory` when `NODE_ENV=test`) | Where every rate limiter keeps its counters. `postgres` shares them across instances through the `RateLimitHit` table (migration `20261105130000_rate_limit_store` must be applied); `memory` is per process, which on serverless means per instance. |
| `SCHEDULER_TICK` | No | `on` | The request-driven scheduler (`src/lib/scheduler/`): any request may start a sweep of due work (assignment reminders, mentor follow-up reminders) after its response, guarded by a database lease. `off` disables it. There are no Vercel crons. |
| `GOOGLE_CLIENT_IDS` | No | unset | Comma-separated Google OAuth client IDs whose ID tokens `POST /api/v1/auth/google` accepts (the Web client and the iOS client). Unset: that endpoint is a 404 and nobody signs in with Google. Google sign-in only signs in an existing account whose address Google has verified; it never creates one. Client IDs are not secrets. |
| `SENTRY_DSN` | No | unset | Turns on Sentry error reporting. Unset means Sentry is never initialised. See "Turning on Sentry" below. |
| `SENTRY_ENVIRONMENT` | No | `NODE_ENV` | Environment tag on each event. |
| `SENTRY_TRACES_SAMPLE_RATE` | No | `0` | Share of requests traced for performance, `0`–`1`. `0` reports errors only. |
| `SENTRY_RELEASE` | No | `VERCEL_GIT_COMMIT_SHA` | Release tag on each event; on Vercel it defaults to the deployed commit. |

**Email carries only invites and password resets.** Notifications are never
emailed (owner, 2026-11-07): they land in the in-app inbox and, unless the
person turned that kind off, as a push. **When `GMAIL_USER`/`GMAIL_APP_PASSWORD`
are unset:** invite and reset emails don't send (each logs a one-time warning);
invites are still issued and recorded.

## Running the tests

- `pnpm test:unit` — no database or `.env` required. `jest.setup.ts` fills
  placeholder `DATABASE_URL`/`AUTH_SECRET` values when no real `.env` is
  present; a real `.env`, when present, always wins.
- `pnpm test:integration` — hits the **shared staging Postgres**, the same
  database v1 uses. Every fixture this suite creates is scoped with a
  `space-v2-test-` prefix (email/code), and each suite's own cleanup only
  deletes rows carrying that prefix. This is uncached in Turbo
  (`test:integration` has `cache: false`), so it always actually executes
  rather than replaying a stale pass.
- Locally `.env` points at a Postgres `space_test` (docker container
  `space-v2-sweepdb`, 127.0.0.1:55440), which is where these run. A hosted
  autosuspending Postgres (Neon was one) measured ~18s on the first query after
  idle (subsequent ~2s). Several integration suites carry an explicit `jest.setTimeout` above
  Jest's 5s default for this reason — see the comment beside each
  `jest.setTimeout` call for the suite's specific budget.

## Community preflight

`pnpm preflight:community` checks the one-active-role rule against the database in `.env` and
prints its host first. Read-only by default (violations, and how many enrolments the backfill would
touch); `--apply` refuses while any violation exists, else marks COMPLETED enrolments without a
result as PASSED and completes stale ACTIVE enrolments of finished seasons, in one transaction. Not
part of a migration, so `migrate deploy` never rewrites data.

It also prints review lists, which are information and never block `--apply`: stored ADMIN or
LEADER accounts without a `graduationYear`; people holding a live seat (SeasonAdmin or GroupLeader
in an ACTIVE season) who aren't alumni; seat rows in DRAFT seasons (reported apart, not
violations); stored STUDENTs holding live seats, split by whether they have a `graduationYear`; and
alumni holding an ACTIVE enrolment in an ACTIVE season.
On a database not migrated yet, anything it can't read is reported as unknown.

## Converting stored roles

`pnpm roles:convert` moves stored ADMIN and LEADER accounts to STUDENT; their role already comes
from season rows. Read-only by default (prints the plan); `--apply` refuses while any live one has
no `graduationYear`, else converts in one transaction, and is safe to re-run. A deactivated account
with no year is left as it is and printed apart. Run it on a database
the owner names. It is a script rather than a migration so no migration changes `User.role`.

## Uploads are switched off

`ENABLE_UPLOADS` defaults to `false`. `POST /api/v1/submissions/:publicId/files`
returns `503 uploads_disabled` until it is set to `true`.

Why: uploads currently land on the local filesystem. multer buffers each file
whole in memory, the bytes cost server disk, and nothing survives a redeploy on
an ephemeral host. File and image handling is moving to a CMS; the switch stays
off until that driver exists, so no one uploads work that later evaporates.

**The guard sits in front of multer, not behind it.** That placement is the
point — multer buffers the entire body to make the per-assignment size check
possible, so a guard placed after it would still pay the full
`MAX_UPLOAD_BYTES` memory cost for a request it was always going to refuse.
In front, the server answers without reading a byte. If you move it, you lose
the protection this flag exists to provide.

Only uploading is gated. Reading and deleting files already recorded still
work, so nothing already attached becomes unreachable.

Re-enabling is one environment variable. `src/__tests__/upload-guard.test.ts`
covers the disabled path; the integration suite forces `ENABLE_UPLOADS=true`
(see `jest.setup.ts`) so the feature keeps its coverage either way.

### When the CMS lands

`getStorage()` returns a `Storage` (`put` / `get` / `delete`); today that is
always `LocalFsStorage`. A CMS is a second driver selected by a new
`STORAGE_DRIVER` value — one new file, no route changes.

## File download deliberately diverges from v1

`GET /api/v1/submissions/:publicId/files/:fileId` is **not** a port of v1's
`GET /api/uploads/[...path]`, and the exact-parity rule that governs the rest
of this service does not apply to it — that route lives outside `/api/v1`, so
no mobile client contract depends on its behaviour.

v1's route takes an arbitrary caller-supplied storage path and gates it on
nothing but "is logged in", so any authenticated user who knows or guesses a
path can read any file in the system — including another student's private
submission. It also infers `Content-Type` from the file extension.

This one instead:

- addresses a file by its **id, scoped to a submission**, and refuses a `fileId`
  belonging to a different submission — a bare id can never reach across;
- gates on **`canViewSubmission`**, the same right as reading the submission
  itself, so a season admin or the student's group leader can open submitted
  work while a peer student cannot;
- sends the **recorded `mimeType`**, never a sniffed one;
- sends `Content-Disposition: attachment` (uploads are arbitrary user content
  and may be HTML or SVG — serving those inline from the API origin would be an
  XSS vector), with an RFC 5987 `filename*` for non-ASCII names;
- returns `404` rather than `500` when the row exists but the stored blob does
  not.

The success path is the one place in this API that does **not** return the
`{ data }` envelope — it streams raw bytes. Every error path still does.

### Filename encoding

`multer`/`busboy` decode multipart filenames as latin1, so a UTF-8 name arrives
mojibake'd. v1 read request bodies with the web `formData()` API, which decodes
UTF-8 correctly. The upload handler recovers the raw bytes and re-decodes them
(`Buffer.from(name, "latin1").toString("utf8")`) to restore parity; pure-ASCII
names round-trip unchanged. Covered by a test that uploads an Arabic filename
and asserts it survives the download's `Content-Disposition`.

## Deployment

There are two entrypoints, sharing one `createApp()`:

| Entrypoint | For | Notes |
|---|---|---|
| `src/server.ts` → `dist/apps/backend/src/server.js` | Container hosts, local dev | Calls `app.listen()`. `pnpm start`. |
| `api/index.js` | Vercel | Exports the app; a serverless runtime never calls `listen()`. |

**`api/index.js` is JavaScript on purpose.** Vercel type-checks `.ts` functions
with its own compiler settings rather than `tsconfig.build.json`, and does so
with `strictNullChecks` **off**. Zod decides field optionality via
`undefined extends T`, which is true for *every* type once `strictNullChecks`
is off — so every field of every schema infers as optional and the build fails
on type errors that do not exist under this project's real settings. Zod
documents strict mode as a requirement. Requiring the already-compiled output
sidesteps it: type checking happened during `turbo build` with the correct
tsconfig, and there is no TypeScript left for Vercel to re-check with the wrong
one. **Do not convert this file to TypeScript.**

### Setting up a new database

A new, empty database (production has none yet) needs two steps from
`apps/backend`, with `DATABASE_URL` pointing at it:

1. `pnpm db:migrate:deploy` builds the whole schema from every migration.
2. `pnpm create:super-admin` creates the first SUPER account. It asks for the
   email, name and password in the terminal (so the password stays out of
   shell history), shows the database host and asks before writing, and
   refuses an email that already exists in any letter case.

Everyone else is then created or invited from the app. Don't use
`pnpm seed:sweep` here: its users share one password written in the repo, and
it refuses non-local databases for that reason.

Then set the deployment's environment (see Environment above). On Vercel that
includes `TRUST_PROXY=1`, or the rate limiters bucket every client together.

### Known limits on serverless

One thing does not survive a serverless runtime and is not fixed by the
entrypoint above:

- **Prisma needs a pooled connection.** Point `DATABASE_URL` at the host's *pooled*
  endpoint (Prisma Postgres' `@pooled` URL), or concurrent cold starts exhaust the connection limit.

Rate limiting used to be a second: `express-rate-limit`'s default in-memory
store gave every instance its own counter. Every limiter is now built by
`makeLimiter` (`src/lib/rate-limit/`), which by default keeps the counters in
the `RateLimitHit` table (`RATE_LIMIT_STORE=postgres`), one atomic upsert per
request, so all instances share one bucket per client. If the database is
unreachable the limiter logs the error and lets the request through
(`passOnStoreError`) rather than failing every login. Expired rows are swept by
the store itself on ~1% of hits; there is no cron.

Local file storage is a third — but uploads are switched off (see above), so it
is moot until the CMS driver lands.

A container host (Railway, Render, Fly, a VM) has none of these problems and
runs `dist/apps/backend/src/server.js` as-is.

## Error reporting (Sentry)

Off by default, in both the backend and the mobile app. Nothing initialises
and nothing is sent until a DSN is configured.

**Backend.** `src/instrument.ts` is the first import of both entrypoints
(`src/server.ts` and `api/index.js`) and calls `initSentry()` in
`src/lib/sentry.ts`, which returns at once without `SENTRY_DSN`. When on:

- The terminal error handler (`src/middleware/error-handler.ts`) reports every
  500. The response is unchanged: `internal_error`, no stack. 4xx responses are
  never reported. The SDK's own automatic Express capture is off, because it
  runs before our handler and would report a thrown `ForbiddenError` as a 500.
- `runInBackground` (`src/lib/background.ts`) reports failed push and mail work.
- Each report registers `Sentry.flush(2000)` with Vercel's `waitUntil`, so an
  event is not lost when the function freezes after responding.
- No user info, cookies or request bodies are collected. `beforeSend` and
  `beforeBreadcrumb` also strip the `Authorization` and `Cookie` headers, drop
  the bodies of auth, password and invite routes, and redact any
  password/token field.

**Mobile.** `EXPO_PUBLIC_SENTRY_DSN` is read in `src/lib/app-config.ts`.
`src/lib/sentry.ts` initialises with `sendDefaultPii: false`, wraps the root
layout only when on, and reports render errors caught by the route
`ErrorBoundary`. The Sentry user is the numeric user id and a `role` tag. They
are set on sign-in and cleared on sign-out. No email or name is ever sent.
Release and dist come from the native build, which is what the source-map
upload uses. `app.config.js` adds the `@sentry/react-native/expo` plugin with
the upload step **disabled unless `SENTRY_AUTH_TOKEN` is set**, so a build
without Sentry credentials still succeeds.

### Turning on Sentry

1. Create a free account at [sentry.io](https://sentry.io) and two projects:
   one **React Native** (the app) and one **Node.js / Express** (this API).
   Each project shows its DSN under *Settings → Client Keys (DSN)*.
2. **Backend:** in the Vercel project, add `SENTRY_DSN` (the Node project's
   DSN) under *Settings → Environment Variables*. Optionally add
   `SENTRY_ENVIRONMENT` (e.g. `production` / `preview`). Redeploy, because an
   env change only applies on a new deployment.
3. **Mobile:** add the React Native project's DSN to EAS as
   `EXPO_PUBLIC_SENTRY_DSN`. You can do this with
   `eas env:create --name EXPO_PUBLIC_SENTRY_DSN --value <dsn> --environment production --visibility plaintext`
   (repeat for `preview`), or by adding it under `build.<profile>.env` in
   `apps/mobile/eas.json`. A DSN is not a secret, since it ships in the app
   bundle. Then build again. It takes effect in the next build, and in an EAS
   Update published after it is set.
4. *Optional, for readable stack traces:* add `SENTRY_AUTH_TOKEN` (an org
   auth token from *Settings → Auth Tokens*, visibility **secret**),
   `SENTRY_ORG` and `SENTRY_PROJECT` (the slugs) to EAS. The next build
   uploads source maps and native debug files. Without the token the upload
   is skipped and the build still passes.

## API documentation

Swagger UI is served at **`/api/docs`**, and the raw OpenAPI 3.1 document at
**`/api/docs.json`** (23 operations across 20 paths). Set `ENABLE_API_DOCS=false`
to withhold both.

The document is hand-authored in `src/docs/openapi.ts` rather than generated:
request bodies have Zod schemas in `packages/shared`, but responses are plain
TypeScript interfaces (the backend does not validate its own output), so there
is no single source to generate from. **Change it in the same commit as the
route** — it is the contract the mobile client is written against.
