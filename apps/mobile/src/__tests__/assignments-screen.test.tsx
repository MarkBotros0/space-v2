import { fireEvent, screen } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn() },
}));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";

import AssignmentsScreen from "../../app/(app)/assignments";

const get = apiClient.get as jest.Mock;

const studentSession = makeSession(
  "STUDENT",
  { activeSeasonId: 7 },
  { id: 9, name: "Test student", email: "s@jpc.test" },
);

const row = {
  id: 41,
  title: "Essay one",
  dueAt: "2099-04-01T21:59:00.000Z",
  isOverdue: false,
  status: "PENDING" as const,
  reviewedAt: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("AssignmentsScreen (student)", () => {
  it("lists assignments with their server-derived status", async () => {
    useSessionStore.setState(studentSession);
    get.mockResolvedValue({ data: { data: { assignments: [row] } } });

    renderWithProviders(<AssignmentsScreen />);

    expect(await screen.findByText("Essay one")).toBeTruthy();
    expect(screen.getByText(/Not started/)).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/seasons/7/assignments");
  });

  it("marks an overdue assignment from the contract flag, not a local date compare", async () => {
    useSessionStore.setState(studentSession);
    // dueAt in the FUTURE but isOverdue true: only the server flag may decide.
    get.mockResolvedValue({
      data: { data: { assignments: [{ ...row, dueAt: "2099-04-01T00:00:00.000Z", isOverdue: true }] } },
    });

    renderWithProviders(<AssignmentsScreen />);

    expect(await screen.findByText(/Overdue/)).toBeTruthy();
  });

  it("navigates to the detail route on press", async () => {
    useSessionStore.setState(studentSession);
    get.mockResolvedValue({ data: { data: { assignments: [row] } } });

    renderWithProviders(<AssignmentsScreen />);
    fireEvent.press(await screen.findByText("Essay one"));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/assignment/[id]",
      params: { id: "41" },
    });
  });

  it("shows its own empty state with no active season, without calling the API", async () => {
    useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: null }));

    renderWithProviders(<AssignmentsScreen />);

    expect(await screen.findByText("No active season")).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  });

  it("does not run the student query for staff (their branch is Plan 5's)", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));

    renderWithProviders(<AssignmentsScreen />);

    expect(await screen.findByText("Assignments")).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  });
});
