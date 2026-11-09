# Whole-app refactor — plan and status

Source of truth for the clean-code + schema refactor. **A new session reads this file first and
resumes from the first unchecked step.** Update it after every step. Evidence for every finding ID
below is in `docs/refactor-audit.md` (merged, deduplicated) and its appendices in `docs/refactor-audit/`.

## Status (2026-11-09)

- **Current phase:** end of Phase 1. The merged audit and this plan are written. **Waiting for the
  owner to approve or edit them and to answer the open questions (Q1–Q27).** Nothing in Waves 1–7
  starts before that.
- `main` @ `edc1fad0` (announcement polls) was merged into `refactor/wave-0-safety-net` at the
  owner's request (`bcb79a93`); the route-inventory snapshot now includes the 4 poll routes (`cea0568e`).
- **Blocked:** applying the poll migration to the throwaway DB (`db:migrate:deploy`) was refused by
  the session's permission classifier, so the schema-snapshot test and the integration suite haven't
  run on the merged tree yet (Wave 0 steps 0.9–0.10). Needs the owner's go-ahead.
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
| Size | 1,313 TS/TSX files (521 tests), ~163k lines; 36 Prisma models, 15 enums, 36 migrations |

**After the polls merge (`bcb79a93` + `cea0568e`):** 39 models, 37 migrations, still 4 files > 400
(the same tests). Lint/typecheck/unit/build: see Wave 0 step 0.8. Integration: not yet run (0.10).

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
- [ ] 0.9 Apply `20261109090000_announcement_polls` to the throwaway DB, update the schema snapshot
      (expect exactly the 3 poll tables, their 3 indexes + 3 PKs + 6 FKs), commit — **blocked on owner
      permission** (see Status)
- [ ] 0.10 Full integration suite on the merged tree (tmux `space-v2-refactor-integration`)
- [ ] 0.11 Push + open the Wave 0 PR once the owner approves Phase 1

## Phase 1 — audit (read-only)

- [x] Backend code audit → `docs/refactor-audit/backend.md` (Appendix A)
- [x] Mobile + shared audit → `docs/refactor-audit/mobile.md` (Appendix B)
- [x] Dead-code audit → `docs/refactor-audit/dead-code.md` (Appendix C)
- [x] Database audit → `docs/refactor-audit/database.md` (Appendix D)
- [x] Polls delta (schema + code) audited directly in the merged report (BE-090/091, FE-080/081, DB-029…031)
- [x] Merge into one deduplicated `docs/refactor-audit.md` (ERD per domain + column tables included;
      area files kept as appendices)
- [x] Fill the wave step lists below from the findings (every finding ID is assigned or explicitly kept)
- [ ] **STOP — owner approves/edits audit and plan, answers Q1–Q27**

## Decisions so far

- D1. **No repository layer per table** (BE-035). Thin handlers → domain services in `lib/<domain>/`
  (own transactions and locks, throw `ApiError`) → reads in `lib/queries/` → Prisma `select` as the
  data layer; `lib/permissions/` stays. Reference module: announcements; transactional model:
  `lib/roles/student-seats.ts`. *Pending owner approval (Q27).*
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

## Open questions for the owner (answer before Wave 1; "accept recommendations" is a valid answer)

**Standards that don't fit as written (gate Wave 2–3 design)**
1. **Int → BIGINT ids** (DB-025). Recommend: keep `Int` for existing *and* new tables; record as the
   documented exception (BIGINT breaks every JSON response and every shared id schema).
2. **snake_case** (DB-023). Recommend: keep PascalCase/camelCase; document it as the convention.
3. **Soft delete scope and mechanism** (DB-024). Recommend: (a) named filter fragments in
   `lib/db/live.ts` + a lint rule, not a Prisma `$extends` (it can't filter nested reads);
   (b) no new soft-delete tables — today's hard deletes (Group, Session, ForumComment, JpcEvent, quiz
   and video questions, SeasonAdmin) stay hard and are documented, since converting them changes
   behaviour; (c) a deleted account's email stays taken (re-invite restores), as today.
