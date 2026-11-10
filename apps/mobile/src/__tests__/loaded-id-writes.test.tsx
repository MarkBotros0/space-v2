/** A write hook held before its record loaded refuses instead of calling `/.../0/...` (refactor FE-018). */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));

import { apiClient } from "../lib/api-client";
import { useEndSeason } from "../hooks/use-season-end";
import { useStartSeason } from "../hooks/use-season-start";
import { useRemoveSeasonPerson } from "../hooks/use-season-people";
import { loadedId } from "../lib/loaded-id";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => jest.clearAllMocks());

describe("write hooks before their id has loaded", () => {
  it("loadedId passes an id through and refuses null", () => {
    expect(loadedId(7)).toBe(7);
    expect(() => loadedId(null)).toThrow("This record hasn't loaded yet.");
  });

  it("start, end and remove fail without a request", async () => {
    const start = renderHook(() => useStartSeason(null), { wrapper }).result;
    const end = renderHook(() => useEndSeason(null), { wrapper }).result;
    const remove = renderHook(() => useRemoveSeasonPerson(null), { wrapper }).result;
    act(() => {
      start.current.mutate(undefined);
      end.current.mutate({ notPassed: [], reviewed: { graduatesOnPass: false, studentUserIds: [] } } as never);
      remove.current.mutate({ userId: 3 });
    });
    await waitFor(() => expect(start.current.isError && end.current.isError && remove.current.isError).toBe(true));
    expect(apiClient.post).not.toHaveBeenCalled();
    expect(apiClient.delete).not.toHaveBeenCalled();
  });

  it("still sends to the loaded id", async () => {
    (apiClient.delete as jest.Mock).mockResolvedValue({ data: { data: null } });
    const remove = renderHook(() => useRemoveSeasonPerson(7), { wrapper }).result;
    act(() => remove.current.mutate({ userId: 3 }));
    await waitFor(() => expect(remove.current.isSuccess).toBe(true));
    expect(apiClient.delete).toHaveBeenCalledWith("/api/v1/seasons/7/enrollments/3");
  });
});
