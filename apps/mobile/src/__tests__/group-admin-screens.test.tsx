import { fireEvent, screen, waitFor, within } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockDismissTo = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ push: mockPush, replace: mockReplace, dismissTo: mockDismissTo, back: jest.fn() }),
}));

jest.mock("../design/ui/toaster", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
  Toaster: () => null,
}));

import { toast } from "../design/ui/toaster";
import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";
import GroupDetailScreen from "../../app/(app)/group/[id]/index";
import GroupsScreen from "../../app/(app)/(tabs)/groups";
import NewGroupScreen from "../../app/(app)/group/new";
import EditGroupScreen from "../../app/(app)/group/[id]/edit";
import SeasonRosterScreen from "../../app/(app)/seasons/[code]/roster/index";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;
const patch = apiClient.patch as jest.Mock;
const put = apiClient.put as jest.Mock;
const del = apiClient.delete as jest.Mock;

/** Open a v1 MultiSelect by its label and tick an option by its visible label. */
async function pickOption(select: string, option: string) {
  fireEvent.press(await screen.findByLabelText(select));
  fireEvent.press(await screen.findByText(option));
}

/** Open a student's group sheet from the roster and stage a group by its title. */
async function choose(student: string, group: string) {
  fireEvent.press(await screen.findByText(student));
  fireEvent.press(await screen.findByText(group));
}
const saveBar = (label: string) => fireEvent.press(within(screen.getByTestId("save-bar")).getByText(label));

const ok = (data: unknown) => Promise.resolve({ data: { data } });
const seasonRow = (id: number, status: "DRAFT" | "ACTIVE", startDate: string) => ({
  id,
  code: `s${id}`,
  title: `Season ${id}`,
  program: "TEST",
  year: 2099,
  status,
  startDate,
  endDate: "2099-12-31T00:00:00.000Z",
});
const groupRow = (id: number, name: string, seasonId: number) => ({
  id,
  name,
  description: null,
  studentCount: 1,
  leaderNames: ["Lina"],
  seasonId,
  seasonCode: `s${seasonId}`,
  seasonTitle: `Season ${seasonId}`,
});
const roster = [
  {
    userId: 21,
    name: "Sara",
    email: "sara@jpc.test",
    groupId: 3,
    groupName: "Group A",
  },
  {
    userId: 22,
    name: "Omar",
    email: "omar@jpc.test",
    groupId: null,
    groupName: null,
  },
];
const seasonDetail = {
  id: 7,
  code: "s7",
  title: "Season 7",
  program: "TEST",
  year: 2099,
  status: "ACTIVE",
  startDate: "2099-01-01T00:00:00.000Z",
  endDate: "2099-12-31T00:00:00.000Z",
  description: null,
  sessionCount: 0,
  studentCount: 2,
  absenceBudgetMinutes: 180,
  absenceWeightMinutes: 90,
  canAdminister: true,
  groups: [],
};

function routeGets(extra: Record<string, unknown> = {}) {
  get.mockImplementation((url: string) => {
    const table: Record<string, unknown> = {
      "/api/v1/seasons": {
        seasons: [
          seasonRow(8, "DRAFT", "2099-09-01T00:00:00.000Z"),
          seasonRow(7, "ACTIVE", "2099-02-01T00:00:00.000Z"),
        ],
      },
      "/api/v1/seasons/7/groups": {
        groups: [groupRow(3, "Group A", 7), groupRow(4, "Group B", 7)],
      },
      "/api/v1/seasons/8/groups": { groups: [groupRow(9, "Autumn group", 8)] },
      "/api/v1/seasons/7/roster": { roster },
      "/api/v1/seasons/by-code/s7": seasonDetail,
      "/api/v1/seasons/7": seasonDetail,
      "/api/v1/groups/leader-options": {
        leaders: [
          { id: 5, name: "Lina", email: "lina@jpc.test" },
          { id: 6, name: "Karim", email: "karim@jpc.test" },
        ],
      },
      "/api/v1/groups/3": {
        id: 3,
        name: "Group A",
        description: null,
        seasonId: 7,
        seasonCode: "s7",
        seasonTitle: "Season 7",
        leaders: [{ id: 5, name: "Lina", email: "lina@jpc.test" }],
        students: [{ id: 21, name: "Sara", email: "sara@jpc.test" }],
        canManage: true,
      },
      "/api/v1/groups/3/impact": {
        studentCount: 1,
        leaderCount: 1,
        soleTargetAssignments: [{ id: 70, title: "Only A" }],
      },
      ...extra,
    };
    return url in table ? ok(table[url]) : Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("/groups — ADMIN/SUPER season branch (G6, D-16.16)", () => {
  it("lists the current season's groups and switches season", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7, 8] }));
    routeGets();
    renderWithProviders(<GroupsScreen />);

    expect(await screen.findByText("Group A")).toBeTruthy();
    expect(screen.getByText("2 groups in Season 7")).toBeTruthy();
    // Rows say what the figure counts, and name the leaders (no bare "1").
    expect(screen.getAllByText("1 student · Lina").length).toBe(2);
    expect(screen.getByRole("header", { name: "Groups" })).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/seasons/7/groups");
    expect(get).not.toHaveBeenCalledWith("/api/v1/groups");

    fireEvent.press(screen.getByText("Season 8"));
    expect(await screen.findByText("Autumn group")).toBeTruthy();

    fireEvent.press(screen.getByText("New group"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/group/new", params: { seasonId: "8" } });
    fireEvent.press(screen.getByText("Assign to groups"));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/seasons/[code]/roster",
      params: { code: "s8" },
    });
    fireEvent.press(screen.getByText("Autumn group"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/group/[id]", params: { id: "9" } });
  });

  it("serves SUPER too (v1 rejected SUPER here, spec 05 R92 — not ported)", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    routeGets();
    renderWithProviders(<GroupsScreen />);
    expect(await screen.findByText("Group A")).toBeTruthy();
  });

  it("gives MENTOR a graceful state and fetches nothing (spec 05 §9)", async () => {
    useSessionStore.setState(makeSession("MENTOR"));
    renderWithProviders(<GroupsScreen />);
    expect(await screen.findByText("Groups aren't available for your role.")).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  });
});

