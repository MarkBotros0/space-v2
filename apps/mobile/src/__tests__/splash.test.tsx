import { renderHook } from "@testing-library/react-native";

const mockHide = jest.fn(() => Promise.resolve(true));
const mockPrevent = jest.fn(() => Promise.resolve(true));
jest.mock("expo-splash-screen", () => ({
  hideAsync: () => mockHide(),
  preventAutoHideAsync: () => mockPrevent(),
}));

import { keepSplashUntilReady, SPLASH_MAX_WAIT_MS, useHideSplashWhen } from "../lib/splash";

beforeEach(() => {
  jest.useFakeTimers();
  mockHide.mockClear();
  mockPrevent.mockClear();
});
afterEach(() => jest.useRealTimers());

describe("splash", () => {
  it("keeps the native splash up until told otherwise", () => {
    keepSplashUntilReady();
    expect(mockPrevent).toHaveBeenCalledTimes(1);
  });

  it("stays up while boot is not ready, and hides as soon as it is", () => {
    const { rerender } = renderHook(({ ready }: { ready: boolean }) => useHideSplashWhen(ready), {
      initialProps: { ready: false },
    });
    expect(mockHide).not.toHaveBeenCalled();
    rerender({ ready: true });
    expect(mockHide).toHaveBeenCalled();
  });

  it("hides after the cap even if boot never settles (slow or offline /me)", () => {
    renderHook(() => useHideSplashWhen(false));
    jest.advanceTimersByTime(SPLASH_MAX_WAIT_MS - 1);
    expect(mockHide).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(mockHide).toHaveBeenCalledTimes(1);
  });

  it("swallows a rejected hide (splash already gone)", async () => {
    mockHide.mockImplementationOnce(() => Promise.reject(new Error("no splash")));
    renderHook(() => useHideSplashWhen(true));
    await Promise.resolve();
    expect(mockHide).toHaveBeenCalled();
  });
});