4. **Base columns** (DB-021/030). Recommend: add `createdAt`/`updatedAt` where rows are updated and the
   column is missing (MentorFollowUp, SessionVideoProgress, AnnouncementPoll, AnnouncementPollOption);
   leave append-only rows and pure links without `updatedAt`. Alternative: strict, every non-link table.
5. **"Base entity"** — Prisma has no model mixins. Recommend: a schema conformance test (Wave 7) that
   fails when a model lacks the agreed columns or an FK lacks an index.
6. **Timestamps → `timestamptz`, `dateOfBirth` → `date`** (DB-015). Recommend: yes, in Wave 3, small
   tables first and the large ones after the purge (Q13) in a quiet window (table rewrite + lock).

**Behaviour and contract changes (each needs an explicit yes)**
7. **Routes with no mobile caller** (DC-060…066). Recommend: remove `POST /auth/logout-all`,
   `POST /me/password`, `GET /seasons/:id/engagement` and their schemas; keep the rest.
8. **`checkStudentSeat` and `canViewNote`** have no production caller (DC-021/022). Missing guards or
   dead? Recommend: I trace each seat-write and note-read path in Wave 1 and report before deleting.
9. **Assignment notifications reach deleted students** (`lib/assignment-writes.ts:85`, BE-028), unlike
   the other producers. Recommend: treat as a bug, fix in Wave 4 with a test.
13. **Retention** (DB-007, DB-006): a daily purge of expired/revoked refresh tokens and used/expired
   invite and reset tokens; stale device tokens; a Notification retention period? Recommend: tokens yes
   (7-day grace), devices unused > 180 days yes, notifications: your call (e.g. 180 days).
22. **Copy unification:** "Show more" vs "Load more" (FE-028), the two `email_taken` messages (BE-029),
   trimming in blank-to-null (FE-025). Recommend: keep every current text and trim behaviour.

**Schema contents**
11. **Dependencies to drop:** `expo-linear-gradient` (native: lands with the next binary), `pg` +
   `@types/pg`, `react-hook-form` + `@hookform/resolvers` (after login moves to `useSchemaErrors`).
   Recommend: all four.
12. **Personal data before Wave 6 drops** (DB-001, DB-003): archive the dead StudentProfile columns
   (phone, DOB, spiritualBackground, gifts, photoPath, year) and `StudentDocument` rows/files first?
   And please run the `pg_stat_user_tables` row-count query (audit §2.15) on Prisma Postgres.
14. **`GroupStudent`** duplicates `SeasonEnrollment.groupId` (DB-012). Recommend: switch reads in Wave 4,
   drop in Wave 6.
15. **Case-insensitive email unique** (DB-004): run the duplicate query (audit §2.10) on each DB and
   resolve hits; then IDX-3. Lowercase the stored emails too? Recommend: yes.
16. **Group targeting** (DB-013): gone for good? Recommend: keep the schema (it defines past
   percentages); no change.
18. **Columns kept for the CMS:** `Season.coverImagePath`, `Session.materialsPath`, `JpcEvent.imagePath`
   (never read) and `User.avatarPath` (returned in 4 payloads, never written). Recommend: drop the first
   three, keep `avatarPath`.
19. **Write-only columns** (DB-006): drop `RefreshToken.userAgent`? Keep `DeviceToken.lastSeenAt` only
   with the prune of Q13. Recommend: drop `userAgent`; keep `lastSeenAt` + prune.
20. **Optional DB guards:** DB-019 invariants (yes, after violation checks), DB-017 mime/`correctIndex`
   CHECKs and `recurrenceGroupId` → uuid (yes), DB-016 `totalScore` CHECK (yes after check), DB-018
   length CHECKs (no), a `Program` lookup table (no). Recommend as listed.
21. **NotificationPreference** → opt-out rows (DB-011b)? Recommend: keep the current table.
26. **User ↔ StudentProfile 1:1** (DB-011a). Recommend: keep the split (isolates the staff-only note).

