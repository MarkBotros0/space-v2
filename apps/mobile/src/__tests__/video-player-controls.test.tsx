import { act, fireEvent, screen } from "@testing-library/react-native";
import { Alert } from "react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), put: jest.fn() },
}));
jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn() }) }));

// A ready player whose playhead the test sets, recording seeks, speed and the link guard it was given.
let mockNow = 0;
const mockSeekTo = jest.fn();
const mockProps: { current: Record<string, unknown> } = { current: {} };
jest.mock("react-native-youtube-iframe", () => {
  const { forwardRef, useEffect, useImperativeHandle } = require("react");
  const Player = forwardRef((props: { onReady?: () => void }, ref: unknown) => {
    mockProps.current = props as Record<string, unknown>;
    useImperativeHandle(ref, () => ({
      getCurrentTime: () => Promise.resolve(mockNow),
      getDuration: () => Promise.resolve(600),
      seekTo: mockSeekTo,
    }));
    useEffect(() => {
      props.onReady?.();
    }, []);
    return null;
  });
  Player.displayName = "ControlledPlayer";
  return { __esModule: true, default: Player };
});

import { clampSeek, isYouTubeLink, nextSpeed, questionMarks, reachFraction } from "../screens/video-quiz/player-model";
import { VideoQuizPlayer } from "../screens/video-quiz/video-quiz-player";
import { youTubeLinkGuard } from "../screens/video-quiz/youtube-link-guard";
import { renderWithProviders } from "./helpers/render";

const question = (id: number, atSeconds: number, answered = false) => ({
  id,
  atSeconds,
  prompt: `Q${id}`,
  options: ["a", "b"],
  points: 1,
  answered,
  selectedIndex: null,
  isCorrect: null,
});

const quiz = {
  videoId: "dQw4w9WgXcQ",
  youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  questions: [question(1, 30, true), question(2, 300)],
  furthestSeconds: 0,
  completedAt: null,
  earnedPoints: 1,
  totalPoints: 2,
  answeredCount: 1,
  nextQuestionId: 2,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockNow = 0;
});

describe("clampSeek", () => {
  const free = { barrier: Number.POSITIVE_INFINITY, duration: 600, current: 100 };
  it("lets a seek go back, and forward to the end when nothing limits it", () => {
    expect(clampSeek(20, free)).toBe(20);
    expect(clampSeek(900, free)).toBe(600);
    expect(clampSeek(-5, free)).toBe(0);
  });
  it("stops forward at the next unanswered question", () => {
    expect(clampSeek(500, { ...free, barrier: 300 })).toBe(300);
  });
  it("with skipping blocked, stops forward at what was watched, never behind the playhead", () => {
    expect(clampSeek(500, { ...free, ceiling: 120 })).toBe(120);
    expect(clampSeek(500, { ...free, ceiling: 50 })).toBe(100);
    expect(clampSeek(10, { ...free, ceiling: 50 })).toBe(10);
  });
  it("shows the reachable stretch as a fraction", () => {
    expect(reachFraction({ ...free, ceiling: 150 })).toBe(0.25);
    expect(reachFraction({ ...free, duration: null })).toBe(0);
  });
});

describe("player rules", () => {
  it("steps the speed through 1, 1.25, 1.5, 2, 0.5, 0.75 and round", () => {
    expect([1, 1.25, 1.5, 2, 0.5, 0.75, 3].map(nextSpeed)).toEqual([1.25, 1.5, 2, 0.5, 0.75, 1, 1]);
  });
  it("marks only the unanswered questions inside the video", () => {
    expect(questionMarks([question(1, 30, true), question(2, 300), question(3, 900)], 600)).toEqual([
      { id: 2, at: 0.5 },
    ]);
  });
  it("knows a YouTube link from the player's own page", () => {
    expect(isYouTubeLink("https://www.youtube.com/watch?v=x")).toBe(true);
    expect(isYouTubeLink("https://m.youtube.com/watch?v=x")).toBe(true);
    expect(isYouTubeLink("https://youtu.be/x")).toBe(true);
    expect(isYouTubeLink("https://lonelycpp.github.io/react-native-youtube-iframe/iframe_v2.html")).toBe(false);
  });
});

describe("the YouTube link guard", () => {
  it("lets the player's page load and hands a YouTube link to the app", () => {
    const onLink = jest.fn();
    const guard = youTubeLinkGuard(onLink);
    const ask = (url: string) => guard.onShouldStartLoadWithRequest?.({ url, isTopFrame: true } as never) ?? true;
    expect(ask("https://lonelycpp.github.io/react-native-youtube-iframe/iframe_v2.html?data=1")).toBe(true);
    expect(ask("https://www.youtube.com/watch?v=x")).toBe(false);
    expect(onLink).toHaveBeenCalledWith("https://www.youtube.com/watch?v=x");
    guard.onOpenWindow?.({ nativeEvent: { targetUrl: "https://youtu.be/x" } } as never);
    expect(onLink).toHaveBeenCalledWith("https://youtu.be/x");
  });
});

describe("the app's own controls", () => {
  it("turns YouTube's controls and full screen off", async () => {
    renderWithProviders(<VideoQuizPlayer sessionId={12} quiz={quiz} />);
    await act(async () => {});
    expect(mockProps.current.initialPlayerParams).toMatchObject({ controls: false, preventFullScreen: true });
  });

  it("marks the unanswered question on the bar, and the bar stops a seek there", async () => {
    renderWithProviders(<VideoQuizPlayer sessionId={12} quiz={quiz} />);
    await act(async () => {});
    expect(screen.getAllByTestId("video-question-mark")).toHaveLength(1);
    const bar = screen.getByTestId("video-scrubber");
    // 40 steps of 10 s forward from 0: the bar never passes the question at 300.
    for (let i = 0; i < 40; i += 1) fireEvent(bar, "accessibilityAction", { nativeEvent: { actionName: "increment" } });
    const seeks = mockSeekTo.mock.calls.map(([s]) => s as number);
    expect(Math.max(...seeks)).toBe(300);
  });

  it("goes back 10 seconds and steps the speed", async () => {
    renderWithProviders(<VideoQuizPlayer sessionId={12} quiz={{ ...quiz, furthestSeconds: 95 }} />);
    await act(async () => {});
    fireEvent.press(screen.getByRole("button", { name: "Back 10 seconds" }));
    expect(mockSeekTo).toHaveBeenLastCalledWith(85, true);
    fireEvent.press(screen.getByRole("button", { name: "Speed 1x" }));
    expect(mockProps.current.playbackRate).toBe(1.25);
  });

  it("asks before the YouTube logo opens YouTube, warning that it won't count", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    renderWithProviders(<VideoQuizPlayer sessionId={12} quiz={quiz} />);
    await act(async () => {});
    const guard = mockProps.current.webViewProps as ReturnType<typeof youTubeLinkGuard>;
    act(() => {
      guard.onOpenWindow?.({ nativeEvent: { targetUrl: "https://www.youtube.com/watch?v=x" } } as never);
    });
    expect(alert).toHaveBeenCalledWith(
      "Open YouTube?",
      expect.stringContaining("doesn't count toward your progress"),
      expect.any(Array),
    );
  });
});
