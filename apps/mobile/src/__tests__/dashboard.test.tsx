import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { AxiosError } from "axios";
import { Linking, ScrollView } from "react-native";

// `jest.mock` factories may only close over `mock*` consts (CLAUDE.md).
jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn() },
}));

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: (...args: unknown[]) => mockPush(...args) }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";

import DashboardScreen from "../../app/(app)/dashboard";

const get = apiClient.get as jest.Mock;
const UNREAD = "/api/v1/notifications/unread-count";
const EVENTS = "/api/v1/events?upcoming=true&limit=4";

/** Answer exactly these URLs; anything else rejects, so a stray request shows up as a failure. */
function serve(routes: Record<string, unknown>) {
  get.mockImplementation((url: string) =>
    url in routes
      ? Promise.resolve({ data: { data: routes[url] } })
      : Promise.reject(new Error(`not served: ${url}`)),
  );
}
const requested = () => get.mock.calls.map(([url]) => url as string);

const event = {
  id: 3,
  title: "Open day",
  date: "2099-03-05T16:30:00.000Z",
  endDate: null,
  dayKey: "2099-03-05",
  endDayKey: null,
  time: "18:30",
  allDay: false,
  url: null,
  visibility: "ALL",
  seasonId: null,
  seasonCode: null,
};
const events = { events: [event], total: 9 };

const liveSession = {
  id: 11,
  title: "Week 6",
  startsAt: "2099-03-01T16:00:00.000Z",
  dayKey: "2099-03-01",
  time: "18:00",
  durationMinutes: 90,
  location: "Hall",
  youtubeUrl: "https://youtu.be/live",
  isInProgress: true,
};

const studentDashboard = {
  variant: "STUDENT",
  season: { id: 7, code: "spring-2099", title: "Spring 2099", status: "ACTIVE" },
  progress: { sessionsHeld: 3, sessionsTotal: 4, pct: 75 },
  nextSession: liveSession,
  assignments: {
    outstandingCount: 2,
    overdueCount: 1,
    lateSubmittedCount: 1,
    dueSoon: [
      {
        id: 41,
        title: "Old essay",
        dueAt: "2020-01-05T10:00:00.000Z",
        dueOrgDay: "2020-01-05",
        isOverdue: true,
        status: "PENDING",
        reviewedAt: null,
      },
      {
        id: 42,
        title: "New essay",
        dueAt: "2099-06-01T10:00:00.000Z",
        dueOrgDay: "2099-06-01",
        isOverdue: false,
        status: "DRAFT",
        reviewedAt: null,
      },
    ],
  },
};

const myAttendance = {
  season: { id: 7, title: "Spring 2099", absenceBudgetMinutes: 180, absenceWeightMinutes: 90 },
  budget: {
    minutesUsed: 105,
    budgetMinutes: 180,
    budgetPct: 58,
    remainingPct: 42,
    absentCount: 1,
    lateCount: 1,
  },
  streak: 2,
  sessions: [],
};

const engagementRow = (studentUserId: number, studentName: string, score: number) => ({
  score,
  attendancePct: 33,
  submissionPct: 33,
  attendanceTotal: 3,
  attendancePresent: 1,
  submissionsExpected: 3,
  submissionsCompleted: 1,
  studentUserId,
  seasonId: 7,
  seasonTitle: "Spring 2099",
  atRisk: true,
  studentName,
  groupId: 5,
  groupName: "Group A",
});

const staffDashboard = (scope: "season" | "groups") => ({
  variant: "SEASON_STAFF",
  scope,
  season: { id: 7, code: "spring-2099", title: "Spring 2099", status: "ACTIVE" },
  groups:
    scope === "groups"
      ? [
          { id: 5, name: "Group A" },
          { id: 6, name: "Group B" },
        ]
      : [],
  progress: { sessionsHeld: 3, sessionsTotal: 4, pct: 75 },
  nextSession: liveSession,
  cohort: {
    studentCount: 3,
    meanAttendancePct: 33,
    atRiskTotal: 12,
    atRisk: [engagementRow(21, "Sara Student", 33)],
  },
  submissions: { pendingReview: 1, reviewed: 2 },
  quizzes: { total: 2, pending: 2, fullyGraded: 0, drafts: 1 },
});

