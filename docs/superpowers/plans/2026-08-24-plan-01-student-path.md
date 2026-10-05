# Plan 1 — Student Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A student logs in, sees their assignment list, opens one, writes and submits work, and sees feedback — end to end against the live backend. Every role with a More tab can reach its sidebar-only destinations.

**Architecture:** Four screens over four existing endpoints. Task 0 first
makes the two route-count tests derive their numbers instead of pinning them,
so no later plan ever edits a hardcoded count (ruling X9). The assignments
list replaces its placeholder; `assignment/[id]` is the app's **first dynamic
route** (Task 2 establishes the pattern every later detail route copies); the
submission editor lives inside the detail screen and drives the
`PUT by-assignment` → `PATCH` flow. `/more` renders the role's sidebar minus
its tabs, as v1's `more-menu.tsx` did (ruling X15). All server-derived flags
(`isOverdue`, `isLate`, `canUploadFiles`) are consumed from the contracts,
never recomputed (ruling C4).

**Tech Stack:** Expo SDK 54 / expo-router 6 (typed routes), React Query 5,
Zustand 5, Zod contracts from `@space/shared`, RNTL 13 via
`renderWithProviders`.

**Spec:** `docs/superpowers/specs/domains/07-assignments.md`,
`docs/superpowers/specs/domains/08-submissions.md`,
`docs/superpowers/specs/domains/_DECISIONS.md` (C4, C6, C8),
scope from `docs/superpowers/plans/2026-08-24-migration-roadmap.md` § Plan 1.
v1 reference for `/more`: `jpc-space/src/components/layout/more-menu.tsx`.

**Depends on:** nothing — this is the first plan in the execution order
(1 → 2 → 3 → 4 → 15 → 16 → 5 → 6 → 7 → 17 → 14 → 8 → 9 → 10 → 11 → 18 → 12 → 13).

## Global Constraints

- Relative imports only — **no `@/` alias** (Jest would resolve it, Metro would not).
- Every response — queries **and mutations** — is **parsed with a Zod schema from `@space/shared`**, never cast (`as T` on an API response is forbidden, ruling X10).
- Dependent queries pass `enabled`, and manual `refetch()` is guarded too. Nullable ids go into query keys as `null`, never a `-1` sentinel (`query-keys.ts` header).
- Screens map states to `LoadingState` / `ErrorState` (with `onRetry`) / `EmptyState`.
- Tab screens pass `edges={["top", "left", "right"]}` to `Screen`.
- Tests use `renderWithProviders`; `jest.mock` factories may only close over consts named `mock*`; query `Input` fields with `getByLabelText`, assert errors via `accessibilityHint`.
- Session fixtures come from `makeSession` / `makeUser` / `makeScopes` (`src/__tests__/helpers/session.ts`, Task 0) so every `MeUser` carries `avatarPath` and test files typecheck (ruling X11).
- Route-count tests derive their numbers (ruling X9): adding a detail route means appending to `DETAIL_ROUTE_NAMES`; replacing a placeholder means deleting its `PLACEHOLDER_SCREENS` row. Nobody edits a count.
- Typed routes: never `as Href` / `as any`. After adding a route file run `pnpm turbo routes:generate --filter=@space/mobile`.
- A dynamic segment with children uses the directory form `x/[id]/index.tsx` + `x/[id]/child.tsx`, never `x/[id].tsx` beside `x/[id]/` (ruling X7; Task 0 adds the guard).
- Backend endpoints consumed (all exist on `main`, verified):
  - `GET /api/v1/seasons/:seasonId/assignments` → `{ data: { assignments: StudentAssignmentListItem[] } }` for a STUDENT caller
  - `GET /api/v1/assignments/:id` → `{ data: AssignmentDetail }` (`mySubmission` populated for students, `groupIds` null)
  - `PUT /api/v1/submissions/by-assignment/:assignmentId` → `{ data: { publicId, status } }` (idempotent create-or-fetch)
  - `GET /api/v1/submissions/:publicId` → `{ data: SubmissionDetail }` (has `text`, `feedback`, `isLate`, `canUploadFiles`)
  - `PATCH /api/v1/submissions/:publicId` body `{ text, submit? }` → `{ data: { saved: true, submitted: boolean } }`

**Execution shape:** Task 0 first, by the coordinator (it changes two shared
test files and `_layout.tsx`, which every other task touches). Then Task 1
and Task 2 are independent — two subagents may run them in parallel. Task 3
needs Task 2; Task 4 needs Task 3. Task 5 needs Task 1. Task 6 needs only
Task 0. Task 7 is the coordinator's closing gate.

**Out of scope here (owner named, ruling X15):** the staff branch of
`/assignments` and of `assignment/[id]` (Plan 15); `/history`, `/profile`,
`/season` student content (Plan 14).

---

### Task 0: Test scaffolding — derived route counts, session fixtures, route-shape guard

**Files:**
- Create: `apps/mobile/src/__tests__/helpers/session.ts`
- Create: `apps/mobile/src/__tests__/helpers/routes.ts`
- Modify: `apps/mobile/app/(app)/_layout.tsx` (export `ALL_ROUTE_NAMES`; add the empty exported `DETAIL_ROUTE_NAMES`)
- Modify: `apps/mobile/src/__tests__/app-layout.test.tsx` (derive `TOTAL_ROUTES`; add the "every route file is declared" and "detail routes hidden" tests)
- Modify: `apps/mobile/src/__tests__/placeholder-screens.test.tsx` (replace the `toHaveLength(18)` pin with a disk-derived check)
- Modify: `apps/mobile/src/__tests__/role-tabs.test.tsx` (add the X7 sibling guard)

**Interfaces:**
- Consumes: `MeUser`, `MeScopes`, `UserRole` from `@space/shared`; `ALL_NAV_HREFS`, `routeNameForHref` (already in `_layout.tsx`).
- Produces (exact names every later mobile plan uses):
  - `makeUser(role: UserRole, overrides?: Partial<MeUser>): MeUser`
  - `makeScopes(overrides?: Partial<MeScopes>): MeScopes`
  - `makeSession(role: UserRole, scopes?: Partial<MeScopes>, user?: Partial<MeUser>): { user: MeUser; scopes: MeScopes; status: "authenticated" }` — pass straight to `useSessionStore.setState(...)`
  - `listRouteNames(): string[]`, `readRouteSource(routeName: string): string`, `ambiguousRouteSiblings(): string[]`, `APP_GROUP_DIR` from `src/__tests__/helpers/routes.ts`
  - `export const ALL_ROUTE_NAMES: readonly string[]` and `export const DETAIL_ROUTE_NAMES: readonly string[]` from `app/(app)/_layout.tsx`. **Later plans add a detail route by appending its route name to `DETAIL_ROUTE_NAMES` and nothing else.**

- [ ] **Step 1: Write the helpers**

```ts
// apps/mobile/src/__tests__/helpers/session.ts
import type { MeScopes, MeUser, UserRole } from "@space/shared";

/**
 * Typed session fixtures. `MeUser` requires `avatarPath`, and test files are
 * typechecked (tsconfig includes src/**), so a hand-written
 * `{ id, name, email, role }` literal turns `pnpm turbo typecheck` red.
 * Every mobile test builds its session here instead (ruling X11).
 */
export function makeUser(role: UserRole, overrides: Partial<MeUser> = {}): MeUser {
  return {
    id: 1,
    name: `Test ${role.toLowerCase()}`,
    email: `${role.toLowerCase()}@jpc.test`,
    role,
    avatarPath: null,
    ...overrides,
  };
}

export function makeScopes(overrides: Partial<MeScopes> = {}): MeScopes {
  return {
    seasonAdminIds: [],
    groupLeaderIds: [],
    activeSeasonId: null,
    graduationYear: null,
    ...overrides,
  };
}

/** Spread straight into `useSessionStore.setState(...)`. */
export function makeSession(
  role: UserRole,
  scopes: Partial<MeScopes> = {},
  user: Partial<MeUser> = {},
): { user: MeUser; scopes: MeScopes; status: "authenticated" } {
  return { user: makeUser(role, user), scopes: makeScopes(scopes), status: "authenticated" };
}
```

```ts
// apps/mobile/src/__tests__/helpers/routes.ts
import type * as NodeFs from "node:fs";
import type * as NodePath from "node:path";

// Same require-with-type pattern role-tabs.test.tsx uses for node built-ins.
const fs = require("node:fs") as typeof NodeFs;
const path = require("node:path") as typeof NodePath;

/** `apps/mobile/app/(app)` — the Tabs group every authenticated screen lives in. */
export const APP_GROUP_DIR = path.resolve(__dirname, "../../../app/(app)");

function walkFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walkFiles(full) : [full];
  });
}

function walkDirs(dir: string): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const full = path.join(dir, entry.name);
      return [full, ...walkDirs(full)];
    });
}

function toRouteName(file: string): string {
  return path.relative(APP_GROUP_DIR, file).replace(/\.tsx$/, "").split(path.sep).join("/");
}

/**
 * The route name (the `name` `Tabs.Screen` takes) of every screen file under
 * app/(app): path relative to the group, extension dropped, `/`-separated.
 * `_layout.tsx` is the navigator, not a screen.
 */
export function listRouteNames(): string[] {
  return walkFiles(APP_GROUP_DIR)
    .filter((file) => file.endsWith(".tsx") && path.basename(file) !== "_layout.tsx")
    .map(toRouteName);
}

export function readRouteSource(routeName: string): string {
  return fs.readFileSync(path.join(APP_GROUP_DIR, `${routeName}.tsx`), "utf8");
}

/**
 * Directories that have a same-named sibling file (`x.tsx` beside `x/`).
 * expo-router resolves that pair ambiguously; ruling X7 mandates the
 * directory form `x/index.tsx` instead. Returned as route names.
 */
export function ambiguousRouteSiblings(): string[] {
  return walkDirs(APP_GROUP_DIR)
    .filter((dir) => fs.existsSync(`${dir}.tsx`))
    .map((dir) => toRouteName(`${dir}.tsx`));
}
```

