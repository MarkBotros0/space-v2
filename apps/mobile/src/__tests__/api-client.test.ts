import axios from "axios";

import {
  apiClient,
  refreshAccessToken,
  __resetRefreshState,
  __handleResponseError,
  login,
  logout,
  ROTATE_INDETERMINATE,
} from "../lib/api-client";
import { saveSession, clearSession } from "../lib/token-storage";
import { useSessionStore } from "../store/session";

jest.mock("../lib/token-storage", () => ({
  loadAccessToken: jest.fn(async () => "old-access"),
  loadRefreshToken: jest.fn(async () => "old-refresh"),
  saveSession: jest.fn(async () => undefined),
  clearSession: jest.fn(async () => undefined),
}));

const user = { id: 1, name: "A", email: "a@b.test", role: "STUDENT" as const, avatarPath: null };
const scopes = {
  seasonAdminIds: [],
  groupLeaderIds: [],
  activeSeasonId: null,
  graduationYear: null as number | null,
};

beforeEach(() => {
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

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

  // Fix 2: a definitive rejection from the refresh endpoint must also wedge
  // the session store to "anonymous" — otherwise the store keeps saying
  // "authenticated" while every subsequent authenticated request fails
  // forever, with no recovery short of force-quitting the app (tokens are
  // already gone from SecureStore by this point).
  it("flips the session store to anonymous on a definitive rejection", async () => {
    useSessionStore.getState().setSession(user, scopes);
    const rotate = jest.fn(async () => null);

    await refreshAccessToken(rotate);

    expect(useSessionStore.getState().status).toBe("anonymous");
    expect(useSessionStore.getState().user).toBeNull();
  });

  // ...but a mere blip (network error, timeout, 5xx) must NOT sign the user
  // out from under them — only a definitive rejection proves the refresh
  // token is actually dead. Same ROTATE_INDETERMINATE distinction the
  // module already enforces for SecureStore above, now also for the store.
  it("does not touch the session store on an indeterminate rotation failure", async () => {
    useSessionStore.getState().setSession(user, scopes);
    const rotate = jest.fn(async (): Promise<typeof ROTATE_INDETERMINATE> => ROTATE_INDETERMINATE);

    await refreshAccessToken(rotate);

    expect(useSessionStore.getState().status).toBe("authenticated");
    expect(useSessionStore.getState().user).toEqual(user);
  });
});

describe("login", () => {
  beforeEach(() => {
    __resetRefreshState();
    jest.clearAllMocks();
  });

  it("persists the returned tokens via saveSession (R4)", async () => {
    // Task 5 removed the store write from the login screen — since then
    // this internal call is the *only* thing that persists tokens from the
    // login path. Nothing was asserting it before this test.
    const loginResponse = {
      accessToken: "access-1",
      expiresIn: 900,
      refreshToken: "refresh-1",
      user: { id: 1, name: "Sara", email: "sara@jpc.test", role: "STUDENT" },
    };
    jest.spyOn(apiClient, "post").mockResolvedValue({ data: { data: loginResponse } });

    const result = await login("sara@jpc.test", "hunter2");

    expect(saveSession).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "access-1",
        expiresIn: 900,
        refreshToken: "refresh-1",
      }),
    );
    expect(result).toEqual(loginResponse);
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

// Fix 1: sign-out was cosmetic — `useLogout` only touched SecureStore, never
// the server, so a revoked-locally refresh token stayed valid in the
// database for its full 30-day TTL. `logout()` is the network half of the
// fix; `useLogout` (see use-session.test.tsx) wires it up as best-effort.
describe("logout", () => {
  beforeEach(() => {
    __resetRefreshState();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("posts the stored refresh token to /api/v1/auth/logout", async () => {
    const postSpy = jest.spyOn(axios, "post").mockResolvedValue({ data: { data: { ok: true } } });

    await logout();

    expect(postSpy).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/auth/logout"),
      { refreshToken: "old-refresh" },
    );
  });

  it("does nothing when there is no stored refresh token", async () => {
    const { loadRefreshToken } = jest.requireMock("../lib/token-storage") as {
      loadRefreshToken: jest.Mock;
    };
    loadRefreshToken.mockResolvedValueOnce(null);
    const postSpy = jest.spyOn(axios, "post").mockResolvedValue({ data: { data: { ok: true } } });

    await logout();

    expect(postSpy).not.toHaveBeenCalled();
  });

  it("propagates a network failure rather than swallowing it", async () => {
    // logout() itself must not catch — see the doc comment on the function.
    // useLogout is the layer responsible for treating this as best-effort.
    jest.spyOn(axios, "post").mockRejectedValue(new Error("Network Error"));

    await expect(logout()).rejects.toThrow("Network Error");
  });
});
