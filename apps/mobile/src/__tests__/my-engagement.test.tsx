import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn() } }));
import { apiClient } from "../lib/api-client";
import { useMyEngagement } from "../hooks/use-engagement";

const get = apiClient.get as jest.Mock;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const self = {
  attendancePct: 62,
  submissionPct: 25,
  attendanceTotal: 8,
  attendancePresent: 5,
  submissionsExpected: 4,
  submissionsCompleted: 1,
  seasonId: 7,
  seasonTitle: "GBV 2026",
};

beforeEach(() => jest.clearAllMocks());

it("reads the student's own engagement with the self schema (spec D9)", async () => {
  get.mockResolvedValue({ data: { data: self } });
  const { result } = renderHook(() => useMyEngagement(9, true), { wrapper });
  await waitFor(() => expect(result.current.data?.submissionsCompleted).toBe(1));
  expect(result.current.data?.submissionsExpected).toBe(4);
  expect(get).toHaveBeenCalledWith("/api/v1/students/9/engagement");
});

it("refuses the staff shape instead of rendering it", async () => {
  get.mockResolvedValue({ data: { data: { ...self, score: 40, atRisk: false } } });
  const { result } = renderHook(() => useMyEngagement(9, true), { wrapper });
  await waitFor(() => expect(result.current.isError).toBe(true));
});

it("does not fetch without a user id or when disabled", () => {
  renderHook(() => useMyEngagement(null, true), { wrapper });
  renderHook(() => useMyEngagement(9, false), { wrapper });
  expect(get).not.toHaveBeenCalled();
});
