import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn() } }));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";
import CalendarScreen from "../../app/(app)/calendar";

const get = apiClient.get as jest.Mock;

const session = (id: number, title: string, startsAt: string, dayKey: string) => ({
  id, title, startsAt, dayKey, durationMinutes: 60, location: null, recurrenceGroupId: null,
  attendanceMarked: false, seasonId: 7, seasonCode: "S26", seasonTitle: "Spring 2026",
  checkInToken: null, checkInOpenAt: null, checkInClosedAt: null, startTime: "20:00",
});

const seasonRow = (id: number, year: number, status: "DRAFT" | "ACTIVE") => ({
  id, code: `S${id}`, title: `Season ${id}`, program: "TEST", year, status,
  startDate: `${year}-01-01T00:00:00.000Z`, endDate: `${year}-12-31T00:00:00.000Z`,
});

const studentSession = makeSession("STUDENT", { activeSeasonId: 7 }, { id: 9 });
const adminSession = makeSession("ADMIN", { seasonAdminIds: [7, 8] }, { id: 2 });

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

it("renders a student's calendar from their pinned season, grouped by the server's dayKey", async () => {
  useSessionStore.setState(studentSession);
  get.mockResolvedValue({
    data: { data: { sessions: [
      session(1, "Kickoff", "2099-03-01T18:00:00.000Z", "2099-03-01"),
      // 23:30Z on the 1st is 01:30 on the 2nd in Cairo: the server keyed it to
      // the 2nd. A device-zone grouping in UTC would put it under the 1st.
      session(2, "Late night", "2099-03-01T23:30:00.000Z", "2099-03-02"),
      session(3, "Week two", "2099-03-08T18:00:00.000Z", "2099-03-08"),
    ] } },
  });

  renderWithProviders(<CalendarScreen />);

  expect(await screen.findByText("Kickoff")).toBeTruthy();
  expect(screen.getByText("Mar 1, 2099")).toBeTruthy();
  expect(screen.getByText("Mar 2, 2099")).toBeTruthy();
  expect(screen.getByText("Mar 8, 2099")).toBeTruthy();
  // The student never fetched the seasons list — their season is pinned.
  expect(get).not.toHaveBeenCalledWith("/api/v1/seasons");
  expect(get).toHaveBeenCalledWith("/api/v1/seasons/7/sessions");
});

it("shows an empty state for a student with no season and fetches no sessions", async () => {
  useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: null }, { id: 9 }));

  renderWithProviders(<CalendarScreen />);

  expect(await screen.findByText("No season to show")).toBeTruthy();
  // Events are org-wide and need no season; sessions do and are not fetched.
  expect(get).toHaveBeenCalledTimes(1);
  expect(get).toHaveBeenCalledWith("/api/v1/events");
});

it("navigates to session detail on press", async () => {
  useSessionStore.setState(studentSession);
  get.mockResolvedValue({
    data: { data: { sessions: [session(1, "Kickoff", "2099-03-01T18:00:00.000Z", "2099-03-01")] } },
  });

  renderWithProviders(<CalendarScreen />);
  fireEvent.press(await screen.findByText("Kickoff"));

  expect(mockPush).toHaveBeenCalledWith({ pathname: "/session/[id]", params: { id: "1" } });
});

const range = (sessions: unknown[]) => ({
  data: { data: { sessions, from: "2099-02-28T22:00:00.000Z", to: "2099-04-25T22:00:00.000Z", fromDayKey: "2099-03-01", toDayKey: "2099-04-25" } },
});

describe("calendar — staff branches (G17, D-16.7)", () => {
  it("gives ADMIN the current season through GET /sessions, with a season switcher", async () => {
    useSessionStore.setState(adminSession);
    get.mockImplementation((url: string, config?: { params?: { seasonId?: number } }) => {
      if (url === "/api/v1/seasons") {
        return Promise.resolve({ data: { data: { seasons: [seasonRow(8, 2027, "DRAFT"), seasonRow(7, 2026, "ACTIVE")] } } });
      }
      if (url === "/api/v1/sessions") {
        const title = config?.params?.seasonId === 8 ? "Draft season session" : "Kickoff";
        return Promise.resolve(range([session(1, title, "2099-03-01T18:00:00.000Z", "2099-03-01")]));
      }
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });

    renderWithProviders(<CalendarScreen />);

    expect(await screen.findByText("Kickoff")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/sessions", { params: { seasonId: 7 } });
    fireEvent.press(screen.getByText("Season 8"));
    expect(await screen.findByText("Draft season session")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/sessions", { params: { seasonId: 8 } });
  });

  it("gives SUPER every ACTIVE season in one window, labels each row's season, and pages", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    get.mockResolvedValue(
      range([
        { ...session(1, "Spring kickoff", "2099-03-01T18:00:00.000Z", "2099-03-01"), seasonTitle: "Spring 2099" },
        { ...session(2, "Autumn kickoff", "2099-03-01T19:00:00.000Z", "2099-03-01"), seasonId: 9, seasonTitle: "Autumn 2099" },
      ]),
    );

    renderWithProviders(<CalendarScreen />);

    expect(await screen.findByText("Spring kickoff")).toBeTruthy();
    expect(screen.getByText("Spring 2099")).toBeTruthy();
    expect(screen.getByText("Autumn 2099")).toBeTruthy();
    expect(screen.getByText("Mar 1, 2099 – Apr 25, 2099")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/sessions", { params: {} });

    fireEvent.press(screen.getByText("Later"));
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith("/api/v1/sessions", { params: { from: "2099-04-25T22:00:00.000Z" } }),
    );
    // Paging swaps to a fresh query key, so the screen shows Loading until it lands.
    fireEvent.press(await screen.findByText("Earlier"));
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith("/api/v1/sessions", { params: { to: "2099-02-28T22:00:00.000Z" } }),
    );
  });

  it("renders the server's org time, not the device's reading of startsAt (X13)", async () => {
    useSessionStore.setState(makeSession("LEADER", { groupLeaderIds: [3] }));
    get.mockResolvedValue(range([{ ...session(1, "Kickoff", "2099-03-01T18:00:00.000Z", "2099-03-01"), startTime: "20:00" }]));
    renderWithProviders(<CalendarScreen />);
    expect(await screen.findByText("8:00 PM")).toBeTruthy();
  });

  it("tells a leader with no groups so, and fetches nothing (spec 03 R84)", async () => {
    useSessionStore.setState(makeSession("LEADER", { groupLeaderIds: [] }));
    renderWithProviders(<CalendarScreen />);
    expect(await screen.findByText("You don't lead any groups yet.")).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  });

  it("gives MENTOR a graceful state (spec 03 §9)", async () => {
    useSessionStore.setState(makeSession("MENTOR"));
    renderWithProviders(<CalendarScreen />);
    expect(await screen.findByText("The calendar isn't available for your role.")).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  });
});

