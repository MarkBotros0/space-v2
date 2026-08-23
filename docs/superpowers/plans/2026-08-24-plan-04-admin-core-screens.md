# Plan 4 — Admin Core Screens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An admin runs a season from the phone: a calendar every role shares, the seasons list and season workspace with the Plan 3 write actions, and a session detail screen whose check-in console displays the QR and the true open/closed state.

**Architecture:** Four destinations. `calendar.tsx` is the worked example of
decision D1 — one route file, every role's branch inside, driven entirely by
which seasons the API returns. `session/[id]` joins `DETAIL_ROUTE_NAMES`.
The check-in console renders state from the contract's `checkInOpen`
(ruling C4 — the three-hour rule lives server-side in `checkInState`, and the
client never re-derives it). Season writes call Plan 3's endpoints.

**Tech Stack:** Expo SDK 54 / expo-router 6, React Query 5, Zod contracts,
`react-native-qrcode-svg` (+ its peer `react-native-svg`) for the QR, RNTL 13.

**Spec:** `docs/superpowers/specs/domains/02-seasons.md` §9, `03-sessions.md`
§9, `04-attendance.md` (console rules; §10 D3's rotating-code upgrade is
deferred — this plan ships the QR on today's API and says so on screen),
`_DECISIONS.md` (C2, C4); roadmap § Plan 4.

**Depends on:** Plan 1 (`DETAIL_ROUTE_NAMES`, hooks pattern), Plan 2
(`session/[id]/attendance` screen — Task 4 here only *links* to it),
Plan 3 (`POST /seasons`, `PATCH /seasons/:id`, `POST /seasons/:id/duplicate`,
`DELETE /seasons/:id` — consumed by Task 3's forms).

## Global Constraints

Same as Plans 1–2 (relative imports, Zod-parse everything, `enabled` +
guarded `refetch`, state primitives, tab edges, `renderWithProviders`,
`mock*` rule, typed routes + `routes:generate`).

Backend endpoints consumed (verify each shape against the route before
pinning it in a test):
- `GET /api/v1/seasons` → `{ data: { seasons: SeasonListItem[] } }` — already role-scoped server-side (SUPER/MENTOR all, ADMIN theirs, LEADER via groups, STUDENT via enrollment)
- `GET /api/v1/seasons/:id` → `{ data: SeasonDetail }` (groups narrowed for students server-side)
- `GET /api/v1/seasons/:id/sessions` → `{ data: { sessions: SessionListItem[] } }` (`checkInToken` null for students)
- `GET /api/v1/sessions/:id` → `{ data: SessionDetail }` — `checkInOpen` derives from `checkInState` (3-hour window applied); `canMarkAttendance` drives the attendance link
- `POST /api/v1/sessions/:id/check-in-open` → `{ data: { checkInToken } }` (reuses an existing token on reopen)
- `POST /api/v1/sessions/:id/check-in-close` → `{ data: { closed: true } }`
- Plan 3 writes as documented in that plan.

**Execution shape:** Task 1 first (route + contract foundation). Tasks 2, 3,
4 then parallelize (calendar / seasons+workspace / session detail). Task 5 is
the closing gate.

---

### Task 1: Foundation — `session/[id]` route, session detail contract, season hooks

**Files:**
- Create: `apps/mobile/app/(app)/session/[id].tsx` (stub)
- Modify: `apps/mobile/app/(app)/_layout.tsx` (`DETAIL_ROUTE_NAMES` gains `"session/[id]"`)
- Modify: `packages/shared/src/session.ts` (convert `MyAttendance` + `SessionDetail` to Zod; `sessionDetailSchema`)
- Create: `apps/mobile/src/hooks/use-seasons.ts`
- Modify: `apps/mobile/src/lib/query-keys.ts` (add `seasons` factory; extend `sessions` with `detail(id)`)
- Test: extend `apps/mobile/src/__tests__/app-layout.test.tsx`; `packages/shared` typecheck covers the conversion

**Interfaces:**
- Consumes: Plan 1's `DETAIL_ROUTE_NAMES`; `seasonListItemSchema`/`seasonDetailSchema` (Plan 3 Task 1 — already merged by the time this plan runs).
- Produces: `sessionDetailSchema` + types (same exported names); `useSeasons(): UseQueryResult<SeasonListItem[]>`; `useSeasonDetail(id: number | null)`; `useCurrentSeasonId(): number | null` (see Step 3 — the one non-trivial derivation, shared by calendar and workspace); `queryKeys.seasons.all/list()/detail(id)`, `queryKeys.sessions.detail(id)`.

- [ ] **Step 1:** Extend the `DETAIL_ROUTE_NAMES` layout assertion with
`"session/[id]"`; run → FAIL; create the stub (same shape as Plan 1 Task 2's,
imports `../../../src/...`), extend the const, `routes:generate`, run → PASS.

- [ ] **Step 2: Contract conversion.** In `session.ts` replace the
`MyAttendance` and `SessionDetail` interfaces:

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
  myAttendance: myAttendanceSchema.nullable(),
  canMarkAttendance: z.boolean(),
});
export type SessionDetail = z.infer<typeof sessionDetailSchema>;
```

(`attendanceStatusSchema` is already imported after Plan 2 Task 1.) Run
`pnpm turbo typecheck` — type names unchanged, importers stand.

- [ ] **Step 3: Season hooks.**

```ts
// apps/mobile/src/hooks/use-seasons.ts
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

