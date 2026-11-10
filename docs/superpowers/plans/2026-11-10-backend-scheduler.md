# Backend scheduler (no Vercel crons) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Vercel Cron with a request-driven scheduler inside the backend, and move the mentor follow-up reminder onto it, so `vercel.json` has no crons.

**Architecture:** An Express middleware, at most once a minute per instance, calls `maybeRunScheduler()` in the background (`runInBackground`). It takes a database lease (one `SchedulerLease` row, 5-minute hold) with a conditional `UPDATE`, so only one request in the fleet sweeps, and then runs every registered handler. Handlers claim their own rows (stamp-before-send), so a sweep that dies halfway never double-sends. This is the foundation the multi-part assignments plan adds its reminder handler to.

**Tech Stack:** Express 5, Prisma 7 (Postgres), Jest + supertest, `@vercel/functions` `waitUntil` (already wrapped by `lib/background.ts`).

**Spec:** `docs/superpowers/specs/2026-11-10-multi-part-assignments-design.md`, section "Reminders" (owner: "I want the schedule to be inside the backend", "I don't want to use the Vercel scheduler", "remove any crons from vercel").

## Global Constraints

- No Vercel Cron, no Vercel Schedules, no outside pinger. `apps/backend/vercel.json` ends with no `crons` key.
- Organisation clock for any wall-clock rule: `ORG_TIMEZONE` (default `Africa/Cairo`) through `lib/org-time.ts`; never the host zone.
- Follow-up reminders go out "around 9:00 AM Cairo on the due day", at the first request after it.
- One concern per migration, `BEGIN; … COMMIT;`, `rollback.sql` beside it, cycled apply → rollback → apply on a throwaway database (root `CLAUDE.md` "Migrations"). Never `prisma migrate dev`/`reset`/`db push`.
- New model has `createdAt`/`updatedAt` (`schema-conformance.test.ts`); update `docs/database/erd.md` and the schema snapshot.
- Backend layers: no `$transaction` under `src/routes/`; relative imports only; 400 lines per file; `pnpm check` green.
- Commits authored as `jesusprojectcommunity` (repo-local config), ending with the session's attribution lines. Push nothing without asking.

## Review Focus

1. **Two requests at once** (two instances, one tick each): exactly one sweep runs. Pinned in Task 1 (`concurrent claims: one wins`).
2. **A sweep that throws** in one handler: the other handlers still run, the lease is still released, the request that triggered it already answered. Pinned in Task 1 (`a failing handler doesn't stop the others`).
3. **A follow-up due at 06:00 Cairo** with requests at 07:00 and 09:05: nothing at 07:00, one reminder at 09:05. Pinned in Task 2 (`waits for 9:00 on the due day`).
4. **A follow-up that came due on an earlier day** and no request since: the first request of the next morning, even before 9:00, sends it. Pinned in Task 2 (`an overdue one from an earlier day goes at once`).
5. **Every API request pays nothing noticeable:** the per-instance throttle means the lease query runs at most once a minute per instance, and the middleware never awaits the sweep. Pinned in Task 1 (`the tick never delays the response and throttles per instance`).

---

### Task 1: Scheduler lease, runner and middleware

**Files:**
- Create: `apps/backend/prisma/migrations/20261112000000_scheduler_lease/migration.sql`, `rollback.sql`
- Modify: `apps/backend/prisma/schema.prisma` (model `SchedulerLease`), `docs/database/erd.md`, the schema snapshot held by `src/__tests__/integration/schema-snapshot.test.ts`
- Create: `apps/backend/src/lib/scheduler/lease.ts`, `apps/backend/src/lib/scheduler/index.ts`, `apps/backend/src/lib/scheduler/middleware.ts`
- Modify: `apps/backend/src/app.ts` (mount the middleware right after `express.json()`), `apps/backend/src/lib/config.ts` (`SCHEDULER_TICK`), `apps/backend/jest.setup.ts`, `apps/backend/.env.example`
- Test: `apps/backend/src/__tests__/scheduler-unit.test.ts`, `apps/backend/src/__tests__/integration/scheduler-lease.test.ts`

