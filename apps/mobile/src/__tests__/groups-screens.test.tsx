import { fireEvent, screen } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn() } }));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
  useLocalSearchParams: () => ({ id: "3" }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";
import GroupsScreen from "../../app/(app)/groups";
import GroupDetailScreen from "../../app/(app)/group/[id]";

const get = apiClient.get as jest.Mock;

const leaderSession = makeSession(
  "LEADER",
  { groupLeaderIds: [3] },
  { id: 5, name: "Test leader", email: "l@jpc.test" },
);

const groupRow = {
  id: 3, name: "Group A", description: null, studentCount: 8,
  leaderNames: ["Test leader"], seasonId: 7, seasonCode: "S26", seasonTitle: "Spring 2026",
};

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(leaderSession);
});

it("lists my groups with season and headcount, and navigates on press", async () => {
  get.mockResolvedValue({ data: { data: { groups: [groupRow] } } });

  renderWithProviders(<GroupsScreen />);

  expect(await screen.findByText("Group A")).toBeTruthy();
  expect(screen.getByText("Spring 2026 · 8 students")).toBeTruthy();
  expect(get).toHaveBeenCalledWith("/api/v1/groups");

  fireEvent.press(screen.getByText("Group A"));
  expect(mockPush).toHaveBeenCalledWith({ pathname: "/group/[id]", params: { id: "3" } });
});

it("shows the empty state for a leader with no groups", async () => {
  get.mockResolvedValue({ data: { data: { groups: [] } } });

  renderWithProviders(<GroupsScreen />);

  expect(await screen.findByText("No groups")).toBeTruthy();
});

it("does not pretend an admin has no groups: explicit not-yet state, no request", async () => {
  // GET /groups is empty for ADMIN by design; rendering that as "No groups"
  // on ADMIN's second tab would be a lie. The season-wide admin branch is
  // Plan 6's (ruling X8).
  useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));

  renderWithProviders(<GroupsScreen />);

  expect(await screen.findByText(/isn't available in the app yet/)).toBeTruthy();
  expect(screen.queryByText("No groups")).toBeNull();
  expect(get).not.toHaveBeenCalled();
});

it("shows members with emails for a staff caller", async () => {
  get.mockResolvedValue({
    data: {
      data: {
        id: 3, name: "Group A", description: null, seasonId: 7,
        seasonCode: "S26", seasonTitle: "Spring 2026",
        leaders: [{ id: 5, name: "Test leader", email: "l@jpc.test" }],
        students: [{ id: 9, name: "Test student", email: "s@jpc.test" }],
      },
    },
  });

  renderWithProviders(<GroupDetailScreen />);

  expect(await screen.findByText("Test student")).toBeTruthy();
  expect(screen.getByText("s@jpc.test")).toBeTruthy();
  expect(get).toHaveBeenCalledWith("/api/v1/groups/3");
});

it("renders a student's member list without emails (the contract omits them)", async () => {
  useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }, { id: 9 }));
  get.mockResolvedValue({
    data: {
      data: {
        id: 3, name: "Group A", description: null, seasonId: 7,
        seasonCode: "S26", seasonTitle: "Spring 2026",
        leaders: [{ id: 5, name: "Test leader" }],
        students: [{ id: 9, name: null }],
      },
    },
  });

  renderWithProviders(<GroupDetailScreen />);

  expect(await screen.findByText("Unnamed")).toBeTruthy();
  expect(screen.queryByText("s@jpc.test")).toBeNull();
});
