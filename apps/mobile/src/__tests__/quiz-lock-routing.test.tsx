import { router } from "expo-router";
import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";

// The relaunch lock (spec "Relaunch") and the screen before starting (spec "Before you start"),
// walked through the real navigators with the real quiz route over the route tree from disk.

jest.mock("expo-secure-store", () => {
  const store = new Map<string, string>();
  return {
    __store: store,
    getItemAsync: jest.fn(async (k: string) => store.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => void store.set(k, v)),
    deleteItemAsync: jest.fn(async (k: string) => void store.delete(k)),
  };
});
jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), put: jest.fn(), patch: jest.fn(), post: jest.fn() },
}));
jest.mock("../hooks/use-notifications", () => ({
  useUnreadCount: () => ({ data: 0 }),
  useNotifications: () => ({ data: { pages: [{ items: [] }] } }),
  useMarkRead: () => ({ mutate: () => {}, isPending: false }),
  flattenNotifications: () => [],
}));

import * as SecureStore from "expo-secure-store";

import { apiClient } from "../lib/api-client";
import { restoreQuizLock, useQuizLockStore } from "../store/quiz-lock";
import { useSessionStore } from "../store/session";
import { appContext, appRouteNames, muteTabsAnchorWarning, type NavState } from "./helpers/router-context";
import { makeScopes, makeUser } from "./helpers/session";

muteTabsAnchorWarning();

const get = apiClient.get as jest.Mock;
const put = apiClient.put as jest.Mock;
const secure = (SecureStore as unknown as { __store: Map<string, string> }).__store;

const SERVER_NOW = new Date().toISOString();

function detail(over: Partial<Record<string, unknown>> = {}) {
  const stage = (over.stage as string | undefined) ?? "not_started";
  return {
    id: 41,
    title: "Week 1 quiz",
    kind: "ONLINE",
    seasonId: 7,
    maxScore: 2,
    sessionTitle: null,
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
    questions:
      stage === "in_progress"
        ? [
            {
              id: 100,
              order: 0,
              type: "SINGLE_CHOICE",
              prompt: "Capital of France?",
              points: 2,
              options: [
                { id: 1001, label: "London" },
                { id: 1002, label: "Paris" },
              ],
              answer: { optionId: null },
              review: null,
              pointsAwarded: null,
            },
          ]
        : [],
    ...over,
  };
}
const inProgress = (over: Partial<Record<string, unknown>> = {}) =>
  detail({
    stage: "in_progress",
    status: "IN_PROGRESS",
    attemptId: 900,
    attemptNumber: 1,
    deadlineAt: new Date(Date.now() + 20 * 60_000).toISOString(),
    ...over,
  });

/** GET answers by URL: the open attempt, and quiz 41's detail. */
function serve(open: { quizId: number | null } | Error, quiz: unknown = inProgress()) {
  get.mockImplementation(async (url: string) => {
    if (url === "/api/v1/me/open-quiz-attempt") {
      if (open instanceof Error) throw open;
      return { data: { data: open } };
    }
    if (url === "/api/v1/quizzes/41") return { data: { data: quiz } };
    return { data: { data: null } };
  });
}

/** The route tree from disk, with app/index.tsx and the real quiz screen in place of their stubs. */
function context() {
  return {
    ...appContext(),
    index: require("../../app/index"),
    "(app)/quiz/[id]/index": require("../../app/(app)/quiz/[id]/index"),
  };
}

type Rendered = Awaited<ReturnType<typeof renderRouter>>;
const stack = (result: Rendered) => appRouteNames(result.getRouterState() as NavState);

beforeEach(() => {
  jest.clearAllMocks();
  secure.clear();
  useSessionStore.getState().clear();
  useSessionStore.getState().setSession(makeUser("STUDENT"), makeScopes());
});

describe("launch", () => {
  it("launch with an open attempt lands on the quiz", async () => {
    serve({ quizId: 41 });
    const result = await renderRouter(context(), { initialUrl: "/" });

    expect(await screen.findByText("Capital of France?")).toBeTruthy();
    expect(result.getPathname()).toBe("/quiz/41");
    expect(stack(result)).toEqual(["(tabs)", "quiz/[id]/index"]);
    expect(secure.get("quiz-route-lock")).toBe("41");
  });

  it("offline at launch, the last known open attempt still holds", async () => {
    secure.set("quiz-route-lock", "41");
    await restoreQuizLock();
    serve(new Error("Network Error"));
    const result = await renderRouter(context(), { initialUrl: "/" });

    expect(await screen.findByText("Capital of France?")).toBeTruthy();
    expect(result.getPathname()).toBe("/quiz/41");
    expect(useQuizLockStore.getState().lockedQuizId).toBe(41);
  });

  it("with nothing open, launch goes Home", async () => {
    serve({ quizId: null }, detail());
    const result = await renderRouter(context(), { initialUrl: "/" });
    await waitFor(() => expect(result.getPathname()).toBe("/dashboard"));
    expect(useQuizLockStore.getState().lockedQuizId).toBeNull();
  });

  it("staff are never held", async () => {
    useSessionStore.getState().setSession(makeUser("LEADER"), makeScopes());
    useQuizLockStore.setState({ lockedQuizId: 41 });
    serve({ quizId: 41 });
    const result = await renderRouter(context(), { initialUrl: "/" });
    await waitFor(() => expect(result.getPathname()).toBe("/dashboard"));
    expect(get).not.toHaveBeenCalledWith("/api/v1/me/open-quiz-attempt");
  });
});

