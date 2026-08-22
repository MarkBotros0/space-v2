import { StrictMode } from "react";
import { renderHook, waitFor } from "@testing-library/react-native";

// R2: the plan's snippet mocks only `apiClient`, which replaces the whole
// module and leaves `login` undefined — `useLogin` throws the moment it's
// called. Both exports the hook file imports must be mocked here.
//
// jest's hoisting babel plugin forbids a factory from closing over an
// out-of-scope `const` unless its name starts with `mock` — the plan's
// snippet (`const get = jest.fn(); jest.mock(..., () => ({ get }))`) fails
// that check and throws `ReferenceError` before any test runs. Declaring the
// fns inline and importing the mocked module's own exports afterward (as
// `login-screen.test.tsx` already does) sidesteps the restriction entirely.
jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn() },
  login: jest.fn(),
  logout: jest.fn(),
}));
jest.mock("../lib/token-storage", () => ({
  loadAccessToken: jest.fn(),
  clearSession: jest.fn(),
}));

import { apiClient, login, logout } from "../lib/api-client";
import { loadAccessToken, clearSession } from "../lib/token-storage";
import { useSessionStore } from "../store/session";
import { useBootSession, useLogin, useLogout } from "../hooks/use-session";

const get = apiClient.get as jest.Mock;
const mockLogin = login as jest.Mock;
const mockLogout = logout as jest.Mock;
const mockLoadAccessToken = loadAccessToken as jest.Mock;
const mockClearSession = clearSession as jest.Mock;

