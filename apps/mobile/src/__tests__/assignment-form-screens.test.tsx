import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
}));
const mockReplace = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockReplace, back: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock("@react-native-community/datetimepicker", () => {
  const { Pressable, Text } = require("react-native");
  // Stands in for the native picker. A press "picks" a value built from LOCAL
  // fields — what the real picker hands back — so these assertions mean the
  // same thing in every device timezone (the closing gate runs this file
  // under two extreme TZs to prove it).
  return {
    __esModule: true,
    default: ({
      mode,
      onChange,
    }: {
      mode: "date" | "time";
      onChange: (event: { type: string }, date?: Date) => void;
    }) => (
      <Pressable
        accessibilityLabel={`Choose ${mode}`}
        onPress={() =>
          onChange({ type: "set" }, mode === "date" ? new Date(2099, 3, 1, 9, 0) : new Date(2099, 0, 1, 18, 30))
        }
      >
        <Text>{`native ${mode} picker`}</Text>
      </Pressable>
    ),
  };
});

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";

import EditAssignmentScreen from "../../app/(app)/assignment/[id]/edit";
import NewAssignmentScreen from "../../app/(app)/assignment/new";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;
const patch = apiClient.patch as jest.Mock;

const season = {
  id: 7, code: "s7", title: "Spring 2099", program: "TEST", year: 2099, status: "ACTIVE" as const,
  startDate: "2099-01-01T00:00:00.000Z", endDate: "2099-12-31T00:00:00.000Z",
};
const group = (id: number, name: string) => ({
  id, name, description: null, studentCount: 2, leaderNames: [],
  seasonId: 7, seasonCode: "s7", seasonTitle: "Spring 2099",
});
const sessionRow = {
  id: 12, title: "Week 4", startsAt: "2099-03-01T18:00:00.000Z", dayKey: "2099-03-01",
  durationMinutes: 60, location: null, recurrenceGroupId: null, attendanceMarked: false,
  seasonId: 7, seasonCode: "s7", seasonTitle: "Spring 2099",
  checkInToken: null, checkInOpenAt: null, checkInClosedAt: null, startTime: "20:00",
};
const detail = {
  id: 55, seasonId: 7, seasonCode: "s7", seasonTitle: "Spring 2099",
  sessionId: null, sessionTitle: null, title: "Essay one", description: "Write about the thing.",
  dueAt: "2099-04-01T21:59:00.000Z", dueOrgDay: "2099-04-01", dueOrgTime: "23:59",
  isOverdue: false, isAllGroups: false, type: "STANDARD" as const, forumMinWords: null,
  forumAllowComments: false, maxFileSizeMb: 10, allowedMimeCategories: ["pdf" as const],
  groupIds: [3], mySubmission: null, canManage: true,
};
const tracker = {
  assignmentId: 55, dueAt: detail.dueAt, isOverdue: false, submittedCount: 1, expectedCount: 2,
  rows: [
    {
      studentUserId: 9, name: "Sara Student", email: "sara@jpc.test", groupId: 3, groupName: "Group A",
      status: "SUBMITTED" as const, isLate: false, submittedAt: "2099-03-30T10:00:00.000Z",
      reviewedAt: null, submissionPublicId: "abc123defg",
    },
    {
      studentUserId: 10, name: "Nadia", email: "nadia@jpc.test", groupId: 3, groupName: "Group A",
      status: "PENDING" as const, isLate: false, submittedAt: null, reviewedAt: null,
      submissionPublicId: null,
    },
  ],
};

const ok = (data: unknown) => Promise.resolve({ data: { data } });

function serve(extra: Record<string, unknown> = {}) {
  const table: Record<string, unknown> = {
    "/api/v1/seasons": { seasons: [season] },
    "/api/v1/seasons/7/groups": { groups: [group(3, "Group A"), group(4, "Group B")] },
    "/api/v1/seasons/7/sessions": { sessions: [sessionRow] },
    ...extra,
  };
  get.mockImplementation((url: string) =>
    url in table ? ok(table[url]) : Promise.reject(new Error(`unexpected GET ${url}`)),
  );
}

