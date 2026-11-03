const mockStore = new Map<string, string>();
const mockSet = jest.fn(async (k: string, v: string) => void mockStore.set(k, v));
const mockGet = jest.fn(async (k: string) => mockStore.get(k) ?? null);
const mockDelete = jest.fn(async (k: string) => void mockStore.delete(k));
jest.mock("expo-secure-store", () => ({
  setItemAsync: (k: string, v: string) => mockSet(k, v),
  getItemAsync: (k: string) => mockGet(k),
  deleteItemAsync: (k: string) => mockDelete(k),
}));

import {
  clearSession,
  loadAccessToken,
  loadPushToken,
  loadRefreshToken,
  savePushToken,
  saveSession,
} from "../lib/token-storage";

beforeEach(() => {
  mockStore.clear();
  jest.clearAllMocks();
});

describe("token-storage", () => {
  it("returns null before anything is saved", async () => {
    await expect(loadAccessToken()).resolves.toBeNull();
    await expect(loadRefreshToken()).resolves.toBeNull();
    await expect(loadPushToken()).resolves.toBeNull();
  });

  it("round-trips the access and refresh tokens under separate keys", async () => {
    await saveSession({ accessToken: "acc", refreshToken: "ref", expiresIn: 900 });
    await expect(loadAccessToken()).resolves.toBe("acc");
    await expect(loadRefreshToken()).resolves.toBe("ref");
    expect(new Set(mockStore.keys()).size).toBe(2);
  });

  it("stores the push token independently of the session", async () => {
    await savePushToken("ExponentPushToken[fake]");
    await expect(loadPushToken()).resolves.toBe("ExponentPushToken[fake]");
    await expect(loadAccessToken()).resolves.toBeNull();
  });

  it("clearSession removes all three tokens", async () => {
    await saveSession({ accessToken: "acc", refreshToken: "ref", expiresIn: 900 });
    await savePushToken("push");
    await clearSession();
    expect(mockStore.size).toBe(0);
    expect(mockDelete).toHaveBeenCalledTimes(3);
  });
});
