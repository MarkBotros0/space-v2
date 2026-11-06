import { act, renderHook } from "@testing-library/react-native";
import { Platform, StatusBar } from "react-native";

import { useAnchor } from "../design/lib/anchored-popover";

describe("useAnchor", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("takes the window position as is on edge-to-edge Android, without adding the status bar", () => {
    const os = Platform.OS;
    const height = StatusBar.currentHeight;
    Platform.OS = "android";
    StatusBar.currentHeight = 24;
    try {
      const { result } = renderHook(() => useAnchor());
      (result.current.ref as { current: unknown }).current = {
        measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => cb(10, 100, 200, 44),
      };
      act(() => result.current.measure());
      expect(result.current.rect?.y).toBe(100);
    } finally {
      Platform.OS = os;
      StatusBar.currentHeight = height;
    }
  });

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
