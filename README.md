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

## Conventions

- **Imports are relative, not aliased.** Neither app uses a `@/` path alias.
  The backend dropped it because `tsc` cannot rewrite path aliases when
  `rootDir` is set to `../..` (needed so it can compile `packages/shared`
  alongside its own `src`). The mobile app never had one, because an alias
  that Jest resolves but Metro does not would pass tests while breaking the
  running app. Do not reintroduce a `@/` alias in either app.
- **Lint config is centralized.** Each linted package (`apps/backend`,
  `apps/mobile`, `packages/shared`) has its own `eslint.config.js` that
  re-exports `@space/config/eslint` (or `@space/config/eslint-native` for
  the mobile app), so shared rules live in one place.
- **The backend's build output is nested.** Because of the `rootDir: "../.."`
  setting above, `tsc` emits to `dist/apps/backend/src/...` instead of
  `dist/src/...`. The `start` script accounts for this:
  `node dist/apps/backend/src/server.js`.
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
