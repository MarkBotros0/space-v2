import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn() }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";
import GroupDetailScreen from "../../app/(app)/group/[id]/index";
import GroupsScreen from "../../app/(app)/groups";
import NewGroupScreen from "../../app/(app)/group/new";
import EditGroupScreen from "../../app/(app)/group/[id]/edit";
import SeasonRosterScreen from "../../app/(app)/seasons/[code]/roster/index";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;
const patch = apiClient.patch as jest.Mock;
const put = apiClient.put as jest.Mock;
const del = apiClient.delete as jest.Mock;

const ok = (data: unknown) => Promise.resolve({ data: { data } });
const seasonRow = (id: number, status: "DRAFT" | "ACTIVE", startDate: string) => ({
  id, code: `s${id}`, title: `Season ${id}`, program: "TEST", year: 2099, status, startDate, endDate: "2099-12-31T00:00:00.000Z",
});
const groupRow = (id: number, name: string, seasonId: number) => ({
  id, name, description: null, studentCount: 1, leaderNames: ["Lina"], seasonId, seasonCode: `s${seasonId}`, seasonTitle: `Season ${seasonId}`,
});
const roster = [
  { userId: 21, name: "Sara", email: "sara@jpc.test", groupId: 3, groupName: "Group A" },
  { userId: 22, name: "Omar", email: "omar@jpc.test", groupId: null, groupName: null },
];
const seasonDetail = {
  id: 7, code: "s7", title: "Season 7", program: "TEST", year: 2099, status: "ACTIVE",
  startDate: "2099-01-01T00:00:00.000Z", endDate: "2099-12-31T00:00:00.000Z", description: null,
  sessionCount: 0, studentCount: 2, absenceBudgetMinutes: 180, absenceWeightMinutes: 90, canAdminister: true, groups: [],
};

function routeGets(extra: Record<string, unknown> = {}) {
  get.mockImplementation((url: string) => {
    const table: Record<string, unknown> = {
      "/api/v1/seasons": { seasons: [seasonRow(8, "DRAFT", "2099-09-01T00:00:00.000Z"), seasonRow(7, "ACTIVE", "2099-02-01T00:00:00.000Z")] },
      "/api/v1/seasons/7/groups": { groups: [groupRow(3, "Group A", 7), groupRow(4, "Group B", 7)] },
      "/api/v1/seasons/8/groups": { groups: [groupRow(9, "Autumn group", 8)] },
      "/api/v1/seasons/7/roster": { roster },
      "/api/v1/seasons/by-code/s7": seasonDetail,
      // v1 parity 2026-10-09 (spec 05 R18/R78): the form picks from every live student.
      "/api/v1/groups/student-options": {
        students: [
          { id: 21, name: "Sara", email: "sara@jpc.test" },
          { id: 22, name: "Omar", email: "omar@jpc.test" },
          { id: 23, name: "Nadia", email: "nadia@jpc.test" },
        ],
      },
      "/api/v1/groups/leader-options": { leaders: [{ id: 5, name: "Lina", email: "lina@jpc.test" }, { id: 6, name: "Karim", email: "karim@jpc.test" }] },
      "/api/v1/groups/3": {
        id: 3, name: "Group A", description: null, seasonId: 7, seasonCode: "s7", seasonTitle: "Season 7",
        leaders: [{ id: 5, name: "Lina", email: "lina@jpc.test" }], students: [{ id: 21, name: "Sara", email: "sara@jpc.test" }],
        canManage: true,
      },
      "/api/v1/groups/3/impact": { studentCount: 1, leaderCount: 1, soleTargetAssignments: [{ id: 70, title: "Only A" }] },
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
  // v1 parity 2026-10-09 (spec 05 R91): v1 admin/groups/page.tsx:25-40 opens the newest
  // season by startDate whatever its status — here season 8 (DRAFT, Sep).
  it("opens the newest season's groups (any status) and switches season", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7, 8] }));
    routeGets();
    renderWithProviders(<GroupsScreen />);

    expect(await screen.findByText("Autumn group")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/seasons/8/groups");
    expect(get).not.toHaveBeenCalledWith("/api/v1/groups");

    fireEvent.press(screen.getByText("Season 7"));
    expect(await screen.findByText("Group A")).toBeTruthy();

    fireEvent.press(screen.getByText("New group"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/group/new", params: { seasonId: "7" } });
    fireEvent.press(screen.getByText("Roster"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/seasons/[code]/roster", params: { code: "s7" } });
    fireEvent.press(screen.getByText("Group A"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/group/[id]", params: { id: "3" } });
  });

  it("selects the season named by a seasonId param (group create/edit returning, R97)", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7, 8] }));
    mockParams = { seasonId: "7" };
    routeGets();
    renderWithProviders(<GroupsScreen />);
    expect(await screen.findByText("Group A")).toBeTruthy();
    expect(get).not.toHaveBeenCalledWith("/api/v1/seasons/8/groups");
  });

  it("serves SUPER too (v1 rejected SUPER here, spec 05 R92 — not ported)", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    routeGets();
    renderWithProviders(<GroupsScreen />);
    expect(await screen.findByText("Autumn group")).toBeTruthy();
  });

  it("gives MENTOR a graceful state and fetches nothing (spec 05 §9)", async () => {
    useSessionStore.setState(makeSession("MENTOR"));
    renderWithProviders(<GroupsScreen />);
    expect(await screen.findByText("Groups aren't available for your role.")).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  });
});

