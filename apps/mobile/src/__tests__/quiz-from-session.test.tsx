import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, renderHook, screen, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
}));
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockParams: { current: Record<string, string> } = { current: {} };
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams.current,
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn() }),
}));

import { apiClient } from "../lib/api-client";
import { queryKeys } from "../lib/query-keys";
import { useSessionStore } from "../store/session";
import { useCreateQuiz, useUpdateQuiz } from "../hooks/use-quiz-authoring";
import { useReopenAttempt } from "../hooks/use-quizzes";
import { AdminQuizzesCard } from "../screens/session-detail/quizzes-cards";
import { renderWithProviders } from "./helpers/render";
import NewQuizScreen from "../../app/(app)/quiz/new";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;
const patch = apiClient.patch as jest.Mock;

const adminSession = {
  user: { id: 2, name: "Test admin", email: "a@jpc.test", role: "ADMIN" as const, avatarPath: null, hasPassword: true },
  scopes: { seasonAdminIds: [7, 8], groupLeaderIds: [], activeSeasonId: null, graduationYear: null },
};

const seasonsList = {
  data: {
    data: {
      seasons: [
        {
          id: 7,
          code: "s26",
          title: "Spring 2026",
          program: "TEST",
          year: 2026,
          status: "ACTIVE",
          startDate: "2026-01-01T00:00:00.000Z",
          endDate: "2026-12-31T00:00:00.000Z",
        },
      ],
    },
  },
};
/** A session in season 8 — NOT the current season (7). */
const pastSeasonSessions = {
  data: {
    data: {
      sessions: [
        {
          id: 13,
          title: "Old week",
          startsAt: "2025-03-01T18:00:00.000Z",
          dayKey: "2025-03-01",
          startTime: "20:00",
          durationMinutes: 60,
          location: null,
          recurrenceGroupId: null,
          attendanceMarked: false,
          seasonId: 8,
          seasonCode: "f25",
          seasonTitle: "Fall 2025",
          checkInToken: null,
          checkInOpenAt: null,
          checkInClosedAt: null,
        },
      ],
    },
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockParams.current = {};
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(adminSession);
});

describe("+ Add quiz from a session", () => {
  it("opens the new-quiz screen with the session and its season", async () => {
    get.mockResolvedValue({ data: { data: { quizzes: [] } } });
    renderWithProviders(<AdminQuizzesCard sessionId={13} seasonId={8} canAuthor />);

    fireEvent.press(await screen.findByText("+ Add quiz"));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/quiz/new",
      params: { sessionId: "13", seasonId: "8" },
    });
  });

  it("creates the quiz on that session, in the session's season, not the current one", async () => {
    mockParams.current = { sessionId: "13", seasonId: "8" };
    get.mockImplementation((url: string) =>
      url === "/api/v1/seasons"
        ? Promise.resolve(seasonsList)
        : url === "/api/v1/seasons/8/sessions"
          ? Promise.resolve(pastSeasonSessions)
          : Promise.reject(new Error(`unexpected GET ${url}`)),
    );
    post.mockResolvedValue({ data: { data: { id: 79 } } });
    renderWithProviders(<NewQuizScreen />);

    fireEvent.changeText(await screen.findByLabelText("Title"), "Old week quiz");
    // Preselected — the reader never had to pick it.
    expect(await screen.findByText("Old week")).toBeTruthy();
    fireEvent.press(screen.getByText("Create"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/quizzes", {
        seasonId: 8,
        sessionId: 13,
        title: "Old week quiz",
        kind: "PAPER",
        maxScore: 100,
      }),
    );
  });
});

describe("quiz writes refresh the session quiz cards", () => {
  function setup() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const spy = jest.spyOn(client, "invalidateQueries");
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    return { spy, wrapper };
  }

  it("reopening an attempt refreshes the quiz lists as well as the attempts (M4)", async () => {
    post.mockResolvedValue({ data: { data: { attemptId: 1, attemptNumber: 2 } } });
    const { spy, wrapper } = setup();
    const { result } = renderHook(() => useReopenAttempt(41), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(9).catch(() => undefined);
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.quizzes.attempts(41) });
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.quizzes.lists() });
  });

  it("invalidates every session's quizzes after a create", async () => {
    post.mockResolvedValue({ data: { data: { id: 80 } } });
    const { spy, wrapper } = setup();
    const { result } = renderHook(() => useCreateQuiz(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ seasonId: 7, sessionId: 12, title: "Q", kind: "ONLINE" });
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.sessions.allQuizzes() });
  });

  it("invalidates them after an edit too", async () => {
    patch.mockResolvedValue({ data: { data: { updated: true } } });
    const { spy, wrapper } = setup();
    const { result } = renderHook(() => useUpdateQuiz(41), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ title: "Renamed" });
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.sessions.allQuizzes() });
  });
});
