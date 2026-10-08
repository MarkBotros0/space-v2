# Cutover parity audit (Plan 18, Part 1)

Plan: `docs/superpowers/plans/2026-10-05-plan-18-cutover.md` (Tasks 1.1-1.6).

## Triage summary (Task 1.4, 2026-10-08)

Counts **after** the corrections in `triage-corrections.tsv` (the three ledgers are untouched; the
corrections file is an append-only erratum list applied on top of them). Reference tree for every
"open the file" check: commit `626fcfc`, the commit that added the ledgers. Later commits on this
branch (`1b02272`, `08ff30e`, `e47a246`, `23248c4`, by another agent) fix four defects the audit
found and are not what the ledgers describe.

```
Total rules            1550
PRESERVED  (verified)  851   404 opened by the coordinator and confirmed; 447 not opened
                             (agent claim + automated check that the cited file and line exist)
DIVERGED   (authorised) 541  every authority resolves to a ruling that exists (existence only,
                             not a judgement that it covers that row)
DROPPED    (registered) 113  26 name a resolving authority; 87 are UNAUTHORISED and are
                             PROPOSED as REG-70..REG-117 in DROPPED.md, unsigned
NA         (no v2 counterpart) 45
UNVERIFIED (open findings) 0   <-- must be 0 before Part 2
```

Before triage the ledger read PRESERVED 850, DIVERGED 589, DROPPED 65, NA 46, UNVERIFIED 0.
Net movement: 47 DIVERGED to DROPPED (authority does not resolve), 1 NA to DROPPED (04-R101),
1 DIVERGED to PRESERVED (11-R33). **UNVERIFIED is 0 because every row that failed a check was
resolvable, not because the audit is clean:** no checked row had to be left open, but 447 PRESERVED
rows were not opened and none of the ledgers' claims about v1 could be checked (v1 is not available).
The Part 2 gate is **not** met: 87 unauthorised drops are unsigned and page parity (Task 1.6) is
not done.

### What was checked

