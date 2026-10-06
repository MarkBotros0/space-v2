import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), put: jest.fn(), patch: jest.fn(), post: jest.fn() },
}));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "41" }),
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import QuizDetailScreen from "../../app/(app)/quiz/[id]/index";

const get = apiClient.get as jest.Mock;
const put = apiClient.put as jest.Mock;
const patch = apiClient.patch as jest.Mock;
const post = apiClient.post as jest.Mock;

const studentSession = {
  user: { id: 9, name: "Test student", email: "s@jpc.test", role: "STUDENT" as const, avatarPath: null },
  scopes: { seasonAdminIds: [], groupLeaderIds: [], activeSeasonId: 7, graduationYear: null },
};

const mcq = {
  id: 100, order: 0, type: "MCQ" as const, prompt: "Capital of France?", points: 2,
  options: ["London", "Paris"], selectedIndex: null, text: null,
  isCorrect: null, pointsAwarded: null,
};
const essay = {
  id: 101, order: 1, type: "ESSAY" as const, prompt: "Discuss.", points: 5,
  options: [], selectedIndex: null, text: null, isCorrect: null, pointsAwarded: null,
};

function detail(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 41, title: "Week 1 quiz", kind: "ONLINE", seasonId: 7, maxScore: 7,
    sessionTitle: "Week 1", attemptId: null, attemptNumber: 0, status: null,
    totalScore: null, submittedAt: null, gradedAt: null,
    questions: [mcq, essay], ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(studentSession);
});

afterEach(() => {
  jest.useRealTimers();
});

describe("quiz runner", () => {
  it("starts an attempt on an explicit press, never on render (ruling C6)", async () => {
    get.mockResolvedValue({ data: { data: detail() } });
    put.mockResolvedValue({
      data: { data: detail({ attemptId: 900, attemptNumber: 1, status: "IN_PROGRESS" }) },
    });

    renderWithProviders(<QuizDetailScreen />);

    expect(await screen.findByText("Week 1 quiz")).toBeTruthy();
    expect(put).not.toHaveBeenCalled();

    fireEvent.press(screen.getByText("Start quiz"));
    await waitFor(() => expect(put).toHaveBeenCalledWith("/api/v1/quizzes/41/attempt"));
    expect(await screen.findByText("Capital of France?")).toBeTruthy();
  });

  it("debounces answer saves into one batched PATCH and shows the save state", async () => {
    get.mockResolvedValue({
      data: { data: detail({ attemptId: 900, attemptNumber: 1, status: "IN_PROGRESS" }) },
    });
    patch.mockResolvedValue({ data: { data: { saved: 2 } } });

    renderWithProviders(<QuizDetailScreen />);

    fireEvent.press(await screen.findByLabelText("Answer 1 option 2: Paris"));
    fireEvent.changeText(screen.getByLabelText("Answer 2"), "Because of the river.");
    // Nothing has gone out yet — v1 fired one request per keystroke-ish event
    // and ignored the result (R55), so a failed save was silent and the student
    // saw their answer in local state as though it had persisted.
    expect(patch).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/api/v1/quizzes/41/attempt", {
        answers: [
          { questionId: 100, selectedIndex: 1, text: null },
          { questionId: 101, selectedIndex: null, text: "Because of the river." },
        ],
      }),
    );
    expect(await screen.findByText("Saved")).toBeTruthy();
  });

  it("says so when a save fails instead of pretending it worked", async () => {
    get.mockResolvedValue({
      data: { data: detail({ attemptId: 900, attemptNumber: 1, status: "IN_PROGRESS" }) },
    });
    patch.mockRejectedValue(new Error("offline"));

    renderWithProviders(<QuizDetailScreen />);
    fireEvent.press(await screen.findByLabelText("Answer 1 option 2: Paris"));
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(await screen.findByText("Not saved")).toBeTruthy();
  });

  it("keeps Submit disabled until every question is answered (R59)", async () => {
    get.mockResolvedValue({
      data: { data: detail({ attemptId: 900, attemptNumber: 1, status: "IN_PROGRESS" }) },
    });
    patch.mockResolvedValue({ data: { data: { saved: 1 } } });
    post.mockResolvedValue({
      data: {
        data: detail({
          attemptId: 900, attemptNumber: 1, status: "SUBMITTED",
          questions: [
            { ...mcq, selectedIndex: 1 },
            { ...essay, text: "Because." },
          ],
        }),
      },
    });

    renderWithProviders(<QuizDetailScreen />);

    fireEvent.press(await screen.findByLabelText("Answer 1 option 2: Paris"));
    fireEvent.press(screen.getByText("Submit"));
    // Still incomplete: the essay is blank. The server refuses this too
    // (409 attempt_incomplete) — the disabled control is the courtesy, the
    // server check is the rule.
    expect(post).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByLabelText("Answer 2"), "Because.");
    fireEvent.press(screen.getByText("Submit"));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/quizzes/41/attempt/submit"),
    );
  });

  it("shows the graded result per question without ever seeing an answer key", async () => {
    get.mockResolvedValue({
      data: {
        data: detail({
          attemptId: 900, attemptNumber: 1, status: "GRADED", totalScore: 5,
          gradedAt: "2099-03-02T10:00:00.000Z",
          questions: [
            { ...mcq, selectedIndex: 0, isCorrect: false, pointsAwarded: 0 },
            { ...essay, text: "Because.", pointsAwarded: 5 },
          ],
        }),
      },
    });

    renderWithProviders(<QuizDetailScreen />);

    expect(await screen.findByText("5 / 7")).toBeTruthy();
    // R34: the student is told which MCQ was wrong, and never what was right —
    // there is no correctIndex in the contract to render.
    expect(screen.getByText("Incorrect")).toBeTruthy();
  });

  it("tells a submitted student to wait rather than offering the form again", async () => {
    get.mockResolvedValue({
      data: {
        data: detail({ attemptId: 900, attemptNumber: 1, status: "SUBMITTED" }),
      },
    });

    renderWithProviders(<QuizDetailScreen />);

    expect(await screen.findByText(/waiting to be marked/i)).toBeTruthy();
    expect(screen.queryByText("Submit")).toBeNull();
  });

  it("gives staff a read-only preview with a link to grading", async () => {
    useSessionStore.setState({
      user: { id: 5, name: "Test leader", email: "l@jpc.test", role: "LEADER" as const, avatarPath: null },
      scopes: { seasonAdminIds: [], groupLeaderIds: [3], activeSeasonId: null, graduationYear: null },
    });
    get.mockResolvedValue({
      data: {
        data: {
          id: 41, title: "Week 1 quiz", kind: "ONLINE", seasonId: 7, seasonCode: "s26",
          sessionId: 12, sessionTitle: "Week 1", publishedAt: "2099-02-01T00:00:00.000Z",
          maxScore: 7, attemptCount: 2, gradeCount: 0,
          canEditStructure: false, canManage: false,
          questions: [{ id: 100, order: 0, type: "MCQ", prompt: "Capital of France?",
            points: 2, options: ["London", "Paris"], correctIndex: 1 }],
        },
      },
    });

    renderWithProviders(<QuizDetailScreen />);

    expect(await screen.findByText("Capital of France?")).toBeTruthy();
    // Staff DO see the key — that is the audience it exists for.
    expect(screen.getByText("Correct answer: Paris")).toBeTruthy();
    expect(screen.queryByText("Edit quiz")).toBeNull();
    fireEvent.press(screen.getByText("Grade this quiz"));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/quiz/[id]/grade",
      params: { id: "41" },
    });
  });
});
