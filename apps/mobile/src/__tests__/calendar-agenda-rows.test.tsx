import { fireEvent, screen } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn() } }));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush, back: jest.fn() }) }));

import CalendarScreen from "../../app/(app)/(tabs)/calendar";
import { sessionChip } from "../design/sessions/session-chip";
import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { seasonRow, session, studentSession } from "./helpers/calendar-fixtures";
import { staffDashboard, studentDashboard } from "./helpers/dashboard-fixtures";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";

const get = apiClient.get as jest.Mock;

// Only Date is faked: react-query and the renderer keep their real timers.
beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({
    now: new Date(2099, 2, 1, 8, 0),
    doNotFake: [
      "nextTick", "setImmediate", "clearImmediate", "setInterval", "clearInterval",
      "setTimeout", "clearTimeout", "queueMicrotask", "requestAnimationFrame",
      "cancelAnimationFrame", "requestIdleCallback", "cancelIdleCallback", "performance", "hrtime",
    ],
  });
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});
afterEach(() => jest.useRealTimers());

describe("sessionChip: sessionBadge's words on the chip tones", () => {
  const s = { dayKey: "2099-03-07", attendanceMarked: false };
  it("counts an upcoming session in org days, the wording Today uses", () => {
    expect(sessionChip(s, "2099-03-01", false)).toEqual({ tone: "neutral", label: "in 6 days" });
  });
  it("says Today for today", () => {
    expect(sessionChip({ ...s, dayKey: "2099-03-01" }, "2099-03-01", false)).toEqual({
      tone: "info",
      label: "Today",
    });
  });
  it("gives a past session nothing to a student and its attendance to staff", () => {
    const past = { dayKey: "2099-02-20", attendanceMarked: false };
    expect(sessionChip(past, "2099-03-01", false)).toBeNull();
    expect(sessionChip(past, "2099-03-01", true)).toEqual({ tone: "warn", label: "Attendance pending" });
    expect(sessionChip({ ...past, attendanceMarked: true }, "2099-03-01", true)).toEqual({
      tone: "ok",
      label: "Attendance marked",
    });
  });
});

describe("the student's calendar counts from the server's day, not the device's", () => {
  const near = session(1, "Kickoff", "2099-03-07T18:00:00.000Z", "2099-03-07");
  const earlier = session(2, "Week zero", "2099-03-02T18:00:00.000Z", "2099-03-02");

  function serve(todayOrgDay: string | null, sessions = [near]) {
    useSessionStore.setState(studentSession);
    get.mockImplementation((url: string) => {
      if (url === "/api/v1/me/dashboard") {
        return todayOrgDay === null
          ? Promise.reject(new Error("down"))
          : Promise.resolve({ data: { data: { ...studentDashboard, todayOrgDay } } });
      }
      if (url.includes("/sessions")) return Promise.resolve({ data: { data: { sessions } } });
      return Promise.resolve({ data: { data: { events: [], total: 0 } } });
    });
  }

  it("a device behind the org: the row reads what Today reads, one tab away", async () => {
    // The device says Mar 1, the org Mar 5.
    serve("2099-03-05");
    renderWithProviders(<CalendarScreen />);
    expect(await screen.findByText("in 2 days")).toBeTruthy();
    expect(screen.queryByText("in 6 days")).toBeNull();
  });

  it("a device behind the org: a session already past for the org isn't Upcoming", async () => {
    serve("2099-03-05", [earlier, near]);
    renderWithProviders(<CalendarScreen />);
    expect(await screen.findByText("Kickoff")).toBeTruthy();
    expect(screen.queryByText("Week zero")).toBeNull();
  });

  it("a device ahead of the org: tonight's session is still Today, and still Upcoming", async () => {
    jest.setSystemTime(new Date(2099, 2, 8, 1, 0));
    serve("2099-03-07");
    renderWithProviders(<CalendarScreen />);
    expect(await screen.findByText("Kickoff")).toBeTruthy();
    expect(screen.getByLabelText(/Kickoff.*Today/)).toBeTruthy();
  });

  it("the dashboard failing falls back to the device's day", async () => {
    serve(null);
    renderWithProviders(<CalendarScreen />);
    expect(await screen.findByText("in 6 days")).toBeTruthy();
  });
});

