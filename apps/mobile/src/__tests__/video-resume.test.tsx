import { act, fireEvent, screen } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), put: jest.fn() },
}));
jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn() }) }));

// A player that reports ready on mount and records the seeks the component asks for.
const mockSeekTo = jest.fn();
const mockPlayVideo = jest.fn();
const mockPauseVideo = jest.fn();
const mockSetRate = jest.fn();
const mockReport: { current?: (state: string) => void } = {};
jest.mock("react-native-youtube-iframe", () => {
  const { forwardRef, useEffect, useImperativeHandle } = require("react");
  const Player = forwardRef(
    ({ onReady, onChangeState }: { onReady?: () => void; onChangeState?: (state: string) => void }, ref: unknown) => {
      mockReport.current = onChangeState;
      useImperativeHandle(ref, () => ({
        getCurrentTime: () => Promise.resolve(0),
        getDuration: () => Promise.resolve(600),
        seekTo: mockSeekTo,
        playVideo: mockPlayVideo,
        pauseVideo: mockPauseVideo,
        setPlaybackRate: mockSetRate,
      }));
      useEffect(() => {
        onReady?.();
      }, [onReady]);
      return null;
    },
  );
  Player.displayName = "ReadyPlayer";
  return { __esModule: true, default: Player };
});

import { VideoQuizPlayer } from "../screens/video-quiz/video-quiz-player";
import { renderWithProviders } from "./helpers/render";

const question = (id: number, atSeconds: number) => ({
  id,
  atSeconds,
  prompt: `Q${id}`,
  options: ["a", "b"],
  points: 1,
  answered: false,
  selectedIndex: null,
  isCorrect: null,
});

const quizWith = (over: Record<string, unknown>) => ({
  videoId: "dQw4w9WgXcQ",
  youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  questions: [question(1, 30), question(2, 90)],
  furthestSeconds: 0,
  completedAt: null,
  earnedPoints: 0,
  totalPoints: 2,
  answeredCount: 0,
  nextQuestionId: 1,
  ...over,
});

beforeEach(() => jest.clearAllMocks());

/** The resume waits for Play: a seek on a player that hasn't started yet starts it (2026-11-15). */
async function resumesAt(seconds: number) {
  await act(async () => {});
  expect(mockSeekTo).not.toHaveBeenCalled();
  expect(mockPlayVideo).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole("button", { name: "Play" }));
  expect(mockSeekTo).toHaveBeenCalledWith(seconds, true);
  expect(mockPlayVideo).toHaveBeenCalledTimes(1);
}

describe("VideoQuizPlayer resume (REG-92)", () => {
  it("seeks to the furthest position when it is before the barrier", async () => {
    renderWithProviders(<VideoQuizPlayer sessionId={12} quiz={quizWith({ furthestSeconds: 20 })} />);
    await resumesAt(20);
  });

  it("caps the resume at the barrier question", async () => {
    renderWithProviders(<VideoQuizPlayer sessionId={12} quiz={quizWith({ furthestSeconds: 75 })} />);
    await resumesAt(30);
  });

  it("resumes at the furthest point when every question is answered (no barrier)", async () => {
    renderWithProviders(
      <VideoQuizPlayer sessionId={12} quiz={quizWith({ furthestSeconds: 75, nextQuestionId: null })} />,
    );
    await resumesAt(75);
  });

  it("started by YouTube's own play button, it still carries on where the student was", async () => {
    renderWithProviders(<VideoQuizPlayer sessionId={12} quiz={quizWith({ furthestSeconds: 20 })} />);
    await act(async () => {});
    act(() => mockReport.current?.("playing"));
    expect(mockSeekTo).toHaveBeenCalledWith(20, true);
  });

  it("does not seek on a first watch", async () => {
    renderWithProviders(<VideoQuizPlayer sessionId={12} quiz={quizWith({})} />);
    await act(async () => {});
    fireEvent.press(screen.getByRole("button", { name: "Play" }));
    expect(mockSeekTo).not.toHaveBeenCalled();
  });
});
