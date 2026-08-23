# Plan 1 — Student Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A student logs in, sees their assignment list, opens one, writes and submits work, and sees feedback — end to end against the live backend.

**Architecture:** Three screens over four existing endpoints. The assignments
list replaces its placeholder; `assignment/[id]` is the app's **first dynamic
route** (Task 2 establishes the pattern every later detail route copies); the
submission editor lives inside the detail screen and drives the
`PUT by-assignment` → `PATCH` flow. All server-derived flags (`isOverdue`,
`isLate`, `canUploadFiles`) are consumed from the contracts, never recomputed
(ruling C4).

**Tech Stack:** Expo SDK 54 / expo-router 6 (typed routes), React Query 5,
Zustand 5, Zod contracts from `@space/shared`, RNTL 13 via
`renderWithProviders`.

**Spec:** `docs/superpowers/specs/domains/07-assignments.md`,
`docs/superpowers/specs/domains/08-submissions.md`,
`docs/superpowers/specs/domains/_DECISIONS.md` (C4, C6, C8),
scope from `docs/superpowers/plans/2026-08-24-migration-roadmap.md` § Plan 1.

## Global Constraints

- Relative imports only — **no `@/` alias** (Jest would resolve it, Metro would not).
- Every response is **parsed with a Zod schema from `@space/shared`**, never cast.
- Dependent queries pass `enabled`, and manual `refetch()` is guarded too.
- Screens map states to `LoadingState` / `ErrorState` (with `onRetry`) / `EmptyState`.
- Tab screens pass `edges={["top", "left", "right"]}` to `Screen`.
- Tests use `renderWithProviders`; `jest.mock` factories may only close over consts named `mock*`; query `Input` fields with `getByLabelText`, assert errors via `accessibilityHint`.
- Typed routes: never `as Href` / `as any`. After adding a route file run `pnpm turbo routes:generate --filter=@space/mobile`.
- Backend endpoints consumed (all exist on `main`, verified):
  - `GET /api/v1/seasons/:seasonId/assignments` → `{ data: { assignments: StudentAssignmentListItem[] } }` for a STUDENT caller
  - `GET /api/v1/assignments/:id` → `{ data: AssignmentDetail }` (`mySubmission` populated for students, `groupIds` null)
  - `PUT /api/v1/submissions/by-assignment/:assignmentId` → `{ data: { publicId, status } }` (idempotent create-or-fetch)
  - `GET /api/v1/submissions/:publicId` → `{ data: SubmissionDetail }` (has `text`, `feedback`, `isLate`, `canUploadFiles`)
  - `PATCH /api/v1/submissions/:publicId` body `{ text, submit? }` → `{ data: { saved, submitted } }`

**Execution shape:** Task 1 and Task 2 are independent — two subagents may run
them in parallel. Task 3 needs Task 2; Task 4 needs Task 3. Task 5 needs
Task 1. Task 6 is the coordinator's closing gate.

---

### Task 1: Student assignments list

**Files:**
- Create: `apps/mobile/src/hooks/use-assignments.ts`
- Modify: `apps/mobile/src/lib/query-keys.ts` (add `assignments` factory)
- Modify: `apps/mobile/app/(app)/assignments.tsx` (replace the 9-line placeholder)
- Test: `apps/mobile/src/__tests__/assignments-screen.test.tsx`
- Modify: `apps/mobile/src/__tests__/placeholder-screens.test.tsx` (remove `assignments` from whatever list of placeholders it asserts on — read it first; it currently covers every placeholder screen and will fail once this one is real)

**Interfaces:**
- Consumes: `queryKeys` pattern, `apiClient`, `useSessionStore` (`scopes.activeSeasonId`, `user.role`), `studentAssignmentListItemSchema` from `@space/shared`, `formatDate` from `../../src/lib/format`.
- Produces: `queryKeys.assignments.all/lists()/bySeason(seasonId)` and `queryKeys.assignments.detail(id)` (Task 3/4/5 invalidate against these); `useStudentAssignments(seasonId: number | null): UseQueryResult<StudentAssignmentListItem[]>`.

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

import AssignmentsScreen from "../../app/(app)/assignments";

const get = apiClient.get as jest.Mock;

