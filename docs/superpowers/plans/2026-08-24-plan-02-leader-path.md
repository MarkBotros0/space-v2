# Plan 2 — Leader Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A leader sees their groups, works a cursor-paged review queue, records a verdict or returns work for revision, and marks a session's attendance.

**Architecture:** Four destinations over existing endpoints. `/groups` and
`/submissions` replace placeholders; `group/[id]`, `submission/[publicId]`
and `session/[id]/attendance` extend the `DETAIL_ROUTE_NAMES` mechanism
Plan 1 established. The review screen reuses Plan 1's `useSubmissionDetail`
and gates its verdict UI on the contract's `canReview` (ruling C4). All
scoping is server-side; screens never filter rosters or queues themselves.

**Tech Stack:** Expo SDK 54 / expo-router 6 (typed routes), React Query 5
(`useInfiniteQuery` for the queue), Zod contracts from `@space/shared`,
RNTL 13 via `renderWithProviders`.

**Spec:** `docs/superpowers/specs/domains/05-groups.md`,
`08-submissions.md`, `04-attendance.md`, `_DECISIONS.md` (C4, C8);
scope from `docs/superpowers/plans/2026-08-24-migration-roadmap.md` § Plan 2.

**Depends on Plan 1:** `DETAIL_ROUTE_NAMES` in `(app)/_layout.tsx`,
`queryKeys.submissions.detail(publicId)`, and `useSubmissionDetail` in
`src/hooks/use-submission.ts` must exist. Do not start before Plan 1's
Task 4 has merged.

## Global Constraints

Same as Plan 1 (relative imports, Zod-parse every response, `enabled` +
guarded `refetch` on dependent queries, state primitives, tab-screen edges,
`renderWithProviders`, `mock*` factory rule, typed routes + `routes:generate`).

Backend endpoints consumed (all exist on `main`, verified):
- `GET /api/v1/groups` → `{ data: { groups: GroupListItem[] } }` — the caller's own groups, newest season first
- `GET /api/v1/groups/:id` → `{ data: GroupDetail }` — `email` present for staff, absent for students
- `GET /api/v1/submissions?pendingOnly=&seasonId=&cursor=&limit=` → `{ data: { items: SubmissionQueueItem[], nextCursor } }` (STUDENT gets 403)
- `GET /api/v1/submissions/:publicId` → `{ data: SubmissionDetail }` (`canReview` drives the UI)
- `POST /api/v1/submissions/:publicId/review` body `{ feedback, returnForRevision? }` → `{ data: { reviewed, returnedForRevision } }`; 409 `not_submitted` for a never-submitted DRAFT
- `GET /api/v1/sessions/:id/attendance` → `{ data: { roster: AttendanceRosterRow[] } }` — server-scoped to the leader's groups
- `POST /api/v1/sessions/:id/attendance` body `{ entries: [{ studentUserId, status, notes?, lateMinutes? }] }` → `{ data: { saved: true } }` (verify the exact success payload in `routes/sessions.ts` before pinning it in a test)

**Execution shape:** Task 1 first (it converts a contract Task 5 needs and
extends `DETAIL_ROUTE_NAMES` once for all three new routes). Then Tasks 2,
3+4, and 5 are three independent workstreams. Task 6 is the closing gate.

---

### Task 1: Route + contract foundation