describe("/group/new", () => {
  it("creates a group with picked leaders and students and opens it", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    mockParams = { seasonId: "7" };
    routeGets();
    post.mockResolvedValue({ data: { data: { id: 30 } } });
    renderWithProviders(<NewGroupScreen />);

    expect(await screen.findByText("Add a group to Season 7.")).toBeTruthy();
    fireEvent.changeText(await screen.findByLabelText("Name"), "Group C");
    await pickOption("Leaders", "Karim");
    await pickOption("Students", "Omar");
    // Omar has no group in this season, so no "moves them" hint. A group in
    // another season is not mentioned: memberships are per season (Plan 18
    // M1), so saving here leaves it alone.
    fireEvent.press(screen.getByLabelText("Students"));
    expect(screen.getAllByText("omar@jpc.test").length).toBeGreaterThan(0);
    expect(screen.queryByText(/^omar@jpc\.test · /)).toBeNull();
    // Sara is in another group of THIS season, which saving does change.
    expect(screen.getByText("sara@jpc.test · Now in Group A — saving moves them here.")).toBeTruthy();
    saveBar("Create group");

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/seasons/7/groups", {
        name: "Group C",
        description: null,
        leaderIds: [6],
        studentIds: [22],
      }),
    );
    expect(mockReplace).toHaveBeenCalledWith({ pathname: "/group/[id]", params: { id: "30" } });
  });

  it("shows the replace-lists helper only when editing", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    mockParams = { seasonId: "7" };
    routeGets();
    renderWithProviders(<NewGroupScreen />);
    await screen.findByLabelText("Name");
    expect(screen.queryByText(/Saving replaces/)).toBeNull();
  });

  it("validates the name with the server's schema", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    mockParams = { seasonId: "7" };
    routeGets();
    renderWithProviders(<NewGroupScreen />);
    fireEvent.changeText(await screen.findByLabelText("Name"), "C");
    saveBar("Create group");
    expect(screen.getByLabelText("Name").props.accessibilityHint).toMatch(/at least 2/);
    expect(post).not.toHaveBeenCalled();
    expect(
      within(screen.getByTestId("save-bar")).getByText("Fix the fields marked above."),
    ).toBeTruthy();
  });
});

