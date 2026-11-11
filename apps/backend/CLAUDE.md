# apps/backend — Claude Context

Express 5 + Prisma 7, ports v1's `/api/v1`. Loaded when you work under `apps/backend/`; the root
`CLAUDE.md` (hard constraints, standards, Git) still applies. Product rules live in `docs/rules/`.

## Code map

Paths are under `apps/backend/src/` unless written in full. A domain's code sits in up to five
places; open them in this order.

| Layer | Where | Holds |
|---|---|---|
| Route table | `routes/<domain>.ts`, or `routes/<domain>/index.ts` for a folder | paths and middleware in registration order; handlers in the sibling files |
| Service | `lib/<domain>/` | writes and transactions (`seasons/`, `students/`, `users/`, `groups/`, `quizzes/`, `sessions/`, `announcements/`, `assignments/`, `roles/`, `enrolment/`, `imports/`, `exports/`, `video-quiz/`, `me/`) |
| Reads | `lib/queries/` | named selects and loaders shared by routes (`season-participants.ts`, `students/list.ts`, `dashboard/`, `reports/`, …) |
| Gates | `lib/permissions/<domain>.ts` (re-exported from `index.ts`) over `lib/rbac.ts` | row-level access checks over the token's claims |
| Contract | `packages/shared/src/<domain>.ts` | Zod request/response schemas, shared with the app |

Cross-cutting pieces:

| Need | File |
|---|---|
| Token claims (`role`, `activeSeasonId`, `seasonAdminIds`, `groupLeaderIds`) | `lib/auth/scopes.ts`; tokens in `lib/auth/tokens.ts` |
| Seat writes, lock order, refusals | `lib/roles/` |
| Soft-delete filters | `lib/db/live.ts` |
| Errors and responses | `lib/api-error.ts`, `lib/api-response.ts`, `lib/http/` (`idParam`, `notFound`, `parseOr400`), `lib/pagination.ts` |
| Notifications, push, email | `lib/notifications.ts`, `lib/*-notifications.ts`, `lib/push.ts`, `lib/email.ts`, `lib/email-templates.ts` |
| Org time and dates | `lib/org-time.ts` |
| Scheduled work (reminders), request-driven | `lib/scheduler/` (`SCHEDULER_TICK`); handlers (follow-ups, assignment-reminders, quiz-deadlines) in `lib/scheduler/handlers.ts` |
| Config (the only `process.env` reader) | `lib/config.ts` |
| OpenAPI | `src/docs/` (`openapi.ts` plus a file per path group) |
| Schema | `apps/backend/prisma/schema.prisma`, migrations in `apps/backend/prisma/migrations/`, diagram `docs/database/erd.md` |
| Tests | unit `src/__tests__/*.test.ts`, integration `src/__tests__/integration/` (throwaway Postgres only) |
| Scripts | `apps/backend/scripts/` (`seed-sweep`, `community-preflight.ts`, `convert-stored-roles.ts`, `refactor-checks/`, `erd`) |

To find the handler for a URL: the prefix's module is mounted in `src/app.ts`; its route table names
the handler file. The full endpoint and environment reference is `apps/backend/README.md`; the
Swagger UI is `/api/docs`.

## Backend constraints

- **Prisma 7 generates to `src/generated/prisma`.** Never import `@prisma/client`.
- **No `process.env` outside `src/lib/config.ts`.**
- **`apps/backend/src/routes/auth.ts` imports `@space/shared` by relative
  path, not the package name.** Because of the same `rootDir: "../.."` setup,
  `tsc` emits this file to `dist/apps/backend/src/routes/auth.js` without
  rewriting bare specifiers — a `require("@space/shared")` at runtime would
  resolve via `node_modules/@space/shared` back to the *TypeScript source*
  instead of the compiled sibling output in `dist/packages/shared/src/`, and
  the built server crashes with `ERR_MODULE_NOT_FOUND`. `credentials.ts` and
  `tokens.ts` use `import type { UserRole } from "@space/shared"`, which is
  erased at emit, so they're unaffected — `auth.ts` is the only value import
  and the only one that needs to stay relative
  (`../../../../packages/shared/src/index`). Do not "tidy" it back to the
  package name.
