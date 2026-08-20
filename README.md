# space-v2

Mobile-first rebuild of JPC Space. pnpm + Turborepo monorepo.

## Apps

| Path | Package | What it is |
|---|---|---|
| `apps/mobile` | `@space/mobile` | Expo (React Native) app, expo-router |
| `apps/backend` | `@space/backend` | Express API, Prisma, Postgres |
| `packages/shared` | `@space/shared` | Zod contracts shared by both |
| `packages/config` | `@space/config` | eslint, tsconfig, prettier |

## Prerequisites

- Node.js 24+
- pnpm 10+
- Access to the JPC staging Postgres database

## Setup

```bash
pnpm install
cp apps/backend/.env.example apps/backend/.env
# Fill DATABASE_URL and AUTH_SECRET with the same values as jpc-space/.env
pnpm --filter @space/backend db:generate
```

`apps/backend/.env.example` also documents two optional keys with safe
defaults: `TRUST_PROXY` (proxy hops in front of the app; default `0`, set it
to the real hop count behind a load balancer or the login/refresh rate
limiters bucket every client together) and `MOBILE_APP_ORIGIN` (CORS origin;
default `"*"`).

## Running

```bash
pnpm dev                          # everything
pnpm --filter @space/backend dev  # API on :4000
pnpm --filter @space/mobile dev   # Expo
```

## Checks

```bash
pnpm typecheck
pnpm lint
pnpm test        # unit suites, then backend integration against staging
pnpm test:unit   # unit only, no database needed
pnpm build
```

`pnpm test` runs the root `test:unit` and `test:integration` Turbo tasks in
sequence (there is no single `test` Turbo task). `test:integration` is marked
`cache: false` in `turbo.json`, so it always re-runs against the live
database rather than replaying a cached result.

`pnpm test:unit` for the backend needs neither a database nor a populated
`.env`: `apps/backend/jest.setup.ts` fills placeholder `DATABASE_URL` and
`AUTH_SECRET` values (only when they aren't already set — a real `.env`
still wins) so `../lib/config`'s validation doesn't throw on a clean
checkout. This was verified by temporarily renaming `apps/backend/.env` and
re-running the suite.

The backend integration suite (`apps/backend/src/__tests__/integration/`)
creates a test account in the shared staging database with a random-suffixed
email (`space-v2-test-<uuid>@jpc.test`) and cleans it up in `afterAll`. It
also deletes any leftover rows matching that email pattern in `beforeAll`, so
an interrupted previous run (CI timeout, Ctrl-C) can't leave a known-password
account behind or collide with the next run.

## Conventions

- **Imports are relative, not aliased.** Neither app uses a `@/` path alias.
  The backend dropped it because `tsc` cannot rewrite path aliases when
  `rootDir` is set to `../..` (needed so it can compile `packages/shared`
  alongside its own `src`). The mobile app never had one, because an alias
  that Jest resolves but Metro does not would pass tests while breaking the
  running app. Do not reintroduce a `@/` alias in either app.
- **`apps/backend/src/routes/auth.ts` imports `@space/shared` by relative
  path** (`../../../../packages/shared/src/index`), not the package name.
  Same root cause as above: with `rootDir: "../.."`, `tsc` emits this file to
  `dist/apps/backend/src/routes/auth.js` without rewriting bare specifiers,
  so a `require("@space/shared")` there would resolve at runtime via
  `node_modules/@space/shared` back to the TypeScript source instead of the
  compiled `dist/packages/shared/src/` output, crashing the built server with
  `ERR_MODULE_NOT_FOUND`. It's the only value import of `@space/shared` in
  the backend — everywhere else uses `import type`, which is erased at emit
  and so is unaffected. Keep it relative.
- **Lint config is centralized.** Each linted package (`apps/backend`,
  `apps/mobile`, `packages/shared`) has its own `eslint.config.js` that
  re-exports `@space/config/eslint` (or `@space/config/eslint-native` for
  the mobile app), so shared rules live in one place.
- **The backend's build output is nested.** Because of the `rootDir: "../.."`
  setting above, `tsc` emits to `dist/apps/backend/src/...` instead of
  `dist/src/...`. The `start` script accounts for this:
  `node dist/apps/backend/src/server.js`.
- **The backend build excludes both `__tests__` trees from `dist`.**
  `apps/backend/package.json`'s `build` script runs
  `tsc -p tsconfig.build.json`, a config that extends the base
  `tsconfig.json` and adds `src/__tests__/**` and
  `../../packages/shared/src/__tests__/**` to `exclude`. `typecheck` still
  uses the base `tsconfig.json` (no `-p` flag), so test files are still
  type-checked — they just don't ship in the production build.
- **`apps/mobile/jest.config.js` carves out `.pnpm` in
  `transformIgnorePatterns`.** Jest resolves React Native packages through
  pnpm's symlinks into the nested `.pnpm` store, so the default
  "don't transform node_modules" pattern has to be adjusted to still
  transform those packages.
- **Backend integration tests raise Jest's timeout.** `jest.setTimeout(15000)`
  is set in the integration suites because the shared staging database is
  sometimes slower to respond than Jest's 5s default.

## Database

This repo shares the staging database with `jpc-space` (v1). `prisma/schema.prisma`
and `prisma/migrations/` are copies of v1's — **do not create migrations here**.
Any schema change is a coordinated change across both repos.
