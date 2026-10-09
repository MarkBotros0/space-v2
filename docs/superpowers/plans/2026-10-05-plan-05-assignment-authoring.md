# Plan 5 — Assignment Authoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A season admin authors assignments from the phone — creates one targeted at the whole season or at named groups, with a due date picked on the **organisation's** clock, edits it (full replace), deletes it when nobody has started it, and watches who has and has not submitted — while every targeted student is notified exactly as v1 notified them (coverage gap G1).

**Architecture:** Three new endpoints over one small shared library.
`POST /api/v1/seasons/:id/assignments` lives on the existing `seasonsRouter`
(the season comes from the path, never the body — spec 07 R68);
`PATCH` and `DELETE /api/v1/assignments/:id` live on the existing
`assignmentsRouter`. The rules every write shares — season fencing of
`groupIds`/`sessionId`, recipient resolution, the `ASSIGNMENT_CREATED`
fan-out with v1's exact link (ruling X1), and turning the request into
columns — live in one new `lib/assignment-writes.ts`. The due date crosses the
wire as an **organisation day + wall-clock time** (`dueDay: "2099-04-01"`,
`dueTime: "23:59"`) and the server composes the instant in `ORG_TIMEZONE`
(rulings C2, X13): v1 composed it in the author's browser zone (spec 07 R45),
which on phones becomes a different deadline per device. Reads gain the
inverse — `dueOrgDay`/`dueOrgTime` on the detail, `dueOrgDay` on the staff
list — derived once on the server (C4), so the edit form pre-fills and every
screen labels the deadline without the device's zone ever entering into it.
On mobile, `/assignments` and `assignment/[id]` gain their staff branches
(Plan 1 built the student ones), and `assignment/new` + `assignment/[id]/edit`
share one form. Because `assignment/[id]` gains a child route, Plan 1's
`assignment/[id].tsx` moves to `assignment/[id]/index.tsx` (ruling X7); the
pathname `/assignment/[id]` is unchanged, so no `router.push` call site moves.

**Tech Stack:** Express 5, Prisma 7 (`src/generated/prisma`), Zod 3, jest +
supertest against the shared staging DB; Expo SDK 54 / expo-router 6 (typed
routes), React Query 5, `@react-native-community/datetimepicker` (new, Expo
Go-supported), RNTL 13 via `renderWithProviders`.

**Spec:** `docs/superpowers/specs/domains/07-assignments.md` (R1–R25, R45,
R60–R80, R84–R86; §7 API, §8 contracts, §9 screens; §10 items 1, 3, 4, 5, 6,
8, 10, 11, 12), `08-submissions.md` (review screen handoff only),
`_DECISIONS.md` (C1, C2, C4, C8, C9, C11, C12). v1 sources:
`jpc-space/src/lib/assignment-actions.ts:18-182`,
`src/lib/auth/permissions.ts:273-290`,
`src/components/assignments/{assignment-form,submission-tracker,assignments-list}.tsx`,
`src/app/admin/season/[code]/assignments/{page,new/page,[id]/page,[id]/edit/page}.tsx`.

**Depends on** (execution order 1 → 2 → 3 → 4 → **5** → 6 → 7 → …; nothing
later is assumed):
- Plan 1: `app/(app)/assignment/[id].tsx` (student detail + submission
  editor), `assignments.tsx` (student list), `src/hooks/use-assignments.ts`
  (`useStudentAssignments`, `useAssignmentDetail`), `queryKeys.assignments`,
  `DETAIL_ROUTE_NAMES` / X9 derived route tests, `makeSession`,
  `listRouteNames`/`ambiguousRouteSiblings`.
- Plan 2: `submission/[publicId]` review route (the tracker links into it),
  `src/hooks/use-groups.ts`, `queryKeys.groups`.
- Plan 3: `lib/org-time.ts` (`formatInOrgTime`, `orgWallClock`,
  `fromOrgWallClock`), `config.orgTimezone`, the `conflict()` OpenAPI helper,
  `testSeasonCode()` at 26 chars, the try/catch notification precedent.
- Plan 4: `orgDayKey` in `lib/org-time.ts`, `sessionListItemSchema.dayKey`,
  `useCurrentSeasonId()` (ruling X8), `apiErrorMessage`, `formatDayKey`.

**Consumed later by:** Plan 13 (its Step 7 producer table row "15" is
`notifyAssignmentCreated` in `lib/assignment-writes.ts` — one call site, used
by create only; edits notify nobody as v1, *v1 parity 2026-10-09*); Plan 14 (must import `isoDaySchema`/`wallTimeSchema`
from `packages/shared/src/org-time.ts` and `orgWallTime`/`orgWallClockToInstant`
from `lib/org-time.ts` instead of defining them — see Open decisions); Plan 6
(reuses `useSeasonGroups`); Plan 16 (staff dashboard links into `/assignments`).

## Global Constraints

