import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
}));
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ publicId: "aaa1111111" }),
  useRouter: () => ({ back: mockBack, push: jest.fn() }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
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
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(makeSession("LEADER", { groupLeaderIds: [3] }, { id: 5 }));
});

it("shows the work, the late flag from the contract, and records a review", async () => {
  get.mockResolvedValue({ data: { data: detail } });
  post.mockResolvedValue({ data: { data: { reviewed: true, returnedForRevision: false } } });

  renderWithProviders(<SubmissionReviewScreen />);

  expect(await screen.findByText("the student's work")).toBeTruthy();
  expect(screen.getByText("Submitted late")).toBeTruthy();

  fireEvent.changeText(screen.getByLabelText("Feedback"), "Good work.");
  fireEvent.press(screen.getByText("Mark reviewed"));

  await waitFor(() =>
    expect(post).toHaveBeenCalledWith("/api/v1/submissions/aaa1111111/review", {
      feedback: "Good work.",
    }),
  );
  await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
});

it("says Update review, with the earlier feedback in the field, when redoing a review (REG-87)", async () => {
  get.mockResolvedValue({
    data: { data: { ...detail, status: "REVIEWED", reviewedAt: "2099-03-31T10:00:00.000Z", feedback: "Good work." } },
  });
  post.mockResolvedValue({ data: { data: { reviewed: true, returnedForRevision: false } } });

  renderWithProviders(<SubmissionReviewScreen />);

  expect(await screen.findByText("Update review")).toBeTruthy();
  expect(screen.queryByText("Mark reviewed")).toBeNull();
  expect(screen.getByText("Update feedback")).toBeTruthy();
  expect(screen.getByLabelText("Feedback").props.value).toBe("Good work.");
  fireEvent.changeText(screen.getByLabelText("Feedback"), "Even better.");
  fireEvent.press(screen.getByText("Update review"));
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith("/api/v1/submissions/aaa1111111/review", { feedback: "Even better." }),
  );
});

it("returns for revision with the flag set", async () => {
  get.mockResolvedValue({ data: { data: detail } });
  post.mockResolvedValue({ data: { data: { reviewed: true, returnedForRevision: true } } });

  renderWithProviders(<SubmissionReviewScreen />);
  fireEvent.changeText(await screen.findByLabelText("Feedback"), "Another pass, please.");
  fireEvent.press(screen.getByText("Return for revision"));

  await waitFor(() =>
    expect(post).toHaveBeenCalledWith("/api/v1/submissions/aaa1111111/review", {
      feedback: "Another pass, please.",
      returnForRevision: true,
    }),
  );
});

it("stays on the screen and says why when the server refuses (409 not_submitted)", async () => {
  get.mockResolvedValue({ data: { data: { ...detail, status: "DRAFT", submittedAt: null } } });
  post.mockRejectedValue({ response: { status: 409, data: { error: { code: "not_submitted", message: "x" } } } });

  renderWithProviders(<SubmissionReviewScreen />);
  fireEvent.press(await screen.findByText("Mark reviewed"));

  expect(await screen.findByText(/Couldn't record the review/)).toBeTruthy();
  expect(mockBack).not.toHaveBeenCalled();
});

it("hides the verdict controls when the contract says this caller cannot review", async () => {
  get.mockResolvedValue({ data: { data: { ...detail, canReview: false } } });

  renderWithProviders(<SubmissionReviewScreen />);

  expect(await screen.findByText("the student's work")).toBeTruthy();
  expect(screen.queryByText("Mark reviewed")).toBeNull();
  expect(screen.queryByLabelText("Feedback")).toBeNull();
});

it("names the student's group beside them on the detail (REG-89)", async () => {
  get.mockResolvedValue({ data: { data: { ...detail, groupId: 3, groupName: "Group A" } } });
  renderWithProviders(<SubmissionReviewScreen />);
  expect(await screen.findByText("Test student · Group A")).toBeTruthy();
});