export function useSeasons(): UseQueryResult<SeasonListItem[]> {
  return useQuery({
    queryKey: queryKeys.seasons.list(),
    queryFn: async () => {
      const res = await apiClient.get("/api/v1/seasons");
      return seasonListSchema.parse(res.data.data.seasons);
    },
  });
}

export function useSeasonDetail(id: number | null): UseQueryResult<SeasonDetail> {
  return useQuery({
    queryKey: queryKeys.seasons.detail(id ?? -1),
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/seasons/${id}`);
      return seasonDetailSchema.parse(res.data.data);
    },
    enabled: id !== null,
  });
}

/**
 * Which season "now" means for this user.
 *
 * A student's is pinned by the server (`scopes.activeSeasonId`). Staff have
 * no such pin, so it is derived from the role-scoped seasons list the API
 * already returns: the first ACTIVE season, else the newest. This is spec 02
 * D11's rule ("most-recent-ACTIVE, falling back to most-recent-anything"),
 * defined once here instead of copy-pasted per screen the way v1 did it
 * across three pages.
 */
export function useCurrentSeasonId(): {
  seasonId: number | null;
  isPending: boolean;
} {
  const role = useSessionStore((s) => s.user?.role ?? null);
  const activeSeasonId = useSessionStore((s) => s.scopes?.activeSeasonId ?? null);
  const isStudent = role === "STUDENT";
  const seasons = useSeasons();

  if (isStudent) return { seasonId: activeSeasonId, isPending: false };
  if (seasons.isPending || seasons.isError) return { seasonId: null, isPending: seasons.isPending };
  const active = seasons.data.find((s) => s.status === "ACTIVE");
  return { seasonId: (active ?? seasons.data[0])?.id ?? null, isPending: false };
}
```

**Caveat to fix while implementing:** as written, `useSeasons()` fires for
students too (hooks cannot be conditional). Gate it:
`useQuery({ ..., enabled: !isStudent })` via an `enabled` parameter on
`useSeasons(enabled = true)` and pass `!isStudent` — the student path then
costs no request. Keys:

```ts
  seasons: {
    all: ["seasons"] as const,
    list: () => [...queryKeys.seasons.all, "list"] as const,
    detail: (id: number) => [...queryKeys.seasons.all, "detail", id] as const,
  },
```

and inside `sessions`: `detail: (id: number) => [...queryKeys.sessions.all, "detail", id] as const,`.

- [ ] **Step 4:** `pnpm turbo lint typecheck test:unit --filter=@space/mobile --filter=@space/shared` → clean.

- [ ] **Step 5: Commit** — `"feat(mobile): session detail route, contract, and season hooks"`

---

### Task 2: Calendar — one route, every role

**Files:**
- Modify: `apps/mobile/app/(app)/calendar.tsx` (replace placeholder)
- Test: `apps/mobile/src/__tests__/calendar-screen.test.tsx`
- Modify: `apps/mobile/src/__tests__/placeholder-screens.test.tsx` (drop `calendar`)

**Interfaces:**
- Consumes: `useCurrentSeasonId`, `useSeasonSessions` (exists since Phase 0), `formatDate`/`formatSessionTime`.
- Produces: nothing downstream; this is the D1 worked example.

- [ ] **Step 1: Failing test.** The load-bearing assertion: **two different
roles render real content from the same route file.**

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

const session = (id: number, title: string, startsAt: string) => ({
  id, title, startsAt, durationMinutes: 60, location: null, recurrenceGroupId: null,
  attendanceMarked: false, seasonId: 7, seasonCode: "S26", seasonTitle: "Spring 2026",
  checkInToken: null, checkInOpenAt: null, checkInClosedAt: null,
});

const seasonRow = {
  id: 7, code: "S26", title: "Spring 2026", program: "TEST", year: 2026,
  status: "ACTIVE" as const, startDate: "2026-01-01T00:00:00.000Z", endDate: "2026-12-31T00:00:00.000Z",
};

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

it("renders a student's calendar from their pinned season, grouped by day", async () => {
  useSessionStore.setState({
    user: { id: 9, name: "S", email: "s@jpc.test", role: "STUDENT" },
    scopes: { seasonAdminIds: [], groupLeaderIds: [], activeSeasonId: 7, graduationYear: null },
  });
  get.mockResolvedValue({
    data: { data: { sessions: [
      session(1, "Kickoff", "2099-03-01T18:00:00.000Z"),
      session(2, "Week two", "2099-03-08T18:00:00.000Z"),
    ] } },
  });

  renderWithProviders(<CalendarScreen />);

  expect(await screen.findByText("Kickoff")).toBeTruthy();
  expect(screen.getByText("Mar 1, 2099")).toBeTruthy();
  expect(screen.getByText("Mar 8, 2099")).toBeTruthy();
  // The student never fetched the seasons list — their season is pinned.
  expect(get).not.toHaveBeenCalledWith("/api/v1/seasons");
});

it("renders an admin's calendar from their first ACTIVE season — same route file", async () => {
  useSessionStore.setState({
    user: { id: 2, name: "A", email: "a@jpc.test", role: "ADMIN" },
    scopes: { seasonAdminIds: [7], groupLeaderIds: [], activeSeasonId: null, graduationYear: null },
  });
  get.mockImplementation((url: string) =>
    url === "/api/v1/seasons"
      ? Promise.resolve({ data: { data: { seasons: [seasonRow] } } })
      : Promise.resolve({ data: { data: { sessions: [session(1, "Kickoff", "2099-03-01T18:00:00.000Z")] } } }),
  );

  renderWithProviders(<CalendarScreen />);

  expect(await screen.findByText("Kickoff")).toBeTruthy();
  expect(get).toHaveBeenCalledWith("/api/v1/seasons/7/sessions");
});

it("navigates to session detail on press", async () => {
  useSessionStore.setState({
    user: { id: 9, name: "S", email: "s@jpc.test", role: "STUDENT" },
    scopes: { seasonAdminIds: [], groupLeaderIds: [], activeSeasonId: 7, graduationYear: null },
  });
  get.mockResolvedValue({
    data: { data: { sessions: [session(1, "Kickoff", "2099-03-01T18:00:00.000Z")] } },
  });

  renderWithProviders(<CalendarScreen />);
  fireEvent.press(await screen.findByText("Kickoff"));

  expect(mockPush).toHaveBeenCalledWith({ pathname: "/session/[id]", params: { id: "1" } });
});
```

Run → FAIL.

- [ ] **Step 2: Implement.** `useCurrentSeasonId()` → `useSeasonSessions(seasonId)`.
Group rows by calendar day of `startsAt` (`formatDate` output as the group
key — the string the server's instant formats to; the org-timezone question
is the server's, per C2 the client only formats). Render day headers
(`Text variant="heading"`) with each session as a `Pressable` `Card`
(title + `formatSessionTime`), pushing `/session/[id]`. Handle
`seasonId === null` ("No season to show"), pending, error, empty exactly per
the house pattern. No role switch appears anywhere in this file — that
absence is the D1 point; leave a two-line comment saying so.

- [ ] **Step 3:** Drop `calendar` from `placeholder-screens.test.tsx`; run
suite + turbo trio → clean.

- [ ] **Step 4: Commit** — `"feat(mobile): shared calendar — the D1 worked example"`

---

### Task 3: Seasons list and season workspace

**Files:**
- Modify: `apps/mobile/app/(app)/seasons.tsx`, `apps/mobile/app/(app)/season.tsx` (replace placeholders)
- Create: `apps/mobile/src/hooks/use-season-writes.ts`
- Test: `apps/mobile/src/__tests__/season-screens.test.tsx`
- Modify: `apps/mobile/src/__tests__/placeholder-screens.test.tsx` (drop both)

**Interfaces:**
- Consumes: `useSeasons`, `useSeasonDetail`, `useCurrentSeasonId` (Task 1); Plan 3's endpoints; `seasonWriteRequestSchema`'s input type for the form payload.
- Produces: `useCreateSeason()`, `useDuplicateSeason(sourceId)`, `useDeleteSeason()` mutations (each invalidating `queryKeys.seasons.all`).

- [ ] **Step 1: Failing test.** Three cases in `season-screens.test.tsx`
(same harness as Task 2's file): (a) `seasons.tsx` as SUPER lists seasons
grouped by `year` with status badges, from `GET /api/v1/seasons`; (b) a
"Duplicate" press on a season row calls
`apiClient.post("/api/v1/seasons/7/duplicate", { year: expect.any(Number), startDate: expect.any(String), endDate: expect.any(String) })`
after filling the small form (year `Input` labelled "Year", two date `Input`s
labelled "Start date"/"End date" accepting ISO text for now — a native date
picker is polish, not this plan); (c) `season.tsx` as ADMIN renders the
workspace from `GET /api/v1/seasons/:id` — title, status, `sessionCount`,
`studentCount`, group names — using `useCurrentSeasonId`. Write all three in
full (fixtures as in Task 2). Run → FAIL.

- [ ] **Step 2: Mutations.**

```ts
// apps/mobile/src/hooks/use-season-writes.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "../lib/api-client";
import { queryKeys } from "../lib/query-keys";

function useInvalidateSeasons() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: queryKeys.seasons.all });
}

