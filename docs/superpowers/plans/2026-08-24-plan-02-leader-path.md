# Plan 2 — Leader Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A leader sees their groups, works a cursor-paged review queue, records a verdict or returns work for revision, and marks a session's attendance.

**Architecture:** Four destinations over existing endpoints. `/groups` and
`/submissions` replace placeholders; `group/[id]`, `submission/[publicId]`
and `session/[id]/attendance` are appended to Plan 1's `DETAIL_ROUTE_NAMES`.
`session/[id]` uses the **directory form** (ruling X7): this plan creates
`session/[id]/attendance.tsx`; Plan 4 adds the detail screen as
`session/[id]/index.tsx`, never `session/[id].tsx` — Plan 1 Task 0's
`ambiguousRouteSiblings()` guard fails the suite if anyone does. The review
screen reuses Plan 1's `useSubmissionDetail` and gates its verdict UI on the
contract's `canReview` (ruling C4). All scoping is server-side; screens never
filter rosters or queues themselves.

**Tech Stack:** Expo SDK 54 / expo-router 6 (typed routes), React Query 5
(`useInfiniteQuery` for the queue), Zod contracts from `@space/shared`,
RNTL 13 via `renderWithProviders`.

**Spec:** `docs/superpowers/specs/domains/05-groups.md`,
`08-submissions.md`, `04-attendance.md`, `_DECISIONS.md` (C4, C8);
scope from `docs/superpowers/plans/2026-08-24-migration-roadmap.md` § Plan 2.
v1 reference for the attendance form: `jpc-space/src/components/sessions/attendance-form.tsx`.

**Depends on Plan 1** (the only plan before it in the execution order
1 → 2 → 3 → 4 → …): `makeSession` (`src/__tests__/helpers/session.ts`),
`DETAIL_ROUTE_NAMES` exported from `(app)/_layout.tsx`, the derived
route-count tests, `queryKeys.submissions.detail(publicId)` and
`useSubmissionDetail` in `src/hooks/use-submission.ts`. Do not start before
Plan 1 has merged.

## Global Constraints

Same as Plan 1 (relative imports; Zod-parse every response including
mutation responses — no `as T`; `enabled` + guarded `refetch` on dependent
queries with `null`, never a sentinel, in query keys; state primitives;
tab-screen edges; `renderWithProviders`; `mock*` factory rule; session
fixtures from `makeSession`; typed routes + `routes:generate`; X7 directory
form). Adding a detail route = appending to `DETAIL_ROUTE_NAMES`; building a
placeholder screen = deleting its `PLACEHOLDER_SCREENS` row. No count is
edited anywhere (ruling X9).

Backend endpoints consumed (all exist on `main`, verified against the route files):
- `GET /api/v1/groups` → `{ data: { groups: GroupListItem[] } }` — the caller's own groups. **LEADER and STUDENT only**: `listMyGroups` returns `[]` for ADMIN/SUPER/MENTOR by design (`lib/queries/groups.ts`).
- `GET /api/v1/groups/:id` → `{ data: GroupDetail }` — `email` present for staff, absent for students
- `GET /api/v1/submissions?pendingOnly=&seasonId=&cursor=&limit=` → `{ data: { items: SubmissionQueueItem[], nextCursor } }` (STUDENT gets 403)
- `GET /api/v1/submissions/:publicId` → `{ data: SubmissionDetail }` (`canReview` drives the UI)
- `POST /api/v1/submissions/:publicId/review` body `{ feedback, returnForRevision? }` → `{ data: { reviewed: true, returnedForRevision: boolean } }`; 409 `not_submitted` for a never-submitted DRAFT
- `GET /api/v1/sessions/:id/attendance` → `{ data: { roster: AttendanceRosterRow[] } }` — server-scoped to the leader's groups
- `POST /api/v1/sessions/:id/attendance` body `{ entries: [{ studentUserId, status, notes?, lateMinutes? }] }` → `{ data: { saved: number } }` — **`saved` is the count of entries written** (`routes/sessions.ts`: `apiOk(res, { saved: parsed.data.entries.length })`). The upsert writes `notes: e.notes ?? null` and nulls `lateMinutes` unless `LATE`, so **an entry that omits `notes` erases the stored note** — the screen always resends the row's current note.

**Execution shape:** Task 1 first (it converts the contracts the others
parse with and appends all three detail routes at once). Then Tasks 2,
3 → 4, and 5 are three independent workstreams. Task 6 is the closing gate.

