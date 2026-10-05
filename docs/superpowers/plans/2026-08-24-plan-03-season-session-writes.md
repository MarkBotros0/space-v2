# Plan 3 — Season & Session Writes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The API surface an admin needs to build and run a season — season CRUD and duplication, session creation with weekly recurrence, and scoped series edit/delete — with the deliberate divergences the specs demand: recurrence is season-scoped (ruling C10, a live v1 cross-season data-loss bug), duplication mints fresh recurrence ids, and weekly steps land on the same org wall-clock time across DST (C2, X13).

**Architecture:** Two file-disjoint workstreams. Seasons writes live in
`routes/seasons.ts`; session writes live in `routes/sessions.ts` — session
creation is `POST /api/v1/sessions` with `seasonId` in the body (a deliberate
deviation from the `POST /seasons/:id/groups` precedent, so the two
workstreams never touch the same file). Contracts convert `season.ts` to Zod,
port v1's season-code slug rules verbatim, and add the write schemas. A new
`lib/org-time.ts` is the one place wall-clock arithmetic and wall-clock text
are produced (ruling C2); Plans 10 and 11 append to it.

**Tech Stack:** Express 5, Prisma 7 (`src/generated/prisma`), Zod 3, jest +
supertest integration suite against the shared staging DB.

**Spec:** `docs/superpowers/specs/domains/02-seasons.md` (esp. R1–R4, R54–R69,
§10 D1, D3, D4, D5, D6, D15), `03-sessions.md` (esp. §10 items 1–3, 7, 11),
`_DECISIONS.md` (C1, C2, C10, C12). v1 sources: `jpc-space/src/lib/slug.ts`,
`season-actions.ts`, `session-actions.ts`, `recurrence.ts`.

**Depends on:** nothing beyond `main`. In the execution order
(1 → 2 → 3 → 4 → 15 → 16 → …) it runs after Plans 1–2 but touches none of
their files (backend + `packages/shared/src/{season,session}.ts` only). Plans
4 and 16 build the screens over these endpoints and consume the error codes
named below. **Forward note:** Plan 16 (D-16.6) later extends
`createSessionRequestSchema`/`updateSessionRequestSchema` to accept org
wall-clock `startDay` + `startTime` as the alternative to `startsAt` (exactly
one of the two), converts through Plan 15's `orgWallClockToInstant`, and makes
mobile send the wall-clock pair. Build `startsAt` here as written; it stays
accepted.

## Global Constraints

- **No migrations, ever** (X14). No edits under `apps/backend/prisma/`. Shared live staging DB.
- No `process.env` outside `src/lib/config.ts`; no `@prisma/client`; no `@/` alias.
- Response envelope `{ data }` / `{ error: { code, message } }` via `apiOk`/`apiError`.
- Shared **value** imports in any backend `src` file use the relative path `"../../../../packages/shared/src/index"` (depth adjusted) — never `"@space/shared"` (X12, the `rootDir` emit trap in CLAUDE.md). Type-only imports may use the package name.
- `requireAuth` stays as each router already mounts it; this plan adds handlers to the existing `seasonsRouter`/`sessionsRouter` and mounts no new router (X5).
- `src/docs/openapi.ts` changes in the same commit as the route it documents (code given per task).
- Integration fixtures: every row carries the `space-v2-test-` prefix in `User.email` or `Season.code`; use `createTestSeason`/`createTestUser`/`login`/`cleanupTestData` from `__tests__/integration/fixtures.ts`; `jest.setTimeout(60000)`.
- **Integration tests are serial.** Executed task-by-task (the default), each task runs its own suite: `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern <suite>`. If tasks 2–3 and 4–6 are ever parallelized across two agents, the agents write tests unrun and the coordinator runs them serially.
- The integration suite assumes the default `ORG_TIMEZONE` (`Africa/Cairo`); the DST test asserts that precondition first so a different `.env` fails with a clear message.
- v1 rules ported faithfully unless a spec §10 item or `_DECISIONS.md` ruling says otherwise; every divergence below names its ruling.

**Execution shape:** Task 1 first (both streams consume the contracts), then
Task 2 (it creates `lib/org-time.ts`, which Task 4 needs, and the shortened
fixture code Task 3 needs). Then Task 3 (seasons) and Tasks 4–6 (sessions)
are independent streams. Task 7 is the closing gate.

**Error codes this plan defines** (Plans 4/16 surface them): `code_taken`
409, `invalid_code` 400, `forbidden_field` 403, `season_in_use` 409,
`has_student_records` 409. D15 names the duplicate-code 409 `conflict`; this
plan keeps the more specific `code_taken` (recorded divergence — the client
needs to tell a code clash from any other conflict).

---

### Task 1: Contracts — season Zod conversion, v1 slug rules, write schemas

**Files:**
- Modify: `packages/shared/src/season.ts` (convert the three interfaces; port v1's slug; add write schemas)
- Modify: `packages/shared/src/session.ts` (add session write schemas + `recurrenceScopeSchema`)
- Test: `packages/shared/src/__tests__/write-schemas.test.ts`

**Interfaces:**
- Consumes: `seasonStatusSchema` from `./enums`.
- Produces (exact names later tasks and plans import): `seasonListItemSchema`, `seasonDetailGroupSchema`, `seasonDetailSchema` (+ `z.infer` types replacing the interfaces, same names); `SEASON_CODE_RE`, `slugifySeasonCode(input)`, `isValidSeasonCode(code)`; `seasonWriteRequestSchema` → `SeasonWriteBody` (z.output, `code` always set); `SEASON_ADMIN_EDITABLE_FIELDS`, `seasonAdminPatchSchema` → `SeasonAdminPatchBody`; `duplicateSeasonRequestSchema` → `DuplicateSeasonBody`; `recurrenceScopeSchema` → `RecurrenceScope`; `createSessionRequestSchema` → `CreateSessionBody`; `updateSessionRequestSchema` → `UpdateSessionBody`; `deleteSessionRequestSchema` → `DeleteSessionBody`.

- [ ] **Step 1: Failing test**

```ts
// packages/shared/src/__tests__/write-schemas.test.ts
import {
  createSessionRequestSchema,
  deleteSessionRequestSchema,
  duplicateSeasonRequestSchema,
  isValidSeasonCode,
  seasonAdminPatchSchema,
  seasonWriteRequestSchema,
  slugifySeasonCode,
  updateSessionRequestSchema,
} from "../index";

describe("slugifySeasonCode (v1 src/lib/slug.ts, verbatim)", () => {
  it("lowercases, strips diacritics, dashes runs, trims and collapses", () => {
    expect(slugifySeasonCode("Été  2099")).toBe("ete-2099");
    expect(slugifySeasonCode("--GBV // Spring--")).toBe("gbv-spring");
  });
});

describe("isValidSeasonCode", () => {
  it("enforces v1's format and 2–40 length on the slug", () => {
    expect(isValidSeasonCode("gbv-2099")).toBe(true);
    expect(isValidSeasonCode("a")).toBe(false);
    expect(isValidSeasonCode("a".repeat(41))).toBe(false);
    expect(isValidSeasonCode("-gbv")).toBe(false);
  });
});

describe("seasonWriteRequestSchema", () => {
  const valid = {
    code: "Test 2099", program: "TEST", year: 2099,
    startDate: "2099-01-01T00:00:00.000Z", endDate: "2099-12-31T00:00:00.000Z",
    status: "DRAFT",
  };

  it("slugifies the code before validating it, as v1 did", () => {
    expect(seasonWriteRequestSchema.parse(valid).code).toBe("test-2099");
  });

  it("defaults the code to '<program> <year>' when absent or empty (v1 R2)", () => {
    const { code: _omit, ...noCode } = valid;
    expect(seasonWriteRequestSchema.parse(noCode).code).toBe("test-2099");
    expect(seasonWriteRequestSchema.parse({ ...valid, code: "" }).code).toBe("test-2099");
  });

  it("applies the 40-char bound to the slug, not the raw input", () => {
    expect(seasonWriteRequestSchema.safeParse({ ...valid, code: "x".repeat(41) }).success).toBe(false);
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

describe("seasonAdminPatchSchema", () => {
  it("accepts only the D3 allowlist", () => {
    expect(seasonAdminPatchSchema.safeParse({ description: "x", absenceBudgetMinutes: 200 }).success).toBe(true);
    expect(seasonAdminPatchSchema.safeParse({ status: "ARCHIVED" }).success).toBe(false);
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

  it("refuses repeatWeeks outside 1..26 (v1 clamped silently)", () => {
    expect(
      createSessionRequestSchema.safeParse({ ...valid, seasonId: 1, repeatWeeks: 27 }).success,
    ).toBe(false);
  });

  it("requires a scope on update", () => {
    expect(updateSessionRequestSchema.safeParse(valid).success).toBe(false);
    expect(updateSessionRequestSchema.safeParse({ ...valid, scope: "future" }).success).toBe(true);
  });

  it("defaults delete to scope one, no force", () => {
    expect(deleteSessionRequestSchema.parse({})).toEqual({ scope: "one", force: false });
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

Run: `cd packages/shared && pnpm exec jest src/__tests__/write-schemas.test.ts` → FAIL (exports missing).

- [ ] **Step 2: Season contracts.** Replace `season.ts` with (the wire-shape comment kept):

```ts
import { z } from "zod";

import { seasonStatusSchema } from "./enums";

// Response shapes for the mobile client.
//
// Every timestamp is `string`, not `Date`: the backend hands Prisma Date objects
// to res.json(), which serialises them to ISO-8601. These schemas describe
// what arrives over the wire, so only the client should parse with them — the
// backend's own objects hold Dates and would not typecheck against these.

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

// ---- Season code: v1's src/lib/slug.ts, ported verbatim (spec 02 R3–R4) ----

export const SEASON_CODE_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export function slugifySeasonCode(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

/** v1 validated the *slug*: 2–40 chars (season-actions.ts:23) and the format regex (slug.ts:13). */
export function isValidSeasonCode(code: string): boolean {
  return code.length >= 2 && code.length <= 40 && SEASON_CODE_RE.test(code);
}

const CODE_MESSAGE = "Code must be 2–40 lowercase letters, numbers, and dashes.";
const DATE_ORDER_MESSAGE = "End date must be on or after start date.";

const seasonWriteFields = z.object({
  /** Raw; slugified below. The max is only a payload sanity cap — the real bound applies to the slug. */
  code: z.string().max(200).optional(),
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
});

/**
 * SUPER create and full update. v1 order: slugify `code || "<program> <year>"`
 * first, then validate the slug (season-actions.ts:65, :115).
 */
export const seasonWriteRequestSchema = seasonWriteFields
  .transform((v) => ({ ...v, code: slugifySeasonCode(v.code || `${v.program} ${v.year}`) }))
  .superRefine((v, ctx) => {
    if (!isValidSeasonCode(v.code)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["code"], message: CODE_MESSAGE });
    }
    if (new Date(v.endDate).getTime() < new Date(v.startDate).getTime()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endDate"], message: DATE_ORDER_MESSAGE });
    }
  });
