# Plan 4 — Admin Core Screens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An admin runs the *current* season from the phone: a calendar every role shares (grouped by the organisation's calendar day), the SUPER seasons list and the season workspace with the Plan 3 write actions, and a session detail screen whose check-in console displays the QR and the true open/closed state — with group leaders getting a read-only live check-in roster instead of controls they cannot use.

**Architecture:** Four destinations over one small backend contract change.
`calendar.tsx` is the worked example of decision D1 — one route file, every
role's branch inside, driven entirely by which seasons the API returns.
`session/[id]/index.tsx` joins `DETAIL_ROUTE_NAMES` in the directory form
ruling X7 requires (Plan 2 already owns `session/[id]/attendance.tsx`). The
session contract gains two server-derived values (ruling C4): `dayKey` on every
session list row — the org-timezone calendar day, computed by Plan 3's
`lib/org-time.ts` (ruling X13) — and `canManageCheckIn` on the session detail,
which is exactly the `isAdminOfSeason` gate the open/close endpoints enforce.
The client renders both and re-derives neither. Season writes call Plan 3's
endpoints; every response, including mutations, is parsed with a shared Zod
schema (ruling X10). Staff screens get their season from this plan's
`useCurrentSeasonId()` — the hook every later staff screen uses (ruling X8).

**Tech Stack:** Express 5 + Prisma 7 (one route tweak, one query tweak, one
org-time helper); Expo SDK 54 / expo-router 6, React Query 5, Zod contracts,
`react-native-qrcode-svg` (+ its peer `react-native-svg`) for the QR, RNTL 13.