**Files:**
- Modify: `apps/mobile/app/(app)/_layout.tsx` (extend `DETAIL_ROUTE_NAMES`)
- Create: `apps/mobile/app/(app)/group/[id].tsx`, `apps/mobile/app/(app)/submission/[publicId].tsx`, `apps/mobile/app/(app)/session/[id]/attendance.tsx` (three stubs, same shape as Plan 1 Task 2's)
- Modify: `packages/shared/src/session.ts` (convert `AttendanceRosterRow` to Zod — Task 5 parses rosters)
- Modify: `apps/mobile/src/lib/query-keys.ts` (add `groups` and `attendance` factories; extend `submissions`)
- Test: extend `apps/mobile/src/__tests__/app-layout.test.tsx`

**Interfaces:**
- Consumes: `DETAIL_ROUTE_NAMES` (Plan 1 Task 2), `attendanceStatusSchema` from `./enums`.
- Produces: routes `/group/[id]`, `/submission/[publicId]`, `/session/[id]/attendance` in the typed tree; `attendanceRosterRowSchema` + `z.infer` type replacing the bare `AttendanceRosterRow` interface; `queryKeys.groups.all/mine()/detail(id)`, `queryKeys.attendance.roster(sessionId)`, `queryKeys.submissions.queue(filters)`.

- [ ] **Step 1: Extend the layout test** — add the three new names to the
"detail routes hidden from the tab bar" assertion from Plan 1 Task 2 (loop
over `DETAIL_ROUTE_NAMES` instead of the single name, asserting every entry
is declared with `href: null`). Run it: FAILS (names absent).

- [ ] **Step 2: Create the three stubs** (each like Plan 1 Task 2's stub;
`session/[id]/attendance.tsx` is two levels deep — imports use `../../../../src/...`)
and extend the const:

```tsx
export const DETAIL_ROUTE_NAMES = [
  "assignment/[id]",
  "group/[id]",
  "submission/[publicId]",
  "session/[id]/attendance",
] as const;
```

- [ ] **Step 3: Convert the roster contract.** In `packages/shared/src/session.ts`
replace the `AttendanceRosterRow` interface with:

```ts
export const attendanceRosterRowSchema = z.object({
  studentUserId: z.number(),
  name: z.string().nullable(),
  email: z.string(),
  groupName: z.string().nullable(),
  status: attendanceStatusSchema.nullable(),
  notes: z.string().nullable(),
  lateMinutes: z.number().nullable(),
});
export type AttendanceRosterRow = z.infer<typeof attendanceRosterRowSchema>;
```

(import `attendanceStatusSchema` from `./enums`; the backend's
`AttendanceRosterEntry` in `lib/queries/sessions.ts` already matches this
field-for-field — do not touch the backend). Grep for `AttendanceRosterRow`
importers and confirm the type still satisfies them.

- [ ] **Step 4: Add the query-key factories** (same spreading pattern):

```ts
  groups: {
    all: ["groups"] as const,
    mine: () => [...queryKeys.groups.all, "mine"] as const,
    detail: (id: number) => [...queryKeys.groups.all, "detail", id] as const,
  },
  attendance: {
    all: ["attendance"] as const,
    roster: (sessionId: number) => [...queryKeys.attendance.all, "roster", sessionId] as const,
  },
```

and inside the existing `submissions` factory:

```ts
    queues: () => [...queryKeys.submissions.all, "queue"] as const,
    queue: (filters: { pendingOnly: boolean; seasonId?: number }) =>
      [...queryKeys.submissions.queues(), filters] as const,
```

- [ ] **Step 5:** `pnpm turbo routes:generate --filter=@space/mobile`, then
`cd apps/mobile && pnpm jest src/__tests__/app-layout.test.tsx` → PASS, then
`pnpm turbo lint typecheck test:unit --filter=@space/mobile --filter=@space/shared` → clean.
Check `role-tabs.test.tsx` the same way Plan 1 Task 2 Step 4 did.

- [ ] **Step 6: Commit** — `git add apps/mobile packages/shared && git commit -m "feat(mobile): detail routes and contracts for the leader path"`

---

### Task 2: Groups tab and group detail

**Files:**
- Create: `apps/mobile/src/hooks/use-groups.ts`
- Modify: `apps/mobile/app/(app)/groups.tsx` (replace placeholder), `apps/mobile/app/(app)/group/[id].tsx` (replace stub)
- Test: `apps/mobile/src/__tests__/groups-screens.test.tsx`
- Modify: `apps/mobile/src/__tests__/placeholder-screens.test.tsx` (drop `groups`)

**Interfaces:**
- Consumes: `groupListItemSchema`, `groupDetailSchema` from `@space/shared`; `queryKeys.groups` (Task 1).
- Produces: `useMyGroups(): UseQueryResult<GroupListItem[]>`, `useGroupDetail(id: number | null): UseQueryResult<GroupDetail>`.

- [ ] **Step 1: Failing test**

```tsx
// apps/mobile/src/__tests__/groups-screens.test.tsx
import { fireEvent, screen } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn() } }));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
  useLocalSearchParams: () => ({ id: "3" }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import GroupsScreen from "../../app/(app)/groups";
import GroupDetailScreen from "../../app/(app)/group/[id]";

const get = apiClient.get as jest.Mock;

const leaderSession = {
  user: { id: 5, name: "Test leader", email: "l@jpc.test", role: "LEADER" as const },
  scopes: { seasonAdminIds: [], groupLeaderIds: [3], activeSeasonId: null, graduationYear: null },
};

const groupRow = {
  id: 3, name: "Group A", description: null, studentCount: 8,
  leaderNames: ["Test leader"], seasonId: 7, seasonCode: "S26", seasonTitle: "Spring 2026",
};

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(leaderSession);
});

it("lists my groups with season and headcount, and navigates on press", async () => {
  get.mockResolvedValue({ data: { data: { groups: [groupRow] } } });

  renderWithProviders(<GroupsScreen />);

  expect(await screen.findByText("Group A")).toBeTruthy();
  expect(screen.getByText("Spring 2026 · 8 students")).toBeTruthy();
  expect(get).toHaveBeenCalledWith("/api/v1/groups");

  fireEvent.press(screen.getByText("Group A"));
  expect(mockPush).toHaveBeenCalledWith({ pathname: "/group/[id]", params: { id: "3" } });
});

it("shows members with emails for a staff caller", async () => {
  get.mockResolvedValue({
    data: {
      data: {
        id: 3, name: "Group A", description: null, seasonId: 7,
        seasonCode: "S26", seasonTitle: "Spring 2026",
        leaders: [{ id: 5, name: "Test leader", email: "l@jpc.test" }],
        students: [{ id: 9, name: "Test student", email: "s@jpc.test" }],
      },
    },
  });

  renderWithProviders(<GroupDetailScreen />);

  expect(await screen.findByText("Test student")).toBeTruthy();
  expect(screen.getByText("s@jpc.test")).toBeTruthy();
});

it("renders a student's member list without emails (the contract omits them)", async () => {
  get.mockResolvedValue({
    data: {
      data: {
        id: 3, name: "Group A", description: null, seasonId: 7,
        seasonCode: "S26", seasonTitle: "Spring 2026",
        leaders: [{ id: 5, name: "Test leader" }],
        students: [{ id: 9, name: "Test student" }],
      },
    },
  });

  renderWithProviders(<GroupDetailScreen />);

  expect(await screen.findByText("Test student")).toBeTruthy();
  expect(screen.queryByText("s@jpc.test")).toBeNull();
});
```

Run → FAIL (placeholders).

- [ ] **Step 2: Hooks**

```ts
// apps/mobile/src/hooks/use-groups.ts
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { z } from "zod";
import { groupDetailSchema, groupListItemSchema, type GroupDetail, type GroupListItem } from "@space/shared";

import { apiClient } from "../lib/api-client";
import { queryKeys } from "../lib/query-keys";

const groupListSchema = z.array(groupListItemSchema);

export function useMyGroups(): UseQueryResult<GroupListItem[]> {
  return useQuery({
    queryKey: queryKeys.groups.mine(),
    queryFn: async () => {
      const res = await apiClient.get("/api/v1/groups");
      return groupListSchema.parse(res.data.data.groups);
    },
  });
}

export function useGroupDetail(id: number | null): UseQueryResult<GroupDetail> {
  return useQuery({
    queryKey: queryKeys.groups.detail(id ?? -1),
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/groups/${id}`);
      return groupDetailSchema.parse(res.data.data);
    },
    enabled: id !== null,
  });
}
```

- [ ] **Step 3: Screens.** `groups.tsx`: same skeleton as Plan 1's list screen
(`LoadingState`/`ErrorState`/`EmptyState("No groups", ...)`), rows as
`Pressable`-wrapped `Card`s showing `name` and
`` `${seasonTitle} · ${studentCount} students` ``, pushing
`{ pathname: "/group/[id]", params: { id: String(g.id) } }`. No query gating —
`GET /groups` is valid for every role (staff above leader get `[]`; render the
empty state for them). `group/[id].tsx`: parse the param like Plan 1 Task 4's
detail screen, render name/description, then "Leaders" and "Students" sections
— each member a row with `name ?? "Unnamed"` and, `member.email` present, a
caption line with the email (the optional field IS the staff/student switch;
no role check in the screen).

- [ ] **Step 4:** Drop `groups` from `placeholder-screens.test.tsx`. Run the
new suite + `pnpm turbo lint typecheck test:unit --filter=@space/mobile` → clean.

- [ ] **Step 5: Commit** — `"feat(mobile): groups tab and group detail"`

---

### Task 3: Submissions queue with cursor pagination

**Files:**
- Create: `apps/mobile/src/hooks/use-submission-queue.ts`
- Modify: `apps/mobile/app/(app)/submissions.tsx` (replace placeholder)
- Test: `apps/mobile/src/__tests__/submission-queue.test.tsx`
- Modify: `apps/mobile/src/__tests__/placeholder-screens.test.tsx` (drop `submissions`)

**Interfaces:**
- Consumes: `submissionQueueSchema`, `type SubmissionQueueItem` from `@space/shared`; `queryKeys.submissions.queue` (Task 1).
- Produces: `useSubmissionQueue(filters: { pendingOnly: boolean; seasonId?: number })` returning `UseInfiniteQueryResult` whose pages are `SubmissionQueue`; Task 4 invalidates `queryKeys.submissions.queues()`.

- [ ] **Step 1: Failing test**

```tsx
// apps/mobile/src/__tests__/submission-queue.test.tsx
import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn() } }));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import SubmissionsScreen from "../../app/(app)/submissions";