export type SeasonWriteBody = z.output<typeof seasonWriteRequestSchema>;

/** Spec 02 D3: the only fields a season ADMIN may change. Everything else is SUPER's. */
export const SEASON_ADMIN_EDITABLE_FIELDS = [
  "description",
  "absenceBudgetMinutes",
  "absenceWeightMinutes",
] as const;

export const seasonAdminPatchSchema = z
  .object({
    description: z.string().max(2000).nullable(),
    absenceBudgetMinutes: z.number().int().min(1),
    absenceWeightMinutes: z.number().int().min(1),
  })
  .partial()
  .strict();
export type SeasonAdminPatchBody = z.output<typeof seasonAdminPatchSchema>;

/**
 * Duplicate. `code` stays raw here: its default is "<source.program> <year>"
 * (v1 season-actions.ts:256), which only the route knows, so the route
 * slugifies and validates it with the two helpers above.
 */
export const duplicateSeasonRequestSchema = z
  .object({
    year: z.number().int().min(2000).max(2100),
    code: z.string().max(200).optional(),
    startDate: z.string().datetime({ offset: true }),
    endDate: z.string().datetime({ offset: true }),
  })
  .refine((v) => new Date(v.endDate).getTime() >= new Date(v.startDate).getTime(), {
    path: ["endDate"], message: DATE_ORDER_MESSAGE,
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
   * Attendance and video progress are student history; destroying them
   * silently is v1's unreachable delete, not a behaviour anyone chose (ruling
   * C12). Deleting a session that has either requires this acknowledgement.
   */
  force: z.boolean().default(false),
});
export type DeleteSessionBody = z.output<typeof deleteSessionRequestSchema>;
```

- [ ] **Step 4:** Run the shared test → PASS. `pnpm turbo typecheck` → clean (the type names `SeasonListItem`/`SeasonDetail`/`SeasonDetailGroup` are unchanged, so existing importers still compile).

- [ ] **Step 5: Commit** — `git add packages/shared && git commit -m "feat(shared): season Zod contracts, v1 slug rules, season/session write schemas"`

---

### Task 2: Org time + season create/update/delete

**Files:**
- Modify: `apps/backend/src/lib/config.ts` (add `ORG_TIMEZONE`)
- Modify: `apps/backend/.env.example` (document `ORG_TIMEZONE`), `turbo.json` (add `ORG_TIMEZONE` to `build.env` — that list's own comment requires every runtime key)
- Create: `apps/backend/src/lib/org-time.ts`
- Create: `apps/backend/src/lib/prisma-errors.ts`
- Modify: `apps/backend/src/__tests__/integration/fixtures.ts` (shorter `testSeasonCode()`)
- Modify: `apps/backend/src/routes/seasons.ts`, `apps/backend/src/docs/openapi.ts`
- Test: `apps/backend/src/__tests__/org-time.test.ts`, `apps/backend/src/__tests__/prisma-errors.test.ts` (unit); extend `apps/backend/src/__tests__/integration/seasons-routes.test.ts`

**Interfaces:**
- Consumes: `seasonWriteRequestSchema`, `seasonAdminPatchSchema`, `SEASON_ADMIN_EDITABLE_FIELDS` (Task 1); existing `isSuper`/`isAdminOfSeason` (`lib/rbac`), `parseId`.
- Produces: `config.orgTimezone: string`; in `lib/org-time.ts`: `formatInOrgTime(date: Date): string` (Task 5), `addWeeksInOrgTime(start: Date, weeks: number): Date` (Task 4), `orgWallClock(date: Date): OrgWallClock` and `fromOrgWallClock(parts: OrgWallClock): Date` (Plans 10/11 build day boundaries on these); `isUniqueViolation(err: unknown): boolean` in `lib/prisma-errors.ts`; `testSeasonCode()` returning ≤ 26 chars; endpoints `POST /api/v1/seasons`, `PATCH /api/v1/seasons/:id`, `DELETE /api/v1/seasons/:id`.

- [ ] **Step 1: Unit tests for org-time and prisma-errors**

```ts
// apps/backend/src/__tests__/org-time.test.ts
// Pin the zone: a developer's .env may set another ORG_TIMEZONE, and these
// are exact-value tests of Cairo's rules.
jest.mock("../lib/config", () => ({ config: { orgTimezone: "Africa/Cairo" } }));

import { addWeeksInOrgTime, formatInOrgTime, fromOrgWallClock, orgWallClock } from "../lib/org-time";

describe("formatInOrgTime", () => {
  it("renders an instant as the organisation's wall clock, not the host's", () => {
    // 2099-03-01T18:00Z is 20:00 in Cairo (UTC+2 in March).
    expect(formatInOrgTime(new Date("2099-03-01T18:00:00.000Z"))).toBe("Mar 1, 2099, 8:00 PM");
  });
});

describe("addWeeksInOrgTime (X13: calendar-week steps in the org zone)", () => {
  it("is plain 7-day steps when no DST boundary is crossed", () => {
    const start = new Date("2099-03-01T18:00:00.000Z");
    expect([0, 1, 2].map((i) => addWeeksInOrgTime(start, i).toISOString())).toEqual([
      "2099-03-01T18:00:00.000Z", "2099-03-08T18:00:00.000Z", "2099-03-15T18:00:00.000Z",
    ]);
  });

  it("keeps 20:00 Cairo across the spring-forward boundary (last Friday of April)", () => {
    // Egypt has observed DST again since 2023: UTC+2 → UTC+3 on 2099-04-24.
    // Fixed 7-day instants would drift to 21:00; the series must stay at 20:00.
    const start = new Date("2099-04-17T18:00:00.000Z");
    expect([0, 1, 2].map((i) => addWeeksInOrgTime(start, i).toISOString())).toEqual([
      "2099-04-17T18:00:00.000Z", "2099-04-24T17:00:00.000Z", "2099-05-01T17:00:00.000Z",
    ]);
  });

  it("keeps 21:00 Cairo across the fall-back boundary (last Thursday of October)", () => {
    const start = new Date("2099-10-16T18:00:00.000Z"); // 21:00 at UTC+3
    expect([0, 1, 2].map((i) => addWeeksInOrgTime(start, i).toISOString())).toEqual([
      "2099-10-16T18:00:00.000Z", "2099-10-23T18:00:00.000Z", "2099-10-30T19:00:00.000Z",
    ]);
  });
});

describe("orgWallClock / fromOrgWallClock", () => {
  it("round-trips an instant", () => {
    const at = new Date("2099-07-01T09:30:15.250Z");
    expect(fromOrgWallClock(orgWallClock(at)).toISOString()).toBe(at.toISOString());
  });
});
```

```ts
// apps/backend/src/__tests__/prisma-errors.test.ts
import { isUniqueViolation } from "../lib/prisma-errors";

it("recognises P2002 and nothing else", () => {
  expect(isUniqueViolation({ code: "P2002" })).toBe(true);
  expect(isUniqueViolation({ code: "P2003" })).toBe(false);
  expect(isUniqueViolation(new Error("boom"))).toBe(false);
  expect(isUniqueViolation(null)).toBe(false);
});
```

Run: `cd apps/backend && npx jest src/__tests__/org-time.test.ts src/__tests__/prisma-errors.test.ts` → FAIL (modules missing).

- [ ] **Step 2: Implement config, org-time, prisma-errors**

In `config.ts`'s `envSchema` add (beside `NODE_ENV`):

```ts
  // IANA zone every wall-clock derivation resolves against (ruling C2): the
  // text of a reschedule notice, where the next weekly occurrence lands, any
  // day bucketing. Never the host's zone. The organisation is Cairo-based.
  ORG_TIMEZONE: z.string().default("Africa/Cairo"),
```

and `orgTimezone: parsed.data.ORG_TIMEZONE,` to the exported `config`
object. Append to `.env.example`:

```
# IANA timezone for every wall-clock derivation (reschedule notice text,
# weekly recurrence, day bucketing). Defaults to Africa/Cairo.
ORG_TIMEZONE=Africa/Cairo
```

and add `"ORG_TIMEZONE"` to `turbo.json`'s `build.env` array after `"ENABLE_API_DOCS"`.

```ts
// apps/backend/src/lib/org-time.ts
import { config } from "./config";

/**
 * The one place wall-clock arithmetic and wall-clock text happen on the server.
 *
 * Ruling C2: v1 formatted timestamps with the host's incidental locale and
 * zone (`toLocaleString()` in the reschedule notification) and spaced weekly
 * recurrence with date-fns `addDays` in the host's zone, so both depended on
 * where the server ran. Everything wall-clock resolves against one configured
 * organisation timezone instead.
 */
const displayFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: config.orgTimezone,
  year: "numeric", month: "short", day: "numeric",
  hour: "numeric", minute: "2-digit",
});

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: config.orgTimezone,
  hourCycle: "h23",
  year: "numeric", month: "numeric", day: "numeric",
  hour: "numeric", minute: "numeric", second: "numeric",
});

export interface OrgWallClock {
  year: number;
  /** 1–12 */
  month: number;
  /** May overflow (e.g. 35) when passed to fromOrgWallClock — Date.UTC normalises it. */
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
}

export function formatInOrgTime(date: Date): string {
  return displayFormatter.format(date);
}

