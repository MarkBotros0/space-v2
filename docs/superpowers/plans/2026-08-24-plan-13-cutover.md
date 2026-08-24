# Plan 13 — Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **This plan contains operator steps that no agent may take.** Every step in
> Part 3 marked **[USER]** touches production, the live database or the v1
> deployment. An agent executing this plan stops at those steps, reports, and
> waits. There is no exception, no "it's just a read", no "the window is
> closing".

**Goal:** retire `jpc-space`. When this plan is done, v1 serves nothing, the
schema freeze imposed by ruling **C1** is lifted and every defect it deferred
has either landed or been recorded as deliberately dropped, and every numbered
rule in the seventeen domain specs is in one of exactly three states:
**preserved** (with a v2 `file:line` a reader can check), **deliberately
diverged** (with the decision that authorised it), or **explicitly dropped**
(with a register entry). A rule with no citation is a finding, not a pass.

**Architecture:** three parts, executed strictly in order, with a hard gate
between each.

- **Part 1 — Parity audit.** Three read-only agents sweep 1,475 numbered rules
  across the seventeen specs and produce one ledger row per rule. The
  coordinator triages. Nothing in Part 2 begins until the ledger is complete
  and the drop register is signed by the user, because a rule discovered late
  is a migration discovered late.
- **Part 2 — Migration thaw.** Seventeen migrations, each authored **now**,
  each applied **only** in Part 3. Authored means: written to
  `apps/backend/prisma/migrations-cutover/`, generated offline with
  `prisma migrate diff` against two schema *files* — never against the
  database — and rehearsed against a restored copy. Nothing in this part
  connects to the shared database with intent to write.
- **Part 3 — Switchover runbook.** A timed, ordered window with a
  **go/no-go gate** before the first irreversible act, a named **point of no
  return**, a per-step rollback up to that point, a stated soak with stated
  metrics, and a decommission that the user performs.

**Tech Stack:** Express 5, Prisma 7 (`src/generated/prisma`), PostgreSQL, Zod,
jest + supertest integration suite against the shared staging database; Expo
SDK 54 / expo-router 6, React Query 5, RNTL 13.

**Spec:** all seventeen domain specs in
`docs/superpowers/specs/domains/`, the twelve rulings in
`docs/superpowers/specs/domains/_DECISIONS.md` (**C1 is the subject matter of
this plan**; C2, C3, C7, C9, C11 and C12 each supply a task), `CLAUDE.md`, and
`docs/superpowers/plans/2026-08-24-migration-roadmap.md` § Plan 13 — which
fixes the scope at *parity audit, migration thaw, switchover* and nothing
wider. Specs and plans are **cited, never restated**.

---

## Global Constraints

These are not advice. Each one has a failure mode that ends with data loss in
a production database that belongs to a real organisation.

- **`D:\Projects\JPC\jpc-space` is READ-ONLY — for the coordinator, for every
  agent this plan dispatches, and for every step of the runbook.** Read it
  constantly; never write to it, never create a file in it, never run `git` in
  it. The runbook step that stops v1 serving traffic is an **operator action on
  the deployment**, performed by the user (Part 3, step R14) — it is not an
  edit this plan makes to that repository. If something in v1 looks wrong,
  report it; do not touch it.
- **No migration is applied during normal development. Ever.** This plan is the
  one place in the repository where a migration may be *authored*. Authored
  migrations live in `apps/backend/prisma/migrations-cutover/`, which Prisma
  does not read, and are moved into `apps/backend/prisma/migrations/` by the
  user inside the window (step R9). **`prisma migrate dev`, `prisma db push`
  and `prisma migrate reset` are never run against the shared database — not
  in Part 1, not in Part 2, not in Part 3, not "just to check".** The only
  command that ever applies a migration is `prisma migrate deploy`, run once,
  by the user, at step R10, after a verified backup, after v1 has stopped
  writing.
- **Never print a secret.** `AUTH_SECRET`, `DATABASE_URL`, `GMAIL_APP_PASSWORD`,
  refresh tokens, invite tokens, bcrypt hashes, Expo push tokens and API keys
  are referenced **by name only** — in this document, in every command in it, in
  every agent report, in every log line, and in every message to the user. A
  runbook step that needs a credential says *which* credential; the user
  supplies it out of band. `psql "$DATABASE_URL"` is acceptable because the
  value is never expanded into a transcript; `echo $DATABASE_URL` is not.
- **Integration tests touch only rows they created.** Every fixture row carries
  `space-v2-test-` in a unique, queryable column (`User.email`, `Season.code`,
  and from Plan 10 onward `JpcEvent.title`). `cleanupTestData` filters on that
  prefix and nothing else.
- **Integration tests cannot run concurrently.** `cleanupTestData` is
  prefix-global, so a second suite deletes the first one's fixtures mid-run.
  **Every command in this plan that runs them is serial:**
  `npx jest --config jest.integration.config.js --runInBand --testPathPattern integration`.
  Agents write tests; they do not run them. The coordinator runs them.
- **The staging database contains real students.** Any unscoped list assertion
  confines itself to fixture rows (`?q=space-v2-test-`). Never assert an exact
  length on an unfiltered list. Never paste a real note body, a real student
  name, or a real email address into this repository, a commit message, a test
  fixture or an agent report.
- **Token compatibility with v1 is a hard constraint while both run** — same
  `AUTH_SECRET` value, audience `jpc-mobile`, HS256 via `jose`, subject
  `String(userId)`, the same claim names (`role`, `seasonAdminIds`,
  `groupLeaderIds`, `activeSeasonId`, `graduationYear`) and the same TTLs
  (access 900s, refresh 30d). **It is released only after v1 has stopped
  serving `/api/v1` and the soak has passed** — step R20, not before. What
  changes at that point is enumerated in § "Releasing token compatibility".
- Response envelope `{ data }` / `{ error: { code, message } }` via
  `apiOk`/`apiError`. Value imports from shared use the relative path
  `"../../../../packages/shared/src/index"` in route files (the `rootDir` emit
  trap in `CLAUDE.md`); `import type` may use the package name.
- `src/docs/openapi.ts` changes in the **same commit** as the route it
  documents.

---

## Prerequisites

