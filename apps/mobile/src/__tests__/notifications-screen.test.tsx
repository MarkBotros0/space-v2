// apps/mobile/src/__tests__/notifications-screen.test.tsx
import { fireEvent, screen, waitFor, within } from "@testing-library/react-native";

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
  it("keeps Mark all read out of the large title's row so the title fits whole at 1.3x", async () => {
    get.mockResolvedValue({
      data: { data: { items: [unread], nextCursor: null, unreadCount: 1 } },
    });

    renderWithProviders(<NotificationsScreen />);
    await screen.findByText("Mark all read");

    // A squeezed title broke "Notificati/ons" mid-word on a 360dp phone.
    expect(within(screen.getByTestId("large-title")).queryByText("Mark all read")).toBeNull();
  });

  it("lists the caller's notifications", async () => {
    get.mockResolvedValue({
      data: { data: { items: [unread], nextCursor: null, unreadCount: 1 } },
    });

    renderWithProviders(<NotificationsScreen />);

    expect(await screen.findByText("Essay one was reviewed")).toBeTruthy();
    expect(screen.getByText("1 unread")).toBeTruthy();
    expect(screen.getByText(/SUBMISSION REVIEWED/)).toBeTruthy();
    // The unread dot is colour only: the row says so to a screen reader.
    expect(screen.getByLabelText(/Essay one was reviewed.*Unread/)).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/notifications?limit=20");
  });

  it("writes NOTHING when the inbox is merely read (ruling C6, spec D2)", async () => {
    get.mockResolvedValue({
      data: { data: { items: [unread], nextCursor: null, unreadCount: 1 } },
    });

    renderWithProviders(<NotificationsScreen />);
    await screen.findByText("Essay one was reviewed");

    // v1's inbox performed no write at all, and React Query refetches on
    // mount, on focus and on reconnect — a mark-read in a useEffect keyed on
    // this data would fire on every one of them.
    expect(post).not.toHaveBeenCalled();
  });

  it("marks one read and navigates on an explicit tap", async () => {
    get.mockResolvedValue({
      data: { data: { items: [unread], nextCursor: null, unreadCount: 1 } },
    });
    post.mockResolvedValue({ data: { data: { marked: 1 } } });

    renderWithProviders(<NotificationsScreen />);
    fireEvent.press(await screen.findByText("Essay one was reviewed"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/notifications/read", { ids: [5] }),
    );
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/assignment/[id]",
      params: { id: "41" },
    });
  });

  it("drops the unread count and the Unread label once the tap has marked it read", async () => {
    get.mockResolvedValueOnce({
      data: { data: { items: [unread], nextCursor: null, unreadCount: 1 } },
    });
    get.mockResolvedValue({
      data: {
        data: {
          items: [{ ...unread, readAt: "2026-08-24T11:00:00.000Z" }],
          nextCursor: null,
          unreadCount: 0,
        },
      },
    });
    post.mockResolvedValue({ data: { data: { marked: 1 } } });

    renderWithProviders(<NotificationsScreen />);
    expect(await screen.findByText("1 unread")).toBeTruthy();
    fireEvent.press(screen.getByText("Essay one was reviewed"));

    expect(await screen.findByText("0 unread")).toBeTruthy();
    expect(screen.queryByLabelText(/Unread/)).toBeNull();
  });

  it("does not call a read row Unread", async () => {
    get.mockResolvedValue({
      data: {
        data: {
          items: [{ ...unread, readAt: "2026-08-24T11:00:00.000Z" }],
          nextCursor: null,
          unreadCount: 0,
        },
      },
    });

    renderWithProviders(<NotificationsScreen />);

    expect(await screen.findByLabelText(/Essay one was reviewed/)).toBeTruthy();
    expect(screen.queryByLabelText(/Unread/)).toBeNull();
    expect(screen.getByText("0 unread")).toBeTruthy();
  });

  it("does not re-mark a notification that is already read", async () => {
    get.mockResolvedValue({
      data: {
        data: {
          items: [{ ...unread, readAt: "2026-08-24T11:00:00.000Z" }],
          nextCursor: null,
          unreadCount: 0,
        },
      },
    });

    renderWithProviders(<NotificationsScreen />);
    fireEvent.press(await screen.findByText("Essay one was reviewed"));

    await waitFor(() => expect(mockPush).toHaveBeenCalled());
    expect(post).not.toHaveBeenCalled();
  });

  it("marks all read from its own explicit control", async () => {
    get.mockResolvedValue({
      data: { data: { items: [unread], nextCursor: null, unreadCount: 1 } },
    });
    post.mockResolvedValue({ data: { data: { marked: 1 } } });

    renderWithProviders(<NotificationsScreen />);
    fireEvent.press(await screen.findByText("Mark all read"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/notifications/read", { all: true }),
    );
  });

  it("shows an empty state with no notifications", async () => {
    get.mockResolvedValue({ data: { data: { items: [], nextCursor: null, unreadCount: 0 } } });

    renderWithProviders(<NotificationsScreen />);

    expect(await screen.findByText("No notifications")).toBeTruthy();
    expect(screen.getByText("Activity that involves you will appear here.")).toBeTruthy();
  });

  it("navigates without marking when the notification has no resolvable target", async () => {
    get.mockResolvedValue({
      data: {
        data: {
          items: [{ ...unread, link: "/super/unknown", target: null }],
          nextCursor: null,
          unreadCount: 1,
        },
      },
    });
    post.mockResolvedValue({ data: { data: { marked: 1 } } });

    renderWithProviders(<NotificationsScreen />);
    fireEvent.press(await screen.findByText("Essay one was reviewed"));

    // Still marked read — the user has seen it — but there is nowhere to go.
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(mockPush).not.toHaveBeenCalled();
  });
});
