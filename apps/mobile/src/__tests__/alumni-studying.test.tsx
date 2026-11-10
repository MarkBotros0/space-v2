import { act, screen } from "@testing-library/react-native";

// Community model, Build 3, Task 5: an alumnus in a community-wide season gets
// the student portal and stays an alumnus. These pin both sides of each branch.
jest.mock("expo-router", () => ({
  ...require("./helpers/layout-mock").expoRouterMock(),
  useRouter: () => ({ push: jest.fn() }),
  useFocusEffect: jest.fn(),
}));
jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn(), patch: jest.fn() } }));
jest.mock("../hooks/use-session", () => ({ useLogout: () => jest.fn() }));
jest.mock("../hooks/use-notifications", () => ({
  flattenNotifications: () => [],
  useMarkRead: () => ({ mutate: jest.fn(), isPending: false }),
  useNotifications: () => ({ data: undefined }),
  useUnreadCount: () => ({ data: 0 }),
}));

import { navByRole } from "@space/shared";

import { HomeActions } from "../design/layout/home-actions";
import { dashboardBranchFor } from "../lib/dashboard-branch";
import { useSessionStore } from "../store/session";
import { eventRow, session } from "./helpers/calendar-fixtures";
import { EVENTS, get, serve, studentDashboard } from "./helpers/dashboard-fixtures";
import { captured, resetCaptured } from "./helpers/layout-mock";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";

import AppLayout from "../../app/(app)/_layout";
import CalendarScreen from "../../app/(app)/(tabs)/calendar";
import DashboardScreen from "../../app/(app)/(tabs)/dashboard";
import HistoryScreen from "../../app/(app)/(tabs)/history";
import ProfileScreen from "../../app/(app)/(tabs)/profile";
import EditProfileScreen from "../../app/(app)/edit-profile";

const DASHBOARD = "/api/v1/me/dashboard";
const HISTORY = "/api/v1/me/season-history";
const PROFILE = "/api/v1/me/profile";

const studying = makeSession("STUDENT", { activeSeasonId: 7, graduationYear: 2025 }, { id: 1, name: "Mina Adel" });
const finished = makeSession("STUDENT", { activeSeasonId: null, graduationYear: 2025 }, { id: 1, name: "Mina Adel" });

const profile = {
  name: "Mina Adel",
  email: "mina@jpc.test",
  avatarPath: null,
  graduationYear: 2025,
  activeSeasonTitle: "Community Season",
  university: "Cairo University",
  faculty: null,
  universityGraduationYear: 2031,
  phone: null,
  dateOfBirth: null,
};
const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 20)));

beforeEach(() => {
  jest.clearAllMocks();
  resetCaptured();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(studying);
});
afterEach(settle);

