import { fireEvent, screen } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn() } }));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";

import AssignmentsScreen from "../../app/(app)/assignments";

const get = apiClient.get as jest.Mock;

const season = {
  id: 7, code: "s7", title: "Spring 2099", program: "TEST", year: 2099, status: "ACTIVE" as const,
  startDate: "2099-01-01T00:00:00.000Z", endDate: "2099-12-31T00:00:00.000Z",
};
const group = (id: number, name: string) => ({
  id, name, description: null, studentCount: 2, leaderNames: [],
  seasonId: 7, seasonCode: "s7", seasonTitle: "Spring 2099",
});
const row = (over: Record<string, unknown> = {}) => ({
  id: 41, title: "Essay one", dueAt: "2099-04-01T21:59:00.000Z", dueOrgDay: "2099-04-01",
  isOverdue: false, isAllGroups: false, targetGroupIds: [3], submissionCount: 1,
  expectedCount: 2, seasonCode: "s7", ...over,
});

function serve(assignments: unknown[] | Error) {
  get.mockImplementation((url: string) => {
    if (url === "/api/v1/seasons") return Promise.resolve({ data: { data: { seasons: [season] } } });
    if (url === "/api/v1/seasons/7/groups") {
      return Promise.resolve({ data: { data: { groups: [group(3, "Group A"), group(4, "Group B")] } } });
    }
    if (url === "/api/v1/seasons/7/assignments") {
      return assignments instanceof Error
        ? Promise.reject(assignments)
        : Promise.resolve({ data: { data: { assignments } } });
    }
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("AssignmentsScreen (staff)", () => {
  it("lists the current season's assignments with the org due day, targets and counts", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    serve([
      row(),
      row({ id: 42, title: "Everyone", dueAt: null, dueOrgDay: null, isAllGroups: true, targetGroupIds: [], submissionCount: 0, expectedCount: 3 }),
      row({ id: 43, title: "Late one", isOverdue: true, targetGroupIds: [3, 4], submissionCount: 2, expectedCount: 4 }),
    ]);

    renderWithProviders(<AssignmentsScreen />);

    expect(await screen.findByText("Essay one")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/seasons/7/assignments");
    // Names arrive with the groups query; until then the label counts groups.
    expect(await screen.findByText("Group A · 1/2 submitted")).toBeTruthy();
    expect(screen.getByText("All students · 0/3 submitted")).toBeTruthy();
    expect(screen.getByText("Group A, Group B · 2/4 submitted")).toBeTruthy();
    expect(screen.getByText("No due date")).toBeTruthy();
    // The flag decides "Overdue" (C4); the day is the server's org day (X13).
    expect(screen.getByText("Due Apr 1, 2099 · Overdue")).toBeTruthy();
  });

  it("opens an assignment, and offers New assignment to a season admin", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    serve([row()]);
    renderWithProviders(<AssignmentsScreen />);

    fireEvent.press(await screen.findByText("Essay one"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/assignment/[id]", params: { id: "41" } });

    fireEvent.press(screen.getByText("New assignment"));
    expect(mockPush).toHaveBeenCalledWith("/assignment/new");
  });

  it("gives a MENTOR the list read-only", async () => {
    useSessionStore.setState(makeSession("MENTOR"));
    serve([row()]);
    renderWithProviders(<AssignmentsScreen />);
    expect(await screen.findByText("Essay one")).toBeTruthy();
    expect(screen.queryByText("New assignment")).toBeNull();
  });

  it("shows an empty state, and an error state with retry", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    serve([]);
    const empty = renderWithProviders(<AssignmentsScreen />);
    expect(await screen.findByText("No assignments yet")).toBeTruthy();
    empty.unmount();

    serve(new Error("network down"));
    renderWithProviders(<AssignmentsScreen />);
    expect(await screen.findByText("Couldn't load assignments.")).toBeTruthy();
  });

  it("says so when there is no season, without asking for assignments", async () => {
    useSessionStore.setState(makeSession("ADMIN"));
    get.mockResolvedValue({ data: { data: { seasons: [] } } });
    renderWithProviders(<AssignmentsScreen />);
    expect(await screen.findByText("No season")).toBeTruthy();
    expect(get).toHaveBeenCalledTimes(1); // only /api/v1/seasons
  });
});
