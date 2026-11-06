import { screen } from "@testing-library/react-native";

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

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderStacked } from "./helpers/render";
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
  canManage: false, readOnly: false,
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

describe("AssignmentDetailScreen, read-only (a finished season)", () => {
  const sub = (status: "DRAFT" | "REVIEWED") => ({
    publicId: "abc123defg", status, submittedAt: null, reviewedAt: null, feedback: null, isLate: false,
  });
  const serve = (assignment: unknown, submission?: unknown) =>
    get.mockImplementation((url: string) => {
      if (url.includes("/forum")) throw new Error(`forum feed must not be read: ${url}`);
      return Promise.resolve({
        data: { data: url === "/api/v1/assignments/41" ? assignment : submission },
      });
    });

  it("shows submission text, status and feedback, with no Save, Submit or Start", async () => {
    serve(
      { ...detail, readOnly: true, mySubmission: sub("REVIEWED") },
      submissionFor("REVIEWED", false, "Solid work."),
    );
    renderStacked(<AssignmentDetailScreen />);
    expect(await screen.findByText("the work")).toBeTruthy();
    expect(screen.getByText("Solid work.")).toBeTruthy();
    expect(screen.getByText("Reviewed")).toBeTruthy();
    expect(screen.queryByText("Submit")).toBeNull();
    expect(screen.queryByText("Save draft")).toBeNull();
    expect(screen.queryByText("Start working")).toBeNull();
    expect(screen.queryByLabelText("Your response")).toBeNull();
  });

  it("shows a draft as plain text, not an editor", async () => {
    serve({ ...detail, readOnly: true, mySubmission: sub("DRAFT") }, { ...submissionFor("REVIEWED", false, null), status: "DRAFT" });
    renderStacked(<AssignmentDetailScreen />);
    expect(await screen.findByText("the work")).toBeTruthy();
    expect(screen.queryByLabelText("Your response")).toBeNull();
    expect(screen.queryByText("Submit")).toBeNull();
  });

  it("says You didn't submit this. when there is no submission", async () => {
    serve({ ...detail, readOnly: true, mySubmission: null });
    renderStacked(<AssignmentDetailScreen />);
    expect(await screen.findByText("You didn't submit this.")).toBeTruthy();
    expect(screen.queryByText("Start working")).toBeNull();
  });

  it("on a forum shows only their own response and never reads the feed", async () => {
    serve(
      { ...detail, type: "FORUM", readOnly: true, mySubmission: sub("REVIEWED") },
      submissionFor("REVIEWED", false, null),
    );
    renderStacked(<AssignmentDetailScreen />);
    expect(await screen.findByText("the work")).toBeTruthy();
    expect(get.mock.calls.some(([u]) => String(u).includes("forum"))).toBe(false);
    expect(screen.queryByText("Post")).toBeNull();
  });
});