- **No migrations, no schema edits** (X14, C1). No edits under `apps/backend/prisma/`.
- No `process.env` outside `src/lib/config.ts`; never `@prisma/client`; no `@/` alias in either app.
- Response envelope `{ data }` / `{ error: { code, message } }` via `apiOk`/`apiError`.
- Shared **value** imports in any backend `src` file use the relative path (`"../../../../packages/shared/src/index"` from `src/routes/`, `"../../../packages/shared/src/index"` from `src/lib/`, `"../../../../../packages/shared/src/index"` from `src/__tests__/integration/`) — never `"@space/shared"` (X12). Type-only imports may use the package name.
- `requireAuth` stays as each router already mounts it; this plan adds handlers to the existing `seasonsRouter` and `assignmentsRouter` (the latter owns `/api/v1/assignments` exclusively) and mounts nothing new (X5).
- `src/docs/openapi.ts` changes in the same commit as the route it documents.
- Notification links are v1's exact strings (X1): `ASSIGNMENT_CREATED` → `/student/assignments/<id>` (`assignment-actions.ts:91`). Notification text that contains a time uses `formatInOrgTime` (C2), never `toLocaleString()`.
- Mobile: relative imports; every response — queries **and** mutations — parsed with a shared Zod schema (X10); dependent queries pass `enabled` and guard manual `refetch()`; nullable ids go into query keys as `null`; screens map to `LoadingState`/`ErrorState(onRetry)`/`EmptyState`; `edges={["top","left","right"]}`; tests use `renderWithProviders` and `makeSession` (X11), `jest.mock` factories close only over `mock*` names; `Input` fields are queried with `getByLabelText`.
- **Route tests are derived** (X9): this plan renames one `DETAIL_ROUTE_NAMES` entry and appends two; it edits no count. Typed routes: never `as Href`; run `pnpm turbo routes:generate --filter=@space/mobile` after any route file change.
- **Integration tests are serial and coordinator-run.** Backend tasks 2–5 write their suites and run them alone with `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern <suite>`. If backend and mobile streams run in parallel, the backend agent runs **only** its own suite, one at a time, and the coordinator runs the full integration set serially in Task 10. Never two integration processes at once — `cleanupTestData()` is prefix-global.
- The integration suite assumes the default `ORG_TIMEZONE` (`Africa/Cairo`): UTC+2 until the spring-forward on 2099-04-24, UTC+3 after it (Plan 3's DST tests pin both).
- Long-running commands (full integration run, a built server) go in a detached tmux session with a log under `~/logs/` (user instruction); the steps below give the exact commands.

**Execution shape:** Task 1 (contracts) first — both streams consume it. Then
two streams: **backend** Tasks 2 → 3 → 4 → 5 (sequential; Tasks 3–5 share
`lib/assignment-writes.ts` and the new suite), and **mobile** Task 6 → then
Tasks 7, 8, 9 in parallel (disjoint files). Mobile tests mock the API, so the
mobile stream does not wait for the backend. Task 10 is the coordinator's
closing gate.

**Error codes this plan defines** (mobile surfaces each server message
verbatim through `apiErrorMessage`): `invalid_group` 400 (a `groupId` is not a
group of the assignment's season — spec §10 item 6), `invalid_session` 400 (the
`sessionId` is not a session of that season — §4 item 4), `has_submissions`
409 (delete refused: a student has started the assignment — §10 item 4).
Existing codes reused: `bad_request` 400, `forbidden` 403, `not_found` 404.

**Divergences from v1, each with its authority:**

| v1 behaviour | Plan 5 | Authority |
|---|---|---|
| `isAllGroups`/`groupIds` read off the raw body, unchecked (R11, R12) | In the Zod schema; every id must be a group of the path's season | spec §10 item 6, C8 |
| `sessionId` from any season accepted (R4) | 400 `invalid_session` | spec §4 item 4, C8 |
| Due instant composed in the author's browser zone (R45) | `dueDay`+`dueTime` composed server-side in `ORG_TIMEZONE`; reads carry `dueOrgDay`/`dueOrgTime` | C2, C4, X13; spec §10 item 3 |
| Duplicate group id on update throws mid-transaction (R70) | Deduplicated in the schema | spec §8 |
| Recipients for targeted assignments from `GroupStudent` (R61) | From ACTIVE `SeasonEnrollment` rows in the targeted groups — the same population as the tracker | C9 |
| Update gate ignores `deletedAt` (R79) | PATCH/DELETE on a soft-deleted row → 404 | spec §7, §10 item 4 |
| `softDeleteAssignmentAction` unreachable, cascades nothing, strands submissions (R75–R80) | `DELETE` designed: soft delete, **refused while any `Submission` row exists** (`has_submissions`, no force); 200 `{ deleted: true }` (envelope) rather than §7's 204 | C12, spec §10 item 4 |
| `/admin/assignments` refuses SUPER (§10 item 12) | Staff branch admits SUPER and ADMIN to author; LEADER/MENTOR read-only | spec §10 item 12 |
| Two "submitted" counts (R41 vs R43) | Detail shows the tracker's `submittedCount` (non-DRAFT), same as the list | spec §10 item 8 (already on the contract) |

Unchanged from v1 on purpose: "Specific groups" with no group chosen saves an assignment that targets nobody, notifies nobody and has expected count 0 — with no publish flag this is how an admin parks one (`src/lib/assignment-actions.ts:73`, R13) *(v1 parity 2026-10-09: was "400 — deliberate divergence, spec §10 item 6")*; editing, retargeting or deleting an assignment notifies nobody — newly targeted students are added silently (`src/lib/assignment-actions.ts:101-139,141-162`, `:128-133`; R66, R74) *(v1 parity 2026-10-09: was "students newly targeted by an edit get ASSIGNMENT_CREATED")*; no publish flag (R26); due date never enforced
(R49, §10 item 3 "keep it non-enforcing"); editing allowed after submissions
exist (R72) — the edit screen warns when narrowing would hide started work
(§10 item 5); FORUM/STANDARD coercion (R14–R17); audit columns stamped (R71,
§10 item 13); notification fan-out after the commit, opt-outs honoured
(R64–R65), failure never fails the write (Plan 3's precedent, which Plan 13
replaces with `bestEffort`).

---

### Task 1: Contracts — org wall-clock schemas, assignment write schema, response fields

**Files:**
- Create: `packages/shared/src/org-time.ts`
- Modify: `packages/shared/src/index.ts` (export it)
- Modify: `packages/shared/src/assignment.ts` (request schemas rewritten; `dueOrgDay`/`dueOrgTime` on responses; delete response schema)
- Test: `packages/shared/src/__tests__/assignment-write.test.ts`

**Interfaces:**
- Consumes: `assignmentTypeSchema` from `./enums`; the existing response schemas in `assignment.ts`; Plan 1's `isAssignmentOutstanding` (left untouched at the end of `assignment.ts`).
- Produces (exact names later tasks and plans import):
  - `isoDaySchema` (`YYYY-MM-DD`, a real calendar day), `wallTimeSchema` (`HH:mm`, 24-hour) in `packages/shared/src/org-time.ts` — **Plan 14 imports these; it must not define its own.**
  - `DEFAULT_DUE_TIME = "23:59"` (spec R19).
  - `assignmentWriteRequestSchema` → `AssignmentWriteRequest` (`z.input`) / `AssignmentWriteBody` (`z.output`); `createAssignmentRequestSchema` and `updateAssignmentRequestSchema` are the same schema (one full-replace body; `seasonId` is never in it). The old `CreateAssignmentRequest/Body`, `UpdateAssignmentRequest/Body` type names remain as aliases.
  - `assignmentDetailSchema.dueOrgDay: string | null`, `assignmentDetailSchema.dueOrgTime: string | null`; `staffAssignmentListItemSchema.dueOrgDay: string | null`.
  - `assignmentDeletedResponseSchema` (`{ deleted: true }`).

- [ ] **Step 1: Failing test**

```ts
// packages/shared/src/__tests__/assignment-write.test.ts
import {
  DEFAULT_DUE_TIME,
  assignmentDeletedResponseSchema,
  assignmentDetailSchema,
  assignmentWriteRequestSchema,
  createAssignmentRequestSchema,
  isoDaySchema,
  updateAssignmentRequestSchema,
  wallTimeSchema,
} from "../index";

const valid = {
  title: "Week 4 reflection",
  isAllGroups: true,
};

describe("isoDaySchema / wallTimeSchema (org wall clock on the wire, ruling C2)", () => {
  it("accepts a real calendar day and refuses shapes and impossible days", () => {
    expect(isoDaySchema.safeParse("2099-04-01").success).toBe(true);
    expect(isoDaySchema.safeParse("2099-4-1").success).toBe(false);
    expect(isoDaySchema.safeParse("2099-02-31").success).toBe(false);
    expect(isoDaySchema.safeParse("2099-04-01T00:00:00Z").success).toBe(false);
  });

  it("accepts 24-hour HH:mm only", () => {
    expect(wallTimeSchema.safeParse("23:59").success).toBe(true);
    expect(wallTimeSchema.safeParse("00:00").success).toBe(true);
    expect(wallTimeSchema.safeParse("24:00").success).toBe(false);
    expect(wallTimeSchema.safeParse("9:05").success).toBe(false);
  });
});

describe("assignmentWriteRequestSchema", () => {
  it("is the one body for create and update — seasonId is never part of it (R68)", () => {
    expect(createAssignmentRequestSchema).toBe(assignmentWriteRequestSchema);
    expect(updateAssignmentRequestSchema).toBe(assignmentWriteRequestSchema);
    const parsed = assignmentWriteRequestSchema.parse({ ...valid, seasonId: 99 });
    expect(parsed).not.toHaveProperty("seasonId");
  });

  it("applies v1's defaults (R5, R7, R9) and nulls what was not sent", () => {
    expect(assignmentWriteRequestSchema.parse(valid)).toEqual({
      title: "Week 4 reflection",
      description: null,
      dueDay: null,
      dueTime: null,
      sessionId: null,
      type: "STANDARD",
      forumMinWords: null,
      forumAllowComments: false,
      maxFileSizeMb: null,
      allowedMimeCategories: [],
      isAllGroups: true,
      groupIds: [],
    });
  });

  it("defaults a picked day's time to 23:59 (R19) and drops the time when there is no day", () => {
    expect(assignmentWriteRequestSchema.parse({ ...valid, dueDay: "2099-04-01" }).dueTime).toBe(
      DEFAULT_DUE_TIME,
    );
    expect(
      assignmentWriteRequestSchema.parse({ ...valid, dueDay: null, dueTime: "18:00" }).dueTime,
    ).toBeNull();
  });

  it("no longer accepts a device-composed instant: dueAt is not a field (C2)", () => {
    const parsed = assignmentWriteRequestSchema.parse({ ...valid, dueAt: "2099-04-01T21:59:00Z" });
    expect(parsed).not.toHaveProperty("dueAt");
    expect(parsed.dueDay).toBeNull();
  });

  it("bounds title at the server truth, 2–160 (R1, R18)", () => {
    expect(assignmentWriteRequestSchema.safeParse({ ...valid, title: "x" }).success).toBe(false);
    expect(assignmentWriteRequestSchema.safeParse({ ...valid, title: "x".repeat(161) }).success).toBe(
      false,
    );
  });

  it("FORUM keeps forum config and drops file config (R14, R15)", () => {
    const parsed = assignmentWriteRequestSchema.parse({
      ...valid,
      type: "FORUM",
      forumMinWords: 120,
      forumAllowComments: true,
      maxFileSizeMb: 20,
      allowedMimeCategories: ["pdf"],
    });
    expect(parsed).toMatchObject({
      forumMinWords: 120,
      forumAllowComments: true,
      maxFileSizeMb: null,
      allowedMimeCategories: [],
    });
  });

  it("STANDARD keeps file config and drops forum config (R16)", () => {
    const parsed = assignmentWriteRequestSchema.parse({
      ...valid,
      forumMinWords: 50,
      forumAllowComments: true,
      maxFileSizeMb: 10,
      allowedMimeCategories: ["image", "pdf"],
    });
    expect(parsed).toMatchObject({
      forumMinWords: null,
      forumAllowComments: false,
      maxFileSizeMb: 10,
      allowedMimeCategories: ["image", "pdf"],
    });
  });

  // v1 parity 2026-10-09 (was "refuses … deliberate divergence from R13"): v1
  // assignment-actions.ts:73 saves it, targeting nobody.
  it("accepts 'specific groups' with none chosen, as v1 (R13)", () => {
    const result = assignmentWriteRequestSchema.parse({ ...valid, isAllGroups: false });
    expect(result.isAllGroups).toBe(false);
    expect(result.groupIds).toEqual([]);
  });

  it("collapses duplicate group ids (closes R70) and drops them when targeting everyone (R24)", () => {
    expect(
      assignmentWriteRequestSchema.parse({ ...valid, isAllGroups: false, groupIds: [4, 4, 3] }).groupIds,
    ).toEqual([4, 3]);
    expect(assignmentWriteRequestSchema.parse({ ...valid, groupIds: [4] }).groupIds).toEqual([]);
  });
});

describe("response additions", () => {
  const detail = {
    id: 41, seasonId: 7, seasonCode: "s7", seasonTitle: "Spring 2099",
    sessionId: null, sessionTitle: null, title: "Essay one", description: null,
    dueAt: "2099-04-01T21:59:00.000Z", dueOrgDay: "2099-04-01", dueOrgTime: "23:59",
    isOverdue: false, isAllGroups: true, type: "STANDARD", forumMinWords: null,
    forumAllowComments: false, maxFileSizeMb: null, allowedMimeCategories: [],
    groupIds: [], mySubmission: null, canManage: true,
  };

  it("requires the server-derived org due fields on the detail (C4)", () => {
    expect(assignmentDetailSchema.safeParse(detail).success).toBe(true);
    const { dueOrgDay: _day, ...missing } = detail;
    expect(assignmentDetailSchema.safeParse(missing).success).toBe(false);
  });

  it("parses the delete response", () => {
    expect(assignmentDeletedResponseSchema.parse({ deleted: true })).toEqual({ deleted: true });
    expect(assignmentDeletedResponseSchema.safeParse({ deleted: false }).success).toBe(false);
  });
});
```

Run: `cd packages/shared && pnpm exec jest src/__tests__/assignment-write.test.ts` → FAIL (exports missing).

- [ ] **Step 2: Org wall-clock schemas**

```ts
// packages/shared/src/org-time.ts
import { z } from "zod";

// Organisation wall-clock values on the wire (rulings C2, X13).
//
// An *instant* crosses the wire as an ISO-8601 string. A *wall-clock* value —
// "the 1st of April, 23:59, on the organisation's clock" — crosses as these
// two strings instead, and only the server turns one into the other, in
// config.orgTimezone. The device's timezone never enters: a form reads back
// exactly the day and time the user tapped and sends them as-is.
//
// Plan 5 created this module; Plan 14's event contracts import from it.

const ISO_DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isRealCalendarDay(value: string): boolean {
  const m = ISO_DAY_RE.exec(value);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day
  );
}

/** An organisation-calendar day, `YYYY-MM-DD`. Never derived on a device (X13). */
export const isoDaySchema = z
  .string()
  .regex(ISO_DAY_RE, "Use YYYY-MM-DD.")
  .refine(isRealCalendarDay, "Not a real calendar day.");

/** A wall-clock time on the organisation clock, `HH:mm`, 24-hour. */
export const wallTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm.");
```

In `packages/shared/src/index.ts` add `export * from "./org-time";` after `export * from "./enums";`.

- [ ] **Step 3: Assignment contracts.** In `packages/shared/src/assignment.ts`:

(a) Add the import below the `./enums` import:

```ts
import { isoDaySchema, wallTimeSchema } from "./org-time";
```

(b) In `staffAssignmentListItemSchema`, directly after `dueAt: z.string().nullable(),` add:

```ts
  /**
   * The organisation-calendar day `dueAt` falls on (ruling C4/X13). Screens
   * label the deadline with this; formatting `dueAt` on the device would show
   * a different day to a reader in a different zone.
   */
  dueOrgDay: isoDaySchema.nullable(),
```

(c) In `assignmentDetailSchema`, directly after `dueAt: z.string().nullable(),` add:

```ts
  /** Org-calendar day and org wall-clock time of `dueAt`; both null when there is no due date. */
  dueOrgDay: isoDaySchema.nullable(),
  dueOrgTime: wallTimeSchema.nullable(),
```

(d) Replace everything from the `// Request schemas` banner comment through
`export type UpdateAssignmentBody = z.output<typeof updateAssignmentRequestSchema>;`
(leave anything after that line — Plan 1's `isAssignmentOutstanding` — as it is) with:

```ts
// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

/** v1's form defaulted a picked due date to 23:59 (spec 07 R19). */
export const DEFAULT_DUE_TIME = "23:59";

const assignmentWriteBase = z.object({
  title: z.string().min(2).max(160),
  description: z.string().max(20000).nullable().optional(),
  /**
   * The due date as an organisation-calendar day plus wall-clock time. The
   * server composes the instant in config.orgTimezone (ruling C2). v1 sent an
   * instant composed with `setHours` in the author's browser zone (R45), so
   * the same "23:59" meant a different moment per author.
   */
  dueDay: isoDaySchema.nullable().optional(),
  dueTime: wallTimeSchema.nullable().optional(),
  sessionId: z.number().int().positive().nullable().optional(),
  type: assignmentTypeSchema.default("STANDARD"),
  forumMinWords: z.number().int().min(0).max(2000).nullable().optional(),
  forumAllowComments: z.boolean().default(false),
  maxFileSizeMb: z.number().int().min(1).max(100).nullable().optional(),
  allowedMimeCategories: z.array(mimeCategorySchema).default([]),
  /**
   * Targeting. In v1 these two were read off the *raw* request body, never the
   * parsed one, so nothing constrained them at all (R11). They are in the
   * schema now; the server additionally checks each id belongs to the season.
   */
  isAllGroups: z.boolean(),
  groupIds: z.array(z.number().int().positive()).default([]),
});

type AssignmentWriteParsed = z.infer<typeof assignmentWriteBase>;

// v1 parity 2026-10-09: no targeting refinement (was `refineTargeting`, a 400 for
// "specific groups" with none chosen). v1 assignment-actions.ts:73 saves it: it
// targets nobody, notifies nobody, expected count 0 — how an admin parks one (R13).

/**
 * The type-driven coercion v1 applied in its action bodies (R14–R17), hoisted
 * into the schema so both write paths get it identically and neither can
 * forget it. Duplicate group ids collapse, which is what stops v1's update
 * path from throwing a unique-constraint error mid-transaction (R70).
 */
function normalizeAssignmentWrite(value: AssignmentWriteParsed) {
  const isForum = value.type === "FORUM";
  const dueDay = value.dueDay ?? null;
  return {
    title: value.title,
    description: value.description ?? null,
    dueDay,
    dueTime: dueDay === null ? null : (value.dueTime ?? DEFAULT_DUE_TIME),
    sessionId: value.sessionId ?? null,
    type: value.type,
    forumMinWords: isForum ? (value.forumMinWords ?? null) : null,
    forumAllowComments: isForum ? value.forumAllowComments : false,
    maxFileSizeMb: isForum ? null : (value.maxFileSizeMb ?? null),
    allowedMimeCategories: isForum ? [] : value.allowedMimeCategories,
    isAllGroups: value.isAllGroups,
    groupIds: value.isAllGroups ? [] : Array.from(new Set(value.groupIds)),
  };
}

/**
 * One body for create and for update. A full replace, not a partial merge
 * (spec 07 R67, §8): v1 had no partial update and the edit form always sends
 * every field; PATCH-merge semantics would make "clear the due date" and
 * "leave the due date alone" the same request. `seasonId` is not a field —
 * create takes it from the path and update can never change it (R68).
 */
export const assignmentWriteRequestSchema = assignmentWriteBase.transform(normalizeAssignmentWrite);

/** What a client sends. */
export type AssignmentWriteRequest = z.input<typeof assignmentWriteRequestSchema>;
/** What the server acts on after defaults and type coercion. */
export type AssignmentWriteBody = z.output<typeof assignmentWriteRequestSchema>;

export const createAssignmentRequestSchema = assignmentWriteRequestSchema;
export const updateAssignmentRequestSchema = assignmentWriteRequestSchema;
export type CreateAssignmentRequest = AssignmentWriteRequest;
export type CreateAssignmentBody = AssignmentWriteBody;
export type UpdateAssignmentRequest = AssignmentWriteRequest;
export type UpdateAssignmentBody = AssignmentWriteBody;

/** `DELETE /assignments/:id`. */
export const assignmentDeletedResponseSchema = z.object({ deleted: z.literal(true) });
export type AssignmentDeletedResponse = z.infer<typeof assignmentDeletedResponseSchema>;
```

- [ ] **Step 4:** Run the shared test → PASS. `pnpm turbo typecheck --filter=@space/shared` → clean. (`grep -rn "createAssignmentRequestSchema\|updateAssignmentRequestSchema" apps packages --include=*.ts --include=*.tsx | grep -v node_modules` must show only `assignment.ts` and this test — nothing consumed the old `seasonId`/`dueAt` body.) The mobile and backend packages will fail typecheck/tests on fixtures missing `dueOrgDay`/`dueOrgTime` until Task 2 (backend) and Task 6 Step 1 (mobile) — expected.

- [ ] **Step 5: Commit** — `git add packages/shared && git commit -m "feat(shared): org wall-clock schemas and the full-replace assignment write body"`

---

### Task 2: Org wall-clock helpers + `dueOrgDay`/`dueOrgTime` on the read path

**Files:**
- Modify: `apps/backend/src/lib/org-time.ts` (Plans 3/4's file — append two functions)
- Modify: `apps/backend/src/lib/queries/assignments.ts` (`dueOrgDay` on list rows; new `assignmentDetailPayload`)
- Modify: `apps/backend/src/routes/assignments.ts` (GET detail uses `assignmentDetailPayload`)
- Modify: `apps/backend/src/docs/openapi.ts`
- Test: `apps/backend/src/__tests__/org-time.test.ts` (extend), `apps/backend/src/__tests__/integration/assignments-routes.test.ts` (extend)

**Interfaces:**
- Consumes: Plan 3's `orgWallClock`, `fromOrgWallClock`; Plan 4's `orgDayKey`; existing `isOverdue`, `loadAssignmentById`, `canManageAssignment`.
- Produces:
  - `orgWallTime(date: Date): string` (`HH:mm`) and `orgWallClockToInstant(day: string, time: string | null): Date` (null time = org midnight; throws `RangeError` on a malformed value) in `lib/org-time.ts` — **Plan 14 consumes both names and must not redefine them.**
  - `assignmentDetailPayload(detail, { isStudent, canManage, mySubmission })` and `MySubmissionData` in `lib/queries/assignments.ts` — the one builder of the detail response (GET, POST, PATCH).
  - `AssignmentListRow.dueOrgDay`.

- [ ] **Step 1: Failing unit test.** Add `orgWallClockToInstant` and `orgWallTime` to the existing `from "../lib/org-time"` import in `apps/backend/src/__tests__/org-time.test.ts` (the file already pins `Africa/Cairo` with its `jest.mock` of config), then append:

```ts
describe("orgWallTime / orgWallClockToInstant (Plan 5 — due dates, C2)", () => {
  it("reads the org wall-clock time of an instant on both sides of DST", () => {
    expect(orgWallTime(new Date("2099-03-10T21:59:00.000Z"))).toBe("23:59"); // UTC+2
    expect(orgWallTime(new Date("2099-05-01T20:59:00.000Z"))).toBe("23:59"); // UTC+3
  });

  it("composes the instant an org day and time name — the offset follows DST", () => {
    expect(orgWallClockToInstant("2099-03-10", "23:59").toISOString()).toBe(
      "2099-03-10T21:59:00.000Z",
    );
    expect(orgWallClockToInstant("2099-05-01", "23:59").toISOString()).toBe(
      "2099-05-01T20:59:00.000Z",
    );
    expect(orgWallClockToInstant("2099-01-15", null).toISOString()).toBe("2099-01-14T22:00:00.000Z");
  });

  it("round-trips through orgDayKey and orgWallTime", () => {
    const at = orgWallClockToInstant("2099-10-29", "09:05"); // the day DST ends
    expect(orgDayKey(at)).toBe("2099-10-29");
    expect(orgWallTime(at)).toBe("09:05");
  });

  it("refuses a malformed day or time instead of composing garbage", () => {
    expect(() => orgWallClockToInstant("2099-3-10", "23:59")).toThrow(RangeError);
    expect(() => orgWallClockToInstant("2099-03-10", "24:00")).toThrow(RangeError);
  });
});
```

(`orgDayKey` is already imported there by Plan 4.) Run: `cd apps/backend && npx jest src/__tests__/org-time.test.ts` → FAIL (exports missing).

- [ ] **Step 2: Implement.** Append to `apps/backend/src/lib/org-time.ts`:

```ts
const ORG_DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ORG_TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** `HH:mm` on the organisation's clock — the inverse of the time half of orgWallClockToInstant. */
export function orgWallTime(date: Date): string {
  const p = orgWallClock(date);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

/**
 * The instant at which the organisation's clock reads `day` at `time`
 * (`null` = midnight). The one place a wall-clock deadline becomes an instant
 * (ruling C2): v1 did this with `setHours` in the author's browser, so the
 * stored instant depended on where the admin was sitting (spec 07 R45).
 * Validates its own input — the shared schemas already have, but a malformed
 * value reaching here would otherwise normalise silently (Date.UTC rolls
 * "24:00" into the next day).
 */
export function orgWallClockToInstant(day: string, time: string | null): Date {
  const d = ORG_DAY_RE.exec(day);
  const t = ORG_TIME_RE.exec(time ?? "00:00");
  if (!d || !t) throw new RangeError(`Not an organisation wall clock: ${day} ${time ?? ""}`);
  return fromOrgWallClock({
    year: Number(d[1]),
    month: Number(d[2]),
    day: Number(d[3]),
    hour: Number(t[1]),
    minute: Number(t[2]),
    second: 0,
    millisecond: 0,
  });
}
```

Run the unit test → PASS.

- [ ] **Step 3: Failing integration assertions.** In `apps/backend/src/__tests__/integration/assignments-routes.test.ts`:

In the "returns the staff shape with submission and expected counts" test's `toEqual`, add after `dueAt: expect.any(String),`:

```ts
      // 2099-04-01T00:00Z is 02:00 on the 1st in Cairo (UTC+2): the org day.
      dueOrgDay: "2099-04-01",
```

and in the same test, after `expect(targeted.targetGroupIds).toEqual([groupBId]);` add:

```ts
    expect(targeted.dueOrgDay).toBeNull(); // no due date
```

In "returns detail for a SUPER with mySubmission null", add to the `toMatchObject`:

```ts
      dueOrgDay: "2099-04-01",
      dueOrgTime: "02:00",
      canManage: true,
```

and append a new case to the `GET /api/v1/assignments/:id` describe:

```ts
  it("returns null org due fields when there is no due date", async () => {
    const res = await request(app)
      .get(`/api/v1/assignments/${targetedAssignmentId}`)
      .set("authorization", `Bearer ${superToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.dueOrgDay).toBeNull();
    expect(res.body.data.dueOrgTime).toBeNull();
  });
```

Run: `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern assignments-routes` → the three touched cases FAIL.

- [ ] **Step 4: Implement the read path.** In `apps/backend/src/lib/queries/assignments.ts`:

Add below the existing imports:

```ts
import { orgDayKey, orgWallTime } from "../org-time";
```

In `AssignmentListRow` add `dueOrgDay: string | null;` after `dueAt`, and in
`listAssignmentsForSeason`'s returned object add after `dueAt: a.dueAt,`:

```ts
        dueOrgDay: a.dueAt ? orgDayKey(a.dueAt) : null,
```

Append (before the final `export { isLate, isOverdue };` line):

```ts
export interface MySubmissionData {
  publicId: string;
  status: SubmissionStatus;
  submittedAt: Date | null;
  reviewedAt: Date | null;
  feedback: string | null;
  isLate: boolean;
}

/**
 * The detail response, built in one place for GET, POST and PATCH so the three
 * cannot drift. Everything derived is derived here, server-side (ruling C4):
 * `isOverdue`, and the organisation-clock day/time of the deadline that every
 * screen labels with and the edit form pre-fills from (C2/X13). Students get
 * `groupIds: null` (ruling C8 — narrow the payload, not just the access).
 */
export function assignmentDetailPayload(
  detail: AssignmentDetailData,
  opts: { isStudent: boolean; canManage: boolean; mySubmission: MySubmissionData | null },
) {
  return {
    ...detail,
    groupIds: opts.isStudent ? null : detail.groupIds,
    isOverdue: isOverdue(detail.dueAt, new Date()),
    dueOrgDay: detail.dueAt ? orgDayKey(detail.dueAt) : null,
    dueOrgTime: detail.dueAt ? orgWallTime(detail.dueAt) : null,
    mySubmission: opts.mySubmission,
    canManage: opts.canManage,
  };
}
```

In `apps/backend/src/routes/assignments.ts`, add `assignmentDetailPayload` to
the `../lib/queries/assignments` import, drop `isOverdue` from it (no longer
used here), and replace the GET handler's final `return apiOk(res, { ...detail, … });`
block with:

```ts
  return apiOk(
    res,
    assignmentDetailPayload(detail, {
      isStudent,
      canManage: canManageAssignment(user, detail.seasonId),
      mySubmission,
    }),
  );
```

(`mySubmission` keeps its existing computation; its type is
`MySubmissionData | null`. The C8 comment that sat on `groupIds` moves with
the logic into `assignmentDetailPayload`.)

Run the assignments suite → PASS. `pnpm turbo lint typecheck test:unit --filter=@space/backend` → clean.

- [ ] **Step 5: OpenAPI.** In `src/docs/openapi.ts`, in the `StaffAssignmentListItem` component's `properties` add:

```ts
          dueOrgDay: {
            type: ["string", "null"],
            format: "date",
            description: "Organisation-calendar day of `dueAt` (ORG_TIMEZONE), derived server-side. Label deadlines with this, never by formatting `dueAt` on the device.",
          },
```

and in `AssignmentDetail`'s `properties`, after `dueAt`:

```ts
          dueOrgDay: {
            type: ["string", "null"],
            format: "date",
            description: "Organisation-calendar day of `dueAt`; null when there is no due date.",
          },
          dueOrgTime: {
            type: ["string", "null"],
            pattern: "^([01]\\d|2[0-3]):[0-5]\\d$",
            description: "Organisation wall-clock time of `dueAt`, 24-hour `HH:mm`; null when there is no due date. With `dueOrgDay`, exactly what the write body's `dueDay`/`dueTime` take.",
          },
```

- [ ] **Step 6: Commit** — `git add apps/backend && git commit -m "feat(backend): org wall-clock due fields on assignment reads"`

---
### Task 3: Create — `POST /api/v1/seasons/:id/assignments`

**Files:**
- Create: `apps/backend/src/lib/assignment-writes.ts`
- Modify: `apps/backend/src/routes/seasons.ts`, `apps/backend/src/docs/openapi.ts`
- Test: `apps/backend/src/__tests__/integration/assignment-writes-routes.test.ts` (new suite; Tasks 4–5 extend it)

**Interfaces:**
- Consumes: `createAssignmentRequestSchema`, `AssignmentWriteBody` (Task 1); `orgWallClockToInstant` (Task 2), `formatInOrgTime` (Plan 3); `createNotificationsBulk`; `canManageAssignment`; `loadAssignmentById`, `assignmentDetailPayload` (Task 2).
- Produces:
  - in `lib/assignment-writes.ts`: `validateAssignmentRefs(seasonId, { sessionId, groupIds }): Promise<AssignmentRefRefusal | null>`; `assignmentColumns(body)`; `targetedStudentIds(seasonId, isAllGroups, groupIds): Promise<number[]>`; `notifyAssignmentCreated(assignment, studentIds): Promise<void>` (**the single `ASSIGNMENT_CREATED` producer — Plan 13's table row "15"**); `bodyErrorMessage(err, fallback)`.
  - `POST /api/v1/seasons/:id/assignments` → `201 { data: AssignmentDetail }`; errors `bad_request` 400, `invalid_group` 400, `invalid_session` 400, `forbidden` 403, `not_found` 404.

- [ ] **Step 1: Failing tests.** Create the suite:

```ts
// apps/backend/src/__tests__/integration/assignment-writes-routes.test.ts
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { assignmentDetailSchema } from "../../../../../packages/shared/src/index";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

// 60s: the shared Neon staging database autosuspends, and beforeAll performs
// many sequential writes.
jest.setTimeout(60000);

const app = createApp();

let seasonId: number;
let otherSeasonId: number;
let groupAId: number;
let groupBId: number;
let otherGroupId: number;
let sessionId: number;
let otherSessionId: number;
let superId: number;
let adminId: number;
let studentAId: number;
let studentBId: number;
let optedOutId: number;
let withdrawnId: number;
let movedId: number;
let superToken: string;
let adminToken: string;
let otherAdminToken: string;
let leaderToken: string;
let studentToken: string;

beforeAll(async () => {
  await cleanupTestData();

  seasonId = (await createTestSeason()).id;
  otherSeasonId = (await createTestSeason({ year: 2100 })).id;

  const superUser = await createTestUser("super", "SUPER");
  const admin = await createTestUser("admin", "ADMIN");
  const otherAdmin = await createTestUser("other-admin", "ADMIN");
  const leader = await createTestUser("leader", "LEADER");
  const studentA = await createTestUser("student-a", "STUDENT");
  const studentB = await createTestUser("student-b", "STUDENT");
  const optedOut = await createTestUser("opted-out", "STUDENT");
  const withdrawn = await createTestUser("withdrawn", "STUDENT");
  const moved = await createTestUser("moved", "STUDENT");
  superId = superUser.id;
  adminId = admin.id;
  studentAId = studentA.id;
  studentBId = studentB.id;
  optedOutId = optedOut.id;
  withdrawnId = withdrawn.id;
  movedId = moved.id;

  // Grants must exist before login: the token carries seasonAdminIds.
  await db.seasonAdmin.create({ data: { seasonId, userId: admin.id } });
  await db.seasonAdmin.create({ data: { seasonId: otherSeasonId, userId: otherAdmin.id } });

  groupAId = (
    await db.group.create({
      data: {
        seasonId,
        name: "Group A",
        students: { create: [{ studentUserId: studentA.id }, { studentUserId: optedOut.id }] },
      },
      select: { id: true },
    })
  ).id;
  groupBId = (
    await db.group.create({
      data: { seasonId, name: "Group B", students: { create: { studentUserId: studentB.id } } },
      select: { id: true },
    })
  ).id;
  // The moved student's ONE GroupStudent row (unique per student, database-
  // wide) points at another season's group. Their enrolment in THIS season
  // records Group A. Ruling C9: this season's targeting must follow the
  // enrolment — GroupStudent would leave them un-notified.
  otherGroupId = (
    await db.group.create({
      data: { seasonId: otherSeasonId, name: "Elsewhere", students: { create: { studentUserId: moved.id } } },
      select: { id: true },
    })
  ).id;
  await db.groupLeader.create({ data: { groupId: groupAId, userId: leader.id } });

  await db.seasonEnrollment.createMany({
    data: [
      { seasonId, studentUserId: studentA.id, groupId: groupAId, status: "ACTIVE" },
      { seasonId, studentUserId: optedOut.id, groupId: groupAId, status: "ACTIVE" },
      { seasonId, studentUserId: moved.id, groupId: groupAId, status: "ACTIVE" },
      { seasonId, studentUserId: studentB.id, groupId: groupBId, status: "ACTIVE" },
      { seasonId, studentUserId: withdrawn.id, groupId: groupBId, status: "WITHDRAWN" },
    ],
  });
  await db.notificationPreference.create({ data: { userId: optedOut.id, assignmentCreated: false } });

  sessionId = (
    await db.session.create({
      data: { seasonId, title: "Linked", startsAt: new Date("2099-03-01T18:00:00.000Z"), durationMinutes: 60 },
      select: { id: true },
    })
  ).id;
  otherSessionId = (
    await db.session.create({
      data: {
        seasonId: otherSeasonId,
        title: "Not this season",
        startsAt: new Date("2100-03-01T18:00:00.000Z"),
        durationMinutes: 60,
      },
      select: { id: true },
    })
  ).id;

  superToken = await login(app, superUser.email);
  adminToken = await login(app, admin.email);
  otherAdminToken = await login(app, otherAdmin.email);
  leaderToken = await login(app, leader.email);
  studentToken = await login(app, studentA.email);
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

const body = (over: Record<string, unknown> = {}) => ({
  title: "Week 4 reflection",
  description: "Write a page.",
  dueDay: "2099-03-10",
  dueTime: "23:59",
  sessionId: null,
  type: "STANDARD",
  forumMinWords: null,
  forumAllowComments: false,
  maxFileSizeMb: 10,
  allowedMimeCategories: ["pdf"],
  isAllGroups: true,
  groupIds: [],
  ...over,
});

function create(over: Record<string, unknown> = {}, token = adminToken, season = seasonId) {
  return request(app)
    .post(`/api/v1/seasons/${season}/assignments`)
    .set("authorization", `Bearer ${token}`)
    .send(body(over));
}

function notificationsFor(userId: number, assignmentId: number) {
  return db.notification.findMany({
    where: { userId, type: "ASSIGNMENT_CREATED", link: `/student/assignments/${assignmentId}` },
    select: { title: true, body: true, link: true },
  });
}

describe("POST /api/v1/seasons/:id/assignments", () => {
  it("creates a targeted assignment and returns the full detail, parsed by the shared schema", async () => {
    const res = await create({ isAllGroups: false, groupIds: [groupAId], sessionId });

    expect(res.status).toBe(201);
    expect(assignmentDetailSchema.safeParse(res.body.data).success).toBe(true);
    expect(res.body.data).toMatchObject({
      seasonId,
      title: "Week 4 reflection",
      sessionId,
      sessionTitle: "Linked",
      isAllGroups: false,
      groupIds: [groupAId],
      // 23:59 on 10 March, Cairo (UTC+2) — composed on the server (C2).
      dueAt: "2099-03-10T21:59:00.000Z",
      dueOrgDay: "2099-03-10",
      dueOrgTime: "23:59",
      mySubmission: null,
      canManage: true,
    });

    const row = await db.assignment.findUnique({
      where: { id: res.body.data.id },
      select: { createdById: true, updatedById: true, targets: { select: { groupId: true } } },
    });
    expect(row).toEqual({ createdById: adminId, updatedById: adminId, targets: [{ groupId: groupAId }] });
  });

  it("composes the deadline on the org clock across DST: 23:59 in May is 20:59Z (UTC+3)", async () => {
    const res = await create({ dueDay: "2099-05-01" });
    expect(res.status).toBe(201);
    expect(res.body.data.dueAt).toBe("2099-05-01T20:59:00.000Z");
    expect(res.body.data.dueOrgTime).toBe("23:59");
  });

  it("notifies each targeted student once, with v1's exact link and org-time body (X1, C2)", async () => {
    const res = await create({ title: "Targeted", isAllGroups: false, groupIds: [groupAId] });
    const id = res.body.data.id as number;

    expect(await notificationsFor(studentAId, id)).toEqual([
      {
        title: "New assignment: Targeted",
        body: "Due Mar 10, 2099, 11:59 PM",
        link: `/student/assignments/${id}`,
      },
    ]);
    expect(await notificationsFor(studentBId, id)).toEqual([]); // Group B not targeted
    expect(await notificationsFor(optedOutId, id)).toEqual([]); // R64 opt-out honoured
  });

  it("notifies through the season enrolment, not GroupStudent (C9)", async () => {
    const res = await create({ title: "Moved", isAllGroups: false, groupIds: [groupAId] });
    expect(await notificationsFor(movedId, res.body.data.id)).toHaveLength(1);
  });

  it("notifies every ACTIVE enrollee for a whole-season assignment, and omits the body with no due date", async () => {
    const res = await create({ title: "Everyone", dueDay: null });
    const id = res.body.data.id as number;

    expect(await notificationsFor(studentAId, id)).toEqual([
      { title: "New assignment: Everyone", body: null, link: `/student/assignments/${id}` },
    ]);
    expect(await notificationsFor(studentBId, id)).toHaveLength(1);
    expect(await notificationsFor(withdrawnId, id)).toEqual([]); // R61: ACTIVE only
    expect(res.body.data.dueAt).toBeNull();
    expect(res.body.data.dueOrgDay).toBeNull();
  });

  it("applies the FORUM/STANDARD coercion on write (R14–R16)", async () => {
    const forum = await create({
      type: "FORUM", forumMinWords: 120, forumAllowComments: true, maxFileSizeMb: 20,
    });
    const row = await db.assignment.findUnique({
      where: { id: forum.body.data.id },
      select: { forumMinWords: true, forumAllowComments: true, maxFileSizeMb: true, allowedMimeCategories: true },
    });
    expect(row).toEqual({ forumMinWords: 120, forumAllowComments: true, maxFileSizeMb: null, allowedMimeCategories: [] });
  });

  it("collapses a repeated group id into one target row (R70)", async () => {
    const res = await create({ isAllGroups: false, groupIds: [groupBId, groupBId] });
    expect(res.status).toBe(201);
    expect(await db.assignmentTarget.count({ where: { assignmentId: res.body.data.id } })).toBe(1);
  });

  it("lets a SUPER create in any season", async () => {
    const res = await create({}, superToken);
    expect(res.status).toBe(201);
    const row = await db.assignment.findUnique({ where: { id: res.body.data.id }, select: { createdById: true } });
    expect(row?.createdById).toBe(superId);
  });

  it("refuses everyone who does not administer the season (v1 canCreateAssignment)", async () => {
    for (const token of [otherAdminToken, leaderToken, studentToken]) {
      const res = await create({}, token);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("forbidden");
    }
  });

  it("refuses another season's group with invalid_group and writes nothing (§10 item 6)", async () => {
    const before = await db.assignment.count({ where: { seasonId } });
    const res = await create({ isAllGroups: false, groupIds: [groupAId, otherGroupId] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_group");
    expect(await db.assignment.count({ where: { seasonId } })).toBe(before);
  });

  it("refuses another season's session with invalid_session (spec §4 item 4)", async () => {
    const res = await create({ sessionId: otherSessionId });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_session");
  });

  // v1 parity 2026-10-09 (was "refuses 'specific groups' with none chosen"): v1 R13 saves it.
  it("saves 'specific groups' with none chosen (targets nobody), and refuses a 161-character title", async () => {
    const empty = await create({ isAllGroups: false, groupIds: [] });
    expect(empty.status).toBe(201);
    const emptyId = empty.body.data.id as number;
    expect(await notificationsFor(studentAId, emptyId)).toHaveLength(0);
    const long = await create({ title: "x".repeat(161) });
    expect(long.status).toBe(400);
    expect(long.body.error.code).toBe("bad_request");
  });

  it("returns 400 for a bad season id and 404 for a missing season", async () => {
    const bad = await request(app)
      .post("/api/v1/seasons/abc/assignments")
      .set("authorization", `Bearer ${superToken}`)
      .send(body());
    expect(bad.status).toBe(400);
    const missing = await create({}, superToken, 2147483000);
    expect(missing.status).toBe(404);
  });
});
```

Run: `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern assignment-writes-routes` → FAIL (404s from the catch-all).

- [ ] **Step 2: The shared write library**

```ts
// apps/backend/src/lib/assignment-writes.ts
import type { ZodError } from "zod";
import type { AssignmentWriteBody } from "@space/shared";

import { db } from "../db/client";

import { createNotificationsBulk } from "./notifications";
import { formatInOrgTime, orgWallClockToInstant } from "./org-time";

/**
 * Rules every assignment write shares, in one place so create and edit cannot
 * drift. Ported from v1 `src/lib/assignment-actions.ts:44-182` with the
 * divergences listed in Plan 5's header, each named where it happens.
 */

export interface AssignmentRefRefusal {
  code: "invalid_group" | "invalid_session";
  message: string;
}

/**
 * v1 constrained `groupIds` and `sessionId` only by which options its form
 * rendered (spec 07 R4, R12, §4 item 4): a hand-made payload could target
 * another season's groups or link another season's session. Ruling C8 — gate
 * the row, not the route. `groupIds` arrive deduplicated (shared schema), so a
 * count comparison is exact.
 */
export async function validateAssignmentRefs(
  seasonId: number,
  refs: { sessionId: number | null; groupIds: number[] },
): Promise<AssignmentRefRefusal | null> {
  if (refs.sessionId !== null) {
    const session = await db.session.findFirst({
      where: { id: refs.sessionId, seasonId },
      select: { id: true },
    });
    if (!session) {
      return { code: "invalid_session", message: "That session isn't part of this assignment's season." };
    }
  }
  if (refs.groupIds.length > 0) {
    const inSeason = await db.group.count({ where: { id: { in: refs.groupIds }, seasonId } });
    if (inSeason !== refs.groupIds.length) {
      return { code: "invalid_group", message: "Every group must belong to this assignment's season." };
    }
  }
  return null;
}

/**
 * The Assignment columns a write sets — everything except seasonId and the
 * audit columns, which differ between create and update. The deadline is
 * composed here, on the organisation's clock (ruling C2).
 */
export function assignmentColumns(body: AssignmentWriteBody) {
  return {
    title: body.title,
    description: body.description,
    dueAt: body.dueDay === null ? null : orgWallClockToInstant(body.dueDay, body.dueTime),
    sessionId: body.sessionId,
    isAllGroups: body.isAllGroups,
    type: body.type,
    forumMinWords: body.forumMinWords,
    forumAllowComments: body.forumAllowComments,
    maxFileSizeMb: body.maxFileSizeMb,
    allowedMimeCategories: body.allowedMimeCategories,
  };
}

/**
 * Who an assignment is given to: ACTIVE enrolments in the season, narrowed to
 * the targeted groups. v1 read GroupStudent for the targeted branch
 * (`assignment-actions.ts:177`) — ruling C9 forbids that, because GroupStudent
 * is one row per student database-wide. This is the same population
 * `loadAssignmentTracker` lists, so "who was notified" and "who the tracker
 * expects" are one answer.
 */
export async function targetedStudentIds(
  seasonId: number,
  isAllGroups: boolean,
  groupIds: number[],
): Promise<number[]> {
  const rows = await db.seasonEnrollment.findMany({
    where: { seasonId, status: "ACTIVE", ...(isAllGroups ? {} : { groupId: { in: groupIds } }) },
    select: { studentUserId: true },
  });
  return Array.from(new Set(rows.map((r) => r.studentUserId)));
}

/**
 * The single ASSIGNMENT_CREATED producer (create only — an edit notifies
 * nobody, v1 R66/R74; v1 parity 2026-10-09). Runs after the write has committed (R65). Title and link are
 * v1's exact strings (`assignment-actions.ts:87,91`; ruling X1); the body's
 * time is the organisation's wall clock (C2), not the host's toLocaleString.
 */
export async function notifyAssignmentCreated(
  assignment: { id: number; title: string; dueAt: Date | null },
  studentIds: number[],
): Promise<void> {
  if (studentIds.length === 0) return;
  try {
    await createNotificationsBulk(studentIds, {
      type: "ASSIGNMENT_CREATED",
      title: `New assignment: ${assignment.title}`,
      body: assignment.dueAt ? `Due ${formatInOrgTime(assignment.dueAt)}` : undefined,
      link: `/student/assignments/${assignment.id}`,
    });
  } catch {
    // Best-effort: the assignment exists; a notification failure must not
    // report the write as failed (R86). Plan 13 replaces this try/catch with
    // its bestEffort wrapper.
  }
}

/** The first schema issue as a sentence the client can show, prefixed with its field. */
export function bodyErrorMessage(err: ZodError, fallback: string): string {
  const issue = err.issues[0];
  if (!issue) return fallback;
  return issue.path.length > 0 ? `${issue.path.join(".")}: ${issue.message}` : issue.message;
}
```

- [ ] **Step 3: The route.** In `apps/backend/src/routes/seasons.ts`:
add `assignmentDetailPayload` and `loadAssignmentById` to the
`../lib/queries/assignments` import; add `canManageAssignment` to the
`../lib/permissions` import; add `createAssignmentRequestSchema` to the
relative `"../../../../packages/shared/src/index"` import; add

```ts
import {
  assignmentColumns,
  bodyErrorMessage,
  notifyAssignmentCreated,
  targetedStudentIds,
  validateAssignmentRefs,
} from "../lib/assignment-writes";
```

and register, directly after the existing `GET "/:id/assignments"` handler:

```ts
seasonsRouter.post("/:id/assignments", async (req, res) => {
  const user = requireUser(req);
  const seasonId = parseId(req.params.id);
  if (seasonId === null) return apiError(res, "bad_request", "Invalid season id.", 400);

  // v1 canCreateAssignment = isAdminOfSeason (SUPER passes) — permissions.ts:273-278.
  if (!canManageAssignment(user, seasonId)) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const season = await db.season.findFirst({
    where: { id: seasonId, deletedAt: null },
    select: { id: true },
  });
  if (!season) return apiError(res, "not_found", "Season not found.", 404);

  const parsed = createAssignmentRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return apiError(res, "bad_request", bodyErrorMessage(parsed.error, "Invalid assignment body."), 400);
  }
  const body = parsed.data;

  const refusal = await validateAssignmentRefs(seasonId, body);
  if (refusal) return apiError(res, refusal.code, refusal.message, 400);

  const columns = assignmentColumns(body);
  // R84: the row and its targets commit together.
  const created = await db.$transaction(async (tx) => {
    const assignment = await tx.assignment.create({
      data: { seasonId, ...columns, createdById: user.userId, updatedById: user.userId },
      select: { id: true },
    });
    if (!body.isAllGroups) {
      await tx.assignmentTarget.createMany({
        data: body.groupIds.map((groupId) => ({ assignmentId: assignment.id, groupId })),
      });
    }
    return assignment;
  });

  // R65: fan-out after the commit, never inside it.
  await notifyAssignmentCreated(
    { id: created.id, title: body.title, dueAt: columns.dueAt },
    await targetedStudentIds(seasonId, body.isAllGroups, body.groupIds),
  );

  const detail = await loadAssignmentById(created.id);
  // Unreachable — the row was written above — but the loader is nullable.
  if (!detail) return apiError(res, "not_found", "Assignment not found.", 404);
  return apiOk(res, assignmentDetailPayload(detail, { isStudent: false, canManage: true, mySubmission: null }), 201);
});
```

Run the suite → PASS. `pnpm turbo lint typecheck test:unit --filter=@space/backend` → clean.

- [ ] **Step 4: OpenAPI.** In `src/docs/openapi.ts`: change the `Assignments` tag's description to `"Assignment detail, authoring and the submission tracker"`; add next to `AssignmentTracker` in `components.schemas`:

```ts
      AssignmentWriteRequest: {
        type: "object",
        required: ["title", "isAllGroups"],
        description: "One full-replace body for create (POST) and update (PATCH). There is no `seasonId`: create takes it from the path and an assignment never moves season.",
        properties: {
          title: { type: "string", minLength: 2, maxLength: 160 },
          description: { type: ["string", "null"], maxLength: 20000 },
          dueDay: {
            type: ["string", "null"],
            format: "date",
            description: "Organisation-calendar day the assignment is due; null = no due date. The server composes the instant in ORG_TIMEZONE (ruling C2) — a client never sends an instant.",
          },
          dueTime: {
            type: ["string", "null"],
            pattern: "^([01]\\d|2[0-3]):[0-5]\\d$",
            default: "23:59",
            description: "Organisation wall-clock time, 24-hour. Ignored when `dueDay` is null.",
          },
          sessionId: { type: ["integer", "null"], description: "Must be a session of the assignment's season (400 `invalid_session`)." },
          type: { $ref: "#/components/schemas/AssignmentType" },
          forumMinWords: { type: ["integer", "null"], minimum: 0, maximum: 2000, description: "Kept only for FORUM; forced null for STANDARD." },
          forumAllowComments: { type: "boolean", default: false, description: "Kept only for FORUM; forced false for STANDARD." },
          maxFileSizeMb: { type: ["integer", "null"], minimum: 1, maximum: 100, description: "Null = accepts no files. Forced null for FORUM." },
          allowedMimeCategories: {
            type: "array",
            items: { type: "string", enum: ["image", "pdf", "doc", "audio", "video", "text"] },
            default: [],
            description: "Empty = any type. Forced empty for FORUM.",
          },
          isAllGroups: { type: "boolean" },
          groupIds: {
            type: "array",
            items: { type: "integer" },
            default: [],
            description: "Required non-empty when `isAllGroups` is false; every id must be a group of the assignment's season (400 `invalid_group`). Duplicates collapse. Ignored when `isAllGroups` is true.",
          },
        },
      },
```

and add `post` to the existing `"/api/v1/seasons/{id}/assignments"` object:

```ts
      post: {
        tags: ["Assignments"],
        summary: "Create an assignment in a season",
        description:
          "Season admins (SUPER passes). Row and targets commit in one transaction. Afterwards every ACTIVE enrolled student the assignment targets — resolved through SeasonEnrollment (ruling C9), opted-out students skipped — gets ASSIGNMENT_CREATED titled `New assignment: <title>`, body `Due <org time>` (omitted with no due date), link `/student/assignments/<id>` (v1's path, ruling X1). A notification failure never fails the create.",
        parameters: [idParam],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/AssignmentWriteRequest" } } },
        },
        responses: {
          201: ok({ $ref: "#/components/schemas/AssignmentDetail" }, "Created — the same shape GET /assignments/{id} returns."),
          400: conflict("`bad_request` (body; message names the first failing field), `invalid_group`, or `invalid_session`."),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
        },
      },
```

(`conflict()` is Plan 3's described-error-response helper; it is used here for a 400 because it is the only helper that takes a description.)

- [ ] **Step 5: Commit** — `git add apps/backend && git commit -m "feat(backend): create assignment — season-fenced targets, org-time due date, v1 notification fan-out"`

---

### Task 4: Edit — `PATCH /api/v1/assignments/:id` (full replace)

**Files:**
- Modify: `apps/backend/src/routes/assignments.ts`, `apps/backend/src/docs/openapi.ts`
- Test: extend `apps/backend/src/__tests__/integration/assignment-writes-routes.test.ts`

**Interfaces:**
- Consumes: `updateAssignmentRequestSchema` (Task 1); `assignmentColumns`, `validateAssignmentRefs`, `bodyErrorMessage` (Task 3) — not `targetedStudentIds`/`notifyAssignmentCreated`, since an edit notifies nobody (v1 parity 2026-10-09); `assignmentDetailPayload`, `loadAssignmentById` (Task 2); `canManageAssignment`.
- Produces: `PATCH /api/v1/assignments/:id` (body `AssignmentWriteRequest`) → `200 { data: AssignmentDetail }`; errors `bad_request`, `invalid_group`, `invalid_session` 400, `forbidden` 403, `not_found` 404.

- [ ] **Step 1: Failing tests.** Append to the suite:

```ts
describe("PATCH /api/v1/assignments/:id", () => {
  function patch(id: number, over: Record<string, unknown> = {}, token = adminToken) {
    return request(app)
      .patch(`/api/v1/assignments/${id}`)
      .set("authorization", `Bearer ${token}`)
      .send(body(over));
  }

  it("replaces every field wholesale, keeps the season, stamps updatedById (R67, R68, R71)", async () => {
    const made = await create({ isAllGroups: false, groupIds: [groupAId] }, superToken);
    const id = made.body.data.id as number;

    const res = await patch(id, {
      title: "Renamed",
      dueDay: null,
      type: "FORUM",
      forumMinWords: 120,
      forumAllowComments: true,
      maxFileSizeMb: 20,
      allowedMimeCategories: ["image"],
      sessionId,
      isAllGroups: true,
      // Not a field: an assignment never moves season. Stripped, not honoured.
      seasonId: otherSeasonId,
    });

    expect(res.status).toBe(200);
    expect(assignmentDetailSchema.safeParse(res.body.data).success).toBe(true);
    const row = await db.assignment.findUnique({
      where: { id },
      select: {
        seasonId: true, title: true, dueAt: true, type: true, forumMinWords: true,
        forumAllowComments: true, maxFileSizeMb: true, allowedMimeCategories: true,
        isAllGroups: true, sessionId: true, createdById: true, updatedById: true,
        targets: { select: { groupId: true } },
      },
    });
    expect(row).toEqual({
      seasonId, title: "Renamed", dueAt: null, type: "FORUM", forumMinWords: 120,
      forumAllowComments: true, maxFileSizeMb: null, allowedMimeCategories: [],
      isAllGroups: true, sessionId, createdById: superId, updatedById: adminId,
      targets: [], // R69: targeting replaced, not merged
    });
  });

  // v1 parity 2026-10-09 (was "notifies only students NEWLY targeted by an edit"):
  // v1 assignment-actions.ts:101-139 — edits and retargeting notify nobody (R66, R74).
  it("notifies nobody on edit, even students newly targeted (v1 R66, R74)", async () => {
    const made = await create({ title: "Retarget", isAllGroups: false, groupIds: [groupAId] });
    const id = made.body.data.id as number;
    expect(await notificationsFor(studentAId, id)).toHaveLength(1);
    expect(await notificationsFor(studentBId, id)).toHaveLength(0);

    const widened = await patch(id, { title: "Retarget", isAllGroups: false, groupIds: [groupAId, groupBId] });
    expect(widened.status).toBe(200);
    expect(await notificationsFor(studentBId, id)).toHaveLength(0); // added silently
    expect(await notificationsFor(studentAId, id)).toHaveLength(1);

    await patch(id, { title: "Retarget", isAllGroups: true });
    expect(await notificationsFor(studentAId, id)).toHaveLength(1);
    expect(await notificationsFor(studentBId, id)).toHaveLength(0);
    expect(await notificationsFor(withdrawnId, id)).toHaveLength(0);
  });

  it("accepts a repeated group id instead of failing the transaction (R70)", async () => {
    const made = await create();
    const res = await patch(made.body.data.id, { isAllGroups: false, groupIds: [groupAId, groupAId] });
    expect(res.status).toBe(200);
    expect(res.body.data.groupIds).toEqual([groupAId]);
  });

  it("allows editing after submissions exist (R72)", async () => {
    const made = await create();
    const id = made.body.data.id as number;
    await db.submission.create({
      data: { assignmentId: id, studentUserId: studentAId, publicId: `space-v2-test-e${id}`, status: "SUBMITTED" },
    });
    const res = await patch(id, { title: "Typo fixed" });
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe("Typo fixed");
  });

  it("leaves targeting untouched when a ref is refused", async () => {
    const made = await create({ isAllGroups: false, groupIds: [groupAId] });
    const id = made.body.data.id as number;
    const res = await patch(id, { isAllGroups: false, groupIds: [otherGroupId] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_group");
    const targets = await db.assignmentTarget.findMany({ where: { assignmentId: id }, select: { groupId: true } });
    expect(targets).toEqual([{ groupId: groupAId }]);
  });

  it("refuses non-admins of the assignment's season", async () => {
    const made = await create();
    for (const token of [otherAdminToken, leaderToken, studentToken]) {
      const res = await patch(made.body.data.id, { title: "Nope" }, token);
      expect(res.status).toBe(403);
    }
  });

  it("returns 404 for a soft-deleted assignment (closes R79) and for a missing one; 400 for a bad id", async () => {
    const made = await create();
    const id = made.body.data.id as number;
    await db.assignment.update({ where: { id }, data: { deletedAt: new Date() } });
    expect((await patch(id)).status).toBe(404);
    expect((await patch(2147483000)).status).toBe(404);
    const bad = await request(app)
      .patch("/api/v1/assignments/abc")
      .set("authorization", `Bearer ${adminToken}`)
      .send(body());
    expect(bad.status).toBe(400);
  });
});
```

Run the suite → the new cases FAIL.

- [ ] **Step 2: Implement.** In `apps/backend/src/routes/assignments.ts`
(`db`, `loadAssignmentById`, `assignmentDetailPayload` and
`canManageAssignment` are already imported) add

```ts
import {
  assignmentColumns,
  bodyErrorMessage,
  validateAssignmentRefs,
} from "../lib/assignment-writes";
import { updateAssignmentRequestSchema } from "../../../../packages/shared/src/index";
```

and register after the tracker handler:

```ts
/**
 * Full replace (spec 07 R67): the body is the whole assignment. Targeting is
 * deleted and recreated inside the same transaction as the field update (R69,
 * R85). Nobody is notified — students newly brought into scope are added
 * silently, as v1 (R66, R74). v1 parity 2026-10-09: was "notify newly targeted".
 */
assignmentsRouter.patch("/:id", async (req, res) => {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid assignment id.", 400);

  // v1's canEditAssignment read the row without a deletedAt filter (R79).
  const existing = await db.assignment.findFirst({
    where: { id, deletedAt: null },
    select: { seasonId: true, isAllGroups: true, targets: { select: { groupId: true } } },
  });
  if (!existing) return apiError(res, "not_found", "Assignment not found.", 404);
  if (!canManageAssignment(user, existing.seasonId)) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const parsed = updateAssignmentRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return apiError(res, "bad_request", bodyErrorMessage(parsed.error, "Invalid assignment body."), 400);
  }
  const body = parsed.data;

  const refusal = await validateAssignmentRefs(existing.seasonId, body);
  if (refusal) return apiError(res, refusal.code, refusal.message, 400);

  const columns = assignmentColumns(body);
  await db.$transaction(async (tx) => {
    // seasonId and createdById are never written here (R68).
    await tx.assignment.update({ where: { id }, data: { ...columns, updatedById: user.userId } });
    await tx.assignmentTarget.deleteMany({ where: { assignmentId: id } });
    if (!body.isAllGroups) {
      await tx.assignmentTarget.createMany({
        data: body.groupIds.map((groupId) => ({ assignmentId: id, groupId })),
      });
    }
  });

  // v1 parity 2026-10-09 (was "notify students newly targeted"): v1
  // assignment-actions.ts:101-139,128-133 — an edit notifies nobody (R66, R74).

  const detail = await loadAssignmentById(id);
  if (!detail) return apiError(res, "not_found", "Assignment not found.", 404);
  return apiOk(res, assignmentDetailPayload(detail, { isStudent: false, canManage: true, mySubmission: null }));
});
```

Run the suite → PASS.

- [ ] **Step 3: OpenAPI** — add `patch` to the existing `"/api/v1/assignments/{id}"` object:

```ts
      patch: {
        tags: ["Assignments"],
        summary: "Replace an assignment",
        description:
          "Season admins of the assignment's season (SUPER passes). A full replace — send every field; omitted optional fields are cleared, exactly like v1's edit form. Targeting is replaced in the same transaction. The season never changes (any `seasonId` in the body is ignored). An edit notifies nobody — students newly targeted are added silently, as v1 (R66, R74). Editing is allowed after submissions exist (v1 R72). A soft-deleted assignment is 404.",
        parameters: [idParam],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/AssignmentWriteRequest" } } },
        },
        responses: {
          200: ok({ $ref: "#/components/schemas/AssignmentDetail" }, "The updated assignment."),
          400: conflict("`bad_request`, `invalid_group`, or `invalid_session`."),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
        },
      },
```

- [ ] **Step 4: Commit** — `git add apps/backend && git commit -m "feat(backend): full-replace assignment edit"` *(v1 parity 2026-10-09: was "…; notify newly targeted students")*

---

### Task 5: Delete — designed, not ported

v1's `softDeleteAssignmentAction` has **no caller anywhere** (R80); ruling C12
says its semantics are not a specification. Spec §10 item 4 recommends
designing it and blocking deletion while submissions exist. This plan does
exactly that: soft delete (the schema's `Submission → Assignment` cascade must
never fire), refused with 409 `has_submissions` while any `Submission` row
exists — any status, since a DRAFT is a student's work too — and no `force`
escape hatch (relax later if a real need appears). The guard is part of the
`UPDATE`'s own `WHERE`, so a submission created between a check and the write
cannot slip through. The read side is already consistent: the tracker,
detail, both lists, the leader queue (`routes/submissions.ts` filters
`assignment: { deletedAt: null }`) and `PUT /submissions/by-assignment` all
exclude soft-deleted assignments on `main`.

**Files:**
- Modify: `apps/backend/src/routes/assignments.ts`, `apps/backend/src/docs/openapi.ts`
- Test: extend `apps/backend/src/__tests__/integration/assignment-writes-routes.test.ts`

**Interfaces:**
- Consumes: `canManageAssignment`.
- Produces: `DELETE /api/v1/assignments/:id` → `200 { data: { deleted: true } }` (parsed client-side by `assignmentDeletedResponseSchema`); 409 `has_submissions`; 404 for missing or already deleted.

- [ ] **Step 1: Failing tests.** Append:

```ts
describe("DELETE /api/v1/assignments/:id", () => {
  function del(id: number, token = adminToken) {
    return request(app).delete(`/api/v1/assignments/${id}`).set("authorization", `Bearer ${token}`);
  }

  it("soft-deletes an untouched assignment; it disappears from every read; targets stay (R75, R76)", async () => {
    const made = await create({ isAllGroups: false, groupIds: [groupAId] });
    const id = made.body.data.id as number;
    const notifiedBefore = await db.notification.count({ where: { link: `/student/assignments/${id}` } });

    const res = await del(id);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ deleted: true });

    const row = await db.assignment.findUnique({ where: { id }, select: { deletedAt: true, updatedById: true } });
    expect(row?.deletedAt).not.toBeNull();
    expect(row?.updatedById).toBe(adminId);
    expect(await db.assignmentTarget.count({ where: { assignmentId: id } })).toBe(1);

    const detail = await request(app).get(`/api/v1/assignments/${id}`).set("authorization", `Bearer ${adminToken}`);
    expect(detail.status).toBe(404);
    const list = await request(app)
      .get(`/api/v1/seasons/${seasonId}/assignments`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(list.body.data.assignments.map((a: { id: number }) => a.id)).not.toContain(id);
    // R66: deleting notifies nobody.
    expect(await db.notification.count({ where: { link: `/student/assignments/${id}` } })).toBe(notifiedBefore);
  });

  it("refuses while any submission exists — even a draft — and leaves the row live (§10 item 4)", async () => {
    const made = await create();
    const id = made.body.data.id as number;
    await db.submission.create({
      data: { assignmentId: id, studentUserId: studentAId, publicId: `space-v2-test-d${id}`, status: "DRAFT" },
    });
    const res = await del(id);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("has_submissions");
    const row = await db.assignment.findUnique({ where: { id }, select: { deletedAt: true } });
    expect(row?.deletedAt).toBeNull();
  });

  it("cannot delete twice (closes R79), and 404s a missing id", async () => {
    const made = await create();
    const id = made.body.data.id as number;
    expect((await del(id)).status).toBe(200);
    expect((await del(id)).status).toBe(404);
    expect((await del(2147483000)).status).toBe(404);
  });

  it("refuses non-admins of the assignment's season", async () => {
    const made = await create();
    for (const token of [otherAdminToken, leaderToken, studentToken]) {
      expect((await del(made.body.data.id, token)).status).toBe(403);
    }
  });
});
```

Run the suite → the new cases FAIL.

- [ ] **Step 2: Implement.** Register after the PATCH handler:

```ts
assignmentsRouter.delete("/:id", async (req, res) => {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid assignment id.", 400);

  const existing = await db.assignment.findFirst({
    where: { id, deletedAt: null },
    select: { seasonId: true },
  });
  if (!existing) return apiError(res, "not_found", "Assignment not found.", 404);
  if (!canManageAssignment(user, existing.seasonId)) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  // Designed, not ported (ruling C12, spec 07 §10 item 4): a deleted
  // assignment with submissions would strand student work out of every view.
  // The "no submissions" condition is in the UPDATE's own WHERE, so a draft
  // created after the lookup above still blocks the delete.
  const { count } = await db.assignment.updateMany({
    where: { id, deletedAt: null, submissions: { none: {} } },
    data: { deletedAt: new Date(), updatedById: user.userId },
  });
  if (count === 0) {
    return apiError(
      res,
      "has_submissions",
      "Students have already started this assignment, so it can't be deleted.",
      409,
    );
  }
  return apiOk(res, { deleted: true });
});
```

Run the suite → PASS. `pnpm turbo lint typecheck test:unit --filter=@space/backend` → clean.

- [ ] **Step 3: OpenAPI** — add `delete` to `"/api/v1/assignments/{id}"`:

```ts
      delete: {
        tags: ["Assignments"],
        summary: "Soft-delete an assignment nobody has started",
        description:
          "Season admins of the assignment's season. Designed rather than ported: v1's soft-delete action had no caller (ruling C12). Sets `deletedAt`; targets and any history stay. Refused with 409 `has_submissions` while any Submission row exists (any status, drafts included) — there is no force option. Notifies nobody. Deleting twice is 404. Returns 200 with `{ deleted: true }` (the response envelope), not 204.",
        parameters: [idParam],
        responses: {
          200: ok({ type: "object", properties: { deleted: { type: "boolean", enum: [true] } } }, "Deleted."),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
          409: conflict("`has_submissions`."),
        },
      },
```

- [ ] **Step 4: Commit** — `git add apps/backend && git commit -m "feat(backend): assignment delete — soft, refused once any student has started it"`

---
### Task 6: Mobile foundation — route move (X7), new routes, hooks, labels, picker

**Files:**
- Install: `@react-native-community/datetimepicker` (modifies `apps/mobile/package.json`, `pnpm-lock.yaml`)
- Move: `apps/mobile/app/(app)/assignment/[id].tsx` → `apps/mobile/app/(app)/assignment/[id]/index.tsx` (ruling X7 — it gains the `edit` child)
- Create: `apps/mobile/app/(app)/assignment/[id]/edit.tsx`, `apps/mobile/app/(app)/assignment/new.tsx` (stubs; Task 9 fills them)
- Modify: `apps/mobile/app/(app)/_layout.tsx` (`DETAIL_ROUTE_NAMES`)
- Modify: `apps/mobile/src/__tests__/app-layout.test.tsx` (Plan 1's assignment assertion), `apps/mobile/src/__tests__/assignment-detail.test.tsx` and `submission-editor.test.tsx` (import path; `dueOrgDay`/`dueOrgTime` fixture fields)
- Modify: `apps/mobile/src/lib/query-keys.ts`, `apps/mobile/src/hooks/use-assignments.ts`, `apps/mobile/src/hooks/use-groups.ts`, `apps/mobile/src/lib/format.ts`
- Create: `apps/mobile/src/hooks/use-assignment-writes.ts`, `apps/mobile/src/lib/assignment-labels.ts`
- Test: `apps/mobile/src/__tests__/assignment-hooks.test.tsx`, `apps/mobile/src/__tests__/assignment-labels.test.ts`, extend `apps/mobile/src/__tests__/format.test.ts`

**Interfaces:**
- Consumes: Task 1's schemas; Plan 1's `queryKeys.assignments` and hooks; Plan 2's `queryKeys.groups` and `use-groups.ts`; Plan 4's `formatDayKey`.
- Produces (exact names Tasks 7–9 and later plans use):
  - routes `/assignment/[id]` (route name `assignment/[id]/index`), `/assignment/[id]/edit` (`assignment/[id]/edit`), `/assignment/new` (`assignment/new`)
  - `queryKeys.assignments.staffBySeason(seasonId: number | null)`, `.trackers()`, `.tracker(id: number | null)`; `queryKeys.groups.bySeason(seasonId: number | null)`
  - `useStaffAssignments(seasonId: number | null): UseQueryResult<StaffAssignmentListItem[]>`, `useAssignmentTracker(id: number | null): UseQueryResult<AssignmentTracker>` (in `use-assignments.ts`)
  - `useSeasonGroups(seasonId: number | null): UseQueryResult<GroupListItem[]>` (in `use-groups.ts` — **Plan 6's admin group screens reuse it**)
  - `useCreateAssignment()` (`mutate({ seasonId, body })`), `useUpdateAssignment(id: number)`, `useDeleteAssignment()` (`mutate(id)`) in `use-assignment-writes.ts`
  - `formatWallTime(time: string | null): string`, `formatOrgDue(day: string | null, time: string | null): string` in `format.ts`
  - `MIME_CATEGORY_LABELS`, `targetLabel`, `trackerStatusLabel`, `configLabel` in `src/lib/assignment-labels.ts`

- [ ] **Step 1: Install the picker and repair fixtures**

Run: `cd apps/mobile && npx expo install @react-native-community/datetimepicker` (Expo picks the SDK 54 version; it ships in Expo Go, so no dev-client rebuild).

Task 1 made `dueOrgDay`/`dueOrgTime` required on `assignmentDetailSchema`.
Every mobile fixture that builds an `AssignmentDetail` needs them — find them
with `grep -rln "canManage:" apps/mobile/src/__tests__`. In Plan 1's files:
- `assignment-detail.test.tsx` `detail` (`dueAt: "2099-04-01T21:59:00.000Z"`): add `dueOrgDay: "2099-04-01", dueOrgTime: "23:59",` after `dueAt`.
- `submission-editor.test.tsx` `detailNoSubmission` (`dueAt: null`): add `dueOrgDay: null, dueOrgTime: null,`.
- Any other fixture: the Cairo wall clock of its `dueAt` (UTC+2 before 2099-04-24, UTC+3 from then until the last Thursday of October), or `null, null` with no `dueAt`.

Run: `cd apps/mobile && pnpm jest src/__tests__/assignment-detail.test.tsx src/__tests__/submission-editor.test.tsx` → PASS.

- [ ] **Step 2: Failing layout assertion.** In `app-layout.test.tsx`, replace Plan 1's `it("registers assignment/[id] as a hidden detail route", …)` with:

```tsx
  it("registers the assignment detail, edit and new routes as hidden detail routes (X7)", () => {
    const names = ["assignment/[id]/index", "assignment/[id]/edit", "assignment/new"];
    for (const name of names) expect(DETAIL_ROUTE_NAMES).toContain(name);
    // The file form must be gone: x/[id].tsx beside x/[id]/ is the ambiguity X7 forbids.
    expect(DETAIL_ROUTE_NAMES).not.toContain("assignment/[id]");

    useSessionStore.getState().setSession(makeUser("ADMIN"), scopes);
    render(<AppLayout />);

    for (const name of names) {
      expect(mockScreens.find((s) => s.name === name)?.href).toBeNull();
    }
  });
```

Run: `cd apps/mobile && pnpm jest src/__tests__/app-layout.test.tsx` → FAIL.

- [ ] **Step 3: Move the route, add the stubs, register them**

```bash
mkdir -p "apps/mobile/app/(app)/assignment/[id]"
git mv "apps/mobile/app/(app)/assignment/[id].tsx" "apps/mobile/app/(app)/assignment/[id]/index.tsx"
# One level deeper: every ../../../src/ import becomes ../../../../src/.
sed -i 's#"\.\./\.\./\.\./src/#"../../../../src/#g' "apps/mobile/app/(app)/assignment/[id]/index.tsx"
grep -n '"\.\./' "apps/mobile/app/(app)/assignment/[id]/index.tsx"   # every hit must start ../../../../src/
```

In `assignment-detail.test.tsx` and `submission-editor.test.tsx` change the
screen import to `import AssignmentDetailScreen from "../../app/(app)/assignment/[id]/index";`
(then `grep -rn 'assignment/\[id\]"' apps/mobile/src` → empty).

```tsx
// apps/mobile/app/(app)/assignment/new.tsx — Task 9 replaces the body
import { Screen, Text } from "../../../src/ui";

export default function NewAssignmentScreen() {
  return (
    <Screen edges={["top", "left", "right"]}>
      <Text variant="heading">New assignment</Text>
    </Screen>
  );
}
```

```tsx
// apps/mobile/app/(app)/assignment/[id]/edit.tsx — Task 9 replaces the body
import { useLocalSearchParams } from "expo-router";

import { Screen, Text } from "../../../../src/ui";

export default function EditAssignmentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Screen edges={["top", "left", "right"]}>
      <Text variant="heading">{`Edit assignment ${id}`}</Text>
    </Screen>
  );
}
```

In `_layout.tsx`'s `DETAIL_ROUTE_NAMES`, replace the `"assignment/[id]"`
entry with `"assignment/[id]/index"` and append `"assignment/[id]/edit"` and
`"assignment/new"` (keep every other entry — Plans 2 and 4 added theirs). No
count changes anywhere (X9).

Run: `pnpm turbo routes:generate --filter=@space/mobile`, then
`cd apps/mobile && pnpm jest src/__tests__/app-layout.test.tsx src/__tests__/role-tabs.test.tsx src/__tests__/placeholder-screens.test.tsx src/__tests__/assignment-detail.test.tsx src/__tests__/submission-editor.test.tsx` → PASS
(the disk-derived "every route file is declared" test sees the three names;
X7's sibling guard finds no `assignment/[id].tsx`; neither stub contains the
placeholder message). `pnpm turbo typecheck --filter=@space/mobile` → clean:
every existing `router.push({ pathname: "/assignment/[id]", … })` still
type-checks because the pathname did not change.

- [ ] **Step 4: Failing tests for helpers and hooks**

Append to `format.test.ts` (add `formatOrgDue, formatWallTime` to its import):

```ts
describe("formatWallTime / formatOrgDue (server org-clock values, no zone conversion — X13)", () => {
  it("renders an HH:mm wall-clock time as 12-hour text", () => {
    expect(formatWallTime("23:59")).toBe("11:59 PM");
    expect(formatWallTime("00:05")).toBe("12:05 AM");
    expect(formatWallTime("12:00")).toBe("12:00 PM");
    expect(formatWallTime(null)).toBe("—");
    expect(formatWallTime("7pm")).toBe("—");
  });

  it("labels a deadline from the server's org day and time", () => {
    expect(formatOrgDue("2099-04-01", "23:59")).toBe("Apr 1, 2099, 11:59 PM");
    expect(formatOrgDue("2099-04-01", null)).toBe("Apr 1, 2099");
    expect(formatOrgDue(null, null)).toBe("No due date");
  });
});
```

```ts
// apps/mobile/src/__tests__/assignment-labels.test.ts
import {
  MIME_CATEGORY_LABELS,
  configLabel,
  targetLabel,
  trackerStatusLabel,
} from "../lib/assignment-labels";

