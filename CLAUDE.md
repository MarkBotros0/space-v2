# space-v2 — Claude Context

Mobile-first rebuild of JPC Space (`D:\Projects\JPC\jpc-space` is v1 and still runs).

## Where to look

This file holds what applies everywhere. The rest loads or is read only when needed:

| Working on | Read |
|---|---|
| anything under `apps/backend/` | `apps/backend/CLAUDE.md` (loads by itself there): code map, envelope, env, API surface, deployment |
| anything under `apps/mobile/` | `apps/mobile/CLAUDE.md` (loads by itself there): feature map, navigation, data fetching, design kit, UI-sweep rules |
| a feature's behaviour | its owner ruling in `docs/rules/` (table below): **read it before changing that feature** |
| a domain's v1 behaviour | `docs/superpowers/specs/domains/` (seasons, sessions, attendance, groups, students, …) |
| the schema | `apps/backend/prisma/schema.prisma`, `docs/database/erd.md` |
| why the code is shaped this way | `docs/refactor-report.md`, `docs/refactor-plan.md`, `docs/refactor-audit.md` |

**Owner rulings** (`docs/rules/`, wording as the owner set it):

| Rule file | Covers |
|---|---|
| `docs/rules/community-model.md` | one active role, the season lifecycle (End, locked finished seasons), who a roster lists (`seasonParticipant`), `activeSeasonId`, former staff, rate limits never sign out |
| `docs/rules/roles.md` | derived role claim, seat writes and lock order, own record, graduation, `roles:convert` |
| `docs/rules/community-wide-seasons.md` | `isCommunityWide`, runs alone, the alumni picker, `isStudyingAlumnus` |
| `docs/rules/graduating-seasons.md` | `graduatesOnPass`, End graduates, the override |
| `docs/rules/mentor.md` | the mentor's nav, Home, follow-ups, Absent lately |
| `docs/rules/announcements.md` | who posts and reads, unread, notifications, polls |
| `docs/rules/quiz-results.md` | results held until released (`studentAttemptStatus`) |
| `docs/rules/assignments.md` | parts (video, essay, forum; one forum), watched at 90%, Submit only when every part is done, essay review one by one, whole season only, reminders on the backend's own schedule |
| `docs/rules/student-work.md` | the student's My work tab, season page and Home |
| `docs/rules/season-overview.md` | the season page, People card, putting people into a season |
| `docs/rules/people-signin-emails.md` | Community tab, students list, sign-in, inviting, emails |
| `docs/rules/home-checkin-offline.md` | Home order and tiles, the session card, check-in hour, offline, pull to refresh |
| `docs/rules/settings-account.md` | Profile, notification settings, sign out and delete account |
| `docs/rules/motion.md` | calm motion: no springs, what may animate |

Rules that bite anywhere: the role claim is derived from season rows, never the stored role
(`roles.md`); a roster uses `seasonParticipant`, not `status: "ACTIVE"` (`community-model.md`); finished
seasons never reopen; seat writes lock Season, then People, then rows.

## Layout

- `apps/mobile` — Expo + expo-router, React Query, Zustand, tokens in expo-secure-store
- `apps/backend` — Express 5, Prisma 7, ports v1's `/api/v1`
- `packages/shared` — Zod contracts. **No build step**; `main` is `src/index.ts`
- `packages/config` — eslint, tsconfig, prettier

## Hard constraints

- **`D:\Projects\JPC\jpc-space` is READ-ONLY.** It is the reference
  implementation and the source of truth for behaviour — read it constantly,
  never write to it. No edits, no refactors, no "small fixes", no new files,
  no `git` operations in that repo. If something there looks wrong, report it;
  do not touch it.
- **The whole product is being migrated into this monorepo** — `apps/mobile`
  and `apps/backend` together replace jpc-space entirely, including the admin
  and super surfaces. jpc-space is retired once that is done, not before.
- **Everything goes in the mobile app.** All 104 of v1's pages, admin and
  super included, become React Native screens. There is no `apps/admin`.
- **The database serves v2 only (owner ruling 2026-11-04).** The schema
  freeze that kept the database shareable with v1 (`_DECISIONS.md` C1) is
  lifted: v2 owns the schema and may add migrations. v1 must no longer write
  to this database. `prisma/migrations/` starts with v1's history; add new
  migrations after it (`pnpm --filter @space/backend db:migrate:deploy`
  applies them through `prisma.config.ts`). Keep migrations additive unless a
  destructive change is explicitly planned, and say in the commit which
  environments they were applied to.
  Migration rules: `apps/backend/CLAUDE.md` and "Code & Data Standards" below.
