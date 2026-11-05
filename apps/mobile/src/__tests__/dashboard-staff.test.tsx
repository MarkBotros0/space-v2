import { fireEvent, screen } from "@testing-library/react-native";

// `jest.mock` factories may only close over `mock*` consts (CLAUDE.md).
jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn() },
}));

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: (...args: unknown[]) => mockPush(...args) }),
}));

// Home's frame carries the bell and the user menu (ruling R13), which fetch
// notifications; they have their own tests (screen.test.tsx). A marker
// stands in, so these tests see only the requests the branches make.
jest.mock("../design/layout/home-actions", () => {
  const { Text } = jest.requireActual("react-native");
  return { HomeActions: () => <Text testID="home-actions">home actions</Text> };
});

import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";
import {
  EVENTS,
  UNREAD,
  engagementSummary,
  events,
  mentorDashboard,
  requested,
  serve,
} from "./helpers/dashboard-fixtures";

import DashboardScreen from "../../app/(app)/(tabs)/dashboard";

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("DashboardScreen — MENTOR", () => {
  it("at-risk from Reports (same cache), a merged feed linking to students and submissions (D17, D18)", async () => {
    useSessionStore.setState(makeSession("MENTOR"));
    serve({
      "/api/v1/reports/engagement": engagementSummary,
      "/api/v1/me/dashboard": mentorDashboard,
      "/api/v1/me/visible-notes?limit=5": { notes: [], nextCursor: null },
      [EVENTS]: events,
      [UNREAD]: { unreadCount: 0 },
    });

    renderWithProviders(<DashboardScreen />);

    expect(await screen.findByText("AT RISK · 1 OF 34")).toBeTruthy();
    expect(screen.getAllByTestId("home-actions")).toHaveLength(1);
    expect(screen.getByText("RECENT ACTIVITY")).toBeTruthy();
    expect(screen.queryByText("Flagged for follow-up")).toBeNull();

    fireEvent.press(await screen.findByLabelText(/^Omar, received feedback on Feed essay/));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/submission/[publicId]",
      params: { publicId: "pub0000009" },
    });
    fireEvent.press(screen.getByLabelText(/^Mona, was present at Week 6/));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/student/[id]", params: { id: "23" } });

    expect(requested()).not.toContain("/api/v1/seasons");
  });

  it("names the actual rule when nobody is at risk", async () => {
    useSessionStore.setState(makeSession("MENTOR"));
    serve({
      "/api/v1/reports/engagement": { ...engagementSummary, atRisk: [], atRiskTotal: 0 },
      "/api/v1/me/dashboard": { variant: "MENTOR", recentActivity: [] },
      "/api/v1/me/visible-notes?limit=5": { notes: [], nextCursor: null },
      [EVENTS]: events,
      [UNREAD]: { unreadCount: 0 },
    });

    renderWithProviders(<DashboardScreen />);

    expect(await screen.findByText("Nobody at risk")).toBeTruthy();
    expect(screen.getByText("No student has attendance or submissions below 60%.")).toBeTruthy();
    expect(await screen.findByText("No recent activity.")).toBeTruthy();
  });
});
