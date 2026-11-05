import { fireEvent, screen, within } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn() } }));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";
import CalendarScreen from "../../app/(app)/(tabs)/calendar";
import { eventRow, seasonRow, session, studentSession } from "./helpers/calendar-fixtures";

const get = apiClient.get as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
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
    expect(screen.getAllByText("SUNDAY, MARCH 1")).toHaveLength(1);
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

  it("cues upcoming days with in-N-days chips and the wall time", async () => {
    serveStudent();
    renderWithProviders(<CalendarScreen />);
    expect(await screen.findByText("Kickoff")).toBeTruthy();
    expect(screen.getAllByText(/^in \d+ days$/).length).toBe(2);
    // The org wall time and duration under the title (X13).
    expect(screen.getAllByText("8:00 PM · 60 min").length).toBe(2);
    expect(screen.queryByLabelText("Calendar legend")).toBeNull();
  });

  it("shows a Monday-first month grid anchored on the next session, muting days outside the month", async () => {
    serveStudent();
    renderWithProviders(<CalendarScreen />);
    await screen.findByText("Kickoff");

    fireEvent.press(screen.getByLabelText("Month"));
    expect(screen.getByText("March 2099")).toBeTruthy();
    // 1 Mar 2099 is a Sunday: the grid opens on Monday 23 Feb, its date muted as out-of-month.
    const feb = screen.getByLabelText("Feb 23, 2099");
    expect(within(feb).getByText("23").props.className).toContain("text-muted-foreground");
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

  it("opens Week on the week of the anchor day, not the month's first", async () => {
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
    expect(screen.getByText("Mar 9 – 15")).toBeTruthy();
  });
});

describe("calendar — Week chips", () => {
  it("keeps a chip title on one line so a word never breaks mid-way", async () => {
    useSessionStore.setState(studentSession);
    get.mockImplementation((url: string) =>
      url.startsWith("/api/v1/events")
        ? Promise.resolve({ data: { data: { events: [], total: 0 } } })
        : Promise.resolve({
            data: {
              data: { sessions: [session(2, "Opening night", "2099-03-12T18:00:00.000Z", "2099-03-12")] },
            },
          }),
    );
    renderWithProviders(<CalendarScreen />);
    await screen.findByText("Opening night");
    fireEvent.press(screen.getByLabelText("Week"));
    expect(screen.getByText("Opening night").props.numberOfLines).toBe(1);
  });
});
