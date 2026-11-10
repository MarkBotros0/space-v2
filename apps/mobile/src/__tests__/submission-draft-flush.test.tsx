import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { AppState, ScrollView, type AppStateStatus } from "react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn() },
}));
jest.mock("../design/ui/toaster", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
  Toaster: () => null,
}));
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "41", partId: "2" }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

import { toast } from "../design/ui/toaster";
import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { assignmentDetail, essayDetail, essayPart, essayWork, words } from "./helpers/assignment-fixtures";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";
import PartScreen from "../../app/(app)/assignment/[id]/part/[partId]";

const get = apiClient.get as jest.Mock;
const put = apiClient.put as jest.Mock;
const post = apiClient.post as jest.Mock;

const URL = "/api/v1/assignments/41/parts/2/essay";
const PROMPT = essayPart.prompt;
const FAILED = "Your draft wasn't saved. Check your connection.";
const rejected = (status: number) =>
  Object.assign(new Error(String(status)), { isAxiosError: true, response: { status, data: {} } });
const saved = { data: { data: { publicId: "essay00001", wordCount: 2, reviewStatus: "DRAFT" } } };
const handedIn = { data: { data: { reviewStatus: "SUBMITTED", assignmentSubmitted: true } } };

type Status = "DRAFT" | "RETURNED" | "SUBMITTED";

function serve(status: Status = "DRAFT", text = "first draft") {
  get.mockImplementation((url: string) =>
    Promise.resolve({
      data: {
        data:
          url === "/api/v1/assignments/41"
            ? assignmentDetail([essayWork(status, 2, status === "RETURNED" ? "More." : null)], { parts: [essayPart] })
            : essayDetail(status, text, { feedback: status === "RETURNED" ? "More." : null }),
      },
    }),
  );
}

const open = () => renderWithProviders(<PartScreen />);
const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 10)));

beforeEach(() => {
  jest.clearAllMocks();
  put.mockReset();
  post.mockReset();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }, { id: 9 }));
});

describe("leaving the essay saves what was written", () => {
  it("Back with typed text saves the draft, without a toast", async () => {
    serve();
    put.mockResolvedValue(saved);
    const view = open();
    fireEvent.changeText(await screen.findByLabelText(PROMPT), "my essay");
    expect(put).not.toHaveBeenCalled();

    view.unmount();
    await waitFor(() => expect(put).toHaveBeenCalledWith(URL, { text: "my essay" }));
    await settle();
    expect(put).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("a returned essay is flushed too", async () => {
    serve("RETURNED");
    put.mockResolvedValue(saved);
    const view = open();
    fireEvent.changeText(await screen.findByLabelText(PROMPT), "revised");
    view.unmount();
    await waitFor(() => expect(put).toHaveBeenCalledWith(URL, { text: "revised" }));
  });

  it.each([
    ["nothing was typed", undefined],
    ["the text is back to the server's", "first draft"],
    ["the text is blank", "   "],
  ])("sends nothing when %s", async (_name, typed) => {
    serve();
    const view = open();
    const input = await screen.findByLabelText(PROMPT);
    if (typed !== undefined) fireEvent.changeText(input, typed);
    view.unmount();
    await settle();
    expect(put).not.toHaveBeenCalled();
  });

  it("sends nothing when the essay is handed in", async () => {
    serve("SUBMITTED");
    const view = open();
    expect(await screen.findByText("first draft")).toBeTruthy();
    view.unmount();
    await settle();
    expect(put).not.toHaveBeenCalled();
  });

  it("sends nothing more after Save draft", async () => {
    serve();
    put.mockResolvedValue(saved);
    const view = open();
    fireEvent.changeText(await screen.findByLabelText(PROMPT), "saved text");
    fireEvent.press(screen.getByText("Save draft"));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Draft saved."));

    view.unmount();
    await settle();
    expect(put).toHaveBeenCalledTimes(1);
  });

  it("sends what was typed after Save draft", async () => {
    serve();
    put.mockResolvedValue(saved);
    const view = open();
    const input = await screen.findByLabelText(PROMPT);
    fireEvent.changeText(input, "saved text");
    fireEvent.press(screen.getByText("Save draft"));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Draft saved."));
    fireEvent.changeText(input, "saved text, and more");

    view.unmount();
    await waitFor(() => expect(put).toHaveBeenCalledTimes(2));
    expect(put).toHaveBeenLastCalledWith(URL, { text: "saved text, and more" });
  });

  it("a slower save can't overwrite newer text: writes go out in order", async () => {
    serve();
    let finishFirst!: (v: unknown) => void;
    put.mockReturnValueOnce(new Promise((resolve) => (finishFirst = resolve)));
    put.mockResolvedValue(saved);
    const view = open();
    const input = await screen.findByLabelText(PROMPT);
    fireEvent.changeText(input, "older");
    fireEvent.press(screen.getByText("Save draft"));
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    fireEvent.changeText(input, "newer");

    view.unmount();
    await settle();
    expect(put).toHaveBeenCalledTimes(1);
    await act(async () => finishFirst(saved));
    await waitFor(() => expect(put).toHaveBeenLastCalledWith(URL, { text: "newer" }));
  });

  it("re-opening while a flush is in flight: the new save waits for it", async () => {
    serve();
    let finishFlush: (value: unknown) => void = () => undefined;
    put.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishFlush = resolve;
        }),
    );
    put.mockResolvedValue(saved);
    const first = open();
    fireEvent.changeText(await screen.findByLabelText(PROMPT), "older");
    first.unmount();
    await waitFor(() => expect(put).toHaveBeenCalledWith(URL, { text: "older" }));

    open();
    fireEvent.changeText(await screen.findByLabelText(PROMPT), "newer");
    fireEvent.press(screen.getByText("Save draft"));
    await settle();
    expect(put).toHaveBeenCalledTimes(1);

    await act(async () => finishFlush(saved));
    await waitFor(() => expect(put).toHaveBeenLastCalledWith(URL, { text: "newer" }));
  });

  it("does not flush after Hand in again, even with the hand-in still in flight", async () => {
    serve("RETURNED", words(160));
    put.mockResolvedValue(saved);
    let finish!: (v: unknown) => void;
    post.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    const view = open();
    fireEvent.changeText(await screen.findByLabelText(PROMPT), words(170));
    fireEvent.press(screen.getByText("Hand in again"));
    fireEvent.press(await screen.findByText("Yes, hand it in"));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    fireEvent.changeText(screen.getByLabelText(PROMPT), "typed after");

    view.unmount();
    await settle();
    expect(put).toHaveBeenCalledTimes(1);
    await act(async () => finish(handedIn));
    await settle();
    expect(put).toHaveBeenCalledTimes(1);
    // The answer still reaches the student, though the screen is gone.
    expect(toast.success).toHaveBeenCalledWith("Handed in again.");
  });

  it("a failed hand-in doesn't count as handed in: leaving saves the text", async () => {
    serve("RETURNED", words(160));
    put.mockResolvedValue(saved);
    post.mockRejectedValueOnce(new Error("Network Error"));
    const view = open();
    fireEvent.changeText(await screen.findByLabelText(PROMPT), words(165));
    fireEvent.press(screen.getByText("Hand in again"));
    fireEvent.press(await screen.findByText("Yes, hand it in"));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    fireEvent.changeText(screen.getByLabelText(PROMPT), words(166));

    view.unmount();
    await waitFor(() => expect(put).toHaveBeenLastCalledWith(URL, { text: words(166) }));
  });

  it("a flush that fails after leaving says so in a toast", async () => {
    serve();
    put.mockRejectedValue(new Error("Network Error"));
    const view = open();
    fireEvent.changeText(await screen.findByLabelText(PROMPT), "my essay");
    view.unmount();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(FAILED));
  });
});

