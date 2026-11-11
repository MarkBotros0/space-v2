import { act, fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import { Keyboard } from "react-native";

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

import type { PartWork } from "@space/shared";

import { toast } from "../design/ui/toaster";
import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import {
  assignmentDetail,
  essayDetail,
  essayPart,
  essayWork,
  forumWork,
  videoWork,
  words,
} from "./helpers/assignment-fixtures";
import { renderStacked } from "./helpers/render";
import { makeSession } from "./helpers/session";

import PartScreen from "../../app/(app)/assignment/[id]/part/[partId]";

const get = apiClient.get as jest.Mock;
const put = apiClient.put as jest.Mock;
const post = apiClient.post as jest.Mock;

const PROMPT = essayPart.prompt;
const ESSAY_URL = "/api/v1/assignments/41/parts/2/essay";
const draftSaved = { data: { data: { publicId: "essay00001", wordCount: 3, reviewStatus: "DRAFT" } } };

/** The assignment with this essay work (none: never saved), and the essay as GET /submissions answers it. */
function serve(
  essay: PartWork | null,
  submission: ReturnType<typeof essayDetail> | null = null,
  over: Parameters<typeof assignmentDetail>[1] = {},
) {
  const works = [videoWork(0), ...(essay ? [essay] : []), forumWork(false)];
  get.mockImplementation((url: string) => {
    if (url === "/api/v1/assignments/41") return Promise.resolve({ data: { data: assignmentDetail(works, over) } });
    if (url === "/api/v1/submissions/essay00001") return Promise.resolve({ data: { data: submission } });
    return Promise.reject(new Error(`unexpected read ${url}`));
  });
}

const bar = () => within(screen.getByTestId("save-bar"));
const countText = () => screen.getByTestId("essay-count");

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }, { id: 9 }));
});