const get = apiClient.get as jest.Mock;

const leaderSession = {
  user: { id: 5, name: "Test leader", email: "l@jpc.test", role: "LEADER" as const },
  scopes: { seasonAdminIds: [], groupLeaderIds: [3], activeSeasonId: null, graduationYear: null },
};

function queueItem(publicId: string, title: string) {
  return {
    publicId, status: "SUBMITTED" as const, submittedAt: "2099-03-30T10:00:00.000Z",
    isLate: false, assignmentId: 41, assignmentTitle: title, assignmentDueAt: null,
    seasonCode: "S26", studentUserId: 9, studentName: "Test student",
    groupId: 3, groupName: "Group A",
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(leaderSession);
});

it("lists the pending queue and loads the next page from the cursor", async () => {
  get
    .mockResolvedValueOnce({
      data: { data: { items: [queueItem("aaa1111111", "Essay one")], nextCursor: "aaa1111111" } },
    })
    .mockResolvedValueOnce({
      data: { data: { items: [queueItem("bbb2222222", "Essay two")], nextCursor: null } },
    });

  renderWithProviders(<SubmissionsScreen />);

  expect(await screen.findByText("Essay one")).toBeTruthy();
  expect(get).toHaveBeenCalledWith("/api/v1/submissions?pendingOnly=true&limit=25");

  fireEvent.press(screen.getByText("Load more"));
  expect(await screen.findByText("Essay two")).toBeTruthy();
  expect(get).toHaveBeenLastCalledWith(
    "/api/v1/submissions?pendingOnly=true&limit=25&cursor=aaa1111111",
  );
});

