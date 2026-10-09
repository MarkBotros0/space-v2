import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react-native";
import type { ReactNode } from "react";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
}));

import { useGroupImportCommit, useStudentImportCommit } from "../hooks/use-import";
import { apiClient } from "../lib/api-client";
import { queryKeys } from "../lib/query-keys";

const post = apiClient.post as jest.Mock;

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const spy = jest.spyOn(client, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const invalidated = () => spy.mock.calls.map((c) => c[0]?.queryKey);
  return { wrapper, invalidated };
}

beforeEach(() => jest.clearAllMocks());

describe("import commit invalidation", () => {
  it("a student import commit refreshes users, students and group rosters", async () => {
    post.mockResolvedValue({ data: { data: { created: 1, skipped: 0, failed: 0, rows: [] } } });
    const { wrapper, invalidated } = setup();
    const { result } = renderHook(() => useStudentImportCommit(), { wrapper });
    await act(() => result.current.mutateAsync({} as never));
    expect(invalidated()).toEqual(
      expect.arrayContaining([queryKeys.users.all, queryKeys.students.all, queryKeys.groups.all]),
    );
  });

  it("a group import commit refreshes the group and roster lists", async () => {
    post.mockResolvedValue({ data: { data: { assigned: 1, skipped: 0, skippedStudentIds: [] } } });
    const { wrapper, invalidated } = setup();
    const { result } = renderHook(() => useGroupImportCommit(7), { wrapper });
    await act(() => result.current.mutateAsync({} as never));
    expect(invalidated()).toEqual(expect.arrayContaining([queryKeys.groups.all, queryKeys.students.all]));
  });

  it("does not invalidate when the commit fails", async () => {
    post.mockRejectedValue(new Error("boom"));
    const { wrapper, invalidated } = setup();
    const { result } = renderHook(() => useStudentImportCommit(), { wrapper });
    await act(() => result.current.mutateAsync({} as never).catch(() => undefined));
    expect(invalidated()).toEqual([]);
  });
});