- [ ] **Plans 1–12 are complete and merged to `main`.** At the time this plan
  was written only plans 01–10 exist in `docs/superpowers/plans/`; Plan 11
  (reports & exports) and Plan 12 (imports) are unwritten. **Plan 13 does not
  start until they are written and executed.** Two migrations here (M9's export
  audit, M11's `ImportBatch`) exist to serve endpoints those plans build; if
  the plans do not exist, the migrations have no consumer and applying them is
  DDL for its own sake.
- [ ] **`pnpm turbo lint typecheck test:unit build` is green on `main`**, and
  the full serial integration suite is green. Record the suite counts — Part 3
  compares against them.
- [ ] **`docs/superpowers/cutover/2026-08-24-notifications-push.md` is
  reconciled.** Plan 9 instructs its implementer to write the `DeviceToken` and
  `Notification.entityType`/`entityId` migrations into that file. If it exists,
  **M4 and M10 below are a reconciliation of it, not a second authoring** —
  diff them, keep whichever is more correct, and delete the duplicate. If it
  does not exist, author them here. A second `DeviceToken` migration is exactly
  the drift this plan exists to close.
- [ ] **A restorable copy of the production database exists and has been
  restored at least once**, into a separate database the team may destroy. Part
  2's rehearsal (Task 2.18) runs there. Nothing in Part 2 is credible without
  it.
- [ ] **The user has named the maintenance window** and the organisation has
  been told. The window is not "whenever the code is ready".

---

## What this plan is not

Stated because each of these has been mistaken for cutover work before:

- It is **not** a feature plan. No screen is built here. If the parity audit
  finds a missing screen, that is a finding and a follow-up plan, not a task
  appended to this one.
- It is **not** the place to relitigate a ruling. Where a domain spec's §10
  recommendation contradicts `_DECISIONS.md`, the ruling wins and this plan
  records the conflict rather than resolving it silently. There is one such
  conflict and it is named in D-13.6.
- It is **not** authorised to fix v1. Every live v1 defect the specs record —
  the invite pair, `ChangeMe123!`, the recurrence corruption, the upload path
  traversal — belongs to jpc-space's owner. This plan removes v2's *dependence*
  on the broken behaviour and, where the data is shared, cleans the *data* in
  the window. It never edits that repository.
- It is **not** allowed to widen the migration set on the day. A migration
  discovered during the window is a **no-go**, not a hotfix. See the gate at
  R8.

---

# Part 1 — Parity audit

**The question this part answers, per rule:** *is there a line of v2 that does
what this rule describes, and if not, who decided that?*

1,475 numbered rules (`R1…`) are distributed across the seventeen specs:

| Agent | Specs | Rules | Theme |
|---|---|---|---|
| **A1** | `02-seasons`, `03-sessions`, `04-attendance`, `05-groups`, `18-settings` | 436 | Season, calendar, attendance, groups, settings |
| **A2** | `06-students`, `07-assignments`, `08-submissions`, `09-notes`, `10-notifications`, `11-invites-users` | 501 | People, work, pastoral, identity |
| **A3** | `12-quizzes`, `13-video-quizzes`, `14-forum`, `15-events`, `16-imports`, `17-reports` | 538 | Assessment, engagement content, data in and out |

The partition is by theme, not by size, so an agent holding domain 5 also holds
domain 4 (which depends on it) and an agent holding domain 10 also holds domain
8 (whose missing notification is domain 10's enum value). Cross-domain rules do
not straddle two agents.

### Task 1.1: Prepare the ledger (coordinator)

**Files:**
- Create: `docs/superpowers/audits/2026-cutover/README.md`
- Create: `docs/superpowers/audits/2026-cutover/ledger-A1.tsv` (header row only)
- Create: `docs/superpowers/audits/2026-cutover/ledger-A2.tsv` (header row only)
- Create: `docs/superpowers/audits/2026-cutover/ledger-A3.tsv` (header row only)
- Create: `docs/superpowers/audits/2026-cutover/DROPPED.md` (the drop register, empty)

- [ ] **Step 1: Create the ledger files with exactly this header**

```
spec	rule	verdict	v2_citation	authority	note
```

Tab-separated, one row per rule, no quoting, no embedded tabs or newlines in
`note` (an agent that needs a newline writes `; ` instead). TSV rather than
markdown because 1,475 rows in a markdown table is unreviewable and because
`sort`, `cut` and `awk` are the triage tools.

- [ ] **Step 2: Write `README.md`**

It states the column meanings (Task 1.3), the triage rule (Task 1.4), that the
ledger is append-only during the sweep, and that **a row is a claim about v2
that a reader must be able to check in under a minute** — which is why
`v2_citation` is a path and a line number and never a prose description.

- [ ] **Step 3: Write the `DROPPED.md` skeleton**

```markdown
# Drop register — rules v2 does not implement

Every row here is a capability the organisation had in v1 and will not have in
v2. This file is signed off by the user before Part 2 begins. Nothing is
dropped by an engineer alone.

| Rule | Spec | What v1 did | Why it is dropped | Who signed | Date |
|---|---|---|---|---|---|
```

### Task 1.2: The agent brief (verbatim)

This is the brief, word for word. It is given to A1, A2 and A3 with only the
`SPECS` line and the `LEDGER` line differing.

```text
READ-ONLY TASK. You are auditing, not building.

You may read anything in D:\Projects\JPC\space-v2 and anything in
D:\Projects\JPC\jpc-space. D:\Projects\JPC\jpc-space is READ-ONLY: never write
to it, never create a file in it, never run any git command in it. Report
anything wrong there; do not touch it.

You may write to EXACTLY ONE file — your ledger, named below — and you may only
APPEND to it. You may not edit any source file, any spec, any plan, or any
other file for any reason, including to "fix an obvious typo". You may not run
any command that writes to a database. You may not run tests. You may not run
prisma migrate, prisma db push, or prisma db execute.

SPECS: <the agent's spec list>
LEDGER: docs/superpowers/audits/2026-cutover/ledger-<A1|A2|A3>.tsv

YOUR JOB

For every numbered rule (a line beginning `- **R<n>.**`) in every spec assigned
to you, decide whether v2 does what the rule describes, and append exactly one
tab-separated row to your ledger.

WORK ONE SPEC AT A TIME, IN ORDER. Finish a spec's rules and append them before
opening the next spec. Do not read all your specs first. If you run low on
context, stop, append what you have, and report which rule number you reached —
a partial ledger with an honest stopping point is worth more than a complete
one with guessed rows.

THE ROW

spec      the spec's filename, e.g. 04-attendance.md
rule      the rule number, e.g. R63
verdict   exactly one of: PRESERVED | DIVERGED | DROPPED | NA | UNVERIFIED
v2_citation  a repo-relative path and line number, e.g.
             apps/backend/src/lib/check-in.ts:88
             or, for a multi-line behaviour, a range: ...:88-104
             Use the literal string "-" ONLY when the verdict is DROPPED or NA.
authority for DIVERGED: the decision id that authorised it — a ruling (C3),
          a spec decision (09-notes.md D4), or a plan decision (D-15.6).
          for DROPPED: the same, or the literal "UNAUTHORISED" if you cannot
          find one.
          for PRESERVED / NA / UNVERIFIED: "-"
note      one short sentence, under 25 words, no tabs. For UNVERIFIED, say
          exactly what you looked for and where you looked.

THE VERDICTS

PRESERVED   v2 does what the rule describes. You have opened the cited file and
            read the cited lines. The citation must be v2 code — a line in
            apps/backend, apps/mobile or packages/shared. A citation to a spec,
            a plan, or to jpc-space is NOT a citation; it is UNVERIFIED.

DIVERGED    v2 deliberately does something else, and you can name the decision
            that authorised it. Most v1 rules describing a defect land here —
            that is expected and correct. You MUST fill `authority`. If you
            cannot name a decision, the verdict is DROPPED with authority
            UNAUTHORISED, not DIVERGED. Do not invent an authority. Do not
            reason "this is obviously better" — someone's judgement being
            obvious is not a decision record.

DROPPED     v2 does not do this and nothing replaces it. Fill `authority` if a
            decision authorised the drop, otherwise UNAUTHORISED.

NA          The rule describes a v1 mechanism with no v2 counterpart at all —
            a Next.js `revalidatePath` call, a server-action return shape, a
            `useFormState` binding, a Tailwind class. NA is the easiest verdict
            to reach for and the easiest to be wrong about. Before using it,
            ask: does this rule describe a BEHAVIOUR a user could notice? If
            yes, it is not NA. "v1 revalidates /admin/season" is NA. "v1 shows
            the student their own group unscoped by season" is NOT NA — it is a
            behaviour, and v2 either reproduces it or diverges from it.

UNVERIFIED  You could not establish any of the above. This is a legitimate and
            useful verdict. Use it rather than guessing. The coordinator treats
            every UNVERIFIED row as a finding.

HOW TO SEARCH

Start from the spec's own §6/§7 mapping tables — most rules name the v1 file
they came from, and the corresponding v2 file is usually the same name under
apps/backend/src/routes/ or apps/backend/src/lib/. Then grep v2 for the
identifier, the error code, the route path or the column name the rule
mentions. Authorization rules almost always land in
apps/backend/src/lib/permissions.ts or apps/backend/src/lib/rbac.ts. Contract
rules land in packages/shared/src/. Screen rules land in apps/mobile/app/.

WHAT NOT TO DO

- Do not mark a rule PRESERVED because a plan says it will be. A plan is an
  intention. Cite the code or mark it UNVERIFIED.
- Do not mark a rule PRESERVED from a filename. Open the file.
- Do not batch-assign a verdict to a run of rules because they are adjacent.
- Do not summarise. One row per rule, including the boring ones.
- Do not quote spec text longer than 15 words into your note.
- Do not put any student's real name, email or note content into any row.

WHEN YOU FINISH

Report, in your final message and not in a file:
1. rows appended, per spec;
2. the counts per verdict, per spec;
3. every UNVERIFIED row's rule number, listed;
4. every DROPPED row with authority UNAUTHORISED, listed;
5. anything you found in v2 that no rule covers and that looks wrong.
Item 5 is not optional and "nothing" is an acceptable answer only if you mean it.
```

### Task 1.3: Run the sweep

- [ ] **Step 1: Dispatch A1, A2, A3 in parallel** with the brief above.
  Three agents, not five — the roadmap records that a five-agent fan-out died
  on session limits.
- [ ] **Step 2: If an agent stops short**, re-dispatch it with the same brief
  plus `RESUME AT: <spec>, <rule number>`. Do not re-dispatch a *fresh* agent
  over rules already appended — duplicates corrupt the counts.
- [ ] **Step 3: Concatenate** into `ledger.tsv` and check the row count:

```
cd docs/superpowers/audits/2026-cutover
head -1 ledger-A1.tsv > ledger.tsv
tail -q -n +2 ledger-A1.tsv ledger-A2.tsv ledger-A3.tsv >> ledger.tsv
awk -F'\t' 'NR>1 {print $1"\t"$2}' ledger.tsv | sort | uniq -d   # must be empty
awk 'NR>1' ledger.tsv | wc -l                                     # must be 1475
```

A duplicate `(spec, rule)` pair or a count below 1,475 means the sweep is
incomplete. Do not proceed on an incomplete ledger.

### Task 1.4: Coordinator triage

**This is the part that decides whether the audit was worth running.** The
triage rule, applied by the coordinator and not delegated:

- [ ] **Step 1: A row is only `PRESERVED` if the citation checks out.**
  Sample **every** `PRESERVED` row in `04-attendance`, `05-groups`,
  `08-submissions`, `09-notes` and `11-invites-users` — the five
  authorization-bearing domains — and a random 10% elsewhere. Open the file, go
  to the line, confirm it does what the note claims. A citation that does not
  support its claim is downgraded to `UNVERIFIED` and the agent's remaining
  rows in that spec are re-checked at 50%.

```
awk -F'\t' '$3=="PRESERVED" && ($1=="04-attendance.md" || $1=="05-groups.md" || $1=="08-submissions.md" || $1=="09-notes.md" || $1=="11-invites-users.md")' ledger.tsv
```

- [ ] **Step 2: Every `DIVERGED` row must name a decision that exists.**
  Extract the authorities and check each one resolves:

```
awk -F'\t' '$3=="DIVERGED" {print $5}' ledger.tsv | sort | uniq -c | sort -rn
```

An authority that is not a ruling in `_DECISIONS.md`, a `D<n>` in the named
spec's §10, or a `D-NN.n` in a plan, is **not an authority**. The row becomes
`DROPPED / UNAUTHORISED` and joins Task 1.5's list.

- [ ] **Step 3: Every `NA` row in the five authorization-bearing domains is
  re-checked at 100%**, and 10% elsewhere. `NA` is the escape hatch and it is
  the one an agent under context pressure reaches for. Apply the brief's own
  test: does the rule describe a behaviour a user could notice? If yes, the row
  is wrong.

- [ ] **Step 4: Every `UNVERIFIED` row is a finding.** Group them and decide
  one at a time. There are only three outcomes: it resolves to one of the other
  four verdicts on closer reading; it becomes a **task in Part 2** because the
  reason v2 does not preserve it is a missing column; or it becomes an entry in
  `DROPPED.md`. There is no fourth outcome and "we'll look at it after
  cutover" is not one of them.

- [ ] **Step 5: Produce the triage summary** at the top of
  `docs/superpowers/audits/2026-cutover/README.md`:

```
Total rules            1475
PRESERVED  (verified)  ....
DIVERGED   (authorised) ....
DROPPED    (registered) ....
NA         (no v2 counterpart) ....
UNVERIFIED (open findings) ....   <-- must be 0 before Part 2
```

### Task 1.5: Sign the drop register (coordinator + **[USER]**)

- [ ] **Step 1:** Every `DROPPED` row becomes a row in `DROPPED.md` with the v1
  behaviour stated in the user's terms, not the engineer's — "a leader can no
  longer download the check-in QR as a PNG", not "R74 not ported".
- [ ] **Step 2:** Every `UNAUTHORISED` drop is presented to the user
  individually. **[USER]** These are capabilities the organisation is losing
  and nobody decided to lose them.
- [ ] **Step 3: [USER] signs the register.** Part 2 does not begin until it is
  signed. This is the gate: the audit's purpose is to make sure Part 2's
  migration list is complete, and it is only complete once every rule is
  accounted for.

**Done for Part 1:** `UNVERIFIED` is zero; `DROPPED.md` is signed; every rule
whose non-preservation is caused by a missing column appears as a task in Part 2.

---

# Part 2 — Migration thaw

**C1's exact words:** *"when a defect's clean fix is a new column, the ruling is
not 'add the column'. It is: correct what can be corrected inside the current
schema, and record the rest as a cutover task."* This is where those records
are cashed.

**Seventeen migrations. Every one is authored now and applied only in Part 3.**
Authoring means writing SQL to `apps/backend/prisma/migrations-cutover/` and
rehearsing it against a restored copy. It does not mean running it. It does not
mean running it "against staging first" — staging *is* the shared production
database (`CLAUDE.md`: "Shared staging database with v1"), which is precisely
why C1 exists.

### Task 2.0: Authoring mechanics (do this before M1)

**Files:**
- Create: `apps/backend/prisma/schema.cutover.prisma` (working copy)
- Create: `apps/backend/prisma/migrations-cutover/` (directory)
- Create: `apps/backend/prisma/migrations-cutover/README.md`
- Create: `apps/backend/prisma/CONSTRAINTS.md`

- [ ] **Step 1: Copy the schema, do not edit the real one.**

```
cp apps/backend/prisma/schema.prisma apps/backend/prisma/schema.cutover.prisma
```

`schema.prisma` is not touched until step R11 of the runbook. Every model
change below is made in `schema.cutover.prisma`.

- [ ] **Step 2: Generate DDL offline, from two files, never from a database.**

```
npx prisma migrate diff \
  --from-schema-datamodel apps/backend/prisma/schema.prisma \
  --to-schema-datamodel   apps/backend/prisma/schema.cutover.prisma \
  --script > /tmp/generated.sql
```

`--from-schema-datamodel` reads a *file*. There is no `DATABASE_URL` in that
command and there must never be one: `--from-url` opens a connection, and a
connection is the first step toward `migrate dev`. The generated DDL is then
split by hand into the seventeen `migrations-cutover/<timestamp>_<name>/migration.sql`
folders below, with each folder's hand-written data steps (backfills,
violating-row repairs) interleaved in the stated order.

- [ ] **Step 3: Write `migrations-cutover/README.md`** stating, in the file
  itself so nobody has to find this plan:

  > These migrations are **not applied by any tooling**. Prisma does not read
  > this directory. They are moved into `prisma/migrations/` by hand, once, by
  > the operator, inside the cutover window, after v1 has stopped writing and a
  > backup has been verified. Do not move them early. Do not run
  > `prisma migrate dev`, `prisma db push` or `prisma migrate reset` against
  > the shared database at any time.

- [ ] **Step 4: Write `prisma/CONSTRAINTS.md`.** Prisma's schema language
  cannot express `CHECK` constraints or functional indexes, and
  `prisma migrate diff` will not recreate them. Three migrations below add one.
  Each is recorded in this file with its exact SQL, so the next person to
  author a migration knows it exists and does not drop it by regenerating from
  the datamodel. This is decision D-13.9.

- [ ] **Step 5: Number the folders `20261101000001_…` upward**, in the M-order
  below. Order matters: M1 must precede M11 (the importer writes `GroupStudent`
  rows), M5 must precede any producer that emits a new notification type, and
  M14 must precede nothing but must follow M12 (both touch credential rows).

---

### Task 2.1 — M1: `GroupStudent` becomes season-scoped

**Unfreezes:** C9 (`_DECISIONS.md:150-162`), `05-groups.md` §10 item 1
(`:695-728`, R1–R10, R82, R88), `07-assignments.md` §10 item 7 (`:609-618`,
R29/R31), `06-students.md`'s enrolment convention, `09-notes.md`'s leader
write gate. This is the largest single behavioural defect in the database:
`GroupStudent.studentUserId` is standalone `@unique`
(`apps/backend/prisma/schema.prisma:330`), so a student belongs to **one group
in the entire database**. Adding them to a new season's group silently destroys
the previous membership, and group-targeted assignments, the forum peer feed,
engagement and leader visibility for the previous season all go dark.

**Prisma model change** (`schema.cutover.prisma`):

```prisma
model Group {
  // ...unchanged...
  @@unique([id, seasonId])          // NEW — target for the composite FK below
  @@index([seasonId])
}

model GroupStudent {
  groupId       Int
  group         Group    @relation(fields: [groupId, seasonId], references: [id, seasonId], onDelete: Cascade)
  studentUserId Int                                   // @unique REMOVED
  studentUser   User     @relation(fields: [studentUserId], references: [id], onDelete: Restrict)
  seasonId      Int                                   // NEW
  enrolledAt    DateTime @default(now())

  @@id([groupId, studentUserId])
  @@unique([seasonId, studentUserId])                 // NEW — the real rule
  @@index([groupId])
}
```

`seasonId` is denormalised from `Group.seasonId` — it is functionally
determined by `groupId`, and Postgres cannot enforce a unique constraint across
a join, so the column exists solely to carry the constraint. The **composite
foreign key to `Group(id, seasonId)`** is what keeps it honest: it is
structurally impossible for `GroupStudent.seasonId` to disagree with its
group's season.

**DDL and backfill**, in this exact order:

```sql
-- migration.sql — M1

-- (a) Give Group the composite key the child FK needs.
ALTER TABLE "Group" ADD CONSTRAINT "Group_id_seasonId_key" UNIQUE ("id", "seasonId");

-- (b) Add the column nullable so the backfill can run.
ALTER TABLE "GroupStudent" ADD COLUMN "seasonId" INTEGER;

-- (c) Backfill from the group the row already points at. Cannot fail:
--     GroupStudent.groupId is already a non-null FK to Group.
UPDATE "GroupStudent" gs
   SET "seasonId" = g."seasonId"
  FROM "Group" g
 WHERE g."id" = gs."groupId";

ALTER TABLE "GroupStudent" ALTER COLUMN "seasonId" SET NOT NULL;

-- (d) Composite FK: seasonId can now never drift from the group's season.
ALTER TABLE "GroupStudent"
  ADD CONSTRAINT "GroupStudent_groupId_seasonId_fkey"
  FOREIGN KEY ("groupId", "seasonId") REFERENCES "Group"("id", "seasonId")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- (e) THE REPAIR (see "violating rows" below). SeasonEnrollment wins, per C9.
UPDATE "GroupStudent" gs
   SET "groupId"  = se."groupId",
       "seasonId" = se."seasonId"
  FROM "SeasonEnrollment" se
  JOIN "Group" g_gs ON g_gs."id" = gs."groupId"
 WHERE se."studentUserId" = gs."studentUserId"
   AND se."seasonId"      = g_gs."seasonId"
   AND se."groupId" IS NOT NULL
   AND se."groupId"      <> gs."groupId";

-- (f) THE BACKFILL: restore every per-season membership SeasonEnrollment
--     recorded and GroupStudent's global unique destroyed.
INSERT INTO "GroupStudent" ("groupId", "studentUserId", "seasonId", "enrolledAt")
SELECT se."groupId", se."studentUserId", se."seasonId", se."enrolledAt"
  FROM "SeasonEnrollment" se
 WHERE se."groupId" IS NOT NULL
   AND NOT EXISTS (
       SELECT 1 FROM "GroupStudent" gs
        WHERE gs."studentUserId" = se."studentUserId"
          AND gs."seasonId"      = se."seasonId")
ON CONFLICT DO NOTHING;

-- (g) Swap the constraint. The old one is strictly stronger, so this widens.
DROP INDEX "GroupStudent_studentUserId_key";
CREATE UNIQUE INDEX "GroupStudent_seasonId_studentUserId_key"
    ON "GroupStudent" ("seasonId", "studentUserId");
```

Note the ordering trap: **(g) must come after (f)**, because the standalone
unique on `studentUserId` would reject every inserted row. And **(e) must come
before (f)**, because a disagreeing row would otherwise collide on the new
unique the moment it is created.

**Rows that violate the new constraint today.** None violate the *uniqueness* —
"one group in the whole database" implies "one group per season", so the new
constraint is strictly weaker. The violations are of **truth**, and there are
two classes:

1. **Disagreements** — `SeasonEnrollment` says group B for season 5,
   `GroupStudent` says group A (also in season 5). Two admin-facing surfaces
   already disagree about these students today (`05-groups.md` §10 item 7).
   Find them before the window:

```sql
SELECT gs."studentUserId", g_gs."seasonId",
       gs."groupId" AS membership_group, se."groupId" AS enrolment_group
  FROM "GroupStudent" gs
  JOIN "Group" g_gs ON g_gs."id" = gs."groupId"
  JOIN "SeasonEnrollment" se
    ON se."studentUserId" = gs."studentUserId"
   AND se."seasonId"      = g_gs."seasonId"
 WHERE se."groupId" IS NOT NULL AND se."groupId" <> gs."groupId";
```

   **Disposition:** step (e) resolves them in `SeasonEnrollment`'s favour,
   because C9 makes `SeasonEnrollment` the authority and `GroupStudent` merely
   advisory. The list is exported to
   `docs/superpowers/audits/2026-cutover/M1-disagreements.tsv` and shown to the
   user **before** the window (step R2), because each row is a student whose
   displayed group changes.

2. **Orphans** — a `GroupStudent` row for a student with no `SeasonEnrollment`
   in that group's season. These are students moved into a group without an
   enrolment ever being written.

```sql
SELECT gs."studentUserId", gs."groupId", g."seasonId"
  FROM "GroupStudent" gs
  JOIN "Group" g ON g."id" = gs."groupId"
 WHERE NOT EXISTS (
       SELECT 1 FROM "SeasonEnrollment" se
        WHERE se."studentUserId" = gs."studentUserId"
          AND se."seasonId"      = g."seasonId");
```

   **Disposition:** left alone. The migration does not invent enrolments. They
   are listed to the user as a data-quality report; creating a
   `SeasonEnrollment` for each is a separate, reviewed operation.

**Verification:**

```sql
-- 1. Every enrolment with a group now has a matching membership.
SELECT count(*) FROM "SeasonEnrollment" se
 WHERE se."groupId" IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM "GroupStudent" gs
                    WHERE gs."studentUserId"=se."studentUserId"
                      AND gs."seasonId"=se."seasonId"
                      AND gs."groupId"=se."groupId");   -- expect 0

-- 2. seasonId never disagrees with the group's season (the composite FK
--    guarantees this, so a non-zero result means the FK did not apply).
SELECT count(*) FROM "GroupStudent" gs JOIN "Group" g ON g."id"=gs."groupId"
 WHERE gs."seasonId" <> g."seasonId";                    -- expect 0

-- 3. Multi-season students now exist, which was impossible before.
SELECT count(*) FROM (SELECT "studentUserId" FROM "GroupStudent"
                       GROUP BY 1 HAVING count(*) > 1) x;  -- expect > 0
```

Plus: the integration suite green under `--runInBand`, and one **mutation
check** — restore the standalone unique on a rehearsal copy and confirm the
`GroupStudent` insert in (f) fails. A backfill that would have succeeded either
way proved nothing.

**Rollback:** reversible until v2 accepts a production write (the point of no
return, R15). Before that:

```sql
DELETE FROM "GroupStudent" gs USING "Group" g
 WHERE g."id"=gs."groupId"
   AND EXISTS (SELECT 1 FROM "GroupStudent" gs2 JOIN "Group" g2 ON g2."id"=gs2."groupId"
                WHERE gs2."studentUserId"=gs."studentUserId" AND gs2."ctid" < gs."ctid");
-- ...then drop the new index, re-create GroupStudent_studentUserId_key,
-- drop the composite FK, drop seasonId, drop Group_id_seasonId_key.
```

In practice the rollback is **restore the backup** (R7). The statement above is
recorded so that a partial failure inside the transaction can be reasoned
about, not because hand-unwinding is the plan. Wrap the whole migration in a
single transaction; Postgres DDL is transactional and there is no reason to
leave it half-applied.

---

### Task 2.2 — M2: group names are unique within a season

**Unfreezes:** `05-groups.md` §10 item 6 (`:804-814`, R15). Two groups called
"Alpha" in one season are legal today, and the CSV importer matches by
lowercased trimmed name into a `Map` — so with duplicates the last group wins
silently and half a spreadsheet lands in the wrong group.

**Prisma model change:** `@@unique([seasonId, name])` on `Group`.

**Why exact-match and not case-insensitive:** the spec asks for case-insensitive
uniqueness. Postgres can only express that as a functional unique index on
`lower(btrim(name))`, which Prisma cannot model and which
`prisma migrate diff` would silently propose dropping the next time someone
regenerates from the datamodel. **Decision D-13.10:** the database carries the
exact-match constraint (modellable, drift-free) and case-insensitivity stays in
the endpoint, where Plan 4 already put it. Two layers, neither of them a
liability.

**DDL and repair:**

```sql
-- (a) Find the offenders FIRST — this one has real violations today.
--     Run at R2, not in the window.
SELECT "seasonId", lower(btrim("name")) AS norm, count(*) AS n,
       array_agg("id" ORDER BY "id") AS ids
  FROM "Group" GROUP BY 1,2 HAVING count(*) > 1;

-- (b) Repair: the lowest id keeps the name; the rest are suffixed with their
--     id so the rename is reversible and obviously machine-made.
UPDATE "Group" g SET "name" = g."name" || ' #' || g."id"
 WHERE EXISTS (SELECT 1 FROM "Group" g2
                WHERE g2."seasonId" = g."seasonId"
                  AND lower(btrim(g2."name")) = lower(btrim(g."name"))
                  AND g2."id" < g."id");

-- (c) The constraint.
ALTER TABLE "Group" ADD CONSTRAINT "Group_seasonId_name_key" UNIQUE ("seasonId","name");
```

**Rows that violate today:** duplicates almost certainly exist — v1 has no
check of any kind. The (a) query is run at R2 and its output goes to
`M2-duplicates.tsv`. **[USER] renames them by hand if any of them are
meaningful** (two real groups that happen to share a name need two real names,
not `Alpha` and `Alpha #7`); step (b) is the fallback for the ones nobody
cares about. A machine-generated group name shown to a leader is worse than the
duplicate was.

**Verification:** `(a)` returns zero rows; the group-create integration test
that asserts `409 group_name_taken` still passes; a manual insert of a
duplicate name is rejected by the database and not merely by the endpoint.

**Rollback:** `ALTER TABLE "Group" DROP CONSTRAINT "Group_seasonId_name_key";`
The renames are **not** rolled back automatically — the suffix `' #' || id` is
unambiguous, so a reverse `UPDATE` stripping `#<id>` from the tail is recorded
in the migration folder as `rollback.sql`.

---

### Task 2.3 — M3: lateness gets a basis, a threshold and a weight

**Unfreezes:** C3 (`_DECISIONS.md:51-69`), `04-attendance.md` D1 (`:571-595`,
R63/R64/R88/R89) and D2 (`:597-612`). v1 computes `lateMinutes` as minutes
since **`checkInOpenAt`** — since an admin pressed a button — with no
threshold, and the absence budget charges that raw value. An admin who opens
the console five minutes early marks the entire punctual cohort `LATE`; one who
opens twenty minutes late forgives everybody. v2 measures from
`session.startsAt`, which makes v1-era and v2-era rows mean different things in
the same column while both systems run. C3 accepts that deliberately and books
the correction here.

**The spec/ruling conflict, stated (D-13.6):** `04-attendance.md:589-595`
recommends a hard-coded **15-minute grace** in the interim. C3 rules the
threshold is **zero** until the column exists. `_DECISIONS.md` wins. The column
this migration adds defaults to `0`, matching what v2 has been writing; raising
it to 15 is a **product decision the user makes after cutover**, not a default
this migration smuggles in.

**Prisma model change:**

```prisma
enum LateBasis { SESSION_START MANUAL UNKNOWN }

model Season {
  lateThresholdMinutes Int  @default(0)   // NEW — C3's threshold, zero by ruling
  lateWeightMinutes    Int?               // NEW — null = charge actual minutes
}

model Attendance {
  lateMinutes       Int?
  lateMinutesLegacy Int?                       // NEW — pre-recompute value
  lateBasis         LateBasis @default(UNKNOWN) // NEW
}
```

`lateWeightMinutes` is nullable and defaults to null on purpose:
`04-attendance.md` D2 **recommends against** the fixed-weight model, and
`Season.absenceWeightMinutes` (which does exist,
`schema.prisma:255`) is a different thing. The column exists so the design's
option is available, not so it is taken.

**DDL and backfill:**

```sql
CREATE TYPE "LateBasis" AS ENUM ('SESSION_START','MANUAL','UNKNOWN');
ALTER TABLE "Season"     ADD COLUMN "lateThresholdMinutes" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Season"     ADD COLUMN "lateWeightMinutes"    INTEGER;
ALTER TABLE "Attendance" ADD COLUMN "lateMinutesLegacy"    INTEGER;
ALTER TABLE "Attendance" ADD COLUMN "lateBasis" "LateBasis" NOT NULL DEFAULT 'UNKNOWN';

-- (a) Preserve every value before touching one.
UPDATE "Attendance" SET "lateMinutesLegacy" = "lateMinutes";

-- (b) Recompute from the session start wherever a check-in instant exists.
--     This is basis-independent: it does not matter whether v1 or v2 wrote
--     the row, because checkedInAt and startsAt are both facts.
UPDATE "Attendance" a
   SET "lateMinutes" = GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (a."checkedInAt" - s."startsAt")) / 60))::int,
       "lateBasis"   = 'SESSION_START'
  FROM "Session" s
 WHERE s."id" = a."sessionId" AND a."checkedInAt" IS NOT NULL;

-- (c) Rows with a lateness but no check-in instant were typed in by a leader.
--     Nothing can be recomputed from them; label them honestly.
UPDATE "Attendance" SET "lateBasis" = 'MANUAL'
 WHERE "checkedInAt" IS NULL AND "lateMinutes" IS NOT NULL;
-- Everything else keeps UNKNOWN.
```

**This is the migration that answers C3's "Reports must not present v1-era and
v2-era `lateMinutes` as one series without saying so."** After (b), the series
*is* one series for every row that has a `checkedInAt` — the divergence is
retired rather than annotated. `lateBasis` tells a report which rows those are.

**Rows that violate today:** none violate a constraint (there is none), but the
recompute changes values, and it will produce rows where
`status = 'LATE' AND lateMinutes = 0` — a student who checked in before the
session started but after the console opened. **The migration does not rewrite
`status`.** Rewriting attendance history to match a recomputed number is a
bigger act than correcting the number, and nobody has authorised it. Instead:

```sql
SELECT count(*) FROM "Attendance"
 WHERE "status"='LATE' AND "lateBasis"='SESSION_START' AND COALESCE("lateMinutes",0)=0;
```

That count goes to the user as a reconciliation figure at R12. Whether to
re-status those rows is a follow-up, and it is in `DROPPED.md` if the answer is
no.

**Verification:** the count above is reported; the absence-budget figure for a
sample of five seasons is computed before and after and the deltas are shown to
the user (they will move — that is the point, and the organisation must see by
how much); `SELECT "lateBasis", count(*) FROM "Attendance" GROUP BY 1` shows a
plausible distribution with `UNKNOWN` confined to rows with neither a
`checkedInAt` nor a `lateMinutes`.

**Rollback:** `UPDATE "Attendance" SET "lateMinutes" = "lateMinutesLegacy";`
then drop the two `Attendance` columns, the two `Season` columns and the type.
`lateMinutesLegacy` is retained for **one full release** after cutover and
dropped by a separate migration once the reconciliation is accepted — a
rollback path that is deleted in the same change as the thing it rolls back is
not a rollback path.

---

### Task 2.4 — M4: notifications carry an entity, not a v1 URL

**Unfreezes:** `10-notifications.md` D1 (`:542-576`), `07-assignments.md` §10
item 11 (`:645-649`), Plan 8's deferral (`:112`), Plan 9's (`:78-82`).
`Notification.link` holds a v1 role-prefixed web path
(`/admin/students/12`), which resolves to nothing in v2's flat route tree —
and v2 has been *deliberately writing v1's format* so v1 keeps working
(`apps/backend/src/lib/attendance-notifications.ts:66,74`).

**Prisma model change:**

```prisma
enum NotificationEntityType { STUDENT ASSIGNMENT SUBMISSION SESSION QUIZ CALENDAR }

model Notification {
  link       String?                        // KEPT for one release, then dropped
  entityType NotificationEntityType?        // NEW
  entityId   Int?                           // NEW
  @@index([entityType, entityId])           // NEW
}
```

**Backfill** — using the same five path shapes `10-notifications.md` R3
enumerates, and the same mapping the backend already implements in
`apps/backend/src/lib/notification-target.ts` (Plan 9). The SQL below must
produce identical results to that function; the rehearsal asserts it does.

```sql
CREATE TYPE "NotificationEntityType" AS ENUM
  ('STUDENT','ASSIGNMENT','SUBMISSION','SESSION','QUIZ','CALENDAR');
ALTER TABLE "Notification" ADD COLUMN "entityType" "NotificationEntityType";
ALTER TABLE "Notification" ADD COLUMN "entityId"   INTEGER;

UPDATE "Notification" SET "entityType"='ASSIGNMENT',
       "entityId"=(regexp_match("link", '^/student/assignments/(\d+)$'))[1]::int
 WHERE "link" ~ '^/student/assignments/\d+$';

UPDATE "Notification" SET "entityType"='STUDENT',
       "entityId"=(regexp_match("link", '^/(?:admin|leader)/students/(\d+)$'))[1]::int
 WHERE "link" ~ '^/(admin|leader)/students/\d+$';

UPDATE "Notification" SET "entityType"='QUIZ'     WHERE "link" = '/student/quizzes';
UPDATE "Notification" SET "entityType"='CALENDAR' WHERE "link" = '/student/calendar';

CREATE INDEX "Notification_entityType_entityId_idx" ON "Notification"("entityType","entityId");
```

**Rows that violate today:** any row whose `link` matches none of the five
shapes. There is no constraint to violate, so they simply stay null and the
client falls back to opening the inbox. Enumerate them at R2 so the count is
known rather than discovered:

```sql
SELECT "link", count(*) FROM "Notification"
 WHERE "link" IS NOT NULL GROUP BY 1
 ORDER BY 2 DESC;   -- compare against the five known shapes
```

An unrecognised shape in that list means v1 grew a sixth path since the spec was
written. **That is a no-go condition at R8** unless the mapping is extended and
re-rehearsed — a notification that silently opens the wrong screen is worse
than one that opens the inbox.

**Verification:** every row with a recognised `link` has a non-null
`entityType`; `entityId` is null exactly for `QUIZ` and `CALENDAR`; the SQL
backfill and `parseNotificationLink` agree on a 1,000-row sample; the inbox
integration test still passes (and C6 still holds — opening the inbox writes
nothing).

**Rollback:** drop the index, the two columns and the type. `link` was never
modified, so the rollback is total. `link` is dropped by a **later, separate**
migration once every client reads `entityType` — not here.

---

### Task 2.5 — M5: the `NotificationType` enum grows

**Unfreezes:** `08-submissions.md` D14 (`:802-808`, submit→leader),
`14-forum.md` D13 (`:761-769`, someone commented on your response),
`12-quizzes.md` D14 (`:1276-1283`, attempt awaiting grading) and D5
(`:1163-1172`, your attempt was reopened — for which v2 currently reuses
`QUIZ_GRADED` with different copy), `10-notifications.md` D5 close
(`:672-674`).

**Prisma model change:** four values on `NotificationType`, four booleans on
`NotificationPreference`, one master switch (which `18-settings.md` D3 and Plan
9 both book here):

```prisma
enum NotificationType {
  // ...existing six...
  SUBMISSION_RECEIVED   // to the leader, when a student submits
  FORUM_COMMENT         // to the author, when a peer comments
  QUIZ_ATTEMPT_PENDING  // to the grader, when an essay attempt lands
  QUIZ_REOPENED         // to the student, when an attempt is reopened
}

model NotificationPreference {
  submissionReceived Boolean @default(true)
  forumComment       Boolean @default(true)
  quizAttemptPending Boolean @default(true)
  quizReopened       Boolean @default(true)
  pushEnabled        Boolean @default(true)   // the master switch (M10's pair)
}
```

**DDL:**

```sql
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SUBMISSION_RECEIVED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'FORUM_COMMENT';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'QUIZ_ATTEMPT_PENDING';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'QUIZ_REOPENED';

ALTER TABLE "NotificationPreference" ADD COLUMN "submissionReceived" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "NotificationPreference" ADD COLUMN "forumComment"       BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "NotificationPreference" ADD COLUMN "quizAttemptPending" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "NotificationPreference" ADD COLUMN "quizReopened"       BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "NotificationPreference" ADD COLUMN "pushEnabled"        BOOLEAN NOT NULL DEFAULT true;
```

**Backfill:** none. The defaults are the backfill.

**Rows that violate today:** none — this only adds.

**Two traps that make this migration different from every other one here:**

1. **`ALTER TYPE ... ADD VALUE` cannot run inside a transaction block in
   Postgres versions before 12, and in later versions the new value cannot be
   *used* in the same transaction that adds it.** M5 therefore runs as its own
   migration file with no other statement in it, and the first row using a new
   value is written after commit. Prisma's `migrate deploy` runs each migration
   file in its own transaction, so this is satisfied by keeping M5 alone in its
   folder. Do not merge it into M4 to "save a step".
2. **Enum values cannot be removed.** `ALTER TYPE ... DROP VALUE` does not
   exist. **M5's rollback is forward-only:** the value stays in the type
   forever, unused and harmless. This is stated so that "we can always roll it
   back" is never said about it. If the four values turn out to be wrong names,
   the fix is four more values and a data migration, not a revert. Name them
   once, correctly.

**Verification:** `SELECT unnest(enum_range(NULL::"NotificationType"));` shows
ten values; a producer test for each new type writes a row and the inbox
returns it; the preference matrix test covers eleven columns.

---

### Task 2.6 — M6: `Season` carries an IANA timezone

**Unfreezes:** `02-seasons.md` D11 (`:561-568`) and D12 (`:570-577`),
`03-sessions.md` §10 item 5 (`:671-685`, R105–R108),
`07-assignments.md` §10 item 3 (`:552-570`, R45–R48),
`06-students.md` D10 (`:723-732`), `17-reports.md` D12 (`:1312-1337`).
Five specs independently ask for the same column.

**Relationship to C2, which is the reason this is subtle.** C2 rules that every
wall-clock derivation resolves against **one organisation timezone held in
config**, applied server-side, never the device's. That is not repealed here.
This column is an *override*, not a replacement: config remains the default and
the only thing v2 reads today; the column lets a season that genuinely runs in
another zone say so. `17-reports.md:1330` anticipates exactly this — "if domain
2 ever adds a season timezone, the report should prefer it over the reader's".

**Prisma model change:**

```prisma
model Season {
  timezone String?   // NEW — IANA zone id, e.g. "Africa/Cairo". null = org default.
}
```

**DDL and backfill:**

```sql
ALTER TABLE "Season" ADD COLUMN "timezone" TEXT;
-- Deliberately NOT backfilled. null means "use the organisation default",
-- which is what every season means today. Writing the current config value
-- into 40 rows would freeze today's default into history.
ALTER TABLE "Season" ADD CONSTRAINT "Season_timezone_ck"
  CHECK ("timezone" IS NULL OR "timezone" ~ '^[A-Za-z_]+/[A-Za-z_+-]+$') NOT VALID;
ALTER TABLE "Season" VALIDATE CONSTRAINT "Season_timezone_ck";
```

The `CHECK` is a shape guard, not a zone validator — Postgres cannot know the
IANA database. Real validation stays in the Zod schema. **Record the `CHECK` in
`prisma/CONSTRAINTS.md`** (D-13.9): Prisma cannot see it and will not recreate
it.

**Rows that violate today:** none — the column starts null everywhere and the
constraint is vacuously true.

**Verification:** `resolveTimezone(season)` in the backend returns
`season.timezone ?? config.orgTimezone`, has a unit test for both branches, and
is the **only** place either value is read — grep for a second `orgTimezone`
reference and there must not be one (C4: one definition, one place).

**Rollback:** `ALTER TABLE "Season" DROP CONSTRAINT "Season_timezone_ck"; ALTER TABLE "Season" DROP COLUMN "timezone";`
Clean, because nothing was backfilled.

---

### Task 2.7 — M7: `JpcEvent` stops lying about its season

**Unfreezes:** `15-events.md` §10 item 6 (`:577-584`, R16/R19 — no `allDay`
column) and item 11 (`:642-651`, R35/R36 — no soft delete), Plan 10's D-15.6
(`:268-272`), plus a defect this plan found by reading the schema rather than a
spec: **`JpcEvent.season` is `onDelete: SetNull`**
(`apps/backend/prisma/schema.prisma:770`), and `JpcEvent` has **no index on
`seasonId`**. A hard season delete therefore turns a `SEASON`-visibility event
into an event scoped to no season — visible to nobody, or to everybody,
depending on which read you ask. Plan 10 also records that
`cleanupTestData` cannot reach `JpcEvent` for the same reason (`:302-305`).

**Is `SetNull` what cutover wants? No.** An event whose audience is "one
season" must not silently outlive that season.

**Prisma model change:**

```prisma
model JpcEvent {
  allDay    Boolean   @default(false)   // NEW — 15 item 6, D-15.6
  deletedAt DateTime?                   // NEW — 15 item 11
  season    Season?   @relation("JpcEventSeason", fields: [seasonId], references: [id], onDelete: Restrict)
  @@index([seasonId])                   // NEW
  @@index([deletedAt])                  // NEW
}
```

**DDL and backfill:**

```sql
ALTER TABLE "JpcEvent" ADD COLUMN "allDay"    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "JpcEvent" ADD COLUMN "deletedAt" TIMESTAMP(3);
CREATE INDEX "JpcEvent_seasonId_idx"  ON "JpcEvent"("seasonId");
CREATE INDEX "JpcEvent_deletedAt_idx" ON "JpcEvent"("deletedAt");

-- Backfill allDay from the midnight convention, resolved ONCE, server-side,
-- in the organisation timezone (C2) — not in the server's incidental zone.
-- :org_tz is bound by the operator from config, e.g. 'Africa/Cairo'.
UPDATE "JpcEvent"
   SET "allDay" = (EXTRACT(HOUR   FROM ("date" AT TIME ZONE :'org_tz')) = 0
               AND EXTRACT(MINUTE FROM ("date" AT TIME ZONE :'org_tz')) = 0);

ALTER TABLE "JpcEvent" DROP CONSTRAINT "JpcEvent_seasonId_fkey";
ALTER TABLE "JpcEvent" ADD CONSTRAINT "JpcEvent_seasonId_fkey"
  FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "JpcEvent" ADD CONSTRAINT "JpcEvent_season_scope_ck"
  CHECK ("visibility" <> 'SEASON' OR "seasonId" IS NOT NULL) NOT VALID;
-- VALIDATE runs only after the offenders below are resolved.
```

**Rows that violate today — and there will be some.** The `NOT VALID` /
`VALIDATE` split exists for exactly this: the constraint binds new rows
immediately while existing ones are triaged.

```sql
SELECT "id", "title", "date", "visibility"
  FROM "JpcEvent" WHERE "visibility"='SEASON' AND "seasonId" IS NULL;
```

**Disposition: [USER] decides, per row.** These are events whose audience was a
season that no longer exists. Neither default is safe — promoting them to `ALL`
widens an audience nobody chose, and deleting them destroys records. The
migration therefore stops, presents the list at R12, and the user picks per row:
re-point at a surviving season, set `visibility` explicitly, or soft-delete
(which `deletedAt`, added three lines earlier, now makes possible). Only then:

```sql
ALTER TABLE "JpcEvent" VALIDATE CONSTRAINT "JpcEvent_season_scope_ck";
```

Record the `CHECK` in `prisma/CONSTRAINTS.md`.

**Verification:** the offender query returns zero; `DELETE FROM "Season"` for a
season with events raises a foreign-key violation instead of silently orphaning
them; `allDay` matches the server-derived boolean for a 200-row sample;
`cleanupTestData` now removes prefixed test events (the leak Plan 10 recorded).

**Rollback:** drop the check, drop both indexes, drop both columns, restore the
FK to `SetNull`. The `allDay` backfill is derived, not destructive — nothing was
overwritten.

---

### Task 2.8 — M8: pastoral notes get a tombstone and a resolution

**Unfreezes:** `09-notes.md` D4 (`:661-686`, R29 — hard delete, no tombstone,
and no UI caller in v1, so nobody has ever deleted a note) and D11
(`:809-821`, R22/R24 — `followUpFlagged` has no queue and cannot be cleared).
Plan 8 ships `DELETE /notes/:id` as `501 delete_unavailable` (`:80`, `:107-110`)
precisely so that no note is hard-deleted in the interval before this lands.

**Prisma model change:**

```prisma
model EngagementNote {
  deletedAt    DateTime?                                     // NEW — D4 #2
  resolvedAt   DateTime?                                     // NEW — D11
  resolvedById Int?                                          // NEW — D11
  resolvedBy   User?     @relation("EngagementNoteResolver", fields: [resolvedById], references: [id], onDelete: SetNull)
  @@index([deletedAt])
  @@index([followUpFlagged, resolvedAt])                     // the queue's index
}
```

**DDL:**

```sql
ALTER TABLE "EngagementNote" ADD COLUMN "deletedAt"    TIMESTAMP(3);
ALTER TABLE "EngagementNote" ADD COLUMN "resolvedAt"   TIMESTAMP(3);
ALTER TABLE "EngagementNote" ADD COLUMN "resolvedById" INTEGER;
ALTER TABLE "EngagementNote" ADD CONSTRAINT "EngagementNote_resolvedById_fkey"
  FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "EngagementNote_deletedAt_idx" ON "EngagementNote"("deletedAt");
CREATE INDEX "EngagementNote_followUpFlagged_resolvedAt_idx"
    ON "EngagementNote"("followUpFlagged","resolvedAt");
```

**Backfill:** none, and this one is a decision rather than an omission
(**D-13.11**). Every historic `followUpFlagged` note stays **unresolved**. The
alternative — resolving them all so the queue opens empty — declares that
follow-ups nobody performed were performed. `09-notes.md` D11 warns that
"every note ever flagged would stay in it forever"; the answer to that is a
`resolvedAt` filter and a date cut in the queue UI, not a lie in the data.
The queue's first render will be long. That is the true state.

**Rows that violate today:** none — three nullable columns.

**Verification:** `DELETE /notes/:id` stops returning 501 and sets `deletedAt`;
every note read (`noteVisibilityWhere` in `lib/permissions.ts`) gains
`deletedAt: null` and there is **no** exported function that returns notes
without it — that is the same mutation Plan 8 Task 7 already tests, extended by
one clause; the follow-up queue returns exactly the flagged, unresolved,
undeleted notes the caller may see.

**Rollback:** drop the two indexes, the FK and the three columns. Any note
soft-deleted between apply and rollback becomes visible again — which is the
safe direction.

---

### Task 2.9 — M9: one `AuditLog`, not five audit columns

**Unfreezes:** `06-students.md` D15 (`:770-779` — no record of who graduated or
dropped a student), `11-invites-users.md` D7 item 4 (`:755-762` — no record of
who granted a role), `16-imports.md` D15 (`:806-814` — no record of who
imported what), `17-reports.md` D15 (`:1366-1381` — bulk personal-data export
with no record of it), `18-settings.md` R39 (`:210`), `13-video-quizzes.md`
D13 (`:953-963` — who last edited a question whose edit invalidates grades),
`09-notes.md` D15 (note-read audit).

**Decision D-13.7: one polymorphic table, not per-domain columns.** Five specs
ask for `createdById`/`updatedById` on five different tables plus two
purpose-built tables (`ExportAudit`, an import audit). Seven schema changes,
seven query patterns, seven places to forget. One append-only `AuditLog` answers
all of them, is the only shape that can record a *read* (`17-reports.md` D15's
export, `09-notes.md` D15's note read — neither of which has a row to hang a
column on), and does not widen any hot table. The cost is that
"who last touched this row" becomes a join instead of a column; for tables
touched a few times a year that is the right trade.

**Prisma model:**

```prisma
enum AuditAction {
  CREATE UPDATE SOFT_DELETE DELETE
  ROLE_GRANT ROLE_REVOKE
  ENROLLMENT_GRADUATE ENROLLMENT_DROP
  EXPORT IMPORT BULK_READ LOGIN_FAIL
}

model AuditLog {
  id         BigInt      @id @default(autoincrement())
  actorId    Int?
  actor      User?       @relation("AuditActor", fields: [actorId], references: [id], onDelete: SetNull)
  action     AuditAction
  entityType String                 // "User" | "SeasonEnrollment" | "Season" | ...
  entityId   Int?
  seasonId   Int?                   // scope, for filtering — not an FK, deliberately
  summary    String?                // "role LEADER -> ADMIN", "412 rows"; NEVER a field value
  rowCount   Int?
  at         DateTime    @default(now())

  @@index([entityType, entityId, at])
  @@index([actorId, at])
  @@index([action, at])
}
```

**`summary` never contains a field value.** `06-students.md` D15 is explicit —
log actor, subject and operation "**without** logging any field value". A note
body, a phone number or a date of birth in an audit table is the same personal
data leak with a longer retention period. The rehearsal greps a sample of rows
for anything resembling an email address or a body and fails if it finds one.

**DDL:** straightforward `CREATE TYPE` + `CREATE TABLE` + three indexes;
generated by `migrate diff` from the model above.

**Backfill:** none possible — the information was never recorded. **This is a
finding for `DROPPED.md`, not a gap to paper over:** every role grant,
graduation and export before cutover is permanently unattributable, and the
register says so in those words.

**Rows that violate today:** none — new table.

**Verification:** each of the six writers (role change, graduate, drop,
soft-delete, export, import) has an integration test asserting exactly one
`AuditLog` row with the right `action` and `entityType`; a test asserts the
audit write is **outside** the business transaction's failure path (an audit
failure must not fail the operation — the same shape as the notification seam);
`BigInt` serialisation is checked at the API boundary, because Prisma returns
`BigInt` and `JSON.stringify` throws on it.