- **Migrations.** (Also see the root `CLAUDE.md` "Code & Data Standards".)
  Each migration ships a `rollback.sql` beside it; a CHECK or partial index
  that Prisma can't declare is noted on its model as
  `// SQL-only <kind> <name>: <definition>` (the schema snapshot test fails
  otherwise), and `pnpm --filter @space/backend db:erd` regenerates
  `docs/database/erd.md` (a unit test fails while it is stale). Never run
  `prisma migrate dev` against a migrated database: it drops SQL-only objects.

## Response envelope

Success `{ "data": ... }`, failure `{ "error": { "code", "message" } }`. This
is enforced for every path, not just the happy ones: `apps/backend/src/middleware/`
holds a terminal error handler (malformed JSON body → `bad_request` 400,
anything thrown → `internal_error` 500 with no stack ever in the body,
regardless of `NODE_ENV`) and a catch-all `not_found` 404, both mounted last
in `app.ts`. The login and refresh rate limiters return `too_many_requests`
429 in the same shape instead of express-rate-limit's default plain-text body.

Login-path codes: `bad_request` 400, `invalid_credentials` 401, `invalid_token` 401.

On the mobile side, `apps/mobile/src/lib/api-client.ts` parses responses
against the shared Zod schemas (`loginResponseSchema`, `sessionSchema`)
instead of casting, so a future backend drift fails loudly at the client
boundary rather than handing a malformed object to callers.

## Tests