**Interfaces:**
- Produces:
  - `model SchedulerLease { name String @id; lockedUntil DateTime @db.Timestamptz(3); lastRunAt DateTime? @db.Timestamptz(3); createdAt; updatedAt }`
  - `claimLease(name: string, now: Date, holdMs: number): Promise<boolean>` (lease.ts): inserts the row if missing (`ON CONFLICT DO NOTHING`), then `UPDATE "SchedulerLease" SET "lockedUntil" = now+hold WHERE name = $1 AND "lockedUntil" <= now` and returns whether one row changed.
  - `releaseLease(name: string, now: Date): Promise<void>`: sets `lockedUntil = now`, `lastRunAt = now`.
  - `type ScheduledHandler = { name: string; run: (now: Date) => Promise<number> }` (number = items sent).
  - `registerHandler(h: ScheduledHandler): void`, `runDueWork(now?: Date): Promise<Record<string, number | "failed">>` (index.ts). It runs every handler in registration order, catches and reports each failure (`reportError`), never throws.
  - `maybeRunScheduler(now?: Date): Promise<"ran" | "busy">`: `claimLease("main", now, 5 * MS_PER_MINUTE)`, then `runDueWork`, then `releaseLease` in a `finally`.
  - `schedulerTick(): RequestHandler` (middleware.ts): calls `next()` first, then, if `config.schedulerTick` and at least 60 s have passed since this instance last tried, `runInBackground("scheduler", maybeRunScheduler())`. The 60 s throttle is a module-level timestamp (`let lastTry = 0`) with a `resetTickForTests()` export.
  - `config.schedulerTick: boolean` from `SCHEDULER_TICK: z.enum(["on","off"]).default("on")`. `jest.setup.ts` forces `SCHEDULER_TICK=off` so integration suites never sweep behind their own assertions.

- [ ] **Step 1: Write the failing unit tests** (`scheduler-unit.test.ts`, lease functions mocked with `jest.mock("../lib/scheduler/lease")`)

```ts
it("runs every handler and reports a failing one without stopping the others", async () => {
  registerHandler({ name: "a", run: async () => { throw new Error("boom"); } });
  registerHandler({ name: "b", run: async () => 2 });
  await expect(runDueWork(new Date("2026-11-12T07:00:00Z"))).resolves.toEqual({ a: "failed", b: 2 });
});
it("does nothing and says busy when the lease is held", async () => {
  mockClaimLease.mockResolvedValue(false);
  await expect(maybeRunScheduler()).resolves.toBe("busy");
  expect(mockReleaseLease).not.toHaveBeenCalled();
});
it("releases the lease even when a handler throws", async () => { /* claim true, handler throws → releaseLease called once */ });
it("the tick never delays the response and throttles per instance", async () => {
  // supertest against a bare express app with schedulerTick() and a GET that answers 200;
  // config.schedulerTick = true; maybeRunScheduler spied to a never-resolving promise.
  // Two requests 1 s apart → both 200, spy called once; after jest.advanceTimersByTime(61_000) → called twice.
});
it("does nothing when SCHEDULER_TICK is off", async () => { /* config.schedulerTick = false → spy not called */ });
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @space/backend exec jest src/__tests__/scheduler-unit.test.ts`
Expected: FAIL, "Cannot find module '../lib/scheduler'".

- [ ] **Step 3: Implement `lib/scheduler/{index,middleware}.ts` and the `SCHEDULER_TICK` config key** as in Interfaces. Mount `app.use(schedulerTick())` in `src/app.ts` directly after `app.use(express.json())`; document `SCHEDULER_TICK` (on/off, default on) in `.env.example`; force `process.env.SCHEDULER_TICK = "off"` in `jest.setup.ts` with a one-line why.

- [ ] **Step 4: Run the unit tests**

