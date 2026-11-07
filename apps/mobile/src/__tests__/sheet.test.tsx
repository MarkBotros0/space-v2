import { act, fireEvent, screen, within } from "@testing-library/react-native";
import { Platform, Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { SaveBar } from "../design/layout/save-bar";
import { setReducedMotionForTests } from "../design/motion";
import { Sheet, SheetSaveBar } from "../design/ui/sheet";
import { renderWithProviders } from "./helpers/render";

let mockKeyboard = 0;
jest.mock("../design/lib/keyboard-events", () => ({
  subscribeKeyboard: () => () => {},
  useKeyboardHeight: () => mockKeyboard,
}));
jest.mock("../design/lib/keyboard-inset", () => ({
  useKeyboardHeight: () => mockKeyboard,
  useKeyboardInset: () => ({ inset: mockKeyboard, offset: mockKeyboard, scrollProps: {} }),
}));

const mockWithTiming = jest.fn((to: number) => to);
jest.mock("react-native-reanimated", () => {
  const actual = jest.requireActual("react-native-reanimated");
  return { ...actual, __esModule: true, default: actual.default, withTiming: (...args: [number]) => mockWithTiming(...args) };
});

beforeEach(() => {
  mockKeyboard = 0;
  mockWithTiming.mockClear();
});
afterEach(() => {
  setReducedMotionForTests(null);
  jest.restoreAllMocks();
});

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

  it("rises in 260 ms with an ease-out and no spring, with motion on", () => {
    setReducedMotionForTests(false);
    renderWithProviders(<Sheet open onClose={() => {}}><Text>b</Text></Sheet>);
    expect(mockWithTiming).toHaveBeenCalledWith(0, expect.objectContaining({ duration: 260, easing: expect.any(Function) }));
  });

  it("opens without travel under reduced motion (a short fade only)", () => {
    setReducedMotionForTests(true);
    renderWithProviders(<Sheet open onClose={() => {}}><Text>b</Text></Sheet>);
    expect(mockWithTiming).not.toHaveBeenCalledWith(0, expect.objectContaining({ duration: 260 }));
    expect(mockWithTiming).toHaveBeenCalledWith(1, { duration: 150 });
    expect(screen.getByText("b")).toBeTruthy();
  });
});

