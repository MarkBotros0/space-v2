import { DASHBOARD_META } from "../lib/dashboard-invalidation";
import { createQueryClient } from "../lib/query-client";
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