describe("/group/[id]/edit", () => {
  it("says saving replaces the lists", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    mockParams = { id: "3" };
    routeGets();
    renderWithProviders(<EditGroupScreen />);
    expect(await screen.findByText(/Saving replaces this group's leaders/)).toBeTruthy();
  });

  it("pre-selects members from the ROSTER (SeasonEnrollment, C9) and saves the full lists", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    mockParams = { id: "3" };
    routeGets();
    patch.mockResolvedValue({ data: { data: { id: 3 } } });
    renderWithProviders(<EditGroupScreen />);

    expect((await screen.findByLabelText("Name")).props.value).toBe("Group A");
    await pickOption("Students", "Omar");
    saveBar("Save changes");
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/api/v1/groups/3", {
        name: "Group A",
        description: null,
        leaderIds: [5],
        studentIds: [21, 22],
      }),
    );
  });

  it("shows the delete impact, and the server's refusal while an assignment targets only this group", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    mockParams = { id: "3" };
    routeGets();
    del.mockRejectedValueOnce(
      Object.assign(new Error("409"), {
        isAxiosError: true,
        response: {
          status: 409,
          data: {
            error: {
              code: "group_has_sole_targets",
              message: "1 assignment(s) target only this group. Retarget them before deleting it.",
            },
          },
        },
      }),
    );
    renderWithProviders(<EditGroupScreen />);

    expect(
      await screen.findByText("Deleting unassigns 1 student and removes 1 leader."),
    ).toBeTruthy();
    expect(screen.getByText("Only A")).toBeTruthy();
    fireEvent.press(screen.getByText("Delete group"));
    expect(del).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText("Really delete?"));
    await waitFor(() => expect(del).toHaveBeenCalledWith("/api/v1/groups/3"));
    expect(
      await screen.findByText(
        "1 assignment(s) target only this group. Retarget them before deleting it.",
      ),
    ).toBeTruthy();
  });

  it("deletes and returns to /groups", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    mockParams = { id: "3" };
    routeGets({
      "/api/v1/groups/3/impact": { studentCount: 1, leaderCount: 1, soleTargetAssignments: [] },
    });
    del.mockResolvedValue({ data: { data: { deleted: true, orphanedStudentIds: [21] } } });
    renderWithProviders(<EditGroupScreen />);
    fireEvent.press(await screen.findByText("Delete group"));
    fireEvent.press(screen.getByText("Really delete?"));
    await waitFor(() => expect(mockDismissTo).toHaveBeenCalledWith("/groups"));
  });
});

describe("/seasons/[code]/roster (G7)", () => {
  it("sends only the rows that changed and reports what was WRITTEN", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    mockParams = { code: "s7" };
    routeGets();
    put.mockResolvedValue({
      data: { data: { assigned: 1, unassigned: 1, skippedStudentIds: [] } },
    });
    renderWithProviders(<SeasonRosterScreen />);

    expect(
      await screen.findByText("2 students in Season 7. Tap a student to set their group."),
    ).toBeTruthy();
    expect(screen.getByText("sara@jpc.test · Group A")).toBeTruthy();
    expect(screen.getByText("omar@jpc.test · Unassigned")).toBeTruthy();
    await choose("Sara", "Unassigned");
    await choose("Omar", "Group B");
    expect(screen.getAllByText("Not saved")).toHaveLength(2);
    expect(screen.getByText("omar@jpc.test · Group B")).toBeTruthy();
    // Picking a student's own group again unstages them.
    await choose("Omar", "Unassigned");
    expect(screen.getAllByText("Not saved")).toHaveLength(1);
    await choose("Omar", "Group B");
    saveBar("Save 2 changes");

    await waitFor(() =>
      expect(put).toHaveBeenCalledWith("/api/v1/seasons/7/group-assignments", {
        assignments: [
          { studentUserId: 21, groupId: null },
          { studentUserId: 22, groupId: 4 },
        ],
      }),
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Assigned 1, unassigned 1."));
  });

  it("offers Import groups to a season admin, pushing the importer route", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    mockParams = { code: "s7" };
    routeGets();
    renderWithProviders(<SeasonRosterScreen />);
    fireEvent.press(await screen.findByText("Import assignments"));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/seasons/[code]/roster/import",
      params: { code: "s7" },
    });
  });

  it("does not offer Import groups to a caller who cannot administer the season", async () => {
    useSessionStore.setState(makeSession("LEADER", { groupLeaderIds: [3] }));
    mockParams = { code: "s7" };
    routeGets({ "/api/v1/seasons/by-code/s7": { ...seasonDetail, canAdminister: false } });
    renderWithProviders(<SeasonRosterScreen />);
    await screen.findByText("Only this season's admins can manage its roster.");
    expect(screen.queryByText("Import assignments")).toBeNull();
  });

  it("refuses a caller the server says does not administer the season (C4)", async () => {
    useSessionStore.setState(makeSession("LEADER", { groupLeaderIds: [3] }));
    mockParams = { code: "s7" };
    routeGets({ "/api/v1/seasons/by-code/s7": { ...seasonDetail, canAdminister: false } });
    renderWithProviders(<SeasonRosterScreen />);
    expect(
      await screen.findByText("Only this season's admins can manage its roster."),
    ).toBeTruthy();
    expect(get).not.toHaveBeenCalledWith("/api/v1/seasons/7/roster");
  });
});

describe("/group/[id] — Edit for managers only (D-16.15)", () => {
  it("shows Edit when canManage", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    mockParams = { id: "3" };
    routeGets();
    renderWithProviders(<GroupDetailScreen />);
    fireEvent.press(await screen.findByText("Edit group"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/group/[id]/edit", params: { id: "3" } });
  });
});
