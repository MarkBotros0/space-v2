import { fireEvent, screen, waitFor, within } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock("../design/ui/toaster", () => ({ toast: { success: jest.fn(), error: jest.fn() }, Toaster: () => null }));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "41" }),
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
}));

import { toast } from "../design/ui/toaster";
import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderStacked, renderWithProviders } from "./helpers/render";
import { NOT_ENDED, waitingRow } from "./quiz-grading-fixtures";
import QuizGradeScreen from "../../app/(app)/quiz/[id]/grade";
import QuizDetailScreen from "../../app/(app)/quiz/[id]/index";

const get = apiClient.get as jest.Mock;
const put = apiClient.put as jest.Mock;
const del = apiClient.delete as jest.Mock;

const staffSession = {
  user: { id: 5, name: "Test admin", email: "a@jpc.test", role: "ADMIN" as const, avatarPath: null, hasPassword: true },
  scopes: { seasonAdminIds: [7], groupLeaderIds: [], activeSeasonId: 7, graduationYear: null },
};
const studentSession = {
  user: {
    id: 9,
    name: "Test student",
    email: "s@jpc.test",
    role: "STUDENT" as const,
    avatarPath: null,
    hasPassword: true,
  },
  scopes: { seasonAdminIds: [], groupLeaderIds: [], activeSeasonId: 7, graduationYear: null },
};

const quiz = (canReleaseResults: boolean) => ({
  id: 41,
  title: "Week 1 quiz",
  kind: "ONLINE",
  seasonId: 7,
  seasonCode: "s26",
  sessionId: 12,
  sessionTitle: "Week 1",
  publishedAt: "2099-02-01T00:00:00.000Z",
  maxScore: 10,
  attemptCount: 1,
  gradeCount: 0,
  ...{ canEditStructure: false, canManage: false, answersReleasedAt: null, shuffleQuestions: true },
  canReleaseResults,
  questions: [],
  ...{ startsFrom: null, startsUntil: null, timeLimitMinutes: null },
});

const gradedAttempt = {
  attemptId: 900,
  studentUserId: 9,
  studentName: "Test student",
  attemptNumber: 1,
  status: "GRADED",
  autoScore: 7,
  manualScore: null,
  totalScore: 7,
  bestScore: 7,
  adminScore: null,
  appScore: 7,
  submittedAt: "2099-03-02T10:00:00.000Z",
  gradedByName: null,
  ...NOT_ENDED,
  answers: [],
};

const adminScore = {
  score: 4,
  notes: "Took it on paper.",
  gradedAt: "2099-03-03T10:00:00.000Z",
  gradedByName: "Test admin",
};

function serve(canReleaseResults: boolean, items: unknown[] = [gradedAttempt], waiting: unknown[] = []) {
  get.mockImplementation((url: string) =>
    Promise.resolve({
      data: {
        data:
          url === "/api/v1/quizzes/41"
            ? quiz(canReleaseResults)
            : {
                id: 41,
                title: "Week 1 quiz",
                kind: "ONLINE",
                maxScore: 10,
                hasEssays: false,
                studentCount: 2,
                items,
                waiting,
                nextCursor: null,
              },
      },
    }),
  );
}

const conflict = (code: string, message: string) =>
  Object.assign(new Error("409"), {
    isAxiosError: true,
    response: { status: 409, data: { error: { code, message } } },
  });

const saved = {
  score: 7.5,
  notes: "On paper.",
  gradedAt: "2099-03-03T10:00:00.000Z",
  gradedBy: { id: 5, name: "Test admin" },
};

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(staffSession);
});

const openRow = (name: string) => fireEvent.press(screen.getByLabelText(new RegExp(`^${name}`)));