- [ ] **Step 2: Write the failing tests**

Replace `apps/mobile/src/__tests__/app-layout.test.tsx` with the following
(the header comment and the three existing tests are kept; `TOTAL_ROUTES` is
now derived, and two tests are added):

```tsx
import { render, screen } from "@testing-library/react-native";

import { navByRole } from "@space/shared";

import { useSessionStore } from "../store/session";
import { listRouteNames } from "./helpers/routes";
import { makeScopes, makeUser } from "./helpers/session";

// Task-7 fix round, Fix 1: nothing in the suite before this file ever
// rendered `app/(app)/_layout.tsx` — role-tabs.test.tsx only exercises
// navByRole/navFor and the filesystem. Three mutations to the layout each
// left the whole suite green:
//   (a) replacing the `tab ? {...} : { href: null }` branch with an
//       unconditional visible-tab object — every route becomes a tab
//   (b) gutting routeNameForHref to `return path` (dropping the
//       "students" -> "students/index" special case)
//   (c) deleting the `status === "anonymous"` -> <Redirect> guard
// This file renders `AppLayout` for real (`Tabs`/`Tabs.Screen`/`Redirect`
// mocked to markers, the same technique boot-gate.test.tsx uses for
// `Stack` — the real navigator needs a context this test has no interest
// in setting up) and asserts on the `name`/`options` each `Tabs.Screen`
// actually receives, so all three mutations fail here.
//
// Plan 1 Task 0 (ruling X9): the route total is DERIVED from the layout's
// own exported lists, not pinned. Every plan that adds a route used to have
// to bump a hardcoded 19 here; now it appends to DETAIL_ROUTE_NAMES and the
// "every route file is declared" test below — which reads the filesystem,
// independently of the layout — is what keeps that list honest.
type CapturedScreen = { name: string; title?: string; href?: string | null };
let mockScreens: CapturedScreen[] = [];

jest.mock("expo-router", () => {
  const { Text } = require("react-native");
  const TabsScreen = ({ name, options }: { name: string; options?: Record<string, unknown> }) => {
    mockScreens.push({
      name,
      title: options?.title as string | undefined,
      href: options && "href" in options ? (options.href as string | null) : undefined,
    });
    return null;
  };
  const Tabs = ({ children }: { children: React.ReactNode }) => <>{children}</>;
  Tabs.Screen = TabsScreen;
  return {
    Tabs,
    Redirect: ({ href }: { href: string }) => <Text testID="redirect">{href}</Text>,
  };
});

import AppLayout, { ALL_ROUTE_NAMES, DETAIL_ROUTE_NAMES } from "../../app/(app)/_layout";

const scopes = makeScopes();

// Hardcoded independently of routeNameForHref: the expectation must not be
// computed with the same (possibly mutated) function the layout uses, or a
// mutation to routeNameForHref would break both sides identically and the
// test would keep passing.
const STUDENT_VISIBLE_NAMES = ["calendar", "assignments", "dashboard", "quizzes", "more"];
const ADMIN_VISIBLE_NAMES = ["calendar", "groups", "dashboard", "students/index", "more"];
const TOTAL_ROUTES = ALL_ROUTE_NAMES.length + DETAIL_ROUTE_NAMES.length;

beforeEach(() => {
  useSessionStore.getState().clear();
  mockScreens = [];
});

describe("AppLayout tab shell", () => {
  it("shows exactly the STUDENT tabs, in order, hiding every other route", () => {
    useSessionStore.getState().setSession(makeUser("STUDENT"), scopes);
    render(<AppLayout />);

    expect(mockScreens).toHaveLength(TOTAL_ROUTES);

    const visible = mockScreens.filter((s) => s.href !== null);
    const hidden = mockScreens.filter((s) => s.href === null);

    expect(visible.map((s) => s.name)).toEqual(STUDENT_VISIBLE_NAMES);
    expect(hidden).toHaveLength(TOTAL_ROUTES - navByRole.STUDENT.tabs.length);
  });

  it("shows a different visible set for ADMIN", () => {
    useSessionStore.getState().setSession(makeUser("ADMIN"), scopes);
    render(<AppLayout />);

    expect(mockScreens).toHaveLength(TOTAL_ROUTES);

    const visible = mockScreens.filter((s) => s.href !== null);
    const hidden = mockScreens.filter((s) => s.href === null);

    expect(visible.map((s) => s.name)).toEqual(ADMIN_VISIBLE_NAMES);
    expect(hidden).toHaveLength(TOTAL_ROUTES - navByRole.ADMIN.tabs.length);
    expect(visible.map((s) => s.name)).not.toEqual(STUDENT_VISIBLE_NAMES);
  });

  it("renders the redirect and no Tabs.Screen when anonymous", () => {
    useSessionStore.setState({ status: "anonymous" });
    render(<AppLayout />);

    expect(screen.getByTestId("redirect")).toHaveTextContent("/login");
    expect(mockScreens).toHaveLength(0);
  });

  it("declares every route file under app/(app), so none can leak into the tab bar", () => {
    // `Tabs` auto-registers every file in the directory; one the layout does
    // not declare renders AS A TAB. The left side is read from disk, not from
    // the layout, so a new route file without a DETAIL_ROUTE_NAMES entry
    // fails here even though the derived TOTAL_ROUTES above would not notice.
    expect(new Set(listRouteNames())).toEqual(new Set([...ALL_ROUTE_NAMES, ...DETAIL_ROUTE_NAMES]));
  });

  it("declares every detail route with href: null", () => {
    useSessionStore.getState().setSession(makeUser("STUDENT"), scopes);
    render(<AppLayout />);

    for (const name of DETAIL_ROUTE_NAMES) {
      const declared = mockScreens.find((s) => s.name === name);
      expect(declared).toBeDefined();
      expect(declared?.href).toBeNull();
    }
  });
});
```

Replace `apps/mobile/src/__tests__/placeholder-screens.test.tsx`'s `describe`
block (keep its header comment and the 18 imports/rows as they are today)
with:

```tsx
const PLACEHOLDER_MESSAGE = "This screen isn't built yet.";

describe("placeholder screens", () => {
  it("lists exactly the route files that still render the placeholder message", () => {
    // Derived from disk, not pinned (ruling X9). A plan that builds a screen
    // deletes its row below and nothing else; forgetting to delete it fails
    // here, and so does adding a placeholder file without a row.
    const onDisk = listRouteNames()
      .filter((name) => readRouteSource(name).includes(PLACEHOLDER_MESSAGE))
      .sort();
    expect(PLACEHOLDER_SCREENS.map(([route]) => route).sort()).toEqual(onDisk);
  });

  // When the last row is deleted, delete this whole file: `it.each` refuses
  // an empty table.
  it.each(PLACEHOLDER_SCREENS)("renders %s with its title and placeholder message", (_route, Component, title) => {
    renderWithProviders(<Component />);

    expect(screen.getByText(title)).toBeTruthy();
    expect(screen.getByText(PLACEHOLDER_MESSAGE)).toBeTruthy();
  });
});
```

and add `import { listRouteNames, readRouteSource } from "./helpers/routes";`
beside the existing `renderWithProviders` import. Replace the header
comment's last paragraph ("`dashboard` used to be in this list … from 19 to
18.") with: "Rows are deleted as screens are built; the first test derives
the expected set from disk, so there is no count to maintain (ruling X9)."

Append to the `describe("route file layout (P13)", …)` block of
`apps/mobile/src/__tests__/role-tabs.test.tsx` (and add
`import { ambiguousRouteSiblings } from "./helpers/routes";` to its imports):

```ts
  it("no route directory anywhere has a same-named sibling file (ruling X7)", () => {
    // The href-only check above cannot see dynamic routes: session/[id].tsx
    // beside session/[id]/attendance.tsx is not a nav href, but it is the
    // same ambiguity. Dynamic segments with children use [id]/index.tsx.
    expect(ambiguousRouteSiblings()).toEqual([]);
  });
```

- [ ] **Step 3: Run them to see the failure**

Run: `cd apps/mobile && pnpm jest src/__tests__/app-layout.test.tsx src/__tests__/placeholder-screens.test.tsx src/__tests__/role-tabs.test.tsx`
Expected: `app-layout.test.tsx` FAILS to compile/run — `ALL_ROUTE_NAMES` and
`DETAIL_ROUTE_NAMES` are not exported from `_layout.tsx`. The other two PASS
(18 placeholder files on disk match the 18 rows; no ambiguous siblings).

- [ ] **Step 4: Export the two lists from `_layout.tsx`**

In `apps/mobile/app/(app)/_layout.tsx`, change the `ALL_ROUTE_NAMES`
declaration to an export (its doc comment stays) and add the detail list
directly below it:

```tsx
export const ALL_ROUTE_NAMES: readonly string[] = Array.from(
  new Set(ALL_NAV_HREFS.map(routeNameForHref)),
);

/**
 * Detail routes: reachable by navigation, never tabs. They are not in any
 * nav's hrefs, so ALL_ROUTE_NAMES cannot know about them — but `Tabs`
 * auto-registers every file in this directory, and an undeclared screen
 * appears IN the tab bar. Every route file under (app)/ that is not a nav
 * href is listed here; app-layout.test.tsx reads the filesystem and fails if
 * one is missing, and pins that each entry is declared with href: null.
 * Plans add a detail route by appending to this list — nothing else.
 */
export const DETAIL_ROUTE_NAMES: readonly string[] = [];
```

