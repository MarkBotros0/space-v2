import { fireEvent, screen, within } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn() } }));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));

import { apiClient } from "../lib/api-client";
import { AlumniCalendar } from "../screens/calendar/alumni-calendar";
import { EventDayRows } from "../screens/alumni/event-day-list";
import { deviceTodayKey } from "../lib/calendar-grid";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";
import { eventRow, session } from "./helpers/calendar-fixtures";

const get = apiClient.get as jest.Mock;
const alumnus = makeSession("STUDENT", { activeSeasonId: null, graduationYear: 2025 }, { id: 9 });

const NOW = new Date();
const dayKeyIn = (n: number) => {
  const d = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + n, 12);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
// Flatten the rendered tree to its text and classNames, in document order.
type Node = { props?: { className?: string }; children?: (Node | string)[] | null };
const dump = (tree: unknown): string => {
  const out: string[] = [];
  const walk = (n: Node | string) => {
    if (typeof n === "string") return void out.push(n);
    if (n.props?.className) out.push(`[${n.props.className}]`);
    (n.children ?? []).forEach(walk);
  };
  [tree as Node].flat().forEach(walk);
  return out.join(" ");
};
const iso = (k: string, hh = "09") => `${k}T${hh}:00:00.000Z`;

function serve(opts: { events?: unknown[] | "fail" }) {
  get.mockImplementation((url: string) => {
    if (url.startsWith("/api/v1/events"))
      return opts.events === "fail"
        ? Promise.reject(new Error("boom"))
        : Promise.resolve({ data: { data: { events: opts.events ?? [], total: 0 } } });
    return Promise.reject(new Error(`unexpected ${url}`));
  });
}

const reunion = {
  ...eventRow(2, "Alumni reunion dinner", iso(dayKeyIn(3), "18"), dayKeyIn(3), "18:30"),
  visibility: "ALUMNI_ONLY" as const,
};
const open = eventRow(3, "Open day", iso(dayKeyIn(1)), dayKeyIn(1), null);
const townHall = eventRow(4, "Town hall", iso(deviceTodayKey(), "17"), deviceTodayKey(), "17:00");

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(alumnus);
});

