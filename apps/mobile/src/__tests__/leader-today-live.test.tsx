import { act, renderHook } from "@testing-library/react-native";
import { AppState } from "react-native";

// useFocusEffect runs its effect on mount and cleans up on unmount (= blur).
jest.mock("expo-router", () => ({
  useFocusEffect: (effect: () => void | (() => void)) => require("react").useEffect(effect, [effect]),
}));

import { LIVE_TODAY_REFRESH_MS, useLiveTodayRefresh } from "../screens/leader-today/use-live-refresh";

let appStateHandler: ((s: string) => void) | null = null;
const remove = jest.fn();

beforeEach(() => {
  jest.useFakeTimers();
  remove.mockClear();
  appStateHandler = null;
  jest.spyOn(AppState, "addEventListener").mockImplementation(((_: string, cb: (s: string) => void) => {
    appStateHandler = cb;
    return { remove };
  }) as never);
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("useLiveTodayRefresh", () => {
  it("refetches on focus when the data is stale, and not when it is fresh", () => {
    const stale = jest.fn();
    renderHook(() => useLiveTodayRefresh({ refetch: stale, isStale: true, live: false }));
    expect(stale).toHaveBeenCalledTimes(1);

    const fresh = jest.fn();
    renderHook(() => useLiveTodayRefresh({ refetch: fresh, isStale: false, live: false }));
    expect(fresh).not.toHaveBeenCalled();
  });

  it("polls every 30s while the session is on the day or running", () => {
    const refetch = jest.fn();
    renderHook(() => useLiveTodayRefresh({ refetch, isStale: false, live: true }));
    expect(refetch).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(LIVE_TODAY_REFRESH_MS);
    });
    expect(refetch).toHaveBeenCalledTimes(1);
    act(() => {
      jest.advanceTimersByTime(LIVE_TODAY_REFRESH_MS * 2);
    });
    expect(refetch).toHaveBeenCalledTimes(3);
  });

  it("does not poll when the session is not on the day", () => {
    const refetch = jest.fn();
    renderHook(() => useLiveTodayRefresh({ refetch, isStale: false, live: false }));
    act(() => {
      jest.advanceTimersByTime(LIVE_TODAY_REFRESH_MS * 3);
    });
    expect(refetch).not.toHaveBeenCalled();
  });

  it("refetches when the app returns to the foreground, not when it leaves", () => {
    const refetch = jest.fn();
    renderHook(() => useLiveTodayRefresh({ refetch, isStale: false, live: false }));
    act(() => appStateHandler?.("background"));
    expect(refetch).not.toHaveBeenCalled();
    act(() => appStateHandler?.("active"));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("stops the interval and the AppState listener when unfocused", () => {
    const refetch = jest.fn();
    const { unmount } = renderHook(() => useLiveTodayRefresh({ refetch, isStale: false, live: true }));
    unmount();
    expect(remove).toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(LIVE_TODAY_REFRESH_MS * 3);
    });
    expect(refetch).not.toHaveBeenCalled();
  });
});