**Spec:** `docs/superpowers/specs/domains/02-seasons.md` §9, `03-sessions.md`
§9, `04-attendance.md` (console rules; §9 row 2 — the leader's read-only
roster; §10 D3's rotating-code upgrade is deferred — this plan ships the QR on
today's API and says so on screen), `_DECISIONS.md` (C2, C4); roadmap § Plan 4
as amended by the 2026-10-05 rulings (X7, X8, X10, X13, X15).

**Depends on:** Plan 1 (`DETAIL_ROUTE_NAMES`, hooks pattern, and Task 0's
derived route-count tests — ruling X9), Plan 2 (`session/[id]/attendance`
screen and `useAttendanceRoster` in `src/hooks/use-attendance.ts` — Task 5
here links to the screen and reuses the hook), Plan 3 (`lib/org-time.ts` +
`config.orgTimezone`; `seasonListItemSchema`/`seasonDetailSchema`;
`POST /seasons`, `PATCH /seasons/:id`, `POST /seasons/:id/duplicate`,
`DELETE /seasons/:id`).

**Scope — what this plan does NOT build, and where it went** (ruling X15;
the roadmap's original Plan 4 paragraph promised some of these, and they are
reassigned, not dropped):
- **Plan 16 (season/session/group admin screens):** the season detail route
  (`seasons/[code]` for any season, not just the current one) and the SUPER
  edit screen covering identity fields and status (DRAFT→ACTIVE→ARCHIVED);
  group management (the ADMIN/SUPER branch of `/groups`, group create/edit,
  roster grid — ADMIN's Groups tab stays the Plan 2 leader view until then);
  session create/edit/delete screens; the **multi-season calendar** (SUPER
  across all ACTIVE seasons, LEADER across every led season, ADMIN season
  switcher — this plan's calendar shows one season, `useCurrentSeasonId()`'s);
  check-in token regeneration; the program filter on `/seasons`.
- **Plan 14 (student self-service):** the student check-in scanner /
  enter-code flow and the `/checkin/<token>` deep link; the full student
  `/season` content (upcoming sessions, group card with leaders). This plan
  only guarantees `/season` renders correctly for a STUDENT.
- **Not here, not yet assigned:** the session's quiz list on the leader's
  session detail (v1 `leader/sessions/[id]` shows it) needs Plan 6's
  `GET /quizzes?sessionId=`; this plan's session detail has no quiz card.

## Global Constraints

Same as Plans 1–2 (relative imports, Zod-parse everything including mutation
responses, `enabled` + guarded `refetch`, state primitives, tab edges,
`renderWithProviders`, `mock*` rule, typed routes + `routes:generate`). Plus:

- **No migrations, no schema edits** (ruling X14). No `process.env` outside
  `lib/config.ts`. No `@/` alias. Never import `@prisma/client`.
- Backend value imports from shared use the relative path
  `../../../../packages/shared/src/index` (depth adjusted) in **any** backend
  file (ruling X12). This plan adds none — the backend changes import only
  `lib/` modules.
- `src/docs/openapi.ts` changes in the same commit as the route change.
- **Test fixtures for the session store include every `MeUser` field**
  (`avatarPath: null`) — test files are typechecked (ruling X11).
- **Route-count tests are derived** (ruling X9, Plan 1 Task 0): adding a route
  name to `DETAIL_ROUTE_NAMES` or removing a placeholder entry never edits a
  hardcoded count. If a count literal is still present when this plan runs,
  Plan 1 Task 0 has not landed — stop and land it first.

Backend endpoints consumed (shapes verified against the routes on `main`):
- `GET /api/v1/seasons` → `{ data: { seasons: SeasonListItem[] } }` — role-scoped server-side (SUPER/MENTOR all, ADMIN theirs, LEADER via groups, STUDENT via enrollment), ordered `year desc, title asc`
- `GET /api/v1/seasons/:id` → `{ data: SeasonDetail }` (groups narrowed for students server-side)
- `GET /api/v1/seasons/:id/sessions` → `{ data: { sessions: SessionListItem[] } }` — `checkInToken` is served to every non-STUDENT role (`includeCheckInToken: role !== "STUDENT"`), null for students; `dayKey` added by Task 1
- `GET /api/v1/sessions/:id` → `{ data: SessionDetail }` — `checkInOpen` from `isCheckInOpen` (3-hour window applied); `canMarkAttendance` from `attendanceScopeFor` (true for season admins **and** group leaders); `canManageCheckIn` added by Task 1
- `GET /api/v1/sessions/:id/attendance` → `{ data: { roster } }` — narrowed to a leader's groups server-side
- `POST /api/v1/sessions/:id/check-in-open` → `{ data: { checkInToken } }` (reuses an existing token on reopen) — `isAdminOfSeason` only
- `POST /api/v1/sessions/:id/check-in-close` → `{ data: { closed: true } }` — `isAdminOfSeason` only
- Plan 3 writes: `POST /seasons` and `POST /seasons/:id/duplicate` → `{ data: { id, code } }` 201; `PATCH /seasons/:id` → `{ data: { id, code } }`; `DELETE /seasons/:id` → `{ data: { deleted: true } }` (Task 1 Step 6 pins the last two).

**Execution shape:** Task 1 (backend + shared contract) first, then Task 2
(mobile foundation). Tasks 3, 4, 5 then parallelize (calendar /
seasons + workspace / session detail) — they touch disjoint files. Task 6 is
the closing gate.

---

### Task 1: Contract — `dayKey`, `canManageCheckIn`, typed write responses

**Files:**
- Modify: `apps/backend/src/lib/org-time.ts` (Plan 3's file — append `orgDayKey`)
- Modify: `apps/backend/src/lib/queries/sessions.ts` (`SessionListRow.dayKey`)
- Modify: `apps/backend/src/routes/sessions.ts` (detail gains `canManageCheckIn`)
- Modify (only if Step 6 finds a mismatch): `apps/backend/src/routes/seasons.ts`
- Modify: `apps/backend/src/docs/openapi.ts`
- Modify: `packages/shared/src/session.ts` (add `dayKey`; convert `MyAttendance` + `SessionDetail` to Zod; check-in response schemas)
- Modify: `packages/shared/src/season.ts` (season write response schemas)
- Create: `packages/shared/src/api-error.ts`; Modify: `packages/shared/src/index.ts`
- Test: `apps/backend/src/__tests__/org-time.test.ts` (extend), `apps/backend/src/__tests__/integration/sessions-routes.test.ts` (extend), `apps/backend/src/__tests__/integration/seasons-routes.test.ts` (extend)

**Interfaces:**
- Consumes: Plan 3's `config.orgTimezone` and `lib/org-time.ts`; existing `isAdminOfSeason`, `listSessionsForSeason`.
- Produces (exact names later plans use):
  - `orgDayKey(date: Date): string` in `apps/backend/src/lib/org-time.ts` — `"YYYY-MM-DD"` on the organisation's calendar.
  - `sessionListItemSchema.dayKey: string` — every session list row.
  - `myAttendanceSchema`, `sessionDetailSchema` (+ `MyAttendance`, `SessionDetail` as `z.infer`), with `sessionDetailSchema.canManageCheckIn: boolean`.
  - `checkInOpenResponseSchema` (`{ checkInToken: string }`), `checkInCloseResponseSchema` (`{ closed: true }`).
  - `seasonRefResponseSchema` (`{ id: number; code: string }`) — create, duplicate and update responses; `seasonDeletedResponseSchema` (`{ deleted: true }`).
  - `apiErrorBodySchema` (`{ error: { code, message } }`) in `packages/shared/src/api-error.ts`.

- [ ] **Step 1: Failing unit test for `orgDayKey`.** Append to
`apps/backend/src/__tests__/org-time.test.ts`:

```ts
import { orgDayKey } from "../lib/org-time";

describe("orgDayKey", () => {
  // config.orgTimezone defaults to Africa/Cairo (Plan 3): UTC+2 in March.
  // If the configured zone changes, these expectations change with it.
  it("keys an evening session to its own org-calendar day", () => {
    expect(orgDayKey(new Date("2099-03-01T18:00:00.000Z"))).toBe("2099-03-01");
  });

  it("keys a late-UTC instant to the NEXT day when the org clock has passed midnight", () => {
    // 23:30Z is 01:30 on the 2nd in Cairo. A device in UTC would group this
    // session under the 1st — the bug ruling X13 exists to prevent.
    expect(orgDayKey(new Date("2099-03-01T23:30:00.000Z"))).toBe("2099-03-02");
  });

  it("zero-pads month and day", () => {
    expect(orgDayKey(new Date("2099-01-05T10:00:00.000Z"))).toBe("2099-01-05");
  });
});
```

Run: `cd apps/backend && npx jest src/__tests__/org-time.test.ts` → FAIL (`orgDayKey` not exported).

- [ ] **Step 2: Implement `orgDayKey`.** Append to `apps/backend/src/lib/org-time.ts`:

```ts
const dayKeyFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: config.orgTimezone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * The organisation-calendar day an instant falls on, as "YYYY-MM-DD".
 *
 * Ruling X13 / C2: "which day does this belong to" resolves against the org
 * timezone, server-side, once. The calendar groups sessions by this key; a
 * client grouping by its own device zone would file a 23:30Z session under
 * the wrong day for every viewer east of UTC. Built from formatToParts rather
 * than a locale whose default pattern happens to be ISO-shaped, so a
 * locale-data change cannot reorder the fields.
 */
export function orgDayKey(date: Date): string {
  const parts: Record<string, string> = {};
  for (const part of dayKeyFormatter.formatToParts(date)) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }
  return `${parts.year}-${parts.month}-${parts.day}`;
}
```

(`config` is already imported at the top of that file by Plan 3.) Run the unit
test → PASS.

- [ ] **Step 3: Failing integration tests.** In
`apps/backend/src/__tests__/integration/sessions-routes.test.ts`, add to the
existing `GET /api/v1/seasons/:id/sessions` describe:

```ts
  it("keys each session to its org-calendar day (ruling X13)", async () => {
    const res = await request(app)
      .get(`/api/v1/seasons/${seasonId}/sessions`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    // The fixture session starts 2099-03-01T18:00Z — 20:00 in Cairo.
    expect(res.body.data.sessions[0].dayKey).toBe("2099-03-01");
  });
```

and append a new describe at the end of the file:

```ts
describe("canManageCheckIn on GET /api/v1/sessions/:id (Plan 4)", () => {
  let leaderToken: string;

  beforeAll(async () => {
    // groupLeaderIds is a token claim loaded at login, so the group must
    // exist before this login.
    const leader = await createTestUser("checkin-leader", "LEADER");
    await db.group.create({
      data: { seasonId, name: "Leader's group", leaders: { create: { userId: leader.id } } },
    });
    leaderToken = await login(app, leader.email);
  });

  it("is true for a season admin — the same gate check-in-open enforces", async () => {
    const res = await request(app)
      .get(`/api/v1/sessions/${sessionId}`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ canMarkAttendance: true, canManageCheckIn: true });
  });

  it("is false for a group leader, who can still mark attendance", async () => {
    const res = await request(app)
      .get(`/api/v1/sessions/${sessionId}`)
      .set("authorization", `Bearer ${leaderToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ canMarkAttendance: true, canManageCheckIn: false });
  });

  it("agrees with the write gate: the leader's open is refused", async () => {
    const res = await request(app)
      .post(`/api/v1/sessions/${sessionId}/check-in-open`)
      .set("authorization", `Bearer ${leaderToken}`);
    expect(res.status).toBe(403);
  });

  it("is false for a student", async () => {
    const res = await request(app)
      .get(`/api/v1/sessions/${sessionId}`)
      .set("authorization", `Bearer ${studentToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.canManageCheckIn).toBe(false);
  });
});
```

Run: `cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern sessions-routes` → the new cases FAIL (`dayKey`/`canManageCheckIn` undefined).

- [ ] **Step 4: Implement both fields.**

In `apps/backend/src/lib/queries/sessions.ts`: add `import { orgDayKey } from "../org-time";`,
add `dayKey: string;` to `SessionListRow` (after `startsAt`), and in the
`rows.map` add `dayKey: orgDayKey(s.startsAt),` after `startsAt: s.startsAt,`.

In `apps/backend/src/routes/sessions.ts`, in the `GET /:id` handler's
`apiOk(res, { ... })`, add after `canMarkAttendance`:

```ts
    // Ruling C4: the client renders this and never re-derives it. It is the
    // exact predicate check-in-open/-close enforce below — a leader passes
    // canMarkAttendance (attendanceScopeFor) but not this, which is why the
    // console must not key off canMarkAttendance (spec 04 §9 row 2).
    canManageCheckIn: isAdminOfSeason(user, session.seasonId),
```

(`isAdminOfSeason` is already imported there.) Run the sessions suite → PASS.

- [ ] **Step 5: Shared contracts.** In `packages/shared/src/session.ts`:

Add to `sessionListItemSchema`, after `startsAt`:

```ts
  /**
   * The organisation-calendar day of `startsAt`, "YYYY-MM-DD", computed
   * server-side in the org timezone (ruling X13). Group by this — never by
   * formatting `startsAt` in the device zone.
   */
  dayKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
```

Replace the `MyAttendance` and `SessionDetail` interfaces:

```ts
export const myAttendanceSchema = z.object({
  status: attendanceStatusSchema,
  notes: z.string().nullable(),
  lateMinutes: z.number().nullable(),
  checkedInAt: z.string().nullable(),
});
export type MyAttendance = z.infer<typeof myAttendanceSchema>;

export const sessionDetailSchema = z.object({
  id: z.number(),
  title: z.string(),
  description: z.string().nullable(),
  startsAt: z.string(),
  durationMinutes: z.number(),
  location: z.string().nullable(),
  youtubeUrl: z.string().nullable(),
  recurrenceGroupId: z.string().nullable(),
  seasonId: z.number(),
  seasonCode: z.string(),
  seasonTitle: z.string(),
  /**
   * True only while a scan would actually be accepted — opened, not closed,
   * within the server's three-hour window. The client renders this flag and
   * never re-derives the rule (ruling C4).
   */
  checkInOpen: z.boolean(),
  /** Present only for students; null for everyone else. */
  myAttendance: myAttendanceSchema.nullable(),
  /** Season admins AND group leaders (attendanceScopeFor). Drives "Mark attendance". */
  canMarkAttendance: z.boolean(),
  /**
   * Season admins only (isAdminOfSeason) — the open/close gate. A leader has
   * canMarkAttendance but not this, and gets the read-only live roster.
   */
  canManageCheckIn: z.boolean(),
});
export type SessionDetail = z.infer<typeof sessionDetailSchema>;

export const checkInOpenResponseSchema = z.object({ checkInToken: z.string() });
export const checkInCloseResponseSchema = z.object({ closed: z.literal(true) });
```

(`attendanceStatusSchema` is imported from `./enums` since Plan 2 Task 1;
drop the now-unused `import type { AttendanceStatus }` if lint flags it.)

In `packages/shared/src/season.ts` append:

```ts
/** POST /seasons, POST /seasons/:id/duplicate and PATCH /seasons/:id all answer this. */
export const seasonRefResponseSchema = z.object({ id: z.number(), code: z.string() });
export type SeasonRefResponse = z.infer<typeof seasonRefResponseSchema>;

export const seasonDeletedResponseSchema = z.object({ deleted: z.literal(true) });
```

Create `packages/shared/src/api-error.ts`:

```ts
import { z } from "zod";

/**
 * The failure envelope every backend path returns (CLAUDE.md "Response
 * envelope"). Clients parse an error body with this instead of reaching into
 * `response.data.error.message` by cast.
 */
export const apiErrorBodySchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});
export type ApiErrorBody = z.infer<typeof apiErrorBodySchema>;
```

and add `export * from "./api-error";` to `packages/shared/src/index.ts`.

- [ ] **Step 6: Pin Plan 3's PATCH/DELETE response shapes.** Append to
`apps/backend/src/__tests__/integration/seasons-routes.test.ts`:

```ts
describe("season write response shapes (the mobile client parses these — Plan 4)", () => {
  it("PATCH answers { id, code } and DELETE answers { deleted: true }", async () => {
    const target = await createTestSeason({ status: "DRAFT" });
    const shapeAdmin = await createTestUser("shape-admin", "ADMIN");
    await db.seasonAdmin.create({ data: { seasonId: target.id, userId: shapeAdmin.id } });
    const shapeAdminToken = await login(app, shapeAdmin.email);

    const patched = await request(app)
      .patch(`/api/v1/seasons/${target.id}`)
      .set("authorization", `Bearer ${shapeAdminToken}`)
      .send({ description: "Shape check" });
    expect(patched.status).toBe(200);
    expect(patched.body.data).toEqual({ id: target.id, code: target.code });

    const shapeSuper = await createTestUser("shape-super", "SUPER");
    const shapeSuperToken = await login(app, shapeSuper.email);
    const deleted = await request(app)
      .delete(`/api/v1/seasons/${target.id}`)
      .set("authorization", `Bearer ${shapeSuperToken}`);
    expect(deleted.status).toBe(200);
    expect(deleted.body.data).toEqual({ deleted: true });
  });
});
```

Run the seasons suite. If it passes, Plan 3 already answers these shapes —
change nothing in `routes/seasons.ts`. If either assertion fails, change only
that handler's success payload to `apiOk(res, { id: season.id, code: season.code })`
(PATCH — select `{ id: true, code: true }` from the update) or
`apiOk(res, { deleted: true })` (DELETE), and re-run → PASS.

- [ ] **Step 7: OpenAPI, same commit.** In `src/docs/openapi.ts`:
`SessionListItem.properties` gains
`dayKey: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "Org-timezone calendar day of startsAt (ruling X13). Group by this, not by formatting startsAt on the device." }`;
`SessionDetail.properties` gains
`canManageCheckIn: { type: "boolean", description: "Season admins only — the gate check-in-open/close enforce. Group leaders have canMarkAttendance but not this." }`.
If Step 6 changed a handler, update that path's success schema to match.

- [ ] **Step 8:** `pnpm turbo lint typecheck test:unit --filter=@space/backend --filter=@space/shared` → clean. The mobile package will fail typecheck/tests on session fixtures missing `dayKey` until Task 2 Step 1 — expected, and fixed there before Task 2 commits.

- [ ] **Step 9: Commit** — `git add apps/backend packages/shared && git commit -m "feat(backend): org-calendar dayKey on session rows and canManageCheckIn on session detail"`

---

### Task 2: Mobile foundation — `session/[id]` route, season hooks, helpers

**Files:**
- Modify: every mobile test fixture that builds a `SessionListItem` (today `src/__tests__/dashboard.test.tsx`, `src/__tests__/use-sessions.test.tsx`; find all with `grep -rln "checkInClosedAt" apps/mobile/src`)
- Create: `apps/mobile/app/(app)/session/[id]/index.tsx` (stub — directory form, ruling X7; Plan 2's `session/[id]/attendance.tsx` is its sibling)
- Modify: `apps/mobile/app/(app)/_layout.tsx` (`DETAIL_ROUTE_NAMES` gains `"session/[id]/index"`)
- Create: `apps/mobile/src/hooks/use-seasons.ts`
- Create: `apps/mobile/src/lib/api-error.ts`
- Modify: `apps/mobile/src/lib/format.ts` (add `formatDayKey`)
- Modify: `apps/mobile/src/lib/query-keys.ts` (add `seasons`; extend `sessions` with `detail`)
- Test: `apps/mobile/src/__tests__/app-layout.test.tsx` (extend), `apps/mobile/src/__tests__/format.test.ts` (extend), `apps/mobile/src/__tests__/use-seasons.test.tsx`, `apps/mobile/src/__tests__/api-error.test.ts`

**Interfaces:**
- Consumes: Task 1's schemas; Plan 1's `DETAIL_ROUTE_NAMES`; Plan 3's `seasonListItemSchema`/`seasonDetailSchema`.
- Produces (exact names later plans use):
  - `useSeasons(enabled?: boolean): UseQueryResult<SeasonListItem[]>`
  - `useSeasonDetail(id: number | null): UseQueryResult<SeasonDetail>`
  - `useCurrentSeasonId(): CurrentSeason` where `CurrentSeason = { seasonId: number | null; isPending: boolean; isError: boolean; refetch: () => void }` — **every staff screen in every later plan gets its season here** (ruling X8)
  - `pickCurrentSeasonId(seasons: SeasonListItem[]): number | null`
  - `apiErrorMessage(err: unknown, fallback: string): string` in `src/lib/api-error.ts`
  - `formatDayKey(dayKey: string | null): string` in `src/lib/format.ts`
  - `queryKeys.seasons.all/list()/detail(id: number | null)`, `queryKeys.sessions.detail(id: number | null)`
  - route `/session/[id]` (route name `session/[id]/index`)

- [ ] **Step 1: Fixture repair.** Add `dayKey` to every `SessionListItem`
fixture under `apps/mobile/src/__tests__` (the `startsAt` they carry is
`2026-03-01T18:00:00.000Z` today, so `dayKey: "2026-03-01"`; for any other
fixture use the date part of its `startsAt` — every fixture time is an evening
UTC instant, which is the same day in Cairo). Run
`cd apps/mobile && pnpm jest src/__tests__/dashboard.test.tsx src/__tests__/use-sessions.test.tsx` → PASS.

- [ ] **Step 2: Failing layout assertion.** In `app-layout.test.tsx`, add
(using the file's own `user()`/`scopes` fixtures and the `mockScreens`
capture — if Plan 1 Task 0 renamed them, use its names):

```tsx
it("registers session/[id]/index as a hidden detail route", () => {
  useSessionStore.getState().setSession(user("ADMIN"), scopes);
  render(<AppLayout />);
  const detail = mockScreens.find((s) => s.name === "session/[id]/index");
  expect(detail).toBeDefined();
  expect(detail?.href).toBeNull();
});
```

Run `cd apps/mobile && pnpm jest src/__tests__/app-layout.test.tsx` → FAIL.

- [ ] **Step 3: Stub + const.** `apps/mobile/app/(app)/session/[id]/index.tsx`
(three levels below `app/`, so `../../../../src/...`):

```tsx
import { useLocalSearchParams } from "expo-router";

import { Screen, Text } from "../../../../src/ui";

export default function SessionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Screen edges={["top", "left", "right"]}>
      <Text variant="heading">Session {id}</Text>
    </Screen>
  );
}
```

Append `"session/[id]/index"` to `DETAIL_ROUTE_NAMES` in `_layout.tsx` (keep
every existing entry). Run `pnpm turbo routes:generate --filter=@space/mobile`,
then the layout test → PASS. No count literal is touched (ruling X9).

- [ ] **Step 4: Failing hook + helper tests.**

```tsx
// apps/mobile/src/__tests__/use-seasons.test.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn() } }));

import { apiClient } from "../lib/api-client";
import { pickCurrentSeasonId, useCurrentSeasonId } from "../hooks/use-seasons";
import { useSessionStore } from "../store/session";

const get = apiClient.get as jest.Mock;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const row = (id: number, year: number, status: "DRAFT" | "ACTIVE" | "COMPLETED" | "ARCHIVED") => ({
  id, code: `s${id}`, title: `Season ${id}`, program: "TEST", year, status,
  startDate: `${year}-01-01T00:00:00.000Z`, endDate: `${year}-12-31T00:00:00.000Z`,
});

const scopes = (activeSeasonId: number | null) => ({
  seasonAdminIds: [] as number[], groupLeaderIds: [] as number[], activeSeasonId, graduationYear: null,
});

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("pickCurrentSeasonId (v1: latest-starting ACTIVE, else latest-starting — spec 19 D9)", () => {
  it("prefers an ACTIVE season over a newer non-ACTIVE one", () => {
    expect(pickCurrentSeasonId([row(8, 2027, "DRAFT"), row(7, 2026, "ACTIVE")])).toBe(7);
  });
  it("picks the latest-starting of two ACTIVE seasons in one year, not the first listed", () => {
    // The API lists `year desc, title asc`, so "Autumn" (Sep start) precedes
    // "Spring" (Feb start) alphabetically. v1's orderBy startDate desc picks
    // Autumn; so must we — but listed the other way round, to prove the hook
    // sorts instead of trusting order.
    const spring = { ...row(10, 2026, "ACTIVE"), title: "Spring", startDate: "2026-02-01T00:00:00.000Z" };
    const autumn = { ...row(11, 2026, "ACTIVE"), title: "Autumn", startDate: "2026-09-01T00:00:00.000Z" };
    expect(pickCurrentSeasonId([spring, autumn])).toBe(11);
    expect(pickCurrentSeasonId([autumn, spring])).toBe(11);
  });
  it("falls back to the latest-starting season when none is ACTIVE", () => {
    expect(pickCurrentSeasonId([row(7, 2026, "ARCHIVED"), row(8, 2027, "DRAFT")])).toBe(8);
  });
  it("is null for an empty list", () => {
    expect(pickCurrentSeasonId([])).toBeNull();
  });
});

describe("useCurrentSeasonId", () => {
  it("returns a student's pinned season and never fetches the seasons list", async () => {
    useSessionStore.setState({
      user: { id: 9, name: "S", email: "s@jpc.test", role: "STUDENT", avatarPath: null },
      scopes: scopes(7),
    });
    const { result } = renderHook(() => useCurrentSeasonId(), { wrapper });
    expect(result.current).toMatchObject({ seasonId: 7, isPending: false, isError: false });
    expect(get).not.toHaveBeenCalled();
  });

  it("derives a staff member's season from the role-scoped list — staff have no pin (X8)", async () => {
    useSessionStore.setState({
      user: { id: 2, name: "A", email: "a@jpc.test", role: "ADMIN", avatarPath: null },
      scopes: scopes(null),
    });
    get.mockResolvedValue({ data: { data: { seasons: [row(8, 2027, "DRAFT"), row(7, 2026, "ACTIVE")] } } });
    const { result } = renderHook(() => useCurrentSeasonId(), { wrapper });
    await waitFor(() => expect(result.current.seasonId).toBe(7));
    expect(get).toHaveBeenCalledWith("/api/v1/seasons");
  });

  it("reports an error instead of a silent 'no season' when the list fails", async () => {
    useSessionStore.setState({
      user: { id: 2, name: "A", email: "a@jpc.test", role: "ADMIN", avatarPath: null },
      scopes: scopes(null),
    });
    get.mockRejectedValue(new Error("network down"));
    const { result } = renderHook(() => useCurrentSeasonId(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.seasonId).toBeNull();
  });
});
```

```ts
// apps/mobile/src/__tests__/api-error.test.ts
import { apiErrorMessage } from "../lib/api-error";

describe("apiErrorMessage", () => {
  it("returns the envelope's message from an axios error", () => {
    const err = Object.assign(new Error("409"), {
      isAxiosError: true,
      response: { status: 409, data: { error: { code: "code_taken", message: "A season with that code already exists." } } },
    });
    expect(apiErrorMessage(err, "fallback")).toBe("A season with that code already exists.");
  });

  it("falls back for a network error or a body that is not the envelope", () => {
    const network = Object.assign(new Error("Network Error"), { isAxiosError: true, response: undefined });
    expect(apiErrorMessage(network, "Couldn't save.")).toBe("Couldn't save.");
    const html = Object.assign(new Error("502"), { isAxiosError: true, response: { status: 502, data: "<html>" } });
    expect(apiErrorMessage(html, "Couldn't save.")).toBe("Couldn't save.");
    expect(apiErrorMessage(new Error("boom"), "Couldn't save.")).toBe("Couldn't save.");
  });
});
```

Append to `format.test.ts` (and add `formatDayKey` to its import):

```ts
describe("formatDayKey", () => {
  it("renders the server's org-calendar day without shifting it into the device zone", () => {
    // The key is already the org's day (ruling X13); formatting must not move it.
    expect(formatDayKey("2099-03-01")).toBe("Mar 1, 2099");
    expect(formatDayKey("2099-12-31")).toBe("Dec 31, 2099");
  });
  it("returns the placeholder for null or a malformed key", () => {
    expect(formatDayKey(null)).toBe("—");
    expect(formatDayKey("not-a-day")).toBe("—");
  });
});
```

Run `cd apps/mobile && pnpm jest src/__tests__/use-seasons.test.tsx src/__tests__/api-error.test.ts src/__tests__/format.test.ts` → FAIL (modules/exports missing).

- [ ] **Step 5: Implement.**

`apps/mobile/src/lib/query-keys.ts` — add a `seasons` factory and a `detail`
leaf in `sessions`, both taking `number | null` (the file's own rule: a null
key cannot collide with a real id; no `-1` sentinels):

```ts
  seasons: {
    all: ["seasons"] as const,
    list: () => [...queryKeys.seasons.all, "list"] as const,
    detail: (id: number | null) => [...queryKeys.seasons.all, "detail", { id }] as const,
  },
```

and inside `sessions`:
`detail: (id: number | null) => [...queryKeys.sessions.all, "detail", { id }] as const,`

`apps/mobile/src/hooks/use-seasons.ts`:

```ts
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { z } from "zod";
import {
  seasonDetailSchema,
  seasonListItemSchema,
  type SeasonDetail,
  type SeasonListItem,
} from "@space/shared";

import { apiClient } from "../lib/api-client";
import { queryKeys } from "../lib/query-keys";
import { useSessionStore } from "../store/session";

const seasonListSchema = z.array(seasonListItemSchema);

export function useSeasons(enabled = true): UseQueryResult<SeasonListItem[]> {
  return useQuery({
    queryKey: queryKeys.seasons.list(),
    queryFn: async () => {
      const res = await apiClient.get("/api/v1/seasons");
      return seasonListSchema.parse(res.data.data.seasons);
    },
    enabled,
  });
}

export function useSeasonDetail(id: number | null): UseQueryResult<SeasonDetail> {
  return useQuery({
    queryKey: queryKeys.seasons.detail(id),
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/seasons/${id}`);
      return seasonDetailSchema.parse(res.data.data);
    },
    enabled: id !== null,
  });
}

