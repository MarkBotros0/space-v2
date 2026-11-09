// apps/mobile/src/__tests__/google-sign-in.test.ts
const mockConfigure = jest.fn();
const mockHasPlayServices = jest.fn();
const mockSignIn = jest.fn();
const mockSignOut = jest.fn();
jest.mock("@react-native-google-signin/google-signin", () => ({
  GoogleSignin: {
    configure: (...a: unknown[]) => mockConfigure(...a),
    hasPlayServices: (...a: unknown[]) => mockHasPlayServices(...a),
    signIn: (...a: unknown[]) => mockSignIn(...a),
    signOut: (...a: unknown[]) => mockSignOut(...a),
  },
  isErrorWithCode: (e: unknown) => typeof e === "object" && e !== null && "code" in e,
  statusCodes: {
    SIGN_IN_CANCELLED: "SIGN_IN_CANCELLED",
    IN_PROGRESS: "IN_PROGRESS",
    PLAY_SERVICES_NOT_AVAILABLE: "PLAY_SERVICES_NOT_AVAILABLE",
  },
}));

const mockIds = { value: null as { webClientId: string; iosClientId: string | null } | null };
jest.mock("../lib/app-config", () => ({ googleSignInIds: () => mockIds.value }));

import {
  GoogleSignInUnavailableError,
  googleIdToken,
  isGoogleSignInConfigured,
} from "../lib/google-sign-in";

const IDS = {
  webClientId: "web.apps.googleusercontent.com",
  iosClientId: "ios.apps.googleusercontent.com",
};

beforeEach(() => {
  jest.clearAllMocks();
  mockIds.value = IDS;
  mockHasPlayServices.mockResolvedValue(true);
  mockSignOut.mockResolvedValue(null);
});

describe("googleIdToken", () => {
  it("is unavailable, and opens nothing, without client IDs", async () => {
    mockIds.value = null;
    expect(isGoogleSignInConfigured()).toBe(false);
    await expect(googleIdToken()).rejects.toBeInstanceOf(GoogleSignInUnavailableError);
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it("returns Google's ID token and keeps no Google session", async () => {
    mockSignIn.mockResolvedValue({ type: "success", data: { idToken: "id-token" } });
    await expect(googleIdToken()).resolves.toBe("id-token");
    expect(mockConfigure).toHaveBeenCalledWith({
      webClientId: IDS.webClientId,
      iosClientId: IDS.iosClientId,
    });
    expect(mockSignOut).toHaveBeenCalled();
  });

  it("configures Google once (the test above already did)", async () => {
    mockSignIn.mockResolvedValue({ type: "success", data: { idToken: "id-token" } });
    await googleIdToken();
    expect(mockConfigure).not.toHaveBeenCalled();
  });

  it.each([
    ["a closed sheet", () => mockSignIn.mockResolvedValue({ type: "cancelled", data: null })],
    ["a cancel error", () => mockSignIn.mockRejectedValue({ code: "SIGN_IN_CANCELLED" })],
    ["a sign-in already open", () => mockSignIn.mockRejectedValue({ code: "IN_PROGRESS" })],
  ])("returns null for %s", async (_label, arrange) => {
    arrange();
    await expect(googleIdToken()).resolves.toBeNull();
  });

  it("says so when the phone has no Play services", async () => {
    mockHasPlayServices.mockRejectedValue({ code: "PLAY_SERVICES_NOT_AVAILABLE" });
    await expect(googleIdToken()).rejects.toBeInstanceOf(GoogleSignInUnavailableError);
  });

  it("fails when Google returns no ID token", async () => {
    mockSignIn.mockResolvedValue({ type: "success", data: { idToken: null } });
    await expect(googleIdToken()).rejects.toThrow("no ID token");
  });
});