// Same row shape as Plan 4's use-seasons.test.tsx.
const seasonRow = {
  id: 7,
  code: "s7",
  title: "Spring 2099",
  program: "TEST",
  year: 2099,
  status: "ACTIVE",
  startDate: "2099-01-01T00:00:00.000Z",
  endDate: "2099-12-31T00:00:00.000Z",
};

const engagementSummary = {
  scope: {
    seasonIds: [7],
    seasons: [{ id: 7, code: "spring-2099", title: "Spring 2099" }],
    truncated: false,
    label: "All seasons",
  },
  attendanceTrend: [],
  completion: [],
  bands: [
    { band: "HIGH", count: 3 },
    { band: "MEDIUM", count: 5 },
    { band: "LOW", count: 2 },
    { band: "AT_RISK", count: 34 },
  ],
  atRisk: [
    {
      score: 40,
      attendancePct: 50,
      submissionPct: 30,
      attendanceTotal: 8,
      attendancePresent: 4,
      submissionsExpected: 10,
      submissionsCompleted: 3,
      studentUserId: 21,
      name: "Sara Student",
      email: "sara@jpc.test",
      seasonId: 7,
      seasonTitle: "Spring 2099",
      band: "AT_RISK",
    },
  ],
  atRiskTotal: 34,
  cohortSize: 40,
  enrollmentCount: 44,
  generatedAt: "2099-03-10T00:00:00.000Z",
  exportDay: "2099-03-10",
};

const mentorDashboard = {
  variant: "MENTOR",
  recentActivity: [
    {
      key: "rev:9",
      kind: "reviewed",
      at: "2099-05-03T09:00:00.000Z",
      studentUserId: 22,
      studentName: "Omar",
      subjectTitle: "Feed essay",
      attendanceStatus: null,
      submissionPublicId: "pub0000009",
    },
    {
      key: "att:4",
      kind: "attendance",
      at: "2099-05-01T09:00:00.000Z",
      studentUserId: 23,
      studentName: "Mona",
      subjectTitle: "Week 6",
      attendanceStatus: "PRESENT",
      submissionPublicId: null,
    },
  ],
};

