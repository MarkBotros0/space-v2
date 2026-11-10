# Whole-app refactor — final report (2026-11-10)

The plan, every step's evidence and each wave's summary are in `docs/refactor-plan.md`; the findings
are in `docs/refactor-audit.md` and `docs/refactor-audit/`. This page is the end state, how it compares
with the baseline, what the owner still has to do, and every finding left alone on purpose.

## Branches

Each wave is one branch built on the one before. Waves 0–4 are fast-forwarded into local `main`
(`84a50069`); Waves 5–7 are not merged. **Nothing is pushed.**

| Wave | Branch | Tip | State |
|---|---|---|---|
| 0 safety net | `refactor/wave-0-safety-net` | `dc3793dc` | in local `main` |
| 1 dead code | `refactor/wave-1-dead-code` | `f595762e` | in local `main` |
| 2 shared foundations | `refactor/wave-2-foundations` | `d2a9ef88` | in local `main` |
| 3 schema expand | `refactor/wave-3-schema-expand` | `ac0f4306` | in local `main` |
| 4 backend per domain | `refactor/wave-4-backend` | `84a50069` | in local `main` |
| 5 mobile per feature area | `refactor/wave-5-mobile` | `79438f0f` | branch only |
| 6 schema contract | `refactor/wave-6-schema-contract` | `779f2027` | branch only |
| 7 guardrails | `refactor/wave-7-guardrails` | this report | branch only |

## Baseline against the end state

Baseline: `main` @ `4ab858a3`, 2026-11-09, before any change. The tree also gained the polls feature and
the merged redesign branches over the same period, so file counts are not the refactor alone.

| Check | Baseline | Now (log `~/logs/space-v2-refactor-final.log`) |
|---|---|---|
| `pnpm lint` | pass, 0 warnings (no size rules then) | pass, 0 errors; 61 backend + 217 mobile warnings, all `max-lines-per-function` / `complexity` (kept as warnings, D8) |
| `pnpm typecheck`, `pnpm build` | pass | pass |
| Unit tests (shared / backend / mobile) | 326 / 529 / 2,269 | 340 / 579 / 2,363 |
| Backend integration (throwaway DB) | 127 suites / 1,545 tests (`main`) | 137 suites / 1,587 tests, 4 snapshots |
| Files over 400 lines | 4 (all tests) | 0 (`pnpm check:size`, 1,532 tracked code files) |
| Exports no other file names | 119 fully dead + 339 file-local (audit) | 0 (`pnpm check:dead`; 5 allowed with a reason) |
| Prisma models / enums / migrations | 36 / 15 / 35 | 38 / 15 / 53 (polls added 3 models; Wave 6 dropped `StudentDocument`) |
| CI | both workflows manual only | `pnpm check` on every pull request; integration still manual |
| Device UI sweep | not run | see "UI sweep" below |

## Guardrails now in place (Wave 7)

- `max-lines` 400 and `max-depth` 3 are lint errors; `pnpm check:size` covers every tracked code file.
- Backend lint bans a literal `deletedAt: null` inside a `where` outside `lib/db/live.ts`, and
  `$transaction` under `src/routes/`.
- Mobile lint bans axios, `lib/api-client` and `lib/api-request` in `app/`, `src/screens`,
  `src/components` and `src/design`.
- `pnpm check:dead` (`scripts/check-dead.mjs`, TypeScript compiler API, no new dependency).
- `src/__tests__/schema-conformance.test.ts`: base columns, an index on every foreign key, link tables
  keyed by their pair, each with named exceptions.
- `pnpm check` = lint, typecheck, unit tests, `check:dead`, `check:size`; `.github/pull_request_template.md`;
  CLAUDE.md `## Code & Data Standards`.
- Each one was shown failing on a planted violation and passing once it was removed (step 7.9).

## For the owner

1. **Review and push.** One PR per wave, in order. Push commands are in CLAUDE.md "Git"; nothing has
   left this machine.
