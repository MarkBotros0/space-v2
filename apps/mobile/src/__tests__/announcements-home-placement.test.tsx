import { act, screen } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn(), post: jest.fn() } }));
jest.mock("expo-camera", () => require("./helpers/expo-camera"));
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn() }),
  useFocusEffect: (effect: () => void | (() => void)) => require("react").useEffect(effect, [effect]),
}));
jest.mock("../design/layout/home-actions", () => {
  const { Text } = jest.requireActual("react-native");
  return { HomeActions: () => <Text testID="home-actions">home actions</Text> };
});

import { MentorDashboard } from "../screens/mentor/mentor-dashboard";
import { LeaderToday } from "../screens/leader-today";
import { StudentToday } from "../screens/today/student-today";
import { deviceTodayKey } from "../lib/calendar-grid";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";
import { listItem } from "./helpers/announcements";
import {
  EVENTS,
  NEXT_SESSION_DETAIL,
  STUDENT_QUIZZES,
  UNREAD,
  events,
  get,
  liveSession,
  myAttendance,
  quizPage,
  seasonRow,
  serve,
  sessionDetail,
  studentDashboard,
  staffDashboard,
} from "./helpers/dashboard-fixtures";
import { serveStaff, staffRoutes } from "./helpers/staff-today-fixtures";

import DashboardScreen from "../../app/(app)/(tabs)/dashboard";

const ANNOUNCEMENTS = "/api/v1/announcements/unread";
const unread = { count: 2, latest: listItem(4, { excerpt: "Camp dates" }) };

/** Rendered text and accessibility labels, in render order. */
function flat(): string[] {
  const out: string[] = [];
  const walk = (n: unknown): void => {
    if (typeof n === "string") out.push(n);
    else if (Array.isArray(n)) n.forEach(walk);
    else if (n && typeof n === "object") {
      const node = n as { props?: { accessibilityLabel?: string }; children?: unknown[] };
      if (node.props?.accessibilityLabel) out.push(node.props.accessibilityLabel);
      node.children?.forEach(walk);
    }
  };
  walk(screen.toJSON());
  return out;
}
const at = (t: string) => flat().findIndex((x) => x === t || x.startsWith(t));
const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 20)));

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});
afterEach(settle);

const studentRoutes = (over: Record<string, unknown> = {}) => ({
  "/api/v1/me/dashboard": studentDashboard,
  "/api/v1/me/attendance": myAttendance,
  [EVENTS]: events,
  [NEXT_SESSION_DETAIL]: sessionDetail,
  [STUDENT_QUIZZES]: quizPage,
  "/api/v1/me/season-history": { seasons: [] },
  [ANNOUNCEMENTS]: unread,
  ...over,
});

