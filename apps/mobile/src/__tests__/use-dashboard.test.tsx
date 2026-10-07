import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn() },
}));

import { apiClient } from "../lib/api-client";
import { useMentorDashboard, useSeasonStaffDashboard, useStudentDashboard } from "../hooks/use-dashboard";

const get = apiClient.get as jest.Mock;

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

const notEnrolled = { variant: "STUDENT", season: null, progress: null, nextSession: null, assignments: null };

beforeEach(() => jest.clearAllMocks());

describe("dashboard hooks", () => {
  it("useSeasonStaffDashboard does not fire without a season (enabled guard)", () => {
    renderHook(() => useSeasonStaffDashboard(null), { wrapper: makeWrapper() });
    expect(get).not.toHaveBeenCalled();
  });

  it("useSeasonStaffDashboard sends the season", async () => {
    get.mockReturnValue(new Promise(() => {}));
    renderHook(() => useSeasonStaffDashboard(7), { wrapper: makeWrapper() });
    await waitFor(() => expect(get).toHaveBeenCalledWith("/api/v1/me/dashboard?seasonId=7"));
  });

  it("useStudentDashboard parses its own arm — and never sends a seasonId", async () => {
    get.mockResolvedValue({ data: { data: notEnrolled } });
    const { result } = renderHook(() => useStudentDashboard(null), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(notEnrolled);
    expect(get).toHaveBeenCalledWith("/api/v1/me/dashboard");
  });

  it("fails at the boundary when the server answers another variant (X10)", async () => {
    get.mockResolvedValue({ data: { data: { variant: "MENTOR", recentActivity: [] } } });
    const { result } = renderHook(() => useStudentDashboard(7), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("useMentorDashboard parses the MENTOR arm", async () => {
    get.mockResolvedValue({ data: { data: { variant: "MENTOR", recentActivity: [] } } });
    const { result } = renderHook(() => useMentorDashboard(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.data?.recentActivity).toEqual([]));
  });
});
