import { fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import type { StudentProgress } from "@space/shared";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn(), put: jest.fn(), delete: jest.fn() } }));
jest.mock("../design/ui/toaster", () => ({ toast: { success: jest.fn(), error: jest.fn() }, Toaster: () => null }));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush, back: jest.fn() }) }));

import { apiClient } from "../lib/api-client";
import { SeasonProgressCard } from "../screens/student-detail/season-progress-card";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";

const get = apiClient.get as jest.Mock;
const put = apiClient.put as jest.Mock;

const mark = { markedAt: "2099-03-01T10:00:00.000Z", markedByName: "Grace Leader" };
const progress: StudentProgress = {
  seasonId: 7,
  seasonTitle: "Spring 2099",
  seasonActive: true,
  canMark: true,
  available: { attendance: true, assignments: true, quizzes: true },
  numbers: {
    attendance: { attended: 17, total: 20 },
    assignments: { submitted: 7, total: 9 },
    quizzes: { scored: 3.6, max: 5 },
  },
  assignments: [
    { id: 41, title: "Week four", dueAt: null, submitted: null, staffMark: null },
    { id: 42, title: "Week three", dueAt: null, submitted: "staff", staffMark: mark },
    { id: 43, title: "Week one", dueAt: null, submitted: "app", staffMark: null },
  ],
  quizzes: [
    { id: 91, title: "Quiz two", kind: "ONLINE", score: 2, maxScore: 10 },
    { id: 92, title: "Paper quiz", kind: "PAPER", score: 8, maxScore: 10 },
  ],
};

const engagement = {
  studentUserId: 21,
  seasonId: 7,
  seasonTitle: "Spring 2099",
  atRisk: false,
  score: 75,
  attendancePct: 85,
  submissionPct: 78,
  attendanceTotal: 20,
  attendancePresent: 17,
  submissionsExpected: 9,
  submissionsCompleted: 7,
  quizzesGiven: 2,
  quizzesTaken: 2,
  quizPct: 72,
};

const noSeason = {
  isAxiosError: true,
  response: { status: 404, data: { error: { code: "no_season", message: "x" } } },
};

