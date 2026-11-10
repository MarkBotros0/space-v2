import { fireEvent, screen, waitFor, within } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
}));
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ publicId: "aaa1111111" }),
  useRouter: () => ({ back: mockBack, push: jest.fn() }),
}));

jest.mock("expo-haptics", () => ({
  notificationAsync: jest.fn(() => Promise.resolve()),
  impactAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  NotificationFeedbackType: { Success: "success" },
  ImpactFeedbackStyle: { Light: "light" },
}));
jest.mock("../design/ui/toaster", () => ({ toast: { success: jest.fn(), error: jest.fn() }, Toaster: () => null }));

import * as Haptics from "expo-haptics";
import { toast } from "../design/ui/toaster";
import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderStacked } from "./helpers/render";
import { makeSession } from "./helpers/session";
import SubmissionReviewScreen from "../../app/(app)/submission/[publicId]";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;

const detail = {
  id: 900,
  publicId: "aaa1111111",
  status: "SUBMITTED" as const,
  text: "the student's work",
  wordCount: 3,
  partId: 2,
  prompt: "Who are you in the story?",
  minWords: null,
  maxWords: null,
  maxFileSizeMb: null,
  allowedMimeCategories: [],
  feedback: null as string | null,
  submittedAt: "2099-03-30T10:00:00.000Z",
  reviewedAt: null as string | null,
  isLate: true,
  assignmentId: 41,
  assignmentTitle: "Week four",
  assignmentDueAt: "2099-03-29T00:00:00.000Z",
  assignmentDescription: null,
  seasonCode: "S26",
  studentUserId: 9,
  studentName: "Test student",
  studentEmail: "s@jpc.test",
  groupId: null as number | null,
  groupName: null as string | null,
  files: [] as { id: number; originalName: string; sizeBytes: number; mimeType: string }[],
  canUploadFiles: false,
  canReview: true,
};

type Detail = Omit<typeof detail, "status"> & { status: "SUBMITTED" | "REVIEWED" | "RETURNED" };
const serve = (over: Partial<Detail> = {}) => get.mockResolvedValue({ data: { data: { ...detail, ...over } } });
const sheetBar = async () => within(await screen.findByTestId("sheet-save-bar"));
const footerBar = async () => within(await screen.findByTestId("save-bar"));

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(makeSession("LEADER", { groupLeaderIds: [3] }, { id: 5 }));
});

it("shows one essay: its question, the text, its count and the late flag", async () => {
  serve();
  renderStacked(<SubmissionReviewScreen />);

  expect(await screen.findByText("the student's work")).toBeTruthy();
  expect(screen.getByText("QUESTION")).toBeTruthy();
  expect(screen.getByText("Who are you in the story?")).toBeTruthy();
  expect(screen.getByText("3 words")).toBeTruthy();
  expect(screen.getByText("Waiting review")).toBeTruthy();
  expect(screen.getByText("Late")).toBeTruthy();
  // The student on their own line, never joined to the group with a dot.
  expect(screen.getByText("Test student")).toBeTruthy();
});

it("marks the essay reviewed with optional feedback and stays on the screen", async () => {
  serve();
  post.mockResolvedValue({ data: { data: { reviewStatus: "REVIEWED" } } });
  renderStacked(<SubmissionReviewScreen />);

  fireEvent.press((await footerBar()).getByText("Mark reviewed"));
  fireEvent.changeText(screen.getByLabelText("Feedback"), "Good work.");
  fireEvent.press((await sheetBar()).getByText("Mark reviewed"));

  await waitFor(() =>
    expect(post).toHaveBeenCalledWith("/api/v1/submissions/aaa1111111/review", {
      action: "reviewed",
      feedback: "Good work.",
    }),
  );
  await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Marked reviewed."));
  expect(Haptics.impactAsync).toHaveBeenCalledWith("light");
  expect(mockBack).not.toHaveBeenCalled();
});

it("sends no feedback at all when Mark reviewed has none", async () => {
  serve();
  post.mockResolvedValue({ data: { data: { reviewStatus: "REVIEWED" } } });
  renderStacked(<SubmissionReviewScreen />);

  fireEvent.press((await footerBar()).getByText("Mark reviewed"));
  fireEvent.press((await sheetBar()).getByText("Mark reviewed"));
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith("/api/v1/submissions/aaa1111111/review", { action: "reviewed", feedback: null }),
  );
});

it("Return needs a note", async () => {
  serve();
  post.mockResolvedValue({ data: { data: { reviewStatus: "RETURNED" } } });
  renderStacked(<SubmissionReviewScreen />);

  fireEvent.press((await footerBar()).getByText("Return"));
  const bar = await sheetBar();
  // No note: Return is disabled, and says why, in words and to a screen reader.
  const returnButton = () => bar.getByRole("button", { name: "Return" });
  expect(returnButton().props.accessibilityState).toMatchObject({ disabled: true });
  expect(returnButton().props.accessibilityHint).toBe("Say what to change");
  expect(bar.getByText("Say what to change")).toBeTruthy();
  fireEvent.press(returnButton());
  expect(post).not.toHaveBeenCalled();

  // Spaces are no note either.
  fireEvent.changeText(screen.getByLabelText("What to change"), "   ");
  expect(returnButton().props.accessibilityState).toMatchObject({ disabled: true });

  fireEvent.changeText(screen.getByLabelText("What to change"), "Another pass, please.");
  expect(returnButton().props.accessibilityState).toMatchObject({ disabled: false });
  fireEvent.press(returnButton());
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith("/api/v1/submissions/aaa1111111/review", {
      action: "return",
      feedback: "Another pass, please.",
    }),
  );
  await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Returned to the student."));
  // Returned work is the student's now: nothing is left to do here.
  await waitFor(() => expect(mockBack).toHaveBeenCalled());
});

