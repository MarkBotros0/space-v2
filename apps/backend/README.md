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
| POST | `/api/v1/auth/refresh` | |
| POST | `/api/v1/auth/logout` | |
| GET | `/api/v1/me` | |
| GET | `/api/v1/seasons` | |
| GET | `/api/v1/seasons/:id` | |
| GET | `/api/v1/seasons/:id/groups` | |
| GET | `/api/v1/seasons/:id/sessions` | |
| GET | `/api/v1/seasons/:id/assignments` | |
| GET | `/api/v1/groups/:id` | |
| GET | `/api/v1/sessions/:id` | |
| GET | `/api/v1/sessions/:id/attendance` | |
| POST | `/api/v1/sessions/:id/attendance` | |
| POST | `/api/v1/sessions/:id/check-in-open` | |
| POST | `/api/v1/sessions/:id/check-in-close` | |
| POST | `/api/v1/sessions/check-in` | Student self-check-in. |
| GET | `/api/v1/assignments/:id` | |
| GET | `/api/v1/submissions/:publicId` | |
| PATCH | `/api/v1/submissions/:publicId` | Draft save / submit. |
| POST | `/api/v1/submissions/:publicId/files` | Upload (multer, `MAX_UPLOAD_BYTES` ceiling). |
| DELETE | `/api/v1/submissions/:publicId/files` | |

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
| `AUTH_URL` | No | unset | Base URL used to build a clickable link in notification emails. |
| `STORAGE_DRIVER` | No | `local` | `"local"` writes to `LOCAL_UPLOADS_DIR`; `"s3"` is a throwing stub, as in v1. |
| `LOCAL_UPLOADS_DIR` | No | `./uploads` | Only used when `STORAGE_DRIVER=local`. |
| `MAX_UPLOAD_BYTES` | No | `26214400` (25 MB) | Hard ceiling multer enforces before the per-assignment `maxFileSizeMb` check runs. |

**When `GMAIL_USER`/`GMAIL_APP_PASSWORD` are unset:** `sendNotificationEmail`
becomes a no-op (it logs a one-time warning and returns) — in-app
notifications are created unconditionally and are not affected. **When
`AUTH_URL` is unset:** any notification email that is sent omits the
clickable button/link.

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
- The shared Neon staging Postgres autosuspends when idle; the first query
  after a period of inactivity has been measured at ~18s (subsequent queries
  ~2s). Several integration suites carry an explicit `jest.setTimeout` above
  Jest's 5s default for this reason — see the comment beside each
  `jest.setTimeout` call for the suite's specific budget.

## Known gap: no file-download route

Submission files can be **uploaded** (`POST /api/v1/submissions/:publicId/files`)
and **deleted** (`DELETE /api/v1/submissions/:publicId/files`), but there is
no route to **read one back**. v1's `/api/uploads/[...path]` still owns file
serving; this backend has not ported it yet. Until it does, a client that
needs to display or download an uploaded file has to go through v1.