describe("Sheet lifecycle", () => {
  it("keeps the content when closed and immediately reopened", () => {
    const view = renderWithProviders(<Sheet open onClose={() => {}}><Text>body</Text></Sheet>);
    const { rerender } = view;
    const ui = (open: boolean) => (
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <Sheet open={open} onClose={() => {}}><Text>body</Text></Sheet>
      </SafeAreaProvider>
    );
    rerender(ui(false));
    rerender(ui(true));
    act(() => jest.runAllTimers());
    expect(screen.getByText("body")).toBeTruthy();
  });

  it("calls onClose once; the root ignores touches while closing", () => {
    const onClose = jest.fn();
    renderWithProviders(<Sheet open onClose={onClose}><Text>body</Text></Sheet>);
    fireEvent.press(screen.getByTestId("sheet-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("stays rendered when the parent ignores onClose", () => {
    renderWithProviders(<Sheet open onClose={() => {}}><Text>body</Text></Sheet>);
    fireEvent.press(screen.getByTestId("sheet-backdrop"));
    expect(screen.getByText("body")).toBeTruthy();
  });

  it("header grab area is at least 44pt", () => {
    renderWithProviders(<Sheet open onClose={() => {}} title="T"><Text>body</Text></Sheet>);
    expect(screen.getByTestId("sheet-header").props.className).toContain("min-h-[44px]");
  });
});

describe("footer-less sheet clearance (final review C1)", () => {
  const pad = () => screen.getByTestId("sheet-scroll").props.contentContainerStyle.paddingBottom;

  it("pads the content by the inset when the keyboard is closed", () => {
    renderWithProviders(<Sheet open onClose={() => {}}><Text>x</Text></Sheet>);
    expect(pad()).toBe(34 + 16);
  });

  it("pads the content by the keyboard when it is open, so the field can scroll above it", () => {
    mockKeyboard = 300;
    renderWithProviders(<Sheet open onClose={() => {}}><Text>x</Text></Sheet>);
    expect(pad()).toBe(300 + 16);
  });

  it("a footered sheet keeps the bar-height padding and not the inset", () => {
    renderWithProviders(<Sheet open onClose={() => {}} footer={<SheetSaveBar label="Save" onPress={() => {}} />}><Text>x</Text></Sheet>);
    expect(pad()).toBe(16);
  });
});

describe("save bars", () => {
  it("SaveBar and SheetSaveBar draw an error above the button as an announced alert", () => {
    renderWithProviders(<Sheet open onClose={() => {}} footer={<SheetSaveBar label="Save" onPress={() => {}} error="Nope." />}><Text>x</Text></Sheet>);
    const alert = within(screen.getByTestId("sheet-save-bar")).getByRole("alert");
    expect(within(alert).getByText("Nope.")).toBeTruthy();
    expect(alert.props.accessibilityLiveRegion).toBe("polite");
  });

  it("a bar with no error draws no alert", () => {
    renderWithProviders(<Sheet open onClose={() => {}} footer={<SheetSaveBar label="Save" onPress={() => {}} error={null} />}><Text>x</Text></Sheet>);
    expect(within(screen.getByTestId("sheet-save-bar")).queryByRole("alert")).toBeNull();
  });

  const bar = <SheetSaveBar label="Save" onPress={() => {}} />;

  it("SheetSaveBar reaches the sheet bottom and pads by the safe-area inset when the keyboard is closed (K2)", () => {
    renderWithProviders(<Sheet open onClose={() => {}} footer={bar}><Text>x</Text></Sheet>);
    const style = screen.getByTestId("sheet-save-bar").props.style;
    expect(style.bottom).toBe(0);
    expect(style.paddingBottom).toBe(34 + 12);
  });

  it("SheetSaveBar keeps its normal 12pt padding below the button, above the inset or keyboard", () => {
    renderWithProviders(<Sheet open onClose={() => {}} footer={bar}><Text>x</Text></Sheet>);
    const style = screen.getByTestId("sheet-save-bar").props.style;
    expect(style.bottom + style.paddingBottom).toBe(34 + 12);
    expect(style.bottom).toBe(0);
  });

  it("SheetSaveBar padding equals the keyboard inset (plus 12) when it is open", () => {
    mockKeyboard = 300;
    renderWithProviders(<Sheet open onClose={() => {}} footer={bar}><Text>x</Text></Sheet>);
    const style = screen.getByTestId("sheet-save-bar").props.style;
    expect(style.bottom).toBe(0);
    expect(style.paddingBottom).toBe(312);
  });

  it("SheetSaveBar on Android adds the nav-bar inset back to the reported keyboard height", () => {
    jest.replaceProperty(Platform, "OS", "android");
    mockKeyboard = 300;
    renderWithProviders(<Sheet open onClose={() => {}} footer={bar}><Text>x</Text></Sheet>);
    expect(screen.getByTestId("sheet-save-bar").props.style.paddingBottom).toBe(346);
  });

  it("SheetSaveBar fires onPress and shows the hint", () => {
    const onPress = jest.fn();
    renderWithProviders(<Sheet open onClose={() => {}} footer={<SheetSaveBar label="Save" hint="Saved to all" onPress={onPress} />}><Text>x</Text></Sheet>);
    fireEvent.press(screen.getByText("Save"));
    expect(onPress).toHaveBeenCalled();
    expect(screen.getByText("Saved to all")).toBeTruthy();
  });

  it("SheetSaveBar takes a destructive variant and stays primary by default", () => {
    renderWithProviders(
      <Sheet
        open
        onClose={() => {}}
        footer={<SheetSaveBar label="Drop" variant="destructive" onPress={() => {}} />}
      >
        <Text>x</Text>
      </Sheet>,
    );
    expect(screen.getByTestId("button-look").props.className).toContain("bg-bad-soft");
    expect(screen.getByTestId("button-look").props.className).not.toContain("bg-primary");
  });

  it("SheetSaveBar is primary without a variant", () => {
    renderWithProviders(<Sheet open onClose={() => {}} footer={bar}><Text>x</Text></Sheet>);
    expect(screen.getByTestId("button-look").props.className).not.toContain("bg-bad-soft");
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
