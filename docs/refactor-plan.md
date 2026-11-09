# Whole-app refactor — plan and status

Source of truth for the clean-code + schema refactor. **A new session reads this file first and
resumes from the first unchecked step.** Update it after every step. Evidence for every finding ID
below is in `docs/refactor-audit.md` (merged, deduplicated) and its appendices in `docs/refactor-audit/`.

## Status (2026-11-09)

- **Current phase:** Wave 1 (dead code) on `refactor/wave-1-dead-code`, from `main` @ `dc3793dc`.
  Wave 0 is merged to `main`. Rulings D8 (fit the rules, skip what is slow or complicated) and D9
  (losing data is acceptable) apply.
- `main` @ `edc1fad0` (announcement polls) was merged into `refactor/wave-0-safety-net` at the
  owner's request (`bcb79a93`); the route-inventory snapshot now includes the 4 poll routes (`cea0568e`).
- Both databases migrated on the owner's instruction (Q28, 2026-11-09): the throwaway DB got
  `20261109090000_announcement_polls`; staging (`STG_DATABASE_URL`, `db.prisma.io`) was already up to
  date, so `migrate deploy` applied nothing there. Integration on the merged tree: **133 suites / 1,598
  tests pass**. **Next: push + Wave 0 PR (needs the owner's go-ahead), then Wave 1.**
- Secrets leak (2026-11-09): a command printed `STG_DATABASE_URL` and the main checkout's `AUTH_SECRET`
  into the session output; the owner was asked to rotate both.
- No code outside tests has changed. Nothing has been pushed; no PR opened yet.

## Working setup

- Worktree: `/home/mark/projects/JPC/space-v2-refactor` (kept apart from `main` at
  `/home/mark/projects/JPC/space-v2`, where other branches — redesign 02–05 — are active).
- Branch per wave: `refactor/wave-N-<name>`, each built on the previous one. Wave 0 =
  `refactor/wave-0-safety-net` (from `main` @ 4ab858a3, `main` @ edc1fad0 merged in).
- **Test database:** a throwaway Postgres 17 container `space-v2-refactor-db` on
  `127.0.0.1:55441`, db `refactor_test`, migrated with `pnpm --filter @space/backend db:migrate:deploy`.
  The worktree's `apps/backend/.env` (gitignored, mode 600) points at it with a random `AUTH_SECRET`.
  Never point this worktree at Prisma Postgres / Neon / the sweep DB. If the container is gone:
  recreate it with a fresh random password, rewrite `.env`, re-run `db:migrate:deploy`.
- Long runs go in tmux, logs in `~/logs/space-v2-refactor-*.log`
  (`space-v2-refactor-baseline` ran lint → typecheck → test:unit → build → integration;
  `space-v2-refactor-merge-check` re-ran lint → typecheck → test:unit → build after the merge).
- Supply chain: no new dependencies without owner approval (Q10, Q11). Audits used scripts over the
  `typescript` compiler API instead (this session's copy: scratchpad `scan/fnlen.js`).

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
| Size | 1,313 TS/TSX files (521 tests), ~163k lines; 36 Prisma models, 15 enums, 35 migrations |

**After the polls merge (`bcb79a93` + `cea0568e`):** 39 models, 36 migration folders, still 4 files > 400
(the same tests). Lint/typecheck/unit/build: see Wave 0 step 0.8. Integration: 133 / 1,598 pass (0.10).

## Wave 0 — safety net (`refactor/wave-0-safety-net`)

- [x] 0.1 Map project, run baseline (above)
- [x] 0.2 Route coverage check: 179 routes vs integration tests — only `GET /api/docs.json` and
      `DELETE /api/v1/me` (unit-mocked only) lacked a real-DB test
- [x] 0.3 `apps/backend/src/__tests__/route-inventory.test.ts` — snapshot of every route (method, full
      path, registration order). Unit, no DB.
- [x] 0.4 `apps/backend/src/__tests__/integration/soft-delete-characterization.test.ts` — DELETE /me
      soft-deletes user + profile, hard-deletes devices, ends sessions, lists as inactive; Super
      reactivate restores
- [x] 0.5 `apps/backend/src/__tests__/integration/schema-snapshot.test.ts` — snapshot of columns,
      indexes, constraints, enums of the migrated DB (schema waves update it deliberately)
- [x] 0.6 Record the integration baseline numbers in the table above
- [x] 0.7 Commit Wave 0 (d8bb57e0, 55598fcf, 541c2ad7; local only)
- [x] 0.8 Merge `main` @ edc1fad0 (polls) — `bcb79a93`, clean; Prisma client regenerated;
      route-inventory snapshot += 4 poll routes, nothing else changed (`cea0568e`).
      Lint/typecheck/unit/build on the merged tree: **all pass** (lint 0 warnings; unit: shared 30 / 331,
      backend 72 / 553, mobile 265 / 2328; build ok; `~/logs/space-v2-refactor-merge-check.log`)
- [x] 0.9 Poll migration applied to the throwaway DB (staging: already up to date, no-op); schema snapshot
      += exactly the 3 poll tables (15 columns, 3 PKs, 3 indexes, 6 FKs) — `a7fb7d19`
- [x] 0.10 Full integration suite on the merged tree: 133 suites / 1,598 tests / 4 snapshots pass
      (`~/logs/space-v2-refactor-integration.log`)
- [x] 0.11 Owner: "merge to main and continue" — fast-forwarded `main` to `dc3793dc` and pushed to `jpc`
      (Vercel deploy: tests + docs only) and `origin`; no PR (owner's choice for this wave)

## Phase 1 — audit (read-only)

- [x] Backend code audit → `docs/refactor-audit/backend.md` (Appendix A)
- [x] Mobile + shared audit → `docs/refactor-audit/mobile.md` (Appendix B)
- [x] Dead-code audit → `docs/refactor-audit/dead-code.md` (Appendix C)
- [x] Database audit → `docs/refactor-audit/database.md` (Appendix D)
- [x] Polls delta (schema + code) audited directly in the merged report (BE-090/091, FE-080/081, DB-029…031)
- [x] Merge into one deduplicated `docs/refactor-audit.md` (ERD per domain + column tables included;
      area files kept as appendices)
- [x] Fill the wave step lists below from the findings (every finding ID is assigned or explicitly kept)
- [x] **STOP — owner approved with ruling D8 (2026-11-09), answers recorded below**

## Decisions so far

- D1. **No repository layer per table** (BE-035). Thin handlers → domain services in `lib/<domain>/`
  (own transactions and locks, throw `ApiError`) → reads in `lib/queries/` → Prisma `select` as the
  data layer; `lib/permissions/` stays. Reference module: announcements; transactional model:
  `lib/roles/student-seats.ts`. Approved (D8).
- D2. The 400-line rule is already met for source; only 4 test files need splitting (Wave 2, with the
  lint rule).
- D3. Characterization tests are snapshots; a deliberate route or schema change updates the snapshot
  in the same commit.
- D4. Finding IDs keep their area prefix (BE/FE/SH/DC/DB/IDX); a duplicate found by two areas is
  listed once under the first ID, naming the other ("*also*").
- D5. **Wave 2 builds each helper with tests and converts the call sites that are purely mechanical
  and cross-cutting** (constants, enums, shared predicates, types, error-code literals). Helpers whose
  adoption touches domain logic (`idParam`, `notFound`, `parseOr400`, `pageOf`, `ApiError`, soft-delete
  fragments, `QueryGate`, `apiGet/apiSend`, `useSchemaErrors`) get one worked example in Wave 2 and
  are rolled out domain by domain in Waves 4/5, so each step stays reviewable.
- D6. **Rollback for migrations.** Prisma migrate has no `down`. Every Wave 3/6 migration ships a
  hand-written `rollback.sql` beside its `migration.sql`, exercised once on the throwaway DB
  (apply → rollback → apply) before commit. A dropped column's rollback restores the column, not
  its data (hence the Wave 6 backup).
- D7. **Every Wave 3/6 step that needs a data check** (duplicates, parity, violations) ships the
  check as a read-only script under `apps/backend/scripts/refactor-checks/`; the owner runs it against
  each real environment before that step's migration is deployed. This session never connects to
  them.
- D8. **Owner ruling (2026-11-09) on the audit, the plan and Q1–Q27:** "Fit the rules to the repo as
  much as you can, and if something will take so much time or will be complicated, just ignore it and
  don't fix it." Applied as one test per item: **do it** if it is mechanical and can't fail on existing
  data or change behaviour; **skip it** if it needs a check on a real database, changes semantics, or
  rewrites a subtle rule across many call sites. Skipped findings stay in the audit as known gaps
  and are listed under "Skipped (D8)" at the end of each wave; nothing skipped is half-done.

- D11. **Prettier printWidth is 120, not the configured-but-never-applied 100.** Measured on the unformatted
  tree (~163k lines): width 100 → ~179k lines and 33 files over 400 (one of them app source, `routes/me.ts`);
  120 → ~167k and 17 (tests and OpenAPI data only); 140 → ~161k and 12. 120 matches how the code is written
  and keeps every source file under the cap; Markdown is not formatted (it would realign hand-written tables).
- D9. **Owner ruling (2026-11-09): losing data is acceptable** — "I am still in testing phase, I didn't
  release". So a Wave 3 constraint may clean up or delete the rows that would violate it, in the same
  migration, instead of waiting for a real-data check; no archive is needed before Wave 6 (a backup is
  optional). Expand → migrate → contract still holds, because a running build must not break.
  Skips made for semantics, complexity or the redesign branches (D8) are unchanged.

## Owner answers (D8, 2026-11-09; D9 updates marked)

| Q | Topic | Answer |
|---|---|---|
| 1 | Int → BIGINT ids | keep `Int` for existing and new tables; documented exception |
| 2 | snake_case | keep PascalCase/camelCase; documented convention |
| 3 | soft delete | named fragments in `lib/db/live.ts` + lint rule; no new soft-delete tables; deleted account's email stays taken |
| 4 | base columns | add `createdAt`/`updatedAt` where rows are updated and the column is missing |
| 5 | base entity | schema conformance test (Wave 7) |
| 6 | `timestamptz`, `date` | yes, one Wave 3 step (value-preserving; the database is a test DB per owner) |
| 7 | routes without caller | remove `logout-all`, `POST /me/password`, `GET /seasons/:id/engagement`; keep the rest |
| 8 | `checkStudentSeat`, `canViewNote` | trace in Wave 1: delete if dead; if it looks like a missing guard, **report, don't add it** |
| 9 | assignment notifications to deleted students | fix as a bug, with a test |
| 10 | tooling deps | **no new dependency approved** → in-repo dead-code script; built-in `no-restricted-imports`/`no-restricted-syntax` for boundaries; **duplication check skipped** unless the owner later approves `jscpd` |
| 11 | drop deps | yes: `expo-linear-gradient`, `pg`, `@types/pg`, `react-hook-form`, `@hookform/resolvers` |
| 12 | archive + row counts | **D9:** no archive; backup before Wave 6 optional; sizes stay estimates |
| 13 | retention | **D9:** purge refresh/invite/reset tokens (7-day grace), device tokens unseen > 180 days, notifications > 180 days |
| 14 | `GroupStudent` | **keep** (moving 7 reads off the mirror is semantics-sensitive); add IDX-2, drop redundant IDX-D1 |
| 15 | case-insensitive email | **D9:** lowercase every stored email + `CHECK (email = lower(email))`; the existing unique then is case-insensitive in effect; lookups become one exact match. A case-duplicate pair makes the migration fail loudly (resolve by hand on that DB) |
| 16 | group targeting | keep |
| 17 | dormant switches | remove `IMPORT_FILE_UPLOAD_SUPPORTED`, `s3` driver, `READ_ONLY`, `AUTH_URL`; sync turbo env |
| 18 | CMS columns | drop the three never-read path columns; keep `avatarPath` |
| 19 | write-only columns | drop `RefreshToken.userAgent`; keep `DeviceToken.lastSeenAt` + index |
| 20 | DB guards | **D9:** yes, each with a cleanup of violating rows first: IDX-6, IDX-7, date-order / positive-quantity CHECKs (DB-019), `totalScore` (DB-016), mime + `correctIndex` CHECKs and `recurrenceGroupId` → uuid (DB-017). Still skipped: DB-014 (CLAUDE.md forbids a migration changing `User.role`), the enrolment-coherence CHECKs (semantics), DB-018 (limits would have to move with Zod), DB-031 (conditional, 3.11) |
| 21 | NotificationPreference | keep |
| 22 | copy | keep every current text and trim behaviour |
| 23 | unused type aliases | delete those unused anywhere |
| 24 | CI | `pnpm check` + unit tests on `pull_request`; integration stays manual |
| 25 | keeping up with `main` | merge `main` at each wave start and before its PR |
| 26 | User ↔ StudentProfile | keep |
| 27 | D1, D5–D7 | approved (fits the repo) |
| 28 | migrations | owner: "migrate both databases" — throwaway applied, staging was already current |

## Waves

Each step: change → relevant tests + lint + typecheck → commit (one concern) → tick here. End of
wave: full suite (lint, typecheck, unit, build, integration on the throwaway DB; UI sweep for
Waves 1, 5), wave summary below, PR, **stop for review**. Never continue on red.

### Wave 1 — dead code removal (`refactor/wave-1-dead-code`)

- [x] 1.0 Branch from Wave 0; merge current `main`; re-run the dead-code and length scans on the merged tree — base is main @ dc3793dc, nothing to merge; candidates re-verified per step
- [x] 1.1 Mobile dead files: DC-001, DC-002, DC-003, DC-004, DC-005 (+ barrel lines) — a627affc; tsc ok, 134 related suites pass
- [x] 1.2 Mobile dead symbols: DC-006, DC-007, DC-008, DC-009, DC-010, DC-011 — tsc + lint clean, 171 related suites pass (also removed the orphaned withPress helper and DayGroup type)
- [x] 1.3 Mobile test-only production code with its tests: DC-025, DC-026, DC-027, DC-028, DC-029, DC-030 — tsc + lint clean, 149 related suites pass; work-model.ts 323 → 275 lines; FE-041's AttendancePill part is moot
- [x] 1.4 Backend: DC-012 (`canReadAnnouncement`), DC-014, DC-020 (`isAdminOfAnySeason`), BE-054 — tsc + lint clean; rbac/route/poll unit tests + 14 forum/announcement/import integration suites (164 tests) pass
- [x] 1.5 Shared: SH-007 (`dashboardSchema`, `assignmentListItemSchema`), DC-024, DC-016 (unused type aliases) — 85 of DC-016's 103 aliases still dead and removed; 17 kept because a same-named symbol is used (conservative); 2 SH-007 schemas + Dashboard/AssignmentListItem removed; mentor feed cap test kept on mentorDashboardSchema; typecheck/lint all packages + shared 330 tests pass. Note for Wave 7: 10 files touched here were already not Prettier-formatted (nothing enforces Prettier)
- [x] 1.6 Drop `export` from file-local symbols: DC-017 / BE-081 — export dropped from 282 file-local declarations in 164 files (TS-API scan, kept if the name appears in any other file); 10 kept exported for declaration emit or typeof use (3 schemas wait for 1.9); dead PollOptionInput, PollVotesLost, sessionRangeResponseSchema deleted; typecheck + lint + all unit tests pass
- [x] 1.7 Config: DC-050 (`AUTH_URL`), DC-051 (turbo env synced), FE-052 (`LIVE_CHECK`) — AUTH_URL gone from turbo + .env.example; turbo build env = the 32 keys config.ts reads (READ_ONLY leaves in 1.8); two redundant staleTime overrides dropped, LIVE_CHECK named; tsc/lint/130 related suites pass
- [x] 1.8 Dormant switches: DC-013/055, DC-056 (`s3` driver), DC-057 (`READ_ONLY`) — with openapi + README — S3Storage stub deleted (STORAGE_DRIVER kept as the CMS slot, local only); READ_ONLY freeze (middleware, config, its test, openapi, README, .env.example, turbo) removed; IMPORT_FILE_UPLOAD_SUPPORTED removed; backend unit 71/539 + import/files/docs integration pass
- [x] 1.9 Routes without a caller: DC-060, DC-061 (+ DC-015), DC-062 — route-inventory snapshot, openapi,
      README, shared schemas in the same commits — removed POST /auth/logout-all, POST /me/password, GET /seasons/:id/engagement with their schemas, openapi entries and tests; revokeAllRefreshTokensForUser lost its unused exceptTokenHash. Route inventory: exactly these 3 gone. Unit 329/536/2304, affected integration 8 suites / 69 tests pass
- [x] 1.10 Trace `checkStudentSeat` (DC-022) and `canViewNote` (DC-021): delete if dead, else report (D8); CLAUDE.md "Roles" kept accurate — both dead, neither a missing guard: no single-note read route exists (lists use noteVisibilityWhere, edits canEditNote), and every seat write goes through seatStudents/newPersonRefusal, which share decide(). checkStudentSeat's override test moved onto seatStudents (rolled-back transactions). CLAUDE.md Roles updated. Lint/typecheck clean, backend unit 536, integration 4 suites / 46 tests
- [x] 1.11 Button legacy variants: codemod the 55 call sites to the mapped names, delete the alias maps (FE-071 part 1) — AST codemod (scratchpad scan/button-codemod.js, <Button>/<ButtonV1> only, conditional literals included): 75 literals in 31 files. Sizes are now md | sm | icon (icon = the old icon/icon-sm/icon-xs: 44pt square, same classes); icon-lg had no user. ThemeToggle lost its no-op size prop. Alias maps and Legacy types deleted. Lint/typecheck clean, mobile unit 264 / 2304
- [ ] 1.12 Dependencies: DC-040 (`expo-linear-gradient`), DC-046 (`pg`, `@types/pg`)
- [ ] 1.13 Docs and leftovers: SH-006 (stale CLAUDE.md paragraph), `scripts/smoke.sh` if unused
- [ ] 1.14 Kept on purpose, recorded here: DC-023 (`sentryEnabled` test seam), DC-031, DC-032, DC-058,
      DC-059, DC-063…066, FE-062. No action by design: BE-051, BE-053, BE-074, BE-075, BE-077, BE-078,
      FE-033, FE-053, FE-054, DB-011a, DB-029a. Covered under their duplicate IDs: BE-080
      (= DC-020/022/023), FE-070 (= DC-001/003/011/025…030)
- [x] 1.15 Prettier, enforced (owner request 2026-11-09; done ahead of 1.7): one config
      (`prettier.config.js` → `packages/config/prettier`, the duplicate `.prettierrc` removed), `.prettierignore`
      (generated output, Markdown), printWidth **120** (D11), one formatting-only commit listed in
      `.git-blame-ignore-revs`, and `pnpm lint` runs `prettier --check` first — 5f883938 config, 750d3714 width 120, dcfd39e6 format (874 files; lint, typecheck, unit 3,185, build, integration 1,598 all pass), then lint enforcement + blame-ignore + CLAUDE.md
- [ ] 1.16 Full verification + UI sweep spot-check (button variants) + wave summary + PR → **STOP**

### Wave 2 — shared foundations (`refactor/wave-2-foundations`)

- [ ] 2.1 ESLint size rules in **warning** mode in `packages/config` (built-in rules, no deps):
      `max-lines` 400 (all lines), `max-lines-per-function` 50 (target 40), `max-depth` 3, `complexity` 15;
      exclude `src/generated`, `prisma/migrations`, `src/docs` data. Record the warning count here
- [ ] 2.2 Split every file over 400 lines, so `max-lines` warns on nothing. After the Prettier format (1.15)
      that is 17, none of them app source: 12 tests (`imports-students-commit-routes` 636, `session-detail` 537,
      `season-people` 508, `quiz-runner` 492, `season-lock-routes` 465, `student-today` 462, `dashboard-routes` 460,
      `people-candidates` 457, `quiz-runner-saves` 428, `student-detail` 419, `students-list` 413,
      `assignment-detail` 407) and 5 OpenAPI data files under `apps/backend/src/docs/` (`paths/me` 451,
      `components/people` 451, `paths/students` 441, `paths/notes-notifications` 436, `paths/seasons` 402),
      split by path group / schema group
- [ ] 2.3 Shared season status: BE-022 / SH-002 / FE-014 / BE-043 — all inline copies replaced (D5)
- [ ] 2.4 Shared audience and admin predicates: SH-003 / FE-016, FE-015 / SH-004 — all sites
- [ ] 2.5 Shared types: FE-040, FE-041, FE-042 (`startSeasonResponseSchema`), SH-005 — all sites
- [ ] 2.6 Shared file splits: SH-001 (`import.ts`, `reports.ts` → folders)
- [ ] 2.7 Error-code catalogue: BE-040 / FE-050; BE-029 constants (text unchanged); poll codes (BE-091 part)
- [ ] 2.8 `ApiError` + one mapping point; `ForbiddenError` as a subclass; `toApiError` (BE-030 class part,
      BE-031); `apiNoContent` (BE-032); worked example: announcements
- [ ] 2.9 Moves to their layer: BE-017
- [ ] 2.10 HTTP helpers with tests + one worked example each: BE-020 `idParam`, BE-021 `notFound` + loaders,
      BE-02A `parseOr400`, BE-023 `pageOf` + shared cursor schemas
- [ ] 2.11 `requireRole` middleware (BE-025, BE-026) — all sites (messages unchanged)
- [ ] 2.12 Soft-delete fragments `lib/db/live.ts` (`liveUser`, `liveSeason`, `liveAssignment`, `withDeleted`)
      with tests; worked example (DB-024 part)
- [ ] 2.13 Constants: BE-041, BE-042 / FE-051, BE-044, BE-045
- [ ] 2.14 Backend plumbing: BE-060 (storage cycle), BE-02C (test helpers), BE-02D (`scripts/lib/db-host.ts`)
- [ ] 2.15 Mobile API layer: FE-032 `apiGet`/`apiSend` (worked example), FE-013 (all 6 sites), FE-035
      (key identity unchanged), FE-063 `useRole`
- [ ] 2.16 Mobile UI primitives: FE-020 `QueryGate`, FE-021 `useSeasonRoute` (all 10 season routes), FE-028
      `LoadMoreButton` (each site keeps its label)
- [ ] 2.17 Mobile helpers: FE-030, FE-024, FE-025 (per-site trim kept), FE-023, FE-022, FE-026, FE-027
- [ ] 2.18 FE-031: login on `useSchemaErrors`; drop `react-hook-form` + `@hookform/resolvers`
      (needs 2.17 — the reason it isn't in Wave 1)
- [ ] 2.19 Full verification + wave summary + PR → **STOP**

### Wave 3 — schema expand (`refactor/wave-3-schema-expand`)

Every step: migration + `rollback.sql` (D6), apply → rollback → apply on the throwaway DB, schema
snapshot updated, `schema.prisma` updated where expressible.

- [ ] 3.0 Verify `CREATE INDEX CONCURRENTLY` under Prisma 7 `migrate deploy` (one statement per file);
      record the pattern as D10 (or the psql fallback, audit §2.11)
- [ ] 3.1 IDX-1 `SeasonEnrollment(groupId, status)`
- [ ] 3.2 IDX-2 `GroupStudent(studentUserId)` (the table stays, Q14)
- [ ] 3.3 IDX-4 open follow-ups partial index
- [ ] 3.4 IDX-5 `Session(startsAt)` (cross-season calendar range)
- [ ] 3.5 IDX-8 + DB-029 composite FK on `AnnouncementPollVote` (`NOT VALID` → `VALIDATE`)
- [ ] 3.6 Missing base columns DB-021 / DB-030 (MentorFollowUp, SessionVideoProgress, AnnouncementPoll, AnnouncementPollOption)
- [ ] 3.7 DB-015: every `DateTime` → `timestamptz(3)` (`USING … AT TIME ZONE 'UTC'`), `User.dateOfBirth` → `date`
- [ ] 3.8 DB-004 (D9): `UPDATE "User" SET email = lower(trim(email))`, then `CHECK (email = lower(email))`
- [ ] 3.9 DB-019 (D9), each constraint after its cleanup in the same migration: IDX-6 (older duplicate
      IN_PROGRESS attempts deleted, newest kept), IDX-7 (duplicate group names get a " (2)" suffix),
      `Season endDate >= startDate`, `JpcEvent endDate IS NULL OR >= date`, positive durations, budgets, points
- [ ] 3.10 DB-016 `totalScore` CHECK (recomputed first); DB-017 mime-category CHECK (unknown values removed),
      `correctIndex` CHECK (out-of-range questions fixed or deleted), `Session.recurrenceGroupId` → uuid
      (non-uuid values nulled)
- [ ] 3.11 DB-031 option uniques — only if `applyUpdate`'s write order never holds a transient duplicate
- [ ] 3.12 DB-022 + DB-028: schema header and SQL-only objects documented; living ERD `docs/database/erd.md`
      from audit §2.1, kept current from here on
- [ ] 3.13 Full verification + wave summary + PR → **STOP** (deploy order: migrations before Wave 4 code)
- Skipped (D8): DB-014 (CLAUDE.md: no migration may change `User.role`), DB-019 enrolment-coherence
  CHECKs (semantics), DB-018, IDX-3 (not needed after 3.8), DB-012 parity, DB-011b

### Wave 4 — backend per domain (`refactor/wave-4-backend`)

Every domain step also does, for that domain: `ApiError` conversions (BE-030), `idParam` / `notFound` /
`parseOr400` / `pageOf` call sites (BE-020, BE-021, BE-02A, BE-023), soft-delete fragments (DB-024),
transactions out of handlers into `lib/<domain>/` (BE-035), files kept under 300 lines.

- [ ] 4.1 Announcements & polls (reference domain first, to settle the pattern): BE-090, BE-091
- [ ] 4.2 Auth & me: BE-010 (`routes/me/` split), DB-020 (`tokenHash` via `@map`), DB-010 stop writing
      `StudentProfile.deletedAt`, DB-006 stop writing `userAgent`, DB-007 + DB-006 purge (tokens, stale devices, old notifications; internal
      cron route + test), DB-004 single exact-match email lookup (ILIKE fallback and raw `lower()` removed)
- [ ] 4.3 Users: BE-001 `updateUserInTx`, BE-029 sites, DB-010 (restore)
- [ ] 4.4 Students: BE-014, BE-016 (`lib/students/graduation.ts`), DB-010 (lifecycle), DB-001 seed `year` removed
- [ ] 4.5 Groups & enrolment: BE-073; BE-027 helpers for the **identical** variants only
- [ ] 4.6 Seasons: BE-002 (duplicate, nesting 4 → 3), BE-003 (end), crud status transitions, start
- [ ] 4.7 Sessions, attendance, check-in: BE-070 (N+1), attendance save and check-in services
- [ ] 4.8 Assignments & submissions: BE-072 (count N+1), BE-028 `liveStudentIds` + the Q9 fix
- [ ] 4.9 Quizzes: BE-004 grading / attempts / paper grades / reorder services
- [ ] 4.10 Video quiz: BE-004 part (`lib/video-quiz/answer.ts`)
- [ ] 4.11 Forum: BE-015, BE-024, BE-071 (`canDeleteLoadedComment` + list-vs-DELETE parity test)
- [ ] 4.12 Notes, follow-ups, mentor: call-site conversions only
- [ ] 4.13 Notifications & push: BE-044 call sites
- [ ] 4.14 Reports, engagement, dashboard, exports: BE-005, BE-012, BE-013
- [ ] 4.15 Imports: BE-011; `commitStudentImport` transaction nesting 4 → 3; `splitRecords` keeps depth 4
      with a documented lint exception (CSV state machine)
- [ ] 4.16 Events, dev, health, scripts: remaining call sites (BE-02D adoption); BE-006 left as is
- [ ] 4.17 Sweep: no `deletedAt` literal outside `lib/db/live.ts`, no `$transaction` in `routes/`, no
      inline `apiError` with a catalogued code; full verification + wave summary + PR → **STOP**
- Skipped (D8): DB-012 read switch, DB-026 (a bounded query changes the result), BE-050 (authz scopes
  across domains), BE-052, BE-076, BE-02B, BE-027 variants that differ

### Wave 5 — mobile per feature area (`refactor/wave-5-mobile`)

Every area step also: `QueryGate` / `apiGet` / `useSchemaErrors` adoption (FE-020, FE-032, FE-030) and
a thin route file where it touches one (FE-011). Files stay where they are (see Skipped).

- [ ] 5.1 Season overview and lifecycle routes: FE-001 (`seasonOverviewModel`, tile snapshot first),
      FE-003 (start/end ladders), FE-018 (no placeholder ids)
- [ ] 5.2 Season people: FE-002 (`usePeopleSelection`, reducer tests first)
- [ ] 5.3 Roster import: FE-005
- [ ] 5.4 Forms: FE-006 (assignment, group, event, user, student, session, quiz)
- [ ] 5.5 Quizzes: FE-008 (grade screen), FE-010 (`use-quizzes/` split)
- [ ] 5.6 Forum: FE-009
- [ ] 5.7 Video questions editor: FE-004 editor part (`video-question-form.ts`)
- [ ] 5.8 Students lists: FE-034 (renames), FE-061 (`studentListCopy`), FE-029, FE-010 (`use-students` split)
- [ ] 5.9 Calendar: FE-060 (`calendarBranchFor`), FE-010 (`season-calendars` split)
- [ ] 5.10 Reports & exports: FE-012
- [ ] 5.11 Announcements & polls: FE-080 (poll-diff rule pinned first), FE-081
- [ ] 5.12 Remaining screens: FE-020 / FE-032 leftovers
- [ ] 5.13 Full verification + **UI sweep** + wave summary + PR → **STOP**
- Skipped (D8): FE-004 player part (YouTube timing), FE-017 + FE-073 (mass moves and renames that
  collide with the active redesign 02–05 branches), FE-071 part 2 and FE-072 (visual changes that the
  redesign plans own), FE-007

### Wave 6 — schema contract (`refactor/wave-6-schema-contract`)

**Deploy only after Waves 3–5 are live (a running build must not break). Data loss is acceptable (D9);
a backup first is optional. A rollback restores columns, not data.**

- [ ] 6.0 Confirm Waves 3–5 deployed
- [ ] 6.1 DB-001: drop the 7 dead `StudentProfile` columns, its FK and IDX-D2
- [ ] 6.2 DB-002: drop `Season.coverImagePath`, `Session.materialsPath`, `JpcEvent.imagePath`
- [ ] 6.3 DB-003: drop `StudentDocument` and its User relations
- [ ] 6.4 DB-006: drop `RefreshToken.userAgent`
- [ ] 6.5 DB-010: drop `StudentProfile.deletedAt`
- [ ] 6.6 IDX-D1 (`GroupStudent_groupId_idx`), IDX-D3 (`MentorFollowUp_dueAt_idx`)
- [ ] 6.7 ERD final; full verification + wave summary + PR → **STOP**
- Skipped (D8): DB-012 table drop, DB-005, IDX-D4 (kept: the device prune reads `lastSeenAt`), DB-011b

### Wave 7 — guardrails (`refactor/wave-7-guardrails`)

- [ ] 7.1 `max-lines` 400 and `max-depth` 3 → **error**; `max-lines-per-function` and `complexity` stay
      **warnings** (zero needs the skipped refactors, D8); `no-unused-vars` stays error;
      `no-restricted-syntax` bans a literal `deletedAt: null` outside `lib/db/live.ts` and `$transaction` under `routes/`
- [ ] 7.2 Boundaries with `no-restricted-imports`: mobile `app/`, `src/screens`, `src/components`, `src/design`
      ↛ `api-client` / axios (D1 lets thin handlers import `db`, so no route ↛ db rule)
- [ ] 7.3 Dead-code check: in-repo TS-API script `pnpm check:dead`
- [ ] 7.4 Schema conformance test: base columns per Q4, every FK indexed (minus the documented audit-FK
      exceptions), link tables keyed by their pair
- [ ] 7.5 One command `pnpm check` (lint, typecheck, unit tests, dead-code, size)
- [ ] 7.6 CI: `pnpm check` + unit tests on `pull_request` in the existing workflows
- [ ] 7.7 `.github/pull_request_template.md` with the definition-of-done checklist
- [ ] 7.8 CLAUDE.md `## Code & Data Standards` (real paths, the D8 exceptions)
- [ ] 7.9 Prove each guardrail fails on a planted violation (401-line file, unused export, route with
      `$transaction`, screen importing `api-client`, model without base columns), then passes once removed
- [ ] 7.10 Phase 4: final verification vs baseline, the >400-line command, dead-code re-run,
      `docs/refactor-report.md` (incl. every D8 skip) → **STOP**
- Skipped (D8): duplication check (`jscpd` not approved, Q10)

## Wave summaries

_(one paragraph per finished wave)_
