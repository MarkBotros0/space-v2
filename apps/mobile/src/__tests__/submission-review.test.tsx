import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
}));
const mockBack = jest.fn();
const mockReplace = jest.fn();
let mockCanGoBack = true;
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ publicId: "aaa1111111" }),
  useRouter: () => ({ back: mockBack, push: jest.fn(), replace: mockReplace, canGoBack: () => mockCanGoBack }),
}));

jest.mock("../design/ui/toaster", () => ({ toast: { success: jest.fn(), error: jest.fn() }, Toaster: () => null }));

import { toast } from "../design/ui/toaster";
import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderStacked } from "./helpers/render";
import { makeSession } from "./helpers/session";
import SubmissionReviewScreen from "../../app/(app)/submission/[publicId]";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;

const detail = {
  id: 900, publicId: "aaa1111111", status: "SUBMITTED" as const,
  text: "the student's work", feedback: null,
  submittedAt: "2099-03-30T10:00:00.000Z", reviewedAt: null, isLate: true,
  assignmentId: 41, assignmentTitle: "Essay one", assignmentDueAt: "2099-03-29T00:00:00.000Z",
  assignmentDescription: null, seasonCode: "S26",
  studentUserId: 9, studentName: "Test student", studentEmail: "s@jpc.test", groupId: null, groupName: null,
  files: [], canUploadFiles: false, canReview: true,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockCanGoBack = true;
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(makeSession("LEADER", { groupLeaderIds: [3] }, { id: 5 }));
});

it("shows the work, the late flag from the contract, and records a review without leaving (v1)", async () => {
  get.mockResolvedValue({ data: { data: detail } });
  post.mockResolvedValue({ data: { data: { reviewed: true, returnedForRevision: false } } });

  renderStacked(<SubmissionReviewScreen />);

  expect(await screen.findByText("the student's work")).toBeTruthy();
  expect(screen.getByText("Submitted")).toBeTruthy();
  expect(screen.getByText("Late")).toBeTruthy();

  fireEvent.changeText(screen.getByLabelText("Feedback"), "Good work.");
  fireEvent.press(screen.getByText("Mark as reviewed"));

  await waitFor(() =>
    expect(post).toHaveBeenCalledWith("/api/v1/submissions/aaa1111111/review", {
      feedback: "Good work.",
    }),
  );
  await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Review saved."));
  expect(mockBack).not.toHaveBeenCalled();
});

it("says Update review, with the earlier feedback in the field, when redoing a review (REG-87)", async () => {
  get.mockResolvedValue({
    data: { data: { ...detail, status: "REVIEWED", reviewedAt: "2099-03-31T10:00:00.000Z", feedback: "Good work." } },
  });
  post.mockResolvedValue({ data: { data: { reviewed: true, returnedForRevision: false } } });

  renderStacked(<SubmissionReviewScreen />);

  expect(await screen.findByText("Update review")).toBeTruthy();
  expect(screen.queryByText("Mark as reviewed")).toBeNull();
  expect(screen.getByText("Update feedback")).toBeTruthy();
  expect(screen.getByLabelText("Feedback").props.value).toBe("Good work.");
  fireEvent.changeText(screen.getByLabelText("Feedback"), "Even better.");
  fireEvent.press(screen.getByText("Update review"));
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith("/api/v1/submissions/aaa1111111/review", { feedback: "Even better." }),
  );
});

it("returns for revision with the flag set, then leaves a screen with nothing left to do", async () => {
  get.mockResolvedValue({ data: { data: detail } });
  post.mockResolvedValue({ data: { data: { reviewed: true, returnedForRevision: true } } });

  renderStacked(<SubmissionReviewScreen />);
  fireEvent.changeText(await screen.findByLabelText("Feedback"), "Another pass, please.");
  fireEvent.press(screen.getByText("Return for revision"));

  await waitFor(() =>
    expect(post).toHaveBeenCalledWith("/api/v1/submissions/aaa1111111/review", {
      feedback: "Another pass, please.",
      returnForRevision: true,
    }),
  );
  await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Returned for revision."));
  await waitFor(() => expect(mockBack).toHaveBeenCalled());
});

