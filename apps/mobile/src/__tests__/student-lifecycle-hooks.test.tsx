import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

jest.mock("../lib/api-client", () => ({
  apiClient: { post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));

import { apiClient } from "../lib/api-client";
import {
  useCreateStudent,
  useDeleteStudent,
  useDropEnrollment,
  useGraduateStudent,
  useUpdateStudent,
} from "../hooks/use-students";

const post = apiClient.post as jest.Mock;
const patch = apiClient.patch as jest.Mock;
const del = apiClient.delete as jest.Mock;

// One client for the file: a client built inside `wrapper` would be replaced on
// every re-render, resetting the mutation observer and losing `data`.
const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => jest.clearAllMocks());

describe("student lifecycle mutations (ruling X10 — parsed, never cast)", () => {
  it("useGraduateStudent posts the year and parses the response", async () => {
    post.mockResolvedValue({ data: { data: { id: 21, graduationYear: 2020, enrollmentsCompleted: 2 } } });
    const { result } = renderHook(() => useGraduateStudent(), { wrapper });
    await act(() => result.current.mutateAsync({ id: 21, graduationYear: 2020 }));
    expect(post).toHaveBeenCalledWith("/api/v1/students/21/graduate", { graduationYear: 2020 });
    await waitFor(() => expect(result.current.data?.enrollmentsCompleted).toBe(2));
  });

  it("useGraduateStudent fails loudly on a drifted response", async () => {
    post.mockResolvedValue({ data: { data: { id: 21 } } });
    const { result } = renderHook(() => useGraduateStudent(), { wrapper });
    act(() => result.current.mutate({ id: 21, graduationYear: 2020 }));
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("useDeleteStudent, useDropEnrollment, useCreateStudent and useUpdateStudent hit Plan 7/17's routes", async () => {
    del.mockResolvedValue({ data: { data: { id: 21, deletedAt: "2099-01-01T00:00:00.000Z" } } });
    patch.mockResolvedValueOnce({ data: { data: { id: 507, status: "WITHDRAWN" } } });
    patch.mockResolvedValueOnce({ data: { data: { id: 21 } } });
    post.mockResolvedValue({ data: { data: { id: 22, email: "n@jpc.test" } } });

    const remove = renderHook(() => useDeleteStudent(), { wrapper }).result;
    await act(() => remove.current.mutateAsync({ id: 21 }));
    expect(del).toHaveBeenCalledWith("/api/v1/students/21");

    const drop = renderHook(() => useDropEnrollment(), { wrapper }).result;
    await act(() => drop.current.mutateAsync({ studentId: 21, seasonId: 7, dropReason: "Moved away" }));
    expect(patch).toHaveBeenCalledWith("/api/v1/students/21/enrollments/7", {
      status: "WITHDRAWN",
      dropReason: "Moved away",
    });

    const update = renderHook(() => useUpdateStudent(), { wrapper }).result;
    await act(() => update.current.mutateAsync({ id: 21, body: { phone: null } }));
    expect(patch).toHaveBeenLastCalledWith("/api/v1/students/21", { phone: null });

    const create = renderHook(() => useCreateStudent(), { wrapper }).result;
    await act(() => create.current.mutateAsync({ name: "New Student", email: "n@jpc.test" }));
    expect(post).toHaveBeenCalledWith("/api/v1/students", { name: "New Student", email: "n@jpc.test" });
  });
});