const groups = [
  { id: 3, name: "Group A" },
  { id: 4, name: "Group B" },
];

describe("targetLabel", () => {
  it("names the whole season, or the targeted groups by name", () => {
    expect(targetLabel(true, [], groups)).toBe("All students");
    expect(targetLabel(false, [3, 4], groups)).toBe("Group A, Group B");
  });

  it("counts groups it cannot name (not loaded yet, or a leader's narrowed list)", () => {
    expect(targetLabel(false, [3, 9], groups)).toBe("Group A + 1 more");
    expect(targetLabel(false, [3, 4], undefined)).toBe("2 groups");
    expect(targetLabel(false, [9], [])).toBe("1 group");
  });
});

describe("trackerStatusLabel", () => {
  it("covers the PENDING sentinel and every submission status", () => {
    expect(trackerStatusLabel("PENDING")).toBe("Not started");
    expect(trackerStatusLabel("DRAFT")).toBe("Draft");
    expect(trackerStatusLabel("SUBMITTED")).toBe("Submitted");
    expect(trackerStatusLabel("REVIEWED")).toBe("Reviewed");
    expect(trackerStatusLabel("RETURNED")).toBe("Returned");
  });
});

describe("configLabel", () => {
  const standard = {
    type: "STANDARD" as const, forumMinWords: null, forumAllowComments: false,
    maxFileSizeMb: null, allowedMimeCategories: [] as ("pdf" | "image")[],
  };

  it("describes a standard assignment's file settings (null size = no files, R10)", () => {
    expect(configLabel(standard)).toBe("Standard · no file uploads");
    expect(configLabel({ ...standard, maxFileSizeMb: 10 })).toBe("Standard · files up to 10 MB (any type)");
    expect(configLabel({ ...standard, maxFileSizeMb: 10, allowedMimeCategories: ["pdf", "image"] })).toBe(
      `Standard · files up to 10 MB (${MIME_CATEGORY_LABELS.pdf}, ${MIME_CATEGORY_LABELS.image})`,
    );
  });

  it("describes a forum assignment", () => {
    expect(configLabel({ ...standard, type: "FORUM", forumMinWords: 50, forumAllowComments: true })).toBe(
      "Forum · at least 50 words · peer comments on",
    );
    expect(configLabel({ ...standard, type: "FORUM" })).toBe("Forum · at least 0 words");
  });
});
```

```tsx
// apps/mobile/src/__tests__/assignment-hooks.test.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));

