import { fireEvent, render, screen } from "@testing-library/react-native";
import { RefreshControl, ScrollView, Text as RNText } from "react-native";

import { ShellFrame } from "../design/layout/shell-frame";
import { BackLink, Eyebrow, PageTitle } from "../design/layout/page-title";
import { RouteError, RouteSkeleton } from "../design/layout/route-states";
import { StatCard } from "../design/students/stat-card";

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