describe("essay part screen", () => {
  it("the question labels the box, and nothing is read or made before the first save", async () => {
    serve(null);
    renderStacked(<PartScreen />);
    expect(await screen.findByLabelText(PROMPT)).toBeTruthy();
    expect(screen.getByText(PROMPT)).toBeTruthy();
    expect(get).not.toHaveBeenCalledWith("/api/v1/submissions/essay00001");
    expect(put).not.toHaveBeenCalled();
    expect(bar().getByRole("button", { name: "Save draft" })).toBeTruthy();
    expect(bar().queryByRole("button", { name: "Hand in again" })).toBeNull();
  });

  it("the essay count reads '142 words · 150–300' as one unbreakable run and turns to '8 over the limit' in the bad tone", async () => {
    serve(null);
    renderStacked(<PartScreen />);
    fireEvent.changeText(await screen.findByLabelText(PROMPT), words(142));

    const count = countText();
    const text = String(count.props.children);
    expect(text.replace(/[\u00a0\u2060]/g, (c) => (c === "\u00a0" ? " " : ""))).toBe("142 words · 150–300");
    // No plain space or bare dash for a line to break at.
    expect(text).not.toMatch(/ /);
    expect(text).toContain("\u2060–\u2060");
    expect(count.props.className).not.toMatch(/text-bad/);

    fireEvent.changeText(screen.getByLabelText(PROMPT), words(308));
    expect(String(countText().props.children)).toBe("8 over the limit");
    expect(countText().props.className).toMatch(/text-bad/);
  });

  it("counts like the server: on the plain text", async () => {
    serve(null);
    renderStacked(<PartScreen />);
    fireEvent.changeText(await screen.findByLabelText(PROMPT), "un<i>believ</i>able Tom &amp; Jerry");
    expect(String(countText().props.children)).toMatch(/^4\u00a0words/);
  });

  it("Save draft puts the text on the part and says so", async () => {
    serve(null);
    put.mockResolvedValue(draftSaved);
    renderStacked(<PartScreen />);
    fireEvent.changeText(await screen.findByLabelText(PROMPT), "my first words");
    fireEvent.press(bar().getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(put).toHaveBeenCalledWith(ESSAY_URL, { text: "my first words" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Draft saved."));
  });

  it("loads a saved draft's text from the essay", async () => {
    serve(essayWork("DRAFT", 3), essayDetail("DRAFT", "a saved draft"));
    renderStacked(<PartScreen />);
    expect(await screen.findByDisplayValue("a saved draft")).toBeTruthy();
    expect(bar().getByText("Your essay goes to your leader when you submit the assignment.")).toBeTruthy();
  });

  it("a failed save shows the server's message and keeps what was typed", async () => {
    serve(null);
    put.mockRejectedValue(
      Object.assign(new Error("409"), {
        isAxiosError: true,
        response: {
          status: 409,
          data: { error: { code: "submission_locked", message: "This essay is already handed in." } },
        },
      }),
    );
    renderStacked(<PartScreen />);
    fireEvent.changeText(await screen.findByLabelText(PROMPT), "kept text");
    fireEvent.press(bar().getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("This essay is already handed in."));
    expect(screen.getByDisplayValue("kept text")).toBeTruthy();
  });

  it("a returned essay shows the note and Hand in again", async () => {
    const text = words(160);
    serve(
      essayWork("RETURNED", 160, "Say more about the father."),
      essayDetail("RETURNED", text, { feedback: "Say more about the father." }),
    );
    post.mockResolvedValue({ data: { data: { reviewStatus: "SUBMITTED", assignmentSubmitted: true } } });
    renderStacked(<PartScreen />);

    expect(await screen.findByText("Say more about the father.")).toBeTruthy();
    expect(screen.getByText("Your leader's note")).toBeTruthy();
    expect(screen.getByText("Returned — needs changes")).toBeTruthy();
    expect(screen.getByDisplayValue(text)).toBeTruthy();

    fireEvent.press(bar().getByRole("button", { name: "Hand in again" }));
    fireEvent.press(await screen.findByText("Yes, hand it in"));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/submissions/essay00001/hand-in"));
    // The text was the server's: nothing to save first.
    expect(put).not.toHaveBeenCalled();
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Handed in again."));
  });

  it("Hand in again saves the rewrite first, then hands it in", async () => {
    serve(essayWork("RETURNED", 160, "More."), essayDetail("RETURNED", words(160), { feedback: "More." }));
    put.mockResolvedValue(draftSaved);
    post.mockResolvedValue({ data: { data: { reviewStatus: "SUBMITTED", assignmentSubmitted: true } } });
    renderStacked(<PartScreen />);
    fireEvent.changeText(await screen.findByLabelText(PROMPT), words(170));
    fireEvent.press(bar().getByRole("button", { name: "Hand in again" }));
    fireEvent.press(await screen.findByText("Yes, hand it in"));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(put).toHaveBeenCalledWith(ESSAY_URL, { text: words(170) });
    expect(put.mock.invocationCallOrder[0]).toBeLessThan(post.mock.invocationCallOrder[0]!);
  });

  it("Hand in again is disabled while the count is outside the range, and says why", async () => {
    serve(essayWork("RETURNED", 160, "More."), essayDetail("RETURNED", words(160), { feedback: "More." }));
    renderStacked(<PartScreen />);
    fireEvent.changeText(await screen.findByLabelText(PROMPT), words(20));
    const handIn = bar().getByRole("button", { name: "Hand in again" });
    expect(handIn.props.accessibilityState).toMatchObject({ disabled: true });
    expect(handIn.props.accessibilityHint).toBe("This is 20 words; it needs at least 150.");
  });

  it.each([
    ["SUBMITTED", "Handed in"],
    ["REVIEWED", "Reviewed"],
  ] as const)("a %s essay is read-only: its text, its state in words, no bar", async (status, words_) => {
    serve(
      essayWork(status, 3),
      essayDetail(status, "the handed-in essay", { feedback: status === "REVIEWED" ? "Well argued." : null }),
    );
    renderStacked(<PartScreen />);
    expect(await screen.findByText("the handed-in essay")).toBeTruthy();
    expect(screen.getByText(words_)).toBeTruthy();
    expect(screen.queryByLabelText(PROMPT)).toBeNull();
    expect(screen.queryByTestId("save-bar")).toBeNull();
    if (status === "REVIEWED") expect(screen.getByText("Well argued.")).toBeTruthy();
  });

  it("a finished season shows the essay as it was left, with no bar", async () => {
    serve(essayWork("DRAFT", 3), essayDetail("DRAFT", "left as a draft"), { readOnly: true });
    renderStacked(<PartScreen />);
    expect(await screen.findByText("left as a draft")).toBeTruthy();
    expect(screen.queryByLabelText(PROMPT)).toBeNull();
    expect(screen.queryByTestId("save-bar")).toBeNull();
  });

  it("a finished season with no essay says so in words", async () => {
    serve(null, null, { readOnly: true });
    renderStacked(<PartScreen />);
    expect(await screen.findByText("You didn't write this essay.")).toBeTruthy();
  });

  it("files: an essay that takes them lists the essay work's files", async () => {
    get.mockImplementation((url: string) => {
      if (url === "/api/v1/assignments/41") {
        return Promise.resolve({
          data: {
            data: assignmentDetail([essayWork("DRAFT", 3)], { parts: [{ ...essayPart, maxFileSizeMb: 10 }] }),
          },
        });
      }
      return Promise.resolve({
        data: {
          data: essayDetail("DRAFT", "with a file", {
            maxFileSizeMb: 10,
            files: [{ id: 1, originalName: "notes.pdf", mimeType: "application/pdf", sizeBytes: 2048 }],
          }),
        },
      });
    });
    renderStacked(<PartScreen />);
    expect(await screen.findByText("notes.pdf")).toBeTruthy();
    expect(screen.getByText("FILES (MAX 10 MB EACH)")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/submissions/essay00001");
  });

  it("with the keyboard open the footer drops its hint", async () => {
    const listeners: Record<string, ((e: unknown) => void)[]> = {};
    const spy = jest.spyOn(Keyboard, "addListener").mockImplementation(((event: string, cb: never) => {
      (listeners[event] ??= []).push(cb);
      return { remove: jest.fn() };
    }) as unknown as typeof Keyboard.addListener);
    serve(null);
    renderStacked(<PartScreen />);
    await screen.findByLabelText(PROMPT);
    expect(bar().getByText(/when you submit the assignment/)).toBeTruthy();

    jest.useFakeTimers();
    act(() => {
      for (const cb of listeners.keyboardWillShow ?? listeners.keyboardDidShow ?? []) {
        cb({ endCoordinates: { height: 300, screenY: 400 } });
      }
    });
    expect(bar().queryByText(/when you submit the assignment/)).toBeNull();
    screen.unmount();
    jest.useRealTimers();
    spy.mockRestore();
  });
});
