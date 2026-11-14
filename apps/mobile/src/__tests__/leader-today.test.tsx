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
    expect(atRiskReason(row({ attendancePct: 40, submissionsCompleted: 1, submissionPct: 33 }))).toBe(
      "Attendance 40% · 1 of 3 submitted",
    );
  });
});

const today = deviceTodayKey();
const missing = (n: number) => Array.from({ length: n }, (_, i) => ({ id: 100 + i, name: `Missing ${i + 1}` }));
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
  it("on the day: the session to run with its counts, and no Not checked in list (owner 2026-11-14)", async () => {
    serveDash(dash({ nextSession: dayOf, leaderSession: checkIn(7) }));
    renderWithProviders(<LeaderToday />);

    expect(await screen.findByText("Mark attendance")).toBeTruthy();
    expect(screen.getByText("Hi, Lena")).toBeTruthy();
    expect(screen.getAllByText("Group A, Group B").length).toBeGreaterThan(0);
    expect(screen.getByText(/2 present · 7 not checked in/)).toBeTruthy();
    expect(screen.getByText("Next session · Today")).toBeTruthy();
    // On its day the card carries an action, so it is the brand hero; the title opens the session.
    expect(screen.getByTestId("hero-card").props.className).toContain("bg-hero");
    expect(screen.queryByText("Open session")).toBeNull();
    // Mark attendance names them; Home only counts.
    expect(screen.queryByText("NOT CHECKED IN")).toBeNull();
    expect(screen.queryByText("Missing 1")).toBeNull();
    expect(screen.queryByText("See all 7")).toBeNull();
    expect(screen.getAllByTestId("home-actions")).toHaveLength(1);

    fireEvent.press(screen.getByText("Mark attendance"));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/session/[id]/attendance",
      params: { id: "11" },
    });
  });

  it("two missing: the card counts them", async () => {
    serveDash(dash({ nextSession: dayOf, leaderSession: checkIn(2) }));
    renderWithProviders(<LeaderToday />);
    expect(await screen.findByText(/2 not checked in/)).toBeTruthy();
  });

  it("while in progress with a stream: Join stream", async () => {
    serveDash(
      dash({
        nextSession: { ...dayOf, isInProgress: true, youtubeUrl: "https://youtu.be/x" },
        leaderSession: checkIn(1),
      }),
    );
    renderWithProviders(<LeaderToday />);
    expect(await screen.findByText("Happening now")).toBeTruthy();
    expect(screen.getByText("Join stream")).toBeTruthy();
  });

  it("a week out: a plain card with the day cue, its title opens the session, no Not checked in", async () => {
    serveDash(
      dash({ nextSession: { ...liveSession, isInProgress: false, dayKey: "2099-03-01" }, leaderSession: checkIn(3) }),
    );
    renderWithProviders(<LeaderToday />);
    expect(await screen.findByText(/^Next session · in \d+ days$/)).toBeTruthy();
    expect(screen.getByTestId("hero-card").props.className).toContain("bg-surface");
    expect(screen.queryByText("Mark attendance")).toBeNull();
    expect(screen.queryByText("Open session")).toBeNull();
    expect(screen.queryByText("NOT CHECKED IN")).toBeNull();
    fireEvent.press(screen.getByRole("link", { name: "Week 6" }));
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
    expect(await screen.findByText("Mark attendance")).toBeTruthy();
    expect(screen.queryByText(/not checked in/)).toBeNull();
  });

  it("waiting for you: assignments and quizzes side by side, both opening Work", async () => {
    serveDash(dash({ nextSession: null, leaderSession: null }));
    renderWithProviders(<LeaderToday />);
    expect(await screen.findByLabelText("Assignments to review: 1")).toBeTruthy();
    expect(screen.getByLabelText("Quizzes to grade: 2")).toBeTruthy();
    expect(screen.getByTestId("waiting-split").props.className).toContain("flex-row");
    // Named in the list below instead of a tile of their own.
    expect(screen.queryByLabelText(/^Students at risk:/)).toBeNull();
    fireEvent.press(screen.getByLabelText("Assignments to review: 1"));
    // Both open Work (owner 2026-11-14), on the side the tile counts.
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/coursework", params: { tab: "assignments" } });
    fireEvent.press(screen.getByLabelText("Quizzes to grade: 2"));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: "/coursework", params: { tab: "quizzes" } });
  });

  it("nothing waiting keeps both tiles, each at zero and all clear", async () => {
    const base = staffDashboard("groups");
    serveDash(
      dash({
        nextSession: null,
        leaderSession: null,
        submissions: { pendingReview: 0, reviewed: 2 },
        quizzes: { total: 0, pending: 0, fullyGraded: 0, drafts: 0 },
        cohort: { ...base.cohort, atRisk: [], atRiskTotal: 0 },
      }),
    );
    renderWithProviders(<LeaderToday />);
    expect(await screen.findByLabelText("Assignments to review: none, all clear")).toBeTruthy();
    expect(screen.getByLabelText("Quizzes to grade: none, all clear")).toBeTruthy();
    expect(screen.queryByLabelText("All caught up")).toBeNull();
  });

  it("at risk: names with a reason line, See all to groups, and the season card stays", async () => {
    serveDash(dash({ nextSession: null, leaderSession: null }));
    renderWithProviders(<LeaderToday />);
    expect(await screen.findByText("STUDENTS AT RISK")).toBeTruthy();
    expect(screen.queryByText("YOUR STUDENTS AT RISK")).toBeNull();
    expect(screen.getByText("Sara Student")).toBeTruthy();
    expect(screen.getByText("Attendance 33% · 1 of 3 submitted")).toBeTruthy();
    fireEvent.press(screen.getByText("See all 12"));
    expect(mockPush).toHaveBeenCalledWith("/groups");
    expect(screen.getByLabelText("Students: 3")).toBeTruthy();
    expect(screen.getByLabelText("Attendance: 33%")).toBeTruthy();
    expect(screen.getByLabelText("Sessions held: 3 of 4")).toBeTruthy();
    expect(screen.getByLabelText("Season progress 75%")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Open Spring 2099"));
    expect(mockPush).toHaveBeenLastCalledWith("/groups");
    fireEvent.press(screen.getByText("Sara Student"));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: "/student/[id]", params: { id: "21" } });
  });

  // Owner 2026-11-07: the group's season card sits right under the session.
  it("puts the group card first, then the session, the tiles and the names (owner, 2026-11-08)", async () => {
    serveDash(dash({ nextSession: null, leaderSession: null }));
    renderWithProviders(<LeaderToday />);
    await screen.findByText("STUDENTS AT RISK");
    const texts: string[] = [];
    const walk = (n: unknown): void => {
      if (typeof n === "string") texts.push(n);
      else if (Array.isArray(n)) n.forEach(walk);
      else if (n && typeof n === "object") {
        const node = n as { props?: { accessibilityLabel?: string }; children?: unknown[] };
        if (node.props?.accessibilityLabel) texts.push(node.props.accessibilityLabel);
        node.children?.forEach(walk);
      }
    };
    walk(screen.toJSON());
    const at = (t: string) => texts.indexOf(t);
    expect(at("Open Spring 2099")).toBeGreaterThanOrEqual(0);
    expect(at("Open Spring 2099")).toBeLessThan(at("No upcoming sessions."));
    expect(at("No upcoming sessions.")).toBeLessThan(at("WAITING FOR YOU"));
    expect(at("WAITING FOR YOU")).toBeLessThan(at("STUDENTS AT RISK"));
  });

  it("no name: the title is Home", async () => {
    useSessionStore.setState(makeSession("LEADER", { groupLeaderIds: [5] }, { name: "" }));
    serveDash(dash({ nextSession: null }));
    renderWithProviders(<LeaderToday />);
    expect(await screen.findByLabelText("Assignments to review: 1")).toBeTruthy();
    expect(screen.getAllByText("Home").length).toBeGreaterThan(0);
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
      if (url === "/api/v1/seasons") return Promise.resolve({ data: { data: { seasons: [seasonRow] } } });
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
