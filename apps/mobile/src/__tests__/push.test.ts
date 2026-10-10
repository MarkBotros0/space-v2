// apps/mobile/src/__tests__/push.test.ts
//
// Every jest.mock factory below closes over mock* consts LAZILY — inside an
// arrow that runs at call time. jest.mock is hoisted above these declarations,
// so a factory that read `mockGetPermissions` directly (an earlier draft did:
// `getPermissionsAsync: mockGetPermissions`) would hit the temporal dead zone
// when push.ts is imported.
const mockGetPermissions = jest.fn();
const mockRequestPermissions = jest.fn();
const mockGetToken = jest.fn();
const mockEasProjectId = jest.fn();
const mockPost = jest.fn();
const mockSavePushToken = jest.fn();

jest.mock("expo-notifications", () => ({
  getPermissionsAsync: (...a: unknown[]) => mockGetPermissions(...a),
  requestPermissionsAsync: (...a: unknown[]) => mockRequestPermissions(...a),
  getExpoPushTokenAsync: (...a: unknown[]) => mockGetToken(...a),
}));
jest.mock("../lib/app-config", () => ({
  easProjectId: () => mockEasProjectId(),
}));
jest.mock("../lib/api-client", () => ({
  apiClient: { post: (...a: unknown[]) => mockPost(...a) },
}));
jest.mock("../lib/token-storage", () => ({
  savePushToken: (...a: unknown[]) => mockSavePushToken(...a),
}));

import { enablePush, registerPushToken, requestPushToken } from "../lib/push";
import { useSessionStore } from "../store/session";

const unavailable = {
  isAxiosError: true,
  response: { status: 503, data: { error: { code: "push_unavailable" } } },
};

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  mockEasProjectId.mockReturnValue("test-project");
});

describe("requestPushToken", () => {
  it("returns the token when permission is already granted, without prompting again", async () => {
    mockGetPermissions.mockResolvedValue({ status: "granted" });
    mockGetToken.mockResolvedValue({ data: "ExponentPushToken[abc]" });

    await expect(requestPushToken()).resolves.toEqual({ kind: "token", token: "ExponentPushToken[abc]" });
    expect(mockRequestPermissions).not.toHaveBeenCalled();
    expect(mockGetToken).toHaveBeenCalledWith({ projectId: "test-project" });
  });

  it("prompts once when permission is undetermined", async () => {
    mockGetPermissions.mockResolvedValue({ status: "undetermined" });
    mockRequestPermissions.mockResolvedValue({ status: "granted" });
    mockGetToken.mockResolvedValue({ data: "ExponentPushToken[abc]" });

    await expect(requestPushToken()).resolves.toEqual({ kind: "token", token: "ExponentPushToken[abc]" });
    expect(mockRequestPermissions).toHaveBeenCalledTimes(1);
  });

  it("reports denial, and never asks for a token", async () => {
    mockGetPermissions.mockResolvedValue({ status: "undetermined" });
    mockRequestPermissions.mockResolvedValue({ status: "denied" });

    await expect(requestPushToken()).resolves.toEqual({ kind: "denied" });
    expect(mockGetToken).not.toHaveBeenCalled();
  });

  it("reports not_configured — distinct from denied — when the build has no EAS project id", async () => {
    mockEasProjectId.mockReturnValue(null);
    mockGetPermissions.mockResolvedValue({ status: "granted" });

    await expect(requestPushToken()).resolves.toEqual({ kind: "not_configured" });
    expect(mockGetToken).not.toHaveBeenCalled();
  });

  it("reports failed rather than throwing when the token service fails", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    mockGetPermissions.mockResolvedValue({ status: "granted" });
    mockGetToken.mockRejectedValue(new Error("network"));

    await expect(requestPushToken()).resolves.toEqual({ kind: "failed" });
    warn.mockRestore();
  });
});

describe("registerPushToken", () => {
  it("treats 503 push_unavailable as expected, not as an error", async () => {
    // The server has nowhere to store it until the cutover migration; the
    // client keeps the token locally and stops asking.
    mockPost.mockRejectedValue(unavailable);

    await expect(registerPushToken("ExponentPushToken[abc]")).resolves.toBe("unavailable");
  });

  it("reports success when the server accepts the token", async () => {
    mockPost.mockResolvedValue({ data: { data: { registered: true } } });

    await expect(registerPushToken("ExponentPushToken[abc]")).resolves.toBe("registered");
    expect(mockPost).toHaveBeenCalledWith("/api/v1/me/devices", {
      token: "ExponentPushToken[abc]",
      platform: expect.stringMatching(/^(ios|android)$/),
    });
  });
});

describe("enablePush", () => {
  it("stores the token in the session store and in secure storage", async () => {
    mockGetPermissions.mockResolvedValue({ status: "granted" });
    mockGetToken.mockResolvedValue({ data: "ExponentPushToken[abc]" });
    mockPost.mockRejectedValue(unavailable);

    const result = await enablePush();

    expect(result).toEqual({ token: "ExponentPushToken[abc]", status: "unavailable" });
    expect(useSessionStore.getState().pushToken).toBe("ExponentPushToken[abc]");
    expect(mockSavePushToken).toHaveBeenCalledWith("ExponentPushToken[abc]");
  });

  it("reports denial without touching storage", async () => {
    mockGetPermissions.mockResolvedValue({ status: "undetermined" });
    mockRequestPermissions.mockResolvedValue({ status: "denied" });

    expect(await enablePush()).toEqual({ token: null, status: "denied" });
    expect(mockSavePushToken).not.toHaveBeenCalled();
  });

  it("reports not_configured without touching storage or the server", async () => {
    mockEasProjectId.mockReturnValue(null);
    mockGetPermissions.mockResolvedValue({ status: "granted" });

    expect(await enablePush()).toEqual({ token: null, status: "not_configured" });
    expect(mockSavePushToken).not.toHaveBeenCalled();
    expect(mockPost).not.toHaveBeenCalled();
  });
});
