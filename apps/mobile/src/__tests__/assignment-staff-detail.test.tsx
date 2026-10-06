import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn(), delete: jest.fn() } }));
const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "55" }),
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn() }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";

import AssignmentDetailScreen from "../../app/(app)/assignment/[id]/index";

const get = apiClient.get as jest.Mock;
const del = apiClient.delete as jest.Mock;

const detail = {
  id: 55, seasonId: 7, seasonCode: "s7", seasonTitle: "Spring 2099",
  sessionId: 12, sessionTitle: "Week 4", title: "Essay one",
  description: "Write about the thing.", dueAt: "2099-04-01T21:59:00.000Z",
  dueOrgDay: "2099-04-01", dueOrgTime: "23:59", isOverdue: false, isAllGroups: false,
  type: "STANDARD" as const, forumMinWords: null, forumAllowComments: false,
  maxFileSizeMb: 10, allowedMimeCategories: ["pdf" as const], groupIds: [3],
  mySubmission: null, canManage: true,
};

const tracker = {
  assignmentId: 55, dueAt: detail.dueAt, isOverdue: false, submittedCount: 1, expectedCount: 2,
  rows: [
    {
      studentUserId: 9, name: "Sara Student", email: "sara@jpc.test", groupId: 3, groupName: "Group A",
      status: "SUBMITTED" as const, isLate: true, submittedAt: "2099-04-02T10:00:00.000Z",
      reviewedAt: null, submissionPublicId: "abc123defg",
    },
    {
      studentUserId: 10, name: null, email: "noname@jpc.test", groupId: 3, groupName: "Group A",
      status: "PENDING" as const, isLate: false, submittedAt: null, reviewedAt: null,
      submissionPublicId: null,
    },
  ],
};

const groups = [
  { id: 3, name: "Group A", description: null, studentCount: 2, leaderNames: [], seasonId: 7, seasonCode: "s7", seasonTitle: "Spring 2099" },
];

const ok = (data: unknown) => Promise.resolve({ data: { data } });

function serve(over: Partial<typeof detail> = {}) {
  get.mockImplementation((url: string) => {
    if (url === "/api/v1/assignments/55") return ok({ ...detail, ...over });
    if (url === "/api/v1/assignments/55/tracker") return ok(tracker);
    if (url === "/api/v1/seasons/7/groups") return ok({ groups });
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("AssignmentDetailScreen (staff)", () => {
  it("shows an admin the settings, the org-clock deadline and the tracker — no submission editor", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    serve();
    renderWithProviders(<AssignmentDetailScreen />);

    expect(await screen.findByText("Essay one")).toBeTruthy();
    expect(screen.getByText("Due Apr 1, 2099, 11:59 PM")).toBeTruthy();
    expect(await screen.findByText("Assigned to: Group A")).toBeTruthy();
    expect(screen.getByText("Standard · files up to 10 MB (PDFs)")).toBeTruthy();
    expect(screen.getByText("Linked session: Week 4")).toBeTruthy();

    // One definition of "submitted" (spec §10 item 8): the server's count.
    expect(await screen.findByText("1 of 2 submitted")).toBeTruthy();
    expect(screen.getByText("Sara Student")).toBeTruthy();
    expect(screen.getByText("Group A · Submitted · Late")).toBeTruthy();
    expect(screen.getByText("noname@jpc.test")).toBeTruthy();
    expect(screen.getByText("Group A · Not started")).toBeTruthy();
    expect(screen.queryByText("Your submission")).toBeNull();
    expect(screen.queryByText("Start working")).toBeNull();
  });

  it("opens a started submission for review; a not-started row opens nothing", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    serve();
    renderWithProviders(<AssignmentDetailScreen />);

    fireEvent.press(await screen.findByText("noname@jpc.test"));
    expect(mockPush).not.toHaveBeenCalled();

    fireEvent.press(screen.getByText("Sara Student"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/submission/[publicId]", params: { publicId: "abc123defg" } });
  });

  it("edits, and deletes only on a second, confirming press", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    serve();
    del.mockResolvedValue({ data: { data: { deleted: true } } });
    renderWithProviders(<AssignmentDetailScreen />);

    fireEvent.press(await screen.findByText("Edit"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/assignment/[id]/edit", params: { id: "55" } });

    fireEvent.press(screen.getByText("Delete assignment"));
    expect(del).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText("Really delete?"));
    await waitFor(() => expect(del).toHaveBeenCalledWith("/api/v1/assignments/55"));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/assignments"));
  });

  it("shows the server's refusal when students have started it (409 has_submissions)", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    serve();
    del.mockRejectedValue(
      Object.assign(new Error("409"), {
        isAxiosError: true,
        response: {
          status: 409,
          data: { error: { code: "has_submissions", message: "Students have already started this assignment, so it can't be deleted." } },
        },
      }),
    );
    renderWithProviders(<AssignmentDetailScreen />);

    fireEvent.press(await screen.findByText("Delete assignment"));
    fireEvent.press(screen.getByText("Really delete?"));
    expect(
      await screen.findByText("Students have already started this assignment, so it can't be deleted."),
    ).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByText("Delete assignment")).toBeTruthy(); // disarmed again
  });

  it("gives a LEADER the tracker but no edit or delete (canManage is false)", async () => {
    useSessionStore.setState(makeSession("LEADER", { groupLeaderIds: [3] }));
    serve({ canManage: false });
    renderWithProviders(<AssignmentDetailScreen />);

    expect(await screen.findByText("1 of 2 submitted")).toBeTruthy();
    expect(screen.queryByText("Edit")).toBeNull();
    expect(screen.queryByText("Delete assignment")).toBeNull();
  });

  it("never asks a MENTOR's device for the tracker, which the server refuses them", async () => {
    useSessionStore.setState(makeSession("MENTOR"));
    serve({ canManage: false });
    renderWithProviders(<AssignmentDetailScreen />);

    expect(await screen.findByText("Assigned to: Group A")).toBeTruthy();
    expect(get).not.toHaveBeenCalledWith("/api/v1/assignments/55/tracker");
    expect(screen.queryByText("1 of 2 submitted")).toBeNull();
  });
});