describe("the staff calendars count from the server's day, not the device's", () => {
  const near = session(1, "Kickoff", "2099-03-07T18:00:00.000Z", "2099-03-07");
  const earlier = session(2, "Week zero", "2099-03-02T18:00:00.000Z", "2099-03-02");
  const roles = [
    ["ADMIN", makeSession("ADMIN", { seasonAdminIds: [7] }, { id: 2 })],
    ["SUPER", makeSession("SUPER")],
    ["LEADER", makeSession("LEADER", { groupLeaderIds: [3] })],
  ] as const;

  function serve(role: (typeof roles)[number], todayOrgDay: string | null, sessions = [near]) {
    useSessionStore.setState(role[1]);
    get.mockImplementation((url: string) => {
      if (url.startsWith("/api/v1/me/dashboard")) {
        return todayOrgDay === null
          ? Promise.reject(new Error("down"))
          : Promise.resolve({ data: { data: { ...staffDashboard("season"), todayOrgDay } } });
      }
      if (url === "/api/v1/seasons")
        return Promise.resolve({ data: { data: { seasons: [seasonRow(7, 2099, "ACTIVE")] } } });
      if (url === "/api/v1/groups") {
        const group = {
          id: 3, name: "G", description: null, studentCount: 3, leaderNames: [],
          seasonId: 7, seasonCode: "S7", seasonTitle: "Season 7",
        };
        return Promise.resolve({ data: { data: { groups: [group] } } });
      }
      if (url.includes("/sessions")) return Promise.resolve({ data: { data: { sessions } } });
      return Promise.resolve({ data: { data: { events: [], total: 0 } } });
    });
  }

  describe.each(roles)("%s", (...role) => {
    const r = roles.find((x) => x[0] === role[0])!;

    it("a device behind the org: the row's cue follows the server's day", async () => {
      serve(r, "2099-03-05"); // the device says Mar 1
      renderWithProviders(<CalendarScreen />);
      expect(await screen.findByText("in 2 days")).toBeTruthy();
      expect(screen.queryByText("in 6 days")).toBeNull();
    });

    it("a device behind the org: a session already past for the org isn't Upcoming", async () => {
      serve(r, "2099-03-05", [earlier, near]);
      renderWithProviders(<CalendarScreen />);
      expect(await screen.findByText("Kickoff")).toBeTruthy();
      expect(screen.queryByText("Week zero")).toBeNull();
    });

    it("the dashboard failing falls back to the device's day, with no error screen", async () => {
      serve(r, null);
      renderWithProviders(<CalendarScreen />);
      expect(await screen.findByText("in 6 days")).toBeTruthy();
    });
  });
});

describe("calendar agenda rows", () => {
  function serve() {
    useSessionStore.setState(studentSession);
    get.mockResolvedValue({
      data: { data: { sessions: [session(1, "Kickoff", "2099-03-07T18:00:00.000Z", "2099-03-07")] } },
    });
  }

  it("shows the same 'in 6 days' as Today for the same org day, spoken with the row", async () => {
    serve();
    renderWithProviders(<CalendarScreen />);
    expect(await screen.findByText("in 6 days")).toBeTruthy();
    expect(screen.getByLabelText(/Kickoff.*in 6 days/)).toBeTruthy();
    expect(screen.getByText("8:00 PM · 60 min")).toBeTruthy();
    expect(screen.getByText("SATURDAY, MARCH 7")).toBeTruthy();
  });

  it("opens /session/[id] from the row", async () => {
    serve();
    renderWithProviders(<CalendarScreen />);
    fireEvent.press(await screen.findByLabelText(/Kickoff/));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/session/[id]", params: { id: "1" } });
  });

  it("switches Upcoming / Week / Month on the segmented control", async () => {
    serve();
    renderWithProviders(<CalendarScreen />);
    await screen.findByText("Kickoff");
    expect(screen.getByTestId("segmented-control")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Month"));
    expect(screen.getByLabelText("Previous month")).toBeTruthy();
  });

  it("renders the grid's day numbers tabular and capped at font 1.3", async () => {
    serve();
    renderWithProviders(<CalendarScreen />);
    await screen.findByText("Kickoff");
    fireEvent.press(screen.getByLabelText("Month"));
    const day = screen.getAllByText("15")[0]!;
    expect(day.props.maxFontSizeMultiplier).toBe(1.3);
    expect(day).toHaveStyle({ fontVariant: ["tabular-nums"] });
  });
});

describe("calendar chip (K5)", () => {
  it("keeps a long label on one line with an ellipsis and may shrink inside its row", () => {
    const { Chip } = require("../components/calendar/CalendarEntries");
    const { render } = require("@testing-library/react-native");
    const utils = render(<Chip label="Opening night with the whole cohort" tint={{ box: "bg-muted", text: "text-foreground" }} />);
    const text = utils.getByText("Opening night with the whole cohort");
    expect(text.props.numberOfLines).toBe(1);
    expect(text.props.ellipsizeMode).toBe("tail");
    expect(utils.getByTestId("chip-Opening night with the whole cohort").props.className).toContain("max-w-full");
  });
});