and extend `orderedRouteNames`:

```tsx
  const orderedRouteNames = [
    ...tabs.map((tab) => routeNameForHref(tab.href)),
    ...ALL_ROUTE_NAMES.filter((name) => !tabByRouteName.has(name)),
    ...DETAIL_ROUTE_NAMES,
  ];
```

(`tabByRouteName` never contains a detail route, so each renders with the
existing `{ href: null }` fallback — no other layout change.)

- [ ] **Step 5: Run the tests and the mobile gate**

Run: `cd apps/mobile && pnpm jest src/__tests__/app-layout.test.tsx src/__tests__/placeholder-screens.test.tsx src/__tests__/role-tabs.test.tsx` → PASS.
Run: `pnpm turbo lint typecheck test:unit --filter=@space/mobile` → clean.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile && git commit -m "test(mobile): derive route counts, add session fixtures and route-shape guard"
```

---

### Task 1: Student assignments list

**Files:**
- Create: `apps/mobile/src/hooks/use-assignments.ts`
- Modify: `apps/mobile/src/lib/query-keys.ts` (add `assignments` factory)
- Modify: `apps/mobile/app/(app)/assignments.tsx` (replace the 9-line placeholder)
- Test: `apps/mobile/src/__tests__/assignments-screen.test.tsx`
- Modify: `apps/mobile/src/__tests__/placeholder-screens.test.tsx` (delete the `assignments` row and its import)

**Interfaces:**
- Consumes: `queryKeys` pattern, `apiClient`, `useSessionStore` (`scopes.activeSeasonId`, `user.role`), `studentAssignmentListItemSchema` from `@space/shared`, `formatDueDate` from `../../src/lib/format`, `makeSession` (Task 0).
- Produces: `queryKeys.assignments.all / lists() / bySeason(seasonId: number | null) / details() / detail(id: number | null)` (Tasks 3/4/5 invalidate against these); `useStudentAssignments(seasonId: number | null): UseQueryResult<StudentAssignmentListItem[]>`.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/__tests__/assignments-screen.test.tsx
import { fireEvent, screen } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn() },
}));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";

import AssignmentsScreen from "../../app/(app)/assignments";

const get = apiClient.get as jest.Mock;

const studentSession = makeSession(
  "STUDENT",
  { activeSeasonId: 7 },
  { id: 9, name: "Test student", email: "s@jpc.test" },
);

const row = {
  id: 41,
  title: "Essay one",
  dueAt: "2099-04-01T21:59:00.000Z",
  isOverdue: false,
  status: "PENDING" as const,
  reviewedAt: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("AssignmentsScreen (student)", () => {
  it("lists assignments with their server-derived status", async () => {
    useSessionStore.setState(studentSession);
    get.mockResolvedValue({ data: { data: { assignments: [row] } } });

    renderWithProviders(<AssignmentsScreen />);

    expect(await screen.findByText("Essay one")).toBeTruthy();
    expect(screen.getByText(/Not started/)).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/seasons/7/assignments");
  });

  it("marks an overdue assignment from the contract flag, not a local date compare", async () => {
    useSessionStore.setState(studentSession);
    // dueAt in the FUTURE but isOverdue true: only the server flag may decide.
    get.mockResolvedValue({
      data: { data: { assignments: [{ ...row, dueAt: "2099-04-01T00:00:00.000Z", isOverdue: true }] } },
    });

    renderWithProviders(<AssignmentsScreen />);

    expect(await screen.findByText(/Overdue/)).toBeTruthy();
  });

  it("navigates to the detail route on press", async () => {
    useSessionStore.setState(studentSession);
    get.mockResolvedValue({ data: { data: { assignments: [row] } } });

    renderWithProviders(<AssignmentsScreen />);
    fireEvent.press(await screen.findByText("Essay one"));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/assignment/[id]",
      params: { id: "41" },
    });
  });

  it("shows its own empty state with no active season, without calling the API", async () => {
    useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: null }));

    renderWithProviders(<AssignmentsScreen />);

    expect(await screen.findByText("No active season")).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  });

  it("does not run the student query for staff (their branch is Plan 15's)", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));

    renderWithProviders(<AssignmentsScreen />);

    expect(await screen.findByText("Assignments")).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd apps/mobile && pnpm jest src/__tests__/assignments-screen.test.tsx`
Expected: FAIL — the screen is still the placeholder, no "Essay one".

- [ ] **Step 3: Add the query-key factory**

In `apps/mobile/src/lib/query-keys.ts`, add a sibling to `sessions` inside the
same `queryKeys` object (same spreading pattern — the file's header comment
explains why; `null` rather than a sentinel for the same reason as
`sessions.bySeason`):

```ts
  assignments: {
    all: ["assignments"] as const,
    lists: () => [...queryKeys.assignments.all, "list"] as const,
    bySeason: (seasonId: number | null) =>
      [...queryKeys.assignments.lists(), { seasonId }] as const,
    details: () => [...queryKeys.assignments.all, "detail"] as const,
    detail: (id: number | null) => [...queryKeys.assignments.details(), id] as const,
  },
```

Also replace the header's closing sentence "Only the sessions domain exists so
far — …" with "One small factory per domain, added as screens are wired up."

- [ ] **Step 4: Write the hook**

```ts
// apps/mobile/src/hooks/use-assignments.ts
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { z } from "zod";
import { studentAssignmentListItemSchema, type StudentAssignmentListItem } from "@space/shared";

import { apiClient } from "../lib/api-client";
import { queryKeys } from "../lib/query-keys";

const studentListSchema = z.array(studentAssignmentListItemSchema);

async function fetchStudentAssignments(seasonId: number): Promise<StudentAssignmentListItem[]> {
  const res = await apiClient.get(`/api/v1/seasons/${seasonId}/assignments`);
  // The endpoint returns a different row shape per role; this hook is the
  // student's, so it parses the student arm specifically — a union parse
  // would quietly accept the staff shape and hide a role-routing bug.
  return studentListSchema.parse(res.data.data.assignments);
}

/** Dependent query — same nullable-season contract as useSeasonSessions. */
export function useStudentAssignments(
  seasonId: number | null,
): UseQueryResult<StudentAssignmentListItem[]> {
  return useQuery({
    queryKey: queryKeys.assignments.bySeason(seasonId),
    queryFn: () => fetchStudentAssignments(seasonId as number),
    enabled: seasonId !== null,
  });
}
```

(`seasonId as number` narrows a local variable the `enabled` gate has already
proven non-null; it is not a cast of an API response.)

- [ ] **Step 5: Write the screen**

Replace `apps/mobile/app/(app)/assignments.tsx`:

```tsx
import { useRouter } from "expo-router";
import { Pressable } from "react-native";
import type { StudentAssignmentListItem } from "@space/shared";

import { useStudentAssignments } from "../../src/hooks/use-assignments";
import { formatDueDate } from "../../src/lib/format";
import { useSessionStore } from "../../src/store/session";
import { useTheme } from "../../src/theme";
import { Card, EmptyState, ErrorState, LoadingState, Screen, Text } from "../../src/ui";

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

export default function AssignmentsScreen() {
  const role = useSessionStore((s) => s.user?.role ?? null);
  const seasonId = useSessionStore((s) => s.scopes?.activeSeasonId ?? null);
  // Staff land here too (D1: one route per destination). Their branch is
  // Plan 15's; querying the student hook for them would parse the wrong
  // schema arm, so the query is gated on role as well as season.
  const isStudent = role === "STUDENT";
  const { data, isPending, isError, refetch, isRefetching } = useStudentAssignments(
    isStudent ? seasonId : null,
  );

  const handleRefresh = () => {
    if (isStudent && seasonId !== null) void refetch();
  };

  if (!isStudent) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <EmptyState title="Assignments" message="Managing assignments isn't available in the app yet." />
      </Screen>
    );
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

(The staff message deliberately does not contain "This screen isn't built
yet." — the placeholder test's disk scan would otherwise count it.)

- [ ] **Step 6: Delete the placeholder row**

In `placeholder-screens.test.tsx` delete the `["assignments", AssignmentsScreen, "Assignments"]`
row and the `AssignmentsScreen` import. No count to change (Task 0).

- [ ] **Step 7: Run the new test and the full unit suite**

Run: `cd apps/mobile && pnpm jest src/__tests__/assignments-screen.test.tsx src/__tests__/placeholder-screens.test.tsx` → PASS (5 + the remaining placeholders).
Run: `pnpm turbo lint typecheck test:unit --filter=@space/mobile` → clean.
The typecheck of Step 5's `router.push` **fails until Task 2's route file exists** — if running Task 1 before Task 2 (parallel execution), expect exactly that one error and re-run after Task 2 lands; the test suite itself passes because the router is mocked.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile && git commit -m "feat(mobile): student assignments list"
```

---

### Task 2: First dynamic route — `assignment/[id]` foundation

**Files:**
- Create: `apps/mobile/app/(app)/assignment/[id].tsx` (minimal but real screen; Task 3 extends it)
- Modify: `apps/mobile/app/(app)/_layout.tsx` (append to `DETAIL_ROUTE_NAMES`)
- Modify: `apps/mobile/src/__tests__/app-layout.test.tsx` (one assertion)

