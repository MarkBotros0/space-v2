import { fireEvent, screen } from "@testing-library/react-native";

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

const seasonRow = (id: number, year: number, status: "DRAFT" | "ACTIVE") => ({
  id,
  code: `S${id}`,
  title: `Season ${id}`,
  program: "TEST",
  year,
  status,
  startDate: `${year}-01-01T00:00:00.000Z`,
  endDate: `${year}-12-31T00:00:00.000Z`,
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
  // v1 agenda headings ("EEEE, MMMM d"), from the server's dayKey: the
  // 23:30Z session files under Monday the 2nd (X13).
  expect(screen.getByText("Sunday, March 1")).toBeTruthy();
  expect(screen.getByText("Monday, March 2")).toBeTruthy();
  expect(screen.getByText("Sunday, March 8")).toBeTruthy();
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
    expect(screen.getAllByText("8:00").length).toBe(2);
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

const eventRow = (
  id: number,
  title: string,
  date: string,
  dayKey: string,
  time: string | null,
) => ({
  id,
  title,
  date,
  endDate: null,
  dayKey,
  endDayKey: null,
  time,
  allDay: time === null,
  url: null,
  visibility: "ALL" as const,
  seasonId: null,
  seasonCode: null,
});

describe("calendar — JPC events merged into the day buckets (Plan 14)", () => {
  it("interleaves JPC events with a student's sessions in the same day buckets", async () => {
    useSessionStore.setState(studentSession);
    get.mockImplementation((url: string) =>
      url.startsWith("/api/v1/events")
        ? Promise.resolve({
            data: {
              data: {
                events: [
                  eventRow(3, "Summer retreat", "2099-03-01T09:00:00.000Z", "2099-03-01", "11:00"),
                ],
                total: 1,
              },
            },
          })
        : Promise.resolve({
            data: {
              data: { sessions: [session(1, "Kickoff", "2099-03-01T18:00:00.000Z", "2099-03-01")] },
            },
          }),
    );

    renderWithProviders(<CalendarScreen />);

    // One day header, both entries under it, event first (09:00Z before 18:00Z).
    expect(await screen.findByText("Summer retreat")).toBeTruthy();
    expect(screen.getByText("Kickoff")).toBeTruthy();
    expect(screen.getAllByText("Sunday, March 1")).toHaveLength(1);
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
            data: {
              data: { sessions: [session(1, "Kickoff", "2099-03-01T18:00:00.000Z", "2099-03-01")] },
            },
          }),
    );

    renderWithProviders(<CalendarScreen />);
    expect(await screen.findByText("Kickoff")).toBeTruthy();
  });

  it("shows an alumnus with no season the org's events instead of an empty wall", async () => {
    useSessionStore.setState({
      ...studentSession,
      scopes: { ...studentSession.scopes, activeSeasonId: null, graduationYear: 2024 },
    });
    get.mockImplementation((url: string) =>
      url.startsWith("/api/v1/events")
        ? Promise.resolve({
            data: {
              data: {
                events: [
                  eventRow(4, "Alumni dinner", "2099-03-05T17:00:00.000Z", "2099-03-05", "19:00"),
                ],
                total: 1,
              },
            },
          })
        : Promise.reject(new Error(`unexpected GET ${url}`)),
    );

    renderWithProviders(<CalendarScreen />);
    expect(await screen.findByText("Alumni dinner")).toBeTruthy();
    expect(screen.queryByText("No season to show")).toBeNull();
  });

  it("shows SUPER the org's events beside the season sessions", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    get.mockImplementation((url: string) => {
      if (url === "/api/v1/seasons")
        return Promise.resolve({ data: { data: { seasons: [seasonRow(7, 2026, "ACTIVE")] } } });
      if (url === "/api/v1/seasons/7/sessions")
        return Promise.resolve({
          data: {
            data: { sessions: [session(1, "Kickoff", "2099-03-01T18:00:00.000Z", "2099-03-01")] },
          },
        });
      if (url.startsWith("/api/v1/events"))
        return Promise.resolve({
          data: {
            data: {
              events: [
                eventRow(5, "JPC retreat", "2099-03-02T08:00:00.000Z", "2099-03-02", "10:00"),
              ],
              total: 1,
            },
          },
        });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });

    renderWithProviders(<CalendarScreen />);
    expect(await screen.findByText("JPC retreat")).toBeTruthy();
    expect(screen.getByText("Kickoff")).toBeTruthy();
  });
});