/**
 * v1's rule, verbatim in effect (spec 02 D11; spec 19 R18/D9): the ACTIVE
 * season with the latest `startDate`, else ANY season with the latest
 * `startDate` — `jpc-space/src/app/admin/calendar/page.tsx:18-26` and
 * `app/admin/dashboard/page.tsx:22-30` both run
 * `findFirst({ where: { ..., status: "ACTIVE" }, orderBy: { startDate: "desc" } })`
 * then the same without the status filter.
 *
 * It sorts here rather than trusting list order: `GET /api/v1/seasons` is
 * ordered `year desc, title asc`, so two ACTIVE seasons in one year would
 * otherwise resolve alphabetically, not to the latest-starting one. ISO
 * strings of one format compare correctly as strings. Exported so the rule is
 * tested on its own, not only through a screen.
 */
export function pickCurrentSeasonId(seasons: SeasonListItem[]): number | null {
  const latestFirst = [...seasons].sort((a, b) =>
    a.startDate < b.startDate ? 1 : a.startDate > b.startDate ? -1 : 0,
  );
  const active = latestFirst.find((s) => s.status === "ACTIVE");
  return (active ?? latestFirst[0])?.id ?? null;
}

export interface CurrentSeason {
  seasonId: number | null;
  isPending: boolean;
  isError: boolean;
  refetch: () => void;
}

/**
 * Which season "now" means for this user — the one place every staff screen
 * gets it (ruling X8).
 *
 * A student's is pinned by the server (`scopes.activeSeasonId`, read from
 * their StudentProfile). Staff have no such pin — `activeSeasonId` is ALWAYS
 * null for ADMIN/LEADER/SUPER/MENTOR — so theirs is derived from the
 * role-scoped seasons list the API already returns. Defined once here instead
 * of copy-pasted per screen the way v1 did it across three pages. The list
 * query is disabled for students, so their path costs no request.
 */
export function useCurrentSeasonId(): CurrentSeason {
  const role = useSessionStore((s) => s.user?.role ?? null);
  const pinned = useSessionStore((s) => s.scopes?.activeSeasonId ?? null);
  const isStudent = role === "STUDENT";
  const seasons = useSeasons(role !== null && !isStudent);

  const refetch = () => {
    if (role !== null && !isStudent) void seasons.refetch();
  };

  if (role === null) return { seasonId: null, isPending: false, isError: false, refetch };
  if (isStudent) return { seasonId: pinned, isPending: false, isError: false, refetch };
  if (seasons.isPending) return { seasonId: null, isPending: true, isError: false, refetch };
  if (seasons.isError) return { seasonId: null, isPending: false, isError: true, refetch };
  return { seasonId: pickCurrentSeasonId(seasons.data), isPending: false, isError: false, refetch };
}
```

`apps/mobile/src/lib/api-error.ts`:

```ts
import axios from "axios";
import { apiErrorBodySchema } from "@space/shared";

