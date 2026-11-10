---
name: refactor
description: Use when asked to refactor, restructure, clean up, split, move, rename or tidy code, screens, the API or the database schema of space-v2 (backend, mobile app, shared package), including renaming a column, moving logic into a service, or reorganising files.
---

# Refactoring space-v2

A refactor changes structure, never behaviour: every feature, API contract and user-visible
behaviour keeps working. Production and staging are the owner's. This session touches only a
worktree and a throwaway database.

**Violating the letter of these rules is violating their spirit.** "The owner said get it done
today and push it" does not lift any of them.

## Hard rules

| Rule | Instead of |
|---|---|
| Work in a worktree: `git worktree add ../space-v2-<name> -b refactor/<name> main`, `pnpm install --frozen-lockfile` there, then `bash .claude/skills/refactor/scripts/throwaway-db.sh ../space-v2-<name>` | editing the main checkout; using its `.env` |
| Tests, integration runs and migrations go only to the throwaway DB (`space-v2-refactor-db`, 127.0.0.1:55441) | `space_test` / `space-v2-sweepdb` (shared with the sweep), staging, production |
| Never run a migration, `db:migrate:deploy`, a smoke test or a write against staging or production | "I'll deploy and check it's green" |
| Never push, open a PR, merge to `main` or deploy without asking, naming exactly what goes out. A yes means the branch to `jpc` with the token, then the `origin` mirror (CLAUDE.md "Git") | pushing because the request said "push it" |
| No new dependency without the owner's approval | adding a package to save time |
| Never continue on red; fix, or revert the step | "it's unrelated, I'll note it" |

## Steps

0. **Pin down the request.** If it is vague ("tidy", "clean up"), ask once, listing the readings
   you see. Until you get an answer, do the structure-only reading: no copy, layout, motion or API
   change.
1. **Baseline.** On the untouched branch, run `pnpm check`, `pnpm build` and the backend
   integration suite (throwaway DB), all in tmux with a log in `~/logs/space-v2-<name>-*.log`.
   Record the counts. Anything already red is the owner's to know about before you start.
2. **Plan file.** Write `docs/refactor-<name>.md` from `plan-template.md` (in this skill). Use
   numbered steps, one concern each, with the test each one runs. Update it after every step.
3. **Characterize first.** Before moving logic, pin today's behaviour with a test that passes on
   the old code: a route's responses, a screen's states, a model's outputs. A snapshot is fine.
4. **One step at a time.** Make the change, run the relevant tests, tick the step with its
   evidence, then commit. Each commit holds one concern and ends with the attribution lines.
5. **Skip test (D8).** Do a change if it is mechanical and can't fail on existing data or change
   behaviour. Skip it and list it as "Skipped" in the plan if it needs a check on a real database,
   changes semantics, or rewrites a subtle rule across many call sites. Never leave anything
   half-done.
6. **Database: expand, then contract.**
   - Rename a column with `@map("oldName")`: the code uses the new name, the database keeps the old
     one, and it is safe in any order. That is the default and usually the end. A physical rename
     needs a full expand/contract: add the new column, write both, backfill, switch reads, then drop
     the old one in a later deploy. Each is its own migration. Otherwise it needs a downtime window
     the owner agrees to. Without that agreement, keep `@map` and list the physical rename as
     Skipped.
   - A drop is a contract migration that deploys after the code that stops using the column.
   - Edit `schema.prisma`, then run `pnpm --filter @space/backend db:generate`.
   - Every migration has a `rollback.sql` that ends by deleting its own `_prisma_migrations` row.
     Prove it with `bash .claude/skills/refactor/scripts/cycle-migration.sh <worktree> <migration>`.
   - Use `BEGIN; … COMMIT;`, except a `CONCURRENTLY` statement, which goes alone in its own file.
   - A data check a real database needs ships as a read-only script in
     `apps/backend/scripts/refactor-checks/` for the owner to run.
   - Index a foreign key or filtered column you add. Don't add an index the refactor didn't call
     for: list it as a finding. Then run `db:erd` and update the schema snapshot.
7. **Mobile moves.** Use `node .claude/skills/refactor/scripts/move-mobile.mjs apps/mobile <mapping> --dry`,
   then run it without `--dry` (it uses `git mv` and rewrites every import, including in tests).
   Typecheck and run `jest --findRelatedTests`, plus the folder-scanning tests
   (`design-consistency`, `sweep-rules`, `calm-motion`), after each batch.
8. **UI sweep, for any change under `apps/mobile`.** Build a release APK of the branch and one of
   the baseline, then run the `ui-sweep` skill on both, with fake seeded users on the throwaway DB.
   Sweep the modules whose screens changed, on the `small-1.3-3btn-light` and
   `iphone-1.0-gesture-dark` cells. Run the full matrix only for kit or shell changes. Diff the shots
   pixel by pixel and look at every one that differs. Restart the emulator between modules; it leaks
   memory. If the sweep can't fit the time asked for, say so; don't skip it silently.
9. **End of the work.** Run the full suite again (check, build, integration). Then write the plan's
   summary: the branch, what changed, the baseline compared with now, the deploy order, what the
   owner must run, and every skipped item. **Stop for review.**

## Red flags: stop

- About to type `db:migrate:deploy`, `migrate dev`, `db push`, `vercel`, `git push` or `gh pr create`
- A command whose database host is not 127.0.0.1:55441
- "The existing tests cover it", said before you have looked at what they assert
- "I'll fix the failing test after the next step"
- One commit that both moves code and changes what it does
- A `rollback.sql` that has never been run

## Common mistakes

| Mistake | Fix |
|---|---|
| Dropping a column in the same deploy as the code change | Ship `@map` or stop reading it first; drop it in a later contract migration |
| Two `CREATE INDEX CONCURRENTLY` in one file | Postgres runs them as one transaction and fails: one per file |
| Moving a file by hand and fixing imports one by one | Use `move-mobile.mjs`; it also rewrites `jest.mock` paths |
| Moving a view out of `src/design` and failing design-consistency | Kit sizes belong in `src/design`: keep a presentational widget there |
| A "tidy" that changes copy or layout | That is a UI change: ask the owner, then sweep it |