describe("the guard", () => {
  it("guard redirects any route while an attempt is open", async () => {
    serve({ quizId: 41 });
    // A deep link (a notification tap) to somewhere else lands on the quiz.
    const result = await renderRouter(context(), { initialUrl: "/season" });
    expect(await screen.findByText("Capital of France?")).toBeTruthy();
    expect(result.getPathname()).toBe("/quiz/41");

    // Pushing anything from the quiz comes straight back to the one quiz screen.
    await act(() => router.push("/notifications"));
    await waitFor(() => expect(result.getPathname()).toBe("/quiz/41"));
    expect(stack(result)).toEqual(["(tabs)", "quiz/[id]/index"]);

    // A tab too, and another quiz.
    await act(() => router.push("/calendar"));
    await waitFor(() => expect(result.getPathname()).toBe("/quiz/41"));
    await act(() => router.push("/quiz/42"));
    await waitFor(() => expect(result.getPathname()).toBe("/quiz/41"));
    expect(screen.queryByText("Back")).toBeNull();
  });

  it("after submit the guard lifts", async () => {
    useQuizLockStore.setState({ lockedQuizId: 41 });
    // The server and the quiz's own read both say it was handed in.
    serve({ quizId: null }, detail({ stage: "submitted", status: "SUBMITTED", attemptId: 900, attemptNumber: 1 }));
    const result = await renderRouter(context(), { initialUrl: "/quiz/41" });

    await waitFor(() => expect(useQuizLockStore.getState().lockedQuizId).toBeNull());
    expect(secure.has("quiz-route-lock")).toBe(false);
    await act(() => router.push("/notifications"));
    expect(await screen.findByText("screen:/notifications")).toBeTruthy();
    expect(result.getPathname()).toBe("/notifications");
  });

  it("the quiz's own read of a submitted attempt lifts it even when the server read is stale", async () => {
    useQuizLockStore.setState({ lockedQuizId: 41 });
    serve(new Error("Network Error"), detail({ stage: "submitted", status: "SUBMITTED", attemptId: 900 }));
    await renderRouter(context(), { initialUrl: "/quiz/41" });
    await waitFor(() => expect(useQuizLockStore.getState().lockedQuizId).toBeNull());
  });

  it("sign-out releases the hold", async () => {
    useQuizLockStore.getState().setLockedQuiz(41);
    await waitFor(() => expect(secure.get("quiz-route-lock")).toBe("41"));
    useSessionStore.getState().clear();
    expect(useQuizLockStore.getState().lockedQuizId).toBeNull();
    await waitFor(() => expect(secure.has("quiz-route-lock")).toBe(false));
  });
});

describe("before you start", () => {
  it("before-you-start shows the limit and starts on I'm ready", async () => {
    serve({ quizId: null }, detail());
    put.mockResolvedValue({ data: { data: inProgress() } });
    await renderRouter(context(), { initialUrl: "/quiz/41" });

    expect(await screen.findByText("Before you start")).toBeTruthy();
    expect(
      screen.getByText(
        "You have 20 minutes from when you start. When time runs out, your saved answers are submitted.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Turn on Do Not Disturb or Focus.")).toBeTruthy();
    expect(screen.getByText("Leaving the quiz is recorded. Leaving more than twice ends your attempt.")).toBeTruthy();
    expect(screen.getByText("Screenshots are blocked.")).toBeTruthy();
    expect(put).not.toHaveBeenCalled();

    fireEvent.press(screen.getByText("I'm ready"));
    await waitFor(() => expect(put).toHaveBeenCalledWith("/api/v1/quizzes/41/attempt"));
    expect(await screen.findByText("Capital of France?")).toBeTruthy();
    // Started: now the student is held on it.
    await waitFor(() => expect(useQuizLockStore.getState().lockedQuizId).toBe(41));
  });

  it("an untimed quiz says it has no time limit", async () => {
    serve({ quizId: null }, detail({ timeLimitMinutes: null }));
    await renderRouter(context(), { initialUrl: "/quiz/41" });
    expect(await screen.findByText("No time limit.")).toBeTruthy();
  });

  it("a reopened timed attempt awaiting its start is held there, with no way back", async () => {
    serve({ quizId: 41 }, inProgress({ attemptNumber: 2, deadlineAt: null }));
    const result = await renderRouter(context(), { initialUrl: "/" });

    expect(await screen.findByText("Before you start")).toBeTruthy();
    expect(result.getPathname()).toBe("/quiz/41");
    expect(screen.getByText("I'm ready")).toBeTruthy();
    expect(useQuizLockStore.getState().lockedQuizId).toBe(41);
    await act(() => router.push("/notifications"));
    await waitFor(() => expect(result.getPathname()).toBe("/quiz/41"));
  });
});
