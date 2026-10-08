import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "12" }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));
// The session screen statically imports Plan 11's StudentCheckInCard → QrScanner
// → expo-camera (a native module). Plan 11's stand-in, as every suite that
// renders session/[id] uses it.
jest.mock("expo-camera", () => require("./helpers/expo-camera"));
// react-native-youtube-iframe is replaced for every suite by the manual mock in
// apps/mobile/__mocks__ — a component exposing the three imperative methods the
// player calls (getCurrentTime / getDuration / seekTo), not a host string.

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { VideoQuizPlayer } from "../components/VideoQuizPlayer";
import { renderWithProviders } from "./helpers/render";

import SessionDetailScreen from "../../app/(app)/session/[id]/index";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;

const sessionDetail = {
  id: 12,
  title: "Week three",
  description: null,
  startsAt: "2099-03-01T18:00:00.000Z",
  // Plan 6's sessionDetailSchema fields (X13): the org day and wall time.
  dayKey: "2099-03-01",
  startTime: "20:00",
  durationMinutes: 90,
  location: null,
  youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  recurrenceGroupId: null,
  seasonId: 7,
  seasonCode: "S26",
  seasonTitle: "Spring 2026",
  checkInOpen: false,
  myAttendance: null,
  canMarkAttendance: false,
  canManageCheckIn: false, // Plan 4's flag — sessionDetailSchema requires it
};

const question = (id: number, atSeconds: number, answered = false) => ({
  id,
  atSeconds,
  prompt: `Question ${id}`,
  options: ["alpha", "beta"],
  points: 1,
  answered,
  selectedIndex: answered ? 0 : null,
  isCorrect: answered ? true : null,
});

const quiz = {
  videoId: "dQw4w9WgXcQ",
  youtubeUrl: sessionDetail.youtubeUrl,
  questions: [question(1, 30), question(2, 60)],
  furthestSeconds: 0,
  completedAt: null,
  earnedPoints: 0,
  totalPoints: 2,
  answeredCount: 0,
  nextQuestionId: 1,
};

const studentSession = {
  user: {
    id: 9,
    name: "S",
    email: "s@jpc.test",
    role: "STUDENT" as const,
    avatarPath: null,
    hasPassword: true,
  },
  scopes: { seasonAdminIds: [], groupLeaderIds: [], activeSeasonId: 7, graduationYear: null },
};

const adminSession = {
  user: {
    id: 2,
    name: "A",
    email: "a@jpc.test",
    role: "ADMIN" as const,
    avatarPath: null,
    hasPassword: true,
  },
  scopes: { seasonAdminIds: [7], groupLeaderIds: [], activeSeasonId: null, graduationYear: null },
};

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("student video quiz", () => {
  beforeEach(() => {
    useSessionStore.setState(studentSession);
  });

  it("renders the player and the score, and never requests the authoring list", async () => {
    get.mockImplementation((url: string) =>
      url === "/api/v1/sessions/12"
        ? Promise.resolve({ data: { data: sessionDetail } })
        : Promise.resolve({ data: { data: quiz } }),
    );

    renderWithProviders(<SessionDetailScreen />);

    // Cold-start of the whole session screen (player, webview mock, modal)
    // can exceed the 1s default while turbo runs every package in parallel.
    expect(await screen.findByText("0 / 2 points", {}, { timeout: 8000 })).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/sessions/12/video-quiz");
    // The authoring read carries correctIndex for every question. A student
    // screen must never issue it, whatever the server would answer.
    expect(get).not.toHaveBeenCalledWith("/api/v1/sessions/12/video-questions");
  });

  it("refuses a payload that leaks correctIndex instead of rendering the quiz", async () => {
    // The answer-key split's client half: studentVideoQuizSchema is .strict(),
    // so a backend that starts selecting the key fails at the boundary.
    const leaky = {
      ...quiz,
      questions: [{ ...question(1, 30), correctIndex: 0 }, question(2, 60)],
    };
    get.mockImplementation((url: string) =>
      url === "/api/v1/sessions/12"
        ? Promise.resolve({ data: { data: sessionDetail } })
        : Promise.resolve({ data: { data: leaky } }),
    );

    renderWithProviders(<SessionDetailScreen />);

    expect(
      await screen.findByText("Couldn't load the video quiz.", {}, { timeout: 5000 }),
    ).toBeTruthy();
    expect(screen.queryByText("0 / 2 points")).toBeNull();
  });

  it("opens the question modal at the barrier and posts the answer", async () => {
    // Rendered directly with an injected clock: a webview reports no playhead
    // under Jest. The clock reads 31 s, past question 1's barrier (30 s), so
    // the component's ordinary 400 ms poll opens the real modal on its own —
    // no test-only branch, and the barrier logic under test is the shipped one.
    post.mockResolvedValue({
      data: {
        data: {
          isCorrect: true,
          correctIndex: 0,
          furthestSeconds: 30,
          completedAt: null,
          nextQuestionId: 2,
        },
      },
    });

    renderWithProviders(
      <VideoQuizPlayer sessionId={12} quiz={quiz} readCurrentTime={async () => 31} />,
    );

    // The modal opens by itself; the test only waits for the prompt.
    expect(await screen.findByText("Question 1", {}, { timeout: 3000 })).toBeTruthy();
    fireEvent.press(screen.getByText("alpha"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/sessions/12/video-quiz/answers", {
        questionId: 1,
        selectedIndex: 0,
      }),
    );
    expect(await screen.findByText("Correct")).toBeTruthy();
  });

  it("falls back to a link when the URL does not resolve to a video", async () => {
    // v1 renders a plain anchor and the entire quiz becomes unreachable with no
    // message to anyone (spec 13 R37). The link stays; the silence does not.
    get.mockImplementation((url: string) =>
      url === "/api/v1/sessions/12"
        ? Promise.resolve({ data: { data: { ...sessionDetail, youtubeUrl: "https://x.test/v" } } })
        : Promise.resolve({
            data: { data: { ...quiz, videoId: null, youtubeUrl: "https://x.test/v" } },
          }),
    );

    renderWithProviders(<SessionDetailScreen />);

    expect(await screen.findByText("Watch on YouTube")).toBeTruthy();
    expect(screen.getByText("This session's video link can't be played in the app.")).toBeTruthy();
  });

  it("shows a completed quiz without a barrier", async () => {
    get.mockImplementation((url: string) =>
      url === "/api/v1/sessions/12"
        ? Promise.resolve({ data: { data: sessionDetail } })
        : Promise.resolve({
            data: {
              data: {
                ...quiz,
                questions: [question(1, 30, true), question(2, 60, true)],
                answeredCount: 2,
                earnedPoints: 2,
                completedAt: "2099-03-02T10:00:00.000Z",
                nextQuestionId: null,
              },
            },
          }),
    );

    renderWithProviders(<SessionDetailScreen />);
    expect(await screen.findByText("2 / 2 points")).toBeTruthy();
    expect(screen.getByText("Quiz complete")).toBeTruthy();
  });
});