`assignment/[id]` has no child routes, so the file form is correct here.
A dynamic segment that gains children later moves to `assignment/[id]/index.tsx`
(ruling X7; Task 0's guard enforces it).

**Interfaces:**
- Consumes: `DETAIL_ROUTE_NAMES` (Task 0).
- Produces: `DETAIL_ROUTE_NAMES` containing `"assignment/[id]"`; the route `/assignment/[id]` in the typed route tree, which Task 1's `router.push` needs to typecheck.

- [ ] **Step 1: Write the failing test**

Add to the `describe` in `apps/mobile/src/__tests__/app-layout.test.tsx`:

```tsx
  it("registers assignment/[id] as a hidden detail route", () => {
    expect(DETAIL_ROUTE_NAMES).toContain("assignment/[id]");

    useSessionStore.getState().setSession(makeUser("STUDENT"), scopes);
    render(<AppLayout />);

    expect(mockScreens.find((s) => s.name === "assignment/[id]")?.href).toBeNull();
  });
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd apps/mobile && pnpm jest src/__tests__/app-layout.test.tsx`
Expected: FAIL — `DETAIL_ROUTE_NAMES` is empty.

- [ ] **Step 3: Create the route file and register it**

`apps/mobile/app/(app)/assignment/[id].tsx` (note the extra `../` — this file
is one level deeper than the tab screens):

```tsx
import { useLocalSearchParams } from "expo-router";

import { Screen, Text } from "../../../src/ui";

export default function AssignmentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Screen edges={["top", "left", "right"]}>
      <Text variant="heading">{`Assignment ${id}`}</Text>
    </Screen>
  );
}
```

In `_layout.tsx`:

```tsx
export const DETAIL_ROUTE_NAMES: readonly string[] = ["assignment/[id]"];
```

- [ ] **Step 4: Regenerate typed routes, run tests**

Run: `pnpm turbo routes:generate --filter=@space/mobile`
Run: `cd apps/mobile && pnpm jest src/__tests__/app-layout.test.tsx src/__tests__/role-tabs.test.tsx` → PASS
(the "every route file is declared" test now also sees `assignment/[id]` on
disk and in the list; role-tabs' sibling guard finds no `assignment.tsx`).
Run: `pnpm turbo typecheck --filter=@space/mobile` → clean (this is also what unblocks Task 1's `router.push` typecheck).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile && git commit -m "feat(mobile): first dynamic route — assignment/[id] hidden from the tab bar"
```

---

### Task 3: Assignment detail screen

**Files:**
- Modify: `apps/mobile/app/(app)/assignment/[id].tsx` (replace Task 2's stub body)
- Modify: `apps/mobile/src/hooks/use-assignments.ts` (add the detail hook)
- Test: `apps/mobile/src/__tests__/assignment-detail.test.tsx`

**Interfaces:**
- Consumes: `queryKeys.assignments.detail(id)` (Task 1), `assignmentDetailSchema`, `type AssignmentDetail`, `type MySubmissionSummary` from `@space/shared`; route param `id` from Task 2.
- Produces: `useAssignmentDetail(id: number | null): UseQueryResult<AssignmentDetail>`; `submissionStatusLine(sub: MySubmissionSummary): string` (module-local, reused by Task 4); renders `<SubmissionSection detail={...} />` which Task 4 turns into the editor.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/__tests__/assignment-detail.test.tsx
import { screen } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), put: jest.fn(), patch: jest.fn() },
}));
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "41" }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";

import AssignmentDetailScreen from "../../app/(app)/assignment/[id]";

const get = apiClient.get as jest.Mock;

const detail = {
  id: 41,
  seasonId: 7,
  seasonCode: "S26",
  seasonTitle: "Spring 2026",
  sessionId: null,
  sessionTitle: null,
  title: "Essay one",
  description: "Write about the thing.",
  dueAt: "2099-04-01T21:59:00.000Z",
  isOverdue: false,
  isAllGroups: true,
  type: "STANDARD" as const,
  forumMinWords: null,
  forumAllowComments: false,
  maxFileSizeMb: 10,
  allowedMimeCategories: ["pdf" as const],
  groupIds: null,
  mySubmission: null,
  canManage: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(
    makeSession("STUDENT", { activeSeasonId: 7 }, { id: 9, name: "Test student", email: "s@jpc.test" }),
  );
});

describe("AssignmentDetailScreen", () => {
  it("renders title, description and due date from the detail contract", async () => {
    get.mockResolvedValue({ data: { data: detail } });

    renderWithProviders(<AssignmentDetailScreen />);

    expect(await screen.findByText("Essay one")).toBeTruthy();
    expect(screen.getByText("Write about the thing.")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/assignments/41");
  });

  it("shows reviewed feedback from mySubmission", async () => {
    get.mockResolvedValue({
      data: {
        data: {
          ...detail,
          mySubmission: {
            publicId: "abc123defg",
            status: "REVIEWED",
            submittedAt: "2099-03-30T10:00:00.000Z",
            reviewedAt: "2099-03-31T10:00:00.000Z",
            feedback: "Solid work.",
            isLate: false,
          },
        },
      },
    });

    renderWithProviders(<AssignmentDetailScreen />);

    expect(await screen.findByText("Solid work.")).toBeTruthy();
    expect(screen.getByText("Reviewed")).toBeTruthy();
  });

  it("shows the late badge from the contract flag", async () => {
    get.mockResolvedValue({
      data: {
        data: {
          ...detail,
          mySubmission: {
            publicId: "abc123defg",
            status: "SUBMITTED",
            submittedAt: "2099-04-02T10:00:00.000Z",
            reviewedAt: null,
            feedback: null,
            isLate: true,
          },
        },
      },
    });

    renderWithProviders(<AssignmentDetailScreen />);

    expect(await screen.findByText("Submitted late")).toBeTruthy();
  });
});
```

(The REVIEWED and SUBMITTED fixtures are not editable, so Task 4's editor
renders no `Input` for them and these assertions keep passing after Task 4.
Task 4's editor fetches `GET /submissions/:publicId` for them; `get` returns
the assignment detail for that call too, which fails the submission parse —
Task 4 Step 1 replaces these `mockResolvedValue`s with a URL switch, see
there.)

- [ ] **Step 2: Run it to see it fail**

Run: `cd apps/mobile && pnpm jest src/__tests__/assignment-detail.test.tsx`
Expected: FAIL — the stub renders "Assignment 41" and calls nothing.

- [ ] **Step 3: Add the detail hook**

Append to `apps/mobile/src/hooks/use-assignments.ts`, merging the
`@space/shared` import into the existing one (one import statement per
module, per lint):

```ts
import { assignmentDetailSchema, type AssignmentDetail } from "@space/shared";

async function fetchAssignmentDetail(id: number): Promise<AssignmentDetail> {
  const res = await apiClient.get(`/api/v1/assignments/${id}`);
  return assignmentDetailSchema.parse(res.data.data);
}

/** `id` is null while the route param is unparsed or invalid. */
export function useAssignmentDetail(id: number | null): UseQueryResult<AssignmentDetail> {
  return useQuery({
    queryKey: queryKeys.assignments.detail(id),
    queryFn: () => fetchAssignmentDetail(id as number),
    enabled: id !== null,
  });
}
```

- [ ] **Step 4: Implement the screen**

Replace `apps/mobile/app/(app)/assignment/[id].tsx`:

```tsx
import { useLocalSearchParams } from "expo-router";
import type { AssignmentDetail, MySubmissionSummary } from "@space/shared";

import { useAssignmentDetail } from "../../../src/hooks/use-assignments";
import { formatDueDate } from "../../../src/lib/format";
import { useTheme } from "../../../src/theme";
import { Card, EmptyState, ErrorState, LoadingState, Screen, Text } from "../../../src/ui";

function submissionStatusLine(sub: MySubmissionSummary): string {
  if (sub.status === "REVIEWED") return "Reviewed";
  if (sub.status === "RETURNED") return "Returned for revision";
  if (sub.status === "SUBMITTED") return sub.isLate ? "Submitted late" : "Submitted";
  return "Draft";
}

/**
 * The student's submission block. Task 4 replaces the read-only body with the
 * editor; the status/feedback rendering here stays as its top half.
 */
function SubmissionSection({ detail }: { detail: AssignmentDetail }) {
  const theme = useTheme();
  const sub = detail.mySubmission;

  return (
    <Card style={{ marginTop: theme.spacing.md }}>
      <Text variant="heading">Your submission</Text>
      {sub === null ? (
        <Text variant="body" color={theme.colors.neutral[600]}>
          Not started yet.
        </Text>
      ) : (
        <>
          <Text variant="label" color={theme.colors.neutral[600]}>
            {submissionStatusLine(sub)}
          </Text>
          {sub.feedback ? <Text variant="body">{sub.feedback}</Text> : null}
        </>
      )}
    </Card>
  );
}

export default function AssignmentDetailScreen() {
  const theme = useTheme();
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const parsed = Number(rawId);
  const id = Number.isInteger(parsed) && parsed > 0 ? parsed : null;

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
            {`Due ${formatDueDate(data.dueAt)}${data.isOverdue ? " · Overdue" : ""}`}
          </Text>
          {data.description ? (
            <Text variant="body" style={{ marginTop: theme.spacing.sm }}>
              {data.description}
            </Text>
          ) : null}
          <SubmissionSection detail={data} />
        </>
      )}
    </Screen>
  );
}
```

(`Text` has a `title` variant and `Screen` a `scroll` prop — both verified
in `src/ui`.)

- [ ] **Step 5: Run the tests**

Run: `cd apps/mobile && pnpm jest src/__tests__/assignment-detail.test.tsx src/__tests__/app-layout.test.tsx` → PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile && git commit -m "feat(mobile): assignment detail screen with submission status"
```

---

### Task 4: Submission editor — start, save, submit

**Files:**
- Modify: `packages/shared/src/submission.ts` (two response schemas)
- Create: `apps/mobile/src/hooks/use-submission.ts`
- Modify: `apps/mobile/src/lib/query-keys.ts` (add `submissions` factory)
- Modify: `apps/mobile/app/(app)/assignment/[id].tsx` (`SubmissionSection` gains the editor)
- Modify: `apps/mobile/src/__tests__/assignment-detail.test.tsx` (URL-switched `get` mocks, Step 1)
- Test: `apps/mobile/src/__tests__/submission-editor.test.tsx`

**Interfaces:**
- Consumes: `queryKeys.assignments` (Task 1), `submissionDetailSchema`, `submissionStatusSchema` from `@space/shared`; `detail.mySubmission` shape from Task 3.
- Produces:
  - `ensureSubmissionResponseSchema` (`{ publicId, status }`) and `saveSubmissionResponseSchema` (`{ saved: true, submitted: boolean }`) in `packages/shared/src/submission.ts`
  - `queryKeys.submissions.all / details() / detail(publicId: string | null)`
  - `useEnsureSubmission(assignmentId: number)`, `useSubmissionDetail(publicId: string | null)`, `useSaveSubmission(publicId: string, assignmentId: number)` — Plan 2's review screen reuses `useSubmissionDetail` and extends `queryKeys.submissions`.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/__tests__/submission-editor.test.tsx
import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), put: jest.fn(), patch: jest.fn() },
}));
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "41" }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";

import AssignmentDetailScreen from "../../app/(app)/assignment/[id]";

const get = apiClient.get as jest.Mock;
const put = apiClient.put as jest.Mock;
const patch = apiClient.patch as jest.Mock;

const detailNoSubmission = {
  id: 41, seasonId: 7, seasonCode: "S26", seasonTitle: "Spring 2026",
  sessionId: null, sessionTitle: null, title: "Essay one",
  description: null, dueAt: null, isOverdue: false, isAllGroups: true,
  type: "STANDARD" as const, forumMinWords: null, forumAllowComments: false,
  maxFileSizeMb: 10, allowedMimeCategories: [], groupIds: null,
  mySubmission: null, canManage: false,
};

const draftSummary = {
  publicId: "abc123defg", status: "DRAFT" as const, submittedAt: null,
  reviewedAt: null, feedback: null, isLate: false,
};

const submissionDetail = {
  id: 900, publicId: "abc123defg", status: "DRAFT" as const,
  text: "first draft", feedback: null,
  submittedAt: null, reviewedAt: null, isLate: false,
  assignmentId: 41, assignmentTitle: "Essay one", assignmentDueAt: null,
  assignmentDescription: null, seasonCode: "S26",
  studentUserId: 9, studentName: "Test student", studentEmail: "s@jpc.test",
  files: [], canUploadFiles: false, canReview: false,
};

function serve(assignment: unknown) {
  get.mockImplementation((url: string) =>
    url === "/api/v1/assignments/41"
      ? Promise.resolve({ data: { data: assignment } })
      : Promise.resolve({ data: { data: submissionDetail } }),
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(
    makeSession("STUDENT", { activeSeasonId: 7 }, { id: 9, name: "Test student", email: "s@jpc.test" }),
  );
});

describe("submission editor", () => {
  it("starts a submission via the idempotent PUT, then loads its text", async () => {
    // The PUT's onSuccess invalidates the assignment detail; the refetch must
    // then see the submission it created, or the editor never appears. Model
    // that state change: null before the PUT resolves, a row after.
    let submissionStarted = false;
    put.mockImplementation(() => {
      submissionStarted = true;
      return Promise.resolve({ data: { data: { publicId: "abc123defg", status: "DRAFT" } } });
    });
    get.mockImplementation((url: string) =>
      url === "/api/v1/assignments/41"
        ? Promise.resolve({
            data: {
              data: submissionStarted
                ? { ...detailNoSubmission, mySubmission: draftSummary }
                : detailNoSubmission,
            },
          })
        : Promise.resolve({ data: { data: submissionDetail } }),
    );

    renderWithProviders(<AssignmentDetailScreen />);
    fireEvent.press(await screen.findByText("Start working"));

    await waitFor(() =>
      expect(put).toHaveBeenCalledWith("/api/v1/submissions/by-assignment/41"),
    );
    expect(await screen.findByDisplayValue("first draft")).toBeTruthy();
  });

  it("saves a draft without submitting, and submits explicitly", async () => {
    serve({ ...detailNoSubmission, mySubmission: draftSummary });
    patch.mockResolvedValue({ data: { data: { saved: true, submitted: false } } });

    renderWithProviders(<AssignmentDetailScreen />);

    const input = await screen.findByLabelText("Your answer");
    fireEvent.changeText(input, "better draft");

    fireEvent.press(screen.getByText("Save draft"));
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/api/v1/submissions/abc123defg", {
        text: "better draft",
      }),
    );

    patch.mockResolvedValue({ data: { data: { saved: true, submitted: true } } });
    fireEvent.press(screen.getByText("Submit"));
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/api/v1/submissions/abc123defg", {
        text: "better draft",
        submit: true,
      }),
    );
  });

  it("surfaces a malformed save response as an error instead of trusting it", async () => {
    // Parse, don't cast (ruling X10): a drifted payload must fail loudly.
    serve({ ...detailNoSubmission, mySubmission: draftSummary });
    patch.mockResolvedValue({ data: { data: { saved: "yes" } } });

    renderWithProviders(<AssignmentDetailScreen />);
    fireEvent.press(await screen.findByText("Save draft"));

    expect(await screen.findByText(/Couldn't save/)).toBeTruthy();
  });

  it("explains why attachments are unavailable instead of showing a dead control", async () => {
    serve({ ...detailNoSubmission, mySubmission: draftSummary });

    renderWithProviders(<AssignmentDetailScreen />);

    // canUploadFiles=false + maxFileSizeMb set: the assignment expects a file
    // the app cannot take yet. Say so; never render an attach button that 503s.
    expect(await screen.findByText(/attachments aren't available/i)).toBeTruthy();
  });
});
```

In `assignment-detail.test.tsx`, add the same URL switch so the editor's
`GET /submissions/:publicId` gets a submission, not the assignment:

```tsx
const submissionFor = (status: "REVIEWED" | "SUBMITTED", isLate: boolean, feedback: string | null) => ({
  id: 900, publicId: "abc123defg", status, text: "the work", feedback,
  submittedAt: "2099-03-30T10:00:00.000Z",
  reviewedAt: status === "REVIEWED" ? "2099-03-31T10:00:00.000Z" : null,
  isLate, assignmentId: 41, assignmentTitle: "Essay one", assignmentDueAt: null,
  assignmentDescription: null, seasonCode: "S26", studentUserId: 9,
  studentName: "Test student", studentEmail: "s@jpc.test",
  files: [], canUploadFiles: false, canReview: false,
});
```

and replace its second and third tests with:

```tsx
  it("shows reviewed feedback from mySubmission", async () => {
    const assignment = {
      ...detail,
      mySubmission: {
        publicId: "abc123defg", status: "REVIEWED" as const,
        submittedAt: "2099-03-30T10:00:00.000Z", reviewedAt: "2099-03-31T10:00:00.000Z",
        feedback: "Solid work.", isLate: false,
      },
    };
    get.mockImplementation((url: string) =>
      Promise.resolve({
        data: { data: url === "/api/v1/assignments/41" ? assignment : submissionFor("REVIEWED", false, "Solid work.") },
      }),
    );

    renderWithProviders(<AssignmentDetailScreen />);

    expect(await screen.findByText("Solid work.")).toBeTruthy();
    expect(screen.getByText("Reviewed")).toBeTruthy();
  });

  it("shows the late badge from the contract flag", async () => {
    const assignment = {
      ...detail,
      mySubmission: {
        publicId: "abc123defg", status: "SUBMITTED" as const,
        submittedAt: "2099-04-02T10:00:00.000Z", reviewedAt: null, feedback: null, isLate: true,
      },
    };
    get.mockImplementation((url: string) =>
      Promise.resolve({
        data: { data: url === "/api/v1/assignments/41" ? assignment : submissionFor("SUBMITTED", true, null) },
      }),
    );

    renderWithProviders(<AssignmentDetailScreen />);

    expect(await screen.findByText("Submitted late")).toBeTruthy();
  });
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd apps/mobile && pnpm jest src/__tests__/submission-editor.test.tsx`
Expected: FAIL — no "Start working" button exists.

- [ ] **Step 3: Add the shared response schemas**

Append to `packages/shared/src/submission.ts` (`submissionStatusSchema` is
already imported there from `./enums`):

```ts
/** `PUT /submissions/by-assignment/:assignmentId` — idempotent create-or-fetch. */
export const ensureSubmissionResponseSchema = z.object({
  publicId: z.string(),
  status: submissionStatusSchema,
});
export type EnsureSubmissionResponse = z.infer<typeof ensureSubmissionResponseSchema>;

/** `PATCH /submissions/:publicId`. `saved` is always true on success. */
export const saveSubmissionResponseSchema = z.object({
  saved: z.literal(true),
  submitted: z.boolean(),
});
export type SaveSubmissionResponse = z.infer<typeof saveSubmissionResponseSchema>;
```

- [ ] **Step 4: Write the hooks and the query keys**

```ts
// apps/mobile/src/hooks/use-submission.ts
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import {
  ensureSubmissionResponseSchema,
  saveSubmissionResponseSchema,
  submissionDetailSchema,
  type SubmissionDetail,
} from "@space/shared";

import { apiClient } from "../lib/api-client";
import { queryKeys } from "../lib/query-keys";

/**
 * PUT /submissions/by-assignment/:id — idempotent create-or-fetch. The server
 * guarantees a repeat call returns the same row untouched, which is what makes
 * it safe to wire to a button on a screen that can remount.
 */
export function useEnsureSubmission(assignmentId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.put(`/api/v1/submissions/by-assignment/${assignmentId}`);
      return ensureSubmissionResponseSchema.parse(res.data.data);
    },
    onSuccess: () => {
      // The detail's mySubmission went from null to a row.
      void queryClient.invalidateQueries({ queryKey: queryKeys.assignments.detail(assignmentId) });
    },
  });
}

export function useSubmissionDetail(publicId: string | null): UseQueryResult<SubmissionDetail> {
  return useQuery({
    queryKey: queryKeys.submissions.detail(publicId),
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/submissions/${publicId}`);
      return submissionDetailSchema.parse(res.data.data);
    },
    enabled: publicId !== null,
  });
}

