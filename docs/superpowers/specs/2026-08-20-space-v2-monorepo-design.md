# space-v2 — Monorepo Design

**Date:** 2026-08-20
**Status:** Approved
**Supersedes:** nothing. `jpc-space` (v1) stays live.

## Purpose

Rebuild the JPC Space product mobile-first. v1 is a Next.js 16 web portal; v2
splits it into a React Native app and a standalone Node API inside one
Turborepo, so the phone becomes the primary surface for students, leaders, and
admins.

v2 runs against **the same Postgres database as v1**. Both apps serve the same
community during the transition.

## Scope

In scope for the first pass:

- The workspace: pnpm + Turborepo, two apps, two shared packages.
- The ported database schema and migration history.
- One vertical slice — login — proving every layer is wired end to end.

Out of scope: an admin web app (the workspace stays open to adding
`apps/admin` later), and porting the rest of v1's feature surface. Endpoints
and screens land feature by feature after this pass.

## Workspace layout

```
space-v2/
├─ apps/
│  ├─ mobile/     @space/mobile   — Expo SDK 54, expo-router, RN 0.81
│  └─ backend/    @space/backend  — Express 5, Prisma 7, Postgres
├─ packages/
│  ├─ shared/     @space/shared   — Zod contracts, inferred types, RBAC helpers
│  └─ config/     @space/config   — eslint (node + native), tsconfig bases, prettier
├─ turbo.json
├─ pnpm-workspace.yaml
├─ .npmrc
└─ package.json
```

Root scripts delegate to Turbo: `build`, `dev`, `lint`, `typecheck`, `test`,
`clean`. The `build` and `typecheck` tasks declare `dependsOn: ["^build"]` so
package graph order is respected; `dev` is `persistent` and uncached.

`.npmrc` sets `shamefully-hoist=true`. React Native's Metro bundler cannot
resolve pnpm's nested symlink layout, so the flat `node_modules` is required,
not a preference.

### Package scope

Packages are named `@space/*`. Internal dependencies use `workspace:*`.

## packages/shared

The contract layer between the API and the app: Zod schemas, types inferred
from them, and the role/scope predicates both sides need.

`package.json` sets `"main": "./src/index.ts"` — **no build step**. Metro and
ts-node consume the TypeScript sources directly. This is the mechanism that
makes types flow between React Native and Node without a watch-and-rebuild
loop, and it is why the backend's `tsc` build must include the shared sources
rather than resolving a prebuilt `dist`.

Modules are organized by domain, one file each: `auth`, `season`, `group`,
`session`, `assignment`, `submission`, `attendance`, `quiz`, `notification`,
plus `rbac` for the shared permission predicates. `index.ts` re-exports.

## packages/config

Shared tooling so both apps lint and compile under one set of rules:

- `./eslint` — Node/TypeScript rules for the backend.
- `./eslint-native` — adds the React and React Native plugins for mobile.
- `./tsconfig` — strict base (`strict`, `noUncheckedIndexedAccess`,
  `forceConsistentCasingInFileNames`), extended per app.
- `./prettier` — one formatting config.

## apps/backend

Express 5 on Node 24, Prisma 7 against Postgres via `@prisma/adapter-pg`.

```
src/
  routes/       HTTP surface — parses input with a shared Zod schema, calls a service
  services/     business logic, the only layer that touches Prisma
  middleware/   auth, RBAC, error handler, rate limiting
  lib/          tokens, hashing, logging
  db/           Prisma client singleton
  app.ts        express app assembly (exported for supertest)
  server.ts     listen()
```

`app.ts` is separate from `server.ts` so tests can mount the app without
binding a port.

Supporting middleware matches v1's posture: `helmet`, `cors`, `morgan` request
logging into `winston`, and `express-rate-limit` on the auth routes.

### Prisma 7 note

Prisma 7 no longer generates into `node_modules`. The client is generated to
`src/generated/prisma` and imported from there — the same convention v1 uses.
Importing from `@prisma/client` will not work.

### Auth

Ported from v1, which already models everything needed — `RefreshToken` and
`PasswordResetToken` are existing tables, so no schema change is required.

- Email/password login, passwords hashed with argon2.
- Login returns a short-lived access JWT plus a refresh token; refresh tokens
  rotate on use and the previous token is revoked.
- Invite tokens (`InviteToken`) drive onboarding.
- Authorization middleware resolves the global `UserRole` **and** the scoped
  `SeasonAdmin` / `GroupLeader` join rows, mirroring v1's `lib/rbac.ts`. A user
  can be a Leader of one group and a Student of an earlier season at once, so
  role checks are always scope-aware.

Token signing uses its own secret, distinct from v1's `AUTH_SECRET`: the two
apps issue different token formats and must not validate each other's.

## apps/mobile

Expo SDK 54 with expo-router file-based routing.

- **Server state:** React Query.
- **Local/session state:** Zustand.
- **Token storage:** `expo-secure-store`.
- **HTTP:** one axios instance with a refresh interceptor that queues
  concurrent 401s, refreshes once, and retries the queued requests — so a
  screen firing several parallel queries triggers a single refresh.

Routes are grouped by role area (student, leader, admin), because the three
audiences see substantially different applications.

## Database

v1's `prisma/schema.prisma` (~30 models, 773 lines) is copied unchanged, and
`prisma/migrations/` is copied **verbatim** — same directory names, same
checksums. Because v2 points at v1's database, matching history means
`_prisma_migrations` stays consistent and neither app re-applies or drifts.

Consequences that follow from sharing one database:

- v2 does not create migrations in this pass. Any future schema change is a
  coordinated change to both repos.
- The backend's `.env` uses the same `DATABASE_URL` value as
  `jpc-space/.env`. Secrets are not committed; `.env.example` documents the
  keys.

## Vertical slice

The scaffold ships with one working path through every layer:

1. `GET /health` — liveness plus a database round-trip.
2. `POST /auth/login` — validates against the shared Zod schema, verifies the
   password, returns access and refresh tokens.
3. `POST /auth/refresh` — rotates the refresh token.
4. A mobile login screen that calls the API, stores tokens securely, and
   navigates to a placeholder home screen showing the authenticated user.

Everything else is stubbed. On completion, `pnpm dev`, `pnpm typecheck`,
`pnpm lint`, and `pnpm test` all pass from the repo root.

## Testing

- **Backend:** jest + ts-jest, supertest against the exported express app.
  Auth is covered at the route level: valid login, wrong password, expired
  refresh, rotated-token reuse.
- **Mobile:** jest-expo with `@testing-library/react-native`, covering the
  login screen's success and error states and the refresh interceptor's
  queueing behavior.
- Both wire into the Turbo `test` task.

## Risks

- **Shared database.** The shared database is a staging environment, not
  production, so v2 writing to it is low risk. Migrations are still copied
  verbatim and none are created in this pass, to keep `_prisma_migrations`
  consistent between the two repos.
- **pnpm + React Native.** Hoisting problems surface as opaque Metro resolution
  errors. `shamefully-hoist=true` is the known fix and matches nanny-app.
- **No-build shared package.** The backend's `tsc` build must be configured to
  compile shared sources; a misconfigured `rootDir` shows up only at build
  time, not in dev.