describe("admin video question editor", () => {
  beforeEach(() => {
    useSessionStore.setState(adminSession);
  });

  it("lists questions with their answer and creates a new one from a timestamp", async () => {
    get.mockImplementation((url: string) => {
      if (url === "/api/v1/sessions/12") return Promise.resolve({ data: { data: sessionDetail } });
      if (url === "/api/v1/sessions/12/video-questions") {
        return Promise.resolve({
          data: {
            data: {
              questions: [
                {
                  id: 1,
                  atSeconds: 90,
                  prompt: "Question 1",
                  options: ["alpha", "beta"],
                  correctIndex: 1,
                  points: 1,
                  responseCount: 4,
                },
              ],
            },
          },
        });
      }
      return Promise.resolve({ data: { data: { questionCount: 1, totalPoints: 1, rows: [] } } });
    });
    post.mockResolvedValue({ data: { data: { question: { id: 2 } } } });

    renderWithProviders(<SessionDetailScreen />);

    // The timestamp round-trips through the shared formatter.
    expect(await screen.findByText("1:30")).toBeTruthy();
    expect(screen.getByText("4 answers recorded")).toBeTruthy();
    // Answer key visible to the admin — the other half of the split.
    expect(screen.getByText("Correct answer: beta")).toBeTruthy();

    fireEvent.press(screen.getByText("Add question"));
    fireEvent.changeText(screen.getByLabelText("Timestamp"), "2:00");
    fireEvent.changeText(screen.getByLabelText("Question"), "New prompt");
    fireEvent.changeText(screen.getByLabelText("Option 1"), "one");
    fireEvent.changeText(screen.getByLabelText("Option 2"), "two");
    fireEvent.press(screen.getByText("Save question"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/sessions/12/video-questions", {
        atSeconds: 120,
        prompt: "New prompt",
        options: ["one", "two"],
        correctIndex: 0,
        points: 1,
      }),
    );
  });

  it("refuses a timestamp the parser rejects, before any request", async () => {
    get.mockImplementation((url: string) =>
      url === "/api/v1/sessions/12"
        ? Promise.resolve({ data: { data: sessionDetail } })
        : Promise.resolve({ data: { data: { questions: [] } } }),
    );

    renderWithProviders(<SessionDetailScreen />);
    fireEvent.press(await screen.findByText("Add question"));
    // ":30" is 30 seconds in v1 because Number("") is 0 — a typo that parsed.
    fireEvent.changeText(screen.getByLabelText("Timestamp"), ":30");
    fireEvent.changeText(screen.getByLabelText("Question"), "New prompt");
    fireEvent.changeText(screen.getByLabelText("Option 1"), "one");
    fireEvent.changeText(screen.getByLabelText("Option 2"), "two");
    fireEvent.press(screen.getByText("Save question"));

    await waitFor(() => expect(post).not.toHaveBeenCalled());
    expect(screen.getByLabelText("Timestamp").props.accessibilityHint).toContain("m:ss");
  });
});