**Out of scope here (owner named, ruling X8/X15):** the ADMIN/SUPER branch of
`/groups` (season group list via Plan 4's `useCurrentSeasonId`) lands in
Plan 16 — this plan renders an explicit "not available yet" state for those
roles instead of an empty list that looks like "you have no groups". The
session detail screen and its link to attendance are Plan 4's.

---

### Task 1: Route + contract foundation

**Files:**
- Modify: `apps/mobile/app/(app)/_layout.tsx` (append to `DETAIL_ROUTE_NAMES`)
- Create: `apps/mobile/app/(app)/group/[id].tsx`, `apps/mobile/app/(app)/submission/[publicId].tsx`, `apps/mobile/app/(app)/session/[id]/attendance.tsx` (three stubs)
- Modify: `packages/shared/src/session.ts` (convert `AttendanceRosterRow` to Zod)
- Modify: `packages/shared/src/attendance.ts` (add `saveAttendanceResponseSchema`)
- Modify: `packages/shared/src/submission.ts` (add `reviewSubmissionResponseSchema`)
- Modify: `apps/mobile/src/lib/query-keys.ts` (add `groups` and `attendance` factories; extend `submissions`)
- Test: `packages/shared/src/__tests__/leader-contracts.test.ts`; extend `apps/mobile/src/__tests__/app-layout.test.tsx`

**Interfaces:**
- Consumes: `DETAIL_ROUTE_NAMES` (Plan 1 Task 0), `attendanceStatusSchema` from `./enums`.
- Produces: routes `/group/[id]`, `/submission/[publicId]`, `/session/[id]/attendance` in the typed tree; `attendanceRosterRowSchema` (+ `AttendanceRosterRow = z.infer<…>` replacing the bare interface); `saveAttendanceResponseSchema` (`{ saved: number }`); `reviewSubmissionResponseSchema` (`{ reviewed: true, returnedForRevision: boolean }`); `queryKeys.groups.all / mine() / detail(id: number | null)`, `queryKeys.attendance.all / roster(sessionId: number | null)`, `queryKeys.submissions.queues() / queue(filters)`.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/shared/src/__tests__/leader-contracts.test.ts
import {
  attendanceRosterRowSchema,
  reviewSubmissionResponseSchema,
  saveAttendanceResponseSchema,
} from "../index";

describe("attendanceRosterRowSchema", () => {
  it("parses a row exactly as the backend's AttendanceRosterEntry emits it", () => {
    const row = {
      studentUserId: 9, name: null, email: "s@jpc.test", groupName: "Group A",
      status: "LATE", notes: "Bus", lateMinutes: 12,
    };
    expect(attendanceRosterRowSchema.parse(row)).toEqual(row);
  });

  it("accepts an unmarked row (status null)", () => {
    expect(
      attendanceRosterRowSchema.safeParse({
        studentUserId: 9, name: "A", email: "a@jpc.test", groupName: null,
        status: null, notes: null, lateMinutes: null,
      }).success,
    ).toBe(true);
  });
});

describe("saveAttendanceResponseSchema", () => {
  it("takes the saved COUNT the route returns, not a boolean", () => {
    expect(saveAttendanceResponseSchema.parse({ saved: 2 })).toEqual({ saved: 2 });
    expect(saveAttendanceResponseSchema.safeParse({ saved: true }).success).toBe(false);
  });
});

describe("reviewSubmissionResponseSchema", () => {
  it("parses the review route's payload", () => {
    expect(
      reviewSubmissionResponseSchema.parse({ reviewed: true, returnedForRevision: false }),
    ).toEqual({ reviewed: true, returnedForRevision: false });
  });
});
```

Add to the `describe` in `apps/mobile/src/__tests__/app-layout.test.tsx`:

```tsx
  it("registers the leader-path detail routes as hidden", () => {
    for (const name of ["group/[id]", "submission/[publicId]", "session/[id]/attendance"]) {
      expect(DETAIL_ROUTE_NAMES).toContain(name);
    }
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd packages/shared && pnpm exec jest src/__tests__/leader-contracts.test.ts` → FAIL (exports missing).
Run: `cd apps/mobile && pnpm jest src/__tests__/app-layout.test.tsx` → FAIL (names absent).

- [ ] **Step 3: Convert and add the contracts**

In `packages/shared/src/session.ts`, change the enums import to
`import { attendanceStatusSchema, type AttendanceStatus } from "./enums";`
and replace the `AttendanceRosterRow` interface with:

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

(The backend's `AttendanceRosterEntry` in `lib/queries/sessions.ts` already
matches field-for-field — do not touch the backend. Grep for
`AttendanceRosterRow` importers and confirm the type still satisfies them.)

Append to `packages/shared/src/attendance.ts`:

```ts
/**
 * `POST /sessions/:id/attendance` success payload. `saved` is the number of
 * entries written — a count, not a flag.
 */
export const saveAttendanceResponseSchema = z.object({
  saved: z.number().int().nonnegative(),
});
export type SaveAttendanceResponse = z.infer<typeof saveAttendanceResponseSchema>;
```

Append to `packages/shared/src/submission.ts`:

```ts
/** `POST /submissions/:publicId/review` success payload. */
export const reviewSubmissionResponseSchema = z.object({
  reviewed: z.literal(true),
  returnedForRevision: z.boolean(),
});
export type ReviewSubmissionResponse = z.infer<typeof reviewSubmissionResponseSchema>;
```

- [ ] **Step 4: Create the three stubs and register them**

```tsx
// apps/mobile/app/(app)/group/[id].tsx
import { useLocalSearchParams } from "expo-router";

import { Screen, Text } from "../../../src/ui";

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Screen edges={["top", "left", "right"]}>
      <Text variant="heading">{`Group ${id}`}</Text>
    </Screen>
  );
}
```

```tsx
// apps/mobile/app/(app)/submission/[publicId].tsx
import { useLocalSearchParams } from "expo-router";

import { Screen, Text } from "../../../src/ui";

export default function SubmissionReviewScreen() {
  const { publicId } = useLocalSearchParams<{ publicId: string }>();
  return (
    <Screen edges={["top", "left", "right"]}>
      <Text variant="heading">{`Submission ${publicId}`}</Text>
    </Screen>
  );
}
```

```tsx
// apps/mobile/app/(app)/session/[id]/attendance.tsx — two levels deep: ../../../../src
import { useLocalSearchParams } from "expo-router";

import { Screen, Text } from "../../../../src/ui";

export default function AttendanceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Screen edges={["top", "left", "right"]}>
      <Text variant="heading">{`Attendance for session ${id}`}</Text>
    </Screen>
  );
}
```

In `_layout.tsx`:

```tsx
export const DETAIL_ROUTE_NAMES: readonly string[] = [
  "assignment/[id]",
  "group/[id]",
  "submission/[publicId]",
  "session/[id]/attendance",
];
```

- [ ] **Step 5: Add the query-key factories** (same spreading pattern; `null` for not-yet-known ids):

```ts
  groups: {
    all: ["groups"] as const,
    mine: () => [...queryKeys.groups.all, "mine"] as const,
    detail: (id: number | null) => [...queryKeys.groups.all, "detail", id] as const,
  },
  attendance: {
    all: ["attendance"] as const,
    roster: (sessionId: number | null) => [...queryKeys.attendance.all, "roster", sessionId] as const,
  },
```

and inside Plan 1's `submissions` factory:

```ts
    queues: () => [...queryKeys.submissions.all, "queue"] as const,
    queue: (filters: { pendingOnly: boolean; seasonId?: number }) =>
      [...queryKeys.submissions.queues(), filters] as const,
```

- [ ] **Step 6: Regenerate, run, check**

Run: `pnpm turbo routes:generate --filter=@space/mobile`
Run: `cd packages/shared && pnpm exec jest src/__tests__/leader-contracts.test.ts` → PASS.
Run: `cd apps/mobile && pnpm jest src/__tests__/app-layout.test.tsx src/__tests__/role-tabs.test.tsx` → PASS
(the disk-derived "every route file is declared" test sees the three new
files and the three new names; `ambiguousRouteSiblings()` is empty because
there is no `session/[id].tsx`).
Run: `pnpm turbo lint typecheck test:unit --filter=@space/mobile --filter=@space/shared` → clean.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile packages/shared && git commit -m "feat(mobile): detail routes and contracts for the leader path"
```

---

### Task 2: Groups tab and group detail

**Files:**
- Create: `apps/mobile/src/hooks/use-groups.ts`
- Modify: `apps/mobile/app/(app)/groups.tsx` (replace placeholder), `apps/mobile/app/(app)/group/[id].tsx` (replace stub)
- Test: `apps/mobile/src/__tests__/groups-screens.test.tsx`
- Modify: `apps/mobile/src/__tests__/placeholder-screens.test.tsx` (delete the `groups` row and its import)

