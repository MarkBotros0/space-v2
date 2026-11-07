import { fireEvent, screen } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn() } }));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ code: "s7" }),
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";
import SeasonSessionsScreen from "../../app/(app)/seasons/[code]/sessions";

const get = apiClient.get as jest.Mock;

const detail = (canAdminister: boolean, status = "ACTIVE") => ({
  id: 7, code: "s7", title: "TEST 2099", program: "TEST", year: 2099, status,
  startDate: "2099-01-01T00:00:00.000Z", endDate: "2099-12-31T00:00:00.000Z", description: null,
  sessionCount: 1, studentCount: 0, absenceBudgetMinutes: 240, absenceWeightMinutes: 90,
  canAdminister, groups: [],
});
const sessionRow = {
  id: 12, title: "Kickoff", startsAt: "2099-03-01T18:00:00.000Z", dayKey: "2099-03-01",
  startTime: "20:00", durationMinutes: 90, location: null, recurrenceGroupId: null,
  attendanceMarked: false, seasonId: 7, seasonCode: "s7", seasonTitle: "TEST 2099",
  checkInToken: null, checkInOpenAt: null, checkInClosedAt: null,
};

function serve(canAdminister: boolean, status = "ACTIVE") {
  get.mockImplementation((url: string) => {
    if (url === "/api/v1/seasons/by-code/s7") return Promise.resolve({ data: { data: detail(canAdminister, status) } });
    if (url === "/api/v1/seasons/7/sessions") return Promise.resolve({ data: { data: { sessions: [sessionRow] } } });
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

// Owner 2026-11-07: the overview's Sessions card opens the season's sessions here.
describe("SeasonSessionsScreen (/seasons/[code]/sessions)", () => {
  it("lists the sessions, opens one, and lets whoever administers it mark attendance", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    serve(true);
    renderWithProviders(<SeasonSessionsScreen />);
    expect(await screen.findByText("Kickoff")).toBeTruthy();
    expect(screen.getByText("Sessions")).toBeTruthy();
    expect(screen.getByText("Sun, Mar 1, 2099 · 8:00 PM · 90 min")).toBeTruthy();
    fireEvent.press(screen.getByText("Kickoff"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/session/[id]", params: { id: "12" } });
    fireEvent.press(screen.getByText("Mark attendance"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/session/[id]/attendance", params: { id: "12" } });
  });

  it("is read-only for someone who doesn't administer the season", async () => {
    useSessionStore.setState(makeSession("MENTOR"));
    serve(false);
    renderWithProviders(<SeasonSessionsScreen />);
    expect(await screen.findByText("Kickoff")).toBeTruthy();
    expect(screen.queryByText("Mark attendance")).toBeNull();
  });

  it("is read-only on a finished season, even for a super", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    serve(true, "COMPLETED");
    renderWithProviders(<SeasonSessionsScreen />);
    expect(await screen.findByText("Kickoff")).toBeTruthy();
    expect(screen.queryByText("Mark attendance")).toBeNull();
    expect(screen.queryByText("New session")).toBeNull();
  });
});