describe("calendar — Upcoming / Week / Month and visual cues (REG-75, REG-76)", () => {
  const kickoff = session(1, "Kickoff", "2099-03-01T18:00:00.000Z", "2099-03-01");
  function serveStudent() {
    useSessionStore.setState(studentSession);
    get.mockImplementation((url: string) =>
      url.startsWith("/api/v1/events")
        ? Promise.resolve({ data: { data: { events: [], total: 0 } } })
        : Promise.resolve({
            data: {
              data: {
                sessions: [
                  kickoff,
                  session(2, "Week two", "2099-03-12T18:00:00.000Z", "2099-03-12"),
                ],
              },
            },
          }),
    );
  }

  it("cues upcoming days with in-N-days wording and v1's time rail", async () => {
    serveStudent();
    renderWithProviders(<CalendarScreen />);
    expect(await screen.findByText("Kickoff")).toBeTruthy();
    expect(screen.getAllByText(/^in \d+ days$/).length).toBe(2);
    // v1's time rail: the org wall time split into "8:00" and "PM" (X13).
    expect(screen.getAllByText("8:00").length).toBe(2);
    expect(screen.getAllByText("PM").length).toBe(2);
    expect(screen.getAllByText("60 min").length).toBe(2);
    expect(screen.queryByLabelText("Calendar legend")).toBeNull();
  });

  it("shows a Monday-first month grid anchored on the next session, dimming days outside the month", async () => {
    serveStudent();
    renderWithProviders(<CalendarScreen />);
    await screen.findByText("Kickoff");

    fireEvent.press(screen.getByLabelText("Month"));
    expect(screen.getByText("March 2099")).toBeTruthy();
    // 1 Mar 2099 is a Sunday: the grid opens on Monday 23 Feb, dimmed as out-of-month.
    const feb = screen.getByLabelText("Feb 23, 2099");
    expect(feb.props.style.opacity ?? feb.props.style?.[0]?.opacity).toBe(0.6);
    // v1's grid shows each session's title chip in its day cell; no tap-a-day list.
    expect(screen.getByLabelText("Kickoff")).toBeTruthy();
    expect(screen.getByLabelText("Week two")).toBeTruthy();
    expect(screen.getByText("Mon")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Week two"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/session/[id]", params: { id: "2" } });

    fireEvent.press(screen.getByLabelText("Next month"));
    expect(screen.getByText("April 2099")).toBeTruthy();
  });

  it("lists a week's seven days and steps by week", async () => {
    serveStudent();
    renderWithProviders(<CalendarScreen />);
    await screen.findByText("Kickoff");

    fireEvent.press(screen.getByLabelText("Week"));
    expect(screen.getByText("Feb 23 – Mar 1")).toBeTruthy();
    expect(screen.getByText("Kickoff")).toBeTruthy();

    fireEvent.press(screen.getByLabelText("Next week"));
    expect(screen.getByText("Mar 2 – 8")).toBeTruthy();
    expect(screen.queryByText("Kickoff")).toBeNull();
  });

  it("opens Week on the week of the anchor month's first day, like v1", async () => {
    useSessionStore.setState(studentSession);
    get.mockImplementation((url: string) =>
      url.startsWith("/api/v1/events")
        ? Promise.resolve({ data: { data: { events: [], total: 0 } } })
        : Promise.resolve({
            data: {
              data: {
                sessions: [session(2, "Week two", "2099-03-12T18:00:00.000Z", "2099-03-12")],
              },
            },
          }),
    );
    renderWithProviders(<CalendarScreen />);
    await screen.findByText("Week two");

    fireEvent.press(screen.getByLabelText("Week"));
    expect(screen.getByText("Feb 23 – Mar 1")).toBeTruthy();
  });
});
