import { fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import type * as ReactModule from "react";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
// Like react-native-youtube-iframe 2.4.1: onReady fires once, on mount; a new
// videoId on a ready player loads that video without firing onReady again.
// A 10-minute video, or 15 minutes for OTHER_ID.
jest.mock("react-native-youtube-iframe", () => {
  const { forwardRef, useEffect, useImperativeHandle, useRef } = jest.requireActual<typeof ReactModule>("react");
  const Player = forwardRef((props: { videoId: string; onReady?: () => void }, ref) => {
    const videoId = useRef(props.videoId);
    videoId.current = props.videoId;
    useImperativeHandle(ref, () => ({
      getDuration: () => Promise.resolve(videoId.current === "9bZkp7q19f0" ? 900 : 600.4),
      seekTo: () => undefined,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => props.onReady?.(), []);
    return null;
  });
  Player.displayName = "MockReadyPlayer";
  return {
    __esModule: true,
    default: Player,
    getYoutubeMeta: jest.fn(() => Promise.resolve({ title: "The prodigal son, a talk" })),
  };
});
import { apiClient } from "../lib/api-client";
import { renderWithProviders } from "./helpers/render";
import { VideoPartSheet } from "../screens/assignment-form/part-sheets/video-part-sheet";

const get = apiClient.get as jest.Mock;
const LINK = "https://youtu.be/dQw4w9WgXcQ";
const OTHER_LINK = "https://youtu.be/9bZkp7q19f0";

beforeEach(() => jest.clearAllMocks());

function open(props: Partial<Parameters<typeof VideoPartSheet>[0]> = {}) {
  const onSave = jest.fn();
  const onClose = jest.fn();
  renderWithProviders(
    <VideoPartSheet open initial={null} assignmentId={null} onSave={onSave} onClose={onClose} {...props} />,
  );
  return { onSave, onClose };
}
const bar = () => within(screen.getByTestId("sheet-save-bar"));

describe("VideoPartSheet", () => {
  it("shows the player once the link parses, and an inline error when it doesn't", async () => {
    open();
    fireEvent.changeText(screen.getByLabelText("YouTube link"), "not a link");
    expect(screen.getByLabelText("YouTube link").props.accessibilityHint).toBe("That isn't a YouTube link");
    expect(screen.queryByTestId("part-video-player")).toBeNull();

    fireEvent.changeText(screen.getByLabelText("YouTube link"), LINK);
    expect(screen.getByLabelText("YouTube link").props.accessibilityHint).toBeUndefined();
    expect(screen.getByTestId("part-video-player")).toBeTruthy();
    expect(await screen.findByText("Length 10:00")).toBeTruthy();
  });

  it("defaults the title to YouTube's and saves the length the player reports", async () => {
    const { onSave, onClose } = open();
    fireEvent.changeText(screen.getByLabelText("YouTube link"), LINK);
    expect(await screen.findByDisplayValue("The prodigal son, a talk")).toBeTruthy();
    await screen.findByText("Length 10:00");
    fireEvent.press(screen.getByLabelText("Don't let students skip ahead"));
    fireEvent.press(bar().getByText("Add video"));

    expect(onSave).toHaveBeenCalledWith({
      kind: "VIDEO",
      title: "The prodigal son, a talk",
      youtubeUrl: LINK,
      blockSkipping: true,
      durationSeconds: 600,
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("switching the link from one video to another reads the new video's length, and saves it", async () => {
    const { onSave } = open();
    fireEvent.changeText(screen.getByLabelText("YouTube link"), LINK);
    await screen.findByText("Length 10:00");
    fireEvent.changeText(screen.getByLabelText("YouTube link"), OTHER_LINK);
    expect(await screen.findByText("Length 15:00")).toBeTruthy();
    fireEvent.press(bar().getByText("Add video"));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ youtubeUrl: OTHER_LINK, durationSeconds: 900 }));
  });

  it("refuses to save without a link, saying so on the field", () => {
    const { onSave } = open();
    fireEvent.press(bar().getByText("Add video"));
    expect(screen.getByLabelText("YouTube link").props.accessibilityHint).toBe("Paste a YouTube link");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("keeps a typed title, and asks to save the assignment before timed questions on a new part", async () => {
    open();
    fireEvent.changeText(screen.getByLabelText("Title"), "My title");
    fireEvent.changeText(screen.getByLabelText("YouTube link"), LINK);
    await screen.findByText("Length 10:00");
    expect(screen.getByDisplayValue("My title")).toBeTruthy();
    expect(screen.getByText("Save the assignment first, then add timed questions to this video.")).toBeTruthy();
  });

  it("edits a saved part's timed questions on the part's own path", async () => {
    get.mockResolvedValue({ data: { data: { questions: [] } } });
    open({
      assignmentId: 55,
      initial: {
        key: "part-11",
        id: 11,
        kind: "VIDEO",
        title: "Luke 15 talk",
        youtubeUrl: LINK,
        blockSkipping: false,
        durationSeconds: 1080,
      },
    });
    expect(screen.getByDisplayValue("Luke 15 talk")).toBeTruthy();
    expect(bar().getByText("Save video")).toBeTruthy();
    await waitFor(() => expect(get).toHaveBeenCalledWith("/api/v1/assignments/55/parts/11/video-questions"));
    expect(await screen.findByText("No questions yet.")).toBeTruthy();
  });
});
