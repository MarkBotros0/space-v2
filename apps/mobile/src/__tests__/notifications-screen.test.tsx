// apps/mobile/src/__tests__/notifications-screen.test.tsx
import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
}));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";

import NotificationsScreen from "../../app/(app)/notifications";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;

const studentSession = {
  user: {
    id: 9, name: "Test student", email: "s@jpc.test", role: "STUDENT" as const,
    avatarPath: null, hasPassword: true, // every required MeUser field (ruling X11)
  },
  scopes: { seasonAdminIds: [], groupLeaderIds: [], activeSeasonId: 7, graduationYear: null },
};

const unread = {
  id: 5,
  type: "SUBMISSION_REVIEWED" as const,
  title: "Essay one was reviewed",
  body: null,
  link: "/student/assignments/41",
  target: { entityType: "assignment" as const, entityId: 41 },
  readAt: null,
  createdAt: "2026-08-24T10:00:00.000Z",
};

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(studentSession);
});

describe("NotificationsScreen", () => {
  it("lists the caller's notifications", async () => {
    get.mockResolvedValue({
      data: { data: { items: [unread], unreadCount: 1 } },
    });

    renderWithProviders(<NotificationsScreen />);

    expect(await screen.findByText("Essay one was reviewed")).toBeTruthy();
    // v1's one list, newest 100 — no paging params (R33, R39).
    expect(get).toHaveBeenCalledWith("/api/v1/notifications");
  });

  it("writes NOTHING when the inbox is merely read (ruling C6, spec D2)", async () => {
    get.mockResolvedValue({
      data: { data: { items: [unread], unreadCount: 1 } },
    });

    renderWithProviders(<NotificationsScreen />);
    await screen.findByText("Essay one was reviewed");

    // v1's inbox performed no write at all, and React Query refetches on
    // mount, on focus and on reconnect — a mark-read in a useEffect keyed on
    // this data would fire on every one of them.
    expect(post).not.toHaveBeenCalled();
  });

  it("navigates on tap and leaves the notification unread, as v1 (R48)", async () => {
    get.mockResolvedValue({
      data: { data: { items: [unread], unreadCount: 1 } },
    });

    renderWithProviders(<NotificationsScreen />);
    fireEvent.press(await screen.findByText("Essay one was reviewed"));

    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith({
        pathname: "/assignment/[id]",
        params: { id: "41" },
      }),
    );
    expect(post).not.toHaveBeenCalled();
  });

  it("marks all read from its own explicit control", async () => {
    get.mockResolvedValue({
      data: { data: { items: [unread], unreadCount: 1 } },
    });
    post.mockResolvedValue({ data: { data: { marked: 1 } } });

    renderWithProviders(<NotificationsScreen />);
    fireEvent.press(await screen.findByText("Mark all read"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/notifications/read", { all: true }),
    );
  });

  it("shows an empty state with no notifications", async () => {
    get.mockResolvedValue({ data: { data: { items: [], unreadCount: 0 } } });

    renderWithProviders(<NotificationsScreen />);

    expect(await screen.findByText("No notifications")).toBeTruthy();
  });

  it("does nothing on tap when the notification has no resolvable target", async () => {
    get.mockResolvedValue({
      data: {
        data: {
          items: [{ ...unread, link: "/super/unknown", target: null }],
          unreadCount: 1,
        },
      },
    });

    renderWithProviders(<NotificationsScreen />);
    fireEvent.press(await screen.findByText("Essay one was reviewed"));

    expect(mockPush).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });
});
