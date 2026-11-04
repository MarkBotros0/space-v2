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

  it("renders string values as given", () => {
    render(<StatTile value="A+" label="Grade" />);
    expect(screen.getByText("A+")).toBeTruthy();
  });
});

describe("HeroCard", () => {
  it("renders eyebrow, title, meta and action", () => {
    render(<HeroCard eyebrow="Next session" title="Intro" meta="Tue 6pm" action={<Button>Check in</Button>} />);
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
