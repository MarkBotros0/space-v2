import { act, fireEvent, screen } from "@testing-library/react-native";
import { ScrollView } from "react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn(), post: jest.fn() } }));
jest.mock("expo-camera", () => require("./helpers/expo-camera"));

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: (...args: unknown[]) => mockPush(...args) }),
  useFocusEffect: (effect: () => void | (() => void)) => require("react").useEffect(effect, [effect]),
}));
jest.mock("../design/layout/home-actions", () => {
  const { Text } = jest.requireActual("react-native");
  return { HomeActions: () => <Text testID="home-actions">home actions</Text> };
});

import { betweenSeasonsState } from "../lib/between-seasons";
import { StudentToday } from "../screens/today/student-today";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";
import { EVENTS, events, get, requested, serve } from "./helpers/dashboard-fixtures";

const DASHBOARD = "/api/v1/me/dashboard";
const HISTORY = "/api/v1/me/season-history";
const NEXT = "You'll see your next season here when you're added.";

const notEnrolled = {
  variant: "STUDENT",
  todayOrgDay: "2099-03-01",
  season: null,
  progress: null,
  nextSession: null,
  assignments: null,
};
const hist = (outcome: string, over: Record<string, unknown> = {}) => ({
  seasonId: 3,
  code: "gbv-2026",
  title: "GBV 2026",
  startDate: "2026-01-05T00:00:00.000Z",
  endDate: "2026-03-20T00:00:00.000Z",
  groupName: null,
  outcome,
  attendancePct: 92,
  curriculum: [],
  ...over,
});
const routes = (seasons: unknown[]) => ({ [DASHBOARD]: notEnrolled, [EVENTS]: events, [HISTORY]: { seasons } });

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: null }, { name: "Sara Mansour" }));
});
afterEach(() => act(() => new Promise<void>((resolve) => setTimeout(resolve, 20))));

describe("betweenSeasonsState", () => {
  it("reads the newest row", () => {
    expect(betweenSeasonsState([]).kind).toBe("first");
    expect(betweenSeasonsState([hist("DROPPED"), hist("PASSED")] as never).kind).toBe("dropped");
    for (const o of ["PASSED", "NOT_PASSED", "COMPLETED"]) {
      expect(betweenSeasonsState([hist(o), hist("DROPPED")] as never).kind).toBe("finished");
    }
  });
});

describe("StudentToday between seasons", () => {
  it("finished and passed: card, result, link and the next-season line", async () => {
    serve(routes([hist("PASSED")]));
    renderWithProviders(<StudentToday />);
    expect(await screen.findByText("GBV 2026 finished")).toBeTruthy();
    expect(screen.getByText("Passed - 92% attendance")).toBeTruthy();
    expect(screen.getByText(NEXT)).toBeTruthy();
    expect(await screen.findByText("Open day")).toBeTruthy();
    fireEvent.press(screen.getByText("View your season"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/past-season/[seasonId]", params: { seasonId: "3" } });
  });

  it("finished and not passed: says so in words", async () => {
    serve(routes([hist("NOT_PASSED", { attendancePct: 40 })]));
    renderWithProviders(<StudentToday />);
    expect(await screen.findByText("Did not pass - 40% attendance")).toBeTruthy();
  });

  it("dropped: a quiet note, no card, no reason", async () => {
    serve(routes([hist("DROPPED")]));
    renderWithProviders(<StudentToday />);
    expect(await screen.findByText("You're not in a season right now")).toBeTruthy();
    expect(screen.getByText(NEXT)).toBeTruthy();
    expect(screen.queryByText("GBV 2026 finished")).toBeNull();
    expect(screen.queryByText("Did not finish")).toBeNull();
    expect(screen.queryByText("View your season")).toBeNull();
  });

  it("first season: welcome and the profile row", async () => {
    serve(routes([]));
    renderWithProviders(<StudentToday />);
    expect(await screen.findByText("Welcome to JPC Space")).toBeTruthy();
    expect(screen.getByText("You'll see your first season here when you're added.")).toBeTruthy();
    expect(await screen.findByText("Open day")).toBeTruthy();
    fireEvent.press(screen.getByText("Complete your profile"));
    expect(mockPush).toHaveBeenCalledWith("/profile");
  });

  it("never shows the old copy", async () => {
    serve(routes([hist("PASSED")]));
    renderWithProviders(<StudentToday />);
    await screen.findByText("GBV 2026 finished");
    expect(screen.queryByText("Not enrolled yet")).toBeNull();
    expect(screen.queryByText(/Contact your leader/)).toBeNull();
  });

  it("a failed history read is an error with retry, not a first-time message", async () => {
    serve({ [DASHBOARD]: notEnrolled, [EVENTS]: events });
    renderWithProviders(<StudentToday />);
    expect(await screen.findByText("Couldn't load your seasons.")).toBeTruthy();
    expect(screen.queryByText("Welcome to JPC Space")).toBeNull();
    serve(routes([hist("PASSED")]));
    fireEvent.press(screen.getByText("Try again"));
    expect(await screen.findByText("GBV 2026 finished")).toBeTruthy();
  });

  it("loads history only without a season, and pull-to-refresh includes it", async () => {
    serve(routes([hist("PASSED")]));
    renderWithProviders(<StudentToday />);
    await screen.findByText("GBV 2026 finished");
    get.mockClear();
    await act(async () => {
      screen.UNSAFE_getByType(ScrollView).props.refreshControl.props.onRefresh();
    });
    await screen.findByText("GBV 2026 finished");
    expect(requested()).toContain(HISTORY);
  });
});
