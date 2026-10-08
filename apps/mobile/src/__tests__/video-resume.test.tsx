import { act } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), put: jest.fn() },
}));
jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn() }) }));

// A player that reports ready on mount and records the seeks the component asks for.
const mockSeekTo = jest.fn();
jest.mock("react-native-youtube-iframe", () => {
  const { forwardRef, useEffect, useImperativeHandle } = require("react");
  const Player = forwardRef(({ onReady }: { onReady?: () => void }, ref: unknown) => {
    useImperativeHandle(ref, () => ({
      getCurrentTime: () => Promise.resolve(0),
      getDuration: () => Promise.resolve(600),
      seekTo: mockSeekTo,
    }));
    useEffect(() => {
      onReady?.();
    }, [onReady]);
    return null;
  });
  Player.displayName = "ReadyPlayer";
  return { __esModule: true, default: Player };
});

import { VideoQuizPlayer } from "../components/VideoQuizPlayer";
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

describe("VideoQuizPlayer resume (REG-92)", () => {
  it("seeks to the furthest position when it is before the barrier", async () => {
    renderWithProviders(
      <VideoQuizPlayer sessionId={12} quiz={quizWith({ furthestSeconds: 20 })} />,
    );
    await act(async () => {});
    expect(mockSeekTo).toHaveBeenCalledWith(20, true);
  });

  it("caps the resume at the barrier question", async () => {
    renderWithProviders(
      <VideoQuizPlayer sessionId={12} quiz={quizWith({ furthestSeconds: 75 })} />,
    );
    await act(async () => {});
    expect(mockSeekTo).toHaveBeenCalledWith(30, true);
  });

  it("resumes at the furthest point when every question is answered (no barrier)", async () => {
    renderWithProviders(
      <VideoQuizPlayer
        sessionId={12}
        quiz={quizWith({ furthestSeconds: 75, nextQuestionId: null })}
      />,
    );
    await act(async () => {});
    expect(mockSeekTo).toHaveBeenCalledWith(75, true);
  });

  it("does not seek on a first watch", async () => {
    renderWithProviders(<VideoQuizPlayer sessionId={12} quiz={quizWith({})} />);
    await act(async () => {});
    expect(mockSeekTo).not.toHaveBeenCalled();
  });
});
