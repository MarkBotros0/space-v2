import { fireEvent, screen } from "@testing-library/react-native";
import type { JpcEventListItem, SessionListItem } from "@space/shared";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));

import { CalendarGrid } from "../screens/calendar/calendar-grid";
import { DayEntries, Legend, entriesFor } from "../screens/calendar/calendar-entries";
import { renderWithProviders } from "./helpers/render";

const ctx = { today: "2099-03-10", slots: null, isStaff: false };

const session = (id: number, title: string, dayKey: string, startsAt: string): SessionListItem => ({
  id,
  title,
  startsAt,
  dayKey,
  durationMinutes: 60,
  location: null,
  recurrenceGroupId: null,
  attendanceMarked: false,
  seasonId: 7,
  seasonCode: "S26",
  seasonTitle: "Spring 2026",
  checkInToken: null,
  checkInOpenAt: null,
  checkInClosedAt: null,
  startTime: "20:00",
});

const event = (id: number, title: string, dayKey: string, over: Partial<JpcEventListItem> = {}): JpcEventListItem =>
  ({
    id,
    title,
    date: `${dayKey}T10:00:00.000Z`,
    endDate: null,
    dayKey,
    endDayKey: null,
    isPast: false,
    time: "12:00",
    allDay: false,
    visibility: "ALL",
    seasonId: null,
    seasonCode: null,
    ...over,
  }) as JpcEventListItem;

beforeEach(() => jest.clearAllMocks());

describe("CalendarGrid week view", () => {
  it("lists all seven days and says so when a day is empty", () => {
    renderWithProviders(
      <CalendarGrid
        view="week"
        anchor="2099-03-10"
        sessions={[session(1, "Kickoff", "2099-03-10", "2099-03-10T18:00:00.000Z")]}
        events={[]}
        ctx={ctx}
      />,
    );
    expect(screen.getByText("Kickoff")).toBeTruthy();
    expect(screen.getAllByText("Nothing scheduled")).toHaveLength(6);
  });
});

describe("CalendarGrid month view", () => {
  const sessions = [
    session(1, "Kickoff", "2099-03-10", "2099-03-10T18:00:00.000Z"),
    session(2, "Other day", "2099-03-12", "2099-03-12T18:00:00.000Z"),
  ];

  it("shows today's entries first, then switches when another day is tapped", () => {
    renderWithProviders(<CalendarGrid view="month" anchor="2099-03-10" sessions={sessions} events={[]} ctx={ctx} />);
    expect(screen.getByText("Kickoff")).toBeTruthy();
    expect(screen.queryByText("Other day")).toBeNull();

    fireEvent.press(screen.getByLabelText(/Mar 12, 2099.*1 scheduled/i));
    expect(screen.getByText("Other day")).toBeTruthy();
    expect(screen.queryByText("Kickoff")).toBeNull();
  });

  it("marks the selected day and labels empty days as nothing scheduled", () => {
    renderWithProviders(<CalendarGrid view="month" anchor="2099-03-10" sessions={sessions} events={[]} ctx={ctx} />);
    expect(screen.getByLabelText(/Mar 10, 2099/i).props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByLabelText(/Mar 11, 2099, nothing scheduled/i)).toBeTruthy();
  });

  it("falls back to the 1st when today isn't in the anchor month", () => {
    renderWithProviders(
      <CalendarGrid
        view="month"
        anchor="2099-04-15"
        sessions={[session(3, "April kickoff", "2099-04-01", "2099-04-01T18:00:00.000Z")]}
        events={[]}
        ctx={ctx}
      />,
    );
    expect(screen.getByText("April kickoff")).toBeTruthy();
  });

  it("caps dots at three and shows how many more", () => {
    const many = [1, 2, 3, 4, 5].map((i) => session(i, `S${i}`, "2099-03-10", `2099-03-10T1${i}:00:00.000Z`));
    renderWithProviders(<CalendarGrid view="month" anchor="2099-03-10" sessions={many} events={[]} ctx={ctx} />);
    expect(screen.getByText("+2")).toBeTruthy();
  });
});

describe("DayEntries", () => {
  it("orders by time and mixes sessions with events", () => {
    const entries = entriesFor({
      sessions: [session(1, "Late", "2099-03-10", "2099-03-10T18:00:00.000Z")],
      events: [event(2, "Early", "2099-03-10")],
    });
    expect(entries.map((e) => e.kind)).toEqual(["event", "session"]);
    expect(entriesFor(undefined)).toEqual([]);
  });

  it("navigates to the session and event detail screens", () => {
    const entries = entriesFor({
      sessions: [session(1, "Kickoff", "2099-03-10", "2099-03-10T18:00:00.000Z")],
      events: [event(2, "Picnic", "2099-03-10")],
    });
    renderWithProviders(<DayEntries entries={entries} ctx={ctx} />);
    fireEvent.press(screen.getByText("Kickoff"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/session/[id]", params: { id: "1" } });
    fireEvent.press(screen.getByText("Picnic"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/event/[id]", params: { id: "2" } });
  });

  it("labels all-day, alumni-only and season-tagged events, and the season on multi-season sessions", () => {
    const entries = entriesFor({
      sessions: [session(1, "Kickoff", "2099-03-10", "2099-03-10T18:00:00.000Z")],
      events: [
        event(2, "Reunion", "2099-03-10", { time: null, allDay: true, visibility: "ALUMNI_ONLY", seasonCode: "S25" }),
      ],
    });
    renderWithProviders(<DayEntries entries={entries} ctx={{ ...ctx, slots: { S26: 0, S25: 1 }, isStaff: true }} />);
    expect(screen.getByText("JPC event · All day")).toBeTruthy();
    expect(screen.getAllByText("Alumni only").length).toBeGreaterThan(0);
    expect(screen.getByText("S25")).toBeTruthy();
    expect(screen.getByText("Spring 2026")).toBeTruthy();
  });

  it("shows the location next to the time when a session has one", () => {
    const s = { ...session(1, "Kickoff", "2099-03-10", "2099-03-10T18:00:00.000Z"), location: "Room 4" };
    renderWithProviders(<DayEntries entries={entriesFor({ sessions: [s], events: [] })} ctx={ctx} />);
    expect(screen.getByText(/· Room 4/)).toBeTruthy();
  });
});

describe("Legend", () => {
  it("explains today/upcoming/past for a single season", () => {
    renderWithProviders(<Legend slots={null} />);
    for (const l of ["Today", "Upcoming", "Past", "JPC event", "Alumni only"]) expect(screen.getByText(l)).toBeTruthy();
  });

  it("lists season codes instead when several seasons share the calendar", () => {
    renderWithProviders(<Legend slots={{ S26: 0, S25: 1 }} />);
    expect(screen.getByText("S26")).toBeTruthy();
    expect(screen.getByText("S25")).toBeTruthy();
    expect(screen.queryByText("Today")).toBeNull();
  });
});
