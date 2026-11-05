import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { AppState, type AppStateStatus } from "react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), put: jest.fn(), patch: jest.fn() },
}));
jest.mock("../design/ui/toaster", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
  Toaster: () => null,
}));
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "41" }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

import { toast } from "../design/ui/toaster";
import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";
import AssignmentDetailScreen from "../../app/(app)/assignment/[id]/index";

const get = apiClient.get as jest.Mock;
const patch = apiClient.patch as jest.Mock;

const URL = "/api/v1/submissions/abc123defg";
const FAILED = "Your draft wasn't saved. Check your connection.";
const rejected = (status: number) =>
  Object.assign(new Error(String(status)), { isAxiosError: true, response: { status, data: {} } });
const saved = { data: { data: { saved: true, submitted: false } } };

const assignment = {
  id: 41, seasonId: 7, seasonCode: "S26", seasonTitle: "Spring 2026", sessionId: null,
  sessionTitle: null, title: "Essay one", description: null, dueAt: null, dueOrgDay: null,
  dueOrgTime: null, isOverdue: false, isAllGroups: true, type: "STANDARD" as const,
  forumMinWords: null, forumAllowComments: false, maxFileSizeMb: null, allowedMimeCategories: [],
  groupIds: null, canManage: false,
};
const submission = {
  id: 900, publicId: "abc123defg", text: "first draft", feedback: null, submittedAt: null,
  reviewedAt: null, isLate: false, assignmentId: 41, assignmentTitle: "Essay one",
  assignmentDueAt: null, assignmentDescription: null, seasonCode: "S26", studentUserId: 9,
  studentName: "S", studentEmail: "s@jpc.test", groupId: null, groupName: null, files: [],
  canUploadFiles: false, canReview: false,
};

function serve(status: "DRAFT" | "RETURNED" | "SUBMITTED" = "DRAFT") {
  get.mockImplementation((url: string) =>
    Promise.resolve({
      data: {
        data:
          url === "/api/v1/assignments/41"
            ? {
                ...assignment,
                mySubmission: {
                  publicId: "abc123defg", status, submittedAt: null, reviewedAt: null,
                  feedback: null, isLate: false,
                },
              }
            : { ...submission, status },
      },
    }),
  );
}

const open = () => renderWithProviders(<AssignmentDetailScreen />);
const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 10)));

beforeEach(() => {
  jest.clearAllMocks();
  patch.mockReset();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }, { id: 9 }));
});

