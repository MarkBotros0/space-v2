# Plan 3 — Season & Session Writes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The API surface an admin needs to build and run a season — season CRUD and duplication, session creation with weekly recurrence, and scoped series edit/delete — with the two deliberate divergences the specs demand: recurrence is season-scoped (ruling C10, a live v1 cross-season data-loss bug) and duplication mints fresh recurrence ids.

**Architecture:** Two file-disjoint workstreams. Seasons writes live in
`routes/seasons.ts`; session writes live in `routes/sessions.ts` — session
creation is `POST /api/v1/sessions` with `seasonId` in the body (a deliberate
deviation from the `POST /seasons/:id/groups` precedent, so the two
workstreams never touch the same file). Contracts convert `season.ts` to Zod
and add the write schemas. A new `lib/org-time.ts` holds the one place
wall-clock text is produced (ruling C2).

**Tech Stack:** Express 5, Prisma 7 (`src/generated/prisma`), Zod, jest +
supertest integration suite against the shared staging DB.

**Spec:** `docs/superpowers/specs/domains/02-seasons.md` (esp. §10 D1, D3,
D4, D5, D8, D15), `03-sessions.md` (esp. §10 items 1–3, 7, 11),
`_DECISIONS.md` (C1, C2, C10, C12).

## Global Constraints

- **No migrations, ever.** No edits under `apps/backend/prisma/`. Shared live staging DB.
- Response envelope `{ data }` / `{ error: { code, message } }` via `apiOk`/`apiError`.
- Value imports from shared use the relative path `"../../../../packages/shared/src/index"` in route files (the `rootDir` emit trap in CLAUDE.md).
- `src/docs/openapi.ts` changes in the same commit as the route it documents.
- Integration fixtures: every row carries the `space-v2-test-` prefix in `User.email` or `Season.code`; use `createTestSeason`/`createTestUser`/`login`/`cleanupTestData` from `__tests__/integration/fixtures.ts`; `jest.setTimeout(60000)`.
- **Integration tests are serial.** Executed task-by-task (the default), each task runs its own suite: `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern <suite>`. If tasks 2–3 and 4–6 are ever parallelized across two agents, the agents write tests unrun and the coordinator runs them serially.
- v1 rules ported faithfully unless a spec §10 item or `_DECISIONS.md` ruling says otherwise; every divergence below names its ruling.

**Execution shape:** Task 1 first (both streams consume the contracts).
Then Tasks 2–3 (seasons) and Tasks 4–6 (sessions) are independent streams.
Task 7 is the closing gate.

---

### Task 1: Contracts — season Zod conversion and write schemas

**Files:**
- Modify: `packages/shared/src/season.ts` (convert the three interfaces; add write schemas)
- Modify: `packages/shared/src/session.ts` (add session write schemas + `recurrenceScopeSchema`)
- Test: `packages/shared/src/__tests__/write-schemas.test.ts`

**Interfaces:**
- Consumes: `seasonStatusSchema` from `./enums`.
- Produces (exact names later tasks import): `seasonListItemSchema`, `seasonDetailGroupSchema`, `seasonDetailSchema` (+ `z.infer` types replacing the interfaces, same names); `seasonWriteRequestSchema` → type `SeasonWriteBody` (z.output); `duplicateSeasonRequestSchema`; `recurrenceScopeSchema` → `RecurrenceScope`; `createSessionRequestSchema` → `CreateSessionBody`; `updateSessionRequestSchema` → `UpdateSessionBody`; `deleteSessionRequestSchema`.

- [ ] **Step 1: Failing test**

