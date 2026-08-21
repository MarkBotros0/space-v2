import { fireEvent, render, screen } from "@testing-library/react-native";

import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  Screen,
  Text,
} from "../ui";
import { renderWithProviders } from "./helpers/render";

describe("Button", () => {
  it("calls onPress when pressed", () => {
    const onPress = jest.fn();
    render(<Button title="Save" onPress={onPress} />);
    fireEvent.press(screen.getByText("Save"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("does not call onPress while loading", () => {
    // A double-submit on a slow network is the single most common way to
    // create duplicate rows, so the guard belongs in the primitive.
    const onPress = jest.fn();
    render(<Button title="Save" onPress={onPress} loading />);
    fireEvent.press(screen.getByLabelText("Save"));
    expect(onPress).not.toHaveBeenCalled();
  });

  it("does not call onPress when disabled", () => {
    const onPress = jest.fn();
    render(<Button title="Save" onPress={onPress} disabled />);
    fireEvent.press(screen.getByLabelText("Save"));
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe("Input", () => {
  it("renders its label and reports changes", () => {
    const onChangeText = jest.fn();
    render(<Input label="Email" value="" onChangeText={onChangeText} />);
    fireEvent.changeText(screen.getByLabelText("Email"), "a@b.test");
    expect(onChangeText).toHaveBeenCalledWith("a@b.test");
  });

  it("shows an error message when given one", () => {
    render(<Input label="Email" value="" onChangeText={jest.fn()} error="Required" />);
    expect(screen.getByText("Required")).toBeTruthy();
  });
});

describe("states", () => {
  it("EmptyState shows its title and message", () => {
    render(<EmptyState title="No sessions" message="Nothing scheduled yet." />);
    expect(screen.getByText("No sessions")).toBeTruthy();
    expect(screen.getByText("Nothing scheduled yet.")).toBeTruthy();
  });

  it("ErrorState retries", () => {
    const onRetry = jest.fn();
    render(<ErrorState message="Could not load." onRetry={onRetry} />);
    fireEvent.press(screen.getByText("Try again"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("LoadingState is announced to screen readers", () => {
    render(<LoadingState />);
    expect(screen.getByLabelText("Loading")).toBeTruthy();
  });
});

describe("Card", () => {
  it("renders its children", () => {
    render(
      <Card>
        <Text>Inside card</Text>
      </Card>,
    );
    expect(screen.getByText("Inside card")).toBeTruthy();
  });
});

describe("Text", () => {
  it("renders its children", () => {
    render(<Text variant="title">Hello</Text>);
    expect(screen.getByText("Hello")).toBeTruthy();
  });
});

describe("Screen", () => {
  // This is the regression guard for the SafeAreaProvider trap (ruling P7): a
  // bare `<SafeAreaProvider>` renders none of its children under the test
  // renderer because it waits for an `onLayout` that never fires, yet
  // `render()` still returns a truthy `toJSON()` — a loose assertion would
  // pass against an empty tree. Asserting on rendered content via
  // `getByText` is the only way this test would actually fail if
  // `renderWithProviders` used a bare provider instead of one with
  // `initialMetrics`.
  it("renders its children inside the safe area", () => {
    renderWithProviders(
      <Screen>
        <Text>Screen content</Text>
      </Screen>,
    );
    expect(screen.getByText("Screen content")).toBeTruthy();
  });
});
