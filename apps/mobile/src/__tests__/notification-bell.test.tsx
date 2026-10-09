// apps/mobile/src/__tests__/notification-bell.test.tsx
import { fireEvent, screen } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
}));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: (...args: unknown[]) => mockPush(...args) }),
}));

import { apiClient } from "../lib/api-client";
import { NotificationBell } from "../components/NotificationBell";
import { Screen, ScreenHeaderContext, Text } from "../ui";
import { renderWithProviders } from "./helpers/render";

const get = apiClient.get as jest.Mock;

function mockUnreadCount(unreadCount: number) {
  get.mockImplementation((url: string) =>
    url === "/api/v1/notifications/unread-count"
      ? Promise.resolve({ data: { data: { unreadCount } } })
      : Promise.reject(new Error(`not under test: ${url}`)),
  );
}

/** Any non-dashboard screen, inside the shell header `(app)/_layout.tsx` provides. */
function renderInShell() {
  return renderWithProviders(
    <ScreenHeaderContext.Provider value={<NotificationBell />}>
      <Screen edges={["top", "left", "right"]}>
        <Text>Some other screen</Text>
      </Screen>
    </ScreenHeaderContext.Provider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

// v1's app shell shows the bell on every page for every role
// (app-shell.tsx:55-57; 10-notifications R36).
describe("NotificationBell in the shell header", () => {
  it("shows on a non-dashboard screen with the unread badge, and opens the inbox", async () => {
    mockUnreadCount(3);
    renderInShell();
    expect(screen.getByText("Some other screen")).toBeTruthy();
    expect(await screen.findByLabelText("Notifications, 3 unread")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Notifications, 3 unread"));
    expect(mockPush).toHaveBeenCalledWith("/notifications");
  });

  it("caps the badge at 9+", async () => {
    mockUnreadCount(42);
    renderInShell();
    expect(await screen.findByText("9+")).toBeTruthy();
  });

  it("renders no badge at zero unread", async () => {
    mockUnreadCount(0);
    renderInShell();
    expect(await screen.findByLabelText("Notifications")).toBeTruthy();
    expect(screen.queryByText("0")).toBeNull();
  });

  it("is absent outside the shell (login and other public screens)", () => {
    renderWithProviders(
      <Screen>
        <Text>Public screen</Text>
      </Screen>,
    );
    expect(screen.queryByLabelText("Notifications")).toBeNull();
    expect(get).not.toHaveBeenCalled();
  });
});
