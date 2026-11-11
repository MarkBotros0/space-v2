import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";

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
import { formatSessionTime } from "../lib/format";
import { useSessionStore } from "../store/session";
import { renderStacked } from "./helpers/render";
import QuizDetailScreen from "../../app/(app)/quiz/[id]/index";

const get = apiClient.get as jest.Mock;
const put = apiClient.put as jest.Mock;
const patch = apiClient.patch as jest.Mock;
const post = apiClient.post as jest.Mock;

const SERVER_NOW = "2026-11-14T10:00:00.000Z";
const serverMs = Date.parse(SERVER_NOW);
const isoAt = (deltaMs: number) => new Date(serverMs + deltaMs).toISOString();

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
    title: "Timed quiz",
    kind: "ONLINE",
    seasonId: 7,
    maxScore: 2,
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
    timeLimitMinutes: 20,
    deadlineAt: null,
    serverNow: SERVER_NOW,
    endReason: null,
    questionCount: 1,
    questions: stage === "in_progress" ? [mcq] : [],
    ...over,
  };
}
const inProgress = (over: Partial<Record<string, unknown>> = {}) =>
  detail({ stage: "in_progress", status: "IN_PROGRESS", attemptId: 900, attemptNumber: 1, ...over });

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  // The phone's clock agrees with the server's; quiz-countdown.test.ts covers one that doesn't.
  jest.setSystemTime(serverMs);
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState({
    user: { id: 9, name: "S", email: "s@jpc.test", role: "STUDENT", avatarPath: null, hasPassword: true },
    scopes: { seasonAdminIds: [], groupLeaderIds: [], activeSeasonId: 7, graduationYear: null },
  });
});

afterEach(() => {
  jest.useRealTimers();
});

describe("quiz runner: start window and time limit", () => {
  it("locked before window shows the opening time", async () => {
    const from = isoAt(60 * 60_000);
    get.mockResolvedValue({ data: { data: detail({ startsFrom: from }) } });

    renderStacked(<QuizDetailScreen />);

    const button = await screen.findByRole("button", { name: `Opens at ${formatSessionTime(from)}` });
    expect(button.props.accessibilityState?.disabled).toBe(true);
    fireEvent.press(button);
    expect(put).not.toHaveBeenCalled();
  });

  it("opens by itself when the window's start arrives", async () => {
    get.mockResolvedValue({ data: { data: detail({ startsFrom: isoAt(2_000) }) } });

    renderStacked(<QuizDetailScreen />);
    expect(await screen.findByText(/^Opens at /)).toBeTruthy();
    act(() => jest.advanceTimersByTime(2_500));
    expect(screen.getByText("I'm ready")).toBeTruthy();
  });

  it("says when starting closed, and offers no start", async () => {
    const until = isoAt(-60_000);
    get.mockResolvedValue({ data: { data: detail({ startsUntil: until }) } });

    renderStacked(<QuizDetailScreen />);

    const button = await screen.findByRole("button", { name: `Starting closed at ${formatSessionTime(until)}` });
    expect(button.props.accessibilityState?.disabled).toBe(true);
  });

  it("names the time limit before the start", async () => {
    get.mockResolvedValue({ data: { data: detail() } });
    renderStacked(<QuizDetailScreen />);
    expect(
      await screen.findByText(
        "You have 20 minutes from when you start. When time runs out, your saved answers are submitted.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("I'm ready")).toBeTruthy();
  });

  it("a reopened timed attempt shows before-you-start, even after the window, and starts the clock on the tap", async () => {
    // Reopened: IN_PROGRESS with no deadline until the student taps start (controller ruling).
    get.mockResolvedValue({ data: { data: inProgress({ attemptNumber: 2, startsUntil: isoAt(-60_000) }) } });
    put.mockResolvedValue({ data: { data: inProgress({ attemptNumber: 2, deadlineAt: isoAt(20 * 60_000) }) } });

    renderStacked(<QuizDetailScreen />);

    fireEvent.press(await screen.findByText("I'm ready"));
    await waitFor(() => expect(put).toHaveBeenCalledWith("/api/v1/quizzes/41/attempt"));
    expect(await screen.findByText("Capital of France?")).toBeTruthy();
    expect(screen.getByText("20:00")).toBeTruthy();
  });

  it("counts down in the pinned bar, and turns bad under a minute", async () => {
    get.mockResolvedValue({ data: { data: inProgress({ deadlineAt: isoAt(61_000) }) } });

    renderStacked(<QuizDetailScreen />);

    expect(await screen.findByText("1:01")).toBeTruthy();
    expect(screen.getByTestId("quiz-countdown").props.accessibilityLabel).toBe("2 minutes left");
    act(() => jest.advanceTimersByTime(2_000));
    expect(screen.getByText("0:59")).toBeTruthy();
    expect(screen.getByTestId("quiz-countdown").props.accessibilityLabel).toBe("Less than a minute left");
  });

  it("at zero submits and shows the submitted stage", async () => {
    get.mockResolvedValueOnce({ data: { data: inProgress({ deadlineAt: isoAt(5_000) }) } });
    // The GET after the deadline is the one that closes the attempt on the server.
    get.mockResolvedValue({
      data: { data: detail({ stage: "submitted", status: "SUBMITTED", attemptId: 900, endReason: "TIMED_OUT" }) },
    });
    patch.mockResolvedValue({ data: { data: { saved: 1 } } });

    renderStacked(<QuizDetailScreen />);

    // An answer still inside the save debounce when time runs out goes out first.
    fireEvent.press(await screen.findByText("Paris"));
    act(() => jest.advanceTimersByTime(500));
    expect(patch).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(5_000);
    });

    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    expect(patch).toHaveBeenCalledTimes(1);
    expect(patch.mock.invocationCallOrder[0]).toBeLessThan(get.mock.invocationCallOrder[1]!);
    expect(await screen.findByText("Submitted")).toBeTruthy();
    expect(toast.success).toHaveBeenCalledWith("Time's up. Your answers were submitted.");
    expect(post).not.toHaveBeenCalled();
  });
});
