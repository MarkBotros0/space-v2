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

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";
import NewGroupScreen from "../../app/(app)/group/new";
import EditGroupScreen from "../../app/(app)/group/[id]/edit";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;
const patch = apiClient.patch as jest.Mock;
const del = apiClient.delete as jest.Mock;

/** Open a v1 MultiSelect by its label and tick an option by its visible label. */
async function pickOption(select: string, option: string) {
  fireEvent.press(await screen.findByLabelText(select));
  fireEvent.press(await screen.findByText(option));
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
  assignmentCount: 0,
  quizCount: 0,
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
      "/api/v1/seasons/7/staff-candidates": {
        people: [
          { id: 6, name: "Karim", lastSeason: { title: "GBV 2025" } },
          { id: 8, name: "Nora", lastSeason: null },
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

describe("/group/new", () => {
  it("creates a group with picked leaders and students and opens it", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    mockParams = { seasonId: "7" };
    routeGets();
    post.mockResolvedValue({ data: { data: { id: 30 } } });
    renderWithProviders(<NewGroupScreen />);

    expect(await screen.findByText("Add a group to Season 7.")).toBeTruthy();
    fireEvent.changeText(await screen.findByLabelText("Name"), "Group C");
    fireEvent.press(await screen.findByText("Add leader"));
    fireEvent.press(await screen.findByText("Karim"));
    await pickOption("Members", "Omar");
    // Each row says where they are now (owner, 2026-11-07). Omar has no group in
    // this season; a group in another season is not mentioned: memberships are
    // per season (Plan 18 M1), so saving here leaves it alone.
    expect(screen.getByLabelText("Omar. Not in a group yet")).toBeTruthy();
    // Sara is in another group of THIS season, which saving does change.
    expect(screen.getByText("In Group A · picking moves them here")).toBeTruthy();
    expect(screen.getByRole("header", { name: "NOT IN A GROUP" })).toBeTruthy();
    expect(screen.getByRole("header", { name: "IN ANOTHER GROUP" })).toBeTruthy();
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
    expect(within(screen.getByTestId("save-bar")).getByText("Fix the fields marked above.")).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText("Name"), "Alpha");
    expect(within(screen.getByTestId("save-bar")).queryByText("Fix the fields marked above.")).toBeNull();
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
    await pickOption("Members", "Omar");
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

  it("lists the group's current leaders, removes one, and offers them again in the sheet", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    mockParams = { id: "3" };
    routeGets();
    patch.mockResolvedValue({ data: { data: { id: 3 } } });
    renderWithProviders(<EditGroupScreen />);

    await screen.findByDisplayValue("Group A");
    // Lina leads the group but is no candidate (she has a role); she is still a row.
    expect(await screen.findByText("Lina")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Remove Lina"));
    fireEvent.press(screen.getByText("Add leader"));
    // Back in the sheet, with the reason she is listed, in words; last season for Karim.
    expect(await screen.findByText("Leads this group")).toBeTruthy();
    expect(screen.getByText("GBV 2025")).toBeTruthy();
    fireEvent.press(screen.getByText("Karim"));
    saveBar("Save changes");
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/api/v1/groups/3", expect.objectContaining({ leaderIds: [6] })),
    );
  });

  it("offers a season admin as a leader: the signed-in admin themselves, and every admin to a SUPER", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }, { id: 40, name: "Ada Admin" }));
    mockParams = { id: "3" };
    routeGets();
    const own = renderWithProviders(<EditGroupScreen />);
    await screen.findByDisplayValue("Group A");
    fireEvent.press(await screen.findByText("Add leader"));
    expect(await screen.findByText("Ada Admin")).toBeTruthy();
    expect(get).not.toHaveBeenCalledWith("/api/v1/seasons/7/admins");
    own.unmount();

    useSessionStore.setState(makeSession("SUPER"));
    routeGets({
      "/api/v1/seasons/7/admins": {
        admins: [
          {
            userId: 41,
            name: "Bo Admin",
            email: "bo@jpc.test",
            assignedAt: "2099-01-02T00:00:00.000Z",
            assignedByName: null,
          },
        ],
      },
    });
    renderWithProviders(<EditGroupScreen />);
    await screen.findByDisplayValue("Group A");
    fireEvent.press(await screen.findByText("Add leader"));
    expect(await screen.findByText("Bo Admin")).toBeTruthy();
  });

  it("shows the server's message when saving is refused with already_in_role", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    mockParams = { id: "3" };
    routeGets();
    patch.mockRejectedValue(
      Object.assign(new Error("409"), {
        isAxiosError: true,
        response: {
          status: 409,
          data: { error: { code: "already_in_role", message: "Karim is already leading a group in GBV 2026" } },
        },
      }),
    );
    renderWithProviders(<EditGroupScreen />);
    await screen.findByDisplayValue("Group A");
    saveBar("Save changes");
    expect(
      await within(screen.getByTestId("save-bar")).findByText("Karim is already leading a group in GBV 2026"),
    ).toBeTruthy();
  });

  it("shows the delete impact, and the server's refusal", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    mockParams = { id: "3" };
    routeGets();
    del.mockRejectedValueOnce(
      Object.assign(new Error("409"), {
        isAxiosError: true,
        response: {
          status: 403,
          data: { error: { code: "forbidden", message: "You don't have access to this group." } },
        },
      }),
    );
    renderWithProviders(<EditGroupScreen />);

    expect(await screen.findByText("Deleting unassigns 1 student and removes 1 leader.")).toBeTruthy();
    fireEvent.press(screen.getByText("Delete group"));
    expect(del).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText("Really delete?"));
    await waitFor(() => expect(del).toHaveBeenCalledWith("/api/v1/groups/3"));
    expect(await screen.findByText("You don't have access to this group.")).toBeTruthy();
  });

  it("deletes and returns to /groups", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    mockParams = { id: "3" };
    routeGets({
      "/api/v1/groups/3/impact": { studentCount: 1, leaderCount: 1 },
    });
    del.mockResolvedValue({ data: { data: { deleted: true, orphanedStudentIds: [21] } } });
    renderWithProviders(<EditGroupScreen />);
    fireEvent.press(await screen.findByText("Delete group"));
    fireEvent.press(screen.getByText("Really delete?"));
    await waitFor(() => expect(mockDismissTo).toHaveBeenCalledWith("/groups"));
  });
});
