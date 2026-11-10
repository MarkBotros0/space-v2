// The way out of BootRetry: a refresh that keeps failing (a 500 tied to one
// user's data, a response this build can't parse) must not trap anyone, and the
// iOS keychain survives a reinstall. Real token storage over an in-memory
// SecureStore, so "tokens gone" means gone.
import axios from "axios";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockStore = new Map<string, string>();
const mockDelete = jest.fn(async (key: string) => {
  mockStore.delete(key);
});
jest.mock("expo-secure-store", () => ({
  getItemAsync: async (key: string) => mockStore.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    mockStore.set(key, value);
  },
  deleteItemAsync: (key: string) => mockDelete(key),
}));
jest.mock("../lib/push", () => ({
  syncPushRegistration: jest.fn(async () => undefined),
  unregisterPushToken: jest.fn(async () => undefined),
}));

import { apiClient } from "../lib/api-client";
import { loadAccessToken, loadRefreshToken, savePushToken, saveSession } from "../lib/token-storage";
import { BootRetry } from "../screens/shell/boot-retry";
import { useSessionStore } from "../store/session";

let axiosPost: jest.SpyInstance;
const originalAdapter = apiClient.defaults.adapter;
const signOut = () => fireEvent.press(screen.getByRole("button", { name: "Sign out" }));

beforeEach(async () => {
  jest.clearAllMocks();
  mockStore.clear();
  mockDelete.mockImplementation(async (key: string) => {
    mockStore.delete(key);
  });
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState({ status: "retry" });
  await saveSession({ accessToken: "access", refreshToken: "refresh" } as Parameters<typeof saveSession>[0]);
  await savePushToken("push");
  axiosPost = jest.spyOn(axios, "post");
  // Nothing reaches a server here, however it is called.
  apiClient.defaults.adapter = async () => {
    throw new Error("Network Error");
  };
});
afterEach(() => {
  axiosPost.mockRestore();
  apiClient.defaults.adapter = originalAdapter;
  jest.useRealTimers();
});

it("offers Sign out under Try again", () => {
  render(<BootRetry />);
  expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
});

it("with a failing network, lands on anonymous with the tokens gone", async () => {
  axiosPost.mockRejectedValue(new Error("Network Error"));
  render(<BootRetry />);
  signOut();
  await waitFor(() => expect(useSessionStore.getState().status).toBe("anonymous"));
  expect(await loadAccessToken()).toBeNull();
  expect(await loadRefreshToken()).toBeNull();
  // It tried to stop pushes first, with the token still readable.
  expect(axiosPost.mock.calls[0]?.[0]).toEqual(expect.stringContaining("/devices/unregister"));
  expect(axiosPost.mock.calls[0]?.[1]).toEqual({ token: "push" });
});

it("doesn't wait on a network that never answers", async () => {
  jest.useFakeTimers();
  axiosPost.mockReturnValue(new Promise(() => undefined));
  render(<BootRetry />);
  signOut();
  await act(async () => {
    await jest.advanceTimersByTimeAsync(6000);
  });
  expect(useSessionStore.getState().status).toBe("anonymous");
  expect(await loadAccessToken()).toBeNull();
});

it("still lands on anonymous when the keychain refuses to delete", async () => {
  axiosPost.mockRejectedValue(new Error("Network Error"));
  mockDelete.mockRejectedValue(new Error("keychain locked"));
  render(<BootRetry />);
  signOut();
  await waitFor(() => expect(useSessionStore.getState().status).toBe("anonymous"));
});

it("can't be retried while signing out", async () => {
  axiosPost.mockReturnValue(new Promise(() => undefined));
  const get = jest.spyOn(apiClient, "get");
  render(<BootRetry />);
  signOut();
  fireEvent.press(screen.getByRole("button", { name: "Try again" }));
  expect(useSessionStore.getState().status).toBe("retry");
  expect(get).not.toHaveBeenCalled();
  get.mockRestore();
});
