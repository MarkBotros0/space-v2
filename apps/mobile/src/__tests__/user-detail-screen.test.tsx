import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
}));
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack }),
  useLocalSearchParams: () => ({ id: "7" }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";

import UserDetailScreen from "../../app/(app)/user/[id]";

const get = apiClient.get as jest.Mock;
const patch = apiClient.patch as jest.Mock;

const superSession = {
  user: { id: 1, name: "Super", email: "su@jpc.test", role: "SUPER" as const, avatarPath: null, hasPassword: true },
  scopes: { seasonAdminIds: [], groupLeaderIds: [], activeSeasonId: null, graduationYear: null },
};

const detail = {
  id: 7, name: "Detail Dan", email: "dan@jpc.test", role: "STUDENT" as const,
  graduationYear: null, lastLoginAt: null, deletedAt: null, status: "invited" as const,
  invite: {
    issuedAt: "2026-08-20T00:00:00.000Z",
    expiresAt: "2026-08-27T00:00:00.000Z",
    usedAt: null,
    invitedByName: "Super",
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(superSession);
  get.mockResolvedValue({ data: { data: detail } });
});

describe("UserDetailScreen", () => {
  it("shows the invite's real expiry — the fact v1 showed nowhere (R75)", async () => {
    renderWithProviders(<UserDetailScreen />);
    expect(await screen.findByText(/Invite expires/)).toBeTruthy();
    // Email is rendered read-only; it is not an input (R48).
    expect(screen.queryByLabelText("Email")).toBeNull();
    expect(screen.getByText("dan@jpc.test")).toBeTruthy();
  });

  it("saves a full-replace PATCH of name, role, graduationYear", async () => {
    patch.mockResolvedValue({ data: { data: { ...detail, name: "Renamed Dan", invite: null } } });
    renderWithProviders(<UserDetailScreen />);
    await screen.findByText(/Invite expires/);

    fireEvent.changeText(screen.getByLabelText("Name"), "Renamed Dan");
    fireEvent.press(screen.getByText("Save changes"));

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/api/v1/users/7", {
        name: "Renamed Dan",
        role: "STUDENT",
        graduationYear: null,
      }),
    );
  });

  it("gates a SUPER grant behind an explicit confirmation (D7 rec 3)", async () => {
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => {
      // Press the confirming button.
      const confirmBtn = buttons?.find((b) => b.style !== "cancel");
      confirmBtn?.onPress?.();
    });
    patch.mockResolvedValue({ data: { data: { ...detail, role: "SUPER", invite: null } } });

    renderWithProviders(<UserDetailScreen />);
    await screen.findByText(/Invite expires/);

    fireEvent.press(screen.getByText("SUPER")); // role chip
    fireEvent.press(screen.getByText("Save changes"));

    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/api/v1/users/7", {
        name: "Detail Dan",
        role: "SUPER",
        graduationYear: null,
        confirmSuper: true,
      }),
    );
    alertSpy.mockRestore();
  });

  it("requires a graduation year before offering an alumni-only role save", async () => {
    renderWithProviders(<UserDetailScreen />);
    await screen.findByText(/Invite expires/);

    fireEvent.press(screen.getByText("LEADER"));
    fireEvent.press(screen.getByText("Save changes"));

    await waitFor(() =>
      expect(screen.getByLabelText("Graduation year").props.accessibilityHint).toBe(
        "Required for this role.",
      ),
    );
    expect(patch).not.toHaveBeenCalled();
  });
});