describe("/group/new", () => {
  it("creates a group from every live student and returns to the season's groups", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    mockParams = { seasonId: "7" };
    routeGets();
    post.mockResolvedValue({ data: { data: { id: 30 } } });
    renderWithProviders(<NewGroupScreen />);

    fireEvent.changeText(await screen.findByLabelText("Name"), "Group C");
    fireEvent.press(await screen.findByLabelText("Karim"));
    // Nadia is not on the season roster: v1's picker lists every live student (spec 05 R78).
    fireEvent.press(await screen.findByLabelText("Nadia"));
    // v1 group-form.tsx:148's single helper line, no per-student caption (spec 05 R79).
    expect(
      screen.getByText(
        "Students enrolled in this group for the current season. Adding a student here will move them out of any other group.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/saving moves them here/)).toBeNull();
    fireEvent.press(screen.getByText("Create group"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/seasons/7/groups", {
        name: "Group C", description: null, leaderIds: [6], studentIds: [23],
      }),
    );
    expect(get).toHaveBeenCalledWith("/api/v1/groups/student-options");
    // v1 parity 2026-10-09 (spec 05 R97): v1 group-form.tsx:107 returns to the season's groups.
    expect(mockReplace).toHaveBeenCalledWith({ pathname: "/groups", params: { seasonId: "7" } });
  });

  it("validates the name with the server's schema", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    mockParams = { seasonId: "7" };
    routeGets();
    renderWithProviders(<NewGroupScreen />);
    fireEvent.changeText(await screen.findByLabelText("Name"), "C");
    fireEvent.press(screen.getByText("Create group"));
    expect(screen.getByLabelText("Name").props.accessibilityHint).toMatch(/at least 2/);
    expect(post).not.toHaveBeenCalled();
  });
});