import { apiClient } from "../lib/api-client";
import { useAssignmentTracker, useStaffAssignments } from "../hooks/use-assignments";
import {
  useCreateAssignment,
  useDeleteAssignment,
  useUpdateAssignment,
} from "../hooks/use-assignment-writes";
import { useSeasonGroups } from "../hooks/use-groups";
import { queryKeys } from "../lib/query-keys";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;
const patch = apiClient.patch as jest.Mock;
const del = apiClient.delete as jest.Mock;

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const detail = {
  id: 41, seasonId: 7, seasonCode: "s7", seasonTitle: "Spring 2099",
  sessionId: null, sessionTitle: null, title: "Essay one", description: null,
  dueAt: null, dueOrgDay: null, dueOrgTime: null, isOverdue: false,
  isAllGroups: true, type: "STANDARD" as const, forumMinWords: null,
  forumAllowComments: false, maxFileSizeMb: null, allowedMimeCategories: [],
  groupIds: [], mySubmission: null, canManage: true,
};

const staffRow = {
  id: 41, title: "Essay one", dueAt: "2099-04-01T21:59:00.000Z", dueOrgDay: "2099-04-01",
  isOverdue: false, isAllGroups: false, targetGroupIds: [3], submissionCount: 1,
  expectedCount: 2, seasonCode: "s7",
};

