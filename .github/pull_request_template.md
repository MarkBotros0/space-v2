## What and why

<!-- One concern per PR. What changes for a user, or "no behaviour change". -->

## Definition of done

- [ ] `pnpm check` passes (lint, typecheck, unit tests, `check:dead`, `check:size`); CI runs it on this PR
- [ ] Integration tests run where the change touches the backend or the database (Actions → "Integration tests (on demand)", or locally against a throwaway database, never staging or production)
- [ ] Every feature, API contract and user-visible text keeps working, or the change is the owner's ruling and is named here
- [ ] No file over 400 lines; no new `eslint-disable` without a reason beside it
- [ ] Backend: transactions live in `lib/<domain>/`, not in a route; soft-delete filters come from `lib/db/live.ts`; refusals below a route throw `ApiError`
- [ ] Mobile: screens read data through `src/hooks/` (never `api-client` or axios); hooks parse with a shared Zod schema via `apiGet` / `apiSend`; screen parts live in `src/screens/<screen>/`, never under `app/`
- [ ] Migration: additive unless planned; a `rollback.sql` beside it, cycled apply → rollback → apply; SQL-only objects noted on their model; `pnpm --filter @space/backend db:erd` re-run; the environments it was applied to are named in the commit
- [ ] Changed or new screen: the `ui-sweep` skill run and the shots looked at (sweep flows never save anything)
- [ ] OpenAPI (`src/docs/`) updated in the same commit as a route change
- [ ] No new dependency without the owner's approval; no secrets, emails or names in logs or Sentry events
- [ ] Commits authored as `jesusprojectcommunity`
