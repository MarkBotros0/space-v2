import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { onlineManager } from "@tanstack/react-query";
import { AppState, ScrollView, type AppStateStatus } from "react-native";

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
import { resetMockCamera } from "./helpers/expo-camera";
import { resetFocus, setFocused } from "./helpers/focus-effect";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";
import { PULL_MIN_MS } from "../design/lib/pull-refresh";

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
/** The next session's detail has answered: while check-in is closed there is no button to wait for. */
const detailLoaded = async () => {
  await waitFor(() => expect(reads(NEXT_SESSION_DETAIL)).toBeGreaterThan(0));
  await tick(0);
};

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
  it("the leader opens check-in: the button appears without a pull", async () => {
    serve(routes());
    renderWithProviders(<StudentToday />);
    await detailLoaded();
    // Owner 2026-11-07: no Check In at all while check-in isn't open.
    expect(screen.queryByText("Check In")).toBeNull();

    serve(routes({ ...sessionDetail, checkInOpen: true }));
    await tick(LIVE_ROSTER_REFRESH_MS);
    expect(await screen.findByText("Check In")).toBeTruthy();
    expect(checkInDisabled()).toBeFalsy();
  });

  it("stops reading once the student is checked in", async () => {
    serve(routes());
    renderWithProviders(<StudentToday />);
    await detailLoaded();
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
    await detailLoaded();
    const before = reads(NEXT_SESSION_DETAIL);
    await tick(LIVE_ROSTER_REFRESH_MS * 2);
    expect(reads(NEXT_SESSION_DETAIL)).toBe(before);
  });

  it("clears its timer on unmount and while the tab is out of focus; focus reads at once", async () => {
    serve(routes());
    const view = renderWithProviders(<StudentToday />);
    await detailLoaded();

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
    serve(routes({ ...sessionDetail, checkInOpen: true }));
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

describe("the pull's spinner belongs to the pull", () => {
  const control = () => screen.UNSAFE_getByType(ScrollView).props.refreshControl.props;
  const pull = () => act(async () => { control().onRefresh(); });

  /** Serves the routes, except that one URL waits until told. */
  function hold(held: string) {
    const release: ((v: unknown) => void)[] = [];
    const routed = routes() as Record<string, unknown>;
    get.mockImplementation((url: string) =>
      url === held
        ? new Promise((resolve) => release.push(() => resolve({ data: { data: routed[url] } })))
        : url in routed
          ? Promise.resolve({ data: { data: routed[url] } })
          : Promise.reject(new Error(`not served: ${url}`)),
    );
    return () => { for (const r of release.splice(0)) r(undefined); };
  }

  it("a poll in flight doesn't raise it", async () => {
    serve(routes());
    renderWithProviders(<StudentToday />);
    await detailLoaded();
    const release = hold(NEXT_SESSION_DETAIL);
    const before = reads(NEXT_SESSION_DETAIL);
    await tick(LIVE_ROSTER_REFRESH_MS);
    expect(reads(NEXT_SESSION_DETAIL)).toBe(before + 1);
    // The read is out and still unanswered: let its state reach the screen.
    await tick(50);
    expect(control().refreshing).toBe(false);
    await act(async () => { release(); await jest.advanceTimersByTimeAsync(0); });
  });

  it("a background read on resume doesn't raise it", async () => {
    const appState = captureAppState();
    serve(routes());
    renderWithProviders(<StudentToday />);
    await detailLoaded();
    await tick(31_000);
    // Events: past their freshness, and unlike session detail not polled meanwhile.
    const release = hold(EVENTS);
    const before = reads(EVENTS);
    await appState("active");
    await tick(50);
    expect(reads(EVENTS)).toBe(before + 1);
    expect(control().refreshing).toBe(false);
    await act(async () => { release(); await jest.advanceTimersByTimeAsync(0); });
  });

  it("a pull raises it until every read has answered", async () => {
    serve(routes());
    renderWithProviders(<StudentToday />);
    await detailLoaded();
    const release = hold(NEXT_SESSION_DETAIL);
    await pull();
    expect(control().refreshing).toBe(true);
    await act(async () => { release(); await jest.advanceTimersByTimeAsync(PULL_MIN_MS); });
    expect(control().refreshing).toBe(false);
  });

  it("offline, a pull doesn't leave it up over a paused read", async () => {
    serve(routes());
    renderWithProviders(<StudentToday />);
    await detailLoaded();
    act(() => onlineManager.setOnline(false));
    try {
      await pull();
      // Only the pull's own minimum hold, never the paused read.
      await tick(PULL_MIN_MS);
      expect(control().refreshing).toBe(false);
    } finally {
      act(() => onlineManager.setOnline(true));
    }
    await tick(0);
    expect(control().refreshing).toBe(false);
  });
});

describe("a failed dashboard read", () => {
  const withoutDashboard = () => {
    const routed = routes({ ...sessionDetail, checkInOpen: true }) as Record<string, unknown>;
    delete routed[DASHBOARD];
    return routed;
  };

  it("with data on screen keeps the hero and an open check-in sheet", async () => {
    const appState = captureAppState();
    resetMockCamera();
    serve(routes({ ...sessionDetail, checkInOpen: true }));
    renderWithProviders(<StudentToday />);
    fireEvent.press(await screen.findByText("Check In"));
    expect(screen.getByText("Scan check-in code")).toBeTruthy();
    expect(screen.getByTestId("mock-camera")).toBeTruthy();

    serve(withoutDashboard());
    const before = reads(DASHBOARD);
    await tick(61_000);
    await appState("active");
    await tick(50);
    expect(reads(DASHBOARD)).toBe(before + 1);

    expect(screen.queryByText("Something went wrong")).toBeNull();
    expect(screen.getByText("Couldn't refresh. This may be out of date.")).toBeTruthy();
    expect(screen.getByText("Week 6")).toBeTruthy();
    expect(screen.getByText("Scan check-in code")).toBeTruthy();
    expect(screen.getByTestId("mock-camera")).toBeTruthy();
  });

  it("with no data shows the error screen", async () => {
    serve(withoutDashboard());
    renderWithProviders(<StudentToday />);
    expect(await screen.findByText("Something went wrong")).toBeTruthy();
    expect(screen.queryByText("Week 6")).toBeNull();
  });
});