export function useSaveSubmission(publicId: string, assignmentId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { text: string; submit?: boolean }) => {
      // `submit` is omitted (not sent as false) on a plain save — the wire
      // contract treats absence and false identically, and omitting keeps the
      // payload byte-for-byte what the test pins.
      const body: { text: string; submit?: boolean } = { text: input.text };
      if (input.submit) body.submit = true;
      const res = await apiClient.patch(`/api/v1/submissions/${publicId}`, body);
      return saveSubmissionResponseSchema.parse(res.data.data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.submissions.detail(publicId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.assignments.detail(assignmentId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.assignments.lists() });
    },
  });
}
```

Add the `submissions` factory to `query-keys.ts` (Plan 2 extends it with
`queues()` / `queue(filters)`):

```ts
  submissions: {
    all: ["submissions"] as const,
    details: () => [...queryKeys.submissions.all, "detail"] as const,
    detail: (publicId: string | null) => [...queryKeys.submissions.details(), publicId] as const,
  },
```

- [ ] **Step 5: Extend `SubmissionSection` into the editor**

In `assignment/[id].tsx`, replace `SubmissionSection` with the two components
below, and update the imports to:

```tsx
import { useState } from "react";
import { useLocalSearchParams } from "expo-router";
import type { AssignmentDetail, MySubmissionSummary } from "@space/shared";