it("navigates to the review screen on press", async () => {
  get.mockResolvedValue({
    data: { data: { items: [queueItem("aaa1111111", "Essay one")], nextCursor: null } },
  });

  renderWithProviders(<SubmissionsScreen />);
  fireEvent.press(await screen.findByText("Essay one"));

  expect(mockPush).toHaveBeenCalledWith({
    pathname: "/submission/[publicId]",
    params: { publicId: "aaa1111111" },
  });
});

it("keeps the tab an empty state for a student", async () => {
  useSessionStore.setState({
    ...leaderSession,
    user: { ...leaderSession.user, role: "STUDENT" },
  });

  renderWithProviders(<SubmissionsScreen />);

  expect(await screen.findByText(/isn't available/i)).toBeTruthy();
  expect(get).not.toHaveBeenCalled();
});
```

Run → FAIL.

- [ ] **Step 2: Hook**

```ts
// apps/mobile/src/hooks/use-submission-queue.ts
import { useInfiniteQuery } from "@tanstack/react-query";
import { submissionQueueSchema, type SubmissionQueue } from "@space/shared";

import { apiClient } from "../lib/api-client";
import { queryKeys } from "../lib/query-keys";

export interface QueueFilters {
  pendingOnly: boolean;
  seasonId?: number;
}

async function fetchQueuePage(filters: QueueFilters, cursor?: string): Promise<SubmissionQueue> {
  const params = new URLSearchParams({
    pendingOnly: String(filters.pendingOnly),
    limit: "25",
  });
  if (filters.seasonId !== undefined) params.set("seasonId", String(filters.seasonId));
  if (cursor !== undefined) params.set("cursor", cursor);
  const res = await apiClient.get(`/api/v1/submissions?${params.toString()}`);
  return submissionQueueSchema.parse(res.data.data);
}

export function useSubmissionQueue(filters: QueueFilters, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: queryKeys.submissions.queue(filters),
    queryFn: ({ pageParam }) => fetchQueuePage(filters, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
  });
}
```

- [ ] **Step 3: Screen.** `submissions.tsx`: role from the store; non-staff
(`STUDENT` or no user) renders
`EmptyState("Submissions", "This screen isn't available for your role.")`
without querying (`enabled: false`). Staff: `useSubmissionQueue({ pendingOnly: true }, true)`,
rows from `data.pages.flatMap((p) => p.items)` — each a `Pressable` `Card`
with `assignmentTitle`, and a label line
`` `${studentName ?? "Unnamed"} · ${groupName ?? "No group"}${item.isLate ? " · Late" : ""}` `` —
pushing `/submission/[publicId]`. Below the list, when `hasNextPage`, a
`Button title="Load more" onPress={() => fetchNextPage()} loading={isFetchingNextPage}`.
Empty queue → `EmptyState("All caught up", "No submissions waiting for review.")`.

- [ ] **Step 4:** Drop `submissions` from `placeholder-screens.test.tsx`;
run the suite and the turbo trio → clean.

- [ ] **Step 5: Commit** — `"feat(mobile): cursor-paged submission review queue"`

---

### Task 4: Review screen

**Files:**
- Modify: `apps/mobile/app/(app)/submission/[publicId].tsx` (replace stub)
- Modify: `apps/mobile/src/hooks/use-submission.ts` (add the review mutation)
- Test: `apps/mobile/src/__tests__/submission-review.test.tsx`

**Interfaces:**
- Consumes: `useSubmissionDetail` (Plan 1 Task 4), `queryKeys.submissions` (queue keys from Task 1).
- Produces: `useReviewSubmission(publicId: string)` mutation.

- [ ] **Step 1: Failing test**

```tsx
// apps/mobile/src/__tests__/submission-review.test.tsx
import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
}));
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ publicId: "aaa1111111" }),
  useRouter: () => ({ back: mockBack, push: jest.fn() }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import SubmissionReviewScreen from "../../app/(app)/submission/[publicId]";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;

const detail = {
  id: 900, publicId: "aaa1111111", status: "SUBMITTED" as const,
  text: "the student's work", feedback: null,
  submittedAt: "2099-03-30T10:00:00.000Z", reviewedAt: null, isLate: true,
  assignmentId: 41, assignmentTitle: "Essay one", assignmentDueAt: "2099-03-29T00:00:00.000Z",
  assignmentDescription: null, seasonCode: "S26",
  studentUserId: 9, studentName: "Test student", studentEmail: "s@jpc.test",
  files: [], canUploadFiles: false, canReview: true,
};

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState({
    user: { id: 5, name: "Test leader", email: "l@jpc.test", role: "LEADER" },
    scopes: { seasonAdminIds: [], groupLeaderIds: [3], activeSeasonId: null, graduationYear: null },
  });
});