**Interfaces:**
- Consumes: `groupListItemSchema`, `groupDetailSchema` from `@space/shared`; `queryKeys.groups` (Task 1); `makeSession` (Plan 1).
- Produces: `useMyGroups(enabled: boolean): UseQueryResult<GroupListItem[]>`, `useGroupDetail(id: number | null): UseQueryResult<GroupDetail>`; `MY_GROUPS_ROLES` (the roles `GET /groups` serves) exported from `use-groups.ts` — Plan 16 adds the admin branch beside it.

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
import { makeSession } from "./helpers/session";
import GroupsScreen from "../../app/(app)/groups";
import GroupDetailScreen from "../../app/(app)/group/[id]";

const get = apiClient.get as jest.Mock;

const leaderSession = makeSession(
  "LEADER",
  { groupLeaderIds: [3] },
  { id: 5, name: "Test leader", email: "l@jpc.test" },
);

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

it("shows the empty state for a leader with no groups", async () => {
  get.mockResolvedValue({ data: { data: { groups: [] } } });

  renderWithProviders(<GroupsScreen />);

  expect(await screen.findByText("No groups")).toBeTruthy();
});

it("does not pretend an admin has no groups: explicit not-yet state, no request", async () => {
  // GET /groups is empty for ADMIN by design; rendering that as "No groups"
  // on ADMIN's second tab would be a lie. The season-wide admin branch is
  // Plan 16's (ruling X8).
  useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));

  renderWithProviders(<GroupsScreen />);

  expect(await screen.findByText(/isn't available in the app yet/)).toBeTruthy();
  expect(screen.queryByText("No groups")).toBeNull();
  expect(get).not.toHaveBeenCalled();
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
  expect(get).toHaveBeenCalledWith("/api/v1/groups/3");
});

it("renders a student's member list without emails (the contract omits them)", async () => {
  useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }, { id: 9 }));
  get.mockResolvedValue({
    data: {
      data: {
        id: 3, name: "Group A", description: null, seasonId: 7,
        seasonCode: "S26", seasonTitle: "Spring 2026",
        leaders: [{ id: 5, name: "Test leader" }],
        students: [{ id: 9, name: null }],
      },
    },
  });

  renderWithProviders(<GroupDetailScreen />);

  expect(await screen.findByText("Unnamed")).toBeTruthy();
  expect(screen.queryByText("s@jpc.test")).toBeNull();
});
```

Run: `cd apps/mobile && pnpm jest src/__tests__/groups-screens.test.tsx` → FAIL (placeholder and stub).

- [ ] **Step 2: Hooks**

```ts
// apps/mobile/src/hooks/use-groups.ts
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { z } from "zod";
import {
  groupDetailSchema,
  groupListItemSchema,
  type GroupDetail,
  type GroupListItem,
  type UserRole,
} from "@space/shared";

import { apiClient } from "../lib/api-client";
import { queryKeys } from "../lib/query-keys";

const groupListSchema = z.array(groupListItemSchema);

/**
 * The roles `GET /groups` actually serves. `listMyGroups` returns `[]` for
 * everyone else by design (staff above leader are not *in* groups), so the
 * screen must not query for them and present that `[]` as "no groups".
 */
export const MY_GROUPS_ROLES: readonly UserRole[] = ["LEADER", "STUDENT"];

export function useMyGroups(enabled: boolean): UseQueryResult<GroupListItem[]> {
  return useQuery({
    queryKey: queryKeys.groups.mine(),
    queryFn: async () => {
      const res = await apiClient.get("/api/v1/groups");
      return groupListSchema.parse(res.data.data.groups);
    },
    enabled,
  });
}

