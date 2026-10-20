import { fireEvent, render, screen } from "@testing-library/react-native";
import { RefreshControl, ScrollView, StyleSheet, Text as RNText } from "react-native";

import { ShellFrame } from "../design/layout/shell-frame";
import { BackLink, Eyebrow, PageTitle } from "../design/layout/page-title";
import { RouteError, RouteSkeleton } from "../design/layout/route-states";
import { StatCard } from "../design/students/stat-card";
import { renderWithProviders } from "./helpers/render";

describe("ShellFrame", () => {
  it("adds a RefreshControl wired to onRefresh", () => {
    const onRefresh = jest.fn();
    render(
      <ShellFrame refreshing={false} onRefresh={onRefresh}>
        <RNText>body</RNText>
      </ShellFrame>,
    );
    const control = screen.UNSAFE_getByType(ScrollView).props.refreshControl;
    expect(control.type).toBe(RefreshControl);
    control.props.onRefresh();
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("has no RefreshControl without onRefresh", () => {
    render(
      <ShellFrame>
        <RNText>body</RNText>
      </ShellFrame>,
    );
    expect(screen.UNSAFE_getByType(ScrollView).props.refreshControl).toBeUndefined();
  });

  it("clears the floating tab bar, which sits above the bottom inset", () => {
    // Helper inset 34: the bar's bottom is max(16, 34), so the padding is 34 + 64 + 16, not v1's flat 96.
    renderWithProviders(
      <ShellFrame>
        <RNText>body</RNText>
      </ShellFrame>,
    );
    const style = StyleSheet.flatten(screen.UNSAFE_getByType(ScrollView).props.contentContainerStyle);
    expect(style.paddingBottom).toBe(114);
  });
});

describe("page title idiom", () => {
  it("renders v1's h1 + subtitle, eyebrow and back link", () => {
    const onBack = jest.fn();
    render(
      <>
        <BackLink label="Dashboard" onPress={onBack} />
        <PageTitle title="Attendance" subtitle="Your current season" />
        <Eyebrow tone="teal">Current season</Eyebrow>
      </>,
    );
    expect(screen.getByRole("header", { name: "Attendance" })).toBeTruthy();
    expect(screen.getByText("Your current season")).toBeTruthy();
    expect(screen.getByText("Current season")).toBeTruthy();
    fireEvent.press(screen.getByText("← Dashboard"));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe("route states", () => {
  it("skeleton is labelled Loading; error retries", () => {
    const onRetry = jest.fn();
    render(
      <>
        <RouteSkeleton />
        <RouteError onRetry={onRetry} />
      </>,
    );
    expect(screen.getByLabelText("Loading")).toBeTruthy();
    expect(screen.getByText("Something went wrong")).toBeTruthy();
    fireEvent.press(screen.getByText("Try again"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe("StatCard", () => {
  it("labels itself label: value and presses when given onPress", () => {
    const onPress = jest.fn();
    render(<StatCard label="Absence budget left" value="42%" sublabel="this season" onPress={onPress} />);
    fireEvent.press(screen.getByLabelText("Absence budget left: 42%"));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getByText("this season")).toBeTruthy();
  });

  it("gives the label one line per word, so a long word shrinks instead of splitting", () => {
    render(<StatCard label="Assignments" value="2" />);
    const label = screen.getByText("Assignments", { includeHiddenElements: true });
    expect(label.props.numberOfLines).toBe(1);
    expect(label.props.adjustsFontSizeToFit).toBe(true);
  });

  it("shows the flame for a positive streak", () => {
    render(<StatCard label="Streak" value="3" icon="flame" />);
    expect(screen.getByLabelText("Streak: 3")).toBeTruthy();
    expect(screen.getByTestId("stat-card-flame", { includeHiddenElements: true })).toBeTruthy();
  });

  it("renders the navy and teal variants", () => {
    render(
      <>
        <StatCard label="Seasons" value="1" variant="navy" />
        <StatCard label="Pending" value="2" variant="teal" />
      </>,
    );
    expect(screen.getByLabelText("Seasons: 1")).toBeTruthy();
    expect(screen.getByLabelText("Pending: 2")).toBeTruthy();
  });
});

describe("ProgressRing stroke colours", () => {
  // NativeWind consumed `stroke-*` classes without producing a style, so the
  // ring rendered with no stroke at all on device.
  const { Circle } = require("react-native-svg");
  const { ProgressRing } = require("../design/ui/progress-ring");

  it("draws a border-coloured track and a teal indicator by default", () => {
    const r = render(<ProgressRing value={50} />);
    const [track, indicator] = r.UNSAFE_getAllByType(Circle);
    expect(track.props.stroke).toBe("#E5E7EB");
    expect(indicator.props.stroke).toBe("#7DCED1");
  });

  it("takes v1's indicator override as a stroke-<ramp>-<step> class", () => {
    const r = render(<ProgressRing value={80} indicatorClassName="stroke-error-500" />);
    expect(r.UNSAFE_getAllByType(Circle)[1].props.stroke).toBe("#EF4444");
  });
});

describe("Text letter spacing", () => {
  // tracking-* is em-based; NativeWind dropped it, so v1's widest eyebrows
  // rendered ~25% narrower. Text resolves em × font size itself.
  const { StyleSheet } = require("react-native");
  const { Text } = require("../design/ui/text");
  const spacing = (className: string) => {
    render(<Text className={className}>Label</Text>);
    return StyleSheet.flatten(screen.getByText("Label").props.style).letterSpacing;
  };

  it("resolves tracking-widest at 10px to 1px", () => {
    expect(spacing("text-[10px] font-bold uppercase tracking-widest")).toBeCloseTo(1);
  });

  it("uses the size class and defaults to 16px", () => {
    expect(spacing("text-2xl tracking-tight")).toBeCloseTo(-0.6);
    expect(spacing("tracking-wide")).toBeCloseTo(0.4);
  });

  it("adds nothing without a tracking class", () => {
    expect(spacing("text-sm")).toBeUndefined();
  });
});

