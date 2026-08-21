import { fireEvent, render, screen } from "@testing-library/react-native";
import { ScrollView, Text as RNText } from "react-native";

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
import { colors } from "../theme/tokens";
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

  // Fix 2: paddingVertical(8) + label lineHeight(18) alone is a 34pt target —
  // below iOS's 44pt HIG minimum, Android's 48dp, and WCAG 2.5.5. Reverting
  // the `minHeight: 44` in Button.tsx's style array fails this.
  it("has a minimum touch target height of 44", () => {
    render(<Button title="Save" onPress={jest.fn()} testID="save-button" />);
    expect(screen.getByTestId("save-button")).toHaveStyle({ minHeight: 44 });
  });

  // Fix 8: ButtonProps now extends PressableProps, and `disabled` is forwarded
  // to Pressable itself (not just reflected in accessibilityState) so the
  // host stops taking focus at the native gesture-responder layer, not only
  // via our own onPress guard. Pressable never re-exposes a plain `disabled`
  // prop on its rendered host View (it's consumed internally), so the only
  // way to observe this is on the Pressable element itself.
  it("forwards disabled to the underlying Pressable", () => {
    render(<Button title="Save" onPress={jest.fn()} disabled />);
    expect(screen.UNSAFE_getByProps({ disabled: true })).toBeTruthy();
  });

  // Fix 8: testID must reach the host element for E2E selectors to work.
  it("passes testID through to the host element", () => {
    render(<Button title="Save" onPress={jest.fn()} testID="save-button" />);
    expect(screen.getByTestId("save-button")).toBeTruthy();
  });

  describe("variants", () => {
    it("primary is a solid navy background with no border", () => {
      render(<Button title="Save" onPress={jest.fn()} variant="primary" testID="btn" />);
      expect(screen.getByTestId("btn")).toHaveStyle({
        backgroundColor: colors.brand.navy[900],
        borderWidth: 0,
      });
    });

    it("secondary is a solid teal background", () => {
      render(<Button title="Save" onPress={jest.fn()} variant="secondary" testID="btn" />);
      expect(screen.getByTestId("btn")).toHaveStyle({
        backgroundColor: colors.brand.teal[500],
      });
    });

    it("ghost is transparent with a neutral border", () => {
      render(<Button title="Save" onPress={jest.fn()} variant="ghost" testID="btn" />);
      expect(screen.getByTestId("btn")).toHaveStyle({
        backgroundColor: colors.transparent,
        borderWidth: 1,
        borderColor: colors.neutral[300],
      });
    });
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

  // Fix 1: `style` used to be spread last inside `{...rest}`, so a caller's
  // `style` prop replaced the whole base style object (border, radius,
  // padding, font size, colour all gone). Reverting the `style={mergedStyle}`
  // merge back to plain `{...rest}` after the inline style object fails this.
  it("merges a passed style with its base style instead of replacing it", () => {
    render(
      <Input
        label="Email"
        value=""
        onChangeText={jest.fn()}
        style={{ marginTop: 8 }}
      />,
    );
    expect(screen.getByLabelText("Email")).toHaveStyle({
      borderWidth: 1,
      borderRadius: 6,
      marginTop: 8,
    });
  });

  // Fix 7a: the error has no visual/programmatic association with the field
  // otherwise — RN has no `aria-invalid`, so accessibilityHint carries it.
  it("exposes the error as an accessibility hint on the field", () => {
    render(<Input label="Email" value="" onChangeText={jest.fn()} error="Required" />);
    expect(screen.getByLabelText("Email").props.accessibilityHint).toBe("Required");
  });

  // Fix 7b: the visual label Text duplicated the field's own
  // accessibilityLabel, so VoiceOver read "Email... Email, text field"
  // instead of just the field. Hiding it must not break getByLabelText,
  // which Task 8 depends on.
  it("hides the duplicate visual label from the accessibility tree", () => {
    render(<Input label="Email" value="" onChangeText={jest.fn()} />);
    // `getByText`/`getByLabelText` deliberately can't see elements hidden from
    // the accessibility tree, so the raw host node is inspected directly.
    const labelText = screen.UNSAFE_getByType(RNText);
    expect(labelText.props.children).toBe("Email");
    expect(labelText.props.importantForAccessibility).toBe("no");
    expect(labelText.props.accessibilityElementsHidden).toBe(true);
    // Still resolves to exactly the field, not the (now-hidden) label text.
    expect(screen.getByLabelText("Email")).toBeTruthy();
  });
});

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

  // Fix 5b: Task 7's tab bar already consumes the bottom inset; a screen
  // that omits "bottom" from `edges` must not double-pad.
  it("drops the bottom safe-area padding when 'bottom' is omitted from edges", () => {
    renderWithProviders(
      <Screen edges={["top", "left", "right"]}>
        <Text>Content</Text>
      </Screen>,
    );
    const container = closestHostView(screen.getByText("Content"));
    expect(container).toHaveStyle({ paddingBottom: 0 });
  });

  it("applies the bottom inset by default", () => {
    renderWithProviders(
      <Screen>
        <Text>Content</Text>
      </Screen>,
    );
    // From helpers/render.tsx's initialMetrics: insets.bottom = 34.
    const container = closestHostView(screen.getByText("Content"));
    expect(container).toHaveStyle({ paddingBottom: 34 });
  });
});
