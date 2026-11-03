import { fireEvent, render, screen } from "@testing-library/react-native";
import { AccessibilityInfo, ScrollView, StyleSheet } from "react-native";

import { Card, EmptyState, ErrorState, LoadingState, Screen, Text } from "../ui";
import { spacing } from "../theme/tokens";
import { renderWithProviders } from "./helpers/render";

// `getByText(...).parent` returns the nearest test instance, which is our
// composite `Text`/`View` wrapper components, not necessarily the host
// element carrying the style we want to assert on. Walk up to the nearest
// host `View` instead. (Typed off `getByText`'s own return type rather than
// importing `ReactTestInstance` from `react-test-renderer` directly — that
// package ships no types of its own and pulls in `@types/react-test-renderer`
// only transitively, which `tsc` won't resolve from this file.)
type TestInstance = ReturnType<typeof screen.getByText>;

function closestHostView(node: TestInstance): TestInstance {
  let current: TestInstance | null = node.parent;
  while (current && current.type !== "View") {
    current = current.parent;
  }
  if (!current) {
    throw new Error("No host View found in ancestor chain");
  }
  return current;
}

describe("states", () => {
  it("EmptyState shows its title and message", () => {
    render(<EmptyState title="No sessions" message="Nothing scheduled yet." />);
    expect(screen.getByText("No sessions")).toBeTruthy();
    expect(screen.getByText("Nothing scheduled yet.")).toBeTruthy();
  });

  // Fix 6: the action slot is an untested branch every list's empty state
  // will rely on (e.g. a "Create one" CTA).
  it("EmptyState renders the action slot when provided", () => {
    render(
      <EmptyState
        title="No sessions"
        message="Nothing scheduled yet."
        action={<Text>Create one</Text>}
      />,
    );
    expect(screen.getByText("Create one")).toBeTruthy();
  });

  it("ErrorState retries", () => {
    const onRetry = jest.fn();
    render(<ErrorState message="Could not load." onRetry={onRetry} />);
    fireEvent.press(screen.getByText("Try again"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  // Fix 12: without accessibilityRole="alert" (+ accessibilityLiveRegion for
  // Android), an error replacing content on screen goes unannounced.
  it("ErrorState announces itself as an alert without swallowing the retry button", () => {
    render(<ErrorState message="Could not load." onRetry={jest.fn()} />);
    const alertContainer = screen.UNSAFE_getByProps({ accessibilityRole: "alert" });
    expect(alertContainer.props.accessibilityLiveRegion).toBe("assertive");
    // The retry Button must still be independently reachable — it would not
    // be if the container above were also marked `accessible`.
    expect(screen.getByLabelText("Try again")).toBeTruthy();
  });

  // Fix C: accessibilityRole="alert" is inert on iOS unless the node is an
  // accessibility element (it deliberately isn't, so the retry button stays
  // reachable — see above), so an imperative announcement is the only
  // mechanism that reliably reaches VoiceOver. Removing the
  // `AccessibilityInfo.announceForAccessibility` call in states.tsx's
  // ErrorState fails this.
  it("ErrorState announces its message imperatively for screen readers", () => {
    const announceSpy = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    render(<ErrorState message="Could not load." onRetry={jest.fn()} />);
    expect(announceSpy).toHaveBeenCalledWith("Could not load.");
    announceSpy.mockRestore();
  });

  it("ErrorState re-announces when the message changes", () => {
    const announceSpy = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    const { rerender } = render(<ErrorState message="First error" onRetry={jest.fn()} />);
    rerender(<ErrorState message="Second error" onRetry={jest.fn()} />);
    expect(announceSpy).toHaveBeenCalledWith("Second error");
    announceSpy.mockRestore();
  });

  // Fix 3: `accessibilityRole`/`accessibilityLabel` on a View do nothing for
  // VoiceOver unless `accessible` is also set — `isAccessibilityElement`
  // follows `accessible`, which defaults to false. RNTL matches props, not
  // native semantics, so the pre-fix test still passed; asserting `accessible`
  // directly is the only way this test fails if the prop is removed.
  it("LoadingState is an accessibility element so VoiceOver can read its label", () => {
    render(<LoadingState />);
    const node = screen.getByLabelText("Loading");
    expect(node.props.accessible).toBe(true);
    expect(node.props.accessibilityRole).toBe("progressbar");
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

  it("renders as a pressable row when given onPress", () => {
    const onPress = jest.fn();
    render(
      <Card onPress={onPress}>
        <Text>Tap me</Text>
      </Card>,
    );
    fireEvent.press(screen.getByText("Tap me"));
    expect(onPress).toHaveBeenCalledTimes(1);
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

  // Fix 6: the scroll branch (a separate component, ScrollView vs. View) was
  // entirely untested.
  it("renders its children when scroll is enabled", () => {
    renderWithProviders(
      <Screen scroll>
        <Text>Scrolled content</Text>
      </Screen>,
    );
    expect(screen.getByText("Scrolled content")).toBeTruthy();
  });

  // Fix 6: onRefresh/RefreshControl wiring was untested.
  it("wires refreshing and onRefresh into the ScrollView's RefreshControl", () => {
    const onRefresh = jest.fn();
    renderWithProviders(
      <Screen onRefresh={onRefresh} refreshing>
        <Text>Refreshable content</Text>
      </Screen>,
    );
    const scrollView = screen.UNSAFE_getByType(ScrollView);
    expect(scrollView.props.refreshControl.props.onRefresh).toBe(onRefresh);
    expect(scrollView.props.refreshControl.props.refreshing).toBe(true);
  });

  // Fix 4: `<Screen scroll><EmptyState /></Screen>` used to render nothing
  // visible because the scroll branch's contentContainerStyle was a bare
  // `{ padding }` with no flexGrow, so a `flex: 1` child collapsed to zero
  // height. RNTL's renderer doesn't run a real layout pass, so the only way
  // to guard the actual fix (not just "some text exists somewhere") is to
  // assert the contentContainerStyle carries `flexGrow: 1`. Removing that
  // from Screen.tsx's contentContainerStyle array fails this.
  it("gives the scroll content container flexGrow so flex:1 children can't collapse", () => {
    renderWithProviders(
      <Screen scroll>
        <Text>Scrolled content</Text>
      </Screen>,
    );
    const scrollView = screen.UNSAFE_getByType(ScrollView);
    expect(scrollView.props.contentContainerStyle).toEqual(
      expect.arrayContaining([expect.objectContaining({ flexGrow: 1 })]),
    );
  });

  // Fix 5b/Fix B: Task 7's tab bar already consumes the bottom inset, so a
  // screen that omits "bottom" from `edges` must not double-pad — but it
  // must still keep the *standard* `spacing.md` padding on that edge (16,
  // not 0 and not the full 50 with the inset summed in). Dropping the edge
  // from `edges` used to zero the edge outright via a specific-edge
  // override that (per the Fix A bug) also killed the `padding` shorthand
  // for it; the fixed per-edge sum keeps `pad` even when the inset is 0.
  it("keeps the standard padding on a dropped edge instead of zeroing it", () => {
    renderWithProviders(
      <Screen edges={["top", "left", "right"]}>
        <Text>Content</Text>
      </Screen>,
    );
    const container = closestHostView(screen.getByText("Content"));
    expect(container).toHaveStyle({ paddingBottom: spacing.md });
  });

  // From helpers/render.tsx's initialMetrics: insets = { top: 47, left: 0,
  // right: 0, bottom: 34 }. Derived from the real `spacing.md` token (rather
  // than a second hardcoded literal) so this stays honest if that token
  // changes.
  const insets = { top: 47, left: 0, right: 0, bottom: 34 };

  // Fix A/Fix B: this is the core regression guard. Before the fix,
  // `insetStyle` unconditionally emitted `paddingLeft`/`paddingRight` on the
  // same style node as the `padding: spacing.md` shorthand; Yoga resolves a
  // specific edge before the shorthand regardless of array order, so the
  // shorthand — and with it every scrolling screen's horizontal gutter —
  // was silently discarded. Reverting the per-edge sum in Screen.tsx back to
  // an `insetStyle` + `padding` shorthand pair fails this on paddingLeft/
  // paddingRight (both would read 0 instead of 16).
  it("sums the standard padding on top of the safe-area insets by default", () => {
    renderWithProviders(
      <Screen>
        <Text>Content</Text>
      </Screen>,
    );
    const container = closestHostView(screen.getByText("Content"));
    expect(container).toHaveStyle({
      paddingTop: spacing.md + insets.top,
      paddingBottom: spacing.md + insets.bottom,
      paddingLeft: spacing.md + insets.left,
      paddingRight: spacing.md + insets.right,
    });
  });

  it("yields the insets alone when padded is false", () => {
    renderWithProviders(
      <Screen padded={false}>
        <Text>Content</Text>
      </Screen>,
    );
    const container = closestHostView(screen.getByText("Content"));
    expect(container).toHaveStyle({
      paddingTop: insets.top,
      paddingBottom: insets.bottom,
      paddingLeft: insets.left,
      paddingRight: insets.right,
    });
  });

  // Fix B: guards against the previous round's regression — the insets were
  // relocated back onto the ScrollView's own `style` (the original bug) and
  // all existing tests still passed because nothing asserted where the
  // padding landed, only that it existed somewhere.
  it("puts the padding on the scroll content container, not the ScrollView's own style", () => {
    renderWithProviders(
      <Screen scroll>
        <Text>Scrolled content</Text>
      </Screen>,
    );
    const scrollView = screen.UNSAFE_getByType(ScrollView);
    const flatOwnStyle = StyleSheet.flatten(scrollView.props.style);
    expect(flatOwnStyle.paddingTop).toBeUndefined();
    expect(flatOwnStyle.paddingLeft).toBeUndefined();

    const flatContentStyle = StyleSheet.flatten(scrollView.props.contentContainerStyle);
    expect(flatContentStyle.paddingTop).toBe(spacing.md + insets.top);
    expect(flatContentStyle.paddingBottom).toBe(spacing.md + insets.bottom);
    expect(flatContentStyle.paddingLeft).toBe(spacing.md + insets.left);
    expect(flatContentStyle.paddingRight).toBe(spacing.md + insets.right);
  });

  it("merges style and contentContainerStyle rather than replacing, in the scroll branch", () => {
    renderWithProviders(
      <Screen scroll style={{ backgroundColor: "red" }} contentContainerStyle={{ gap: 8 }}>
        <Text>Scrolled content</Text>
      </Screen>,
    );
    const scrollView = screen.UNSAFE_getByType(ScrollView);
    expect(StyleSheet.flatten(scrollView.props.style)).toMatchObject({
      backgroundColor: "red",
    });
    expect(StyleSheet.flatten(scrollView.props.contentContainerStyle)).toMatchObject({
      gap: 8,
      paddingTop: spacing.md + insets.top,
    });
  });

  // Fix F: in the non-scroll branch `style` and `contentContainerStyle`
  // apply to the same View; `style` must win on an overlapping key while a
  // non-overlapping key from `contentContainerStyle` still survives (a real
  // merge, not a replace).
  it("merges style and contentContainerStyle in the non-scroll branch, with style winning on overlap", () => {
    renderWithProviders(
      <Screen
        contentContainerStyle={{ paddingTop: 999, backgroundColor: "blue" }}
        style={{ paddingTop: 5 }}
      >
        <Text>Content</Text>
      </Screen>,
    );
    const container = closestHostView(screen.getByText("Content"));
    expect(container).toHaveStyle({ paddingTop: 5, backgroundColor: "blue" });
  });
});
