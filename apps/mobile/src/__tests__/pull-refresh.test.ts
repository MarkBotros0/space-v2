import { act, renderHook } from "@testing-library/react-native";

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

it("passes a background refetch through, and offers no pull without onRefresh", () => {
  expect(renderHook(() => usePullRefresh(true, () => {})).result.current.refreshing).toBe(true);
  expect(renderHook(() => usePullRefresh(false, undefined)).result.current.onRefresh).toBeUndefined();
});
