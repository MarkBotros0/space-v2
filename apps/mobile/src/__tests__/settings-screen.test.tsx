import { fireEvent, screen } from "@testing-library/react-native";

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, replace: jest.fn() }),
}));

import { useSessionStore } from "../store/session";
import { TabBarPresenceContext } from "../design/layout/shell-context";
import { renderWithProviders } from "./helpers/render";

import SettingsScreen from "../../app/(app)/settings";

function sessionFor(
  role: "SUPER" | "ADMIN" | "LEADER" | "STUDENT" | "MENTOR",
  graduationYear: number | null = null,
) {
  return {
    user: {
      id: 5,
      name: "Settings Person",
      email: "sp@jpc.test",
      role,
      avatarPath: null,
      hasPassword: true,
    },
    scopes: { seasonAdminIds: [], groupLeaderIds: [], activeSeasonId: null, graduationYear },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("SettingsScreen back bar (Task 12 fix round 1)", () => {
  it("pins a Back link that returns to wherever Settings was opened from", () => {
    const { user, scopes } = sessionFor("STUDENT");
    useSessionStore.getState().setSession(user, scopes);
    renderWithProviders(
      <TabBarPresenceContext.Provider value={false}>
        <SettingsScreen />
      </TabBarPresenceContext.Provider>,
    );
    expect(screen.getByTestId("back-bar")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Back"));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});

describe("SettingsScreen (the hub)", () => {
  // Spec 18 R3 / §9: NOTHING on this screen branches by role.
  const roles = [
    ["SUPER", null],
    ["ADMIN", null],
    ["LEADER", null],
    ["MENTOR", null],
    ["STUDENT", null],
    ["STUDENT", 2020], // alumnus
  ] as const;

  it.each(roles)("shows the same two destinations for %s (gradYear %p)", (role, gradYear) => {
    useSessionStore.setState(sessionFor(role, gradYear));
    renderWithProviders(<SettingsScreen />);
    expect(screen.getByText("Profile details")).toBeTruthy();
    expect(screen.getByText("Notification settings")).toBeTruthy();
  });

  it("opens each page", () => {
    useSessionStore.setState(sessionFor("LEADER"));
    renderWithProviders(<SettingsScreen />);
    fireEvent.press(screen.getByText("Profile details"));
    expect(mockPush).toHaveBeenLastCalledWith("/settings/profile");
    fireEvent.press(screen.getByText("Notification settings"));
    expect(mockPush).toHaveBeenLastCalledWith("/settings/notifications");
  });

  it("has no password form, sign-out or delete (owner, 2026-11-06: those live elsewhere)", () => {
    useSessionStore.setState(sessionFor("STUDENT"));
    renderWithProviders(<SettingsScreen />);
    expect(screen.queryByText(/password/i)).toBeNull();
    expect(screen.queryByText(/sign out/i)).toBeNull();
    expect(screen.queryByText(/delete account/i)).toBeNull();
  });
});
