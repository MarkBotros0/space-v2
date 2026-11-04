import { StyleSheet } from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";

import { setReducedMotionForTests } from "../design/motion";
import { InlineError, RouteError, RouteSkeleton } from "../design/layout/route-states";
import { EmptyState } from "../design/ui/empty-state";
import { Skeleton } from "../design/ui/skeleton";

const mockWithRepeat = jest.fn((anim: unknown) => anim);

jest.mock("react-native-reanimated", () => {
  const actual = jest.requireActual("react-native-reanimated");
  return { ...actual, __esModule: true, default: actual.default, withRepeat: (...args: [unknown]) => mockWithRepeat(...args) };
});

beforeEach(() => mockWithRepeat.mockClear());
afterEach(() => setReducedMotionForTests(null));

describe("EmptyState", () => {
  it("calls onPress from the action button", () => {
    const onPress = jest.fn();
    render(<EmptyState title="Nothing here" action={{ label: "Add one", onPress }} />);
    fireEvent.press(screen.getByRole("button", { name: "Add one" }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("still accepts a node as the action", () => {
    render(<EmptyState title="Nothing here" action={<></>} />);
    expect(screen.getByText("Nothing here")).toBeTruthy();
  });
});

describe("RouteError / InlineError", () => {
  it("retry calls onRetry", () => {
    const onRetry = jest.fn();
    render(<RouteError onRetry={onRetry} />);
    fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("inline retry calls onRetry", () => {
    const onRetry = jest.fn();
    render(<InlineError message="Failed" onRetry={onRetry} />);
    fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe("Skeleton", () => {
  it("does not run a looping animation under reduced motion", () => {
    setReducedMotionForTests(true);
    render(<Skeleton height={20} width={100} />);
    expect(mockWithRepeat).not.toHaveBeenCalled();
    expect(StyleSheet.flatten(screen.getByTestId("skeleton-pulse", { includeHiddenElements: true }).props.style)).toMatchObject({ opacity: 0.7 });
    // The size sits on the plain layout box, so percentages resolve against the real parent.
    expect(StyleSheet.flatten(screen.getByTestId("skeleton", { includeHiddenElements: true }).props.style)).toMatchObject({ width: 100, height: 20 });
  });

  it("shimmers when motion is on", () => {
    setReducedMotionForTests(false);
    render(<Skeleton height={20} />);
    expect(mockWithRepeat).toHaveBeenCalledTimes(1);
  });

  it("RouteSkeleton renders as Loading", () => {
    setReducedMotionForTests(true);
    render(<RouteSkeleton />);
    expect(screen.getByLabelText("Loading")).toBeTruthy();
  });
});
