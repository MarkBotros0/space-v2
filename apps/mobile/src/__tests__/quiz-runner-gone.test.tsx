import { fireEvent, screen } from "@testing-library/react-native";

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

import { AxiosError, type AxiosResponse } from "axios";

import { TabBarPresenceContext } from "../design/layout/shell-context";
import { apiClient } from "../lib/api-client";
import { useQuizLockStore } from "../store/quiz-lock";
import { renderWithProviders } from "./helpers/render";
import QuizDetailScreen from "../../app/(app)/quiz/[id]/index";
import {
  appState,
  backHandlersNow,
  detail,
  eventPosts,
  get,
  post,
  setUpExitHarness,
  tearDownExitHarness,
  tick,
} from "./helpers/quiz-exit-harness";

/*
 * A quiz that is gone for the student (unpublished, season deleted, place lost): docs/rules/
 * quiz-integrity.md "Relaunch and the route lock". The form gives way to a plain screen with a way back.
 */

const patch = apiClient.patch as jest.Mock;
const GONE = "This quiz is no longer available.";

const refusal = (status: 403 | 404) =>
  new AxiosError(String(status), "ERR_BAD_REQUEST", undefined, undefined, {
    status,
    data: {
      error:
        status === 403
          ? { code: "forbidden", message: "Forbidden." }
          : { code: "not_found", message: "Quiz not found." },
    },
  } as AxiosResponse);

/** The first read shows the open attempt; every read after it says the quiz is gone. */
function goneAfterFirstRead(status: 403 | 404, first = detail()) {
  let reads = 0;
  get.mockImplementation(async () => {
    reads += 1;
    if (reads === 1) return { data: { data: first } };
    throw refusal(status);
  });
  return () => reads;
}

/** The quiz route as the stack shows it: pushed, no tab bar under it, so its default is a back bar. */
const renderQuiz = () =>
  renderWithProviders(
    <TabBarPresenceContext.Provider value={false}>
      <QuizDetailScreen />
    </TabBarPresenceContext.Provider>,
  );

/** Nothing of the open attempt is left: no form, the lock let go, a back bar, Android back free. */
async function expectGoneScreen() {
  expect(await screen.findByText(GONE)).toBeTruthy();
  expect(screen.queryByText("Submit quiz")).toBeNull();
  expect(screen.queryByText("Capital of France?")).toBeNull();
  expect(screen.getAllByRole("link", { name: "Back" })).toHaveLength(1);
  expect(backHandlersNow()).toHaveLength(0);
  expect(useQuizLockStore.getState().lockedQuizId).toBeNull();
}

beforeEach(() => {
  mockStore.clear();
  setUpExitHarness();
  useQuizLockStore.setState({ lockedQuizId: null });
});
afterEach(tearDownExitHarness);

describe("quiz runner: a gone quiz", () => {
  it("a first read that 404s says the quiz is no longer available, with a way back", async () => {
    get.mockRejectedValue(refusal(404));
    renderQuiz();
    await tick();
    expect(await screen.findByText(GONE)).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "Back" })).toHaveLength(1);
    expect(screen.queryByText("Try again")).toBeNull();
  });

  it("a save refused 403 re-reads the quiz, and a 404 on that read replaces the form", async () => {
    const reads = goneAfterFirstRead(404);
    patch.mockRejectedValue(refusal(403));
    renderQuiz();
    fireEvent.press(await screen.findByLabelText("Answer 1 option 2: Paris"));
    await tick(1000);

    expect(reads()).toBe(2);
    await expectGoneScreen();
    // Saving stopped: no retry of a refusal no retry can change.
    await tick(5000);
    expect(patch).toHaveBeenCalledTimes(1);
  });

  it("a submit refused 404 re-reads the quiz and shows it gone", async () => {
    const answered = detail({ questions: [{ ...detail().questions[0], answer: { optionId: 1002 } }] });
    const reads = goneAfterFirstRead(404, answered);
    post.mockRejectedValue(refusal(404));
    renderQuiz();
    fireEvent.press(await screen.findByText("Submit quiz"));
    fireEvent.press(await screen.findByText("Submit"));
    await tick();

    expect(reads()).toBe(2);
    await expectGoneScreen();
  });

  it("an exit report refused 403 re-reads the quiz and shows it gone", async () => {
    get.mockResolvedValue({ data: { data: detail() } });
    renderQuiz();
    await screen.findByText("Capital of France?");
    await tick();
    // While the attempt is open there is no way back.
    expect(screen.queryAllByRole("link", { name: "Back" })).toHaveLength(0);
    get.mockRejectedValue(refusal(403));
    post.mockRejectedValue(refusal(403));
    await appState("background");
    await appState("active");
    await tick();

    expect(eventPosts()).toHaveLength(1);
    expect(get).toHaveBeenCalledTimes(2);
    await expectGoneScreen();
  });
});
