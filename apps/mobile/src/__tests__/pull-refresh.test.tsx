import type React from "react";
import { act, renderHook } from "@testing-library/react-native";
import { NavigationContext } from "expo-router/react-navigation";

import { PULL_MIN_MS, usePullRefresh } from "../design/lib/pull-refresh";

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it("holds the spinner after a pull even when the reload never reports loading", () => {
  const onRefresh = jest.fn();
  const { result } = renderHook(() => usePullRefresh(false, onRefresh));
  expect(result.current.refreshing).toBe(false);
  act(() => result.current.onRefresh!());
  expect(onRefresh).toHaveBeenCalledTimes(1);
  expect(result.current.refreshing).toBe(true);
  act(() => jest.advanceTimersByTime(PULL_MIN_MS - 1));
  expect(result.current.refreshing).toBe(true);
  act(() => jest.advanceTimersByTime(1));
  expect(result.current.refreshing).toBe(false);
});

it("keeps spinning while the screen is still loading, then stops", () => {
  let loading = false;
  const { result, rerender } = renderHook(() => usePullRefresh(loading, () => {}));
  act(() => result.current.onRefresh!());
  loading = true;
  rerender({});
  act(() => jest.advanceTimersByTime(PULL_MIN_MS * 3));
  expect(result.current.refreshing).toBe(true);
  loading = false;
  rerender({});
  act(() => jest.advanceTimersByTime(0));
  expect(result.current.refreshing).toBe(false);
});

it("shows no spinner for a background refetch, and offers no pull without onRefresh", () => {
  // A refetch nobody pulled for (a stale tab, an invalidation) must not set the control refreshing:
  // iOS pushes the content down for a spinner out of sight and, ended off the window, never gives
  // the space back (owner, 2026-11-13: the gap at the top after switching tabs).
  expect(renderHook(() => usePullRefresh(true, () => {})).result.current.refreshing).toBe(false);
  expect(renderHook(() => usePullRefresh(false, undefined)).result.current.onRefresh).toBeUndefined();
});

describe("navigation", () => {
  function fakeNavigation() {
    const listeners: Record<string, Set<() => void>> = { focus: new Set(), blur: new Set() };
    return {
      emit: (event: "focus" | "blur") => listeners[event]!.forEach((fn) => fn()),
      value: {
        addListener: (event: "focus" | "blur", fn: () => void) => {
          listeners[event]!.add(fn);
          return () => listeners[event]!.delete(fn);
        },
      },
    };
  }

  it("drops a pull on blur and remounts the control on focus, so a spinner can't hang after navigating", () => {
    const nav = fakeNavigation();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <NavigationContext.Provider value={nav.value as never}>{children}</NavigationContext.Provider>
    );
    const { result } = renderHook(() => usePullRefresh(false, () => {}), { wrapper });
    const firstKey = result.current.key;
    act(() => result.current.onRefresh!());
    expect(result.current.refreshing).toBe(true);
    act(() => nav.emit("blur"));
    expect(result.current.refreshing).toBe(false);
    act(() => nav.emit("focus"));
    expect(result.current.key).not.toBe(firstKey);
    expect(result.current.refreshing).toBe(false);
  });
});