- **Passwords are bcryptjs.** Existing hashes are bcrypt; any other algorithm
  locks out every user.
- **Tokens must stay v1-compatible:** `jose` HS256, secret `AUTH_SECRET`
  (same value as v1), audience `jpc-mobile`, 900s TTL, subject `String(userId)`.
- `.npmrc` sets `shamefully-hoist=true` — Metro cannot resolve pnpm's nested symlinks.
- **No `@/` path alias in either app.** The backend can't use one because `tsc`
  won't rewrite path aliases with `rootDir: "../.."` (needed so it can also
  compile `packages/shared`). The mobile app never had one: an alias that
  Jest resolves but Metro doesn't would pass tests while breaking the running
  app. Both apps use relative imports — keep it that way.
- **Commits are authored as `jesusprojectcommunity`, and pushes go to both
  remotes.** See "Git" below — a commit by any other author never deploys.

## Commands

```
pnpm dev / build / lint / typecheck / test / test:unit
pnpm check          # lint, typecheck, test:unit, check:dead, check:size, check:docs (what CI runs on a PR)
pnpm --filter @space/backend db:generate
```

**Formatting is Prettier, enforced.** `pnpm lint` runs `pnpm format:check` (ts, tsx, js, mjs,
cjs, json) before ESLint, so unformatted code fails lint and CI. Run `pnpm format` before
committing. The one config is `packages/config/prettier` (printWidth 120), loaded by the root
`prettier.config.js`; `.prettierignore` skips generated output and Markdown. The repo-wide
format commit is in `.git-blame-ignore-revs`.

Test and build details: `apps/backend/CLAUDE.md` "Tests".

## Code & Data Standards

Set by the whole-app refactor (`docs/refactor-plan.md`, summaries per wave; `docs/refactor-report.md`).
`pnpm check` (lint, typecheck, unit tests, `check:dead`, `check:size`, `check:docs`) holds the mechanical ones and
runs on every pull request (`.github/workflows/unit-tests.yml`); `.github/pull_request_template.md`
is the definition of done.

- **Size.** 400 lines per file and nesting depth 3 are lint errors (`packages/config/eslint/index.js`);
  `pnpm check:size` (`scripts/check-size.mjs`) applies the 400 lines to every tracked code file.
  Function length (50) and complexity (15) stay warnings: getting them to zero needs refactors the
  owner chose to skip (D8). `splitRecords` keeps depth 4 under a named `eslint-disable`.
- **Dead code.** `pnpm check:dead` (`scripts/check-dead.mjs`) fails on an export no other file names;
  delete it or drop the `export`. `scripts/check-dead.allow` lists the few that must stay, with why.
- **Backend layers.** A route handler parses, gates and answers; a transaction lives in a
  `lib/<domain>/` service (lint bans `$transaction` under `src/routes/`), and a refusal below the route
  is a thrown `ApiError` (`lib/api-error.ts`). Shared reads are named selects and loaders in
  `lib/queries/`. Use `idParam`, `notFound`, `parseOr400` and `pageOf` where the message is theirs.
- **Soft delete.** User, Season and Assignment only. Filter with `liveUser` / `liveSeason` /
  `liveAssignment` (`lib/db/live.ts`); lint bans a literal `deletedAt: null` inside a `where`.
  `withDeleted` and `deletedOnly` name the paths that must see deleted rows.
- **Mobile layers.** `app/`, `src/screens` and `src/design` never import axios,
  `lib/api-client` or `lib/api-request` (lint); data goes through `src/hooks/` with `apiGet` /
  `apiSend`. A screen's model or state machine is pure and tested apart (`overview-model.ts`,
  `use-people-selection.ts`, `use-poll-draft.ts`, `calendar-branch.ts`). Files live by feature in
  `src/screens/<feature>/`, kebab-case; `src/design/` is only the domain-free kit and lint stops it
  importing hooks, the store or screens (`apps/mobile/CLAUDE.md` "Where a new file goes").
