# Cutover parity audit (Plan 18, Part 1)

Plan: `docs/superpowers/plans/2026-10-05-plan-18-cutover.md` (Tasks 1.1-1.6).

## Triage summary (filled in by Task 1.4 Step 5)

```
Total rules            1550
PRESERVED  (verified)  ....
DIVERGED   (authorised) ....
DROPPED    (registered) ....
NA         (no v2 counterpart) ....
UNVERIFIED (open findings) ....   <-- must be 0 before Part 2
```

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

- `ledger-A1.tsv`, `ledger-A2.tsv`, `ledger-A3.tsv` - header row only; one agent
  each. Append-only during the sweep.
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