const studentSession = {
  user: { id: 9, name: "Test student", email: "s@jpc.test", role: "STUDENT" as const },
  scopes: { seasonAdminIds: [], groupLeaderIds: [], activeSeasonId: 7, graduationYear: null },
};

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
    expect(screen.getByText("Not started")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/seasons/7/assignments");
  });

  it("marks an overdue assignment from the contract flag, not a local date compare", async () => {
    useSessionStore.setState(studentSession);
    // dueAt in the FUTURE but isOverdue true: only the server flag may decide.
    get.mockResolvedValue({
      data: { data: { assignments: [{ ...row, dueAt: "2099-04-01T00:00:00.000Z", isOverdue: true }] } },
    });

    renderWithProviders(<AssignmentsScreen />);

    expect(await screen.findByText("Overdue")).toBeTruthy();
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
    useSessionStore.setState({
      ...studentSession,
      scopes: { ...studentSession.scopes, activeSeasonId: null },
    });

    renderWithProviders(<AssignmentsScreen />);

    expect(await screen.findByText("No active season")).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd apps/mobile && pnpm jest src/__tests__/assignments-screen.test.tsx`
Expected: FAIL — the screen is still the placeholder (`EmptyState "Quizzes"`-style), no "Essay one".

- [ ] **Step 3: Add the query-key factory**

In `apps/mobile/src/lib/query-keys.ts`, add a sibling to `sessions` inside the
same `queryKeys` object (same spreading pattern — the file's header comment
explains why):

```ts
  assignments: {
    all: ["assignments"] as const,
    lists: () => [...queryKeys.assignments.all, "list"] as const,
    bySeason: (seasonId: number | null) =>
      [...queryKeys.assignments.lists(), { seasonId }] as const,
    details: () => [...queryKeys.assignments.all, "detail"] as const,
    detail: (id: number) => [...queryKeys.assignments.details(), id] as const,
  },
```

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

- [ ] **Step 5: Write the screen**

Replace `apps/mobile/app/(app)/assignments.tsx`:

```tsx
import { useRouter } from "expo-router";
import { Pressable } from "react-native";
import type { StudentAssignmentListItem } from "@space/shared";

import { useStudentAssignments } from "../../src/hooks/use-assignments";
import { formatDate } from "../../src/lib/format";
import { useSessionStore } from "../../src/store/session";
import { useTheme } from "../../src/theme";
import { Card, EmptyState, ErrorState, LoadingState, Screen, Text } from "../../src/ui";

function statusLabel(item: StudentAssignmentListItem): string {
  if (item.status === "REVIEWED") return "Reviewed";
  if (item.status === "RETURNED") return "Returned";
  if (item.status === "SUBMITTED") return "Submitted";
  if (item.status === "DRAFT") return "Draft";
  // PENDING short-circuits above; overdue only ever describes work not yet
  // handed in, and the flag comes from the server (ruling C4) — a device in
  // another timezone must agree with the leader's screen.
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
          Due {formatDate(item.dueAt)} · {statusLabel(item)}
        </Text>
      </Card>
    </Pressable>
  );
}

export default function AssignmentsScreen() {
  const role = useSessionStore((s) => s.user?.role ?? null);
  const seasonId = useSessionStore((s) => s.scopes?.activeSeasonId ?? null);
  // Staff land here too (D1: one route per destination). Their branch arrives
  // with the admin plans; querying the student hook for them would parse the
  // wrong schema arm, so the query is gated on role as well as season.
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
        <EmptyState title="Assignments" message="The staff view of this screen isn't built yet." />
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

- [ ] **Step 6: Update `placeholder-screens.test.tsx`**

Read it, remove the `assignments` entry from its screen list (it asserts each
placeholder renders "This screen isn't built yet", which is no longer true for
this one). Keep every other entry.

- [ ] **Step 7: Run the new test and the full unit suite**

Run: `cd apps/mobile && pnpm jest src/__tests__/assignments-screen.test.tsx` → PASS (all 4)
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
- Modify: `apps/mobile/app/(app)/_layout.tsx` (register detail routes hidden from the tab bar)
- Modify (read first): `apps/mobile/src/__tests__/role-tabs.test.tsx`, `apps/mobile/src/__tests__/app-layout.test.tsx` — see Step 4.

**Interfaces:**
- Consumes: `ALL_NAV_HREFS`-derived `ALL_ROUTE_NAMES` in `_layout.tsx`.
- Produces: the exported `DETAIL_ROUTE_NAMES` const in `_layout.tsx` (later plans append `"submission/[publicId]"`, `"session/[id]"`, … to it); the route `/assignment/[id]` in the typed route tree, which Task 1's `router.push` needs to typecheck.

- [ ] **Step 1: Write the failing test**

Add to `apps/mobile/src/__tests__/app-layout.test.tsx` (read the file first and
match its existing mocking of `expo-router`'s `Tabs` — it already renders
`AppLayout` with a stubbed navigator and asserts on the screens declared):

```tsx
it("declares detail routes hidden from the tab bar", () => {
  // Tabs auto-registers every file in the directory; a detail route that is
  // not explicitly declared with href: null would appear as a tab. This
  // pins the mechanism the first dynamic route introduces.
  useSessionStore.setState(studentSession); // reuse the file's existing fixture
  const screens = renderLayoutAndCollectScreens(); // the file's existing helper pattern
  const detail = screens.find((s) => s.name === "assignment/[id]");
  expect(detail).toBeTruthy();
  expect(detail?.options?.href).toBeNull();
});
```

If `app-layout.test.tsx` has no such helper, follow whatever assertion style it
does use for hidden screens (it already checks `href: null` for non-tab
routes) — extend that, do not invent a parallel harness.

- [ ] **Step 2: Run it to see it fail**

Run: `cd apps/mobile && pnpm jest src/__tests__/app-layout.test.tsx`
Expected: FAIL — no screen named `assignment/[id]` is declared.

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
      <Text variant="heading">Assignment {id}</Text>
    </Screen>
  );
}
```

In `_layout.tsx`, below `ALL_ROUTE_NAMES`, add:

```tsx
/**
 * Detail routes: reachable by navigation, never tabs. They are not in any
 * nav's hrefs, so ALL_ROUTE_NAMES cannot know about them — but `Tabs`
 * auto-registers every file in this directory, and an undeclared screen
 * appears IN the tab bar. Every dynamic route added under (app)/ must be
 * listed here; app-layout.test.tsx pins that each entry is declared with
 * href: null.
 */