/** The org-zone calendar fields of an instant. */
export function orgWallClock(date: Date): OrgWallClock {
  const fields: Record<string, number> = {};
  for (const part of partsFormatter.formatToParts(date)) {
    if (part.type !== "literal") fields[part.type] = Number(part.value);
  }
  return {
    year: fields.year ?? 0,
    month: fields.month ?? 1,
    day: fields.day ?? 1,
    hour: fields.hour ?? 0,
    minute: fields.minute ?? 0,
    second: fields.second ?? 0,
    millisecond: date.getUTCMilliseconds(),
  };
}

/** Org-zone UTC offset in ms at an instant (whole seconds; zones have no sub-second offsets). */
function offsetAt(instantMs: number): number {
  const p = orgWallClock(new Date(instantMs));
  const wallAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return wallAsUtc - (instantMs - p.millisecond);
}

/**
 * The instant at which the org zone's clock reads `parts`. Two passes: the
 * first guesses with the offset at the naive instant, the second corrects
 * with the offset at the guess, which is right on both sides of a
 * transition. A wall time skipped by spring-forward resolves one hour later.
 */
export function fromOrgWallClock(parts: OrgWallClock): Date {
  const naive = Date.UTC(
    parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, parts.millisecond,
  );
  const guess = naive - offsetAt(naive);
  return new Date(naive - offsetAt(guess));
}

/**
 * `start` moved by `weeks` calendar weeks in the org zone: same weekday, same
 * wall-clock time. Across a DST boundary the UTC instant shifts by the
 * offset change; that is the point (X13).
 */
export function addWeeksInOrgTime(start: Date, weeks: number): Date {
  const p = orgWallClock(start);
  return fromOrgWallClock({ ...p, day: p.day + weeks * 7 });
}
```

```ts
// apps/backend/src/lib/prisma-errors.ts
/**
 * Prisma's unique-constraint violation. Duck-typed on `code` rather than
 * `instanceof PrismaClientKnownRequestError` so callers need no value import
 * from the generated client. Spec 02 D15: read-then-write uniqueness checks
 * race; the loser's P2002 must become the same 409 the pre-check gives.
 */
export function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && err.code === "P2002";
}
```

Run the two unit tests → PASS.

- [ ] **Step 3: Shorten the fixture code (review B1)**

`testSeasonCode()` is `"space-v2-test-" + randomUUID()` — 50 chars, over
v1's 40-char code bound, so every `POST /seasons` test would get a 400. In
`fixtures.ts`:

```ts
/**
 * 26 chars: the prefix plus 12 hex digits (48 bits — collision-free at test
 * scale). Season codes are bounded at 40 (v1 R4), and duplication appends
 * "-<year>" to derived codes, so the fixture must leave room.
 */
export function testSeasonCode(): string {
  return `${TEST_PREFIX}${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}
```

- [ ] **Step 4: Failing integration tests.** In `seasons-routes.test.ts` add
`testSeasonCode` and `TEST_PREFIX` to the fixtures import (the suite already
has `superToken`, `adminToken`, `seasonId` with an ACTIVE enrollment and a
group), then append:

```ts
const seasonBody = (code: string) => ({
  code, program: "TEST", year: 2099, status: "DRAFT",
  startDate: "2099-01-01T00:00:00.000Z", endDate: "2099-12-31T00:00:00.000Z",
});

describe("season writes", () => {
  it("fixture codes fit v1's 40-char bound with room for '-<year>'", () => {
    expect(testSeasonCode().length).toBeLessThanOrEqual(35);
  });

  it("creates a season with slugged code, derived title, and the budget fields kept", async () => {
    const code = testSeasonCode();
    const res = await request(app)
      .post("/api/v1/seasons")
      .set("authorization", `Bearer ${superToken}`)
      .send({ ...seasonBody(code.toUpperCase()), absenceBudgetMinutes: 240, absenceWeightMinutes: 120 });

    expect(res.status).toBe(201);
    expect(res.body.data.code).toBe(code); // slugified back to lowercase
    const row = await db.season.findUnique({
      where: { id: res.body.data.id },
      select: { title: true, absenceBudgetMinutes: true, absenceWeightMinutes: true, createdById: true },
    });
    // v1 derived title as `${program} ${year}` and its create DISCARDED the
    // budget fields (spec 02 D1) — both behaviours pinned here.
    expect(row).toMatchObject({ title: "TEST 2099", absenceBudgetMinutes: 240, absenceWeightMinutes: 120 });
    expect(row?.createdById).not.toBeNull();
  });

  it("refuses creation by an ADMIN — SUPER only (spec 02 D3)", async () => {
    const res = await request(app)
      .post("/api/v1/seasons")
      .set("authorization", `Bearer ${adminToken}`)
      .send(seasonBody(testSeasonCode()));
    expect(res.status).toBe(403);
  });

  it("refuses an invalid code with 400", async () => {
    const res = await request(app)
      .post("/api/v1/seasons")
      .set("authorization", `Bearer ${superToken}`)
      .send(seasonBody(`${TEST_PREFIX}${"x".repeat(30)}`));
    expect(res.status).toBe(400);
  });

  it("lets a season ADMIN edit operational fields but not identity", async () => {
    // D3's allowlist: an admin runs the season, so the engagement knobs and
    // description are theirs; code/status/dates/program/year are SUPER's.
    const ok = await request(app)
      .patch(`/api/v1/seasons/${seasonId}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ description: "Updated.", absenceBudgetMinutes: 200 });
    expect(ok.status).toBe(200);
    const row = await db.season.findUnique({
      where: { id: seasonId }, select: { description: true, absenceBudgetMinutes: true },
    });
    expect(row).toEqual({ description: "Updated.", absenceBudgetMinutes: 200 });

    const refused = await request(app)
      .patch(`/api/v1/seasons/${seasonId}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ status: "ARCHIVED" });
    expect(refused.status).toBe(403);
    expect(refused.body.error.code).toBe("forbidden_field");
  });

  it("refuses PATCH by an ADMIN of a different season", async () => {
    const res = await request(app)
      .patch(`/api/v1/seasons/${otherSeasonId}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ description: "Nope." });
    expect(res.status).toBe(403);
  });

  it("lets a SUPER rewrite identity, re-deriving the title", async () => {
    const created = await createTestSeason();
    const res = await request(app)
      .patch(`/api/v1/seasons/${created.id}`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ ...seasonBody(created.code), program: "GBV", year: 2098, status: "ACTIVE" });
    expect(res.status).toBe(200);
    const row = await db.season.findUnique({ where: { id: created.id }, select: { title: true, status: true } });
    expect(row).toEqual({ title: "GBV 2098", status: "ACTIVE" });
  });

  it("refuses a duplicate code with 409, not a Prisma error", async () => {
    const first = testSeasonCode();
    const made = await request(app)
      .post("/api/v1/seasons")
      .set("authorization", `Bearer ${superToken}`)
      .send(seasonBody(first));
    expect(made.status).toBe(201);
    const clash = await request(app)
      .post("/api/v1/seasons")
      .set("authorization", `Bearer ${superToken}`)
      .send(seasonBody(first));
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe("code_taken");
  });

  it("soft-deletes an empty season and clears student pointers to it", async () => {
    const empty = await createTestSeason();
    const pointed = await createTestUser("pointed", "STUDENT");
    await db.studentProfile.create({ data: { userId: pointed.id, activeSeasonId: empty.id } });

    const gone = await request(app)
      .delete(`/api/v1/seasons/${empty.id}`)
      .set("authorization", `Bearer ${superToken}`);
    expect(gone.status).toBe(200);
    const row = await db.season.findUnique({ where: { id: empty.id }, select: { deletedAt: true } });
    expect(row?.deletedAt).not.toBeNull();
    const profile = await db.studentProfile.findUnique({
      where: { userId: pointed.id }, select: { activeSeasonId: true },
    });
    expect(profile?.activeSeasonId).toBeNull();

    const again = await request(app)
      .delete(`/api/v1/seasons/${empty.id}`)
      .set("authorization", `Bearer ${superToken}`);
    expect(again.status).toBe(404);
  });

  it("blocks deleting a season with enrollments or sessions (decision on spec 02 D4)", async () => {
    // `seasonId` (the suite's main season) has an enrollment from beforeAll.
    const blocked = await request(app)
      .delete(`/api/v1/seasons/${seasonId}`)
      .set("authorization", `Bearer ${superToken}`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("season_in_use");

    const withSession = await createTestSeason();
    await db.session.create({
      data: { seasonId: withSession.id, title: "S", startsAt: new Date("2099-02-01T18:00:00.000Z"), durationMinutes: 60 },
    });
    const blocked2 = await request(app)
      .delete(`/api/v1/seasons/${withSession.id}`)
      .set("authorization", `Bearer ${superToken}`);
    expect(blocked2.status).toBe(409);
  });

  it("refuses delete by an ADMIN even of their own season (D3)", async () => {
    const res = await request(app)
      .delete(`/api/v1/seasons/${seasonId}`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
  });
});
```

Run the suite → new cases FAIL (404s from the catch-all).

- [ ] **Step 5: Implement** in `routes/seasons.ts`. Extend the existing
relative shared import with `seasonWriteRequestSchema`,
`seasonAdminPatchSchema`, `SEASON_ADMIN_EDITABLE_FIELDS`, and add
`import { isUniqueViolation } from "../lib/prisma-errors";`. Register the
three handlers after the existing `GET "/:id"`:

```ts
const ADMIN_EDITABLE = new Set<string>(SEASON_ADMIN_EDITABLE_FIELDS);

const codeTaken = (res: Response) =>
  apiError(res, "code_taken", "A season with that code already exists.", 409);

seasonsRouter.post("/", async (req, res) => {
  const user = requireUser(req);
  // Spec 02 D3: creation is SUPER-only (v1's canCreateSeason).
  if (!isSuper(user)) return apiError(res, "forbidden", "You don't have access to this.", 403);

  const parsed = seasonWriteRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid season body.", 400);
  const body = parsed.data;

  // v1 R7: the check has no deletedAt filter — a soft-deleted season keeps its code.
  const clash = await db.season.findUnique({ where: { code: body.code }, select: { id: true } });
  if (clash) return codeTaken(res);

  try {
    const season = await db.season.create({
      data: {
        code: body.code,
        title: `${body.program} ${body.year}`,
        program: body.program,
        year: body.year,
        description: body.description ?? null,
        startDate: new Date(body.startDate),
        endDate: new Date(body.endDate),
        status: body.status,
        absenceBudgetMinutes: body.absenceBudgetMinutes,
        absenceWeightMinutes: body.absenceWeightMinutes,
        createdById: user.userId,
        updatedById: user.userId,
      },
      select: { id: true, code: true },
    });
    return apiOk(res, season, 201);
  } catch (err) {
    // D15: the race loser's P2002 becomes the same answer as the pre-check.
    if (isUniqueViolation(err)) return codeTaken(res);
    throw err;
  }
});