**Dead code and config**
17. **Dormant switches:** remove `IMPORT_FILE_UPLOAD_SUPPORTED` (DC-013), the throwing `s3` storage
   driver (DC-056), the `READ_ONLY` freeze (DC-057), `AUTH_URL` (DC-050); sync `turbo.json` env with
   `config.ts` or replace the list with a comment (DC-051)? Recommend: remove all four; sync the list.
23. **103 unused shared type aliases** (DC-016). Recommend: delete those unused anywhere, keep schemas.

**Process and tooling**
10. **Tooling dependencies** for Wave 7: `jscpd` (duplication; no in-repo equivalent; also needed for
   the before/after duplication % in the final report), `knip` (dead code) and
   `eslint-plugin-boundaries`. Recommend: approve `jscpd` (pinned dev dep); do dead code with an in-repo
   TS-API script and boundaries with ESLint's built-in `no-restricted-imports` (no new deps).
24. **CI triggers:** both workflows are `workflow_dispatch` only. Recommend: run `pnpm check` + unit
   tests on `pull_request`; integration stays manual, or gets a Postgres service container.
25. **Keeping up with `main`** (redesign 02–05 are active). Recommend: merge `main` into each wave
   branch at its start and before its PR; agree a short freeze on the files a wave touches.
27. **Approve D1** (services + reads, no repository layer) and **D5–D7** above.
28. **Permission:** may this session run `db:migrate:deploy` and integration tests against the
   throwaway container `space-v2-refactor-db` (127.0.0.1:55441)? The classifier blocked it (Wave 0 0.9).

## Waves

Each step: change → relevant tests + lint + typecheck → commit (one concern) → tick here. End of
wave: full suite (lint, typecheck, unit, build, integration on the throwaway DB; UI sweep for
Waves 1, 5), wave summary below, PR, **stop for review**. Never continue on red.
"(Q*n*)" = the step runs only as the owner answers; a refused step is ticked with "skipped (Q*n*)".

### Wave 1 — dead code removal (`refactor/wave-1-dead-code`)

- [ ] 1.0 Branch from Wave 0; merge current `main` (Q25); re-run the dead-code and length scans on the merged tree
- [ ] 1.1 Mobile dead files: DC-001, DC-002, DC-003, DC-004, DC-005 (+ barrel lines)
- [ ] 1.2 Mobile dead symbols: DC-006, DC-007, DC-008, DC-009, DC-010, DC-011
- [ ] 1.3 Mobile test-only production code with its tests: DC-025, DC-026, DC-027, DC-028, DC-029, DC-030
      (`work-model.ts` drops under 300, FE-010 part)
- [ ] 1.4 Backend: DC-012 (`canReadAnnouncement`), DC-014, DC-020 (`isAdminOfAnySeason`), BE-054
- [ ] 1.5 Shared: SH-007 (`dashboardSchema`, `assignmentListItemSchema`), DC-024; DC-016 unused type aliases (Q23)
- [ ] 1.6 Drop `export` from file-local symbols: DC-017 / BE-081
- [ ] 1.7 Config: DC-050 (`AUTH_URL`), FE-052 (redundant `staleTime`, `LIVE_CHECK`), DC-051 (Q17)
- [ ] 1.8 Dormant switches (Q17): DC-013/055, DC-056, DC-057 — with openapi + README text
- [ ] 1.9 Routes without a caller (Q7): DC-060, DC-061 (+ DC-015), DC-062 — route-inventory snapshot,
      openapi, README, shared schemas in the same commits
- [ ] 1.10 Q8 trace of `checkStudentSeat` (DC-022) and `canViewNote` (DC-021): delete, or move to Wave 4
      step 4.4 / 4.12 as a guard; update CLAUDE.md "Roles" to match
- [ ] 1.11 Button legacy variants: codemod the 55 call sites to the mapped names, delete the alias maps
      (FE-071 part 1; render identical by construction)
