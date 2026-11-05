import { render, screen } from "@testing-library/react-native";

import { ProgressRing, RingCaption, RingValue, ringContentWidth } from "../design/ui/progress-ring";

const FIT = {
  numberOfLines: 1,
  adjustsFontSizeToFit: true,
  minimumFontScale: 0.6,
  maxFontSizeMultiplier: 1.15,
};

describe("ring labels fit inside the inner circle (leader s10-01, admin s20-01)", () => {
  it("the value and the caption shrink to one line instead of wrapping mid-word", () => {
    render(
      <ProgressRing value={100}>
        <RingValue>100%</RingValue>
        <RingCaption>attendance</RingCaption>
      </ProgressRing>,
    );
    expect(screen.getByText("100%").props).toMatchObject(FIT);
    expect(screen.getByText("attendance").props).toMatchObject(FIT);
  });

  it("keeps the labels' box clear of the stroke at its corners, not just at its middle", () => {
    render(
      <ProgressRing value={50} size={104} strokeWidth={9}>
        <RingCaption>attendance</RingCaption>
      </ProgressRing>,
    );
    // Inner radius 43; a box 60 wide and 43 tall (the figure and its caption) has its
    // corners at sqrt(30² + 21.5²) ≈ 36.9 from the centre: 6dp inside the stroke.
    expect(screen.getByTestId("ring-content").props.style).toMatchObject({ width: 60 });
    expect(Math.hypot(60 / 2, 43 / 2)).toBeLessThanOrEqual(43 - 6);
  });

  it("sizes the box from the ring it is in", () => {
    expect(ringContentWidth(104, 9)).toBe(60);
    expect(ringContentWidth(140, 10)).toBeGreaterThan(ringContentWidth(104, 9));
  });

  it("the figure is 20/24, so figure and caption stay about the inner radius tall", () => {
    render(
      <ProgressRing value={100}>
        <RingValue>100%</RingValue>
      </ProgressRing>,
    );
    expect(screen.getByText("100%").props.className.split(" ")).toEqual(
      expect.arrayContaining(["text-xl", "leading-6"]),
    );
  });
});
