import { fireEvent, screen } from "@testing-library/react-native";
import { AxiosError } from "axios";

// `jest.mock` factories may only close over `mock*` consts (CLAUDE.md).
jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn() },
}));

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: (...args: unknown[]) => mockPush(...args) }),
}));

import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";
import {
  EVENTS,
  UNREAD,
  engagementSummary,
  events,
  get,
  mentorDashboard,
  organisation,
  requested,
  seasonRow,
  serve,
  staffDashboard,
} from "./helpers/dashboard-fixtures";

import DashboardScreen from "../../app/(app)/(tabs)/dashboard";

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
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
    expect(screen.getByText("Current season")).toBeTruthy();
    expect(screen.getByLabelText("Season average attendance 33%")).toBeTruthy();
    expect(screen.getByText("3 students · Session 3 of 4")).toBeTruthy();
    expect(screen.getByText("Happening now")).toBeTruthy();
    expect(screen.getByLabelText("Students: 3")).toBeTruthy();
    expect(screen.getByLabelText("Progress: 75%")).toBeTruthy();
    expect(screen.getByLabelText("Quizzes: 2")).toBeTruthy();
    expect(screen.getByText("Students at risk")).toBeTruthy();
    expect(screen.getByText("1/3 submitted")).toBeTruthy();
    expect(screen.getByText("12 students at risk")).toBeTruthy();
    expect(screen.getByText("1 quiz draft not yet published")).toBeTruthy();

    fireEvent.press(screen.getAllByText("Sara Student")[0]!);
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/student/[id]", params: { id: "21" } });
    fireEvent.press(screen.getByLabelText("View all Assignments"));
    expect(mockPush).toHaveBeenCalledWith("/assignments");
    fireEvent.press(screen.getByLabelText("View all Quizzes"));
    expect(mockPush).toHaveBeenCalledWith("/quizzes");
    fireEvent.press(screen.getByLabelText("Students: 3"));
    expect(mockPush).toHaveBeenCalledWith("/students");
    fireEvent.press(screen.getByLabelText("View all Students at risk"));
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

  it("leader: v1 layout — every group named, neutral ring, stat row, at-risk card and the cards' View all links", async () => {
    useSessionStore.setState(makeSession("LEADER", { groupLeaderIds: [5, 6] }));
    serve({
      "/api/v1/seasons": { seasons: [seasonRow] },
      "/api/v1/me/dashboard?seasonId=7": staffDashboard("groups"),
      [EVENTS]: events,
      [UNREAD]: { unreadCount: 0 },
    });

    renderWithProviders(<DashboardScreen />);

    expect(await screen.findByText("Group A, Group B")).toBeTruthy();
    expect(screen.getByLabelText("Group average attendance 33%")).toBeTruthy();
    expect(screen.getAllByText("33%").length).toBeGreaterThan(0);
    expect(screen.getByText("3 students · Session 3 of 4")).toBeTruthy();
    expect(screen.getByLabelText("Students: 3")).toBeTruthy();
    expect(screen.getByLabelText("Progress: 75%")).toBeTruthy();
    expect(screen.getByLabelText("Quizzes: 2")).toBeTruthy();
    expect(screen.getByText("Your students at risk")).toBeTruthy();
    expect(screen.getByText("1/3 submitted")).toBeTruthy();
    expect(screen.getByText("12 students at risk")).toBeTruthy();
    expect(screen.getByText("1 quiz draft not yet published")).toBeTruthy();

    fireEvent.press(screen.getByLabelText("View all Your students at risk"));
    expect(mockPush).toHaveBeenCalledWith("/groups");
    fireEvent.press(screen.getByLabelText("View all Assignments"));
    // The figures are this season's, so the queue opens on the same season.
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/submissions", params: { seasonId: "7" } });
    fireEvent.press(screen.getByLabelText("View all Quiz corrections"));
    expect(mockPush).toHaveBeenCalledWith("/quizzes");
    fireEvent.press(screen.getByLabelText("Quizzes: 2"));
    expect(mockPush).toHaveBeenCalledWith("/quizzes");
    fireEvent.press(screen.getAllByText("Sara Student")[0]!);
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/student/[id]", params: { id: "21" } });
  });

  it("leader refused for the season: v1's leader error page", async () => {
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

    expect(await screen.findByText("Something went wrong")).toBeTruthy();
    expect(screen.getByText(/let an admin know/)).toBeTruthy();
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
    expect(screen.getByText("Mentor dashboard")).toBeTruthy();
    expect(screen.getByText("Recent activity")).toBeTruthy();
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