describe("Announcements card placement on Home", () => {
  beforeEach(() => {
    useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }, { name: "Sara Mansour" }));
  });

  it("student, check-in open and not checked in: still the season, then the card, then the session", async () => {
    serve(studentRoutes());
    renderWithProviders(<StudentToday />);
    await screen.findByText("Check In");
    await screen.findByText("Camp dates");
    await screen.findByLabelText("Open Spring 2099");
    expect(at("Open Spring 2099")).toBeGreaterThanOrEqual(0);
    expect(at("Open Spring 2099")).toBeLessThan(at("Camp dates"));
    expect(at("Camp dates")).toBeLessThan(at("Week 6"));
  });

  it("student otherwise: the season, then the card, then the session", async () => {
    serve(studentRoutes({ [NEXT_SESSION_DETAIL]: { ...sessionDetail, checkInOpen: false } }));
    renderWithProviders(<StudentToday />);
    await screen.findByText("Camp dates");
    await screen.findByLabelText("Open Spring 2099");
    await screen.findByText("Week 6");
    expect(at("Open Spring 2099")).toBeGreaterThanOrEqual(0);
    expect(at("Open Spring 2099")).toBeLessThan(at("Camp dates"));
    expect(at("Camp dates")).toBeLessThan(at("Week 6"));
  });

  it("admin, session in progress: the season, then the card, then the live session", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    serveStaff(get, { table: staffRoutes({ [ANNOUNCEMENTS]: unread }) });
    renderWithProviders(<DashboardScreen />);
    await screen.findByText("Camp dates");
    await screen.findByText("Happening now");
    expect(at("Camp dates")).toBeGreaterThanOrEqual(0);
    expect(at("Camp dates")).toBeLessThan(at("Happening now"));
  });

  it("admin, nothing in progress: the card first, before the next session", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    const idle = { ...staffDashboard("season"), nextSession: { ...liveSession, isInProgress: false } };
    serveStaff(get, {
      table: staffRoutes({ [ANNOUNCEMENTS]: unread, "/api/v1/me/dashboard?seasonId=7": idle }),
    });
    renderWithProviders(<DashboardScreen />);
    await screen.findByText("Camp dates");
    await screen.findByText("Week 6");
    expect(at("Camp dates")).toBeGreaterThanOrEqual(0);
    expect(at("Camp dates")).toBeLessThan(at("Week 6"));
  });

  const leaderRoutes = (nextSession: unknown) => ({
    "/api/v1/seasons": { seasons: [seasonRow] },
    "/api/v1/me/dashboard?seasonId=7": { ...staffDashboard("groups"), nextSession },
    [EVENTS]: events,
    [UNREAD]: { unreadCount: 0 },
    [ANNOUNCEMENTS]: unread,
  });

  it("leader on a session day: still the card before the session", async () => {
    useSessionStore.setState(makeSession("LEADER", { groupLeaderIds: [5, 6] }, { name: "Lena Leader" }));
    serve(leaderRoutes({ ...liveSession, dayKey: deviceTodayKey(), isInProgress: false, youtubeUrl: null }));
    renderWithProviders(<LeaderToday />);
    await screen.findByText("Camp dates");
    await screen.findByText("Week 6");
    expect(at("Camp dates")).toBeGreaterThanOrEqual(0);
    expect(at("Camp dates")).toBeLessThan(at("Week 6"));
  });

  it("leader on a quiet day: the card first, before the next session", async () => {
    useSessionStore.setState(makeSession("LEADER", { groupLeaderIds: [5, 6] }, { name: "Lena Leader" }));
    serve(leaderRoutes({ ...liveSession, isInProgress: false, youtubeUrl: null }));
    renderWithProviders(<LeaderToday />);
    await screen.findByText("Camp dates");
    await screen.findByText("Week 6");
    expect(at("Camp dates")).toBeGreaterThanOrEqual(0);
    expect(at("Camp dates")).toBeLessThan(at("Week 6"));
  });

  it("mentor: the card first, before the four numbers", async () => {
    useSessionStore.setState(makeSession("MENTOR"));
    serve({
      "/api/v1/me/mentor-summary": { followUpsDue: 2, absentLately: 3, notesThisWeek: 4, students: 120 },
      "/api/v1/me/visible-notes?limit=5": { notes: [], nextCursor: null },
      [EVENTS]: events,
      [UNREAD]: { unreadCount: 0 },
      [ANNOUNCEMENTS]: unread,
    });
    renderWithProviders(<MentorDashboard />);
    await screen.findByText("Camp dates");
    await screen.findByLabelText("Follow-ups due: 2");
    expect(at("Camp dates")).toBeLessThan(at("Follow-ups due: 2"));
  });

  it("alumni: the card first, before the events", async () => {
    useSessionStore.setState(
      makeSession("STUDENT", { activeSeasonId: null, graduationYear: 2024 }, { name: "Nour Adel" }),
    );
    serve({
      [EVENTS]: events,
      [UNREAD]: { unreadCount: 0 },
      "/api/v1/me/season-history": { seasons: [] },
      [ANNOUNCEMENTS]: unread,
    });
    renderWithProviders(<DashboardScreen />);
    await screen.findByText("Camp dates");
    await screen.findByText("Open day");
    expect(at("Camp dates")).toBeLessThan(at("Open day"));
  });
});
