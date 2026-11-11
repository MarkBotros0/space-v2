import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { AxiosError, type AxiosResponse } from "axios";
import type { ReactNode } from "react";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

import { apiClient } from "../lib/api-client";
import { useSavePartVideoProgress } from "../hooks/use-video-quiz";
import { queryKeys } from "../lib/query-keys";

const put = apiClient.put as jest.Mock;

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  jest.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
});

const saved = (watchedSeconds: number, completedAt: string | null = null) => ({
  data: {
    data: {
      watchedSeconds,
      durationSeconds: 1080,
      answered: 0,
      questionCount: 0,
      correct: 0,
      furthestSeconds: watchedSeconds,
      completedAt,
    },
  },
});

const refusal = (status: number) =>
  new AxiosError(String(status), "ERR_BAD_REQUEST", undefined, undefined, {
    status,
    data: { error: { code: "not_found", message: "Part not found." } },
  } as AxiosResponse);

const url = (partId: number) => `/api/v1/assignments/41/parts/${partId}/video/progress`;

describe("useSavePartVideoProgress: the reporter's edges", () => {
  it("a part change starts empty: part A's unsent ranges never go to part B", async () => {
    put.mockRejectedValueOnce(new Error("offline"));
    put.mockResolvedValue(saved(5));
    const { result, rerender } = renderHook(({ partId }: { partId: number }) => useSavePartVideoProgress(41, partId), {
      wrapper,
      initialProps: { partId: 1 },
    });
    await act(async () => {
      await result.current.report([[0, 10]], 10);
    });
    rerender({ partId: 2 });
    await act(async () => {
      await result.current.report([[0, 5]], 5);
    });
    expect(put).toHaveBeenLastCalledWith(url(2), { intervals: [[0, 5]], position: 5 });
  });

  it("a part change forgets the last part's done state, so the new part's done still refreshes the rows", async () => {
    put.mockResolvedValue(saved(1000, "2099-01-01T00:00:00.000Z"));
    const invalidate = jest.spyOn(client, "invalidateQueries");
    const { result, rerender } = renderHook(({ partId }: { partId: number }) => useSavePartVideoProgress(41, partId), {
      wrapper,
      initialProps: { partId: 1 },
    });
    await act(async () => {
      await result.current.report([[0, 1000]], 1000);
    });
    rerender({ partId: 2 });
    invalidate.mockClear();
    await act(async () => {
      await result.current.report([[0, 1000]], 1000);
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.assignments.detail(41) });
  });

  it("a request that fails while a report waits is retried once, merged, at once", async () => {
    let fail: (e: unknown) => void = () => undefined;
    put.mockImplementationOnce(() => new Promise((_resolve, reject) => (fail = reject)));
    put.mockRejectedValueOnce(new Error("still offline"));
    const { result } = renderHook(() => useSavePartVideoProgress(41, 1), { wrapper });
    let first: Promise<void> = Promise.resolve();
    await act(async () => {
      first = result.current.report([[0, 10]], 10);
      // Resolves before its ranges are sent: one request is in flight.
      await result.current.report([[10, 20]], 20);
    });
    expect(put).toHaveBeenCalledTimes(1);
    await act(async () => {
      fail(new Error("offline"));
      await first;
    });
    await waitFor(() => expect(put).toHaveBeenCalledTimes(2));
    expect(put).toHaveBeenLastCalledWith(url(1), { intervals: [[0, 20]], position: 20 });
    // Retried once only: the second failure waits for the next report.
    expect(put).toHaveBeenCalledTimes(2);
  });

  it("sends at most 50 ranges, and keeps the rest for the next tick", async () => {
    put.mockResolvedValue(saved(60));
    const ranges: [number, number][] = Array.from({ length: 60 }, (_, i) => [i * 10, i * 10 + 1]);
    const { result } = renderHook(() => useSavePartVideoProgress(41, 1), { wrapper });
    await act(async () => {
      await result.current.report(ranges, 600);
    });
    expect(put).toHaveBeenCalledTimes(1);
    expect(put.mock.calls[0][1].intervals).toHaveLength(50);
    await act(async () => {
      await result.current.report([], 610);
    });
    expect(put).toHaveBeenCalledTimes(2);
    expect(put.mock.calls[1][1]).toEqual({ intervals: ranges.slice(50), position: 610 });
  });

  it("drops the ranges on a permanent refusal, and keeps them on 429", async () => {
    put.mockRejectedValueOnce(refusal(404));
    put.mockRejectedValueOnce(refusal(429));
    put.mockResolvedValue(saved(30));
    const { result } = renderHook(() => useSavePartVideoProgress(41, 1), { wrapper });
    await act(async () => {
      await result.current.report([[0, 10]], 10);
    });
    await act(async () => {
      await result.current.report([[10, 20]], 20);
    });
    expect(put).toHaveBeenLastCalledWith(url(1), { intervals: [[10, 20]], position: 20 });
    await act(async () => {
      await result.current.report([[20, 30]], 30);
    });
    expect(put).toHaveBeenLastCalledWith(url(1), { intervals: [[10, 30]], position: 30 });
  });

  it("a report from an old part's render (a leave cleanup after a rerender) keeps to that part", async () => {
    // Part 1's last report fails, so its ranges stay unsent: they must stay part 1's.
    put.mockRejectedValueOnce(new Error("offline"));
    put.mockResolvedValue(saved(5));
    const { result, rerender } = renderHook(({ partId }: { partId: number }) => useSavePartVideoProgress(41, partId), {
      wrapper,
      initialProps: { partId: 1 },
    });
    const partOneReport = result.current.report;
    rerender({ partId: 2 });

    // The old render's report: part 1's address and only what it was given.
    await act(async () => {
      await partOneReport([[0, 5]], 5);
    });
    expect(put).toHaveBeenLastCalledWith(url(1), { intervals: [[0, 5]], position: 5 });

    // Part 2's reporter never saw part 1's ranges.
    await act(async () => {
      await result.current.report([[0, 3]], 3);
    });
    expect(put).toHaveBeenLastCalledWith(url(2), { intervals: [[0, 3]], position: 3 });
    expect(put).toHaveBeenCalledTimes(2);
  });
});
