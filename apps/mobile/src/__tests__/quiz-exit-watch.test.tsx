import { act, render } from "@testing-library/react-native";
import { AppState, Dimensions, Platform, type AppStateStatus, type ScaledSize } from "react-native";

import { useExitWatch } from "../screens/quiz-detail/lock/use-attempt-guards";
import { resetCurrentAppState, setCurrentAppState } from "./helpers/app-state";

/* Android split screen: a window under 85% of the screen for over a second is a leave. */

const FULL = { width: 400, height: 800, scale: 2, fontScale: 1 };
const HALF = { ...FULL, height: 400 };
type Sizes = { window: ScaledSize; screen: ScaledSize };

let appListeners: ((s: AppStateStatus) => void)[] = [];
let sizeListeners: ((s: Sizes) => void)[] = [];
let windowNow: ScaledSize = FULL;

const onLeft = jest.fn();
const onReturned = jest.fn();
function Watch() {
  useExitWatch(true, { onLeft, onReturned });
  return null;
}

const resize = (window: ScaledSize) =>
  act(() => {
    windowNow = window;
    for (const fn of sizeListeners) fn({ window, screen: FULL });
  });
const app = (s: AppStateStatus) =>
  act(() => {
    for (const fn of appListeners) fn(s);
  });
const wait = (ms: number) =>
  act(() => {
    jest.advanceTimersByTime(ms);
  });

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  jest.setSystemTime(Date.parse("2026-11-14T10:00:00.000Z"));
  appListeners = [];
  sizeListeners = [];
  windowNow = FULL;
  jest.replaceProperty(Platform, "OS", "android");
  setCurrentAppState("active");
  jest.spyOn(Dimensions, "get").mockImplementation((dim) => (dim === "window" ? windowNow : FULL));
  jest.spyOn(Dimensions, "addEventListener").mockImplementation((_t, fn) => {
    sizeListeners.push(fn as (s: Sizes) => void);
    return { remove: jest.fn() } as never;
  });
  jest.spyOn(AppState, "addEventListener").mockImplementation((_t, fn) => {
    appListeners.push(fn as (s: AppStateStatus) => void);
    return { remove: jest.fn() };
  });
});

afterEach(() => {
  resetCurrentAppState();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("useExitWatch on Android", () => {
  it("a shrink under a second (a rotation) doesn't count", () => {
    render(<Watch />);
    resize(HALF);
    wait(900);
    resize(FULL);
    wait(2000);
    expect(onLeft).not.toHaveBeenCalled();
    expect(onReturned).not.toHaveBeenCalled();
  });

  it("a shrink over a second counts once, from when it began", () => {
    render(<Watch />);
    const began = Date.now();
    resize(HALF);
    wait(1100);
    resize({ ...HALF, height: 380 });
    wait(3000);
    expect(onLeft).toHaveBeenCalledTimes(1);
    expect(onLeft).toHaveBeenCalledWith(began);
    resize(FULL);
    expect(onReturned).toHaveBeenCalledTimes(1);
  });

  it("split screen, then the background, is one leave and one return", () => {
    render(<Watch />);
    resize(HALF);
    wait(1100);
    app("background");
    app("active");
    expect(onLeft).toHaveBeenCalledTimes(1);
    expect(onReturned).not.toHaveBeenCalled();
    resize(FULL);
    expect(onReturned).toHaveBeenCalledTimes(1);
  });

  it("a window already shrunk when the quiz opens counts after a second", () => {
    windowNow = HALF;
    render(<Watch />);
    wait(1100);
    expect(onLeft).toHaveBeenCalledTimes(1);
  });
});