```ts
// packages/shared/src/__tests__/write-schemas.test.ts
import {
  createSessionRequestSchema,
  duplicateSeasonRequestSchema,
  seasonWriteRequestSchema,
  updateSessionRequestSchema,
} from "../index";

describe("seasonWriteRequestSchema", () => {
  const valid = {
    code: "Test 2099", program: "TEST", year: 2099,
    startDate: "2099-01-01T00:00:00.000Z", endDate: "2099-12-31T00:00:00.000Z",
    status: "DRAFT",
  };

  it("slugifies the code the way v1 did", () => {
    // v1: slugifySeasonCode before validation — lowercase, dashes.
    expect(seasonWriteRequestSchema.parse(valid).code).toBe("test-2099");
  });

  it("defaults the absence budget fields v1's create silently discarded", () => {
    const parsed = seasonWriteRequestSchema.parse(valid);
    expect(parsed.absenceBudgetMinutes).toBe(180);
    expect(parsed.absenceWeightMinutes).toBe(90);
  });

  it("refuses an end date before the start date", () => {
    expect(
      seasonWriteRequestSchema.safeParse({ ...valid, endDate: "2098-01-01T00:00:00.000Z" }).success,
    ).toBe(false);
  });
});

describe("session write schemas", () => {
  const valid = {
    title: "Session one", startsAt: "2099-03-01T18:00:00.000Z", durationMinutes: 90,
  };

  it("bounds title at the server truth (2–120), not the client's old limit", () => {
    // Spec 03 §10 item 7: v1's client and server disagreed; the server wins.
    expect(createSessionRequestSchema.safeParse({ ...valid, seasonId: 1, title: "x" }).success).toBe(false);
    expect(
      createSessionRequestSchema.safeParse({ ...valid, seasonId: 1, title: "ab" }).success,
    ).toBe(true);
  });

  it("clamps repeatWeeks to 1..26 by refusing out-of-range values", () => {
    expect(
      createSessionRequestSchema.safeParse({ ...valid, seasonId: 1, repeatWeeks: 27 }).success,
    ).toBe(false);
  });

  it("requires a scope on update and delete", () => {
    expect(updateSessionRequestSchema.safeParse(valid).success).toBe(false);
    expect(updateSessionRequestSchema.safeParse({ ...valid, scope: "future" }).success).toBe(true);
  });
});

describe("duplicateSeasonRequestSchema", () => {
  it("refuses endDate before startDate", () => {
    expect(
      duplicateSeasonRequestSchema.safeParse({
        year: 2100, startDate: "2100-06-01T00:00:00.000Z", endDate: "2100-01-01T00:00:00.000Z",
      }).success,
    ).toBe(false);
  });
});
```

Run: `pnpm --filter @space/shared jest src/__tests__/write-schemas.test.ts` → FAIL (exports missing).

- [ ] **Step 2: Season contracts.** In `season.ts`, convert the interfaces
(keep the wire-shape comment):

```ts
import { z } from "zod";
import { seasonStatusSchema } from "./enums";

export const seasonListItemSchema = z.object({
  id: z.number(), code: z.string(), title: z.string(), program: z.string(),
  year: z.number(), status: seasonStatusSchema,
  startDate: z.string(), endDate: z.string(),
});
export type SeasonListItem = z.infer<typeof seasonListItemSchema>;

export const seasonDetailGroupSchema = z.object({
  id: z.number(), name: z.string(), studentCount: z.number(),
  leaderNames: z.array(z.string()),
});
export type SeasonDetailGroup = z.infer<typeof seasonDetailGroupSchema>;

export const seasonDetailSchema = seasonListItemSchema.extend({
  description: z.string().nullable(),
  sessionCount: z.number(),
  studentCount: z.number(),
  groups: z.array(seasonDetailGroupSchema),
});
export type SeasonDetail = z.infer<typeof seasonDetailSchema>;

/** v1's slugify, reproduced: lowercase, runs of non-alphanumerics become one dash. */
function slugifySeasonCode(raw: string): string {
  return raw.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export const seasonWriteRequestSchema = z
  .object({
    code: z.string().min(2).max(40).transform(slugifySeasonCode),
    program: z.string().min(1).max(60),
    year: z.number().int().min(2000).max(2100),
    description: z.string().max(2000).nullish(),
    startDate: z.string().datetime({ offset: true }),
    endDate: z.string().datetime({ offset: true }),
    status: seasonStatusSchema,
    // v1's create built its data object without these two, silently discarding
    // whatever the form sent while update honoured them (spec 02 D1). Defaults
    // here mean create and update share one schema and neither can drop them.
    absenceBudgetMinutes: z.number().int().min(1).default(180),
    absenceWeightMinutes: z.number().int().min(1).default(90),
  })
  .refine((v) => v.code.length >= 2, { path: ["code"], message: "Code is too short." })
  .refine((v) => new Date(v.endDate).getTime() >= new Date(v.startDate).getTime(), {
    path: ["endDate"], message: "End date must be on or after start date.",
  });
export type SeasonWriteBody = z.output<typeof seasonWriteRequestSchema>;

export const duplicateSeasonRequestSchema = z
  .object({
    year: z.number().int().min(2000).max(2100),
    code: z.string().min(2).max(40).transform(slugifySeasonCode).optional(),
    startDate: z.string().datetime({ offset: true }),
    endDate: z.string().datetime({ offset: true }),
  })
  .refine((v) => new Date(v.endDate).getTime() >= new Date(v.startDate).getTime(), {
    path: ["endDate"], message: "End date must be on or after start date.",
  });
export type DuplicateSeasonBody = z.output<typeof duplicateSeasonRequestSchema>;
```

- [ ] **Step 3: Session write schemas.** In `session.ts` add:

```ts
export const recurrenceScopeSchema = z.enum(["one", "future", "all"]);
export type RecurrenceScope = z.infer<typeof recurrenceScopeSchema>;

/** v1's server schema, verbatim bounds: title 2–120, duration 15–600 min. */
const sessionWriteBase = z.object({
  title: z.string().min(2).max(120),
  startsAt: z.string().datetime({ offset: true }),
  durationMinutes: z.number().int().min(15).max(600),
  location: z.string().max(200).nullish(),
  youtubeUrl: z.string().url().nullish(),
  description: z.string().max(2000).nullish(),
});

export const createSessionRequestSchema = sessionWriteBase.extend({
  seasonId: z.number().int().positive(),
  /** Weekly siblings sharing one recurrenceGroupId. v1 clamped to 26 silently; refusing is honest. */
  repeatWeeks: z.number().int().min(1).max(26).default(1),
});
export type CreateSessionBody = z.output<typeof createSessionRequestSchema>;

export const updateSessionRequestSchema = sessionWriteBase.extend({
  scope: recurrenceScopeSchema,
});
export type UpdateSessionBody = z.output<typeof updateSessionRequestSchema>;

export const deleteSessionRequestSchema = z.object({
  scope: recurrenceScopeSchema.default("one"),
  /**
   * Attendance already recorded is history; destroying it silently is v1's
   * unreachable delete, not a behaviour anyone chose (ruling C12). Deleting a
   * session that has attendance requires this explicit acknowledgement.
   */
  force: z.boolean().default(false),
});
export type DeleteSessionBody = z.output<typeof deleteSessionRequestSchema>;
```

- [ ] **Step 4:** Run the shared test → PASS. Check importers of the old
`SeasonListItem`/`SeasonDetail` types still typecheck
(`pnpm turbo typecheck`) — the type names are unchanged.

- [ ] **Step 5: Commit** — `git add packages/shared && git commit -m "feat(shared): season Zod contracts and season/session write schemas"`

---

### Task 2: Org timezone + season create/update/delete

**Files:**
- Modify: `apps/backend/src/lib/config.ts` (add `ORG_TIMEZONE`)
- Create: `apps/backend/src/lib/org-time.ts`
- Modify: `apps/backend/src/routes/seasons.ts`
- Test: `apps/backend/src/__tests__/org-time.test.ts` (unit), extend `apps/backend/src/__tests__/integration/seasons-routes.test.ts`