export function useGroupDetail(id: number | null): UseQueryResult<GroupDetail> {
  return useQuery({
    queryKey: queryKeys.groups.detail(id),
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/groups/${id}`);
      return groupDetailSchema.parse(res.data.data);
    },
    enabled: id !== null,
  });
}
```

- [ ] **Step 3: Screens**

Replace `apps/mobile/app/(app)/groups.tsx`:

```tsx
import { useRouter } from "expo-router";
import { Pressable } from "react-native";
import type { GroupListItem } from "@space/shared";

import { MY_GROUPS_ROLES, useMyGroups } from "../../src/hooks/use-groups";
import { useSessionStore } from "../../src/store/session";
import { useTheme } from "../../src/theme";
import { Card, EmptyState, ErrorState, LoadingState, Screen, Text } from "../../src/ui";

function GroupRow({ group }: { group: GroupListItem }) {
  const theme = useTheme();
  const router = useRouter();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: "/group/[id]", params: { id: String(group.id) } })}
    >
      <Card style={{ marginBottom: theme.spacing.sm }}>
        <Text variant="heading">{group.name}</Text>
        <Text variant="label" color={theme.colors.neutral[600]}>
          {`${group.seasonTitle} · ${group.studentCount} students`}
        </Text>
      </Card>
    </Pressable>
  );
}

export default function GroupsScreen() {
  const role = useSessionStore((s) => s.user?.role ?? null);
  const servesRole = role !== null && MY_GROUPS_ROLES.includes(role);
  const { data, isPending, isError, refetch, isRefetching } = useMyGroups(servesRole);

  if (!servesRole) {
    // ADMIN/SUPER browse groups by season; that branch lands in Plan 16 on
    // Plan 4's useCurrentSeasonId (ruling X8).
    return (
      <Screen edges={["top", "left", "right"]}>
        <EmptyState title="Groups" message="Browsing a season's groups isn't available in the app yet." />
      </Screen>
    );
  }

  return (
    <Screen
      edges={["top", "left", "right"]}
      onRefresh={() => void refetch()}
      refreshing={isRefetching}
    >
      {isPending ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState message="Couldn't load your groups. Check your connection and try again." onRetry={refetch} />
      ) : data.length === 0 ? (
        <EmptyState title="No groups" message="You aren't in any groups yet." />
      ) : (
        <>
          {data.map((group) => (
            <GroupRow key={group.id} group={group} />
          ))}
        </>
      )}
    </Screen>
  );
}
```

(`refetch` is safe unguarded here: the query only exists in the branch where
`servesRole` is true.)

Replace `apps/mobile/app/(app)/group/[id].tsx`:

```tsx
import { useLocalSearchParams } from "expo-router";
import type { GroupMember } from "@space/shared";

import { useGroupDetail } from "../../../src/hooks/use-groups";
import { useTheme } from "../../../src/theme";
import { Card, EmptyState, ErrorState, LoadingState, Screen, Text } from "../../../src/ui";

function MemberSection({ title, members }: { title: string; members: GroupMember[] }) {
  const theme = useTheme();
  return (
    <Card style={{ marginTop: theme.spacing.md }}>
      <Text variant="heading">{title}</Text>
      {members.length === 0 ? (
        <Text variant="body" color={theme.colors.neutral[600]}>
          None yet.
        </Text>
      ) : (
        members.map((member) => (
          <Card key={member.id} style={{ marginTop: theme.spacing.sm }}>
            <Text variant="body">{member.name ?? "Unnamed"}</Text>
            {/* The optional field IS the staff/student switch (contract
                withholds it from students) — no role check here. */}
            {member.email ? (
              <Text variant="caption" color={theme.colors.neutral[600]}>
                {member.email}
              </Text>
            ) : null}
          </Card>
        ))
      )}
    </Card>
  );
}

export default function GroupDetailScreen() {
  const theme = useTheme();
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const parsed = Number(rawId);
  const id = Number.isInteger(parsed) && parsed > 0 ? parsed : null;

  const { data, isPending, isError, refetch } = useGroupDetail(id);

  return (
    <Screen edges={["top", "left", "right"]} scroll>
      {id === null ? (
        <EmptyState title="Not found" message="That group link isn't valid." />
      ) : isPending ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState message="Couldn't load this group." onRetry={refetch} />
      ) : (
        <>
          <Text variant="title">{data.name}</Text>
          <Text variant="label" color={theme.colors.neutral[600]}>
            {data.seasonTitle}
          </Text>
          {data.description ? (
            <Text variant="body" style={{ marginTop: theme.spacing.sm }}>
              {data.description}
            </Text>
          ) : null}
          <MemberSection title="Leaders" members={data.leaders} />
          <MemberSection title="Students" members={data.students} />
        </>
      )}
    </Screen>
  );
}
```

- [ ] **Step 4: Delete the placeholder row, run**

Delete `["groups", GroupsScreen, "Groups"]` and its import from
`placeholder-screens.test.tsx`.
Run: `cd apps/mobile && pnpm jest src/__tests__/groups-screens.test.tsx src/__tests__/placeholder-screens.test.tsx` → PASS.
Run: `pnpm turbo lint typecheck test:unit --filter=@space/mobile` → clean.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile && git commit -m "feat(mobile): groups tab and group detail"
```

---

### Task 3: Submissions queue with cursor pagination

**Files:**
- Create: `apps/mobile/src/hooks/use-submission-queue.ts`
- Modify: `apps/mobile/app/(app)/submissions.tsx` (replace placeholder)
- Test: `apps/mobile/src/__tests__/submission-queue.test.tsx`
- Modify: `apps/mobile/src/__tests__/placeholder-screens.test.tsx` (delete the `submissions` row and its import)

**Interfaces:**
- Consumes: `submissionQueueSchema`, `type SubmissionQueue`, `type SubmissionQueueItem` from `@space/shared`; `queryKeys.submissions.queue` (Task 1).
- Produces: `QueueFilters`; `useSubmissionQueue(filters: QueueFilters, enabled: boolean)` returning `UseInfiniteQueryResult` whose pages are `SubmissionQueue`; Task 4 invalidates `queryKeys.submissions.queues()`.

- [ ] **Step 1: Failing test**

```tsx
// apps/mobile/src/__tests__/submission-queue.test.tsx
import { fireEvent, screen } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn() } }));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";
import SubmissionsScreen from "../../app/(app)/submissions";

const get = apiClient.get as jest.Mock;

function queueItem(publicId: string, title: string, isLate = false) {
  return {
    publicId, status: "SUBMITTED" as const, submittedAt: "2099-03-30T10:00:00.000Z",
    isLate, assignmentId: 41, assignmentTitle: title, assignmentDueAt: null,
    seasonCode: "S26", studentUserId: 9, studentName: "Test student",
    groupId: 3, groupName: "Group A",
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(makeSession("LEADER", { groupLeaderIds: [3] }, { id: 5 }));
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
  // Last page: the button goes away.
  expect(screen.queryByText("Load more")).toBeNull();
});

