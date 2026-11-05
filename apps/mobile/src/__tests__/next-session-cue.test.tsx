import { render, screen } from "@testing-library/react-native";

import { NextSessionCard } from "../design/sessions/next-session-card";
import { dayCue } from "../lib/calendar-grid";

const session = {
  id: 1,
  title: "Kickoff",
  // Saturday 20:00 org time, 6 days and 12 hours after "now" below.
  startsAt: new Date(2099, 2, 7, 20, 0).toISOString(),
  dayKey: "2099-03-07",
  time: "20:00",
  durationMinutes: 60,
  location: null,
  youtubeUrl: null,
  isInProgress: false,
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2099, 2, 1, 8, 0));
});
afterEach(() => jest.useRealTimers());

// student s04-03 vs s03-01: the calendar said "in 6 days", the dashboard "in 7 days"
// (the instant, rounded) for the same session. Both now count calendar days.
describe("relative day cue: one helper for calendar and dashboard", () => {
  it("the dashboard's next-session badge counts calendar days like the calendar heading", () => {
    render(<NextSessionCard session={session} onOpen={jest.fn()} />);
    expect(dayCue("2099-03-07", "2099-03-01")).toBe("in 6 days");
    expect(screen.getByText("in 6 days")).toBeTruthy();
    expect(screen.queryByText("in 7 days")).toBeNull();
  });

  it("a session later today reads Today, as on the calendar", () => {
    render(
      <NextSessionCard
        session={{
          ...session,
          dayKey: "2099-03-01",
          startsAt: new Date(2099, 2, 1, 20, 0).toISOString(),
        }}
        onOpen={jest.fn()}
      />,
    );
    expect(screen.getByText("Today")).toBeTruthy();
  });

  it("tomorrow is in 1 day, however few hours away", () => {
    jest.setSystemTime(new Date(2099, 2, 1, 23, 30));
    render(
      <NextSessionCard
        session={{
          ...session,
          dayKey: "2099-03-02",
          startsAt: new Date(2099, 2, 2, 0, 30).toISOString(),
        }}
        onOpen={jest.fn()}
      />,
    );
    expect(screen.getByText("in 1 day")).toBeTruthy();
  });
});