beforeEach(() => {
  jest.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
});

describe("read hooks", () => {
  it("useStaffAssignments parses the staff arm, and stays idle without a season", async () => {
    get.mockResolvedValue({ data: { data: { assignments: [staffRow] } } });

    const idle = renderHook(() => useStaffAssignments(null), { wrapper });
    expect(idle.result.current.fetchStatus).toBe("idle");

    const { result } = renderHook(() => useStaffAssignments(7), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual([staffRow]));
    expect(get).toHaveBeenCalledWith("/api/v1/seasons/7/assignments");
  });

  it("useStaffAssignments refuses the student arm instead of quietly accepting it", async () => {
    get.mockResolvedValue({
      data: { data: { assignments: [{ id: 41, title: "x", dueAt: null, isOverdue: false, status: "PENDING", reviewedAt: null }] } },
    });
    const { result } = renderHook(() => useStaffAssignments(7), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("useAssignmentTracker and useSeasonGroups read their endpoints", async () => {
    get.mockImplementation((url: string) =>
      Promise.resolve({
        data: {
          data:
            url === "/api/v1/assignments/41/tracker"
              ? { assignmentId: 41, dueAt: null, isOverdue: false, submittedCount: 0, expectedCount: 0, rows: [] }
              : { groups: [] },
        },
      }),
    );
    const tracker = renderHook(() => useAssignmentTracker(41), { wrapper });
    const groups = renderHook(() => useSeasonGroups(7), { wrapper });
    await waitFor(() => expect(tracker.result.current.data?.assignmentId).toBe(41));
    await waitFor(() => expect(groups.result.current.data).toEqual([]));
    expect(get).toHaveBeenCalledWith("/api/v1/seasons/7/groups");
  });
});

describe("write hooks (X10: every mutation response is parsed)", () => {
  it("useCreateAssignment posts to the season path and seeds the detail cache", async () => {
    post.mockResolvedValue({ data: { data: detail } });
    const { result } = renderHook(() => useCreateAssignment(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ seasonId: 7, body: { title: "Essay one", isAllGroups: true } });
    });

    expect(post).toHaveBeenCalledWith("/api/v1/seasons/7/assignments", { title: "Essay one", isAllGroups: true });
    expect(client.getQueryData(queryKeys.assignments.detail(41))).toEqual(detail);
  });

  it("useUpdateAssignment rejects a malformed response instead of trusting it", async () => {
    patch.mockResolvedValue({ data: { data: { id: 41 } } });
    const { result } = renderHook(() => useUpdateAssignment(41), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync({ title: "Essay one", isAllGroups: true })).rejects.toThrow();
    });
    expect(patch).toHaveBeenCalledWith("/api/v1/assignments/41", { title: "Essay one", isAllGroups: true });
  });

  it("useDeleteAssignment parses { deleted: true } and drops the cached detail", async () => {
    client.setQueryData(queryKeys.assignments.detail(41), detail);
    del.mockResolvedValue({ data: { data: { deleted: true } } });
    const { result } = renderHook(() => useDeleteAssignment(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(41);
    });

    expect(del).toHaveBeenCalledWith("/api/v1/assignments/41");
    expect(client.getQueryData(queryKeys.assignments.detail(41))).toBeUndefined();
  });
});
```

Run: `cd apps/mobile && pnpm jest src/__tests__/format.test.ts src/__tests__/assignment-labels.test.ts src/__tests__/assignment-hooks.test.tsx` → FAIL (exports/modules missing).

- [ ] **Step 5: Implement**

`apps/mobile/src/lib/query-keys.ts` — inside Plan 1's `assignments` factory add:

```ts
    // The staff arm of the same endpoint, keyed apart from the student arm so
    // one role's cached shape can never be served to the other's parser.
    staffBySeason: (seasonId: number | null) =>
      [...queryKeys.assignments.lists(), "staff", { seasonId }] as const,
    trackers: () => [...queryKeys.assignments.all, "tracker"] as const,
    tracker: (id: number | null) => [...queryKeys.assignments.trackers(), id] as const,
```

and inside Plan 2's `groups` factory:

```ts
    bySeason: (seasonId: number | null) => [...queryKeys.groups.all, "season", { seasonId }] as const,
```

`apps/mobile/src/lib/format.ts` — append:

```ts
/**
 * e.g. "11:59 PM" — an organisation wall-clock time ("23:59") from the server.
 * Pure text arithmetic, no Date and no timezone: the server already resolved
 * the instant onto the org clock (ruling X13).
 */
export function formatWallTime(time: string | null): string {
  if (time == null) return PLACEHOLDER;
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!m) return PLACEHOLDER;
  const hour = Number(m[1]);
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:${m[2] ?? "00"} ${hour < 12 ? "AM" : "PM"}`;
}

/** e.g. "Apr 1, 2099, 11:59 PM" — a deadline from the server's `dueOrgDay`/`dueOrgTime`. */
export function formatOrgDue(day: string | null, time: string | null): string {
  if (day == null) return "No due date";
  return time == null ? formatDayKey(day) : `${formatDayKey(day)}, ${formatWallTime(time)}`;
}
```

```ts
// apps/mobile/src/lib/assignment-labels.ts
import type { AssignmentDetail, AssignmentStudentStatus, MimeCategory } from "@space/shared";

/** v1's labels, verbatim (`assignment-form.tsx:24-31`). */
export const MIME_CATEGORY_LABELS: Record<MimeCategory, string> = {
  image: "Images",
  pdf: "PDFs",
  doc: "Documents (Word, ODF)",
  audio: "Audio",
  video: "Video",
  text: "Plain text",
};

/**
 * Who an assignment is given to, in words. Names come from the season's group
 * list; ids it cannot name (list still loading, or a leader whose list the
 * server narrowed to their own groups) are counted rather than shown as ids.
 */
export function targetLabel(
  isAllGroups: boolean,
  groupIds: number[],
  groups: { id: number; name: string }[] | undefined,
): string {
  if (isAllGroups) return "All students";
  const byId = new Map((groups ?? []).map((g) => [g.id, g.name]));
  const names = groupIds.flatMap((id) => {
    const name = byId.get(id);
    return name === undefined ? [] : [name];
  });
  if (names.length === 0) return `${groupIds.length} group${groupIds.length === 1 ? "" : "s"}`;
  const unnamed = groupIds.length - names.length;
  return unnamed > 0 ? `${names.join(", ")} + ${unnamed} more` : names.join(", ");
}

/** A tracker row's state. PENDING is the wire-only "no submission row" sentinel. */
export function trackerStatusLabel(status: AssignmentStudentStatus): string {
  switch (status) {
    case "PENDING":
      return "Not started";
    case "DRAFT":
      return "Draft";
    case "SUBMITTED":
      return "Submitted";
    case "REVIEWED":
      return "Reviewed";
    case "RETURNED":
      return "Returned";
  }
}

/** The type-specific settings in one line (v1 showed them only inside the form). */
export function configLabel(
  d: Pick<
    AssignmentDetail,
    "type" | "forumMinWords" | "forumAllowComments" | "maxFileSizeMb" | "allowedMimeCategories"
  >,
): string {
  if (d.type === "FORUM") {
    const base = `Forum · at least ${d.forumMinWords ?? 0} words`;
    return d.forumAllowComments ? `${base} · peer comments on` : base;
  }
  // R10: a null size IS the "accepts no files" flag.
  if (d.maxFileSizeMb === null) return "Standard · no file uploads";
  const types =
    d.allowedMimeCategories.length === 0
      ? "any type"
      : d.allowedMimeCategories.map((c) => MIME_CATEGORY_LABELS[c]).join(", ");
  return `Standard · files up to ${d.maxFileSizeMb} MB (${types})`;
}
```

Append to `apps/mobile/src/hooks/use-assignments.ts`, merging the
`@space/shared` names into its existing import (`assignmentTrackerSchema`,
`staffAssignmentListItemSchema`, `type AssignmentTracker`,
`type StaffAssignmentListItem`):

```ts
const staffListSchema = z.array(staffAssignmentListItemSchema);

/**
 * The staff arm of GET /seasons/:id/assignments. Parsed against the staff
 * schema specifically — the same reasoning as fetchStudentAssignments: a union
 * parse would accept the wrong role's rows and hide a routing bug.
 */
export function useStaffAssignments(
  seasonId: number | null,
): UseQueryResult<StaffAssignmentListItem[]> {
  return useQuery({
    queryKey: queryKeys.assignments.staffBySeason(seasonId),
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/seasons/${seasonId}/assignments`);
      return staffListSchema.parse(res.data.data.assignments);
    },
    enabled: seasonId !== null,
  });
}

/** GET /assignments/:id/tracker — season admins and SUPER only (v1 parity 2026-10-09; was "+ leaders, own groups"). */
export function useAssignmentTracker(id: number | null): UseQueryResult<AssignmentTracker> {
  return useQuery({
    queryKey: queryKeys.assignments.tracker(id),
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/assignments/${id}/tracker`);
      return assignmentTrackerSchema.parse(res.data.data);
    },
    enabled: id !== null,
  });
}
```

Append to `apps/mobile/src/hooks/use-groups.ts` (merge `groupListItemSchema`
and `type GroupListItem` into its `@space/shared` import; add
`import { z } from "zod";` if the file lacks it):

```ts
const seasonGroupListSchema = z.array(groupListItemSchema);

/**
 * A season's groups — GET /seasons/:id/groups, which the server already
 * narrows (a leader gets only the groups they lead). The assignment form's
 * group picker and the "Assigned to" labels read it; Plan 6's admin group
 * screens reuse it rather than adding a second hook.
 */
export function useSeasonGroups(seasonId: number | null): UseQueryResult<GroupListItem[]> {
  return useQuery({
    queryKey: queryKeys.groups.bySeason(seasonId),
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/seasons/${seasonId}/groups`);
      return seasonGroupListSchema.parse(res.data.data.groups);
    },
    enabled: seasonId !== null,
  });
}
```

```ts
// apps/mobile/src/hooks/use-assignment-writes.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  assignmentDeletedResponseSchema,
  assignmentDetailSchema,
  type AssignmentWriteRequest,
} from "@space/shared";

import { apiClient } from "../lib/api-client";
import { queryKeys } from "../lib/query-keys";

/**
 * Create, edit, delete. Each parses its response with the shared schema
 * (ruling X10) — create and edit return the full AssignmentDetail, so the
 * detail cache is seeded from the response instead of refetched.
 */
export function useCreateAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ seasonId, body }: { seasonId: number; body: AssignmentWriteRequest }) => {
      const res = await apiClient.post(`/api/v1/seasons/${seasonId}/assignments`, body);
      return assignmentDetailSchema.parse(res.data.data);
    },
    onSuccess: (created) => {
      queryClient.setQueryData(queryKeys.assignments.detail(created.id), created);
      void queryClient.invalidateQueries({ queryKey: queryKeys.assignments.lists() });
    },
  });
}

/** A full replace (spec 07 R67): `body` is the whole assignment, never a diff. */
export function useUpdateAssignment(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: AssignmentWriteRequest) => {
      const res = await apiClient.patch(`/api/v1/assignments/${id}`, body);
      return assignmentDetailSchema.parse(res.data.data);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.assignments.detail(id), updated);
      void queryClient.invalidateQueries({ queryKey: queryKeys.assignments.lists() });
      // Retargeting changes who the tracker lists.
      void queryClient.invalidateQueries({ queryKey: queryKeys.assignments.tracker(id) });
    },
  });
}

export function useDeleteAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await apiClient.delete(`/api/v1/assignments/${id}`);
      return assignmentDeletedResponseSchema.parse(res.data.data);
    },
    onSuccess: (_deleted, id) => {
      queryClient.removeQueries({ queryKey: queryKeys.assignments.detail(id) });
      queryClient.removeQueries({ queryKey: queryKeys.assignments.tracker(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.assignments.lists() });
    },
  });
}
```

Run the three test files → PASS.

- [ ] **Step 6:** `pnpm turbo lint typecheck test:unit --filter=@space/mobile --filter=@space/shared` → clean.

- [ ] **Step 7: Commit** — `git add apps/mobile pnpm-lock.yaml && git commit -m "feat(mobile): assignment routes in directory form, staff hooks, org-clock labels, date picker dep"`

---

### Task 7: Staff branch of `/assignments`

**Files:**
- Modify: `apps/mobile/app/(app)/assignments.tsx`
- Modify: `apps/mobile/src/__tests__/assignments-screen.test.tsx` (delete Plan 1's "does not run the student query for staff (their branch is Plan 5's)" case — this task replaces it)
- Test: `apps/mobile/src/__tests__/assignments-staff-screen.test.tsx`

**Interfaces:**
- Consumes: `useCurrentSeasonId` (Plan 4), `useStaffAssignments`, `useSeasonGroups`, `targetLabel`, `formatDayKey` (Task 6); Plan 1's student branch, unchanged.
- Produces: the staff list; navigation to `/assignment/[id]` and `/assignment/new`.

- [ ] **Step 1: Failing test**

```tsx
// apps/mobile/src/__tests__/assignments-staff-screen.test.tsx
import { fireEvent, screen } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn() } }));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";

import AssignmentsScreen from "../../app/(app)/assignments";

const get = apiClient.get as jest.Mock;

const season = {
  id: 7, code: "s7", title: "Spring 2099", program: "TEST", year: 2099, status: "ACTIVE" as const,
  startDate: "2099-01-01T00:00:00.000Z", endDate: "2099-12-31T00:00:00.000Z",
};
const group = (id: number, name: string) => ({
  id, name, description: null, studentCount: 2, leaderNames: [],
  seasonId: 7, seasonCode: "s7", seasonTitle: "Spring 2099",
});
const row = (over: Record<string, unknown> = {}) => ({
  id: 41, title: "Essay one", dueAt: "2099-04-01T21:59:00.000Z", dueOrgDay: "2099-04-01",
  isOverdue: false, isAllGroups: false, targetGroupIds: [3], submissionCount: 1,
  expectedCount: 2, seasonCode: "s7", ...over,
});

function serve(assignments: unknown[] | Error) {
  get.mockImplementation((url: string) => {
    if (url === "/api/v1/seasons") return Promise.resolve({ data: { data: { seasons: [season] } } });
    if (url === "/api/v1/seasons/7/groups") {
      return Promise.resolve({ data: { data: { groups: [group(3, "Group A"), group(4, "Group B")] } } });
    }
    if (url === "/api/v1/seasons/7/assignments") {
      return assignments instanceof Error
        ? Promise.reject(assignments)
        : Promise.resolve({ data: { data: { assignments } } });
    }
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("AssignmentsScreen (staff)", () => {
  it("lists the current season's assignments with the org due day, targets and counts", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    serve([
      row(),
      row({ id: 42, title: "Everyone", dueAt: null, dueOrgDay: null, isAllGroups: true, targetGroupIds: [], submissionCount: 0, expectedCount: 3 }),
      row({ id: 43, title: "Late one", isOverdue: true, targetGroupIds: [3, 4], submissionCount: 2, expectedCount: 4 }),
    ]);

    renderWithProviders(<AssignmentsScreen />);

    expect(await screen.findByText("Essay one")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/seasons/7/assignments");
    // Names arrive with the groups query; until then the label counts groups.
    expect(await screen.findByText("Group A · 1/2 submitted")).toBeTruthy();
    expect(screen.getByText("All students · 0/3 submitted")).toBeTruthy();
    expect(screen.getByText("Group A, Group B · 2/4 submitted")).toBeTruthy();
    expect(screen.getByText("No due date")).toBeTruthy();
    // The flag decides "Overdue" (C4); the day is the server's org day (X13).
    expect(screen.getByText("Due Apr 1, 2099 · Overdue")).toBeTruthy();
  });

  it("opens an assignment, and offers New assignment to a season admin", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    serve([row()]);
    renderWithProviders(<AssignmentsScreen />);

    fireEvent.press(await screen.findByText("Essay one"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/assignment/[id]", params: { id: "41" } });

    fireEvent.press(screen.getByText("New assignment"));
    expect(mockPush).toHaveBeenCalledWith("/assignment/new");
  });

  it("gives a MENTOR the list read-only", async () => {
    useSessionStore.setState(makeSession("MENTOR"));
    serve([row()]);
    renderWithProviders(<AssignmentsScreen />);
    expect(await screen.findByText("Essay one")).toBeTruthy();
    expect(screen.queryByText("New assignment")).toBeNull();
  });

  it("shows an empty state, and an error state with retry", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    serve([]);
    const empty = renderWithProviders(<AssignmentsScreen />);
    expect(await screen.findByText("No assignments yet")).toBeTruthy();
    empty.unmount();

    serve(new Error("network down"));
    renderWithProviders(<AssignmentsScreen />);
    expect(await screen.findByText("Couldn't load assignments.")).toBeTruthy();
  });

  it("says so when there is no season, without asking for assignments", async () => {
    useSessionStore.setState(makeSession("ADMIN"));
    get.mockResolvedValue({ data: { data: { seasons: [] } } });
    renderWithProviders(<AssignmentsScreen />);
    expect(await screen.findByText("No season")).toBeTruthy();
    expect(get).toHaveBeenCalledTimes(1); // only /api/v1/seasons
  });
});
```

Delete the staff case from Plan 1's `assignments-screen.test.tsx` (its other
four student cases stay). Run:
`cd apps/mobile && pnpm jest src/__tests__/assignments-staff-screen.test.tsx` → FAIL.

- [ ] **Step 2: Implement.** Replace `apps/mobile/app/(app)/assignments.tsx` (the student branch is Plan 1's, unchanged):

```tsx
import type { ReactNode } from "react";
import { useRouter } from "expo-router";
import { Pressable } from "react-native";
import type { StaffAssignmentListItem, StudentAssignmentListItem } from "@space/shared";

import { useStaffAssignments, useStudentAssignments } from "../../src/hooks/use-assignments";
import { useSeasonGroups } from "../../src/hooks/use-groups";
import { useCurrentSeasonId } from "../../src/hooks/use-seasons";
import { targetLabel } from "../../src/lib/assignment-labels";
import { formatDayKey, formatDueDate } from "../../src/lib/format";
import { useSessionStore } from "../../src/store/session";
import { useTheme } from "../../src/theme";
import { Button, Card, EmptyState, ErrorState, LoadingState, Screen, Text } from "../../src/ui";

function statusLabel(item: StudentAssignmentListItem): string {
  if (item.status === "REVIEWED") return "Reviewed";
  if (item.status === "RETURNED") return "Returned";
  if (item.status === "SUBMITTED") return "Submitted";
  if (item.status === "DRAFT") return "Draft";
  // Only PENDING (nothing started) reaches here. Overdue only ever describes
  // work not yet handed in, and the flag comes from the server (ruling C4) —
  // a device in another timezone must agree with the leader's screen.
  return item.isOverdue ? "Overdue" : "Not started";
}

function AssignmentRow({ item }: { item: StudentAssignmentListItem }) {
  const theme = useTheme();
  const router = useRouter();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: "/assignment/[id]", params: { id: String(item.id) } })}
    >
      <Card style={{ marginBottom: theme.spacing.sm }}>
        <Text variant="heading">{item.title}</Text>
        <Text variant="label" color={theme.colors.neutral[600]}>
          {`Due ${formatDueDate(item.dueAt)} · ${statusLabel(item)}`}
        </Text>
      </Card>
    </Pressable>
  );
}

function StaffAssignmentRow({
  item,
  groups,
}: {
  item: StaffAssignmentListItem;
  groups: { id: number; name: string }[] | undefined;
}) {
  const theme = useTheme();
  const router = useRouter();
  // The org-calendar day from the server (X13), never dueAt read in the device zone.
  const due = item.dueOrgDay === null ? "No due date" : `Due ${formatDayKey(item.dueOrgDay)}`;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: "/assignment/[id]", params: { id: String(item.id) } })}
    >
      <Card style={{ marginBottom: theme.spacing.sm }}>
        <Text variant="heading">{item.title}</Text>
        <Text variant="label" color={theme.colors.neutral[600]}>
          {item.isOverdue ? `${due} · Overdue` : due}
        </Text>
        <Text variant="caption" color={theme.colors.neutral[600]}>
          {`${targetLabel(item.isAllGroups, item.targetGroupIds, groups)} · ${item.submissionCount}/${item.expectedCount} submitted`}
        </Text>
      </Card>
    </Pressable>
  );
}

/**
 * Staff branch (v1 /admin/season/[code]/assignments). One list, for
 * useCurrentSeasonId's season (ruling X8) — v1's /admin/assignments was only a
 * redirect to it (spec 07 §9). SUPER and ADMIN author (§10 item 12 admits
 * SUPER, whom v1's ADMIN-only page refused); LEADER and MENTOR, who have no
 * nav entry (R39) but can arrive by link, read. The server gates every write.
 */
function StaffAssignments({ canCreate }: { canCreate: boolean }) {
  const theme = useTheme();
  const router = useRouter();
  const current = useCurrentSeasonId();
  const list = useStaffAssignments(current.seasonId);
  // Only for the "Assigned to" names. A failure costs the names — the label
  // falls back to a group count — so it never blocks the list.
  const groups = useSeasonGroups(current.seasonId);

  const handleRefresh = () => {
    if (current.seasonId !== null) {
      void list.refetch();
      void groups.refetch();
    } else {
      current.refetch();
    }
  };

  let body: ReactNode;
  if (current.isPending) {
    body = <LoadingState />;
  } else if (current.isError) {
    body = <ErrorState message="Couldn't load your seasons." onRetry={current.refetch} />;
  } else if (current.seasonId === null) {
    body = <EmptyState title="No season" message="There's no season to show assignments for." />;
  } else if (list.isPending) {
    body = <LoadingState />;
  } else if (list.isError) {
    body = <ErrorState message="Couldn't load assignments." onRetry={() => void list.refetch()} />;
  } else if (list.data.length === 0) {
    body = (
      <EmptyState
        title="No assignments yet"
        message={canCreate ? "Create the season's first assignment." : "This season doesn't have any assignments yet."}
      />
    );
  } else {
    body = list.data.map((item) => <StaffAssignmentRow key={item.id} item={item} groups={groups.data} />);
  }

  return (
    <Screen edges={["top", "left", "right"]} scroll onRefresh={handleRefresh} refreshing={list.isRefetching}>
      {canCreate && current.seasonId !== null ? (
        <Button
          title="New assignment"
          onPress={() => router.push("/assignment/new")}
          style={{ marginBottom: theme.spacing.md }}
        />
      ) : null}
      {body}
    </Screen>
  );
}

