import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { AppState } from "react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
}));
jest.mock("../design/ui/toaster", () => ({ toast: { success: jest.fn(), error: jest.fn() }, Toaster: () => null }));
const mockPush = jest.fn();
// useFocusEffect runs its effect on mount and cleans up on unmount (= blur).
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "41" }),
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  useFocusEffect: (effect: () => void | (() => void)) => require("react").useEffect(effect, [effect]),
}));

import { QUIZ_LIVE_POLL_MS } from "../hooks/use-quizzes";
import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderStacked } from "./helpers/render";
import QuizDetailScreen from "../../app/(app)/quiz/[id]/index";
import QuizLiveRoute from "../../app/(app)/quiz/[id]/live";
import { expectQuietSuccess } from "./helpers/quiet-success";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;

const LIVE_URL = "/api/v1/quizzes/41/live";

function live() {
  const serverNow = new Date().toISOString();
  return {
    quizId: 41,
    title: "Week 1 quiz",
    kind: "ONLINE",
    published: true,
    timeLimitMinutes: 20,
    serverNow,
    rows: [
      {
        studentUserId: 10,
        studentName: "Second student",
        groupName: "Group A",
        state: "in_progress",
        deadlineAt: new Date(Date.parse(serverNow) + 12.5 * 60_000).toISOString(),
        exits: 1,
        lastExitAt: serverNow,
      },
      {
        studentUserId: 11,
        studentName: "Third student",
        groupName: "Group A",
        state: "not_started",
        deadlineAt: null,
        exits: 0,
        lastExitAt: null,
      },
      {
        studentUserId: 12,
        studentName: "Fourth student",
        groupName: "Group B",
        state: "graded",
        deadlineAt: null,
        exits: 0,
        lastExitAt: null,
      },
    ],
  };
}

const liveReads = () => get.mock.calls.filter(([url]) => url === LIVE_URL).length;

let appStateHandler: ((s: string) => void) | null = null;