function serve(body: StudentProgress | "no_season" | "fail", atRisk = false) {
  get.mockImplementation((url: string) => {
    if (url === "/api/v1/students/21/engagement") return Promise.resolve({ data: { data: { ...engagement, atRisk } } });
    if (url === "/api/v1/students/21/progress") {
      if (body === "no_season") return Promise.reject(noSeason);
      if (body === "fail") return Promise.reject(new Error("offline"));
      return Promise.resolve({ data: { data: body } });
    }
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

const renderCard = () => renderWithProviders(<SeasonProgressCard studentId={21} studentName="Sara Student" />);

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(makeSession("SUPER"));
});

describe("SeasonProgressCard", () => {
  it("the card shows three labelled bars with exact figures", async () => {
    serve(progress);
    renderCard();
    expect(await screen.findByText("Season progress")).toBeTruthy();
    expect(screen.getByText("Spring 2099")).toBeTruthy();
    // Three rings side by side, each with a short figure under it (owner 2026-11-14).
    expect(screen.getByText("17 of 20")).toBeTruthy();
    expect(screen.getByText("7 of 9")).toBeTruthy();
    expect(screen.getByText("5 quizzes")).toBeTruthy();
    expect(screen.getByText("85%")).toBeTruthy();
    expect(screen.getByText("78%")).toBeTruthy();
    expect(screen.getByText("72%")).toBeTruthy();
    expect(screen.getByLabelText("Attendance 85%, 17 of 20 sessions")).toBeTruthy();
    expect(screen.getByLabelText("Assignments 78%, 7 of 9 submitted")).toBeTruthy();
    expect(screen.getByLabelText("Quizzes 72%, average of 5 quizzes")).toBeTruthy();
    expect(screen.getAllByRole("image")).toHaveLength(3);
    // No composite score on this card (owner, 2026-11-07).
    expect(screen.queryByText(/Score/)).toBeNull();
    expect(screen.queryByText("At risk")).toBeNull();
  });

  it("keeps the at-risk flag from the engagement contract", async () => {
    serve(progress, true);
    renderCard();
    expect(await screen.findByText("At risk")).toBeTruthy();
  });

  it('a number with nothing to count reads "None yet" with a dash, never 0%', async () => {
    serve({ ...progress, numbers: { ...progress.numbers, quizzes: { scored: 0, max: 0 } } });
    renderCard();
    expect(await screen.findByText("None yet")).toBeTruthy();
    expect(screen.getByLabelText("Quizzes, None this season")).toBeTruthy();
    expect(screen.getByText("–")).toBeTruthy();
    expect(screen.queryByText("0%")).toBeNull();
  });

  it("tapping Assignments lists missing ones first with Mark as submitted", async () => {
    serve(progress);
    put.mockResolvedValue({
      data: { data: { studentUserId: 21, markedAt: mark.markedAt, markedBy: { id: 1, name: "Test" } } },
    });
    renderCard();
    fireEvent.press(await screen.findByLabelText("Assignments 78%, 7 of 9 submitted"));
    const rows = await screen.findAllByTestId("progress-assignment-row");
    expect(within(rows[0]!).getByText("Week four")).toBeTruthy();
    expect(within(rows[0]!).getByText("Not submitted")).toBeTruthy();
    expect(within(rows[1]!).getByText("Marked submitted by Grace Leader")).toBeTruthy();
    expect(within(rows[2]!).getByText("Submitted")).toBeTruthy();

    fireEvent.press(within(rows[0]!).getByText("Mark as submitted"));
    // The confirm sits inside the same sheet: no second modal (iOS drops it).
    expect(
      await screen.findByText("Use this when Sara Student did it outside the app. It counts as submitted everywhere."),
    ).toBeTruthy();
    fireEvent.press(within(screen.getByTestId("sheet-save-bar")).getByText("Mark as submitted"));
    await waitFor(() => expect(put).toHaveBeenCalledWith("/api/v1/assignments/41/submitted-marks/21"));
  });

  it("offers Undo on a staff mark and nothing on an app submission", async () => {
    serve(progress);
    renderCard();
    fireEvent.press(await screen.findByLabelText("Assignments 78%, 7 of 9 submitted"));
    const rows = await screen.findAllByTestId("progress-assignment-row");
    expect(within(rows[1]!).getByText("Undo")).toBeTruthy();
    expect(within(rows[2]!).queryByText("Mark as submitted")).toBeNull();
    expect(within(rows[2]!).queryByText("Undo")).toBeNull();
  });

  it("offers no mark when the caller may not mark (a finished season)", async () => {
    serve({ ...progress, canMark: false, seasonActive: false });
    renderCard();
    expect(await screen.findByText("Ended")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Assignments 78%, 7 of 9 submitted"));
    await screen.findAllByTestId("progress-assignment-row");
    expect(screen.queryByText("Mark as submitted")).toBeNull();
  });

  it("tapping Quizzes lists the lowest first with Allow a retake", async () => {
    serve(progress);
    renderCard();
    fireEvent.press(await screen.findByLabelText("Quizzes 72%, average of 5 quizzes"));
    const rows = await screen.findAllByTestId("progress-quiz-row");
    expect(within(rows[0]!).getByText("Quiz two")).toBeTruthy();
    expect(within(rows[0]!).getByText("2 of 10 marks, 20%")).toBeTruthy();
    expect(within(rows[1]!).getByText("Open grading")).toBeTruthy();
    fireEvent.press(within(rows[0]!).getByText("Allow a retake"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/quiz/[id]/grade", params: { id: "91" } });
  });

  it("tapping Attendance sums up the sessions", async () => {
    serve(progress);
    renderCard();
    fireEvent.press(await screen.findByLabelText("Attendance 85%, 17 of 20 sessions"));
    expect(await screen.findByText("Attended 17 sessions")).toBeTruthy();
    expect(screen.getByText("Missed 3 sessions")).toBeTruthy();
  });

  it("the card hides on no_season", async () => {
    serve("no_season");
    renderCard();
    await waitFor(() => expect(get).toHaveBeenCalledWith("/api/v1/students/21/progress"));
    await waitFor(() => expect(screen.queryByTestId("season-progress-loading")).toBeNull());
    expect(screen.queryByText("Season progress")).toBeNull();
    expect(screen.queryByText(/Couldn't/)).toBeNull();
  });

  it("shows a retryable error for any other failure", async () => {
    serve("fail");
    renderCard();
    expect(await screen.findByText("Couldn't load season progress.")).toBeTruthy();
    serve(progress);
    fireEvent.press(screen.getByText("Try again"));
    expect(await screen.findByText("17 of 20")).toBeTruthy();
  });

  it("shows nothing and asks nothing for a mentor", async () => {
    useSessionStore.setState(makeSession("MENTOR"));
    serve(progress);
    renderCard();
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText("Season progress")).toBeNull();
    expect(get).not.toHaveBeenCalledWith("/api/v1/students/21/progress");
  });
});