it("labels a late hand-in from the contract flag", async () => {
  get.mockResolvedValue({
    data: { data: { items: [queueItem("aaa1111111", "Essay one", true)], nextCursor: null } },
  });

  renderWithProviders(<SubmissionsScreen />);

  expect(await screen.findByText("Test student · Group A · Late")).toBeTruthy();
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

it("shows 'All caught up' for an empty queue", async () => {
  get.mockResolvedValue({ data: { data: { items: [], nextCursor: null } } });

  renderWithProviders(<SubmissionsScreen />);

  expect(await screen.findByText("All caught up")).toBeTruthy();
});

it("keeps the tab an empty state for a student, without a request", async () => {
  useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }));

  renderWithProviders(<SubmissionsScreen />);

  expect(await screen.findByText(/isn't available for your role/i)).toBeTruthy();
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

- [ ] **Step 3: Screen**

Replace `apps/mobile/app/(app)/submissions.tsx`:

```tsx
import { useRouter } from "expo-router";
import { Pressable } from "react-native";
import type { SubmissionQueueItem } from "@space/shared";

import { useSubmissionQueue } from "../../src/hooks/use-submission-queue";
import { useSessionStore } from "../../src/store/session";
import { useTheme } from "../../src/theme";
import { Button, Card, EmptyState, ErrorState, LoadingState, Screen, Text } from "../../src/ui";

const PENDING = { pendingOnly: true } as const;

function QueueRow({ item }: { item: SubmissionQueueItem }) {
  const theme = useTheme();
  const router = useRouter();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() =>
        router.push({ pathname: "/submission/[publicId]", params: { publicId: item.publicId } })
      }
    >
      <Card style={{ marginBottom: theme.spacing.sm }}>
        <Text variant="heading">{item.assignmentTitle}</Text>
        <Text variant="label" color={theme.colors.neutral[600]}>
          {`${item.studentName ?? "Unnamed"} · ${item.groupName ?? "No group"}${item.isLate ? " · Late" : ""}`}
        </Text>
      </Card>
    </Pressable>
  );
}

export default function SubmissionsScreen() {
  const role = useSessionStore((s) => s.user?.role ?? null);
  // STUDENT gets 403 from GET /submissions; no user means nothing to ask for.
  const isStaff = role !== null && role !== "STUDENT";
  const { data, isPending, isError, refetch, isRefetching, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useSubmissionQueue(PENDING, isStaff);

  if (!isStaff) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <EmptyState title="Submissions" message="This screen isn't available for your role." />
      </Screen>
    );
  }

  const items = data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <Screen edges={["top", "left", "right"]} onRefresh={() => void refetch()} refreshing={isRefetching}>
      {isPending ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState message="Couldn't load the review queue." onRetry={refetch} />
      ) : items.length === 0 ? (
        <EmptyState title="All caught up" message="No submissions waiting for review." />
      ) : (
        <>
          {items.map((item) => (
            <QueueRow key={item.publicId} item={item} />
          ))}
          {hasNextPage ? (
            <Button
              title="Load more"
              variant="secondary"
              onPress={() => void fetchNextPage()}
              loading={isFetchingNextPage}
            />
          ) : null}
        </>
      )}
    </Screen>
  );
}
```

(`PENDING` is a module constant so the query key's `filters` object is
referentially stable across renders.)

- [ ] **Step 4: Delete the placeholder row, run**

Delete `["submissions", SubmissionsScreen, "Submissions"]` and its import
from `placeholder-screens.test.tsx`.
Run: `cd apps/mobile && pnpm jest src/__tests__/submission-queue.test.tsx src/__tests__/placeholder-screens.test.tsx` → PASS.
Run: `pnpm turbo lint typecheck test:unit --filter=@space/mobile` → clean.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile && git commit -m "feat(mobile): cursor-paged submission review queue"
```

---

### Task 4: Review screen

**Files:**
- Modify: `apps/mobile/app/(app)/submission/[publicId].tsx` (replace stub)
- Modify: `apps/mobile/src/hooks/use-submission.ts` (add the review mutation)
- Test: `apps/mobile/src/__tests__/submission-review.test.tsx`

**Interfaces:**
- Consumes: `useSubmissionDetail` (Plan 1 Task 4), `reviewSubmissionResponseSchema` and `queryKeys.submissions.queues()` (Task 1).
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
import { makeSession } from "./helpers/session";
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
  useSessionStore.setState(makeSession("LEADER", { groupLeaderIds: [3] }, { id: 5 }));
});

it("shows the work, the late flag from the contract, and records a review", async () => {
  get.mockResolvedValue({ data: { data: detail } });
  post.mockResolvedValue({ data: { data: { reviewed: true, returnedForRevision: false } } });

  renderWithProviders(<SubmissionReviewScreen />);

  expect(await screen.findByText("the student's work")).toBeTruthy();
  expect(screen.getByText("Submitted late")).toBeTruthy();

  fireEvent.changeText(screen.getByLabelText("Feedback"), "Good work.");
  fireEvent.press(screen.getByText("Mark reviewed"));

  await waitFor(() =>
    expect(post).toHaveBeenCalledWith("/api/v1/submissions/aaa1111111/review", {
      feedback: "Good work.",
    }),
  );
  await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
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

it("stays on the screen and says why when the server refuses (409 not_submitted)", async () => {
  get.mockResolvedValue({ data: { data: { ...detail, status: "DRAFT", submittedAt: null } } });
  post.mockRejectedValue({ response: { status: 409, data: { error: { code: "not_submitted", message: "x" } } } });

  renderWithProviders(<SubmissionReviewScreen />);
  fireEvent.press(await screen.findByText("Mark reviewed"));

  expect(await screen.findByText(/Couldn't record the review/)).toBeTruthy();
  expect(mockBack).not.toHaveBeenCalled();
});

it("hides the verdict controls when the contract says this caller cannot review", async () => {
  get.mockResolvedValue({ data: { data: { ...detail, canReview: false } } });

  renderWithProviders(<SubmissionReviewScreen />);

  expect(await screen.findByText("the student's work")).toBeTruthy();
  expect(screen.queryByText("Mark reviewed")).toBeNull();
  expect(screen.queryByLabelText("Feedback")).toBeNull();
});
```

Run → FAIL.

- [ ] **Step 2: Mutation.** Append to `use-submission.ts` (add
`reviewSubmissionResponseSchema` to its `@space/shared` import):

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
      return reviewSubmissionResponseSchema.parse(res.data.data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.submissions.detail(publicId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.submissions.queues() });
    },
  });
}
```

- [ ] **Step 3: Screen.** Replace `apps/mobile/app/(app)/submission/[publicId].tsx`:

```tsx
import { useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { SubmissionDetail } from "@space/shared";

import { useReviewSubmission, useSubmissionDetail } from "../../../src/hooks/use-submission";
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

/** Same wording as Plan 1's submissionStatusLine, so student and reviewer read the same words. */
function statusLine(sub: SubmissionDetail): string {
  if (sub.status === "REVIEWED") return "Reviewed";
  if (sub.status === "RETURNED") return "Returned for revision";
  if (sub.status === "SUBMITTED") return sub.isLate ? "Submitted late" : "Submitted";
  return "Draft";
}

function Verdict({ publicId }: { publicId: string }) {
  const theme = useTheme();
  const router = useRouter();
  const review = useReviewSubmission(publicId);
  const [feedback, setFeedback] = useState("");

  const submit = (returnForRevision: boolean) =>
    review.mutate({ feedback, returnForRevision }, { onSuccess: () => router.back() });

  return (
    <Card style={{ marginTop: theme.spacing.md }}>
      <Input label="Feedback" value={feedback} onChangeText={setFeedback} multiline numberOfLines={6} />
      {review.isError ? (
        <Text variant="caption" color={theme.colors.error[700]}>
          Couldn't record the review. It may not have been submitted yet.
        </Text>
      ) : null}
      <Button title="Mark reviewed" onPress={() => submit(false)} loading={review.isPending} />
      <Button
        title="Return for revision"
        variant="secondary"
        onPress={() => submit(true)}
        loading={review.isPending}
      />
    </Card>
  );
}

export default function SubmissionReviewScreen() {
  const theme = useTheme();
  const { publicId: rawPublicId } = useLocalSearchParams<{ publicId: string }>();
  const publicId = typeof rawPublicId === "string" && rawPublicId.length > 0 ? rawPublicId : null;

  const { data, isPending, isError, refetch } = useSubmissionDetail(publicId);

  return (
    <Screen edges={["top", "left", "right"]} scroll>
      {publicId === null ? (
        <EmptyState title="Not found" message="That submission link isn't valid." />
      ) : isPending ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState message="Couldn't load this submission." onRetry={refetch} />
      ) : (
        <>
          <Text variant="title">{data.assignmentTitle}</Text>
          <Text variant="label" color={theme.colors.neutral[600]}>
            {data.studentName ?? "Unnamed"}
          </Text>
          <Text variant="label" color={theme.colors.neutral[600]}>
            {statusLine(data)}
          </Text>
          <Card style={{ marginTop: theme.spacing.md }}>
            <Text variant="body">{data.text ?? "No text submitted."}</Text>
          </Card>
          {data.feedback ? (
            <Card style={{ marginTop: theme.spacing.md }}>
              <Text variant="heading">Feedback</Text>
              <Text variant="body">{data.feedback}</Text>
            </Card>
          ) : null}
          {/* C4: the flag drives the UI; the server gate is what protects the write. */}
          {data.canReview ? <Verdict publicId={data.publicId} /> : null}
        </>
      )}
    </Screen>
  );
}
```

- [ ] **Step 4:** Run: `cd apps/mobile && pnpm jest src/__tests__/submission-review.test.tsx` → PASS; `pnpm turbo lint typecheck test:unit --filter=@space/mobile` → clean.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile && git commit -m "feat(mobile): submission review screen"
```

