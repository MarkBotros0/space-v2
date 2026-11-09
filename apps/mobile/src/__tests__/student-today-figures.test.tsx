import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { ScrollView } from "react-native";

// `jest.mock` factories may only close over `mock*` consts (CLAUDE.md).
jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn(), post: jest.fn() } }));
jest.mock("expo-camera", () => require("./helpers/expo-camera"));

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: (...args: unknown[]) => mockPush(...args) }),
  useFocusEffect: (effect: () => void | (() => void)) => require("react").useEffect(effect, [effect]),
}));
jest.mock("../design/layout/home-actions", () => {
  const { Text } = jest.requireActual("react-native");
  return { HomeActions: () => <Text testID="home-actions">home actions</Text> };
});
import { StudentToday } from "../screens/today/student-today";
import { absencesLeft } from "../screens/today/today-figures";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";
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

const ATTENDANCE = "/api/v1/me/attendance";
const DASHBOARD = "/api/v1/me/dashboard";
const HISTORY = "/api/v1/me/season-history";

const routes = (over: Record<string, unknown> = {}) => ({
  [DASHBOARD]: studentDashboard,
  [ATTENDANCE]: myAttendance,
  [EVENTS]: events,
  [NEXT_SESSION_DETAIL]: sessionDetail,
  [STUDENT_QUIZZES]: quizPage,
  [HISTORY]: { seasons: [] },
  ...over,
});

/** Take a route away, so the request rejects. */
const without = (url: string) => {
  const all: Record<string, unknown> = routes();
  delete all[url];
  return all;
};

const notEnrolled = {
  variant: "STUDENT",
  todayOrgDay: "2099-03-01",
  season: null,
  progress: null,
  nextSession: null,
  assignments: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }, { name: "Sara Mansour" }));
});

// Queries a test did not wait for land inside act() before the tree unmounts.
afterEach(() => act(() => new Promise<void>((resolve) => setTimeout(resolve, 20))));

