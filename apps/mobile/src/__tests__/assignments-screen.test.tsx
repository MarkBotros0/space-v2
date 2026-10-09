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
import { colors } from "../theme/tokens";

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
  dueOrgDay: "2099-04-01",
  dueDistance: "73 years",
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
    expect(screen.getByText("Not started")).toBeTruthy();
    // v1 page.tsx:98-104: the org day plus the server's "in N" distance.
    expect(screen.getByText("Due Apr 1, 2099 · in 73 years")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/seasons/7/assignments");
  });

  it("marks an overdue assignment from the contract flag, not a local date compare", async () => {
    useSessionStore.setState(studentSession);
    // dueAt in the FUTURE but isOverdue true: only the server flag may decide.
    get.mockResolvedValue({
      data: {
        data: {
          assignments: [{ ...row, dueAt: "2099-04-01T00:00:00.000Z", isOverdue: true, dueDistance: null }],
        },
      },
    });

    renderWithProviders(<AssignmentsScreen />);

    // v1 parity 2026-10-09 (R48): v1 shows a red "Due MMM d" badge, not "Overdue".
    const badge = await screen.findByText("Due Apr 1");
    expect(badge).toHaveStyle({ color: colors.error[700] });
    expect(screen.queryByText(/Overdue/)).toBeNull();
    expect(screen.getByText("Due Apr 1, 2099")).toBeTruthy();
  });

  it("keeps the started statuses' own words, whatever the deadline", async () => {
    useSessionStore.setState(studentSession);
    get.mockResolvedValue({
      data: {
        data: {
          assignments: [
            { ...row, id: 1, title: "A", status: "DRAFT", isOverdue: true },
            { ...row, id: 2, title: "B", status: "SUBMITTED" },
            { ...row, id: 3, title: "C", status: "REVIEWED" },
            { ...row, id: 4, title: "D", dueAt: null, dueOrgDay: null, dueDistance: null },
          ],
        },
      },
    });

    renderWithProviders(<AssignmentsScreen />);

    expect(await screen.findByText("Draft")).toBeTruthy();
    expect(screen.getByText("Submitted")).toBeTruthy();
    expect(screen.getByText("Reviewed")).toBeTruthy();
    // No due date: no due line at all, as v1.
    expect(screen.getAllByText(/^Due /)).toHaveLength(3);
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
});
