import { act, screen } from "@testing-library/react-native";
import { onlineManager } from "@tanstack/react-query";
import { AppState, BackHandler, type AppStateStatus } from "react-native";

import { apiClient } from "../../lib/api-client";
import { useSessionStore } from "../../store/session";
import { resetCurrentAppState, setCurrentAppState } from "./app-state";
import { renderWithProviders } from "./render";
import QuizDetailScreen from "../../../app/(app)/quiz/[id]/index";

/*
 * The quiz exit tests' screen, fixtures and AppState / BackHandler harness. The test file mocks
 * api-client, secure-store, screen capture, keep awake, toaster and expo-router itself.
 */

export const get = apiClient.get as jest.Mock;
export const post = apiClient.post as jest.Mock;
export const EVENTS = "/api/v1/quizzes/41/attempt/events";
export const SERVER_NOW = "2026-11-14T10:00:00.000Z";
/** Within the first second after SERVER_NOW: the phone's own clock reads 09:55. */
export const ON_SERVER_CLOCK = expect.stringMatching(/^2026-11-14T10:00:00\.\d{3}Z$/);
export const TITLE = "You left the quiz";
export const BODY = "Leaving the quiz isn't allowed and has been recorded. Leaving again may end your attempt.";
export const ENDED =
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

export function detail(over: Partial<Record<string, unknown>> = {}) {
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
export const report = (exits: number, ended = false, status = "IN_PROGRESS") => ({
  data: { data: { exits, ended, status } },
});

type BackFn = Parameters<typeof BackHandler.addEventListener>[1];
let appListeners: ((s: AppStateStatus) => void)[] = [];
let backHandlers: BackFn[] = [];
/** The Android back handlers registered right now. */
export const backHandlersNow = () => backHandlers;
export const appState = (s: AppStateStatus) =>
  act(async () => {
    for (const fn of appListeners) fn(s);
    await jest.advanceTimersByTimeAsync(0);
  });
export const tick = (ms = 0) =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
export const eventPosts = () => post.mock.calls.filter(([url]) => url === EVENTS);
export const sentEvents = () => eventPosts().flatMap(([, body]) => body.events);

/** Call from beforeEach: fake timers, the phone five minutes slow, online, a student signed in. */
export function setUpExitHarness() {
  setCurrentAppState("active");
  jest.clearAllMocks();
  jest.useFakeTimers();
  // The phone runs five minutes slow: every time it sends is on the server's clock.
  jest.setSystemTime(Date.parse(SERVER_NOW) - 5 * 60_000);
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
}

export function tearDownExitHarness() {
  resetCurrentAppState();
  onlineManager.setOnline(true);
  jest.useRealTimers();
  jest.restoreAllMocks();
}

export async function openQuiz(over: Partial<Record<string, unknown>> = {}) {
  get.mockResolvedValue({ data: { data: detail(over) } });
  const view = renderWithProviders(<QuizDetailScreen />);
  await screen.findByText("Capital of France?");
  await tick();
  return view;
}
