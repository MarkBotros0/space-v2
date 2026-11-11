import { onlineManager } from "@tanstack/react-query";
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
import { renderStacked } from "./helpers/render";
import QuizDetailScreen from "../../app/(app)/quiz/[id]/index";

/* The countdown's zero never strands the student (docs/rules/quiz-integrity.md "Timing"). */

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;

const SERVER_NOW = "2026-11-14T10:00:00.000Z";
const serverMs = Date.parse(SERVER_NOW);
const isoAt = (deltaMs: number) => new Date(serverMs + deltaMs).toISOString();
const MINUTE = 60_000;

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
  const stage = (over.stage as string | undefined) ?? "in_progress";
  return {
    id: 41,
    title: "Timed quiz",
    kind: "ONLINE",
    seasonId: 7,
    maxScore: 2,
    sessionTitle: "Week 1",
    attemptId: 900,
    attemptNumber: 1,
    readOnly: false,
    status: stage === "in_progress" ? "IN_PROGRESS" : "SUBMITTED",
    stage,
    totalScore: null,
    submittedAt: null,
    gradedAt: null,
    answersReleased: false,
    startsFrom: null,
    startsUntil: null,
    timeLimitMinutes: 20,
    deadlineAt: isoAt(5_000),
    serverNow: SERVER_NOW,
    endReason: null,
    questionCount: 1,
    questions: stage === "in_progress" ? [mcq] : [],
    ...over,
  };
}
const submitted = () => detail({ stage: "submitted", endReason: "TIMED_OUT" });
const noNetwork = () => Object.assign(new Error("Network Error"), { isAxiosError: true, response: undefined });
const tick = (ms = 0) =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
const setOnline = (online: boolean) => act(() => onlineManager.setOnline(online));
const optionDisabled = () => screen.getByLabelText("Answer 1 option 2: Paris").props.accessibilityState?.disabled;

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  jest.setSystemTime(serverMs);
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState({
    user: { id: 9, name: "S", email: "s@jpc.test", role: "STUDENT", avatarPath: null, hasPassword: true },
    scopes: { seasonAdminIds: [], groupLeaderIds: [], activeSeasonId: 7, graduationYear: null },
  });
});

afterEach(() => {
  setOnline(true);
  jest.useRealTimers();
});

describe("quiz runner: time up", () => {
  it("a phone clock that jumps forward re-enables the form when the server still has time left", async () => {
    get.mockResolvedValueOnce({ data: { data: detail({ deadlineAt: isoAt(20 * MINUTE) }) } });
    // The server's clock: one second has passed, not twenty-one minutes.
    get.mockResolvedValue({ data: { data: detail({ deadlineAt: isoAt(20 * MINUTE), serverNow: isoAt(1_000) }) } });

    renderStacked(<QuizDetailScreen />);
    expect(await screen.findByText("20:00")).toBeTruthy();

    jest.setSystemTime(serverMs + 21 * MINUTE);
    await tick(1_000);

    expect(get).toHaveBeenCalledTimes(2);
    expect(await screen.findByText("19:59")).toBeTruthy();
    expect(optionDisabled()).toBeFalsy();
    expect(screen.queryByText(/Time's up/)).toBeNull();
    expect(toast.success).not.toHaveBeenCalled();

    // Re-armed: it keeps counting, and fires again at the real zero.
    await tick(1_000);
    expect(screen.getByText("19:58")).toBeTruthy();
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("offline at zero: locked with Check again, and recovers by itself once back online", async () => {
    get.mockResolvedValueOnce({ data: { data: detail() } });
    renderStacked(<QuizDetailScreen />);
    expect(await screen.findByText("0:05")).toBeTruthy();

    setOnline(false);
    await tick(5_000);

    expect(screen.getByText("Time's up. Couldn't confirm the submission yet.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Check again" })).toBeTruthy();
    expect(optionDisabled()).toBe(true);
    expect(get).toHaveBeenCalledTimes(1);

    get.mockResolvedValue({ data: { data: submitted() } });
    setOnline(true);
    await tick(10);

    expect(await screen.findByText("Submitted")).toBeTruthy();
    expect(toast.success).toHaveBeenCalledWith("Time's up. Your answers were submitted.");
    expect(post).not.toHaveBeenCalled();
  });

  it("reads that fail at zero offer Check again, which recovers once a read succeeds", async () => {
    get.mockResolvedValueOnce({ data: { data: detail() } });
    get.mockRejectedValue(noNetwork());
    renderStacked(<QuizDetailScreen />);
    expect(await screen.findByText("0:05")).toBeTruthy();

    await tick(5_000);
    await tick(4_100);
    expect(get).toHaveBeenCalledTimes(4);
    expect(await screen.findByText("Check again")).toBeTruthy();

    get.mockResolvedValue({ data: { data: submitted() } });
    fireEvent.press(screen.getByText("Check again"));
    await tick(10);

    expect(await screen.findByText("Submitted")).toBeTruthy();
  });

  it("a read still in progress past the deadline stays locked, with Check again", async () => {
    get.mockResolvedValueOnce({ data: { data: detail() } });
    get.mockResolvedValue({ data: { data: detail({ serverNow: isoAt(6_000) }) } });
    renderStacked(<QuizDetailScreen />);
    expect(await screen.findByText("0:05")).toBeTruthy();

    await tick(5_000);
    await tick(4_100);

    expect(await screen.findByText("Check again")).toBeTruthy();
    expect(optionDisabled()).toBe(true);
    expect(screen.queryByText(/Retry save/)).toBeNull();
  });
});
