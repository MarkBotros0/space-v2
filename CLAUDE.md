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

## Response envelope

Success `{ "data": ... }`, failure `{ "error": { "code", "message" } }`.
Login-path codes: `bad_request` 400, `invalid_credentials` 401, `invalid_token` 401.

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
`dist/apps/backend/src/` because of the backend's `rootDir: "../.."`.

## Docs

- Design: `docs/superpowers/specs/2026-08-20-space-v2-monorepo-design.md`
- Plan: `docs/superpowers/plans/2026-08-20-space-v2-scaffold.md`
