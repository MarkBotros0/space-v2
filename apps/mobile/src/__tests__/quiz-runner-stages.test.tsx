import { fireEvent, screen } from "@testing-library/react-native";

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

describe("quiz runner, result stages", () => {
  it("graded: shows the score only, no questions and no answers", async () => {
    get.mockResolvedValue({
      data: {
        data: detail({
          attemptId: 900,
          attemptNumber: 1,
          status: "GRADED",
          totalScore: 5.5,
          gradedAt: "2099-03-02T10:00:00.000Z",
          questions: [],
        }),
      },
    });

    renderWithProviders(<QuizDetailScreen />);

    expect(await screen.findByLabelText("Score: 5.5 / 7")).toBeTruthy();
    expect(screen.getByText("Answers appear when your admin releases them.")).toBeTruthy();
    expect(screen.queryByText("Q1")).toBeNull();
    expect(screen.queryByText("Capital of France?")).toBeNull();
  });

  it("answers: shows the score and each question marked, with the key where it was missed", async () => {
    get.mockResolvedValue({
      data: {
        data: detail({
          attemptId: 900,
          attemptNumber: 1,
          status: "GRADED",
          stage: "answers",
          answersReleased: true,
          totalScore: 5,
          questions: [
            { ...mcq, answer: { optionId: 1001 }, review: { correctOptionIds: [1002] }, pointsAwarded: 0 },
            { ...essay, answer: { text: "Because." }, review: { correct: true }, pointsAwarded: 5 },
          ],
        }),
      },
    });

    renderWithProviders(<QuizDetailScreen />);

    expect(await screen.findByLabelText("Score: 5 / 7")).toBeTruthy();
    expect(screen.getByText("Capital of France?")).toBeTruthy();
    expect(screen.getByText("Your answer, wrong")).toBeTruthy();
    expect(screen.getByText("Correct answer")).toBeTruthy();
    expect(screen.getByText("0 / 2 pts")).toBeTruthy();
    expect(screen.getByText("5 / 5 pts")).toBeTruthy();
    expect(screen.getAllByText("Wrong").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Right").length).toBeGreaterThan(0);
  });

  it("answers: an essay given part of its points reads Partly right, never Wrong", async () => {
    get.mockResolvedValue({
      data: {
        data: detail({
          attemptId: 900,
          attemptNumber: 1,
          status: "GRADED",
          stage: "answers",
          answersReleased: true,
          totalScore: 2,
          questions: [{ ...essay, answer: { text: "Because." }, review: { correct: false }, pointsAwarded: 2 }],
        }),
      },
    });

    renderWithProviders(<QuizDetailScreen />);

    expect(await screen.findByText("2 / 5 pts")).toBeTruthy();
    expect(screen.getAllByText("Partly right").length).toBeGreaterThan(0);
    expect(screen.queryByText("Wrong")).toBeNull();
  });

  it("tells a submitted student to wait, with no questions and no score", async () => {
    get.mockResolvedValue({
      data: { data: detail({ attemptId: 900, attemptNumber: 1, status: "SUBMITTED", questions: [] }) },
    });

    renderWithProviders(<QuizDetailScreen />);

    expect(await screen.findByText("Submitted")).toBeTruthy();
    expect(screen.getByText("Your score appears once it's marked.")).toBeTruthy();
    expect(screen.queryByText("Score")).toBeNull();
    expect(screen.queryByText("Q1")).toBeNull();
    expect(screen.queryByText("Submit quiz")).toBeNull();
  });

  it("after a submit the result shows no question text, even though the attempt's questions are cached", async () => {
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
      data: { data: detail({ attemptId: 900, attemptNumber: 1, status: "SUBMITTED", questions: [] }) },
    });

    renderWithProviders(<QuizDetailScreen />);
    expect(await screen.findByText("Capital of France?")).toBeTruthy();
    fireEvent.press(screen.getByText("Submit quiz"));
    fireEvent.press(await screen.findByText("Submit"));

    expect(await screen.findByText("Your score appears once it's marked.")).toBeTruthy();
    expect(screen.queryByText("Capital of France?")).toBeNull();
    expect(screen.queryByText("Discuss.")).toBeNull();
    expect(screen.queryByText("Paris")).toBeNull();
  });
});