seasonsRouter.patch("/:id", async (req, res) => {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid season id.", 400);

  const existing = await db.season.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
  if (!existing) return apiError(res, "not_found", "Season not found.", 404);

  if (isSuper(user)) {
    // SUPER: v1's full-body update, title re-derived (R10).
    const parsed = seasonWriteRequestSchema.safeParse(req.body);
    if (!parsed.success) return apiError(res, "bad_request", "Invalid season body.", 400);
    const body = parsed.data;
    const clash = await db.season.findFirst({ where: { code: body.code, NOT: { id } }, select: { id: true } });
    if (clash) return codeTaken(res);
    try {
      const season = await db.season.update({
        where: { id },
        data: {
          code: body.code,
          title: `${body.program} ${body.year}`,
          program: body.program,
          year: body.year,
          description: body.description ?? null,
          startDate: new Date(body.startDate),
          endDate: new Date(body.endDate),
          status: body.status,
          absenceBudgetMinutes: body.absenceBudgetMinutes,
          absenceWeightMinutes: body.absenceWeightMinutes,
          updatedById: user.userId,
        },
        select: { id: true, code: true },
      });
      return apiOk(res, season);
    } catch (err) {
      if (isUniqueViolation(err)) return codeTaken(res);
      throw err;
    }
  }

  if (!isAdminOfSeason(user, id)) return apiError(res, "forbidden", "You don't have access to this.", 403);

  // Spec 02 D3: v1's canEditSeason let a season ADMIN rename, restatus and
  // delete. The allowlist is checked on the raw keys BEFORE parsing so an
  // identity field is a 403, not a silently-stripped 200.
  const raw: Record<string, unknown> =
    typeof req.body === "object" && req.body !== null ? req.body : {};
  if (Object.keys(raw).some((key) => !ADMIN_EDITABLE.has(key))) {
    return apiError(res, "forbidden_field", "Season identity fields are SUPER-only.", 403);
  }
  const parsed = seasonAdminPatchSchema.safeParse(raw);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid season body.", 400);

  const season = await db.season.update({
    where: { id },
    data: { ...parsed.data, updatedById: user.userId },
    select: { id: true, code: true },
  });
  return apiOk(res, season);
});

seasonsRouter.delete("/:id", async (req, res) => {
  const user = requireUser(req);
  if (!isSuper(user)) return apiError(res, "forbidden", "You don't have access to this.", 403);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid season id.", 400);

  const existing = await db.season.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
  if (!existing) return apiError(res, "not_found", "Season not found.", 404);

  // Product decision on spec 02 D4 (recorded in the Revision note): v1
  // checked nothing and stranded children. v2 refuses while the season has
  // ANY enrollment or session — archive it (status ARCHIVED) instead. D4's
  // `force` escape hatch is not offered: a soft-deleted season with sessions
  // stays reachable by id everywhere (R50), which is the state D4 objects to.
  const [enrollments, sessions] = await Promise.all([
    db.seasonEnrollment.count({ where: { seasonId: id } }),
    db.session.count({ where: { seasonId: id } }),
  ]);
  if (enrollments > 0 || sessions > 0) {
    return apiError(
      res,
      "season_in_use",
      "This season has sessions or enrollments; archive it instead.",
      409,
    );
  }

  // R51: v1 left StudentProfile.activeSeasonId pointing at the deleted row.
  await db.$transaction([
    db.studentProfile.updateMany({ where: { activeSeasonId: id }, data: { activeSeasonId: null } }),
    db.season.update({ where: { id }, data: { deletedAt: new Date(), updatedById: user.userId } }),
  ]);
  return apiOk(res, { deleted: true });
});
```

Add `import type { Response } from "express";` (merge with the existing
`express` import). Soft delete is an `update`, so no FK `Restrict` relation
(Group, SeasonEnrollment, or any future one) can make it throw.

- [ ] **Step 6:** Run: `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern seasons-routes` → PASS. `pnpm turbo lint typecheck test:unit --filter=@space/backend` → clean.

- [ ] **Step 7: OpenAPI** — in `src/docs/openapi.ts` add, beside `errRef`:

```ts
function conflict(description: string) {
  return { description, content: { "application/json": { schema: errorResponse } } };
}
```

add a `SeasonWriteRequest` component next to `GroupWriteRequest`:

```ts
      SeasonWriteRequest: {
        type: "object",
        required: ["program", "year", "startDate", "endDate", "status"],
        properties: {
          code: { type: "string", description: "Slugified server-side (v1 rules); defaults to '<program> <year>'. The slug must be 2–40 chars of a-z, 0-9 and inner dashes." },
          program: { type: "string", minLength: 1, maxLength: 60 },
          year: { type: "integer", minimum: 2000, maximum: 2100 },
          description: { type: ["string", "null"], maxLength: 2000 },
          startDate: { type: "string", format: "date-time" },
          endDate: { type: "string", format: "date-time" },
          status: { type: "string", enum: ["DRAFT", "ACTIVE", "COMPLETED", "ARCHIVED"] },
          absenceBudgetMinutes: { type: "integer", minimum: 1, default: 180 },
          absenceWeightMinutes: { type: "integer", minimum: 1, default: 90 },
        },
      },
```

add `post` to the existing `"/api/v1/seasons"` object:

```ts
      post: {
        tags: ["Seasons"],
        summary: "Create a season",
        description:
          "SUPER only (spec 02 D3). Title is derived as '<program> <year>'. Unlike v1, the absence budget fields are persisted on create (D1). A soft-deleted season still reserves its code.",
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/SeasonWriteRequest" } } } },
        responses: {
          201: ok({ type: "object", properties: { id: { type: "integer" }, code: { type: "string" } } }, "Created."),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          409: conflict("`code_taken` — the slugified code is in use (also returned for the unique-index race, D15; D15's generic `conflict` is deliberately more specific here)."),
        },
      },
```

and `patch` + `delete` to the existing `"/api/v1/seasons/{id}"` object:

```ts
      patch: {
        tags: ["Seasons"],
        summary: "Update a season",
        description:
          "Asymmetric by role (spec 02 D3). SUPER sends the full SeasonWriteRequest (v1's whole-body update; title re-derived). A season ADMIN sends a partial body containing only `description`, `absenceBudgetMinutes`, `absenceWeightMinutes`; any other key is refused with 403 `forbidden_field` rather than stripped.",
        parameters: [idParam],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/SeasonWriteRequest" } } } },
        responses: {
          200: ok({ type: "object", properties: { id: { type: "integer" }, code: { type: "string" } } }, "Updated."),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: conflict("`forbidden` (not SUPER, not this season's ADMIN) or `forbidden_field` (ADMIN sent an identity field)."),
          404: errRef("NotFound"),
          409: conflict("`code_taken`."),
        },
      },
      delete: {
        tags: ["Seasons"],
        summary: "Soft-delete a season",
        description:
          "SUPER only. Refused with 409 `season_in_use` while the season has any enrollment or session — archive it instead (decision on spec 02 D4). On success clears every StudentProfile.activeSeasonId pointing at it, in the same transaction.",
        parameters: [idParam],
        responses: {
          200: ok({ type: "object", properties: { deleted: { type: "boolean" } } }, "Deleted."),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
          409: conflict("`season_in_use`."),
        },
      },
