import { renderHook, act } from "@testing-library/react-native";
import * as Haptics from "expo-haptics";
import { DURATION, PRESS_OPACITY, haptic, setReducedMotionForTests, useReducedMotion, usePressDim } from "../design/motion";

const mockWithTiming = jest.fn((to: number) => to);

jest.mock("react-native-reanimated", () => {
  const actual = jest.requireActual("react-native-reanimated");
  return { ...actual, withTiming: (...args: [number]) => mockWithTiming(...args) };
});

jest.mock("expo-haptics", () => ({
  notificationAsync: jest.fn(() => Promise.resolve()),
  impactAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  NotificationFeedbackType: { Success: "success" },
  ImpactFeedbackStyle: { Light: "light" },
}));

beforeEach(() => {
  jest.clearAllMocks();
  setReducedMotionForTests(null);
});

describe("tokens", () => {
  it("pins the durations; there are no spring presets", () => {
    expect(DURATION).toEqual({ fast: 150, base: 220, slow: 320 });
    expect(Object.keys(require("../design/motion"))).not.toContain("SPRING");
  });
});

describe("usePressDim", () => {
  it("dims on press in and fades back on press out, without scaling", () => {
    const { result } = renderHook(() => usePressDim());
    expect(mockWithTiming).not.toHaveBeenCalled();
    act(() => result.current.onPressIn());
    expect(mockWithTiming).toHaveBeenLastCalledWith(PRESS_OPACITY, expect.objectContaining({ duration: 60 }));
    act(() => result.current.onPressOut());
    expect(mockWithTiming).toHaveBeenLastCalledWith(1, { duration: DURATION.fast });
  });
});

describe("haptic", () => {
  it("maps kinds to expo-haptics calls", () => {
    haptic("success");
    expect(Haptics.notificationAsync).toHaveBeenCalledWith("success");
    haptic("light");
    expect(Haptics.impactAsync).toHaveBeenCalledWith("light");
    haptic("selection");
    expect(Haptics.selectionAsync).toHaveBeenCalled();
  });

  it("swallows rejections and synchronous throws", async () => {
    (Haptics.notificationAsync as jest.Mock).mockRejectedValueOnce(new Error("no"));
    expect(() => haptic("success")).not.toThrow();
    (Haptics.selectionAsync as jest.Mock).mockImplementationOnce(() => {
      throw new Error("sync");
    });
    expect(() => haptic("selection")).not.toThrow();
    await Promise.resolve();
  });
});

describe("useReducedMotion", () => {
  it("returns the test override", () => {
    setReducedMotionForTests(true);
    expect(renderHook(() => useReducedMotion()).result.current).toBe(true);
    setReducedMotionForTests(false);
    expect(renderHook(() => useReducedMotion()).result.current).toBe(false);
  });
});
