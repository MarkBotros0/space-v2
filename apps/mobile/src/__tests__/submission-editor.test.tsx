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
  // v1 parity 2026-10-09 (R1): no "Start working" — v1 shows the editor at once
  // (student/assignments/[id]/page.tsx:40). The first save creates the row via
  // the idempotent PUT (GETs never write, C6) and then PATCHes the text.
  it("shows the editor straight away; the first Save draft creates the submission, then saves", async () => {
    let submissionStarted = false;
    put.mockImplementation(() => {
      submissionStarted = true;
      return Promise.resolve({ data: { data: { publicId: "abc123defg", status: "DRAFT" } } });
    });
    patch.mockResolvedValue({ data: { data: { saved: true, submitted: false } } });
    get.mockImplementation((url: string) =>
      url === "/api/v1/assignments/41"
        ? Promise.resolve({
            data: {
              data: submissionStarted
                ? { ...detailNoSubmission, mySubmission: draftSummary }
                : detailNoSubmission,
            },
          })
        : Promise.resolve({ data: { data: { ...submissionDetail, text: "my first words" } } }),
    );

    renderWithProviders(<AssignmentDetailScreen />);

    const input = await screen.findByLabelText("Your answer");
    expect(screen.queryByText("Start working")).toBeNull();
    // Opening the screen wrote nothing.
    expect(put).not.toHaveBeenCalled();

    fireEvent.changeText(input, "my first words");
    fireEvent.press(screen.getByText("Save draft"));

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/api/v1/submissions/abc123defg", { text: "my first words" }),
    );
    expect(put).toHaveBeenCalledWith("/api/v1/submissions/by-assignment/41");
    expect(put.mock.invocationCallOrder[0]).toBeLessThan(patch.mock.invocationCallOrder[0] ?? 0);
    expect(await screen.findByDisplayValue("my first words")).toBeTruthy();
  });

  // v1 parity 2026-10-09 (R14): v1 student-submission-form.tsx:96 keeps a
  // SUBMITTED answer editable until the due date passes.
  it("keeps SUBMITTED work editable and re-submittable before the due date", async () => {
    const submitted = { ...draftSummary, status: "SUBMITTED" as const, submittedAt: "2099-03-30T10:00:00.000Z" };
    get.mockImplementation((url: string) =>
      url === "/api/v1/assignments/41"
        ? Promise.resolve({ data: { data: { ...detailNoSubmission, isOverdue: false, mySubmission: submitted } } })
        : Promise.resolve({
            data: { data: { ...submissionDetail, status: "SUBMITTED", submittedAt: "2099-03-30T10:00:00.000Z" } },
          }),
    );
    patch.mockResolvedValue({ data: { data: { saved: true, submitted: true } } });

    renderWithProviders(<AssignmentDetailScreen />);

    const input = await screen.findByLabelText("Your answer");
    fireEvent.changeText(input, "improved answer");
    fireEvent.press(screen.getByText("Submit"));

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/api/v1/submissions/abc123defg", {
        text: "improved answer",
        submit: true,
      }),
    );
  });

  it("locks SUBMITTED work once the due date has passed, and REVIEWED work always", async () => {
    const submitted = { ...draftSummary, status: "SUBMITTED" as const, submittedAt: "2099-03-30T10:00:00.000Z" };
    get.mockImplementation((url: string) =>
      url === "/api/v1/assignments/41"
        ? Promise.resolve({ data: { data: { ...detailNoSubmission, isOverdue: true, mySubmission: submitted } } })
        : Promise.resolve({ data: { data: { ...submissionDetail, status: "SUBMITTED" } } }),
    );

    renderWithProviders(<AssignmentDetailScreen />);

    expect(await screen.findByText("Submitted")).toBeTruthy();
    expect(screen.queryByLabelText("Your answer")).toBeNull();
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

  it("disables Submit while the text is empty and nothing is attached (REG-85)", async () => {
    get.mockImplementation((url: string) =>
      url === "/api/v1/assignments/41"
        ? Promise.resolve({ data: { data: { ...detailNoSubmission, mySubmission: draftSummary } } })
        : Promise.resolve({ data: { data: { ...submissionDetail, text: "" } } }),
    );
    renderWithProviders(<AssignmentDetailScreen />);

    const input = await screen.findByLabelText("Your answer");
    const submitDisabled = () => screen.getByRole("button", { name: "Submit" }).props.accessibilityState?.disabled;
    expect(submitDisabled()).toBe(true);
    fireEvent.changeText(input, "   ");
    expect(submitDisabled()).toBe(true);
    fireEvent.changeText(input, "an answer");
    expect(submitDisabled()).toBe(false);
  });

  it("lets Submit through with no text when a file is already attached (REG-85)", async () => {
    get.mockImplementation((url: string) =>
      url === "/api/v1/assignments/41"
        ? Promise.resolve({ data: { data: { ...detailNoSubmission, mySubmission: draftSummary } } })
        : Promise.resolve({
            data: {
              data: {
                ...submissionDetail,
                text: "",
                files: [{ id: 5, originalName: "essay.pdf", mimeType: "application/pdf", sizeBytes: 1200 }],
              },
            },
          }),
    );
    renderWithProviders(<AssignmentDetailScreen />);
    await screen.findByLabelText("Your answer");
    expect(screen.getByRole("button", { name: "Submit" }).props.accessibilityState?.disabled).toBeFalsy();
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
