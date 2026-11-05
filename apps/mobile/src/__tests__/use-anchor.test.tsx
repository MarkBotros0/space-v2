import { act, renderHook } from "@testing-library/react-native";

import { useAnchor } from "../design/lib/anchored-popover";

describe("useAnchor", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("measures again once the keyboard and scroll have settled", () => {
    let y = 100;
    const { result } = renderHook(() => useAnchor());
    (result.current.ref as { current: unknown }).current = {
      measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => cb(10, y, 200, 44),
    };
    act(() => result.current.measure());
    expect(result.current.rect?.y).toBe(100);
    y = 40; // the keyboard closed and the form scrolled back
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(result.current.rect?.y).toBe(40);
  });
});
