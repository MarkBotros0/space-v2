import { act, screen, waitFor } from "@testing-library/react-native";
import { AppState, type AppStateStatus } from "react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn(), post: jest.fn() } }));
jest.mock("expo-camera", () => require("./helpers/expo-camera"));
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn() }),
  useFocusEffect: (effect: () => void | (() => void)) =>
    require("./helpers/focus-effect").useMockFocusEffect(effect),
}));
jest.mock("../design/layout/home-actions", () => {
  const { Text } = jest.requireActual("react-native");
  return { HomeActions: () => <Text testID="home-actions">home actions</Text> };
});

import { LIVE_ROSTER_REFRESH_MS } from "../hooks/use-check-in";
import { StudentToday } from "../screens/today/student-today";
import { useSessionStore } from "../store/session";
import {
  EVENTS,
  NEXT_SESSION_DETAIL,
  STUDENT_QUIZZES,
  events,
  get,
  myAttendance,
  quizPage,
  requested,
  serve,
  sessionDetail,
  studentDashboard,
} from "./helpers/dashboard-fixtures";
import { resetFocus, setFocused } from "./helpers/focus-effect";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";

const DASHBOARD = "/api/v1/me/dashboard";
const closed = { ...sessionDetail, checkInOpen: false };

const routes = (detail: unknown = closed, dashboard: unknown = studentDashboard) => ({
  [DASHBOARD]: dashboard,
  "/api/v1/me/attendance": myAttendance,
  [EVENTS]: events,
  [NEXT_SESSION_DETAIL]: detail,
  [STUDENT_QUIZZES]: quizPage,
});

const reads = (url: string) => requested().filter((u) => u === url).length;
const tick = (ms: number) => act(async () => { await jest.advanceTimersByTimeAsync(ms); });
const checkInDisabled = () =>
  screen.getByRole("button", { name: "Check In" }).props.accessibilityState?.disabled;

/** The listeners AppState has right now, so a test can bring the app back. */
function captureAppState() {
  const listeners = new Set<(s: AppStateStatus) => void>();
  jest.spyOn(AppState, "addEventListener").mockImplementation((_type, fn) => {
    listeners.add(fn as (s: AppStateStatus) => void);
    return { remove: () => listeners.delete(fn as (s: AppStateStatus) => void) } as unknown as ReturnType<
      typeof AppState.addEventListener
    >;
  });
  return (state: AppStateStatus) =>
    act(async () => {
      for (const fn of listeners) fn(state);
      await jest.advanceTimersByTimeAsync(0);
    });
}

