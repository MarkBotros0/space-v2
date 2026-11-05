import { act, fireEvent, screen, within } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn() } }));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));

import { useSessionStore } from "../store/session";
import { WorkScreen } from "../screens/work/work-screen";
import { get, quizResult, requested, serve, studentDashboard } from "./helpers/dashboard-fixtures";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";

const DASHBOARD = "/api/v1/me/dashboard";
const ASSIGNMENTS = "/api/v1/seasons/7/assignments";
const QUIZZES = "/api/v1/quizzes?seasonId=7";

const assignment = (id: number, over: Record<string, unknown> = {}) => ({
  id,
  title: `Essay ${id}`,
  dueAt: "2099-03-03T10:00:00.000Z",
  dueOrgDay: "2099-03-03",
  isOverdue: false,
  status: "PENDING",
  reviewedAt: null,
  ...over,
});
const quiz = (quizId: number, over: Record<string, unknown> = {}) => ({
  ...quizResult,
  quizId,
  title: `Quiz ${quizId}`,
  ...over,
});

const routes = (assignments: unknown[], quizzes: unknown[] | null = []) => ({
  [DASHBOARD]: studentDashboard,
  [ASSIGNMENTS]: { assignments },
  ...(quizzes === null ? {} : { [QUIZZES]: { items: quizzes, nextCursor: null } }),
});

const done = (count: number) => fireEvent.press(screen.getByLabelText(`Done ${count}`));

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }));
});

afterEach(() => act(() => new Promise<void>((resolve) => setTimeout(resolve, 20))));

describe("WorkScreen: states", () => {
  it("no active season: says so and asks the server for nothing", async () => {
    useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: null }));
    renderWithProviders(<WorkScreen />);
    expect(await screen.findByText("No active season")).toBeTruthy();
    expect(screen.getByText("Work")).toBeTruthy();
    expect(screen.queryByTestId("segmented-control")).toBeNull();
    expect(requested()).toEqual([]);
  });

  it("nothing posted at all: the empty state, no segments", async () => {
    serve(routes([], []));
    renderWithProviders(<WorkScreen />);
    expect(await screen.findByText("No assignments or quizzes yet")).toBeTruthy();
    expect(screen.queryByTestId("segmented-control")).toBeNull();
  });

  it("assignment list failing: a retry that asks again", async () => {
    serve({ [DASHBOARD]: studentDashboard, [QUIZZES]: { items: [], nextCursor: null } });
    renderWithProviders(<WorkScreen />);
    const retry = await screen.findByText("Try again");
    serve(routes([assignment(1)]));
    fireEvent.press(retry);
    expect(await screen.findByText("Essay 1")).toBeTruthy();
  });

  it("nothing to do, plenty done: caught up, and Done is one tap away", async () => {
    serve(routes([assignment(1, { status: "REVIEWED" })], [quiz(2, { score: 7 })]));
    renderWithProviders(<WorkScreen />);
    expect(await screen.findByText("You're all caught up.")).toBeTruthy();
    expect(screen.queryByText("Essay 1")).toBeNull();
    done(2);
    expect(await screen.findByText("Essay 1")).toBeTruthy();
    expect(screen.getByText("Quiz 2")).toBeTruthy();
    expect(screen.getByText("ASSIGNMENTS")).toBeTruthy();
    expect(screen.getByText("QUIZZES")).toBeTruthy();
    expect(screen.queryByText("You're all caught up.")).toBeNull();
  });

  it("a scored quiz row speaks its score", async () => {
    serve(routes([assignment(1)], [quiz(2, { score: 7, maxScore: 10 })]));
    renderWithProviders(<WorkScreen />);
    await screen.findByText("Essay 1");
    done(1);
    expect(await screen.findByRole("button", { name: /Quiz 2.*, 7\/10$/ })).toBeTruthy();
  });

  it("Done with nothing in it says so, and hides an empty group", async () => {
    serve(routes([assignment(1)], []));
    renderWithProviders(<WorkScreen />);
    await screen.findByText("Essay 1");
    done(0);
    expect(await screen.findByText("Nothing handed in yet.")).toBeTruthy();
    expect(screen.queryByText("ASSIGNMENTS")).toBeNull();
    expect(screen.queryByText("QUIZZES")).toBeNull();
  });

  it("never says caught up until the quiz list has answered", async () => {
    let answer: (value: unknown) => void = () => {};
    const pending = new Promise((resolve) => (answer = resolve));
    get.mockImplementation((url: string) => {
      if (url === QUIZZES) return pending;
      if (url === ASSIGNMENTS) return Promise.resolve({ data: { data: { assignments: [assignment(1, { status: "REVIEWED" })] } } });
      return Promise.resolve({ data: { data: studentDashboard } });
    });
    renderWithProviders(<WorkScreen />);
    await screen.findByLabelText("Done 1");
    expect(screen.queryByText("You're all caught up.")).toBeNull();
    await act(async () => answer({ data: { data: { items: [], nextCursor: null } } }));
    expect(await screen.findByText("You're all caught up.")).toBeTruthy();
  });
});

