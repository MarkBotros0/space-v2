import { act, renderHook } from "@testing-library/react-native";

import {
  INITIAL_SCROLL_STEP,
  resetTabBarScroll,
  scrollDirectionStep,
  useTabBarScroll,
  useTabBarVisible,
} from "../design/layout/tab-bar-scroll";

afterEach(() => resetTabBarScroll());

describe("tab bar visibility store (ruling R2)", () => {
  it("starts visible", () => {
    const { result } = renderHook(() => useTabBarVisible());
    expect(result.current).toBe(true);
  });

  it("hides on a downward scroll and shows again on an upward one", () => {
    const { result } = renderHook(() => ({
      visible: useTabBarVisible(),
      scroll: useTabBarScroll(),
    }));
    act(() => result.current.scroll.onScrollDirection("down", false));
    expect(result.current.visible).toBe(false);
    act(() => result.current.scroll.onScrollDirection("up", false));
    expect(result.current.visible).toBe(true);
  });

  it("shows at the end of the content even while scrolling down, so the last rows are never trapped", () => {
    const { result } = renderHook(() => ({
      visible: useTabBarVisible(),
      scroll: useTabBarScroll(),
    }));
    act(() => result.current.scroll.onScrollDirection("down", false));
    act(() => result.current.scroll.onScrollDirection("down", true));
    expect(result.current.visible).toBe(true);
  });

  it("hands out one stable reporter, so a scroll handler's deps never change", () => {
    const { result, rerender } = renderHook(() => useTabBarScroll());
    const first = result.current.onScrollDirection;
    rerender({});
    expect(result.current.onScrollDirection).toBe(first);
  });

  it("reset shows the bar again", () => {
    const { result } = renderHook(() => ({
      visible: useTabBarVisible(),
      scroll: useTabBarScroll(),
    }));
    act(() => result.current.scroll.onScrollDirection("down", false));
    act(() => resetTabBarScroll());
    expect(result.current.visible).toBe(true);
  });
});

describe("scrollDirectionStep", () => {
  const viewport = 600;
  const content = 2000;

  it("ignores jitter under 8px", () => {
    const next = scrollDirectionStep(INITIAL_SCROLL_STEP, 7, viewport, content);
    expect(next.dir).toBeNull();
    expect(next.anchor).toBe(0);
  });

  it("turns down past 8px and moves its anchor with the scroll", () => {
    const next = scrollDirectionStep(INITIAL_SCROLL_STEP, 40, viewport, content);
    expect(next).toEqual({ anchor: 40, dir: "down", atEnd: false });
  });

  it("keeps its direction through small reversals, turns up on a real one", () => {
    const down = scrollDirectionStep(INITIAL_SCROLL_STEP, 400, viewport, content);
    expect(scrollDirectionStep(down, 395, viewport, content).dir).toBe("down");
    expect(scrollDirectionStep(down, 380, viewport, content).dir).toBe("up");
  });

  it("is up at or above the top (bounce, pull-to-refresh)", () => {
    const down = scrollDirectionStep(INITIAL_SCROLL_STEP, 400, viewport, content);
    expect(scrollDirectionStep(down, -30, viewport, content).dir).toBe("up");
  });

  it("knows when the content's end is in view", () => {
    expect(scrollDirectionStep(INITIAL_SCROLL_STEP, 1400, viewport, content).atEnd).toBe(true);
    expect(scrollDirectionStep(INITIAL_SCROLL_STEP, 1300, viewport, content).atEnd).toBe(false);
  });
});
