# space-v2 — Claude Context

Mobile-first rebuild of JPC Space (`D:\Projects\JPC\jpc-space` is v1 and still runs).

## Layout

- `apps/mobile` — Expo + expo-router, React Query, Zustand, tokens in expo-secure-store
- `apps/backend` — Express 5, Prisma 7, ports v1's `/api/v1`
- `packages/shared` — Zod contracts. **No build step**; `main` is `src/index.ts`
- `packages/config` — eslint, tsconfig, prettier

## Hard constraints

- **`D:\Projects\JPC\jpc-space` is READ-ONLY.** It is the reference
  implementation and the source of truth for behaviour — read it constantly,
  never write to it. No edits, no refactors, no "small fixes", no new files,
  no `git` operations in that repo. If something there looks wrong, report it;
  do not touch it.
- **The whole product is being migrated into this monorepo** — `apps/mobile`
  and `apps/backend` together replace jpc-space entirely, including the admin
  and super surfaces. jpc-space is retired once that is done, not before.
- **Everything goes in the mobile app.** All 104 of v1's pages, admin and
  super included, become React Native screens. There is no `apps/admin`.
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
- **Always `gh auth switch --user MarkBotros0` before pushing.** `origin` is
  `MarkBotros0/space-v2`, but this machine has five GitHub accounts in the
  `gh` keyring and the active one drifts on its own between sessions
  (`mbotros_effv`, `mark-aigorithm`, ... have all been active at various
  points). Pushing as the wrong account fails with a misleading
  `Repository not found` — the repo exists, the active token just can't see
  it. Put the switch in the **same command** as the push so nothing can
  change the active account in between:
  ```
  gh auth switch --user MarkBotros0 && git push -u origin <branch>
  ```
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

**Uploads are switched off.** `ENABLE_UPLOADS` defaults to `false`, so
`POST /api/v1/submissions/:publicId/files` returns `503 uploads_disabled`
while file/image handling moves to a CMS. The guard is mounted **in front of**
`upload.single("file")` on purpose: multer buffers the whole body to make the
per-assignment size check possible, so a guard behind it would still pay the
full `MAX_UPLOAD_BYTES` memory cost for a request it was always going to
refuse. Do not reorder it. Only uploading is gated — reading and deleting
recorded files still work. A CMS becomes a third `Storage` driver beside
`LocalFsStorage` and `S3Storage`; no route changes.

Swagger UI is at `/api/docs`, the raw OpenAPI 3.1 document at `/api/docs.json`
(`ENABLE_API_DOCS=false` withholds both). It is hand-authored in
`src/docs/openapi.ts` — responses are TS interfaces rather than Zod, so there
is nothing to generate from. Change it in the same commit as the route.

Still outstanding: the mobile screens for the newly-ported endpoints. See
`apps/backend/README.md` for the full endpoint and environment reference.

## Mobile conventions (Phase 0 established these — follow them)

**Screens are flat and role-driven.** One route per *destination*
(`/calendar`, `/students`), not per role. The tab bar renders
`navFor(user).tabs` from `packages/shared/src/navigation.ts`, so a student and
an admin see different tabs pointing at the same route files. `(app)/_layout.tsx`
hides non-tab routes with `href: null` — reachable by navigation, absent from
the bar — and derives the route universe from `ALL_NAV_HREFS`. Never re-derive
that set from `navByRole`: `ALUMNI` is not in it, only reachable via `navFor`.

**Typed routes are on.** Every `href` is compile-checked against the real route
tree. The types are generated, not written — `turbo.json`'s `routes:generate`
task runs `expo customize tsconfig.json` and `typecheck` depends on it, so a
clean checkout gets correct types. Without them the `Href` type silently
degrades to `string` and checks nothing. Never silence a route error with
`as Href`/`as any`.

**Data fetching follows `app/(app)/dashboard.tsx`** — the worked example. Query
keys are hierarchical factories in `src/lib/query-keys.ts`; hooks live in
`src/hooks/` and **parse responses with a Zod schema from `packages/shared`**
rather than casting, so a backend drift fails at the boundary. Queries
depending on `scopes.activeSeasonId` (or any nullable id) must pass `enabled`
— and guard manual `refetch()` too, since `enabled` only gates the automatic
run. Map states to the primitives: `LoadingState`, `ErrorState` with `onRetry`
wired to `refetch`, `EmptyState`.

**Domain contracts are Zod, not bare interfaces.** `session.ts`'s
`sessionListItemSchema` is the source of truth and its type is `z.infer` of it.
The remaining interfaces in `packages/shared` predate this and should convert
as each domain lands.

**Tab screens pass `edges={["top","left","right"]}` to `Screen`** — the tab bar
already consumes the bottom inset, so the default double-pads. `Screen` sums
insets into per-edge padding; never split that back into a `padding` shorthand
plus per-edge overrides, because Yoga resolves the specific edge first and the
shorthand is silently ignored.

**Testing.** Anything rendering `Screen` must use `renderWithProviders`
(`src/__tests__/helpers/render.tsx`) — it supplies `SafeAreaProvider` with
explicit `initialMetrics` and a `QueryClientProvider`. A *bare*
`SafeAreaProvider` renders no children at all while `render()` still returns a
truthy tree, so assertions pass against nothing. `Input` hides its visual label
and error caption from the accessibility tree, so query fields with
`getByLabelText` and assert errors via `accessibilityHint` — `getByText` finds
neither. `jest.mock` factories may only close over out-of-scope consts named
`mock*`.

## Git

`origin` is `MarkBotros0/space-v2`, but this machine has five accounts in the
`gh` keyring and the active one drifts between sessions. **Always**
`gh auth switch --user MarkBotros0` in the same command as a push or fetch —
the wrong account fails with a misleading `Repository not found`.

## Docs

- Design: `docs/superpowers/specs/2026-08-20-space-v2-monorepo-design.md`
- Plan: `docs/superpowers/plans/2026-08-20-space-v2-scaffold.md`
- API port plan: `docs/superpowers/plans/2026-08-20-space-v2-api-port.md`