```

- [ ] **Step 8: Commit** — `git add apps/backend turbo.json && git commit -m "feat(backend): org time, season create, allowlisted update, guarded delete"`

---

### Task 3: Season duplication

**Files:**
- Modify: `apps/backend/src/routes/seasons.ts`, `apps/backend/src/docs/openapi.ts`
- Test: extend `apps/backend/src/__tests__/integration/seasons-routes.test.ts`

**Interfaces:**
- Consumes: `duplicateSeasonRequestSchema`, `slugifySeasonCode`, `isValidSeasonCode` (Task 1), `newPublicId` from `../lib/public-id`, `isUniqueViolation` (Task 2).
- Produces: `POST /api/v1/seasons/:id/duplicate` → `{ data: { id, code } }`, 201.

**What ports and what diverges** (v1 `duplicateSeasonAction`, `season-actions.ts:199-362`; spec 02 R54–R69):
- Ported: SUPER-only (R54); copies `program`, `description`, both budget fields from the source and takes `year`, `code`, `startDate`, `endDate` from input, status forced `DRAFT` (R56, R20); title `'<program> <year>'`; groups copied **name/description only — no leaders, no students** (R57, R61); sessions copied with `startsAt` shifted by the single offset `newStart − source.startDate` (R58, R62); non-deleted assignments copied with `dueAt` shifted by the same offset (null stays null) and **`sessionId` remapped through a `sessionIdMap`** to the cloned session (R59); targets remapped through `groupIdMap`, only when not `isAllGroups`, unmappable ones dropped (R60); code default `slugify(code || '<source.program> <year>')`, validated, uniqueness-checked (R64); one transaction (R67); duplicating user as assignment `createdById`/`updatedById` (R68). The date shift stays a fixed instant offset (v1); it is not recurrence, so X13 does not apply.
- Diverges: (1) **fresh recurrence ids** — one new id per source `recurrenceGroupId` (spec 02 D5, ruling C10); (2) the source must not be soft-deleted (D6 — v1 duplicated deleted seasons); (3) 409 on the unique-index race (D15).
- The duplicate sheet's copy ("leaders and students are not copied", D6) is Plan 16's.

- [ ] **Step 1: Failing test.** Append to `seasons-routes.test.ts`:

```ts
describe("POST /api/v1/seasons/:id/duplicate", () => {
  it("clones structure faithfully to v1: shifted dates, remapped ids, no people, FRESH recurrence ids", async () => {
    const source = await createTestSeason();
    // Explicit start so the offset is visible: 2099-01-01 → 2100-01-04 is
    // 365 + 3 = 368 days.
    await db.season.update({
      where: { id: source.id },
      data: {
        startDate: new Date("2099-01-01T00:00:00.000Z"),
        absenceBudgetMinutes: 240,
        description: "Source description",
      },
    });

    const leader = await createTestUser("dupleader", "LEADER");
    const member = await createTestUser("dupstudent", "STUDENT");
    const group = await db.group.create({
      data: {
        seasonId: source.id,
        name: "Dup Group",
        description: "G",
        leaders: { create: { userId: leader.id } },
        students: { create: { studentUserId: member.id } },
      },
      select: { id: true },
    });

    const s1 = await db.session.create({
      data: { seasonId: source.id, title: "Series A", startsAt: new Date("2099-01-05T18:00:00.000Z"),
        durationMinutes: 60, recurrenceGroupId: "space-v2-test-rgrp" },
      select: { id: true },
    });
    await db.session.create({
      data: { seasonId: source.id, title: "Series A", startsAt: new Date("2099-01-12T18:00:00.000Z"),
        durationMinutes: 60, recurrenceGroupId: "space-v2-test-rgrp" },
    });

    await db.assignment.create({
      data: {
        seasonId: source.id, sessionId: s1.id, title: "Linked", isAllGroups: false,
        dueAt: new Date("2099-02-01T21:59:00.000Z"),
        targets: { create: { groupId: group.id } },
      },
    });
    await db.assignment.create({
      data: { seasonId: source.id, title: "Gone", isAllGroups: true, deletedAt: new Date() },
    });

    const code = testSeasonCode();
    const res = await request(app)
      .post(`/api/v1/seasons/${source.id}/duplicate`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ year: 2100, code, startDate: "2100-01-04T00:00:00.000Z", endDate: "2100-12-31T00:00:00.000Z" });

    expect(res.status).toBe(201);
    expect(res.body.data.code).toBe(code);
    const newId: number = res.body.data.id;

    const cloned = await db.session.findMany({
      where: { seasonId: newId },
      select: { id: true, startsAt: true, recurrenceGroupId: true },
      orderBy: { startsAt: "asc" },
    });
    expect(cloned.map((s) => s.startsAt.toISOString())).toEqual([
      "2100-01-08T18:00:00.000Z", "2100-01-15T18:00:00.000Z",
    ]);
    // Fresh series id: shared by the clones, different from the source's —
    // v1 copied it verbatim, which is how a series edit in one season
    // rewrote another's sessions (C10).
    expect(cloned[0]?.recurrenceGroupId).toBe(cloned[1]?.recurrenceGroupId);
    expect(cloned[0]?.recurrenceGroupId).not.toBe("space-v2-test-rgrp");
    expect(cloned[0]?.recurrenceGroupId).not.toBeNull();

    const groups = await db.group.findMany({
      where: { seasonId: newId },
      select: { id: true, name: true, description: true, _count: { select: { leaders: true, students: true } } },
    });
    // R61: no leaders, no students.
    expect(groups).toEqual([
      { id: expect.any(Number), name: "Dup Group", description: "G", _count: { leaders: 0, students: 0 } },
    ]);

    const assignments = await db.assignment.findMany({
      where: { seasonId: newId },
      select: { title: true, sessionId: true, dueAt: true, targets: { select: { groupId: true } } },
    });
    // The soft-deleted one is not copied (R59); the linked one points at the
    // CLONED session and the CLONED group, with dueAt shifted 368 days.
    expect(assignments).toEqual([
      {
        title: "Linked",
        sessionId: cloned[0]?.id,
        dueAt: new Date("2100-02-04T21:59:00.000Z"),
        targets: [{ groupId: groups[0]?.id }],
      },
    ]);

    const season = await db.season.findUnique({
      where: { id: newId },
      select: { status: true, title: true, absenceBudgetMinutes: true, description: true },
    });
    expect(season).toEqual({
      status: "DRAFT", title: "TEST 2100", absenceBudgetMinutes: 240, description: "Source description",
    });
  });

  it("defaults the code to slugify('<source.program> <year>') (v1 R64)", async () => {
    // A prefixed program keeps the derived code inside cleanupTestData's
    // prefix discovery; a plain "TEST" program would derive "test-2100" and
    // leak a row into the shared DB.
    const source = await createTestSeason();
    const program = testSeasonCode(); // 26 chars, prefixed
    await db.season.update({ where: { id: source.id }, data: { program } });

    const res = await request(app)
      .post(`/api/v1/seasons/${source.id}/duplicate`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ year: 2100, startDate: "2100-01-01T00:00:00.000Z", endDate: "2100-12-31T00:00:00.000Z" });

    expect(res.status).toBe(201);
    expect(res.body.data.code).toBe(`${program}-2100`);
  });

  it("refuses a code already in use with 409 code_taken", async () => {
    const source = await createTestSeason();
    const res = await request(app)
      .post(`/api/v1/seasons/${source.id}/duplicate`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ year: 2100, code: source.code, startDate: "2100-01-01T00:00:00.000Z", endDate: "2100-12-31T00:00:00.000Z" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("code_taken");
  });

  it("refuses to duplicate a soft-deleted season (spec 02 D6)", async () => {
    const source = await createTestSeason();
    await db.season.update({ where: { id: source.id }, data: { deletedAt: new Date() } });
    const res = await request(app)
      .post(`/api/v1/seasons/${source.id}/duplicate`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ year: 2100, code: testSeasonCode(), startDate: "2100-01-01T00:00:00.000Z", endDate: "2100-12-31T00:00:00.000Z" });
    expect(res.status).toBe(404);
  });

  it("is SUPER-only", async () => {
    const res = await request(app)
      .post(`/api/v1/seasons/${seasonId}/duplicate`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ year: 2100, code: testSeasonCode(), startDate: "2100-01-01T00:00:00.000Z", endDate: "2100-12-31T00:00:00.000Z" });
    expect(res.status).toBe(403);
  });
});
```

Run → FAIL (404).

- [ ] **Step 2: Implement.** Add `duplicateSeasonRequestSchema`,
`slugifySeasonCode`, `isValidSeasonCode` to the relative shared import and
`import { newPublicId } from "../lib/public-id";`, then:

```ts
seasonsRouter.post("/:id/duplicate", async (req, res) => {
  const user = requireUser(req);
  // R54: canCreateSeason (SUPER), not the source's admin rights.
  if (!isSuper(user)) return apiError(res, "forbidden", "You don't have access to this.", 403);
  const sourceId = parseId(req.params.id);
  if (sourceId === null) return apiError(res, "bad_request", "Invalid season id.", 400);

  const parsed = duplicateSeasonRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid duplicate body.", 400);
  const input = parsed.data;

  // D6: v1 had no deletedAt guard here and would clone a deleted season.
  const source = await db.season.findFirst({
    where: { id: sourceId, deletedAt: null },
    select: {
      program: true, description: true, startDate: true,
      absenceBudgetMinutes: true, absenceWeightMinutes: true,
      groups: { select: { id: true, name: true, description: true } },
      sessions: {
        select: {
          id: true, title: true, startsAt: true, durationMinutes: true,
          location: true, youtubeUrl: true, description: true, recurrenceGroupId: true,
        },
      },
      assignments: {
        where: { deletedAt: null },
        select: {
          title: true, description: true, dueAt: true, isAllGroups: true, type: true,
          forumMinWords: true, forumAllowComments: true, maxFileSizeMb: true,
          allowedMimeCategories: true, sessionId: true,
          targets: { select: { groupId: true } },
        },
      },
    },
  });
  if (!source) return apiError(res, "not_found", "Season not found.", 404);

  const code = slugifySeasonCode(input.code || `${source.program} ${input.year}`);
  if (!isValidSeasonCode(code)) {
    return apiError(res, "invalid_code", "Code must be 2–40 lowercase letters, numbers, and dashes.", 400);
  }
  const clash = await db.season.findUnique({ where: { code }, select: { id: true } });
  if (clash) return codeTaken(res);

  const startDate = new Date(input.startDate);
  const offsetMs = startDate.getTime() - source.startDate.getTime();
  const shift = (d: Date) => new Date(d.getTime() + offsetMs);

  try {
    const created = await db.$transaction(async (tx) => {
      const season = await tx.season.create({
        data: {
          code,
          title: `${source.program} ${input.year}`,
          program: source.program,
          year: input.year,
          description: source.description,
          startDate,
          endDate: new Date(input.endDate),
          status: "DRAFT",
          absenceBudgetMinutes: source.absenceBudgetMinutes,
          absenceWeightMinutes: source.absenceWeightMinutes,
          createdById: user.userId,
          updatedById: user.userId,
        },
        select: { id: true, code: true },
      });

      // R57/R61: name and description only — no GroupLeader, no GroupStudent.
      const groupIdMap = new Map<number, number>();
      for (const g of source.groups) {
        const clone = await tx.group.create({
          data: { seasonId: season.id, name: g.name, description: g.description },
          select: { id: true },
        });
        groupIdMap.set(g.id, clone.id);
      }

      // Divergence (spec 02 D5, ruling C10): one FRESH id per source series.
      const recurrenceIdMap = new Map<string, string>();
      const freshRecurrenceId = (old: string): string => {
        const existing = recurrenceIdMap.get(old);
        if (existing) return existing;
        const minted = newPublicId();
        recurrenceIdMap.set(old, minted);
        return minted;
      };

      const sessionIdMap = new Map<number, number>();
      for (const s of source.sessions) {
        const clone = await tx.session.create({
          data: {
            seasonId: season.id,
            title: s.title,
            startsAt: shift(s.startsAt),
            durationMinutes: s.durationMinutes,
            location: s.location,
            youtubeUrl: s.youtubeUrl,
            description: s.description,
            recurrenceGroupId: s.recurrenceGroupId ? freshRecurrenceId(s.recurrenceGroupId) : null,
          },
          select: { id: true },
        });
        sessionIdMap.set(s.id, clone.id);
      }

      for (const a of source.assignments) {
        const clone = await tx.assignment.create({
          data: {
            seasonId: season.id,
            // R59: remapped to the cloned session, never the source's.
            sessionId: a.sessionId ? (sessionIdMap.get(a.sessionId) ?? null) : null,
            title: a.title,
            description: a.description,
            dueAt: a.dueAt ? shift(a.dueAt) : null,
            isAllGroups: a.isAllGroups,
            type: a.type,
            forumMinWords: a.forumMinWords,
            forumAllowComments: a.forumAllowComments,
            maxFileSizeMb: a.maxFileSizeMb,
            allowedMimeCategories: a.allowedMimeCategories,
            createdById: user.userId,
            updatedById: user.userId,
          },
          select: { id: true },
        });
        if (!a.isAllGroups) {
          // R60: only remappable targets; an unmappable one is dropped.
          const groupIds = a.targets
            .map((t) => groupIdMap.get(t.groupId))
            .filter((gid): gid is number => gid !== undefined);
          if (groupIds.length > 0) {
            await tx.assignmentTarget.createMany({
              data: groupIds.map((groupId) => ({ assignmentId: clone.id, groupId })),
            });
          }
        }
      }

      return season;
    });
    return apiOk(res, created, 201);
  } catch (err) {
    if (isUniqueViolation(err)) return codeTaken(res);
    throw err;
  }
});
```

- [ ] **Step 3: OpenAPI** — add:

```ts
    "/api/v1/seasons/{id}/duplicate": {
      post: {
        tags: ["Seasons"],
        summary: "Duplicate a season's structure",
        description:
          "SUPER only. Creates a DRAFT season copying program, description and the budget fields; groups (name/description only — leaders and students are NOT copied), sessions and non-deleted assignments, every date shifted by (startDate − source.startDate), assignment sessionIds and group targets remapped to the clones. Recurrence series get FRESH ids (v1 copied them, letting series edits cross seasons — ruling C10). `code` defaults to slugify('<program> <year>'). A soft-deleted source is 404.",
        parameters: [idParam],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["year", "startDate", "endDate"],
                properties: {
                  year: { type: "integer", minimum: 2000, maximum: 2100 },
                  code: { type: "string" },
                  startDate: { type: "string", format: "date-time" },
                  endDate: { type: "string", format: "date-time" },
                },
              },
            },
          },
        },
        responses: {
          201: ok({ type: "object", properties: { id: { type: "integer" }, code: { type: "string" } } }, "Created."),
          400: conflict("`bad_request` or `invalid_code` (the derived slug is not a valid season code)."),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
          409: conflict("`code_taken`."),
        },
      },
    },
