import { fireEvent, render, screen } from "@testing-library/react-native";

import { setReducedMotionForTests } from "../design/motion";
import { SegmentedControl } from "../design/ui/segmented-control";

const mockWithSpring = jest.fn((to: number) => to);

jest.mock("react-native-reanimated", () => {
  const actual = jest.requireActual("react-native-reanimated");
  return { ...actual, __esModule: true, default: actual.default, withSpring: (...args: [number]) => mockWithSpring(...args) };
});

beforeEach(() => mockWithSpring.mockClear());
afterEach(() => setReducedMotionForTests(null));

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
    expect(screen.getByRole("tab", { name: "Past" }).props.accessibilityState.selected).toBe(true);
    expect(screen.getByRole("tab", { name: "Upcoming" }).props.accessibilityState.selected).toBe(false);
  });

  it("is a tablist of tabs, so a screen reader says 'tab, n of m' (M10)", () => {
    render(<SegmentedControl options={OPTIONS} value="a" onChange={() => {}} />);
    expect(screen.getByTestId("segmented-control").props.accessibilityRole).toBe("tablist");
    expect(screen.getAllByRole("tab")).toHaveLength(2);
  });

  it("the thumb's radius is concentric with the track's (control-inner inside control)", () => {
    render(<SegmentedControl options={OPTIONS} value="a" onChange={() => {}} />);
    fireEvent(screen.getByTestId("segmented-control"), "layout", { nativeEvent: { layout: { width: 204, height: 48 } } });
    expect(screen.getByTestId("segmented-control").props.className).toContain("rounded-control");
    expect(screen.getByTestId("segmented-thumb").props.className).toContain("rounded-control-inner");
  });

  it("the thumb is a raised surface, lighter than the track in dark mode too", () => {
    render(<SegmentedControl options={OPTIONS} value="a" onChange={() => {}} />);
    fireEvent(screen.getByTestId("segmented-control"), "layout", { nativeEvent: { layout: { width: 204, height: 48 } } });
    expect(screen.getByTestId("segmented-thumb").props.className).toContain("bg-surface-raised");
  });

  it("segments meet the 44pt tap target", () => {
    render(<SegmentedControl options={OPTIONS} value="a" onChange={() => {}} />);
    expect(screen.getByRole("tab", { name: "Past" }).props.className).toContain("min-h-[44px]");
  });

  describe("thumb motion", () => {
    const layout = { nativeEvent: { layout: { width: 204, height: 48 } } };
    function slide() {
      const { rerender } = render(<SegmentedControl options={OPTIONS} value="a" onChange={() => {}} />);
      fireEvent(screen.getByTestId("segmented-control"), "layout", layout);
      rerender(<SegmentedControl options={OPTIONS} value="b" onChange={() => {}} />);
    }

    it("does not spring under reduced motion", () => {
      setReducedMotionForTests(true);
      slide();
      expect(mockWithSpring).not.toHaveBeenCalled();
    });

    it("springs to the new segment when motion is on, but not on first placement", () => {
      setReducedMotionForTests(false);
      slide();
      expect(mockWithSpring).toHaveBeenCalledTimes(1);
      expect(mockWithSpring.mock.calls[0]![0]).toBe(100);
    });
  });
});