describe("WorkScreen: one of two queries failing", () => {
  it("quiz list failing keeps the assignments, with an InlineError that retries", async () => {
    serve(routes([assignment(1)], null));
    renderWithProviders(<WorkScreen />);
    expect(await screen.findByText("Essay 1")).toBeTruthy();
    expect(await screen.findByText("Couldn't load your quizzes.")).toBeTruthy();
    expect(screen.getByLabelText("Quiz average: —")).toBeTruthy();

    serve(routes([assignment(1)], [quiz(2)]));
    fireEvent.press(screen.getByText("Try again"));
    expect(await screen.findByText("Quiz 2")).toBeTruthy();
    expect(screen.queryByText("Couldn't load your quizzes.")).toBeNull();
  });

  it("quiz list failing with no open assignments claims neither caught up nor empty", async () => {
    serve(routes([], null));
    renderWithProviders(<WorkScreen />);
    expect(await screen.findByText("Couldn't load your quizzes.")).toBeTruthy();
    expect(screen.getByText("No open assignments.")).toBeTruthy();
    expect(screen.queryByText("You're all caught up.")).toBeNull();
    expect(screen.queryByText("No assignments or quizzes yet")).toBeNull();
  });

  it("the Done segment shows the quiz failure too", async () => {
    serve(routes([assignment(1, { status: "SUBMITTED" })], null));
    renderWithProviders(<WorkScreen />);
    await screen.findByText("Couldn't load your quizzes.");
    done(1);
    expect(await screen.findByText("Essay 1")).toBeTruthy();
    expect(screen.getByText("Couldn't load your quizzes.")).toBeTruthy();
  });

  it("the dashboard failing costs the server's day, not the list: the flags still come from the server", async () => {
    serve({
      [ASSIGNMENTS]: { assignments: [assignment(1, { isOverdue: true })] },
      [QUIZZES]: { items: [], nextCursor: null },
    });
    renderWithProviders(<WorkScreen />);
    expect(await screen.findByText("Overdue")).toBeTruthy();
    expect(screen.queryByText("Try again")).toBeNull();
  });
});

describe("WorkScreen: rows", () => {
  it("segments count their rows, and open on To do", async () => {
    serve(routes([assignment(1), assignment(2, { status: "SUBMITTED" })], [quiz(3), quiz(4, { score: 1 })]));
    renderWithProviders(<WorkScreen />);
    expect(await screen.findByLabelText("To do 2")).toBeTruthy();
    expect(screen.getByLabelText("To do 2").props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByLabelText("Done 2").props.accessibilityState).toMatchObject({ selected: false });
    expect(screen.getByText("Essay 1")).toBeTruthy();
    expect(screen.getByText("Quiz 3")).toBeTruthy();
  });

  it("the chip reads the server's org day and flag, never the device clock", async () => {
    // dueOrgDay is two org days after the dashboard's todayOrgDay (2099-03-01).
    serve(routes([assignment(1), assignment(2, { status: "DRAFT", isOverdue: true })]));
    renderWithProviders(<WorkScreen />);
    expect(await screen.findByText("Due in 2 days")).toBeTruthy();
    expect(screen.getByText("Overdue")).toBeTruthy();
    expect(screen.getByText("Draft saved · Due Mar 3, 2099")).toBeTruthy();
    expect(screen.getByText("Due Mar 3, 2099")).toBeTruthy();
  });

  it("rows open the assignment and the quiz", async () => {
    serve(routes([assignment(41)], [quiz(51)]));
    renderWithProviders(<WorkScreen />);
    fireEvent.press(await screen.findByText("Essay 41"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/assignment/[id]", params: { id: "41" } });
    fireEvent.press(screen.getByText("Quiz 51"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/quiz/[id]", params: { id: "51" } });
  });

  it("a paper quiz is no button, and its notes show in full", async () => {
    const notes = "Good work on section two, but revise the last chapter before the next session.";
    serve(routes([assignment(1)], [quiz(41, { kind: "PAPER", score: 15, maxScore: 20, notes })]));
    renderWithProviders(<WorkScreen />);
    await screen.findByText("Essay 1");
    done(1);
    const title = await screen.findByText("Quiz 41");
    expect(screen.queryByRole("button", { name: /Quiz 41/ })).toBeNull();
    fireEvent.press(title);
    expect(mockPush).not.toHaveBeenCalled();

    const subtitle = screen.getByText(new RegExp(notes));
    expect(subtitle.props.numberOfLines).toBe(0); // React Native: no limit
    expect(screen.getByText("15/20")).toBeTruthy();
  });

  it("a long title takes two lines, so its chip stays whole", async () => {
    serve(routes([assignment(1, { title: "A long assignment title that will not fit on a single line" })]));
    renderWithProviders(<WorkScreen />);
    const title = await screen.findByText(/A long assignment title/);
    expect(title.props.numberOfLines).toBe(2);
  });

  it("the tiles sit under either segment, with the old counts", async () => {
    serve(
      routes(
        [assignment(1), assignment(2, { status: "RETURNED" }), assignment(3, { status: "REVIEWED" })],
        [quiz(4, { score: 5, maxScore: 10 })],
      ),
    );
    renderWithProviders(<WorkScreen />);
    expect(await screen.findByLabelText("Submitted: 1")).toBeTruthy();
    expect(screen.getByLabelText("Pending: 1")).toBeTruthy();
    expect(screen.getByLabelText("Reviewed: 1")).toBeTruthy();
    expect(await screen.findByLabelText("Quiz average: 50%")).toBeTruthy();
    done(2);
    expect(within(screen.getByTestId("screen")).getByLabelText("Reviewed: 1")).toBeTruthy();
  });
});
