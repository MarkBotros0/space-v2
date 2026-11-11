import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { AxiosError, type AxiosResponse } from "axios";
import type { ReactNode } from "react";
import type { AssignmentDetail, AssignmentWriteRequest } from "@space/shared";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

import { apiClient } from "../lib/api-client";
import { useAssignmentProgress, useStaffAssignments, useStudentAssignments } from "../hooks/use-assignments";
import { useCreateAssignment, useDeleteAssignment, useUpdateAssignment } from "../hooks/use-assignment-writes";
import { useHandInEssay, useReviewEssay, useSaveEssayDraft, useSubmitAssignment } from "../hooks/use-submission";
import { queryKeys } from "../lib/query-keys";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;
const put = apiClient.put as jest.Mock;
const patch = apiClient.patch as jest.Mock;
const del = apiClient.delete as jest.Mock;

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const conflict = (code: string, extra: Record<string, unknown> = {}, message = "Conflict") =>
  new AxiosError("409", "ERR_BAD_REQUEST", undefined, undefined, {
    status: 409,
    data: { ...extra, error: { code, message } },
  } as AxiosResponse);

const reminder = { enabled: true, days: 2, anchor: "NEXT_SESSION" as const, time: "09:00" };

const detail: AssignmentDetail = {
  id: 41,
  seasonId: 7,
  seasonCode: "s7",
  seasonTitle: "Spring 2099",
  title: "Luke 15",
  description: null,
  dueAt: null,
  dueOrgDay: null,
  dueOrgTime: null,
  isOverdue: false,
  reminder,
  reminderLine: "Tue 11 Nov, around 9:00 AM — students who haven't finished",
  parts: [
    { id: 3, position: 0, kind: "FORUM", prompt: "Discuss", minWords: null, postToRead: true, allowComments: true },
  ],
  my: null,
  canManage: true,
  readOnly: false,
};

const body: AssignmentWriteRequest = {
  title: "Luke 15",
  description: null,
  dueDay: null,
  dueTime: null,
  reminder,
  parts: [{ id: 3, kind: "FORUM", prompt: "Discuss", minWords: null, postToRead: true, allowComments: true }],
};

const staffRow = {
  id: 41,
  title: "Luke 15",
  dueAt: "2099-04-01T21:59:00.000Z",
  dueOrgDay: "2099-04-01",
  isOverdue: false,
  partsCount: 3,
  submissionCount: 1,
  expectedCount: 2,
  seasonCode: "s7",
};

const studentRow = {
  id: 41,
  title: "Luke 15",
  dueAt: null,
  dueOrgDay: null,
  isOverdue: false,
  status: "PENDING",
  reviewedAt: null,
  submittedAt: null,
  partsTotal: 3,
  partsDone: 1,
  returned: false,
  hasEssay: true,
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
    get.mockResolvedValue({ data: { data: { assignments: [studentRow] } } });
    const { result } = renderHook(() => useStaffAssignments(7), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("useStudentAssignments parses the student arm with its part counts", async () => {
    get.mockResolvedValue({ data: { data: { assignments: [studentRow] } } });
    const { result } = renderHook(() => useStudentAssignments(7), { wrapper });
    await waitFor(() => expect(result.current.data?.[0]?.partsDone).toBe(1));
  });

  it("useAssignmentProgress reads the progress endpoint", async () => {
    get.mockResolvedValue({ data: { data: { rows: [] } } });
    const { result } = renderHook(() => useAssignmentProgress(41), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual({ rows: [] }));
    expect(get).toHaveBeenCalledWith("/api/v1/assignments/41/progress");
  });
});