- **Schema.** `src/__tests__/schema-conformance.test.ts` holds `createdAt` / `updatedAt` on every model
  (append-only rows and links listed), an index on every foreign key (the audit trail to User and
  DB-008's small tables listed) and link tables keyed by their pair; `schema-snapshot.test.ts` and
  `erd.test.ts` hold the database itself and `docs/database/erd.md`. Integer ids and
  PascalCase/camelCase stay (Q1, Q2).
- **Query indexes.** A new query that filters or sorts on a non-key column of a table that grows
  (sessions, attendance, submissions, notifications, enrolments…) adds a matching index in its own
  migration, leading with the equality columns and then the sort or range one (e.g.
  `Session(startsAt)`, `SeasonEnrollment(groupId, status)`). A filter that targets a small subset of
  rows uses a partial index, noted on the model as `// SQL-only`. Don't add an index another one
  already covers by its leading columns: Wave 6 dropped two like that.
- **Migrations.** One concern per migration, `BEGIN; … COMMIT;` unless it is `CONCURRENTLY`, which
  goes one statement per file (D10). A `rollback.sql` beside it, cycled apply → rollback → apply on a
  throwaway database. A data check a real database needs first ships as a read-only script in
  `apps/backend/scripts/refactor-checks/`. A contract migration (a drop) deploys after the code
  that stops using the column.
- **Claude Code hooks** (`.claude/settings.json`, scripts in `.claude/hooks/`) hold every Claude session
  to these rules, whoever drives it: after each edit Prettier fixes the file and ESLint's errors go back to
  Claude; before a command or write they refuse `prisma migrate dev` / `reset` / `db push`, printing a
  secret or `.env`, writing to jpc-space, force-push, `vercel deploy`, editing `.env`, `src/generated`
  or a committed migration; when Claude finishes, `check:size`, `check:docs`, `check:dead` and the
  typecheck of each touched app run, and a failure sends it back to fix. `pnpm check` in CI covers
  everyone else.
- **Known gaps (D8, kept on purpose).** No duplication check (`jscpd` not approved); the irregular
  form validators and state ladders; 53 `apiClient` calls that don't fit `apiGet` / `apiSend`; DB-012, DB-014, DB-018, DB-026, DB-031, BE-050. The full list is in each
  wave's "Skipped (D8)" in the plan.

## Git

Since 2026-11-06 the project lives on the **`jesusprojectcommunity`** account.

- **Remotes.** `jpc` = `jesusprojectcommunity/space-v2` — Vercel deploys the
  backend from its `main`. `origin` = `MarkBotros0/space-v2`, the old home and
  PR history, kept as a mirror. Push every `main` change to **both**.
- **Commit author.** Commits are authored as `jesusprojectcommunity
  <353095907+jesusprojectcommunity@users.noreply.github.com>`, set in this
  repo's local git config (every worktree shares it). Don't override it:
  Vercel's Hobby plan **blocks any deployment whose commit author isn't the
  account owner** ("the commit author doesn't have permission to create
  deployments for this project"), and commits by `MarkBotros0` were blocked.
- **Pushing.** `gh` holds several accounts and the active one drifts; a wrong
  one fails with a misleading `Repository not found`. Pass the token for the
  one command rather than switching globally, then mirror as `MarkBotros0`:
  ```
  GH_TOKEN=$(gh auth token --hostname github.com --user jesusprojectcommunity) git push jpc HEAD:main
  gh auth switch --hostname github.com --user MarkBotros0 && git push origin HEAD:main
  ```

## Deployment

A push to `main` on `jpc` deploys the backend to production (Vercel `jesusprojectcommunity/jpc-space-be`).
Details, the database and the variables: `apps/backend/CLAUDE.md` "Deployment".

## Docs

- Community model: `docs/superpowers/specs/2026-11-06-community-model-design.md`
- Design: `docs/superpowers/specs/2026-08-20-space-v2-monorepo-design.md`
- Plan: `docs/superpowers/plans/2026-08-20-space-v2-scaffold.md`
- API port plan: `docs/superpowers/plans/2026-08-20-space-v2-api-port.md`
- Migration roadmap (18 plans, execution order, cross-plan rulings X1–X17):
  `docs/superpowers/plans/2026-08-24-migration-roadmap.md`. Plan files are
  `docs/superpowers/plans/2026-10-05-plan-NN-*.md`; plan number = execution
  order, run 1 → 18.
- Domain specs: `docs/superpowers/specs/domains/`; refactor: `docs/refactor-report.md`.
- `pnpm check:docs` fails when a path written in a `CLAUDE.md` or `docs/rules/` file no longer exists.
