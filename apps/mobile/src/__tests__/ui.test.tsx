import { fireEvent, render, screen } from "@testing-library/react-native";
import { AccessibilityInfo, ScrollView, StyleSheet, Text as RNText } from "react-native";

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
import { colors, spacing } from "../theme/tokens";
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

  // Fix E: `{...rest}` used to spread before the component's own
  // `accessibilityRole`/`accessibilityLabel`/`accessibilityState`, so those
  // explicit props (declared later in JSX, which always wins over an
  // earlier spread) silently discarded a caller-supplied value. Reverting
  // the `rest.accessibilityLabel ?? title` default back to an unconditional
  // `accessibilityLabel={title}` fails this.
  it("lets a caller-supplied accessibilityLabel override the default title", () => {
    render(
      <Button
        title="Save"
        onPress={jest.fn()}
        accessibilityLabel="Save the current form"
        testID="save-button"
      />,
    );
    expect(screen.getByTestId("save-button").props.accessibilityLabel).toBe(
      "Save the current form",
    );
  });

  // Fix E: unlike accessibilityLabel, `accessibilityState.disabled` must
  // always reflect the real interactive state — a caller passing
  // `accessibilityState={{ disabled: false }}` on a disabled button must not
  // be able to lie to assistive tech about it.
  it("does not let a caller override accessibilityState.disabled", () => {
    render(
      <Button
        title="Save"
        onPress={jest.fn()}
        disabled
        accessibilityState={{ disabled: false, selected: true }}
        testID="save-button"
      />,
    );
    const state = screen.getByTestId("save-button").props.accessibilityState;
    expect(state.disabled).toBe(true);
    // Other caller-supplied accessibilityState keys still pass through.
    expect(state.selected).toBe(true);
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
    // Fix D hides this caption from the accessibility tree (see below), so
    // `getByText` — which RNTL restricts to the accessibility tree — can no
    // longer see it; look it up via the raw host node instead.
    const captionText = screen
      .UNSAFE_getAllByType(RNText)
      .find((node) => node.props.children === "Required");
    expect(captionText).toBeTruthy();
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

  // Fix D: the field already carries `accessibilityHint={error}`, so the
  // error caption below duplicated the announcement — focusing the field
  // read "Email, Required" and swiping past read "Required" again. Hiding
  // it must not break `getByLabelText`, which Task 8 depends on.
  it("hides the duplicate error caption from the accessibility tree", () => {
    render(<Input label="Email" value="" onChangeText={jest.fn()} error="Required" />);
    const captionText = screen
      .UNSAFE_getAllByType(RNText)
      .find((node) => node.props.children === "Required");
    expect(captionText?.props.importantForAccessibility).toBe("no");
    expect(captionText?.props.accessibilityElementsHidden).toBe(true);
    // The field is still reachable by its label with the error showing.
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
