import { fireEvent, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { FormScreen } from "../design/layout/form-screen";
import { renderWithProviders } from "./helpers/render";

jest.mock("expo-router", () => ({ ...jest.requireActual("expo-router"), useRouter: () => ({ back: jest.fn(), push: jest.fn() }), Link: "Link" }));

describe("FormScreen", () => {
  it("renders title, children and a save bar that calls onSave", () => {
    const onSave = jest.fn();
    renderWithProviders(
      <FormScreen title="New user" saveLabel="Create user" onSave={onSave}>
        <Text>field</Text>
      </FormScreen>,
    );
    expect(screen.getAllByText("New user").length).toBeGreaterThan(0);
    expect(screen.getByText("field")).toBeTruthy();
    expect(screen.getByTestId("save-bar")).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "Create user" }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("does not save while saving", () => {
    const onSave = jest.fn();
    renderWithProviders(
      <FormScreen title="T" saveLabel="Save" onSave={onSave} saving>
        <Text>x</Text>
      </FormScreen>,
    );
    fireEvent.press(screen.getByText("Save"));
    expect(onSave).not.toHaveBeenCalled();
  });

  it("leaves room under the content equal to the measured bar height", () => {
    renderWithProviders(
      <FormScreen title="T" saveLabel="Save" onSave={() => {}} saveHint="hint">
        <Text>x</Text>
      </FormScreen>,
    );
    expect(screen.getByTestId("form-screen-spacer").props.style).toEqual({ height: 0 });
    fireEvent(screen.getByTestId("save-bar"), "layout", { nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 120 } } });
    expect(screen.getByTestId("form-screen-spacer").props.style).toEqual({ height: 120 });
    expect(screen.getByText("hint")).toBeTruthy();
  });
});
