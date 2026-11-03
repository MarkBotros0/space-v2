import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text as RNText } from "react-native";

import { Button, Input } from "../ui";
import { colors } from "../theme/tokens";

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
