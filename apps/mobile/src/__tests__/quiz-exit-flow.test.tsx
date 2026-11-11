import { act, fireEvent, screen } from "@testing-library/react-native";
import { onlineManager } from "@tanstack/react-query";
import { AppState, BackHandler, type AppStateStatus } from "react-native";

const mockStore = new Map<string, string>();
jest.mock("expo-secure-store", () => ({
  setItemAsync: jest.fn(async (k: string, v: string) => void mockStore.set(k, v)),
  getItemAsync: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  deleteItemAsync: jest.fn(async (k: string) => void mockStore.delete(k)),
}));
let mockShot: (() => void) | null = null;
jest.mock("expo-screen-capture", () => ({
  preventScreenCaptureAsync: jest.fn(async () => undefined),
  allowScreenCaptureAsync: jest.fn(async () => undefined),
  addScreenshotListener: (fn: () => void) => {
    mockShot = fn;
    return { remove: jest.fn() };
  },
}));
jest.mock("expo-keep-awake", () => ({
  activateKeepAwakeAsync: jest.fn(async () => undefined),
  deactivateKeepAwake: jest.fn(async () => undefined),
}));
jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), put: jest.fn(), patch: jest.fn(), post: jest.fn() },
}));
jest.mock("../design/ui/toaster", () => ({ toast: { success: jest.fn(), error: jest.fn() }, Toaster: () => null }));
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "41" }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import QuizDetailScreen from "../../app/(app)/quiz/[id]/index";

/* Leaving an open attempt: docs/superpowers/plans/2026-11-10-quiz-integrity.md Task 4. */

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;
const EVENTS = "/api/v1/quizzes/41/attempt/events";
const SERVER_NOW = "2026-11-14T10:00:00.000Z";
/** Within the first second after SERVER_NOW: the phone's own clock reads 09:55. */
const ON_SERVER_CLOCK = expect.stringMatching(/^2026-11-14T10:00:00\.\d{3}Z$/);
const TITLE = "You left the quiz";
const BODY = "Leaving the quiz isn't allowed and has been recorded. Leaving again may end your attempt.";
const ENDED =
  "Your attempt has ended because you left the quiz. Your answers were submitted. Ask your leader if this was a mistake.";

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
  return {
    id: 41,
    title: "Week 1 quiz",
    kind: "ONLINE",
    seasonId: 7,
    maxScore: 2,
    sessionTitle: "Week 1",
    attemptId: 900,
    attemptNumber: 1,
    readOnly: false,
    status: "IN_PROGRESS",
    stage: "in_progress",
    totalScore: null,
    submittedAt: null,
    gradedAt: null,
    answersReleased: false,
    startsFrom: null,
    startsUntil: null,
    timeLimitMinutes: null,
    deadlineAt: null,
    serverNow: SERVER_NOW,
    endReason: null,
    questionCount: 1,
    questions: [mcq],
    ...over,
  };
}
const report = (exits: number, ended = false, status = "IN_PROGRESS") => ({
  data: { data: { exits, ended, status } },
});

let appListeners: ((s: AppStateStatus) => void)[] = [];
type BackFn = Parameters<typeof BackHandler.addEventListener>[1];
let backHandlers: BackFn[] = [];
const appState = (s: AppStateStatus) =>
  act(async () => {
    for (const fn of appListeners) fn(s);
    await jest.advanceTimersByTimeAsync(0);
  });
const tick = (ms = 0) =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
const eventPosts = () => post.mock.calls.filter(([url]) => url === EVENTS);
const sentEvents = () => eventPosts().flatMap(([, body]) => body.events);

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  // The phone runs five minutes slow: every time it sends is on the server's clock.
  jest.setSystemTime(Date.parse(SERVER_NOW) - 5 * 60_000);
  mockStore.clear();
  mockShot = null;
  appListeners = [];
  backHandlers = [];
  onlineManager.setOnline(true);
  jest.spyOn(AppState, "addEventListener").mockImplementation((_type, fn) => {
    appListeners.push(fn as (s: AppStateStatus) => void);
    return { remove: () => (appListeners = appListeners.filter((f) => f !== fn)) };
  });
  jest.spyOn(BackHandler, "addEventListener").mockImplementation((_type, fn) => {
    backHandlers.push(fn);
    return { remove: () => (backHandlers = backHandlers.filter((f) => f !== fn)) };
  });
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState({
    user: { id: 9, name: "S", email: "s@jpc.test", role: "STUDENT", avatarPath: null, hasPassword: true },
    scopes: { seasonAdminIds: [], groupLeaderIds: [], activeSeasonId: 7, graduationYear: null },
  });
});

