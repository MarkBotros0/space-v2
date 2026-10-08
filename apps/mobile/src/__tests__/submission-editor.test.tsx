import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), put: jest.fn(), patch: jest.fn() },
}));
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "41" }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";

import AssignmentDetailScreen from "../../app/(app)/assignment/[id]/index";

const get = apiClient.get as jest.Mock;
const put = apiClient.put as jest.Mock;
const patch = apiClient.patch as jest.Mock;

const detailNoSubmission = {
  id: 41, seasonId: 7, seasonCode: "S26", seasonTitle: "Spring 2026",
  sessionId: null, sessionTitle: null, title: "Essay one",
  description: null, dueAt: null, dueOrgDay: null, dueOrgTime: null, isOverdue: false, isAllGroups: true,
  type: "STANDARD" as const, forumMinWords: null, forumAllowComments: false,
  maxFileSizeMb: 10, allowedMimeCategories: [], groupIds: null,
  mySubmission: null, canManage: false,
};

const draftSummary = {
  publicId: "abc123defg", status: "DRAFT" as const, submittedAt: null,
  reviewedAt: null, feedback: null, isLate: false,
};

const submissionDetail = {
  id: 900, publicId: "abc123defg", status: "DRAFT" as const,
  text: "first draft", feedback: null,
  submittedAt: null, reviewedAt: null, isLate: false,
  assignmentId: 41, assignmentTitle: "Essay one", assignmentDueAt: null,
  assignmentDescription: null, seasonCode: "S26",
  studentUserId: 9, studentName: "Test student", studentEmail: "s@jpc.test", groupId: null, groupName: null,
  files: [], canUploadFiles: false, canReview: false,
};

function serve(assignment: unknown) {
  get.mockImplementation((url: string) =>
    url === "/api/v1/assignments/41"
      ? Promise.resolve({ data: { data: assignment } })
      : Promise.resolve({ data: { data: submissionDetail } }),
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(
    makeSession("STUDENT", { activeSeasonId: 7 }, { id: 9, name: "Test student", email: "s@jpc.test" }),
  );
});

describe("submission editor", () => {
  it("starts a submission via the idempotent PUT, then loads its text", async () => {
    // The PUT's onSuccess invalidates the assignment detail; the refetch must
    // then see the submission it created, or the editor never appears. Model
    // that state change: null before the PUT resolves, a row after.
    let submissionStarted = false;
    put.mockImplementation(() => {
      submissionStarted = true;
      return Promise.resolve({ data: { data: { publicId: "abc123defg", status: "DRAFT" } } });
    });
    get.mockImplementation((url: string) =>
      url === "/api/v1/assignments/41"
        ? Promise.resolve({
            data: {
              data: submissionStarted
                ? { ...detailNoSubmission, mySubmission: draftSummary }
                : detailNoSubmission,
            },
          })
        : Promise.resolve({ data: { data: submissionDetail } }),
    );

    renderWithProviders(<AssignmentDetailScreen />);
    fireEvent.press(await screen.findByText("Start working"));

    await waitFor(() =>
      expect(put).toHaveBeenCalledWith("/api/v1/submissions/by-assignment/41"),
    );
    expect(await screen.findByDisplayValue("first draft")).toBeTruthy();
  });

  it("saves a draft without submitting, and submits explicitly", async () => {
    serve({ ...detailNoSubmission, mySubmission: draftSummary });
    patch.mockResolvedValue({ data: { data: { saved: true, submitted: false } } });

    renderWithProviders(<AssignmentDetailScreen />);

    const input = await screen.findByLabelText("Your answer");
    fireEvent.changeText(input, "better draft");

    fireEvent.press(screen.getByText("Save draft"));
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/api/v1/submissions/abc123defg", {
        text: "better draft",
      }),
    );

    patch.mockResolvedValue({ data: { data: { saved: true, submitted: true } } });
    fireEvent.press(screen.getByText("Submit"));
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/api/v1/submissions/abc123defg", {
        text: "better draft",
        submit: true,
      }),
    );
  });

  it("surfaces a malformed save response as an error instead of trusting it", async () => {
    // Parse, don't cast (ruling X10): a drifted payload must fail loudly.
    serve({ ...detailNoSubmission, mySubmission: draftSummary });
    patch.mockResolvedValue({ data: { data: { saved: "yes" } } });

    renderWithProviders(<AssignmentDetailScreen />);
    fireEvent.press(await screen.findByText("Save draft"));

    expect(await screen.findByText(/Couldn't save/)).toBeTruthy();
  });

  it("explains why attachments are unavailable instead of showing a dead control", async () => {
    serve({ ...detailNoSubmission, mySubmission: draftSummary });

    renderWithProviders(<AssignmentDetailScreen />);

    // canUploadFiles=false + maxFileSizeMb set: the assignment expects a file
    // the app cannot take yet. Say so; never render an attach button that 503s.
    expect(await screen.findByText(/attachments aren't available/i)).toBeTruthy();
  });
});
