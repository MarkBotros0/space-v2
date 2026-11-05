import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { Linking, ScrollView } from "react-native";

// `jest.mock` factories may only close over `mock*` consts (CLAUDE.md).
jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn() },
}));
jest.mock("expo-camera", () => require("./helpers/expo-camera"));

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: (...args: unknown[]) => mockPush(...args) }),
}));

// Home's frame carries the bell and the user menu (ruling R13), which fetch
// notifications; they have their own tests (screen.test.tsx). A marker
// stands in, so these tests see only the requests the branches make.
jest.mock("../design/layout/home-actions", () => {
  const { Text } = jest.requireActual("react-native");
  return { HomeActions: () => <Text testID="home-actions">home actions</Text> };
});

import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";
import {
  EVENTS,
  NEXT_SESSION_DETAIL,
  STUDENT_QUIZZES,
  UNREAD,
  events,
  get,
  liveSession,
  myAttendance,
  quizPage,
  requested,
  serve,
  sessionDetail,
  studentDashboard,
} from "./helpers/dashboard-fixtures";

import DashboardScreen from "../../app/(app)/(tabs)/dashboard";

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

/**
 * Lets the queries a test did not wait for (events, the budget, a refetch) land inside
 * act() before the tree unmounts, instead of warning "not wrapped in act". Registered in
 * each describe so it runs before Testing Library's own root-level cleanup.
 */
const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 20)));

/** Everything the student's Today reads; a test overrides or omits what it is about. */
const studentRoutes = {
  "/api/v1/me/dashboard": studentDashboard,
  "/api/v1/me/attendance": myAttendance,
  [EVENTS]: events,
  [NEXT_SESSION_DETAIL]: sessionDetail,
  [STUDENT_QUIZZES]: quizPage,
  [UNREAD]: { unreadCount: 0 },
};
const omit = (url: string) => {
  const routes: Record<string, unknown> = { ...studentRoutes };
  delete routes[url];
  return routes;
};

describe("DashboardScreen — STUDENT", () => {
  afterEach(settle);

  beforeEach(() => {
    useSessionStore.setState(
      makeSession("STUDENT", { activeSeasonId: 7 }, { name: "Sara Mansour" }),
    );
  });

  it("renders the server's figures and requests only what the student branch owns (C8 #2 at the client)", async () => {
    serve(studentRoutes);
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);

    renderWithProviders(<DashboardScreen />);

    expect(await screen.findByText("Hi, Sara")).toBeTruthy();
    expect(await screen.findByText("1 session to go · 75% done")).toBeTruthy();
    expect(await screen.findByLabelText("Absence budget left: 42%")).toBeTruthy();
    expect(screen.getByLabelText("Streak: 2")).toBeTruthy();
    expect(screen.getByLabelText("Assignments pending: 2")).toBeTruthy();
    expect(screen.getByLabelText("Sessions done: 3/4")).toBeTruthy();
    expect(screen.getByText("1 assignment submitted late this season")).toBeTruthy();
    expect(screen.getByText("Happening now")).toBeTruthy();
    expect(screen.getByText("Sun, Mar 1 · 6:00 PM · 90 min · Hall")).toBeTruthy();
    // Overdue from the server's flag; the far-off essay is behind "See all" (P2-5).
    expect(screen.getByText("Overdue")).toBeTruthy();
    expect(screen.queryByText("New essay")).toBeNull();
    expect(await screen.findByText("Open day")).toBeTruthy();

    fireEvent.press(screen.getByText("Join stream"));
    expect(openURL).toHaveBeenCalledWith("https://youtu.be/live");
    fireEvent.press(screen.getByLabelText("Absence budget left: 42%"));
    expect(mockPush).toHaveBeenCalledWith("/attendance");
    fireEvent.press(screen.getByText("Old essay"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/assignment/[id]", params: { id: "41" } });

    expect(new Set(requested())).toEqual(
      new Set([
        "/api/v1/me/dashboard",
        "/api/v1/me/attendance",
        EVENTS,
        NEXT_SESSION_DETAIL,
        STUDENT_QUIZZES,
      ]),
    );
  });

  it("is told 'not enrolled' by the server and offers the profile (R63)", async () => {
    useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: null }, { name: "Sara" }));
    serve({
      "/api/v1/me/dashboard": {
        variant: "STUDENT",
        todayOrgDay: "2099-03-01",
        season: null,
        progress: null,
        nextSession: null,
        assignments: null,
      },
      [EVENTS]: events,
      [UNREAD]: { unreadCount: 0 },
    });

    renderWithProviders(<DashboardScreen />);

    expect(await screen.findByText("Not enrolled yet")).toBeTruthy();
    expect(
      screen.getByText("Contact your leader or admin to be enrolled in a season."),
    ).toBeTruthy();
    expect(screen.getByText("Sunday, March 1")).toBeTruthy();
    fireEvent.press(screen.getByText("Complete your profile"));
    expect(mockPush).toHaveBeenCalledWith("/profile");
    // No season → the budget read is gated off (Plan 11's enabled guard).
    expect(requested()).not.toContain("/api/v1/me/attendance");
  });

  it("offers no stream link for a session that is not running, even with a youtubeUrl (D13)", async () => {
    serve({
      ...studentRoutes,
      "/api/v1/me/dashboard": {
        ...studentDashboard,
        nextSession: { ...liveSession, isInProgress: false },
      },
    });

    renderWithProviders(<DashboardScreen />);

    expect(await screen.findByText("Next session · Today")).toBeTruthy();
    expect(screen.queryByText("Happening now")).toBeNull();
    expect(screen.queryByText("Join stream")).toBeNull();
  });

  it("keeps the budget tile when the events card fails — cards fail independently", async () => {
    serve(omit(EVENTS));

    renderWithProviders(<DashboardScreen />);

    expect(await screen.findByText("Couldn't load upcoming events.")).toBeTruthy();
    expect(await screen.findByLabelText("Absence budget left: 42%")).toBeTruthy();
  });

  it("shows ErrorState wired to refetch when the dashboard read fails", async () => {
    serve(omit("/api/v1/me/dashboard"));

    renderWithProviders(<DashboardScreen />);

    expect(await screen.findByText("Something went wrong")).toBeTruthy();
    serve(studentRoutes);
    fireEvent.press(screen.getAllByText("Try again")[0]!);
    expect(await screen.findByText("1 session to go · 75% done")).toBeTruthy();
  });

  it("pull-to-refresh refetches every query the branch owns", async () => {
    serve(studentRoutes);
    renderWithProviders(<DashboardScreen />);
    await screen.findByLabelText("Absence budget left: 42%");
    get.mockClear();

    await act(async () => {
      screen.UNSAFE_getByType(ScrollView).props.refreshControl.props.onRefresh();
    });

    await waitFor(() => {
      expect(get).toHaveBeenCalledWith("/api/v1/me/dashboard");
      expect(get).toHaveBeenCalledWith("/api/v1/me/attendance");
      expect(get).toHaveBeenCalledWith(EVENTS);
      expect(get).toHaveBeenCalledWith(NEXT_SESSION_DETAIL);
      expect(get).toHaveBeenCalledWith(STUDENT_QUIZZES);
    });
  });
});

