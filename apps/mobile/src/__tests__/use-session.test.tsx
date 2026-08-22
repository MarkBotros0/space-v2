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
}));
jest.mock("../lib/token-storage", () => ({
  loadAccessToken: jest.fn(),
  clearSession: jest.fn(),
}));

import { apiClient, login } from "../lib/api-client";
import { loadAccessToken, clearSession } from "../lib/token-storage";
import { useSessionStore } from "../store/session";
import { useBootSession, useLogin, useLogout } from "../hooks/use-session";

const get = apiClient.get as jest.Mock;
const mockLogin = login as jest.Mock;
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

  it("clears stored tokens when /me rejects", async () => {
    mockLoadAccessToken.mockResolvedValue("stale");
    get.mockRejectedValue(new Error("401"));
    renderHook(() => useBootSession());
    await waitFor(() => expect(useSessionStore.getState().status).toBe("anonymous"));
    expect(mockClearSession).toHaveBeenCalled();
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

  it("does not re-run once a status has been settled", async () => {
    // Guards on status === "idle"; a second mount (e.g. StrictMode's double
    // effect, or a parent re-render) must not fire a second /me call.
    mockLoadAccessToken.mockResolvedValue("tok");
    get.mockResolvedValue({ data: { data: me } });
    const { rerender } = renderHook(() => useBootSession());
    await waitFor(() => expect(useSessionStore.getState().status).toBe("authenticated"));
    rerender({});
    expect(get).toHaveBeenCalledTimes(1);
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

  it("propagates a login failure without touching the store", async () => {
    mockLogin.mockRejectedValue(new Error("invalid_credentials"));

    const { result } = renderHook(() => useLogin());
    await expect(result.current("a@b.test", "wrong")).rejects.toThrow();

    expect(get).not.toHaveBeenCalled();
    expect(useSessionStore.getState().status).toBe("idle");
  });
});

describe("useLogout", () => {
  it("clears stored tokens and resets the store", async () => {
    useSessionStore.getState().setSession(me.user, me.scopes);

    const { result } = renderHook(() => useLogout());
    await result.current();

    expect(mockClearSession).toHaveBeenCalled();
    expect(useSessionStore.getState().status).toBe("anonymous");
    expect(useSessionStore.getState().user).toBeNull();
    expect(useSessionStore.getState().scopes).toBeNull();
  });
});