/**
 * The server's own message for a failed request, or `fallback`.
 *
 * Parsed against the envelope schema rather than read by cast: a 502 from a
 * proxy (HTML body) or a network error (no response) must not render
 * "undefined" on a form.
 */
export function apiErrorMessage(err: unknown, fallback: string): string {
  if (!axios.isAxiosError(err)) return fallback;
  const parsed = apiErrorBodySchema.safeParse(err.response?.data);
  return parsed.success ? parsed.data.error.message : fallback;
}
```

`apps/mobile/src/lib/format.ts` — add `parse` to the date-fns import and append:

```ts
/**
 * e.g. "Mar 1, 2099" — an org-calendar day key ("2099-03-01") from the server.
 *
 * No timezone conversion happens here, deliberately: the server already
 * resolved which day the instant belongs to in the org timezone (ruling X13).
 * `parse` builds a local-midnight Date from the key's own Y-M-D, and `format`
 * reads the same Y-M-D back, so the day cannot move whatever the device zone.
 */
export function formatDayKey(dayKey: string | null): string {
  if (dayKey == null) return PLACEHOLDER;
  const date = parse(dayKey, "yyyy-MM-dd", new Date());
  if (!isValid(date)) return PLACEHOLDER;
  return format(date, "MMM d, yyyy");
}
```

Run the three test files → PASS.

- [ ] **Step 6:** `pnpm turbo lint typecheck test:unit --filter=@space/mobile --filter=@space/shared` → clean.

- [ ] **Step 7: Commit** — `git add apps/mobile && git commit -m "feat(mobile): session detail route, season hooks, error and day-key helpers"`

---

### Task 3: Calendar — one route, every role

**Files:**
- Modify: `apps/mobile/app/(app)/calendar.tsx` (replace placeholder)
- Test: `apps/mobile/src/__tests__/calendar-screen.test.tsx`
- Modify: `apps/mobile/src/__tests__/placeholder-screens.test.tsx` (remove the `calendar` entry and its import — no count to change, ruling X9)

**Interfaces:**
- Consumes: `useCurrentSeasonId` (Task 2), `useSeasonSessions` (Phase 0), `formatDayKey`, `formatSessionTime`.
- Produces: nothing downstream; this is the D1 worked example. Plan 10 merges events into this screen; Plan 16 adds the multi-season variant.

- [ ] **Step 1: Failing test.** The load-bearing assertion: **two different
roles render real content from the same route file**, and days are grouped by
the server's `dayKey`, not by the device's reading of `startsAt`.

```tsx
// apps/mobile/src/__tests__/calendar-screen.test.tsx
import { fireEvent, screen } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn() } }));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import CalendarScreen from "../../app/(app)/calendar";

const get = apiClient.get as jest.Mock;

const session = (id: number, title: string, startsAt: string, dayKey: string) => ({
  id, title, startsAt, dayKey, durationMinutes: 60, location: null, recurrenceGroupId: null,
  attendanceMarked: false, seasonId: 7, seasonCode: "S26", seasonTitle: "Spring 2026",
  checkInToken: null, checkInOpenAt: null, checkInClosedAt: null,
});

const seasonRow = (id: number, year: number, status: "DRAFT" | "ACTIVE") => ({
  id, code: `S${id}`, title: `Season ${id}`, program: "TEST", year, status,
  startDate: `${year}-01-01T00:00:00.000Z`, endDate: `${year}-12-31T00:00:00.000Z`,
});

const studentSession = {
  user: { id: 9, name: "S", email: "s@jpc.test", role: "STUDENT" as const, avatarPath: null },
  scopes: { seasonAdminIds: [], groupLeaderIds: [], activeSeasonId: 7, graduationYear: null },
};
const adminSession = {
  user: { id: 2, name: "A", email: "a@jpc.test", role: "ADMIN" as const, avatarPath: null },
  scopes: { seasonAdminIds: [7, 8], groupLeaderIds: [], activeSeasonId: null, graduationYear: null },
};

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

it("renders a student's calendar from their pinned season, grouped by the server's dayKey", async () => {
  useSessionStore.setState(studentSession);
  get.mockResolvedValue({
    data: { data: { sessions: [
      session(1, "Kickoff", "2099-03-01T18:00:00.000Z", "2099-03-01"),
      // 23:30Z on the 1st is 01:30 on the 2nd in Cairo: the server keyed it to
      // the 2nd. A device-zone grouping in UTC would put it under the 1st.
      session(2, "Late night", "2099-03-01T23:30:00.000Z", "2099-03-02"),
      session(3, "Week two", "2099-03-08T18:00:00.000Z", "2099-03-08"),
    ] } },
  });

  renderWithProviders(<CalendarScreen />);

  expect(await screen.findByText("Kickoff")).toBeTruthy();
  expect(screen.getByText("Mar 1, 2099")).toBeTruthy();
  expect(screen.getByText("Mar 2, 2099")).toBeTruthy();
  expect(screen.getByText("Mar 8, 2099")).toBeTruthy();
  // The student never fetched the seasons list — their season is pinned.
  expect(get).not.toHaveBeenCalledWith("/api/v1/seasons");
  expect(get).toHaveBeenCalledWith("/api/v1/seasons/7/sessions");
});

it("renders an admin's calendar from their first ACTIVE season — same route file", async () => {
  useSessionStore.setState(adminSession);
  get.mockImplementation((url: string) =>
    url === "/api/v1/seasons"
      ? Promise.resolve({
          // A NEWER non-ACTIVE season listed first: "newest" and "first ACTIVE"
          // disagree here, so the preference is actually exercised.
          data: { data: { seasons: [seasonRow(8, 2027, "DRAFT"), seasonRow(7, 2026, "ACTIVE")] } },
        })
      : Promise.resolve({
          data: { data: { sessions: [session(1, "Kickoff", "2099-03-01T18:00:00.000Z", "2099-03-01")] } },
        }),
  );

  renderWithProviders(<CalendarScreen />);

  expect(await screen.findByText("Kickoff")).toBeTruthy();
  expect(get).toHaveBeenCalledWith("/api/v1/seasons/7/sessions");
  expect(get).not.toHaveBeenCalledWith("/api/v1/seasons/8/sessions");
});

it("shows an empty state for a student with no season and fetches nothing", async () => {
  useSessionStore.setState({ ...studentSession, scopes: { ...studentSession.scopes, activeSeasonId: null } });

  renderWithProviders(<CalendarScreen />);

  expect(await screen.findByText("No season to show")).toBeTruthy();
  expect(get).not.toHaveBeenCalled();
});

it("navigates to session detail on press", async () => {
  useSessionStore.setState(studentSession);
  get.mockResolvedValue({
    data: { data: { sessions: [session(1, "Kickoff", "2099-03-01T18:00:00.000Z", "2099-03-01")] } },
  });

  renderWithProviders(<CalendarScreen />);
  fireEvent.press(await screen.findByText("Kickoff"));

  expect(mockPush).toHaveBeenCalledWith({ pathname: "/session/[id]", params: { id: "1" } });
});
```

Run `cd apps/mobile && pnpm jest src/__tests__/calendar-screen.test.tsx` → FAIL.

- [ ] **Step 2: Implement** — replace `apps/mobile/app/(app)/calendar.tsx`:

```tsx
import type { ReactNode } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import type { SessionListItem } from "@space/shared";

import { useCurrentSeasonId } from "../../src/hooks/use-seasons";
import { useSeasonSessions } from "../../src/hooks/use-sessions";
import { formatDayKey, formatSessionTime } from "../../src/lib/format";
import { useTheme } from "../../src/theme";
import { Card, EmptyState, ErrorState, LoadingState, Screen, Text } from "../../src/ui";

interface DayGroup {
  dayKey: string;
  sessions: SessionListItem[];
}

/**
 * Groups by the server's `dayKey` (ruling X13) — never by formatting
 * `startsAt` here, which would use the device zone. The API returns sessions
 * ordered by `startsAt`, so consecutive rows with the same key are one day.
 */
function groupByDay(sessions: SessionListItem[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const s of sessions) {
    const last = groups[groups.length - 1];
    if (last && last.dayKey === s.dayKey) last.sessions.push(s);
    else groups.push({ dayKey: s.dayKey, sessions: [s] });
  }
  return groups;
}

export default function CalendarScreen() {
  // Decision D1's worked example: there is no role switch in this file. Which
  // season, and which sessions, are entirely the server's role-scoped answers.
  const theme = useTheme();
  const router = useRouter();
  const current = useCurrentSeasonId();
  const sessions = useSeasonSessions(current.seasonId);

  const handleRefresh = () => {
    if (current.seasonId !== null) void sessions.refetch();
    else current.refetch();
  };

  let body: ReactNode;
  if (current.isPending) {
    body = <LoadingState />;
  } else if (current.isError) {
    body = <ErrorState message="Couldn't load your seasons." onRetry={current.refetch} />;
  } else if (current.seasonId === null) {
    body = (
      <EmptyState
        title="No season to show"
        message="You aren't in a season right now, so there are no sessions on your calendar."
      />
    );
  } else if (sessions.isPending) {
    body = <LoadingState />;
  } else if (sessions.isError) {
    body = (
      <ErrorState
        message="Couldn't load sessions. Check your connection and try again."
        onRetry={() => void sessions.refetch()}
      />
    );
  } else if (sessions.data.length === 0) {
    body = <EmptyState title="No sessions" message="This season doesn't have any sessions yet." />;
  } else {
    body = groupByDay(sessions.data).map((group) => (
      <View key={group.dayKey} style={{ marginBottom: theme.spacing.md }}>
        <Text variant="heading">{formatDayKey(group.dayKey)}</Text>
        {group.sessions.map((s) => (
          <Card
            key={s.id}
            style={{ marginTop: theme.spacing.sm }}
            onPress={() => router.push({ pathname: "/session/[id]", params: { id: String(s.id) } })}
          >
            <Text variant="body">{s.title}</Text>
            <Text variant="label" color={theme.colors.neutral[600]}>
              {s.location ? `${formatSessionTime(s.startsAt)} · ${s.location}` : formatSessionTime(s.startsAt)}
            </Text>
          </Card>
        ))}
      </View>
    ));
  }

  return (
    <Screen
      edges={["top", "left", "right"]}
      scroll
      onRefresh={handleRefresh}
      refreshing={sessions.isRefetching}
    >
      {body}
    </Screen>
  );
}
```

- [ ] **Step 3:** Remove `calendar` (entry and import) from
`placeholder-screens.test.tsx`; run
`cd apps/mobile && pnpm jest src/__tests__/calendar-screen.test.tsx src/__tests__/placeholder-screens.test.tsx` → PASS;
`pnpm turbo lint typecheck test:unit --filter=@space/mobile` → clean.

- [ ] **Step 4: Commit** — `git add apps/mobile && git commit -m "feat(mobile): shared calendar grouped by org-calendar day — the D1 worked example"`

---

### Task 4: Seasons list and season workspace

**Files:**
- Modify: `apps/mobile/app/(app)/seasons.tsx`, `apps/mobile/app/(app)/season.tsx` (replace placeholders)
- Create: `apps/mobile/src/hooks/use-season-writes.ts`
- Test: `apps/mobile/src/__tests__/season-screens.test.tsx`
- Modify: `apps/mobile/src/__tests__/placeholder-screens.test.tsx` (remove `season` and `seasons` entries and imports — no count to change)

**Interfaces:**
- Consumes: `useSeasons`, `useSeasonDetail`, `useCurrentSeasonId`, `apiErrorMessage` (Task 2); `seasonRefResponseSchema`, `seasonDeletedResponseSchema` (Task 1); Plan 3's endpoints and `SeasonWriteBody` input shape.
- Produces: `useCreateSeason()`, `useDuplicateSeason(sourceId: number)`, `useUpdateSeason(id: number)`, `useDeleteSeason()` (each parses its response and invalidates `queryKeys.seasons.all`).

- [ ] **Step 1: Failing test.**

```tsx
// apps/mobile/src/__tests__/season-screens.test.tsx
import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import SeasonScreen from "../../app/(app)/season";
import SeasonsScreen from "../../app/(app)/seasons";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;
const patch = apiClient.patch as jest.Mock;
const del = apiClient.delete as jest.Mock;

