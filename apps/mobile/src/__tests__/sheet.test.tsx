import { act, fireEvent, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { SaveBar } from "../design/layout/save-bar";
import { setReducedMotionForTests } from "../design/motion";
import { Sheet, SheetSaveBar } from "../design/ui/sheet";
import { renderWithProviders } from "./helpers/render";

let mockKeyboard = 0;
jest.mock("../design/lib/keyboard-inset", () => ({ useKeyboardHeight: () => mockKeyboard }));

const mockWithSpring = jest.fn((to: number) => to);
jest.mock("react-native-reanimated", () => {
  const actual = jest.requireActual("react-native-reanimated");
  return { ...actual, __esModule: true, default: actual.default, withSpring: (...args: [number]) => mockWithSpring(...args) };
});

beforeEach(() => {
  mockKeyboard = 0;
  mockWithSpring.mockClear();
});
afterEach(() => setReducedMotionForTests(null));

describe("Sheet", () => {
  it("renders nothing when closed", () => {
    renderWithProviders(<Sheet open={false} onClose={() => {}} title="Edit"><Text>body</Text></Sheet>);
    expect(screen.queryByText("body")).toBeNull();
    expect(screen.queryByText("Edit")).toBeNull();
  });

  it("renders title and children when open", () => {
    renderWithProviders(<Sheet open onClose={() => {}} title="Edit"><Text>body</Text></Sheet>);
    expect(screen.getByText("Edit")).toBeTruthy();
    expect(screen.getByText("body")).toBeTruthy();
  });

  it("calls onClose when the backdrop is pressed", () => {
    const onClose = jest.fn();
    renderWithProviders(<Sheet open onClose={onClose}><Text>body</Text></Sheet>);
    fireEvent.press(screen.getByTestId("sheet-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose on hardware back (onRequestClose)", () => {
    const onClose = jest.fn();
    renderWithProviders(<Sheet open onClose={onClose}><Text>body</Text></Sheet>);
    act(() => screen.UNSAFE_getByType(require("react-native").Modal).props.onRequestClose());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("springs in with motion on", () => {
    setReducedMotionForTests(false);
    renderWithProviders(<Sheet open onClose={() => {}}><Text>b</Text></Sheet>);
    expect(mockWithSpring).toHaveBeenCalledWith(0, expect.objectContaining({ damping: 22 }));
  });

  it("opens without a spring under reduced motion", () => {
    setReducedMotionForTests(true);
    renderWithProviders(<Sheet open onClose={() => {}}><Text>b</Text></Sheet>);
    expect(mockWithSpring).not.toHaveBeenCalled();
    expect(screen.getByText("b")).toBeTruthy();
  });
});

describe("save bars", () => {
  const bar = <SheetSaveBar label="Save" onPress={() => {}} />;

  it("SheetSaveBar sits on the bottom safe-area inset when the keyboard is closed", () => {
    renderWithProviders(<Sheet open onClose={() => {}} footer={bar}><Text>x</Text></Sheet>);
    expect(screen.getByTestId("sheet-save-bar").props.style.bottom).toBe(34);
  });

  it("SheetSaveBar bottom offset equals the keyboard inset when it is open", () => {
    mockKeyboard = 300;
    renderWithProviders(<Sheet open onClose={() => {}} footer={bar}><Text>x</Text></Sheet>);
    expect(screen.getByTestId("sheet-save-bar").props.style.bottom).toBe(300);
  });

  it("SheetSaveBar fires onPress and shows the hint", () => {
    const onPress = jest.fn();
    renderWithProviders(<Sheet open onClose={() => {}} footer={<SheetSaveBar label="Save" hint="Saved to all" onPress={onPress} />}><Text>x</Text></Sheet>);
    fireEvent.press(screen.getByText("Save"));
    expect(onPress).toHaveBeenCalled();
    expect(screen.getByText("Saved to all")).toBeTruthy();
  });

  it("SaveBar sits above the shell padding when the keyboard is closed", () => {
    renderWithProviders(<SaveBar label="Save" onPress={() => {}} />);
    expect(screen.getByTestId("save-bar").props.style.bottom).toBe(114);
  });

  it("SaveBar lifts by the keyboard when it is open", () => {
    mockKeyboard = 250;
    renderWithProviders(<SaveBar label="Save" onPress={() => {}} />);
    expect(screen.getByTestId("save-bar").props.style.bottom).toBe(250);
  });
});
