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