export default function AssignmentsScreen() {
  const role = useSessionStore((s) => s.user?.role ?? null);
  const seasonId = useSessionStore((s) => s.scopes?.activeSeasonId ?? null);
  // D1: one route per destination; the role picks the branch. The student
  // query is gated on role as well as season so staff never parse the
  // student arm.
  const isStudent = role === "STUDENT";
  const { data, isPending, isError, refetch, isRefetching } = useStudentAssignments(
    isStudent ? seasonId : null,
  );

  const handleRefresh = () => {
    if (isStudent && seasonId !== null) void refetch();
  };

  if (!isStudent) {
    return <StaffAssignments canCreate={role === "ADMIN" || role === "SUPER"} />;
  }

  return (
    <Screen edges={["top", "left", "right"]} onRefresh={handleRefresh} refreshing={isRefetching}>
      {seasonId === null ? (
        <EmptyState
          title="No active season"
          message="You don't have an active season right now, so there are no assignments to show."
        />
      ) : isPending ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState message="Couldn't load assignments. Check your connection and try again." onRetry={refetch} />
      ) : data.length === 0 ? (
        <EmptyState title="No assignments" message="This season doesn't have any assignments yet." />
      ) : (
        <>
          {data.map((item) => (
            <AssignmentRow key={item.id} item={item} />
          ))}
        </>
      )}
    </Screen>
  );
}
```

(If Plan 1 landed a different student body than the one quoted, keep Plan 1's
student branch verbatim and change only: the imports, the two new components,
and the `if (!isStudent)` return.)

> **v1 parity 2026-10-09:** the quoted student `statusLabel`/`AssignmentRow` must follow v1 `src/app/student/assignments/page.tsx:17-41,98-104` (spec 07 R48), as Plan 1 Task 1 Step 5 now says: a not-started overdue row shows "Due <org day, MMM d>" in the error tone instead of "Overdue", and an upcoming row's due line ends " · in N days", both from server-derived values. v2 code: `apps/mobile/app/(app)/assignments.tsx:16-24`. The staff branch below is unchanged by this row.

- [ ] **Step 3:** Run `cd apps/mobile && pnpm jest src/__tests__/assignments-staff-screen.test.tsx src/__tests__/assignments-screen.test.tsx` → PASS; `pnpm turbo lint typecheck test:unit --filter=@space/mobile` → clean.

- [ ] **Step 4: Commit** — `git add apps/mobile && git commit -m "feat(mobile): staff assignments list for the current season"`

---
### Task 8: Staff branch of `assignment/[id]` — settings, edit/delete, submission tracker

**Files:**
- Create: `apps/mobile/src/components/assignment-staff-panel.tsx`
- Modify: `apps/mobile/app/(app)/assignment/[id]/index.tsx` (header label from the org fields; role branch)
- Test: `apps/mobile/src/__tests__/assignment-staff-detail.test.tsx`

**Interfaces:**
- Consumes: `useAssignmentDetail` (Plan 1), `useAssignmentTracker`, `useSeasonGroups`, `useDeleteAssignment`, `targetLabel`, `configLabel`, `trackerStatusLabel`, `formatOrgDue` (Task 6), `apiErrorMessage` (Plan 4); Plan 2's `/submission/[publicId]` route.
- Produces: `AssignmentStaffPanel({ detail })`; navigation to `/assignment/[id]/edit` and `/submission/[publicId]`.

- [ ] **Step 1: Failing test**

```tsx
// apps/mobile/src/__tests__/assignment-staff-detail.test.tsx
import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn(), delete: jest.fn() } }));
const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "55" }),
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn() }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";

import AssignmentDetailScreen from "../../app/(app)/assignment/[id]/index";

const get = apiClient.get as jest.Mock;
const del = apiClient.delete as jest.Mock;

const detail = {
  id: 55, seasonId: 7, seasonCode: "s7", seasonTitle: "Spring 2099",
  sessionId: 12, sessionTitle: "Week 4", title: "Essay one",
  description: "Write about the thing.", dueAt: "2099-04-01T21:59:00.000Z",
  dueOrgDay: "2099-04-01", dueOrgTime: "23:59", isOverdue: false, isAllGroups: false,
  type: "STANDARD" as const, forumMinWords: null, forumAllowComments: false,
  maxFileSizeMb: 10, allowedMimeCategories: ["pdf" as const], groupIds: [3],
  mySubmission: null, canManage: true,
};

const tracker = {
  assignmentId: 55, dueAt: detail.dueAt, isOverdue: false, submittedCount: 1, expectedCount: 2,
  rows: [
    {
      studentUserId: 9, name: "Sara Student", email: "sara@jpc.test", groupId: 3, groupName: "Group A",
      status: "SUBMITTED" as const, isLate: true, submittedAt: "2099-04-02T10:00:00.000Z",
      reviewedAt: null, submissionPublicId: "abc123defg",
    },
    {
      studentUserId: 10, name: null, email: "noname@jpc.test", groupId: 3, groupName: "Group A",
      status: "PENDING" as const, isLate: false, submittedAt: null, reviewedAt: null,
      submissionPublicId: null,
    },
  ],
};

const groups = [
  { id: 3, name: "Group A", description: null, studentCount: 2, leaderNames: [], seasonId: 7, seasonCode: "s7", seasonTitle: "Spring 2099" },
];

const ok = (data: unknown) => Promise.resolve({ data: { data } });

function serve(over: Partial<typeof detail> = {}) {
  get.mockImplementation((url: string) => {
    if (url === "/api/v1/assignments/55") return ok({ ...detail, ...over });
    if (url === "/api/v1/assignments/55/tracker") return ok(tracker);
    if (url === "/api/v1/seasons/7/groups") return ok({ groups });
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("AssignmentDetailScreen (staff)", () => {
  it("shows an admin the settings, the org-clock deadline and the tracker — no submission editor", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    serve();
    renderWithProviders(<AssignmentDetailScreen />);

    expect(await screen.findByText("Essay one")).toBeTruthy();
    expect(screen.getByText("Due Apr 1, 2099, 11:59 PM")).toBeTruthy();
    expect(await screen.findByText("Assigned to: Group A")).toBeTruthy();
    expect(screen.getByText("Standard · files up to 10 MB (PDFs)")).toBeTruthy();
    expect(screen.getByText("Linked session: Week 4")).toBeTruthy();

    // One definition of "submitted" (spec §10 item 8): the server's count.
    expect(await screen.findByText("1 of 2 submitted")).toBeTruthy();
    expect(screen.getByText("Sara Student")).toBeTruthy();
    expect(screen.getByText("Group A · Submitted · Late")).toBeTruthy();
    expect(screen.getByText("noname@jpc.test")).toBeTruthy();
    expect(screen.getByText("Group A · Not started")).toBeTruthy();
    expect(screen.queryByText("Your submission")).toBeNull();
    expect(screen.queryByText("Start working")).toBeNull();
  });

  it("opens a started submission for review; a not-started row opens nothing", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    serve();
    renderWithProviders(<AssignmentDetailScreen />);

    fireEvent.press(await screen.findByText("noname@jpc.test"));
    expect(mockPush).not.toHaveBeenCalled();

    fireEvent.press(screen.getByText("Sara Student"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/submission/[publicId]", params: { publicId: "abc123defg" } });
  });

  it("edits, and deletes only on a second, confirming press", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    serve();
    del.mockResolvedValue({ data: { data: { deleted: true } } });
    renderWithProviders(<AssignmentDetailScreen />);

    fireEvent.press(await screen.findByText("Edit"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/assignment/[id]/edit", params: { id: "55" } });

    fireEvent.press(screen.getByText("Delete assignment"));
    expect(del).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText("Really delete?"));
    await waitFor(() => expect(del).toHaveBeenCalledWith("/api/v1/assignments/55"));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/assignments"));
  });

  it("shows the server's refusal when students have started it (409 has_submissions)", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    serve();
    del.mockRejectedValue(
      Object.assign(new Error("409"), {
        isAxiosError: true,
        response: {
          status: 409,
          data: { error: { code: "has_submissions", message: "Students have already started this assignment, so it can't be deleted." } },
        },
      }),
    );
    renderWithProviders(<AssignmentDetailScreen />);

    fireEvent.press(await screen.findByText("Delete assignment"));
    fireEvent.press(screen.getByText("Really delete?"));
    expect(
      await screen.findByText("Students have already started this assignment, so it can't be deleted."),
    ).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByText("Delete assignment")).toBeTruthy(); // disarmed again
  });

  // v1 parity 2026-10-09 (was "gives a LEADER the tracker"): v1 shows it to season admins and SUPER only.
  it("gives a LEADER no tracker and no edit or delete (canManage is false)", async () => {
    useSessionStore.setState(makeSession("LEADER", { groupLeaderIds: [3] }));
    serve({ canManage: false });
    renderWithProviders(<AssignmentDetailScreen />);

    expect(await screen.findByText("Assigned to: Group A")).toBeTruthy();
    expect(get).not.toHaveBeenCalledWith("/api/v1/assignments/55/tracker");
    expect(screen.queryByText("1 of 2 submitted")).toBeNull();
    expect(screen.queryByText("Edit")).toBeNull();
    expect(screen.queryByText("Delete assignment")).toBeNull();
  });

  it("never asks a MENTOR's device for the tracker, which the server refuses them", async () => {
    useSessionStore.setState(makeSession("MENTOR"));
    serve({ canManage: false });
    renderWithProviders(<AssignmentDetailScreen />);

    expect(await screen.findByText("Assigned to: Group A")).toBeTruthy();
    expect(get).not.toHaveBeenCalledWith("/api/v1/assignments/55/tracker");
    expect(screen.queryByText("1 of 2 submitted")).toBeNull();
  });
});
```

Run: `cd apps/mobile && pnpm jest src/__tests__/assignment-staff-detail.test.tsx` → FAIL (the staff branch renders Plan 1's "Start working").

- [ ] **Step 2: The panel**

```tsx
// apps/mobile/src/components/assignment-staff-panel.tsx
import { useState } from "react";
import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import type { AssignmentDetail, AssignmentTrackerRow, UserRole } from "@space/shared";

import { useAssignmentTracker } from "../hooks/use-assignments";
import { useDeleteAssignment } from "../hooks/use-assignment-writes";
import { useSeasonGroups } from "../hooks/use-groups";
import { apiErrorMessage } from "../lib/api-error";
import { configLabel, targetLabel, trackerStatusLabel } from "../lib/assignment-labels";
import { useSessionStore } from "../store/session";
import { useTheme } from "../theme";
import { Button, Card, ErrorState, LoadingState, Text } from "../ui";

/**
 * Roles GET /assignments/:id/tracker answers: SUPER and admins of the
 * assignment's season only, as v1 (assignments/[id]/page.tsx:27,30 —
 * requireRole ADMIN/SUPER + canEditSeason). It refuses LEADER, MENTOR and
 * STUDENT, so the screen does not ask on their behalf. This decides only
 * whether to ask; the server is the gate (C8).
 * v1 parity 2026-10-09: was "LEADERs too, narrowed to their own groups".
 */
const TRACKER_ROLES: ReadonlySet<UserRole> = new Set<UserRole>(["SUPER", "ADMIN"]);

function ManageActions({ detail }: { detail: AssignmentDetail }) {
  const theme = useTheme();
  const router = useRouter();
  const remove = useDeleteAssignment();
  // RN has no window.confirm; the first press arms, the second deletes.
  const [armed, setArmed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const onDelete = () => {
    if (!armed) {
      setArmed(true);
      return;
    }
    setMessage(null);
    remove.mutate(detail.id, {
      onSuccess: () => router.replace("/assignments"),
      onError: (err) => {
        setArmed(false);
        setMessage(apiErrorMessage(err, "Couldn't delete the assignment."));
      },
    });
  };

  return (
    <View style={{ marginTop: theme.spacing.md, gap: theme.spacing.sm }}>
      <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
        <Button
          title="Edit"
          variant="secondary"
          onPress={() => router.push({ pathname: "/assignment/[id]/edit", params: { id: String(detail.id) } })}
        />
        <Button
          title={armed ? "Really delete?" : "Delete assignment"}
          variant="ghost"
          onPress={onDelete}
          loading={remove.isPending}
        />
      </View>
      {message ? (
        <Text variant="caption" color={theme.colors.error[600]}>
          {message}
        </Text>
      ) : null}
    </View>
  );
}

function TrackerRowView({ row }: { row: AssignmentTrackerRow }) {
  const theme = useTheme();
  const router = useRouter();
  const publicId = row.submissionPublicId;
  const line = `${row.groupName ? `${row.groupName} · ` : ""}${trackerStatusLabel(row.status)}${row.isLate ? " · Late" : ""}`;

  const content = (
    <View style={{ paddingVertical: theme.spacing.xs }}>
      <Text variant="body">{row.name ?? row.email}</Text>
      <Text variant="caption" color={theme.colors.neutral[600]}>
        {line}
      </Text>
    </View>
  );

  // The handoff into the review screen (v1 submission-tracker.tsx:60-67).
  // Nothing to open until a submission row exists.
  if (publicId === null) return content;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: "/submission/[publicId]", params: { publicId } })}
    >
      {content}
    </Pressable>
  );
}

function TrackerCard({ assignmentId }: { assignmentId: number }) {
  const theme = useTheme();
  const tracker = useAssignmentTracker(assignmentId);

  return (
    <Card style={{ marginTop: theme.spacing.md }}>
      <Text variant="heading">Submissions</Text>
      {tracker.isPending ? (
        <LoadingState />
      ) : tracker.isError ? (
        <ErrorState message="Couldn't load the submission tracker." onRetry={() => void tracker.refetch()} />
      ) : (
        <>
          <Text variant="label" color={theme.colors.neutral[600]}>
            {`${tracker.data.submittedCount} of ${tracker.data.expectedCount} submitted`}
          </Text>
          {tracker.data.rows.length === 0 ? (
            <Text variant="body" color={theme.colors.neutral[600]}>
              No students are targeted by this assignment.
            </Text>
          ) : (
            tracker.data.rows.map((row) => <TrackerRowView key={row.studentUserId} row={row} />)
          )}
        </>
      )}
    </Card>
  );
}

/**
 * The staff half of assignment/[id] (v1 /admin/season/[code]/assignments/[id]).
 * Edit and delete appear when the server says `canManage` (C4 — v1 rendered
 * no delete control at all, R80; v2's DELETE is designed, Plan 5 Task 5).
 */
export function AssignmentStaffPanel({ detail }: { detail: AssignmentDetail }) {
  const theme = useTheme();
  const role = useSessionStore((s) => s.user?.role ?? null);
  // Names for "Assigned to" — not needed when the whole season is targeted.
  const groups = useSeasonGroups(detail.isAllGroups ? null : detail.seasonId);

  return (
    <>
      <Card style={{ marginTop: theme.spacing.md, gap: theme.spacing.xs }}>
        <Text variant="label">
          {`Assigned to: ${targetLabel(detail.isAllGroups, detail.groupIds ?? [], groups.data)}`}
        </Text>
        <Text variant="label">{configLabel(detail)}</Text>
        {detail.sessionTitle ? <Text variant="label">{`Linked session: ${detail.sessionTitle}`}</Text> : null}
      </Card>
      {detail.canManage ? <ManageActions detail={detail} /> : null}
      {role !== null && TRACKER_ROLES.has(role) && detail.canManage ? <TrackerCard assignmentId={detail.id} /> : null}
    </>
  );
}
```

> **v1 parity 2026-10-09:** the server must enforce the same gate (C8): `GET /assignments/:id/tracker` answers only `isAdminOfSeason` (SUPER passes) and returns 403 to LEADER/MENTOR — v2 `apps/backend/src/routes/assignments.ts:108-111` currently admits leaders via `staffScopeForSeason` narrowed to their groups (pre-plan commit 7728472). Match v1 `src/lib/assignments-query.ts:127-129` and `src/app/admin/season/[code]/assignments/[id]/page.tsx:27,30`; add an integration test that a LEADER gets 403.

- [ ] **Step 3: Wire it into the detail screen.** In `apps/mobile/app/(app)/assignment/[id]/index.tsx`:
replace the `formatDueDate` import with
`import { formatOrgDue } from "../../../../src/lib/format";`, and add

```tsx
import { AssignmentStaffPanel } from "../../../../src/components/assignment-staff-panel";
import { useSessionStore } from "../../../../src/store/session";
```

Replace the default export (Plan 1's `SubmissionSection`, `SubmissionEditor`
and `submissionStatusLine` stay exactly as they are):

```tsx
export default function AssignmentDetailScreen() {
  const theme = useTheme();
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const parsed = Number(rawId);
  const id = Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  // D1: one route, the role picks the branch. Students get Plan 1's
  // submission editor; staff get the authoring panel and tracker.
  const isStudent = useSessionStore((s) => s.user?.role === "STUDENT");

  const { data, isPending, isError, refetch } = useAssignmentDetail(id);

  return (
    <Screen edges={["top", "left", "right"]} scroll>
      {id === null ? (
        <EmptyState title="Not found" message="That assignment link isn't valid." />
      ) : isPending ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState message="Couldn't load this assignment." onRetry={refetch} />
      ) : (
        <>
          <Text variant="title">{data.title}</Text>
          <Text variant="label" color={theme.colors.neutral[600]}>
            {/* The server's org-clock day and time (C2/X13), never dueAt in the device's zone. */}
            {`${data.dueOrgDay === null ? "No due date" : `Due ${formatOrgDue(data.dueOrgDay, data.dueOrgTime)}`}${
              data.isOverdue ? " · Overdue" : ""
            }`}
          </Text>
          {data.description ? (
            <Text variant="body" style={{ marginTop: theme.spacing.sm }}>
              {data.description}
            </Text>
          ) : null}
          {isStudent ? <SubmissionSection detail={data} /> : <AssignmentStaffPanel detail={data} />}
        </>
      )}
    </Screen>
  );
}
```

- [ ] **Step 4:** Run `cd apps/mobile && pnpm jest src/__tests__/assignment-staff-detail.test.tsx src/__tests__/assignment-detail.test.tsx src/__tests__/submission-editor.test.tsx` → PASS (Plan 1's student cases are untouched by the staff branch); `pnpm turbo lint typecheck test:unit --filter=@space/mobile` → clean.

- [ ] **Step 5: Commit** — `git add apps/mobile && git commit -m "feat(mobile): staff assignment detail — settings, edit/delete, submission tracker"`

---

### Task 9: The assignment form — `assignment/new` and `assignment/[id]/edit`

The form ports `jpc-space/src/components/assignments/assignment-form.tsx`
field for field, with three deliberate changes: the due date is picked as an
**organisation day + time** and sent as `dueDay`/`dueTime` (C2 — v1's
`setHours` in the browser zone is R45); the request is validated with the
**shared** schema before it is sent, so client and server can no longer
disagree (R18); and the description is plain text (see Open decisions).

**Files:**
- Create: `apps/mobile/src/components/due-date-field.tsx`, `apps/mobile/src/components/assignment-form.tsx`
- Modify: `apps/mobile/app/(app)/assignment/new.tsx`, `apps/mobile/app/(app)/assignment/[id]/edit.tsx` (replace the Task 6 stubs)
- Test: `apps/mobile/src/__tests__/assignment-form-screens.test.tsx`

**Interfaces:**
- Consumes: `assignmentWriteRequestSchema`, `AssignmentWriteBody`, `AssignmentDetail`, `AssignmentTrackerRow`, `GroupListItem`, `SessionListItem`, `MimeCategory` (shared); `useCurrentSeasonId`, `useSeasonSessions`, `useSeasonGroups`, `useAssignmentDetail`, `useAssignmentTracker`, `useCreateAssignment`, `useUpdateAssignment`, `apiErrorMessage`, `formatOrgDue`, `formatDayKey`, `MIME_CATEGORY_LABELS`.
- Produces: `DueDateField`, `AssignmentForm`, `AssignmentFormValues`, `NEW_ASSIGNMENT_VALUES`, `valuesFromDetail`, `toAssignmentBody`, `orphanedWorkCount`.

- [ ] **Step 1: Failing test**

```tsx
// apps/mobile/src/__tests__/assignment-form-screens.test.tsx
import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
}));
const mockReplace = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockReplace, back: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock("@react-native-community/datetimepicker", () => {
  const { Pressable, Text } = require("react-native");
  // Stands in for the native picker. A press "picks" a value built from LOCAL
  // fields — what the real picker hands back — so these assertions mean the
  // same thing in every device timezone (the closing gate runs this file
  // under two extreme TZs to prove it).
  return {
    __esModule: true,
    default: ({
      mode,
      onChange,
    }: {
      mode: "date" | "time";
      onChange: (event: { type: string }, date?: Date) => void;
    }) => (
      <Pressable
        accessibilityLabel={`Choose ${mode}`}
        onPress={() =>
          onChange({ type: "set" }, mode === "date" ? new Date(2099, 3, 1, 9, 0) : new Date(2099, 0, 1, 18, 30))
        }
      >
        <Text>{`native ${mode} picker`}</Text>
      </Pressable>
    ),
  };
});

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";

