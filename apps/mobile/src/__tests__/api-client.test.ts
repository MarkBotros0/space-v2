import {
  refreshAccessToken,
  __resetRefreshState,
  __handleResponseError,
  ROTATE_INDETERMINATE,
} from "../lib/api-client";
import { clearSession } from "../lib/token-storage";

jest.mock("../lib/token-storage", () => ({
  loadAccessToken: jest.fn(async () => "old-access"),
  loadRefreshToken: jest.fn(async () => "old-refresh"),
  saveSession: jest.fn(async () => undefined),
  clearSession: jest.fn(async () => undefined),
}));

describe("refreshAccessToken", () => {
  beforeEach(() => {
    __resetRefreshState();
    jest.clearAllMocks();
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
    expect(clearSession).toHaveBeenCalledTimes(1);
  });

  it("returns null but leaves storage intact on a transport failure during rotation", async () => {
    const rotate = jest.fn(async (): Promise<typeof ROTATE_INDETERMINATE> => ROTATE_INDETERMINATE);
    await expect(refreshAccessToken(rotate)).resolves.toBeNull();
    expect(clearSession).not.toHaveBeenCalled();
  });
});

describe("response interceptor", () => {
  beforeEach(() => {
    __resetRefreshState();
    jest.clearAllMocks();
  });

  it("does not attempt a refresh rotation for a 401 from /auth/login itself", async () => {
    const error = {
      isAxiosError: true,
      response: { status: 401 },
      config: { url: "/api/v1/auth/login" },
    };

    await expect(__handleResponseError(error)).rejects.toBe(error);

    const { loadRefreshToken } = jest.requireMock("../lib/token-storage") as {
      loadRefreshToken: jest.Mock;
    };
    expect(loadRefreshToken).not.toHaveBeenCalled();
  });

  it("does not attempt a refresh rotation for a 401 from /auth/refresh itself", async () => {
    const error = {
      isAxiosError: true,
      response: { status: 401 },
      config: { url: "http://localhost:4000/api/v1/auth/refresh" },
    };

    await expect(__handleResponseError(error)).rejects.toBe(error);

    const { loadRefreshToken } = jest.requireMock("../lib/token-storage") as {
      loadRefreshToken: jest.Mock;
    };
    expect(loadRefreshToken).not.toHaveBeenCalled();
  });
});
