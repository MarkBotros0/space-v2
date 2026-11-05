import { fireEvent, screen } from "@testing-library/react-native";

import { ChoiceChips } from "../components/ChoiceChips";
import { renderWithProviders } from "./helpers/render";

describe("ChoiceChips", () => {
  it("reports the pressed option's value and marks the current one selected", () => {
    const onChange = jest.fn();
    renderWithProviders(
      <ChoiceChips
        label="Season"
        options={[
          { value: null, label: "None" },
          { value: 7, label: "Spring 2099" },
        ]}
        value={null}
        onChange={onChange}
      />,
    );
    expect(screen.getByRole("radio", { name: "None" }).props.accessibilityState).toEqual({ selected: true });
    fireEvent.press(screen.getByText("Spring 2099"));
    expect(onChange).toHaveBeenCalledWith(7);
  });

  it("shows its error", () => {
    renderWithProviders(
      <ChoiceChips label="Season" options={[{ value: 1, label: "A" }]} value={1} onChange={jest.fn()} error="Pick one" />,
    );
    expect(screen.getByText("Pick one")).toBeTruthy();
  });
});