---

### Task 5: Attendance marking screen

v1's form (`attendance-form.tsx`) offers per-row PRESENT / LATE / ABSENT, a
"minutes late" field when LATE, a "quick mark all" bar, and refuses to save
with nothing marked. The port keeps all four and makes two deliberate
changes, each pinned by a test:

1. **Only touched rows are sent.** v1 resends every row that has any status,
   which re-stamps this caller as `markedBy` for marks they never made.
2. **A touched row resends its stored `notes`.** v1 sends `notes: null` on
   every row; with the server's `notes: e.notes ?? null` upsert that erases
   any note written through check-in or an override. The screen has no notes
   editor, so it must carry the existing value through unchanged.

**Files:**
- Create: `apps/mobile/src/lib/attendance-entries.ts` (pure payload builder)
- Create: `apps/mobile/src/hooks/use-attendance.ts`
- Modify: `apps/mobile/app/(app)/session/[id]/attendance.tsx` (replace stub)
- Test: `apps/mobile/src/__tests__/attendance-entries.test.ts`, `apps/mobile/src/__tests__/attendance-screen.test.tsx`

**Interfaces:**
- Consumes: `attendanceRosterRowSchema`, `saveAttendanceResponseSchema` (Task 1), `type AttendanceEntry`, `type AttendanceStatus` from `@space/shared`, `queryKeys.attendance` and `queryKeys.sessions.all`.
- Produces: `buildAttendanceEntries(roster, marks, lateText): AttendanceEntry[]`; `useAttendanceRoster(sessionId: number | null)`, `useSaveAttendance(sessionId: number)`. Plan 4 links admins and leaders here from `session/[id]/index.tsx`; the server already scopes season-wide for admins.

- [ ] **Step 1: Failing tests**

```ts
// apps/mobile/src/__tests__/attendance-entries.test.ts
import type { AttendanceRosterRow } from "@space/shared";

import { buildAttendanceEntries } from "../lib/attendance-entries";

const roster: AttendanceRosterRow[] = [
  { studentUserId: 9, name: "A", email: "a@jpc.test", groupName: null, status: null, notes: null, lateMinutes: null },
  { studentUserId: 10, name: "B", email: "b@jpc.test", groupName: null, status: "PRESENT", notes: "Doctor's note", lateMinutes: null },
];

describe("buildAttendanceEntries", () => {
  it("sends touched rows only, in roster order", () => {
    expect(buildAttendanceEntries(roster, { 9: "PRESENT" }, {})).toEqual([
      { studentUserId: 9, status: "PRESENT", notes: null },
    ]);
  });

  it("carries the stored note through, so re-marking never erases it", () => {
    expect(buildAttendanceEntries(roster, { 10: "ABSENT" }, {})).toEqual([
      { studentUserId: 10, status: "ABSENT", notes: "Doctor's note" },
    ]);
  });

  it("sends lateMinutes for LATE only, parsed like v1 (blank or junk → null)", () => {
    expect(buildAttendanceEntries(roster, { 9: "LATE", 10: "LATE" }, { 9: "12", 10: "soon" })).toEqual([
      { studentUserId: 9, status: "LATE", notes: null, lateMinutes: 12 },
      { studentUserId: 10, status: "LATE", notes: "Doctor's note", lateMinutes: null },
    ]);
  });
});
```

```tsx
// apps/mobile/src/__tests__/attendance-screen.test.tsx
import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn(), post: jest.fn() } }));
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "12" }),
  useRouter: () => ({ back: mockBack, push: jest.fn() }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";
import AttendanceScreen from "../../app/(app)/session/[id]/attendance";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;

const roster = [
  { studentUserId: 9, name: "Test student", email: "s@jpc.test", groupName: "Group A",
    status: null, notes: null, lateMinutes: null },
  { studentUserId: 10, name: "Second student", email: "s2@jpc.test", groupName: "Group A",
    status: "PRESENT", notes: "Checked in at the gate", lateMinutes: null },
];

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(makeSession("LEADER", { groupLeaderIds: [3] }, { id: 5 }));
  get.mockResolvedValue({ data: { data: { roster } } });
});

it("renders the roster and saves only rows the caller touched, notes carried through", async () => {
  post.mockResolvedValue({ data: { data: { saved: 2 } } });

  renderWithProviders(<AttendanceScreen />);

  expect(await screen.findByText("Test student")).toBeTruthy();
  expect(get).toHaveBeenCalledWith("/api/v1/sessions/12/attendance");
  fireEvent.press(screen.getByLabelText("Mark Test student PRESENT"));
  fireEvent.press(screen.getByLabelText("Mark Second student ABSENT"));
  fireEvent.press(screen.getByText("Save attendance"));

  await waitFor(() =>
    expect(post).toHaveBeenCalledWith("/api/v1/sessions/12/attendance", {
      entries: [
        { studentUserId: 9, status: "PRESENT", notes: null },
        { studentUserId: 10, status: "ABSENT", notes: "Checked in at the gate" },
      ],
    }),
  );
  await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
});

it("keeps a never-touched row out of the payload", async () => {
  post.mockResolvedValue({ data: { data: { saved: 1 } } });

  renderWithProviders(<AttendanceScreen />);
  fireEvent.press(await screen.findByLabelText("Mark Test student ABSENT"));
  fireEvent.press(screen.getByText("Save attendance"));

  // Second student is untouched: their server status stands, and sending it
  // again would stamp this leader as markedBy for a mark they never made.
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith("/api/v1/sessions/12/attendance", {
      entries: [{ studentUserId: 9, status: "ABSENT", notes: null }],
    }),
  );
});

it("asks for minutes late on a LATE row and sends them", async () => {
  post.mockResolvedValue({ data: { data: { saved: 1 } } });

  renderWithProviders(<AttendanceScreen />);
  fireEvent.press(await screen.findByLabelText("Mark Test student LATE"));
  fireEvent.changeText(screen.getByLabelText("Minutes late for Test student"), "15");
  fireEvent.press(screen.getByText("Save attendance"));

  await waitFor(() =>
    expect(post).toHaveBeenCalledWith("/api/v1/sessions/12/attendance", {
      entries: [{ studentUserId: 9, status: "LATE", notes: null, lateMinutes: 15 }],
    }),
  );
});

it("marks everyone at once (v1's quick mark all)", async () => {
  post.mockResolvedValue({ data: { data: { saved: 2 } } });

  renderWithProviders(<AttendanceScreen />);
  fireEvent.press(await screen.findByText("All present"));
  fireEvent.press(screen.getByText("Save attendance"));

  await waitFor(() =>
    expect(post).toHaveBeenCalledWith("/api/v1/sessions/12/attendance", {
      entries: [
        { studentUserId: 9, status: "PRESENT", notes: null },
        { studentUserId: 10, status: "PRESENT", notes: "Checked in at the gate" },
      ],
    }),
  );
});

it("refuses to save with nothing marked, without a request (v1)", async () => {
  renderWithProviders(<AttendanceScreen />);
  fireEvent.press(await screen.findByText("Save attendance"));

  expect(await screen.findByText("Mark at least one student before saving.")).toBeTruthy();
  expect(post).not.toHaveBeenCalled();
});
```