const organisation = {
  totalStudentsNotGraduated: 40,
  totalAlumni: 12,
  activeSeasonCount: 2,
  seasons: [
    {
      seasonId: 7,
      code: "spring-2099",
      program: "GBV",
      year: 2099,
      title: "Spring 2099",
      status: "ACTIVE",
      activeCount: 20,
      completedCount: 3,
      withdrawnCount: 1,
      leaderCount: 2,
    },
  ],
  alumniByYear: [{ year: 2098, count: 12 }],
  generatedAt: "2099-03-10T00:00:00.000Z",
};

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("DashboardScreen — STUDENT", () => {
  beforeEach(() => {
    useSessionStore.setState(
      makeSession("STUDENT", { activeSeasonId: 7 }, { name: "Sara Mansour" }),
    );
  });

  it("renders the server's figures and requests only what the student branch owns (C8 #2 at the client)", async () => {
    serve({
      "/api/v1/me/dashboard": studentDashboard,
      "/api/v1/me/attendance": myAttendance,
      [EVENTS]: events,
      [UNREAD]: { unreadCount: 0 },
    });
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true);

    renderWithProviders(<DashboardScreen />);

    expect(await screen.findByText("Welcome back, Sara")).toBeTruthy();
    expect(await screen.findByText("2 assignments need your attention")).toBeTruthy();
    expect(screen.getByText("Session 3 of 4 · 1 session to go")).toBeTruthy();
    expect(await screen.findByLabelText("Absence budget left: 42%")).toBeTruthy();
    expect(screen.getByLabelText("Streak: 2")).toBeTruthy();
    expect(screen.getByLabelText("To do: 2")).toBeTruthy();
    expect(screen.getByText("You submitted 1 assignment late this season.")).toBeTruthy();
    expect(screen.getByText("Happening now")).toBeTruthy();
    expect(screen.getByText("Mar 1, 2099 · 6:00 PM · Hall")).toBeTruthy();
    expect(screen.getByText("Overdue · was due Jan 5, 2020")).toBeTruthy();
    expect(screen.getByText("Due Jun 1, 2099")).toBeTruthy();
    expect(await screen.findByText("Open day")).toBeTruthy();

    fireEvent.press(screen.getByText("Join stream"));
    expect(openURL).toHaveBeenCalledWith("https://youtu.be/live");
    fireEvent.press(screen.getByLabelText("Absence budget left: 42%"));
    expect(mockPush).toHaveBeenCalledWith("/attendance");
    fireEvent.press(screen.getByLabelText("New essay, Due Jun 1, 2099"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/assignment/[id]", params: { id: "42" } });

    expect(new Set(requested())).toEqual(
      new Set(["/api/v1/me/dashboard", "/api/v1/me/attendance", EVENTS, UNREAD]),
    );
  });

  it("is told 'not enrolled' by the server and offers the profile (R63)", async () => {
    useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: null }, { name: "Sara" }));
    serve({
      "/api/v1/me/dashboard": {
        variant: "STUDENT",
        season: null,
        progress: null,
        nextSession: null,
        assignments: null,
      },
      [EVENTS]: events,
      [UNREAD]: { unreadCount: 0 },
    });

    renderWithProviders(<DashboardScreen />);

    expect(await screen.findByText("Not enrolled yet")).toBeTruthy();
    expect(screen.getByText("Welcome to JPC Space")).toBeTruthy();
    fireEvent.press(screen.getByText("Complete your profile"));
    expect(mockPush).toHaveBeenCalledWith("/profile");
    // No season → the budget read is gated off (Plan 11's enabled guard).
    expect(requested()).not.toContain("/api/v1/me/attendance");
  });

  it("offers no stream link for a session that is not running, even with a youtubeUrl (D13)", async () => {
    serve({
      "/api/v1/me/dashboard": {
        ...studentDashboard,
        nextSession: { ...liveSession, isInProgress: false },
      },
      "/api/v1/me/attendance": myAttendance,
      [EVENTS]: events,
      [UNREAD]: { unreadCount: 0 },
    });

    renderWithProviders(<DashboardScreen />);

    expect(await screen.findByText("Next session")).toBeTruthy();
    expect(screen.queryByText("Happening now")).toBeNull();
    expect(screen.queryByText("Join stream")).toBeNull();
  });

  it("keeps the budget tile when the events card fails — cards fail independently", async () => {
    serve({
      "/api/v1/me/dashboard": studentDashboard,
      "/api/v1/me/attendance": myAttendance,
      [UNREAD]: { unreadCount: 0 },
    });

    renderWithProviders(<DashboardScreen />);

    expect(await screen.findByText("Couldn't load upcoming events.")).toBeTruthy();
    expect(await screen.findByLabelText("Absence budget left: 42%")).toBeTruthy();
  });

  it("shows ErrorState wired to refetch when the dashboard read fails", async () => {
    serve({
      "/api/v1/me/attendance": myAttendance,
      [EVENTS]: events,
      [UNREAD]: { unreadCount: 0 },
    });

    renderWithProviders(<DashboardScreen />);

    expect(await screen.findByText("Couldn't load your dashboard.")).toBeTruthy();
    serve({
      "/api/v1/me/dashboard": studentDashboard,
      "/api/v1/me/attendance": myAttendance,
      [EVENTS]: events,
      [UNREAD]: { unreadCount: 0 },
    });
    fireEvent.press(screen.getAllByText("Try again")[0]!);
    expect(await screen.findByText("Session 3 of 4 · 1 session to go")).toBeTruthy();
  });

  it("pull-to-refresh refetches every query the branch owns", async () => {
    serve({
      "/api/v1/me/dashboard": studentDashboard,
      "/api/v1/me/attendance": myAttendance,
      [EVENTS]: events,
      [UNREAD]: { unreadCount: 0 },
    });
    renderWithProviders(<DashboardScreen />);
    await screen.findByLabelText("Absence budget left: 42%");
    get.mockClear();

    await act(async () => {
      screen.UNSAFE_getByType(ScrollView).props.refreshControl.props.onRefresh();
    });

    await waitFor(() => {
      expect(get).toHaveBeenCalledWith("/api/v1/me/dashboard");
      expect(get).toHaveBeenCalledWith("/api/v1/me/attendance");
      expect(get).toHaveBeenCalledWith(EVENTS);
    });
  });
});

