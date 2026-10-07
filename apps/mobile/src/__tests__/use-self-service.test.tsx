import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn(), patch: jest.fn() } }));

import { apiClient } from "../lib/api-client";
import {
  useMyAttendance,
  useMySeason,
  useSeasonHistory,
  useUpdateStudentProfile,
} from "../hooks/use-self-service";

const get = apiClient.get as jest.Mock;
const patch = apiClient.patch as jest.Mock;

/** One client per test, created OUTSIDE the wrapper so re-renders keep the cache. */
function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

const attendance = {
  season: { id: 7, title: "Spring", absenceBudgetMinutes: 180, absenceWeightMinutes: 90 },
  budget: { minutesUsed: 105, budgetMinutes: 180, budgetPct: 58, remainingPct: 42, absentCount: 1, lateCount: 1 },
  streak: 1,
  sessions: [],
};

const profile = {
  name: "Mina Adel", email: "mina@jpc.test", avatarPath: null, graduationYear: null,
  activeSeasonTitle: "Spring", university: null, year: null, phone: "+20 122",
  dateOfBirth: null, spiritualBackground: null, gifts: null,
};

beforeEach(() => jest.clearAllMocks());

describe("useMyAttendance", () => {
  it("does not fetch without an active season (spec 04 R93)", () => {
    const { result } = renderHook(() => useMyAttendance(null), { wrapper: makeWrapper() });
    expect(result.current.fetchStatus).toBe("idle");
    expect(get).not.toHaveBeenCalled();
  });

  it("fetches and parses the student's attendance", async () => {
    get.mockResolvedValue({ data: { data: attendance } });
    const { result } = renderHook(() => useMyAttendance(7), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(get).toHaveBeenCalledWith("/api/v1/me/attendance");
    expect(result.current.data?.budget?.remainingPct).toBe(42);
  });

  it("fails at the boundary on a drifted payload", async () => {
    get.mockResolvedValue({ data: { data: { ...attendance, budget: { ...attendance.budget, budgetPct: 140 } } } });
    const { result } = renderHook(() => useMyAttendance(7), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useSeasonHistory / useMySeason", () => {
  it("fetches history only when enabled", async () => {
    get.mockResolvedValue({ data: { data: { seasons: [] } } });
    const disabled = renderHook(() => useSeasonHistory(7, false), { wrapper: makeWrapper() });
    expect(disabled.result.current.fetchStatus).toBe("idle");
    expect(get).not.toHaveBeenCalled();

    const enabled = renderHook(() => useSeasonHistory(7, true), { wrapper: makeWrapper() });
    await waitFor(() => expect(enabled.result.current.isSuccess).toBe(true));
    expect(get).toHaveBeenCalledWith("/api/v1/me/season-history");
    expect(enabled.result.current.data).toEqual([]);
  });

  it("unwraps a null season (no active season) rather than erroring", async () => {
    get.mockResolvedValue({ data: { data: { season: null } } });
    const { result } = renderHook(() => useMySeason(7), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(get).toHaveBeenCalledWith("/api/v1/me/season");
    expect(result.current.data).toBeNull();
  });
});

describe("useUpdateStudentProfile (ruling X10 — mutations parse too)", () => {
  it("PATCHes /me/profile and returns the parsed profile", async () => {
    patch.mockResolvedValue({ data: { data: { profile } } });
    const { result } = renderHook(() => useUpdateStudentProfile(), { wrapper: makeWrapper() });
    let saved: unknown;
    await act(async () => {
      saved = await result.current.mutateAsync({ phone: "+20 122" });
    });
    expect(patch).toHaveBeenCalledWith("/api/v1/me/profile", { phone: "+20 122" });
    expect(saved).toEqual(profile);
  });

  it("rejects a response that carries staff-only notes (R23 — strict schema)", async () => {
    patch.mockResolvedValue({ data: { data: { profile: { ...profile, notes: "internal" } } } });
    const { result } = renderHook(() => useUpdateStudentProfile(), { wrapper: makeWrapper() });
    await act(async () => {
      await expect(result.current.mutateAsync({ phone: "+20 122" })).rejects.toThrow();
    });
  });
});