const seasonRow = (id: number, year: number, status: "DRAFT" | "ACTIVE" | "ARCHIVED", title: string) => ({
  id, code: `s${id}`, title, program: "TEST", year, status,
  startDate: `${year}-01-01T00:00:00.000Z`, endDate: `${year}-12-31T00:00:00.000Z`,
});

const detail = {
  ...seasonRow(7, 2026, "ACTIVE", "Spring 2026"),
  description: "The spring season.",
  sessionCount: 3,
  studentCount: 12,
  groups: [{ id: 3, name: "Group A", studentCount: 6, leaderNames: ["Lina Leader"] }],
};

const scopes = (over: Partial<{ seasonAdminIds: number[]; activeSeasonId: number | null }> = {}) => ({
  seasonAdminIds: [] as number[], groupLeaderIds: [] as number[], activeSeasonId: null as number | null,
  graduationYear: null, ...over,
});
const superSession = {
  user: { id: 1, name: "Sup", email: "sup@jpc.test", role: "SUPER" as const, avatarPath: null },
  scopes: scopes(),
};
const adminSession = {
  user: { id: 2, name: "Adm", email: "adm@jpc.test", role: "ADMIN" as const, avatarPath: null },
  scopes: scopes({ seasonAdminIds: [7] }),
};
const studentSession = {
  user: { id: 9, name: "Stu", email: "stu@jpc.test", role: "STUDENT" as const, avatarPath: null },
  scopes: scopes({ activeSeasonId: 7 }),
};

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("SeasonsScreen (SUPER)", () => {
  beforeEach(() => {
    useSessionStore.setState(superSession);
    get.mockResolvedValue({
      data: { data: { seasons: [
        seasonRow(8, 2027, "DRAFT", "Spring 2027"),
        seasonRow(7, 2026, "ACTIVE", "Spring 2026"),
      ] } },
    });
  });

  it("lists seasons grouped by year with status badges", async () => {
    renderWithProviders(<SeasonsScreen />);
    expect(await screen.findByText("Spring 2027")).toBeTruthy();
    expect(screen.getByText("2027")).toBeTruthy();
    expect(screen.getByText("2026")).toBeTruthy();
    expect(screen.getByText("s8 · DRAFT")).toBeTruthy();
    expect(screen.getByText("s7 · ACTIVE")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/seasons");
  });

  it("duplicates a season through the inline form and parses the response", async () => {
    post.mockResolvedValue({ data: { data: { id: 99, code: "s7-2027" } } });
    renderWithProviders(<SeasonsScreen />);

    fireEvent.press((await screen.findAllByText("Duplicate"))[1]); // the 2026 row
    fireEvent.changeText(screen.getByLabelText("Copy year"), "2027");
    fireEvent.changeText(screen.getByLabelText("Copy start date"), "2027-01-01T00:00:00.000Z");
    fireEvent.changeText(screen.getByLabelText("Copy end date"), "2027-12-31T00:00:00.000Z");
    fireEvent.press(screen.getByText("Create copy"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/seasons/7/duplicate", {
        year: 2027,
        startDate: "2027-01-01T00:00:00.000Z",
        endDate: "2027-12-31T00:00:00.000Z",
      }),
    );
    expect(await screen.findByText("Created s7-2027.")).toBeTruthy();
  });

  it("creates a DRAFT season and shows a 409's server message verbatim", async () => {
    post.mockRejectedValue(
      Object.assign(new Error("409"), {
        isAxiosError: true,
        response: { status: 409, data: { error: { code: "code_taken", message: "A season with that code already exists." } } },
      }),
    );
    renderWithProviders(<SeasonsScreen />);

    await screen.findByText("Spring 2027");
    fireEvent.changeText(screen.getByLabelText("Code"), "spring-2028");
    fireEvent.changeText(screen.getByLabelText("Program"), "TEST");
    fireEvent.changeText(screen.getByLabelText("Year"), "2028");
    fireEvent.changeText(screen.getByLabelText("Start date"), "2028-01-01T00:00:00.000Z");
    fireEvent.changeText(screen.getByLabelText("End date"), "2028-12-31T00:00:00.000Z");
    fireEvent.press(screen.getByText("Create season"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/seasons", {
        code: "spring-2028",
        program: "TEST",
        year: 2028,
        startDate: "2028-01-01T00:00:00.000Z",
        endDate: "2028-12-31T00:00:00.000Z",
        status: "DRAFT",
      }),
    );
    expect(await screen.findByText("A season with that code already exists.")).toBeTruthy();
  });

  it("deletes only on a second, confirming press", async () => {
    del.mockResolvedValue({ data: { data: { deleted: true } } });
    renderWithProviders(<SeasonsScreen />);

    fireEvent.press((await screen.findAllByText("Delete"))[0]);
    expect(del).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText("Really delete?"));
    await waitFor(() => expect(del).toHaveBeenCalledWith("/api/v1/seasons/8"));
  });
});

describe("SeasonsScreen (non-SUPER)", () => {
  it("shows ADMIN the list without write actions", async () => {
    useSessionStore.setState(adminSession);
    get.mockResolvedValue({ data: { data: { seasons: [seasonRow(7, 2026, "ACTIVE", "Spring 2026")] } } });
    renderWithProviders(<SeasonsScreen />);
    expect(await screen.findByText("Spring 2026")).toBeTruthy();
    expect(screen.queryByText("Duplicate")).toBeNull();
    expect(screen.queryByText("Create season")).toBeNull();
  });

  it("gives a STUDENT the role empty state and fetches nothing", async () => {
    useSessionStore.setState(studentSession);
    renderWithProviders(<SeasonsScreen />);
    expect(await screen.findByText("Not available")).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  });
});

describe("SeasonScreen (workspace)", () => {
  it("renders an ADMIN's current season with counts, groups and the edit section", async () => {
    useSessionStore.setState(adminSession);
    get.mockImplementation((url: string) =>
      url === "/api/v1/seasons"
        ? Promise.resolve({ data: { data: { seasons: [seasonRow(7, 2026, "ACTIVE", "Spring 2026")] } } })
        : Promise.resolve({ data: { data: detail } }),
    );
    patch.mockResolvedValue({ data: { data: { id: 7, code: "s7" } } });

    renderWithProviders(<SeasonScreen />);

    expect(await screen.findByText("Spring 2026")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/seasons/7");
    expect(screen.getByText("3 sessions · 12 students")).toBeTruthy();
    expect(screen.getByText("Group A")).toBeTruthy();
    expect(screen.getByText("6 students · Lina Leader")).toBeTruthy();

    fireEvent.changeText(screen.getByLabelText("Description"), "Updated.");
    fireEvent.changeText(screen.getByLabelText("Absence budget (minutes)"), "240");
    fireEvent.press(screen.getByText("Save changes"));
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/api/v1/seasons/7", {
        description: "Updated.",
        absenceBudgetMinutes: 240,
      }),
    );
  });

  it("renders for a STUDENT from the pinned season, read-only, without the seasons list (G21)", async () => {
    useSessionStore.setState(studentSession);
    get.mockResolvedValue({ data: { data: detail } });

    renderWithProviders(<SeasonScreen />);

    expect(await screen.findByText("Spring 2026")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/seasons/7");
    expect(get).not.toHaveBeenCalledWith("/api/v1/seasons");
    expect(screen.queryByText("Save changes")).toBeNull();
  });

  it("shows a student with no season an empty state, not a spinner", async () => {
    useSessionStore.setState({ ...studentSession, scopes: scopes({ activeSeasonId: null }) });
    renderWithProviders(<SeasonScreen />);
    expect(await screen.findByText("No season")).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  });
});
```

Run `cd apps/mobile && pnpm jest src/__tests__/season-screens.test.tsx` → FAIL.

- [ ] **Step 2: Mutations.**

```ts
// apps/mobile/src/hooks/use-season-writes.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { seasonDeletedResponseSchema, seasonRefResponseSchema } from "@space/shared";

import { apiClient } from "../lib/api-client";
import { queryKeys } from "../lib/query-keys";

export interface CreateSeasonInput {
  code: string;
  program: string;
  year: number;
  startDate: string;
  endDate: string;
  /** The write schema requires it; a new season always starts as a draft. */
  status: "DRAFT";
}

export interface DuplicateSeasonInput {
  year: number;
  startDate: string;
  endDate: string;
  code?: string;
}

/** ADMIN's allowlist on PATCH /seasons/:id (Plan 3, spec 02 D3) — nothing else is sent. */
export interface UpdateSeasonInput {
  description?: string | null;
  absenceBudgetMinutes?: number;
  absenceWeightMinutes?: number;
}

function useInvalidateSeasons() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: queryKeys.seasons.all });
}

export function useCreateSeason() {
  const invalidate = useInvalidateSeasons();
  return useMutation({
    mutationFn: async (body: CreateSeasonInput) => {
      const res = await apiClient.post("/api/v1/seasons", body);
      return seasonRefResponseSchema.parse(res.data.data);
    },
    onSuccess: invalidate,
  });
}

export function useDuplicateSeason(sourceId: number) {
  const invalidate = useInvalidateSeasons();
  return useMutation({
    mutationFn: async (body: DuplicateSeasonInput) => {
      const res = await apiClient.post(`/api/v1/seasons/${sourceId}/duplicate`, body);
      return seasonRefResponseSchema.parse(res.data.data);
    },
    onSuccess: invalidate,
  });
}

export function useUpdateSeason(id: number) {
  const invalidate = useInvalidateSeasons();
  return useMutation({
    mutationFn: async (body: UpdateSeasonInput) => {
      const res = await apiClient.patch(`/api/v1/seasons/${id}`, body);
      return seasonRefResponseSchema.parse(res.data.data);
    },
    onSuccess: invalidate,
  });
}

export function useDeleteSeason() {
  const invalidate = useInvalidateSeasons();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await apiClient.delete(`/api/v1/seasons/${id}`);
      return seasonDeletedResponseSchema.parse(res.data.data);
    },
    onSuccess: invalidate,
  });
}
```

- [ ] **Step 3: `seasons.tsx`.**

```tsx
import { useState } from "react";
import { View } from "react-native";
import type { SeasonListItem } from "@space/shared";

import { useSeasons } from "../../src/hooks/use-seasons";
import {
  useCreateSeason,
  useDeleteSeason,
  useDuplicateSeason,
} from "../../src/hooks/use-season-writes";
import { apiErrorMessage } from "../../src/lib/api-error";
import { useSessionStore } from "../../src/store/session";
import { useTheme } from "../../src/theme";
import { Button, Card, EmptyState, ErrorState, Input, LoadingState, Screen, Text } from "../../src/ui";

/**
 * SUPER's seasons list (v1 /super/seasons + /super/seasons/new inline).
 * Rows do not navigate: opening an arbitrary season (seasons/[code]) and the
 * SUPER identity/status edit screen are Plan 16 (ruling X15). ADMIN and
 * MENTOR may reach this route and see the list read-only.
 */