**Interfaces:**
- Consumes: `seasonWriteRequestSchema` (Task 1), existing `isSuper`/`isAdminOfSeason`.
- Produces: `config.orgTimezone: string`; `formatInOrgTime(date: Date): string` (Task 5's notification body uses it); endpoints `POST /api/v1/seasons`, `PATCH /api/v1/seasons/:id`, `DELETE /api/v1/seasons/:id`.

- [ ] **Step 1: Unit test for org-time**

```ts
// apps/backend/src/__tests__/org-time.test.ts
import { formatInOrgTime } from "../lib/org-time";

it("renders an instant as the organisation's wall clock, not the host's", () => {
  // 2099-03-01T18:00Z is 20:00 in Africa/Cairo (UTC+2, no DST since 2014-era
  // rules; if config changes the zone this test changes with it).
  expect(formatInOrgTime(new Date("2099-03-01T18:00:00.000Z"))).toBe("Mar 1, 2099, 8:00 PM");
});
```

Run → FAIL. Implement:

```ts
// apps/backend/src/lib/org-time.ts
import { config } from "./config";

/**
 * The single place a Date becomes human-readable text on the server.
 *
 * Ruling C2: v1 formatted timestamps with the host's incidental locale and
 * zone (`toLocaleString()` in the reschedule notification), so the text a
 * student received depended on where the server ran. Everything wall-clock
 * resolves against one configured organisation timezone instead.
 */
const formatter = new Intl.DateTimeFormat("en-US", {
  timeZone: config.orgTimezone,
  year: "numeric", month: "short", day: "numeric",
  hour: "numeric", minute: "2-digit",
});

export function formatInOrgTime(date: Date): string {
  return formatter.format(date);
}
```

In `config.ts`'s schema add
`ORG_TIMEZONE: z.string().default("Africa/Cairo"),` (IANA zone; the
organisation is Cairo-based) and `orgTimezone: parsed.data.ORG_TIMEZONE,` to
the exported object. Run the unit test → PASS.

- [ ] **Step 2: Failing integration tests.** Append to
`seasons-routes.test.ts` (reuse its fixtures; add a `superToken` if it lacks
one — `createTestUser("super", "SUPER")` + `login`):

```ts
describe("season writes", () => {
  it("creates a season with slugged code, derived title, and the budget fields kept", async () => {
    const code = testSeasonCode(); // already prefix-safe
    const res = await request(app)
      .post("/api/v1/seasons")
      .set("authorization", `Bearer ${superToken}`)
      .send({
        code, program: "TEST", year: 2099, status: "DRAFT",
        startDate: "2099-01-01T00:00:00.000Z", endDate: "2099-12-31T00:00:00.000Z",
        absenceBudgetMinutes: 240, absenceWeightMinutes: 120,
      });

    expect(res.status).toBe(201);
    const row = await db.season.findUnique({
      where: { id: res.body.data.id },
      select: { title: true, absenceBudgetMinutes: true, absenceWeightMinutes: true },
    });
    // v1 derived title as `${program} ${year}` and its create DISCARDED the
    // budget fields (spec 02 D1) — both fixed behaviours pinned here.
    expect(row).toMatchObject({
      title: "TEST 2099", absenceBudgetMinutes: 240, absenceWeightMinutes: 120,
    });
  });

  it("refuses creation by an ADMIN — SUPER only (spec 02 D3)", async () => {
    const res = await request(app)
      .post("/api/v1/seasons")
      .set("authorization", `Bearer ${adminToken}`)
      .send({
        code: testSeasonCode(), program: "TEST", year: 2099, status: "DRAFT",
        startDate: "2099-01-01T00:00:00.000Z", endDate: "2099-12-31T00:00:00.000Z",
      });
    expect(res.status).toBe(403);
  });

  it("lets a season ADMIN edit operational fields but not identity", async () => {
    // D3's allowlist: an admin runs the season, so the engagement knobs and
    // description are theirs; code/status/dates/program/year are SUPER's.
    const ok = await request(app)
      .patch(`/api/v1/seasons/${seasonId}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ description: "Updated.", absenceBudgetMinutes: 200 });
    expect(ok.status).toBe(200);

    const refused = await request(app)
      .patch(`/api/v1/seasons/${seasonId}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ status: "ARCHIVED" });
    expect(refused.status).toBe(403);
    expect(refused.body.error.code).toBe("forbidden_field");
  });

  it("refuses a duplicate code with 409, not a Prisma error", async () => {
    const first = testSeasonCode();
    await request(app)
      .post("/api/v1/seasons")
      .set("authorization", `Bearer ${superToken}`)
      .send({
        code: first, program: "TEST", year: 2099, status: "DRAFT",
        startDate: "2099-01-01T00:00:00.000Z", endDate: "2099-12-31T00:00:00.000Z",
      });
    const clash = await request(app)
      .post("/api/v1/seasons")
      .set("authorization", `Bearer ${superToken}`)
      .send({
        code: first, program: "TEST", year: 2099, status: "DRAFT",
        startDate: "2099-01-01T00:00:00.000Z", endDate: "2099-12-31T00:00:00.000Z",
      });
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe("code_taken");
  });

  it("soft-deletes an empty season and blocks one with enrollments (spec 02 D4)", async () => {
    const empty = await createTestSeason();
    const gone = await request(app)
      .delete(`/api/v1/seasons/${empty.id}`)
      .set("authorization", `Bearer ${superToken}`);
    expect(gone.status).toBe(200);
    const row = await db.season.findUnique({ where: { id: empty.id }, select: { deletedAt: true } });
    expect(row?.deletedAt).not.toBeNull();

    // `seasonId` (the suite's main season) has enrollments from beforeAll.
    const blocked = await request(app)
      .delete(`/api/v1/seasons/${seasonId}`)
      .set("authorization", `Bearer ${superToken}`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("season_in_use");
  });
});
```

Run the suite → new cases FAIL (404s).

- [ ] **Step 3: Implement** in `routes/seasons.ts`. Import
`seasonWriteRequestSchema` via the relative-path shared import that is
already in the file. Shapes:

```ts
const ADMIN_EDITABLE = new Set(["description", "absenceBudgetMinutes", "absenceWeightMinutes"]);

seasonsRouter.post("/", async (req, res) => {
  const user = requireUser(req);
  // Spec 02 D3: creation is SUPER-only. v1's page enforced this by placement;
  // its action checked canCreateSeason (SUPER) — the real gate ports.
  if (!isSuper(user)) return apiError(res, "forbidden", "You don't have access to this.", 403);

  const parsed = seasonWriteRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid season body.", 400);

  // Read-then-create races (spec 02 D15) resolve at the unique index: the
  // pre-check gives the friendly 409, the catch converts the race loser's
  // P2002 to the same answer instead of a 500.
  const clash = await db.season.findUnique({ where: { code: parsed.data.code }, select: { id: true } });
  if (clash) return apiError(res, "code_taken", "A season with that code already exists.", 409);

  try {
    const season = await db.season.create({
      data: {
        code: parsed.data.code,
        title: `${parsed.data.program} ${parsed.data.year}`,
        program: parsed.data.program,
        year: parsed.data.year,
        description: parsed.data.description ?? null,
        startDate: new Date(parsed.data.startDate),
        endDate: new Date(parsed.data.endDate),
        status: parsed.data.status,
        absenceBudgetMinutes: parsed.data.absenceBudgetMinutes,
        absenceWeightMinutes: parsed.data.absenceWeightMinutes,
        createdById: user.userId,
        updatedById: user.userId,
      },
      select: { id: true, code: true },
    });
    return apiOk(res, season, 201);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return apiError(res, "code_taken", "A season with that code already exists.", 409);
    }
    throw err;
  }
});
```

`PATCH /:id`: 404 on missing/deleted; SUPER passes whole-body
`seasonWriteRequestSchema` (with the same code-clash check excluding self);
an ADMIN of the season is checked **before** parsing: if any body key is
outside `ADMIN_EDITABLE`, return
`apiError(res, "forbidden_field", "Season identity fields are SUPER-only.", 403)`;
then parse just those fields with
`seasonWriteRequestSchema.innerType?` — simpler: a dedicated
`z.object({ description: ..., absenceBudgetMinutes: ..., absenceWeightMinutes: ... }).partial()`
defined next to `ADMIN_EDITABLE` (the write schema's refine needs dates, so
the partial cannot reuse it). Both paths set `updatedById: user.userId` and
derive `title` again when program/year change (SUPER path).

`DELETE /:id`: SUPER only; 404 on missing/already-deleted; count
`seasonEnrollment` and `session` rows — either nonzero →
`apiError(res, "season_in_use", "This season has sessions or enrollments; archive it instead.", 409)`
(spec 02 D4 — v1's delete checked nothing and stranded children); else
`update({ data: { deletedAt: new Date(), updatedById: user.userId } })`.

Verify `Prisma` is imported as a value where the error class is used
(`import { Prisma } from "../generated/prisma/client"` — check how
`db/client.ts` re-exports; adjust to the codebase's existing pattern).

- [ ] **Step 4:** Run the seasons suite → PASS. `pnpm turbo lint typecheck test:unit --filter=@space/backend` → clean.

- [ ] **Step 5: OpenAPI** — add the three paths + `SeasonWriteRequest`
schema to `src/docs/openapi.ts` in this same commit (house style: prose
`description` explaining the D3 allowlist and the D4 block; 409 codes
`code_taken` / `season_in_use` / `forbidden_field` documented).

- [ ] **Step 6: Commit** — `"feat(backend): season create, allowlisted update, and guarded delete"`

---

### Task 3: Season duplication

**Files:**
- Modify: `apps/backend/src/routes/seasons.ts`
- Test: extend `apps/backend/src/__tests__/integration/seasons-routes.test.ts`

**Interfaces:**
- Consumes: `duplicateSeasonRequestSchema` (Task 1), `newPublicId` from `../lib/public-id`.
- Produces: `POST /api/v1/seasons/:id/duplicate` → `{ data: { id, code } }`, 201.

- [ ] **Step 1: Failing test**

```ts
describe("POST /api/v1/seasons/:id/duplicate", () => {
  it("clones structure with shifted dates and FRESH recurrence ids (ruling C10)", async () => {
    const source = await createTestSeason();
    // A two-session weekly series in the source.
    await db.session.createMany({
      data: [
        { seasonId: source.id, title: "Series A", startsAt: new Date("2099-01-05T18:00:00.000Z"),
          durationMinutes: 60, recurrenceGroupId: "space-v2-test-rgrp" },
        { seasonId: source.id, title: "Series A", startsAt: new Date("2099-01-12T18:00:00.000Z"),
          durationMinutes: 60, recurrenceGroupId: "space-v2-test-rgrp" },
      ],
    });

    const res = await request(app)
      .post(`/api/v1/seasons/${source.id}/duplicate`)
      .set("authorization", `Bearer ${superToken}`)
      .send({
        year: 2100, startDate: "2100-01-04T00:00:00.000Z", endDate: "2100-12-31T00:00:00.000Z",
      });

    expect(res.status).toBe(201);
    const cloned = await db.session.findMany({
      where: { seasonId: res.body.data.id },
      select: { startsAt: true, recurrenceGroupId: true },
      orderBy: { startsAt: "asc" },
    });
    expect(cloned).toHaveLength(2);
    // Same offset applied to every date (v1's shift, kept)...
    expect(cloned[0]?.startsAt.toISOString()).toBe("2100-01-04T18:00:00.000Z");
    // ...but the series id is minted fresh, NOT copied — v1 cloned it
    // verbatim, which is how editing a series in one season silently
    // rewrote another's sessions. Same id across the clones, different
    // from the source's.
    expect(cloned[0]?.recurrenceGroupId).toBe(cloned[1]?.recurrenceGroupId);
    expect(cloned[0]?.recurrenceGroupId).not.toBe("space-v2-test-rgrp");

    const season = await db.season.findUnique({
      where: { id: res.body.data.id },
      select: { status: true, absenceBudgetMinutes: true },
    });
    // New batch starts DRAFT; the budget carries over from the source.
    expect(season?.status).toBe("DRAFT");
    expect(season?.absenceBudgetMinutes).toBeGreaterThan(0);
  });

  it("is SUPER-only", async () => {
    const res = await request(app)
      .post(`/api/v1/seasons/${seasonId}/duplicate`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ year: 2100, startDate: "2100-01-01T00:00:00.000Z", endDate: "2100-12-31T00:00:00.000Z" });
    expect(res.status).toBe(403);
  });
});
```

**Cleanup note:** the duplicated season's code is derived from the source's
prefixed code (see Step 2), so `cleanupTestData`'s prefix discovery still
catches it — verify the derived code keeps the `space-v2-test-` prefix, or
the fixture leaks rows into the shared DB.

- [ ] **Step 2: Implement.** Read v1's `duplicateSeasonAction`
(`jpc-space/src/lib/season-actions.ts:205-362`) once more while writing —
the port keeps: source loaded with groups/sessions/assignments (`deletedAt:
null` guard on the source — v1 lacked it, spec 02 D6), date shift
`delta = newStart - sourceStart` applied to every session `startsAt`,
groups cloned (name/description, leaders kept, students NOT), assignments
cloned with targets remapped through the old→new group id map, status
`DRAFT`, code defaulting to `${source.code}-${year}` when the body omits it
(slugified; 409 `code_taken` on clash). The two deliberate divergences,
each with a comment naming its source:
  1. **Fresh recurrence ids** — build `const rgrpMap = new Map<string, string>()`;
     for each source session with a `recurrenceGroupId`, `rgrpMap.get(old) ??
     rgrpMap.set(old, newPublicId())` and write the mapped id. (C10; spec 02 D5.)
  2. **Budget fields copied** — v1's clone re-created the season without
     them only because create discarded them (D1); copy
     `absenceBudgetMinutes`/`absenceWeightMinutes` from the source row.
All inside one `db.$transaction`.

- [ ] **Step 3:** Run the seasons suite → PASS. OpenAPI entry in the same
commit.

- [ ] **Step 4: Commit** — `"feat(backend): season duplication with fresh recurrence ids"`

---

### Task 4: Session creation with weekly recurrence

**Files:**
- Modify: `apps/backend/src/routes/sessions.ts`
- Test: extend `apps/backend/src/__tests__/integration/sessions-routes.test.ts`

**Interfaces:**
- Consumes: `createSessionRequestSchema` (Task 1), `newPublicId`, `isAdminOfSeason`.
- Produces: `POST /api/v1/sessions` → `{ data: { id, recurrenceGroupId } }`, 201. **Registered above `"/:id"` GET is unnecessary (different verb), but it must sit above nothing that would shadow "/" — register after the existing `/check-in` block.**

- [ ] **Step 1: Failing test**

```ts
describe("POST /api/v1/sessions", () => {
  it("creates a weekly series sharing one recurrence id, 7 days apart", async () => {
    const res = await request(app)
      .post("/api/v1/sessions")
      .set("authorization", `Bearer ${adminToken}`)
      .send({
        seasonId, title: "Weekly session", startsAt: "2099-03-01T18:00:00.000Z",
        durationMinutes: 90, repeatWeeks: 3,
      });

    expect(res.status).toBe(201);
    const rows = await db.session.findMany({
      where: { recurrenceGroupId: res.body.data.recurrenceGroupId ?? "__none__" },
      orderBy: { startsAt: "asc" },
      select: { startsAt: true, seasonId: true },
    });
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.startsAt.toISOString())).toEqual([
      "2099-03-01T18:00:00.000Z", "2099-03-08T18:00:00.000Z", "2099-03-15T18:00:00.000Z",
    ]);
    expect(rows.every((r) => r.seasonId === seasonId)).toBe(true);
  });

  it("creates a single session with a null recurrence id", async () => {
    const res = await request(app)
      .post("/api/v1/sessions")
      .set("authorization", `Bearer ${adminToken}`)
      .send({ seasonId, title: "One-off", startsAt: "2099-04-01T18:00:00.000Z", durationMinutes: 60 });
    expect(res.status).toBe(201);
    expect(res.body.data.recurrenceGroupId).toBeNull();
  });

  it("refuses a non-admin of the season", async () => {
    const res = await request(app)
      .post("/api/v1/sessions")
      .set("authorization", `Bearer ${studentToken}`)
      .send({ seasonId, title: "Nope", startsAt: "2099-04-01T18:00:00.000Z", durationMinutes: 60 });
    expect(res.status).toBe(403);
  });
});
```

Run → FAIL.

- [ ] **Step 2: Implement.** Port v1's `createSessionAction` shape: parse →
`isAdminOfSeason(user, body.seasonId)` gate (404 first if the season is
missing or `deletedAt` — v1 never checked; spec 03 item 11's season-range
check stays un-ported, it is advisory in v1 too) → dates as
`Array.from({ length: repeatWeeks }, (_, i) => new Date(start.getTime() + i * 7 * 86_400_000))`
(v1's `addDays(start, i*7)` is the same arithmetic — fixed 7-day steps; an
instant plus exact weeks, so the org wall-clock shifts only if the zone
changes DST rules mid-series, which Africa/Cairo's current rules do — note
accepted, matching v1) → `recurrenceGroupId = repeatWeeks > 1 ? newPublicId() : null`
(v1 used `nanoid(8)`, ESM-only here; ids differ in length, the column is a
string, nothing compares lengths) → one transaction creating all rows →
`apiOk(res, { id: first.id, recurrenceGroupId }, 201)`.

- [ ] **Step 3:** Run the sessions suite → PASS. OpenAPI in the same commit
(document why creation is `POST /sessions` with `seasonId` in the body: file
disjointness of the two Plan-3 workstreams, recorded so nobody "fixes" it
back).

- [ ] **Step 4: Commit** — `"feat(backend): session creation with weekly recurrence"`

---

### Task 5: Session edit with scope — the C10 fix

**Files:**
- Modify: `apps/backend/src/routes/sessions.ts`
- Test: extend `apps/backend/src/__tests__/integration/sessions-routes.test.ts`

**Interfaces:**
- Consumes: `updateSessionRequestSchema`, `siblingsInScope` logic (reimplement below — v1's helper is 10 lines; do not import across repos), `createNotificationsBulk`, `formatInOrgTime` (Task 2).
- Produces: `PATCH /api/v1/sessions/:id` → `{ data: { updated: number } }`.

- [ ] **Step 1: Failing tests — the cross-season isolation test is the whole point**

```ts
describe("PATCH /api/v1/sessions/:id", () => {
  it("edits one occurrence without touching its siblings", async () => { /* scope:"one" — assert sibling startsAt unchanged */ });

  it("shifts this-and-following by the same delta", async () => {
    // Build a 3-session series via POST /sessions (Task 4). PATCH the middle
    // one with scope "future", startsAt +1h. Assert: first unchanged, second
    // and third both +1h.
  });

  it("NEVER touches another season's sessions sharing the recurrence id (ruling C10)", async () => {
    // The live v1 bug: duplication cloned recurrenceGroupId verbatim and the
    // sibling lookup had no season filter, so editing a series in one season
    // rewrote another's. Recreate the corrupted state directly:
    const otherSeason = await createTestSeason();
    const shared = "space-v2-test-xrg";
    const mine = await db.session.create({
      data: { seasonId, title: "Mine", startsAt: new Date("2099-05-01T18:00:00.000Z"),
        durationMinutes: 60, recurrenceGroupId: shared },
      select: { id: true },
    });
    const theirs = await db.session.create({
      data: { seasonId: otherSeason.id, title: "Theirs",
        startsAt: new Date("2099-05-08T18:00:00.000Z"), durationMinutes: 60,
        recurrenceGroupId: shared },
      select: { id: true, startsAt: true },
    });

    const res = await request(app)
      .patch(`/api/v1/sessions/${mine.id}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ title: "Renamed", startsAt: "2099-05-01T19:00:00.000Z",
        durationMinutes: 60, scope: "all" });
    expect(res.status).toBe(200);

    const untouched = await db.session.findUnique({
      where: { id: theirs.id }, select: { title: true, startsAt: true },
    });
    expect(untouched).toMatchObject({ title: "Theirs" });
    expect(untouched?.startsAt.toISOString()).toBe("2099-05-08T18:00:00.000Z");
  });

  it("notifies enrolled students when the start time changes, and not otherwise", async () => {
    // PATCH scope:"one" with only the title changed → no new SESSION_RESCHEDULED
    // rows for studentUserId. PATCH again with startsAt moved → exactly one new.
  });
});
```

Write the two elided bodies fully (same fixture style as the shown ones).
Run → FAIL.

- [ ] **Step 2: Implement.**

```ts
sessionsRouter.patch("/:id", async (req, res) => {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid session id.", 400);

  const existing = await db.session.findUnique({
    where: { id },
    select: { id: true, seasonId: true, recurrenceGroupId: true, startsAt: true },
  });
  if (!existing) return apiError(res, "not_found", "Session not found.", 404);
  if (!isAdminOfSeason(user, existing.seasonId)) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const parsed = updateSessionRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid session body.", 400);
  const body = parsed.data;

  // Ruling C10 — seasonId alongside recurrenceGroupId, unconditionally. v1
  // selected siblings on the group id alone, and season duplication cloned
  // that id verbatim, so a series edit reached across season boundaries: data
  // loss in the other season, gated only by the anchor's admin check.
  const series =
    existing.recurrenceGroupId && body.scope !== "one"
      ? await db.session.findMany({
          where: { recurrenceGroupId: existing.recurrenceGroupId, seasonId: existing.seasonId },
          select: { id: true, startsAt: true },
          orderBy: { startsAt: "asc" },
        })
      : [{ id: existing.id, startsAt: existing.startsAt }];

  // v1's siblingsInScope, inlined: "future" keeps anchor-and-later.
  const targets =
    body.scope === "future"
      ? series.filter((s) => s.startsAt.getTime() >= existing.startsAt.getTime())
      : series;

  const newStart = new Date(body.startsAt);
  const delta = newStart.getTime() - existing.startsAt.getTime();
  const fields = {
    title: body.title,
    durationMinutes: body.durationMinutes,
    location: body.location ?? null,
    youtubeUrl: body.youtubeUrl ?? null,
    description: body.description ?? null,
  };

  await db.$transaction(
    targets.map((t) =>
      db.session.update({
        where: { id: t.id },
        // scope "one": the date verbatim; series: each sibling shifted by the
        // same delta (v1's semantics, kept — spec 03 item 3's anchoring quirk
        // and all).
        data: { ...fields, startsAt: new Date(t.startsAt.getTime() + delta) },
      }),
    ),
  );

  if (delta !== 0) {
    const enrolled = await db.seasonEnrollment.findMany({
      where: { seasonId: existing.seasonId, status: "ACTIVE" },
      select: { studentUserId: true },
    });
    if (enrolled.length > 0) {
      try {
        await createNotificationsBulk(
          enrolled.map((e) => e.studentUserId),
          {
            type: "SESSION_RESCHEDULED",
            title: `Session "${body.title}" rescheduled`,
            // Org wall clock (C2), not the host's toLocaleString (v1).
            body: `New time: ${formatInOrgTime(newStart)}`,
            link: `/student/calendar`,
          },
        );
      } catch {
        // Best-effort: a mail transport failure must not fail the reschedule.
      }
    }
  }

  return apiOk(res, { updated: targets.length });
});
```

- [ ] **Step 3:** Run the sessions suite → PASS. OpenAPI in the same commit.
- [ ] **Step 4: Commit** — `"feat(backend): scoped session edit, season-fenced (C10)"`

---

### Task 6: Session delete — designed, not ported

**Files:**
- Modify: `apps/backend/src/routes/sessions.ts`
- Test: extend `apps/backend/src/__tests__/integration/sessions-routes.test.ts`

**Interfaces:**
- Consumes: `deleteSessionRequestSchema`, the same series/targets resolution as Task 5 (extract it to a local helper `resolveSeriesTargets(existing, scope)` shared by both handlers — same file, above the routes).
- Produces: `DELETE /api/v1/sessions/:id` → `{ data: { deleted: number } }`.

- [ ] **Step 1: Failing tests.** Four cases in the sessions suite: (a) deletes
a single attendance-free session, `deleted: 1`; (b) scope `"all"` on a series
deletes only that season's members (reuse the corrupted-state fixture pattern
from Task 5 — the other season's row survives); (c) a session **with an
attendance row** and `force` absent → 409 `has_attendance`; (d) same with
`force: true` by a season admin → 200, attendance rows gone. Write them in
full, run → FAIL.

- [ ] **Step 2: Implement.** v1's `deleteSessionAction` has **no caller
anywhere** — ruling C12 says its semantics (silent attendance cascade, silent
default scope) are not a specification. Designed behaviour: resolve targets
via the shared helper (season-fenced, C10); count
`db.attendance.count({ where: { sessionId: { in: targetIds } } })`; nonzero
and `!force` → `apiError(res, "has_attendance", "Attendance has been recorded; pass force to delete it too.", 409)`;
else one transaction — `attendance.deleteMany` then `session.deleteMany`
(FK order). Body parsed with `deleteSessionRequestSchema` (DELETE with a
JSON body is fine under Express 5's json middleware; the schema's defaults
make `{}` and an absent body equivalent — pass `req.body ?? {}`).

- [ ] **Step 3:** Suite → PASS. OpenAPI in the same commit (document
`has_attendance` and the `force` contract). Commit —
`"feat(backend): session delete with scope, attendance guard, season fence"`

---

### Task 7: Closing gate (coordinator)

- [ ] **Step 1:** `pnpm turbo lint typecheck test:unit build` → green; then the
full serial integration run:
`cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern integration` → green.
- [ ] **Step 2: Mutation pass** (one at a time, restore after each; the suite must fail each time):
  1. Remove `seasonId: existing.seasonId` from Task 5's sibling `where` → the C10 isolation test fails.
  2. In Task 3, copy `s.recurrenceGroupId` verbatim instead of the mapped fresh id → the duplication test's `not.toBe` fails.
  3. In Task 2's PATCH, let the ADMIN branch pass `status` through → the allowlist test fails.
- [ ] **Step 3:** Check the emitted build for bare shared requires (the
CLAUDE.md trap): `grep -rn 'require("@space/shared")' apps/backend/dist/apps/backend/src/routes/` → empty.
- [ ] **Step 4:** Report suite counts, the three mutation outcomes, and any
divergence from this plan.
