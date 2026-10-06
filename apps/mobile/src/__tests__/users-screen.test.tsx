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

import UsersScreen from "../../app/(app)/users";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;

const superSession = {
  user: { id: 1, name: "Super", email: "su@jpc.test", role: "SUPER" as const, avatarPath: null, hasPassword: true },
  scopes: { seasonAdminIds: [], groupLeaderIds: [], activeSeasonId: null, graduationYear: null },
};

const rows = [
  {
    id: 2, name: "Active Ann", email: "ann@jpc.test", role: "ADMIN" as const,
    graduationYear: 2015, lastLoginAt: "2026-08-01T00:00:00.000Z", deletedAt: null,
    status: "active" as const,
  },
  {
    id: 3, name: "Pending Pete", email: "pete@jpc.test", role: "STUDENT" as const,
    graduationYear: null, lastLoginAt: null, deletedAt: null,
    status: "pending" as const,
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("UsersScreen", () => {
  it("renders the list with server-derived status badges (R81 — never re-derived)", async () => {
    useSessionStore.setState(superSession);
    get.mockResolvedValue({ data: { data: { users: rows, nextCursor: null, total: 2 } } });

    renderWithProviders(<UsersScreen />);

    expect(await screen.findByText("Active Ann")).toBeTruthy();
    expect(screen.getByText("Active")).toBeTruthy();
    expect(screen.getByText("No invite")).toBeTruthy();
  });

  it("shows a row-level invite action only for uninvited/invited accounts, and sends it", async () => {
    useSessionStore.setState(superSession);
    get.mockResolvedValue({ data: { data: { users: rows, nextCursor: null, total: 2 } } });
    post.mockResolvedValue({
      data: {
        data: {
          issuedAt: "2026-08-24T00:00:00.000Z", expiresAt: "2026-08-31T00:00:00.000Z",
          usedAt: null, invitedByName: null,
        },
      },
    });

    renderWithProviders(<UsersScreen />);
    await screen.findByText("Pending Pete");

    // Exactly one invite button: Ann is active, Pete is pending.
    const inviteButtons = screen.getAllByText("Send invite");
    expect(inviteButtons).toHaveLength(1);
    fireEvent.press(inviteButtons[0]!);

    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/users/3/invite"));
  });

  it("navigates to the detail route on row press", async () => {
    useSessionStore.setState(superSession);
    get.mockResolvedValue({ data: { data: { users: rows, nextCursor: null, total: 2 } } });

    renderWithProviders(<UsersScreen />);
    fireEvent.press(await screen.findByText("Active Ann"));

    expect(mockPush).toHaveBeenCalledWith({ pathname: "/user/[id]", params: { id: "2" } });
  });

  it("renders nothing but an empty state for a non-SUPER (the nav never routes them here, the screen still guards)", () => {
    useSessionStore.setState({
      ...superSession,
      user: { ...superSession.user, role: "STUDENT" as const },
    });
    renderWithProviders(<UsersScreen />);
    expect(screen.getByText("Users")).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  });
});