const STAFF_ROLES = new Set(["SUPER", "ADMIN", "MENTOR"]);

function NewSeasonForm() {
  const theme = useTheme();
  const create = useCreateSeason();
  const [code, setCode] = useState("");
  const [program, setProgram] = useState("");
  const [year, setYear] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const submit = () => {
    setMessage(null);
    create.mutate(
      { code, program, year: Number(year), startDate, endDate, status: "DRAFT" },
      {
        onSuccess: (created) => setMessage(`Created ${created.code}.`),
        onError: (err) => setMessage(apiErrorMessage(err, "Couldn't create the season.")),
      },
    );
  };

  return (
    <Card style={{ marginBottom: theme.spacing.md, gap: theme.spacing.sm }}>
      <Text variant="heading">New season</Text>
      <Input label="Code" value={code} onChangeText={setCode} autoCapitalize="none" />
      <Input label="Program" value={program} onChangeText={setProgram} />
      <Input label="Year" value={year} onChangeText={setYear} keyboardType="number-pad" />
      {/* ISO text for now — a native date picker is polish, not this plan. */}
      <Input label="Start date" value={startDate} onChangeText={setStartDate} autoCapitalize="none" />
      <Input label="End date" value={endDate} onChangeText={setEndDate} autoCapitalize="none" />
      {message ? <Text variant="label">{message}</Text> : null}
      <Button title="Create season" onPress={submit} loading={create.isPending} />
    </Card>
  );
}

function DuplicateForm({ source }: { source: SeasonListItem }) {
  const theme = useTheme();
  const duplicate = useDuplicateSeason(source.id);
  const [year, setYear] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const submit = () => {
    setMessage(null);
    duplicate.mutate(
      { year: Number(year), startDate, endDate },
      {
        onSuccess: (created) => setMessage(`Created ${created.code}.`),
        onError: (err) => setMessage(apiErrorMessage(err, "Couldn't duplicate the season.")),
      },
    );
  };

  return (
    <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.sm }}>
      <Input label="Copy year" value={year} onChangeText={setYear} keyboardType="number-pad" />
      <Input label="Copy start date" value={startDate} onChangeText={setStartDate} autoCapitalize="none" />
      <Input label="Copy end date" value={endDate} onChangeText={setEndDate} autoCapitalize="none" />
      {message ? <Text variant="label">{message}</Text> : null}
      <Button title="Create copy" onPress={submit} loading={duplicate.isPending} />
    </View>
  );
}

