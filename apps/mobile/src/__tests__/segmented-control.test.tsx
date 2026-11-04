import { fireEvent, render, screen } from "@testing-library/react-native";

import { setReducedMotionForTests } from "../design/motion";
import { SegmentedControl } from "../design/ui/segmented-control";

const OPTIONS = [
  { value: "a", label: "Upcoming" },
  { value: "b", label: "Past" },
];

describe("SegmentedControl", () => {
  it("calls onChange with the tapped value", () => {
    const onChange = jest.fn();
    render(<SegmentedControl options={OPTIONS} value="a" onChange={onChange} />);
    fireEvent.press(screen.getByText("Past"));
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("marks only the selected option as selected", () => {
    render(<SegmentedControl options={OPTIONS} value="b" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Past" }).props.accessibilityState.selected).toBe(true);
    expect(screen.getByRole("button", { name: "Upcoming" }).props.accessibilityState.selected).toBe(false);
  });

  it("segments meet the 44pt tap target", () => {
    render(<SegmentedControl options={OPTIONS} value="a" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Past" }).props.className).toContain("min-h-[44px]");
  });

  it("changes selection without throwing under reduced motion", () => {
    setReducedMotionForTests(true);
    const { rerender } = render(<SegmentedControl options={OPTIONS} value="a" onChange={() => {}} />);
    fireEvent(screen.getByTestId("segmented-control"), "layout", { nativeEvent: { layout: { width: 204, height: 48 } } });
    rerender(<SegmentedControl options={OPTIONS} value="b" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Past" }).props.accessibilityState.selected).toBe(true);
    setReducedMotionForTests(null);
  });
});