export const DETAIL_ROUTE_NAMES = ["assignment/[id]"] as const;
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

- [ ] **Step 4: Check the two guard tests**

Read `role-tabs.test.tsx`. It checks route coverage between `ALL_NAV_HREFS`
and files on disk. If its assertion is "every nav href has a route file", the
new directory changes nothing. If it also asserts the inverse ("every route
file is a nav href"), exclude `DETAIL_ROUTE_NAMES` from that direction by
importing the const from `_layout.tsx` — one source of truth, no hardcoded
second list. State in the commit message which case it was.

- [ ] **Step 5: Regenerate typed routes, run tests**

Run: `pnpm turbo routes:generate --filter=@space/mobile`
Run: `cd apps/mobile && pnpm jest src/__tests__/app-layout.test.tsx src/__tests__/role-tabs.test.tsx` → PASS
Run: `pnpm turbo typecheck --filter=@space/mobile` → clean (this is also what unblocks Task 1's `router.push` typecheck).

- [ ] **Step 6: Commit**

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
- Produces: `useAssignmentDetail(id: number | null): UseQueryResult<AssignmentDetail>`; renders `<SubmissionSection detail={...} />` which Task 4 fills in (Task 3 ships it as the read-only status block; Task 4 adds the editor).

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

const studentSession = {
  user: { id: 9, name: "Test student", email: "s@jpc.test", role: "STUDENT" as const },
  scopes: { seasonAdminIds: [], groupLeaderIds: [], activeSeasonId: 7, graduationYear: null },
};

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(studentSession);
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

- [ ] **Step 2: Run it to see it fail**

Run: `cd apps/mobile && pnpm jest src/__tests__/assignment-detail.test.tsx`
Expected: FAIL — the stub renders "Assignment 41" and calls nothing.

- [ ] **Step 3: Add the detail hook**

Append to `apps/mobile/src/hooks/use-assignments.ts`:

```ts
import { assignmentDetailSchema, type AssignmentDetail } from "@space/shared";

async function fetchAssignmentDetail(id: number): Promise<AssignmentDetail> {
  const res = await apiClient.get(`/api/v1/assignments/${id}`);
  return assignmentDetailSchema.parse(res.data.data);
}

/** `id` is null while the route param is still unparsed/invalid. */
export function useAssignmentDetail(id: number | null): UseQueryResult<AssignmentDetail> {
  return useQuery({
    queryKey: queryKeys.assignments.detail(id ?? -1),
    queryFn: () => fetchAssignmentDetail(id as number),
    enabled: id !== null,
  });
}
```

(Merge the import lines with the existing ones — one `@space/shared` import
statement, per lint.)

- [ ] **Step 4: Implement the screen**

Replace the body of `apps/mobile/app/(app)/assignment/[id].tsx`:

```tsx
import { useLocalSearchParams } from "expo-router";
import type { AssignmentDetail, MySubmissionSummary } from "@space/shared";

import { useAssignmentDetail } from "../../../src/hooks/use-assignments";
import { formatDate } from "../../../src/lib/format";
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
            Due {formatDate(data.dueAt)}
            {data.isOverdue ? " · Overdue" : ""}
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

Check `Text`'s actual variants in `src/ui/Text.tsx` before using `"title"` —
if the scale has no `title`, use the largest heading variant it does have.
Check `Screen`'s props for `scroll` the same way (Phase 0 defined it; confirm
the prop name).

- [ ] **Step 5: Run the tests**

Run: `cd apps/mobile && pnpm jest src/__tests__/assignment-detail.test.tsx src/__tests__/app-layout.test.tsx` → PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile && git commit -m "feat(mobile): assignment detail screen with submission status"
```

---

### Task 4: Submission editor — start, save, submit

**Files:**
- Create: `apps/mobile/src/hooks/use-submission.ts`
- Modify: `apps/mobile/app/(app)/assignment/[id].tsx` (`SubmissionSection` gains the editor)
- Test: `apps/mobile/src/__tests__/submission-editor.test.tsx`

**Interfaces:**
- Consumes: `queryKeys.assignments` (Task 1), `submissionDetailSchema`, `submissionStatusSchema` from `@space/shared`; `detail.mySubmission` shape from Task 3.
- Produces: `useEnsureSubmission()`, `useSubmissionDetail(publicId: string | null)`, `useSaveSubmission(publicId, assignmentId)` — Plan 2's review screen reuses `useSubmissionDetail`.

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

const submissionDetail = {
  id: 900, publicId: "abc123defg", status: "DRAFT" as const,
  text: "first draft", feedback: null,
  submittedAt: null, reviewedAt: null, isLate: false,
  assignmentId: 41, assignmentTitle: "Essay one", assignmentDueAt: null,
  assignmentDescription: null, seasonCode: "S26",
  studentUserId: 9, studentName: "Test student", studentEmail: "s@jpc.test",
  files: [], canUploadFiles: false, canReview: false,
};

const studentSession = {
  user: { id: 9, name: "Test student", email: "s@jpc.test", role: "STUDENT" as const },
  scopes: { seasonAdminIds: [], groupLeaderIds: [], activeSeasonId: 7, graduationYear: null },
};

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(studentSession);
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
                ? {
                    ...detailNoSubmission,
                    mySubmission: {
                      publicId: "abc123defg", status: "DRAFT", submittedAt: null,
                      reviewedAt: null, feedback: null, isLate: false,
                    },
                  }
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
    get.mockImplementation((url: string) =>
      url === "/api/v1/assignments/41"
        ? Promise.resolve({
            data: {
              data: {
                ...detailNoSubmission,
                mySubmission: {
                  publicId: "abc123defg", status: "DRAFT", submittedAt: null,
                  reviewedAt: null, feedback: null, isLate: false,
                },
              },
            },
          })
        : Promise.resolve({ data: { data: submissionDetail } }),
    );
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

  it("explains why attachments are unavailable instead of showing a dead control", async () => {
    get.mockImplementation((url: string) =>
      url === "/api/v1/assignments/41"
        ? Promise.resolve({
            data: {
              data: {
                ...detailNoSubmission,
                mySubmission: {
                  publicId: "abc123defg", status: "DRAFT", submittedAt: null,
                  reviewedAt: null, feedback: null, isLate: false,
                },
              },
            },
          })
        : Promise.resolve({ data: { data: submissionDetail } }),
    );

    renderWithProviders(<AssignmentDetailScreen />);

    // canUploadFiles=false + maxFileSizeMb set: the assignment expects a file
    // the app cannot take yet. Say so; never render an attach button that 503s.
    expect(await screen.findByText(/attachments aren't available/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd apps/mobile && pnpm jest src/__tests__/submission-editor.test.tsx`
Expected: FAIL — no "Start working" button exists.

- [ ] **Step 3: Write the hooks**

```ts
// apps/mobile/src/hooks/use-submission.ts
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { z } from "zod";
import {
  submissionDetailSchema,
  submissionStatusSchema,
  type SubmissionDetail,
} from "@space/shared";

import { apiClient } from "../lib/api-client";
import { queryKeys } from "../lib/query-keys";

const ensureResponseSchema = z.object({
  publicId: z.string(),
  status: submissionStatusSchema,
});

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
      return ensureResponseSchema.parse(res.data.data);
    },
    onSuccess: () => {
      // The detail's mySubmission went from null to a row.
      void queryClient.invalidateQueries({ queryKey: queryKeys.assignments.detail(assignmentId) });
    },
  });
}

export function useSubmissionDetail(publicId: string | null): UseQueryResult<SubmissionDetail> {
  return useQuery({
    queryKey: queryKeys.submissions.detail(publicId ?? ""),
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
      return res.data.data as { saved: boolean; submitted: boolean };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.submissions.detail(publicId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.assignments.detail(assignmentId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.assignments.lists() });
    },
  });
}
```

Add the `submissions` factory to `query-keys.ts`:

```ts
  submissions: {
    all: ["submissions"] as const,
    details: () => [...queryKeys.submissions.all, "detail"] as const,
    detail: (publicId: string) => [...queryKeys.submissions.details(), publicId] as const,
  },
```

- [ ] **Step 4: Extend `SubmissionSection` into the editor**

In `assignment/[id].tsx`, replace `SubmissionSection` with:

```tsx
function SubmissionSection({ detail }: { detail: AssignmentDetail }) {
  const theme = useTheme();
  const sub = detail.mySubmission;
  const ensure = useEnsureSubmission(detail.id);

  if (sub === null) {
    return (
      <Card style={{ marginTop: theme.spacing.md }}>
        <Text variant="heading">Your submission</Text>
        <Button
          title="Start working"
          onPress={() => ensure.mutate()}
          loading={ensure.isPending}
        />
      </Card>
    );
  }
  return <SubmissionEditor detail={detail} publicId={sub.publicId} />;
}

function SubmissionEditor({ detail, publicId }: { detail: AssignmentDetail; publicId: string }) {
  const theme = useTheme();
  const { data: sub, isPending, isError, refetch } = useSubmissionDetail(publicId);
  const save = useSaveSubmission(publicId, detail.id);
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
        {submissionStatusLine({
          publicId: sub.publicId, status: sub.status, submittedAt: sub.submittedAt,
          reviewedAt: sub.reviewedAt, feedback: sub.feedback, isLate: sub.isLate,
        })}
      </Text>
      {sub.feedback ? <Text variant="body">{sub.feedback}</Text> : null}
      {editable ? (
        <>
          <Input
            label="Your answer"
            value={value}
            onChangeText={setText}
            multiline
            numberOfLines={8}
          />
          {detail.maxFileSizeMb !== null && !sub.canUploadFiles ? (
            <Text variant="caption" color={theme.colors.neutral[600]}>
              This assignment expects a file, but attachments aren't available in the app yet.
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

Add the needed imports (`useState` from `react`; `Button`, `Input` from
`../../../src/ui`; the two hooks from `../../../src/hooks/use-submission`).
Check `Input` passes `multiline`/`numberOfLines` through its `...rest` spread
to `TextInput` — it does (its props extend `TextInputProps`).

- [ ] **Step 5: Run the new suite and everything it touches**

Run: `cd apps/mobile && pnpm jest src/__tests__/submission-editor.test.tsx src/__tests__/assignment-detail.test.tsx` → PASS.
Run: `pnpm turbo lint typecheck test:unit --filter=@space/mobile` → clean.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile && git commit -m "feat(mobile): submission editor — start, save draft, submit"
```

---

### Task 5: Dashboard shows real assignment counts

**Files:**
- Modify: `apps/mobile/app/(app)/dashboard.tsx`
- Modify test: `apps/mobile/src/__tests__/dashboard.test.tsx`

**Interfaces:**
- Consumes: `useStudentAssignments` (Task 1); the dashboard's existing sessions query stays untouched.
- Produces: nothing new downstream.

- [ ] **Step 1: Extend the dashboard test**

Add to `dashboard.test.tsx` (reuse its fixtures; `get` is already the mocked
`apiClient.get`, now serving two URLs):

```tsx
it("shows pending and overdue assignment counts for a student", async () => {
  useSessionStore.setState({
    user: { id: 9, name: "Test student", email: "s@jpc.test", role: "STUDENT" },
    scopes: scopesWithSeason,
  });
  get.mockImplementation((url: string) =>
    url === "/api/v1/seasons/7/assignments"
      ? Promise.resolve({
          data: {
            data: {
              assignments: [
                { id: 1, title: "A", dueAt: null, isOverdue: false, status: "PENDING", reviewedAt: null },
                { id: 2, title: "B", dueAt: null, isOverdue: true, status: "PENDING", reviewedAt: null },
                { id: 3, title: "C", dueAt: null, isOverdue: false, status: "SUBMITTED", reviewedAt: null },
              ],
            },
          },
        })
      : Promise.resolve({ data: { data: { sessions: [] } } }),
  );

  renderWithProviders(<DashboardScreen />);

  // 2 not handed in (PENDING/DRAFT/RETURNED), of which 1 overdue — counted
  // from server-derived rows, no date math on the device.
  expect(await screen.findByText("2 to do · 1 overdue")).toBeTruthy();
});
```

Existing dashboard tests set no `user`; the summary card must render nothing
for them (no role → no assignments query) so they keep passing unchanged.

- [ ] **Step 2: Run to see it fail**

Run: `cd apps/mobile && pnpm jest src/__tests__/dashboard.test.tsx`
Expected: the new case FAILS ("2 to do · 1 overdue" not found), old cases PASS.

- [ ] **Step 3: Implement the summary card**

In `dashboard.tsx`, add above `SessionRow`'s usage:

```tsx
function AssignmentsSummary({ seasonId }: { seasonId: number | null }) {
  const theme = useTheme();
  const role = useSessionStore((s) => s.user?.role ?? null);
  const { data } = useStudentAssignments(role === "STUDENT" ? seasonId : null);

  if (!data) return null;
  // "To do" = no accepted hand-in yet. Overdue is the server's flag (C4);
  // this is presentation-side counting of rows, not re-derived business logic.
  const todo = data.filter((a) => a.status === "PENDING" || a.status === "DRAFT" || a.status === "RETURNED");
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

Render `<AssignmentsSummary seasonId={seasonId} />` as the first child inside
the `Screen`, before the season/sessions conditional (it handles its own
absence by returning null). Import `useStudentAssignments` and `Card` is
already imported.

- [ ] **Step 4: Run tests, commit**

Run: `cd apps/mobile && pnpm jest src/__tests__/dashboard.test.tsx` → PASS (all).

```bash
git add apps/mobile && git commit -m "feat(mobile): dashboard assignment counts from server-derived rows"
```

---

### Task 6: Closing gate (coordinator)

**Files:** none created — verification only.

- [ ] **Step 1: Full suite**

Run: `pnpm turbo lint typecheck test:unit` (repo root) → all tasks green.
`routes:generate` output (`apps/mobile/expo-env.d.ts`, `.expo/types`) must be
current — `typecheck` depends on it via turbo, so a clean run proves it.

- [ ] **Step 2: Mutation pass**

Two mutations, run one at a time, each must break at least one test, then restore:

1. In `assignments.tsx`'s `statusLabel`, replace `item.isOverdue` with a local
   date compare (`new Date(item.dueAt ?? 0) < new Date()`) — the "overdue from
   the contract flag" test (future `dueAt`, `isOverdue: true`) must fail.
2. In `use-submission.ts`'s `useSaveSubmission`, always send `submit: true` —
   the "saves a draft without submitting" test must fail on the payload
   assertion.

- [ ] **Step 3: Device checklist (manual, on Expo Go or a dev build)**

Backend running (`pnpm --filter @space/backend dev`), `apiClient` base URL
pointed at it. As a student account on staging:

1. Log in → dashboard shows the assignments summary card.
2. Assignments tab → list matches the season; statuses read correctly.
3. Open an untouched assignment → "Start working" → editor appears with empty text.
4. Type, "Save draft", kill the app, reopen → text survived (server round-trip).
5. "Submit" → status flips to Submitted; list row updates without a manual refresh.
6. An assignment with `maxFileSizeMb` set shows the attachments-unavailable note.

- [ ] **Step 4: Commit anything the checklist shook out, then hand back**

Report: suite counts, both mutation outcomes, device checklist results, and
any divergence from this plan discovered while implementing.
