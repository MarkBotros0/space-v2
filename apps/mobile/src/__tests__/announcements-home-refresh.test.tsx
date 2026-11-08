import { act, screen } from "@testing-library/react-native";
import { AppState, RefreshControl } from "react-native";

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

import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";
import { listItem } from "./helpers/announcements";
import { get, requested } from "./helpers/dashboard-fixtures";
import { serveStaff, staffRoutes } from "./helpers/staff-today-fixtures";

import DashboardScreen from "../../app/(app)/(tabs)/dashboard";

const UNREAD_URL = "/api/v1/announcements/unread";
const unread = { count: 1, latest: listItem(4, { title: "Camp dates" }) };
const reads = () => requested().filter((u) => u === UNREAD_URL).length;
const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 20)));

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
  serveStaff(get, { table: staffRoutes({ [UNREAD_URL]: unread }) });
});
afterEach(settle);

describe("Home re-reads the Announcements unread count", () => {
  it("on pull-to-refresh", async () => {
    renderWithProviders(<DashboardScreen />);
    await screen.findByText("Camp dates");
    const before = reads();
    await act(async () => {
      screen.UNSAFE_getByType(RefreshControl).props.onRefresh();
    });
    await settle();
    expect(reads()).toBeGreaterThan(before);
  });

  it("when the app returns to the foreground", async () => {
    let onChange: ((s: string) => void) | undefined;
    jest.spyOn(AppState, "addEventListener").mockImplementation(((_t: string, fn: (s: string) => void) => {
      onChange = fn;
      return { remove: jest.fn() };
    }) as never);
    renderWithProviders(<DashboardScreen />);
    await screen.findByText("Camp dates");
    const before = reads();
    await act(async () => {
      onChange?.("active");
    });
    await settle();
    expect(reads()).toBeGreaterThan(before);
  });
});
