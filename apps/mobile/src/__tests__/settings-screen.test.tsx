import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
}));
const mockLoadRefreshToken = jest.fn();
jest.mock("../lib/token-storage", () => ({
  loadRefreshToken: (...args: unknown[]) => mockLoadRefreshToken(...args),
  clearSession: jest.fn(),
  loadAccessToken: jest.fn(),
  saveSession: jest.fn(),
}));
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock("../lib/push", () => ({ enablePush: jest.fn() }));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";

import SettingsScreen from "../../app/(app)/settings";

const patch = apiClient.patch as jest.Mock;
const post = apiClient.post as jest.Mock;

function sessionFor(role: "SUPER" | "ADMIN" | "LEADER" | "STUDENT" | "MENTOR", graduationYear: number | null = null) {
  return {
    user: { id: 5, name: "Settings Person", email: "sp@jpc.test", role, avatarPath: null, hasPassword: true },
    scopes: { seasonAdminIds: [], groupLeaderIds: [], activeSeasonId: null, graduationYear },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  (apiClient.get as jest.Mock).mockResolvedValue({
    data: {
      data: {
        preferences: {
          assignmentCreated: true,
          submissionReviewed: true,
          sessionRescheduled: true,
          lowAttendanceFlag: true,
          mentorFollowup: true,
          quizGraded: true,
        },
      },
    },
  });
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  mockLoadRefreshToken.mockResolvedValue("stored-refresh");
});

describe("SettingsScreen", () => {
  // Spec 18 R3 / §9: NOTHING on this screen branches by role — the largest
  // page collapse in the migration (six byte-identical pages → one route) is
  // safe precisely because every write is self-scoped. This loop is the §9
  // branching map, executed: the same sections for all six navigation roles.
  const roles = [
    ["SUPER", null], ["ADMIN", null], ["LEADER", null],
    ["MENTOR", null], ["STUDENT", null], ["STUDENT", 2020], // alumnus
  ] as const;

  it.each(roles)("renders the same sections for %s (gradYear %p)", (role, gradYear) => {
    useSessionStore.setState(sessionFor(role, gradYear));
    renderWithProviders(<SettingsScreen />);

    expect(screen.getByText("Profile")).toBeTruthy();
    // The section heading. The submit button is titled "Update password" so
    // this exact-text query has exactly one match.
    expect(screen.getByText("Change password")).toBeTruthy();
    expect(screen.getByText("Security")).toBeTruthy();
    expect(screen.getByLabelText("Name")).toBeTruthy();
    // Email is shown, not editable — and the caption is TRUE in v2, unlike
    // v1's "change via the admin console" lie for students (spec 18 R20/D8).
    expect(screen.getByText("sp@jpc.test")).toBeTruthy();
  });

  it("hides the password section for an invited-never-activated account (hasPassword false)", () => {
    const s = sessionFor("STUDENT");
    s.user.hasPassword = false;
    useSessionStore.setState(s);
    renderWithProviders(<SettingsScreen />);
    expect(screen.queryByText("Change password")).toBeNull();
  });

  it("saves the profile name and reconciles the store from the response", async () => {
    useSessionStore.setState(sessionFor("STUDENT"));
    patch.mockResolvedValue({
      data: { data: { user: { id: 5, name: "New Name", email: "sp@jpc.test", role: "STUDENT", avatarPath: null, hasPassword: true } } },
    });
    renderWithProviders(<SettingsScreen />);

    fireEvent.changeText(screen.getByLabelText("Name"), "New Name");
    fireEvent.press(screen.getByText("Save name"));

    await waitFor(() => expect(patch).toHaveBeenCalledWith("/api/v1/me", { name: "New Name" }));
    await waitFor(() => expect(useSessionStore.getState().user?.name).toBe("New Name"));
  });

  it("changes the password, sending the stored refresh token so this device survives", async () => {
    useSessionStore.setState(sessionFor("STUDENT"));
    post.mockResolvedValue({ data: { data: { ok: true, sessionsRevoked: 2 } } });
    renderWithProviders(<SettingsScreen />);

    fireEvent.changeText(screen.getByLabelText("Current password"), "old-password");
    fireEvent.changeText(screen.getByLabelText("New password"), "new-password-1");
    fireEvent.changeText(screen.getByLabelText("Confirm new password"), "new-password-1");
    fireEvent.press(screen.getByText("Update password"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/me/password", {
        currentPassword: "old-password",
        newPassword: "new-password-1",
        refreshToken: "stored-refresh",
      }),
    );
    expect(await screen.findByText("Signed out of 2 other devices.")).toBeTruthy();
  });

  it("keeps the mismatch check client-side — no request leaves the device", async () => {
    useSessionStore.setState(sessionFor("STUDENT"));
    renderWithProviders(<SettingsScreen />);

    fireEvent.changeText(screen.getByLabelText("Current password"), "old-password");
    fireEvent.changeText(screen.getByLabelText("New password"), "new-password-1");
    fireEvent.changeText(screen.getByLabelText("Confirm new password"), "different");
    fireEvent.press(screen.getByText("Update password"));

    // Error travels on the field's accessibilityHint (Input's contract).
    await waitFor(() =>
      expect(screen.getByLabelText("Confirm new password").props.accessibilityHint).toBe(
        "Passwords don't match.",
      ),
    );
    expect(post).not.toHaveBeenCalled();
  });

  it("logs out everywhere: posts, clears the session, lands on login", async () => {
    useSessionStore.setState(sessionFor("STUDENT"));
    post.mockResolvedValue({ data: { data: { revoked: 3 } } });
    renderWithProviders(<SettingsScreen />);

    fireEvent.press(screen.getByText("Sign out everywhere"));

    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/auth/logout-all"));
    await waitFor(() => expect(useSessionStore.getState().status).toBe("anonymous"));
    expect(mockReplace).toHaveBeenCalledWith("/login");
  });
});