describe("the admin's manual score", () => {
  it("the sheet shows the app status above the score field and says the score replaces the app's", async () => {
    serve(true);
    renderStacked(<QuizGradeScreen />);
    await screen.findByText("Test student");
    openRow("Test student");
    fireEvent.press(await screen.findByRole("button", { name: "Enter score manually" }));

    expect(await screen.findByText("Graded in the app: 7 / 10")).toBeTruthy();
    expect(screen.getByText("This score replaces the app's score for this student.")).toBeTruthy();
    // In tree order: the app status, then the score field.
    const nodes = screen.root.findAll((n) => (n.type as unknown) === "Text" || (n.type as unknown) === "TextInput");
    const status = nodes.findIndex((n) => n.props.children === "Graded in the app: 7 / 10");
    const field = nodes.findIndex((n) => n.props.accessibilityLabel === "Score for Test student");
    expect(status).toBeGreaterThan(-1);
    expect(status).toBeLessThan(field);
  });

  it("leaders see no Enter score", async () => {
    serve(false, [gradedAttempt], [waitingRow(10, "Second student", null)]);
    renderStacked(<QuizGradeScreen />);
    await screen.findByText("Second student");
    expect(screen.queryByLabelText(/Enter a score for/)).toBeNull();
    openRow("Test student");
    expect(await screen.findByText("Allow a retake")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Enter score manually" })).toBeNull();
  });

  it("says where marking is, and what a manual score is for (owner, 2026-11-13)", async () => {
    serve(true, [], [{ ...waitingRow(10, "Second student", null), adminScore: null }]);
    renderStacked(<QuizGradeScreen />);
    expect(await screen.findByText("Enter score manually")).toBeTruthy();
    expect(screen.getByText("NOT SUBMITTED")).toBeTruthy();
    expect(
      screen.getByText("Enter a score manually only for a student who took the quiz outside the app."),
    ).toBeTruthy();
    expect(screen.getByText("Nobody has submitted yet")).toBeTruthy();
    expect(screen.getByText("When students submit, they show here. Tap one to mark their answers.")).toBeTruthy();
  });

  it("saving posts and closes", async () => {
    serve(true, [], [{ ...waitingRow(10, "Second student", null), adminScore: null }]);
    put.mockResolvedValue({ data: { data: saved } });
    renderStacked(<QuizGradeScreen />);
    fireEvent.press(await screen.findByLabelText("Enter a score manually for Second student"));
    expect(await screen.findByText("Didn't take it")).toBeTruthy();

    fireEvent.changeText(screen.getByLabelText("Score for Second student"), "7,5");
    fireEvent.changeText(screen.getByLabelText("Note for Second student"), "On paper.");
    fireEvent.press(screen.getByText("Save score"));

    await waitFor(() =>
      expect(put).toHaveBeenCalledWith("/api/v1/quizzes/41/manual-scores/10", { score: 7.5, notes: "On paper." }),
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Score saved."));
    // Closing: the sheet stops taking touches at once and slides away.
    let root = screen.getByTestId("sheet-backdrop").parent;
    while (root && root.props.pointerEvents === undefined) root = root.parent;
    await waitFor(() => expect(root?.props.pointerEvents).toBe("none"));
  });

  it("a score out of range is refused on the phone", async () => {
    serve(true, [], [{ ...waitingRow(10, "Second student", null), adminScore: null }]);
    renderStacked(<QuizGradeScreen />);
    fireEvent.press(await screen.findByLabelText("Enter a score manually for Second student"));
    fireEvent.changeText(await screen.findByLabelText("Score for Second student"), "12");
    fireEvent.press(screen.getByText("Save score"));
    expect(screen.getByLabelText("Score for Second student").props.accessibilityHint).toBe(
      "Enter a score from 0 to 10.",
    );
    expect(put).not.toHaveBeenCalled();

    // A reopened sheet starts clean.
    fireEvent.press(screen.getByTestId("sheet-backdrop"));
    fireEvent.press(screen.getByLabelText("Enter a score manually for Second student"));
    await waitFor(() =>
      expect(screen.getByLabelText("Score for Second student").props.accessibilityHint).toBeUndefined(),
    );
  });

  it('attempt_open shows "End their attempt first." with a link to the live screen', async () => {
    serve(true, [], [{ ...waitingRow(10, "Second student", "2099-03-02T09:00:00.000Z"), adminScore: null }]);
    put.mockRejectedValue(conflict("attempt_open", "End their attempt first."));
    renderStacked(<QuizGradeScreen />);
    fireEvent.press(await screen.findByLabelText("Enter a score manually for Second student"));
    expect(await screen.findByText("In progress")).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText("Score for Second student"), "6");
    fireEvent.press(screen.getByText("Save score"));

    expect(await screen.findByText("End their attempt first.")).toBeTruthy();
    fireEvent.press(screen.getByRole("link", { name: "Open the live screen" }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/quiz/[id]/live", params: { id: "41" } });
  });

  it("any other refusal shows the server's message in the save bar", async () => {
    serve(true, [], [{ ...waitingRow(10, "Second student", null), adminScore: null }]);
    put.mockRejectedValue(conflict("quiz_not_published", "Publish the quiz first."));
    renderStacked(<QuizGradeScreen />);
    fireEvent.press(await screen.findByLabelText("Enter a score manually for Second student"));
    fireEvent.changeText(await screen.findByLabelText("Score for Second student"), "6");
    fireEvent.press(screen.getByText("Save score"));

    const bar = await screen.findByTestId("sheet-save-bar");
    expect(await within(bar).findByText("Publish the quiz first.")).toBeTruthy();
    expect(screen.queryByText("End their attempt first.")).toBeNull();
  });

  it("clear asks to confirm, then deletes", async () => {
    const scored = { ...gradedAttempt, bestScore: 4, adminScore };
    serve(true, [scored]);
    del.mockResolvedValue({ status: 204, data: "" });
    renderStacked(<QuizGradeScreen />);
    expect(await screen.findByText("Score entered by admin: 4/10")).toBeTruthy();
    openRow("Test student");
    // The server refuses a retake once the admin's score is in, so the sheet doesn't offer one.
    expect(await screen.findByRole("button", { name: "Edit manual score" })).toBeTruthy();
    expect(screen.queryByText("Allow a retake")).toBeNull();
    fireEvent.press(screen.getByRole("button", { name: "Edit manual score" }));
    expect(await screen.findByDisplayValue("4")).toBeTruthy();
    expect(screen.getByDisplayValue("Took it on paper.")).toBeTruthy();

    fireEvent.press(screen.getByRole("button", { name: "Clear score" }));
    expect(await screen.findByText("Clear Test student's score?")).toBeTruthy();
    // Not "their best app attempt": they may have none.
    expect(screen.getByText("Their app score counts again, if they have one. Nothing is reopened.")).toBeTruthy();
    expect(del).not.toHaveBeenCalled();
    fireEvent.press(screen.getAllByRole("button", { name: "Clear score" }).at(-1)!);
    await waitFor(() => expect(del).toHaveBeenCalledWith("/api/v1/quizzes/41/manual-scores/9"));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Score cleared."));
  });
});

function studentDetail(over: Record<string, unknown> = {}) {
  return {
    id: 41,
    title: "Week 1 quiz",
    kind: "ONLINE",
    seasonId: 7,
    maxScore: 10,
    sessionTitle: "Week 1",
    attemptId: null,
    attemptNumber: 0,
    status: null,
    stage: "graded",
    totalScore: 7.5,
    adminScore: { score: 7.5, notes: "Marked on paper." },
    submittedAt: null,
    gradedAt: "2099-03-03T10:00:00.000Z",
    questionCount: 2,
    questions: [],
    readOnly: false,
    answersReleased: false,
    ...{ startsFrom: null, startsUntil: null, timeLimitMinutes: null, deadlineAt: null },
    serverNow: "2099-03-04T10:00:00.000Z",
    endReason: null,
    ...over,
  };
}

describe("the student's view of the admin's score", () => {
  beforeEach(() => useSessionStore.setState(studentSession));

  it('the student sees the score, "Score entered by your admin" and the note, and no Start', async () => {
    get.mockResolvedValue({ data: { data: studentDetail() } });
    renderWithProviders(<QuizDetailScreen />);

    expect(await screen.findByLabelText("Score: 7.5 / 10")).toBeTruthy();
    expect(screen.getByText("Score entered by your admin")).toBeTruthy();
    expect(screen.getByText("Marked on paper.")).toBeTruthy();
    expect(screen.queryByText("I'm ready")).toBeNull();
    // No attempt to review: the release line would promise answers that never come.
    expect(screen.queryByText("Answers appear when your admin releases them.")).toBeNull();
  });

  it("an admin score over an attempt not graded yet promises no answers", async () => {
    const over = { attemptId: 900, attemptNumber: 1, status: "SUBMITTED", submittedAt: "2099-03-02T10:00:00.000Z" };
    get.mockResolvedValue({ data: { data: studentDetail(over) } });
    renderWithProviders(<QuizDetailScreen />);
    expect(await screen.findByText("Score entered by your admin")).toBeTruthy();
    expect(screen.queryByText("Answers appear when your admin releases them.")).toBeNull();
  });

  it("an admin score over a graded attempt still says the answers come with the release", async () => {
    const over = { attemptId: 900, attemptNumber: 1, status: "GRADED", submittedAt: "2099-03-02T10:00:00.000Z" };
    get.mockResolvedValue({ data: { data: studentDetail(over) } });
    renderWithProviders(<QuizDetailScreen />);
    expect(await screen.findByText("Answers appear when your admin releases them.")).toBeTruthy();
  });

  it("an admin score shows the result even on a not-started read", async () => {
    get.mockResolvedValue({ data: { data: studentDetail({ stage: "not_started" }) } });
    renderWithProviders(<QuizDetailScreen />);
    expect(await screen.findByText("Score entered by your admin")).toBeTruthy();
    expect(screen.queryByText("I'm ready")).toBeNull();
  });
});
