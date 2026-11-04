import { fireEvent, render, screen } from "@testing-library/react-native";

import { Button, buttonTextVariants, buttonVariants } from "../design/ui/button";

describe("Button redesign", () => {
  it("each variant carries its token classes", () => {
    expect(buttonVariants({ variant: "primary" })).toContain("bg-primary");
    expect(buttonVariants({ variant: "secondary" })).toContain("bg-surface");
    expect(buttonVariants({ variant: "secondary" })).toContain("border-control-border");
    expect(buttonVariants({ variant: "destructive" })).toContain("bg-bad-soft");
    expect(buttonVariants({ variant: "plain" })).toContain("bg-transparent");
    expect(buttonTextVariants({ variant: "primary" })).toContain("text-primary-foreground");
    expect(buttonTextVariants({ variant: "destructive" })).toContain("text-bad");
    expect(buttonTextVariants({ variant: "plain" })).toContain("text-foreground");
  });

  it("uses radius 14 and the min heights", () => {
    expect(buttonVariants({})).toContain("rounded-[14px]");
    expect(buttonVariants({ size: "md" })).toContain("min-h-[46px]");
    expect(buttonVariants({ size: "sm" })).toContain("min-h-[44px]");
  });

  it("maps legacy variants and sizes onto the new ones", () => {
    expect(buttonVariants({ variant: "default" })).toBe(buttonVariants({ variant: "primary" }));
    expect(buttonVariants({ variant: "outline" })).toBe(buttonVariants({ variant: "secondary" }));
    expect(buttonVariants({ variant: "ghost" })).toBe(buttonVariants({ variant: "plain" }));
    expect(buttonTextVariants({ variant: "link" })).toContain("underline");
    expect(buttonVariants({ size: "default" })).toBe(buttonVariants({ size: "md" }));
    expect(buttonVariants({ size: "lg" })).toBe(buttonVariants({ size: "md" }));
    expect(buttonVariants({ size: "icon" })).toContain("min-h-[44px]");
    expect(buttonVariants({ size: "xs" })).toContain("min-h-[44px]");
  });

  it("renders every legacy variant and size without throwing", () => {
    for (const variant of ["default", "outline", "secondary", "ghost", "destructive", "link", "primary", "plain"] as const) {
      for (const size of ["default", "xs", "sm", "lg", "icon", "icon-xs", "icon-sm", "icon-lg", "md"] as const) {
        const { unmount } = render(<Button variant={variant} size={size}>{`${variant}-${size}`}</Button>);
        expect(screen.getByText(`${variant}-${size}`)).toBeTruthy();
        unmount();
      }
    }
  });

  it("loading shows a spinner and blocks presses", () => {
    const onPress = jest.fn();
    render(<Button loading onPress={onPress}>Save</Button>);
    const btn = screen.getByRole("button", { name: "Save" });
    expect(btn.props.accessibilityState).toMatchObject({ busy: true, disabled: true });
    expect(screen.getByTestId("button-spinner")).toBeTruthy();
    fireEvent.press(btn);
    expect(onPress).not.toHaveBeenCalled();
  });

  it("presses when idle and not when disabled", () => {
    const onPress = jest.fn();
    const { rerender } = render(<Button onPress={onPress}>Go</Button>);
    fireEvent.press(screen.getByRole("button", { name: "Go" }));
    expect(onPress).toHaveBeenCalledTimes(1);
    rerender(<Button disabled onPress={onPress}>Go</Button>);
    fireEvent.press(screen.getByRole("button", { name: "Go" }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
