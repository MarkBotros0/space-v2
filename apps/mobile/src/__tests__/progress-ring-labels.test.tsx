import { render, screen } from "@testing-library/react-native";

import { ProgressRing, RingCaption, RingValue } from "../design/ui/progress-ring";

const FIT = { numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.6, maxFontSizeMultiplier: 1.15 };

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

  it("bounds the labels' width to the inside of the stroke", () => {
    render(
      <ProgressRing value={50} size={104} strokeWidth={9}>
        <RingCaption>attendance</RingCaption>
      </ProgressRing>,
    );
    const box = screen.getByTestId("ring-content");
    // 104 - 2 * (9 + 6) = 74dp across, inside the 86dp inner circle at its middle.
    expect(box.props.style).toMatchObject({ paddingHorizontal: 15 });
  });
});
