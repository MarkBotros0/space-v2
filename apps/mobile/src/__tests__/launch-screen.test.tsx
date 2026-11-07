import { act, render, screen } from "@testing-library/react-native";

import { LaunchScreen, LOADING_HINT_MS } from "../design/brand/launch-screen";
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

describe("LaunchScreen", () => {
  it("writes the logo in full before leaving, even when boot is already done", () => {
    const onGone = jest.fn();
    render(<LaunchScreen ready onGone={onGone} />);
    expect(screen.getByLabelText("JPC Space")).toBeTruthy();
    advance(LOGO_WRITING_MS - 1);
    expect(onGone).not.toHaveBeenCalled();
    advance(1); // written: the fade starts on the next render
    advance(DURATION.base);
    expect(onGone).toHaveBeenCalledTimes(1);
  });

  it("waits for boot after the writing, then fades out", () => {
    const onGone = jest.fn();
    const { rerender } = render(<LaunchScreen ready={false} onGone={onGone} />);
    advance(LOGO_WRITING_MS + 1000);
    expect(onGone).not.toHaveBeenCalled();
    rerender(<LaunchScreen ready onGone={onGone} />);
    advance(DURATION.base);
    expect(onGone).toHaveBeenCalledTimes(1);
  });

  it("shows a spinner under the logo only when boot is slow", () => {
    render(<LaunchScreen ready={false} onGone={jest.fn()} />);
    advance(LOGO_WRITING_MS); // written: the hint timer starts on the next render
    advance(LOADING_HINT_MS - 1);
    expect(screen.queryByLabelText("Loading")).toBeNull();
    advance(1);
    expect(screen.getByLabelText("Loading")).toBeTruthy();
  });

  it("under reduced motion leaves as soon as boot is done", () => {
    setReducedMotionForTests(true);
    const onGone = jest.fn();
    render(<LaunchScreen ready onGone={onGone} />);
    advance(DURATION.base);
    expect(onGone).toHaveBeenCalledTimes(1);
  });
});
