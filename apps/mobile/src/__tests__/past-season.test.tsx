import { fireEvent, screen } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn() } }));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ seasonId: "5" }),
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
}));

import { apiClient } from "../lib/api-client";
import { renderStacked } from "./helpers/render";

import PastSeasonScreen from "../../app/(app)/past-season/[seasonId]/index";
import PastAssignments from "../../app/(app)/past-season/[seasonId]/assignments";
import PastAttendance from "../../app/(app)/past-season/[seasonId]/attendance";
import PastQuizzes from "../../app/(app)/past-season/[seasonId]/quizzes";

const get = apiClient.get as jest.Mock;

const assignment = (id: number, status: string) => ({
  id,
  title: `Essay ${id}`,
  dueAt: "2025-03-01T21:59:00.000Z",
  dueOrgDay: "2025-03-01",
  isOverdue: false,
  status,
  reviewedAt: null,
});

const record = {
  season: {
    id: 5,
    code: "gbv-2025",
    title: "GBV 2025",
    startDate: "2025-02-01T00:00:00.000Z",
    endDate: "2025-06-30T00:00:00.000Z",
  },
  outcome: "PASSED",
  groupName: "Group A",
  attendancePct: 92,
  assignments: [assignment(41, "REVIEWED"), assignment(42, "PENDING")],
  quizzes: [
    { id: 61, title: "Quiz one", kind: "ONLINE", status: "GRADED", score: 8 },
    { id: 62, title: "Quiz two", kind: "ONLINE", status: "NOT_TAKEN", score: null },
  ],
  attendance: [
    { sessionId: 1, title: "Opening night", startsAt: "2025-03-01T18:00:00.000Z", status: "PRESENT" },
    { sessionId: 2, title: "Second night", startsAt: "2025-03-08T18:00:00.000Z", status: null },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  get.mockResolvedValue({ data: { data: { record } } });
});

describe("past season page", () => {
  it("shows the title, dates, Finished, outcome with attendance, group and the three rows with counts", async () => {
    renderStacked(<PastSeasonScreen />);
    expect((await screen.findAllByText("GBV 2025")).length).toBeGreaterThan(0);
    expect(get).toHaveBeenCalledWith("/api/v1/me/seasons/5");
    expect(screen.getByText(/Feb 1, 2025 – Jun 30, 2025/)).toBeTruthy();
    expect(screen.getByText("Finished")).toBeTruthy();
    expect(screen.getByText("Passed - 92% attendance")).toBeTruthy();
    expect(screen.getByText("Group: Group A")).toBeTruthy();
    expect(screen.getByText("Assignments (2)")).toBeTruthy();
    expect(screen.getByText("Quizzes (2)")).toBeTruthy();
    expect(screen.getByText("Attendance (2 sessions)")).toBeTruthy();
  });

  it("uses a neutral outcome chip with words when not passed, and omits a missing group", async () => {
    get.mockResolvedValue({
      data: { data: { record: { ...record, outcome: "NOT_PASSED", groupName: null, attendancePct: 40 } } },
    });
    renderStacked(<PastSeasonScreen />);
    expect(await screen.findByText("Did not pass - 40% attendance")).toBeTruthy();
    expect(screen.queryByText(/Group:/)).toBeNull();
  });

  it("opens each list", async () => {
    renderStacked(<PastSeasonScreen />);
    fireEvent.press(await screen.findByText("Assignments (2)"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/past-season/[seasonId]/assignments", params: { seasonId: "5" } });
    fireEvent.press(screen.getByText("Quizzes (2)"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/past-season/[seasonId]/quizzes", params: { seasonId: "5" } });
    fireEvent.press(screen.getByText("Attendance (2 sessions)"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/past-season/[seasonId]/attendance", params: { seasonId: "5" } });
  });

  it("offers retry on error", async () => {
    get.mockRejectedValueOnce(new Error("boom"));
    renderStacked(<PastSeasonScreen />);
    fireEvent.press(await screen.findByRole("button", { name: "Try again" }));
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("says so when the season is not available to them", async () => {
    const err = Object.assign(new Error("nf"), {
      isAxiosError: true,
      response: { status: 404, data: { error: { code: "not_found", message: "Not found" } } },
    });
    get.mockRejectedValue(err);
    renderStacked(<PastSeasonScreen />);
    expect(await screen.findByText("Season not found")).toBeTruthy();
  });
});

describe("past season lists", () => {
  it("opens an assignment, with a status in words", async () => {
    renderStacked(<PastAssignments />);
    expect(await screen.findByText("Essay 41")).toBeTruthy();
    expect(screen.getByText("Reviewed")).toBeTruthy();
    expect(screen.getByText("Not submitted")).toBeTruthy();
    fireEvent.press(screen.getByText("Essay 41"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/assignment/[id]", params: { id: "41" } });
  });

  it("opens a quiz, with the score or Not taken", async () => {
    renderStacked(<PastQuizzes />);
    expect(await screen.findByText("Quiz one")).toBeTruthy();
    expect(screen.getByText("Score: 8")).toBeTruthy();
    expect(screen.getByText("Not taken")).toBeTruthy();
    fireEvent.press(screen.getByText("Quiz one"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/quiz/[id]", params: { id: "61" } });
  });

  it("lists sessions with their attendance in words", async () => {
    renderStacked(<PastAttendance />);
    expect(await screen.findByText("Opening night")).toBeTruthy();
    expect(screen.getByText("Present")).toBeTruthy();
    expect(screen.getByText("Not recorded")).toBeTruthy();
  });

  it("says when a list is empty", async () => {
    get.mockResolvedValue({ data: { data: { record: { ...record, assignments: [] } } } });
    renderStacked(<PastAssignments />);
    expect(await screen.findByText("No assignments")).toBeTruthy();
  });
});