- [ ] 1.12 Dependencies (Q11): DC-040 (`expo-linear-gradient`), DC-046 (`pg`, `@types/pg`)
- [ ] 1.13 Docs and leftovers: SH-006 (stale CLAUDE.md paragraph), `scripts/smoke.sh` if unused
- [ ] 1.14 Kept on purpose, recorded here: DC-023 (`sentryEnabled` test seam), DC-031, DC-032, DC-058,
      DC-059, DC-063…066 (unless Q7), FE-062. No action by design: BE-051, BE-053, BE-074, BE-075,
      BE-077, BE-078, FE-033, FE-053, FE-054, DB-011a, DB-029a. Covered under their duplicate IDs:
      BE-080 (= DC-020/022/023), FE-070 (= DC-001/003/011/025…030)
- [ ] 1.15 Full verification + UI sweep spot-check (button variants) + wave summary + PR → **STOP**

### Wave 2 — shared foundations (`refactor/wave-2-foundations`)

- [ ] 2.1 ESLint size rules in **warning** mode in `packages/config` (built-in rules, no deps):
      `max-lines` 400 (all lines), `max-lines-per-function` 50 (target 40), `max-depth` 3, `complexity` 15;
      exclude `src/generated`, `prisma/migrations`, `src/docs` data. Record the warning count here
- [ ] 2.2 Split the 4 test files over 400 lines (audit §1.1), so `max-lines` warns on nothing
- [ ] 2.3 Shared season status: BE-022 / SH-002 / FE-014 / BE-043 — constants + predicates in
      `packages/shared/src/enums.ts`, backend `lib/seasons/status.ts`, **all** inline copies replaced (D5)
- [ ] 2.4 Shared audience and admin predicates: SH-003 / FE-016 (`isAlumnusNotStudying`, `useAudience`),
      FE-015 / SH-004 (`isAdminOfSeason` claims predicate, `useIsAdminOfSeason`) — all sites
- [ ] 2.5 Shared types: FE-040, FE-041, FE-042 (`startSeasonResponseSchema`), SH-005 — all sites
- [ ] 2.6 Shared file splits: SH-001 (`import.ts`, `reports.ts` → folders)
- [ ] 2.7 Error-code catalogue: BE-040 / FE-050 in `packages/shared/src/api-error.ts`; type `apiError`'s
      code; replace literals on both sides; BE-029 constants (text unchanged, Q22); poll codes (BE-091 part)
- [ ] 2.8 `ApiError` + one mapping point in `error-handler.ts`; `ForbiddenError` as a subclass;
      `toApiError(refusal)` (BE-030 class part, BE-031); `apiNoContent` (BE-032); worked example: announcements
- [ ] 2.9 Moves to their layer: BE-017 (`quizzes/notify.ts` → lib, `submissions/editable.ts` verdict →
      permissions, `forbidden` → `lib/api-response.ts`)
- [ ] 2.10 HTTP helpers with tests + one worked example each: BE-020 `idParam`, BE-021 `notFound` + loaders,
      BE-02A `parseOr400`, BE-023 `pageOf` + shared cursor schemas
- [ ] 2.11 `requireRole` middleware (BE-025, BE-026) — all sites (messages unchanged)
- [ ] 2.12 Soft-delete fragments `lib/db/live.ts` (`liveUser`, `liveSeason`, `liveAssignment`, `withDeleted`)
      with tests; worked example (DB-024 part, Q3)
- [ ] 2.13 Constants: BE-041 (rate-limit window), BE-042 / FE-051 (time units), BE-044 (notification link
      builders), BE-045 (batch caps)
- [ ] 2.14 Backend plumbing: BE-060 (storage cycle), BE-02C (test helpers), BE-02D (`scripts/lib/db-host.ts`)
- [ ] 2.15 Mobile API layer: FE-032 `apiGet`/`apiSend` (worked example: one hook file), FE-013
      `apiErrorStatus` (all 6 sites), FE-035 query-key factory entries (key identity unchanged), FE-063 `useRole`
