import { createQueryClient } from "../lib/query-client";

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
