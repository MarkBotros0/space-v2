import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

jest.mock("../lib/api-client", () => ({ apiClient: { patch: jest.fn() } }));

import { apiClient } from "../lib/api-client";
import { useUpdateProfile } from "../hooks/use-me";
import { useSessionStore } from "../store/session";
import { makeScopes, makeUser } from "./helpers/session";

const patch = apiClient.patch as jest.Mock;

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.getState().setSession(makeUser("LEADER"), makeScopes());
});

describe("useUpdateProfile (PATCH /me)", () => {
  it("sends only the keys given and folds the returned contact fields into the session", async () => {
    const returned = {
      ...makeUser("LEADER"),
      phone: "+20 122",
      dateOfBirth: "1999-12-31",
      address: "1 Nile St, Cairo",
    };
    patch.mockResolvedValue({ data: { data: { user: returned } } });
    const { result } = renderHook(() => useUpdateProfile(), { wrapper: makeWrapper() });

    act(() => {
      result.current.mutate({ phone: "+20 122", dateOfBirth: "1999-12-31", address: "1 Nile St, Cairo" });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(patch).toHaveBeenCalledWith("/api/v1/me", {
      phone: "+20 122",
      dateOfBirth: "1999-12-31",
      address: "1 Nile St, Cairo",
    });
    expect(useSessionStore.getState().user).toMatchObject({
      phone: "+20 122",
      dateOfBirth: "1999-12-31",
      address: "1 Nile St, Cairo",
    });
  });

  it("still takes a name on its own (the settings screen's call)", async () => {
    patch.mockResolvedValue({ data: { data: { user: makeUser("LEADER", { name: "New Name" }) } } });
    const { result } = renderHook(() => useUpdateProfile(), { wrapper: makeWrapper() });
    act(() => result.current.mutate({ name: "New Name" }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(patch).toHaveBeenCalledWith("/api/v1/me", { name: "New Name" });
    expect(useSessionStore.getState().user?.name).toBe("New Name");
  });
});