it("shows the work, the late flag from the contract, and records a review", async () => {
  get.mockResolvedValue({ data: { data: detail } });
  post.mockResolvedValue({ data: { data: { reviewed: true, returnedForRevision: false } } });

  renderWithProviders(<SubmissionReviewScreen />);

  expect(await screen.findByText("the student's work")).toBeTruthy();
  expect(screen.getByText(/late/i)).toBeTruthy();

  fireEvent.changeText(screen.getByLabelText("Feedback"), "Good work.");
  fireEvent.press(screen.getByText("Mark reviewed"));

  await waitFor(() =>
    expect(post).toHaveBeenCalledWith("/api/v1/submissions/aaa1111111/review", {
      feedback: "Good work.",
    }),
  );
});

it("returns for revision with the flag set", async () => {
  get.mockResolvedValue({ data: { data: detail } });
  post.mockResolvedValue({ data: { data: { reviewed: true, returnedForRevision: true } } });

  renderWithProviders(<SubmissionReviewScreen />);
  fireEvent.changeText(await screen.findByLabelText("Feedback"), "Another pass, please.");
  fireEvent.press(screen.getByText("Return for revision"));

  await waitFor(() =>
    expect(post).toHaveBeenCalledWith("/api/v1/submissions/aaa1111111/review", {
      feedback: "Another pass, please.",
      returnForRevision: true,
    }),
  );
});