it("has exactly one back link: the frame's pinned bar, not an in-content one (R23)", async () => {
  get.mockResolvedValue({ data: { data: detail } });
  renderStacked(<SubmissionReviewScreen />);

  expect(await screen.findByText("Late")).toBeTruthy();
  expect(screen.getAllByRole("link", { name: "Back" })).toHaveLength(1);
  expect(screen.queryByText("← Submissions")).toBeNull();
  fireEvent.press(screen.getByRole("link", { name: "Back" }));
  expect(mockBack).toHaveBeenCalledTimes(1);
});

it("shows returned work as waiting on the student instead of the review form", async () => {
  get.mockResolvedValue({ data: { data: { ...detail, status: "RETURNED", feedback: "Another pass." } } });
  renderStacked(<SubmissionReviewScreen />);

  expect(await screen.findByText("Returned to the student")).toBeTruthy();
  expect(screen.getByText("Another pass.")).toBeTruthy();
  expect(screen.queryByLabelText("Feedback")).toBeNull();
});

it("stays on the screen and says why when the server refuses (403 forbidden)", async () => {
  get.mockResolvedValue({ data: { data: detail } });
  post.mockRejectedValue({ response: { status: 403, data: { error: { code: "forbidden", message: "x" } } } });

  renderStacked(<SubmissionReviewScreen />);
  fireEvent.press(await screen.findByText("Mark as reviewed"));

  expect(await screen.findByText(/Couldn't record the review/)).toBeTruthy();
  expect(mockBack).not.toHaveBeenCalled();
});

it("hides the verdict controls when the contract says this caller cannot review", async () => {
  get.mockResolvedValue({ data: { data: { ...detail, canReview: false } } });

  renderStacked(<SubmissionReviewScreen />);

  expect(await screen.findByText("the student's work")).toBeTruthy();
  expect(screen.queryByText("Mark as reviewed")).toBeNull();
  expect(screen.queryByLabelText("Feedback")).toBeNull();
});

it("names the student's group beside them on the detail (REG-89)", async () => {
  get.mockResolvedValue({ data: { data: { ...detail, groupId: 3, groupName: "Group A" } } });
  renderStacked(<SubmissionReviewScreen />);
  expect(await screen.findByText("Test student · Group A")).toBeTruthy();
});

it("shows the prompt and the attachments v1-style; the files can't be opened yet", async () => {
  get.mockResolvedValue({
    data: {
      data: {
        ...detail,
        assignmentDescription: "<p>Write 300 words</p>",
        files: [{ id: 1, originalName: "essay.pdf", sizeBytes: 2048, mimeType: "application/pdf" }],
      },
    },
  });
  renderStacked(<SubmissionReviewScreen />);
  expect(await screen.findByText("Assignment prompt")).toBeTruthy();
  expect(screen.getByText("Write 300 words")).toBeTruthy();
  expect(screen.getByText("Attachments")).toBeTruthy();
  expect(screen.getByText("essay.pdf")).toBeTruthy();
  expect(screen.getByText("2.0 KB")).toBeTruthy();
  expect(screen.getByText("Files can't be opened in the app yet.")).toBeTruthy();
});

it("shows the feedback card only to someone who can't review (v1)", async () => {
  get.mockResolvedValue({ data: { data: { ...detail, feedback: "Nice." } } });
  const { unmount } = renderStacked(<SubmissionReviewScreen />);
  expect(await screen.findByText("Add feedback")).toBeTruthy();
  expect(screen.queryByText("Feedback")).toBeNull();
  unmount();

  get.mockResolvedValue({ data: { data: { ...detail, feedback: "Nice.", canReview: false } } });
  renderStacked(<SubmissionReviewScreen />);
  expect(await screen.findByText("Feedback")).toBeTruthy();
  expect(screen.getByText("Nice.")).toBeTruthy();
});