import { useAssignmentDetail } from "../../../src/hooks/use-assignments";
import {
  useEnsureSubmission,
  useSaveSubmission,
  useSubmissionDetail,
} from "../../../src/hooks/use-submission";
import { formatDueDate } from "../../../src/lib/format";
import { useTheme } from "../../../src/theme";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  Screen,
  Text,
} from "../../../src/ui";
```

```tsx
function SubmissionSection({ detail }: { detail: AssignmentDetail }) {
  const theme = useTheme();
  const sub = detail.mySubmission;
  const ensure = useEnsureSubmission(detail.id);

  if (sub === null) {
    return (
      <Card style={{ marginTop: theme.spacing.md }}>
        <Text variant="heading">Your submission</Text>
        <Button title="Start working" onPress={() => ensure.mutate()} loading={ensure.isPending} />
        {ensure.isError ? (
          <Text variant="caption" color={theme.colors.error[700]}>
            Couldn't start your submission. Try again.
          </Text>
        ) : null}
      </Card>
    );
  }
  return <SubmissionEditor detail={detail} summary={sub} />;
}

function SubmissionEditor({ detail, summary }: { detail: AssignmentDetail; summary: MySubmissionSummary }) {
  const theme = useTheme();
  const { data: sub, isPending, isError, refetch } = useSubmissionDetail(summary.publicId);
  const save = useSaveSubmission(summary.publicId, detail.id);
  const [text, setText] = useState<string | null>(null);

  if (isPending) return <LoadingState />;
  if (isError) return <ErrorState message="Couldn't load your submission." onRetry={refetch} />;

  // Local edits win once typing starts; before that, the server's text shows.
  const value = text ?? sub.text ?? "";
  const editable = sub.status === "DRAFT" || sub.status === "RETURNED";

  return (
    <Card style={{ marginTop: theme.spacing.md }}>
      <Text variant="heading">Your submission</Text>
      <Text variant="label" color={theme.colors.neutral[600]}>
        {submissionStatusLine({ ...summary, status: sub.status, isLate: sub.isLate })}
      </Text>
      {sub.feedback ? <Text variant="body">{sub.feedback}</Text> : null}
      {editable ? (
        <>
          <Input label="Your answer" value={value} onChangeText={setText} multiline numberOfLines={8} />
          {detail.maxFileSizeMb !== null && !sub.canUploadFiles ? (
            <Text variant="caption" color={theme.colors.neutral[600]}>
              This assignment expects a file, but attachments aren't available in the app yet.
            </Text>
          ) : null}
          {save.isError ? (
            <Text variant="caption" color={theme.colors.error[700]}>
              Couldn't save. Check your connection and try again.
            </Text>
          ) : null}
          <Button
            title="Save draft"
            variant="secondary"
            onPress={() => save.mutate({ text: value })}
            loading={save.isPending}
          />
          <Button
            title="Submit"
            onPress={() => save.mutate({ text: value, submit: true })}
            loading={save.isPending}
          />
        </>
      ) : null}
    </Card>
  );
}
```

(`Input`'s props extend `TextInputProps`, so `multiline`/`numberOfLines` pass
through its rest spread — verified.)

- [ ] **Step 6: Run the new suite and everything it touches**

Run: `cd apps/mobile && pnpm jest src/__tests__/submission-editor.test.tsx src/__tests__/assignment-detail.test.tsx` → PASS.
Run: `pnpm turbo lint typecheck test:unit --filter=@space/mobile --filter=@space/shared` → clean.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile packages/shared && git commit -m "feat(mobile): submission editor — start, save draft, submit"
```

---

### Task 5: Dashboard shows real assignment counts

"Outstanding" follows ruling C5 and spec 19 §10 D15: an assignment is
outstanding when its status is `PENDING` or `DRAFT` — exactly the complement
of C5's "completed" set (`SUBMITTED | REVIEWED | RETURNED`). A RETURNED
submission counts as completed, not to-do. The predicate is defined once in
`packages/shared` so the client count and Plan 18's server-side dashboard
summary can never disagree.

**Files:**
- Modify: `packages/shared/src/assignment.ts` (add `isAssignmentOutstanding`)
- Test: `packages/shared/src/__tests__/assignment-outstanding.test.ts`
- Modify: `apps/mobile/app/(app)/dashboard.tsx`
- Modify test: `apps/mobile/src/__tests__/dashboard.test.tsx`

**Interfaces:**
- Consumes: `useStudentAssignments` (Task 1), `makeSession` (Task 0); the dashboard's existing sessions query stays untouched.
- Produces: `isAssignmentOutstanding(status: AssignmentStudentStatus): boolean` in `packages/shared/src/assignment.ts` — the single definition spec 19 lists; **Plan 18 imports it, never redefines it**.

- [ ] **Step 0: Shared predicate, test first**

```ts
// packages/shared/src/__tests__/assignment-outstanding.test.ts
import { isAssignmentOutstanding } from "../index";

describe("isAssignmentOutstanding (ruling C5, spec 19 D15)", () => {
  it("is true for PENDING and DRAFT only", () => {
    expect(isAssignmentOutstanding("PENDING")).toBe(true);
    expect(isAssignmentOutstanding("DRAFT")).toBe(true);
  });

  it("treats every C5 'completed' status as not outstanding, RETURNED included", () => {
    expect(isAssignmentOutstanding("SUBMITTED")).toBe(false);
    expect(isAssignmentOutstanding("REVIEWED")).toBe(false);
    expect(isAssignmentOutstanding("RETURNED")).toBe(false);
  });
});
```

Run: `cd packages/shared && pnpm exec jest src/__tests__/assignment-outstanding.test.ts` → FAIL (export missing).
Append to `packages/shared/src/assignment.ts`:

```ts
/**
 * Outstanding = not yet handed in: PENDING or DRAFT. The exact complement of
 * ruling C5's "completed" set (SUBMITTED | REVIEWED | RETURNED), so
 * outstanding + completed = assignments expected of the student. RETURNED is
 * completed for counting purposes even though the student may revise it.
 * One definition (spec 19 §10 D15): the mobile dashboard count and the
 * server-side dashboard summary both call this.
 */
export function isAssignmentOutstanding(status: AssignmentStudentStatus): boolean {
  return status === "PENDING" || status === "DRAFT";
}
```

Run the test again → PASS.

- [ ] **Step 1: Extend the dashboard test**

Add `import { act } from "@testing-library/react-native";` (merge into the
existing import), `import { ScrollView } from "react-native";` and
`import { makeSession } from "./helpers/session";`, then add inside the
`describe`:

```tsx
  it("shows pending and overdue assignment counts for a student", async () => {
    useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }, { id: 9 }));
    get.mockImplementation((url: string) =>
      url === "/api/v1/seasons/7/assignments"
        ? Promise.resolve({
            data: {
              data: {
                assignments: [
                  { id: 1, title: "A", dueAt: null, isOverdue: false, status: "PENDING", reviewedAt: null },
                  { id: 2, title: "B", dueAt: null, isOverdue: true, status: "PENDING", reviewedAt: null },
                  { id: 3, title: "C", dueAt: null, isOverdue: false, status: "DRAFT", reviewedAt: null },
                  { id: 4, title: "D", dueAt: null, isOverdue: true, status: "RETURNED", reviewedAt: null },
                  { id: 5, title: "E", dueAt: null, isOverdue: false, status: "SUBMITTED", reviewedAt: null },
                ],
              },
            },
          })
        : Promise.resolve({ data: { data: { sessions: [] } } }),
    );

    renderWithProviders(<DashboardScreen />);

    // Outstanding = PENDING or DRAFT (C5 / spec 19 D15): 3 rows, 1 overdue.
    // The RETURNED row is completed under C5 — its isOverdue flag must not
    // leak into the count. Server-derived rows, no date math on the device.
    expect(await screen.findByText("3 to do · 1 overdue")).toBeTruthy();
  });

  it("pull-to-refresh refetches the assignments as well as the sessions", async () => {
    useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }, { id: 9 }));
    get.mockImplementation((url: string) =>
      url === "/api/v1/seasons/7/assignments"
        ? Promise.resolve({ data: { data: { assignments: [] } } })
        : Promise.resolve({ data: { data: { sessions: [] } } }),
    );

    renderWithProviders(<DashboardScreen />);
    await screen.findByText("0 to do · 0 overdue");
    get.mockClear();

    await act(async () => {
      screen.UNSAFE_getByType(ScrollView).props.refreshControl.props.onRefresh();
    });

    await waitFor(() => {
      expect(get).toHaveBeenCalledWith("/api/v1/seasons/7/sessions");
      expect(get).toHaveBeenCalledWith("/api/v1/seasons/7/assignments");
    });
  });
```

