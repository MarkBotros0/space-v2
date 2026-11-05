const mockGetPermissions = jest.fn();
const mockRequestPermissions = jest.fn();
const mockGetToken = jest.fn();
const mockEasProjectId = jest.fn();
const mockPost = jest.fn();
const mockForgetDevice = jest.fn(async () => undefined);
const mockSavePushToken = jest.fn();

jest.mock("expo-notifications", () => ({
  getPermissionsAsync: (...a: unknown[]) => mockGetPermissions(...a),
  requestPermissionsAsync: (...a: unknown[]) => mockRequestPermissions(...a),
  getExpoPushTokenAsync: (...a: unknown[]) => mockGetToken(...a),
}));
jest.mock("../lib/app-config", () => ({ easProjectId: () => mockEasProjectId() }));
jest.mock("../lib/api-client", () => ({
  apiClient: { post: (...a: unknown[]) => mockPost(...a) },
  forgetDevice: () => mockForgetDevice(),
}));
jest.mock("../lib/token-storage", () => ({
  savePushToken: (...a: unknown[]) => mockSavePushToken(...a),
}));

import { syncPushRegistration, unregisterPushToken } from "../lib/push";
import { useSessionStore } from "../store/session";

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  mockEasProjectId.mockReturnValue("project-1");
  mockGetToken.mockResolvedValue({ data: "ExponentPushToken[x]" });
  mockPost.mockResolvedValue({});
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
  it("forgets this device through the sign-in-free endpoint", async () => {
    await unregisterPushToken();
    expect(mockForgetDevice).toHaveBeenCalledTimes(1);
  });
});
