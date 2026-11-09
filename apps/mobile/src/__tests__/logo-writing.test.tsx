import { render, screen } from "@testing-library/react-native";

import { LogoWriting } from "../design/brand/logo-writing";
import { LOGO_STROKES, LOGO_TIMELINE, LOGO_WRITING_MS, markProgress } from "../design/brand/logo-strokes";
import { setReducedMotionForTests } from "../design/motion";
import { LOGO_COLORS, logoInk } from "../design/theme/brand";

afterEach(() => {
  setReducedMotionForTests(null);
  jest.useRealTimers();
});

describe("logo strokes", () => {
  it("writes J+P, then C, then the dots, ending at 2.5 s", () => {
    const order = Object.entries(LOGO_TIMELINE)
      .sort((a, b) => a[1][0] - b[1][0])
      .map(([k]) => k);
    expect(order).toEqual(["jp", "c", "dot-top", "dot-bottom"]);
    expect(LOGO_WRITING_MS).toBe(2500);
    expect(Math.max(...Object.values(LOGO_TIMELINE).map(([, end]) => end))).toBe(LOGO_WRITING_MS);
    for (const [start, end] of Object.values(LOGO_TIMELINE)) expect(end).toBeGreaterThan(start);
  });

  it("knows each stroke's length (J+P ~1846, C ~805 logo units)", () => {
    expect(LOGO_STROKES.map((s) => Math.round(s.length))).toEqual([1846, 805]);
  });

  it("eases each mark from 0 to 1 over its span and clamps outside it", () => {
    expect(markProgress(-10, 0, 100)).toBe(0);
    expect(markProgress(0, 0, 100)).toBe(0);
    expect(markProgress(50, 0, 100)).toBeCloseTo(0.5);
    expect(markProgress(25, 0, 100)).toBeLessThan(0.25);
    expect(markProgress(100, 0, 100)).toBe(1);
    expect(markProgress(500, 0, 100)).toBe(1);
  });
});

describe("LogoWriting", () => {
  it("is one image named JPC Space for screen readers", () => {
    setReducedMotionForTests(true);
    render(<LogoWriting />);
    expect(screen.getByLabelText("JPC Space")).toBeTruthy();
  });

  it("under reduced motion is whole at once and reports done immediately", () => {
    setReducedMotionForTests(true);
    const onDone = jest.fn();
    render(<LogoWriting onDone={onDone} />);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("reports done once, when the 2.5 s of writing are over", () => {
    setReducedMotionForTests(false);
    jest.useFakeTimers();
    const onDone = jest.fn();
    const { rerender } = render(<LogoWriting onDone={onDone} />);
    jest.advanceTimersByTime(LOGO_WRITING_MS - 1);
    expect(onDone).not.toHaveBeenCalled();
    // A new callback identity does not restart the writing.
    rerender(<LogoWriting onDone={onDone} />);
    jest.advanceTimersByTime(1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("stops its timer when unmounted early", () => {
    setReducedMotionForTests(false);
    jest.useFakeTimers();
    const onDone = jest.fn();
    const { unmount } = render(<LogoWriting onDone={onDone} />);
    unmount();
    jest.advanceTimersByTime(LOGO_WRITING_MS);
    expect(onDone).not.toHaveBeenCalled();
  });
});

describe("logoInk", () => {
  it("is navy on the light background and teal on the dark one", () => {
    expect(logoInk("light")).toBe(LOGO_COLORS.navy);
    expect(logoInk("dark")).toBe(LOGO_COLORS.teal);
  });
});