it("shows the server's refusal of a return in the sheet, keeping the note", async () => {
  serve();
  post.mockRejectedValue({
    isAxiosError: true,
    response: { status: 400, data: { error: { code: "bad_request", message: "Say what to change" } } },
  });
  renderStacked(<SubmissionReviewScreen />);

  fireEvent.press((await footerBar()).getByText("Return"));
  fireEvent.changeText(screen.getByLabelText("What to change"), "x");
  fireEvent.press((await sheetBar()).getByRole("button", { name: "Return" }));

  expect(await (await sheetBar()).findByRole("alert")).toBeTruthy();
  expect(within((await sheetBar()).getByRole("alert")).getByText("Say what to change")).toBeTruthy();
  expect(screen.getByLabelText("What to change").props.value).toBe("x");
  expect(mockBack).not.toHaveBeenCalled();
});

it("lets a reviewer judge a reviewed essay again: Update feedback with the earlier text, or Return", async () => {
  serve({ status: "REVIEWED", reviewedAt: "2099-03-31T10:00:00.000Z", feedback: "Good work." });
  post.mockResolvedValue({ data: { data: { reviewStatus: "REVIEWED" } } });
  renderStacked(<SubmissionReviewScreen />);

  const bar = await footerBar();
  expect(bar.getByText("Return")).toBeTruthy();
  expect(screen.getByText("CURRENT FEEDBACK")).toBeTruthy();
  fireEvent.press(bar.getByText("Update feedback"));
  expect(screen.getByLabelText("Feedback").props.value).toBe("Good work.");
  fireEvent.changeText(screen.getByLabelText("Feedback"), "Even better.");
  fireEvent.press((await sheetBar()).getByText("Update feedback"));
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith("/api/v1/submissions/aaa1111111/review", {
      action: "reviewed",
      feedback: "Even better.",
    }),
  );
});

it("shows a returned essay as waiting on the student, with no verdicts", async () => {
  serve({ status: "RETURNED", feedback: "Another pass." });
  renderStacked(<SubmissionReviewScreen />);

  expect(await screen.findByText("RETURNED TO THE STUDENT")).toBeTruthy();
  expect(screen.getByText("Another pass.")).toBeTruthy();
  expect(screen.queryByTestId("save-bar")).toBeNull();
});

it("hides the verdicts when the contract says this caller cannot review (a mentor reads, never reviews)", async () => {
  useSessionStore.setState(makeSession("MENTOR"));
  serve({ canReview: false, feedback: "Nice." });
  renderStacked(<SubmissionReviewScreen />);

  expect(await screen.findByText("the student's work")).toBeTruthy();
  expect(screen.queryByTestId("save-bar")).toBeNull();
  expect(screen.queryByText("Mark reviewed")).toBeNull();
  expect(screen.getByText("FEEDBACK")).toBeTruthy();
  expect(screen.getByText("Nice.")).toBeTruthy();
});

it("keeps the typed note when the sheet is dismissed and reopened, sending nothing", async () => {
  serve();
  renderStacked(<SubmissionReviewScreen />);

  fireEvent.press((await footerBar()).getByText("Return"));
  fireEvent.changeText(screen.getByLabelText("What to change"), "Half a thought");
  fireEvent.press(screen.getByLabelText("Close"));
  fireEvent.press(within(screen.getByTestId("save-bar")).getByText("Return"));

  expect(screen.getByLabelText("What to change").props.value).toBe("Half a thought");
  expect(post).not.toHaveBeenCalled();
});

it("has exactly one back link: the frame's pinned bar (R23)", async () => {
  serve();
  renderStacked(<SubmissionReviewScreen />);

  expect(await screen.findByText("Late")).toBeTruthy();
  expect(screen.getAllByRole("link", { name: "Back" })).toHaveLength(1);
  fireEvent.press(screen.getByRole("link", { name: "Back" }));
  expect(mockBack).toHaveBeenCalledTimes(1);
});

it("names the student's group as its own chip (REG-89)", async () => {
  serve({ groupId: 3, groupName: "Group A" });
  renderStacked(<SubmissionReviewScreen />);
  expect(await screen.findByText("Group A")).toBeTruthy();
  expect(screen.getByText("Test student")).toBeTruthy();
});

it("shows the attachments; the files can't be opened yet", async () => {
  serve({ files: [{ id: 1, originalName: "essay.pdf", sizeBytes: 2048, mimeType: "application/pdf" }] });
  renderStacked(<SubmissionReviewScreen />);
  expect(await screen.findByText("Attachments")).toBeTruthy();
  expect(screen.getByText("essay.pdf")).toBeTruthy();
  expect(screen.getByText("2.0 KB")).toBeTruthy();
  expect(screen.getByText("Files can't be opened in the app yet.")).toBeTruthy();
});

it("says the essay isn't there, in words, for a link that no longer leads to one (404)", async () => {
  get.mockRejectedValue({
    isAxiosError: true,
    response: { status: 404, data: { error: { code: "not_found", message: "x" } } },
  });
  renderStacked(<SubmissionReviewScreen />);
  expect(await screen.findByText("This essay isn't here")).toBeTruthy();
});

it("shows no due date read on the device's clock (the detail carries no org-clock due day)", async () => {
  serve();
  renderStacked(<SubmissionReviewScreen />);
  expect(await screen.findByText("Late")).toBeTruthy();
  expect(screen.queryByText(/^Due /)).toBeNull();
});
