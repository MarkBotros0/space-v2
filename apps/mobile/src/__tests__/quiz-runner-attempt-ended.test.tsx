import { act, fireEvent, screen } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), put: jest.fn(), patch: jest.fn(), post: jest.fn() },
}));
jest.mock("../design/ui/toaster", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
  Toaster: () => null,
}));
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "41" }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

import { toast } from "../design/ui/toaster";
import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import QuizDetailScreen from "../../app/(app)/quiz/[id]/index";

/* The attempt ended somewhere else (staff End, or the server timed it out): docs/rules/quiz-integrity.md "Timing". */

const get = apiClient.get as jest.Mock;
const patch = apiClient.patch as jest.Mock;
const post = apiClient.post as jest.Mock;

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

function detail(over: Partial<Record<string, unknown>> = {}) {
  const stage = (over.stage as string | undefined) ?? "not_started";
  return {
    id: 41,
    title: "Untimed quiz",
    kind: "ONLINE",
    seasonId: 7,
    maxScore: 2,
    sessionTitle: "Week 1",
    attemptId: 900,
    attemptNumber: 1,
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
    questionCount: 1,
    questions: stage === "in_progress" ? [mcq] : [],
    ...over,
  };
}
const inProgress = (over: Partial<Record<string, unknown>> = {}) =>
  detail({ stage: "in_progress", status: "IN_PROGRESS", ...over });
const submitted = () => detail({ stage: "submitted", status: "SUBMITTED", endReason: "ENDED_BY_STAFF" });
const conflict = (code: string, message: string) =>
  Object.assign(new Error("409"), {
    isAxiosError: true,
    response: { status: 409, data: { error: { code, message } } },
  });
const tick = (ms = 0) =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState({
    user: { id: 9, name: "S", email: "s@jpc.test", role: "STUDENT", avatarPath: null, hasPassword: true },
    scopes: { seasonAdminIds: [], groupLeaderIds: [], activeSeasonId: 7, graduationYear: null },
  });
});

afterEach(() => {
  jest.useRealTimers();
});

describe("quiz runner: the attempt ended elsewhere", () => {
  it("a save answered attempt_closed moves an untimed quiz to the result, says so, and stops saving", async () => {
    get.mockResolvedValueOnce({ data: { data: inProgress() } });
    get.mockResolvedValue({ data: { data: submitted() } });
    patch.mockRejectedValue(conflict("attempt_closed", "This attempt is closed."));

    renderWithProviders(<QuizDetailScreen />);
    fireEvent.press(await screen.findByLabelText("Answer 1 option 2: Paris"));
    await tick(1000);

    expect(await screen.findByText("Submitted")).toBeTruthy();
    expect(get).toHaveBeenCalledTimes(2);
    expect(toast.error).toHaveBeenCalledWith("This attempt has ended.");
    expect(screen.queryByText("Retry save")).toBeNull();
    await tick(5000);
    expect(patch).toHaveBeenCalledTimes(1);
  });

  it("a submit answered attempt_closed moves to the result too", async () => {
    get.mockResolvedValueOnce({ data: { data: inProgress({ questions: [{ ...mcq, answer: { optionId: 1002 } }] }) } });
    get.mockResolvedValue({ data: { data: submitted() } });
    post.mockRejectedValue(conflict("attempt_closed", "This attempt is closed."));

    renderWithProviders(<QuizDetailScreen />);
    fireEvent.press(await screen.findByText("Submit quiz"));
    fireEvent.press(await screen.findByText("Submit"));

    expect(await screen.findByText("Submitted")).toBeTruthy();
    expect(toast.error).toHaveBeenCalledWith("This attempt has ended.");
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  it("a save answered attempt_not_started goes back to the start card", async () => {
    get.mockResolvedValueOnce({ data: { data: inProgress() } });
    // Reopened timed attempt, not started yet: IN_PROGRESS with no deadline.
    get.mockResolvedValue({ data: { data: inProgress({ attemptNumber: 2, timeLimitMinutes: 20 }) } });
    patch.mockRejectedValue(conflict("attempt_not_started", "Start the attempt first."));

    renderWithProviders(<QuizDetailScreen />);
    fireEvent.press(await screen.findByLabelText("Answer 1 option 2: Paris"));
    await tick(1000);

    expect(await screen.findByText("Start quiz · 20 minutes")).toBeTruthy();
    expect(toast.error).not.toHaveBeenCalled();
    expect(patch).toHaveBeenCalledTimes(1);
  });
});