beforeEach(() => {
  jest.clearAllMocks();
  appStateHandler = null;
  jest.spyOn(AppState, "addEventListener").mockImplementation(((_: string, cb: (s: string) => void) => {
    appStateHandler = cb;
    return { remove: jest.fn() };
  }) as never);
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState({
    user: { id: 5, name: "L", email: "l@jpc.test", role: "LEADER", avatarPath: null, hasPassword: true },
    scopes: { seasonAdminIds: [], groupLeaderIds: [3], activeSeasonId: null, graduationYear: null },
  });
  get.mockImplementation((url: string) =>
    url === LIVE_URL ? Promise.resolve({ data: { data: live() } }) : Promise.reject(new Error(url)),
  );
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("live quiz screen", () => {
  it("shows the summary and where every student is", async () => {
    renderStacked(<QuizLiveRoute />);
    expect(await screen.findByText("Second student")).toBeTruthy();
    expect(screen.getByLabelText("In progress: 1")).toBeTruthy();
    expect(screen.getByLabelText("Not started: 1")).toBeTruthy();
    expect(screen.getByLabelText("Finished: 1")).toBeTruthy();
    expect(screen.getByText(/1[23]:\d\d left · 1 exit/)).toBeTruthy();
    expect(screen.getByText("Hasn't started")).toBeTruthy();
    // The row speaks whole minutes; the per-second text is for the eye only.
    expect(screen.getByLabelText(/^Second student, 1[23] minutes left, 1 exit, In progress$/)).toBeTruthy();
  });

  it("re-reads at once when the app comes back after more than a poll", async () => {
    jest.useFakeTimers();
    renderStacked(<QuizLiveRoute />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(liveReads()).toBe(1);

    act(() => appStateHandler?.("background"));
    await act(async () => {
      jest.advanceTimersByTime(QUIZ_LIVE_POLL_MS * 5);
    });
    expect(liveReads()).toBe(1);
    // Back in front: no waiting for the next tick with 20 s old rows.
    await act(async () => {
      appStateHandler?.("active");
      await Promise.resolve();
    });
    expect(liveReads()).toBe(2);
  });

  it("polls every 4 s while focused, and stops in the background", async () => {
    jest.useFakeTimers();
    renderStacked(<QuizLiveRoute />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(liveReads()).toBe(1);

    await act(async () => {
      jest.advanceTimersByTime(QUIZ_LIVE_POLL_MS);
    });
    expect(liveReads()).toBe(2);
    await act(async () => {
      jest.advanceTimersByTime(QUIZ_LIVE_POLL_MS);
    });
    expect(liveReads()).toBe(3);

    act(() => appStateHandler?.("background"));
    await act(async () => {
      jest.advanceTimersByTime(QUIZ_LIVE_POLL_MS * 3);
    });
    expect(liveReads()).toBe(3);
  });

  it("End attempt from the live screen posts, after a confirm, and re-reads", async () => {
    post.mockResolvedValue({ data: { data: { attemptId: 900, status: "GRADED" } } });
    renderStacked(<QuizLiveRoute />);

    fireEvent.press(await screen.findByLabelText(/^Second student/));
    fireEvent.press(await screen.findByRole("button", { name: "End attempt" }));
    expect(await screen.findByText("End Second student's attempt?")).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
    fireEvent.press(screen.getAllByRole("button", { name: "End attempt" }).at(-1)!);

    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/quizzes/41/attempts/end", { studentUserId: 10 }));
    await waitFor(() => expect(liveReads()).toBe(2));
    await expectQuietSuccess();
    // The confirm sits inside the sheet and closes once End has gone through (the sheet with it,
    // after its exit animation, which the test renderer never finishes).
    await waitFor(() => expect(screen.queryByText("End Second student's attempt?")).toBeNull());
  });

  it("Reopen from a finished row posts the reopen", async () => {
    post.mockResolvedValue({ data: { data: { attemptId: 901, attemptNumber: 2 } } });
    renderStacked(<QuizLiveRoute />);

    fireEvent.press(await screen.findByLabelText(/^Fourth student/));
    fireEvent.press(await screen.findByRole("button", { name: "Allow a retake" }));

    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/quizzes/41/attempts/reopen", { studentUserId: 12 }));
    await waitFor(() => expect(liveReads()).toBe(2));
  });

  it("a student who never started has no actions", async () => {
    renderStacked(<QuizLiveRoute />);
    await screen.findByText("Third student");
    expect(screen.queryByRole("button", { name: /^Third student/ })).toBeNull();
  });

  it.each([
    ["a paper quiz", { kind: "PAPER" }],
    ["a draft", { published: false }],
  ])("on %s (a deep link) says live view is for published online quizzes, and stops reading", async (_l, over) => {
    jest.useFakeTimers();
    get.mockImplementation((url: string) =>
      url === LIVE_URL ? Promise.resolve({ data: { data: { ...live(), ...over } } }) : Promise.reject(new Error(url)),
    );
    renderStacked(<QuizLiveRoute />);
    expect(await screen.findByText("Live view is for published online quizzes.")).toBeTruthy();
    expect(screen.queryByText("Second student")).toBeNull();
    await act(async () => {
      jest.advanceTimersByTime(QUIZ_LIVE_POLL_MS * 3);
    });
    expect(liveReads()).toBe(1);
  });

  it("is not for students", async () => {
    useSessionStore.setState({
      user: { id: 9, name: "S", email: "s@jpc.test", role: "STUDENT", avatarPath: null, hasPassword: true },
    });
    renderStacked(<QuizLiveRoute />);
    expect(await screen.findByText("This screen isn't available for your role.")).toBeTruthy();
    expect(liveReads()).toBe(0);
  });
});

describe("the staff preview's Live button", () => {
  const quiz = (over: Record<string, unknown>) => ({
    ...{ id: 41, title: "Week 1 quiz", kind: "ONLINE", seasonId: 7, seasonCode: "s26", sessionId: 12 },
    ...{ sessionTitle: "Week 1", publishedAt: "2099-02-01T00:00:00.000Z", maxScore: 2, attemptCount: 0 },
    ...{ gradeCount: 0, canEditStructure: true, canManage: false, answersReleasedAt: null, shuffleQuestions: true },
    ...{ canReleaseResults: false, questions: [], startsFrom: null, startsUntil: null, timeLimitMinutes: null },
    ...over,
  });
  const serveQuiz = (over: Record<string, unknown>) =>
    get.mockImplementation(() => Promise.resolve({ data: { data: quiz(over) } }));

  it("opens the live screen for a published online quiz", async () => {
    serveQuiz({});
    renderStacked(<QuizDetailScreen />);
    fireEvent.press(await screen.findByRole("button", { name: "Live: where every student is" }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/quiz/[id]/live", params: { id: "41" } });
  });

  it("is not there for a draft or a paper quiz", async () => {
    serveQuiz({ publishedAt: null });
    const draft = renderStacked(<QuizDetailScreen />);
    await screen.findByText("Online · Draft");
    expect(screen.queryByRole("button", { name: "Live: where every student is" })).toBeNull();
    draft.unmount();

    serveQuiz({ kind: "PAPER" });
    renderStacked(<QuizDetailScreen />);
    await screen.findByText("Paper");
    expect(screen.queryByRole("button", { name: "Live: where every student is" })).toBeNull();
  });
});
