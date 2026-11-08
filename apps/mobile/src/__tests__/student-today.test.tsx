import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { Linking, ScrollView } from "react-native";

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

import { WORK_HREF } from "../screens/work/work-model";
import { StudentToday } from "../screens/today/student-today";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";
import {
  EVENTS,
  NEXT_SESSION_DETAIL,
  STUDENT_QUIZZES,
  events,
  get,
  liveSession,
  myAttendance,
  quizPage,
  quizResult,
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

const summary = studentDashboard.assignments;
const row = (id: number, over: Record<string, unknown> = {}) => ({
  id,
  title: `Essay ${id}`,
  dueAt: "2099-03-03T10:00:00.000Z",
  dueOrgDay: "2099-03-03",
  isOverdue: false,
  status: "PENDING",
  reviewedAt: null,
  ...over,
});
const withOpen = (open: unknown[]) => ({
  ...studentDashboard,
  assignments: { ...summary, open },
});
const upcoming = { ...liveSession, isInProgress: false, dayKey: "2099-03-03" };

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }, { name: "Sara Mansour" }));
});

// Queries a test did not wait for land inside act() before the tree unmounts.
afterEach(() => act(() => new Promise<void>((resolve) => setTimeout(resolve, 20))));

describe("StudentToday: the first thing on screen", () => {
  it("greets by first name with no emoji, with the org date and the compact title", async () => {
    serve(routes());
    renderWithProviders(<StudentToday />);
    expect(await screen.findByText("Hi, Sara")).toBeTruthy();
    expect(await screen.findByText("Sunday, March 1")).toBeTruthy();
    // Hidden from assistive tech until the bar fades in.
    expect(screen.getByText("Home", { includeHiddenElements: true })).toBeTruthy();
  });

  it("offers Check In on the hero when check-in is open", async () => {
    serve(routes());
    renderWithProviders(<StudentToday />);
    expect(await screen.findByText("Check In")).toBeTruthy();
    expect(screen.getByText("Happening now")).toBeTruthy();
    expect(screen.getByText("Week 6")).toBeTruthy();
    expect(screen.getByText("Sun, Mar 1 · 6:00 PM · 90 min · Hall")).toBeTruthy();
  });

  it("session detail failing keeps the title, without the action or a RouteError (P2-3)", async () => {
    serve(without(NEXT_SESSION_DETAIL));
    renderWithProviders(<StudentToday />);
    expect(await screen.findByText("Week 6")).toBeTruthy();
    await waitFor(() => expect(requested()).toContain(NEXT_SESSION_DETAIL));
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 20)));
    expect(screen.queryByText("Check In")).toBeNull();
    expect(screen.queryByText("Something went wrong")).toBeNull();
    // The stream link needs only the dashboard's own fields.
    expect(screen.getByText("Join stream")).toBeTruthy();
  });

  it("the cue counts org days from the server's today, whatever the device clock says", async () => {
    serve(routes({ [DASHBOARD]: { ...studentDashboard, nextSession: upcoming } }));
    renderWithProviders(<StudentToday />);
    expect(await screen.findByText("Next session · in 2 days")).toBeTruthy();
    expect(screen.queryByText("Happening now")).toBeNull();
  });

  it("a session later today says Today", async () => {
    const today = { ...upcoming, dayKey: "2099-03-01" };
    serve(routes({ [DASHBOARD]: { ...studentDashboard, nextSession: today } }));
    renderWithProviders(<StudentToday />);
    expect(await screen.findByText("Next session · Today")).toBeTruthy();
  });

  it("the title opens the session", async () => {
    serve(routes());
    renderWithProviders(<StudentToday />);
    fireEvent.press(await screen.findByText("Week 6"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/session/[id]", params: { id: "11" } });
  });

  it("Join stream shows only while the session runs (D13)", async () => {
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    serve(routes());
    const { unmount } = renderWithProviders(<StudentToday />);
    fireEvent.press(await screen.findByText("Join stream"));
    expect(openURL).toHaveBeenCalledWith("https://youtu.be/live");
    unmount();

    serve(routes({ [DASHBOARD]: { ...studentDashboard, nextSession: upcoming } }));
    renderWithProviders(<StudentToday />);
    expect(await screen.findByText("Next session · in 2 days")).toBeTruthy();
    expect(screen.queryByText("Join stream")).toBeNull();
  });

  it("a running session without a URL has no stream link", async () => {
    const noUrl = { ...liveSession, youtubeUrl: null };
    serve(routes({ [DASHBOARD]: { ...studentDashboard, nextSession: noUrl } }));
    renderWithProviders(<StudentToday />);
    expect(await screen.findByText("Happening now")).toBeTruthy();
    expect(screen.queryByText("Join stream")).toBeNull();
  });

  it("no session: says so, requests no session detail", async () => {
    serve(routes({ [DASHBOARD]: { ...studentDashboard, nextSession: null } }));
    renderWithProviders(<StudentToday />);
    expect(await screen.findByText("No upcoming sessions.")).toBeTruthy();
    expect(requested()).not.toContain(NEXT_SESSION_DETAIL);
    expect(screen.getByTestId("hero-card").props.className).toContain("bg-surface");
  });
});