```

- [ ] **Step 4:** Run the seasons suite → PASS.

- [ ] **Step 5: Commit** — `"feat(backend): season duplication — v1 structure copy with fresh recurrence ids"`

---

### Task 4: Session creation with weekly recurrence

**Files:**
- Modify: `apps/backend/src/routes/sessions.ts`, `apps/backend/src/docs/openapi.ts`
- Test: extend `apps/backend/src/__tests__/integration/sessions-routes.test.ts`

**Interfaces:**
- Consumes: `createSessionRequestSchema` (Task 1), `addWeeksInOrgTime` (Task 2), `newPublicId`, `isAdminOfSeason`.
- Produces: `POST /api/v1/sessions` → `{ data: { id, recurrenceGroupId } }`, 201. `"/"` cannot shadow `"/check-in"` or any `"/:id"` route (different paths); register it directly below the `/check-in` block.

- [ ] **Step 1: Failing test.** Add `import { config } from "../../lib/config";` to the suite, then append:

```ts
describe("POST /api/v1/sessions", () => {
  it("creates a weekly series sharing one recurrence id, one calendar week apart", async () => {
    const res = await request(app)
      .post("/api/v1/sessions")
      .set("authorization", `Bearer ${adminToken}`)
      .send({
        seasonId, title: "Weekly session", startsAt: "2099-03-01T18:00:00.000Z",
        durationMinutes: 90, repeatWeeks: 3,
      });

    expect(res.status).toBe(201);
    expect(typeof res.body.data.recurrenceGroupId).toBe("string");
    const rows = await db.session.findMany({
      where: { recurrenceGroupId: res.body.data.recurrenceGroupId },
      orderBy: { startsAt: "asc" },
      select: { id: true, startsAt: true, seasonId: true },
    });
    expect(rows.map((r) => r.startsAt.toISOString())).toEqual([
      "2099-03-01T18:00:00.000Z", "2099-03-08T18:00:00.000Z", "2099-03-15T18:00:00.000Z",
    ]);
    expect(rows.every((r) => r.seasonId === seasonId)).toBe(true);
    expect(res.body.data.id).toBe(rows[0]?.id);
  });

  it("keeps the org wall-clock time across a DST change (C2, X13)", async () => {
    // Precondition, stated so a non-default .env fails readably.
    expect(config.orgTimezone).toBe("Africa/Cairo");
    // Cairo moves UTC+2 → UTC+3 on 2099-04-24. v1's host-zone addDays would
    // keep the UTC instant on a UTC server and drift the class to 21:00.
    const res = await request(app)
      .post("/api/v1/sessions")
      .set("authorization", `Bearer ${adminToken}`)
      .send({
        seasonId, title: "Spring series", startsAt: "2099-04-17T18:00:00.000Z",
        durationMinutes: 60, repeatWeeks: 3,
      });

    expect(res.status).toBe(201);
    const rows = await db.session.findMany({
      where: { recurrenceGroupId: res.body.data.recurrenceGroupId },
      orderBy: { startsAt: "asc" },
      select: { startsAt: true },
    });
    expect(rows.map((r) => r.startsAt.toISOString())).toEqual([
      "2099-04-17T18:00:00.000Z", "2099-04-24T17:00:00.000Z", "2099-05-01T17:00:00.000Z",
    ]);
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

  it("404s a soft-deleted season (v1 never checked)", async () => {
    const dead = await createTestSeason();
    await db.season.update({ where: { id: dead.id }, data: { deletedAt: new Date() } });
    const res = await request(app)
      .post("/api/v1/sessions")
      .set("authorization", `Bearer ${superToken}`)
      .send({ seasonId: dead.id, title: "Ghost", startsAt: "2099-04-01T18:00:00.000Z", durationMinutes: 60 });
    expect(res.status).toBe(404);
  });
});
```

Run → FAIL (404).

- [ ] **Step 2: Implement.** Add `createSessionRequestSchema` to the
relative shared import and `import { addWeeksInOrgTime } from "../lib/org-time";`:

```ts
sessionsRouter.post("/", async (req, res) => {
  const user = requireUser(req);
  const parsed = createSessionRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid session body.", 400);
  const body = parsed.data;

  const season = await db.season.findFirst({
    where: { id: body.seasonId, deletedAt: null },
    select: { id: true },
  });
  if (!season) return apiError(res, "not_found", "Season not found.", 404);
  if (!isAdminOfSeason(user, body.seasonId)) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  // X13 / C2: calendar-week steps in the org zone, so a series keeps its
  // wall-clock time across DST. v1's addDays did the same in the HOST's zone.
  // Spec 03 item 11's season-range check stays un-ported (advisory in v1 too).
  const start = new Date(body.startsAt);
  const dates = Array.from({ length: body.repeatWeeks }, (_, i) => addWeeksInOrgTime(start, i));
  // v1 used nanoid(8); nanoid is ESM-only here (CLAUDE.md). The column is a
  // free string and nothing compares lengths.
  const recurrenceGroupId = body.repeatWeeks > 1 ? newPublicId() : null;

  const created = await db.$transaction(
    dates.map((startsAt) =>
      db.session.create({
        data: {
          seasonId: body.seasonId,
          title: body.title,
          startsAt,
          durationMinutes: body.durationMinutes,
          location: body.location ?? null,
          youtubeUrl: body.youtubeUrl ?? null,
          description: body.description ?? null,
          recurrenceGroupId,
        },
        select: { id: true },
      }),
    ),
  );

  return apiOk(res, { id: created[0]?.id ?? null, recurrenceGroupId }, 201);
});
```

- [ ] **Step 3: OpenAPI** — add:

```ts
    "/api/v1/sessions": {
      post: {
        tags: ["Sessions"],
        summary: "Create a session or weekly series",
        description:
          "Season-admin power. `repeatWeeks` (1–26; v1 clamped silently, v2 refuses) creates that many sessions one calendar week apart **in the organisation timezone** (ORG_TIMEZONE), so the wall-clock time holds across DST; they share a fresh recurrenceGroupId. Creation lives here with `seasonId` in the body, not under /seasons/:id, so the season and session write workstreams never share a route file — do not move it.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["seasonId", "title", "startsAt", "durationMinutes"],
                properties: {
                  seasonId: { type: "integer" },
                  title: { type: "string", minLength: 2, maxLength: 120 },
                  startsAt: { type: "string", format: "date-time" },
                  durationMinutes: { type: "integer", minimum: 15, maximum: 600 },
                  location: { type: ["string", "null"], maxLength: 200 },
                  youtubeUrl: { type: ["string", "null"], format: "uri" },
                  description: { type: ["string", "null"], maxLength: 2000 },
                  repeatWeeks: { type: "integer", minimum: 1, maximum: 26, default: 1 },
                },
              },
            },
          },
        },
        responses: {
          201: ok(
            { type: "object", properties: { id: { type: "integer" }, recurrenceGroupId: { type: ["string", "null"] } } },
            "Created; `id` is the first session.",
          ),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
        },
      },
    },
```

- [ ] **Step 4:** Run the sessions suite → PASS.

- [ ] **Step 5: Commit** — `"feat(backend): session creation with org-time weekly recurrence"`

---

### Task 5: Session edit with scope — the C10 fix

**Files:**
- Modify: `apps/backend/src/routes/sessions.ts`, `apps/backend/src/docs/openapi.ts`
- Test: extend `apps/backend/src/__tests__/integration/sessions-routes.test.ts`

**Interfaces:**
- Consumes: `updateSessionRequestSchema`, `type RecurrenceScope`; `createNotificationsBulk` from `../lib/notifications`; `formatInOrgTime` (Task 2).
- Produces: `resolveSeriesTargets(anchor, scope)` (module-local, Task 6 reuses); `PATCH /api/v1/sessions/:id` → `{ data: { updated: number } }`.

- [ ] **Step 1: Failing tests**

```ts
type SeriesRow = { id: number; startsAt: Date };