export function useCreateSeason() {
  const invalidate = useInvalidateSeasons();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await apiClient.post("/api/v1/seasons", body);
      return res.data.data as { id: number; code: string };
    },
    onSuccess: invalidate,
  });
}

export function useDuplicateSeason(sourceId: number) {
  const invalidate = useInvalidateSeasons();
  return useMutation({
    mutationFn: async (body: { year: number; startDate: string; endDate: string; code?: string }) => {
      const res = await apiClient.post(`/api/v1/seasons/${sourceId}/duplicate`, body);
      return res.data.data as { id: number; code: string };
    },
    onSuccess: invalidate,
  });
}

export function useDeleteSeason() {
  const invalidate = useInvalidateSeasons();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await apiClient.delete(`/api/v1/seasons/${id}`);
      return res.data.data as { deleted: true };
    },
    onSuccess: invalidate,
  });
}
```

(Check `apiClient` exposes `delete` — it is an axios instance, it does.)

- [ ] **Step 3: Screens.** `seasons.tsx`: role gate — STUDENT/LEADER get the
"not available" empty state (their tab sets don't include it, but the route
is reachable); staff render `useSeasons()` grouped by year, each row a `Card`
with title, code, status; SUPER rows carry "Duplicate" and "Delete" `Button`s
(delete confirms via a second press pattern: first press flips the button
title to "Really delete?" — RN has no `window.confirm`; keep it deterministic
for tests) and a "New season" form at top (Inputs: Code, Program, Year,
Start date, End date — status defaults DRAFT server-side is wrong, the
schema requires it: send `status: "DRAFT"` from the form). Surface a 409's
`error.code` (`code_taken`, `season_in_use`) through the form's error text —
read the axios error's `response.data.error.message` and show it verbatim.
`season.tsx`: `useCurrentSeasonId` → `useSeasonDetail`; header card
(title/code/status/dates), counts row, groups list (name + studentCount +
leaders), links (`router.push`) to `/calendar` and `/assignments`. ADMIN
additionally gets an "Edit" section for `description`/`absenceBudgetMinutes`/
`absenceWeightMinutes` PATCHing via a `useUpdateSeason(id)` mutation added
beside the others (same file, same invalidation) — the allowlisted fields
only, matching Plan 3's D3 gate.

- [ ] **Step 4:** Drop both from `placeholder-screens.test.tsx`; run suite +
turbo trio → clean.

- [ ] **Step 5: Commit** — `"feat(mobile): seasons list and season workspace with write actions"`

---

### Task 4: Session detail + check-in console

**Files:**
- Modify: `apps/mobile/app/(app)/session/[id].tsx` (replace stub)
- Create: `apps/mobile/src/hooks/use-session-detail.ts`
- Modify: `apps/mobile/package.json` (deps)
- Test: `apps/mobile/src/__tests__/session-detail.test.tsx`

**Interfaces:**
- Consumes: `sessionDetailSchema` (Task 1), `queryKeys.sessions.detail`, Plan 2's `/session/[id]/attendance` route.
- Produces: `useSessionDetail(id)`, `useOpenCheckIn(id)`, `useCloseCheckIn(id)`.

- [ ] **Step 1: Install the QR deps** (Expo-managed versions):
`cd apps/mobile && npx expo install react-native-svg && pnpm add react-native-qrcode-svg`.
Jest will not transform `react-native-qrcode-svg`/`react-native-svg` by
default — check `jest.config.js`'s `transformIgnorePatterns` and extend the
allowlist if the suite fails on import; in tests, mock the component:
`jest.mock("react-native-qrcode-svg", () => "QRCode")`.

- [ ] **Step 2: Failing test.** Four cases: (a) renders
title/time/location/description from `GET /api/v1/sessions/12`; (b) a
student sees their own attendance status line when `myAttendance` is set and
**no console** (`canMarkAttendance: false` hides it — C4, the flag drives
the UI); (c) staff (`canMarkAttendance: true`, `checkInOpen: false`) see
"Open check-in" — pressing it posts to
`/api/v1/sessions/12/check-in-open`, and on `{ checkInToken: "tok123" }`
the QR mock and the token text render; (d) with `checkInOpen: true` the
button reads "Close check-in" and posts to `check-in-close`, and a
"Mark attendance" button pushes
`{ pathname: "/session/[id]/attendance", params: { id: "12" } }`. Write all
four fully (harness per Task 2; `useLocalSearchParams` mocked to
`{ id: "12" }`). Run → FAIL.

- [ ] **Step 3: Hooks.**

```ts
// apps/mobile/src/hooks/use-session-detail.ts
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { sessionDetailSchema, type SessionDetail } from "@space/shared";
import { useState } from "react";

