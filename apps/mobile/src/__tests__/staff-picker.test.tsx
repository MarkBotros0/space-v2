import { fireEvent, screen, waitFor, within } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
jest.mock("../design/ui/toaster", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
  Toaster: () => null,
}));
let mockParams: Record<string, string> = { code: "s7" };
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), dismissTo: jest.fn() }),
}));

import { apiClient } from "../lib/api-client";
import { toast } from "../design/ui/toaster";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";
import SeasonAdminsScreen from "../../app/(app)/seasons/[code]/admins";
import EditGroupScreen from "../../app/(app)/group/[id]/edit";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;
const patch = apiClient.patch as jest.Mock;

const ok = (data: unknown) => Promise.resolve({ data: { data } });
const refusal = (message: string) =>
  Object.assign(new Error("409"), {
    isAxiosError: true,
    response: { status: 409, data: { error: { code: "already_in_role", message } } },
  });

const detail = {
  id: 7,
  code: "s7",
  title: "GBV 2026",
  program: "GBV",
  year: 2026,
  status: "DRAFT",
  startDate: "2026-01-01T00:00:00.000Z",
  endDate: "2026-12-31T00:00:00.000Z",
  description: null,
  sessionCount: 0,
  studentCount: 0,
  absenceBudgetMinutes: 240,
  absenceWeightMinutes: 90,
  canAdminister: true,
  groups: [],
};
const candidates = {
  people: [
    { id: 6, name: "Karim", lastSeason: { title: "GBV 2025" } },
    { id: 8, name: "Nora", lastSeason: null },
  ],
};
const lina = { id: 5, name: "Lina", email: "lina@jpc.test" };

function routeGets(over: Record<string, unknown> = {}) {
  const table: Record<string, unknown> = {
    "/api/v1/seasons/by-code/s7": detail,
    "/api/v1/seasons/7": detail,
    "/api/v1/seasons/7/sessions": { sessions: [] },
    "/api/v1/seasons/7/admins": { admins: [] },
    "/api/v1/seasons/7/staff-candidates": candidates,
    "/api/v1/seasons/7/roster": { roster: [] },
    "/api/v1/groups/3": {
      id: 3,
      name: "Group A",
      description: null,
      seasonId: 7,
      seasonCode: "s7",
      seasonTitle: "GBV 2026",
      leaders: [lina],
      students: [],
      canManage: true,
    },
    ...over,
  };
  get.mockImplementation((url: string) =>
    url in table ? ok(table[url]) : Promise.reject(new Error(`unexpected GET ${url}`)),
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { code: "s7" };
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("the staff picker sheet", () => {
  it("lists a name and a last season, and nothing else about anyone", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    routeGets();
    renderWithProviders(<SeasonAdminsScreen />);

    fireEvent.press(await screen.findByText("Add admin"));
    expect(await screen.findByText("Karim")).toBeTruthy();
    expect(screen.getByText("GBV 2025")).toBeTruthy();
    expect(screen.getByText("Nora")).toBeTruthy();
    // No id, email or outcome leaks in.
    expect(screen.queryByText(/@/)).toBeNull();
    expect(screen.queryByText(/Passed|%/)).toBeNull();
  });

  it("narrows by the search box", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    routeGets();
    renderWithProviders(<SeasonAdminsScreen />);
    fireEvent.press(await screen.findByText("Add admin"));
    await screen.findByText("Karim");
    fireEvent.changeText(screen.getByLabelText("Search people"), "nor");
    expect(screen.queryByText("Karim")).toBeNull();
    expect(screen.getByText("Nora")).toBeTruthy();
  });
});

describe("adding a season admin (super)", () => {
  it("adds the person tapped and says so", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    routeGets();
    post.mockResolvedValue({
      data: {
        data: {
          admins: [
            {
              userId: 6,
              name: "Karim",
              email: "k@jpc.test",
              assignedAt: "2026-01-02T00:00:00.000Z",
              assignedByName: null,
            },
          ],
        },
      },
    });
    renderWithProviders(<SeasonAdminsScreen />);
    fireEvent.press(await screen.findByText("Add admin"));
    fireEvent.press(await screen.findByText("Karim"));
    fireEvent.press(screen.getByText("Add"));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/seasons/7/admins", { userId: 6 }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Karim can now administer GBV 2026."));
  });

  it("keeps the sheet open and says the server's reason in words", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    routeGets();
    post.mockRejectedValue(refusal("Karim is already leading a group in GBV 2026"));
    renderWithProviders(<SeasonAdminsScreen />);
    fireEvent.press(await screen.findByText("Add admin"));
    fireEvent.press(await screen.findByText("Karim"));
    fireEvent.press(screen.getByText("Add"));
    expect(await screen.findByText("Karim is already leading a group in GBV 2026")).toBeTruthy();
    expect(screen.getByText("Nora")).toBeTruthy();
  });
});

describe("leaders in the group form (season admin)", () => {
  const asAdmin = () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    mockParams = { id: "3" };
    routeGets();
  };

  it("shows the current leaders, each removable", async () => {
    asAdmin();
    patch.mockResolvedValue({ data: { data: { id: 3 } } });
    renderWithProviders(<EditGroupScreen />);
    await screen.findByDisplayValue("Group A");
    expect(await screen.findByText("Lina")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Remove Lina"));
    expect(screen.queryByText("Lina")).toBeNull();
    fireEvent.press(within(screen.getByTestId("save-bar")).getByText("Save changes"));
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/api/v1/groups/3", expect.objectContaining({ leaderIds: [] })),
    );
  });

  it("adds a leader from the same sheet, and the save reports the server's reason", async () => {
    asAdmin();
    patch.mockRejectedValue(refusal("Karim is already leading a group in GBV 2026"));
    renderWithProviders(<EditGroupScreen />);
    await screen.findByDisplayValue("Group A");
    fireEvent.press(await screen.findByText("Add leader"));
    fireEvent.press(await screen.findByText("Karim"));
    expect(await screen.findByLabelText("Remove Karim")).toBeTruthy();
    fireEvent.press(within(screen.getByTestId("save-bar")).getByText("Save changes"));
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/api/v1/groups/3", expect.objectContaining({ leaderIds: [5, 6] })),
    );
    expect(
      await within(screen.getByTestId("save-bar")).findByText("Karim is already leading a group in GBV 2026"),
    ).toBeTruthy();
  });

  it("does not offer someone already a leader of the group", async () => {
    asAdmin();
    renderWithProviders(<EditGroupScreen />);
    await screen.findByDisplayValue("Group A");
    fireEvent.press(await screen.findByText("Add leader"));
    await screen.findByText("Karim");
    // Lina appears once, as the leader row; not again in the sheet.
    expect(screen.getAllByText("Lina")).toHaveLength(1);
  });
});
