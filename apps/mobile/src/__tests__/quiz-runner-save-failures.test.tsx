import { onlineManager } from "@tanstack/react-query";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";

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

import { ConfirmDialog } from "../design/ui";
import { toast } from "../design/ui/toaster";
import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import QuizDetailScreen from "../../app/(app)/quiz/[id]/index";

const get = apiClient.get as jest.Mock;
const patch = apiClient.patch as jest.Mock;
const post = apiClient.post as jest.Mock;

const SUBMIT_FAILED = "Couldn't submit the quiz. Check your connection and try again.";

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
const essay = {
  id: 101,
  order: 1,
  type: "ESSAY" as const,
  prompt: "Discuss.",
  points: 5,
  answer: { text: "" },
  review: null,
  pointsAwarded: null,
};

function detail(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 41,
    title: "Week 1 quiz",
    kind: "ONLINE",
    seasonId: 7,
    maxScore: 7,
    sessionTitle: "Week 1",
    attemptId: null,
    attemptNumber: 0,
    readOnly: false,
    status: null,
    stage: "not_started",
    totalScore: null,
    submittedAt: null,
    gradedAt: null,
    answersReleased: false,
    questions: [mcq, essay],
    ...over,
  };
}
const inProgress = () => detail({ attemptId: 900, attemptNumber: 1, status: "IN_PROGRESS", stage: "in_progress" });

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
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
  describe("when saving or submitting fails", () => {
    let announce: jest.SpyInstance;
    beforeEach(() => {
      announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    });
    const answered = () =>
      detail({
        attemptId: 900,
        attemptNumber: 1,
        status: "IN_PROGRESS",
        stage: "in_progress",
        questions: [
          { ...mcq, answer: { optionId: 1002 } },
          { ...essay, answer: { text: "An answer." } },
        ],
      });

    it("a failed submit is an error toast, with the form still there to try again", async () => {
      get.mockResolvedValue({ data: { data: answered() } });
      post.mockRejectedValue(new Error("offline"));
      renderWithProviders(<QuizDetailScreen />);
      fireEvent.press(await screen.findByText("Submit quiz"));
      fireEvent.press(await screen.findByText("Submit"));

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith(SUBMIT_FAILED));
      expect(announce).toHaveBeenCalledWith(SUBMIT_FAILED);
      expect(toast.success).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Submit quiz" }).props.accessibilityState?.disabled).toBeFalsy();
      // The bar's hint stays a status line; the error isn't dressed as one.
      expect(screen.getByText("2 of 2 answered")).toBeTruthy();
    });

    it("a refusal from the server is shown as the server's message", async () => {
      get.mockResolvedValue({ data: { data: answered() } });
      post.mockRejectedValue(
        Object.assign(new Error("409"), {
          isAxiosError: true,
          response: { status: 409, data: { error: { code: "attempt_incomplete", message: "Answer every question." } } },
        }),
      );
      renderWithProviders(<QuizDetailScreen />);
      fireEvent.press(await screen.findByText("Submit quiz"));
      fireEvent.press(await screen.findByText("Submit"));
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Answer every question."));
    });

    it("a second press of Submit while the first is in flight is a no-op, and the first's outcome shows", async () => {
      get.mockResolvedValue({ data: { data: answered() } });
      const first = deferred<unknown>();
      post.mockReturnValueOnce(first.promise);
      post.mockRejectedValue(new Error("duplicate"));
      renderWithProviders(<QuizDetailScreen />);
      fireEvent.press(await screen.findByText("Submit quiz"));
      await screen.findByText("Submit");
      // A double tap lands before the dialog has closed, so both reach the handler.
      const { onConfirm } = screen.UNSAFE_getByType(ConfirmDialog).props;
      act(() => {
        onConfirm();
        onConfirm();
      });
      await act(async () => {
        await jest.advanceTimersByTimeAsync(10);
      });
      expect(post).toHaveBeenCalledTimes(1);

      first.resolve({ data: { data: { ...answered(), status: "SUBMITTED", totalScore: 2 } } });
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Quiz submitted."));
      expect(toast.error).not.toHaveBeenCalled();
    });

    it("answers that won't save stop the submit, and say why", async () => {
      get.mockResolvedValue({ data: { data: answered() } });
      patch.mockRejectedValue(new Error("offline"));
      renderWithProviders(<QuizDetailScreen />);
      fireEvent.changeText(await screen.findByLabelText("Answer 2"), "A better answer.");
      fireEvent.press(screen.getByText("Submit quiz"));
      fireEvent.press(await screen.findByText("Submit"));

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith("Couldn't save your answers, so the quiz wasn't submitted."),
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
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      expect(await screen.findByText(/Not saved/)).toBeTruthy();

      fireEvent.press(screen.getByText("Retry save"));
      await waitFor(() => expect(patch).toHaveBeenCalledTimes(2));
      expect(patch).toHaveBeenLastCalledWith("/api/v1/quizzes/41/attempt", {
        answers: [{ type: "SINGLE_CHOICE", questionId: 100, optionId: 1002 }],
      });
      expect(await screen.findByText(/· Saved/)).toBeTruthy();
      expect(screen.queryByText("Retry save")).toBeNull();
    });
  });

  describe("offline", () => {
    const answered = () =>
      detail({
        attemptId: 900,
        attemptNumber: 1,
        status: "IN_PROGRESS",
        stage: "in_progress",
        questions: [
          { ...mcq, answer: { optionId: 1002 } },
          { ...essay, answer: { text: "An answer." } },
        ],
      });
    const OFFLINE = SUBMIT_FAILED;
    const noNetwork = () => Object.assign(new Error("Network Error"), { isAxiosError: true, response: undefined });
    const setOnline = (online: boolean) => act(() => onlineManager.setOnline(online));
    const submitQuiz = async () => {
      fireEvent.press(screen.getByText("Submit quiz"));
      fireEvent.press(await screen.findByText("Submit"));
    };
    const tick = (ms = 0) =>
      act(async () => {
        await jest.advanceTimersByTimeAsync(ms);
      });

    afterEach(() => setOnline(true));

    it("an edit waiting offline says it is waiting for the connection, not saving", async () => {
      get.mockResolvedValue({ data: { data: answered() } });
      renderWithProviders(<QuizDetailScreen />);
      const box = await screen.findByLabelText("Answer 2");
      setOnline(false);
      fireEvent.changeText(box, "A better answer.");
      expect(screen.getByText(/Waiting for connection/)).toBeTruthy();
      expect(screen.queryByText(/Saving…/)).toBeNull();
      setOnline(true);
      expect(screen.getByText(/Saving…/)).toBeTruthy();
    });

    it("nothing unsent: the submit goes out and fails at once, and doesn't resend on reconnect", async () => {
      get.mockResolvedValue({ data: { data: answered() } });
      post.mockRejectedValue(noNetwork());
      renderWithProviders(<QuizDetailScreen />);
      await screen.findByText("Submit quiz");
      setOnline(false);

      await submitQuiz();
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith(OFFLINE));
      expect(post).toHaveBeenCalledTimes(1);

      setOnline(true);
      await tick(10);
      expect(post).toHaveBeenCalledTimes(1);
    });

    it("an edit still in the debounce: fails at once, keeps it, saves on reconnect and never hands in", async () => {
      get.mockResolvedValue({ data: { data: answered() } });
      patch.mockResolvedValue({ data: { data: { saved: 1 } } });
      renderWithProviders(<QuizDetailScreen />);
      const input = await screen.findByLabelText("Answer 2");
      setOnline(false);
      fireEvent.changeText(input, "Offline answer.");

      await submitQuiz();
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith(OFFLINE));
      expect(patch).not.toHaveBeenCalled();

      await tick(1000);
      expect(patch).not.toHaveBeenCalled();
      setOnline(true);
      await tick(10);
      expect(patch).toHaveBeenCalledTimes(1);
      expect(patch).toHaveBeenCalledWith("/api/v1/quizzes/41/attempt", {
        answers: [{ type: "ESSAY", questionId: 101, text: "Offline answer." }],
      });
      expect(post).not.toHaveBeenCalled();
    });

    it("an autosave already waiting doesn't lock Submit: it says why, and a later submit sends answers first", async () => {
      get.mockResolvedValue({ data: { data: answered() } });
      patch.mockResolvedValue({ data: { data: { saved: 1 } } });
      post.mockResolvedValue({ data: { data: answered() } });
      renderWithProviders(<QuizDetailScreen />);
      const input = await screen.findByLabelText("Answer 2");
      setOnline(false);
      fireEvent.changeText(input, "Offline answer.");
      await tick(1000);
      expect(screen.getByRole("button", { name: "Submit quiz" }).props.accessibilityState?.disabled).toBeFalsy();

      await submitQuiz();
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith(OFFLINE));
      expect(post).not.toHaveBeenCalled();

      setOnline(true);
      await tick(10);
      expect(patch).toHaveBeenCalledTimes(1);
      expect(post).not.toHaveBeenCalled();

      await submitQuiz();
      await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
      expect(patch.mock.invocationCallOrder[0]).toBeLessThan(post.mock.invocationCallOrder[0]!);
      expect(patch).toHaveBeenCalledTimes(1);
    });
  });
});
