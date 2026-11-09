import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { Linking } from "react-native";

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
