import { DASHBOARD_META } from "../lib/dashboard-invalidation";
import { clearCacheOnUserChange, createQueryClient } from "../lib/query-client";
import { useSessionStore } from "../store/session";
import { queryKeys } from "../lib/query-keys";

describe("createQueryClient", () => {
  it("retries a failed query exactly once", () => {
    const client = createQueryClient();
    expect(client.getDefaultOptions().queries?.retry).toBe(1);
  });

  it("treats data as fresh for 30 seconds", () => {
    const client = createQueryClient();
    expect(client.getDefaultOptions().queries?.staleTime).toBe(30_000);
  });

  it("does not refetch on window focus — meaningless on mobile", () => {
    const client = createQueryClient();
    expect(client.getDefaultOptions().queries?.refetchOnWindowFocus).toBe(false);
  });
});

describe("dashboard invalidation (spec 19 §7, D24)", () => {
  it("invalidates every dashboard query after a mutation tagged DASHBOARD_META, and only then", async () => {
    const client = createQueryClient();
    const key = queryKeys.dashboard.me(7);
    client.setQueryData(key, { stub: true });

    await client.getMutationCache().build(client, { mutationFn: async () => "ok" }).execute(undefined);
    expect(client.getQueryState(key)?.isInvalidated).toBe(false);

    await client
      .getMutationCache()
      .build(client, { mutationFn: async () => "ok", meta: DASHBOARD_META })
      .execute(undefined);
    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  });
});

describe("clearCacheOnUserChange", () => {
  const user = (id: number) => ({ id }) as never;
  const scopes = {} as never;
  afterEach(() => useSessionStore.getState().clear());

  it("drops cached data on sign-out and when another user signs in, not on first sign-in", () => {
    const client = createQueryClient();
    useSessionStore.getState().clear();
    const stop = clearCacheOnUserChange(client);
    const key = queryKeys.notifications.lists();

    client.setQueryData(key, ["boot"]);
    useSessionStore.getState().setSession(user(1), scopes);
    expect(client.getQueryData(key)).toEqual(["boot"]);

    client.setQueryData(key, ["user 1"]);
    useSessionStore.getState().setSession(user(2), scopes);
    expect(client.getQueryData(key)).toBeUndefined();

    client.setQueryData(key, ["user 2"]);
    useSessionStore.getState().clear();
    expect(client.getQueryData(key)).toBeUndefined();
    stop();
  });
});
