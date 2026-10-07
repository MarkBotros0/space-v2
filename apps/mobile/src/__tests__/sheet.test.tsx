import { fireEvent, screen } from "@testing-library/react-native";

import { ChoiceChips } from "../components/ChoiceChips";
import { Sheet, Text } from "../ui";
import { renderWithProviders } from "./helpers/render";

describe("Sheet", () => {
  it("renders its title and content only while visible", () => {
    const hidden = renderWithProviders(
      <Sheet visible={false} title="Graduate Sara?" onClose={() => undefined}>
        <Text>Body</Text>
      </Sheet>,
    );
    expect(screen.queryByText("Graduate Sara?")).toBeNull();

    // renderWithProviders' rerender would drop the providers, so remount.
    hidden.unmount();
    renderWithProviders(
      <Sheet visible title="Graduate Sara?" onClose={() => undefined}>
        <Text>Body</Text>
      </Sheet>,
    );
    expect(screen.getByText("Graduate Sara?")).toBeTruthy();
    expect(screen.getByText("Body")).toBeTruthy();
  });

  it("closes from the backdrop", () => {
    const onClose = jest.fn();
    renderWithProviders(
      <Sheet visible title="T" onClose={onClose}>
        <Text>Body</Text>
      </Sheet>,
    );
    fireEvent.press(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

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
});