describe("DashboardScreen — ALUMNI", () => {
  afterEach(settle);

  it("greets by first name with the class year and never calls /me/dashboard (D21)", async () => {
    useSessionStore.setState(
      makeSession("STUDENT", { graduationYear: 2024 }, { name: "  Nour Adel " }),
    );
    serve({
      [EVENTS]: events,
      [UNREAD]: { unreadCount: 0 },
      "/api/v1/me/season-history": { seasons: [] },
    });

    renderWithProviders(<DashboardScreen />);

    expect(await screen.findByText("Welcome back, Nour · Class of 2024")).toBeTruthy();
    fireEvent.press(await screen.findByText("View my history"));
    expect(mockPush).toHaveBeenCalledWith("/history");
    expect(await screen.findByText("Open day")).toBeTruthy();
    expect(new Set(requested())).toEqual(new Set([EVENTS, "/api/v1/me/season-history"]));
  });
});

// The bell and the user menu live in Home's frame (`ShellFrame home` →
// Screen's HomeActions, ruling R13; badge, 9+ cap and inbox link are covered
// in shell-menus.test.tsx and screen.test.tsx). v1's dashboards have no bell
// of their own, so the body must not render a second one.
describe("dashboard body", () => {
  afterEach(settle);

  it.each([
    ["STUDENT", { activeSeasonId: null }],
    ["STUDENT", { graduationYear: 2024 }],
  ] as const)(
    "%s %j: Home's frame carries the bell and menu once, the body none",
    async (role, scopes) => {
      serve({ [UNREAD]: { unreadCount: 3 }, [EVENTS]: events });
      useSessionStore.setState(makeSession(role, scopes));
      renderWithProviders(<DashboardScreen />);
      await waitFor(() => expect(requested().length).toBeGreaterThan(0));
      expect(screen.getAllByTestId("home-actions")).toHaveLength(1);
      expect(screen.queryByLabelText(/^Notifications/)).toBeNull();
    },
  );

  it("the loading frame before the session lands is Home's too", () => {
    renderWithProviders(<DashboardScreen />);
    expect(screen.getAllByTestId("home-actions")).toHaveLength(1);
  });
});
