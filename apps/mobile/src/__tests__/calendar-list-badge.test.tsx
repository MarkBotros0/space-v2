import { screen } from "@testing-library/react-native";

import { CalendarList } from "../design/sessions/calendar-list";
import { session } from "./helpers/calendar-fixtures";
import { renderWithProviders } from "./helpers/render";

// The device says Mar 1 2099, 12:00 local.
const NOW = new Date(2099, 2, 1, 12, 0);
const open = () => undefined;

describe("CalendarList status badge counts from the org's today", () => {
  it("falls back to the device's day without today", () => {
    const s = session(1, "Kickoff", new Date(2099, 2, 1, 18, 0).toISOString(), "2099-03-01");
    renderWithProviders(<CalendarList sessions={[s]} onOpen={open} now={NOW} />);
    expect(screen.getByText("Today")).toBeTruthy();
  });

  it("a session on the org's today is Today, though the device calls it another day", () => {
    const s = session(1, "Kickoff", "2099-03-07T18:00:00.000Z", "2099-03-07");
    renderWithProviders(<CalendarList sessions={[s]} onOpen={open} now={NOW} today="2099-03-07" />);
    expect(screen.getByText("Today")).toBeTruthy();
  });

  it("an earlier org day is past by the day, not the instant (the device thinks it is ahead)", () => {
    const s = session(1, "Kickoff", "2099-03-07T18:00:00.000Z", "2099-03-07");
    renderWithProviders(<CalendarList sessions={[s]} onOpen={open} now={NOW} today="2099-03-09" />);
    expect(screen.getByText("Attendance pending")).toBeTruthy();
    expect(screen.queryByText("Upcoming")).toBeNull();
  });

  it("a later org day is upcoming by the day, though the device thinks it has started", () => {
    const s = session(1, "Kickoff", "2099-02-20T18:00:00.000Z", "2099-02-20");
    renderWithProviders(<CalendarList sessions={[s]} onOpen={open} now={NOW} today="2099-02-10" />);
    expect(screen.getByText("Upcoming")).toBeTruthy();
  });
});