Existing dashboard tests set no `user`; the summary must render nothing for
them (no role → no assignments query) so they keep passing unchanged.

- [ ] **Step 2: Run to see it fail**

Run: `cd apps/mobile && pnpm jest src/__tests__/dashboard.test.tsx`
Expected: the two new cases FAIL ("… to do · … overdue" not found), old cases PASS.

- [ ] **Step 3: Implement the summary card**

In `dashboard.tsx`, add
`import { isAssignmentOutstanding, type StudentAssignmentListItem } from "@space/shared";`
(merge with the existing type import) and
`import { useStudentAssignments } from "../../src/hooks/use-assignments";`,
then add above `DashboardScreen`:

```tsx
function AssignmentsSummary({ rows }: { rows: StudentAssignmentListItem[] }) {
  const theme = useTheme();
  // "To do" = outstanding per the one shared definition (C5, spec 19 D15).
  // Overdue is the server's flag (C4); this counts rows, it derives nothing.
  const todo = rows.filter((a) => isAssignmentOutstanding(a.status));
  const overdue = todo.filter((a) => a.isOverdue);

  return (
    <Card style={{ marginBottom: theme.spacing.sm }}>
      <Text variant="heading">Assignments</Text>
      <Text variant="label" color={theme.colors.neutral[600]}>
        {`${todo.length} to do · ${overdue.length} overdue`}
      </Text>
    </Card>
  );
}
```

In `DashboardScreen`, below the existing `useSeasonSessions` call:

```tsx
  const role = useSessionStore((s) => s.user?.role ?? null);
  const isStudent = role === "STUDENT";
  const assignments = useStudentAssignments(isStudent ? seasonId : null);
```

replace `handleRefresh` with:

```tsx
  const handleRefresh = () => {
    // Refetching a disabled query would still attempt the fetch (React
    // Query's `enabled` only gates the automatic run, not a manual one) —
    // guard both so pulling to refresh with no active season (or as staff,
    // for the student-only assignments query) can't fire a request built
    // from a null id.
    if (seasonId === null) return;
    void refetch();
    if (isStudent) void assignments.refetch();
  };
```

and render `{assignments.data ? <AssignmentsSummary rows={assignments.data} /> : null}`
as the first child inside the `Screen`, before the season/sessions conditional.

- [ ] **Step 4: Run tests, commit**

Run: `cd apps/mobile && pnpm jest src/__tests__/dashboard.test.tsx` → PASS (all).

```bash
git add apps/mobile packages/shared && git commit -m "feat(mobile): dashboard outstanding-assignment counts (C5 definition)"
```

---

### Task 6: `/more` — the role's sidebar, minus its tabs

v1's `src/components/layout/more-menu.tsx` renders: a header, a card with the
user's initials, name and role badge, every sidebar item that is **not**
already a tab (`extraItemsFor`), a theme toggle, and "Sign out". The mobile
port keeps all of it except the theme toggle (the app follows the system
appearance; there is no in-app theme switch to port). MENTOR has no More tab
(its five tabs are its whole sidebar), so the screen is only reachable for
SUPER, ADMIN, LEADER, STUDENT and ALUMNI — it still renders correctly for
anyone.

**Files:**
- Create: `apps/mobile/src/lib/nav-routes.ts`
- Modify: `apps/mobile/app/(app)/more.tsx` (replace the placeholder)
- Test: `apps/mobile/src/__tests__/more-screen.test.tsx`, `apps/mobile/src/__tests__/nav-routes.test.ts`
- Modify: `apps/mobile/src/__tests__/placeholder-screens.test.tsx` (delete the `more` row and its import)

**Interfaces:**
- Consumes: `navFor`, `ALL_NAV_HREFS`, `type NavItem`, `type RoleNav` from `@space/shared`; `useLogout` from `src/hooks/use-session.ts`; `NavIcon` from `src/components/NavIcon`; `makeSession` (Task 0).
- Produces: `navHref(href: string): Href | null` (the one place a nav-data string becomes a typed route — Plans 8, 9, 11 link to sidebar destinations through it) and `moreItemsFor(nav: RoleNav): NavItem[]` in `src/lib/nav-routes.ts`; the real `/more` screen.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/mobile/src/__tests__/nav-routes.test.ts
import { ALL_NAV_HREFS, navByRole, navFor } from "@space/shared";

import { moreItemsFor, navHref } from "../lib/nav-routes";

describe("navHref", () => {
  it("resolves every nav href to a typed route", () => {
    // NAV_ROUTES is hand-listed so each value is compile-checked as an Href;
    // this keeps the list complete as navigation.ts grows.
    expect(ALL_NAV_HREFS.filter((href) => navHref(href) === null)).toEqual([]);
  });

  it("refuses anything that is not a nav href", () => {
    expect(navHref("/nope")).toBeNull();
    expect(navHref("constructor")).toBeNull();
  });
});

describe("moreItemsFor", () => {
  it("is the sidebar minus the tabs, in sidebar order (v1 extraItemsFor)", () => {
    expect(moreItemsFor(navByRole.STUDENT).map((i) => i.label)).toEqual([
      "Current Season", "History", "Profile", "Settings",
    ]);
    expect(moreItemsFor(navByRole.ADMIN).map((i) => i.label)).toEqual([
      "My Season", "Assignments", "Quizzes", "Reports", "Settings",
    ]);
    expect(moreItemsFor(navFor({ role: "STUDENT", graduationYear: 2024 })).map((i) => i.label)).toEqual([
      "Settings",
    ]);
  });
});
```

```tsx
// apps/mobile/src/__tests__/more-screen.test.tsx
import { fireEvent, screen, waitFor } from "@testing-library/react-native";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));
const mockLogout = jest.fn(() => Promise.resolve());
jest.mock("../hooks/use-session", () => ({
  useLogout: () => mockLogout,
}));

import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";