describe("/group/[id]/edit", () => {
  it("pre-selects members from the ROSTER (SeasonEnrollment, C9) and saves the full lists", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    mockParams = { id: "3" };
    routeGets();
    patch.mockResolvedValue({ data: { data: { id: 3 } } });
    renderWithProviders(<EditGroupScreen />);

    expect((await screen.findByLabelText("Name")).props.value).toBe("Group A");
    fireEvent.press(await screen.findByLabelText("Omar"));
    fireEvent.press(screen.getByText("Save group"));
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/api/v1/groups/3", {
        name: "Group A", description: null, leaderIds: [5], studentIds: [21, 22],
      }),
    );
    // v1 parity 2026-10-09 (spec 05 R97).
    expect(mockReplace).toHaveBeenCalledWith({ pathname: "/groups", params: { seasonId: "7" } });
  });

  it("shows the delete impact, and the server's refusal while an assignment targets only this group", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    mockParams = { id: "3" };
    routeGets();
    del.mockRejectedValueOnce(
      Object.assign(new Error("409"), {
        isAxiosError: true,
        response: { status: 409, data: { error: { code: "group_has_sole_targets", message: "1 assignment(s) target only this group. Retarget them before deleting it." } } },
      }),
    );
    renderWithProviders(<EditGroupScreen />);

    expect(await screen.findByText("Deleting unassigns 1 student and removes 1 leader.")).toBeTruthy();
    expect(screen.getByText("Only A")).toBeTruthy();
    fireEvent.press(screen.getByText("Delete group"));
    expect(del).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText("Really delete?"));
    await waitFor(() => expect(del).toHaveBeenCalledWith("/api/v1/groups/3"));
    expect(await screen.findByText("1 assignment(s) target only this group. Retarget them before deleting it.")).toBeTruthy();
  });

  it("deletes and returns to /groups", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    mockParams = { id: "3" };
    routeGets({ "/api/v1/groups/3/impact": { studentCount: 1, leaderCount: 1, soleTargetAssignments: [] } });
    del.mockResolvedValue({ data: { data: { deleted: true, orphanedStudentIds: [21] } } });
    renderWithProviders(<EditGroupScreen />);
    fireEvent.press(await screen.findByText("Delete group"));
    fireEvent.press(screen.getByText("Really delete?"));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/groups"));
  });
});

describe("/seasons/[code]/roster (G7)", () => {
  it("sends only the rows that changed and reports what was WRITTEN", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    mockParams = { code: "s7" };
    routeGets();
    put.mockResolvedValue({ data: { data: { assigned: 1, unassigned: 1, skippedStudentIds: [] } } });
    renderWithProviders(<SeasonRosterScreen />);

    // v1 parity 2026-10-09 (spec 05 R82): no other-season caption.
    fireEvent.press(await screen.findByLabelText("Sara: Unassigned"));
    expect(screen.queryByText(/Also in/)).toBeNull();
    fireEvent.press(screen.getByLabelText("Omar: Group B"));
    // Pressing a row back to its original group drops it from the batch.
    fireEvent.press(screen.getByLabelText("Omar: Group A"));
    fireEvent.press(screen.getByLabelText("Omar: Unassigned"));
    fireEvent.press(screen.getByText("Save 1 change"));

    await waitFor(() =>
      expect(put).toHaveBeenCalledWith("/api/v1/seasons/7/group-assignments", {
        assignments: [{ studentUserId: 21, groupId: null }],
      }),
    );
    // v1 parity 2026-10-09 (spec 05 R101): v1 roster-grid.tsx:84-87's wording, N = rows written.
    expect(await screen.findByText("Updated 2 students.")).toBeTruthy();
  });

  it("offers Import groups to a season admin, pushing the importer route", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    mockParams = { code: "s7" };
    routeGets();
    renderWithProviders(<SeasonRosterScreen />);
    fireEvent.press(await screen.findByText("Import groups"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/seasons/[code]/roster/import", params: { code: "s7" } });
  });

  it("does not offer Import groups to a caller who cannot administer the season", async () => {
    useSessionStore.setState(makeSession("LEADER", { groupLeaderIds: [3] }));
    mockParams = { code: "s7" };
    routeGets({ "/api/v1/seasons/by-code/s7": { ...seasonDetail, canAdminister: false } });
    renderWithProviders(<SeasonRosterScreen />);
    await screen.findByText("Only this season's admins can manage its roster.");
    expect(screen.queryByText("Import groups")).toBeNull();
  });

  it("refuses a caller the server says does not administer the season (C4)", async () => {
    useSessionStore.setState(makeSession("LEADER", { groupLeaderIds: [3] }));
    mockParams = { code: "s7" };
    routeGets({ "/api/v1/seasons/by-code/s7": { ...seasonDetail, canAdminister: false } });
    renderWithProviders(<SeasonRosterScreen />);
    expect(await screen.findByText("Only this season's admins can manage its roster.")).toBeTruthy();
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
