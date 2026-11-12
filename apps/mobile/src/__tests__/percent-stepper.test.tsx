import { fireEvent, render, screen } from "@testing-library/react-native";

import { PercentStepper } from "../screens/season-passing/percent-stepper";

function stepper(value: string, onChange = jest.fn()) {
  render(<PercentStepper label="Attendance" name="attendance weight" value={value} onChange={onChange} />);
  return {
    lower: screen.getByRole("button", { name: "Lower attendance weight" }),
    raise: screen.getByRole("button", { name: "Raise attendance weight" }),
    onChange,
  };
}

describe("PercentStepper", () => {
  it("disables Lower at 0, and the screen reader hears it disabled", () => {
    const { lower, raise, onChange } = stepper("0");
    expect(lower.props.accessibilityState).toMatchObject({ disabled: true });
    expect(raise.props.accessibilityState).toMatchObject({ disabled: false });
    fireEvent.press(lower);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("disables Raise at 100, and the screen reader hears it disabled", () => {
    const { lower, raise, onChange } = stepper("100");
    expect(raise.props.accessibilityState).toMatchObject({ disabled: true });
    expect(lower.props.accessibilityState).toMatchObject({ disabled: false });
    fireEvent.press(raise);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("steps by 5 between the bounds", () => {
    const { lower, raise, onChange } = stepper("50");
    fireEvent.press(raise);
    expect(onChange).toHaveBeenLastCalledWith("55");
    fireEvent.press(lower);
    expect(onChange).toHaveBeenLastCalledWith("45");
  });
});
