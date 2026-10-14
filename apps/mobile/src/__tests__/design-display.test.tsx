import { fireEvent, render, screen } from "@testing-library/react-native";

import {
  AttendancePill,
  Avatar,
  AvatarFallback,
  Badge,
  badgeVariants,
  Button,
  buttonVariants,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Logo,
  Progress,
  ProgressRing,
  SubmissionStatusBadge,
  Text,
} from "../design/ui";

describe("Text", () => {
  it("starts from v1's body: foreground colour and Geist regular", () => {
    render(<Text>Hello</Text>);
    expect(screen.getByText("Hello").props.className).toBe("font-normal text-foreground");
  });

  it("font-mono replaces the Geist face instead of fighting font-normal", () => {
    render(<Text className="font-mono">x = 1</Text>);
    expect(screen.getByText("x = 1").props.className).toBe("text-foreground font-mono");
  });

  it("lets a caller override weight and colour (last wins)", () => {
    render(<Text className="font-semibold text-muted-foreground">Hi</Text>);
    expect(screen.getByText("Hi").props.className).toBe("font-semibold text-muted-foreground");
  });
});

describe("Button", () => {
  it("keeps v1's variant classes", () => {
    expect(buttonVariants({ variant: "default" })).toContain("bg-primary");
    expect(buttonVariants({ variant: "outline" })).toContain("border-border");
    expect(buttonVariants({ variant: "destructive" })).toContain("bg-destructive/10");
    expect(buttonVariants({ size: "default" })).toContain("h-8");
    expect(buttonVariants({ size: "lg" })).toContain("h-9");
    expect(buttonVariants({ size: "icon" })).toContain("size-8");
  });

  it("drops web-only classes", () => {
    const all = buttonVariants({ variant: "default", size: "default" });
    expect(all).not.toMatch(/hover:|focus-visible:|aria-|md:|transition/);
  });

  it("presses and reports disabled", () => {
    const onPress = jest.fn();
    render(<Button onPress={onPress}>Save</Button>);
    fireEvent.press(screen.getByRole("button", { name: "Save" }));
    expect(onPress).toHaveBeenCalledTimes(1);

    render(<Button disabled onPress={onPress}>Locked</Button>);
    expect(screen.getByRole("button", { name: "Locked" }).props.accessibilityState).toMatchObject({ disabled: true });
  });

  it("keeps a long label on one line", () => {
    render(<Button>A very long button label that would wrap on a phone</Button>);
    expect(screen.getByText(/very long button/).props.numberOfLines).toBe(1);
  });
});

describe("Card", () => {
  it("renders header, title and content", () => {
    render(
      <Card>
        <CardHeader><CardTitle>Week 3</CardTitle></CardHeader>
        <CardContent />
      </Card>,
    );
    expect(screen.getByText("Week 3")).toBeTruthy();
  });
});

describe("status components", () => {
  it("Badge renders its text on one line, role colours from v1", () => {
    render(<Badge role="leader">Leader</Badge>);
    expect(screen.getByText("Leader").props.numberOfLines).toBe(1);
    expect(badgeVariants({ role: "leader" })).toContain("bg-role-leader");
  });

  it.each([
    ["DRAFT", "Draft"],
    ["SUBMITTED", "Submitted"],
    ["REVIEWED", "Reviewed"],
    ["RETURNED", "Returned"],
  ] as const)("SubmissionStatusBadge %s reads %s (v1 map)", (status, label) => {
    render(<SubmissionStatusBadge status={status} />);
    expect(screen.getByText(label)).toBeTruthy();
  });

  it.each([
    ["PRESENT", "Present"],
    ["ABSENT", "Absent"],
    ["LATE", "Late"],
  ] as const)("AttendancePill %s reads %s (v1 map)", (status, label) => {
    render(<AttendancePill status={status} />);
    expect(screen.getByText(label)).toBeTruthy();
  });

  it("Progress exposes its value to accessibility and shows label/value", () => {
    render(<Progress value={40} label="Season" showValue />);
    expect(screen.getByRole("progressbar").props.accessibilityValue).toMatchObject({ now: 40, min: 0, max: 100 });
    expect(screen.getByText("Season")).toBeTruthy();
    expect(screen.getByText("40")).toBeTruthy();
  });

  it("ProgressRing clamps and labels like v1", () => {
    render(<ProgressRing value={140} />);
    expect(screen.getByLabelText("100 percent")).toBeTruthy();
  });

  it("EmptyState shows title and description", () => {
    render(<EmptyState title="No sessions" description="Nothing scheduled" />);
    expect(screen.getByText("No sessions")).toBeTruthy();
    expect(screen.getByText("Nothing scheduled")).toBeTruthy();
  });

  it("Avatar shows the fallback initials", () => {
    render(<Avatar><AvatarFallback>AT</AvatarFallback></Avatar>);
    expect(screen.getByText("AT")).toBeTruthy();
  });

  it("Logo shows the wordmark only when asked", () => {
    render(<Logo showWordmark />);
    expect(screen.getByText("JPC Space")).toBeTruthy();
    expect(screen.getByLabelText("JPC Space logo")).toBeTruthy();
  });
});