beforeEach(() => {
  jest.clearAllMocks();
  // The card's interval runs on the fake clock, and unmounts with the tree.
  jest.useFakeTimers();
  resetFocus();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }, { name: "Sara Mansour" }));
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("Today's Check In follows the server", () => {
  it("the leader opens check-in: the button enables without a pull", async () => {
    serve(routes());
    renderWithProviders(<StudentToday />);
    expect(await screen.findByText("Check In")).toBeTruthy();
    expect(checkInDisabled()).toBe(true);

    serve(routes({ ...sessionDetail, checkInOpen: true }));
    await tick(LIVE_ROSTER_REFRESH_MS);
    await waitFor(() => expect(checkInDisabled()).toBeFalsy());
  });

  it("stops reading once the student is checked in", async () => {
    serve(routes());
    renderWithProviders(<StudentToday />);
    await screen.findByText("Check In");
    serve(
      routes({
        ...sessionDetail,
        myAttendance: { status: "PRESENT", notes: null, lateMinutes: null, checkedInAt: "2099-03-01T16:05:00.000Z" },
      }),
    );
    await tick(LIVE_ROSTER_REFRESH_MS);
    expect(await screen.findByText(/You checked in at/)).toBeTruthy();

    const before = reads(NEXT_SESSION_DETAIL);
    await tick(LIVE_ROSTER_REFRESH_MS * 3);
    expect(reads(NEXT_SESSION_DETAIL)).toBe(before);
  });

  it("does not poll a session that isn't today, by the server's day", async () => {
    serve(routes(closed, { ...studentDashboard, todayOrgDay: "2099-02-27" }));
    renderWithProviders(<StudentToday />);
    await screen.findByText("Check In");
    const before = reads(NEXT_SESSION_DETAIL);
    await tick(LIVE_ROSTER_REFRESH_MS * 2);
    expect(reads(NEXT_SESSION_DETAIL)).toBe(before);
  });

  it("clears its timer on unmount and while the tab is out of focus; focus reads at once", async () => {
    serve(routes());
    const view = renderWithProviders(<StudentToday />);
    await screen.findByText("Check In");

    setFocused(false);
    const blurred = reads(NEXT_SESSION_DETAIL);
    await tick(LIVE_ROSTER_REFRESH_MS * 2);
    expect(reads(NEXT_SESSION_DETAIL)).toBe(blurred);

    setFocused(true);
    await tick(0);
    expect(reads(NEXT_SESSION_DETAIL)).toBe(blurred + 1);

    view.unmount();
    const gone = reads(NEXT_SESSION_DETAIL);
    await tick(LIVE_ROSTER_REFRESH_MS * 2);
    expect(reads(NEXT_SESSION_DETAIL)).toBe(gone);
  });

  it("a failed read keeps the button on screen", async () => {
    serve(routes());
    renderWithProviders(<StudentToday />);
    await screen.findByText("Check In");
    get.mockImplementation(() => Promise.reject(new Error("blip")));
    await tick(LIVE_ROSTER_REFRESH_MS);
    expect(screen.getByText("Check In")).toBeTruthy();
  });
});

describe("Today refreshes what has gone stale when it comes back", () => {
  it("the next morning: resuming re-reads the dashboard and shows the new day", async () => {
    const appState = captureAppState();
    serve(routes(closed, { ...studentDashboard, nextSession: null }));
    renderWithProviders(<StudentToday />);
    expect(await screen.findByText("Sunday, March 1")).toBeTruthy();

    serve(routes(closed, { ...studentDashboard, nextSession: null, todayOrgDay: "2099-03-02" }));
    await tick(61_000);
    await appState("active");
    expect(await screen.findByText("Monday, March 2")).toBeTruthy();
  });

  it("back on the tab reads only what is past its freshness", async () => {
    serve(routes(closed, { ...studentDashboard, nextSession: null }));
    renderWithProviders(<StudentToday />);
    await screen.findByText("Sunday, March 1");
    const dashboards = reads(DASHBOARD);
    const quizzes = reads(STUDENT_QUIZZES);

    setFocused(false);
    await tick(5_000);
    setFocused(true);
    await tick(0);
    expect(reads(DASHBOARD)).toBe(dashboards);
    expect(reads(STUDENT_QUIZZES)).toBe(quizzes);

    setFocused(false);
    await tick(31_000);
    setFocused(true);
    await tick(0);
    expect(reads(STUDENT_QUIZZES)).toBe(quizzes + 1);
    // The dashboard keeps its own, longer freshness.
    expect(reads(DASHBOARD)).toBe(dashboards);

    setFocused(false);
    await tick(31_000);
    setFocused(true);
    await tick(0);
    expect(reads(DASHBOARD)).toBe(dashboards + 1);
  });

  it("going to the background reads nothing, and a blurred tab ignores the resume", async () => {
    const appState = captureAppState();
    serve(routes(closed, { ...studentDashboard, nextSession: null }));
    renderWithProviders(<StudentToday />);
    await screen.findByText("Sunday, March 1");
    const dashboards = reads(DASHBOARD);

    await tick(61_000);
    await appState("background");
    expect(reads(DASHBOARD)).toBe(dashboards);

    setFocused(false);
    await appState("active");
    expect(reads(DASHBOARD)).toBe(dashboards);
  });
});
