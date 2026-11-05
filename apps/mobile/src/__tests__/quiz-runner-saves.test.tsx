import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { AccessibilityInfo, AppState, type AppStateStatus } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

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

const get = apiClient.get as jest.Mock;
const put = apiClient.put as jest.Mock;
const patch = apiClient.patch as jest.Mock;
const post = apiClient.post as jest.Mock;

const mcq = {
  id: 100, order: 0, type: "MCQ" as const, prompt: "Capital of France?", points: 2,
  options: ["London", "Paris"], selectedIndex: null, text: null,
  isCorrect: null, pointsAwarded: null,
};
const essay = {
  id: 101, order: 1, type: "ESSAY" as const, prompt: "Discuss.", points: 5,
  options: [], selectedIndex: null, text: null, isCorrect: null, pointsAwarded: null,
};

function detail(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 41, title: "Week 1 quiz", kind: "ONLINE", seasonId: 7, maxScore: 7,
    sessionTitle: "Week 1", attemptId: null, attemptNumber: 0, status: null,
    totalScore: null, submittedAt: null, gradedAt: null,
    questions: [mcq, essay], ...over,
  };
}
const inProgress = () => detail({ attemptId: 900, attemptNumber: 1, status: "IN_PROGRESS" });

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState({
    user: { id: 9, name: "S", email: "s@jpc.test", role: "STUDENT" as const, avatarPath: null, hasPassword: true },
    scopes: { seasonAdminIds: [], groupLeaderIds: [], activeSeasonId: 7, graduationYear: null },
  });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("quiz runner saves", () => {
  it("keeps an answer edited while its batch is in flight, and sends it next", async () => {
    get.mockResolvedValue({ data: { data: inProgress() } });
    const first = deferred<unknown>();
    patch.mockReturnValueOnce(first.promise);
    patch.mockResolvedValue({ data: { data: { saved: 1 } } });

    renderWithProviders(<QuizDetailScreen />);
    fireEvent.changeText(await screen.findByLabelText("Answer 2"), "First draft");
    act(() => { jest.advanceTimersByTime(1000); });
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));

    // Edited while the first PATCH is still out.
    fireEvent.changeText(screen.getByLabelText("Answer 2"), "Second draft");
    await act(async () => { first.resolve({ data: { data: { saved: 1 } } }); });
    act(() => { jest.advanceTimersByTime(1000); });

    await waitFor(() => expect(patch).toHaveBeenCalledTimes(2));
    expect(patch).toHaveBeenLastCalledWith("/api/v1/quizzes/41/attempt", {
      answers: [{ questionId: 101, selectedIndex: null, text: "Second draft" }],
    });
  });

  it("flushes a pending edit when the screen unmounts inside the debounce", async () => {
    get.mockResolvedValue({ data: { data: inProgress() } });
    patch.mockResolvedValue({ data: { data: { saved: 1 } } });

    const view = renderWithProviders(<QuizDetailScreen />);
    fireEvent.press(await screen.findByLabelText("Answer 1 option 2: Paris"));
    expect(patch).not.toHaveBeenCalled();
    view.unmount();

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/api/v1/quizzes/41/attempt", {
        answers: [{ questionId: 100, selectedIndex: 1, text: null }],
      }),
    );
  });

  it("flushes a pending edit when the app goes to the background", async () => {
    const listeners: ((s: AppStateStatus) => void)[] = [];
    jest.spyOn(AppState, "addEventListener").mockImplementation((_type, fn) => {
      listeners.push(fn as (s: AppStateStatus) => void);
      return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
    });
    get.mockResolvedValue({ data: { data: inProgress() } });
    patch.mockResolvedValue({ data: { data: { saved: 1 } } });

    renderWithProviders(<QuizDetailScreen />);
    fireEvent.press(await screen.findByLabelText("Answer 1 option 2: Paris"));
    expect(patch).not.toHaveBeenCalled();
    // No timer advance (waitFor would advance the fake clock past the
    // debounce): the background event alone must send it.
    await act(async () => {
      for (const fn of listeners) fn("background");
      await Promise.resolve();
    });
    for (let i = 0; i < 5 && patch.mock.calls.length === 0; i++) {
      await act(async () => { await Promise.resolve(); });
    }
    expect(patch).toHaveBeenCalledTimes(1);
  });

  it("shows saved answers when the quiz is re-opened inside staleTime", async () => {
    get.mockResolvedValue({ data: { data: detail() } });
    put.mockResolvedValue({ data: { data: inProgress() } });
    patch.mockResolvedValue({ data: { data: { saved: 1 } } });

    // One client across both mounts, with the app's 30s staleTime, so the
    // second mount reads the cache the way navigating back does.
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
    });
    const wrap = (ui: ReactElement | null) => (
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 0, left: 0, right: 0, bottom: 0 },
        }}
      >
        <QueryClientProvider client={client}>{ui}</QueryClientProvider>
      </SafeAreaProvider>
    );

    const view = render(wrap(<QuizDetailScreen />));
    fireEvent.press(await screen.findByText("Start quiz"));
    fireEvent.press(await screen.findByLabelText("Answer 1 option 2: Paris"));
    act(() => { jest.advanceTimersByTime(1000); });
    expect(await screen.findByText(/Saved/)).toBeTruthy();

    view.rerender(wrap(null));
    view.rerender(wrap(<QuizDetailScreen />));

    const paris = await screen.findByLabelText("Answer 1 option 2: Paris");
    expect(paris.props.accessibilityState).toMatchObject({ selected: true });
    expect(get).toHaveBeenCalledTimes(1);
  });

  describe("when saving or submitting fails", () => {
    let announce: jest.SpyInstance;
    beforeEach(() => {
      announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    });
    const answered = () =>
      detail({
        attemptId: 900, attemptNumber: 1, status: "IN_PROGRESS",
        questions: [{ ...mcq, selectedIndex: 1 }, { ...essay, text: "An answer." }],
      });

    it("a failed submit is an error toast, with the form still there to try again", async () => {
      get.mockResolvedValue({ data: { data: answered() } });
      post.mockRejectedValue(new Error("offline"));
      renderWithProviders(<QuizDetailScreen />);
      fireEvent.press(await screen.findByText("Submit quiz"));
      fireEvent.press(await screen.findByText("Submit"));

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't submit the quiz."));
      expect(announce).toHaveBeenCalledWith("Couldn't submit the quiz.");
      expect(toast.success).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Submit quiz" }).props.accessibilityState?.disabled).toBeFalsy();
      // The bar's hint stays a status line; the error isn't dressed as one.
      expect(screen.getByText("2 of 2 answered")).toBeTruthy();
    });

    it("answers that won't save stop the submit, and say why", async () => {
      get.mockResolvedValue({ data: { data: answered() } });
      patch.mockRejectedValue(new Error("offline"));
      renderWithProviders(<QuizDetailScreen />);
      fireEvent.changeText(await screen.findByLabelText("Answer 2"), "A better answer.");
      fireEvent.press(screen.getByText("Submit quiz"));
      fireEvent.press(await screen.findByText("Submit"));

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          "Couldn't save your answers, so the quiz wasn't submitted.",
        ),
      );
      expect(post).not.toHaveBeenCalled();
    });

    it("a disabled Submit says how far along the student is, to a screen reader too", async () => {
      get.mockResolvedValue({ data: { data: inProgress() } });
      renderWithProviders(<QuizDetailScreen />);
      const submit = () => screen.getByRole("button", { name: "Submit quiz" }).props;
      await screen.findByLabelText("Answer 2");
      expect(submit().accessibilityState?.disabled).toBe(true);
      expect(submit().accessibilityHint).toBe("0 of 2 answered");
      fireEvent.press(screen.getByLabelText("Answer 1 option 2: Paris"));
      expect(submit().accessibilityHint).toBe("1 of 2 answered");
    });

    it("Retry save sends what failed, and clears the error", async () => {
      get.mockResolvedValue({ data: { data: inProgress() } });
      patch.mockRejectedValueOnce(new Error("offline"));
      patch.mockResolvedValue({ data: { data: { saved: 1 } } });
      renderWithProviders(<QuizDetailScreen />);
      fireEvent.press(await screen.findByLabelText("Answer 1 option 2: Paris"));
      act(() => { jest.advanceTimersByTime(1000); });
      expect(await screen.findByText(/Not saved/)).toBeTruthy();

      fireEvent.press(screen.getByText("Retry save"));
      await waitFor(() => expect(patch).toHaveBeenCalledTimes(2));
      expect(patch).toHaveBeenLastCalledWith("/api/v1/quizzes/41/attempt", {
        answers: [{ questionId: 100, selectedIndex: 1, text: null }],
      });
      expect(await screen.findByText(/· Saved/)).toBeTruthy();
      expect(screen.queryByText("Retry save")).toBeNull();
    });
  });
});
