# Whole-app refactor — plan and status

Source of truth for the clean-code + schema refactor. **A new session reads this file first and
resumes from the first unchecked step.** Update it after every step.

## Status (2026-11-09)

- **Current phase:** Phase 1 (audit). Wave 0 (safety net) is done; all four area audits are in
  `docs/refactor-audit/` (backend, mobile, dead-code, database).
- **Next action:** finish Phase 1 — merge the four area files
  into one deduplicated `docs/refactor-audit.md`, assign every finding to a wave below, then **stop
  for owner approval**.
- No code outside tests has changed. Nothing has been pushed; no PR opened yet.

## Working setup

- Worktree: `/home/mark/projects/JPC/space-v2-refactor` (kept apart from `main` at
  `/home/mark/projects/JPC/space-v2`, where other branches — announcement polls, redesign — are active).
- Branch per wave: `refactor/wave-N-<name>`, each built on the previous one. Wave 0 =
  `refactor/wave-0-safety-net` (from `main` @ 4ab858a3).
- **Test database:** a throwaway Postgres 17 container `space-v2-refactor-db` on
  `127.0.0.1:55441`, db `refactor_test`, migrated with `pnpm --filter @space/backend db:migrate:deploy`.
  The worktree's `apps/backend/.env` (gitignored, mode 600) points at it with a random `AUTH_SECRET`.
  Never point this worktree at Prisma Postgres / Neon / the sweep DB. If the container is gone:
  recreate it with a fresh random password, rewrite `.env`, re-run `db:migrate:deploy`.
- Long runs go in tmux, logs in `~/logs/space-v2-refactor-*.log`
  (`space-v2-refactor-baseline` ran lint → typecheck → test:unit → build → integration).
- Supply chain: no new dependencies without owner approval (knip/jscpd/eslint-plugin-boundaries are
  proposals, see open questions). Audits used scripts over the `typescript` compiler API instead.

## Phase 0 — baseline (run 2026-11-09 on `main` @ 4ab858a3, before any change)

| Check | Result |
|---|---|
| `pnpm lint` | pass, 0 warnings |
| `pnpm typecheck` | pass (5 tasks) |
| `pnpm test:unit` | pass — shared 30 suites / 326 tests; backend 69 / 529; mobile 261 / 2269 |
| `pnpm build` | pass |
| backend `test:integration` (127 suites, throwaway DB) | pass — 129 suites / 1,553 tests / 4 snapshots, 301 s. Includes Wave 0's 2 new suites (8 tests), which were already on disk when the run reached integration; `main` alone = 127 suites / 1,545 tests |
| e2e | none automated; the Maestro UI sweep (`ui-sweep` skill) is the mobile e2e — not run |
| CI | `.github/workflows/unit-tests.yml` and `integration-tests.yml`, both `workflow_dispatch` only |
| Files > 400 lines | 4, all tests: `mobile/src/__tests__/season-people.test.tsx` 475, `student-today.test.tsx` 462, `session-detail.test.tsx` 432, `backend/src/__tests__/integration/people-candidates.test.ts` 423 |
| Size | 1,313 TS/TSX files (521 tests), ~163k lines; 36 Prisma models, 15 enums, 36 migrations |

## Wave 0 — safety net (`refactor/wave-0-safety-net`)

- [x] Map project, run baseline (above)
- [x] Route coverage check: 179 routes vs integration tests — only `GET /api/docs.json` and
      `DELETE /api/v1/me` (unit-mocked only) lacked a real-DB test
- [x] `apps/backend/src/__tests__/route-inventory.test.ts` — snapshot of every route (method, full
      path, registration order). Unit, no DB.
- [x] `apps/backend/src/__tests__/integration/soft-delete-characterization.test.ts` — DELETE /me
      soft-deletes user + profile, hard-deletes devices, ends sessions, lists as inactive; Super
      reactivate restores
- [x] `apps/backend/src/__tests__/integration/schema-snapshot.test.ts` — snapshot of columns,
      indexes, constraints, enums of the migrated DB (schema waves update it deliberately)
- [x] Record the integration baseline numbers in the table above
- [x] Commit Wave 0 (d8bb57e0, 55598fcf on `refactor/wave-0-safety-net`, local only, not pushed)
- [ ] Push + open the Wave 0 PR once the owner approves Phase 1

## Phase 1 — audit (read-only)

- [x] Backend code audit → `docs/refactor-audit/backend.md` (BE-001…BE-081)
- [x] Mobile + shared audit → `docs/refactor-audit/mobile.md` (FE-*, SH-*)
- [x] Dead-code audit → `docs/refactor-audit/dead-code.md` (DC-*)
- [x] Database audit → `docs/refactor-audit/database.md` (DB-001…DB-028, per-domain ERDs, column
      tables for all 36 entities, "Indexes to add" with `CONCURRENTLY` SQL + `@@index` lines (owner
      request 2026-11-09), "Indexes to drop", soft-delete/hard-delete inventory, BIGINT and
      snake_case blast radius, size classes). Row counts are estimates: the owner must run its §7
      `pg_stat_user_tables` query for real numbers. The `CONCURRENTLY`-in-Prisma-migrate caveat is
      unverified on Prisma 7 — verify on the throwaway DB before Wave 3.