2. **Deploy order.**
   - Run `pnpm --filter @space/backend check:wave-3` against each environment, and deploy only if
     nothing is BLOCKED (TimeZone must be UTC; no case-duplicate emails).
   - Run Wave 3's migrations (`db:migrate:deploy`), then deploy the Wave 4 and Wave 5 code. Wave 4 brings
     one device per person, so anyone signed in on two devices is signed out of one.
   - Wave 6 goes the other way: **deploy its code first, then its migrations**. A running build whose
     client still knows a dropped column fails on reads of that model. The dropped columns' and table's
     data is lost (D9).
3. **Rotate the leaked secrets** if not done: `STG_DATABASE_URL` and the main checkout's `AUTH_SECRET`
   (printed into a session on 2026-11-09).
4. **FE-017 / FE-073.** These were skipped because they collided with the redesign 02–05 branches. Those
   branches are merged now, so the reason is gone. They stay skipped unless you ask for them.
5. **Duplication check.** Not added because `jscpd` was not approved (Q10). Say so if you want it.

## Every finding left alone on purpose (D8 and conditions)

D8 (owner, 2026-11-09): skip what needs a check on a real database, changes semantics, or rewrites a
subtle rule across many call sites. Every skipped item stays in the audit as a known gap, and none is
half-done.

| Wave | Finding | Why it was left |
|---|---|---|
| 2 | FE-015 / SH-004 shared season-admin predicate | the client rule is stricter than the backend's (ruling C7); the two exact client copies were merged instead |
| 2 | non-adjacent role checks; `roster/import`'s season lookup; the irregular forms | each differs from the helper's rule |
| 3 | DB-014 | CLAUDE.md: no migration may change `User.role` |
| 3 | DB-019 enrolment-coherence CHECKs | semantics |
| 3 | DB-019 `JpcEvent endDate >= date` | `endDate` is the end day's org midnight; a valid same-day timed event would fail it |
| 3 | DB-017 `QuizQuestion.correctIndex` CHECK | the publish route's R24 re-check and its test rely on that state |
| 3 | DB-017 `recurrenceGroupId` → uuid | the ids aren't UUIDs |
| 3 | DB-018 | the limits would have to move together with Zod |
| 3 | DB-031 option uniques | `applyUpdate` passes through transient duplicates; it needs a DEFERRABLE constraint |
| 4 | DB-012 read switch | moving 7 reads off `GroupStudent` is semantics-sensitive (Q14) |
| 4 | DB-026 | a bounded query changes the result |
| 4 | BE-050 | authorization scopes across domains |
| 4 | BE-052, BE-076, BE-02B, BE-044 (link constants) | slow or subtle for little gain |
| 4 | BE-027 variants that differ; batching the last-two-marks read | different rules or messages |
| 4 | left inline | compound-id 400s, events' 400 "Season not found.", the exports `?format` guard, parses answering the first Zod issue, the dev switch's mocked read |
| 4 | `splitRecords` depth 4 | named lint exception |
| 5 | FE-004 player part | YouTube timing |
| 5 | FE-017, FE-073 | see "For the owner" 4 |
| 5 | FE-071 part 2, FE-072 | visual changes the redesign plans own |
| 5 | FE-007 | — |
| 5 | 53 irregular `apiClient` calls | no schema, blobs or custom config; they don't fit `apiGet` / `apiSend` |
| 5 | irregular form validators and long form bodies; state ladders with combined conditions, error-first order or data narrowing | each differs from the helper |
| 6 | DB-012 table drop, DB-005, DB-011b | semantics |
| 6 | IDX-D4 | kept: the device prune reads `lastSeenAt` |
| 7 | `max-lines-per-function`, `complexity` stay warnings | reaching zero needs the refactors skipped above |
| 7 | duplication check | `jscpd` not approved (Q10) |

## UI sweep

Earlier waves had no device sweep: Waves 1–2 had no emulator, and Wave 5's was skipped by the owner. On
2026-11-10 the owner asked for every missing sweep to run after the last wave. The result is recorded
below.

_Pending: filled in once the sweep has run._
