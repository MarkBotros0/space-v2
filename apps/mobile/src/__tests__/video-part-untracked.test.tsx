import { screen, waitFor } from "@testing-library/react-native";

// A video part whose watching isn't tracked (owner, 2026-11-15): opening it counts, its questions
// are optional, leaving asks nothing and the bar skips freely.
jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn() },
}));
const mockGuard = { prevent: false };
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "41", partId: "1" }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  usePreventRemove: (prevent: boolean) => {
    mockGuard.prevent = prevent;
  },
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { assignmentDetail, essayWork, forumWork, videoPart, videoWork } from "./helpers/assignment-fixtures";
import { renderStacked } from "./helpers/render";
import { makeSession } from "./helpers/session";

import PartScreen from "../../app/(app)/assignment/[id]/part/[partId]";

const get = apiClient.get as jest.Mock;
const put = apiClient.put as jest.Mock;

const untracked = {
  videoId: videoPart.videoId,
  youtubeUrl: videoPart.youtubeUrl,
  questions: [
    {
      id: 5,
      atSeconds: 30,
      prompt: "Q",
      options: ["a", "b"],
      points: 1,
      answered: false,
      selectedIndex: null,
      isCorrect: null,
    },
  ],
  furthestSeconds: 0,
  completedAt: null,
  earnedPoints: 0,
  totalPoints: 1,
  answeredCount: 0,
  nextQuestionId: 5,
  title: videoPart.title,
  durationSeconds: 1080,
  blockSkipping: true,
  trackWatching: false,
  watchedSeconds: 0,
  watchedIntervals: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  get.mockImplementation((url: string) => {
    if (url === "/api/v1/assignments/41") {
      return Promise.resolve({
        data: {
          data: assignmentDetail([videoWork(0), essayWork("DRAFT", 0), forumWork(false)], {
            parts: [{ ...videoPart, trackWatching: false }],
          }),
        },
      });
    }
    if (url === "/api/v1/assignments/41/parts/1/video") return Promise.resolve({ data: { data: untracked } });
    return Promise.reject(new Error(`unexpected read ${url}`));
  });
  put.mockResolvedValue({
    data: {
      data: {
        watchedSeconds: 0,
        durationSeconds: 1080,
        answered: 0,
        questionCount: 1,
        correct: 0,
        furthestSeconds: 0,
        completedAt: "2026-11-15T10:00:00.000Z",
      },
    },
  });
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }, { id: 9 }));
});

describe("a video part that doesn't track watching", () => {
  it("reports the opening, says opening counts and the questions are optional, and never holds the student", async () => {
    renderStacked(<PartScreen />);
    expect(await screen.findByText("Opening this video counts", {}, { timeout: 5000 })).toBeTruthy();
    expect(screen.getByText("0 of 1 question answered. The questions are optional.")).toBeTruthy();
    expect(screen.queryByText(/^Watched/)).toBeNull();
    expect(screen.queryByText("You can't skip ahead in this video.")).toBeNull();
    await waitFor(() =>
      expect(put).toHaveBeenCalledWith("/api/v1/assignments/41/parts/1/video/progress", { intervals: [], position: 0 }),
    );
    expect(mockGuard.prevent).toBe(false);
  });
});
