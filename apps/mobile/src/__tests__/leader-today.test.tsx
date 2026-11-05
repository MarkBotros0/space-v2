import { fireEvent, screen } from "@testing-library/react-native";
import { AxiosError } from "axios";
import type { EngagementRow } from "@space/shared";

// `jest.mock` factories may only close over `mock*` consts (CLAUDE.md).
jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn() },
}));

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: (...args: unknown[]) => mockPush(...args) }),
  useFocusEffect: () => {},
}));

jest.mock("../design/layout/home-actions", () => {
  const { Text } = jest.requireActual("react-native");
  return { HomeActions: () => <Text testID="home-actions">home actions</Text> };
});

import { atRiskReason } from "../screens/leader-today/at-risk-reason";
import { LeaderToday } from "../screens/leader-today";
import { deviceTodayKey } from "../lib/calendar-grid";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";
import {
  EVENTS,
  UNREAD,
  events,
  get,
  liveSession,
  requested,
  seasonRow,
  serve,
  staffDashboard,
} from "./helpers/dashboard-fixtures";

const row = (over: Partial<EngagementRow>): EngagementRow =>
  ({
    score: 40,
    attendancePct: 100,
    submissionPct: 100,
    attendanceTotal: 4,
    attendancePresent: 4,
    submissionsExpected: 3,
    submissionsCompleted: 3,
    studentUserId: 21,
    studentName: "Sara Student",
    seasonId: 7,
    ...over,
  }) as EngagementRow;

describe("atRiskReason (R33): names only what is below the line", () => {
  it("attendance alone", () => {
    expect(atRiskReason(row({ attendancePct: 40, attendancePresent: 2 }))).toBe("Attendance 40%");
  });
  it("submissions alone, never repeating a good attendance value", () => {
    const reason = atRiskReason(row({ submissionsCompleted: 1, submissionPct: 33 }));
    expect(reason).toBe("1 of 3 submitted");
    expect(reason).not.toContain("100%");
  });
  it("both low", () => {
    expect(
      atRiskReason(row({ attendancePct: 40, submissionsCompleted: 1, submissionPct: 33 })),
    ).toBe("Attendance 40% · 1 of 3 submitted");
  });
});

const today = deviceTodayKey();
const missing = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: 100 + i, name: `Missing ${i + 1}` }));
const dayOf = {
  ...liveSession,
  dayKey: today,
  isInProgress: false,
  youtubeUrl: null,
};
const checkIn = (n: number) => ({
  sessionId: 11,
  total: n + 2,
  present: 1,
  late: 1,
  absent: 0,
  notCheckedIn: missing(n),
});
const dash = (over: Record<string, unknown>) => ({ ...staffDashboard("groups"), ...over });
const serveDash = (data: unknown) =>
  serve({
    "/api/v1/seasons": { seasons: [seasonRow] },
    "/api/v1/me/dashboard?seasonId=7": data,
    [EVENTS]: events,
    [UNREAD]: { unreadCount: 0 },
  });

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(makeSession("LEADER", { groupLeaderIds: [5, 6] }, { name: "Lena Leader" }));
});

