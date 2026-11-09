import { fireEvent, screen, within } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));

import { CalendarGrid } from "../components/calendar/CalendarGrid";
import { CalendarGrid as SeasonCalendarGrid } from "../design/sessions/season-calendar-grid";
import { renderWithProviders } from "./helpers/render";

const ctx = { today: "2099-03-10", slots: null, isStaff: false };
const classes = (el: { props: { className?: string } }) => (el.props.className ?? "").split(" ");
const opacity = (el: { props: { style?: unknown } }) => StyleSheet.flatten(el.props.style as never)?.opacity;

// alumni s48-04: out-of-month dates were dimmed to ~2.3:1, the selected day a tall
// rectangle beside the today circle.
describe("events month grid (CalendarGrid)", () => {
  it("out-of-month dates use muted-foreground (4.5:1 on the page) instead of opacity", () => {
    renderWithProviders(<CalendarGrid view="month" anchor="2099-03-10" sessions={[]} events={[]} ctx={ctx} />);
    // March 2099 starts on a Sunday: the grid opens on Monday Feb 23.
    const cell = screen.getByLabelText(/Feb 23, 2099/i);
    expect(classes(cell)).not.toContain("opacity-40");
    expect(classes(within(cell).getByText("23"))).toContain("text-muted-foreground");
    const inMonth = screen.getByLabelText(/Mar 11, 2099/i);
    expect(classes(within(inMonth).getByText("11"))).not.toContain("text-muted-foreground");
  });

  it("a date can't wrap out of its fixed disc at a large font (sweep s48: 20 read 2)", () => {
    renderWithProviders(<CalendarGrid view="month" anchor="2099-03-10" sessions={[]} events={[]} ctx={ctx} />);
    const date = within(screen.getByTestId("day-circle-2099-03-20")).getByText("20");
    expect(date.props.numberOfLines).toBe(1);
    expect(date.props.maxFontSizeMultiplier).toBe(1.15);
  });

  it("the selected day is a circle round its date, like today's, not a tinted cell", () => {
    renderWithProviders(<CalendarGrid view="month" anchor="2099-03-10" sessions={[]} events={[]} ctx={ctx} />);
    fireEvent.press(screen.getByLabelText(/Mar 12, 2099/i));
    expect(classes(screen.getByLabelText(/Mar 12, 2099/i)).join(" ")).not.toMatch(/bg-brand-teal/);
    const circle = screen.getByTestId("day-circle-2099-03-12");
    expect(classes(circle)).toEqual(expect.arrayContaining(["rounded-full", "bg-brand-teal-100"]));
    expect(classes(screen.getByTestId("day-circle-2099-03-10"))).toContain("bg-brand-teal-500");
  });

  it("the selected non-today day has a 3:1 border; today and other days keep it transparent", () => {
    renderWithProviders(<CalendarGrid view="month" anchor="2099-03-10" sessions={[]} events={[]} ctx={ctx} />);
    fireEvent.press(screen.getByLabelText(/Mar 12, 2099/i));
    const selected = classes(screen.getByTestId("day-circle-2099-03-12"));
    expect(selected).toEqual(expect.arrayContaining(["border", "border-brand-teal-700", "dark:border-brand-teal-400"]));
    for (const key of ["2099-03-10", "2099-03-11"]) {
      const c = classes(screen.getByTestId(`day-circle-${key}`));
      expect(c).toContain("border-transparent");
      expect(c).not.toContain("border-brand-teal-700");
    }
  });
});

describe("season calendar month grid", () => {
  it("out-of-month dates use muted-foreground instead of opacity", () => {
    renderWithProviders(
      <SeasonCalendarGrid
        view="month"
        anchor="2099-03-10"
        sessions={[]}
        events={[]}
        today="2099-03-10"
        onOpenSession={jest.fn()}
        onOpenEvent={jest.fn()}
      />,
    );
    const cell = screen.getByLabelText(/Feb 23, 2099/i);
    expect(opacity(cell)).toBeUndefined();
    expect(classes(within(cell).getByText("23"))).toContain("text-muted-foreground");
  });
});