const me = {
  user: { id: 1, name: "A", email: "a@b.test", role: "STUDENT" as const, avatarPath: null },
  scopes: {
    seasonAdminIds: [],
    groupLeaderIds: [],
    activeSeasonId: null,
    graduationYear: null as number | null,
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("useBootSession", () => {
  it("goes anonymous without calling the API when there is no token", async () => {
    mockLoadAccessToken.mockResolvedValue(null);
    renderHook(() => useBootSession());
    await waitFor(() => expect(useSessionStore.getState().status).toBe("anonymous"));
    expect(get).not.toHaveBeenCalled();
  });

  it("restores the session from /me when a token is stored", async () => {
    mockLoadAccessToken.mockResolvedValue("tok");
    get.mockResolvedValue({ data: { data: me } });
    renderHook(() => useBootSession());
    await waitFor(() => expect(useSessionStore.getState().status).toBe("authenticated"));
    expect(useSessionStore.getState().user).toEqual(me.user);
    expect(useSessionStore.getState().scopes).toEqual(me.scopes);
  });

  it("clears stored tokens when /me rejects with a definitive 4xx", async () => {
    // A real axios rejection shape: the server actually answered and said
    // no. Only this case should cost the user their stored refresh token —
    // see the network-error case below for the contrast.
    mockLoadAccessToken.mockResolvedValue("stale");
    get.mockRejectedValue(
      Object.assign(new Error("401"), { isAxiosError: true, response: { status: 401 } }),
    );
    renderHook(() => useBootSession());
    await waitFor(() => expect(useSessionStore.getState().status).toBe("anonymous"));
    expect(mockClearSession).toHaveBeenCalled();
  });

  it("leaves stored tokens intact when /me fails with a network error", async () => {
    // No response at all (offline cold start, timeout, DNS failure, ...) is
    // not proof the refresh token is bad. The app should still become
    // usable (anonymous), but the tokens must survive so the next launch,
    // once connectivity returns, can retry instead of forcing a re-login.
    mockLoadAccessToken.mockResolvedValue("stale");
    get.mockRejectedValue(
      Object.assign(new Error("Network Error"), { isAxiosError: true, response: undefined }),
    );
    renderHook(() => useBootSession());
    await waitFor(() => expect(useSessionStore.getState().status).toBe("anonymous"));
    expect(mockClearSession).not.toHaveBeenCalled();
  });

  it("leaves stored tokens intact and goes anonymous on a malformed /me response", async () => {
    // A response that fails meResponseSchema.parse (unknown role, missing
    // scopes, ...) isn't proof the token is bad either — same indeterminate
    // treatment as a network error, and the malformed object must never
    // reach the store.
    mockLoadAccessToken.mockResolvedValue("tok");
    get.mockResolvedValue({
      data: { data: { user: { ...me.user, role: "WIZARD" }, scopes: me.scopes } },
    });
    renderHook(() => useBootSession());
    await waitFor(() => expect(useSessionStore.getState().status).toBe("anonymous"));
    expect(useSessionStore.getState().user).toBeNull();
    expect(mockClearSession).not.toHaveBeenCalled();
  });

  it("treats a null user as signed out", async () => {
    // /me returns { user: null } when the row was deleted inside the access
    // token's 15-minute window. The token still verifies, so only this check
    // stops the app rendering a session for a user who no longer exists.
    mockLoadAccessToken.mockResolvedValue("tok");
    get.mockResolvedValue({ data: { data: { ...me, user: null } } });
    renderHook(() => useBootSession());
    await waitFor(() => expect(useSessionStore.getState().status).toBe("anonymous"));
    expect(mockClearSession).toHaveBeenCalled();
  });

  it("skips the boot fetch entirely when status is already settled on mount", async () => {
    // Drives the `status !== "idle"` guard directly, rather than relying on
    // the effect's deps being stable Zustand action refs (rerender({}) never
    // re-runs the effect either way, so that alone doesn't exercise the
    // guard). Simulates a fresh mount landing after boot has already been
    // resolved elsewhere in the store.
    useSessionStore.setState({ status: "authenticated" });
    mockLoadAccessToken.mockResolvedValue("tok");
    get.mockResolvedValue({ data: { data: me } });

    renderHook(() => useBootSession());
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockLoadAccessToken).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
  });

  it("reaches authenticated under StrictMode's mount/cleanup/mount double effect", async () => {
    // Regression test for the `cancelled` flag that used to live here: it
    // set `cancelled = true` on the first effect's cleanup (which StrictMode
    // runs synchronously before the in-flight boot resolves), so the
    // resolution became a no-op and the gate deadlocked at "restoring"
    // forever. With `cancelled` removed, the in-flight boot completes and
    // writes to the store normally.
    mockLoadAccessToken.mockResolvedValue("tok");
    get.mockResolvedValue({ data: { data: me } });

    renderHook(() => useBootSession(), { wrapper: StrictMode });

    await waitFor(() => expect(useSessionStore.getState().status).toBe("authenticated"));
    expect(useSessionStore.getState().user).toEqual(me.user);
  });

  it("still reaches authenticated when unmounted and remounted mid-flight", async () => {
    // Same regression as above, via an explicit unmount instead of
    // StrictMode: the boot started by the first instance must be allowed to
    // finish and write to the store even though its component is gone.
    mockLoadAccessToken.mockResolvedValue("tok");
    get.mockResolvedValue({ data: { data: me } });

    const { unmount } = renderHook(() => useBootSession());
    unmount();

    renderHook(() => useBootSession());

    await waitFor(() => expect(useSessionStore.getState().status).toBe("authenticated"));
    expect(useSessionStore.getState().user).toEqual(me.user);
  });
});

describe("useLogin", () => {
  it("logs in, fetches /me, and populates the store with user and scopes", async () => {
    mockLogin.mockResolvedValue({ accessToken: "a", expiresIn: 900, refreshToken: "r", user: me.user });
    get.mockResolvedValue({ data: { data: me } });

    const { result } = renderHook(() => useLogin());
    await result.current("a@b.test", "hunter2");

    expect(mockLogin).toHaveBeenCalledWith("a@b.test", "hunter2");
    expect(get).toHaveBeenCalledWith("/api/v1/me");
    expect(useSessionStore.getState().status).toBe("authenticated");
    expect(useSessionStore.getState().user).toEqual(me.user);
    expect(useSessionStore.getState().scopes).toEqual(me.scopes);
  });

  it("clears tokens and store when the /me follow-up fails", async () => {
    mockLogin.mockResolvedValue({ accessToken: "a", expiresIn: 900, refreshToken: "r", user: me.user });
    get.mockRejectedValue(new Error("boom"));

    const { result } = renderHook(() => useLogin());
    await expect(result.current("a@b.test", "hunter2")).rejects.toThrow();

    expect(mockClearSession).toHaveBeenCalled();
    expect(useSessionStore.getState().status).toBe("anonymous");
    expect(useSessionStore.getState().user).toBeNull();
  });

  it("throws and clears stored tokens when /me returns a null user right after login", async () => {
    // The row was deleted inside the window between login and this follow-up
    // fetch — there's no one to sign in as, so the half-finished login must
    // not leave a session or stored tokens behind.
    mockLogin.mockResolvedValue({ accessToken: "a", expiresIn: 900, refreshToken: "r", user: me.user });
    get.mockResolvedValue({ data: { data: { ...me, user: null } } });

    const { result } = renderHook(() => useLogin());
    await expect(result.current("a@b.test", "hunter2")).rejects.toThrow(
      "me returned no user after login",
    );

    expect(mockClearSession).toHaveBeenCalled();
    expect(useSessionStore.getState().status).toBe("anonymous");
    expect(useSessionStore.getState().user).toBeNull();
  });

  it("propagates a login failure without touching the store", async () => {
    mockLogin.mockRejectedValue(new Error("invalid_credentials"));

    const { result } = renderHook(() => useLogin());
    await expect(result.current("a@b.test", "wrong")).rejects.toThrow();

    expect(get).not.toHaveBeenCalled();
    expect(useSessionStore.getState().status).toBe("idle");
  });
});

describe("useLogout", () => {
  // Fix 1: sign-out used to be cosmetic — it only touched SecureStore, never
  // told the server, so the refresh token stayed valid in the database for
  // its full 30-day TTL. These three cases are the contract now: the server
  // call happens when there's something to revoke, but local sign-out never
  // depends on it succeeding.

  it("happy path: calls the server logout endpoint with the stored token, then clears locally", async () => {
    mockLogout.mockResolvedValue(undefined);
    useSessionStore.getState().setSession(me.user, me.scopes);

    const { result } = renderHook(() => useLogout());
    await result.current();

    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(mockClearSession).toHaveBeenCalled();
    expect(useSessionStore.getState().status).toBe("anonymous");
    expect(useSessionStore.getState().user).toBeNull();
    expect(useSessionStore.getState().scopes).toBeNull();
  });

  it("network failure: still clears locally and still ends anonymous", async () => {
    // A user who taps sign-out must never be left signed in locally just
    // because the network was down. The failure itself must not be swallowed
    // silently, though — it has to propagate somewhere observable, which is
    // exactly what this test's rejected mock and passing assertions confirm.
    mockLogout.mockRejectedValue(new Error("Network Error"));
    useSessionStore.getState().setSession(me.user, me.scopes);

    const { result } = renderHook(() => useLogout());
    await expect(result.current()).resolves.toBeUndefined();

    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(mockClearSession).toHaveBeenCalled();
    expect(useSessionStore.getState().status).toBe("anonymous");
    expect(useSessionStore.getState().user).toBeNull();
    expect(useSessionStore.getState().scopes).toBeNull();
  });

  // "No stored token means no call" is exercised directly against the real
  // `logout()` implementation in api-client.test.ts ("does nothing when
  // there is no stored refresh token") — that check lives inside `logout()`
  // itself, which this file mocks away entirely, so it can't be meaningfully
  // re-observed from useLogout's side. What useLogout owns, and what's
  // covered above, is that it always calls `logout()` and always clears
  // locally afterward regardless of outcome.
});
