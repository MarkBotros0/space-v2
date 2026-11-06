import { act, fireEvent, screen, within } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn() } }));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));

import { useSessionStore } from "../store/session";
import { SubmittedScreen, WorkScreen } from "../screens/work/work-screen";
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

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }));
});

afterEach(() => act(() => new Promise<void>((resolve) => setTimeout(resolve, 20))));

describe("To do tab", () => {
  it("no active season: says so and asks the server for nothing", async () => {
    useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: null }));
    renderWithProviders(<WorkScreen />);
    expect(await screen.findByText("No active season")).toBeTruthy();
    expect(screen.getByText("To do")).toBeTruthy();
    expect(requested()).toEqual([]);
  });

  it("groups open work most urgent first, each group named", async () => {
    // todayOrgDay is 2099-03-01 (the dashboard fixture).
    serve(
      routes(
        [
          assignment(1, { isOverdue: true }),
          assignment(2, { status: "RETURNED" }),
          assignment(3),
          assignment(4, { dueOrgDay: "2099-04-30", dueAt: "2099-04-30T10:00:00.000Z" }),
          assignment(5, { status: "SUBMITTED" }),
        ],
        [quiz(6), quiz(7, { score: 3 })],
      ),
    );
    renderWithProviders(<WorkScreen />);
    expect(await screen.findByText("OVERDUE")).toBeTruthy();
    const headers = [
      "OVERDUE",
      "RETURNED — NEEDS CHANGES",
      "DUE THIS WEEK",
      "LATER",
      "QUIZZES TO TAKE",
    ];
    for (const h of headers) expect(screen.getByText(h)).toBeTruthy();
    for (const t of ["Essay 1", "Essay 2", "Essay 3", "Essay 4", "Quiz 6"])
      expect(screen.getByText(t)).toBeTruthy();
    // Handed in or graded: not here.
    expect(screen.queryByText("Essay 5")).toBeNull();
    expect(screen.queryByText("Quiz 7")).toBeNull();
  });

  it("nothing to do: caught up, with a way to the Submitted tab", async () => {
    serve(routes([assignment(1, { status: "REVIEWED" })], [quiz(2, { score: 7 })]));
    renderWithProviders(<WorkScreen />);
    expect(await screen.findByText("You're all caught up")).toBeTruthy();
    fireEvent.press(screen.getByText("See what you submitted"));
    expect(mockPush).toHaveBeenCalledWith("/submitted");
  });

  it("never says caught up until the quiz list has answered", async () => {
    let answer: (value: unknown) => void = () => {};
    const pending = new Promise((resolve) => (answer = resolve));
    get.mockImplementation((url: string) => {
      if (url === QUIZZES) return pending;
      if (url === ASSIGNMENTS) return Promise.resolve({ data: { data: { assignments: [] } } });
      return Promise.resolve({ data: { data: studentDashboard } });
    });
    renderWithProviders(<WorkScreen />);
    expect(await screen.findByText("QUIZZES TO TAKE")).toBeTruthy();
    expect(screen.queryByText("You're all caught up")).toBeNull();
    await act(async () => answer({ data: { data: { items: [], nextCursor: null } } }));
    expect(await screen.findByText("You're all caught up")).toBeTruthy();
  });

  it("assignment list failing: a retry that asks again", async () => {
    serve({ [DASHBOARD]: studentDashboard, [QUIZZES]: { items: [], nextCursor: null } });
    renderWithProviders(<WorkScreen />);
    const retry = await screen.findByText("Try again");
    serve(routes([assignment(1)]));
    fireEvent.press(retry);
    expect(await screen.findByText("Essay 1")).toBeTruthy();
  });

  it("quiz list failing keeps the assignments, with an InlineError that retries", async () => {
    serve(routes([assignment(1)], null));
    renderWithProviders(<WorkScreen />);
    expect(await screen.findByText("Essay 1")).toBeTruthy();
    expect(await screen.findByText("Couldn't load your quizzes.")).toBeTruthy();
    serve(routes([assignment(1)], [quiz(2)]));
    fireEvent.press(screen.getByText("Try again"));
    expect(await screen.findByText("Quiz 2")).toBeTruthy();
  });

  it("the chip reads the server's org day and flag, never the device clock", async () => {
    serve(routes([assignment(1), assignment(2, { status: "DRAFT", isOverdue: true })]));
    renderWithProviders(<WorkScreen />);
    expect(await screen.findByText("Due in 2 days")).toBeTruthy();
    expect(screen.getByText("In progress · Due Mar 3, 2099")).toBeTruthy();
  });

  it("rows open the assignment and the quiz", async () => {
    serve(routes([assignment(41)], [quiz(51)]));
    renderWithProviders(<WorkScreen />);
    fireEvent.press(await screen.findByText("Essay 41"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/assignment/[id]", params: { id: "41" } });
    fireEvent.press(screen.getByText("Quiz 51"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/quiz/[id]", params: { id: "51" } });
  });

  it("a long title takes two lines, so its chip stays whole", async () => {
    serve(
      routes([
        assignment(1, { title: "A long assignment title that will not fit on a single line" }),
      ]),
    );
    renderWithProviders(<WorkScreen />);
    const title = await screen.findByText(/A long assignment title/);
    expect(title.props.numberOfLines).toBe(2);
  });
});

describe("Submitted tab", () => {
  it("nothing handed in: says what will show up here", async () => {
    serve(routes([assignment(1)], [quiz(2)]));
    renderWithProviders(<SubmittedScreen />);
    expect(await screen.findByText("Nothing submitted yet")).toBeTruthy();
  });

  it("says in words where each assignment's grading stands, waiting first", async () => {
    serve(
      routes([
        assignment(1, { status: "REVIEWED", reviewedAt: "2099-02-20T10:00:00.000Z" }),
        assignment(2, { status: "SUBMITTED" }),
        assignment(3),
      ]),
    );
    renderWithProviders(<SubmittedScreen />);
    expect((await screen.findAllByText("Waiting for review")).length).toBeGreaterThan(0);
    expect(screen.getByText("Your leader hasn't reviewed it yet")).toBeTruthy();
    expect(screen.getByText(/Reviewed Feb 20, 2099.*Open to read the feedback/)).toBeTruthy();
    expect(screen.queryByText("Essay 3")).toBeNull();
    const rows = screen.getAllByText(/^Essay \d$/).map((t) => t.props.children);
    expect(rows).toEqual(["Essay 2", "Essay 1"]);
  });

  it("quizzes show their score, or that they're not graded yet", async () => {
    serve(
      routes(
        [],
        [
          quiz(4, { score: 7, maxScore: 10 }),
          quiz(5, { attemptStatus: "SUBMITTED" }),
          quiz(6, { kind: "PAPER" }),
        ],
      ),
    );
    renderWithProviders(<SubmittedScreen />);
    expect(await screen.findByRole("button", { name: /Quiz 4.*, 7\/10$/ })).toBeTruthy();
    expect(screen.getAllByText("Not graded yet")).toHaveLength(2);
  });

  it("a paper quiz is no button, and its notes show in full", async () => {
    const notes = "Good work on section two, but revise the last chapter before the next session.";
    serve(routes([], [quiz(41, { kind: "PAPER", score: 15, maxScore: 20, notes })]));
    renderWithProviders(<SubmittedScreen />);
    const title = await screen.findByText("Quiz 41");
    expect(screen.queryByRole("button", { name: /Quiz 41/ })).toBeNull();
    fireEvent.press(title);
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByText(new RegExp(notes)).props.numberOfLines).toBe(0);
    expect(screen.getByText("15/20")).toBeTruthy();
  });

  it("sums it up: waiting, reviewed and the quiz average", async () => {
    serve(
      routes(
        [
          assignment(1, { status: "SUBMITTED" }),
          assignment(2, { status: "REVIEWED" }),
          assignment(3, { status: "REVIEWED" }),
        ],
        [quiz(4, { score: 5, maxScore: 10 })],
      ),
    );
    renderWithProviders(<SubmittedScreen />);
    expect(await screen.findByLabelText("Waiting for review: 1")).toBeTruthy();
    expect(screen.getByLabelText("Reviewed: 2")).toBeTruthy();
    expect(await screen.findByLabelText("Quiz average: 50%")).toBeTruthy();
  });

  it("quiz list failing keeps the assignments and says so", async () => {
    serve(routes([assignment(1, { status: "SUBMITTED" })], null));
    renderWithProviders(<SubmittedScreen />);
    expect(await screen.findByText("Essay 1")).toBeTruthy();
    expect(await screen.findByText("Couldn't load your quizzes.")).toBeTruthy();
    expect(within(screen.getByTestId("screen")).getByLabelText("Quiz average: —")).toBeTruthy();
  });
});
