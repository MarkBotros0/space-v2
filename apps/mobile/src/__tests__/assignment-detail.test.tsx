import { screen } from "@testing-library/react-native";

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

const detail = {
  id: 41,
  seasonId: 7,
  seasonCode: "S26",
  seasonTitle: "Spring 2026",
  sessionId: null,
  sessionTitle: null,
  title: "Essay one",
  description: "Write about the thing.",
  dueAt: "2099-04-01T21:59:00.000Z",
  dueOrgDay: "2099-04-01",
  dueOrgTime: "23:59",
  isOverdue: false,
  isAllGroups: true,
  type: "STANDARD" as const,
  forumMinWords: null,
  forumAllowComments: false,
  maxFileSizeMb: 10,
  allowedMimeCategories: ["pdf" as const],
  groupIds: null,
  mySubmission: null,
  canManage: false,
};

const submissionFor = (status: "REVIEWED" | "SUBMITTED", isLate: boolean, feedback: string | null) => ({
  id: 900, publicId: "abc123defg", status, text: "the work", feedback,
  submittedAt: "2099-03-30T10:00:00.000Z",
  reviewedAt: status === "REVIEWED" ? "2099-03-31T10:00:00.000Z" : null,
  isLate, assignmentId: 41, assignmentTitle: "Essay one", assignmentDueAt: null,
  assignmentDescription: null, seasonCode: "S26", studentUserId: 9,
  studentName: "Test student", studentEmail: "s@jpc.test", groupId: null, groupName: null,
  files: [], canUploadFiles: false, canReview: false,
});

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(
    makeSession("STUDENT", { activeSeasonId: 7 }, { id: 9, name: "Test student", email: "s@jpc.test" }),
  );
});

describe("AssignmentDetailScreen", () => {
  it("renders title, description and due date from the detail contract", async () => {
    get.mockResolvedValue({ data: { data: detail } });

    renderWithProviders(<AssignmentDetailScreen />);

    expect(await screen.findByText("Essay one")).toBeTruthy();
    expect(screen.getByText("Write about the thing.")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/assignments/41");
  });

  it("shows reviewed feedback from mySubmission", async () => {
    const assignment = {
      ...detail,
      mySubmission: {
        publicId: "abc123defg", status: "REVIEWED" as const,
        submittedAt: "2099-03-30T10:00:00.000Z", reviewedAt: "2099-03-31T10:00:00.000Z",
        feedback: "Solid work.", isLate: false,
      },
    };
    get.mockImplementation((url: string) =>
      Promise.resolve({
        data: { data: url === "/api/v1/assignments/41" ? assignment : submissionFor("REVIEWED", false, "Solid work.") },
      }),
    );

    renderWithProviders(<AssignmentDetailScreen />);

    expect(await screen.findByText("Solid work.")).toBeTruthy();
    expect(screen.getByText("Reviewed")).toBeTruthy();
  });

  it("shows the late badge from the contract flag", async () => {
    const assignment = {
      ...detail,
      // v1 parity 2026-10-09 (R14): past due, so the SUBMITTED work is read-only.
      isOverdue: true,
      mySubmission: {
        publicId: "abc123defg", status: "SUBMITTED" as const,
        submittedAt: "2099-04-02T10:00:00.000Z", reviewedAt: null, feedback: null, isLate: true,
      },
    };
    get.mockImplementation((url: string) =>
      Promise.resolve({
        data: { data: url === "/api/v1/assignments/41" ? assignment : submissionFor("SUBMITTED", true, null) },
      }),
    );

    renderWithProviders(<AssignmentDetailScreen />);

    expect(await screen.findByText("Submitted late")).toBeTruthy();
  });

  // v1 parity 2026-10-09 (R21 label half): nothing sets RETURNED any more; a
  // legacy row reads v1's badge word (submission-status-badge.tsx:23).
  it("labels a legacy RETURNED submission 'Returned', as v1", async () => {
    const assignment = {
      ...detail,
      mySubmission: {
        publicId: "abc123defg", status: "RETURNED" as const,
        submittedAt: "2099-03-30T10:00:00.000Z", reviewedAt: null, feedback: null, isLate: false,
      },
    };
    get.mockImplementation((url: string) =>
      Promise.resolve({
        data: {
          data: url === "/api/v1/assignments/41" ? assignment : { ...submissionFor("SUBMITTED", false, null), status: "RETURNED" },
        },
      }),
    );

    renderWithProviders(<AssignmentDetailScreen />);

    expect(await screen.findByText("Returned")).toBeTruthy();
    expect(screen.queryByText(/revision/)).toBeNull();
  });
});