describe("an essay returned while the screen stays open", () => {
  it("becomes editable again on a pull, and is flushed", async () => {
    let status: Status = "SUBMITTED";
    get.mockImplementation((url: string) =>
      Promise.resolve({
        data: {
          data:
            url === "/api/v1/assignments/41"
              ? assignmentDetail([essayWork(status, 2)], { parts: [essayPart] })
              : essayDetail(status, "final"),
        },
      }),
    );
    put.mockResolvedValue(saved);
    const view = open();
    expect(await screen.findByText("final")).toBeTruthy();
    expect(screen.queryByLabelText(PROMPT)).toBeNull();

    // The leader sends it back; the student pulls, then rewrites.
    status = "RETURNED";
    await act(async () => {
      screen.UNSAFE_getByType(ScrollView).props.refreshControl.props.onRefresh();
    });
    fireEvent.changeText(await screen.findByLabelText(PROMPT), "revised");
    view.unmount();
    await waitFor(() => expect(put).toHaveBeenLastCalledWith(URL, { text: "revised" }));
    expect(put).toHaveBeenCalledTimes(1);
  });
});

describe("a flush the server refused doesn't blame the connection", () => {
  it.each([
    [409, "Your draft wasn't saved. This assignment can't be edited any more."],
    [500, "Your draft wasn't saved."],
    [403, "Your draft wasn't saved."],
  ])("status %s", async (status, message) => {
    serve();
    put.mockRejectedValue(rejected(status));
    const view = open();
    fireEvent.changeText(await screen.findByLabelText(PROMPT), "my essay");
    view.unmount();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(message));
  });
});

describe("backgrounding saves what was written", () => {
  function background() {
    const listeners: ((s: AppStateStatus) => void)[] = [];
    const spy = jest.spyOn(AppState, "addEventListener").mockImplementation((_type, fn) => {
      listeners.push(fn as (s: AppStateStatus) => void);
      return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
    });
    return {
      spy,
      send: (state: AppStateStatus) =>
        act(async () => {
          for (const fn of listeners) fn(state);
        }),
    };
  }

  it("flushes once, and a later Back doesn't send it again", async () => {
    const app = background();
    serve();
    put.mockResolvedValue(saved);
    const view = open();
    fireEvent.changeText(await screen.findByLabelText(PROMPT), "my essay");

    await app.send("inactive");
    await app.send("background");
    await waitFor(() => expect(put).toHaveBeenCalledWith(URL, { text: "my essay" }));
    view.unmount();
    await settle();
    expect(put).toHaveBeenCalledTimes(1);
    app.spy.mockRestore();
  });

  it("a failed background flush is tried again next time, and coming back sends nothing", async () => {
    const app = background();
    serve();
    put.mockRejectedValueOnce(new Error("Network Error"));
    put.mockResolvedValue(saved);
    const view = open();
    fireEvent.changeText(await screen.findByLabelText(PROMPT), "my essay");

    await app.send("background");
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(FAILED));
    await app.send("active");
    expect(put).toHaveBeenCalledTimes(1);

    view.unmount();
    await waitFor(() => expect(put).toHaveBeenCalledTimes(2));
    app.spy.mockRestore();
  });
});