import { apiClient } from "../lib/api-client";
import { queryKeys } from "../lib/query-keys";

export function useSessionDetail(id: number | null): UseQueryResult<SessionDetail> {
  return useQuery({
    queryKey: queryKeys.sessions.detail(id ?? -1),
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/sessions/${id}`);
      return sessionDetailSchema.parse(res.data.data);
    },
    enabled: id !== null,
  });
}

/**
 * Returns the token alongside the mutation because the detail endpoint
 * deliberately never serves it (it is the credential; see session.ts) — the
 * only way a console gets a QR to display is the open call's own response,
 * held in memory for this screen's lifetime and nowhere else.
 */
export function useOpenCheckIn(id: number) {
  const queryClient = useQueryClient();
  const [token, setToken] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiClient.post(`/api/v1/sessions/${id}/check-in-open`);
      return res.data.data as { checkInToken: string };
    },
    onSuccess: (data) => {
      setToken(data.checkInToken);
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions.detail(id) });
    },
  });
  return { ...mutation, token };
}

export function useCloseCheckIn(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.post(`/api/v1/sessions/${id}/check-in-close`);
      return res.data.data as { closed: boolean };
    },
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions.detail(id) }),
  });
}
```

- [ ] **Step 4: Screen.** Param → `useSessionDetail`. Header (title,
`formatDate` + `formatSessionTime`, duration, location, description). A
student with `myAttendance` gets a status card ("Present" / "Late (n min)" /
"Absent"). When `canMarkAttendance`: the console `Card` —
`checkInOpen === false` → `Button "Open check-in"`; `true` → the QR
(`<QRCode value={token ?? ""} size={220} />` — only when `token` is in hand
from this screen's open call; after an app restart the token is gone and the
console shows "Check-in is open. Reopen to show the code again." with the
same open button, which the server treats as a reopen reusing the token) +
`Button "Close check-in"` + `Button "Mark attendance"` pushing the Plan 2
screen. A one-line caption under the QR: "Anyone with this code can check
in — keep it on the room screen only." (spec 04 D3's risk, stated until the
rotating-code upgrade lands).

- [ ] **Step 5:** Run suite + turbo trio → clean.

- [ ] **Step 6: Commit** — `"feat(mobile): session detail with check-in console and QR"`

---

### Task 5: Closing gate (coordinator)

- [ ] **Step 1:** `pnpm turbo lint typecheck test:unit` → green.
- [ ] **Step 2: Mutation pass** (one at a time, restore after each):
  1. In the calendar screen, hardcode the student branch to also call `useSeasons()` unconditionally (drop the `enabled` gate) → the "student never fetched /api/v1/seasons" assertion fails.
  2. In `session/[id].tsx`, render the console regardless of `canMarkAttendance` → the student-view test fails.
  3. In `useCurrentSeasonId`, return the newest season instead of preferring ACTIVE → the admin calendar test fails **only if** its fixture includes a newer non-ACTIVE season — add one to the fixture now so this mutation is catchable, then run it.
- [ ] **Step 3: Device checklist** — as an admin on staging: calendar shows
the season's sessions by day; open a session, open check-in, QR renders and a
student device (Plan 1 login) can scan/enter the flow end to end; close
check-in flips the console; attendance screen reachable and season-wide;
seasons list shows badges; duplicate produces a DRAFT copy whose series edits
do not touch the source (the C10 behaviour, observed for real); delete on the
in-use season is refused with the message on screen.
- [ ] **Step 4:** Report suite counts, mutation outcomes, checklist results,
divergences.
