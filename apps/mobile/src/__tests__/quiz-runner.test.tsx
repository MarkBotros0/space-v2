import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), put: jest.fn(), patch: jest.fn(), post: jest.fn() },
}));
jest.mock("../design/ui/toaster", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
  Toaster: () => null,
}));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "41" }),
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
}));

import { toast } from "../design/ui/toaster";
import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import QuizDetailScreen from "../../app/(app)/quiz/[id]/index";

const get = apiClient.get as jest.Mock;
const put = apiClient.put as jest.Mock;
const patch = apiClient.patch as jest.Mock;
const post = apiClient.post as jest.Mock;

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

const mcq = {
  id: 100,
  order: 0,
  type: "MCQ" as const,
  prompt: "Capital of France?",
  points: 2,
  options: ["London", "Paris"],
  selectedIndex: null,
  text: null,
  isCorrect: null,
  pointsAwarded: null,
};
const essay = {
  id: 101,
  order: 1,
  type: "ESSAY" as const,
  prompt: "Discuss.",
  points: 5,
  options: [],
  selectedIndex: null,
  text: null,
  isCorrect: null,
  pointsAwarded: null,
};

function detail(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 41,
    title: "Week 1 quiz",
    kind: "ONLINE",
    seasonId: 7,
    maxScore: 7,
    sessionTitle: "Week 1",
    attemptId: null,
    attemptNumber: 0,
    readOnly: false,
    status: null,
    totalScore: null,
    submittedAt: null,
    gradedAt: null,
    resultsReleased: true,
    questions: [mcq, essay],
    ...over,
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
    expect(await screen.findByText(/Saved/)).toBeTruthy();
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

    expect(await screen.findByText(/Not saved/)).toBeTruthy();
  });

  it("keeps Submit disabled until every question is answered (R59)", async () => {
    get.mockResolvedValue({
      data: { data: detail({ attemptId: 900, attemptNumber: 1, status: "IN_PROGRESS" }) },
    });
    patch.mockResolvedValue({ data: { data: { saved: 1 } } });
    post.mockResolvedValue({
      data: {
        data: detail({
          attemptId: 900,
          attemptNumber: 1,
          status: "SUBMITTED",
          questions: [
            { ...mcq, selectedIndex: 1 },
            { ...essay, text: "Because." },
          ],
        }),
      },
    });

    renderWithProviders(<QuizDetailScreen />);

    fireEvent.press(await screen.findByLabelText("Answer 1 option 2: Paris"));
    expect(screen.getByText(/1 of 2 answered/)).toBeTruthy();
    fireEvent.press(screen.getByText("Submit quiz"));
    // Still incomplete: the essay is blank. The server refuses this too
    // (409 attempt_incomplete) — the disabled control is the courtesy, the
    // server check is the rule.
    expect(post).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByLabelText("Answer 2"), "Because.");
    fireEvent.press(screen.getByText("Submit quiz"));
    // v1 asks first (ConfirmDialog); nothing is sent until "Submit".
    expect(await screen.findByText("Submit quiz?")).toBeTruthy();
    expect(screen.getByText("You can't change your answers after submitting.")).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText("Submit"));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/quizzes/41/attempt/submit"));
  });

  it("shows the graded result per question without ever seeing an answer key", async () => {
    get.mockResolvedValue({
      data: {
        data: detail({
          attemptId: 900,
          attemptNumber: 1,
          status: "GRADED",
          totalScore: 5,
          gradedAt: "2099-03-02T10:00:00.000Z",
          questions: [
            { ...mcq, selectedIndex: 0, isCorrect: false, pointsAwarded: 0 },
            { ...essay, text: "Because.", pointsAwarded: 5 },
          ],
        }),
      },
    });

    renderWithProviders(<QuizDetailScreen />);

    // The tile counts up; its accessibility label carries the final figure.
    expect(await screen.findByLabelText("Score: 5/7")).toBeTruthy();
    expect(screen.getByText("Score")).toBeTruthy();
    expect(screen.getByText("Your quiz has been graded.")).toBeTruthy();
    expect(screen.getByText("Q1")).toBeTruthy();
    expect(screen.getByText("Your answer: London")).toBeTruthy();
    expect(screen.getByText("5/5 pts")).toBeTruthy();
    // R34: the student is told which MCQ was wrong, and never what was right —
    // there is no correctIndex in the contract to render.
    expect(screen.getByText("Incorrect")).toBeTruthy();
    // Correctness is a word on every question, never colour alone: the essay says it is graded.
    expect(screen.getAllByText("Graded").length).toBeGreaterThanOrEqual(2);
  });

  it("says in words that an essay is still awaiting grading, and a correct MCQ is Correct", async () => {
    get.mockResolvedValue({
      data: {
        data: detail({
          attemptId: 900,
          attemptNumber: 1,
          status: "SUBMITTED",
          questions: [
            { ...mcq, selectedIndex: 1, isCorrect: true, pointsAwarded: 2 },
            { ...essay, text: "Because." },
          ],
        }),
      },
    });

    renderWithProviders(<QuizDetailScreen />);

    expect(await screen.findByText("Correct")).toBeTruthy();
    expect(screen.getByText("Awaiting grading")).toBeTruthy();
  });

  it("counts answered questions in the pinned bar's hint", async () => {
    get.mockResolvedValue({
      data: { data: detail({ attemptId: 900, attemptNumber: 1, status: "IN_PROGRESS" }) },
    });
    patch.mockResolvedValue({ data: { data: { saved: 1 } } });

    renderWithProviders(<QuizDetailScreen />);

    expect(await screen.findByText(/^0 of 2 answered/)).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Answer 1 option 2: Paris"));
    expect(screen.getByText(/^1 of 2 answered/)).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText("Answer 2"), "Because.");
    expect(screen.getByText(/^2 of 2 answered/)).toBeTruthy();
    // The bar is pinned in the screen's footer, not among the scrolled questions.
    expect(screen.getByTestId("save-bar")).toBeTruthy();
  });

  it("resumes an attempt with its saved answers restored", async () => {
    get.mockResolvedValue({
      data: {
        data: detail({
          attemptId: 900,
          attemptNumber: 1,
          status: "IN_PROGRESS",
          questions: [
            { ...mcq, selectedIndex: 1 },
            { ...essay, text: "Half done." },
          ],
        }),
      },
    });

    renderWithProviders(<QuizDetailScreen />);

    expect(await screen.findByText(/^2 of 2 answered/)).toBeTruthy();
    expect(screen.getByLabelText("Answer 1 option 2: Paris").props.accessibilityState.selected).toBe(true);
    expect(screen.getByLabelText("Answer 2").props.value).toBe("Half done.");
  });

  it("confirms the submission with a toast, not an inline note", async () => {
    get.mockResolvedValue({
      data: {
        data: detail({
          attemptId: 900,
          attemptNumber: 1,
          status: "IN_PROGRESS",
          questions: [
            { ...mcq, selectedIndex: 1 },
            { ...essay, text: "Done." },
          ],
        }),
      },
    });
    post.mockResolvedValue({
      data: { data: detail({ attemptId: 900, attemptNumber: 1, status: "SUBMITTED" }) },
    });

    renderWithProviders(<QuizDetailScreen />);
    fireEvent.press(await screen.findByText("Submit quiz"));
    fireEvent.press(await screen.findByText("Submit"));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Quiz submitted."));
  });

  it("tells a submitted student to wait rather than offering the form again", async () => {
    get.mockResolvedValue({
      data: {
        data: detail({ attemptId: 900, attemptNumber: 1, status: "SUBMITTED" }),
      },
    });

    renderWithProviders(<QuizDetailScreen />);

    // v1 shows the full result view for SUBMITTED, with a Pending badge.
    expect(await screen.findByText("Submitted")).toBeTruthy();
    expect(screen.getByText("Awaiting grading for the written answers.")).toBeTruthy();
    expect(screen.getByText("Pending")).toBeTruthy();
    expect(screen.getByText("Q1")).toBeTruthy();
    expect(screen.queryByText("Submit quiz")).toBeNull();
  });

  it("gives staff a read-only preview with a link to grading", async () => {
    useSessionStore.setState({
      user: {
        id: 5,
        name: "Test leader",
        email: "l@jpc.test",
        role: "LEADER" as const,
        avatarPath: null,
        hasPassword: true,
      },
      scopes: { seasonAdminIds: [], groupLeaderIds: [3], activeSeasonId: null, graduationYear: null },
    });
    get.mockResolvedValue({
      data: {
        data: {
          id: 41,
          title: "Week 1 quiz",
          kind: "ONLINE",
          seasonId: 7,
          seasonCode: "s26",
          sessionId: 12,
          sessionTitle: "Week 1",
          publishedAt: "2099-02-01T00:00:00.000Z",
          maxScore: 7,
          attemptCount: 2,
          gradeCount: 0,
          canEditStructure: false,
          canManage: false,
          resultsReleasedAt: null,
          canReleaseResults: true,
          questions: [
            {
              id: 100,
              order: 0,
              type: "MCQ",
              prompt: "Capital of France?",
              points: 2,
              options: ["London", "Paris"],
              correctIndex: 1,
            },
          ],
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

describe("quiz runner, read-only (a finished season)", () => {
  it("says You didn't take this quiz. with no Start on an untaken quiz", async () => {
    get.mockResolvedValue({ data: { data: detail({ readOnly: true }) } });
    renderWithProviders(<QuizDetailScreen />);
    expect(await screen.findByText("You didn't take this quiz.")).toBeTruthy();
    expect(screen.queryByText("Start quiz")).toBeNull();
    expect(put).not.toHaveBeenCalled();
  });

  it("does not offer to continue an attempt left in progress", async () => {
    get.mockResolvedValue({
      data: { data: detail({ readOnly: true, attemptId: 9, attemptNumber: 1, status: "IN_PROGRESS" }) },
    });
    renderWithProviders(<QuizDetailScreen />);
    expect(await screen.findByText("You didn't finish this quiz.")).toBeTruthy();
    expect(screen.queryByText("Submit")).toBeNull();
    expect(screen.queryByText("Start quiz")).toBeNull();
  });

  it("still shows the result of a graded quiz", async () => {
    get.mockResolvedValue({
      data: { data: detail({ readOnly: true, attemptId: 9, attemptNumber: 1, status: "GRADED", totalScore: 6 }) },
    });
    renderWithProviders(<QuizDetailScreen />);
    expect(await screen.findByText("Your quiz has been graded.")).toBeTruthy();
    expect(screen.getByText("Score")).toBeTruthy();
  });

  it("lets staff release held results after a confirm, and tells the student what is held", async () => {
    useSessionStore.setState({
      user: {
        id: 5,
        name: "Test admin",
        email: "a@jpc.test",
        role: "ADMIN" as const,
        avatarPath: null,
        hasPassword: true,
      },
      scopes: { seasonAdminIds: [7], groupLeaderIds: [], activeSeasonId: null, graduationYear: null },
    });
    get.mockResolvedValue({
      data: {
        data: {
          id: 41,
          title: "Week 1 quiz",
          kind: "ONLINE",
          seasonId: 7,
          seasonCode: "s26",
          sessionId: 12,
          sessionTitle: "Week 1",
          publishedAt: "2099-02-01T00:00:00.000Z",
          maxScore: 7,
          attemptCount: 2,
          gradeCount: 0,
          canEditStructure: false,
          canManage: true,
          resultsReleasedAt: null,
          canReleaseResults: true,
          questions: [
            {
              id: 100,
              order: 0,
              type: "MCQ",
              prompt: "Capital of France?",
              points: 2,
              options: ["London", "Paris"],
              correctIndex: 1,
            },
          ],
        },
      },
    });
    post.mockResolvedValue({ data: { data: { resultsReleasedAt: "2099-03-01T00:00:00.000Z" } } });

    renderWithProviders(<QuizDetailScreen />);
    fireEvent.press(await screen.findByText("Release results"));
    expect(post).not.toHaveBeenCalled();
    fireEvent.press((await screen.findAllByText("Release results")).at(-1)!);
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/quizzes/41/release"));
  });

  it("shows a student whose results are held no per-question verdicts", async () => {
    get.mockResolvedValue({
      data: {
        data: detail({
          attemptId: 900,
          attemptNumber: 1,
          status: "SUBMITTED",
          resultsReleased: false,
          totalScore: null,
          submittedAt: "2099-01-01T00:00:00.000Z",
        }),
      },
    });
    renderWithProviders(<QuizDetailScreen />);
    expect(
      await screen.findByText("Handed in. Your score will show here once your admin releases the results."),
    ).toBeTruthy();
    expect(screen.queryByText("Correct")).toBeNull();
    expect(screen.queryByText("Incorrect")).toBeNull();
  });
});
