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
jest.mock("../design/ui/toaster", () => ({ toast: { success: jest.fn(), error: jest.fn() }, Toaster: () => null }));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { toast } from "../design/ui/toaster";
import { renderWithProviders } from "./helpers/render";

import SettingsScreen from "../../app/(app)/(tabs)/settings";

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
          quizPublished: true,
          submissionReceived: true,
          sessionCancelled: true,
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
    expect(screen.getByDisplayValue("sp@jpc.test")).toBeTruthy();
    expect(screen.getByText("Profile, password, and notification preferences.")).toBeTruthy();
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
    fireEvent.press(screen.getByText("Save profile"));

    await waitFor(() => expect(patch).toHaveBeenCalledWith("/api/v1/me", { name: "New Name" }));
    await waitFor(() => expect(useSessionStore.getState().user?.name).toBe("New Name"));
    expect(toast.success).toHaveBeenCalledWith("Profile saved.");
  });

  it("keeps Save profile disabled until the name is changed and valid (REG-80)", () => {
    useSessionStore.setState(sessionFor("STUDENT"));
    renderWithProviders(<SettingsScreen />);
    const save = () => screen.getByText("Save profile");
    const disabled = () => screen.getByRole("button", { name: "Save profile" }).props.accessibilityState?.disabled;
    expect(disabled()).toBe(true);
    fireEvent.changeText(screen.getByLabelText("Name"), "N");
    expect(disabled()).toBe(true);
    fireEvent.changeText(screen.getByLabelText("Name"), "New Name");
    expect(disabled()).toBe(false);
    fireEvent.changeText(screen.getByLabelText("Name"), "  " + (useSessionStore.getState().user?.name ?? "") + "  ");
    expect(disabled()).toBe(true);
    expect(save()).toBeTruthy();
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
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Password updated. Signed out of 2 other devices."));
  });

  describe("password-change failures say what actually went wrong", () => {
    function apiFailure(status: number, code: string, message: string) {
      return Object.assign(new Error(message), {
        isAxiosError: true,
        response: { status, data: { error: { code, message } } },
      });
    }

    async function submit() {
      fireEvent.changeText(screen.getByLabelText("Current password"), "old-password");
      fireEvent.changeText(screen.getByLabelText("New password"), "new-password-1");
      fireEvent.changeText(screen.getByLabelText("Confirm new password"), "new-password-1");
      fireEvent.press(screen.getByText("Update password"));
      await waitFor(() => expect(post).toHaveBeenCalled());
    }

    beforeEach(() => useSessionStore.setState(sessionFor("STUDENT")));

    it("a wrong current password is flagged on that field", async () => {
      post.mockRejectedValue(apiFailure(400, "incorrect_password", "Current password is incorrect."));
      renderWithProviders(<SettingsScreen />);
      await submit();
      await waitFor(() =>
        expect(screen.getByLabelText("Current password").props.accessibilityHint).toBe(
          "Current password is incorrect.",
        ),
      );
      expect(toast.error).toHaveBeenCalledWith("Your current password is incorrect.");
    });

    it("a 429 says to wait, not to check the password", async () => {
      post.mockRejectedValue(apiFailure(429, "too_many_requests", "Too many requests. Please try again later."));
      renderWithProviders(<SettingsScreen />);
      await submit();
      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith("Too many attempts. Wait a few minutes, then try again."),
      );
    });

    it("a password-rule refusal lands on the new-password field with the server's message", async () => {
      post.mockRejectedValue(apiFailure(400, "bad_request", "At most 72 bytes."));
      renderWithProviders(<SettingsScreen />);
      await submit();
      await waitFor(() =>
        expect(screen.getByLabelText("New password").props.accessibilityHint).toBe("At most 72 bytes."),
      );
    });
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

  it("logs out everywhere only after a confirmation: posts, clears the session, lands on login", async () => {
    useSessionStore.setState(sessionFor("STUDENT"));
    post.mockResolvedValue({ data: { data: { revoked: 3 } } });
    renderWithProviders(<SettingsScreen />);

    fireEvent.press(screen.getByText("Sign out everywhere"));
    // The first press only opens the dialog — nothing is revoked yet.
    expect(await screen.findByText("Sign out everywhere?")).toBeTruthy();
    expect(post).not.toHaveBeenCalled();

    const buttons = screen.getAllByText("Sign out everywhere");
    fireEvent.press(buttons[buttons.length - 1]!);

    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/auth/logout-all"));
    await waitFor(() => expect(useSessionStore.getState().status).toBe("anonymous"));
    expect(mockReplace).toHaveBeenCalledWith("/login");
  });
});
