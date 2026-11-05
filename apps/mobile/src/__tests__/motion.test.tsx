import { renderHook, act } from "@testing-library/react-native";
import * as Haptics from "expo-haptics";
import {
  DURATION,
  SPRING,
  haptic,
  listItemEntering,
  setReducedMotionForTests,
  useReducedMotion,
  usePressScale,
} from "../design/motion";

type Built = {
  getDelay(): number;
  getDuration(): number;
  build(): (v: { targetHeight: number; targetWidth: number }) => {
    initialValues: { opacity: number; transform: unknown };
  };
};
const entering = (i: number, reduced: boolean) => listItemEntering(i, reduced) as unknown as Built;

const mockWithSpring = jest.fn((to: number) => to);

jest.mock("react-native-reanimated", () => {
  const actual = jest.requireActual("react-native-reanimated");
  return { ...actual, withSpring: (...args: [number]) => mockWithSpring(...args) };
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
  it("pins durations and springs", () => {
    expect(DURATION).toEqual({ fast: 150, base: 220, slow: 320 });
    expect(SPRING.snappy).toMatchObject({ damping: 18, stiffness: 260 });
    expect(SPRING.gentle).toMatchObject({ damping: 22, stiffness: 160 });
  });
});

describe("usePressScale", () => {
  it("springs to 0.97 on press in and back to 1 on press out", () => {
    const { result } = renderHook(() => usePressScale());
    expect(mockWithSpring).not.toHaveBeenCalled();
    act(() => result.current.onPressIn());
    expect(mockWithSpring).toHaveBeenLastCalledWith(0.97, SPRING.snappy);
    act(() => result.current.onPressOut());
    expect(mockWithSpring).toHaveBeenLastCalledWith(1, SPRING.snappy);
  });

  it("takes a custom scale", () => {
    const { result } = renderHook(() => usePressScale(0.9));
    act(() => result.current.onPressIn());
    expect(mockWithSpring).toHaveBeenLastCalledWith(0.9, SPRING.snappy);
  });
});

describe("listItemEntering", () => {
  it("staggers by 35ms with the base duration", () => {
    const first = entering(0, false);
    const third = entering(3, false);
    expect(first.getDelay()).toBe(0);
    expect(third.getDelay()).toBe(105);
    expect(third.getDuration()).toBe(DURATION.base);
  });

  it("rises 6px from transparent", () => {
    const anim = entering(1, false);
    const { initialValues } = anim.build()({ targetHeight: 40, targetWidth: 100 });
    expect(initialValues.opacity).toBe(0);
    expect(initialValues.transform).toEqual([{ translateY: 6 }]);
  });

  it("skips rows from the ninth on", () => {
    expect(listItemEntering(8, false)).toBeUndefined();
    expect(listItemEntering(9, false)).toBeUndefined();
  });

  it("only fades, with no delay, under reduced motion", () => {
    const anim = entering(2, true);
    expect(anim.getDelay()).toBe(0);
    expect(anim.getDuration()).toBe(DURATION.fast);
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
