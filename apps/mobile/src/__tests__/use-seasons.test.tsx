import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn() } }));

import { apiClient } from "../lib/api-client";
import { pickCurrentSeasonId, useCurrentSeasonId } from "../hooks/use-seasons";
import { useSessionStore } from "../store/session";
import { makeSession } from "./helpers/session";

const get = apiClient.get as jest.Mock;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const row = (id: number, year: number, status: "DRAFT" | "ACTIVE" | "COMPLETED" | "ARCHIVED") => ({
  id, code: `s${id}`, title: `Season ${id}`, program: "TEST", year, status,
  startDate: `${year}-01-01T00:00:00.000Z`, endDate: `${year}-12-31T00:00:00.000Z`,
});

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("pickCurrentSeasonId (v1: latest-starting ACTIVE, else latest-starting — spec 19 D9)", () => {
  it("prefers an ACTIVE season over a newer non-ACTIVE one", () => {
    expect(pickCurrentSeasonId([row(8, 2027, "DRAFT"), row(7, 2026, "ACTIVE")])).toBe(7);
  });
  it("picks the latest-starting of two ACTIVE seasons in one year, not the first listed", () => {
    // The API lists `year desc, title asc`, so "Autumn" (Sep start) precedes
    // "Spring" (Feb start) alphabetically. v1's orderBy startDate desc picks
    // Autumn; so must we — but listed the other way round, to prove the hook
    // sorts instead of trusting order.
    const spring = { ...row(10, 2026, "ACTIVE"), title: "Spring", startDate: "2026-02-01T00:00:00.000Z" };
    const autumn = { ...row(11, 2026, "ACTIVE"), title: "Autumn", startDate: "2026-09-01T00:00:00.000Z" };
    expect(pickCurrentSeasonId([spring, autumn])).toBe(11);
    expect(pickCurrentSeasonId([autumn, spring])).toBe(11);
  });
  it("falls back to the latest-starting season when none is ACTIVE", () => {
    expect(pickCurrentSeasonId([row(7, 2026, "ARCHIVED"), row(8, 2027, "DRAFT")])).toBe(8);
  });
  it("is null for an empty list", () => {
    expect(pickCurrentSeasonId([])).toBeNull();
  });
});

describe("useCurrentSeasonId", () => {
  it("returns a student's pinned season and never fetches the seasons list", async () => {
    useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }, { id: 9 }));
    const { result } = renderHook(() => useCurrentSeasonId(), { wrapper });
    expect(result.current).toMatchObject({ seasonId: 7, isPending: false, isError: false });
    expect(get).not.toHaveBeenCalled();
  });

  it("derives a staff member's season from the role-scoped list — staff have no pin (X8)", async () => {
    useSessionStore.setState(makeSession("ADMIN", {}, { id: 2 }));
    get.mockResolvedValue({ data: { data: { seasons: [row(8, 2027, "DRAFT"), row(7, 2026, "ACTIVE")] } } });
    const { result } = renderHook(() => useCurrentSeasonId(), { wrapper });
    await waitFor(() => expect(result.current.seasonId).toBe(7));
    expect(get).toHaveBeenCalledWith("/api/v1/seasons");
  });

  it("reports an error instead of a silent 'no season' when the list fails", async () => {
    useSessionStore.setState(makeSession("ADMIN", {}, { id: 2 }));
    get.mockRejectedValue(new Error("network down"));
    const { result } = renderHook(() => useCurrentSeasonId(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.seasonId).toBeNull();
  });
});