import EditAssignmentScreen from "../../app/(app)/assignment/[id]/edit";
import NewAssignmentScreen from "../../app/(app)/assignment/new";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;
const patch = apiClient.patch as jest.Mock;

const season = {
  id: 7, code: "s7", title: "Spring 2099", program: "TEST", year: 2099, status: "ACTIVE" as const,
  startDate: "2099-01-01T00:00:00.000Z", endDate: "2099-12-31T00:00:00.000Z",
};
const group = (id: number, name: string) => ({
  id, name, description: null, studentCount: 2, leaderNames: [],
  seasonId: 7, seasonCode: "s7", seasonTitle: "Spring 2099",
});
const sessionRow = {
  id: 12, title: "Week 4", startsAt: "2099-03-01T18:00:00.000Z", dayKey: "2099-03-01",
  durationMinutes: 60, location: null, recurrenceGroupId: null, attendanceMarked: false,
  seasonId: 7, seasonCode: "s7", seasonTitle: "Spring 2099",
  checkInToken: null, checkInOpenAt: null, checkInClosedAt: null,
};
const detail = {
  id: 55, seasonId: 7, seasonCode: "s7", seasonTitle: "Spring 2099",
  sessionId: null, sessionTitle: null, title: "Essay one", description: "Write about the thing.",
  dueAt: "2099-04-01T21:59:00.000Z", dueOrgDay: "2099-04-01", dueOrgTime: "23:59",
  isOverdue: false, isAllGroups: false, type: "STANDARD" as const, forumMinWords: null,
  forumAllowComments: false, maxFileSizeMb: 10, allowedMimeCategories: ["pdf" as const],
  groupIds: [3], mySubmission: null, canManage: true,
};
const tracker = {
  assignmentId: 55, dueAt: detail.dueAt, isOverdue: false, submittedCount: 1, expectedCount: 2,
  rows: [
    {
      studentUserId: 9, name: "Sara Student", email: "sara@jpc.test", groupId: 3, groupName: "Group A",
      status: "SUBMITTED" as const, isLate: false, submittedAt: "2099-03-30T10:00:00.000Z",
      reviewedAt: null, submissionPublicId: "abc123defg",
    },
    {
      studentUserId: 10, name: "Nadia", email: "nadia@jpc.test", groupId: 3, groupName: "Group A",
      status: "PENDING" as const, isLate: false, submittedAt: null, reviewedAt: null,
      submissionPublicId: null,
    },
  ],
};

const ok = (data: unknown) => Promise.resolve({ data: { data } });

function serve(extra: Record<string, unknown> = {}) {
  const table: Record<string, unknown> = {
    "/api/v1/seasons": { seasons: [season] },
    "/api/v1/seasons/7/groups": { groups: [group(3, "Group A"), group(4, "Group B")] },
    "/api/v1/seasons/7/sessions": { sessions: [sessionRow] },
    ...extra,
  };
  get.mockImplementation((url: string) =>
    url in table ? ok(table[url]) : Promise.reject(new Error(`unexpected GET ${url}`)),
  );
}

const STANDARD_DEFAULTS = {
  description: null, dueDay: null, dueTime: null, sessionId: null, type: "STANDARD",
  forumMinWords: null, forumAllowComments: false, maxFileSizeMb: null,
  allowedMimeCategories: [], isAllGroups: true, groupIds: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("NewAssignmentScreen", () => {
  beforeEach(() => useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] })));

  it("creates a group-targeted assignment due at an org-clock time, then opens it", async () => {
    serve();
    post.mockResolvedValue({ data: { data: { ...detail, id: 77 } } });
    renderWithProviders(<NewAssignmentScreen />);

    fireEvent.changeText(await screen.findByLabelText("Title"), "Week 4 reflection");
    expect(screen.getByText("Due: No due date")).toBeTruthy();
    fireEvent.press(screen.getByText("Pick due date"));
    fireEvent.press(screen.getByLabelText("Choose date"));
    expect(screen.getByText("Due: Apr 1, 2099, 11:59 PM")).toBeTruthy(); // R19's 23:59 default
    fireEvent.press(screen.getByText("Pick due time"));
    fireEvent.press(screen.getByLabelText("Choose time"));
    expect(screen.getByText("Due: Apr 1, 2099, 6:30 PM")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Specific groups"));
    fireEvent.press(screen.getByLabelText("Group B"));
    fireEvent.press(screen.getByText("Create assignment"));

    // The device composes no instant: it sends the day and time it was given.
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/seasons/7/assignments", {
        ...STANDARD_DEFAULTS,
        title: "Week 4 reflection",
        dueDay: "2099-04-01",
        dueTime: "18:30",
        isAllGroups: false,
        groupIds: [4],
      }),
    );
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith({ pathname: "/assignment/[id]", params: { id: "77" } }),
    );
  });

  it("FORUM hides file settings and sends forum config (R14, R21, R25)", async () => {
    serve();
    post.mockResolvedValue({ data: { data: { ...detail, id: 78 } } });
    renderWithProviders(<NewAssignmentScreen />);

    fireEvent.changeText(await screen.findByLabelText("Title"), "Discuss");
    expect(screen.getByLabelText("Accept file uploads")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Forum"));
    expect(screen.queryByLabelText("Accept file uploads")).toBeNull();
    expect(screen.getByDisplayValue("50")).toBeTruthy(); // R21 default
    fireEvent(screen.getByLabelText("Allow peer comments"), "valueChange", true);
    fireEvent.press(screen.getByText("Create assignment"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/seasons/7/assignments", {
        ...STANDARD_DEFAULTS,
        title: "Discuss",
        type: "FORUM",
        forumMinWords: 50,
        forumAllowComments: true,
      }),
    );
  });

  it("accepts files at the 10 MB default with the ticked types, and links a session (R10, R22)", async () => {
    serve();
    post.mockResolvedValue({ data: { data: { ...detail, id: 79 } } });
    renderWithProviders(<NewAssignmentScreen />);

    fireEvent.changeText(await screen.findByLabelText("Title"), "Upload it");
    fireEvent(screen.getByLabelText("Accept file uploads"), "valueChange", true);
    expect(screen.getByDisplayValue("10")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("PDFs"));
    fireEvent.press(screen.getByLabelText("Week 4 · Mar 1, 2099"));
    fireEvent.press(screen.getByText("Create assignment"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/seasons/7/assignments", {
        ...STANDARD_DEFAULTS,
        title: "Upload it",
        sessionId: 12,
        maxFileSizeMb: 10,
        allowedMimeCategories: ["pdf"],
      }),
    );
  });

  // v1 parity 2026-10-09 (was "refuses 'specific groups' with none ticked"): v1
  // assignment-actions.ts:73 saves it, targeting nobody (R13).
  it("saves 'specific groups' with none ticked, targeting nobody (v1 R13)", async () => {
    serve();
    renderWithProviders(<NewAssignmentScreen />);

    fireEvent.changeText(await screen.findByLabelText("Title"), "Nobody");
    fireEvent.press(screen.getByLabelText("Specific groups"));
    fireEvent.press(screen.getByText("Create assignment"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        "/api/v1/seasons/7/assignments",
        expect.objectContaining({ isAllGroups: false, groupIds: [] }),
      ),
    );
  });

  it("shows the server's refusal verbatim and stays on the form", async () => {
    serve();
    post.mockRejectedValue(
      Object.assign(new Error("400"), {
        isAxiosError: true,
        response: {
          status: 400,
          data: { error: { code: "invalid_group", message: "Every group must belong to this assignment's season." } },
        },
      }),
    );
    renderWithProviders(<NewAssignmentScreen />);

    fireEvent.changeText(await screen.findByLabelText("Title"), "Week 4 reflection");
    fireEvent.press(screen.getByText("Create assignment"));

    expect(await screen.findByText("Every group must belong to this assignment's season.")).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("is not offered to a LEADER, whose device fetches nothing", async () => {
    useSessionStore.setState(makeSession("LEADER", { groupLeaderIds: [3] }));
    renderWithProviders(<NewAssignmentScreen />);
    expect(await screen.findByText("Not available")).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  });
});

describe("EditAssignmentScreen", () => {
  beforeEach(() => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    mockParams = { id: "55" };
  });

  it("pre-fills from the server's org fields and PATCHes the whole assignment (R67)", async () => {
    serve({ "/api/v1/assignments/55": detail, "/api/v1/assignments/55/tracker": tracker });
    patch.mockResolvedValue({ data: { data: { ...detail, title: "Essay two" } } });
    renderWithProviders(<EditAssignmentScreen />);

    const title = await screen.findByDisplayValue("Essay one");
    expect(screen.getByText("Due: Apr 1, 2099, 11:59 PM")).toBeTruthy();
    expect(screen.getByDisplayValue("10")).toBeTruthy(); // acceptsFiles re-derived from the size (R10)
    fireEvent.changeText(title, "Essay two");
    fireEvent.press(screen.getByText("Save changes"));

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/api/v1/assignments/55", {
        ...STANDARD_DEFAULTS,
        title: "Essay two",
        description: "Write about the thing.",
        dueDay: "2099-04-01",
        dueTime: "23:59",
        maxFileSizeMb: 10,
        allowedMimeCategories: ["pdf"],
        isAllGroups: false,
        groupIds: [3],
      }),
    );
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith({ pathname: "/assignment/[id]", params: { id: "55" } }),
    );
  });

  it("warns when narrowing the targets would hide work students already started (§10 item 5)", async () => {
    serve({ "/api/v1/assignments/55": detail, "/api/v1/assignments/55/tracker": tracker });
    renderWithProviders(<EditAssignmentScreen />);

    await screen.findByDisplayValue("Essay one");
    expect(screen.queryByText(/already started or submitted/)).toBeNull();
    fireEvent.press(screen.getByLabelText("Group A")); // untick
    fireEvent.press(screen.getByLabelText("Group B")); // tick

    // Sara (SUBMITTED, Group A) is hidden by this edit; Nadia (not started) is not counted.
    expect(
      await screen.findByText(
        "1 student in groups you removed has already started or submitted work. They will no longer see this assignment; their work is kept.",
      ),
    ).toBeTruthy();
  });

  it("clears the due date", async () => {
    serve({ "/api/v1/assignments/55": detail, "/api/v1/assignments/55/tracker": tracker });
    patch.mockResolvedValue({ data: { data: { ...detail, dueAt: null, dueOrgDay: null, dueOrgTime: null } } });
    renderWithProviders(<EditAssignmentScreen />);

    await screen.findByDisplayValue("Essay one");
    fireEvent.press(screen.getByText("Clear due date"));
    expect(screen.getByText("Due: No due date")).toBeTruthy();
    fireEvent.press(screen.getByText("Save changes"));

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith(
        "/api/v1/assignments/55",
        expect.objectContaining({ dueDay: null, dueTime: null }),
      ),
    );
  });

  it("refuses the form when the server says this caller cannot manage it", async () => {
    serve({ "/api/v1/assignments/55": { ...detail, canManage: false } });
    renderWithProviders(<EditAssignmentScreen />);
    expect(await screen.findByText("Not available")).toBeTruthy();
    expect(screen.queryByText("Save changes")).toBeNull();
  });
});
```

Run: `cd apps/mobile && pnpm jest src/__tests__/assignment-form-screens.test.tsx` → FAIL (stubs).

- [ ] **Step 2: The due-date field**

```tsx
// apps/mobile/src/components/due-date-field.tsx
import { useState } from "react";
import { Platform, View } from "react-native";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { format, parse } from "date-fns";

import { formatOrgDue } from "../lib/format";
import { useTheme } from "../theme";
import { Button, Text } from "../ui";

export interface DueValue {
  /** Organisation-calendar day, `YYYY-MM-DD`, or null for no due date. */
  day: string | null;
  /** Organisation wall-clock time, `HH:mm`. Kept while `day` is null so re-picking a day restores it. */
  time: string;
}

/**
 * Picks a deadline as an organisation day + time (rulings C2, X13).
 *
 * The native picker works in the device's local fields. This reads back
 * exactly the Y-M-D and H:m the admin tapped — `format()` over local fields —
 * and passes them on untouched; it never forms an instant and never calls
 * toISOString(). The server composes the instant in ORG_TIMEZONE, so "23:59
 * on the 1st" means the same moment whoever authors it, wherever they are.
 * (v1 composed it with setHours in the author's browser zone, spec 07 R45.)
 */
export function DueDateField({ value, onChange }: { value: DueValue; onChange: (next: DueValue) => void }) {
  const theme = useTheme();
  const [picking, setPicking] = useState<"date" | "time" | null>(null);

  // A local Date whose local fields ARE the org day/time — only ever fed back
  // to the picker as its starting point.
  const pickerValue = value.day ? parse(`${value.day} ${value.time}`, "yyyy-MM-dd HH:mm", new Date()) : new Date();

  const handle = (event: DateTimePickerEvent, picked?: Date) => {
    const mode = picking;
    // Android's dialog is gone after any answer; iOS stays inline until Done.
    if (Platform.OS !== "ios") setPicking(null);
    if (event.type !== "set" || picked === undefined) return;
    if (mode === "date") onChange({ day: format(picked, "yyyy-MM-dd"), time: value.time });
    if (mode === "time") onChange({ day: value.day, time: format(picked, "HH:mm") });
  };

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <Text variant="heading">Due date</Text>
      <Text variant="body">{`Due: ${formatOrgDue(value.day, value.day ? value.time : null)}`}</Text>
      <Text variant="caption" color={theme.colors.neutral[600]}>
        Times are on the organisation's clock, the same for every student.
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
        <Button title="Pick due date" variant="secondary" onPress={() => setPicking("date")} />
        <Button
          title="Pick due time"
          variant="secondary"
          disabled={value.day === null}
          onPress={() => setPicking("time")}
        />
        {value.day !== null ? (
          <Button title="Clear due date" variant="ghost" onPress={() => onChange({ day: null, time: value.time })} />
        ) : null}
      </View>
      {picking !== null ? (
        <>
          <DateTimePicker
            value={pickerValue}
            mode={picking}
            display={Platform.OS === "ios" ? (picking === "date" ? "inline" : "spinner") : "default"}
            // R20: v1's time picker stepped in 15 minutes (honoured on iOS).
            minuteInterval={15}
            onChange={handle}
          />
          {Platform.OS === "ios" ? <Button title="Done" variant="ghost" onPress={() => setPicking(null)} /> : null}
        </>
      ) : null}
    </View>
  );
}
```

- [ ] **Step 3: The form**

```tsx
// apps/mobile/src/components/assignment-form.tsx
import { useState } from "react";
import { Pressable, Switch, View } from "react-native";
import {
  assignmentWriteRequestSchema,
  type AssignmentDetail,
  type AssignmentTrackerRow,
  type AssignmentWriteBody,
  type GroupListItem,
  type MimeCategory,
  type SessionListItem,
} from "@space/shared";

import { MIME_CATEGORY_LABELS } from "../lib/assignment-labels";
import { formatDayKey } from "../lib/format";
import { useTheme } from "../theme";
import { Button, Card, Input, Text } from "../ui";
import { DueDateField } from "./due-date-field";

/** Form state — strings for the numeric inputs, as typed. */
export interface AssignmentFormValues {
  title: string;
  description: string;
  dueDay: string | null;
  dueTime: string;
  sessionId: number | null;
  type: "STANDARD" | "FORUM";
  forumMinWords: string;
  forumAllowComments: boolean;
  acceptsFiles: boolean;
  maxFileSizeMb: string;
  allowedMimeCategories: MimeCategory[];
  targetMode: "all" | "groups";
  groupIds: number[];
}

/** v1's defaults (`assignment-form.tsx:109-126`): 23:59, 50 words, 10 MB, whole season (R19, R21–R23). */
export const NEW_ASSIGNMENT_VALUES: AssignmentFormValues = {
  title: "",
  description: "",
  dueDay: null,
  dueTime: "23:59",
  sessionId: null,
  type: "STANDARD",
  forumMinWords: "50",
  forumAllowComments: false,
  acceptsFiles: false,
  maxFileSizeMb: "10",
  allowedMimeCategories: [],
  targetMode: "all",
  groupIds: [],
};

/** Edit pre-fill — from the server's org-clock fields, never from dueAt (C2). */
export function valuesFromDetail(d: AssignmentDetail): AssignmentFormValues {
  return {
    title: d.title,
    description: d.description ?? "",
    dueDay: d.dueOrgDay,
    dueTime: d.dueOrgTime ?? "23:59",
    sessionId: d.sessionId,
    type: d.type,
    forumMinWords: String(d.forumMinWords ?? 50),
    forumAllowComments: d.forumAllowComments,
    // R10: no separate flag — a size means "accepts files".
    acceptsFiles: d.maxFileSizeMb !== null,
    maxFileSizeMb: String(d.maxFileSizeMb ?? 10),
    allowedMimeCategories: d.allowedMimeCategories,
    targetMode: d.isAllGroups ? "all" : "groups",
    groupIds: d.groupIds ?? [],
  };
}

/**
 * v1's payload assembly (`assignment-form.tsx:133-158`) — forum words fall
 * back to 0 when cleared (R21), size to 10 (R22), picked groups are dropped
 * when targeting everyone (R24) — then validated with the SAME schema the
 * server uses, so the two cannot disagree (R18 was exactly that disagreement).
 */
export function toAssignmentBody(v: AssignmentFormValues) {
  const isForum = v.type === "FORUM";
  return assignmentWriteRequestSchema.safeParse({
    title: v.title.trim(),
    description: v.description.trim() === "" ? null : v.description,
    dueDay: v.dueDay,
    dueTime: v.dueDay === null ? null : v.dueTime,
    sessionId: v.sessionId,
    type: v.type,
    forumMinWords: isForum ? (v.forumMinWords.trim() === "" ? 0 : Number(v.forumMinWords)) : null,
    forumAllowComments: isForum ? v.forumAllowComments : false,
    maxFileSizeMb:
      !isForum && v.acceptsFiles ? (v.maxFileSizeMb.trim() === "" ? 10 : Number(v.maxFileSizeMb)) : null,
    allowedMimeCategories: !isForum && v.acceptsFiles ? v.allowedMimeCategories : [],
    isAllGroups: v.targetMode === "all",
    groupIds: v.targetMode === "groups" ? v.groupIds : [],
  });
}

/**
 * Tracker rows (already on screen) whose student started work in a group the
 * new targeting drops. Narrowing hides the assignment from them (R73); spec
 * §10 item 5 asks the client to warn. Presentational: it counts rows the
 * screen holds; the server still accepts the edit (R72).
 */
export function orphanedWorkCount(rows: AssignmentTrackerRow[], v: AssignmentFormValues): number {
  if (v.targetMode === "all") return 0;
  return rows.filter(
    (r) => r.status !== "PENDING" && (r.groupId === null || !v.groupIds.includes(r.groupId)),
  ).length;
}

function Choice({
  label,
  selected,
  onPress,
  role,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  role: "radio" | "checkbox";
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={{
        paddingVertical: theme.spacing.xs,
        paddingHorizontal: theme.spacing.sm,
        borderRadius: theme.radii.sm,
        borderWidth: theme.borderWidths.thin,
        borderColor: selected ? theme.colors.brand.navy[900] : theme.colors.neutral[300],
        backgroundColor: selected ? theme.colors.brand.teal[500] : theme.colors.transparent,
      }}
    >
      <Text variant="label">{label}</Text>
    </Pressable>
  );
}

export interface AssignmentFormProps {
  initial: AssignmentFormValues;
  groups: GroupListItem[];
  sessions: SessionListItem[];
  submitLabel: string;
  submitting: boolean;
  serverError: string | null;
  /** Edit only: the tracker's rows, for the narrowing warning. */
  trackerRows?: AssignmentTrackerRow[];
  onSubmit: (body: AssignmentWriteBody) => void;
}