| Step | Scope | Result |
|---|---|---|
| 1. Verify PRESERVED | 100% of PRESERVED in 04-attendance (79), 05-groups (58), 08-submissions (36), 09-notes (49), 11-invites-users (40) = 262. Random 10% of the other 588 = 59 rows, `random.seed(20261008)`, pool = PRESERVED rows outside those five specs in file order (A1, A2, A3), `random.sample(pool, 59)`. Citation failures in 10, 13, 15, 17, 18 triggered the 50% re-check: 82 more rows (same seed, pool = PRESERVED rows of those specs not already sampled, `random.sample(pool, round(len(pool)*0.5))` per spec). Plus an automated check that every PRESERVED and DIVERGED citation names a file that exists at `626fcfc` and a line range inside it. | 404 PRESERVED rows opened. 15 citations pointed past end of file (04-R35, 10-R4, R75, R76, 13-R30 to R35, 15-R37, R70, R82, 17-R67, 18-R8). 29 citation fixes in all, each re-verified at the corrected lines (the claim held; the line was wrong), 2 note fixes, 1 authority fix. No PRESERVED row's claim failed outright. |
| 2. DIVERGED authorities | all 589 DIVERGED rows, 231 distinct authority strings, resolved against C1-C12 in `_DECISIONS.md`, X1-X14/X15/X17, the D numbers (or numbered items for specs 03, 05, 07, 15) in each spec's section 10, plan `D-NN.n` and numbered Decisions, and `REG-nn`. | 47 rows (27 authority strings) did not resolve and were moved to DROPPED / UNAUTHORISED: 26 cite a plan/task label ("Plan 8 Task 3", "UNNAMED: Plan 14 Task 6", "Plan 09 Task 2", ...), 14 cite a spec section other than 10 (section 5, 7, 8 or 9), 4 cite `_DECISIONS.md D1` (no such entry), 1 bare `D1`, 1 `CLAUDE.md response envelope`, 1 `R37 fix`. The 26 named authorities on already-DROPPED rows all resolve. |
| 3. NA | 100% of NA in the five domains (15 rows) plus 13 more (28 of 46 in all, against the plan's 10%), each checked by reading the spec rule text. | 1 wrong: 04-R101 (v2 now renders the check-in console for SUPER, a visible change) became DROPPED / UNAUTHORISED. The other 27 are mechanisms (revalidatePath, redirects, helper conventions) with no visible behaviour. 18 NA rows were judged on the ledger note only. |
| 4. UNVERIFIED | none in the ledger | 0 |

Files written by this triage: `triage-corrections.tsv` (81 rows), `triage-sample.tsv` (every row that
was opened and its result, 445 lines), `DROPPED.md` (REG-70 to REG-117 proposed, plus a defects
section). `triage-corrections.tsv` columns: `spec rule old_verdict new_verdict field old_value
new_value reason triage_step register_proposal`; `field` is `citation`, `note`, `authority` or
`verdict+authority`.

### Things the triage found that are not in a ledger row

- **The three `verdict` rows are the header rows** (line 1 of each ledger), not data. No data row
  contains the word. 1550 data rows, no duplicate `(spec, rule)`, and the rule numbers in each
  ledger match the `- **R<n>.**` list in the spec exactly (08-submissions skips R27, as the spec does).
- **Decision-id collisions.** `D-16.x` is defined by both Plan 6 and Plan 17, and `D-13.x` by both
  Plan 14 and Plan 18. Every bare `D-16.x` in the ledger comes from 16-imports (Plan 17's), so they
  resolve, but a bare `D-NN.n` is ambiguous and Plan 18's own `D-13.x` shadows Plan 14's.
- **X16** is referenced by Plan 3, Plan 14 and Plan 16 but has no entry in the roadmap's list of
  rulings; no ledger row cites it.
- **Concurrent fixes.** `1b02272`, `08ff30e`, `e47a246`, `23248c4` fix 08-R45, 08-R20, 11-R60 and
  16-R83 after the ledgers were written. Those ledger rows now describe code that has changed;
  see `DROPPED.md`, "Likely real v2 defects".
- **Known errata from the sweep agents**, applied: 08-R33, R34, R35, R37, R39 (the cited lines were
  the uploads guard and `getStorage`, not the MIME map, key builder or file ordering; the corrected
  lines are in the corrections file), 07-R52 (off by one), 11-R33 (garbled note, and the cited code
  matches v1, so it is PRESERVED), 12-R9 (authority is `-`).

## Rule re-count (2026-10-07)

Counted with `grep -c '^- \*\*R[0-9]*\.\*\*'` per spec in
`docs/superpowers/specs/domains/`. Real total: **1550**, identical to the plan's
figure; every per-spec count matches the plan's table.

| Agent | Spec | Rules |
|---|---|---|
| A1 | 02-seasons | 77 |
| A1 | 03-sessions | 109 |
| A1 | 04-attendance | 102 |
| A1 | 05-groups | 107 |
| A1 | 18-settings | 41 |
| A1 | 19-dashboards | 75 |
| | **A1 subtotal** | **511** |
| A2 | 06-students | 91 |
| A2 | 07-assignments | 88 |
| A2 | 08-submissions | 60 |
| A2 | 09-notes | 90 |
| A2 | 10-notifications | 81 |
| A2 | 11-invites-users | 91 |
| | **A2 subtotal** | **501** |
| A3 | 12-quizzes | 120 |
| A3 | 13-video-quizzes | 83 |
| A3 | 14-forum | 58 |
| A3 | 15-events | 83 |
| A3 | 16-imports | 84 |
| A3 | 17-reports | 110 |
| | **A3 subtotal** | **538** |
| | **Total** | **1550** |

Task 1.3's row-count check uses 1550.

## Environment limitation: v1 is not available

The v1 repository (`jpc-space`) is **not present in the environment where this
scaffold was produced**. Any v1 `file:line` citation (in `DROPPED.md`, in a
ledger note, or in `page-parity.tsv`) can only be checked against what the
specs and plans quote. It has not been verified against v1 source. Task 1.6
Step 1 (the 104-page count) and the Prerequisites `diff -r` of the migrations
directories must be run on a machine that has v1, read-only.

## Files

- `ledger-A1.tsv`, `ledger-A2.tsv`, `ledger-A3.tsv` - one agent each, 1550 rows in all.
  Append-only during the sweep and left untouched by the triage.
- `triage-corrections.tsv`, `triage-sample.tsv` - Task 1.4 outputs (see the summary above).
- `AGENT-BRIEF.md` - the Task 1.2 brief, verbatim. Only the `SPECS` and `LEDGER`
  lines differ per agent.
- `DROPPED.md` - the register (drops, deferrals, divergences), seeded with
  REG-01 to REG-69 from the plan's "Register seed"; the `Rule / page`, `Who
  signed` and `Date` cells are empty until Task 1.5.
- `page-parity.tsv` - header only; Task 1.6 fills in the 104 v1 pages.

## Ledger columns

Tab-separated, one row per rule, no quoting, no embedded tabs or newlines.

| Column | Meaning |
|---|---|
| `spec` | spec filename, e.g. `04-attendance.md` |
| `rule` | rule number, e.g. `R63` |
| `verdict` | `PRESERVED`, `DIVERGED`, `DROPPED`, `NA` or `UNVERIFIED` |
| `v2_citation` | repo-relative `path:line` or `path:start-end` in v2 code; `-` only for `DROPPED` / `NA` |
| `authority` | DIVERGED: the decision id; DROPPED: a decision id or `UNAUTHORISED`; otherwise `-` |
| `note` | one short sentence, under 25 words, no tabs |

A row is a claim about v2 that a reader must be able to check in under a
minute, which is why `v2_citation` is a path and a line number and never a prose
description.

## Triage rule (Task 1.4)

- `PRESERVED` stands only if the citation checks out. Every such row in
  04-attendance, 05-groups, 08-submissions, 09-notes and 11-invites-users is
  sampled, plus a random 10% elsewhere. A failing citation is downgraded to
  `UNVERIFIED` and that agent's other rows in the spec are re-checked at 50%.
- Every `DIVERGED` authority must resolve to a ruling (C1-C12), a cross-plan
  ruling (X1-X17), a spec `D<n>`, a plan `D-NN.n` or numbered Decision, or a
  `REG-nn` row. Otherwise the row becomes `DROPPED / UNAUTHORISED`.
- `NA` rows are re-checked at 100% in the five authorization-bearing domains
  and 10% elsewhere.
- Every `UNVERIFIED` row is a finding; `UNVERIFIED` must be 0 before Part 2.

## Gate

Part 2 does not begin until the ledger is complete (no duplicate `(spec, rule)`,
1550 rows), `UNVERIFIED` = 0, page parity is clean, and the user has signed
`DROPPED.md`.
