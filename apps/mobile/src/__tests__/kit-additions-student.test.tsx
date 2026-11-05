import { fireEvent, render, screen, within } from "@testing-library/react-native";
import { Text as RNText } from "react-native";

import { SaveBar } from "../design/layout/save-bar";
import { Screen } from "../design/layout/screen";
import { setReducedMotionForTests } from "../design/motion";
import { Button, buttonTextVariants, buttonVariants } from "../design/ui/button";
import { GroupedList, ListRow } from "../design/ui/grouped-list";
import { HeroCard } from "../design/ui/hero-card";
import { StatTile } from "../design/ui/stat-tile";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeScopes, makeUser } from "./helpers/session";

jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock("../lib/online", () => ({ useIsOnline: () => true }));
jest.mock("../hooks/use-notifications", () => ({
  useUnreadCount: () => ({ data: 0 }),
  useNotifications: () => ({ data: { pages: [{ items: [] }] } }),
  useMarkRead: () => ({ mutate: () => {}, isPending: false }),
  flattenNotifications: () => [],
}));

beforeEach(() => {
  setReducedMotionForTests(true);
  useSessionStore.getState().setSession(makeUser("STUDENT"), makeScopes());
});
afterEach(() => setReducedMotionForTests(null));

describe("HeroCard tone", () => {
  it("defaults to the surface look", () => {
    render(<HeroCard eyebrow="Next" title="Intro" />);
    expect(screen.getByTestId("hero-card").props.className).toContain("bg-surface");
  });

  it("brand uses the hero tokens", () => {
    render(<HeroCard tone="brand" eyebrow="Next" title="Intro" meta="Tue" />);
    expect(screen.getByTestId("hero-card").props.className).toContain("bg-hero");
    expect(screen.getByText("Intro").props.className).toContain("text-hero-foreground");
    expect(screen.getByText("Next").props.className).toContain("text-hero-eyebrow");
    expect(screen.getByText("Tue").props.className).toContain("text-hero-muted");
  });
});

describe("Button onHero", () => {
  it("carries the on-hero tokens", () => {
    expect(buttonVariants({ variant: "onHero" })).toContain("bg-on-hero");
    expect(buttonTextVariants({ variant: "onHero" })).toContain("text-on-hero-foreground");
  });

  it("renders and presses", () => {
    const onPress = jest.fn();
    render(<Button variant="onHero" onPress={onPress}>Check in</Button>);
    fireEvent.press(screen.getByRole("button", { name: "Check in" }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe("ListRow lines and leading", () => {
  it("titleLines defaults to 1 and can be 2; subtitleLines defaults to 2", () => {
    render(
      <>
        <ListRow title="Default title" subtitle="sub" />
        <ListRow title="Wrapped title" titleLines={2} subtitle="sub2" subtitleLines={3} />
      </>,
    );
    expect(screen.getByText("Default title").props.numberOfLines).toBe(1);
    expect(screen.getByText("sub").props.numberOfLines).toBe(2);
    expect(screen.getByText("Wrapped title").props.numberOfLines).toBe(2);
    expect(screen.getByText("sub2").props.numberOfLines).toBe(3);
  });

  it("renders leading before the title", () => {
    render(<ListRow title="Row" leading={<RNText>L</RNText>} />);
    expect(screen.getByText("L")).toBeTruthy();
  });
});

describe("GroupedList headerAction", () => {
  it("fires onPress from a button on the header line", () => {
    const onPress = jest.fn();
    render(
      <GroupedList header="Open work" headerAction={{ label: "See all", onPress }}>
        <ListRow title="x" />
      </GroupedList>,
    );
    fireEvent.press(screen.getByRole("button", { name: "See all" }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("has no action by default", () => {
    render(<GroupedList header="Open work"><ListRow title="x" /></GroupedList>);
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("StatTile onPress", () => {
  it("is a button carrying the label when pressable", () => {
    const onPress = jest.fn();
    render(<StatTile value={3} label="Pending" onPress={onPress} />);
    const btn = screen.getByRole("button", { name: /Pending: 3/ });
    fireEvent.press(btn);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("is not a button without onPress", () => {
    render(<StatTile value={3} label="Pending" />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("Screen compactTitle", () => {
  const compact = () => screen.getByTestId("compact-header", { includeHiddenElements: true });

  it("overrides the collapsed title", () => {
    renderWithProviders(
      <Screen title="Work" compactTitle="Open work"><RNText>b</RNText></Screen>,
    );
    expect(within(compact()).getByText("Open work", { includeHiddenElements: true })).toBeTruthy();
  });

  it("Home still says Today when unset", () => {
    renderWithProviders(<Screen home><RNText>b</RNText></Screen>);
    expect(within(compact()).getByText("Today", { includeHiddenElements: true })).toBeTruthy();
  });
});

describe("SaveBar secondary and disabled", () => {
  it("renders both actions and fires each handler", () => {
    const primary = jest.fn();
    const secondary = jest.fn();
    renderWithProviders(
      <SaveBar label="Submit" onPress={primary} secondary={{ label: "Save draft", onPress: secondary }} />,
    );
    fireEvent.press(screen.getByRole("button", { name: "Save draft" }));
    fireEvent.press(screen.getByRole("button", { name: "Submit" }));
    expect(secondary).toHaveBeenCalledTimes(1);
    expect(primary).toHaveBeenCalledTimes(1);
  });

  it("disabled blocks the primary only", () => {
    const primary = jest.fn();
    const secondary = jest.fn();
    renderWithProviders(
      <SaveBar label="Submit" disabled onPress={primary} secondary={{ label: "Save draft", onPress: secondary }} />,
    );
    fireEvent.press(screen.getByRole("button", { name: "Submit" }));
    fireEvent.press(screen.getByRole("button", { name: "Save draft" }));
    expect(primary).not.toHaveBeenCalled();
    expect(secondary).toHaveBeenCalledTimes(1);
  });

  it("a disabled secondary does not fire", () => {
    const secondary = jest.fn();
    renderWithProviders(
      <SaveBar label="Submit" onPress={() => {}} secondary={{ label: "Save draft", onPress: secondary, disabled: true }} />,
    );
    fireEvent.press(screen.getByRole("button", { name: "Save draft" }));
    expect(secondary).not.toHaveBeenCalled();
  });

  it("is one button without secondary", () => {
    renderWithProviders(<SaveBar label="Save" onPress={() => {}} />);
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });
});
