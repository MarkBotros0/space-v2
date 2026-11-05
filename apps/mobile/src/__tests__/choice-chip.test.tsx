import { fireEvent, screen } from "@testing-library/react-native";

import { ChoiceChip } from "../design/ui/choice-chip";
import { renderWithProviders } from "./helpers/render";

describe("ChoiceChip", () => {
  it("is a button that reports its selected state and presses", () => {
    const onPress = jest.fn();
    renderWithProviders(<ChoiceChip label="Mentor" selected onPress={onPress} />);
    const chip = screen.getByRole("button", { name: "Mentor" });
    expect(chip.props.accessibilityState).toEqual({ selected: true });
    fireEvent.press(chip);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
  it("is 44pt tall, round, and unselected has a control border", () => {
    renderWithProviders(<ChoiceChip label="Mentor" selected={false} onPress={() => {}} />);
    const chip = screen.getByRole("button", { name: "Mentor" });
    expect(chip.props.accessibilityState).toEqual({ selected: false });
    expect(chip.props.className).toContain("min-h-[44px]");
    expect(chip.props.className).toContain("rounded-full");
    expect(chip.props.className).toContain("border-control-border");
  });
  it("uses accessibilityLabel when given and caps font scaling", () => {
    renderWithProviders(<ChoiceChip label="A" accessibilityLabel="Role A" selected onPress={() => {}} />);
    expect(screen.getByRole("button", { name: "Role A" })).toBeTruthy();
    expect(screen.getByText("A").props.maxFontSizeMultiplier).toBe(1.3);
  });
});