describe("assignment writes (X10: every response is parsed)", () => {
  it("useCreateAssignment posts the parts to the season path and seeds the detail cache", async () => {
    post.mockResolvedValue({ data: { data: detail } });
    const { result } = renderHook(() => useCreateAssignment(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ seasonId: 7, body });
    });
    expect(post).toHaveBeenCalledWith("/api/v1/seasons/7/assignments", body);
    expect(client.getQueryData(queryKeys.assignments.detail(41))).toEqual(detail);
  });

  it("update returns saved with the reopened count, and refreshes the lists and progress", async () => {
    patch.mockResolvedValue({ data: { data: { ...detail, reopened: 2 } } });
    const invalidate = jest.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useUpdateAssignment(41), { wrapper });
    let out: unknown;
    await act(async () => {
      out = await result.current.mutateAsync(body);
    });
    expect(patch).toHaveBeenCalledWith("/api/v1/assignments/41", body);
    expect(out).toEqual({ kind: "saved", detail, reopened: 2 });
    expect(client.getQueryData(queryKeys.assignments.detail(41))).toEqual(detail);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.assignments.lists() });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.assignments.progress(41) });
  });

  it("update returns confirm with the student count on 409 needs_confirmation", async () => {
    patch.mockRejectedValue(conflict("needs_confirmation", { students: 3 }));
    const { result } = renderHook(() => useUpdateAssignment(41), { wrapper });
    let out: unknown;
    await act(async () => {
      out = await result.current.mutateAsync(body);
    });
    expect(out).toEqual({ kind: "confirm", students: 3 });
  });

  it("update rethrows any other refusal, and a malformed response", async () => {
    patch.mockRejectedValueOnce(conflict("season_finished"));
    patch.mockResolvedValueOnce({ data: { data: { id: 41 } } });
    const { result } = renderHook(() => useUpdateAssignment(41), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync(body)).rejects.toBeInstanceOf(AxiosError);
      await expect(result.current.mutateAsync(body)).rejects.toThrow();
    });
  });

  it("useDeleteAssignment parses { deleted: true } and drops the cached detail and progress", async () => {
    client.setQueryData(queryKeys.assignments.detail(41), detail);
    client.setQueryData(queryKeys.assignments.progress(41), { rows: [] });
    del.mockResolvedValue({ data: { data: { deleted: true } } });
    const { result } = renderHook(() => useDeleteAssignment(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(41);
    });
    expect(del).toHaveBeenCalledWith("/api/v1/assignments/41");
    expect(client.getQueryData(queryKeys.assignments.detail(41))).toBeUndefined();
    expect(client.getQueryData(queryKeys.assignments.progress(41))).toBeUndefined();
  });
});

describe("student work writes", () => {
  it("useSaveEssayDraft puts the text on the part path and refreshes the assignment", async () => {
    put.mockResolvedValue({ data: { data: { publicId: "e1", wordCount: 2, reviewStatus: "DRAFT" } } });
    const invalidate = jest.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useSaveEssayDraft(41, 12), { wrapper });
    await act(async () => {
      await result.current.mutateAsync("Two words");
    });
    expect(put).toHaveBeenCalledWith("/api/v1/assignments/41/parts/12/essay", { text: "Two words" });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.assignments.detail(41) });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.assignments.lists() });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.submissions.detail("e1") });
  });

  it("useHandInEssay posts to the essay's hand-in and refreshes the essay, assignment and queues", async () => {
    post.mockResolvedValue({ data: { data: { reviewStatus: "SUBMITTED", assignmentSubmitted: true } } });
    const invalidate = jest.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useHandInEssay("e1", 41), { wrapper });
    await act(async () => {
      await result.current.mutateAsync();
    });
    expect(post).toHaveBeenCalledWith("/api/v1/submissions/e1/hand-in");
    for (const queryKey of [
      queryKeys.submissions.detail("e1"),
      queryKeys.assignments.detail(41),
      queryKeys.assignments.lists(),
      queryKeys.assignments.progress(41),
      queryKeys.submissions.queues(),
    ]) {
      expect(invalidate).toHaveBeenCalledWith({ queryKey });
    }
  });

  it("useSubmitAssignment posts once and refreshes the assignment, lists and queues", async () => {
    post.mockResolvedValue({ data: { data: { submittedAt: "2099-04-01T10:00:00.000Z", completedAt: null } } });
    const invalidate = jest.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useSubmitAssignment(41), { wrapper });
    await act(async () => {
      await result.current.mutateAsync();
    });
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith("/api/v1/assignments/41/submit");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.assignments.detail(41) });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.assignments.lists() });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.submissions.queues() });
  });

  it("a refused Submit (not_finished, already_submitted) still refreshes the stale assignment", async () => {
    post.mockRejectedValue(conflict("already_submitted"));
    const invalidate = jest.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useSubmitAssignment(41), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync()).rejects.toBeInstanceOf(AxiosError);
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.assignments.detail(41) });
  });

  it("useReviewEssay sends the action and feedback and refreshes the progress and queues", async () => {
    post.mockResolvedValue({ data: { data: { reviewStatus: "RETURNED" } } });
    const invalidate = jest.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useReviewEssay("e1"), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ action: "return", feedback: "Say more" });
    });
    expect(post).toHaveBeenCalledWith("/api/v1/submissions/e1/review", { action: "return", feedback: "Say more" });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.submissions.queues() });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.assignments.progresses() });
  });
});