`test` runs the Turbo tasks `test:unit` then `test:integration` (there is no
`test` Turbo task itself — it's a root `package.json` script). `test:integration`
is uncached (`cache: false` in `turbo.json`) and hits the database `.env` names
(locally the Postgres `space_test`, see below), so it always actually executes. The backend's `start` script is
`node dist/apps/backend/src/server.js` — the emit path nests under
`dist/apps/backend/src/` because of the backend's `rootDir: "../.."`. The
backend build uses `tsconfig.build.json` (extends `tsconfig.json`, excludes
both `__tests__` trees) so test files never ship into `dist`; `typecheck`
still uses the base `tsconfig.json` and covers tests.

`apps/backend/src/__tests__/tokens.test.ts` and other unit tests import
`../lib/config`, which throws if `DATABASE_URL`/`AUTH_SECRET` are missing.
`apps/backend/jest.setup.ts` (wired via `setupFiles`) loads `.env` if present
and otherwise fills placeholder values for just those two keys, so
`pnpm test:unit` genuinely needs no database or real `.env` — a real `.env`,
when present, always wins.

## Environment (`apps/backend/.env`)

`DATABASE_URL`, `AUTH_SECRET` — see `.env.example`, both required, no defaults.
`PORT` — default `4000`. `NODE_ENV` — default `development`.
`TRUST_PROXY` — number of proxy hops in front of the app, passed to Express's
`trust proxy`; default `0` (fails closed — an unconfigured deploy trusts
nothing, rather than trusting a spoofable `X-Forwarded-For`). Set it to the
real hop count behind a load balancer, or the auth rate limiters bucket every
client together under the proxy's IP. `MOBILE_APP_ORIGIN` — CORS origin
allowed to call the API; default `"*"` (matches the app this backend was
ported from).

`DEV_USER_SWITCHER` — `"1"` turns on `/api/v1/dev/users` and `/dev/switch`,
v1's passwordless sign-in as any active user, and the header switcher on Home
(it only renders when the probe succeeds). Every `/dev` route is a 404
otherwise. A testing aid: unset by default.

**Sentry is opt-in on both sides.** It stays off until `SENTRY_DSN` (backend)
or `EXPO_PUBLIC_SENTRY_DSN` (mobile, read only in `src/lib/app-config.ts`) is
set. Report through `reportError` in each app's `lib/sentry.ts`, never
`Sentry.*` directly, so the off state stays a no-op. `src/instrument.ts` must
stay the first import of both backend entrypoints. Never put an email or a
name into an event. Setup steps are in `apps/backend/README.md` under
"Turning on Sentry".

## API surface

`apps/backend` now serves all of v1's `/api/v1` — every route file v1 had
under that prefix has a ported counterpart here. `src/routes/` has one module
per v1 domain: small domains are a single file (`auth.ts`, `me.ts`,
`groups.ts`, `assignments.ts`, `health.ts`, ...); big ones are a folder
(`quizzes/`, `sessions/`, `submissions/`, `seasons/`, `students/`, `users/`,
`video-quiz/`) whose `index.ts` is the route table — paths and middleware in
registration order — and whose sibling files hold the handlers. Register new
paths in the `index.ts`, keeping order (`/:id/foo` before `/:id`). A value
import of `packages/shared` from inside a route folder needs one more `../`
than from `routes/auth.ts` (see the hard constraint above). The 403 envelope
is `forbidden(res)` from `lib/api-response.ts`; a refusal thrown below a route is an `ApiError` (`lib/api-error.ts`).
Authorization runs through two layers: `lib/rbac.ts` holds pure predicates
over a decoded token's claims (role, `seasonAdminIds`, `groupLeaderIds`), and
`lib/permissions/` (one file per domain, re-exported from its `index.ts`)
holds the database-backed gates that check a specific row's ownership/scope
before a handler proceeds.


**File size.** Keep every source and test file at or under 400 lines. Split by
responsibility, turning `foo.ts` into `foo/index.ts` plus parts so importers
keep the same path. `lib/public-id.ts`
deliberately does **not** use `nanoid` — v1's generator is nanoid v5, which is
ESM-only, and this backend compiles to CommonJS, so requiring it would throw
`ERR_REQUIRE_ESM` at runtime. `newPublicId()` reimplements the same alphabet
and length using `node:crypto` instead; ids from the two backends are
indistinguishable. Do not "restore" `nanoid` here.

Two endpoints here are **not** ports and deliberately diverge from v1:

- `GET /api/v1/submissions/:publicId/files/:fileId` streams an attached file.
  v1's equivalent (`/api/uploads/[...path]`) takes an arbitrary storage path
  and gates it on nothing but "is logged in", so any authenticated user who
  guesses a path can read any student's private submission. This one addresses
  the file by id scoped to its submission and gates on `canViewSubmission`.
  It lives outside `/api/v1` in v1, so no client contract required parity.
- The upload handler re-decodes `file.originalname` from latin1 to UTF-8.
  `multer`/`busboy` decode multipart filenames as latin1; v1 used the web
  `formData()` API, which decodes UTF-8. Without this, a non-ASCII filename is
  stored mojibake'd. Do not "simplify" it back to `file.originalname`.

**Assignments are made of parts** (`docs/rules/assignments.md`). Routes: `GET|POST
/seasons/:id/assignments`, `GET|PATCH|DELETE /assignments/:id` (PATCH is a full replace with
`parts`; a change that touches students' work answers 409 until resent with `confirm: true`),
`GET /assignments/:id/progress` (staff, per part), `POST /assignments/:id/submit` (every part done,
videos watched), `PUT /assignments/:id/parts/:partId/essay` (draft), the video part's
`GET …/video`, `PUT …/video/progress`, `POST …/video/answers` and `GET|POST …/video-questions`
(`routes/assignments/`), the forum part's `…/parts/:partId/forum…` (`routes/forum.ts`), and per
essay `GET /submissions` (the queue, one item per essay), `GET /submissions/:publicId`,
`POST /submissions/:publicId/hand-in` and `POST /submissions/:publicId/review`. A `publicId` under
`/submissions/` is an essay work's (`AssignmentPartWork`), not a Submission's. Gone: the old
`PATCH /submissions/:publicId` draft/submit, an assignment's `sessionId`, `type` and group
targeting (`isAllGroups`, `AssignmentTarget`), and the cron route `GET
/internal/follow-ups/remind` with `CRON_SECRET` and `vercel.json`'s `crons`: reminders (assignment
and mentor follow-up) are sent by the request-driven scheduler, `lib/scheduler/`, switched by
`SCHEDULER_TICK`. Nothing on Vercel is a cron.

**Uploads are switched off.** `ENABLE_UPLOADS` defaults to `false`, so
`POST /api/v1/submissions/:publicId/files` returns `503 uploads_disabled`
while file/image handling moves to a CMS. The guard is mounted **in front of**
`upload.single("file")` on purpose: multer buffers the whole body to make the
per-assignment size check possible, so a guard behind it would still pay the
full `MAX_UPLOAD_BYTES` memory cost for a request it was always going to
refuse. Do not reorder it. Only uploading is gated — reading and deleting
recorded files still work. A CMS becomes a second `Storage` driver beside
`LocalFsStorage` (a new `STORAGE_DRIVER` value); no route changes.

Swagger UI is at `/api/docs`, the raw OpenAPI 3.1 document at `/api/docs.json`
(`ENABLE_API_DOCS=false` withholds both). It is hand-authored in
`src/docs/openapi.ts` — responses are TS interfaces rather than Zod, so there
is nothing to generate from. Change it in the same commit as the route.

Still outstanding: the mobile screens for the newly-ported endpoints. See
`apps/backend/README.md` for the full endpoint and environment reference.

## Deployment (Vercel)

- Vercel project `jesusprojectcommunity/jpc-space-be` (Hobby), production URL
  **https://jpc-space-be.vercel.app**, root directory `apps/backend` (its
  `vercel.json` builds from the repo root with pnpm + turbo). A push to `main`
  on `jpc` deploys production.
