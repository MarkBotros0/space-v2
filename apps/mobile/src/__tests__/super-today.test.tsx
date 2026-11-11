import { fireEvent, screen } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn() } }));

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: (...args: unknown[]) => mockPush(...args) }),
  useFocusEffect: (effect: () => void | (() => void)) => require("react").useEffect(effect, [effect]),
}));

jest.mock("../design/layout/home-actions", () => {
  const { Text } = jest.requireActual("react-native");
  return { HomeActions: () => <Text testID="home-actions">home actions</Text> };
});

import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";
import { get, organisation, requested, staffDashboard } from "./helpers/dashboard-fixtures";
import { seasonFixture, serveStaff, sessionRow, staffRoutes } from "./helpers/staff-today-fixtures";

import DashboardScreen from "../../app/(app)/(tabs)/dashboard";

const base = (over: Record<string, unknown> = {}) =>
  staffRoutes({
    "/api/v1/reports/organisation": organisation,
    "/api/v1/users/invites/pending": { pending: 5 },
    ...over,
  });

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(makeSession("SUPER"));
});

describe("Super Home (owner, 2026-11-07: an overview, not a work queue)", () => {
  it("greets the super by first name, and falls back to Home when the name is blank", async () => {
    useSessionStore.setState(makeSession("SUPER", {}, { name: "Sam Super" }));
    serveStaff(get, { table: base() });
    const first = renderWithProviders(<DashboardScreen />);
    expect((await screen.findAllByText("Hi, Sam")).length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("home-actions")).toHaveLength(1);
    first.unmount();

    useSessionStore.setState(makeSession("SUPER", {}, { name: "" }));
    serveStaff(get, { table: base() });
    renderWithProviders(<DashboardScreen />);
    expect((await screen.findAllByText("Home")).length).toBeGreaterThan(0);
    expect(screen.queryByText(/^Hi,/)).toBeNull();
  });

  it("shows no season-admin work: no review, attendance or at-risk tiles, no live session, and never asks for them", async () => {
    serveStaff(get, {
      table: base({ "/api/v1/seasons/7/sessions": { sessions: [sessionRow(1, 7, 30)] } }),
    });
    renderWithProviders(<DashboardScreen />);

    expect(await screen.findByText("Season 7")).toBeTruthy();
    expect(screen.queryByText("NEEDS ACTION")).toBeNull();
    expect(screen.queryByText(/Essays to review/)).toBeNull();
    expect(screen.queryByText(/Sessions without attendance/)).toBeNull();
    expect(screen.queryByText(/Students at risk/)).toBeNull();
    expect(screen.queryByText("Happening now")).toBeNull();
    const urls = requested();
    expect(urls.some((u) => u.startsWith("/api/v1/submissions"))).toBe(false);
    expect(urls.some((u) => u.startsWith("/api/v1/reports/engagement"))).toBe(false);
    expect(urls.some((u) => u.includes("/sessions"))).toBe(false);
  });

  it("gives each running season one row with a small ring and its figures, opening the season (owner, 2026-11-09)", async () => {
    serveStaff(get, {
      table: base({
        "/api/v1/seasons": {
          seasons: [seasonFixture(7), { ...seasonFixture(8), isCommunityWide: true }],
        },
        "/api/v1/me/dashboard?seasonId=8": {
          ...staffDashboard("season"),
          season: { id: 8, code: "s8", title: "Season 8", status: "ACTIVE" },
        },
      }),
    });
    renderWithProviders(<DashboardScreen />);

    expect(await screen.findByText("SEASONS")).toBeTruthy();
    expect(
      await screen.findByText(/^3 of 4 sessions held · 33% attendance · 3 students · Community-wide$/),
    ).toBeTruthy();
    expect(screen.getByText("3 of 4 sessions held · 33% attendance · 3 students")).toBeTruthy();
    expect(screen.queryByTestId("season-pulse")).toBeNull();
    expect(screen.getByLabelText("Season 7 progress 75%")).toBeTruthy();
    fireEvent.press(screen.getByText("Season 7"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/seasons/[code]", params: { code: "s7" } });
  });

  it("puts the Community tiles first, above the seasons (owner, 2026-11-08)", async () => {
    serveStaff(get, { table: base() });
    renderWithProviders(<DashboardScreen />);
    await screen.findByText("Season 7");
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
    expect(texts.indexOf("COMMUNITY")).toBeGreaterThanOrEqual(0);
    expect(texts.indexOf("COMMUNITY")).toBeLessThan(texts.indexOf("SEASONS"));
  });

  it("lists drafts under Coming up with their start and enrolled count", async () => {
    serveStaff(get, {
      table: base({
        "/api/v1/seasons": { seasons: [seasonFixture(9, "DRAFT")] },
        "/api/v1/reports/organisation": {
          ...organisation,
          seasons: [{ ...organisation.seasons[0], seasonId: 9, status: "DRAFT", activeCount: 1 }],
        },
      }),
    });
    renderWithProviders(<DashboardScreen />);

    expect(await screen.findByText("COMING UP")).toBeTruthy();
    expect(screen.getByText(/Starts .*1 student$/)).toBeTruthy();
    expect(screen.queryByTestId("season-pulse")).toBeNull();
    fireEvent.press(screen.getByText("Season 9"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/seasons/[code]", params: { code: "s9" } });
  });

  it("with no running or draft season, says so and offers a new one, and still shows the community", async () => {
    serveStaff(get, {
      table: base({ "/api/v1/seasons": { seasons: [seasonFixture(7, "ARCHIVED")] } }),
    });
    renderWithProviders(<DashboardScreen />);

    expect(await screen.findByText("No season running")).toBeTruthy();
    fireEvent.press(screen.getByText("New season"));
    expect(mockPush).toHaveBeenCalledWith("/seasons/new");
    expect(await screen.findByLabelText("Students: 40")).toBeTruthy();
    expect(screen.getByText("Open day")).toBeTruthy();
  });

  it("the community tiles open what they count", async () => {
    serveStaff(get, { table: base() });
    renderWithProviders(<DashboardScreen />);

    fireEvent.press(await screen.findByLabelText("Alumni: 12"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/students", params: { show: "alumni" } });
    fireEvent.press(screen.getByLabelText("Students: 40"));
    expect(mockPush).toHaveBeenCalledWith("/students");
    fireEvent.press(await screen.findByLabelText("Not invited yet: 5"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/community", params: { status: "pending" } });
    fireEvent.press(await screen.findByLabelText(/^Upcoming events: \d+$/));
    expect(mockPush).toHaveBeenCalledWith("/events");
    expect(screen.queryByLabelText(/^Seasons: /)).toBeNull();
  });
});
