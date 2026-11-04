import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react-native";
import type { ReactNode } from "react";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
}));

import { useSaveAttendance } from "../hooks/use-attendance";
import { apiClient } from "../lib/api-client";
import { queryKeys } from "../lib/query-keys";

const post = apiClient.post as jest.Mock;

it("an attendance save refreshes the roster, sessions, student details and engagement", async () => {
  post.mockResolvedValue({ data: { data: { saved: 1 } } });
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false, gcTime: Infinity } } });
  const spy = jest.spyOn(client, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  const { result } = renderHook(() => useSaveAttendance(5), { wrapper });
  await act(() => result.current.mutateAsync([{ studentUserId: 9, status: "PRESENT", notes: null }]));

  const invalidated = spy.mock.calls.map((c) => c[0]?.queryKey);
  expect(invalidated).toEqual(
    expect.arrayContaining([
      queryKeys.attendance.roster(5),
      queryKeys.sessions.all,
      // students.details() is the prefix of both students.detail(id) and
      // students.attendance(id).
      queryKeys.students.details(),
      queryKeys.engagement.all,
    ]),
  );
});