Run: `pnpm --filter @space/backend exec jest src/__tests__/scheduler-unit.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Add the migration and the model**

`migration.sql`: `BEGIN; CREATE TABLE "SchedulerLease" ("name" TEXT PRIMARY KEY, "lockedUntil" TIMESTAMPTZ(3) NOT NULL, "lastRunAt" TIMESTAMPTZ(3), "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(), "updatedAt" TIMESTAMPTZ(3) NOT NULL); COMMIT;` and `rollback.sql`: `BEGIN; DROP TABLE "SchedulerLease"; COMMIT;`. Add the model to `schema.prisma`, regenerate (`pnpm --filter @space/backend db:generate`), add it to `docs/database/erd.md`, update the schema snapshot (`schema-snapshot.test.ts` is an integration test; run it with `-u` alone). Cycle apply → rollback → apply on a throwaway database.

- [ ] **Step 6: Write the failing integration test** (`integration/scheduler-lease.test.ts`, against the test database)

```ts
it("concurrent claims: one wins", async () => {
  const now = new Date();
  const results = await Promise.all([claimLease("t", now, 300_000), claimLease("t", now, 300_000)]);
  expect(results.filter(Boolean)).toHaveLength(1);
});
it("a held lease refuses until it expires or is released", async () => {
  const t0 = new Date("2026-11-12T07:00:00Z");
  expect(await claimLease("t2", t0, 300_000)).toBe(true);
  expect(await claimLease("t2", new Date(t0.getTime() + 60_000), 300_000)).toBe(false);
  expect(await claimLease("t2", new Date(t0.getTime() + 300_000), 300_000)).toBe(true);
  await releaseLease("t2", new Date(t0.getTime() + 301_000));
  expect(await claimLease("t2", new Date(t0.getTime() + 302_000), 300_000)).toBe(true);
});
```

- [ ] **Step 7: Implement `lib/scheduler/lease.ts`** with `db.$executeRaw` for both statements (the conditional `UPDATE` is what makes the claim atomic; a `findFirst` then `update` is not).

- [ ] **Step 8: Run the integration test, then the conformance tests**

Run: `pnpm --filter @space/backend exec jest --config jest.integration.config.js src/__tests__/integration/scheduler-lease.test.ts && pnpm --filter @space/backend exec jest src/__tests__/schema-conformance.test.ts src/__tests__/erd.test.ts && pnpm --filter @space/backend exec jest --config jest.integration.config.js src/__tests__/integration/schema-snapshot.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/backend/prisma apps/backend/src/lib/scheduler apps/backend/src/app.ts apps/backend/src/lib/config.ts apps/backend/jest.setup.ts apps/backend/.env.example apps/backend/src/__tests__ docs/database/erd.md
git commit -m "feat(backend): request-driven scheduler with a database lease"
```

### Task 2: Follow-up reminders on the scheduler; no Vercel crons

**Files:**
- Modify: `apps/backend/src/lib/follow-ups.ts` (`sendDueFollowUpReminders`, delete `isCronAuthorized`), `apps/backend/src/routes/follow-ups.ts` (delete `internalRouter` and its `/follow-ups/remind` route — it is the router's only route — and its import and `app.use("/api/v1/internal", …)` mount in `src/app.ts`), `apps/backend/src/docs/paths/follow-ups.ts` (delete the path), `apps/backend/src/lib/config.ts` (delete `CRON_SECRET` / `cronSecret`), `apps/backend/.env.example` (delete the CRON_SECRET block), `apps/backend/vercel.json` (delete `crons`), `docs/rules/mentor.md` (the Follow-ups bullet), `src/__tests__/__snapshots__/route-inventory.test.ts.snap`
- Create: `apps/backend/src/lib/scheduler/handlers.ts` (registers the built-in handlers; imported once by `lib/scheduler/index.ts`)
- Test: `apps/backend/src/__tests__/integration/follow-ups-routes.test.ts` (replace the two CRON tests), `apps/backend/src/__tests__/follow-up-cutoff-unit.test.ts`

**Interfaces:**
- Consumes: `registerHandler`, `ScheduledHandler` (Task 1).
- Produces:
  - `followUpCutoff(now: Date): Date` (follow-ups.ts): `now` when the org wall-clock time is ≥ `"09:00"`, else the org midnight of `now`'s org day (`orgWallClockToInstant(orgDayKey(now), "00:00")`). A follow-up is due when `dueAt <= followUpCutoff(now)`.
  - `REMINDER_HOUR = "09:00"` (follow-ups.ts, exported for the multi-part plan's reuse).
  - `sendDueFollowUpReminders(now = new Date())` keeps its claim-by-`remindedAt` body; only its `dueAt: { lte: now }` becomes `dueAt: { lte: followUpCutoff(now) }`.
  - Handler `{ name: "follow-ups", run: sendDueFollowUpReminders }` registered in `handlers.ts`.

- [ ] **Step 1: Write the failing cutoff unit tests** (`follow-up-cutoff-unit.test.ts`; Cairo is UTC+2 in November)

```ts
it("waits for 9:00 on the due day", () => {
  expect(followUpCutoff(new Date("2026-11-12T05:00:00Z")).toISOString()).toBe("2026-11-11T22:00:00.000Z"); // 07:00 Cairo → midnight
  expect(followUpCutoff(new Date("2026-11-12T07:05:00Z")).toISOString()).toBe("2026-11-12T07:05:00.000Z"); // 09:05 Cairo → now
});
```

- [ ] **Step 2: Replace the CRON tests in `follow-ups-routes.test.ts`** with handler-driven ones: delete `"the reminder is a 404 with no CRON_SECRET…"`, the `SECRET` const and every `cronSecret` line; `"sends nothing before 7 days, then exactly one reminder"` now calls `sendDueFollowUpReminders(at)` with explicit times, and add:

```ts
it("waits for 9:00 on the due day", async () => {
  await db.mentorFollowUp.update({ where: { id: followUpId }, data: { dueAt: new Date("2026-11-12T04:00:00Z") } }); // 06:00 Cairo
  expect(await sendDueFollowUpReminders(new Date("2026-11-12T05:00:00Z"))).toBe(0); // 07:00
  expect(await sendDueFollowUpReminders(new Date("2026-11-12T07:05:00Z"))).toBe(1); // 09:05
});
it("an overdue one from an earlier day goes at once", async () => {
  // dueAt 2026-11-11T18:00Z (20:00 Cairo, 11 Nov), run at 2026-11-12T04:30Z (06:30 Cairo, 12 Nov) → 1
});
it("GET /api/v1/internal/follow-ups/remind is gone", async () => {
  expect((await request(app).get("/api/v1/internal/follow-ups/remind")).status).toBe(404);
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `pnpm --filter @space/backend exec jest src/__tests__/follow-up-cutoff-unit.test.ts && pnpm --filter @space/backend exec jest --config jest.integration.config.js src/__tests__/integration/follow-ups-routes.test.ts`
Expected: FAIL ("followUpCutoff is not a function"; the remind route still answers 401/200).

- [ ] **Step 4: Implement** `followUpCutoff`, the `lte` change, `handlers.ts`, and delete the route, its docs path, `isCronAuthorized`, `CRON_SECRET`/`cronSecret`, the `.env.example` block and the `crons` array (leave `vercel.json` otherwise unchanged). Reword `docs/rules/mentor.md`'s Follow-ups bullet: replace "The daily Vercel Cron (`vercel.json`) calls `GET /internal/follow-ups/remind` with `CRON_SECRET`; unset, it is a 404 and nothing is sent." with "The backend's own scheduler (`lib/scheduler/`, run by incoming requests) sends it around 9:00 AM Cairo on the due day, at the first request after that." Update the route-inventory snapshot (`jest -u` on that test only) and confirm the diff only removes the remind route.

- [ ] **Step 5: Run the backend checks**

Run: `pnpm --filter @space/backend exec jest src/__tests__/follow-up-cutoff-unit.test.ts src/__tests__/config.test.ts src/__tests__/route-inventory.test.ts && pnpm --filter @space/backend exec jest --config jest.integration.config.js src/__tests__/integration/follow-ups-routes.test.ts && pnpm check`
Expected: all PASS; `grep -rn "CRON_SECRET\|cronSecret\|isCronAuthorized\|\"crons\"" apps/backend/src apps/backend/vercel.json apps/backend/.env.example docs/rules` prints nothing.

- [ ] **Step 6: Commit**

```bash
git add apps/backend docs/rules/mentor.md
git commit -m "feat(backend): follow-up reminders run on the in-backend scheduler; no Vercel crons"
```

- [ ] **Step 7: After deploy (ask the owner first):** remove `CRON_SECRET` from the Vercel project `jpc-space-be` (CLI is logged in as `jesusprojectcommunity`), apply the migration **before** the code deploys (the middleware's sweep would fail on a missing table; it is caught and reported, but noisy) with `pnpm --filter @space/backend db:migrate:deploy` against the production URL in `~/.secrets/space-new-db.url` (staging is the same database), and say in the commit or PR which environments it was applied to.
