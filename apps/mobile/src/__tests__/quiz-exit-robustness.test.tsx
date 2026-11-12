import { act, fireEvent, screen } from "@testing-library/react-native";

const mockStore = new Map<string, string>();
jest.mock("expo-secure-store", () => ({
  setItemAsync: jest.fn(async (k: string, v: string) => void mockStore.set(k, v)),
  getItemAsync: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  deleteItemAsync: jest.fn(async (k: string) => void mockStore.delete(k)),
}));
jest.mock("expo-screen-capture", () => ({
  preventScreenCaptureAsync: jest.fn(async () => undefined),
  allowScreenCaptureAsync: jest.fn(async () => undefined),
  addScreenshotListener: () => ({ remove: jest.fn() }),
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

import {
  appState,
  detail,
  ENDED,
  eventPosts,
  get,
  openQuiz,
  post,
  report,
  sentEvents,
  SERVER_NOW,
  setUpExitHarness,
  tearDownExitHarness,
  tick,
  TITLE,
} from "./helpers/quiz-exit-harness";
import { setCurrentAppState } from "./helpers/app-state";

/* Task 4 review, fix round 1: the lock holds up when the network, the launch or the dialogs misbehave. */

const patch = (jest.requireMock("../lib/api-client") as { apiClient: { patch: jest.Mock } }).apiClient.patch;
const blip = () => Object.assign(new Error("Network Error"), { isAxiosError: true });
const pending = () => {
  let resolve: (v: unknown) => void = () => undefined;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
};

beforeEach(() => {
  mockStore.clear();
  setUpExitHarness();
});
afterEach(tearDownExitHarness);

describe("quiz exits, robustness", () => {
  it("a slow report still shows the warning after 2.5 s", async () => {
    post.mockReturnValue(pending().promise);
    await openQuiz({ attemptId: 920 });
    await appState("background");
    await appState("active");
    await tick(2000);
    expect(screen.queryByText(TITLE)).toBeNull();
    await tick(600);
    expect(screen.getByText(TITLE)).toBeTruthy();
  });

  it("a late ended report still moves to the ended result after the warning", async () => {
    const slow = pending();
    post.mockReturnValue(slow.promise);
    await openQuiz({ attemptId: 921 });
    await appState("background");
    await appState("active");
    await tick(2600);
    expect(screen.getByText(TITLE)).toBeTruthy();

    get.mockResolvedValue({
      data: {
        data: detail({
          attemptId: 921,
          stage: "submitted",
          status: "SUBMITTED",
          endReason: "ENDED_BY_EXITS",
          questions: [],
        }),
      },
    });
    await act(async () => slow.resolve(report(3, true, "SUBMITTED")));
    expect(await screen.findByText(ENDED)).toBeTruthy();
    expect(screen.queryByText(TITLE)).toBeNull();
  });

  it("launched in the background, the relaunch waits for the first active", async () => {
    mockStore.set("quiz-open.922", "1");
    post.mockResolvedValue(report(1));
    setCurrentAppState("background");
    await openQuiz({ attemptId: 922 });
    expect(eventPosts()).toHaveLength(0);

    setCurrentAppState("active");
    await appState("active");
    await tick();
    expect(sentEvents()).toEqual([expect.objectContaining({ kind: "RELAUNCH" })]);
    expect(await screen.findByText(TITLE)).toBeTruthy();
  });

  it("a queued exit is sent again on the next return to active", async () => {
    post.mockRejectedValueOnce(blip());
    post.mockResolvedValue(report(1));
    await openQuiz({ attemptId: 923 });
    await appState("background");
    await appState("active");
    await tick();
    expect(eventPosts()).toHaveLength(1);

    await appState("inactive");
    await appState("active");
    await tick();
    expect(eventPosts()).toHaveLength(2);
    const ids = sentEvents().map((e: { clientEventId: string }) => e.clientEventId);
    expect(new Set(ids).size).toBe(1);
    expect(mockStore.has("quiz-exit-queue.923")).toBe(false);
  });

  it("a queued exit is sent again after an answer saves", async () => {
    post.mockRejectedValueOnce(blip());
    post.mockResolvedValue(report(1));
    patch.mockResolvedValue({ data: { data: { saved: 1 } } });
    await openQuiz({ attemptId: 924 });
    await appState("background");
    await appState("active");
    await tick();
    fireEvent.press(screen.getByText("Back to the quiz"));
    expect(eventPosts()).toHaveLength(1);

    fireEvent.press(screen.getByLabelText("Answer 1 option 2: Paris"));
    await tick(1000);
    await tick();
    expect(patch).toHaveBeenCalledTimes(1);
    expect(eventPosts()).toHaveLength(2);
    expect(mockStore.has("quiz-exit-queue.924")).toBe(false);
  });

  it("leaving closes the Submit dialog, so the warning isn't under it", async () => {
    post.mockResolvedValue(report(1));
    const answered = { ...detail().questions[0], answer: { optionId: 1002 } };
    await openQuiz({ attemptId: 925, questions: [answered] });
    fireEvent.press(screen.getByText("Submit quiz"));
    expect(await screen.findByText("Submit quiz?")).toBeTruthy();

    await appState("background");
    expect(screen.queryByText("Submit quiz?")).toBeNull();
    await appState("active");
    expect(await screen.findByText(TITLE)).toBeTruthy();
    expect(screen.queryByText("Submit quiz?")).toBeNull();
  });
  it("a late ended report closes the warning even when the re-read can't get through", async () => {
    const slow = pending();
    post.mockReturnValue(slow.promise);
    await openQuiz({ attemptId: 926 });
    await appState("background");
    await appState("active");
    await tick(2600);
    expect(screen.getByText(TITLE)).toBeTruthy();

    get.mockRejectedValue(blip());
    await act(async () => slow.resolve(report(3, true, "SUBMITTED")));
    await tick();
    expect(screen.queryByText(TITLE)).toBeNull();
  });

  it("repeated active after a background launch makes the relaunch decision once", async () => {
    mockStore.set("quiz-open.927", "1");
    post.mockResolvedValue(report(1));
    setCurrentAppState("background");
    await openQuiz({ attemptId: 927 });

    setCurrentAppState("active");
    await appState("active");
    await appState("active");
    await appState("active");
    await tick();
    expect(sentEvents()).toEqual([expect.objectContaining({ kind: "RELAUNCH" })]);
  });

  it("once time is up, leaving the app is not watched", async () => {
    post.mockResolvedValue(report(1));
    const deadlineAt = new Date(Date.parse(SERVER_NOW) + 5_000).toISOString();
    await openQuiz({ attemptId: 928, timeLimitMinutes: 20, deadlineAt });
    // Every re-read after zero: still open on the server, its deadline behind it (not closed yet).
    const later = new Date(Date.parse(SERVER_NOW) + 60_000).toISOString();
    get.mockResolvedValue({
      data: { data: detail({ attemptId: 928, timeLimitMinutes: 20, deadlineAt, serverNow: later }) },
    });
    await tick(6_000);
    await tick(5_000);
    expect(screen.getByText("Check again")).toBeTruthy();

    await appState("background");
    await appState("active");
    await tick(3_000);
    expect(eventPosts()).toHaveLength(0);
    expect(screen.queryByText(TITLE)).toBeNull();
  });
});
