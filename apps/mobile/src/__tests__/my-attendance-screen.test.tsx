import { screen } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn() } }));

import { apiClient } from "../lib/api-client";
import { TabBarPresenceContext } from "../design/layout/shell-context";
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
    { sessionId: 3, title: "Week 3", startsAt: "2099-03-15T18:00:00.000Z", dayKey: "2099-03-15", startTime: "20:00",
      status: "LATE", checkedInAt: "2099-03-15T18:12:00.000Z", lateMinutes: 12, costMinutes: 12 },
    { sessionId: 2, title: "Week 2", startsAt: "2099-03-08T18:00:00.000Z", dayKey: "2099-03-08", startTime: "20:00",
      status: "ABSENT", checkedInAt: null, lateMinutes: null, costMinutes: 90 },
    { sessionId: 1, title: "Week 1", startsAt: "2099-03-01T18:00:00.000Z", dayKey: "2099-03-01", startTime: "20:00",
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

    renderWithProviders(
      <TabBarPresenceContext.Provider value={false}>
        <AttendanceScreen />
      </TabBarPresenceContext.Provider>,
    );

    expect(await screen.findByLabelText("Budget used: 58%")).toBeTruthy();
    expect(screen.getByLabelText("Minutes used: 105/180")).toBeTruthy();
    expect(screen.getByText("Attendance")).toBeTruthy();
    // One back link: the frame's pinned bar (R23), not the old in-content "← Dashboard".
    expect(screen.getAllByRole("link", { name: "Back" })).toHaveLength(1);
    expect(screen.queryByText("← Dashboard")).toBeNull();
    expect(get).toHaveBeenCalledWith("/api/v1/me/attendance");
    expect(screen.getByText("Absent = 90 min · Late = actual minutes late")).toBeTruthy(); // R96
    expect(screen.queryByText(/^Streak/)).toBeNull(); // v1 shows the streak on the dashboard only
    expect(screen.getByText(/12 min late/)).toBeTruthy();
    expect(screen.getByText(/−12 min from budget/)).toBeTruthy();
    expect(screen.getByText(/−90 min from budget/)).toBeTruthy(); // R95, from costMinutes
    // Each row's status is a chip word, spoken as such.
    expect(screen.getByLabelText("Late")).toBeTruthy();
    expect(screen.getByLabelText("Absent")).toBeTruthy();
    expect(screen.getByLabelText("No record")).toBeTruthy();
    expect(screen.queryByLabelText("Present")).toBeNull();
    expect(screen.getByText(/Mar 8, 2099/)).toBeTruthy(); // from dayKey (X13)
    // Time is the org-clock startTime, not startsAt read in the device zone: 18:00Z fixture, 20:00 org.
    expect(screen.getAllByText(/ · 8:00 PM/)).toHaveLength(3);
  });

  it("says Present for an attended session", async () => {
    useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }));
    const present = { ...payload.sessions[2]!, status: "PRESENT" as const };
    get.mockResolvedValue({ data: { data: { ...payload, sessions: [present] } } });

    renderWithProviders(<AttendanceScreen />);

    expect(await screen.findByLabelText("Present")).toBeTruthy();
  });

  it.each([
    [69, null],
    [70, "Near limit"],
    [99, "Near limit"],
    [100, "Over budget"],
  ])("warns in words at %i%% of the budget", async (budgetPct, word) => {
    useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }));
    get.mockResolvedValue({
      data: { data: { ...payload, budget: { ...payload.budget, budgetPct } } },
    });

    renderWithProviders(<AttendanceScreen />);

    await screen.findByLabelText(`Budget used: ${budgetPct}%`);
    for (const w of ["Near limit", "Over budget"]) {
      if (w === word) expect(screen.getByLabelText(w)).toBeTruthy();
      else expect(screen.queryByLabelText(w)).toBeNull();
    }
  });

  it("shows no budget warning when the budget is missing", async () => {
    useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }));
    get.mockResolvedValue({ data: { data: { ...payload, budget: null } } });

    renderWithProviders(<AttendanceScreen />);

    await screen.findByLabelText("Budget used: 0%");
    expect(screen.queryByLabelText("Near limit")).toBeNull();
    expect(screen.queryByLabelText("Over budget")).toBeNull();
  });

  it("puts late minutes and the budget cost together in the row text", async () => {
    useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }));
    get.mockResolvedValue({ data: { data: payload } });

    renderWithProviders(<AttendanceScreen />);

    expect(await screen.findByText(/12 min late · −12 min from budget/)).toBeTruthy();
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