describe("StudentToday: To do", () => {
  it("renders every open row, past the old cap of 3", async () => {
    const five = [1, 2, 3, 4, 5].map((id) => row(id));
    serve(routes({ [DASHBOARD]: withOpen(five), [STUDENT_QUIZZES]: { items: [], nextCursor: null } }));
    renderWithProviders(<StudentToday />);
    for (const id of [1, 2, 3, 4, 5]) {
      expect(await screen.findByText(`Essay ${id}`)).toBeTruthy();
    }
  });

  it("shows chips, the open quiz, and pushes the row's route", async () => {
    serve(routes({ [DASHBOARD]: withOpen([row(1, { isOverdue: true }), row(2, { status: "DRAFT" })]) }));
    renderWithProviders(<StudentToday />);
    expect(await screen.findByText("Week 6 quiz")).toBeTruthy();
    expect(screen.getByText("Overdue")).toBeTruthy();
    expect(screen.getByText("Due in 2 days")).toBeTruthy();
    expect(screen.getByText("In progress · Due Mar 3, 2099")).toBeTruthy();
    expect(screen.getByText("Take quiz")).toBeTruthy();
    fireEvent.press(screen.getByText("Essay 1"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/assignment/[id]", params: { id: "1" } });
    fireEvent.press(screen.getByText("Week 6 quiz"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/quiz/[id]", params: { id: "31" } });
  });

  it("See all pushes the Work list", async () => {
    serve(routes());
    renderWithProviders(<StudentToday />);
    fireEvent.press(await screen.findByText("See all"));
    expect(mockPush).toHaveBeenCalledWith(WORK_HREF);
  });

  it("nothing open at all: one caught-up row", async () => {
    serve(routes({ [DASHBOARD]: withOpen([]), [STUDENT_QUIZZES]: { items: [], nextCursor: null } }));
    renderWithProviders(<StudentToday />);
    expect(await screen.findByText("You're all caught up.")).toBeTruthy();
    expect(screen.queryByText("Nothing due this week.")).toBeNull();
  });

  it("only later work: nothing due this week, not caught up", async () => {
    const later = row(1, { dueOrgDay: "2099-06-01", dueAt: "2099-06-01T10:00:00.000Z" });
    serve(routes({ [DASHBOARD]: withOpen([later]), [STUDENT_QUIZZES]: { items: [], nextCursor: null } }));
    renderWithProviders(<StudentToday />);
    expect(await screen.findByText("Nothing due this week.")).toBeTruthy();
    expect(screen.queryByText("You're all caught up.")).toBeNull();
    expect(screen.queryByText("Essay 1")).toBeNull();
  });

  it("quiz list failing keeps the assignments, with an InlineError", async () => {
    serve(without(STUDENT_QUIZZES));
    renderWithProviders(<StudentToday />);
    expect(await screen.findByText("Couldn't load your quizzes.")).toBeTruthy();
    expect(screen.getByText("Old essay")).toBeTruthy();
    expect(screen.queryByText("Something went wrong")).toBeNull();
  });

  it("quiz list failing never claims the student is caught up", async () => {
    const dash = { [DASHBOARD]: withOpen([]) };
    const all: Record<string, unknown> = routes(dash);
    delete all[STUDENT_QUIZZES];
    serve(all);
    renderWithProviders(<StudentToday />);
    expect(await screen.findByText("Couldn't load your quizzes.")).toBeTruthy();
    expect(screen.queryByText("You're all caught up.")).toBeNull();
  });

  it("does not claim caught up while the quiz list is still loading", async () => {
    let resolveQuizzes: (value: unknown) => void = () => {};
    const quizzes = new Promise((resolve) => (resolveQuizzes = resolve));
    const all = routes({ [DASHBOARD]: withOpen([]) });
    get.mockImplementation((url: string) =>
      url === STUDENT_QUIZZES
        ? quizzes
        : url in all
          ? Promise.resolve({ data: { data: all[url] } })
          : Promise.reject(new Error(url)),
    );
    renderWithProviders(<StudentToday />);
    await screen.findByText("Hi, Sara");
    await screen.findByText("See all");
    expect(screen.queryByText("You're all caught up.")).toBeNull();
    await act(async () => resolveQuizzes({ data: { data: { items: [], nextCursor: null } } }));
    expect(await screen.findByText("You're all caught up.")).toBeTruthy();
  });

  it("a handed-in quiz is not on the list", async () => {
    const page = { items: [{ ...quizResult, attemptStatus: "SUBMITTED" }], nextCursor: null };
    serve(routes({ [STUDENT_QUIZZES]: page }));
    renderWithProviders(<StudentToday />);
    expect(await screen.findByText("Old essay")).toBeTruthy();
    await waitFor(() => expect(requested()).toContain(STUDENT_QUIZZES));
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 20)));
    expect(screen.queryByText("Week 6 quiz")).toBeNull();
  });
});

describe("StudentToday: figures", () => {
  it("shows the season card with the student's figures, and routes it (P2-6)", async () => {
    serve(routes());
    renderWithProviders(<StudentToday />);
    expect(await screen.findByLabelText("Absence budget left: 42%")).toBeTruthy();
    // Owner 2026-11-07: no streak anywhere.
    expect(screen.queryByLabelText(/^Streak/)).toBeNull();
    expect(screen.getByLabelText("Assignments pending: 2")).toBeTruthy();
    expect(screen.getByLabelText("Sessions held: 3 of 4")).toBeTruthy();
    expect(screen.getByLabelText("Season progress 75%")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Open Spring 2099"));
    expect(mockPush).toHaveBeenCalledWith("/season");
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

  // Owner 2026-11-07: while check-in is open, the session leads.
  it("puts the session first while check-in is open and they haven't checked in", async () => {
    serve(routes());
    renderWithProviders(<StudentToday />);
    await screen.findByText("Check In");
    await screen.findByLabelText("Open Spring 2099");
    const at = order();
    expect(at("Week 6")).toBeGreaterThanOrEqual(0);
    expect(at("Week 6")).toBeLessThan(at("Open Spring 2099"));
    expect(at("Open Spring 2099")).toBeLessThan(at("TO DO"));
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
    await waitFor(() => expect(screen.queryByLabelText(/^Absence budget left/)).toBeNull());
    expect(screen.queryByLabelText(/^Streak/)).toBeNull();
  });

  it("keeps the late callout's copy", async () => {
    serve(routes());
    renderWithProviders(<StudentToday />);
    expect(await screen.findByText("1 assignment submitted late this season")).toBeTruthy();
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
    await screen.findByLabelText("Absence budget left: 42%");
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
