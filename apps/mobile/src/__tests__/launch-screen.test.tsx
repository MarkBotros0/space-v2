import { act, render, screen } from "@testing-library/react-native";

import { LaunchScreen, LOADING_HINT_MS } from "../design/brand/launch-screen";
import { LAUNCH } from "../design/brand/launch-motion";
import { LOGO_WRITING_MS } from "../design/brand/logo-strokes";
import { DURATION, setReducedMotionForTests } from "../design/motion";

beforeEach(() => {
  jest.useFakeTimers();
  setReducedMotionForTests(false);
});
afterEach(() => {
  jest.useRealTimers();
  setReducedMotionForTests(null);
});

// One step per timer: a timer that fires sets state, and the next timer is
// only scheduled by the effect that runs after that render.
const advance = (ms: number) => act(() => jest.advanceTimersByTime(ms));

/** Writing, hold and gather: the dots are circling from here on. */
function toSpinning() {
  advance(LOGO_WRITING_MS);
  advance(LAUNCH.holdMs);
  advance(LAUNCH.gatherMs);
}

describe("LaunchScreen", () => {
  it("writes the logo, spins the dots for half a turn and opens onto the app, even when boot is already done", () => {
    const onGone = jest.fn();
    render(<LaunchScreen ready onGone={onGone} />);
    expect(screen.getByLabelText("JPC Space")).toBeTruthy();
    toSpinning();
    advance(LAUNCH.minSpinMs - 1);
    expect(onGone).not.toHaveBeenCalled();
    advance(1); // spun enough: the opening starts on the next render
    advance(LAUNCH.openMs - 1);
    expect(onGone).not.toHaveBeenCalled();
    advance(1);
    expect(onGone).toHaveBeenCalledTimes(1);
  });

  it("keeps the dots circling as the loader until boot is done, then opens", () => {
    const onGone = jest.fn();
    const { rerender } = render(<LaunchScreen ready={false} onGone={onGone} />);
    toSpinning();
    advance(LAUNCH.minSpinMs + 5000);
    expect(onGone).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Loading")).toBeTruthy();
    rerender(<LaunchScreen ready onGone={onGone} />);
    advance(LAUNCH.openMs);
    expect(onGone).toHaveBeenCalledTimes(1);
  });

  it("does not name the loader while the logo is still writing", () => {
    render(<LaunchScreen ready={false} onGone={jest.fn()} />);
    expect(screen.queryByLabelText("Loading")).toBeNull();
  });

  it("under reduced motion leaves as soon as boot is done", () => {
    setReducedMotionForTests(true);
    const onGone = jest.fn();
    render(<LaunchScreen ready onGone={onGone} />);
    advance(DURATION.base);
    expect(onGone).toHaveBeenCalledTimes(1);
  });

  it("under reduced motion shows a spinner under the logo only when boot is slow", () => {
    setReducedMotionForTests(true);
    render(<LaunchScreen ready={false} onGone={jest.fn()} />);
    advance(LOADING_HINT_MS - 1);
    expect(screen.queryByLabelText("Loading")).toBeNull();
    advance(1);
    expect(screen.getByLabelText("Loading")).toBeTruthy();
  });
});