describe("DashboardScreen — ALUMNI", () => {
  it("greets by first name with the class year and never calls /me/dashboard (D21)", async () => {
    useSessionStore.setState(
      makeSession("STUDENT", { graduationYear: 2024 }, { name: "  Nour Adel " }),
    );
    serve({ [EVENTS]: events, [UNREAD]: { unreadCount: 0 } });

    renderWithProviders(<DashboardScreen />);

    expect(await screen.findByText("Welcome back, Nour")).toBeTruthy();
    expect(screen.getByText("JPCS Alumnus · Class of 2024")).toBeTruthy();
    fireEvent.press(screen.getByText("View my history"));
    expect(mockPush).toHaveBeenCalledWith("/history");
    expect(await screen.findByText("Open day")).toBeTruthy();
    expect(new Set(requested())).toEqual(new Set([EVENTS, UNREAD]));
  });
});

describe("DashboardScreen — ADMIN and LEADER", () => {
  it("admin: current season from useCurrentSeasonId, the at-risk preview, no roster, no reports read", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    serve({
      "/api/v1/seasons": { seasons: [seasonRow] },
      "/api/v1/me/dashboard?seasonId=7": staffDashboard("season"),
      [EVENTS]: events,
      [UNREAD]: { unreadCount: 0 },
    });

    renderWithProviders(<DashboardScreen />);

    expect(await screen.findByText("Spring 2099")).toBeTruthy();
    expect(screen.getByText("Session 3 of 4")).toBeTruthy();
    expect(screen.getByText("Average attendance 33%")).toBeTruthy();
    expect(screen.getByText("Happening now")).toBeTruthy();
    expect(screen.getByText("1 of 12")).toBeTruthy();
    expect(screen.getByLabelText("Quizzes pending: 2")).toBeTruthy();
    expect(screen.getByText("1 quiz draft not yet published")).toBeTruthy();

    fireEvent.press(screen.getByLabelText("Sara Student, 33% attendance, 1 of 3 submitted"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/student/[id]", params: { id: "21" } });
    fireEvent.press(screen.getByLabelText("Pending review: 1"));
    expect(mockPush).toHaveBeenCalledWith("/submissions");
    fireEvent.press(screen.getByText("View all"));
    expect(mockPush).toHaveBeenCalledWith("/students");

    expect(requested().some((u) => u.startsWith("/api/v1/reports"))).toBe(false);
  });

  it("admin with no season: 'No season yet', and no dashboard request (enabled guard)", async () => {
    useSessionStore.setState(makeSession("ADMIN"));
    serve({ "/api/v1/seasons": { seasons: [] }, [EVENTS]: events, [UNREAD]: { unreadCount: 0 } });

    renderWithProviders(<DashboardScreen />);

    expect(await screen.findByText("No season yet")).toBeTruthy();
    expect(requested().some((u) => u.startsWith("/api/v1/me/dashboard"))).toBe(false);
  });

  it("leader: every group named, 'View all' goes to /groups, the attendance label says 'group'", async () => {
    useSessionStore.setState(makeSession("LEADER", { groupLeaderIds: [5, 6] }));
    serve({
      "/api/v1/seasons": { seasons: [seasonRow] },
      "/api/v1/me/dashboard?seasonId=7": staffDashboard("groups"),
      [EVENTS]: events,
      [UNREAD]: { unreadCount: 0 },
    });

    renderWithProviders(<DashboardScreen />);

    expect(await screen.findByText("Group A, Group B")).toBeTruthy();
    expect(screen.getByText("Group average attendance 33%")).toBeTruthy();
    expect(screen.getByText("Your students at risk")).toBeTruthy();
    fireEvent.press(screen.getByText("View all"));
    expect(mockPush).toHaveBeenCalledWith("/groups");
  });

  it("leader refused for the season: shows the server's message", async () => {
    useSessionStore.setState(makeSession("LEADER", { groupLeaderIds: [5] }));
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

    renderWithProviders(<DashboardScreen />);

    expect(await screen.findByText("You don't have access to this.")).toBeTruthy();
  });
});

describe("DashboardScreen — MENTOR", () => {
  it("at-risk from Reports (same cache), a merged feed linking to students and submissions (D17, D18)", async () => {
    useSessionStore.setState(makeSession("MENTOR"));
    serve({
      "/api/v1/reports/engagement": engagementSummary,
      "/api/v1/me/dashboard": mentorDashboard,
      [EVENTS]: events,
      [UNREAD]: { unreadCount: 0 },
    });

    renderWithProviders(<DashboardScreen />);

    expect(await screen.findByText("At risk")).toBeTruthy();
    expect(await screen.findByText("1 of 34")).toBeTruthy();
    expect(screen.queryByText("Flagged for follow-up")).toBeNull();

    fireEvent.press(await screen.findByLabelText("Omar received feedback on Feed essay"));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/submission/[publicId]",
      params: { publicId: "pub0000009" },
    });
    fireEvent.press(screen.getByLabelText("Mona was present at Week 6"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/student/[id]", params: { id: "23" } });

    expect(requested()).not.toContain("/api/v1/seasons");
  });

  it("names the actual rule when nobody is at risk", async () => {
    useSessionStore.setState(makeSession("MENTOR"));
    serve({
      "/api/v1/reports/engagement": { ...engagementSummary, atRisk: [], atRiskTotal: 0 },
      "/api/v1/me/dashboard": { variant: "MENTOR", recentActivity: [] },
      [EVENTS]: events,
      [UNREAD]: { unreadCount: 0 },
    });

    renderWithProviders(<DashboardScreen />);

    expect(await screen.findByText("Nobody at risk")).toBeTruthy();
    expect(screen.getByText("No student has attendance or submissions below 60%.")).toBeTruthy();
    expect(await screen.findByText("No recent activity.")).toBeTruthy();
  });
});

describe("DashboardScreen — SUPER", () => {
  it("organisation tiles share Reports' cache; the events tile reads `total` from the card's response (D19, D20)", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    serve({
      "/api/v1/reports/organisation": organisation,
      [EVENTS]: events,
      [UNREAD]: { unreadCount: 0 },
    });

    renderWithProviders(<DashboardScreen />);

    expect(await screen.findByLabelText("Students (not graduated): 40")).toBeTruthy();
    expect(screen.getByLabelText("Alumni: 12")).toBeTruthy();
    // seasons.length (all statuses), NOT activeSeasonCount (2).
    expect(screen.getByLabelText("Seasons: 1")).toBeTruthy();
    expect(await screen.findByLabelText("Upcoming events: 9")).toBeTruthy();

    fireEvent.press(screen.getByLabelText("Alumni: 12"));
    expect(mockPush).toHaveBeenCalledWith("/students/alumni");
    expect(requested().some((u) => u.startsWith("/api/v1/me/dashboard"))).toBe(false);
  });
});

// Plan 13 Task 8's bell cases, kept; now on a signed-in ALUMNI session.
describe("NotificationBell on the dashboard", () => {
  function mockUnreadCount(unreadCount: number) {
    serve({ [UNREAD]: { unreadCount }, [EVENTS]: events });
  }
  beforeEach(() => {
    useSessionStore.setState(makeSession("STUDENT", { graduationYear: 2024 }));
  });

  it("shows the unread badge and opens the inbox", async () => {
    mockUnreadCount(3);
    renderWithProviders(<DashboardScreen />);
    expect(await screen.findByLabelText("Notifications, 3 unread")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Notifications, 3 unread"));
    expect(mockPush).toHaveBeenCalledWith("/notifications");
  });

  it("caps the badge at 9+", async () => {
    mockUnreadCount(42);
    renderWithProviders(<DashboardScreen />);
    expect(await screen.findByText("9+")).toBeTruthy();
  });

  it("renders no badge at zero unread", async () => {
    mockUnreadCount(0);
    renderWithProviders(<DashboardScreen />);
    expect(await screen.findByLabelText("Notifications")).toBeTruthy();
    expect(screen.queryByText("0")).toBeNull();
  });
});