describe("LeaderToday", () => {
  it("on the day: the session to run, who is missing, five named and See all", async () => {
    serveDash(dash({ nextSession: dayOf, leaderSession: checkIn(7) }));
    renderWithProviders(<LeaderToday />);

    expect(await screen.findByText("Take attendance")).toBeTruthy();
    expect(screen.getByText("Hi, Lena")).toBeTruthy();
    expect(screen.getByText("Group A, Group B")).toBeTruthy();
    expect(screen.getByText(/2 present · 7 not checked in/)).toBeTruthy();
    expect(screen.getByText("Next session")).toBeTruthy();
    expect(screen.getByText("Missing 1")).toBeTruthy();
    expect(screen.getByText("Missing 5")).toBeTruthy();
    expect(screen.queryByText("Missing 6")).toBeNull();
    expect(screen.getByText("See all 7")).toBeTruthy();
    expect(screen.getAllByTestId("home-actions")).toHaveLength(1);

    fireEvent.press(screen.getByText("Take attendance"));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/session/[id]/attendance",
      params: { id: "11" },
    });
    fireEvent.press(screen.getByText("See all 7"));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: "/session/[id]/attendance",
      params: { id: "11" },
    });
    fireEvent.press(screen.getByText("Missing 1"));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: "/student/[id]", params: { id: "100" } });
  });

  it("two missing: names both and no See all", async () => {
    serveDash(dash({ nextSession: dayOf, leaderSession: checkIn(2) }));
    renderWithProviders(<LeaderToday />);
    expect(await screen.findByText(/2 not checked in/)).toBeTruthy();
    expect(screen.queryByText("See all 2")).toBeNull();
  });

  it("while in progress with a stream: Join stream", async () => {
    serveDash(dash({ nextSession: { ...dayOf, isInProgress: true, youtubeUrl: "https://youtu.be/x" }, leaderSession: checkIn(1) }));
    renderWithProviders(<LeaderToday />);
    expect(await screen.findByText("Happening now")).toBeTruthy();
    expect(screen.getByText("Join stream")).toBeTruthy();
  });

  it("a week out: Open session, the day cue, no Not checked in", async () => {
    serveDash(dash({ nextSession: { ...liveSession, isInProgress: false, dayKey: "2099-03-01" }, leaderSession: checkIn(3) }));
    renderWithProviders(<LeaderToday />);
    expect(await screen.findByText("Open session")).toBeTruthy();
    expect(screen.queryByText("Take attendance")).toBeNull();
    expect(screen.queryByText("NOT CHECKED IN")).toBeNull();
    fireEvent.press(screen.getByText("Open session"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/session/[id]", params: { id: "11" } });
  });

  it("no session (null or absent leaderSession): No upcoming sessions.", async () => {
    serveDash(dash({ nextSession: null, leaderSession: null }));
    renderWithProviders(<LeaderToday />);
    expect(await screen.findByText("No upcoming sessions.")).toBeTruthy();
  });

  it("leaderSession absent is treated as null", async () => {
    serveDash(dash({ nextSession: dayOf }));
    renderWithProviders(<LeaderToday />);
    expect(await screen.findByText("Take attendance")).toBeTruthy();
    expect(screen.queryByText(/not checked in/)).toBeNull();
  });

  it("to review: submissions open on the same season, quizzes with the draft note", async () => {
    serveDash(dash({ nextSession: null, leaderSession: null }));
    renderWithProviders(<LeaderToday />);
    expect(await screen.findByText("Submissions waiting")).toBeTruthy();
    expect(screen.getByText("Reviewed")).toBeTruthy();
    expect(screen.getByText("Quizzes to grade")).toBeTruthy();
    expect(screen.getByText("Fully graded")).toBeTruthy();
    expect(screen.getByText("1 quiz draft not yet published")).toBeTruthy();
    fireEvent.press(screen.getByText("Submissions waiting"));
    // The figures are this season's, so the queue opens on the same season.
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/submissions", params: { seasonId: "7" } });
    fireEvent.press(screen.getByText("Quizzes to grade"));
    expect(mockPush).toHaveBeenLastCalledWith("/quizzes");
  });

  it("at risk: reason line, See all to groups, and figures stay", async () => {
    serveDash(dash({ nextSession: null, leaderSession: null }));
    renderWithProviders(<LeaderToday />);
    expect(await screen.findByText("YOUR STUDENTS AT RISK")).toBeTruthy();
    expect(screen.getByText("Sara Student")).toBeTruthy();
    expect(screen.getByText("Attendance 33% · 1 of 3 submitted")).toBeTruthy();
    fireEvent.press(screen.getByText("See all 12"));
    expect(mockPush).toHaveBeenCalledWith("/groups");
    expect(screen.getByLabelText("Students: 3")).toBeTruthy();
    expect(screen.getByLabelText("Attendance: 33%")).toBeTruthy();
    expect(screen.getByLabelText("Session 3 of 4: 75%")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Students: 3"));
    expect(mockPush).toHaveBeenLastCalledWith("/groups");
    fireEvent.press(screen.getByText("Sara Student"));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: "/student/[id]", params: { id: "21" } });
  });

  it("nobody at risk keeps the rule in the empty state", async () => {
    const base = staffDashboard("groups");
    serveDash(dash({ nextSession: null, cohort: { ...base.cohort, atRisk: [], atRiskTotal: 0 } }));
    renderWithProviders(<LeaderToday />);
    expect(await screen.findByText("Nobody at risk")).toBeTruthy();
    expect(screen.getByText("No student has attendance or submissions below 60%.")).toBeTruthy();
  });

  it("no name: the title is Today", async () => {
    useSessionStore.setState(makeSession("LEADER", { groupLeaderIds: [5] }, { name: "" }));
    serveDash(dash({ nextSession: null }));
    renderWithProviders(<LeaderToday />);
    expect(await screen.findByText("Submissions waiting")).toBeTruthy();
    expect(screen.getAllByText("Today").length).toBeGreaterThan(0);
    expect(screen.queryByText(/^Hi,/)).toBeNull();
  });

  it("no season: 'No season yet' and no dashboard request", async () => {
    serve({ "/api/v1/seasons": { seasons: [] }, [EVENTS]: events, [UNREAD]: { unreadCount: 0 } });
    renderWithProviders(<LeaderToday />);
    expect(await screen.findByText("No season yet")).toBeTruthy();
    expect(requested().some((u) => u.startsWith("/api/v1/me/dashboard"))).toBe(false);
  });

  it("refused for the season: v1's leader error page", async () => {
    get.mockImplementation((url: string) => {
      if (url === "/api/v1/seasons")
        return Promise.resolve({ data: { data: { seasons: [seasonRow] } } });
      if (url === EVENTS) return Promise.resolve({ data: { data: events } });
      if (url === UNREAD) return Promise.resolve({ data: { data: { unreadCount: 0 } } });
      return Promise.reject(
        Object.assign(new AxiosError("Forbidden"), {
          response: {
            status: 403,
            data: { error: { code: "forbidden", message: "You don't have access to this." } },
          },
        }),
      );
    });
    renderWithProviders(<LeaderToday />);
    expect(await screen.findByText("Something went wrong")).toBeTruthy();
    expect(screen.getByText(/let an admin know/)).toBeTruthy();
  });
});