const eventRow = (id: number, title: string, date: string, dayKey: string, time: string | null) => ({
  id, title, date, endDate: null, dayKey, endDayKey: null, time, allDay: time === null,
  url: null, visibility: "ALL" as const, seasonId: null, seasonCode: null,
});

describe("calendar — JPC events merged into the day buckets (Plan 14)", () => {
  it("interleaves JPC events with a student's sessions in the same day buckets", async () => {
    useSessionStore.setState(studentSession);
    get.mockImplementation((url: string) =>
      url.startsWith("/api/v1/events")
        ? Promise.resolve({
            data: { data: { events: [eventRow(3, "Summer retreat", "2099-03-01T09:00:00.000Z", "2099-03-01", "11:00")], total: 1 } },
          })
        : Promise.resolve({
            data: { data: { sessions: [session(1, "Kickoff", "2099-03-01T18:00:00.000Z", "2099-03-01")] } },
          }),
    );

    renderWithProviders(<CalendarScreen />);

    // One day header, both entries under it, event first (09:00Z before 18:00Z).
    expect(await screen.findByText("Summer retreat")).toBeTruthy();
    expect(screen.getByText("Kickoff")).toBeTruthy();
    expect(screen.getAllByText("Mar 1, 2099")).toHaveLength(1);
    const titles = screen.getAllByText(/^(Summer retreat|Kickoff)$/).map((n) => n.props.children);
    expect(titles).toEqual(["Summer retreat", "Kickoff"]);

    fireEvent.press(screen.getByText("Summer retreat"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/event/[id]", params: { id: "3" } });
  });

  it("still renders the calendar when the events request fails", async () => {
    // Two independent queries on one screen: an events outage must not take the
    // session calendar down with it.
    useSessionStore.setState(studentSession);
    get.mockImplementation((url: string) =>
      url.startsWith("/api/v1/events")
        ? Promise.reject(new Error("boom"))
        : Promise.resolve({
            data: { data: { sessions: [session(1, "Kickoff", "2099-03-01T18:00:00.000Z", "2099-03-01")] } },
          }),
    );

    renderWithProviders(<CalendarScreen />);
    expect(await screen.findByText("Kickoff")).toBeTruthy();
  });

  it("shows an alumnus with no season the org's events instead of an empty wall", async () => {
    useSessionStore.setState({ ...studentSession, scopes: { ...studentSession.scopes, activeSeasonId: null } });
    get.mockImplementation((url: string) =>
      url.startsWith("/api/v1/events")
        ? Promise.resolve({
            data: { data: { events: [eventRow(4, "Alumni dinner", "2099-03-05T17:00:00.000Z", "2099-03-05", "19:00")], total: 1 } },
          })
        : Promise.reject(new Error(`unexpected GET ${url}`)),
    );

    renderWithProviders(<CalendarScreen />);
    expect(await screen.findByText("Alumni dinner")).toBeTruthy();
    expect(screen.queryByText("No season to show")).toBeNull();
  });

  it("shows a windowed (SUPER) calendar only the events inside its org-day window", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    get.mockImplementation((url: string) =>
      url.startsWith("/api/v1/events")
        ? Promise.resolve({
            data: {
              data: {
                events: [
                  eventRow(5, "In window", "2099-03-02T08:00:00.000Z", "2099-03-02", "10:00"),
                  eventRow(6, "Out of window", "2099-06-01T08:00:00.000Z", "2099-06-01", "10:00"),
                ],
                total: 2,
              },
            },
          })
        : Promise.resolve(range([session(1, "Kickoff", "2099-03-01T18:00:00.000Z", "2099-03-01")])),
    );

    renderWithProviders(<CalendarScreen />);
    expect(await screen.findByText("In window")).toBeTruthy();
    expect(screen.getByText("Kickoff")).toBeTruthy();
    expect(screen.queryByText("Out of window")).toBeNull();
  });
});
