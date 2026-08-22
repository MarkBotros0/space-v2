import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react-native";

// Same hoisting constraint documented in use-session.test.tsx: a `jest.mock`
// factory may only close over out-of-scope consts whose names start with
// `mock`. Declare the fn inline in the factory, then import the mocked
// module's own export and alias it below.
jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn() },
}));

import { apiClient } from "../lib/api-client";
import { useSeasonSessions } from "../hooks/use-sessions";

const get = apiClient.get as jest.Mock;

const validSession = {
  id: 1,
  title: "Kickoff",
  startsAt: "2026-03-01T18:00:00.000Z",
  durationMinutes: 60,
  location: "Room 1",
  recurrenceGroupId: null,
  attendanceMarked: false,
  seasonId: 7,
  seasonCode: "S26",
  seasonTitle: "Spring 2026",
  checkInToken: null,
  checkInOpenAt: null,
  checkInClosedAt: null,
};

function createWrapper() {
  // `retry: false` — an error-path test should not sit through the default
  // backoff to observe the query settle into its error state.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("useSeasonSessions", () => {
  it("does not fire a request when seasonId is null — the dependent-query case", async () => {
    const { result } = renderHook(() => useSeasonSessions(null), { wrapper: createWrapper() });

    // Give any accidental fetch a turn of the microtask queue to have
    // started, then assert it never did.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(get).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("fetches the season's sessions from the right URL once seasonId is a number", async () => {
    get.mockResolvedValue({ data: { data: { sessions: [validSession] } } });

    const { result } = renderHook(() => useSeasonSessions(7), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(get).toHaveBeenCalledWith("/api/v1/seasons/7/sessions");
    expect(result.current.data).toEqual([validSession]);
  });

  it("switches from disabled to fetching when seasonId changes from null to a number", async () => {
    get.mockResolvedValue({ data: { data: { sessions: [validSession] } } });
    const wrapper = createWrapper();

    const { result, rerender } = renderHook(
      ({ seasonId }: { seasonId: number | null }) => useSeasonSessions(seasonId),
      {
        wrapper,
        initialProps: { seasonId: null },
      },
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(get).not.toHaveBeenCalled();

    rerender({ seasonId: 7 });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith("/api/v1/seasons/7/sessions");
  });

  it("fails the query rather than handing a malformed session to the caller", async () => {
    // Missing required fields — a stand-in for a backend drift. This must
    // surface as a query error, not a value that silently lacks fields the
    // UI assumes are present.
    get.mockResolvedValue({ data: { data: { sessions: [{ id: 1, title: "Broken" }] } } });

    const { result } = renderHook(() => useSeasonSessions(7), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it("supports refetch to retry after a failure", async () => {
    get.mockRejectedValueOnce(new Error("network down"));
    get.mockResolvedValueOnce({ data: { data: { sessions: [validSession] } } });

    const { result } = renderHook(() => useSeasonSessions(7), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));

    await result.current.refetch();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([validSession]);
  });
});
