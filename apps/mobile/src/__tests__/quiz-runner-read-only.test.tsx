import { fireEvent, screen, waitFor } from "@testing-library/react-native";

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

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import QuizDetailScreen from "../../app/(app)/quiz/[id]/index";

const get = apiClient.get as jest.Mock;
const put = apiClient.put as jest.Mock;
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
    stage: "not_started",
    totalScore: null,
    submittedAt: null,
    gradedAt: null,
    answersReleased: false,
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
      data: {
        data: detail({ readOnly: true, attemptId: 9, attemptNumber: 1, status: "IN_PROGRESS", stage: "in_progress" }),
      },
    });
    renderWithProviders(<QuizDetailScreen />);
    expect(await screen.findByText("You didn't finish this quiz.")).toBeTruthy();
    expect(screen.queryByText("Submit")).toBeNull();
    expect(screen.queryByText("Start quiz")).toBeNull();
  });

  it("still shows the result of a graded quiz", async () => {
    get.mockResolvedValue({
      data: {
        data: detail({
          readOnly: true,
          attemptId: 9,
          attemptNumber: 1,
          status: "GRADED",
          stage: "graded",
          totalScore: 6,
          questions: [],
        }),
      },
    });
    renderWithProviders(<QuizDetailScreen />);
    expect(await screen.findByText("Answers appear when your admin releases them.")).toBeTruthy();
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
          answersReleasedAt: null,
          canReleaseResults: true,
          shuffleQuestions: true,
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
    post.mockResolvedValue({ data: { data: { resultsReleasedAt: "2099-03-01T00:00:00.000Z" } } });

    renderWithProviders(<QuizDetailScreen />);
    fireEvent.press(await screen.findByText("Release results"));
    expect(post).not.toHaveBeenCalled();
    fireEvent.press((await screen.findAllByText("Release results")).at(-1)!);
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/quizzes/41/release"));
  });

  it("shows a submitted student no verdicts and no questions", async () => {
    get.mockResolvedValue({
      data: {
        data: detail({
          attemptId: 900,
          attemptNumber: 1,
          status: "SUBMITTED",
          stage: "submitted",
          submittedAt: "2099-01-01T00:00:00.000Z",
          questions: [],
        }),
      },
    });
    renderWithProviders(<QuizDetailScreen />);
    expect(await screen.findByText("Your score appears once it's marked.")).toBeTruthy();
    expect(screen.queryByText("Right")).toBeNull();
    expect(screen.queryByText("Wrong")).toBeNull();
  });
});
