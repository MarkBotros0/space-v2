import { fireEvent, screen } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn() } }));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";
import CalendarScreen from "../../app/(app)/(tabs)/calendar";
import { seasonRow, session, studentSession } from "./helpers/calendar-fixtures";

const get = apiClient.get as jest.Mock;

const adminSession = makeSession("ADMIN", { seasonAdminIds: [7, 8] }, { id: 2 });

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

it("renders a student's calendar from their pinned season, grouped by the server's dayKey", async () => {
  useSessionStore.setState(studentSession);
  get.mockResolvedValue({
    data: {
      data: {
        sessions: [
          session(1, "Kickoff", "2099-03-01T18:00:00.000Z", "2099-03-01"),
          // 23:30Z on the 1st is 01:30 on the 2nd in Cairo: the server keyed it to
          // the 2nd. A device-zone grouping in UTC would put it under the 1st.
          session(2, "Late night", "2099-03-01T23:30:00.000Z", "2099-03-02"),
          session(3, "Week two", "2099-03-08T18:00:00.000Z", "2099-03-08"),
        ],
      },
    },
  });

  renderWithProviders(<CalendarScreen />);

  expect(await screen.findByText("Kickoff")).toBeTruthy();
  // Agenda day headings ("EEEE, MMMM d", capitalised by the list header), from the server's dayKey: the
  // 23:30Z session files under Monday the 2nd (X13).
  expect(screen.getByText("SUNDAY, MARCH 1")).toBeTruthy();
  expect(screen.getByText("MONDAY, MARCH 2")).toBeTruthy();
  expect(screen.getByText("SUNDAY, MARCH 8")).toBeTruthy();
  // The student never fetched the seasons list — their season is pinned.
  expect(get).not.toHaveBeenCalledWith("/api/v1/seasons");
  expect(get).toHaveBeenCalledWith("/api/v1/seasons/7/sessions");
});

it("shows an empty state for a student with no season and fetches no sessions", async () => {
  useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: null }, { id: 9 }));

  renderWithProviders(<CalendarScreen />);

  // v1: a student with no season sees only this (B2-13) — no events read either.
  expect(await screen.findByText("No active season")).toBeTruthy();
  expect(screen.getByText("An admin will enroll you in a season when you're ready.")).toBeTruthy();
  expect(get).not.toHaveBeenCalled();
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