describe("leaving the screen saves what was written", () => {
  it("Back with typed text saves the draft, without a toast or a submit", async () => {
    serve();
    patch.mockResolvedValue(saved);
    const view = open();
    fireEvent.changeText(await screen.findByLabelText("Your response"), "my essay");
    expect(patch).not.toHaveBeenCalled();

    view.unmount();
    await waitFor(() => expect(patch).toHaveBeenCalledWith(URL, { text: "my essay" }));
    await settle();
    expect(patch).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("returned work is flushed too", async () => {
    serve("RETURNED");
    patch.mockResolvedValue(saved);
    const view = open();
    fireEvent.changeText(await screen.findByLabelText("Your response"), "revised");
    view.unmount();
    await waitFor(() => expect(patch).toHaveBeenCalledWith(URL, { text: "revised" }));
  });

  it.each([
    ["nothing was typed", undefined],
    ["the text is back to the server's", "first draft"],
    ["the text is blank", "   "],
  ])("sends nothing when %s", async (_name, typed) => {
    serve();
    const view = open();
    const input = await screen.findByLabelText("Your response");
    if (typed !== undefined) fireEvent.changeText(input, typed);
    view.unmount();
    await settle();
    expect(patch).not.toHaveBeenCalled();
  });

  it("sends nothing when editing isn't allowed", async () => {
    serve("SUBMITTED");
    const view = open();
    expect(await screen.findByText("first draft")).toBeTruthy();
    view.unmount();
    await settle();
    expect(patch).not.toHaveBeenCalled();
  });

  it("sends nothing more after Save draft", async () => {
    serve();
    patch.mockResolvedValue(saved);
    const view = open();
    const input = await screen.findByLabelText("Your response");
    fireEvent.changeText(input, "saved text");
    fireEvent.press(screen.getByText("Save draft"));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Draft saved."));

    view.unmount();
    await settle();
    expect(patch).toHaveBeenCalledTimes(1);
  });

  it("sends what was typed after Save draft", async () => {
    serve();
    patch.mockResolvedValue(saved);
    const view = open();
    const input = await screen.findByLabelText("Your response");
    fireEvent.changeText(input, "saved text");
    fireEvent.press(screen.getByText("Save draft"));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Draft saved."));
    fireEvent.changeText(input, "saved text, and more");

    view.unmount();
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(2));
    expect(patch).toHaveBeenLastCalledWith(URL, { text: "saved text, and more" });
  });

  it("a slower save can't overwrite newer text: writes go out in order", async () => {
    serve();
    let finishFirst!: (v: unknown) => void;
    patch.mockReturnValueOnce(new Promise((resolve) => (finishFirst = resolve)));
    patch.mockResolvedValue(saved);
    const view = open();
    const input = await screen.findByLabelText("Your response");
    fireEvent.changeText(input, "older");
    fireEvent.press(screen.getByText("Save draft"));
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    fireEvent.changeText(input, "newer");

    view.unmount();
    await settle();
    expect(patch).toHaveBeenCalledTimes(1);
    await act(async () => finishFirst(saved));
    await waitFor(() => expect(patch).toHaveBeenLastCalledWith(URL, { text: "newer" }));
  });

  it("does not flush after a submit, even with the submit still in flight", async () => {
    serve();
    let finish!: (v: unknown) => void;
    patch.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    const view = open();
    fireEvent.changeText(await screen.findByLabelText("Your response"), "final");
    fireEvent.press(screen.getByText("Submit"));
    fireEvent.press(await screen.findByText("Yes, submit"));
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    fireEvent.changeText(screen.getByLabelText("Your response"), "typed after");

    view.unmount();
    await settle();
    expect(patch).toHaveBeenCalledTimes(1);
    await act(async () => finish({ data: { data: { saved: true, submitted: true } } }));
    await settle();
    expect(patch).toHaveBeenCalledTimes(1);
    // The answer still reaches the student, though the screen is gone.
    expect(toast.success).toHaveBeenCalledWith("Submitted!");
  });

  it("a failed submit doesn't count as handed in: leaving saves the text", async () => {
    serve();
    patch.mockRejectedValueOnce(new Error("Network Error"));
    patch.mockResolvedValue(saved);
    const view = open();
    fireEvent.changeText(await screen.findByLabelText("Your response"), "final");
    fireEvent.press(screen.getByText("Submit"));
    fireEvent.press(await screen.findByText("Yes, submit"));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());

    view.unmount();
    await waitFor(() => expect(patch).toHaveBeenLastCalledWith(URL, { text: "final" }));
  });

  it("a flush that fails after leaving says so in a toast", async () => {
    serve();
    patch.mockRejectedValue(new Error("Network Error"));
    const view = open();
    fireEvent.changeText(await screen.findByLabelText("Your response"), "my essay");
    view.unmount();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(FAILED));
  });
});

describe("a flush the server refused doesn't blame the connection", () => {
  it.each([
    [409, "Your draft wasn't saved. This assignment can't be edited any more."],
    [500, "Your draft wasn't saved."],
    [403, "Your draft wasn't saved."],
  ])("status %s", async (status, message) => {
    serve();
    patch.mockRejectedValue(rejected(status));
    const view = open();
    fireEvent.changeText(await screen.findByLabelText("Your response"), "my essay");
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
      send: (state: AppStateStatus) => act(async () => { for (const fn of listeners) fn(state); }),
    };
  }

  it("flushes once, and a later Back doesn't send it again", async () => {
    const app = background();
    serve();
    patch.mockResolvedValue(saved);
    const view = open();
    fireEvent.changeText(await screen.findByLabelText("Your response"), "my essay");

    await app.send("inactive");
    await app.send("background");
    await waitFor(() => expect(patch).toHaveBeenCalledWith(URL, { text: "my essay" }));
    view.unmount();
    await settle();
    expect(patch).toHaveBeenCalledTimes(1);
    app.spy.mockRestore();
  });

  it("a failed background flush is tried again next time, and coming back sends nothing", async () => {
    const app = background();
    serve();
    patch.mockRejectedValueOnce(new Error("Network Error"));
    patch.mockResolvedValue(saved);
    const view = open();
    fireEvent.changeText(await screen.findByLabelText("Your response"), "my essay");

    await app.send("background");
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(FAILED));
    await app.send("active");
    expect(patch).toHaveBeenCalledTimes(1);

    view.unmount();
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(2));
    app.spy.mockRestore();
  });
});