afterEach(() => {
  onlineManager.setOnline(true);
  jest.useRealTimers();
  jest.restoreAllMocks();
});

async function openQuiz(over: Partial<Record<string, unknown>> = {}) {
  get.mockResolvedValue({ data: { data: detail(over) } });
  const view = renderWithProviders(<QuizDetailScreen />);
  await screen.findByText("Capital of France?");
  await tick();
  return view;
}

describe("quiz exits", () => {
  it("background then active posts one EXIT and shows the warning", async () => {
    post.mockResolvedValue(report(1));
    await openQuiz();
    expect(eventPosts()).toHaveLength(0);

    await appState("inactive");
    await appState("background");
    await tick(20_000);
    await appState("active");

    expect(eventPosts()).toHaveLength(1);
    const [, body] = eventPosts()[0];
    expect(body.attemptId).toBe(900);
    expect(body.events).toEqual([expect.objectContaining({ kind: "EXIT" })]);
    // On the server's clock (the phone is five minutes slow), twenty seconds away.
    const { leftAt, returnedAt } = body.events[0];
    expect(Date.parse(leftAt) - Date.parse(SERVER_NOW)).toBeGreaterThanOrEqual(0);
    expect(Date.parse(leftAt) - Date.parse(SERVER_NOW)).toBeLessThan(1000);
    expect(Date.parse(returnedAt) - Date.parse(leftAt)).toBe(20_000);
    expect(await screen.findByText(TITLE)).toBeTruthy();
    expect(screen.getByText(BODY)).toBeTruthy();
    fireEvent.press(screen.getByText("Back to the quiz"));
    await tick();
    expect(screen.queryByText(TITLE)).toBeNull();
    expect(screen.getByText("Capital of France?")).toBeTruthy();
  });

  it("warning copy has no number in it", async () => {
    post.mockResolvedValue(report(2));
    await openQuiz();
    await appState("background");
    await appState("active");
    expect(await screen.findByText(TITLE)).toBeTruthy();
    expect(screen.getByText(BODY)).toBeTruthy();
    expect(`${TITLE} ${BODY} Back to the quiz`).not.toMatch(/\d/);
  });

  it("a peek at the shade (inactive alone) is not an exit", async () => {
    await openQuiz();
    await appState("inactive");
    await appState("active");
    expect(eventPosts()).toHaveLength(0);
    expect(screen.queryByText(TITLE)).toBeNull();
  });

  it("queued exit is sent once on reconnect", async () => {
    post.mockRejectedValueOnce(Object.assign(new Error("Network Error"), { isAxiosError: true }));
    post.mockResolvedValue(report(1));
    await openQuiz();
    await appState("background");
    await appState("active");
    // The report failed, the warning still shows; the exit waits in secure storage.
    expect(await screen.findByText(TITLE)).toBeTruthy();
    expect(JSON.parse(mockStore.get("quiz-exit-queue.900") ?? "[]")).toHaveLength(1);

    await act(async () => onlineManager.setOnline(false));
    await act(async () => onlineManager.setOnline(true));
    await tick();
    await act(async () => onlineManager.setOnline(false));
    await act(async () => onlineManager.setOnline(true));
    await tick();

    expect(eventPosts()).toHaveLength(2);
    const ids = sentEvents().map((e: { clientEventId: string }) => e.clientEventId);
    expect(new Set(ids).size).toBe(1);
    expect(mockStore.has("quiz-exit-queue.900")).toBe(false);
  });

  it("an exit while offline isn't sent until the phone is back online", async () => {
    post.mockResolvedValue(report(1));
    await openQuiz();
    await act(async () => onlineManager.setOnline(false));
    await appState("background");
    await appState("active");
    expect(await screen.findByText(TITLE)).toBeTruthy();
    expect(eventPosts()).toHaveLength(0);
    await act(async () => onlineManager.setOnline(true));
    await tick();
    expect(eventPosts()).toHaveLength(1);
  });

  it("ended response moves to the ended result", async () => {
    await openQuiz();
    get.mockResolvedValue({
      data: { data: detail({ stage: "submitted", status: "SUBMITTED", endReason: "ENDED_BY_EXITS", questions: [] }) },
    });
    post.mockResolvedValue(report(3, true, "SUBMITTED"));
    await appState("background");
    await appState("active");

    expect(await screen.findByText(ENDED)).toBeTruthy();
    expect(screen.getByText("Submitted")).toBeTruthy();
    expect(screen.queryByText(TITLE)).toBeNull();
    // The leak rule holds: no question on the result.
    expect(screen.queryByText("Capital of France?")).toBeNull();
    // A finished attempt keeps nothing on the phone.
    await tick();
    expect([...mockStore.keys()].filter((k) => k.endsWith(".900"))).toEqual([]);
  });

  it("cold start with an open attempt records one relaunch exit", async () => {
    mockStore.set("quiz-open.902", "1");
    post.mockResolvedValue(report(1));
    const view = await openQuiz({ attemptId: 902 });

    expect(eventPosts()).toHaveLength(1);
    expect(sentEvents()).toEqual([
      expect.objectContaining({ kind: "RELAUNCH", leftAt: ON_SERVER_CLOCK, returnedAt: ON_SERVER_CLOCK }),
    ]);
    expect(await screen.findByText(TITLE)).toBeTruthy();

    // Opening it again in the same run is not a relaunch.
    view.unmount();
    await openQuiz({ attemptId: 902 });
    expect(eventPosts()).toHaveLength(1);
  });

  it("a leave the last run never came back from is one relaunch from when they left", async () => {
    mockStore.set("quiz-open.903", "1");
    mockStore.set("quiz-exit-left.903", "2026-11-14T09:58:00.000Z");
    post.mockResolvedValue(report(2));
    await openQuiz({ attemptId: 903 });
    expect(sentEvents()).toEqual([
      expect.objectContaining({ kind: "RELAUNCH", leftAt: "2026-11-14T09:58:00.000Z", returnedAt: ON_SERVER_CLOCK }),
    ]);
    expect(mockStore.has("quiz-exit-left.903")).toBe(false);
  });

  it("a fresh attempt is marked open and counts nothing on its first mount", async () => {
    await openQuiz({ attemptId: 904 });
    expect(eventPosts()).toHaveLength(0);
    expect(mockStore.get("quiz-open.904")).toBe("1");
    expect(mockStore.get("quiz-exit-current")).toBe("904");
  });

  it("a screenshot is logged, never warned", async () => {
    post.mockResolvedValue(report(0));
    await openQuiz({ attemptId: 905 });
    await act(async () => mockShot?.());
    await tick();
    expect(sentEvents()).toEqual([expect.objectContaining({ kind: "SCREENSHOT", returnedAt: null })]);
    expect(screen.queryByText(TITLE)).toBeNull();
  });

  it("Android back does nothing while the attempt is open", async () => {
    await openQuiz({ attemptId: 906 });
    expect(backHandlers.length).toBeGreaterThan(0);
    expect(backHandlers.every((fn) => fn({} as never) === true)).toBe(true);
  });

  it("nothing is counted on a reopened timed attempt not started yet", async () => {
    get.mockResolvedValue({
      data: { data: detail({ attemptId: 907, attemptNumber: 2, timeLimitMinutes: 20, questions: [] }) },
    });
    renderWithProviders(<QuizDetailScreen />);
    expect(await screen.findByText("Start quiz · 20 minutes")).toBeTruthy();
    await appState("background");
    await appState("active");
    expect(eventPosts()).toHaveLength(0);
    expect(mockStore.has("quiz-open.907")).toBe(false);
    expect(backHandlers).toHaveLength(0);
  });
});