describe("calendar — staff branches (G17, D-16.7)", () => {
  it("gives ADMIN v1's season calendar for the current season, with a season switcher and Add session", async () => {
    useSessionStore.setState(adminSession);
    get.mockImplementation((url: string) => {
      if (url === "/api/v1/seasons") {
        return Promise.resolve({
          data: { data: { seasons: [seasonRow(8, 2027, "DRAFT"), seasonRow(7, 2026, "ACTIVE")] } },
        });
      }
      if (url === "/api/v1/seasons/7/sessions")
        return Promise.resolve({
          data: {
            data: { sessions: [session(1, "Kickoff", "2099-03-01T18:00:00.000Z", "2099-03-01")] },
          },
        });
      if (url === "/api/v1/seasons/8/sessions")
        return Promise.resolve({
          data: {
            data: {
              sessions: [
                session(2, "Draft season session", "2099-03-01T18:00:00.000Z", "2099-03-01"),
              ],
            },
          },
        });
      if (url.startsWith("/api/v1/events"))
        return Promise.resolve({ data: { data: { events: [], total: 0 } } });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });

    renderWithProviders(<CalendarScreen />);

    expect(await screen.findByText("Kickoff")).toBeTruthy();
    expect(screen.getByText("1 session")).toBeTruthy();
    expect(get).not.toHaveBeenCalledWith("/api/v1/sessions", expect.anything());
    fireEvent.press(screen.getByText("Add session"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/session/new", params: { seasonId: "7" } });
    fireEvent.press(screen.getByText("Season 8"));
    expect(await screen.findByText("Draft season session")).toBeTruthy();
    fireEvent.press(screen.getByText("Add session"));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: "/session/new",
      params: { seasonId: "8" },
    });
  });

  it("gives SUPER v1's all-seasons calendar: every ACTIVE season's sessions, one colour per season", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    get.mockImplementation((url: string) => {
      if (url === "/api/v1/seasons")
        return Promise.resolve({
          data: {
            data: {
              seasons: [
                seasonRow(7, 2026, "ACTIVE"),
                seasonRow(9, 2026, "ACTIVE"),
                seasonRow(8, 2027, "DRAFT"),
              ],
            },
          },
        });
      if (url === "/api/v1/seasons/7/sessions")
        return Promise.resolve({
          data: {
            data: {
              sessions: [session(1, "Spring kickoff", "2099-03-01T18:00:00.000Z", "2099-03-01")],
            },
          },
        });
      if (url === "/api/v1/seasons/9/sessions")
        return Promise.resolve({
          data: {
            data: {
              sessions: [
                {
                  ...session(2, "Autumn kickoff", "2099-03-01T19:00:00.000Z", "2099-03-01"),
                  seasonId: 9,
                  seasonCode: "S9",
                },
              ],
            },
          },
        });
      if (url.startsWith("/api/v1/events"))
        return Promise.resolve({ data: { data: { events: [], total: 0 } } });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });

    renderWithProviders(<CalendarScreen />);

    expect(await screen.findByText("Spring kickoff")).toBeTruthy();
    expect(screen.getByText("Autumn kickoff")).toBeTruthy();
    expect(screen.getByText("Calendar")).toBeTruthy();
    expect(screen.getByText("All active seasons across JPC.")).toBeTruthy();
    // The legend names each season by code; the DRAFT season is never read.
    expect(screen.getAllByText("S26").length).toBeGreaterThan(0);
    expect(screen.getAllByText("S9").length).toBeGreaterThan(0);
    expect(get).not.toHaveBeenCalledWith("/api/v1/seasons/8/sessions");
    expect(get).not.toHaveBeenCalledWith("/api/v1/sessions", expect.anything());

    fireEvent.press(screen.getByText("Spring kickoff"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/session/[id]", params: { id: "1" } });
  });

  const groupRow = (id: number, seasonId: number) => ({
    id,
    name: `Group ${id}`,
    description: null,
    studentCount: 3,
    leaderNames: [],
    seasonId,
    seasonCode: `S${seasonId}`,
    seasonTitle: `Season ${seasonId}`,
  });
  function serveLeader() {
    useSessionStore.setState(makeSession("LEADER", { groupLeaderIds: [3, 4] }));
    get.mockImplementation((url: string) => {
      if (url === "/api/v1/groups")
        return Promise.resolve({ data: { data: { groups: [groupRow(3, 7), groupRow(4, 8)] } } });
      if (url === "/api/v1/seasons/7/sessions")
        return Promise.resolve({
          data: {
            data: { sessions: [session(1, "Kickoff", "2099-03-01T18:00:00.000Z", "2099-03-01")] },
          },
        });
      if (url === "/api/v1/seasons/8/sessions")
        return Promise.resolve({
          data: {
            data: {
              sessions: [
                {
                  ...session(2, "Other season", "2099-03-08T18:00:00.000Z", "2099-03-08"),
                  seasonId: 8,
                },
              ],
            },
          },
        });
      if (url.startsWith("/api/v1/events"))
        return Promise.resolve({ data: { data: { events: [], total: 0 } } });
      return Promise.reject(new Error(url));
    });
  }

  it("gives a leader every led season's sessions in v1's season calendar, in org time (X13)", async () => {
    serveLeader();
    renderWithProviders(<CalendarScreen />);
    expect(await screen.findByText("Kickoff")).toBeTruthy();
    expect(await screen.findByText("Other season")).toBeTruthy();
    expect(screen.getByText("2 sessions")).toBeTruthy();
    expect(screen.getAllByText("8:00 PM · 60 min").length).toBe(2);
    expect(get).not.toHaveBeenCalledWith("/api/v1/sessions", expect.anything());
    fireEvent.press(screen.getByText("Kickoff"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/session/[id]", params: { id: "1" } });
  });

  it("tells a leader with no groups so, and fetches nothing (spec 03 R84)", async () => {
    useSessionStore.setState(makeSession("LEADER", { groupLeaderIds: [] }));
    renderWithProviders(<CalendarScreen />);
    expect(await screen.findByText("You don't lead any groups yet.")).toBeTruthy();
    expect(screen.getByText("No calendar")).toBeTruthy();
    expect(screen.getByText("An admin will add you to a group when you're ready.")).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  });

  it("gives MENTOR a graceful state (spec 03 §9)", async () => {
    useSessionStore.setState(makeSession("MENTOR"));
    renderWithProviders(<CalendarScreen />);
    expect(await screen.findByText("The calendar isn't available for your role.")).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  });
});