- [ ] 2.16 Mobile UI primitives: FE-020 `QueryGate`, FE-021 `useSeasonRoute` + `SeasonRouteGate` (all 10
      season routes), FE-028 `LoadMoreButton` (+ catalogue; label per Q22)
- [ ] 2.17 Mobile helpers: FE-030 `useSchemaErrors`, FE-024 `day-key.ts`, FE-025 `blankToNull` (per-site
      trim kept), FE-023 `countOf`/`people`, FE-022, FE-026 `formatBytes`, FE-027 debounce hook
- [ ] 2.18 FE-031: login on `useSchemaErrors`; drop `react-hook-form` + `@hookform/resolvers` (Q11)
      (after 2.17, which it needs — reason it isn't in Wave 1)
- [ ] 2.19 Full verification + wave summary + PR → **STOP**

### Wave 3 — schema expand (`refactor/wave-3-schema-expand`)

Every step: migration + `rollback.sql` (D6), apply → rollback → apply on the throwaway DB, schema
snapshot updated, `schema.prisma` updated where expressible, data-check script for the owner (D7).

- [ ] 3.0 Verify `CREATE INDEX CONCURRENTLY` under Prisma 7 `migrate deploy` (one statement per file)
      on the throwaway DB; record the pattern as D8 (or use the psql fallback, audit §2.11)
- [ ] 3.1 IDX-1 `SeasonEnrollment(groupId, status)` (DB-008 hot FK)
- [ ] 3.2 IDX-5 `Session(startsAt)` (needed by DB-026 in 4.12)
- [ ] 3.3 IDX-4 open follow-ups partial index (IDX-D3 drop waits for Wave 6)
- [ ] 3.4 IDX-8 + DB-029 composite FK on `AnnouncementPollVote` (parity check script)
- [ ] 3.5 Missing base columns DB-021 / DB-030 (Q4)
- [ ] 3.6 DB-004 / IDX-3 `lower(email)` unique — after the owner's duplicate check on each DB (Q15); optional lowercasing backfill
- [ ] 3.7 DB-014 stored-role CHECK — after `roles:convert --apply` on each DB
- [ ] 3.8 DB-019 invariants: IDX-6, IDX-7, then the CHECKs (`NOT VALID` → `VALIDATE`), each after its violation query
- [ ] 3.9 DB-016 / DB-017 CHECKs, `recurrenceGroupId` → uuid (Q20)
- [ ] 3.10 DB-031 option uniques — only if `applyUpdate`'s write order never holds a transient duplicate
- [ ] 3.11 DB-015 `timestamptz` + `dateOfBirth` → `date` (Q6): small tables first; the large ones after
      the purge (4.2) is live — so this step may move to a Wave 3b after Wave 4 (stated reason: lock size)
- [ ] 3.12 IDX-2 — only if Q14 keeps `GroupStudent`
- [ ] 3.13 DB-012 parity script (read-only) for the owner; DB-028 + DB-022: schema header and SQL-only
      objects documented; living ERD `docs/database/erd.md` created from audit §2.1 and kept current
- [ ] 3.14 DB-011b opt-out table expand (only if Q21 says yes)
- [ ] 3.15 Full verification + wave summary + PR → **STOP** (deploy order: migrations before Wave 4 code)

### Wave 4 — backend per domain (`refactor/wave-4-backend`)

Every domain step also does, for that domain: `ApiError` conversions (BE-030), `idParam` / `notFound` /
`parseOr400` / `pageOf` call sites (BE-020, BE-021, BE-02A, BE-023), soft-delete fragments (DB-024),
transactions out of handlers into `lib/<domain>/` (BE-035), files kept under 300 lines.

- [ ] 4.1 Announcements & polls (reference domain first, to settle the pattern): BE-090, BE-091
- [ ] 4.2 Auth & me: BE-010 (`routes/me/` split), DB-004 single `lower(email)` lookup, DB-020 `tokenHash`
      field rename (`@map`), DB-010 stop writing `StudentProfile.deletedAt` (me.ts), DB-007 purge cron (Q13),
      DB-006 stop writing `userAgent` / device prune (Q13, Q19)
- [ ] 4.3 Users: BE-001 `updateUserInTx`, BE-029 sites, DB-010 (accounts restore)
- [ ] 4.4 Students: BE-014, BE-016 (`lib/students/graduation.ts`), DB-010 (lifecycle), DB-001 seed `year`
      removed; DC-022 guard if Q8 says so
- [ ] 4.5 Groups & enrolment: DB-012 reads moved to `SeasonEnrollment`, mirror writes stopped (Q14);
      BE-073; BE-027 (`ledSeasonIds`, `ledGroupIdsInSeason`, deleted-season filter explicit); BE-02B (optional)
- [ ] 4.6 Seasons: BE-002 (duplicate), BE-003 (end), crud status transitions, start
- [ ] 4.7 Sessions, attendance, check-in: BE-070 (N+1), attendance save and check-in services
- [ ] 4.8 Assignments & submissions: BE-072 (count N+1), BE-028 `liveStudentIds` (+ Q9 fix)
- [ ] 4.9 Quizzes: BE-004 grading / attempts / paper grades / reorder services
- [ ] 4.10 Video quiz: BE-004 part (`lib/video-quiz/answer.ts`)
- [ ] 4.11 Forum: BE-015, BE-024, BE-071 (`canDeleteLoadedComment` + parity test)
- [ ] 4.12 Notes, follow-ups, mentor: DB-026 (bounded Absent lately, pinned by a test first), BE-076
      (optional); DC-021 per Q8
- [ ] 4.13 Notifications & push: BE-052 (`push/tokens.ts` + `push/expo.ts`), BE-044 call sites
- [ ] 4.14 Permission scopes: BE-050 `staffSeasonScope` primitive; role literals → `rbac.ts` predicates
- [ ] 4.15 Reports, engagement, dashboard, exports: BE-005, BE-012, BE-013
- [ ] 4.16 Imports: BE-011
- [ ] 4.17 Events, dev, health, scripts: remaining call sites (BE-02D adoption); BE-006 left as is
- [ ] 4.18 Sweep: no `deletedAt` literal outside `lib/db/live.ts`, no `$transaction` in `routes/`, no
      inline `apiError` with a catalogued code; full verification + wave summary + PR → **STOP**

### Wave 5 — mobile per feature area (`refactor/wave-5-mobile`)

Every area step also: `QueryGate` / `apiGet` / `useSchemaErrors` adoption (FE-020, FE-032, FE-030), moves
the area's files from `src/components` and data-bound `src/design/<domain>` into `src/screens/<area>/`
in kebab-case (FE-017, FE-073), thin route files (FE-011).

- [ ] 5.1 Season overview and lifecycle routes: FE-001 (`seasonOverviewModel`, tiles snapshot first),
      FE-003 (start/end ladders), FE-018 (no placeholder ids)
- [ ] 5.2 Season people: FE-002 (`usePeopleSelection`, reducer tests first)
- [ ] 5.3 Roster import: FE-005
- [ ] 5.4 Forms: FE-006 (assignment, group, event, user, student, session, quiz) — `assignment-form.tsx` under 300
- [ ] 5.5 Quizzes: FE-008 (grade screen), FE-010 (`use-quizzes/` split)
- [ ] 5.6 Forum: FE-009
- [ ] 5.7 Video quiz: FE-004
- [ ] 5.8 Students lists: FE-034 (renames), FE-061 (`studentListCopy`), FE-029 (`SearchFilterRow`),
      FE-010 (`use-students` split)
- [ ] 5.9 Calendar: FE-060 (`calendarBranchFor`), FE-010 (`season-calendars` split)
- [ ] 5.10 Reports & exports: FE-012
- [ ] 5.11 Announcements & polls: FE-080 (`PostForm`, poll-diff rule pinned first), FE-081 (`PollCard`)
- [ ] 5.12 Remaining screens: FE-020 / FE-032 / FE-011 leftovers
- [ ] 5.13 Legacy kit: FE-071 part 2 (`Modal`, `PageTitle`, `Card`, `Badge`, `ShellFrame` users migrated, components deleted)
- [ ] 5.14 Theme tokens: FE-072 (raw palette and text-size classes → tones and `Text` variants);
      extend `design-consistency.test.ts` to ban them
- [ ] 5.15 Layering leftovers FE-017 (`lib → design` imports) + the layer rule written into CLAUDE.md;
      FE-007 kit files left as is (recorded)
- [ ] 5.16 Full verification + **UI sweep** + wave summary + PR → **STOP**

### Wave 6 — schema contract (`refactor/wave-6-schema-contract`)

**Deploy only after Waves 3–5 are live in production. The owner takes a database backup (and the
Q12 archive) on each environment first; a rollback restores columns, not data.**

- [ ] 6.0 Confirm Waves 3–5 deployed; owner backup + archive done (Q12)
- [ ] 6.1 DB-001: drop the 7 dead `StudentProfile` columns, its FK and IDX-D2
- [ ] 6.2 DB-002 path columns (Q18); DB-005 `avatarPath` only if Q18 drops it (contract change)
- [ ] 6.3 DB-003: drop `StudentDocument` and its User relations
- [ ] 6.4 DB-006: drop `RefreshToken.userAgent` (Q19); `DeviceToken.lastSeenAt` + IDX-D4 only if no prune
- [ ] 6.5 DB-010: drop `StudentProfile.deletedAt`
- [ ] 6.6 DB-012: drop `GroupStudent` (+ IDX-D1) and `Group @@unique([id, seasonId])` if unused (Q14)
- [ ] 6.7 IDX-D3 (`MentorFollowUp_dueAt_idx`)
- [ ] 6.8 DB-004 (optional): drop `User_email_key` once IDX-3 serves every lookup
- [ ] 6.9 DB-011b old preference columns (only if Q21)
- [ ] 6.10 ERD (`docs/database/erd.md`) final; full verification + wave summary + PR → **STOP**

### Wave 7 — guardrails (`refactor/wave-7-guardrails`)

- [ ] 7.1 Size/complexity rules → **error**; `no-unused-vars` stays error; a `no-restricted-syntax` rule
      banning a literal `deletedAt: null` outside `lib/db/live.ts`
- [ ] 7.2 Layer boundaries with `no-restricted-imports` (routes ↛ `db/client`; mobile `app/`, `screens/`,
      `design/` ↛ `api-client`/axios; `design/ui|layout` ↛ hooks/store) — `eslint-plugin-boundaries` only if Q10
- [ ] 7.3 Dead-code check: in-repo TS-API script `pnpm check:dead` (or `knip`, Q10)
- [ ] 7.4 Duplication check: `jscpd` with a threshold just above the post-refactor level (Q10)
- [ ] 7.5 Schema conformance test (Q5): base columns per the agreed rule, every FK indexed (minus the
      documented audit-FK exceptions), link tables keyed by their pair
- [ ] 7.6 One command `pnpm check` (lint, typecheck, unit tests, dead-code, size, duplication)
- [ ] 7.7 CI: add `pnpm check` to the existing workflows; triggers per Q24
- [ ] 7.8 `.github/pull_request_template.md` with the definition-of-done checklist
- [ ] 7.9 CLAUDE.md `## Code & Data Standards` (real paths; AGENTS.md if present points to it)
- [ ] 7.10 Prove each guardrail fails on a planted violation (401-line file, unused export, duplicated
      block, route importing `db/client`, model without base columns), then passes once removed
- [ ] 7.11 Phase 4: final verification vs baseline, the >400-line command, dead-code and duplication
      re-runs, `docs/refactor-report.md` → **STOP**

## Wave summaries

_(one paragraph per finished wave)_
