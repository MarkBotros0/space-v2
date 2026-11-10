// Cold start through the real api-client: /me says the token is stale and refresh
// can't answer. Only a refresh the server actually rejected may end the session;
// a kickoff on one Wi-Fi network hitting the per-IP limit must not sign anyone out.
import axios, { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from "axios";
import { fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/token-storage", () => ({
  loadAccessToken: jest.fn(async () => "stale-access"),
  loadRefreshToken: jest.fn(async () => "refresh"),
  saveSession: jest.fn(async () => undefined),
  clearSession: jest.fn(async () => undefined),
  loadPushToken: jest.fn(async () => null),
}));
jest.mock("../lib/push", () => ({
  syncPushRegistration: jest.fn(async () => undefined),
  unregisterPushToken: jest.fn(async () => undefined),
}));

import { useBootSession } from "../hooks/use-session";
import { apiClient, __resetRefreshState } from "../lib/api-client";
import { clearSession } from "../lib/token-storage";
import { BootRetry } from "../screens/shell/boot-retry";
import { useSessionStore } from "../store/session";

const answer = (status: number, config: InternalAxiosRequestConfig, data: unknown = {}) =>
  new AxiosError(`status ${status}`, "ERR", config, null, {
    status,
    data,
    statusText: "",
    headers: {},
    config,
  } as AxiosResponse);

let axiosPost: jest.SpyInstance;
const originalAdapter = apiClient.defaults.adapter;

/** Answer /me with `meStatus` and the refresh endpoint with `refreshStatus`. */
function serve(meStatus: number, refreshStatus: number) {
  apiClient.defaults.adapter = async (config) => {
    throw answer(meStatus, config);
  };
  axiosPost.mockRejectedValue(
    Object.assign(new Error("refresh"), { isAxiosError: true, response: { status: refreshStatus } }),
  );
}
const boot = () => renderHook(() => useBootSession());

beforeEach(() => {
  jest.clearAllMocks();
  __resetRefreshState();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  axiosPost = jest.spyOn(axios, "post");
});
afterEach(() => {
  axiosPost.mockRestore();
  apiClient.defaults.adapter = originalAdapter;
});

describe("cold start", () => {
  it.each([429, 500])("/me 401 and refresh %i keeps the tokens and offers a retry", async (status) => {
    serve(401, status);
    boot();
    await waitFor(() => expect(useSessionStore.getState().status).toBe("retry"));
    expect(clearSession).not.toHaveBeenCalled();
    expect(axiosPost.mock.calls.map((c) => c[0])).toEqual([expect.stringContaining("/auth/refresh")]);
  });

  it("/me 429 keeps the tokens and offers a retry, without trying to refresh", async () => {
    serve(429, 200);
    boot();
    await waitFor(() => expect(useSessionStore.getState().status).toBe("retry"));
    expect(clearSession).not.toHaveBeenCalled();
    expect(axiosPost).not.toHaveBeenCalled();
  });

  it("/me 401 and refresh 401 still ends the session", async () => {
    serve(401, 401);
    boot();
    await waitFor(() => expect(useSessionStore.getState().status).toBe("anonymous"));
    expect(clearSession).toHaveBeenCalled();
  });

  it("/me 403 still ends the session", async () => {
    serve(403, 200);
    boot();
    await waitFor(() => expect(useSessionStore.getState().status).toBe("anonymous"));
    expect(clearSession).toHaveBeenCalled();
  });
});

describe("BootRetry", () => {
  it("runs the boot again, and a dead refresh then lands on sign-in", async () => {
    serve(401, 429);
    useSessionStore.setState({ status: "retry" });
    render(<BootRetry />);
    fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(axiosPost).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(useSessionStore.getState().status).toBe("retry"));

    serve(401, 401);
    __resetRefreshState();
    fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(useSessionStore.getState().status).toBe("anonymous"));
  });
});
