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
    expect(buttonVariants({})).toContain("rounded-control"); // 14px, tokens.json radius.control
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

  // Sweep (student s04-04, super s30-04): opacity over the teal fill left the label at
  // ~1.5:1 in dark and ~2:1 in light. Disabled is a neutral fill with the muted
  // foreground instead (muted-foreground on neutral-soft is contrast-tested).
  it.each(["primary", "secondary", "destructive"] as const)("disabled %s is a neutral fill with a muted label, no opacity", (variant) => {
    render(<Button variant={variant} disabled>Check In</Button>);
    const label = screen.getByText("Check In");
    expect(label.props.className.split(" ")).toContain("text-muted-foreground");
    const look = screen.getByTestId("button-look").props.className.split(" ");
    expect(look).toContain("bg-neutral-soft");
    expect(look).toContain("border-transparent");
    expect(look).not.toContain("opacity-50");
    expect(look.filter((c: string) => c.startsWith("bg-"))).toEqual(["bg-neutral-soft"]);
  });

  it("disabled plain keeps no fill and mutes the label", () => {
    render(<Button variant="plain" disabled>Skip</Button>);
    expect(screen.getByText("Skip").props.className.split(" ")).toContain("text-muted-foreground");
    expect(screen.getByTestId("button-look").props.className.split(" ")).toContain("bg-transparent");
  });

  it("a caller's label colour does not override the disabled label", () => {
    render(<Button disabled textClassName="text-primary">Go</Button>);
    const classes = screen.getByText("Go").props.className.split(" ");
    expect(classes).toContain("text-muted-foreground");
    expect(classes).not.toContain("text-primary");
  });
});
