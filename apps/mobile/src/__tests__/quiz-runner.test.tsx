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
  type: "SINGLE_CHOICE" as const,
  prompt: "Capital of France?",
  points: 2,
  options: [
    { id: 1001, label: "London" },
    { id: 1002, label: "Paris" },
  ],
  answer: { optionId: null as number | null },
  review: null,
  pointsAwarded: null,
};
const essay = {
  id: 101,
  order: 1,
  type: "ESSAY" as const,
  prompt: "Discuss.",
  points: 5,
  answer: { text: "" },
  review: null,
  pointsAwarded: null,
};

const STAGE_OF = { IN_PROGRESS: "in_progress", SUBMITTED: "submitted", GRADED: "graded" } as const;

function detail(over: Partial<Record<string, unknown>> = {}) {
  const status = over.status as keyof typeof STAGE_OF | null | undefined;
  const stage = (over.stage as string | undefined) ?? (status ? STAGE_OF[status] : "not_started");
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
    stage,
    totalScore: null,
    submittedAt: null,
    gradedAt: null,
    answersReleased: false,
    startsFrom: null,
    startsUntil: null,
    timeLimitMinutes: null,
    deadlineAt: null,
    serverNow: "2026-11-14T10:00:00.000Z",
    endReason: null,
    // The server sends questions only while the attempt is open; the start card counts them by questionCount.
    questionCount: 2,
    questions: stage === "in_progress" ? [mcq, essay] : [],
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
  it("counts the questions on the start card from questionCount, as none are sent yet (I1)", async () => {
    get.mockResolvedValue({ data: { data: detail() } });

    renderWithProviders(<QuizDetailScreen />);

    expect(await screen.findByText(/^2 questions · 7 points\./)).toBeTruthy();
  });

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
          { type: "SINGLE_CHOICE", questionId: 100, optionId: 1002 },
          { type: "ESSAY", questionId: 101, text: "Because of the river." },
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
            { ...mcq, answer: { optionId: 1002 } },
            { ...essay, answer: { text: "Because." } },
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
            { ...mcq, answer: { optionId: 1002 } },
            { ...essay, answer: { text: "Half done." } },
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
            { ...mcq, answer: { optionId: 1002 } },
            { ...essay, answer: { text: "Done." } },
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
          answersReleasedAt: null,
          canReleaseResults: true,
          shuffleQuestions: true,
          startsFrom: null,
          startsUntil: null,
          timeLimitMinutes: null,
          questions: [
            {
              id: 100,
              order: 0,
              type: "SINGLE_CHOICE",
              prompt: "Capital of France?",
              points: 2,
              options: [
                { id: 1, label: "London", isCorrect: false },
                { id: 2, label: "Paris", isCorrect: true },
              ],
            },
          ],
        },
      },
    });

    renderWithProviders(<QuizDetailScreen />);

    expect(await screen.findByText("Capital of France?")).toBeTruthy();
    // Staff DO see the key — that is the audience it exists for.
    expect(screen.getByText("Paris")).toBeTruthy();
    expect(screen.getByText("London")).toBeTruthy();
    // One mark, on the right option.
    expect(screen.getAllByText("Correct answer")).toHaveLength(1);
    expect(screen.getByLabelText("Paris, correct answer")).toBeTruthy();
    expect(screen.queryByText("Edit quiz")).toBeNull();
    fireEvent.press(screen.getByText("Grade this quiz"));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/quiz/[id]/grade",
      params: { id: "41" },
    });
  });
});