Run: `cd apps/mobile && pnpm jest src/__tests__/attendance-entries.test.ts src/__tests__/attendance-screen.test.tsx` → FAIL.

- [ ] **Step 2: Payload builder**

```ts
// apps/mobile/src/lib/attendance-entries.ts
import type { AttendanceEntry, AttendanceRosterRow, AttendanceStatus } from "@space/shared";

export type AttendanceMarks = Record<number, AttendanceStatus>;
export type LateMinutesText = Record<number, string>;

/** v1's parse of the minutes field: blank, non-numeric or negative → null; else floored. */
function parseLateMinutes(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

/**
 * The save payload. Only rows the caller touched (present in `marks`) are
 * sent, in roster order. Each carries the row's stored `notes`, because the
 * server writes `notes ?? null` and this screen has no notes editor —
 * omitting it would erase a note written by check-in or an override.
 * `lateMinutes` goes only with LATE (the server nulls it otherwise); an
 * untouched minutes field falls back to the stored value.
 */
export function buildAttendanceEntries(
  roster: AttendanceRosterRow[],
  marks: AttendanceMarks,
  lateText: LateMinutesText,
): AttendanceEntry[] {
  const entries: AttendanceEntry[] = [];
  for (const row of roster) {
    const status = marks[row.studentUserId];
    if (status === undefined) continue;
    const entry: AttendanceEntry = { studentUserId: row.studentUserId, status, notes: row.notes };
    if (status === "LATE") {
      const raw = lateText[row.studentUserId] ?? (row.lateMinutes !== null ? String(row.lateMinutes) : "");
      entry.lateMinutes = parseLateMinutes(raw);
    }
    entries.push(entry);
  }
  return entries;
}
```

- [ ] **Step 3: Hooks**

```ts
// apps/mobile/src/hooks/use-attendance.ts
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { z } from "zod";
import {
  attendanceRosterRowSchema,
  saveAttendanceResponseSchema,
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
    queryKey: queryKeys.attendance.roster(sessionId),
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
      return saveAttendanceResponseSchema.parse(res.data.data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.attendance.roster(sessionId) });
      // Session lists carry `attendanceMarked`.
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all });
    },
  });
}
```

- [ ] **Step 4: Screen.** Replace `apps/mobile/app/(app)/session/[id]/attendance.tsx`:

```tsx
import { useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import type { AttendanceRosterRow, AttendanceStatus } from "@space/shared";

import { useAttendanceRoster, useSaveAttendance } from "../../../../src/hooks/use-attendance";
import {
  buildAttendanceEntries,
  type AttendanceMarks,
  type LateMinutesText,
} from "../../../../src/lib/attendance-entries";
import { useTheme } from "../../../../src/theme";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  Screen,
  Text,
} from "../../../../src/ui";

const STATUSES: { value: AttendanceStatus; label: string }[] = [
  { value: "PRESENT", label: "Present" },
  { value: "LATE", label: "Late" },
  { value: "ABSENT", label: "Absent" },
];

function RosterRow({
  row,
  current,
  lateText,
  onMark,
  onLateText,
}: {
  row: AttendanceRosterRow;
  current: AttendanceStatus | null;
  lateText: string;
  onMark: (status: AttendanceStatus) => void;
  onLateText: (text: string) => void;
}) {
  const theme = useTheme();
  const displayName = row.name ?? row.email;

  return (
    <Card style={{ marginBottom: theme.spacing.sm }}>
      <Text variant="heading">{displayName}</Text>
      <Text variant="caption" color={theme.colors.neutral[600]}>
        {row.groupName ? `${row.groupName} · ${row.email}` : row.email}
      </Text>
      <View style={{ flexDirection: "row", gap: theme.spacing.sm, marginTop: theme.spacing.sm }}>
        {STATUSES.map((option) => {
          const active = current === option.value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityLabel={`Mark ${displayName} ${option.value}`}
              accessibilityState={{ selected: active }}
              onPress={() => onMark(option.value)}
              style={{
                paddingHorizontal: theme.spacing.md,
                paddingVertical: theme.spacing.sm,
                borderRadius: theme.radii.md,
                borderWidth: theme.borderWidths.thin,
                borderColor: active ? theme.colors.neutral[900] : theme.colors.neutral[300],
                backgroundColor: active ? theme.colors.neutral[100] : theme.colors.white,
              }}
            >
              <Text variant="label">{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {current === "LATE" ? (
        <Input
          label={`Minutes late for ${displayName}`}
          value={lateText}
          onChangeText={onLateText}
          keyboardType="number-pad"
        />
      ) : null}
    </Card>
  );
}

export default function AttendanceScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const parsed = Number(rawId);
  const sessionId = Number.isInteger(parsed) && parsed > 0 ? parsed : null;

  const { data: roster, isPending, isError, refetch } = useAttendanceRoster(sessionId);
  const save = useSaveAttendance(sessionId ?? 0);
  const [marks, setMarks] = useState<AttendanceMarks>({});
  const [lateText, setLateText] = useState<LateMinutesText>({});
  const [formError, setFormError] = useState<string | null>(null);

  if (sessionId === null) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <EmptyState title="Not found" message="That session link isn't valid." />
      </Screen>
    );
  }

  const markAll = (status: AttendanceStatus) =>
    setMarks(Object.fromEntries((roster ?? []).map((row) => [row.studentUserId, status])));

  const onSave = () => {
    setFormError(null);
    const entries = buildAttendanceEntries(roster ?? [], marks, lateText);
    if (entries.length === 0) {
      setFormError("Mark at least one student before saving.");
      return;
    }
    save.mutate(entries, { onSuccess: () => router.back() });
  };

  return (
    <Screen edges={["top", "left", "right"]} scroll>
      <Text variant="title">Attendance</Text>
      {isPending ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState message="Couldn't load the roster." onRetry={refetch} />
      ) : roster.length === 0 ? (
        <EmptyState title="No students" message="No students are enrolled in this scope." />
      ) : (
        <>
          <View style={{ flexDirection: "row", gap: theme.spacing.sm, marginVertical: theme.spacing.md }}>
            {STATUSES.map((option) => (
              <Button
                key={option.value}
                title={`All ${option.label.toLowerCase()}`}
                variant="secondary"
                onPress={() => markAll(option.value)}
              />
            ))}
          </View>
          {roster.map((row) => (
            <RosterRow
              key={row.studentUserId}
              row={row}
              current={marks[row.studentUserId] ?? row.status}
              lateText={lateText[row.studentUserId] ?? (row.lateMinutes !== null ? String(row.lateMinutes) : "")}
              onMark={(status) => setMarks((prev) => ({ ...prev, [row.studentUserId]: status }))}
              onLateText={(text) => setLateText((prev) => ({ ...prev, [row.studentUserId]: text }))}
            />
          ))}
          {formError ? (
            <Text variant="caption" color={theme.colors.error[700]}>
              {formError}
            </Text>
          ) : null}
          {save.isError ? (
            <Text variant="caption" color={theme.colors.error[700]}>
              Couldn't save attendance. Check your connection and try again.
            </Text>
          ) : null}
          <Button title="Save attendance" onPress={onSave} loading={save.isPending} />
        </>
      )}
    </Screen>
  );
}
```

(`useSaveAttendance(sessionId ?? 0)`: the hook itself must run
unconditionally (rules of hooks), but `mutate` is only reachable below the
`sessionId === null` early return, so it never fires with 0. `theme.radii.md` and `theme.borderWidths.thin` exist
on `Theme`.)

- [ ] **Step 5:** Run: `cd apps/mobile && pnpm jest src/__tests__/attendance-entries.test.ts src/__tests__/attendance-screen.test.tsx` → PASS; `pnpm turbo lint typecheck test:unit --filter=@space/mobile` → clean.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile && git commit -m "feat(mobile): attendance marking screen"
```

---

### Task 6: Closing gate (coordinator)

- [ ] **Step 1:** `pnpm turbo lint typecheck test:unit` at the root → green.
- [ ] **Step 2: Mutation pass** (one at a time, restore after each; each must fail at least one test):
  1. In `useSubmissionQueue`, ignore `pageParam` (always fetch page one) → the pagination test's `toHaveBeenLastCalledWith` must fail.
  2. In `buildAttendanceEntries`, iterate every roster row with a status instead of `marks` → "keeps a never-touched row out" must fail.
  3. In `buildAttendanceEntries`, drop `notes: row.notes` → "carries the stored note through" must fail.
  4. In the review screen, render `<Verdict>` unconditionally → the `canReview: false` test must fail.
  5. In `useSaveAttendance`, return `res.data.data` unparsed and change `saveAttendanceResponseSchema` to `z.boolean()` for `saved` → `leader-contracts.test.ts` must fail.
  6. In `groups.tsx`, query `GET /groups` for every role → the admin "not-yet state, no request" test must fail.
- [ ] **Step 3: Device checklist** — as a leader on staging: groups tab shows
their groups and members' emails; queue pages with >25 pending items; a
verdict removes the row from the pending queue without manual refresh;
return-for-revision flips the student's screen (check with the Plan 1 student
flow) to editable `RETURNED`. Attendance has no in-app entry point until
Plan 4's session detail, so open it by deep link —
`npx uri-scheme open "spacev2://session/<id>/attendance" --ios` (or
`--android`) — mark, set minutes on a LATE row, save; reopen and confirm the
marks and an existing note survived. As an admin: the Groups tab shows the
not-yet message, not "No groups". As a student: the submissions screen shows
its empty state and group detail shows no emails.
- [ ] **Step 4:** Report suite counts, the six mutation outcomes, checklist
results, and any divergence from this plan.

---

## Revision 2026-10-05

- Session fixtures use Plan 1's `makeSession` (all carry `avatarPath`, review B4/X11).
- No count edits anywhere: detail routes are appended to `DETAIL_ROUTE_NAMES`,
  placeholder rows deleted; the disk-derived tests from Plan 1 Task 0 do the
  rest (X9, review B5).
- Route form (X7): `session/[id]/attendance.tsx` is the directory form; the
  plan now states that Plan 4's detail must be `session/[id]/index.tsx`, and
  Plan 1's `ambiguousRouteSiblings()` guard enforces it.
- Casts → parse (X10): `reviewSubmissionResponseSchema` and
  `saveAttendanceResponseSchema` added to `packages/shared` with tests.
- Attendance (review S7): the success payload is `{ saved: number }`, not
  `{ saved: true }`; touched rows now resend their stored `notes` (the
  previous payload erased them) and `lateMinutes` for LATE; v1's minutes-late
  field, "mark all" and empty-save refusal are ported; payload logic lives in
  `src/lib/attendance-entries.ts` with unit tests.
- Admin Groups tab (X8, review S8): ADMIN/SUPER/MENTOR get an explicit
  "not available yet" state with no request instead of a misleading empty
  list; the season branch is Plan 16's. `MY_GROUPS_ROLES` exported.
- Every screen previously described in prose (groups, group detail, queue,
  review, attendance) now has full code; the review screen handles a 409
  without navigating away; sentinel query keys (`-1`) replaced with `null`.
- Device checklist reaches attendance via deep link (no entry point until Plan 4).