const STANDARD_DEFAULTS = {
  description: null, dueDay: null, dueTime: null, sessionId: null, type: "STANDARD",
  forumMinWords: null, forumAllowComments: false, maxFileSizeMb: null,
  allowedMimeCategories: [], isAllGroups: true, groupIds: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("NewAssignmentScreen", () => {
  beforeEach(() => useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] })));

  it("creates a group-targeted assignment due at an org-clock time, then opens it", async () => {
    serve();
    post.mockResolvedValue({ data: { data: { ...detail, id: 77 } } });
    renderWithProviders(<NewAssignmentScreen />);

    fireEvent.changeText(await screen.findByLabelText("Title"), "Week 4 reflection");
    expect(screen.getByText("Due: No due date")).toBeTruthy();
    fireEvent.press(screen.getByText("Pick due date"));
    fireEvent.press(screen.getByLabelText("Choose date"));
    expect(screen.getByText("Due: Apr 1, 2099, 11:59 PM")).toBeTruthy(); // R19's 23:59 default
    fireEvent.press(screen.getByText("Pick due time"));
    fireEvent.press(screen.getByLabelText("Choose time"));
    expect(screen.getByText("Due: Apr 1, 2099, 6:30 PM")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Specific groups"));
    fireEvent.press(screen.getByLabelText("Group B"));
    fireEvent.press(screen.getByText("Create assignment"));

    // The device composes no instant: it sends the day and time it was given.
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/seasons/7/assignments", {
        ...STANDARD_DEFAULTS,
        title: "Week 4 reflection",
        dueDay: "2099-04-01",
        dueTime: "18:30",
        isAllGroups: false,
        groupIds: [4],
      }),
    );
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith({ pathname: "/assignment/[id]", params: { id: "77" } }),
    );
  });

  it("FORUM hides file settings and sends forum config (R14, R21, R25)", async () => {
    serve();
    post.mockResolvedValue({ data: { data: { ...detail, id: 78 } } });
    renderWithProviders(<NewAssignmentScreen />);

    fireEvent.changeText(await screen.findByLabelText("Title"), "Discuss");
    expect(screen.getByLabelText("Accept file uploads")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Forum"));
    expect(screen.queryByLabelText("Accept file uploads")).toBeNull();
    expect(screen.getByDisplayValue("50")).toBeTruthy(); // R21 default
    fireEvent(screen.getByLabelText("Allow peer comments"), "valueChange", true);
    fireEvent.press(screen.getByText("Create assignment"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/seasons/7/assignments", {
        ...STANDARD_DEFAULTS,
        title: "Discuss",
        type: "FORUM",
        forumMinWords: 50,
        forumAllowComments: true,
      }),
    );
  });

  it("accepts files at the 10 MB default with the ticked types, and links a session (R10, R22)", async () => {
    serve();
    post.mockResolvedValue({ data: { data: { ...detail, id: 79 } } });
    renderWithProviders(<NewAssignmentScreen />);

    fireEvent.changeText(await screen.findByLabelText("Title"), "Upload it");
    fireEvent(screen.getByLabelText("Accept file uploads"), "valueChange", true);
    expect(screen.getByDisplayValue("10")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("PDFs"));
    fireEvent.press(screen.getByLabelText("Week 4 · Mar 1, 2099"));
    fireEvent.press(screen.getByText("Create assignment"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/seasons/7/assignments", {
        ...STANDARD_DEFAULTS,
        title: "Upload it",
        sessionId: 12,
        maxFileSizeMb: 10,
        allowedMimeCategories: ["pdf"],
      }),
    );
  });

  it("refuses 'specific groups' with none ticked, using the shared schema's words, without calling the API", async () => {
    serve();
    renderWithProviders(<NewAssignmentScreen />);

    fireEvent.changeText(await screen.findByLabelText("Title"), "Nobody");
    fireEvent.press(screen.getByLabelText("Specific groups"));
    fireEvent.press(screen.getByText("Create assignment"));

    expect(await screen.findByText("Choose at least one group, or target the whole season.")).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
  });

  it("shows the server's refusal verbatim and stays on the form", async () => {
    serve();
    post.mockRejectedValue(
      Object.assign(new Error("400"), {
        isAxiosError: true,
        response: {
          status: 400,
          data: { error: { code: "invalid_group", message: "Every group must belong to this assignment's season." } },
        },
      }),
    );
    renderWithProviders(<NewAssignmentScreen />);

    fireEvent.changeText(await screen.findByLabelText("Title"), "Week 4 reflection");
    fireEvent.press(screen.getByText("Create assignment"));

    expect(await screen.findByText("Every group must belong to this assignment's season.")).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("is not offered to a LEADER, whose device fetches nothing", async () => {
    useSessionStore.setState(makeSession("LEADER", { groupLeaderIds: [3] }));
    renderWithProviders(<NewAssignmentScreen />);
    expect(await screen.findByText("Not available")).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  });
});

