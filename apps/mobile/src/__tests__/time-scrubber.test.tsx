import { fireEvent, render, screen } from "@testing-library/react-native";

import { clampSeconds, fractionOf, secondsAtX } from "../design/lib/scrub";
import { TimeScrubber } from "../design/ui/time-scrubber";
import { unsavedLine } from "../screens/assignment-form/parts-tab";

describe("scrub maths", () => {
  it("keeps whole seconds inside the video", () => {
    expect(clampSeconds(12.4, 60)).toBe(12);
    expect(clampSeconds(-5, 60)).toBe(0);
    expect(clampSeconds(75, 60)).toBe(60);
    expect(clampSeconds(Number.NaN, 60)).toBe(0);
  });

  it("finds the second under a touch", () => {
    expect(secondsAtX(150, 300, 600)).toBe(300);
    expect(secondsAtX(400, 300, 600)).toBe(600);
    expect(secondsAtX(10, 0, 600)).toBe(0);
  });

  it("places the thumb as a fraction", () => {
    expect(fractionOf(30, 120)).toBe(0.25);
    expect(fractionOf(200, 120)).toBe(1);
    expect(fractionOf(5, 0)).toBe(0);
  });
});

describe("TimeScrubber", () => {
  function setup(value: number) {
    const onChange = jest.fn();
    const onRelease = jest.fn();
    render(
      <TimeScrubber
        label="When it shows"
        value={value}
        max={100}
        format={(s) => String(s)}
        onChange={onChange}
        onRelease={onRelease}
      />,
    );
    return { onChange, onRelease };
  }

  it("steps forward and back, settling at once", () => {
    const { onChange, onRelease } = setup(50);
    fireEvent.press(screen.getByRole("button", { name: "Forward 10 seconds" }));
    expect(onChange).toHaveBeenLastCalledWith(60);
    expect(onRelease).toHaveBeenLastCalledWith(60);
    fireEvent.press(screen.getByRole("button", { name: "Back 1 second" }));
    expect(onChange).toHaveBeenLastCalledWith(49);
  });

  it("never steps past either end", () => {
    const { onChange } = setup(95);
    fireEvent.press(screen.getByRole("button", { name: "Forward 10 seconds" }));
    expect(onChange).toHaveBeenLastCalledWith(100);
  });
});

describe("unsaved parts line", () => {
  it("says what is unsaved and how to keep it", () => {
    expect(unsavedLine(0)).toBe("Changes to the parts aren't saved yet. Tap Save changes to keep them.");
    expect(unsavedLine(1)).toContain(" 1 part is removed.");
    expect(unsavedLine(3)).toContain(" 3 parts are removed.");
  });
});
