import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
}));
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "41" }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import QuizGradeScreen from "../../app/(app)/quiz/[id]/grade";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;

const leaderSession = {
  user: { id: 5, name: "Test leader", email: "l@jpc.test", role: "LEADER" as const, avatarPath: null, hasPassword: true },
  scopes: { seasonAdminIds: [], groupLeaderIds: [3], activeSeasonId: null, graduationYear: null },
};

function authoring(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 41, title: "Week 1 quiz", kind: "PAPER", seasonId: 7, seasonCode: "s26",
    sessionId: 12, sessionTitle: "Week 1", publishedAt: null, maxScore: 20,
    attemptCount: 0, gradeCount: 0, canEditStructure: false, canManage: false,
    questions: [], ...over,
  };
}

const gradeSheet = {
  id: 41, title: "Week 1 quiz", kind: "PAPER", maxScore: 20, seasonId: 7,
  sessionTitle: "Week 1", studentCount: 2,
  rows: [
    { studentUserId: 9, studentName: "Test student", score: null, notes: null,
      gradedAt: null, gradedByName: null },
    { studentUserId: 10, studentName: "Second student", score: 18, notes: "Good.",
      gradedAt: "2099-03-02T10:00:00.000Z", gradedByName: "Test leader" },
  ],
};

const attemptsPage = {
  id: 41, title: "Online quiz", kind: "ONLINE", maxScore: 7, hasEssays: true,
  studentCount: 2,
  items: [
    {
      attemptId: 900, studentUserId: 9, studentName: "Test student", attemptNumber: 1,
      status: "SUBMITTED", autoScore: 2, manualScore: null, totalScore: null,
      submittedAt: "2099-03-02T10:00:00.000Z", gradedByName: null,
      answers: [
        { questionId: 100, type: "MCQ", prompt: "Capital of France?", points: 2,
          options: ["London", "Paris"], correctIndex: 1, selectedIndex: 1,
          isCorrect: true, text: null, pointsAwarded: 2 },
        { questionId: 101, type: "ESSAY", prompt: "Discuss.", points: 5,
          options: [], correctIndex: null, selectedIndex: null, isCorrect: null,
          text: "Because of the river.", pointsAwarded: null },
      ],
    },
  ],
  waiting: [{ studentUserId: 10, studentName: "Second student", startedAt: null }],
  nextCursor: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(leaderSession);
});

describe("grading screen — PAPER", () => {
  beforeEach(() => {
    get.mockImplementation((url: string) =>
      url === "/api/v1/quizzes/41"
        ? Promise.resolve({ data: { data: authoring() } })
        : Promise.resolve({ data: { data: gradeSheet } }),
    );
  });

  it("renders the grid with existing marks and saves only edited rows", async () => {
    post.mockResolvedValue({ data: { data: gradeSheet } });

    renderWithProviders(<QuizGradeScreen />);

    expect(await screen.findByText("Test student")).toBeTruthy();
    expect(screen.getByDisplayValue("18")).toBeTruthy();
    expect(screen.getByText("1/2 graded")).toBeTruthy();

    fireEvent.changeText(screen.getByLabelText("Score for Test student"), "15");
    fireEvent.press(screen.getByText("Save grades"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/quizzes/41/grades", {
        // Only the touched row. Sending every row would restamp gradedBy and
        // gradedAt on marks this caller never made — the same reasoning as the
        // attendance screen's untouched-row rule.
        entries: [{ studentUserId: 9, score: 15, notes: null }],
      }),
    );
  });

  it("clears a grade when the field is emptied", async () => {
    post.mockResolvedValue({ data: { data: gradeSheet } });

    renderWithProviders(<QuizGradeScreen />);

    fireEvent.changeText(await screen.findByLabelText("Score for Second student"), "");
    fireEvent.press(screen.getByText("Save grades"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/quizzes/41/grades", {
        entries: [{ studentUserId: 10, score: null, notes: "Good." }],
      }),
    );
  });

  it("surfaces the server's over-max refusal instead of clamping locally", async () => {
    // apiErrorMessage only trusts a real axios error (isAxiosError), so the
    // fixture carries that flag like the other screens' rejection fixtures.
    post.mockRejectedValue(
      Object.assign(new Error("400"), {
        isAxiosError: true,
        response: { status: 400, data: { error: { code: "score_exceeds_max",
          message: "This quiz is out of 20." } } },
      }),
    );

    renderWithProviders(<QuizGradeScreen />);
    fireEvent.changeText(await screen.findByLabelText("Score for Test student"), "25");
    fireEvent.press(screen.getByText("Save grades"));

    // v1's only bound was Math.min in the form, so an above-max score was
    // silently rewritten on the way in and nobody ever saw the mistake.
    expect(await screen.findByText("This quiz is out of 20.")).toBeTruthy();
  });
});

describe("grading screen — ONLINE", () => {
  beforeEach(() => {
    get.mockImplementation((url: string) =>
      url === "/api/v1/quizzes/41"
        ? Promise.resolve({
            data: { data: authoring({ kind: "ONLINE", maxScore: 7,
              publishedAt: "2099-02-01T00:00:00.000Z", attemptCount: 1 }) },
          })
        : Promise.resolve({ data: { data: attemptsPage } }),
    );
  });

  it("lists submitted attempts, shows the key to the grader, and marks essays", async () => {
    post.mockResolvedValue({ data: { data: { attemptId: 900 } } });

    renderWithProviders(<QuizGradeScreen />);

    expect(await screen.findByText("Test student")).toBeTruthy();
    expect(screen.getByText("Because of the river.")).toBeTruthy();
    // R103: the grader sees what was right. This is the audience the answer key
    // exists for — and the student contract has no field to carry it.
    expect(screen.getByText("Correct answer: Paris")).toBeTruthy();

    fireEvent.changeText(screen.getByLabelText("Marks for Discuss."), "4");
    fireEvent.press(screen.getByText("Save marks"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/quizzes/41/attempts/900/grade", {
        awards: [{ questionId: 101, points: 4 }],
      }),
    );
  });

  it("shows students who have not finished rather than dropping them (R102, D5)", async () => {
    renderWithProviders(<QuizGradeScreen />);

    expect(await screen.findByText("Waiting")).toBeTruthy();
    expect(screen.getByText("Second student")).toBeTruthy();
    expect(screen.getByText("Not started")).toBeTruthy();
  });

  it("lets a leader reopen a graded attempt", async () => {
    get.mockImplementation((url: string) =>
      url === "/api/v1/quizzes/41"
        ? Promise.resolve({
            data: { data: authoring({ kind: "ONLINE", maxScore: 7,
              publishedAt: "2099-02-01T00:00:00.000Z", attemptCount: 1 }) },
          })
        : Promise.resolve({
            data: {
              data: {
                ...attemptsPage,
                items: [{ ...attemptsPage.items[0], status: "GRADED",
                  manualScore: 4, totalScore: 6, gradedByName: "Test leader" }],
              },
            },
          }),
    );
    post.mockResolvedValue({ data: { data: { attemptId: 901, attemptNumber: 2 } } });

    renderWithProviders(<QuizGradeScreen />);

    fireEvent.press(await screen.findByText("Reopen for a retake"));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/quizzes/41/attempts/reopen", {
        studentUserId: 9,
      }),
    );
  });
});