/** A 3-session weekly series via the real endpoint (Task 4), in creation order. */
async function createSeries(startsAt: string, title: string): Promise<[SeriesRow, SeriesRow, SeriesRow]> {
  const res = await request(app)
    .post("/api/v1/sessions")
    .set("authorization", `Bearer ${adminToken}`)
    .send({ seasonId, title, startsAt, durationMinutes: 60, repeatWeeks: 3 });
  expect(res.status).toBe(201);
  const [a, b, c] = await db.session.findMany({
    where: { recurrenceGroupId: res.body.data.recurrenceGroupId },
    orderBy: { id: "asc" },
    select: { id: true, startsAt: true },
  });
  if (!a || !b || !c) throw new Error("series fixture did not create three sessions");
  return [a, b, c];
}

const HOUR = 3_600_000;

describe("PATCH /api/v1/sessions/:id", () => {
  it("edits one occurrence without touching its siblings", async () => {
    const [a, b, c] = await createSeries("2099-06-05T18:00:00.000Z", "Series one");
    const res = await request(app)
      .patch(`/api/v1/sessions/${b.id}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ title: "Moved", startsAt: new Date(b.startsAt.getTime() + HOUR).toISOString(),
        durationMinutes: 60, scope: "one" });
    expect(res.status).toBe(200);
    expect(res.body.data.updated).toBe(1);

    const rows = await db.session.findMany({
      where: { id: { in: [a.id, b.id, c.id] } },
      orderBy: { id: "asc" },
      select: { title: true, startsAt: true },
    });
    expect(rows.map((r) => r.title)).toEqual(["Series one", "Moved", "Series one"]);
    expect(rows[0]?.startsAt.getTime()).toBe(a.startsAt.getTime());
    expect(rows[1]?.startsAt.getTime()).toBe(b.startsAt.getTime() + HOUR);
    expect(rows[2]?.startsAt.getTime()).toBe(c.startsAt.getTime());
  });

  it("shifts this-and-following by the same delta", async () => {
    const [a, b, c] = await createSeries("2099-07-03T18:00:00.000Z", "Series two");
    const res = await request(app)
      .patch(`/api/v1/sessions/${b.id}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ title: "Series two", startsAt: new Date(b.startsAt.getTime() + HOUR).toISOString(),
        durationMinutes: 60, scope: "future" });
    expect(res.status).toBe(200);
    expect(res.body.data.updated).toBe(2);

    const rows = await db.session.findMany({
      where: { id: { in: [a.id, b.id, c.id] } },
      orderBy: { id: "asc" },
      select: { startsAt: true },
    });
    expect(rows.map((r) => r.startsAt.getTime())).toEqual([
      a.startsAt.getTime(), b.startsAt.getTime() + HOUR, c.startsAt.getTime() + HOUR,
    ]);
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
      select: { id: true },
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
    expect(untouched?.title).toBe("Theirs");
    expect(untouched?.startsAt.toISOString()).toBe("2099-05-08T18:00:00.000Z");
  });

  it("notifies enrolled students when the start time changes, and not otherwise", async () => {
    const count = () =>
      db.notification.count({ where: { userId: studentUserId, type: "SESSION_RESCHEDULED" } });
    const before = await count();

    // Title only, same start: no notification.
    const same = await request(app)
      .patch(`/api/v1/sessions/${sessionId}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ title: "Session One (renamed)", startsAt: "2099-03-01T18:00:00.000Z",
        durationMinutes: 90, scope: "one" });
    expect(same.status).toBe(200);
    expect(await count()).toBe(before);

    // Moved start: exactly one, v1's link, org wall-clock body (C2).
    const moved = await request(app)
      .patch(`/api/v1/sessions/${sessionId}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ title: "Session One (renamed)", startsAt: "2099-03-01T19:00:00.000Z",
        durationMinutes: 90, scope: "one" });
    expect(moved.status).toBe(200);
    expect(await count()).toBe(before + 1);
    const latest = await db.notification.findFirst({
      where: { userId: studentUserId, type: "SESSION_RESCHEDULED" },
      orderBy: { id: "desc" },
      select: { title: true, body: true, link: true },
    });
    expect(latest).toEqual({
      title: 'Session "Session One (renamed)" rescheduled',
      body: `New time: ${formatInOrgTime(new Date("2099-03-01T19:00:00.000Z"))}`,
      link: "/student/calendar",
    });
  });

  it("refuses a non-admin of the season", async () => {
    const res = await request(app)
      .patch(`/api/v1/sessions/${sessionId}`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ title: "Nope", startsAt: "2099-03-01T18:00:00.000Z", durationMinutes: 90, scope: "one" });
    expect(res.status).toBe(403);
  });
});
```

Add `import { formatInOrgTime } from "../../lib/org-time";` to the suite.
(`studentUserId`, `sessionId`, `adminToken`, `studentToken` are the suite's
existing fixtures; the student has an ACTIVE enrollment in `seasonId`. This
test runs after the existing GET tests, which pin the original title/start of
`sessionId` — Jest runs `describe` blocks in file order.)

Run → FAIL.

- [ ] **Step 2: Implement.** Add `updateSessionRequestSchema` and
`type RecurrenceScope` (type-only import from `"@space/shared"`) plus
`import { createNotificationsBulk } from "../lib/notifications";` and
`import { formatInOrgTime } from "../lib/org-time";`. Above the routes:

```ts
interface SeriesAnchor {
  id: number;
  seasonId: number;
  recurrenceGroupId: string | null;
  startsAt: Date;
}

/**
 * v1's siblingsInScope (recurrence.ts), with ruling C10 applied: the series
 * is ALWAYS fenced to the anchor's season. v1 matched on recurrenceGroupId
 * alone, and duplication cloned that id verbatim, so a series edit or delete
 * reached into another season — data loss gated only by the anchor's admin
 * check. "future" keeps the anchor and everything at or after it.
 */
async function resolveSeriesTargets(
  anchor: SeriesAnchor,
  scope: RecurrenceScope,
): Promise<{ id: number; startsAt: Date }[]> {
  if (scope === "one" || anchor.recurrenceGroupId === null) {
    return [{ id: anchor.id, startsAt: anchor.startsAt }];
  }
  const series = await db.session.findMany({
    where: { recurrenceGroupId: anchor.recurrenceGroupId, seasonId: anchor.seasonId },
    select: { id: true, startsAt: true },
    orderBy: { startsAt: "asc" },
  });
  return scope === "future"
    ? series.filter((s) => s.startsAt.getTime() >= anchor.startsAt.getTime())
    : series;
}
```

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

  const targets = await resolveSeriesTargets(existing, body.scope);
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
        // scope "one": the anchor gets newStart (t.startsAt + delta). Series:
        // every sibling shifts by the same delta (v1's semantics, spec 03
        // item 3's anchoring quirk and all). A fixed delta preserves the
        // siblings' existing org-time spacing.
        data: { ...fields, startsAt: new Date(t.startsAt.getTime() + delta) },
      }),
    ),
  );

  if (delta !== 0) {
    const enrolled = await db.seasonEnrollment.findMany({
      where: { seasonId: existing.seasonId, status: "ACTIVE" },
      select: { studentUserId: true },
    });
    try {
      await createNotificationsBulk(
        enrolled.map((e) => e.studentUserId),
        {
          type: "SESSION_RESCHEDULED",
          title: `Session "${body.title}" rescheduled`,
          // Org wall clock (C2), not the host's toLocaleString (v1).
          body: `New time: ${formatInOrgTime(newStart)}`,
          // X1: v1's exact link for this type.
          link: "/student/calendar",
        },
      );
    } catch {
      // Best-effort: a notification failure must not fail the reschedule.
      // Plan 9 replaces this try/catch with its bestEffort wrapper.
    }
  }

  return apiOk(res, { updated: targets.length });
});
```

- [ ] **Step 3: OpenAPI** — add `patch` to the existing `"/api/v1/sessions/{id}"` object:

```ts
      patch: {
        tags: ["Sessions"],
        summary: "Edit a session, optionally its series",
        description:
          "Season-admin power. Full body plus `scope`: `one` (this session), `future` (this and later siblings), `all`. Series scopes shift every target by the anchor's start delta. The series is ALWAYS limited to this session's season (ruling C10 — v1 matched on recurrenceGroupId alone and could rewrite another season's sessions). A moved start notifies ACTIVE enrollees (SESSION_RESCHEDULED, link `/student/calendar`, time in ORG_TIMEZONE).",
        parameters: [idParam],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["title", "startsAt", "durationMinutes", "scope"],
                properties: {
                  title: { type: "string", minLength: 2, maxLength: 120 },
                  startsAt: { type: "string", format: "date-time" },
                  durationMinutes: { type: "integer", minimum: 15, maximum: 600 },
                  location: { type: ["string", "null"] },
                  youtubeUrl: { type: ["string", "null"] },
                  description: { type: ["string", "null"] },
                  scope: { type: "string", enum: ["one", "future", "all"] },
                },
              },
            },
          },
        },
        responses: {
          200: ok({ type: "object", properties: { updated: { type: "integer" } } }, "Updated."),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
        },
      },
```

- [ ] **Step 4:** Run the sessions suite → PASS.
- [ ] **Step 5: Commit** — `"feat(backend): scoped session edit, season-fenced (C10)"`

---

### Task 6: Session delete — designed, not ported

v1's `deleteSessionAction` has **no caller anywhere** — ruling C12 says its
semantics (silent cascades, silent default scope) are not a specification.
Deleting a `Session` row cascades `Attendance`, `SessionVideoProgress` and
`SessionVideoQuestion`, and set-nulls `Assignment.sessionId` and
`Quiz.sessionId` (schema). The first two are student history, so they are
guarded; the rest is authoring structure and is documented in OpenAPI.

**Files:**
- Modify: `apps/backend/src/routes/sessions.ts`, `apps/backend/src/docs/openapi.ts`
- Test: extend `apps/backend/src/__tests__/integration/sessions-routes.test.ts`

**Interfaces:**
- Consumes: `deleteSessionRequestSchema`, `resolveSeriesTargets` (Task 5).
- Produces: `DELETE /api/v1/sessions/:id` (JSON body `{ scope?, force? }`) → `{ data: { deleted: number } }`; 409 `has_student_records`.

- [ ] **Step 1: Failing tests**