describe("while studying", () => {
  it("has the student tabs", () => {
    expect(useSessionStore.getState().nav()).toBe(navByRole.STUDENT);
  });

  it("Home is a student's, reading the student dashboard", async () => {
    expect(dashboardBranchFor({ role: "STUDENT", graduationYear: 2025, activeSeasonId: 7 })).toBe("STUDENT");
    serve({ [DASHBOARD]: studentDashboard, [EVENTS]: { events: [], total: 0 } });
    renderWithProviders(<DashboardScreen />);
    await settle();
    expect(get).toHaveBeenCalledWith(DASHBOARD);
    expect(get).not.toHaveBeenCalledWith(HISTORY);
  });

  it.each([["work"], ["season"]])("the alumni guard lets them through to %s", (tab) => {
    captured.segments = ["(app)", "(tabs)", tab];
    renderWithProviders(<AppLayout />);
    expect(screen.queryByTestId("redirect")).toBeNull();
  });

  it("Profile names their class, and the university's year stays its own", async () => {
    serve({ [PROFILE]: { profile } });
    renderWithProviders(<ProfileScreen />);
    expect(await screen.findByText("JPCS-25")).toBeTruthy();
    expect(screen.queryByText("Student")).toBeNull();
    expect(screen.getByText("Cairo University")).toBeTruthy();
    expect(screen.getByText("2031")).toBeTruthy();
  });

  it("Edit profile is the student's: the academic record is editable", async () => {
    serve({ [PROFILE]: { profile } });
    renderWithProviders(<EditProfileScreen />);
    expect((await screen.findByLabelText("University")).props.value).toBe("Cairo University");
    expect(screen.getByLabelText("Graduation year").props.value).toBe("2031");
  });

  it("the Calendar is a student's, with the alumni-only event on it", async () => {
    serve({
      "/api/v1/seasons/7/sessions": { sessions: [session(1, "Kickoff", "2099-03-01T18:00:00.000Z", "2099-03-01")] },
      "/api/v1/events": {
        events: [
          {
            ...eventRow(2, "Alumni dinner", "2099-03-05T18:00:00.000Z", "2099-03-05", "20:00"),
            visibility: "ALUMNI_ONLY",
          },
        ],
        total: 1,
      },
      [DASHBOARD]: { ...studentDashboard, todayOrgDay: "2099-02-01" },
    });
    renderWithProviders(<CalendarScreen />);
    expect(await screen.findByText("Kickoff")).toBeTruthy();
    expect(await screen.findByText("Alumni dinner")).toBeTruthy();
    expect(screen.getByText("Calendar")).toBeTruthy();
    expect(screen.queryByText("Events")).toBeNull();
  });

  it("History is a student's", async () => {
    serve({ [HISTORY]: { seasons: [] } });
    renderWithProviders(<HistoryScreen />);
    expect(await screen.findByText("Seasons you've participated in")).toBeTruthy();
  });
});

describe("once the season is over", () => {
  beforeEach(() => useSessionStore.setState(finished));

  it("Home, tabs and guard are the alumni's again", () => {
    expect(dashboardBranchFor({ role: "STUDENT", graduationYear: 2025, activeSeasonId: null })).toBe("ALUMNI");
    expect(
      useSessionStore
        .getState()
        .nav()
        ?.tabs.map((t) => t.label),
    ).toEqual(["Home", "Events", "History", "Profile", "More"]);
    captured.segments = ["(app)", "(tabs)", "work"];
    renderWithProviders(<AppLayout />);
    expect(screen.getByTestId("redirect")).toHaveTextContent("/dashboard");
  });

  it("Profile shows the alumni record, and Edit profile leaves the academic record alone", async () => {
    serve({ [PROFILE]: { profile: { ...profile, activeSeasonTitle: null } } });
    const { unmount } = renderWithProviders(<ProfileScreen />);
    expect(await screen.findByText("JPCS-25")).toBeTruthy();
    unmount();
    renderWithProviders(<EditProfileScreen />);
    expect(screen.getByLabelText("Name")).toBeTruthy();
    expect(screen.queryByLabelText("University")).toBeNull();
  });

  it("History is the alumni's", async () => {
    serve({ [HISTORY]: { seasons: [] } });
    renderWithProviders(<HistoryScreen />);
    await settle();
    expect(screen.queryByText("Seasons you've participated in")).toBeNull();
  });

  it("the menu asks for no profile", async () => {
    serve({});
    renderWithProviders(<HomeActions />);
    await settle();
    expect(get).not.toHaveBeenCalledWith(PROFILE);
  });
});

// The student's copy stays: a graduation year is what turns "Student" into this.
// No role badge on Profile (owner, 2026-11-07): only a graduate's class is named.
it("a student who isn't an alumnus has no class on Profile", async () => {
  useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }, { id: 1 }));
  serve({ [PROFILE]: { profile: { ...profile, graduationYear: null } } });
  renderWithProviders(<ProfileScreen />);
  expect(await screen.findByText("Cairo University")).toBeTruthy();
  expect(screen.queryByText(/JPCS-\d{2}/)).toBeNull();
  expect(screen.queryByText("Student")).toBeNull();
});
