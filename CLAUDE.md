# space-v2 — Claude Context

Mobile-first rebuild of JPC Space (`D:\Projects\JPC\jpc-space` is v1 and still runs).

## Layout

- `apps/mobile` — Expo + expo-router, React Query, Zustand, tokens in expo-secure-store
- `apps/backend` — Express 5, Prisma 7, ports v1's `/api/v1`
- `packages/shared` — Zod contracts. **No build step**; `main` is `src/index.ts`
- `packages/config` — eslint, tsconfig, prettier

## Hard constraints

- **Shared staging database with v1.** No migrations are created here.
  `prisma/migrations/` is a verbatim copy of v1's.
- **Passwords are bcryptjs.** Existing hashes are bcrypt; any other algorithm
  locks out every user.
- **Tokens must stay v1-compatible:** `jose` HS256, secret `AUTH_SECRET`
  (same value as v1), audience `jpc-mobile`, 900s TTL, subject `String(userId)`.
- **Prisma 7 generates to `src/generated/prisma`.** Never import `@prisma/client`.
- **No `process.env` outside `src/lib/config.ts`.**
- `.npmrc` sets `shamefully-hoist=true` — Metro cannot resolve pnpm's nested symlinks.
- **No `@/` path alias in either app.** The backend can't use one because `tsc`
  won't rewrite path aliases with `rootDir: "../.."` (needed so it can also
  compile `packages/shared`). The mobile app never had one: an alias that
  Jest resolves but Metro doesn't would pass tests while breaking the running
  app. Both apps use relative imports — keep it that way.
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

## Commands

```
pnpm dev / build / lint / typecheck / test / test:unit
pnpm --filter @space/backend db:generate
```

`test` runs the Turbo tasks `test:unit` then `test:integration` (there is no
`test` Turbo task itself — it's a root `package.json` script). `test:integration`
is uncached (`cache: false` in `turbo.json`) and hits the live staging database,
so it always actually executes. The backend's `start` script is
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

## Backend environment (`apps/backend/.env`)

`DATABASE_URL`, `AUTH_SECRET` — see `.env.example`, both required, no defaults.
`PORT` — default `4000`. `NODE_ENV` — default `development`.
`TRUST_PROXY` — number of proxy hops in front of the app, passed to Express's
`trust proxy`; default `0` (fails closed — an unconfigured deploy trusts
nothing, rather than trusting a spoofable `X-Forwarded-For`). Set it to the
real hop count behind a load balancer, or the auth rate limiters bucket every
client together under the proxy's IP. `MOBILE_APP_ORIGIN` — CORS origin
allowed to call the API; default `"*"` (matches the app this backend was
ported from).

## API surface

`apps/backend` now serves all of v1's `/api/v1` — every route file v1 had
under that prefix has a ported counterpart here. `src/routes/` mirrors v1's
route tree file-for-file (`auth.ts`, `me.ts`, `seasons.ts`, `groups.ts`,
`sessions.ts`, `assignments.ts`, `submissions.ts`, plus `health.ts`).
Authorization runs through two layers: `lib/rbac.ts` holds pure predicates
over a decoded token's claims (role, `seasonAdminIds`, `groupLeaderIds`), and
`lib/permissions.ts` holds the database-backed gates that check a specific
row's ownership/scope before a handler proceeds. `lib/public-id.ts`
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

Swagger UI is at `/api/docs`, the raw OpenAPI 3.1 document at `/api/docs.json`
(`ENABLE_API_DOCS=false` withholds both). It is hand-authored in
`src/docs/openapi.ts` — responses are TS interfaces rather than Zod, so there
is nothing to generate from. Change it in the same commit as the route.

Still outstanding: the mobile screens for the newly-ported endpoints. See
`apps/backend/README.md` for the full endpoint and environment reference.

## Docs

- Design: `docs/superpowers/specs/2026-08-20-space-v2-monorepo-design.md`
- Plan: `docs/superpowers/plans/2026-08-20-space-v2-scaffold.md`
- API port plan: `docs/superpowers/plans/2026-08-20-space-v2-api-port.md`
