# Refactor: <name> (<date>)

Request, verbatim: "<the owner's words>"

## Status

- Branch `refactor/<name>` in worktree `../space-v2-<name>`, from `main` @ `<sha>`. Nothing pushed.
- Throwaway DB `space-v2-refactor-db` (127.0.0.1:55441, `refactor_test`). No real database touched.

## Baseline (before any change)

| Check | Result (log) |
|---|---|
| `pnpm check` | |
| `pnpm build` | |
| backend integration (throwaway DB) | suites / tests |

## Steps

One concern each. Tick with the evidence: tests run, counts, commit.

- [ ] 1. Characterization test for <behaviour> (passes on the old code)
- [ ] 2. <change> — test: <which>
- [ ] N. Full suite + UI sweep (if mobile changed) + summary → **STOP for review**

## Skipped (D8)

| Item | Why |
|---|---|

## Summary (filled in at the end)

- What changed, in plain words
- Baseline compared with now (counts)
- **Deploy order** (expand migrations → code → contract migrations) and what the owner runs
  (`refactor-checks/` scripts, `db:migrate:deploy`) on each environment
- UI sweep: modules and cells compared, findings
- What to push, and the push commands (CLAUDE.md "Git"); wait for the owner's yes
