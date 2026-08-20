import { refreshAccessToken, __resetRefreshState } from "../lib/api-client";

jest.mock("../lib/token-storage", () => ({
  loadAccessToken: jest.fn(async () => "old-access"),
  loadRefreshToken: jest.fn(async () => "old-refresh"),
  saveSession: jest.fn(async () => undefined),
  clearSession: jest.fn(async () => undefined),
}));

describe("refreshAccessToken", () => {
  beforeEach(() => {
    __resetRefreshState();
  });

  it("issues only one refresh for concurrent callers", async () => {
    let calls = 0;
    const rotate = jest.fn(async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 10));
      return { accessToken: "new-access", expiresIn: 900, refreshToken: "new-refresh" };
    });

    const results = await Promise.all([
      refreshAccessToken(rotate),
      refreshAccessToken(rotate),
      refreshAccessToken(rotate),
    ]);

    expect(calls).toBe(1);
    expect(results).toEqual(["new-access", "new-access", "new-access"]);
  });

  it("returns null and clears the session when rotation fails", async () => {
    const rotate = jest.fn(async () => null);
    await expect(refreshAccessToken(rotate)).resolves.toBeNull();
  });
});