**Rollback:** `DROP TABLE "AuditLog"; DROP TYPE "AuditAction";` Total.

---

### Task 2.10 — M10: `DeviceToken`, and push stops returning 503

**Unfreezes:** `10-notifications.md` D5 item 1 (`:635-654`),
`18-settings.md` D3 (`:459`), Plan 9's `BLOCKED ON CUTOVER` task (`:52`,
`:1665-1742`). Plan 9 ships the entire mobile permission and token lifecycle
against a `POST /api/v1/me/devices` that validates the body and then answers
`503 push_unavailable`, because there is nowhere to put an Expo token and
`10-notifications.md` D5 explicitly **refuses** option (c), reusing an existing
nullable column.

**Reconcile first.** If `docs/superpowers/cutover/2026-08-24-notifications-push.md`
exists (Plan 9's prerequisite), this task adopts its SQL and deletes the
duplicate. Do not author a second `DeviceToken`.

**Prisma model:**

```prisma
enum DevicePlatform { IOS ANDROID }

model DeviceToken {
  id         Int            @id @default(autoincrement())
  userId     Int
  user       User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  token      String         @unique           // Expo push token — a credential
  platform   DevicePlatform
  lastSeenAt DateTime       @default(now())
  createdAt  DateTime       @default(now())

  @@index([userId])
  @@index([lastSeenAt])
}
```

The master switch (`NotificationPreference.pushEnabled`) is added by **M5**, not
here — one migration per table keeps the rollbacks independent.

**Backfill:** none. Tokens arrive from devices after the app is pointed at v2.
Push is therefore **not** part of the soak's success criteria at R17 — the
population starts at zero and fills over days.

**Rows that violate today:** none — new table.

**Verification:** the endpoint stops returning 503 and upserts on `token`;
`DELETE /me/devices/:token` revokes; two users registering the same physical
device (a shared phone) results in the token moving, not duplicating — assert
this, it is the one case the `@unique` makes non-obvious; a dispatch to an
unregistered token is a no-op, not an error; **no push token is ever logged**.

**Rollback:** `DROP TABLE "DeviceToken"; DROP TYPE "DevicePlatform";` and the
endpoint returns to 503, which the mobile client already handles
(Plan 9 `:3230-3233` — "keep the token locally, stop retrying this session").
This is the cleanest rollback in the set precisely because Plan 9 built the
client against the failure.

---

### Task 2.11 — M11: `ImportBatch` replaces the in-process store

**Unfreezes:** `16-imports.md` D9 (`:468-475`, `:750-759`) and D15
(`:806-814`). Plan 12 ships an in-process TTL store — 15-minute expiry,
per-user cap, evicted on commit — with the limitation written into the route
file: **it does not survive a restart and does not work behind more than one
instance.** That is a correctness-limiting hack with a documented expiry date,
and this is the date.

**Prisma model:**

```prisma
enum ImportBatchStatus { PARSED COMMITTED FAILED EXPIRED }
enum ImportBatchKind   { STUDENTS GROUPS }

model ImportBatch {
  id          Int               @id @default(autoincrement())
  importerId  Int
  importer    User              @relation(fields: [importerId], references: [id], onDelete: Restrict)
  kind        ImportBatchKind
  seasonId    Int?
  season      Season?           @relation(fields: [seasonId], references: [id], onDelete: SetNull)
  status      ImportBatchStatus @default(PARSED)
  rows        Json              // parsed VALUES only — never the uploaded file
  outcomes    Json?             // per-row result, written at commit
  rowCount    Int
  expiresAt   DateTime
  committedAt DateTime?
  createdAt   DateTime          @default(now())

  @@index([importerId, status])
  @@index([expiresAt])
}
```

**`rows` holds parsed values, never the uploaded file** (`16-imports.md` D15:
"Do not store the file itself or the raw sheet"). It contains real student
names and emails, so: the table is in the retention sweep (M12's job covers it),
`expiresAt` is 15 minutes as today, and `rows` is nulled on commit rather than
kept.

**Backfill:** none — in-process state does not survive the window by design.
**Runbook consequence:** any import in flight when v1 freezes is lost. Step R3
tells the user to finish or abandon imports before the window. This is stated
because it is the one user-visible casualty of the freeze.

**Rows that violate today:** none — new table.

**Verification:** the commit path reads rows from the batch and **not** from the
request body — that is the whole point of D9, and the test is that a commit
carrying a tampered body commits the *stored* rows; a batch cannot be committed
twice; an expired batch returns `410 import_expired`; a restart no longer loses
a preview (kill the process between preview and commit and the commit
succeeds — this is the mutation that proves the migration did something).

**Rollback:** `DROP TABLE "ImportBatch"; DROP TYPE ...;` and the backend falls
back to the in-process store, which is still in the code behind a flag until
one release after cutover.

---

### Task 2.12 — M12: credential hygiene

**Unfreezes:** `11-invites-users.md` D5 (`:696-719`) — `InviteToken.token`
stores the **raw** value while `PasswordResetToken.token` stores a SHA-256
digest, and the invite is the higher-value credential; plus the missing index
on `PasswordResetToken.expiresAt` (`:719`), the one place a sweep needs it.

**A correction to the spec, verified against the migrations.**
`11-invites-users.md` D5 item 4 asks for "the missing `expiresAt` index" and
Plan 7 (`:3517-3518`) repeats it. `InviteToken` **already has one** —
`prisma/migrations/20260523162529_init/migration.sql:274` creates
`InviteToken_expiresAt_idx`, and `schema.prisma:178` declares it. The missing
index is on **`PasswordResetToken`** only. This migration adds that one and
nothing else; a redundant `CREATE INDEX` on `InviteToken` is a no-op that
misleads the next reader.

**Prisma model change:**

```prisma
model InviteToken {
  tokenHash String? @unique      // RENAMED from `token`, and now a digest.
                                 // Nullable: Postgres UNIQUE permits many NULLs,
                                 // which is exactly the partial-unique semantics
                                 // used rows need. Prisma models this directly.
}

model PasswordResetToken {
  @@index([expiresAt])           // NEW
}
```

**DDL:**

```sql
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");

-- Prerequisite, performed at runbook step R5 BEFORE this migration runs:
--   UPDATE "InviteToken" SET "expiresAt" = now() WHERE "usedAt" IS NULL;
-- Every outstanding invite is dead by the time the column changes, so no
-- live credential is destroyed by the rename.

ALTER TABLE "InviteToken" RENAME COLUMN "token" TO "tokenHash";
ALTER TABLE "InviteToken" ALTER COLUMN "tokenHash" DROP NOT NULL;
UPDATE "InviteToken" SET "tokenHash" = NULL;   -- the plaintext values are gone
```

`UPDATE ... SET NULL` rather than a digest backfill: the values are plaintext
secrets, hashing them would preserve working credentials that were minted under
the old scheme, and every one of them was expired at R5 anyway. Used rows keep
their `usedAt`, `userId` and `invitedById` — the history survives; only the
credential is erased.

**Rows that violate today:** every unused `InviteToken` row is a live plaintext
credential. They are expired at R5 and nulled here. **The user must know that
anyone holding an unaccepted invite link will need a new one** — that is R3's
announcement, not a surprise on the day.

**Verification:** `SELECT count(*) FROM "InviteToken" WHERE "tokenHash" IS NOT NULL;`
is zero immediately after; a newly issued invite stores a 64-character hex
digest and the raw value appears in the email and nowhere else — assert that the
raw value is **not** in the response body, not in any log line, and not in the
database; accepting the invite works; accepting it twice does not; the dual-form
lookup path Plan 7 shipped (tolerating v1's plaintext rows) is **deleted** in
the same release, and its deletion is what proves this migration landed.

**Rollback:** drop the `PasswordResetToken` index and rename the column back.
The nulled plaintext values are **not** recoverable and are not meant to be —
this is the one deliberately one-way step in Part 2, and it is one-way in the
safe direction.

---

### Task 2.13 — M13: `User.sessionsValidFrom`

**Unfreezes:** C7 (`_DECISIONS.md:120-129`) — "a role change does not revoke a
live token. No session-invalidation column exists, so under C1 the mitigation is
TTL." Plan 7 converts that mitigation into real refresh-token revocation
(`:15-16`, `:823-825`), which closes the 30-day hole but leaves the 900-second
one: an access token minted a minute before a demotion still carries the old
claims until it expires.

**Prisma model change:**

```prisma
model User {
  sessionsValidFrom DateTime?   // NEW — access tokens with iat < this are refused
}
```

**DDL:**

```sql
ALTER TABLE "User" ADD COLUMN "sessionsValidFrom" TIMESTAMP(3);
```

**Backfill:** none. Null means "no invalidation has occurred", which is true of
every user today.

**Rows that violate today:** none.

**When it is enforced — and why the answer is "immediately", not "after v1".**
v1 never reads or writes this column, and null passes the check, so enforcing it
from the moment it exists is invisible to v1 and cannot break token
compatibility. **This is not a token-compatibility release** and must not be
confused with one; the release list is in § "Releasing token compatibility".
`verifyAccessToken` gains a database read on the `iat` check, which is a real
cost on a hot path — cache the value per user for the token's remaining TTL, or
accept the read; measure it in the rehearsal and decide with a number.

**Verification:** demote a user, then present an access token minted before the
demotion — it is refused with `invalid_token` 401 rather than admitted with
stale claims. That is the mutation: revert the `iat` comparison and this test
must fail.

**Rollback:** `ALTER TABLE "User" DROP COLUMN "sessionsValidFrom";` and the
check short-circuits to the C7 TTL mitigation.

---

### Task 2.14 — M14: email is case-insensitive, and a deleted user's address is released

**Unfreezes:** `16-imports.md` D2 (`:658-675`, R25/R28/R60) — `User.email` is a
plain unique column with no `citext`, so `Foo@x.com` and `foo@x.com` create two
accounts and a capitalised address can only be logged into with that exact
capitalisation; and Plan 5's deferral (`:1684`) — a soft-deleted student's email
is reserved forever because the unique is unconditional.

**Both halves in one migration, because they touch the same index and applying
them separately means building it twice on a large table.**

**Prisma model change:** the normalisation is a data change plus a functional
unique index; Prisma cannot model either. **D-13.10 applies again:** the schema
keeps `email String @unique`, and the case-insensitivity and the
soft-delete-release both live in a raw index recorded in
`prisma/CONSTRAINTS.md`.

**DDL, backfill and repair:**

```sql
-- (a) Find collisions FIRST. Run at R2. These block the migration.
SELECT lower("email") AS norm, count(*) AS n, array_agg("id" ORDER BY "id") AS ids
  FROM "User" GROUP BY 1 HAVING count(*) > 1;

-- (b) Normalise. Safe only once (a) returns nothing after triage.
UPDATE "User" SET "email" = lower("email") WHERE "email" <> lower("email");

-- (c) Swap the unconditional unique for one that ignores deleted rows.
ALTER TABLE "User" DROP CONSTRAINT "User_email_key";
CREATE UNIQUE INDEX "User_email_active_key" ON "User" ("email") WHERE "deletedAt" IS NULL;
CREATE INDEX "User_email_idx" ON "User" ("email");   -- lookups still need one
```

**Rows that violate today — and this is the one that can stop the window.**
Query (a) may return real collisions: two accounts, differing only in case, both
with logins, submissions and attendance. **No migration may merge them.**
Merging two users is a product operation with irreversible consequences for
attendance history and submission ownership. If (a) returns rows:

- **[USER] resolves each pair before the window** — soft-delete the unused one,
  or rename it. This is R2 work, days early, not window work.
- **If any collision is unresolved at R8, M14 does not run and the window
  proceeds without it.** M14 is the only migration in this set that is
  optional on the day, because it is the only one whose blocker cannot be
  resolved by a machine. Every other migration is all-or-nothing.

The second half also has an interaction worth stating: after (c), two
soft-deleted users may share an address, and a *third* live one may reuse it.
`GET /users` must therefore never key on email, and the auth path must select
`WHERE email = $1 AND "deletedAt" IS NULL` — verify both, because a `findUnique`
on `email` will no longer compile once Prisma sees the index change.

**Verification:** `SELECT count(*) FROM "User" WHERE "email" <> lower("email");`
is zero; a login with a differently-cased address succeeds; creating a user with
the email of a soft-deleted user succeeds; creating one with the email of a live
user still returns `409 email_taken`; the importer's in-file duplicate
detection (already case-insensitive per Plan 12) now agrees with the database.

**Rollback:** drop both new indexes, recreate `User_email_key`. **The
lower-casing in (b) is not reversible** — the original casing is not preserved.
If that matters, add a `CREATE TABLE user_email_backup AS SELECT id, email FROM "User";`
as step (a0) and drop it one release later. Do that; it costs nothing.

---

### Task 2.15 — M15: quiz and video-quiz integrity

**Unfreezes:** `12-quizzes.md` D3 (`:1136-1139` — answer snapshots) and D9
(`:1215-1219` — `Quiz.deletedAt`); `13-video-quizzes.md` D2 (`:782-797` — video
duration), D6 (`:833-841` — question soft delete), D10 (`:889-901` — persisted
video score) and D13 (`:953-963` — `updatedById`); Plan 6 (`:1617`, `:4002-4006`)
and Plan 10 (`:6361-6367`) both book this block.

**Prisma model change:**

```prisma
model Quiz {
  deletedAt DateTime?                    // 12 D9 — cascade today is total
  @@index([deletedAt])
}

model QuizAnswer {
  optionsSnapshot String[] @default([])  // 12 D3 — option text AS TAKEN
  pointsSnapshot  Int?                   // 12 D3 — points AS TAKEN
}

model Session {
  videoDurationSeconds Int?              // 13 D2 — fetched once when youtubeUrl is saved
}

model SessionVideoQuestion {
  updatedById Int?                       // 13 D13
  updatedBy   User?     @relation("VideoQuestionUpdatedBy", fields: [updatedById], references: [id], onDelete: SetNull)
  deletedAt   DateTime?                  // 13 D6 — hard delete cascades to responses
  @@index([deletedAt])
}

model SessionVideoQuestionResponse {
  pointsAwarded Int?                     // 13 D10 / R8 — points AS AWARDED
}
```

**Backfill — and the honest limit on it:**

```sql
-- Points as awarded: recoverable, because isCorrect and the question's CURRENT
-- points are both known. This is right for every response whose question has
-- not been edited since, and wrong for every one whose has. There is no way to
-- distinguish them: that is precisely the defect being closed.
UPDATE "SessionVideoQuestionResponse" r
   SET "pointsAwarded" = CASE WHEN r."isCorrect" THEN q."points" ELSE 0 END
  FROM "SessionVideoQuestion" q WHERE q."id" = r."questionId";

-- Answer snapshots: NOT backfilled. QuizAnswer.selectedIndex is positional and
-- the option array may have been edited since; writing today's options into a
-- historic answer would fabricate a record of what a student saw.
-- Left null. Null means "taken before snapshots existed" and the grading screen
-- says so.
```

**`videoDurationSeconds` is not backfilled either** — it requires a YouTube Data
API call per session and a key this repository does not hold. It fills in as
sessions are edited. Until then the authoring guard stays client-side, exactly
as Plan 10 shipped it.

**Rows that violate today:** none — all nullable, all additive.

**Verification:** deleting a quiz sets `deletedAt` and leaves every `QuizGrade`,
`QuizAttempt` and `QuizAnswer` intact (the mutation: restore the hard delete and
the "grades survive a quiz delete" test must fail); a graded attempt renders
from its snapshot even after the question's options change — assert by editing
the options and re-reading the attempt; `pointsAwarded` is written on every new
response and read by the results endpoint instead of being recomputed (C4).

**Rollback:** drop the columns and the two indexes; `pointsAwarded`'s backfill
is derived and discarding it loses nothing that was not already derivable.

---

### Task 2.16 — M16: forum moderation

**Unfreezes:** `14-forum.md` D2 items 3 and 4 (`:626-637`, R48/R57) and §2
(`:87-88`), Plan 10's **D-14.4** (`:186-192`) — which names this as the residual
product risk it shipped with: a leader's only remedy for an entire inappropriate
forum post is to contact the author, and the UI says so.

**Prisma model change:**

```prisma
model Submission {
  hiddenAt   DateTime?            // NEW — hides a forum post from peers
  hiddenById Int?
  hiddenBy   User?     @relation("SubmissionHiddenBy", fields: [hiddenById], references: [id], onDelete: SetNull)
}

model ForumComment {
  deletedAt DateTime?             // NEW — comment delete stops being physical
  @@index([deletedAt])
}
```

**Why `hiddenAt` and not reverting `status` to `DRAFT`:** `14-forum.md` D2 names
reverting to `DRAFT` as the available lever and immediately says it overloads
`DRAFT` further and collides with `08-submissions.md` D3. Plan 10 considered and
refused it (`:186-192`). `hiddenAt` is the column that was blocked; it is
unblocked here and the overload is not adopted.

**The report/flag half of D2 item 4 is deliberately not built.** A student-facing
report action needs a row, a triage surface, an SLA and a person who reads it.
`AuditLog` (M9) is not that, and a report queue nobody watches is worse than no
report button. **This goes to `DROPPED.md`** with the reason, and it is a
follow-up plan, not a column added on the way past.

**Backfill:** none.

**Rows that violate today:** none.

**Verification:** a hidden post disappears from the peer feed and remains
visible to its author and to staff, with `hiddenBy` shown to staff; comment
delete sets `deletedAt` and every comment read filters on it; `canDelete` on the
contract still governs the control (C4 — the client renders what it is given).

**Rollback:** drop the FK, the index and the three columns. A post hidden before
rollback becomes visible again — the safe direction, and the reason `hiddenAt`
is preferred over a destructive removal.

---

### Task 2.17 — M17: stored HTML is normalised once (**held behind a product gate**)

**Unfreezes:** C11 (`_DECISIONS.md:175-188`) — "Converting stored HTML to
structured rich text is a migration, so under C1 it is a cutover task";
`09-notes.md` D1 (`:604-618`), `07-assignments.md` §10 item 10 (`:636-643`),
`14-forum.md` D11 (`:739-745`), Plan 10 (`:723-725`).

Note bodies, assignment descriptions and forum posts are unsanitised HTML in the
database. v2 strips tags and decodes entities **on read** at the API boundary
(Plans 8 and 10) so React Native gets text and mail gets escaped text. That
works and is not urgent to change. What it costs is a permanent sanitiser
dependency on a hot path and a column whose contents nobody can reason about.

**This migration normalises the stored rows so the read-time strip can be
removed.** It is authored now, and it is the one migration in this set that is
**applied only if the user says so at step R12**, because:

- it rewrites the text of pastoral records about named young people;
- the read-time strip already makes the data safe, so nothing is at risk if it
  is skipped;
- and `09-notes.md` is explicit that the note domain's decisions belong to
  whoever owns pastoral policy, not to an engineer.

**DDL and backfill:**

```sql
-- (a) Full copies first. These are the rollback and they are not optional.
CREATE TABLE "_m17_note_html"       AS SELECT "id","body"        FROM "EngagementNote";
CREATE TABLE "_m17_assignment_html" AS SELECT "id","description" FROM "Assignment";
CREATE TABLE "_m17_submission_html" AS SELECT "id","text"        FROM "Submission";

-- (b) Normalise OUT OF BAND, not in SQL. regexp-based HTML stripping in
--     Postgres is wrong in ways that only show up on the rows you care about.
--     The conversion runs through the SAME function the API already uses —
--     apps/backend/src/lib/html-text.ts (htmlToPlainText) — via a one-off
--     script in apps/backend/scripts/m17-normalise.ts, batched, resumable,
--     logging only row ids and never row contents.
```

**Rows that violate today:** none (no constraint), but a class of rows will
convert badly: a note body that was never HTML but happens to contain a `<`
character. The script therefore **skips any row where `htmlToPlainText(x) === x`
is false but the input contains no recognised tag**, lists them, and leaves them
alone.

**Verification:** row counts match the backup tables exactly; a 200-row sample
is diffed by hand; no row became empty (`body` has a 2-character minimum in the
contract — a row that normalises to `''` is a bug, not a short note); the
read-time strip is removed and every note/assignment/forum test still passes,
which is the mutation that proves the data changed.

**Rollback:** restore from the three `_m17_*` tables by id. They are dropped one
release after cutover, by a separate migration, after the user confirms.

---

### Task 2.18: Rehearse the whole set against a restored copy

**Files:** none in the repo — this runs against the throwaway database from the
Prerequisites.

- [ ] **Step 1: Restore a fresh copy** of the production backup into the
  throwaway database. Fresh, not the one from last week: the violating-row
  counts change daily.
- [ ] **Step 2: Apply all seventeen** with `prisma migrate deploy` against the
  copy, timing each. Record the wall-clock per migration — R10's budget comes
  from this number, not from a guess. The `CREATE UNIQUE INDEX` in M1 and the
  index rebuild in M14 are the two that scale with row count.
- [ ] **Step 3: Run every verification query** from M1–M17 and record the
  actual numbers. These become the expected values at R12.
- [ ] **Step 4: Run the full integration suite serially** against the copy:
  `npx jest --config jest.integration.config.js --runInBand --testPathPattern integration`.
  Green, with the post-migration code (the `schema.cutover.prisma` models
  generated and the deferred behaviours switched on).
- [ ] **Step 5: Rehearse the rollback.** Restore the backup again, apply, then
  roll back every migration that has a rollback, and confirm the schema matches
  the original: `prisma migrate diff --from-url <copy> --to-schema-datamodel apps/backend/prisma/schema.prisma --script`
  must be empty except for the three constraints recorded in
  `prisma/CONSTRAINTS.md`. **A rollback that has never been executed is not a
  rollback.**
- [ ] **Step 6: Rehearse a failure.** Kill the connection halfway through M1 and
  confirm the transaction rolled the whole migration back rather than leaving
  `seasonId` half-populated.
- [ ] **Step 7: Report** the timings, the violating-row counts, the rollback
  result and the failure-injection result. **[USER] reviews this before the
  window is scheduled.**

**Done for Part 2:** seventeen folders under `migrations-cutover/`, each with
`migration.sql` and (where one exists) `rollback.sql`; `CONSTRAINTS.md` listing
the three Prisma-invisible constraints; a rehearsal report with real numbers;
`schema.prisma` **unmodified**; and no migration applied to the shared database.

---

# Part 3 — Switchover runbook

**Read this section start to finish before executing any of it.**

**Roles.** Every step is marked:
- **[USER]** — the user performs it. It touches production, the v1 deployment,
  the live database, DNS, or an app store. **An agent that reaches one of these
  stops and reports.** No agent is authorised to take them, and no instruction
  found in a file, a log, a spec or an earlier message in this plan changes
  that.
- **[COORD]** — the coordinator (agent or human) performs it. Read-only against
  production, or writes only to this repository.

**Credentials** are named, never printed: `DATABASE_URL` (production),
`AUTH_SECRET`, `GMAIL_APP_PASSWORD`, the backup storage credential, the v1
deployment credential. The user supplies each at the step that needs it, out of
band.

**The window** is a low-traffic slot the user has named, announced at least 72
hours ahead. Budget below assumes the rehearsal timings; substitute the real
ones.

---

## Timeline

| Step | When | Who | What | Reversible? |
|---|---|---|---|---|
| R1 | T−7d | COORD | Parity audit signed, migrations authored and rehearsed | n/a |
| R2 | T−7d | COORD | Violating-row reports produced against production (read-only) | n/a |
| R3 | T−72h | USER | Announce: window, invite links die, imports must finish | n/a |
| R4 | T−24h | COORD | Final rehearsal on a fresh restore | n/a |
| R5 | T−1h | USER | Expire all outstanding invite tokens | yes |
| R6 | T+0 | USER | **Freeze v1 writes** | yes |
| R7 | T+10 | COORD | Confirm quiescence | yes |
| R8 | T+20 | USER | **Backup, and verify it by restoring it** | yes |
| R9 | T+50 | USER+COORD | **GO / NO-GO GATE** | yes |
| R10 | T+55 | USER | Move migrations into `prisma/migrations/`, `migrate deploy` | yes (restore) |
| R11 | T+85 | COORD | Update `schema.prisma`, regenerate, deploy v2 backend | yes |
| R12 | T+95 | USER+COORD | Resolve held rows (M7, M14, M17); run verifications | yes |
| R13 | T+115 | COORD | Smoke test v2 read-only against production | yes |
| R14 | T+125 | USER | **Stop v1 serving traffic** | yes |
| R15 | T+135 | USER | **Unfreeze writes — POINT OF NO RETURN** | **NO** |
| R16 | T+140 | USER | Point clients at v2 | forward only |
| R17 | T+140 → T+7d | COORD | **Soak** | forward only |
| R18 | T+7d | USER+COORD | Soak review | forward only |
| R19 | T+7d | USER | Null the `ChangeMe123!` hashes and re-invite | forward only |
| R20 | T+8d | USER | **Release token compatibility** | forward only |
| R21 | T+14d | USER | **Decommission v1** | forward only |

---

## The steps

### R1 — Preconditions **[COORD]**

- [ ] Part 1 complete: `UNVERIFIED` is zero, `DROPPED.md` signed.
- [ ] Part 2 complete: seventeen migrations authored, Task 2.18's rehearsal
      report reviewed by the user.
- [ ] `pnpm turbo lint typecheck test:unit build` green; full serial integration
      suite green. Counts recorded.
- [ ] The v2 backend is deployed and reachable at its production URL, running
      the **pre-migration** code, and has been serving alongside v1.

### R2 — Violating-row reports **[COORD]**

Read-only queries against production, output to
`docs/superpowers/audits/2026-cutover/`:

- [ ] `M1-disagreements.tsv`, `M1-orphans.tsv` (Task 2.1)
- [ ] `M2-duplicates.tsv` (Task 2.2)
- [ ] `M3-late-zero.txt` — the `status='LATE' AND lateMinutes=0` count
- [ ] `M4-unmapped-links.tsv` — **any unrecognised link shape is a no-go input**
- [ ] `M7-orphan-season-events.tsv` (Task 2.7)
- [ ] `M14-email-collisions.tsv` — **[USER] resolves these before R9**

**Rollback:** n/a — nothing was written.

### R3 — Announce **[USER]**

- [ ] The window, in the organisation's own timezone.
- [ ] **Every unaccepted invite link stops working at R5.** Anyone mid-signup
      gets a new one after cutover.
- [ ] **Any spreadsheet import in progress must be committed or abandoned before
      R5** — in-flight previews live in process memory and do not survive
      (Task 2.11).
- [ ] Reports will show different numbers afterwards: `Submitted %` changes to
      the targeted denominator (`17-reports.md` D2, C5) and attendance lateness
      is recomputed from session start (C3, M3). **Announce this rather than let
      it be discovered** — the spec says so in as many words.

### R4 — Final rehearsal **[COORD]**

- [ ] Fresh restore, all seventeen applied, all verifications run, timings
      recorded. If any number differs materially from Task 2.18's, find out why
      before R9.

**Rollback:** drop the throwaway database.

### R5 — Expire outstanding invites **[USER]**

```sql
UPDATE "InviteToken" SET "expiresAt" = now() WHERE "usedAt" IS NULL;
```

- [ ] Record the affected row count. These people need re-inviting at R19.

**Rollback:** the previous `expiresAt` values are gone. Take a copy first:
`CREATE TABLE "_r5_invite_expiry" AS SELECT "id","expiresAt" FROM "InviteToken" WHERE "usedAt" IS NULL;`
— do this, it costs one statement.

### R6 — Freeze v1 writes **[USER]** — T+0

**This is an operator action on the v1 deployment. This plan does not edit
`jpc-space`.** The user picks the mechanism their hosting supports, in order of
preference:

1. **Scale the v1 web process to zero.** Cleanest — no writes are possible
   because nothing is running. v1 is unreachable from here until R21, which is
   fine: the whole point is that v2 serves the traffic.
2. **Put the v1 deployment into maintenance mode**, if the platform has one.
3. **Revoke the v1 deployment's database write grant:**
   `REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM <v1_role>;`
   Only if v1 connects as its own role. Verify that it does before relying on
   it — if both apps share one role, this locks out v2 as well.

- [ ] Record which mechanism was used. R14 and the rollback both depend on it.

**Rollback:** reverse the mechanism. v1 resumes serving. Nothing has changed in
the database.

### R7 — Confirm quiescence **[COORD]** — T+10

- [ ] No connection from the v1 host:
      `SELECT pid, usename, application_name, client_addr, state FROM pg_stat_activity WHERE datname = current_database();`
- [ ] No row written in the last five minutes on the hot tables:

```sql
SELECT 'Attendance' t, max("updatedAt") FROM "Attendance"
UNION ALL SELECT 'Submission',  max("updatedAt") FROM "Submission"
UNION ALL SELECT 'Notification',max("createdAt") FROM "Notification"
UNION ALL SELECT 'GroupStudent',max("enrolledAt") FROM "GroupStudent"
UNION ALL SELECT 'SeasonEnrollment', max("updatedAt") FROM "SeasonEnrollment";
```

- [ ] **Freeze v2 writes too.** v2 is still deployed and still serving; set its
      environment to read-only for the duration (or scale it to zero as well).
      A migration racing v2's own writes is the same hazard as one racing v1's.

**Rollback:** unfreeze both. Nothing has changed.

### R8 — Backup, and verify it **[USER]** — T+20

- [ ] `pg_dump` (custom format, compressed) using the production
      `DATABASE_URL`, to the storage the user names.
- [ ] Record the byte size and the row count of five tables from the dump's
      table-of-contents.
- [ ] **Restore it into the throwaway database and query it.** A backup that has
      not been restored is a file, not a backup. This is the single most
      important step in the runbook and the one most likely to be skipped
      because the window is running.
- [ ] Confirm the restored copy's row counts match production.

**Rollback:** n/a — read-only against production.

### R9 — GO / NO-GO GATE **[USER] + [COORD]** — T+50

**Every line must be a yes. One no is a no-go, and a no-go means unfreeze at
R6's mechanism and go home. Rescheduling is cheap; a half-migrated shared
database is not.**

- [ ] Backup taken **and verified by restore** (R8).
- [ ] v1 is confirmed quiescent; v2 is frozen (R7).
- [ ] All seventeen migrations rehearsed on a fresh restore within the last 24
      hours, all verifications passing (R4).
- [ ] The rollback has been **executed** at least once (Task 2.18 step 5).
- [ ] `M4-unmapped-links.tsv` contains **no unrecognised link shape**. If it
      does, the mapping is incomplete and a notification will open the wrong
      screen — **no-go**.
- [ ] `M14-email-collisions.tsv` is empty, **or** the user has explicitly agreed
      to run the window **without M14** (it is the only optional one — Task
      2.14).
- [ ] The held-row lists for M7 (orphan season events) are in hand and the user
      is present to decide them at R12.
- [ ] **No migration has been added to the set since the rehearsal.** A
      migration discovered today is a no-go, not a hotfix.
- [ ] The user is present, and remains present, for R10 through R15.
- [ ] There is enough window left for R10–R15 **plus the rehearsed rollback
      time, doubled**. Running out of window mid-migration is how a rollback
      becomes a data-loss event.

### R10 — Apply the migrations **[USER]** — T+55

- [ ] Move the seventeen folders:
      `mv apps/backend/prisma/migrations-cutover/2026* apps/backend/prisma/migrations/`
- [ ] Apply, **and only this command**:
      `cd apps/backend && npx prisma migrate deploy`
- [ ] **Not** `migrate dev`. **Not** `db push`. **Not** `migrate reset`. If
      `migrate deploy` reports drift, **stop** — do not resolve it under time
      pressure. Drift means production is not the schema the rehearsal ran
      against, and every rehearsed number is void. That is a no-go, taken late.
- [ ] Record the wall-clock per migration; compare to R4.

**Rollback:** restore the R8 backup. Do not hand-unwind seventeen migrations at
T+80 — the per-migration `rollback.sql` files exist to reason about a single
failure, not to unwind the set.

### R11 — Update the schema and deploy **[COORD]** — T+85

- [ ] `cp apps/backend/prisma/schema.cutover.prisma apps/backend/prisma/schema.prisma`
      and delete `schema.cutover.prisma`. **This is the first time `schema.prisma`
      changes in this entire plan.**
- [ ] `pnpm --filter @space/backend db:generate`
- [ ] `pnpm turbo lint typecheck build` — green.
- [ ] Deploy the post-migration backend: the deferred behaviours switch on
      (note delete stops returning 501, `POST /me/devices` stops returning 503,
      the import batch table replaces the in-process store, `sessionsValidFrom`
      is enforced, the dual-form invite lookup is deleted).
- [ ] `prisma/CONSTRAINTS.md` is committed in the same change.

**Rollback:** redeploy the previous backend image and restore the R8 backup.

### R12 — Resolve the held rows, run the verifications **[USER] + [COORD]** — T+95

- [ ] **[USER]** decides each orphan `SEASON`-visibility event (M7), then
      `VALIDATE CONSTRAINT "JpcEvent_season_scope_ck"`.
- [ ] **[USER]** decides whether M17 (HTML normalisation) runs at all. If no, it
      stays authored and unapplied; the read-time strip stays. Record the
      decision in `DROPPED.md`.
- [ ] **[COORD]** runs every verification query from M1–M17 and compares to R4's
      recorded values. Any material divergence is escalated **before** R14.
- [ ] **[COORD]** produces the reconciliation figures for the user: the M3
      late-zero count, the before/after absence-budget deltas for five seasons,
      the M1 disagreement count resolved, the M4 backfill coverage.

**Rollback:** restore the R8 backup.

### R13 — Smoke test **[COORD]** — T+115

Against production, with writes still frozen. Read paths only.

- [ ] Log in as one account of each of the five roles (accounts the user
      provides; credentials supplied out of band and never logged).
- [ ] Each role's dashboard, calendar, and one detail screen render.
- [ ] A student whose group changed under M1 sees their **current** group, and
      their previous season's assignments are visible again — this is M1's
      whole point and it is the one thing a smoke test can actually prove.
- [ ] A notification from before cutover opens the right screen (M4).
- [ ] `/api/v1/health` is green; `/api/docs` serves.

**Rollback:** restore and redeploy.

### R14 — Stop v1 serving traffic **[USER]** — T+125

- [ ] Make R6's freeze permanent: v1's web process stays at zero, or its
      maintenance mode stays on. **The user performs this on the deployment.
      This plan does not touch the `jpc-space` repository.**
- [ ] v1's `/api/v1` is confirmed unreachable.
- [ ] v1's scheduled jobs, if any, are disabled.

**Rollback:** still possible — bring v1 back up and restore the R8 backup. The
database has changed but no production write has been accepted since R6, so the
backup is still current.

### R15 — Unfreeze writes — **POINT OF NO RETURN** **[USER]** — T+135

- [ ] Lift v2's read-only setting. v2 begins accepting production writes.

**This is the point of no return, and it is here — not at R10 — for one
reason: the R8 backup stops being current the instant a real write lands.**
Everything before this step is undone by restoring that backup. After it, a
restore discards real work by real users. From here the only direction is
forward: a defect found at R17 is fixed by a fix, not by a rollback.

- [ ] The user states, out loud or in writing, that they are crossing it.

### R16 — Point clients at v2 **[USER]** — T+140

- [ ] The mobile app's API base URL points at the v2 backend. If clients were
      already pointed there, this is a no-op — confirm it rather than assume it.
- [ ] Any DNS or reverse-proxy route that served v1's `/api/v1` now serves v2's.
- [ ] Anything still holding v1's URL (a bookmark, a webhook, an integration) is
      enumerated and redirected.

**Token compatibility is what makes this step boring**, and it is why the
constraint existed: a client holding a v1-minted access token presents it to
v2 and is admitted, because the secret, the audience, the claims and the TTLs
are identical. Nobody is logged out. **Do not release the constraint here.**

### R17 — Soak **[COORD]** — T+140 to T+7d

Watch, do not change. Ship nothing but a fix for something on this list.

**Metrics, with the threshold that makes each one an alarm:**

| Metric | Source | Alarm |
|---|---|---|
| 5xx rate by route | backend logs | > 0.5% of requests on any route, or any `internal_error` at all on a write route |
| `invalid_token` 401 rate | auth middleware | > 2× the pre-cutover baseline (M13 enforcement is the suspect) |
| Refresh success rate | `/auth/refresh` | < 99% |
| p95 latency, five hottest routes | backend logs | > 1.5× the pre-cutover baseline (M13's per-request user read is the suspect) |
| Rows written per hour, per table | `pg_stat_user_tables` `n_tup_ins/upd` | any table at < 50% or > 200% of the pre-cutover hourly baseline |
| `GroupStudent` unique violations | Postgres error log | any — the composite FK and unique should make them impossible |
| Notifications with null `entityType` | query | any **new** row (backfilled nulls are expected; a new one means a producer regressed) |
| Push registrations | `DeviceToken` row count | grows from zero; a flat zero after 48h means the client never reached the endpoint |
| Attendance `lateBasis` distribution | query | any new row with `UNKNOWN` — every v2-written row should be `SESSION_START` or `MANUAL` |
| Audit rows per privileged action | `AuditLog` | zero rows for a day in which a role changed or an export ran |
| Backup freshness | backup job | anything other than daily and verified |

- [ ] **Daily:** the table above, plus a scan of `AuditLog` for anything
      surprising.
- [ ] **Daily:** confirm the automated backup ran **and restored**. The R8
      backup is now historical; the current one is what protects the window's
      output.
- [ ] **Once, at T+48h:** re-run the parity audit's spot checks for the five
      authorization-bearing domains against the running system.

### R18 — Soak review **[USER] + [COORD]** — T+7d

- [ ] Every metric within threshold for five consecutive days.
- [ ] No open severity-1 defect.
- [ ] The reconciliation figures from R12 have been accepted by the
      organisation — specifically the `Submitted %` change and the recomputed
      lateness, which are the two numbers people will notice.
- [ ] **[USER]** signs off. Without a signature, R19–R21 do not run and the
      soak continues.

### R19 — Retire the shared password **[USER]** — T+7d

`11-invites-users.md` D2 (`:628-632`): every UI-created v1 user shares one
bcrypt hash of the literal `ChangeMe123!`, printed to stdout with the account's
email and role. **v2 cannot fix this in code** — the rows are loginable by
anyone who knows the literal. The spec's own answer is a one-off operational
step at cutover, and this is it.

- [ ] Identify the affected rows by verifying the literal against each
      `passwordHash` with `bcrypt.compare` in a throwaway script — **never by
      pasting a hash or the literal anywhere, and never logging either**. The
      script outputs user ids only.
- [ ] `UPDATE "User" SET "passwordHash" = NULL WHERE "id" = ANY($1);`
- [ ] Issue a fresh invite to each, plus the R5 list.
- [ ] Confirm: `SELECT count(*)` of accounts where the literal verifies is
      zero.

### R20 — Release token compatibility **[USER]** — T+8d

See § "Releasing token compatibility" below for the full list and the reasoning.
Not before this step, because until R18 signs off, "point the clients back at
v1" is still a contingency, and a rotated secret makes every session in flight
fail on both sides at once.

### R21 — Decommission v1 **[USER]** — T+14d

- [ ] v1's deployment is deleted (not merely stopped).
- [ ] v1's environment variables are deleted from the hosting platform —
      **including its copy of `AUTH_SECRET` and `DATABASE_URL`**, which is half
      the point of R20.
- [ ] v1's database role's remaining grants are revoked.
- [ ] The `jpc-space` repository is **archived, by the user, in the GitHub UI**.
      This plan does not run `git` in that repository, and archiving is not a
      `git` operation anyway.
- [ ] `CLAUDE.md` in this repository is updated: the read-only constraint on
      `jpc-space` becomes a historical note, "no migrations are created here"
      is deleted, and the token-compatibility clause is replaced by whatever
      R20 left in place. **This is the change that closes C1.**
- [ ] `_DECISIONS.md` gains a header noting that C1 was lifted on this date and
      which migrations discharged it.

---

## Rollback summary

| Up to | Rollback |
|---|---|
| R5 | Restore `"_r5_invite_expiry"`. |
| R6–R9 | Reverse R6's freeze mechanism. Database untouched. |
| R10–R14 | Restore the R8 backup, redeploy the pre-migration backend, reverse R6. No production write has been accepted since R6, so nothing real is lost. |
| **R15 onward** | **None.** Forward fixes only. |

The rollback for R10–R14 is **restore the backup**, not "run seventeen
`rollback.sql` files". The per-migration rollbacks exist so a single failure can
be reasoned about, and so Task 2.18 step 5 can prove the schema is reversible.
Under window pressure, restore.

---

## Releasing token compatibility

**The constraint, restated:** while both systems run, v2's tokens must be
interchangeable with v1's — HS256 via `jose`, the same `AUTH_SECRET` value,
audience `jpc-mobile`, subject `String(userId)`, the same claim names, access
900s, refresh 30d (`CLAUDE.md`; `apps/backend/src/lib/auth/tokens.ts:10-49`).
Both systems serve `/api/v1` (`jpc-space/src/app/api/v1/`), so a client's token
may reach either.

**When it is released: at R20, after v1 has stopped serving (R14), after the
point of no return (R15), and after the soak signs off (R18).** Not at R14 —
until R18, "point the clients back at v1" is a live contingency, and a rotated
secret would take that away without warning.

**What changes at R20:**

1. **`AUTH_SECRET` is rotated** to a value only v2 holds. The old value lived in
   two deployments' environments and in whatever tooling touched either.
   **Cost: at most 900 seconds of `invalid_token` 401s.** Refresh tokens are
   random strings hashed in `RefreshToken.tokenHash`, not JWTs — they do not
   depend on the secret — so every client silently re-obtains an access token
   on its next refresh. Announce it anyway; a synchronised burst of 401s looks
   like an incident.
2. **An issuer claim is added and verified.** `iss: "jpc-space-v2"`, set in
   `signAccessToken` and required in `jwtVerify`. Impossible while v1 mints
   tokens without it.
3. **`sessionsValidFrom` (M13) becomes the documented revocation mechanism**
   rather than a belt-and-braces addition, and the C7 TTL note in
   `_DECISIONS.md` is annotated as discharged.
4. **Refresh rotation with reuse detection** is enabled: a refresh token is
   single-use, and presenting a used one revokes the whole chain for that user.
   `RefreshToken.revokedAt` already exists (`schema.prisma:190`), so this is
   code, not a migration.

**What deliberately does not change:**

- **The audience stays `jpc-mobile`.** Changing it invalidates every live token
  for no gain — the audience is not a secret and no other issuer uses it. Churn
  without benefit.
- **The TTLs stay 900s / 30d.** They were chosen for C7's mitigation and M13
  now backs them with real revocation. Shortening them post-hoc trades battery
  and network for a risk that has already been closed.
- **The claim set stays as it is.** Narrowing it (dropping `activeSeasonId` and
  `graduationYear` in favour of a database read) is defensible and is a
  follow-up with its own performance argument, not a cutover step.

---

## Decisions

- **D-13.1 — The parity audit is per-rule and citation-bearing, not per-domain
  and narrative.** 1,475 rows in a TSV, one per rule, each carrying a v2
  `file:line`. A domain-level "domain 9 looks fine" is exactly the summary that
  let three authorization gaps ship into v2 before Wave A caught them (C8). A
  rule with no citation is `UNVERIFIED`, and `UNVERIFIED` must be zero before
  Part 2 begins.

- **D-13.2 — Audit agents may write exactly one file, their own ledger, and may
  only append to it.** "Read-only" as an absolute would mean 1,475 rows come
  back in chat messages, which does not fit and which loses the rows that
  matter. The exception is bounded to one path per agent, append-only, and every
  other write — including to a spec, a plan or a source file — is forbidden. Both
  repositories remain untouched; `jpc-space` remains untouched absolutely.

- **D-13.3 — `NA` is the audit's dangerous verdict and is re-checked at 100% in
  the five authorization-bearing domains.** It is the verdict an agent under
  context pressure reaches for, and the specs' most valuable rules — the ones
  describing a gate that does not exist — are the easiest to mistake for a
  Next.js implementation detail.

- **D-13.4 — Authored migrations live in `prisma/migrations-cutover/`, which
  Prisma does not read.** This is the mechanical guarantee that nothing in this
  plan can be applied during normal development, by a stray `migrate deploy`, by
  CI, or by an agent executing a later task. They are moved into
  `prisma/migrations/` by the user, once, at R10. `schema.prisma` itself is not
  modified until R11.

- **D-13.5 — Migrations are generated with `prisma migrate diff` between two
  schema *files*, never `--from-url`.** No command in Part 2 opens a connection
  to the shared database with intent to write. `migrate dev`, `db push` and
  `migrate reset` appear in this document only in prohibitions.

- **D-13.6 — Where `04-attendance.md` D1 and ruling C3 disagree on the late
  threshold, C3 wins and M3's column defaults to 0.** The spec recommends a
  hard-coded 15-minute grace; `_DECISIONS.md` rules the threshold is zero until
  the column exists. `_DECISIONS.md` is binding. Raising it to 15 is a product
  decision after cutover, not a default this migration smuggles in.

- **D-13.7 — One `AuditLog` table, not seven sets of audit columns.** Six specs
  ask for attribution on six different tables plus two purpose-built audit
  tables. One append-only polymorphic table serves all of them, is the only
  shape that can record a *read* (an export, a bulk note view — neither has a
  row to hang a column on), and does not widen a hot table. `summary` never
  contains a field value.

- **D-13.8 — M3 recomputes `lateMinutes` rather than annotating it, and does
  not touch `status`.** `checkedInAt` and `Session.startsAt` are both facts, so
  the correct value is recoverable for every row that has a check-in instant —
  which retires C3's two-era divergence instead of documenting it forever.
  Rewriting `status` to match would be rewriting attendance history, which
  nobody has authorised; the affected count is reported to the user instead.

- **D-13.9 — Three constraints are invisible to Prisma and are recorded in
  `prisma/CONSTRAINTS.md`.** `CHECK` constraints (M6's timezone shape, M7's
  season-scope) and partial/functional unique indexes (M14's active-email
  unique) cannot be expressed in PSL and will not be recreated by
  `migrate diff`. The file exists so the next migration author does not drop
  them by regenerating from the datamodel.

- **D-13.10 — Where a constraint can be modelled in Prisma or expressed exactly,
  Prisma wins, and the exact rule stays in the endpoint.** M2 takes
  `@@unique([seasonId, name])` (exact-match, modellable) with case-insensitivity
  in the route, rather than a functional index Prisma would fight. Two layers,
  neither of them drift.

- **D-13.11 — M8 does not backfill `resolvedAt`.** Marking every historic
  `followUpFlagged` note resolved so the new queue opens empty would record that
  follow-ups nobody performed were performed. The queue opens long; that is the
  true state, and a date filter in the UI is the answer.

- **D-13.12 — M15 backfills `pointsAwarded` but not `optionsSnapshot`.** Points
  are recoverable from `isCorrect` and the question's current points; an
  option-text snapshot is not, because the options may have been edited since
  and writing today's into a historic answer would fabricate a record of what a
  student saw. Null means "taken before snapshots existed" and the grading
  screen says so.

- **D-13.13 — M14 is the only optional migration on the day.** Its blocker —
  two real accounts differing only in email case — cannot be resolved by a
  machine, because merging two users is a product operation with irreversible
  consequences for attendance and submission ownership. Every other migration is
  all-or-nothing.

- **D-13.14 — M17 is applied only on the user's explicit say-so at R12.** It
  rewrites the text of pastoral records about named young people, the read-time
  strip already makes the data safe, and `09-notes.md` is explicit that this
  domain's decisions belong to whoever owns pastoral policy.

- **D-13.15 — The point of no return is R15 (writes unfrozen), not R10
  (migrations applied).** Everything up to R15 is undone by restoring the R8
  backup, because no production write has been accepted since the freeze at R6.
  After R15 a restore discards real work by real users.

- **D-13.16 — Token compatibility is released at R20, after the soak signs off,
  and the audience does not change.** Until R18, pointing clients back at v1 is
  a live contingency. What changes is the secret, an issuer claim, refresh reuse
  detection and `sessionsValidFrom`'s status; the audience and TTLs stay, because
  changing them costs every live session and buys nothing.

- **D-13.17 — A migration discovered on the day is a no-go, not a hotfix.** The
  gate at R9 requires that the set is unchanged since the rehearsal. An unrehearsed
  migration against a shared production database at T+55, with the window
  running, is how a cutover becomes an incident.

---

## Done means

- [ ] **v1 serves nothing.** The `jpc-space` deployment is deleted, its
      environment (including its copies of `AUTH_SECRET` and `DATABASE_URL`) is
      removed, its database grants are revoked, and its repository is archived —
      all by the user. No route, no cron, no webhook reaches it.
- [ ] **Every one of the 1,475 numbered rules is in exactly one state**, and the
      ledger proves it:
  - **preserved**, with a v2 `file:line` a reader can check in under a minute;
  - **deliberately diverged**, naming the ruling, spec decision or plan decision
    that authorised it;
  - **explicitly dropped**, with a signed row in
    `docs/superpowers/audits/2026-cutover/DROPPED.md` stating what the
    organisation has lost, in the organisation's words.
- [ ] `UNVERIFIED` is zero. No rule is unaccounted for.
- [ ] **Every C1 deferral is discharged or registered.** Each of the seventeen
      migrations is applied (or, for M14 and M17, explicitly declined and
      recorded), and every "deferred to cutover" line in the seventeen specs and
      the twelve plans resolves to one of them or to a `DROPPED.md` entry.
- [ ] `prisma/migrations-cutover/` is empty; `prisma/migrations/` holds the
      seventeen; `schema.prisma` matches the database; `prisma/CONSTRAINTS.md`
      lists the three Prisma-invisible constraints.
- [ ] The soak's metrics were within threshold for five consecutive days and the
      user signed off (R18).
- [ ] `ChangeMe123!` verifies against no `passwordHash` in the database (R19).
- [ ] No unaccepted plaintext invite token exists (`InviteToken.tokenHash` is
      null for every unused row, and new invites store digests only).
- [ ] Token compatibility is released (R20): the secret is rotated to a
      v2-only value, `iss` is verified, refresh reuse detection is live.
- [ ] `CLAUDE.md` no longer says "no migrations are created here", no longer
      calls `jpc-space` a live system, and no longer carries the
      v1-token-compatibility clause. `_DECISIONS.md` records the date C1 was
      lifted and which migrations discharged it.
- [ ] `pnpm turbo lint typecheck test:unit build` green; the full integration
      suite green under `--runInBand`; suite counts recorded against the
      pre-cutover baseline.