export function AssignmentForm({
  initial,
  groups,
  sessions,
  submitLabel,
  submitting,
  serverError,
  trackerRows,
  onSubmit,
}: AssignmentFormProps) {
  const theme = useTheme();
  const [v, setV] = useState<AssignmentFormValues>(initial);
  const [clientError, setClientError] = useState<string | null>(null);

  const set = <K extends keyof AssignmentFormValues>(key: K, value: AssignmentFormValues[K]) =>
    setV((prev) => ({ ...prev, [key]: value }));
  const toggle = <T,>(list: T[], item: T): T[] =>
    list.includes(item) ? list.filter((x) => x !== item) : [...list, item];

  const isForum = v.type === "FORUM";
  const orphaned = trackerRows ? orphanedWorkCount(trackerRows, v) : 0;
  const error = clientError ?? serverError;

  const submit = () => {
    const parsed = toAssignmentBody(v);
    if (!parsed.success) {
      setClientError(parsed.error.issues[0]?.message ?? "Check the form and try again.");
      return;
    }
    setClientError(null);
    onSubmit(parsed.data);
  };

  return (
    <View style={{ gap: theme.spacing.md }}>
      <Input label="Title" value={v.title} onChangeText={(t) => set("title", t)} />
      <Input
        label="Description"
        value={v.description}
        onChangeText={(t) => set("description", t)}
        multiline
        numberOfLines={6}
      />

      <Card style={{ gap: theme.spacing.sm }}>
        <Text variant="heading">Type</Text>
        <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
          <Choice role="radio" label="Standard" selected={!isForum} onPress={() => set("type", "STANDARD")} />
          <Choice role="radio" label="Forum" selected={isForum} onPress={() => set("type", "FORUM")} />
        </View>
        {isForum ? (
          <>
            <Input
              label="Minimum words"
              value={v.forumMinWords}
              onChangeText={(t) => set("forumMinWords", t)}
              keyboardType="number-pad"
            />
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text variant="body">Allow peer comments</Text>
              <Switch
                accessibilityLabel="Allow peer comments"
                value={v.forumAllowComments}
                onValueChange={(on) => set("forumAllowComments", on)}
              />
            </View>
          </>
        ) : null}
      </Card>

      <Card>
        <DueDateField
          value={{ day: v.dueDay, time: v.dueTime }}
          onChange={(next) => setV((prev) => ({ ...prev, dueDay: next.day, dueTime: next.time }))}
        />
      </Card>

      <Card style={{ gap: theme.spacing.sm }}>
        <Text variant="heading">Linked session</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
          <Choice role="radio" label="No session" selected={v.sessionId === null} onPress={() => set("sessionId", null)} />
          {sessions.map((s) => (
            <Choice
              key={s.id}
              role="radio"
              // The server's org-calendar day (X13), not startsAt in the device zone.
              label={`${s.title} · ${formatDayKey(s.dayKey)}`}
              selected={v.sessionId === s.id}
              onPress={() => set("sessionId", s.id)}
            />
          ))}
        </View>
      </Card>

      {/* R25: a forum assignment never acquires file settings through the UI. */}
      {!isForum ? (
        <Card style={{ gap: theme.spacing.sm }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text variant="heading">Accept file uploads</Text>
            <Switch
              accessibilityLabel="Accept file uploads"
              value={v.acceptsFiles}
              onValueChange={(on) => set("acceptsFiles", on)}
            />
          </View>
          {v.acceptsFiles ? (
            <>
              <Input
                label="Max file size (MB)"
                value={v.maxFileSizeMb}
                onChangeText={(t) => set("maxFileSizeMb", t)}
                keyboardType="number-pad"
              />
              <Text variant="label">Allowed types (none ticked = any type)</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
                {(Object.keys(MIME_CATEGORY_LABELS) as MimeCategory[]).map((c) => (
                  <Choice
                    key={c}
                    role="checkbox"
                    label={MIME_CATEGORY_LABELS[c]}
                    selected={v.allowedMimeCategories.includes(c)}
                    onPress={() => set("allowedMimeCategories", toggle(v.allowedMimeCategories, c))}
                  />
                ))}
              </View>
            </>
          ) : null}
        </Card>
      ) : null}

      <Card style={{ gap: theme.spacing.sm }}>
        <Text variant="heading">Assign to</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
          <Choice
            role="radio"
            label="All students in this season"
            selected={v.targetMode === "all"}
            onPress={() => set("targetMode", "all")}
          />
          <Choice
            role="radio"
            label="Specific groups"
            selected={v.targetMode === "groups"}
            onPress={() => set("targetMode", "groups")}
          />
        </View>
        {v.targetMode === "groups" ? (
          groups.length === 0 ? (
            <Text variant="body" color={theme.colors.neutral[600]}>
              This season has no groups yet.
            </Text>
          ) : (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
              {groups.map((g) => (
                <Choice
                  key={g.id}
                  role="checkbox"
                  label={g.name}
                  selected={v.groupIds.includes(g.id)}
                  onPress={() => set("groupIds", toggle(v.groupIds, g.id))}
                />
              ))}
            </View>
          )
        ) : null}
      </Card>

      {orphaned > 0 ? (
        <Text variant="body" color={theme.colors.warning[700]}>
          {`${orphaned} student${orphaned === 1 ? "" : "s"} in groups you removed ${
            orphaned === 1 ? "has" : "have"
          } already started or submitted work. They will no longer see this assignment; their work is kept.`}
        </Text>
      ) : null}

      {error ? (
        <Text variant="body" color={theme.colors.error[600]}>
          {error}
        </Text>
      ) : null}
      <Button title={submitLabel} onPress={submit} loading={submitting} />
    </View>
  );
}
```

- [ ] **Step 4: The two screens.** Replace the Task 6 stubs:

```tsx
// apps/mobile/app/(app)/assignment/new.tsx
import { useState, type ReactNode } from "react";
import { useRouter } from "expo-router";

import { AssignmentForm, NEW_ASSIGNMENT_VALUES } from "../../../src/components/assignment-form";
import { useCreateAssignment } from "../../../src/hooks/use-assignment-writes";
import { useSeasonGroups } from "../../../src/hooks/use-groups";
import { useCurrentSeasonId } from "../../../src/hooks/use-seasons";
import { useSeasonSessions } from "../../../src/hooks/use-sessions";
import { apiErrorMessage } from "../../../src/lib/api-error";
import { useSessionStore } from "../../../src/store/session";
import { EmptyState, ErrorState, LoadingState, Screen } from "../../../src/ui";

/**
 * v1 /admin/season/[code]/assignments/new, for useCurrentSeasonId's season
 * (X8). Offered to ADMIN and SUPER — the roles that can pass the server's
 * season-admin gate; the server still decides.
 */
function NewAssignment() {
  const router = useRouter();
  const current = useCurrentSeasonId();
  const groups = useSeasonGroups(current.seasonId);
  const sessions = useSeasonSessions(current.seasonId);
  const create = useCreateAssignment();
  const [serverError, setServerError] = useState<string | null>(null);

  const seasonId = current.seasonId;
  let body: ReactNode;
  if (current.isPending) {
    body = <LoadingState />;
  } else if (current.isError) {
    body = <ErrorState message="Couldn't load your seasons." onRetry={current.refetch} />;
  } else if (seasonId === null) {
    body = <EmptyState title="No season" message="There's no season to add an assignment to." />;
  } else if (groups.isPending || sessions.isPending) {
    body = <LoadingState />;
  } else if (groups.isError || sessions.isError) {
    body = (
      <ErrorState
        message="Couldn't load this season's groups and sessions."
        onRetry={() => {
          void groups.refetch();
          void sessions.refetch();
        }}
      />
    );
  } else {
    body = (
      <AssignmentForm
        initial={NEW_ASSIGNMENT_VALUES}
        groups={groups.data}
        sessions={sessions.data}
        submitLabel="Create assignment"
        submitting={create.isPending}
        serverError={serverError}
        onSubmit={(payload) => {
          setServerError(null);
          create.mutate(
            { seasonId, body: payload },
            {
              onSuccess: (created) =>
                router.replace({ pathname: "/assignment/[id]", params: { id: String(created.id) } }),
              onError: (err) => setServerError(apiErrorMessage(err, "Couldn't create the assignment.")),
            },
          );
        }}
      />
    );
  }

  return (
    <Screen edges={["top", "left", "right"]} scroll>
      {body}
    </Screen>
  );
}

export default function NewAssignmentScreen() {
  const role = useSessionStore((s) => s.user?.role ?? null);
  // Checked before any hook runs in NewAssignment, so other roles cost no request.
  if (role !== "ADMIN" && role !== "SUPER") {
    return (
      <Screen edges={["top", "left", "right"]}>
        <EmptyState title="Not available" message="Only season admins can create assignments." />
      </Screen>
    );
  }
  return <NewAssignment />;
}
```

```tsx
// apps/mobile/app/(app)/assignment/[id]/edit.tsx
import { useState, type ReactNode } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { AssignmentDetail } from "@space/shared";

import { AssignmentForm, valuesFromDetail } from "../../../../src/components/assignment-form";
import { useAssignmentDetail, useAssignmentTracker } from "../../../../src/hooks/use-assignments";
import { useUpdateAssignment } from "../../../../src/hooks/use-assignment-writes";
import { useSeasonGroups } from "../../../../src/hooks/use-groups";
import { useSeasonSessions } from "../../../../src/hooks/use-sessions";
import { apiErrorMessage } from "../../../../src/lib/api-error";
import { EmptyState, ErrorState, LoadingState, Screen } from "../../../../src/ui";

function EditForm({ detail }: { detail: AssignmentDetail }) {
  const router = useRouter();
  const groups = useSeasonGroups(detail.seasonId);
  const sessions = useSeasonSessions(detail.seasonId);
  // Only feeds the narrowing warning — a failure must not block editing.
  const tracker = useAssignmentTracker(detail.id);
  const update = useUpdateAssignment(detail.id);
  const [serverError, setServerError] = useState<string | null>(null);

  if (groups.isPending || sessions.isPending) return <LoadingState />;
  if (groups.isError || sessions.isError) {
    return (
      <ErrorState
        message="Couldn't load this season's groups and sessions."
        onRetry={() => {
          void groups.refetch();
          void sessions.refetch();
        }}
      />
    );
  }

  return (
    <AssignmentForm
      initial={valuesFromDetail(detail)}
      groups={groups.data}
      sessions={sessions.data}
      trackerRows={tracker.data?.rows}
      submitLabel="Save changes"
      submitting={update.isPending}
      serverError={serverError}
      onSubmit={(payload) => {
        setServerError(null);
        update.mutate(payload, {
          onSuccess: () => router.replace({ pathname: "/assignment/[id]", params: { id: String(detail.id) } }),
          onError: (err) => setServerError(apiErrorMessage(err, "Couldn't save the assignment.")),
        });
      }}
    />
  );
}

/** v1 /admin/season/[code]/assignments/[id]/edit — the same form, pre-filled; a full replace. */
export default function EditAssignmentScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const parsed = Number(rawId);
  const id = Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  const detail = useAssignmentDetail(id);

  let body: ReactNode;
  if (id === null) {
    body = <EmptyState title="Not found" message="That assignment link isn't valid." />;
  } else if (detail.isPending) {
    body = <LoadingState />;
  } else if (detail.isError) {
    body = <ErrorState message="Couldn't load this assignment." onRetry={() => void detail.refetch()} />;
  } else if (!detail.data.canManage) {
    // The server's flag (C4), mirroring the PATCH gate; the gate itself is the server's.
    body = <EmptyState title="Not available" message="You can't edit this assignment." />;
  } else {
    body = <EditForm detail={detail.data} />;
  }

  return (
    <Screen edges={["top", "left", "right"]} scroll>
      {body}
    </Screen>
  );
}
```

- [ ] **Step 5:** Run `cd apps/mobile && pnpm jest src/__tests__/assignment-form-screens.test.tsx` → PASS. Then prove the form is device-zone-proof:
`cd apps/mobile && TZ=Pacific/Kiritimati pnpm jest src/__tests__/assignment-form-screens.test.tsx && TZ=America/Los_Angeles pnpm jest src/__tests__/assignment-form-screens.test.tsx` → PASS both.
`pnpm turbo lint typecheck test:unit --filter=@space/mobile` → clean.

- [ ] **Step 6: Commit** — `git add apps/mobile && git commit -m "feat(mobile): assignment create and edit — org-clock due date, shared-schema validation, narrowing warning"`

---
### Task 10: Closing gate (coordinator)

**Files:** none created — verification only.

- [ ] **Step 1: Unit gate.** `pnpm turbo lint typecheck test:unit build` → green.

- [ ] **Step 2: Integration, serially, in tmux** (the suite set runs past two minutes; one process only — `cleanupTestData()` is prefix-global):

```bash
mkdir -p ~/logs
tmux kill-session -t space-v2-plan15-int 2>/dev/null
tmux new -d -s space-v2-plan15-int "cd ~/projects/JPC/space-v2/apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern integration 2>&1 | tee ~/logs/space-v2-plan15-int.log"
```

Watch with `tail -f ~/logs/space-v2-plan15-int.log` → every suite green,
including `assignment-writes-routes` and the extended `assignments-routes`.
Report the session name and log path.

- [ ] **Step 3: Mutation pass.** One at a time, restore after each; each must fail the named test (backend mutations: re-run only `--testPathPattern assignment-writes-routes`, serially).
  1. `targetedStudentIds`: read `db.groupStudent.findMany({ where: { groupId: { in: groupIds } } })` for the targeted branch (v1's query) → "notifies through the season enrolment, not GroupStudent (C9)" fails.
  2. `notifyAssignmentCreated`: link `` `/assignments/${assignment.id}` `` → "notifies each targeted student once, with v1's exact link…" fails.
  3. `notifyAssignmentCreated`: body `` `Due ${assignment.dueAt.toLocaleString()}` `` → same test fails on the body (run with `TZ=UTC`: the host's 21:59 is not Cairo's 11:59 PM).
  4. POST: delete the `validateAssignmentRefs` call → "refuses another season's group with invalid_group…" and "…session with invalid_session" fail.
  5. PATCH: call `notifyAssignmentCreated` for the targeted students → "notifies nobody on edit, even students newly targeted" fails. *(v1 parity 2026-10-09: was "notify `after` → NEWLY-targeted test")*
  6. PATCH: look the row up with `where: { id }` (no `deletedAt: null`) → "returns 404 for a soft-deleted assignment" fails.
  7. DELETE: drop `submissions: { none: {} }` from the `updateMany` → "refuses while any submission exists — even a draft" fails.
  8. `orgWallClockToInstant`: return `` new Date(`${day}T${time ?? "00:00"}:00.000Z`) `` → the org-time unit test and "composes the deadline on the org clock across DST" fail.
  9. Shared: drop `Array.from(new Set(...))` in `normalizeAssignmentWrite` → "collapses duplicate group ids" (shared) fails, and the PATCH duplicate-id case 500s.
  10. `assignmentDetailPayload`: compute `dueOrgTime` with `detail.dueAt.toISOString().slice(11, 16)` → `assignments-routes` "returns detail for a SUPER…" fails (`"00:00"` ≠ `"02:00"`).
  11. Mobile `DueDateField`: `day: picked.toISOString().slice(0, 10)` instead of `format(picked, "yyyy-MM-dd")` → under `TZ=Pacific/Kiritimati pnpm jest src/__tests__/assignment-form-screens.test.tsx`, "creates a group-targeted assignment due at an org-clock time" fails (`2099-03-31`).
  12. Mobile `AssignmentForm.submit`: call `onSubmit` without `toAssignmentBody` validation (send the raw values) → "refuses 'specific groups' with none ticked…" fails.
  13. Mobile `AssignmentStaffPanel`: render `ManageActions` regardless of `detail.canManage` → "gives a LEADER no tracker and no edit or delete" fails.
  14. Mobile `TRACKER_ROLES`: add `"MENTOR"` → "never asks a MENTOR's device for the tracker" fails.
  15. Mobile `assignments.tsx`: pass `null` to `useStaffAssignments` → "lists the current season's assignments…" fails.
  16. `_layout.tsx`: restore `"assignment/[id]"` in place of `"assignment/[id]/index"` → `app-layout.test.tsx` fails (both the X7 assertion and the disk-derived "every route file is declared").

- [ ] **Step 4: Build-output check** (X12): `grep -rn 'require("@space/shared")' apps/backend/dist/` → empty (`lib/assignment-writes.ts` imports shared **types** only; `routes/seasons.ts` and `routes/assignments.ts` use the relative path).

- [ ] **Step 5: Health check against a built server** (X6), in tmux:

```bash
tmux kill-session -t space-v2-plan15-server 2>/dev/null
tmux new -d -s space-v2-plan15-server "cd ~/projects/JPC/space-v2 && pnpm --filter @space/backend start 2>&1 | tee ~/logs/space-v2-plan15-server.log"
curl -fsS localhost:4000/health
curl -fsS localhost:4000/api/docs.json | grep -c '"AssignmentWriteRequest"'   # ≥ 1
tmux kill-session -t space-v2-plan15-server
```

- [ ] **Step 6: Device checklist** (Expo Go against staging, as a season ADMIN): `/assignments` (More → Assignments) lists the current season with org due days and "N/M submitted"; **New assignment** → pick a date and a time — the label shows them as picked; switch the phone to a far timezone (e.g. Kiritimati), create another with the same day/time — both show the same `Due …` label and the same `dueAt` in `/api/docs`'s try-it GET; target one group → a student in it sees the assignment and an in-app notification (v1's web inbox, opened on the same DB, links it to `/student/assignments/<id>` and the page loads); a student outside the group does not; FORUM hides file settings; edit → untick a group with a submitted student → the warning appears; save → detail reflects it; delete an untouched assignment → back on the list, gone; delete one a student opened → the server's "already started" message; as a LEADER or MENTOR, the detail shows no tracker (the endpoint answers 403) and no Edit/Delete — v1 shows the tracker to season admins and SUPER only (v1 parity 2026-10-09; was "LEADER sees their groups' tracker"). iOS: the inline date picker and time spinner close with **Done**; Android: each opens as a dialog.

- [ ] **Step 7:** Report suite counts, the sixteen mutation outcomes, checklist results, the tmux session names/log paths, and any divergence from this plan.

---

## Open decisions (for the coordinator)

1. **Due-date wire format changed from spec §8.** §8 specified `dueAt` as an ISO instant in the request; rulings C2/X13 (author's device zone must not decide the instant) override it, so the request carries `dueDay` + `dueTime` and reads carry `dueOrgDay`/`dueOrgTime`. This is the same shape Plan 14 already chose for events. **Plan 14 must therefore import, not define,** `isoDaySchema`/`wallTimeSchema` (now in `packages/shared/src/org-time.ts`; defining them again in `event.ts` is a duplicate `export *` compile error) and `orgWallTime`/`orgWallClockToInstant` (now in `lib/org-time.ts`, same names and signatures as Plan 14's Task — its Step 2 should drop those two and keep `isOrgMidnight`/`isoDayInOrgTime`). Plan 14's `isoDayInOrgTime` also duplicates Plan 4's `orgDayKey`; worth folding while that plan is open.
2. **Later plans that name the old route file.** Plan 13 (prerequisites list) and Plan 14 (Task modifying `app/(app)/assignment/[id].tsx`, test imports of `…/assignment/[id]`) must use `app/(app)/assignment/[id]/index.tsx`. The pathname `/assignment/[id]` — and so Plan 13's `routeForTarget` — is unchanged. Plan 14's `AssignmentDetail` fixtures need `dueOrgDay`/`dueOrgTime`.
3. **Description format (spec §10 item 10, still open).** The form edits `description` as plain text and stores it as typed; a v1-authored HTML description shows its markup when edited in the app. The clean fix is X3's `htmlToPlainText`/`plainTextToHtml` (`packages/shared/src/html-text.ts`), which Plan 12 creates after this plan; Plan 12 (or 13) should convert on load/save here. v1 renders a v2 plain-text description safely (sanitize-html) but collapses its line breaks.
4. **Delete policy.** Refused on any `Submission` row (drafts included), no `force`, 200 `{ deleted: true }` instead of §7's 204 — chosen per §10 item 4's "blocking is the safe default". Relax later if admins need it.
5. **Edit notifies nobody**, as v1 (`src/lib/assignment-actions.ts:101-139,128-133`; R66, R74). Plan 13's `bestEffort` wrapping applies to the single `notifyAssignmentCreated` call site in `lib/assignment-writes.ts`, which serves create only (its producer table names one row for Plan 5 — still accurate). *(v1 parity 2026-10-09: was "edit notifies newly targeted students, spec §10 item 5")*
6. **No SUPER nav entry for `/assignments`.** SUPER reaches it from the `/season` workspace's Assignments button (Plan 4) or a link; `packages/shared/src/navigation.ts` is unchanged. Add a sidebar entry if SUPERs author routinely.
7. **Not changed here:** the student list still formats `dueAt` with the device's zone (Plan 1's `formatDueDate`); `studentAssignmentListItemSchema` has no `dueOrgDay`. A follow-up (Plan 11 or 18) can add it the same way. The staff list's per-row `expectedCount` N+1 (spec §7) is untouched.

## Revision 2026-10-09 — v1 parity

Owner ruling: v2 behaves exactly like v1 except where v1's behaviour is a defect. This revision
reverts the divergences below; the edits are marked *(v1 parity 2026-10-09)* in place. The code
built from the earlier text must be changed to match. Full classification:
`docs/superpowers/audits/2026-cutover/v1-parity-classification.tsv`.

| # | Rule(s) | REG | v1 behaviour (v1 file:line) | v2 code to change (file:line) | Where in this plan |
|---|---|---|---|---|---|
| 1 | 07-assignments R13 | REG-20 (this half) | "Specific groups" with no group chosen saves an assignment that targets nobody, notifies nobody, expected count 0 (`src/lib/assignment-actions.ts:73`) | `packages/shared/src/assignment.ts:207-214` (`refineTargeting`) | Divergence table row removed → "Unchanged from v1" paragraph; Task 1 schema test + `refineTargeting` removal + `assignmentWriteRequestSchema`; Task 3 create test; Task 9 form test ("saves 'specific groups' with none ticked") |
| 2 | 07-assignments R48 | - | Not-started past-due row: red "Due MMM d" badge and dot; upcoming "Due MMM d, yyyy · in N days" (`src/app/student/assignments/page.tsx:17-41,98-104`) | `apps/mobile/app/(app)/assignments.tsx:16-24` | Task 7 Step 2 parity note (student branch; Plan 1 Task 1 owns the code) |
| 3 | 07-assignments R59 | - | Only season admins and SUPER see an assignment's submission tracker (`src/lib/assignments-query.ts:127-129`; `src/app/admin/season/[code]/assignments/[id]/page.tsx:27,30`) | `apps/backend/src/routes/assignments.ts:108-111` (leaders admitted); tracker section in `assignment/[id]` | Task 6 `useAssignmentTracker` comment; Task 8 Step 1 LEADER test; Task 8 Step 2 `TRACKER_ROLES` + render gate + server-gate note; Task 10 mutation 13 and device checklist |
| 4 | 07-assignments R66, R74 | REG-17 | Editing, retargeting or deleting notifies nobody; new groups' students are added silently (`src/lib/assignment-actions.ts:101-139,141-162`, `:128-133`) | `apps/backend/src/routes/assignments.ts:173-177` (`targetedStudentIds`/`notifyAssignmentCreated` in PATCH) | Header "Consumed later by"; divergence table row removed → "Unchanged from v1"; Task 3 `notifyAssignmentCreated` doc; Task 4 Consumes, test, imports, handler comment/body, OpenAPI, commit message; Task 10 mutation 5; Open decision 5 |

**Awaiting owner (not changed):** none