it("hides the verdict controls when the contract says this caller cannot review", async () => {
  get.mockResolvedValue({ data: { data: { ...detail, canReview: false } } });

  renderWithProviders(<SubmissionReviewScreen />);

  expect(await screen.findByText("the student's work")).toBeTruthy();
  expect(screen.queryByText("Mark reviewed")).toBeNull();
});
```

Run → FAIL.

- [ ] **Step 2: Mutation.** Append to `use-submission.ts`:

```ts
export function useReviewSubmission(publicId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { feedback: string; returnForRevision?: boolean }) => {
      const body: { feedback: string; returnForRevision?: boolean } = {
        feedback: input.feedback,
      };
      if (input.returnForRevision) body.returnForRevision = true;
      const res = await apiClient.post(`/api/v1/submissions/${publicId}/review`, body);
      return res.data.data as { reviewed: boolean; returnedForRevision: boolean };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.submissions.detail(publicId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.submissions.queues() });
    },
  });
}
```

- [ ] **Step 3: Screen.** `submission/[publicId].tsx`: param → `useSubmissionDetail`.
Render assignment title, student name, status line (reuse the wording from
Plan 1's `submissionStatusLine`: "Submitted late" when `isLate`), the `text`
in a `Card`, existing `feedback` if any. When `data.canReview`: an
`Input label="Feedback" multiline`, and two `Button`s — "Mark reviewed"
(`mutate({ feedback })`, then `router.back()` in `onSuccess` via the
mutation's `mutate(..., { onSuccess })` options) and "Return for revision"
(secondary, same with the flag). When `!canReview`: no controls (C4 — the
flag drives the UI; the server gate is what actually protects the write).

- [ ] **Step 4:** Run the suite + turbo trio → clean.

- [ ] **Step 5: Commit** — `"feat(mobile): submission review screen"`

---

### Task 5: Attendance marking screen

**Files:**
- Modify: `apps/mobile/app/(app)/session/[id]/attendance.tsx` (replace stub)
- Create: `apps/mobile/src/hooks/use-attendance.ts`
- Test: `apps/mobile/src/__tests__/attendance-screen.test.tsx`

**Interfaces:**
- Consumes: `attendanceRosterRowSchema` (Task 1), `saveAttendanceRequestSchema`'s entry shape from `@space/shared`, `queryKeys.attendance`.
- Produces: `useAttendanceRoster(sessionId: number | null)`, `useSaveAttendance(sessionId: number)`. Plan 4 reuses this screen unchanged for admins (the server scopes season-wide for them already).

- [ ] **Step 1: Failing test**

```tsx
// apps/mobile/src/__tests__/attendance-screen.test.tsx
import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn(), post: jest.fn() } }));
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "12" }),
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import AttendanceScreen from "../../app/(app)/session/[id]/attendance";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;

const roster = [
  { studentUserId: 9, name: "Test student", email: "s@jpc.test", groupName: "Group A",
    status: null, notes: null, lateMinutes: null },
  { studentUserId: 10, name: "Second student", email: "s2@jpc.test", groupName: "Group A",
    status: "PRESENT", notes: null, lateMinutes: null },
];

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState({
    user: { id: 5, name: "Test leader", email: "l@jpc.test", role: "LEADER" },
    scopes: { seasonAdminIds: [], groupLeaderIds: [3], activeSeasonId: null, graduationYear: null },
  });
});

