import { fireEvent, screen, within } from "@testing-library/react-native";
import { ScrollView, StyleSheet, Text } from "react-native";

import { FormScreen } from "../design/layout/form-screen";
import { renderStacked, renderWithProviders } from "./helpers/render";

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

  it("pins the save bar in Screen's footer and pads the content by its height", () => {
    renderStacked(
      <FormScreen title="T" saveLabel="Save" onSave={() => {}} saveHint="hint">
        <Text>x</Text>
      </FormScreen>,
    );
    expect(within(screen.getByTestId("screen-footer")).getByTestId("save-bar")).toBeTruthy();
    expect(within(screen.UNSAFE_getByType(ScrollView)).queryByTestId("save-bar")).toBeNull();
    expect(screen.queryByTestId("form-screen-spacer")).toBeNull();
    fireEvent(screen.getByTestId("screen-footer"), "layout", { nativeEvent: { layout: { height: 120 } } });
    const pad = StyleSheet.flatten(screen.UNSAFE_getByType(ScrollView).props.contentContainerStyle).paddingBottom;
    expect(pad).toBe(120 + 34 + 16);
    expect(screen.getByText("hint")).toBeTruthy();
  });
});