import MoreScreen from "../../app/(app)/more";

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("MoreScreen", () => {
  it("shows the student's sidebar-only destinations and not their tabs", () => {
    useSessionStore.setState(makeSession("STUDENT", {}, { name: "Mina Adel" }));

    renderWithProviders(<MoreScreen />);

    for (const label of ["Current Season", "History", "Profile", "Settings"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    // Already tabs: never duplicated in More.
    expect(screen.queryByText("Assignments")).toBeNull();
    expect(screen.queryByText("Quizzes")).toBeNull();
  });

  it("shows the account card: initials, name and role", () => {
    useSessionStore.setState(makeSession("STUDENT", {}, { name: "Mina Adel" }));

    renderWithProviders(<MoreScreen />);

    expect(screen.getByText("MA")).toBeTruthy();
    expect(screen.getByText("Mina Adel")).toBeTruthy();
    expect(screen.getByText("STUDENT")).toBeTruthy();
  });

  it("shows a different set for an admin, and an alumnus gets only Settings", () => {
    useSessionStore.setState(makeSession("ADMIN"));
    const { unmount } = renderWithProviders(<MoreScreen />);
    expect(screen.getByText("Reports")).toBeTruthy();
    expect(screen.getByText("My Season")).toBeTruthy();
    unmount();

    useSessionStore.setState(makeSession("STUDENT", { graduationYear: 2024 }));
    renderWithProviders(<MoreScreen />);
    expect(screen.getByText("Settings")).toBeTruthy();
    expect(screen.queryByText("History")).toBeNull();
  });

  it("navigates to the item's route on press", () => {
    useSessionStore.setState(makeSession("STUDENT"));

    renderWithProviders(<MoreScreen />);
    fireEvent.press(screen.getByText("History"));

    expect(mockPush).toHaveBeenCalledWith("/history");
  });

  it("signs out through useLogout", async () => {
    useSessionStore.setState(makeSession("STUDENT"));

    renderWithProviders(<MoreScreen />);
    fireEvent.press(screen.getByText("Sign out"));

    await waitFor(() => expect(mockLogout).toHaveBeenCalledTimes(1));
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd apps/mobile && pnpm jest src/__tests__/nav-routes.test.ts src/__tests__/more-screen.test.tsx`
Expected: FAIL — `../lib/nav-routes` does not exist; More is the placeholder.

- [ ] **Step 3: Write `nav-routes.ts`**

```ts
// apps/mobile/src/lib/nav-routes.ts
import type { Href } from "expo-router";
import type { NavItem, RoleNav } from "@space/shared";

/**
 * Nav data in packages/shared is plain strings; typed routes reject a bare
 * `string` (and `as Href` is banned — it would silence exactly the check we
 * want). This table is the one place a nav href becomes an `Href`: each value
 * is a literal that typecheck verifies against the real route tree, and
 * nav-routes.test.ts asserts every ALL_NAV_HREFS entry has a row.
 */
const NAV_ROUTES: Readonly<Record<string, Href>> = {
  "/assignments": "/assignments",
  "/calendar": "/calendar",
  "/dashboard": "/dashboard",
  "/events": "/events",
  "/groups": "/groups",
  "/history": "/history",
  "/more": "/more",
  "/notes": "/notes",
  "/profile": "/profile",
  "/quizzes": "/quizzes",
  "/reports": "/reports",
  "/season": "/season",
  "/seasons": "/seasons",
  "/settings": "/settings",
  "/students": "/students",
  "/students/alumni": "/students/alumni",
  "/students/dropped": "/students/dropped",
  "/submissions": "/submissions",
  "/users": "/users",
};

export function navHref(href: string): Href | null {
  return Object.prototype.hasOwnProperty.call(NAV_ROUTES, href) ? (NAV_ROUTES[href] ?? null) : null;
}

/** v1's `extraItemsFor`: sidebar entries that are not already a tab, in sidebar order. */
export function moreItemsFor(nav: RoleNav): NavItem[] {
  const tabHrefs = new Set(nav.tabs.map((tab) => tab.href));
  return nav.sidebar.filter((item) => !tabHrefs.has(item.href));
}
```

- [ ] **Step 4: Write the screen**

Replace `apps/mobile/app/(app)/more.tsx`:

```tsx
import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import type { NavItem } from "@space/shared";

import { NavIcon } from "../../src/components/NavIcon";
import { useLogout } from "../../src/hooks/use-session";
import { moreItemsFor, navHref } from "../../src/lib/nav-routes";
import { useSessionStore } from "../../src/store/session";
import { useTheme } from "../../src/theme";
import { Button, Card, Screen, Text } from "../../src/ui";

/** v1: first letters of the first two words of the name, else the role's initial. */
function initialsFor(name: string | null, role: string): string {
  const trimmed = name?.trim() || null;
  if (!trimmed) return role.charAt(0).toUpperCase();
  const parts = trimmed.split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

function MoreRow({ item }: { item: NavItem }) {
  const theme = useTheme();
  const router = useRouter();
  const target = navHref(item.href);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        if (target) router.push(target);
      }}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: theme.spacing.md,
        paddingVertical: theme.spacing.md,
      }}
    >
      <NavIcon name={item.icon} color={theme.colors.neutral[700]} size={20} />
      <Text variant="body" style={{ flex: 1 }}>
        {item.label}
      </Text>
    </Pressable>
  );
}

export default function MoreScreen() {
  const theme = useTheme();
  const user = useSessionStore((s) => s.user);
  const nav = useSessionStore((s) => s.nav());
  const logout = useLogout();

  const items = nav ? moreItemsFor(nav) : [];

  return (
    <Screen edges={["top", "left", "right"]} scroll>
      <Text variant="title">More</Text>
      <Text variant="label" color={theme.colors.neutral[600]}>
        Account, settings, and more places to go.
      </Text>

      {user ? (
        <Card style={{ marginTop: theme.spacing.md, flexDirection: "row", alignItems: "center", gap: theme.spacing.md }}>
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: theme.radii.full,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: theme.colors.neutral[100],
            }}
          >
            <Text variant="heading">{initialsFor(user.name, user.role)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            {user.name ? <Text variant="heading">{user.name}</Text> : null}
            <Text variant="caption" color={theme.colors.neutral[600]}>
              {user.role}
            </Text>
          </View>
        </Card>
      ) : null}

      {items.length > 0 ? (
        <Card style={{ marginTop: theme.spacing.md }}>
          {items.map((item) => (
            <MoreRow key={item.href} item={item} />
          ))}
        </Card>
      ) : null}

      <View style={{ marginTop: theme.spacing.lg }}>
        <Button title="Sign out" variant="secondary" onPress={() => void logout()} />
      </View>
    </Screen>
  );
}
```

(`useTheme()` exposes `radii` — `Theme` in `src/theme/index.tsx`.) Signing
out clears the store, and
`(app)/_layout.tsx`'s anonymous guard redirects to `/login` — no navigation
call here.

- [ ] **Step 5: Delete the placeholder row**

In `placeholder-screens.test.tsx` delete the `["more", MoreScreen, "More"]`
row and the `MoreScreen` import.

- [ ] **Step 6: Run the tests and the mobile gate**

Run: `cd apps/mobile && pnpm jest src/__tests__/nav-routes.test.ts src/__tests__/more-screen.test.tsx src/__tests__/placeholder-screens.test.tsx` → PASS.
Run: `pnpm turbo lint typecheck test:unit --filter=@space/mobile` → clean (typecheck is what proves every `NAV_ROUTES` value is a real route).

- [ ] **Step 7: Commit**

```bash
git add apps/mobile && git commit -m "feat(mobile): More screen renders the role's sidebar-only destinations"
```

---

### Task 7: Closing gate (coordinator)

**Files:** none created — verification only.

- [ ] **Step 1: Full suite**

Run: `pnpm turbo lint typecheck test:unit` (repo root) → all tasks green.
`routes:generate` output (`apps/mobile/expo-env.d.ts`, `.expo/types`) must be
current — `typecheck` depends on it via turbo, so a clean run proves it.

- [ ] **Step 2: Mutation pass**

Run one at a time; each must break at least one test, then restore:

1. In `assignments.tsx`'s `statusLabel`, replace `item.isOverdue` with a local
   date compare (`new Date(item.dueAt ?? 0) < new Date()`) — the "overdue from
   the contract flag" test (future `dueAt`, `isOverdue: true`) must fail.
2. In `use-submission.ts`'s `useSaveSubmission`, always send `submit: true` —
   the "saves a draft without submitting" test must fail on the payload
   assertion.
3. In `useSaveSubmission`, replace `saveSubmissionResponseSchema.parse(res.data.data)`
   with `res.data.data` — the "malformed save response" test must fail.
4. Remove `"assignment/[id]"` from `DETAIL_ROUTE_NAMES` — app-layout's
   "every route file is declared" test must fail.
5. In `moreItemsFor`, return `nav.sidebar` unfiltered — the `moreItemsFor`
   test and "not their tabs" test must fail.
6. Add `|| status === "RETURNED"` to `isAssignmentOutstanding` — the shared
   predicate test and the dashboard "3 to do · 1 overdue" test must fail.

- [ ] **Step 3: Device checklist (manual, on Expo Go or a dev build)**

Backend running (`pnpm --filter @space/backend dev`), `apiClient` base URL
pointed at it. As a student account on staging:

1. Log in → dashboard shows the assignments summary card; pull to refresh updates it.
2. Assignments tab → list matches the season; statuses read correctly.
3. Open an untouched assignment → "Start working" → editor appears with empty text.
4. Type, "Save draft", kill the app, reopen → text survived (server round-trip).
5. "Submit" → status flips to Submitted; list row updates without a manual refresh.
6. An assignment with `maxFileSizeMb` set shows the attachments-unavailable note.
7. More tab → Current Season, History, Profile, Settings listed; each opens its
   (still placeholder) screen; "Sign out" returns to login.
8. As an admin account: More lists My Season, Assignments, Quizzes, Reports,
   Settings; the Assignments screen shows the staff message, no error.

- [ ] **Step 4: Commit anything the checklist shook out, then hand back**

Report: suite counts, the six mutation outcomes, device checklist results,
and any divergence from this plan discovered while implementing.

---

## Revision 2026-10-05

- **Task 0 added** (ruling X9, review B4/B5): `helpers/session.ts`
  (`makeUser`/`makeScopes`/`makeSession`, all fixtures carry `avatarPath`),
  `helpers/routes.ts` (`listRouteNames`, `readRouteSource`,
  `ambiguousRouteSiblings`), exported `ALL_ROUTE_NAMES` / `DETAIL_ROUTE_NAMES`
  from `_layout.tsx`; `app-layout.test.tsx` derives `TOTAL_ROUTES` and checks
  every route file on disk is declared; `placeholder-screens.test.tsx` drops
  its length pin for a disk-derived set; `role-tabs.test.tsx` gains the X7
  sibling guard. The nonexistent `renderLayoutAndCollectScreens()` helper is gone.
- **Task 6 added** (ruling X15, audit G3): `/more` renders `navFor(user).sidebar`
  minus tabs (v1 `more-menu.tsx`), with `navHref` / `moreItemsFor` in
  `src/lib/nav-routes.ts`. Old Task 6 (closing gate) is now Task 7.
- Casts → parse (X10): `ensureSubmissionResponseSchema`,
  `saveSubmissionResponseSchema` added to `packages/shared/src/submission.ts`;
  new test pins a malformed save response.
- `queryKeys.assignments.detail` and `queryKeys.submissions.detail` take `null`
  instead of a `-1` / `""` sentinel (review S5).
- `statusLabel` comment corrected (review S6); due dates use `formatDueDate`.
- Dashboard pull-to-refresh refetches assignments too (review nit), with a test.
- Dashboard "to do" now means outstanding = PENDING | DRAFT (ruling C5, spec 19
  §10 D15); RETURNED is completed. Defined once as `isAssignmentOutstanding`
  in `packages/shared/src/assignment.ts` (Plan 18 reuses it); test fixtures
  add DRAFT and an overdue RETURNED row to pin it.
- Assignment-detail tests serve a real submission for the editor's fetch.
- Staff branch of `/assignments` names its owner (Plan 15) and no longer
  matches the placeholder text.
- Header states the dependency/order per the rulings.

Cross-plan consistency pass (execution order 1 → 2 → 3 → 4 → 15 → 16 → 5 → 6 → 7 → 17 → 14 → 8 → …):
- Header's execution-order line corrected to the authoritative order (17 runs after 7, not before 6).