it("renders the roster and saves only rows with a chosen status", async () => {
  get.mockResolvedValue({ data: { data: { roster } } });
  post.mockResolvedValue({ data: { data: { saved: true } } });

  renderWithProviders(<AttendanceScreen />);

  expect(await screen.findByText("Test student")).toBeTruthy();
  // Row 1 has no status yet; mark them present, flip row 2 to absent.
  fireEvent.press(screen.getByLabelText("Mark Test student PRESENT"));
  fireEvent.press(screen.getByLabelText("Mark Second student ABSENT"));
  fireEvent.press(screen.getByText("Save attendance"));

  await waitFor(() =>
    expect(post).toHaveBeenCalledWith("/api/v1/sessions/12/attendance", {
      entries: [
        { studentUserId: 9, status: "PRESENT" },
        { studentUserId: 10, status: "ABSENT" },
      ],
    }),
  );
});

it("keeps a never-touched, never-marked row out of the payload", async () => {
  get.mockResolvedValue({ data: { data: { roster } } });
  post.mockResolvedValue({ data: { data: { saved: true } } });

  renderWithProviders(<AttendanceScreen />);
  fireEvent.press(await screen.findByLabelText("Mark Test student LATE"));
  fireEvent.press(screen.getByText("Save attendance"));

  // Second student is untouched: their server status stands, and sending it
  // again would stamp this leader as markedBy for a mark they never made.
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith("/api/v1/sessions/12/attendance", {
      entries: [{ studentUserId: 9, status: "LATE" }],
    }),
  );
});
```

Run → FAIL.

- [ ] **Step 2: Hooks**

```ts
// apps/mobile/src/hooks/use-attendance.ts
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { z } from "zod";
import {
  attendanceRosterRowSchema,
  type AttendanceEntry,
  type AttendanceRosterRow,
} from "@space/shared";

import { apiClient } from "../lib/api-client";
import { queryKeys } from "../lib/query-keys";

const rosterSchema = z.array(attendanceRosterRowSchema);

export function useAttendanceRoster(
  sessionId: number | null,
): UseQueryResult<AttendanceRosterRow[]> {
  return useQuery({
    queryKey: queryKeys.attendance.roster(sessionId ?? -1),
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/sessions/${sessionId}/attendance`);
      return rosterSchema.parse(res.data.data.roster);
    },
    enabled: sessionId !== null,
  });
}

export function useSaveAttendance(sessionId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (entries: AttendanceEntry[]) => {
      const res = await apiClient.post(`/api/v1/sessions/${sessionId}/attendance`, { entries });
      return res.data.data as { saved: boolean };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.attendance.roster(sessionId) });
    },
  });
}
```

- [ ] **Step 3: Screen.** Local state `marks: Record<number, AttendanceStatus>`
(only touched rows). Each roster row: name, group caption, three `Pressable`
status pills — each with
`accessibilityLabel={`Mark ${row.name ?? "student"} ${status}`}` — highlighted
when `marks[row.studentUserId] ?? row.status` equals that status. "Save
attendance" builds `entries` **from `marks` only** (untouched rows stay out —
the second test pins that, because resending a server status stamps this
caller as `markedBy` for a mark they never made), calls the mutation, and
disables via `loading` while pending. States: `LoadingState`/`ErrorState`/
`EmptyState("No students", ...)` as usual.

- [ ] **Step 4:** Run the suite + turbo trio → clean.

- [ ] **Step 5: Commit** — `"feat(mobile): attendance marking screen"`

---

### Task 6: Closing gate (coordinator)

- [ ] **Step 1:** `pnpm turbo lint typecheck test:unit` at the root → green.
- [ ] **Step 2: Mutation pass** (one at a time, restore after each):
  1. In `useSubmissionQueue`, ignore `pageParam` (always fetch page one) → the pagination test's second assertion must fail.
  2. In the attendance screen, build `entries` from every roster row instead of `marks` → the untouched-row test must fail.
  3. In the review screen, render the verdict controls unconditionally → the `canReview: false` test must fail.
- [ ] **Step 3: Device checklist** — as a leader on staging: groups tab shows
their groups and members' emails; queue pages with >25 pending items; a
verdict removes the row from the pending queue without manual refresh;
return-for-revision flips the student's screen (check with the Plan 1 student
flow) to editable `RETURNED`; attendance saves and survives reload; a student
account sees the submissions tab's empty state and no emails on group detail.
- [ ] **Step 4:** Report suite counts, mutation outcomes, checklist results,
and any divergence from this plan.