describe("AlumniCalendar — Events", () => {
  it("titles the screen Events and offers Upcoming, Week, Month as a segmented control", async () => {
    serve({ events: [reunion] });
    renderWithProviders(<AlumniCalendar />);
    await screen.findByText("Alumni reunion dinner");
    expect(screen.getByText("Events")).toBeTruthy();
    const control = screen.getByTestId("segmented-control");
    for (const label of ["Upcoming", "Week", "Month"]) expect(within(control).getByText(label)).toBeTruthy();
    expect(screen.queryByRole("radio")).toBeNull();
  });

  it("lists upcoming days as grouped headers with the cue as text and no legend", async () => {
    serve({ events: [reunion, open, townHall] });
    renderWithProviders(<AlumniCalendar />);
    await screen.findByText("Alumni reunion dinner");
    expect(screen.getByText("in 3 days")).toBeTruthy();
    expect(screen.getByText("in 1 day")).toBeTruthy();
    expect(screen.getAllByText("Today").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("header").length).toBe(4) // the title + three days;
    expect(screen.queryByLabelText("Calendar legend")).toBeNull();
  });

  it("shows event subtitles and the Alumni only chip, and pushes the event", async () => {
    serve({ events: [reunion, open] });
    renderWithProviders(<AlumniCalendar />);
    await screen.findByText("Alumni reunion dinner");
    expect(screen.getByText("JPC event · 6:30 PM")).toBeTruthy();
    expect(screen.getByText("JPC event · All day")).toBeTruthy();
    expect(screen.getAllByText("Alumni only")).toHaveLength(1);
    fireEvent.press(screen.getByText("Alumni reunion dinner"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/event/[id]", params: { id: "2" } });
  });

  it("puts a season code in the subtitle rather than a second chip", async () => {
    serve({ events: [{ ...reunion, seasonId: 7, seasonCode: "S26" }] });
    renderWithProviders(<AlumniCalendar />);
    await screen.findByText("JPC event · 6:30 PM · S26");
    expect(screen.queryByTestId("chip-S26")).toBeNull();
  });

  it("has no left-border accent on any row", async () => {
    serve({ events: [reunion, open] });
    const { toJSON } = renderWithProviders(<AlumniCalendar />);
    await screen.findByText("Open day");
    expect(dump(toJSON())).not.toMatch(/border-l-/);
  });

  it("steps Week and Month with labelled buttons; Month puts the legend below the day's rows", async () => {
    serve({ events: [open] });
    renderWithProviders(<AlumniCalendar />);
    await screen.findByText("Open day");
    fireEvent.press(screen.getByLabelText("Week"));
    expect(screen.getByLabelText("Previous week")).toBeTruthy();
    expect(screen.getByLabelText("Next week")).toBeTruthy();
    expect(screen.queryByLabelText("Calendar legend")).toBeNull();
    fireEvent.press(screen.getByLabelText("Month"));
    expect(screen.getByLabelText("Previous month")).toBeTruthy();
    expect(screen.getByLabelText("Next month")).toBeTruthy();
    const legend = screen.getByLabelText("Calendar legend");
    expect(within(legend).getByText("Upcoming")).toBeTruthy();
    const json = dump(screen.toJSON());
    expect(json.indexOf("Nothing scheduled")).not.toBe(-1);
    expect(json.indexOf("Today")).not.toBe(-1);
    expect(json.indexOf("Nothing scheduled")).toBeLessThan(json.indexOf("Today"));
  });

  it("Week keeps Nothing scheduled for an empty day and lists rows with EventDayRows", async () => {
    serve({ events: [townHall] });
    renderWithProviders(<AlumniCalendar />);
    await screen.findByText("Town hall");
    fireEvent.press(screen.getByLabelText("Week"));
    expect(screen.getAllByText("Nothing scheduled").length).toBeGreaterThan(0);
    fireEvent.press(screen.getByText("Town hall"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/event/[id]", params: { id: "4" } });
  });

  it("keeps the empty and error copy", async () => {
    serve({});
    const { unmount } = renderWithProviders(<AlumniCalendar />);
    expect(await screen.findByText("No season to show")).toBeTruthy();
    unmount();

    get.mockRejectedValue(new Error("boom"));
    renderWithProviders(<AlumniCalendar />);
    expect(await screen.findAllByText("Try again")).toBeTruthy();
  });

  it("a skeleton while events load, not the empty state", async () => {
    get.mockImplementation(() => new Promise(() => {}));
    renderWithProviders(<AlumniCalendar />);
    expect(await screen.findByLabelText("Loading")).toBeTruthy();
    expect(screen.queryByText("No season to show")).toBeNull();
  });

  it("a failed events query shows Try again, and it refetches", async () => {
    serve({ events: "fail" });
    renderWithProviders(<AlumniCalendar />);
    const retry = await screen.findByText("Try again");
    expect(screen.queryByText("No season to show")).toBeNull();
    serve({ events: [open] });
    get.mockClear();
    fireEvent.press(retry);
    expect(await screen.findByText("Open day")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/events");
  });
});

describe("EventDayRows", () => {
  it("renders one grouped list of rows", () => {
    renderWithProviders(
      <EventDayRows entries={[{ kind: "event", at: 0, event: open }]} today={deviceTodayKey()} />,
    );
    fireEvent.press(screen.getByText("Open day"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/event/[id]", params: { id: "3" } });
  });

  it("lets an event and a session title take two lines beside a chip (360dp at font 1.3)", () => {
    renderWithProviders(
      <EventDayRows
        today={deviceTodayKey()}
        entries={[
          { kind: "event", at: 0, event: reunion },
          { kind: "session", at: 1, session: session(1, "Kickoff", iso(dayKeyIn(3)), dayKeyIn(3)) },
        ]}
      />,
    );
    expect(screen.getByText("Alumni reunion dinner").props.numberOfLines).toBe(2);
    expect(screen.getByText("Kickoff").props.numberOfLines).toBe(2);
  });
});