```ts
describe("DELETE /api/v1/sessions/:id", () => {
  async function oneOff(title: string) {
    return db.session.create({
      data: { seasonId, title, startsAt: new Date("2099-08-01T18:00:00.000Z"), durationMinutes: 60 },
      select: { id: true },
    });
  }

  it("deletes a single session with no student records", async () => {
    const s = await oneOff("Disposable");
    const res = await request(app)
      .delete(`/api/v1/sessions/${s.id}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.data.deleted).toBe(1);
    expect(await db.session.findUnique({ where: { id: s.id } })).toBeNull();
  });

  it("scope 'all' deletes only this season's members of a shared series (C10)", async () => {
    const otherSeason = await createTestSeason();
    const shared = "space-v2-test-xrg-del";
    const mine = await db.session.create({
      data: { seasonId, title: "Mine 1", startsAt: new Date("2099-09-01T18:00:00.000Z"),
        durationMinutes: 60, recurrenceGroupId: shared },
      select: { id: true },
    });
    await db.session.create({
      data: { seasonId, title: "Mine 2", startsAt: new Date("2099-09-08T18:00:00.000Z"),
        durationMinutes: 60, recurrenceGroupId: shared },
    });
    const theirs = await db.session.create({
      data: { seasonId: otherSeason.id, title: "Theirs", startsAt: new Date("2099-09-15T18:00:00.000Z"),
        durationMinutes: 60, recurrenceGroupId: shared },
      select: { id: true },
    });

    const res = await request(app)
      .delete(`/api/v1/sessions/${mine.id}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ scope: "all" });
    expect(res.status).toBe(200);
    expect(res.body.data.deleted).toBe(2);
    expect(await db.session.findUnique({ where: { id: theirs.id } })).not.toBeNull();
  });

  it("refuses to destroy recorded attendance without force (409)", async () => {
    const s = await oneOff("Has attendance");
    await db.attendance.create({
      data: { sessionId: s.id, studentUserId, status: "PRESENT", markedById: studentUserId },
    });
    const res = await request(app)
      .delete(`/api/v1/sessions/${s.id}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({});
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("has_student_records");
    expect(await db.session.findUnique({ where: { id: s.id } })).not.toBeNull();
  });

  it("refuses to destroy video progress without force (409)", async () => {
    const s = await oneOff("Has progress");
    await db.sessionVideoProgress.create({
      data: { sessionId: s.id, studentUserId, furthestSeconds: 30 },
    });
    const res = await request(app)
      .delete(`/api/v1/sessions/${s.id}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({});
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("has_student_records");
  });

  it("with force, deletes the session and its attendance", async () => {
    const s = await oneOff("Forced");
    await db.attendance.create({
      data: { sessionId: s.id, studentUserId, status: "ABSENT", markedById: studentUserId },
    });
    const res = await request(app)
      .delete(`/api/v1/sessions/${s.id}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ force: true });
    expect(res.status).toBe(200);
    expect(await db.attendance.count({ where: { sessionId: s.id } })).toBe(0);
    expect(await db.session.findUnique({ where: { id: s.id } })).toBeNull();
  });

  it("refuses a non-admin of the season", async () => {
    const s = await oneOff("Protected");
    const res = await request(app)
      .delete(`/api/v1/sessions/${s.id}`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({});
    expect(res.status).toBe(403);
  });
});
```

Run → FAIL.

- [ ] **Step 2: Implement.** Add `deleteSessionRequestSchema` to the relative shared import:

```ts
sessionsRouter.delete("/:id", async (req, res) => {
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

  // express.json() parses DELETE bodies too; the schema's defaults make an
  // absent body and `{}` the same request.
  const parsed = deleteSessionRequestSchema.safeParse(req.body ?? {});
  if (!parsed.success) return apiError(res, "bad_request", "Invalid delete body.", 400);

  const targets = await resolveSeriesTargets(existing, parsed.data.scope);
  const targetIds = targets.map((t) => t.id);
  const inTargets = { sessionId: { in: targetIds } };

  const [attendance, progress] = await Promise.all([
    db.attendance.count({ where: inTargets }),
    db.sessionVideoProgress.count({ where: inTargets }),
  ]);
  if ((attendance > 0 || progress > 0) && !parsed.data.force) {
    return apiError(
      res,
      "has_student_records",
      "Attendance or video progress has been recorded; pass force to delete it too.",
      409,
    );
  }

  // Explicit deletes (the FKs cascade anyway) so the transaction states what
  // it destroys. Video questions cascade; assignments/quizzes keep their rows
  // with sessionId set null.
  const [, , removed] = await db.$transaction([
    db.attendance.deleteMany({ where: inTargets }),
    db.sessionVideoProgress.deleteMany({ where: inTargets }),
    db.session.deleteMany({ where: { id: { in: targetIds } } }),
  ]);
  return apiOk(res, { deleted: removed.count });
});
```

- [ ] **Step 3: OpenAPI** — add `delete` to `"/api/v1/sessions/{id}"`:

```ts
      delete: {
        tags: ["Sessions"],
        summary: "Delete a session, optionally its series",
        description:
          "Season-admin power. Body `{ scope?: 'one'|'future'|'all' (default 'one'), force?: boolean }`; series fenced to this season (C10). Refused with 409 `has_student_records` when any target has attendance or video progress, unless `force: true`, which deletes those rows too. Also removed by cascade: the sessions' video questions. Kept with `sessionId` set to null: assignments and quizzes linked to them.",
        parameters: [idParam],
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  scope: { type: "string", enum: ["one", "future", "all"], default: "one" },
                  force: { type: "boolean", default: false },
                },
              },
            },
          },
        },
        responses: {
          200: ok({ type: "object", properties: { deleted: { type: "integer" } } }, "Deleted."),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
          409: conflict("`has_student_records`."),
        },
      },
```

- [ ] **Step 4:** Suite → PASS.
- [ ] **Step 5: Commit** — `"feat(backend): session delete with scope, student-record guard, season fence"`

---

### Task 7: Closing gate (coordinator)

- [ ] **Step 1:** `pnpm turbo lint typecheck test:unit build` → green; then the
full serial integration run:
`cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern integration` → green.
- [ ] **Step 2: Mutation pass** (one at a time, restore after each; the suite must fail each time):
  1. Remove `seasonId: anchor.seasonId` from `resolveSeriesTargets`' `where` → both C10 tests (PATCH and DELETE) fail.
  2. In Task 3, write `s.recurrenceGroupId` instead of `freshRecurrenceId(...)` → the duplication test's `not.toBe` fails.
  3. In Task 3, write `sessionId: a.sessionId` (no remap) → the duplication test's assignment assertion fails.
  4. In Task 2's PATCH, drop the raw-key allowlist check → the `forbidden_field` test fails.
  5. In Task 4, replace `addWeeksInOrgTime(start, i)` with `new Date(start.getTime() + i * 7 * 86_400_000)` → the DST integration test (and the org-time unit test if applied there) fails.
  6. In Task 6, drop the `sessionVideoProgress` count → the video-progress 409 test fails.
- [ ] **Step 3:** Check the emitted build for bare shared requires anywhere in
the output (X12, the CLAUDE.md trap):
`grep -rn 'require("@space/shared")' apps/backend/dist/` → empty.
- [ ] **Step 4:** Health check against a built server:
`pnpm --filter @space/backend start` in a tmux session, then
`curl -fsS localhost:4000/health` → 200 (X6).
- [ ] **Step 5:** Report suite counts, the six mutation outcomes, and any
divergence from this plan.

---

## Revision 2026-10-05

- **B1:** `testSeasonCode()` shortened to 26 chars (fixtures.ts) so fixture
  codes satisfy v1's 2–40 bound; a test pins it. Code rules are now v1's
  verbatim: `slugifySeasonCode` (NFKD, diacritics, collapse — the old
  "reproduced" slug was not), `isValidSeasonCode` (regex + 2–40 on the
  **slug**), default `'<program> <year>'` on create (R2) and duplicate (R64).
- **B2:** duplication expectation computed: 2099-01-01 → 2100-01-04 is 368
  days, so 2099-01-05T18:00Z → **2100-01-08T18:00Z**; source start set
  explicitly in the test.
- **Duplication fidelity (S9):** no leaders copied (R61, spec D6 — the old
  "leaders kept" was wrong); assignment `sessionId` remapped via
  `sessionIdMap`; `dueAt` shifted; soft-deleted assignments skipped; budget
  copy is a port (v1 R56), not a divergence; code default ports v1. Test now
  covers groups/leaders/students, assignment remap, dueAt, targets, default code.
- **DST (X13, S10):** `addWeeksInOrgTime` (plus `orgWallClock` /
  `fromOrgWallClock`) in `lib/org-time.ts`; recurrence uses it; unit tests
  pin Cairo spring-forward and fall-back; the false "no DST" comment removed;
  an integration test crosses 2099-04-24. `ORG_TIMEZONE` added to `.env.example`
  and `turbo.json` `build.env`.
- **Placeholders removed (S11, X16):** Task 5's two elided tests and Task 6's
  four prose tests are written out; PATCH/DELETE season handlers, duplicate,
  create, delete handlers and every OpenAPI entry are given as code.
- Season delete: recorded decision on D4 — refuse on any enrollment or
  session (`season_in_use`), clear `StudentProfile.activeSeasonId` pointers in
  the same transaction; ADMIN cannot delete (D3).
- Session delete also guards `SessionVideoProgress` (code renamed
  `has_student_records`); cascades/set-nulls documented in OpenAPI.
- `isUniqueViolation` (`lib/prisma-errors.ts`) replaces the unverified
  `Prisma` value-import step; `code_taken` vs D15's `conflict` recorded.
- Closing gate greps all of `dist/` (X12) and adds the X6 health check.
- Header states dependencies per the execution order.

Rejected/not applicable: the Plan 13 review note that a `JpcEvent` `Restrict`
relation would make season delete raise P2003 — this delete is a soft delete
(`update`), which no FK constraint can block.

Cross-plan consistency pass (execution order 1 → 2 → 3 → 4 → 15 → 16 → 5 → 6 → 7 → 17 → 14 → 8 → …):
- Header gains a forward note: Plan 16 adds the `startDay`/`startTime` alternative to `startsAt` on session writes; `startsAt` stays accepted, so nothing here changes.