describe("EditAssignmentScreen", () => {
  beforeEach(() => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    mockParams = { id: "55" };
  });

  it("pre-fills from the server's org fields and PATCHes the whole assignment (R67)", async () => {
    serve({ "/api/v1/assignments/55": detail, "/api/v1/assignments/55/tracker": tracker });
    patch.mockResolvedValue({ data: { data: { ...detail, title: "Essay two" } } });
    renderWithProviders(<EditAssignmentScreen />);

    const title = await screen.findByDisplayValue("Essay one");
    expect(screen.getByText("Due: Apr 1, 2099, 11:59 PM")).toBeTruthy();
    expect(screen.getByDisplayValue("10")).toBeTruthy(); // acceptsFiles re-derived from the size (R10)
    fireEvent.changeText(title, "Essay two");
    fireEvent.press(screen.getByText("Save changes"));

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/api/v1/assignments/55", {
        ...STANDARD_DEFAULTS,
        title: "Essay two",
        description: "Write about the thing.",
        dueDay: "2099-04-01",
        dueTime: "23:59",
        maxFileSizeMb: 10,
        allowedMimeCategories: ["pdf"],
        isAllGroups: false,
        groupIds: [3],
      }),
    );
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith({ pathname: "/assignment/[id]", params: { id: "55" } }),
    );
  });

  it("warns when narrowing the targets would hide work students already started (§10 item 5)", async () => {
    serve({ "/api/v1/assignments/55": detail, "/api/v1/assignments/55/tracker": tracker });
    renderWithProviders(<EditAssignmentScreen />);

    await screen.findByDisplayValue("Essay one");
    expect(screen.queryByText(/already started or submitted/)).toBeNull();
    fireEvent.press(screen.getByLabelText("Group A")); // untick
    fireEvent.press(screen.getByLabelText("Group B")); // tick

    // Sara (SUBMITTED, Group A) is hidden by this edit; Nadia (not started) is not counted.
    expect(
      await screen.findByText(
        "1 student in groups you removed has already started or submitted work. They will no longer see this assignment; their work is kept.",
      ),
    ).toBeTruthy();
  });

  it("clears the due date", async () => {
    serve({ "/api/v1/assignments/55": detail, "/api/v1/assignments/55/tracker": tracker });
    patch.mockResolvedValue({ data: { data: { ...detail, dueAt: null, dueOrgDay: null, dueOrgTime: null } } });
    renderWithProviders(<EditAssignmentScreen />);

    await screen.findByDisplayValue("Essay one");
    fireEvent.press(screen.getByText("Clear due date"));
    expect(screen.getByText("Due: No due date")).toBeTruthy();
    fireEvent.press(screen.getByText("Save changes"));

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith(
        "/api/v1/assignments/55",
        expect.objectContaining({ dueDay: null, dueTime: null }),
      ),
    );
  });

  it("refuses the form when the server says this caller cannot manage it", async () => {
    serve({ "/api/v1/assignments/55": { ...detail, canManage: false } });
    renderWithProviders(<EditAssignmentScreen />);
    expect(await screen.findByText("Not available")).toBeTruthy();
    expect(screen.queryByText("Save changes")).toBeNull();
  });
});