- The old project (`markbotros0`'s Vercel, `https://space-v2-be.vercel.app`)
  is superseded. The mobile app's `apps/mobile/app.json` → `extra.apiBaseUrl`
  points at `https://jpc-space-be.vercel.app` (overridable with
  `EXPO_PUBLIC_API_BASE_URL`, e.g. in EAS env vars). Builds made before this
  change still call the old URL until they're replaced.
- **Database:** Prisma Postgres `prisma-postgres-claret-school` (Postgres 17),
  copied on 2026-11-06 from the shared Neon database (`ep-cold-mode-…`, the
  one v1 `jpc-space` ran on) with `pg_dump`/`pg_restore` of `public`; all 34
  tables' row counts, 63 FKs, 100 indexes, 13 enums and 24 migrations matched.
  Owner ruling: this is a test database too ("There's no live, it's a test
  db"), so there is no final copy at cut-over. Nothing depends on Neon any
  more; it stays alive and undeleted, but no `.env` points at it. The local
  `.env` points at a local Postgres `space_test` (docker container
  `space-v2-sweepdb`, 127.0.0.1:55440), where the integration tests run. Check
  the host before running anything that writes elsewhere; never print
  `DATABASE_URL`.
- **`DATABASE_URL` on Vercel is the pooled URL** (`@pooled.db.prisma.io`), set
  by hand. The direct database allows ~50 connections and each serverless
  instance opens its own pool, so a direct URL runs out under load. The
  integration's own variables were removed so nothing shadows it.
- Other vars: `AUTH_SECRET` (new random value, Sensitive), `NODE_ENV=production`,
  `TRUST_PROXY=1`, `ENABLE_UPLOADS=false`, `MOBILE_APP_SCHEME=spacev2`.
  `GMAIL_USER`/`GMAIL_APP_PASSWORD` are not set yet, so invite and reset emails
  don't send.
- Never `vercel deploy` from a working tree: it uploads untracked files such as
  `.env`. For a manual deploy, deploy a clean `git archive` export.
