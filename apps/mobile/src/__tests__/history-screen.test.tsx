import { fireEvent, screen } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn() } }));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";

import HistoryScreen from "../../app/(app)/history";

const get = apiClient.get as jest.Mock;

const row = {
  seasonId: 3,
  title: "GBV 2025",
  startDate: "2025-02-01T00:00:00.000Z",
  endDate: "2025-06-30T00:00:00.000Z",
  groupName: "Group A1",
  attendancePct: 50,
  curriculum: [
    // 23:30Z on the 1st is the 2nd in Cairo; the server says so in dayKey.
    { sessionId: 31, title: "Opening night", startsAt: "2025-03-01T23:30:00.000Z", dayKey: "2025-03-02" },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("HistoryScreen", () => {
  it("lists a student's past seasons with attendance, group and a collapsed curriculum", async () => {
    useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }));
    get.mockResolvedValue({ data: { data: { seasons: [row] } } });

    renderWithProviders(<HistoryScreen />);

    expect(await screen.findByText("GBV 2025")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/me/season-history");
    expect(screen.getByText("History")).toBeTruthy();
    expect(screen.getByText("50% attended · Participated")).toBeTruthy();
    expect(screen.getByText(/Group A1/)).toBeTruthy();
    expect(screen.queryByText("Opening night")).toBeNull();

    fireEvent.press(screen.getByText("Curriculum (1 session)"));

    expect(screen.getByText("Opening night")).toBeTruthy();
    // The server's org-calendar day, not the device's reading of startsAt (X13).
    expect(screen.getByText("Mar 2, 2025")).toBeTruthy();
  });

  it("titles the alumni variant and uses its empty copy", async () => {
    useSessionStore.setState(makeSession("STUDENT", { graduationYear: 2024 }));
    get.mockResolvedValue({ data: { data: { seasons: [] } } });

    renderWithProviders(<HistoryScreen />);

    expect(await screen.findByText("No past seasons")).toBeTruthy();
    expect(screen.getByText("My History")).toBeTruthy();
    expect(screen.getByText("Your completed seasons will appear here.")).toBeTruthy();
  });

  it("refuses to render anything but attendance and curriculum — a feedback field fails the parse (R34)", async () => {
    useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }));
    get.mockResolvedValue({ data: { data: { seasons: [{ ...row, feedback: "Great work" }] } } });

    renderWithProviders(<HistoryScreen />);

    expect(await screen.findByText("Couldn't load your history.")).toBeTruthy();
    expect(screen.queryByText("Great work")).toBeNull();
  });

  it("gives staff an explanation and never calls the student endpoint", async () => {
    useSessionStore.setState(makeSession("LEADER", { groupLeaderIds: [3] }));

    renderWithProviders(<HistoryScreen />);

    expect(await screen.findByText("Season history is for students and alumni.")).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  });
});