function SeasonRow({ season, canWrite }: { season: SeasonListItem; canWrite: boolean }) {
  const theme = useTheme();
  const remove = useDeleteSeason();
  const [duplicating, setDuplicating] = useState(false);
  // RN has no window.confirm; the first press arms, the second deletes.
  const [armed, setArmed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const onDelete = () => {
    if (!armed) {
      setArmed(true);
      return;
    }
    remove.mutate(season.id, {
      onError: (err) => {
        setArmed(false);
        setMessage(apiErrorMessage(err, "Couldn't delete the season."));
      },
    });
  };

  return (
    <Card style={{ marginTop: theme.spacing.sm }}>
      <Text variant="body">{season.title}</Text>
      <Text variant="label" color={theme.colors.neutral[600]}>{`${season.code} · ${season.status}`}</Text>
      {canWrite ? (
        <View style={{ flexDirection: "row", gap: theme.spacing.sm, marginTop: theme.spacing.sm }}>
          <Button title="Duplicate" variant="secondary" onPress={() => setDuplicating((d) => !d)} />
          <Button title={armed ? "Really delete?" : "Delete"} variant="ghost" onPress={onDelete} loading={remove.isPending} />
        </View>
      ) : null}
      {message ? <Text variant="label" color={theme.colors.error[500]}>{message}</Text> : null}
      {canWrite && duplicating ? <DuplicateForm source={season} /> : null}
    </Card>
  );
}

export default function SeasonsScreen() {
  const theme = useTheme();
  const role = useSessionStore((s) => s.user?.role ?? null);
  const isStaff = role !== null && STAFF_ROLES.has(role);
  const isSuper = role === "SUPER";
  const seasons = useSeasons(isStaff);

  if (!isStaff) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <EmptyState title="Not available" message="The seasons list isn't available for your role." />
      </Screen>
    );
  }

  const years = seasons.data ? Array.from(new Set(seasons.data.map((s) => s.year))) : [];

  return (
    <Screen
      edges={["top", "left", "right"]}
      scroll
      onRefresh={() => void seasons.refetch()}
      refreshing={seasons.isRefetching}
    >
      {isSuper ? <NewSeasonForm /> : null}
      {seasons.isPending ? (
        <LoadingState />
      ) : seasons.isError ? (
        <ErrorState message="Couldn't load seasons." onRetry={() => void seasons.refetch()} />
      ) : seasons.data.length === 0 ? (
        <EmptyState title="No seasons" message="There are no seasons yet." />
      ) : (
        years.map((year) => (
          <View key={year} style={{ marginBottom: theme.spacing.md }}>
            <Text variant="heading">{String(year)}</Text>
            {seasons.data
              .filter((s) => s.year === year)
              .map((s) => (
                <SeasonRow key={s.id} season={s} canWrite={isSuper} />
              ))}
          </View>
        ))
      )}
    </Screen>
  );
}
```

- [ ] **Step 4: `season.tsx`.**

```tsx
import { useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import type { SeasonDetail } from "@space/shared";

import { useCurrentSeasonId, useSeasonDetail } from "../../src/hooks/use-seasons";
import { useUpdateSeason, type UpdateSeasonInput } from "../../src/hooks/use-season-writes";
import { apiErrorMessage } from "../../src/lib/api-error";
import { formatDate } from "../../src/lib/format";
import { useSessionStore } from "../../src/store/session";
import { useTheme } from "../../src/theme";
import { Button, Card, EmptyState, ErrorState, Input, LoadingState, Screen, Text } from "../../src/ui";

/**
 * The current-season workspace (v1 /admin/season, /student/season).
 *
 * Renders for ADMIN (with the allowlisted edit) and for STUDENT (read-only —
 * the server already narrows `groups` to the student's own). The richer
 * student content (upcoming sessions, group card with leaders) is Plan 14; a
 * route for any season other than the current one is Plan 16 (ruling X15).
 */
function EditSeason({ season }: { season: SeasonDetail }) {
  const theme = useTheme();
  const update = useUpdateSeason(season.id);
  const [description, setDescription] = useState(season.description ?? "");
  // The detail contract does not carry the two budget fields, so blank means
  // "leave unchanged" and only typed values are sent.
  const [budget, setBudget] = useState("");
  const [weight, setWeight] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const save = () => {
    const body: UpdateSeasonInput = { description: description.trim() === "" ? null : description };
    if (budget.trim() !== "") body.absenceBudgetMinutes = Number(budget);
    if (weight.trim() !== "") body.absenceWeightMinutes = Number(weight);
    setMessage(null);
    update.mutate(body, {
      onSuccess: () => setMessage("Saved."),
      onError: (err) => setMessage(apiErrorMessage(err, "Couldn't save the season.")),
    });
  };

  return (
    <Card style={{ marginTop: theme.spacing.md, gap: theme.spacing.sm }}>
      <Text variant="heading">Edit season</Text>
      <Input label="Description" value={description} onChangeText={setDescription} multiline />
      <Input label="Absence budget (minutes)" value={budget} onChangeText={setBudget} keyboardType="number-pad" />
      <Input label="Absence weight (minutes)" value={weight} onChangeText={setWeight} keyboardType="number-pad" />
      {message ? <Text variant="label">{message}</Text> : null}
      <Button title="Save changes" onPress={save} loading={update.isPending} />
    </Card>
  );
}

export default function SeasonScreen() {
  const theme = useTheme();
  const router = useRouter();
  const role = useSessionStore((s) => s.user?.role ?? null);
  const current = useCurrentSeasonId();
  const detail = useSeasonDetail(current.seasonId);
  const canEdit = role === "ADMIN" || role === "SUPER";

  const handleRefresh = () => {
    if (current.seasonId !== null) void detail.refetch();
    else current.refetch();
  };

  let body;
  if (current.isPending) body = <LoadingState />;
  else if (current.isError) body = <ErrorState message="Couldn't load your seasons." onRetry={current.refetch} />;
  else if (current.seasonId === null)
    body = <EmptyState title="No season" message="You aren't in a season right now." />;
  else if (detail.isPending) body = <LoadingState />;
  else if (detail.isError)
    body = <ErrorState message="Couldn't load this season." onRetry={() => void detail.refetch()} />;
  else {
    const s = detail.data;
    body = (
      <>
        <Card>
          <Text variant="title">{s.title}</Text>
          <Text variant="label" color={theme.colors.neutral[600]}>{`${s.code} · ${s.status}`}</Text>
          <Text variant="label" color={theme.colors.neutral[600]}>
            {`${formatDate(s.startDate)} – ${formatDate(s.endDate)}`}
          </Text>
          {s.description ? <Text variant="body">{s.description}</Text> : null}
          <Text variant="label">{`${s.sessionCount} sessions · ${s.studentCount} students`}</Text>
        </Card>
        <Card style={{ marginTop: theme.spacing.md }}>
          <Text variant="heading">Groups</Text>
          {s.groups.length === 0 ? (
            <Text variant="body" color={theme.colors.neutral[600]}>No groups yet.</Text>
          ) : (
            s.groups.map((g) => (
              <View key={g.id} style={{ marginTop: theme.spacing.sm }}>
                <Text variant="body">{g.name}</Text>
                <Text variant="caption" color={theme.colors.neutral[600]}>
                  {g.leaderNames.length > 0
                    ? `${g.studentCount} students · ${g.leaderNames.join(", ")}`
                    : `${g.studentCount} students`}
                </Text>
              </View>
            ))
          )}
        </Card>
        <View style={{ flexDirection: "row", gap: theme.spacing.sm, marginTop: theme.spacing.md }}>
          <Button title="Calendar" variant="secondary" onPress={() => router.push("/calendar")} />
          <Button title="Assignments" variant="secondary" onPress={() => router.push("/assignments")} />
        </View>
        {canEdit ? <EditSeason season={s} /> : null}
      </>
    );
  }

  return (
    <Screen edges={["top", "left", "right"]} scroll onRefresh={handleRefresh} refreshing={detail.isRefetching}>
      {body}
    </Screen>
  );
}
```

- [ ] **Step 5:** Remove `season` and `seasons` (entries + imports) from
`placeholder-screens.test.tsx`; run
`cd apps/mobile && pnpm jest src/__tests__/season-screens.test.tsx src/__tests__/placeholder-screens.test.tsx` → PASS;
`pnpm turbo lint typecheck test:unit --filter=@space/mobile` → clean.

- [ ] **Step 6: Commit** — `git add apps/mobile && git commit -m "feat(mobile): seasons list and current-season workspace with write actions"`

---

### Task 5: Session detail — admin console, leader live roster, student status

**Files:**
- Modify: `apps/mobile/app/(app)/session/[id]/index.tsx` (replace stub)
- Create: `apps/mobile/src/hooks/use-session-detail.ts`
- Modify: `apps/mobile/package.json` (deps), `apps/mobile/jest.config.js` (only if Step 1 needs it)
- Test: `apps/mobile/src/__tests__/session-detail.test.tsx`

**Interfaces:**
- Consumes: `sessionDetailSchema`, `checkInOpenResponseSchema`, `checkInCloseResponseSchema` (Task 1); `queryKeys.sessions` (Task 2); `useSeasonSessions` (Phase 0); `useAttendanceRoster` from `src/hooks/use-attendance.ts` (Plan 2); `apiErrorMessage` (Task 2); Plan 2's `/session/[id]/attendance` route.
- Produces: `useSessionDetail(id: number | null)`, `useOpenCheckIn(id: number)` (returns the mutation plus `token`), `useCloseCheckIn(id: number)`; `LIVE_ROSTER_REFRESH_MS = 10_000`.

- [ ] **Step 1: Install the QR deps** (Expo-managed versions):
`cd apps/mobile && npx expo install react-native-svg && pnpm add react-native-qrcode-svg`.
In tests the component is mocked (`jest.mock("react-native-qrcode-svg", () => "QRCode")`),
so the suite never imports it. If the *app's* import still trips Jest's
transform (it should not, given the mock), add `react-native-qrcode-svg` to the
`transformIgnorePatterns` allowlist in `jest.config.js`.

- [ ] **Step 2: Failing test.**

```tsx
// apps/mobile/src/__tests__/session-detail.test.tsx
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn(), post: jest.fn() } }));
jest.mock("react-native-qrcode-svg", () => "QRCode");
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "12" }),
  useRouter: () => ({ push: mockPush }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import SessionDetailScreen from "../../app/(app)/session/[id]/index";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;

const baseDetail = {
  id: 12, title: "Week 3", description: "Bring your notebook.",
  startsAt: "2099-03-15T18:00:00.000Z", durationMinutes: 90, location: "Hall B",
  youtubeUrl: null, recurrenceGroupId: null, seasonId: 7, seasonCode: "s7", seasonTitle: "Spring",
  checkInOpen: false, myAttendance: null, canMarkAttendance: false, canManageCheckIn: false,
};

const listRow = (checkInToken: string | null) => ({
  id: 12, title: "Week 3", startsAt: "2099-03-15T18:00:00.000Z", dayKey: "2099-03-15",
  durationMinutes: 90, location: "Hall B", recurrenceGroupId: null, attendanceMarked: false,
  seasonId: 7, seasonCode: "s7", seasonTitle: "Spring", checkInToken,
  checkInOpenAt: null, checkInClosedAt: null,
});

const user = (id: number, role: "STUDENT" | "ADMIN" | "LEADER") => ({
  id, name: role, email: `${role.toLowerCase()}@jpc.test`, role, avatarPath: null,
});
const scopes = (over: Partial<{ seasonAdminIds: number[]; groupLeaderIds: number[]; activeSeasonId: number | null }> = {}) => ({
  seasonAdminIds: [] as number[], groupLeaderIds: [] as number[], activeSeasonId: null as number | null,
  graduationYear: null, ...over,
});

/** Routes GETs by URL; `detail` is read at call time so a test can flip it mid-flight. */
function routeGets(state: { detail: typeof baseDetail; token: string | null; roster?: unknown[] }) {
  get.mockImplementation((url: string) => {
    if (url === "/api/v1/sessions/12") return Promise.resolve({ data: { data: state.detail } });
    if (url === "/api/v1/seasons/7/sessions")
      return Promise.resolve({ data: { data: { sessions: [listRow(state.token)] } } });
    if (url === "/api/v1/sessions/12/attendance")
      return Promise.resolve({ data: { data: { roster: state.roster ?? [] } } });
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

it("shows a student their header and attendance, and no check-in card (C4: flags drive the UI)", async () => {
  useSessionStore.setState({ user: user(9, "STUDENT"), scopes: scopes({ activeSeasonId: 7 }) });
  routeGets({
    detail: { ...baseDetail, myAttendance: { status: "LATE", notes: null, lateMinutes: 10, checkedInAt: null } },
    token: null,
  });

  renderWithProviders(<SessionDetailScreen />);

  expect(await screen.findByText("Week 3")).toBeTruthy();
  expect(screen.getByText("Hall B")).toBeTruthy();
  expect(screen.getByText("Bring your notebook.")).toBeTruthy();
  expect(screen.getByText("Your attendance: Late (10 min)")).toBeTruthy();
  expect(screen.queryByText("Check-in")).toBeNull();
  expect(screen.queryByText("Open check-in")).toBeNull();
  expect(screen.queryByText("Mark attendance")).toBeNull();
});

it("lets a season admin open check-in and shows the QR from the open response", async () => {
  useSessionStore.setState({ user: user(2, "ADMIN"), scopes: scopes({ seasonAdminIds: [7] }) });
  const state = {
    detail: { ...baseDetail, canMarkAttendance: true, canManageCheckIn: true },
    token: null as string | null,
  };
  routeGets(state);
  post.mockImplementation(() => {
    state.detail = { ...state.detail, checkInOpen: true };
    return Promise.resolve({ data: { data: { checkInToken: "tok123" } } });
  });

  renderWithProviders(<SessionDetailScreen />);

  fireEvent.press(await screen.findByText("Open check-in"));
  await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/sessions/12/check-in-open"));
  expect(await screen.findByText("Code: tok123")).toBeTruthy();
  expect(await screen.findByText("Close check-in")).toBeTruthy();
});

it("shows an admin the QR of an already-open session without reopening (token from the staff session list)", async () => {
  useSessionStore.setState({ user: user(2, "ADMIN"), scopes: scopes({ seasonAdminIds: [7] }) });
  routeGets({
    detail: { ...baseDetail, checkInOpen: true, canMarkAttendance: true, canManageCheckIn: true },
    token: "tokABC",
  });
  post.mockResolvedValue({ data: { data: { closed: true } } });

  renderWithProviders(<SessionDetailScreen />);

  expect(await screen.findByText("Code: tokABC")).toBeTruthy();
  fireEvent.press(screen.getByText("Close check-in"));
  await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/sessions/12/check-in-close"));

  fireEvent.press(screen.getByText("Mark attendance"));
  expect(mockPush).toHaveBeenCalledWith({ pathname: "/session/[id]/attendance", params: { id: "12" } });
});

it("gives a leader a read-only live roster — no open/close (spec 04 §9 row 2, G18)", async () => {
  useSessionStore.setState({ user: user(5, "LEADER"), scopes: scopes({ groupLeaderIds: [3] }) });
  routeGets({
    detail: { ...baseDetail, checkInOpen: true, canMarkAttendance: true, canManageCheckIn: false },
    token: "never-shown",
    roster: [
      { studentUserId: 21, name: "Sara Student", email: "sara@jpc.test", groupName: "Group A",
        status: "PRESENT", notes: null, lateMinutes: null },
      { studentUserId: 22, name: "Omar Student", email: "omar@jpc.test", groupName: "Group A",
        status: null, notes: null, lateMinutes: null },
    ],
  });

  renderWithProviders(<SessionDetailScreen />);

  expect(await screen.findByText("Sara Student")).toBeTruthy();
  expect(screen.getByText("Check-in is open")).toBeTruthy();
  expect(screen.getByText("Present")).toBeTruthy();
  expect(screen.getByText("Not checked in")).toBeTruthy();
  expect(screen.queryByText("Open check-in")).toBeNull();
  expect(screen.queryByText("Close check-in")).toBeNull();
  expect(screen.queryByText(/Code:/)).toBeNull();
  // The leader never pulls the season list just to find a token they may not use.
  expect(get).not.toHaveBeenCalledWith("/api/v1/seasons/7/sessions");
  expect(screen.getByText("Mark attendance")).toBeTruthy();
});

it("refreshes the leader's roster every 10 seconds while check-in is open", async () => {
  jest.useFakeTimers();
  try {
    useSessionStore.setState({ user: user(5, "LEADER"), scopes: scopes({ groupLeaderIds: [3] }) });
    routeGets({
      detail: { ...baseDetail, checkInOpen: true, canMarkAttendance: true, canManageCheckIn: false },
      token: null,
      roster: [],
    });
    const rosterCalls = () =>
      get.mock.calls.filter(([url]) => url === "/api/v1/sessions/12/attendance").length;

    renderWithProviders(<SessionDetailScreen />);
    expect(await screen.findByText("Check-in is open")).toBeTruthy();
    await waitFor(() => expect(rosterCalls()).toBe(1));

    await act(async () => {
      jest.advanceTimersByTime(10_000);
    });
    await waitFor(() => expect(rosterCalls()).toBe(2));
  } finally {
    jest.useRealTimers();
  }
});
```

Run `cd apps/mobile && pnpm jest src/__tests__/session-detail.test.tsx` → FAIL.

- [ ] **Step 3: Hooks.**

```ts
// apps/mobile/src/hooks/use-session-detail.ts
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { useState } from "react";
import {
  checkInCloseResponseSchema,
  checkInOpenResponseSchema,
  sessionDetailSchema,
  type SessionDetail,
} from "@space/shared";

import { apiClient } from "../lib/api-client";
import { queryKeys } from "../lib/query-keys";

export function useSessionDetail(id: number | null): UseQueryResult<SessionDetail> {
  return useQuery({
    queryKey: queryKeys.sessions.detail(id),
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/sessions/${id}`);
      return sessionDetailSchema.parse(res.data.data);
    },
    enabled: id !== null,
  });
}

/**
 * Returns the token alongside the mutation: the open call's response is the
 * freshest copy. After a restart the console reads the same token from the
 * staff session list instead (see CheckInConsole) — the detail endpoint
 * deliberately never serves it.
 */
export function useOpenCheckIn(id: number) {
  const queryClient = useQueryClient();
  const [token, setToken] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiClient.post(`/api/v1/sessions/${id}/check-in-open`);
      return checkInOpenResponseSchema.parse(res.data.data);
    },
    onSuccess: (data) => {
      setToken(data.checkInToken);
      // sessions.all covers this detail AND the season list rows, whose
      // checkInOpenAt/checkInToken just changed.
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all });
    },
  });
  return { ...mutation, token };
}

export function useCloseCheckIn(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.post(`/api/v1/sessions/${id}/check-in-close`);
      return checkInCloseResponseSchema.parse(res.data.data);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all }),
  });
}
```

- [ ] **Step 4: Screen** — replace `apps/mobile/app/(app)/session/[id]/index.tsx`:

```tsx
import { useEffect, useState } from "react";
import { View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { AttendanceRosterRow, MyAttendance, SessionDetail } from "@space/shared";

import { useAttendanceRoster } from "../../../../src/hooks/use-attendance";
import { useCloseCheckIn, useOpenCheckIn, useSessionDetail } from "../../../../src/hooks/use-session-detail";
import { useSeasonSessions } from "../../../../src/hooks/use-sessions";
import { apiErrorMessage } from "../../../../src/lib/api-error";
import { formatDate, formatSessionTime } from "../../../../src/lib/format";
import { useTheme } from "../../../../src/theme";
import { Button, Card, EmptyState, ErrorState, LoadingState, Screen, Text } from "../../../../src/ui";

/** v1's leader page refreshed every 10s while check-in was open (check-in-attendance-list.tsx:58). */
export const LIVE_ROSTER_REFRESH_MS = 10_000;

function parseId(raw: string | undefined): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function attendanceLine(a: MyAttendance): string {
  if (a.status === "PRESENT") return "Your attendance: Present";
  if (a.status === "LATE") {
    return a.lateMinutes !== null ? `Your attendance: Late (${a.lateMinutes} min)` : "Your attendance: Late";
  }
  return "Your attendance: Absent";
}

function rosterStatus(row: AttendanceRosterRow): string {
  if (row.status === "PRESENT") return "Present";
  if (row.status === "LATE") return "Late";
  if (row.status === "ABSENT") return "Absent";
  return "Not checked in";
}

/** Season admins only (canManageCheckIn): open/close and the QR. */
function CheckInConsole({ detail }: { detail: SessionDetail }) {
  const theme = useTheme();
  const open = useOpenCheckIn(detail.id);
  const close = useCloseCheckIn(detail.id);
  // Staff receive checkInToken on the season's session list (withheld only
  // from students), so an already-open session shows its QR after a restart
  // without a pointless reopen.
  const seasonSessions = useSeasonSessions(detail.seasonId);
  const listedToken = seasonSessions.data?.find((s) => s.id === detail.id)?.checkInToken ?? null;
  const token = open.token ?? listedToken;
  const [error, setError] = useState<string | null>(null);

  const onOpen = () => {
    setError(null);
    open.mutate(undefined, { onError: (err) => setError(apiErrorMessage(err, "Couldn't open check-in.")) });
  };
  const onClose = () => {
    setError(null);
    close.mutate(undefined, { onError: (err) => setError(apiErrorMessage(err, "Couldn't close check-in.")) });
  };

  return (
    <Card style={{ marginTop: theme.spacing.md, gap: theme.spacing.sm }}>
      <Text variant="heading">Check-in</Text>
      {detail.checkInOpen ? (
        <>
          {token ? (
            <View style={{ alignItems: "center", gap: theme.spacing.sm }}>
              <QRCode value={token} size={220} />
              <Text variant="caption">{`Code: ${token}`}</Text>
              {/* Spec 04 D3's risk, stated until the rotating-code upgrade lands. */}
              <Text variant="caption" color={theme.colors.neutral[600]}>
                Anyone with this code can check in — keep it on the room screen only.
              </Text>
            </View>
          ) : (
            <Text variant="label">Loading the check-in code…</Text>
          )}
          <Button title="Close check-in" variant="secondary" onPress={onClose} loading={close.isPending} />
        </>
      ) : (
        <Button title="Open check-in" onPress={onOpen} loading={open.isPending} />
      )}
      {error ? <Text variant="label" color={theme.colors.error[500]}>{error}</Text> : null}
    </Card>
  );
}

/**
 * Group leaders (canMarkAttendance && !canManageCheckIn): who has checked in,
 * read-only — v1 /leader/sessions/[id]. The roster endpoint narrows to the
 * leader's own groups server-side.
 */
function LiveCheckInRoster({ detail }: { detail: SessionDetail }) {
  const theme = useTheme();
  const roster = useAttendanceRoster(detail.id);
  const { refetch } = roster;

  useEffect(() => {
    if (!detail.checkInOpen) return undefined;
    const timer = setInterval(() => void refetch(), LIVE_ROSTER_REFRESH_MS);
    return () => clearInterval(timer);
  }, [detail.checkInOpen, refetch]);

  return (
    <Card style={{ marginTop: theme.spacing.md, gap: theme.spacing.sm }}>
      <Text variant="heading">Check-in</Text>
      <Text variant="label">{detail.checkInOpen ? "Check-in is open" : "Check-in is closed"}</Text>
      {roster.isPending ? (
        <LoadingState />
      ) : roster.isError ? (
        <ErrorState message="Couldn't load the roster." onRetry={() => void refetch()} />
      ) : roster.data.length === 0 ? (
        <Text variant="body" color={theme.colors.neutral[600]}>No students in your groups.</Text>
      ) : (
        roster.data.map((row) => (
          <View key={row.studentUserId} style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text variant="body">{row.name ?? row.email}</Text>
            <Text variant="label" color={theme.colors.neutral[600]}>{rosterStatus(row)}</Text>
          </View>
        ))
      )}
    </Card>
  );
}

function SessionDetailBody({ id }: { id: number }) {
  const theme = useTheme();
  const router = useRouter();
  const { data, isPending, isError, refetch, isRefetching } = useSessionDetail(id);

  if (isPending) return <LoadingState />;
  if (isError) return <ErrorState message="Couldn't load this session." onRetry={() => void refetch()} />;

  return (
    <Screen edges={["top", "left", "right"]} scroll onRefresh={() => void refetch()} refreshing={isRefetching}>
      <Card>
        <Text variant="title">{data.title}</Text>
        <Text variant="label" color={theme.colors.neutral[600]}>
          {`${formatDate(data.startsAt)} · ${formatSessionTime(data.startsAt)} · ${data.durationMinutes} min`}
        </Text>
        {data.location ? <Text variant="body">{data.location}</Text> : null}
        {data.description ? <Text variant="body">{data.description}</Text> : null}
        {data.myAttendance ? <Text variant="label">{attendanceLine(data.myAttendance)}</Text> : null}
      </Card>

      {/* Student check-in (scanner / enter code) is Plan 14 (ruling X15). */}
      {data.canManageCheckIn ? (
        <CheckInConsole detail={data} />
      ) : data.canMarkAttendance ? (
        <LiveCheckInRoster detail={data} />
      ) : null}

      {data.canMarkAttendance ? (
        <Button
          title="Mark attendance"
          variant="secondary"
          style={{ marginTop: theme.spacing.md }}
          onPress={() => router.push({ pathname: "/session/[id]/attendance", params: { id: String(id) } })}
        />
      ) : null}
    </Screen>
  );
}

export default function SessionDetailScreen() {
  const { id: raw } = useLocalSearchParams<{ id: string }>();
  const id = parseId(raw);
  if (id === null) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <EmptyState title="Not found" message="That session doesn't exist." />
      </Screen>
    );
  }
  return <SessionDetailBody id={id} />;
}
```

(The loading and error branches render without `Screen`'s safe-area wrapper
only for the instant before data arrives; if lint or a reviewer prefers, wrap
them in `<Screen edges={["top","left","right"]}>` exactly as the success branch
does — the tests do not depend on it.)

- [ ] **Step 5:** Run `cd apps/mobile && pnpm jest src/__tests__/session-detail.test.tsx` → PASS;
`pnpm turbo lint typecheck test:unit --filter=@space/mobile` → clean.

- [ ] **Step 6: Commit** — `git add apps/mobile && git commit -m "feat(mobile): session detail with admin check-in console and leader live roster"`

---

### Task 6: Closing gate (coordinator)

- [ ] **Step 1:** `pnpm turbo lint typecheck test:unit build` → green. Then
`cd apps/backend && npx jest --config jest.integration.config.js --runInBand --testPathPattern "sessions-routes|seasons-routes"` → green.
- [ ] **Step 2: Mutation pass** (one at a time, restore after each; each must fail the named test):
  1. In `useCurrentSeasonId`, drop the `enabled` argument to `useSeasons` (always fetch) → `use-seasons.test.tsx` "never fetches the seasons list" and the calendar's student test (`not.toHaveBeenCalledWith("/api/v1/seasons")`) fail.
  2. In `pickCurrentSeasonId`, return `seasons[0]?.id ?? null` (list order, ignoring ACTIVE) → "prefers an ACTIVE season" and the admin calendar test fail.
  2b. In `pickCurrentSeasonId`, drop the sort (use `seasons` as listed) → "picks the latest-starting of two ACTIVE seasons" fails on the `[spring, autumn]` call.
  3. In `session/[id]/index.tsx`, gate the console on `data.canMarkAttendance` instead of `data.canManageCheckIn` → the leader test fails (an "Open check-in"/"Close check-in" button appears).
  4. In `routes/sessions.ts`, set `canManageCheckIn: await canMarkAttendance(user, id)` → the integration case "is false for a group leader" fails.
  5. In `calendar.tsx`, group by `formatDate(s.startsAt)` instead of `s.dayKey` → the "Mar 2, 2099" assertion fails (run the suite with `TZ=UTC` to make this deterministic: `TZ=UTC pnpm jest src/__tests__/calendar-screen.test.tsx`).
  6. In `LiveCheckInRoster`, delete the `setInterval` effect → the 10-second refresh test fails.
- [ ] **Step 3: Build-output check** (ruling X12): `grep -rn 'require("@space/shared")' apps/backend/dist/` → empty.
- [ ] **Step 4: Device checklist** — as an admin on staging: the calendar shows
the current season's sessions under org-calendar day headers; open a session,
open check-in, the QR renders; kill and relaunch the app — the open session
still shows its QR without reopening; close check-in flips the console; the
attendance screen is reachable and season-wide; the seasons list (as SUPER)
shows badges; duplicate produces a DRAFT copy whose series edits do not touch
the source (the C10 behaviour, observed for real); delete on the in-use season
is refused with the server's message on screen. As a **leader**: the same
session shows the read-only roster, updating within ~10s of a student check-in,
and no open/close buttons. As a **student**: `/season` and the session detail
render read-only. (Student scanning is Plan 14 — not on this checklist.)
- [ ] **Step 5:** Report suite counts, mutation outcomes, checklist results, divergences.

---

## Revision 2026-10-05

Applied the cross-plan rulings and the 01–06 review:
- **Scope (X15, review S12):** the season detail route, SUPER identity/status edit, group management, session create/edit/delete screens, the multi-season calendar, token regeneration and the program filter are now explicitly **Plan 16**; the student scanner/deep link and full student `/season` content are **Plan 14**. The device checklist no longer promises a student scan flow.
- **Leader console (G18, review S13):** new server flag `canManageCheckIn` (= `isAdminOfSeason`, the open/close gate) on `sessionDetailSchema`, with integration tests; the console keys off it, and leaders get a read-only live roster refreshed every 10s while open (v1 parity). The QR of an already-open session is read from the staff session list (`checkInToken` is served to non-students), replacing the "reopen to show the code" UX.
- **Day grouping (X13, review S14):** new `dayKey` on `sessionListItemSchema`, computed by `orgDayKey` in Plan 3's `lib/org-time.ts`; the calendar groups by it and formats with the timezone-free `formatDayKey`. Existing mobile session fixtures gain `dayKey`.
- **X7:** the route is `session/[id]/index.tsx` (route name `session/[id]/index`), sibling of Plan 2's `attendance.tsx`.
- **Spec 19 D9 (coordinator addendum):** `pickCurrentSeasonId` now matches v1 exactly — latest-`startDate` ACTIVE season, else latest-`startDate` season (`jpc-space/src/app/admin/calendar/page.tsx:18-26`, `admin/dashboard/page.tsx:22-30`) — by sorting client-side, since the API lists `year desc, title asc`. Pinned by a two-ACTIVE-seasons-in-one-year test and mutation 2b.
- **X8:** `useCurrentSeasonId()` now returns `{ seasonId, isPending, isError, refetch }`, gates the seasons query with a real `enabled` (the "caveat to fix while implementing" is gone), and exports `pickCurrentSeasonId`.
- **X9 / B5:** no hardcoded route counts are edited; placeholder entries are removed only.
- **X10 / S3:** every mutation parses its response with a shared schema (`seasonRefResponseSchema`, `seasonDeletedResponseSchema`, `checkInOpenResponseSchema`, `checkInCloseResponseSchema`); error bodies parse through `apiErrorBodySchema` via `apiErrorMessage`. Task 1 Step 6 pins Plan 3's PATCH/DELETE response shapes with a test.
- **X11 / B4:** every session-store fixture carries `avatarPath: null`.
- **S5 / S15:** query keys take `number | null` (no `-1` sentinel); every test that was described in prose ("write all three/four in full") is now written out; mutation 1 targets `useCurrentSeasonId`, and a newer non-ACTIVE season is in the fixture so the ACTIVE-preference mutation is catchable.
- **G21:** a STUDENT case on `/season` proves the screen renders read-only from the pinned season.