describe("StudentToday: figures", () => {
  it("shows the season card with the student's figures, and routes it (P2-6)", async () => {
    serve(routes());
    renderWithProviders(<StudentToday />);
    expect(await screen.findByLabelText("Absences left: 0")).toBeTruthy();
    // Owner 2026-11-07: no streak anywhere.
    expect(screen.queryByLabelText(/^Streak/)).toBeNull();
    expect(screen.getByLabelText("Assignments pending: 2")).toBeTruthy();
    expect(screen.getByLabelText("Sessions held: 3 of 4")).toBeTruthy();
    expect(screen.getByLabelText("Season progress 75%")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Open Spring 2099"));
    expect(mockPush).toHaveBeenCalledWith("/season");
  });

  it("counts the full absences the budget still allows, rounding down (owner, 2026-11-09)", () => {
    const at = (minutesUsed: number, absenceWeightMinutes = 90) =>
      absencesLeft({
        ...myAttendance,
        season: { ...myAttendance.season!, absenceWeightMinutes },
        budget: { ...myAttendance.budget!, budgetMinutes: 180, minutesUsed },
      });
    expect(at(0)).toBe(2);
    expect(at(90)).toBe(1);
    // A late used 15 minutes: one more full absence still fits.
    expect(at(15)).toBe(1);
    expect(at(105)).toBe(0);
    expect(at(400)).toBe(0);
    expect(absencesLeft(undefined)).toBeNull();
    expect(absencesLeft({ ...myAttendance, budget: null })).toBeNull();
  });

  function order(): (t: string) => number {
    const texts: string[] = [];
    const walk = (n: unknown): void => {
      if (typeof n === "string") texts.push(n);
      else if (Array.isArray(n)) n.forEach(walk);
      else if (n && typeof n === "object") {
        const node = n as { props?: { accessibilityLabel?: string }; children?: unknown[] };
        if (node.props?.accessibilityLabel) texts.push(node.props.accessibilityLabel);
        node.children?.forEach(walk);
      }
    };
    walk(screen.toJSON());
    return (t) => texts.findIndex((x) => x === t || x.startsWith(t));
  }

  // Owner 2026-11-07: the season, then the session, then To do.
  it("puts the season card first, then the session, then To do", async () => {
    serve(routes({ [NEXT_SESSION_DETAIL]: { ...sessionDetail, checkInOpen: false } }));
    renderWithProviders(<StudentToday />);
    await screen.findByLabelText("Open Spring 2099");
    await screen.findByText("Week 6");
    const at = order();
    expect(at("Open Spring 2099")).toBeGreaterThanOrEqual(0);
    expect(at("Open Spring 2099")).toBeLessThan(at("Week 6"));
    expect(at("Week 6")).toBeLessThan(at("TO DO"));
  });

  // Owner 2026-11-08: the season ring, then announcements, then the session, even with check-in open.
  it("keeps the season first and the session before To do while check-in is open", async () => {
    serve(routes());
    renderWithProviders(<StudentToday />);
    await screen.findByText("Check In");
    await screen.findByLabelText("Open Spring 2099");
    const at = order();
    expect(at("Open Spring 2099")).toBeGreaterThanOrEqual(0);
    expect(at("Open Spring 2099")).toBeLessThan(at("Week 6"));
    expect(at("Week 6")).toBeLessThan(at("TO DO"));
  });

  it("goes back to the season first once they have checked in", async () => {
    serve(
      routes({
        [NEXT_SESSION_DETAIL]: {
          ...sessionDetail,
          myAttendance: { status: "PRESENT", notes: null, lateMinutes: null, checkedInAt: "2099-03-01T16:05:00.000Z" },
        },
      }),
    );
    renderWithProviders(<StudentToday />);
    await screen.findByText(/You checked in at/);
    const at = order();
    expect(at("Open Spring 2099")).toBeLessThan(at("Week 6"));
  });

  it("season card: nothing scheduled, and complete", async () => {
    const none = { ...studentDashboard, progress: { sessionsHeld: 0, sessionsTotal: 0, pct: null } };
    serve(routes({ [DASHBOARD]: none }));
    const { unmount } = renderWithProviders(<StudentToday />);
    expect(await screen.findByLabelText("Sessions held: 0 of 0")).toBeTruthy();
    expect(screen.getByLabelText("Season progress 0%")).toBeTruthy();
    unmount();

    const done = { ...studentDashboard, progress: { sessionsHeld: 4, sessionsTotal: 4, pct: 100 } };
    serve(routes({ [DASHBOARD]: done }));
    renderWithProviders(<StudentToday />);
    expect(await screen.findByLabelText("Sessions held: 4 of 4")).toBeTruthy();
    expect(screen.getByLabelText("Season progress 100%")).toBeTruthy();
  });

  it("attendance failing keeps the dashboard's own figures", async () => {
    serve(without(ATTENDANCE));
    renderWithProviders(<StudentToday />);
    expect(await screen.findByText("Couldn't load your attendance.")).toBeTruthy();
    expect(screen.getByLabelText("Assignments pending: 2")).toBeTruthy();
    expect(screen.getByLabelText("Sessions held: 3 of 4")).toBeTruthy();
    // The failed read settles after the dashboard's first paint under a loaded run.
    await waitFor(() => expect(screen.queryByLabelText(/^Absences? left/)).toBeNull());
    expect(screen.queryByLabelText(/^Streak/)).toBeNull();
  });

  it("shows no late-submissions note (owner, 2026-11-08)", async () => {
    serve(routes());
    renderWithProviders(<StudentToday />);
    expect(await screen.findByLabelText(/^Assignments pending/)).toBeTruthy();
    expect(screen.queryByText(/submitted late this season/)).toBeNull();
  });
});

describe("StudentToday: not enrolled and failures", () => {
  it("season null: says so, offers the profile, and requests nothing season-bound", async () => {
    // A token can still name a season the dashboard does not enrol them in.
    serve(routes({ [DASHBOARD]: notEnrolled }));
    renderWithProviders(<StudentToday />);
    expect(await screen.findByText("Welcome to JPC Space")).toBeTruthy();
    expect(await screen.findByText("Open day")).toBeTruthy();
    expect(screen.getByText("Hi, Sara")).toBeTruthy();
    fireEvent.press(screen.getByText("Complete your profile"));
    expect(mockPush).toHaveBeenCalledWith("/profile");
    const urls = requested();
    expect(urls.some((u) => u.startsWith("/api/v1/sessions/"))).toBe(false);
    expect(urls.some((u) => u.startsWith("/api/v1/quizzes"))).toBe(false);
  });

  it("no active season: no attendance read either", async () => {
    useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: null }, { name: "Sara" }));
    serve(routes({ [DASHBOARD]: notEnrolled }));
    renderWithProviders(<StudentToday />);
    expect(await screen.findByText("Welcome to JPC Space")).toBeTruthy();
    expect(requested()).not.toContain(ATTENDANCE);
  });

  it("dashboard failing shows RouteError, and retry refetches", async () => {
    serve(without(DASHBOARD));
    renderWithProviders(<StudentToday />);
    expect(await screen.findByText("Something went wrong")).toBeTruthy();
    serve(routes());
    fireEvent.press(screen.getByText("Try again"));
    expect(await screen.findByText("Week 6")).toBeTruthy();
    expect(screen.queryByText("Something went wrong")).toBeNull();
  });

  it("pull-to-refresh refetches every query it owns", async () => {
    serve(routes());
    renderWithProviders(<StudentToday />);
    await screen.findByText("Check In");
    await screen.findByText("Week 6 quiz");
    await screen.findByLabelText("Absences left: 0");
    get.mockClear();

    await act(async () => {
      screen.UNSAFE_getByType(ScrollView).props.refreshControl.props.onRefresh();
    });

    await waitFor(() => {
      for (const url of [DASHBOARD, ATTENDANCE, EVENTS, NEXT_SESSION_DETAIL, STUDENT_QUIZZES]) {
        expect(get).toHaveBeenCalledWith(url);
      }
    });
  });

  it("pull-to-refresh never fires a gated query", async () => {
    useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: null }, { name: "Sara" }));
    serve(routes({ [DASHBOARD]: notEnrolled }));
    renderWithProviders(<StudentToday />);
    await screen.findByText("Welcome to JPC Space");
    get.mockClear();

    await act(async () => {
      screen.UNSAFE_getByType(ScrollView).props.refreshControl.props.onRefresh();
    });

    await waitFor(() => expect(get).toHaveBeenCalledWith(DASHBOARD));
    const urls = requested();
    expect(urls).not.toContain(ATTENDANCE);
    expect(urls.some((u) => u.startsWith("/api/v1/quizzes?seasonId=null"))).toBe(false);
    expect(urls.some((u) => u.startsWith("/api/v1/sessions/"))).toBe(false);
  });
});
