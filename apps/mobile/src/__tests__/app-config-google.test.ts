// apps/mobile/src/__tests__/app-config-google.test.ts
const mockExtra: { value: Record<string, unknown> } = { value: {} };
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return { extra: mockExtra.value };
    },
  },
}));

import { googleSignInIds } from "../lib/app-config";

const WEB = "web.apps.googleusercontent.com";
const IOS = "ios.apps.googleusercontent.com";

afterEach(() => {
  mockExtra.value = {};
  delete process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  delete process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
});

describe("googleSignInIds", () => {
  it("is null with no client IDs", () => {
    expect(googleSignInIds("android")).toBeNull();
    expect(googleSignInIds("ios")).toBeNull();
  });

  it("reads app.json's extra", () => {
    mockExtra.value = { googleWebClientId: WEB, googleIosClientId: IOS };
    expect(googleSignInIds("ios")).toEqual({ webClientId: WEB, iosClientId: IOS });
  });

  it("lets the build's env win over app.json", () => {
    mockExtra.value = { googleWebClientId: WEB, googleIosClientId: IOS };
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = "env-web.apps.googleusercontent.com";
    expect(googleSignInIds("android")?.webClientId).toBe("env-web.apps.googleusercontent.com");
  });

  it("needs the iOS client on iOS, but not on Android", () => {
    mockExtra.value = { googleWebClientId: WEB };
    expect(googleSignInIds("ios")).toBeNull();
    expect(googleSignInIds("android")).toEqual({ webClientId: WEB, iosClientId: null });
  });
});
