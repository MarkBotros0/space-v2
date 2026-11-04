const mockGetPermissions = jest.fn();
const mockRequestPermissions = jest.fn();
const mockGetToken = jest.fn();
const mockEasProjectId = jest.fn();
const mockPost = jest.fn();
const mockDelete = jest.fn();
const mockSavePushToken = jest.fn();
const mockLoadPushToken = jest.fn();

jest.mock("expo-notifications", () => ({
  getPermissionsAsync: (...a: unknown[]) => mockGetPermissions(...a),
  requestPermissionsAsync: (...a: unknown[]) => mockRequestPermissions(...a),
  getExpoPushTokenAsync: (...a: unknown[]) => mockGetToken(...a),
}));
jest.mock("../lib/app-config", () => ({ easProjectId: () => mockEasProjectId() }));
jest.mock("../lib/api-client", () => ({
  apiClient: { post: (...a: unknown[]) => mockPost(...a), delete: (...a: unknown[]) => mockDelete(...a) },
}));
jest.mock("../lib/token-storage", () => ({
  savePushToken: (...a: unknown[]) => mockSavePushToken(...a),
  loadPushToken: () => mockLoadPushToken(),
}));

import { syncPushRegistration, unregisterPushToken } from "../lib/push";
import { useSessionStore } from "../store/session";

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  mockEasProjectId.mockReturnValue("project-1");
  mockGetToken.mockResolvedValue({ data: "ExponentPushToken[x]" });
  mockPost.mockResolvedValue({});
  mockDelete.mockResolvedValue({});
});

describe("syncPushRegistration", () => {
  it("re-registers silently when permission was already granted", async () => {
    mockGetPermissions.mockResolvedValue({ status: "granted" });
    await syncPushRegistration();
    expect(mockRequestPermissions).not.toHaveBeenCalled();
    expect(mockPost).toHaveBeenCalledWith("/api/v1/me/devices", expect.objectContaining({ token: "ExponentPushToken[x]" }));
    expect(useSessionStore.getState().pushToken).toBe("ExponentPushToken[x]");
  });

  it("never prompts and does nothing without permission", async () => {
    mockGetPermissions.mockResolvedValue({ status: "undetermined" });
    await syncPushRegistration();
    expect(mockRequestPermissions).not.toHaveBeenCalled();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("swallows failures so sign-in is never disturbed", async () => {
    mockGetPermissions.mockRejectedValue(new Error("native module missing"));
    await expect(syncPushRegistration()).resolves.toBeUndefined();
  });
});

describe("unregisterPushToken", () => {
  it("deletes this phone's token with the token in the body", async () => {
    mockLoadPushToken.mockResolvedValue("ExponentPushToken[x]");
    await unregisterPushToken();
    expect(mockDelete).toHaveBeenCalledWith("/api/v1/me/devices", { data: { token: "ExponentPushToken[x]" } });
  });

  it("does nothing without a stored token, and never throws", async () => {
    mockLoadPushToken.mockResolvedValue(null);
    await unregisterPushToken();
    expect(mockDelete).not.toHaveBeenCalled();

    mockLoadPushToken.mockResolvedValue("t");
    mockDelete.mockRejectedValue(new Error("Network Error"));
    await expect(unregisterPushToken()).resolves.toBeUndefined();
  });
});
