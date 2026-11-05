import { act, fireEvent, render, screen } from "@testing-library/react-native";

import { setReducedMotionForTests } from "../design/motion";
import { Button } from "../design/ui/button";
import { HeroCard } from "../design/ui/hero-card";
import { SearchField } from "../design/ui/search-field";
import { StatTile } from "../design/ui/stat-tile";

afterEach(() => setReducedMotionForTests(null));

describe("StatTile", () => {
  it("shows the final value immediately under reduced motion", () => {
    setReducedMotionForTests(true);
    render(<StatTile value={42} suffix="%" label="Attendance" />);
    expect(screen.getByText("42%")).toBeTruthy();
    expect(screen.getByText("Attendance")).toBeTruthy();
  });

  it("counts up to the final value otherwise", () => {
    jest.useFakeTimers();
    setReducedMotionForTests(false);
    render(<StatTile value={10} label="Done" />);
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(screen.getByText("10")).toBeTruthy();
    jest.useRealTimers();
  });

  it("does not count up again when a refetch brings the same number back", () => {
    jest.useFakeTimers();
    setReducedMotionForTests(false);
    const { rerender } = render(<StatTile value={10} label="Done" />);
    act(() => jest.advanceTimersByTime(1000));
    // A refetch: a placeholder for a moment, then the same figure.
    rerender(<StatTile value="—" label="Done" />);
    rerender(<StatTile value={10} label="Done" />);
    act(() => jest.advanceTimersByTime(16));
    expect(screen.getByText("10")).toBeTruthy();
    jest.useRealTimers();
  });

  it("counts from the shown number on a change, not from 0", () => {
    jest.useFakeTimers();
    setReducedMotionForTests(false);
    const { rerender } = render(<StatTile value={10} label="Done" />);
    act(() => jest.advanceTimersByTime(1000));
    rerender(<StatTile value={12} label="Done" />);
    act(() => jest.advanceTimersByTime(16));
    const mid = Number(
      screen
        .getByLabelText("Done: 12")
        .findAll((n) => typeof n.props.children === "string" && /^\d+$/.test(n.props.children))[0]
        ?.props.children,
    );
    expect(mid).toBeGreaterThanOrEqual(10);
    act(() => jest.advanceTimersByTime(1000));
    expect(screen.getByText("12")).toBeTruthy();
    jest.useRealTimers();
  });

  it("shrinks the value to fit one line instead of ellipsizing it", () => {
    render(<StatTile value="3 / 10" label="Quizzes" />);
    const value = screen.getByText("3 / 10");
    expect(value.props.numberOfLines).toBe(1);
    expect(value.props.adjustsFontSizeToFit).toBe(true);
    expect(value.props.minimumFontScale).toBeLessThanOrEqual(0.5);
  });

  it("gives the label two lines, shrinks it before breaking, and caps its font scale", () => {
    render(<StatTile value={7} label="Open assignments to finish" />);
    const label = screen.getByText("Open assignments to finish");
    expect(label.props.numberOfLines).toBe(2);
    expect(label.props.adjustsFontSizeToFit).toBe(true);
    expect(label.props.maxFontSizeMultiplier).toBeLessThanOrEqual(1.3);
  });

  it("keeps a minimum width so a label word never breaks mid-word (rows wrap instead)", () => {
    render(<StatTile value={92} suffix="%" label="Attendance" />);
    expect(screen.getByLabelText("Attendance: 92%").props.className).toContain("min-w-[136px]");
  });

  it("renders string values as given", () => {
    render(<StatTile value="A+" label="Grade" />);
    expect(screen.getByText("A+")).toBeTruthy();
  });
});

describe("HeroCard", () => {
  it("renders eyebrow, title, meta and action", () => {
    render(
      <HeroCard
        eyebrow="Next session"
        title="Intro"
        meta="Tue 6pm"
        action={<Button>Check in</Button>}
      />,
    );
    expect(screen.getByText("Next session")).toBeTruthy();
    expect(screen.getByText("Intro")).toBeTruthy();
    expect(screen.getByText("Tue 6pm")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Check in" })).toBeTruthy();
  });
});

describe("SearchField", () => {
  it("reports text changes and shows the placeholder", () => {
    const onChangeText = jest.fn();
    render(<SearchField value="" onChangeText={onChangeText} placeholder="Search students" />);
    fireEvent.changeText(screen.getByPlaceholderText("Search students"), "ann");
    expect(onChangeText).toHaveBeenCalledWith("ann");
  });
});
