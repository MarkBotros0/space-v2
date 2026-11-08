import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn() } }));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));
jest.mock("../design/layout/home-actions", () => {
  const { Text } = jest.requireActual("react-native");
  return { HomeActions: () => <Text testID="home-actions">home actions</Text> };
});

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";
import { listItem, ok } from "./helpers/announcements";
import { organisation } from "./helpers/dashboard-fixtures";
import { staffRoutes } from "./helpers/staff-today-fixtures";

import { AnnouncementsHomeCard } from "../screens/announcements/announcements-home-card";
import DashboardScreen from "../../app/(app)/(tabs)/dashboard";

const get = apiClient.get as jest.Mock;

function serveUnread(body: unknown) {
  get.mockImplementation((url: string) => {
    if (url === "/api/v1/announcements/unread") return ok(body);
    return Promise.reject(new Error(`not served: ${url}`));
  });
}

/** The host tree's text and accessibility labels, in render order. */
function flatten(node: unknown): string {
  if (node === null || node === undefined) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(flatten).join("|");
  const n = node as { props?: { accessibilityLabel?: string }; children?: unknown };
  return `${n.props?.accessibilityLabel ?? ""}|${flatten(n.children)}`;
}

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(makeSession("SUPER"));
});

describe("AnnouncementsHomeCard", () => {
  it("renders nothing at a count of 0", async () => {
    serveUnread({ count: 0, latest: null });
    renderWithProviders(<AnnouncementsHomeCard />);
    await waitFor(() => expect(get).toHaveBeenCalled());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(screen.queryByText("Announcements")).toBeNull();
  });

  it("renders nothing when the read fails", async () => {
    get.mockRejectedValue(new Error("500"));
    renderWithProviders(<AnnouncementsHomeCard />);
    await waitFor(() => expect(get).toHaveBeenCalled());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(screen.queryByText("Announcements")).toBeNull();
    expect(screen.queryByText(/Couldn't/)).toBeNull();
  });

  it("shows the latest post and 'and 2 more' at a count of 3", async () => {
    serveUnread({ count: 3, latest: listItem(9, { title: "Camp dates" }) });
    renderWithProviders(<AnnouncementsHomeCard />);
    expect(await screen.findByText("Camp dates")).toBeTruthy();
    expect(screen.getByText("Announcements")).toBeTruthy();
    expect(screen.getByText("Everyone")).toBeTruthy();
    expect(screen.getByText("and 2 more")).toBeTruthy();
    expect(screen.getByLabelText("Announcements, 3 unread. Camp dates, and 2 more")).toBeTruthy();
  });

  it("says nothing about more at a count of 1", async () => {
    serveUnread({ count: 1, latest: listItem(9, { title: "Camp dates" }) });
    renderWithProviders(<AnnouncementsHomeCard />);
    expect(await screen.findByText("Camp dates")).toBeTruthy();
    expect(screen.queryByText(/more/)).toBeNull();
    expect(screen.getByLabelText("Announcements, 1 unread. Camp dates")).toBeTruthy();
  });

  it("opens the post on press and the list from See all", async () => {
    serveUnread({ count: 3, latest: listItem(9, { title: "Camp dates" }) });
    renderWithProviders(<AnnouncementsHomeCard />);
    fireEvent.press(await screen.findByText("Camp dates"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/announcements/[id]", params: { id: "9" } });
    fireEvent.press(screen.getByRole("button", { name: /See all/ }));
    expect(mockPush).toHaveBeenCalledWith("/announcements");
  });
});

describe("Super Home card placement", () => {
  it("renders the card under the overdue callout and above Seasons", async () => {
    const table = staffRoutes({
      "/api/v1/reports/organisation": organisation,
      "/api/v1/users/invites/pending": { pending: 5 },
      "/api/v1/announcements/unread": { count: 2, latest: listItem(4, { title: "Camp dates" }) },
    });
    get.mockImplementation((url: string) => {
      if (url in table) return ok(table[url]);
      return Promise.reject(new Error(`not served: ${url}`));
    });
    renderWithProviders(<DashboardScreen />);
    expect(await screen.findByText("Camp dates")).toBeTruthy();
    expect(await screen.findByLabelText("Open Season 7")).toBeTruthy();
    const text = flatten(screen.toJSON());
    expect(text.indexOf("Camp dates")).toBeLessThan(text.indexOf("Open Season 7"));
  });
});
