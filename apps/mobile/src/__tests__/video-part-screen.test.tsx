import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn() },
}));
jest.mock("../design/ui/toaster", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
  Toaster: () => null,
}));

// The leave guard: the screen registers it through usePreventRemove; the test plays the navigator.
const mockDispatch = jest.fn();
const mockGuard: { prevent: boolean; onLeave: ((e: { data: { action: unknown } }) => void) | null } = {
  prevent: false,
  onLeave: null,
};
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "41", partId: "1" }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useNavigation: () => ({ dispatch: mockDispatch }),
  usePreventRemove: (prevent: boolean, onLeave: (e: { data: { action: unknown } }) => void) => {
    mockGuard.prevent = prevent;
    mockGuard.onLeave = onLeave;
  },
}));

// A player that is ready on mount, reads the playhead from `mockClock` and records seeks.
const mockSeekTo = jest.fn();
const mockClock = { now: 0 };
jest.mock("react-native-youtube-iframe", () => {
  const { forwardRef, useEffect, useImperativeHandle } = require("react");
  const Player = forwardRef(({ onReady }: { onReady?: () => void }, ref: unknown) => {
    useImperativeHandle(ref, () => ({
      getCurrentTime: () => Promise.resolve(mockClock.now),
      getDuration: () => Promise.resolve(1080),
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

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { assignmentDetail, essayWork, forumWork, videoPart, videoWork } from "./helpers/assignment-fixtures";
import { renderStacked } from "./helpers/render";
import { makeSession } from "./helpers/session";

import PartScreen from "../../app/(app)/assignment/[id]/part/[partId]";

const get = apiClient.get as jest.Mock;
const put = apiClient.put as jest.Mock;

const PROGRESS_URL = "/api/v1/assignments/41/parts/1/video/progress";

function partVideo(over: Record<string, unknown> = {}) {
  return {
    videoId: videoPart.videoId,
    youtubeUrl: videoPart.youtubeUrl,
    questions: [],
    furthestSeconds: 300,
    completedAt: null,
    earnedPoints: 0,
    totalPoints: 0,
    answeredCount: 0,
    nextQuestionId: null,
    title: videoPart.title,
    durationSeconds: 1080,
    blockSkipping: false,
    watchedSeconds: 300,
    watchedIntervals: [[0, 300]],
    ...over,
  };
}

function serve(video: ReturnType<typeof partVideo>, watched = 300, blockSkipping = false) {
  get.mockImplementation((url: string) => {
    if (url === "/api/v1/assignments/41") {
      return Promise.resolve({
        data: {
          data: assignmentDetail([videoWork(watched), essayWork("DRAFT", 0), forumWork(false)], {
            parts: [{ ...videoPart, blockSkipping }],
          }),
        },
      });
    }
    if (url === "/api/v1/assignments/41/parts/1/video") return Promise.resolve({ data: { data: video } });
    return Promise.reject(new Error(`unexpected read ${url}`));
  });
}

const wait = (ms: number) => act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));

/** Lays the track out 300 wide and taps it `fraction` of the way along. */
function tapTrack(fraction: number) {
  const track = screen.getByLabelText("Video progress");
  fireEvent(track, "layout", { nativeEvent: { layout: { width: 300 } } });
  fireEvent.press(track, { nativeEvent: { locationX: 300 * fraction } });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockClock.now = 0;
  mockGuard.prevent = false;
  mockGuard.onLeave = null;
  put.mockResolvedValue({
    data: {
      data: {
        watchedSeconds: 302,
        durationSeconds: 1080,
        answered: 0,
        questionCount: 0,
        correct: 0,
        furthestSeconds: 302,
        completedAt: null,
      },
    },
  });
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }, { id: 9 }));
});

describe("video part screen", () => {
  it("shows the video's title and how much of it counts, in words", async () => {
    serve(partVideo());
    renderStacked(<PartScreen />);
    expect(await screen.findByText("Watched 5 of 18 min", {}, { timeout: 5000 })).toBeTruthy();
    expect(screen.getByText("Luke 15 talk")).toBeTruthy();
    expect(screen.getByText("It counts once you've watched at least 90% of it.")).toBeTruthy();
  });

  it("with blockSkipping a forward seek past furthest snaps back", async () => {
    serve(partVideo({ blockSkipping: true, furthestSeconds: 120, watchedSeconds: 120 }), 120, true);
    renderStacked(<PartScreen />);
    // The player waits for the part video's own read.
    await screen.findByText(/^Watched/, {}, { timeout: 5000 });
    await waitFor(() => expect(mockSeekTo).toHaveBeenCalledWith(120, true)); // the resume
    mockSeekTo.mockClear();

    tapTrack(1);
    expect(mockSeekTo).toHaveBeenLastCalledWith(120, true);
    // Rewinding is always allowed.
    tapTrack(0.05);
    expect(mockSeekTo).toHaveBeenLastCalledWith(54, true);
  });

  it("with skipping allowed, a forward seek goes where it was asked", async () => {
    serve(partVideo({ furthestSeconds: 120, watchedSeconds: 120 }), 120);
    renderStacked(<PartScreen />);
    // The player waits for the part video's own read.
    await screen.findByText(/^Watched/, {}, { timeout: 5000 });
    await waitFor(() => expect(mockSeekTo).toHaveBeenCalled());
    tapTrack(0.5);
    expect(mockSeekTo).toHaveBeenLastCalledWith(540, true);
  });

  it("reports the stretch that played when paused", async () => {
    serve(partVideo({ furthestSeconds: 0, watchedSeconds: 0, watchedIntervals: [] }), 0);
    renderStacked(<PartScreen />);
    // The player waits for the part video's own read.
    await screen.findByText(/^Watched/, {}, { timeout: 5000 });
    fireEvent.press(screen.getByRole("button", { name: "Play" }));
    for (const t of [10, 11, 12]) {
      mockClock.now = t;
      await wait(450);
    }
    fireEvent.press(screen.getByRole("button", { name: "Pause" }));
    await waitFor(() => expect(put).toHaveBeenCalledWith(PROGRESS_URL, { intervals: [[10, 12]], position: 12 }));
  });

  it("leaving a part-watched video shows Not finished yet with Keep watching and Leave", async () => {
    serve(partVideo());
    renderStacked(<PartScreen />);
    // The player waits for the part video's own read.
    await screen.findByText(/^Watched/, {}, { timeout: 5000 });
    expect(mockGuard.prevent).toBe(true);

    const action = { type: "GO_BACK" };
    act(() => mockGuard.onLeave?.({ data: { action } }));
    expect(await screen.findByText("Not finished yet")).toBeTruthy();
    expect(screen.getByText("5 of 18 min watched. You can't submit until you've watched it.")).toBeTruthy();

    fireEvent.press(screen.getByText("Keep watching"));
    await waitFor(() => expect(screen.queryByText("Not finished yet")).toBeNull());
    expect(mockDispatch).not.toHaveBeenCalled();

    act(() => mockGuard.onLeave?.({ data: { action } }));
    fireEvent.press(await screen.findByText("Leave"));
    expect(mockDispatch).toHaveBeenCalledWith(action);
  });

  it("a watched video leaves without a notice", async () => {
    serve(partVideo({ watchedSeconds: 1000, furthestSeconds: 1000, watchedIntervals: [[0, 1000]] }), 1000);
    renderStacked(<PartScreen />);
    expect(await screen.findByText("Watched", {}, { timeout: 5000 })).toBeTruthy();
    expect(mockGuard.prevent).toBe(false);
  });

  it("a finished season plays the video but records nothing and never asks before leaving", async () => {
    get.mockImplementation((url: string) =>
      Promise.resolve({
        data: {
          data:
            url === "/api/v1/assignments/41"
              ? assignmentDetail([videoWork(300)], { parts: [videoPart], readOnly: true })
              : partVideo(),
        },
      }),
    );
    renderStacked(<PartScreen />);
    expect(await screen.findByText(/^Watched/, {}, { timeout: 5000 })).toBeTruthy();
    expect(mockGuard.prevent).toBe(false);
    fireEvent.press(screen.getByRole("button", { name: "Play" }));
    mockClock.now = 1;
    await wait(450);
    mockClock.now = 2;
    await wait(450);
    fireEvent.press(screen.getByRole("button", { name: "Pause" }));
    await wait(50);
    expect(put).not.toHaveBeenCalled();
  });

  it("a video that can't play in the app says so and links out", async () => {
    serve(partVideo({ videoId: null }));
    renderStacked(<PartScreen />);
    expect(await screen.findByText("Watch on YouTube", {}, { timeout: 5000 })).toBeTruthy();
    expect(screen.getByText("This video can't be played in the app, so watching it there won't count.")).toBeTruthy();
  });
});
