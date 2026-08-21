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
| POST | `/api/v1/submissions/:publicId/files` | **Disabled by default** — `503 uploads_disabled` unless `ENABLE_UPLOADS=true`. |
| DELETE | `/api/v1/submissions/:publicId/files` | `?fileId=` — author only. |
| GET | `/api/v1/submissions/:publicId/files/:fileId` | Streams the file. Not a port of v1 — see below. |

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
| `ENABLE_UPLOADS` | No | **`false`** | Accept file uploads. Off while file handling moves to a CMS — see below. |
| `ENABLE_API_DOCS` | No | `true` | Serves Swagger UI at `/api/docs` and the OpenAPI document at `/api/docs.json`. Set `false` to withhold them. |

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

`getStorage()` switches on `STORAGE_DRIVER` and returns a `Storage`
(`put` / `get` / `delete`). A CMS is a third driver beside `LocalFsStorage`
and the `S3Storage` stub — one new file, no route changes.

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

### Known limits on serverless

Two things do not survive a serverless runtime, and neither is fixed by the
entrypoint above:

- **Rate limiting is per-instance.** `express-rate-limit` uses its default
  in-memory store, so each cold start gets its own counter and the
  20-attempts-per-15-minutes login protection weakens to "20 per instance".
  Needs a shared store (Redis, or Vercel KV) to mean anything.
- **Prisma needs a pooled connection.** Point `DATABASE_URL` at Neon's *pooled*
  endpoint, or concurrent cold starts exhaust the connection limit.

Local file storage is a third — but uploads are switched off (see above), so it
is moot until the CMS driver lands.

A container host (Railway, Render, Fly, a VM) has none of these problems and
runs `dist/apps/backend/src/server.js` as-is.

## API documentation

Swagger UI is served at **`/api/docs`**, and the raw OpenAPI 3.1 document at
**`/api/docs.json`** (23 operations across 20 paths). Set `ENABLE_API_DOCS=false`
to withhold both.

The document is hand-authored in `src/docs/openapi.ts` rather than generated:
request bodies have Zod schemas in `packages/shared`, but responses are plain
TypeScript interfaces (the backend does not validate its own output), so there
is no single source to generate from. **Change it in the same commit as the
route** — it is the contract the mobile client is written against.