- [ ] Merge into one deduplicated `docs/refactor-audit.md` (keep the per-area files as appendices)
- [ ] Fill the wave step lists below from the findings
- [ ] **STOP — owner approves/edits audit and plan**

## Decisions so far

- D1. No repository layer per table. Backend audit (BE layering) recommends: thin handlers →
  domain services in `lib/<domain>/` (own transactions and locks) → reads in `lib/queries/` →
  Prisma `select` as the data layer; `lib/permissions/` stays. Reference module: announcements
  (`routes/announcements/*`, `lib/permissions/announcement.ts`, `lib/queries/announcements.ts`);
  transactional service model: `lib/roles/student-seats.ts`. *Pending owner approval.*
- D2. The 400-line rule is already met for source; Wave 1/4/5 only need to split the 4 test files.
- D3. Characterization tests are snapshots; a deliberate route or schema change updates the snapshot
  in the same commit.

## Open questions for the owner (collect answers before Wave 1)

1. **Int → BIGINT ids.** All PKs are `Int` (serial4) by a v1 decision. BIGINT means Prisma returns JS
   `bigint`, which `JSON.stringify` can't serialise — touches every id in every response. Recommend:
   keep `Int` (document as a known exception), new tables too, for consistency.
2. **snake_case.** Tables/columns are Prisma-default PascalCase/camelCase. Renaming means rewriting
   every raw SQL site and a locking migration. Recommend: keep, document as the convention.
3. **Soft delete everywhere.** DB audit: 153 hand-written `deletedAt` filters in 83 files, 27
   hard-delete sites, 99 relation reads of soft-deletable models (not caught by `$extends`);
   it recommends named filter fragments over a global extension.
   Today only User, StudentProfile, Season, Assignment have `deletedAt`.
   Prisma 7 has no `$use`; a central filter is a `$extends` query extension, which does **not**
   filter nested `include`/`select` relations. Which tables really need soft delete?
4. **Routes with no mobile caller** (13, `dead-code.md`), esp. `POST /auth/logout-all`,
   `POST /me/password` — remove?
5. **Possible missing guard, not dead code:** `checkStudentSeat` (named in CLAUDE.md) has no
   production caller; `canViewNote` used only by tests. Owner to confirm intent.
6. **Notification recipients:** `lib/assignment-writes.ts:85` doesn't filter deleted students, unlike
   the other producers — bug or intended?
7. **New tooling deps** for Wave 2/7 guardrails: `knip`, `jscpd`, `eslint-plugin-boundaries` (or
   `dependency-cruiser`). Approve, or keep the in-repo TS-API scripts?
8. Dependencies: drop `expo-linear-gradient` (native → needs a new build), `pg`/`@types/pg`
   (redundant with `@prisma/adapter-pg`)? `react-hook-form` only used by `login.tsx`.
9. **DB personal data:** dead `StudentProfile` columns (phone, DOB, spiritualBackground…) and the
    unused `StudentDocument` table may hold v1 personal data — archive before any Wave 6 drop?
10. **Retention:** `RefreshToken`, `Notification`, expired invite/reset tokens grow forever (DB-007).
    Add a cleanup job? (behaviour change → needs approval)
11. **`GroupStudent` duplicates `SeasonEnrollment.groupId`** (DB-012): expand/switch/drop?
12. **Case-insensitive email unique** (DB-004): needs a duplicate check on real data first.
13. Concurrency: other branches (polls, redesign) are active on `main`. A whole-app refactor will
   conflict with them; agree a merge order / freeze window per wave.

## Waves (steps filled in after audit approval)

- [ ] Wave 1 — dead code removal
- [ ] Wave 2 — shared foundations (ApiError + one mapping point, `parseIdParam`/load-or-404,
      pagination helper, `isSeasonFinished` + status sets in shared, shared error-code constants,
      `apiGet`/`apiSend`, `QueryGate`, `useSeasonRoute`; lint size rules in warning mode)
- [ ] Wave 3 — schema expand (indexes to add, missing base columns, constraints)
- [ ] Wave 4 — backend refactor per domain
- [ ] Wave 5 — mobile refactor per feature area
- [ ] Wave 6 — schema contract (drops; DB backup first)
- [ ] Wave 7 — guardrails (rules to error, CI, CLAUDE.md "Code & Data Standards")

## Wave summaries

_(one paragraph per finished wave)_
