import { fireEvent, render, screen } from "@testing-library/react-native";

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
});
