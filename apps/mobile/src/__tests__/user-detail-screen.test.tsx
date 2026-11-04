import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
}));
const mockBack = jest.fn();
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack, replace: mockReplace }),
  useLocalSearchParams: () => ({ id: "7" }),
}));
jest.mock("../design/ui/toaster", () => ({ toast: { success: jest.fn(), error: jest.fn() }, Toaster: () => null }));

import { toast } from "../design/ui/toaster";
import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";

import UserDetailScreen from "../../app/(app)/user/[id]";

const get = apiClient.get as jest.Mock;
const patch = apiClient.patch as jest.Mock;

const superSession = {
  user: {
    id: 1,
    name: "Super",
    email: "su@jpc.test",
    role: "SUPER" as const,
    avatarPath: null,
    hasPassword: true,
  },
  scopes: { seasonAdminIds: [], groupLeaderIds: [], activeSeasonId: null, graduationYear: null },
};

const detail = {
  id: 7,
  name: "Detail Dan",
  email: "dan@jpc.test",
  role: "STUDENT" as const,
  graduationYear: null,
  lastLoginAt: null,
  deletedAt: null,
  status: "invited" as const,
  invite: {
    issuedAt: "2026-08-20T00:00:00.000Z",
    expiresAt: "2026-08-27T00:00:00.000Z",
    usedAt: null,
    invitedByName: "Super",
  },
  adminSeasons: [] as { id: number; code: string; title: string }[],
};

function apiFailure(status: number, code: string, message: string) {
  return Object.assign(new Error(message), {
    isAxiosError: true,
    response: { status, data: { error: { code, message } } },
  });
}

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
    // Email is rendered read-only, under the title; it is not an input (R48).
    expect(screen.queryByLabelText("Email")).toBeNull();
    expect(screen.getByText("dan@jpc.test")).toBeTruthy();
    expect(screen.getByText("Edit Detail Dan")).toBeTruthy();
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
    // v1 user-form.tsx:117: a save lands back on the users list, with a word.
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/users"));
    expect(toast.success).toHaveBeenCalledWith("Changes saved.");
  });

  it("names the seasons an ADMIN loses before a role change, and saves only on confirm", async () => {
    get.mockResolvedValue({
      data: {
        data: {
          ...detail,
          role: "ADMIN",
          graduationYear: 2015,
          status: "active",
          invite: null,
          adminSeasons: [
            { id: 1, code: "gbv-2026", title: "GBV 2026" },
            { id: 2, code: "gbv-2025", title: "GBV 2025" },
          ],
        },
      },
    });
    let confirm: (() => void) | undefined;
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => {
      confirm = buttons?.find((b) => b.style !== "cancel")?.onPress as () => void;
    });
    patch.mockResolvedValue({ data: { data: { ...detail, role: "MENTOR", graduationYear: 2015 } } });
    renderWithProviders(<UserDetailScreen />);
    await screen.findByText("Edit Detail Dan");

    fireEvent.press(screen.getByLabelText("Role"));
    fireEvent.press(await screen.findByText("Mentor"));
    fireEvent.press(screen.getByText("Save changes"));

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith(
        "Remove season admin rights?",
        expect.stringContaining("GBV 2026, GBV 2025"),
        expect.any(Array),
      ),
    );
    expect(patch).not.toHaveBeenCalled();
    confirm?.();
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/api/v1/users/7", {
        name: "Detail Dan",
        role: "MENTOR",
        graduationYear: 2015,
      }),
    );
    alertSpy.mockRestore();
  });

  it("disables the form for a deactivated account and says why", async () => {
    get.mockResolvedValue({
      data: { data: { ...detail, status: "inactive", deletedAt: "2026-08-30T00:00:00.000Z" } },
    });
    renderWithProviders(<UserDetailScreen />);
    expect(await screen.findByText(/can't be edited — reactivate it first/)).toBeTruthy();
    expect(screen.getByLabelText("Name").props.editable).toBe(false);
    expect(
      screen.getByRole("button", { name: "Save changes" }).props.accessibilityState?.disabled,
    ).toBe(true);
    expect(screen.getByText("Reactivate")).toBeTruthy();
  });

  it.each([
    ["already_activated", 409, /already activated/],
    ["user_deleted", 409, /deactivated/],
    ["email_not_configured", 503, /Email isn't set up/],
    ["email_send_failed", 502, /earlier invite still works/],
  ])("shows why a resend failed (%s)", async (code, status, text) => {
    (apiClient.post as jest.Mock).mockRejectedValue(apiFailure(status, code, "server says no"));
    renderWithProviders(<UserDetailScreen />);
    fireEvent.press(await screen.findByText("Resend invite"));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(text)));
  });

  it("confirms a resend that went out", async () => {
    (apiClient.post as jest.Mock).mockResolvedValue({ data: { data: detail.invite } });
    renderWithProviders(<UserDetailScreen />);
    fireEvent.press(await screen.findByText("Resend invite"));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Invite sent to dan@jpc.test."));
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

    fireEvent.press(screen.getByLabelText("Role"));
    fireEvent.press(await screen.findByText("Super"));
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

    fireEvent.press(screen.getByLabelText("Role"));
    fireEvent.press(await screen.findByText("Leader"));
    fireEvent.press(screen.getByText("Save changes"));

    await waitFor(() =>
      expect(screen.getByLabelText("Graduation year").props.accessibilityHint).toBe(
        "Required for this role.",
      ),
    );
    expect(patch).not.toHaveBeenCalled();
  });

  it("deactivates behind a confirmation, and never offers it for your own account", async () => {
    const post = apiClient.post as jest.Mock;
    post.mockResolvedValue({ data: { data: { id: 7, deletedAt: "2026-08-30T00:00:00.000Z" } } });
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.style !== "cancel")?.onPress?.();
    });
    renderWithProviders(<UserDetailScreen />);
    fireEvent.press(await screen.findByText("Deactivate"));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/users/7/deactivate"));
    alertSpy.mockRestore();
  });
});
