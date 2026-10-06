import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
}));

import { apiClient } from "../lib/api-client";
import { useForgotPassword, useResetPassword } from "../hooks/use-password-reset";
import { useCreateUser, usePendingInviteCount, useSendPendingInvites } from "../hooks/use-users";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;

// One client for the file: a client built inside `wrapper` would be replaced on
// every re-render, resetting the mutation observer and losing `data`.
const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => jest.clearAllMocks());

describe("account hooks", () => {
  it("usePendingInviteCount reads the count, and fires nothing when disabled", async () => {
    get.mockResolvedValue({ data: { data: { pending: 3 } } });
    const off = renderHook(() => usePendingInviteCount(false), { wrapper });
    expect(off.result.current.fetchStatus).toBe("idle");
    expect(get).not.toHaveBeenCalled();

    const on = renderHook(() => usePendingInviteCount(true), { wrapper });
    await waitFor(() => expect(on.result.current.data).toBe(3));
    expect(get).toHaveBeenCalledWith("/api/v1/users/invites/pending");
  });

  it("useSendPendingInvites posts with a raised timeout and parses four counters", async () => {
    post.mockResolvedValue({ data: { data: { sent: 2, skipped: 0, failed: 1, remaining: 5 } } });
    const { result } = renderHook(() => useSendPendingInvites(), { wrapper });
    await act(() => result.current.mutateAsync());
    expect(post).toHaveBeenCalledWith("/api/v1/users/invites/pending", undefined, { timeout: 60_000 });
    await waitFor(() => expect(result.current.data).toEqual({ sent: 2, skipped: 0, failed: 1, remaining: 5 }));
  });

  it("useCreateUser posts the body and parses { userId }", async () => {
    post.mockResolvedValue({ data: { data: { userId: 40 } } });
    const { result } = renderHook(() => useCreateUser(), { wrapper });
    await act(() =>
      result.current.mutateAsync({ name: "New Person", email: "p@jpc.test", role: "STUDENT", graduationYear: null }),
    );
    await waitFor(() => expect(result.current.data).toEqual({ userId: 40 }));
  });

  it("the reset hooks hit the anonymous endpoints and parse the ack", async () => {
    post.mockResolvedValue({ data: { data: { ok: true } } });
    const forgot = renderHook(() => useForgotPassword(), { wrapper }).result;
    await act(() => forgot.current.mutateAsync({ email: "a@jpc.test" }));
    expect(post).toHaveBeenCalledWith("/api/v1/auth/forgot-password", { email: "a@jpc.test" });

    const reset = renderHook(() => useResetPassword(), { wrapper }).result;
    await act(() => reset.current.mutateAsync({ token: "ab".repeat(32), password: "longenough" }));
    expect(post).toHaveBeenLastCalledWith("/api/v1/auth/reset-password", {
      token: "ab".repeat(32),
      password: "longenough",
    });
  });
});
