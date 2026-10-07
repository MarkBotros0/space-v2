import { screen } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn() } }));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";

import AttendanceScreen from "../../app/(app)/attendance";

const get = apiClient.get as jest.Mock;

const payload = {
  season: { id: 7, title: "Spring", absenceBudgetMinutes: 180, absenceWeightMinutes: 90 },
  budget: { minutesUsed: 105, budgetMinutes: 180, budgetPct: 58, remainingPct: 42, absentCount: 1, lateCount: 1 },
  streak: 1,
  sessions: [
    { sessionId: 3, title: "Week 3", startsAt: "2099-03-15T18:00:00.000Z", dayKey: "2099-03-15",
      status: "LATE", checkedInAt: "2099-03-15T18:12:00.000Z", lateMinutes: 12, costMinutes: 12 },
    { sessionId: 2, title: "Week 2", startsAt: "2099-03-08T18:00:00.000Z", dayKey: "2099-03-08",
      status: "ABSENT", checkedInAt: null, lateMinutes: null, costMinutes: 90 },
    { sessionId: 1, title: "Week 1", startsAt: "2099-03-01T18:00:00.000Z", dayKey: "2099-03-01",
      status: null, checkedInAt: null, lateMinutes: null, costMinutes: null },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("AttendanceScreen", () => {
  it("shows the server's budget, the rule in words, the streak and each past session's cost", async () => {
    useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }));
    get.mockResolvedValue({ data: { data: payload } });

    renderWithProviders(<AttendanceScreen />);

    expect(await screen.findByText("58% used")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/me/attendance");
    expect(screen.getByText("105 of 180 min")).toBeTruthy();
    expect(screen.getByText("Absent = 90 min · Late = actual minutes late")).toBeTruthy(); // R96
    expect(screen.getByText("Streak: 1 session")).toBeTruthy();
    expect(screen.getByText("12 min late")).toBeTruthy();
    expect(screen.getByText("−12 min from budget")).toBeTruthy();
    expect(screen.getByText("−90 min from budget")).toBeTruthy(); // R95, from costMinutes
    expect(screen.getByText("Late")).toBeTruthy();
    expect(screen.getByText("Absent")).toBeTruthy();
    expect(screen.getByText("No record")).toBeTruthy();
    expect(screen.getByText(/Mar 8, 2099/)).toBeTruthy(); // from dayKey (X13)
  });

  it("shows the empty state when no session has happened yet", async () => {
    useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }));
    get.mockResolvedValue({ data: { data: { ...payload, sessions: [] } } });

    renderWithProviders(<AttendanceScreen />);

    expect(await screen.findByText("No sessions yet")).toBeTruthy();
  });

  it("runs no query for a student with no active season (R93)", async () => {
    useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: null }));

    renderWithProviders(<AttendanceScreen />);

    expect(await screen.findByText("Not enrolled")).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  });

  it("is not available to staff and fetches nothing", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));

    renderWithProviders(<AttendanceScreen />);

    expect(await screen.findByText("Not available")).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  });
});
